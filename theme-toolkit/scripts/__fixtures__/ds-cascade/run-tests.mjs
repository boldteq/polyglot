#!/usr/bin/env node
// Self-test for #2 — design-system cascade enforcement (dsHash/cascadeStale/cascadeCoverageGaps pure +
// the gate end to end). Run (Node 20): node scripts/__fixtures__/ds-cascade/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dsHash, extractStampedHash, cascadeStale } from '../../lib/ds-hash.mjs'
import { cascadeCoverageGaps } from '../../check-ds-cascade.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-ds-cascade.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const ds = { typography: { allowed_px: [48, 32, 24, 18] }, spacing: { scale: [0, 16, 32, 64] } }

console.log('dsHash / extractStampedHash / cascadeStale — pure')
eq(dsHash(ds), dsHash(ds), 'deterministic')
dsHash(ds) !== dsHash({ ...ds, typography: { allowed_px: [50, 32, 24, 18] } }) ? pass('hash changes with content') : fail('hash insensitive to change')
eq(extractStampedHash(`/* hi ds-hash:${dsHash(ds)} */`), dsHash(ds), 'extract stamped hash')
eq(extractStampedHash('no stamp here'), null, 'unstamped → null')
eq(cascadeStale(ds, `/* ds-hash:${dsHash(ds)} */\n:root{}`).ok, true, 'matching stamp → fresh')
eq(cascadeStale(ds, '/* ds-hash:000000000000 */').ok, false, 'mismatched stamp → stale')
eq(cascadeStale(ds, ':root{}').ok, false, 'no stamp → stale')

console.log('cascadeCoverageGaps — literals that won\'t cascade')
cascadeCoverageGaps('.h{font-size:19px}').length >= 1 ? pass('literal font-size → gap') : fail('missed literal font-size')
eq(cascadeCoverageGaps('.h{font-size:var(--ds-h2)}').length, 0, 'var(--ds-*) font-size → no gap')
cascadeCoverageGaps('.s{padding:80px}').length >= 1 ? pass('section padding literal → gap') : fail('missed padding literal')
eq(cascadeCoverageGaps('.s{padding:8px}').length, 0, 'small inset padding → no gap')

console.log('check-ds-cascade gate — end to end')
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_CASCADE_ENFORCE: '', DS_REQUIRE_SCOPE: '', BASE_REF: '__none__', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'ds-cascade.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
function build(stamp) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'), JSON.stringify(ds))
  if (stamp !== undefined) fs.writeFileSync(path.join(d, 'assets', 'design-system.css'), `/* ds-hash:${stamp} */\n:root{}`)
  return d
}
{
  const d = build(dsHash(ds)) // fresh: stamp matches
  const { code } = run(d, { DS_CASCADE_ENFORCE: '1' })
  code === 0 ? pass('fresh cascade → PASS even at enforce') : fail(`fresh: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = build('deadbeef0000') // stale: stamp mismatched (a brand-change not regenerated)
  const dev = run(d)
  dev.code === 0 && allIds(dev.rep).has('cascade.stale') ? pass('stale (dev) → warn, exit 0') : fail(`stale dev: code ${dev.code} ids ${[...allIds(dev.rep)]}`)
  const strict = run(d, { DS_CASCADE_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'cascade.stale') ? pass('stale + enforce → BLOCK') : fail(`stale enforce: code ${strict.code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = build(undefined) // DS present, no CSS generated
  const { code, rep } = run(d, { DS_CASCADE_ENFORCE: '1' })
  code === 1 && allIds(rep).has('cascade.css-missing') ? pass('missing CSS + enforce → BLOCK') : fail(`missing-css: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-')) // no design-system.json
  const { code, rep } = run(d, { DS_CASCADE_ENFORCE: '1' })
  code === 0 && allIds(rep).has('cascade.n-a-no-ds') ? pass('no design-system.json → SKIP/PASS') : fail(`no-ds: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
