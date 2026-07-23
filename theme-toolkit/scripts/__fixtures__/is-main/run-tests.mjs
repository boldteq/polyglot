// isMain — the CLI-entry guard every toolkit script depends on (CB-16).
//
// The spelling that was in 39 scripts was `path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)`,
// and `path.resolve` does NOT resolve symlinks. On macOS a temp dir is `/var/folders/…` in argv but
// `/private/var/folders/…` once resolved; the same happens with a symlinked checkout or some CI layouts.
// When the compare fails, main() never runs and the script EXITS 0 HAVING DONE NOTHING — the worst
// failure mode available, because every caller reads exit 0 as success. A vendor tool hit exactly that
// on 2026-07-23 (CB-15): it reported success while copying nothing.
//
// So the load-bearing case here is the SYMLINK one. The other two (runs when direct, silent when
// imported) are what the old spelling already did — they are pinned so the fix cannot over-correct.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from '../../lib/is-main.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

console.log('isMain — direct vs imported vs through a symlink')
{
  // this fixture was itself run directly, so its own url IS main
  isMain(import.meta.url) ? ok('the module actually being run reports true') : bad('direct run reported false')
  isMain('file:///definitely/not/this/module.mjs') === false
    ? ok('another module reports false') : bad('a foreign module reported true')
  isMain('not-a-url') === false ? ok('an unresolvable path is not this module (no throw)') : bad('bad input threw or passed')
}

// A tiny script with the real guard, exercised three ways.
const SCRIPT = `import { isMain } from '${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib', 'is-main.mjs')}'
export const answer = 42
if (isMain(import.meta.url)) console.log('MAIN_RAN')
`

console.log('\n── the three ways a script gets loaded ──')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismain-'))   // NB macOS: /var/... symlinked to /private/var/...
  const file = path.join(dir, 'probe.mjs')
  fs.writeFileSync(file, SCRIPT)

  const RAN = /MAIN_RAN/   // bind first: a statement STARTING with a regex literal parses as division
  const direct = spawnSync(process.execPath, [file], { encoding: 'utf-8' })
  RAN.test(direct.stdout || '') ? ok('run directly → main() runs') : bad(`direct: ${JSON.stringify(direct.stdout)}`)

  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import('file://${file}'); console.log('EXPORT', m.answer)`], { encoding: 'utf-8' })
  const out = imported.stdout || ''
  const EXPORTED = /EXPORT 42/
  EXPORTED.test(out) && !RAN.test(out)
    ? ok('imported → exports available, main() stays silent') : bad(`imported: ${JSON.stringify(out)}`)

  // THE REGRESSION CASE: reach the same file through a symlinked directory. Under the old
  // path.resolve compare this printed nothing and exited 0.
  const link = path.join(os.tmpdir(), `ismain-link-${process.pid}`)
  try { fs.rmSync(link, { force: true }) } catch { /* fresh */ }
  fs.symlinkSync(dir, link)
  const viaLink = spawnSync(process.execPath, [path.join(link, 'probe.mjs')], { encoding: 'utf-8' })
  RAN.test(viaLink.stdout || '')
    ? ok('run through a SYMLINK → main() still runs (the CB-15 failure)') : bad(`symlink: exit ${viaLink.status}, out ${JSON.stringify(viaLink.stdout)}`)

  fs.rmSync(link, { force: true })
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('\n── no fragile spelling survives in the toolkit ──')
{
  // the sweep is only durable if a new script cannot quietly reintroduce it
  const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const offenders = []
  const scan = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '__fixtures__' || e.name === 'node_modules') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) { scan(p); continue }
      if (!e.name.endsWith('.mjs') || e.name === 'is-main.mjs') continue
      const src = fs.readFileSync(p, 'utf-8')
      if (src.includes('path.resolve(process.argv[1])')) offenders.push(path.relative(scriptsDir, p))
    }
  }
  scan(scriptsDir)
  offenders.length === 0
    ? ok('no script compares argv[1] with path.resolve any more')
    : bad(`${offenders.length} script(s) still use the symlink-fragile guard: ${offenders.slice(0, 5).join(', ')}`)
}

console.log(failures === 0 ? '\nis-main: ALL CASES PASS' : `\nis-main: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
