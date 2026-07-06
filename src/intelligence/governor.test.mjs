// Unit coverage for the Autonomy Governor — the spine of the self-improving brain.
// Pure functions only (no DB, no I/O), so this runs under `node --test src/` on any
// Node version. Asserts the Graduated-auto policy Yash locked (2026-06-18):
//   - judge calibration is derived from the golden SELF-TEST, not agent quality
//   - feedback.md / constitution is ALWAYS review (never self-rewritten)
//   - auto needs strong evidence + rollback + single-section + a calibrated judge
//   - no-rollback → reject (can never stage an unrevertable change)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, selftestCalibrated, evalCalibration } from './governor.mjs'

// Fixed clock so freshness checks are deterministic (no Date.now flake).
const NOW = Date.parse('2026-06-18T00:00:00.000Z')
const isoDaysAgo = (d) => new Date(NOW - d * 86400000).toISOString()
const PASSING = { total: 6, calibrated: 6, meanSeparation: 0.8, at: isoDaysAgo(1) }

// ── selftestCalibrated: the calibration truth table ──────────────────────────
test('selftestCalibrated: fresh passing self-test → calibrated', () => {
  assert.equal(selftestCalibrated(PASSING, { now: NOW }), true)
})

test('selftestCalibrated: null / empty self-test → NOT calibrated (fail-safe)', () => {
  assert.equal(selftestCalibrated(null, { now: NOW }), false)
  assert.equal(selftestCalibrated(undefined, { now: NOW }), false)
  assert.equal(selftestCalibrated({ total: 0, calibrated: 0, meanSeparation: 0, at: isoDaysAgo(1) }, { now: NOW }), false)
})

test('selftestCalibrated: low calibrated/total ratio → NOT calibrated', () => {
  // 4/6 = 0.667 < default minRatio 0.8
  assert.equal(selftestCalibrated({ total: 6, calibrated: 4, meanSeparation: 0.8, at: isoDaysAgo(1) }, { now: NOW }), false)
})

test('selftestCalibrated: weak good–bad separation → NOT calibrated', () => {
  assert.equal(selftestCalibrated({ total: 6, calibrated: 6, meanSeparation: 0.2, at: isoDaysAgo(1) }, { now: NOW }), false)
})

test('selftestCalibrated: stale self-test (older than maxAgeDays) → NOT calibrated', () => {
  assert.equal(selftestCalibrated({ ...PASSING, at: isoDaysAgo(30) }, { now: NOW }), false)
})

test('selftestCalibrated: missing/invalid timestamp → NOT calibrated', () => {
  assert.equal(selftestCalibrated({ total: 6, calibrated: 6, meanSeparation: 0.8 }, { now: NOW }), false)
})

// ── decide(): the Graduated-auto routing ─────────────────────────────────────
const STRONG = {
  agent: 'koda',
  targetFile: '/Users/x/.claude/agents/koda.md',
  patchType: 'anti_pattern',
  rollback_content: '',                 // present (even '') → revertable
  after_text: '- 🚫 Avoid: using `any`',
  blastRadius: 'single-agent-section',
  signal: { kind: 'failure_cluster', occurrences: 4, projects: ['a', 'b'] },
}

test('decide: strong + rollback + single-section + calibrated → AUTO', () => {
  const v = decide(STRONG, { evalCalibrated: true })
  assert.equal(v.decision, 'auto', v.reasons.join(','))
  assert.ok(v.reasons.includes('auto-eligible'))
})

test('decide: miscalibrated judge HOLDS an otherwise-auto change → review', () => {
  const v = decide(STRONG, { evalCalibrated: false })
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('eval-miscalibrated-hold'))
})

test('decide: SALES agent (sway) is human-approval-only → review even when otherwise auto', () => {
  const v = decide({ ...STRONG, agent: 'sway', targetFile: '/Users/x/.claude/agents/sway.md' }, { evalCalibrated: true })
  assert.equal(v.decision, 'review', v.reasons.join(','))
  assert.ok(v.reasons.includes('sales-human-approval'))
})

test('decide: roleBand:sales is human-approval-only → review', () => {
  const v = decide({ ...STRONG, roleBand: 'sales' }, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('sales-human-approval'))
})

