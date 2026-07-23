#!/usr/bin/env node
// Self-test for check-design-system.mjs (#8) — the per-project TOKEN enforcer (Rule 9).
//   (a) clean        (theme vars + on-scale font/spacing/radius) → exit 0
//   (b) violations   (@apply + hardcoded hex + off-scale font + off-scale spacing) → exit 1
//   (c) comment-safe (a "no Tailwind" COMMENT + clean code) → exit 0 — guards the 2026-06-19 FP fix
//       (ds.tailwind/ds.second-token must scan COMMENT-STRIPPED text, not raw)
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-design-system.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', ALLOW_DS_WAIVER: '' }
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-tokens.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) }
}

console.log('case (a) clean (theme vars + on-scale) → expect exit 0')
{ const { code } = run('clean'); code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}`) }

console.log('case (b) violations (@apply + hex + off-scale font + off-scale spacing) → expect exit 1')
{ const { code, ids } = run('violations')
  code === 1 ? pass('exit 1 (block)') : fail(`expected 1 got ${code}`)
  for (const id of ['ds.tailwind', 'ds.color-hex', 'ds.font-size', 'ds.spacing'])
    ids.has(id) ? pass(`blocker: ${id}`) : fail(`missing blocker ${id} (saw ${[...ids].join(', ') || 'none'})`) }

console.log('case (c) comment-safe ("no Tailwind" comment + clean code) → expect exit 0, NO ds.tailwind FP')
{ const { code, ids } = run('comment-safe')
  code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`)
  !ids.has('ds.tailwind') ? pass('no ds.tailwind false-positive on a comment') : fail('ds.tailwind FP fired on a comment') }

// ── CB-1: --ds-* is THIS toolkit's own token system, not a bolted-on one ──────────────────
// Until 2026-07-23 this gate flagged --ds-* as ds.second-token while gate #30 (ds-cascade) emitted
// exactly those vars from the toolkit's own generator and WARNED when sections failed to bind to
// them. Doing what the cascade asked tripped a blocker here, so the cascade was unusable: wiring it
// on cravinbyandy traded 150 colour blockers for 15 ds.second-token ones. Foreign systems (--tw-*)
// must still block.
console.log('case (d) a section bound to var(--ds-*) is NOT a second token system')
{ const { code, ids } = run('ds-cascade-binding')
  !ids.has('ds.second-token') ? pass('--ds-* accepted (the cascade is usable)') : fail('ds.second-token fired on the toolkit\'s own tokens')
  code === 0 ? pass('exit 0') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`) }

console.log('case (e) a FOREIGN token system (--tw-*) still blocks')
{ const { ids } = run('tw-foreign')
  ids.has('ds.second-token') ? pass('--tw-* still flagged') : fail('the foreign-system check was disarmed') }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
