// Boldteq Intelligence — the Autonomy Governor (the spine of the self-improving brain).
//
// Every self-change the factory wants to make to itself — patch an agent's .md,
// retire a stale memory, add a smart default — routes through ONE pure decision:
//
//   decide(proposal, ctx) → { decision: 'auto' | 'review' | 'reject', reasons, evidence }
//
// This is the impulse-control layer. It encodes the Graduated-auto policy Yash
// locked (2026-06-18): auto-apply ONLY strong-evidence, rollback-armed changes;
// everything weaker proposes to the human review inbox; never self-rewrite the
// constitution (feedback.md). Keeping decide() PURE makes the policy testable and
// the same in every caller (aggregator, trainer, hygiene pass).
//
// recordDecision() persists the verdict to the Brain timeline (self_improvement_log)
// so every auto/review/reject is inspectable with the evidence that drove it.

import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// ── Policy thresholds (tunable; the Graduated-auto bar) ──────────────────────
export const AUTO_POLICY = {
  minOccurrences: 3,   // an antipattern must recur ≥3× …
  minProjects: 2,      // … across ≥2 distinct projects to earn auto-apply
}

// A proposal that touches any of these is NEVER auto-applied — human-only.
// feedback.md is the constitution (Yash's corrections); it is never self-rewritten.
const NEVER_AUTO_FILES = new Set(['feedback.md'])
const NEVER_AUTO_BLAST = new Set(['constitution', 'shared-memory', 'multi-agent'])

// Signals strong enough to clear the evidence bar on their own.
const STRONG_KINDS = new Set(['yash_correction'])

function distinctProjects(signal) {
  const p = signal?.projects
  if (Array.isArray(p)) return new Set(p.filter(Boolean)).size
  return Number(signal?.distinctProjects || 0)
}

function isConstitutional(proposal) {
  const base = proposal?.targetFile ? path.basename(proposal.targetFile) : ''
  return (
    NEVER_AUTO_FILES.has(base) ||
    proposal?.patchType === 'feedback' ||
    NEVER_AUTO_BLAST.has(proposal?.blastRadius)
  )
}

// Can we reverse this change? The trainer must always provide before_text (the
// exact prior text; '' for a pure insert, whose reverse is "remove after_text").
// undefined/null means we can't reconstruct the reverse → unsafe at any tier.
function hasRollback(proposal) {
  return proposal?.rollback_content !== undefined && proposal?.rollback_content !== null
}

function meetsEvidenceBar(signal) {
  if (!signal) return false
  if (signal.severity === 'p0' || STRONG_KINDS.has(signal.kind)) return true
  // gate_defect = a Lens/gate defect harvested from real builds (src/lib/gateFindings.js).
  // Held to the SAME strong bar as an antipattern: recur ≥3× across ≥2 distinct builds before
  // it auto-promotes into the owning agent's .md (still rollback-armed + eval-gated downstream).
  if (signal.kind === 'antipattern' || signal.kind === 'failure_cluster' || signal.kind === 'gate_defect') {
    return (Number(signal.occurrences || 0) >= AUTO_POLICY.minOccurrences &&
            distinctProjects(signal) >= AUTO_POLICY.minProjects)
  }
  return false
}

/**
 * The one pure decision. No I/O.
 * @param {object} proposal { agent, targetFile, patchType, section, rollback_content, after_text, blastRadius, signal:{kind,severity,occurrences,projects} }
 * @param {object} ctx      { evalCalibrated:boolean } — is the LLM-judge self-test currently passing?
 * @returns {{decision:'auto'|'review'|'reject', reasons:string[], evidence:object}}
 */
