#!/usr/bin/env node
// Self-test for check-design-quality.mjs (gate #12). Runs the gate against three
// fixtures and asserts exit codes + (case b) the blocker ids seen.
//
//   (a) CONFORMANT theme + TUNED pack             → exit 0 (pass)
//   (b) DRIFTED theme  + TUNED pack               → exit 1 (block) with the expected blocker ids
//   (c) DRIFTED theme  + SEED pack (calibration)  → exit 0 with warnings incl. dq.pack-not-tuned
//
// Run (Node 20): node scripts/__fixtures__/design-quality/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-design-quality.mjs')
const PACKS_DIR = path.join(HERE, 'packs')

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }

// Run the gate in a fixture dir with an isolated REPORT_DIR; return { code, report }.
function runGate(themeDir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-report-'))
  const env = {
    ...process.env,
    DNA_PACKS_DIR: PACKS_DIR,
    REPORT_DIR: reportDir,
    BASE_REF: '__no_such_base__', // force the reuse-map scope path (no git base in the fixture)
    // unset inherited env that could perturb the run
    DQ_FORCE_ENFORCE: '',
    ALLOW_DQ_WAIVER: '',
    DS_REQUIRE_SCOPE: '',
    ...extraEnv,
  }
  const r = spawnSync('node', [GATE], { cwd: themeDir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-quality.json'), 'utf-8')) } catch { /* no report */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report, stdout: r.stdout, stderr: r.stderr }
}

const conformant = path.join(HERE, 'conformant')
const drifted = path.join(HERE, 'drifted')

// ── (a) conformant + tuned → exit 0 ─────────────────────────────────────────
console.log('case (a) conformant theme + tuned pack → expect exit 0')
{
  const { code, report } = runGate(conformant)
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

// ── (b) drifted + tuned → exit 1 with expected blocker ids ───────────────────
console.log('case (b) drifted theme + tuned pack → expect exit 1 with blocker ids')
{
  const { code, report } = runGate(drifted)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass(`exit 1 (block)`)
  else fail(`expected exit 1, got ${code}`)
  const expected = ['dq.type-scale-off', 'dq.components-below-floor', 'dq.hero-carousel-forbidden', 'dq.too-many-schemes']
  for (const id of expected) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

// ── (c) drifted + seed pack → exit 0 with dq.pack-not-tuned warning ──────────
console.log('case (c) drifted theme + seed pack → expect exit 0 with dq.pack-not-tuned')
{
  const { code, report } = runGate(drifted, { DESIGN_SPEC: 'docs/design/design-spec.seed.md' })
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (code === 0) pass(`exit 0 (calibration gate demoted blockers)`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  if (warnIds.has('dq.pack-not-tuned')) pass(`warning present: dq.pack-not-tuned`)
  else fail(`missing dq.pack-not-tuned warning (saw ${[...warnIds].join(', ') || 'none'})`)
  // the measurable failures must have become WARNINGS, not vanished
  for (const id of ['dq.type-scale-off', 'dq.components-below-floor', 'dq.hero-carousel-forbidden', 'dq.too-many-schemes']) {
    if (warnIds.has(id)) pass(`demoted to warning: ${id}`)
    else fail(`expected demoted warning: ${id}`)
  }
  if ((report?.blockers || []).length === 0) pass('zero blockers (seed pack)')
  else fail(`expected zero blockers, saw ${report.blockers.map(b => b.id).join(', ')}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
