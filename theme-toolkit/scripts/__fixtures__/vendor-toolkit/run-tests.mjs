// vendor-toolkit — ship COMMITTED state to a client, and say which commit it is.
//
// The hazard is not hypothetical and it was self-inflicted. Client repos gitignore `toolkit/`, so the
// vendored copy is refreshed by hand, and the documented recipe copied the WORKING TREE. On 2026-07-23
// that shipped 21 uncommitted paths from a concurrent workstream into cravinbyandy — including a
// half-finished gate (check-repo-hygiene) that immediately added 29 blockers to a client's build.
// Nobody chose that; a `cp -R` did.
//
// The load-bearing behaviours pinned here: REFUSE on a dirty source, copy from the commit rather than
// the working tree, and record provenance — QA-6 proved TOOLKIT_VERSION alone cannot identify a tree
// (two very different toolkits both said 1.0.0 while eleven gate scripts were missing).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirtyToolkitPaths } from '../../vendor-toolkit.mjs'

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor-toolkit.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

console.log('dirtyToolkitPaths — only the toolkit prefix counts')
{
  const porcelain = [' M theme-toolkit/scripts/a.mjs', '?? theme-toolkit/scripts/new.mjs', ' M client/src/app.tsx', ' M docs/x.md'].join('\n')
  const d = dirtyToolkitPaths(porcelain, 'theme-toolkit')
  d.length === 2 ? ok('unrelated repo changes do not block a vendor') : bad(`got ${JSON.stringify(d)}`)
  // a rename is judged by its DESTINATION, or a moved-in file would slip past
  dirtyToolkitPaths('R  old.mjs -> theme-toolkit/scripts/new.mjs', 'theme-toolkit').length === 1
    ? ok('a rename INTO the toolkit is caught') : bad('rename destination ignored')
  dirtyToolkitPaths('', 'theme-toolkit').length === 0 ? ok('a clean tree is clean') : bad('empty porcelain mishandled')
}

// A throwaway repo that looks like Polyglot: <root>/theme-toolkit/... plus a fake client theme.
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vend-'))
  const tk = path.join(root, 'theme-toolkit', 'scripts')
  fs.mkdirSync(tk, { recursive: true })
  fs.writeFileSync(path.join(root, 'theme-toolkit', 'TOOLKIT_VERSION'), '9.9.9\n')
  fs.writeFileSync(path.join(tk, 'gate-a.mjs'), '// committed gate\n')
  fs.mkdirSync(path.join(root, 'theme-toolkit', 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(root, 'theme-toolkit', 'node_modules', 'huge.js'), 'x')
  fs.mkdirSync(path.join(root, 'theme-toolkit', 'gate-reports'), { recursive: true })
  fs.writeFileSync(path.join(root, 'theme-toolkit', 'gate-reports', 'stale.json'), '{}')
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] })
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'toolkit')
  const client = path.join(root, 'client')
  fs.mkdirSync(path.join(client, 'sections'), { recursive: true })
  return { root, client, tk }
}
const run = (root, args) => {
  const r = spawnSync(process.execPath, [path.join(root, 'theme-toolkit', 'scripts', 'vendor-toolkit.mjs'), ...args], { cwd: root, encoding: 'utf-8' })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

console.log('\n── a clean source vendors, and says what it shipped ──')
{
  const { root, client } = scaffold()
  fs.copyFileSync(TOOL, path.join(root, 'theme-toolkit', 'scripts', 'vendor-toolkit.mjs'))
  execFileSync('git', ['add', '-A'], { cwd: root }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'tool'], { cwd: root })
  const r = run(root, ['--to', client])
  const prov = (() => { try { return JSON.parse(fs.readFileSync(path.join(client, 'toolkit', '.vendor-provenance.json'), 'utf-8')) } catch { return null } })()
  r.code === 0 && fs.existsSync(path.join(client, 'toolkit', 'scripts', 'gate-a.mjs'))
    ? ok('a clean source vendors') : bad(`clean vendor failed: ${r.code} ${r.out.slice(-160)}`)
  prov && /^[0-9a-f]{40}$/.test(prov.sha) && prov.version === '9.9.9' && prov.dirty === false
    ? ok('provenance records sha + version + not-dirty') : bad(`provenance: ${JSON.stringify(prov)}`)
  !fs.existsSync(path.join(client, 'toolkit', 'node_modules')) && !fs.existsSync(path.join(client, 'toolkit', 'gate-reports'))
    ? ok('node_modules and gate-reports never travel') : bad('build output was vendored')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n── THE REFUSAL: a dirty source must not reach a client ──')
{
  const { root, client, tk } = scaffold()
  fs.copyFileSync(TOOL, path.join(tk, 'vendor-toolkit.mjs'))
  execFileSync('git', ['add', '-A'], { cwd: root }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'tool'], { cwd: root })
  // a concurrent workstream leaves a half-finished gate in the tree
  fs.writeFileSync(path.join(tk, 'check-half-done.mjs'), '// WIP — not reviewed\n')

  const refused = run(root, ['--to', client])
  refused.code === 1 && /REFUSED/.test(refused.out) && !fs.existsSync(path.join(client, 'toolkit', 'scripts', 'check-half-done.mjs'))
    ? ok('an uncommitted gate is REFUSED and never reaches the client') : bad(`dirty vendor: code ${refused.code}`)

  // CORRECTED 2026-07-24: an EXPLICIT --ref must WORK on a dirty tree. `git archive <ref>` reads
  // committed state, so the working tree cannot contaminate it. The first version refused --ref too,
  // which made the tool's own advice ("vendor an explicit --ref") self-contradictory and left
  // --allow-dirty — which ships the WIP — as the only way through. In a repo with ongoing concurrent
  // work, i.e. the normal state, that blocked vendoring outright. Found by trying to use the tool.
  const committed = run(root, ['--to', client, '--ref', 'HEAD'])
  const leaked = fs.existsSync(path.join(client, 'toolkit', 'scripts', 'check-half-done.mjs'))
  committed.code === 0 && !leaked
    ? ok('an explicit --ref vendors the COMMIT even while the tree is dirty, and the WIP does not leak')
    : bad(`ref path: code ${committed.code} leaked=${leaked}`)

  // ...and opting in is possible, but it is RECORDED
  const forced = run(root, ['--to', client, '--allow-dirty'])
  const prov = (() => { try { return JSON.parse(fs.readFileSync(path.join(client, 'toolkit', '.vendor-provenance.json'), 'utf-8')) } catch { return null } })()
  forced.code === 0 && Array.isArray(prov?.dirty) && prov.dirty.length > 0
    ? ok('--allow-dirty works but writes the dirty paths into provenance') : bad(`allow-dirty: ${JSON.stringify(prov?.dirty)}`)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('\n── the target must actually be a theme ──')
{
  const { root } = scaffold()
  fs.copyFileSync(TOOL, path.join(root, 'theme-toolkit', 'scripts', 'vendor-toolkit.mjs'))
  execFileSync('git', ['add', '-A'], { cwd: root }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'tool'], { cwd: root })
  const notATheme = fs.mkdtempSync(path.join(os.tmpdir(), 'nope-'))
  const r = run(root, ['--to', notATheme])
  r.code === 1 && /does not look like a Shopify theme/.test(r.out)
    ? ok('vendoring into a non-theme directory is refused') : bad(`wrong target accepted: ${r.code}`)
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(notATheme, { recursive: true, force: true })
}