export function decide(proposal = {}, ctx = {}) {
  const reasons = []
  const signal = proposal.signal || {}
  const evidence = {
    kind: signal.kind || null,
    severity: signal.severity || null,
    occurrences: Number(signal.occurrences || 0),
    distinctProjects: distinctProjects(signal),
    blastRadius: proposal.blastRadius || 'single-agent-section',
    evalCalibrated: ctx.evalCalibrated !== false, // default optimistic only if explicitly true; see below
  }

  // 0) No way to undo it → reject. A patch we can't revert is unsafe even to stage.
  if (!hasRollback(proposal)) {
    reasons.push('no-rollback')
    return { decision: 'reject', reasons, evidence }
  }

  // 1) HARD RULE — the constitution / shared memory / multi-agent blast is never
  //    auto-applied. It can still be PROPOSED, but only a human approve writes it.
  if (isConstitutional(proposal)) {
    reasons.push('constitution-human-only')
    return { decision: 'review', reasons, evidence }
  }

  // 2) Evidence bar for auto-apply.
  const strong = meetsEvidenceBar(signal)
  if (!strong) {
    reasons.push('below-evidence-bar')
    return { decision: 'review', reasons, evidence }
  }
  reasons.push(signal.severity === 'p0' || STRONG_KINDS.has(signal.kind)
    ? 'strong:yash-correction'
    : `strong:recurrence(${evidence.occurrences}x/${evidence.distinctProjects}proj)`)

  // 3) Blast radius must be a single agent section to qualify for auto.
  if (evidence.blastRadius !== 'single-agent-section') {
    reasons.push(`blast:${evidence.blastRadius}`)
    return { decision: 'review', reasons, evidence }
  }

  // 4) Don't self-modify while the judge is miscalibrated — HOLD for a human.
  //    ctx.evalCalibrated must be EXPLICITLY true to clear this gate (fail-safe:
  //    unknown calibration is treated as not-calibrated → review).
  if (ctx.evalCalibrated !== true) {
    reasons.push('eval-miscalibrated-hold')
    evidence.evalCalibrated = false
    return { decision: 'review', reasons, evidence }
  }

  reasons.push('auto-eligible')
  return { decision: 'auto', reasons, evidence }
}

// ── Eval calibration gate ────────────────────────────────────────────────────
// "Calibrated" means the JUDGE still works: the most recent golden self-test still
// separates good outputs from bad. We read it from the self-test record (calibrated
// /total ratio + mean good–bad separation + freshness), NOT from production agent
// scores — a genuinely bad agent output (e.g. 0.32) must not make the judge look
// broken and block every self-improvement. Unknown / stale / empty → NOT calibrated
// (fail-safe → review, never silent auto).

// Pure ASSESSMENT over a self-test record ({total, calibrated, meanSeparation, at}).
// No I/O — testable in isolation. `now` is injectable so freshness is deterministic.
// Returns { calibrated, reason, ageDays, maxAgeDays } so callers can SURFACE *why* the
// judge is blocking autos (missing vs stale vs weak) instead of an opaque false.
//   reason ∈ 'ok' | 'missing' | 'invalid' | 'weak-ratio' | 'low-separation' | 'stale'
export function evalCalibration(selftest, { minRatio = 0.8, minSeparation = 0.3, maxAgeDays = 14, now = Date.now() } = {}) {
  if (!selftest) return { calibrated: false, reason: 'missing', ageDays: null, maxAgeDays }
  const total = Number(selftest.total || 0)
  const calibrated = Number(selftest.calibrated || 0)
  const sep = Number(selftest.meanSeparation || 0)
  const at = selftest.at ? Date.parse(selftest.at) : NaN
  const ageDays = Number.isNaN(at) ? null : Number(((now - at) / 86400000).toFixed(1))
  if (total <= 0) return { calibrated: false, reason: 'invalid', ageDays, maxAgeDays }
  if (calibrated / total < minRatio) return { calibrated: false, reason: 'weak-ratio', ageDays, maxAgeDays }
  if (sep < minSeparation) return { calibrated: false, reason: 'low-separation', ageDays, maxAgeDays }
  if (Number.isNaN(at)) return { calibrated: false, reason: 'invalid', ageDays: null, maxAgeDays }
  if (ageDays > maxAgeDays) return { calibrated: false, reason: 'stale', ageDays, maxAgeDays }
  return { calibrated: true, reason: 'ok', ageDays, maxAgeDays }
}

