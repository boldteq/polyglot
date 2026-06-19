#!/usr/bin/env node
// Self-test for check-honesty.mjs (gate #13). Runs the gate against three fixtures and
// asserts exit codes + (case b) the blocker ids seen.
//
//   (a) HONEST theme    (fixed-date countdown + inventory-bound scarcity) → exit 0 (pass)
//   (b) DISHONEST theme (now+duration countdown + hardcoded scarcity)     → exit 1 (block)
//                        with honesty.fake-countdown + honesty.hardcoded-scarcity
//   (c) WAIVER          (dishonest theme + data-honesty="real" markers)   → exit 0 (suppressed)
//
// Run (Node 20): node scripts/__fixtures__/honesty/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-honesty.mjs')

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }

// Run the gate in a fixture dir with an isolated REPORT_DIR; return { code, report }.
// BASE_REF is forced to a non-existent ref so the gate uses the section-reuse-map scope path
// (these fixtures are not their own git repos with a "base" tag).
function runGate(themeDir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'honesty-report-'))
  const env = {
    ...process.env,
    REPORT_DIR: reportDir,
    BASE_REF: '__no_such_base__',
    DS_REQUIRE_SCOPE: '',
    STRICT_CONVERSION: '',
    ALLOW_HONESTY_WAIVER: '',
    ...extraEnv,
  }
  const r = spawnSync('node', [GATE], { cwd: themeDir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'honesty.json'), 'utf-8')) } catch { /* no report */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report, stdout: r.stdout, stderr: r.stderr }
}

const honest = path.join(HERE, 'honest')
const dishonest = path.join(HERE, 'dishonest')
const waiver = path.join(HERE, 'waiver')
const fabricated = path.join(HERE, 'fabricated-proof')

// ── (a) honest → exit 0 ──────────────────────────────────────────────────────
console.log('case (a) honest theme (fixed-date countdown + inventory scarcity) → expect exit 0')
{
  const { code, report } = runGate(honest)
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

// ── (b) dishonest → exit 1 with expected blocker ids ─────────────────────────
console.log('case (b) dishonest theme (now+duration countdown + hardcoded scarcity) → expect exit 1')
{
  const { code, report } = runGate(dishonest)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['honesty.fake-countdown', 'honesty.hardcoded-scarcity']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

// ── (c) waiver → exit 0 (suppressed by data-honesty="real") ──────────────────
console.log('case (c) dishonest theme + data-honesty="real" markers → expect exit 0 (suppressed)')
{
  const { code, report } = runGate(waiver)
  if (code === 0) pass(`exit 0 (escape hatch suppressed findings, pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  if ((report?.blockers || []).length === 0) pass('zero blockers (markers honored)')
  else fail(`expected zero blockers, saw ${report.blockers.map(b => b.id).join(', ')}`)
}

// ── (d) fabricated social proof → exit 1 (hardcoded aggregate, no review app) ─
console.log('case (d) fabricated aggregate (summary_rating/total_reviews, no review app) → expect exit 1')
{
  const { code, report } = runGate(fabricated)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  if (ids.has('honesty.fabricated-aggregate')) pass('blocker present: honesty.fabricated-aggregate')
  else fail(`missing expected blocker: honesty.fabricated-aggregate (saw ${[...ids].join(', ') || 'none'})`)
  if (ids.has('honesty.unsubstantiated-figure')) pass('blocker present: honesty.unsubstantiated-figure')
  else fail(`missing expected blocker: honesty.unsubstantiated-figure (saw ${[...ids].join(', ') || 'none'})`)
  if (ids.has('honesty.fabricated-clinical-stat')) pass('blocker present: honesty.fabricated-clinical-stat (seeded 97% + study)')
  else fail(`missing expected blocker: honesty.fabricated-clinical-stat (saw ${[...ids].join(', ') || 'none'})`)
  if (ids.has('honesty.fabricated-testimonial')) pass('blocker present: honesty.fabricated-testimonial (named author + verified, no review app)')
  else fail(`missing expected blocker: honesty.fabricated-testimonial (saw ${[...ids].join(', ') || 'none'})`)
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (warnIds.has('honesty.preset-testimonial')) pass('warning present: honesty.preset-testimonial')
  else fail(`missing expected warning: honesty.preset-testimonial (saw ${[...warnIds].join(', ') || 'none'})`)
}

console.log('case (e) slider JS (setTimeout/setInterval in a hero slideshow, var checkTimer, NO countdown words) → expect exit 0 (NOT a fake countdown)')
{
  const { code, report } = runGate(path.join(HERE, 'slider'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 0) pass('exit 0 (slider timer is not a countdown)')
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...ids])}`)
  if (!ids.has('honesty.fake-countdown')) pass('no honesty.fake-countdown false-positive on slider checkTimer')
  else fail(`false-positive: honesty.fake-countdown fired on a slider (saw ${[...ids].join(', ')})`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
