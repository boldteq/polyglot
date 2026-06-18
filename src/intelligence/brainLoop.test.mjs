// Brain-loop integration coverage (DB-backed, throwaway). Guards the wiring the
// pure governor.test.mjs can't reach:
//   • FIX #1 — recordDecision DUAL-writes: the audit timeline (self_improvement_log)
//     AND the decision journal (reflections, outcome='pending'). If the journal write
//     ever regresses, the consequence half of the loop goes write-only again.
//   • govern() — decide + record in one call, routing a weak proposal to review.
//   • FIX #11 — eval_drop signal triage: the exact db layer the new
//     POST /api/brain/signals/:id/status route drives (upsert → status flip → read).
//
// POLYGLOT_DB_PATH is set BEFORE db.js is first required, so data/polyglot.db is never
// touched. node --test isolates each file in its own process.

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brainloop-'))
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'probe.db')

const require = createRequire(import.meta.url)
const db = require('../db.js') // env set above → probe db
const { decide, recordDecision, govern } = await import('./governor.mjs')

const AUTO_PROPOSAL = {
  agent: 'koda',
  patchType: 'anti_pattern',
  targetFile: '/Users/x/.claude/agents/koda.md',
  rollback_content: '',
  after_text: '- 🚫 Avoid: using `any`',
  blastRadius: 'single-agent-section',
  signalId: 'sig:test123',
  signal: { kind: 'failure_cluster', occurrences: 4, projects: ['Rankora', 'CROBOT'] },
}

// ── FIX #1: recordDecision writes BOTH surfaces ──────────────────────────────
test('recordDecision: writes the audit timeline AND the decision journal', () => {
  const verdict = decide(AUTO_PROPOSAL, { evalCalibrated: true })
  assert.equal(verdict.decision, 'auto')
  recordDecision(AUTO_PROPOSAL, verdict)

  // self_improvement_log — the human-readable timeline (getBrainStats reads here).
  const logRow = db.getDb()
    .prepare("SELECT * FROM self_improvement_log WHERE kind = 'decision' AND agent = 'koda' ORDER BY ts DESC LIMIT 1")
    .get()
  assert.ok(logRow, 'self_improvement_log decision row exists')
  assert.equal(logRow.decision, 'auto')

  // reflections — the decision JOURNAL the resolution loop reads back.
  const pending = db.getUnresolvedDecisions({ limit: 50 })
  const mine = pending.find((r) => r.summary && r.summary.includes('koda'))
  assert.ok(mine, 'a pending decision reflection was journaled')
  assert.equal(mine.outcome, 'pending')
  assert.equal(mine.project, 'Rankora') // first non-empty project carried through
})

test('recordDecision: brain stats count the logged decision', () => {
  const stats = db.getBrainStats()
  assert.ok(stats.decisions, 'decisions bucket present')
  assert.ok((stats.decisions.auto || 0) >= 1, 'at least one auto decision counted')
})

// ── govern(): decide + record, weak evidence → review ────────────────────────
test('govern: a first-occurrence proposal is routed to review and journaled', () => {
  const weak = {
    ...AUTO_PROPOSAL,
    agent: 'dato',
    signalId: 'sig:weak1',
    signal: { kind: 'failure_cluster', occurrences: 1, projects: ['Rankora'] },
  }
  const v = govern(weak, { evalCalibrated: true })
  assert.equal(v.decision, 'review')
  const logRow = db.getDb()
    .prepare("SELECT * FROM self_improvement_log WHERE kind = 'decision' AND agent = 'dato' ORDER BY ts DESC LIMIT 1")
    .get()
  assert.equal(logRow.decision, 'review')
})

// ── FIX #11: eval_drop signal triage (the route's db layer) ──────────────────
test('eval_drop signal: upsert → dismiss flips status, stays out of the open feed', () => {
  const sig = db.upsertTrainingSignal({
    agent: 'vex',
    kind: 'eval_drop',
    signature: 'rolling judge eval below floor',
    severity: 'medium',
    projects: ['Polyglot'],
    evidence: { source: 'eval_scores', mean: 0.41, n: 4, floor: 0.6, judge_calibrated: true },
    mode: 'set',
  })
  assert.ok(sig.id)

  // visible in the Brain tab's feed (status=open, kind=eval_drop)
  let open = db.getTrainingSignals({ status: 'open', kind: 'eval_drop' })
  assert.ok(open.some((s) => s.id === sig.id), 'eval_drop signal is in the open feed')
  const mine = open.find((s) => s.id === sig.id)
  assert.equal(mine.evidence.mean, 0.41)
  assert.equal(mine.evidence.judge_calibrated, true)

  // human triage (what POST /brain/signals/:id/status calls)
  db.updateTrainingSignalStatus(sig.id, 'dismissed')
  open = db.getTrainingSignals({ status: 'open', kind: 'eval_drop' })
  assert.equal(open.some((s) => s.id === sig.id), false, 'dismissed signal leaves the open feed')
  const dismissed = db.getTrainingSignals({ status: 'dismissed', kind: 'eval_drop' })
  assert.ok(dismissed.some((s) => s.id === sig.id), 'now under dismissed')
})

test('eval_drop signal: a miscalibrated judge is recorded so PIP can be suppressed', () => {
  const sig = db.upsertTrainingSignal({
    agent: 'luna',
    kind: 'eval_drop',
    signature: 'rolling judge eval below floor',
    severity: 'low',
    projects: ['Polyglot'],
    evidence: { source: 'eval_scores', mean: 0.3, n: 5, floor: 0.6, judge_calibrated: false, judge_reason: 'stale' },
    mode: 'set',
  })
  const row = db.getTrainingSignals({ kind: 'eval_drop', agent: 'luna' })[0]
  assert.equal(row.severity, 'low')
  assert.equal(row.evidence.judge_calibrated, false)
  assert.equal(row.evidence.judge_reason, 'stale')
})

test.after(() => {
  try { db.getDb().close() } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* best-effort */ }
})
