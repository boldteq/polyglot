#!/usr/bin/env node
// Self-test for check-discovery.mjs (gate #0.4 — dispatch refusal).
//   (a) GOOD: complete goals.json (§1 schema) + substantive brand-direction.md → exit 0 dispatch-grade.
//   (b) BROKEN content: adjective target + empty priority_surfaces + null cvr + missing area + stub
//        brand → exit 1 with the specific blockers.
//   (c) EMPTY repo (no docs/ at all) → exit 1 with goals-missing + brand-missing at dispatch-grade.
//   (d) BROKEN in DEV mode (no DS_REQUIRE_SCOPE) → exit 0 (warnings only — never blocks dev).
// Run (Node 20): node scripts/__fixtures__/discovery/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-discovery.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-report-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', DISCOVERY_REQUIRED: '', EXISTING_STORE: '', ...env }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'discovery.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('case (a) GOOD discovery at dispatch-grade → expect exit 0')
{
  const { code, report } = runGate(path.join(HERE, 'good'), { DS_REQUIRE_SCOPE: '1' })
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
}

console.log('case (b) BROKEN content at dispatch-grade → expect exit 1 + specific blockers')
{
  const { code, report } = runGate(path.join(HERE, 'broken'), { DS_REQUIRE_SCOPE: '1' })
  const ids = blockerIds(report)
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['discovery.goals-area-missing', 'discovery.no-priority-surfaces', 'discovery.no-cvr-target', 'discovery.goal-as-adjective', 'discovery.brand-stub']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (c) EMPTY repo at dispatch-grade → expect exit 1 + goals-missing + brand-missing')
{
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-empty-'))
  const { code, report } = runGate(empty, { DS_REQUIRE_SCOPE: '1' })
  fs.rmSync(empty, { recursive: true, force: true })
  const ids = blockerIds(report)
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}`)
  for (const id of ['discovery.goals-missing', 'discovery.brand-missing']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (d) BROKEN in DEV mode → expect exit 0 (warnings only)')
{
  const { code, report } = runGate(path.join(HERE, 'broken'))
  if (code === 0) pass(`exit 0 (warnings=${(report?.warnings || []).length}, blockers=${(report?.blockers || []).length})`)
  else fail(`expected exit 0 in dev, got ${code}`)
  if ((report?.blockers || []).length === 0) pass('no blockers in dev mode')
  else fail(`dev mode produced blockers: ${JSON.stringify([...blockerIds(report)])}`)
}

// ── DOC-1 (2026-07-23): provenance keys must not read as numeric goal fields ────────────────
// The adjective-as-goal regex was unanchored, so `_s` matched any key CONTAINING it — `_source`,
// `_status` and `priority_surfaces` were all treated as numeric targets. A goals.json that documented
// its own provenance (the `_source` convention design-system.json already uses) was therefore reported
// as the "faster/more sales" anti-pattern: the check punished the honest brief. These pin the anchoring.
function writeGoals(dir, goals, brand = null) {
  fs.mkdirSync(path.join(dir, 'docs', 'discovery'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'discovery', 'goals.json'), JSON.stringify(goals, null, 2))
  fs.copyFileSync(
    path.join(HERE, 'good', 'docs', 'design', 'brand-direction.md'),
    path.join(dir, 'docs', 'design', 'brand-direction.md'),
  )
  if (brand) fs.writeFileSync(path.join(dir, 'docs', 'design', 'brand-direction.md'), brand)
}
const BASE_GOALS = {
  revenue: { current_monthly: 1000, target_monthly: 2000, aov_current: 40, aov_target: 55 },
  conversion: { cvr_current_pct: 1.2, cvr_target_pct: 2.4, priority_surfaces: ['hero', 'pdp'] },
  seo: { target_keywords: ['cafe mumbai'] },
  performance: { lcp_current_s: 3.1, lcp_target_s: 2.5, inp_target_ms: 200, cls_target: 0.1 },
  measurement: { ga4: 'G-XYZ', gsc: true, shopify_analytics: true },
}

console.log('case (e) documentation keys (_source/_status) are NOT numeric goal fields')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-prov-'))
  writeGoals(d, {
    ...BASE_GOALS,
    _status: 'PARTIAL — seeded from artifacts already in the repo',
    revenue: { ...BASE_GOALS.revenue, _source: 'not in repo — client business data' },
    conversion: { ...BASE_GOALS.conversion, _source: 'derived from the built templates' },
  })
  const { code, report } = runGate(d, { DS_REQUIRE_SCOPE: '1' })
  const ids = blockerIds(report)
  ids.has('discovery.goal-as-adjective')
    ? fail('provenance keys still read as numeric goal fields (regex not anchored)')
    : pass('_source / _status do not trip goal-as-adjective')
  code === 0 ? pass('documented-but-complete goals.json passes at dispatch grade') : fail(`expected exit 0, got ${code}: ${JSON.stringify([...ids])}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('case (f) a REAL adjective target is still caught (the fix must not disarm the check)')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-adj-'))
  writeGoals(d, { ...BASE_GOALS, conversion: { ...BASE_GOALS.conversion, cvr_target_pct: 'more sales' } })
  const { report } = runGate(d, { DS_REQUIRE_SCOPE: '1' })
  blockerIds(report).has('discovery.goal-as-adjective')
    ? pass('adjective in cvr_target_pct still blocks')
    : fail('anchoring disarmed the adjective check')
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('case (g) every canonical numeric field name still matches the anchored regex')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-fields-'))
  // one adjective per canonical shape — each must be caught
  writeGoals(d, {
    ...BASE_GOALS,
    revenue: { ...BASE_GOALS.revenue, target_monthly: 'lots', aov_target: 'higher' },
    performance: { ...BASE_GOALS.performance, lcp_target_s: 'fast', inp_target_ms: 'snappy', cls_target: 'stable' },
  })
  const { report } = runGate(d, { DS_REQUIRE_SCOPE: '1' })
  const detail = (report?.blockers || []).find(b => b.id === 'discovery.goal-as-adjective')?.detail || ''
  const caught = ['target_monthly', 'aov_target', 'lcp_target_s'].filter(k => detail.includes(k))
  caught.length === 3 ? pass('_monthly$ / _target$ / _s$ suffixes all still match') : fail(`only caught ${caught.join(',') || 'none'}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