console.log('\n── vendoring RECONCILES, but never destroys install state ──')
{
  const { root, client, tk } = scaffold()
  fs.copyFileSync(TOOL, path.join(tk, 'vendor-toolkit.mjs'))
  execFileSync('git', ['add', '-A'], { cwd: root }); execFileSync('git', ['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'tool'], { cwd: root })

  // a stale gate left behind by an older `cp -R`, plus install state the archive never carries
  fs.mkdirSync(path.join(client, 'toolkit', 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(client, 'toolkit', 'scripts', 'check-stale.mjs'), '// vendored long ago, deleted upstream\n')
  fs.writeFileSync(path.join(client, 'toolkit', 'package-lock.json'), '{ "lockfileVersion": 3 }')
  fs.mkdirSync(path.join(client, 'toolkit', 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(client, 'toolkit', 'node_modules', 'dep.js'), 'x')

  const r = run(root, ['--to', client])
  const stale = fs.existsSync(path.join(client, 'toolkit', 'scripts', 'check-stale.mjs'))
  !stale ? ok('a file deleted upstream is PRUNED from the client') : bad('stale vendored file survived')

  // the prune must not eat install state: deleting package-lock.json breaks the `npm ci` this tool
  // tells you to run, and node_modules is not the vendor's to manage
  fs.existsSync(path.join(client, 'toolkit', 'package-lock.json'))
    ? ok('package-lock.json is preserved (npm ci still works)') : bad('the prune deleted the lockfile')
  fs.existsSync(path.join(client, 'toolkit', 'node_modules', 'dep.js'))
    ? ok('node_modules is left alone') : bad('the prune deleted node_modules')

  const prov = JSON.parse(fs.readFileSync(path.join(client, 'toolkit', '.vendor-provenance.json'), 'utf-8'))
  Array.isArray(prov.pruned) && prov.pruned.some((x) => /check-stale/.test(x))
    ? ok('what was pruned is RECORDED, never silent') : bad(`pruned not recorded: ${JSON.stringify(prov.pruned)}`)
  r.code === 0 || bad(`clean vendor exited ${r.code}`)
  fs.rmSync(root, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nvendor-toolkit: ALL CASES PASS' : `\nvendor-toolkit: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