test('decide: unknown calibration (omitted) is fail-safe → review, not auto', () => {
  // ctx.evalCalibrated must be EXPLICITLY true to clear the gate.
  const v = decide(STRONG, {})
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('eval-miscalibrated-hold'))
})

test('decide: feedback.md target is ALWAYS review (constitution human-only)', () => {
  const v = decide({ ...STRONG, targetFile: '/Users/x/.claude/memory/user/feedback.md' }, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('constitution-human-only'))
})

test('decide: feedback patchType is ALWAYS review even with a P0 signal', () => {
  const v = decide({ ...STRONG, patchType: 'feedback', signal: { kind: 'yash_correction', severity: 'p0' } }, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('constitution-human-only'))
})

test('decide: no rollback_content → REJECT (unrevertable is unsafe to even stage)', () => {
  const { rollback_content, ...noRollback } = STRONG
  const v = decide(noRollback, { evalCalibrated: true })
  assert.equal(v.decision, 'reject')
  assert.ok(v.reasons.includes('no-rollback'))
})

test('decide: below evidence bar (1× / 1 project) → review', () => {
  const v = decide({ ...STRONG, signal: { kind: 'failure_cluster', occurrences: 1, projects: ['a'] } }, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
  assert.ok(v.reasons.includes('below-evidence-bar'))
})

test('decide: multi-agent blast radius downgrades a strong signal → review', () => {
  const v = decide({ ...STRONG, blastRadius: 'multi-agent' }, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
})

test('decide: a P0 Yash correction clears the evidence bar on its own → auto', () => {
  const v = decide({ ...STRONG, signal: { kind: 'yash_correction', severity: 'p0' } }, { evalCalibrated: true })
  assert.equal(v.decision, 'auto', v.reasons.join(','))
})

// ── evalCalibration: the rich assessment behind the boolean (FIX #9/#10) ──────
// Every blocking reason is distinct so /health + the tutor alert can say WHY the
// brain paused (missing vs stale vs weak) instead of an opaque "not calibrated".
test('evalCalibration: fresh passing self-test → ok + ageDays', () => {
  const a = evalCalibration(PASSING, { now: NOW })
  assert.equal(a.calibrated, true)
  assert.equal(a.reason, 'ok')
  assert.equal(a.ageDays, 1)
  assert.equal(a.maxAgeDays, 14)
})

test('evalCalibration: missing self-test → reason "missing", null age', () => {
  const a = evalCalibration(null, { now: NOW })
  assert.deepEqual([a.calibrated, a.reason, a.ageDays], [false, 'missing', null])
})

test('evalCalibration: total 0 → reason "invalid"', () => {
  const a = evalCalibration({ total: 0, calibrated: 0, meanSeparation: 0.8, at: isoDaysAgo(1) }, { now: NOW })
  assert.equal(a.calibrated, false)
  assert.equal(a.reason, 'invalid')
})

test('evalCalibration: low ratio → reason "weak-ratio"', () => {
  const a = evalCalibration({ total: 6, calibrated: 4, meanSeparation: 0.8, at: isoDaysAgo(1) }, { now: NOW })
  assert.equal(a.reason, 'weak-ratio')
})

test('evalCalibration: weak separation → reason "low-separation"', () => {
  const a = evalCalibration({ total: 6, calibrated: 6, meanSeparation: 0.2, at: isoDaysAgo(1) }, { now: NOW })
  assert.equal(a.reason, 'low-separation')
})

test('evalCalibration: stale self-test → reason "stale" + the real age', () => {
  const a = evalCalibration({ ...PASSING, at: isoDaysAgo(30) }, { now: NOW })
  assert.equal(a.calibrated, false)
  assert.equal(a.reason, 'stale')
  assert.equal(a.ageDays, 30)
})

test('evalCalibration: selftestCalibrated boolean shim matches .calibrated', () => {
  for (const st of [PASSING, null, { total: 6, calibrated: 4, meanSeparation: 0.8, at: isoDaysAgo(1) }, { ...PASSING, at: isoDaysAgo(30) }]) {
    assert.equal(selftestCalibrated(st, { now: NOW }), evalCalibration(st, { now: NOW }).calibrated)
  }
})
