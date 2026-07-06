#!/usr/bin/env node
// Self-test for check-a11y-static.mjs (gate #16).
//   (a) CLEAN theme (alt + real button + 16px input) → exit 0, 0 warnings
//   (b) VIOLATIONS (default WARN) → exit 0 with 3 warnings (img-no-alt, noninteractive-handler, input-font-small)
//   (c) VIOLATIONS under A11Y_STRICT=1 → exit 1 with the 3 as blockers
// Run (Node 20): node scripts/__fixtures__/a11y/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-a11y-static.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-report-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', DS_REQUIRE_SCOPE: '', A11Y_STRICT: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: dir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'static-a11y.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

const EXPECT = ['a11y.img-no-alt', 'a11y.noninteractive-handler', 'a11y.input-font-small']

console.log('case (a) clean theme → expect exit 0, 0 warnings')
{
  const { code, report } = runGate(path.join(HERE, 'clean'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}`)
  const w = (report?.warnings || []).filter(x => x.id.startsWith('a11y.')).length
  if (w === 0) pass('zero a11y warnings on clean')
  else fail(`expected 0 a11y warnings, saw ${w}`)
}

console.log('case (b) violations (default WARN) → expect exit 0 + 3 a11y warnings')
{
  const { code, report } = runGate(path.join(HERE, 'violations'))
  if (code === 0) pass('exit 0 (advisory)')
  else fail(`expected exit 0, got ${code}`)
  const ids = new Set((report?.warnings || []).map(w => w.id))
  for (const id of EXPECT) { if (ids.has(id)) pass(`warning present: ${id}`); else fail(`missing warning: ${id} (saw ${[...ids].join(', ')})`) }
}

console.log('case (c) violations under A11Y_STRICT=1 → expect exit 1 with blockers')
{
  const { code, report } = runGate(path.join(HERE, 'violations'), { A11Y_STRICT: '1' })
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}`)
  for (const id of EXPECT) { if (ids.has(id)) pass(`blocker present: ${id}`); else fail(`missing blocker: ${id} (saw ${[...ids].join(', ')})`) }
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
