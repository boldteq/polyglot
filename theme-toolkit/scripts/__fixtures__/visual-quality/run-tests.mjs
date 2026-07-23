#!/usr/bin/env node
// Self-test for check-visual-quality.mjs (gate #17).
//   (a) APPROVED  (7 audits pass, ≥80, verdict approved)         → exit 0
//   (b) BLOCKED   (a fail + a low-confidence + verdict blocked)  → exit 1 (not-approved/audit-failed/low-confidence/blocker-findings)
//   (c) MISSING   no artifact, dev                               → exit 0 (warn)
//   (d) MISSING   no artifact, DS_REQUIRE_SCOPE=1 (publish-grade) → exit 1 (review-missing)
// Run (Node 20): node scripts/__fixtures__/visual-quality/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-visual-quality.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, extraEnv = {}, lens = undefined) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-report-'))
  // point VISUAL_QUALITY_FILE at the fixture's committed artifact; report goes to a temp dir
  const file = path.join(dir, 'docs', 'visual-quality-review.json')
  // lens !== undefined → simulate gate #18's report in the temp REPORT_DIR (the #17→#18 dependency)
  if (lens !== undefined) fs.writeFileSync(path.join(reportDir, 'visual-check.json'), JSON.stringify({ pass: lens, blockers: lens ? [] : [{ id: 'vt.frame-fail' }] }))
  const env = { ...process.env, REPORT_DIR: reportDir, VISUAL_QUALITY_FILE: file, DS_REQUIRE_SCOPE: '', VISUAL_REQUIRE: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: dir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'visual-quality.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

console.log('case (a) approved → expect exit 0')
{
  const { code, report } = runGate(path.join(HERE, 'approved'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`); else fail(`expected 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

console.log('case (b) blocked → expect exit 1 with the 4 blocker classes')
{
  const { code, report } = runGate(path.join(HERE, 'blocked'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)'); else fail(`expected 1, got ${code}`)
  for (const id of ['vq.not-approved', 'vq.audit-failed', 'vq.low-confidence', 'vq.blocker-findings']) {
    if (ids.has(id)) pass(`blocker present: ${id}`); else fail(`missing blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

// "missing artifact" = a REAL empty dir. (This used to point at HERE/missing, which doesn't exist on
// disk → spawnSync failed with cwd ENOENT → status null → 4 phantom failures. 2026-07-19 fix.)
const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-missing-'))

console.log('case (c) missing artifact (dev) → expect exit 0 (warn)')
{
  const { code, report } = runGate(missingDir)
  if (code === 0) pass('exit 0 (advisory warn)'); else fail(`expected 0, got ${code}`)
  if ((report?.warnings || []).some(w => w.id === 'vq.review-not-done')) pass('warns vq.review-not-done'); else fail('missing warn vq.review-not-done')
}

console.log('case (d) missing artifact + DS_REQUIRE_SCOPE=1 (publish) → expect exit 1')
{
  const { code, report } = runGate(missingDir, { DS_REQUIRE_SCOPE: '1' })
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)'); else fail(`expected 1, got ${code}`)
  if (ids.has('vq.review-missing')) pass('blocker present: vq.review-missing'); else fail(`missing blocker vq.review-missing (saw ${[...ids].join(', ') || 'none'})`)
}

// ── #17 → #18 dependency (publish-grade): onyx's self-review is invalid without an independent Lens pass ──
console.log('case (e) approved + publish-grade + NO Lens #18 report → expect exit 1 (vq.lens-missing)')
{
  const { code, report } = runGate(path.join(HERE, 'approved'), { DS_REQUIRE_SCOPE: '1' })
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)'); else fail(`expected 1, got ${code}`)
  if (ids.has('vq.lens-missing')) pass('blocker present: vq.lens-missing'); else fail(`missing vq.lens-missing (saw ${[...ids].join(', ') || 'none'})`)
}

console.log('case (f) approved + publish-grade + Lens #18 PASS → expect exit 0 (dependency satisfied)')
{
  const { code, report } = runGate(path.join(HERE, 'approved'), { DS_REQUIRE_SCOPE: '1' }, true)
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`); else fail(`expected 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

console.log('case (g) approved + publish-grade + Lens #18 FAIL → expect exit 1 (vq.lens-not-passed)')
{
  const { code, report } = runGate(path.join(HERE, 'approved'), { DS_REQUIRE_SCOPE: '1' }, false)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)'); else fail(`expected 1, got ${code}`)
  if (ids.has('vq.lens-not-passed')) pass('blocker present: vq.lens-not-passed'); else fail(`missing vq.lens-not-passed (saw ${[...ids].join(', ') || 'none'})`)
}

fs.rmSync(missingDir, { recursive: true, force: true })
// ── QA-1: vq.audits-missing had never been proven to fire ────────────────────────────────
// All 7 audits must be PRESENT. A review that silently omits one — say mobile_rendering — would
// otherwise read as a full sign-off while a whole dimension went unexamined.
console.log('case (e) a review missing one of the 7 audits → vq.audits-missing')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-partial-'))
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  const full = JSON.parse(fs.readFileSync(path.join(HERE, 'approved', 'docs', 'visual-quality-review.json'), 'utf-8'))
  delete full.audits.mobile_rendering // the one a hurried reviewer is most likely to skip
  fs.writeFileSync(path.join(dir, 'docs', 'visual-quality-review.json'), JSON.stringify(full))
  const { code, report } = runGate(dir, {}, true)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  ids.has('vq.audits-missing') ? pass('an incomplete audit set is blocked') : fail(`got [${[...ids].join(', ')}]`)
  code === 1 ? pass('exit 1') : fail(`expected exit 1, got ${code}`)
  const detail = (report?.blockers || []).find(b => b.id === 'vq.audits-missing')?.detail || ''
  detail.includes('mobile_rendering') ? pass('names the audit that is missing') : fail(`detail does not name it: ${detail.slice(0, 80)}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
