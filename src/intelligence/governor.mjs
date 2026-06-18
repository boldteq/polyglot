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
  if (signal.kind === 'antipattern' || signal.kind === 'failure_cluster') {
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
// The judge is "calibrated" if the most recent self-test golden scores still
// separate good from bad (mean overall ≥ floor). We read the last few eval_scores;
// unknown/empty → NOT calibrated (fail-safe → review, never silent auto).
export function isEvalCalibrated({ floor = 0.6, minSample = 3 } = {}) {
  try {
    const db = require('../db.js')
    const rows = db.getEvalScores({ limit: 12 }) || []
    if (rows.length < minSample) return false
    const recent = rows.slice(0, Math.max(minSample, 6))
    const mean = recent.reduce((a, r) => a + (Number(r.overall) || 0), 0) / recent.length
    return mean >= floor
  } catch {
    return false
  }
}

// ── Persist a decision to the Brain timeline ─────────────────────────────────
// Records the verdict + the evidence that drove it. Returns the verdict for chaining.
export function recordDecision(proposal, verdict) {
  try {
    const db = require('../db.js')
    db.logSelfImprovement({
      kind: 'decision',
      agent: proposal.agent || null,
      refId: proposal.signalId || proposal.id || null,
      decision: verdict.decision,
      summary: `${verdict.decision.toUpperCase()} · ${proposal.patchType || 'patch'} → ${proposal.agent || '?'} [${verdict.reasons.join(', ')}]`,
      data: { reasons: verdict.reasons, evidence: verdict.evidence, targetFile: proposal.targetFile || null },
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