// Boolean shim — the auto-gate only needs yes/no. Kept so decide()/isEvalCalibrated and
// the governor test-suite stay on a simple predicate (fail-safe FALSE on null/stale/weak).
export function selftestCalibrated(selftest, opts = {}) {
  return evalCalibration(selftest, opts).calibrated
}

// Rich live read — returns the full assessment from the latest stored self-test. On a
// DB error it FAILS SAFE (calibrated:false) but now LOGS the real cause: a transient
// SQLITE_BUSY used to silently hold every auto with zero trace. reason='error' is
// distinguishable from a genuine 'missing'/'stale' so operators can tell them apart.
export function getEvalCalibration(opts = {}) {
  try {
    const db = require('../db.js')
    return evalCalibration(db.getLatestSelftest(), opts)
  } catch (e) {
    console.warn('[governor] getEvalCalibration read failed (holding autos):', e.message)
    return { calibrated: false, reason: 'error', ageDays: null, maxAgeDays: opts.maxAgeDays ?? 14, error: e.message }
  }
}

export function isEvalCalibrated(opts = {}) {
  try {
    const db = require('../db.js')
    return selftestCalibrated(db.getLatestSelftest(), opts)
  } catch (e) {
    console.warn('[governor] isEvalCalibrated read failed (holding autos):', e.message)
    return false
  }
}

// ── Persist a decision to the Brain timeline + the decision journal ───────────
// TWO writes, two surfaces:
//   • self_improvement_log (kind='decision') — the human-readable audit timeline
//     (getBrainStats counts decisions from here; never drop this write).
//   • reflections (kind='decision', outcome='pending') — the LEARN-FROM-CONSEQUENCES
//     journal the resolution loop reads back (getUnresolvedDecisions / getDecisionAccuracy).
//     Without this the journal is write-only: decisions are made, logged, never scored.
// confidence ≈ how sure we are this verdict was right, so rolling accuracy is meaningful.
const DECISION_CONFIDENCE = { auto: 0.9, review: 0.5, reject: 0.2 }
export function recordDecision(proposal, verdict) {
  const summary = `${verdict.decision.toUpperCase()} · ${proposal.patchType || 'patch'} → ${proposal.agent || '?'} [${verdict.reasons.join(', ')}]`
  const refId = proposal.signalId || proposal.id || null
  try {
    const db = require('../db.js')
    db.logSelfImprovement({
      kind: 'decision',
      agent: proposal.agent || null,
      refId,
      decision: verdict.decision,
      summary,
      data: { reasons: verdict.reasons, evidence: verdict.evidence, targetFile: proposal.targetFile || null },
    })
    // Mirror into the decision journal so the consequence half of the loop is reachable.
    const project = (proposal.signal && Array.isArray(proposal.signal.projects) && proposal.signal.projects.filter(Boolean)[0]) || null
    db.insertReflection({
      kind: 'decision',
      project,
      summary,
      detail: `${proposal.agent || '?'} · ${proposal.patchType || 'patch'} · ${verdict.reasons.join('; ')}`,
      confidence: DECISION_CONFIDENCE[verdict.decision] ?? 0.5,
      outcome: 'pending',
      data: { decision: verdict.decision, agent: proposal.agent || null, refId, reasons: verdict.reasons, evidence: verdict.evidence, targetFile: proposal.targetFile || null },
    })
  } catch (e) {
    if (process.env.DEBUG_BRAIN) console.warn('[governor] recordDecision failed:', e.message)
  }
  return verdict
}

// Convenience: decide + record in one call. ctx.evalCalibrated defaults to a live
// calibration read unless the caller passes it explicitly (lets tests inject).
export function govern(proposal, ctx = {}) {
  const resolvedCtx = ('evalCalibrated' in ctx) ? ctx : { ...ctx, evalCalibrated: isEvalCalibrated() }
  const verdict = decide(proposal, resolvedCtx)
  return recordDecision(proposal, verdict)
}
