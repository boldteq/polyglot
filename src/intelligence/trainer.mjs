// Boldteq Intelligence — the Trainer (Phase C: "form habits").
//
// This is the ACTION arm of the learning loop. The aggregator (Phase B) emits
// `training_signals` ("koda keeps using `any` ×4 across 2 projects"). The Trainer
// turns each open signal into a CONCRETE, REVERSIBLE patch to the agent's own
// instructions, routes it through the governor (auto vs review vs reject), and —
// for auto — surgically edits `~/.claude/agents/<agent>.md`, records the patch with
// its rollback payload, appends a changelog, and queues a reindex so the new rule
// is searchable. Later it MEASURES the patch's impact and AUTO-ROLLS-BACK regressions.
//
// Safety is structural, not hopeful:
//   • Every auto-edit lives inside ONE machine-managed fenced block per agent —
//     hand-authored prose is never touched (honors "constitution not self-rewritten").
//   • Each rule line is tagged with the signal id → idempotent apply + surgical revert.
//   • The governor (governor.mjs) holds the impulse-control policy; the Trainer never
//     decides auto-vs-review itself — it only synthesizes, applies, and measures.
//   • Unattributable signals (domain buckets, missing .md) can NEVER auto-apply —
//     they short-circuit to review before the governor is even consulted.
//
// eval_drop signals are intentionally NOT patched here — a low judge score is a
// quality flag, not a surgical antipattern; Witness already factors it into PIP.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { govern, isEvalCalibrated } from './governor.mjs'

const require = createRequire(import.meta.url)
const db = require('../db.js')
const brainSignals = require('../lib/brainSignals.js')

// ── Paths ────────────────────────────────────────────────────────────────────
const HOME = os.homedir()
const AGENTS_DIR = path.join(HOME, '.claude', 'agents')
const ORG_DIR = path.join(HOME, '.claude', 'org')
const CHANGELOG = path.join(ORG_DIR, 'training-changelog-self-improving.md')
const REINDEX_QUEUE = path.join(HOME, '.claude', 'memory', '.brain', 'reindex-queue.jsonl')

// ── The machine-managed block (the ONLY region the Trainer ever edits) ───────
const BLOCK_START = '<!-- BOLDTEQ-AUTOLEARN:START -->'
const BLOCK_END = '<!-- BOLDTEQ-AUTOLEARN:END -->'
const BLOCK_HEADER = [
  '## 🧠 Auto-Learned Guardrails (machine-maintained — do not hand-edit)',
  '<!-- Added by the self-improving brain from verified cross-project signals.',
  '     Each line is reversible: training_patches.before_text + the training-changelog. -->',
].join('\n')

// ── Defaults (overridable via the handler from configService) ────────────────
export const TRAINER_DEFAULTS = {
  observeWindowHours: 504, // 21d — window for the pre/post score snapshots
  minRunsForImpact: 5,     // need ≥5 post-patch runs before judging impact
  regressionThreshold: 0.10, // >10% drop in success-rate → auto-rollback
  cooldownHours: 48,       // ≤1 auto-apply per agent per 48h (Tutor Constitution Q22), and
                           // don't re-apply a just-reverted signal within this window
  minObserveHours: 24,     // let a patch settle ≥24h before measuring it
}

// ── Resolve a signal's agent → a real .md file (or null = not auto-patchable) ─
// Rejects domain buckets ("domain:general"), path injection, and missing files.
// A null here is the structural guarantee that an unattributable signal can never
// be surgically auto-applied — it is forced to human review upstream.
export function agentFilePath(agent) {
  if (!agent || typeof agent !== 'string') return null
  if (/[:/\\]|\.\./.test(agent)) return null
  const p = path.join(AGENTS_DIR, `${agent}.md`)
  return fs.existsSync(p) ? p : null
}

// ── Signature → readable phrase ──────────────────────────────────────────────
function humanize(text) {
  const s = String(text || '').trim()
  if (!s) return 'this recurring weakness'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Signal → a concrete rule line (or null for kinds we don't patch) ─────────
// The line carries the signal id as an HTML-comment marker: invisible in rendered
// markdown, greppable for idempotency, and the anchor for a surgical revert.
export function ruleLineFor(signal) {
  if (!signal || !signal.id) return null
  const kind = signal.kind
  if (kind === 'eval_drop') return null // quality flag, not a surgical rule (Witness owns it)
  if (kind === 'behavior_drift') return null // review-only trend signal — never auto-patch an agent .md from it
  const marker = `<!-- ${signal.id} -->`
  const date = new Date().toISOString().slice(0, 10)
  const ev = signal.evidence || {}
  const projects = Array.isArray(signal.projects) ? signal.projects.filter(Boolean) : []
  const where = projects.length ? `across ${projects.join(', ')}` : 'across multiple runs'

  if (kind === 'yash_correction') {
    const phrase = humanize(ev.correction || ev.issue || signal.signature)
    return { line: `- ✅ **Always (Yash correction):** ${phrase} _(auto-learned ${date})_ ${marker}`, patchType: 'smart_default' }
  }
  // antipattern | failure_cluster | rework
  const phrase = humanize(signal.signature)
  const occ = Number(signal.occurrences || 0)
  const detail = occ ? `recurred ${occ}× ${where}` : where
  return { line: `- 🚫 **Avoid:** ${phrase} — ${detail} _(auto-learned ${date})_ ${marker}`, patchType: 'anti_pattern' }
}

// ── Parse the managed block out of a file ────────────────────────────────────
function readBlock(content) {
  const s = content.indexOf(BLOCK_START)
  const e = content.indexOf(BLOCK_END)
  if (s === -1 || e === -1 || e < s) return { hasBlock: false, inner: '' }
  return { hasBlock: true, inner: content.slice(s + BLOCK_START.length, e), s, e }
}

// ── Plan a patch WITHOUT writing (so the governor sees rollback_content first) ─
export function planPatch(signal) {
  const rule = ruleLineFor(signal)
  if (!rule) return { skip: 'no-rule-for-kind' }
  const targetFile = agentFilePath(signal.agent)
  if (!targetFile) return { rule, patchType: rule.patchType, targetFile: null, unattributable: true }
  let content
  try { content = fs.readFileSync(targetFile, 'utf8') } catch { return { rule, patchType: rule.patchType, targetFile, missing: true } }
  const marker = `<!-- ${signal.id} -->`
  const blk = readBlock(content)
  return {
    rule, patchType: rule.patchType, targetFile, marker,
    before_text: blk.hasBlock ? blk.inner : '', // '' = pure insert (governor: valid rollback)
    after_text: rule.line,
    alreadyPresent: content.includes(marker),
    willCreateBlock: !blk.hasBlock,
  }
}

// ── Apply a planned patch (surgical, idempotent) ─────────────────────────────
export function writePatch(plan) {
  if (!plan || !plan.targetFile) return { ok: false, reason: 'no-target' }
  let content
  try { content = fs.readFileSync(plan.targetFile, 'utf8') } catch { return { ok: false, reason: 'read-failed' } }
  if (content.includes(plan.marker)) return { ok: true, alreadyPresent: true } // idempotent re-run
  const blk = readBlock(content)
  if (blk.hasBlock) {
    const idx = content.indexOf(BLOCK_END)
    content = content.slice(0, idx) + `${plan.rule.line}\n` + content.slice(idx)
  } else {
    const block = `\n\n${BLOCK_START}\n${BLOCK_HEADER}\n\n${plan.rule.line}\n${BLOCK_END}\n`
    content = content.replace(/\s*$/, '\n') + block
  }
  try { fs.writeFileSync(plan.targetFile, content, 'utf8') } catch (e) { return { ok: false, reason: e.message } }
  return { ok: true }
}

// ── Revert a patch (surgical: remove only this signal's line) ─────────────────
export function revertPatch(patchId, reason = 'manual') {
  const patch = db.getTrainingPatch(patchId)
  if (!patch) return { ok: false, reason: 'no-patch' }
  if (patch.status === 'reverted') return { ok: true, alreadyReverted: true }
  const marker = patch.signalId ? `<!-- ${patch.signalId} -->` : null
  if (patch.targetFile && marker) {
    let content
    try { content = fs.readFileSync(patch.targetFile, 'utf8') } catch { content = null }
    if (content && content.includes(marker)) {
      content = content.split('\n').filter((l) => !l.includes(marker)).join('\n')
      // If the block now holds no rule lines, remove the whole block (don't leave an empty husk).
      const blk = readBlock(content)
      if (blk.hasBlock && !blk.inner.split('\n').some((l) => /^\s*-\s/.test(l))) {
        const s = content.indexOf(BLOCK_START)
        const e = content.indexOf(BLOCK_END) + BLOCK_END.length
        content = (content.slice(0, s).replace(/\s*$/, '\n') + '\n' + content.slice(e).replace(/^\s*/, '')).replace(/\n{3,}/g, '\n\n')
      }
      try { fs.writeFileSync(patch.targetFile, content, 'utf8') } catch { /* best-effort */ }
      enqueueReindex(patch.targetFile, 'patch-reverted')
    }
  }
  db.updateTrainingPatch(patchId, {
    status: 'reverted', revertedAt: new Date().toISOString(),
    impact: { ...(patch.impact || {}), revertReason: reason },
  })
  if (patch.signalId) db.updateTrainingSignalStatus(patch.signalId, 'open') // reopen for future reconsideration
  db.logSelfImprovement({ kind: 'patch_reverted', agent: patch.agent, refId: patchId, decision: null, summary: `ROLLBACK · ${patch.agent}: ${reason}`, data: { reason, impact: patch.impact || {} } })
  appendChangelog(`- **${new Date().toISOString()}** · \`reverted\` · **${patch.agent}** · reason: ${reason} · patch:\`${patchId}\``)
  return { ok: true }
}

// ── Human review actions (Phase F: one-click apply/reject from the Brain tab) ─
// A `proposed` patch is the trainer's synthesized-but-not-applied edit. When Yash
// approves it in the Training Review inbox we run the SAME surgical writePatch the
// auto-path uses, then record it as a human-approved application. Reject flips the
// patch to rejected and dismisses the signal so the daily cycle stops re-proposing it.
function planFromStoredPatch(patch) {
  return {
    targetFile: patch.targetFile,
    marker: patch.signalId ? `<!-- ${patch.signalId} -->` : null,
    rule: { line: patch.after_text || '' },
  }
}

export function applyProposedPatch(patchId, opts = {}) {
  const patch = db.getTrainingPatch(patchId)
  if (!patch) return { ok: false, reason: 'no-patch' }
  if (patch.status === 'applied') return { ok: true, alreadyApplied: true, id: patchId }
  if (patch.status !== 'proposed') return { ok: false, reason: `not-proposed (${patch.status})` }
  if (!patch.targetFile) return { ok: false, reason: 'no-target-file' } // unattributable — resolve manually
  if (!patch.signalId) return { ok: false, reason: 'no-signal-id' }     // can't anchor a surgical revert

  const w = writePatch(planFromStoredPatch(patch))
  if (!w.ok) return { ok: false, reason: w.reason || 'write-failed' }

  const cfg = { ...TRAINER_DEFAULTS, ...(opts.cfg || {}) }
  const now = Date.now()
  const allRuns = (() => { try { return db.getRecentAgentRuns(cfg.observeWindowHours) || [] } catch { return [] } })()
  const scoreBefore = scoreFromRuns(agentRunsInWindow(allRuns, patch.agent, now - cfg.observeWindowHours * 3600000, now))
  const appliedAt = new Date().toISOString()
  db.updateTrainingPatch(patchId, { status: 'applied', appliedAt, impact: { ...(patch.impact || {}), scoreBefore, scoreAfter: null, runsObserved: 0, regressionPct: null } })
  if (patch.signalId) db.updateTrainingSignalStatus(patch.signalId, 'patched')
  db.logSelfImprovement({ kind: 'patch_applied', agent: patch.agent, refId: patchId, decision: 'review', summary: `APPROVED (human) · ${patch.patchType} → ${patch.agent}`, data: { signalId: patch.signalId, targetFile: patch.targetFile, scoreBefore, approvedBy: opts.by || 'human' } })
  appendChangelog(`- **${appliedAt}** · \`applied\` · **${patch.agent}** · ${patch.patchType} · human-approved · rollback:\`${patchId}\``)
  enqueueReindex(patch.targetFile, 'patch-approved')
  return { ok: true, id: patchId, alreadyApplied: !!w.alreadyPresent }
}

export function rejectProposedPatch(patchId, opts = {}) {
  const patch = db.getTrainingPatch(patchId)
  if (!patch) return { ok: false, reason: 'no-patch' }
  if (patch.status === 'rejected') return { ok: true, alreadyRejected: true, id: patchId }
  if (patch.status !== 'proposed') return { ok: false, reason: `not-proposed (${patch.status})` }
  db.updateTrainingPatch(patchId, { status: 'rejected' })
  if (patch.signalId) db.updateTrainingSignalStatus(patch.signalId, 'dismissed') // stop re-proposing
  db.logSelfImprovement({ kind: 'decision', agent: patch.agent, refId: patchId, decision: 'reject', summary: `REJECTED (human) · ${patch.patchType} → ${patch.agent}`, data: { signalId: patch.signalId, rejectedBy: opts.by || 'human' } })
  appendChangelog(`- **${new Date().toISOString()}** · \`rejected\` · **${patch.agent}** · human-rejected · patch:\`${patchId}\``)
  return { ok: true, id: patchId }
}

// ── Reindex queue (Phase D.1 drains it; here we only enqueue, best-effort) ────
export function enqueueReindex(sourceRef, reason = 'patch') {
  try {
    fs.mkdirSync(path.dirname(REINDEX_QUEUE), { recursive: true })
    fs.appendFileSync(REINDEX_QUEUE, JSON.stringify({ ts: new Date().toISOString(), ref: sourceRef, reason }) + '\n', 'utf8')
  } catch { /* the 02:30 full reindex is the backstop */ }
}

// ── Changelog (durable human-readable record; mirrors the org/ precedent) ────
function appendChangelog(line) {
  try {
    fs.mkdirSync(ORG_DIR, { recursive: true })
    if (!fs.existsSync(CHANGELOG)) {
      fs.writeFileSync(CHANGELOG, `# Training Changelog — Self-Improving Brain (autonomous)\n\n> Every line is a governed, reversible self-change. Rollback payloads live in \`training_patches.before_text\`.\n\n`, 'utf8')
    }
    fs.appendFileSync(CHANGELOG, line + '\n', 'utf8')
  } catch { /* changelog is a convenience, never block the patch on it */ }
}

// ── Scoring: rolling success-rate from agent_runs (0..1) ─────────────────────
function scoreFromRuns(runs) {
  if (!runs || !runs.length) return null
  const terminal = runs.filter((r) => r.status && r.status !== 'running' && r.status !== 'queued')
  if (!terminal.length) return null
  const ok = terminal.filter((r) => r.status === 'success').length
  return ok / terminal.length
}
function agentRunsInWindow(allRuns, agent, sinceMs, untilMs) {
  return allRuns.filter((r) => {
    if (r.agentName !== agent) return false
    const t = Date.parse(r.timestamp)
    if (Number.isNaN(t)) return false
    return (sinceMs == null || t >= sinceMs) && (untilMs == null || t <= untilMs)
  })
}

// ── The training cycle: open signals → governed patches ──────────────────────
export function runTrainingCycle(opts = {}) {
  const cfg = { ...TRAINER_DEFAULTS, ...(opts.cfg || {}) }
  const apply = opts.apply !== false
  const now = Date.now()
  const cooldownMs = cfg.cooldownHours * 3600000
  const evalCalibrated = ('evalCalibrated' in opts) ? opts.evalCalibrated : isEvalCalibrated()
  const ctx = { evalCalibrated }

  const signalsAll = db.getTrainingSignals({ status: 'open', limit: 500 }) || []
  const signals = opts.onlyAgent ? signalsAll.filter((s) => s.agent === opts.onlyAgent) : signalsAll
  const allRuns = (() => { try { return db.getRecentAgentRuns(cfg.observeWindowHours) || [] } catch { return [] } })()
  const results = { scanned: signals.length, applied: [], proposed: [], rejected: [], skipped: [], evalCalibrated }

  for (const signal of signals) {
    const plan = planPatch(signal)

    // (a) Kinds we don't synthesize a rule for (eval_drop).
    if (plan.skip) { results.skipped.push({ id: signal.id, reason: plan.skip }); continue }

    // (b) Unattributable / missing file → can NEVER auto-apply. Stage to review
    //     (a human routes it) without ever consulting the governor for auto.
    if (plan.unattributable || plan.missing) {
      if (!db.getTrainingPatches({ signalId: signal.id, status: 'proposed', limit: 5 }).length) {
        const { id } = db.insertTrainingPatch({
          agent: signal.agent, signalId: signal.id, patchType: plan.patchType,
          targetFile: plan.targetFile, section: 'Auto-Learned Guardrails',
          before_text: plan.before_text ?? '', after_text: plan.after_text || '',
          decision: 'review', decisionReasons: [plan.unattributable ? 'no-agent-file' : 'agent-file-missing'], status: 'proposed',
        })
        db.logSelfImprovement({ kind: 'decision', agent: signal.agent, refId: signal.id, decision: 'review', summary: `REVIEW · ${plan.patchType} → ${signal.agent} [unattributable]`, data: { patchId: id } })
        results.proposed.push({ id, agent: signal.agent, reason: 'unattributable' })
      } else { results.skipped.push({ id: signal.id, reason: 'already-queued' }) }
      continue
    }

    // (c) Already learned (rule present in the file) → close the signal.
    if (plan.alreadyPresent) {
      db.updateTrainingSignalStatus(signal.id, 'patched')
      results.skipped.push({ id: signal.id, reason: 'already-learned' })
      continue
    }

    // (d) Per-signal de-dup + cooldown guards (idempotent across daily re-runs).
    const existing = db.getTrainingPatches({ signalId: signal.id, limit: 20 })
    if (existing.some((p) => p.status === 'applied')) {
      db.updateTrainingSignalStatus(signal.id, 'patched')
      results.skipped.push({ id: signal.id, reason: 'already-applied' }); continue
    }
    if (existing.some((p) => p.status === 'proposed')) { results.skipped.push({ id: signal.id, reason: 'already-queued' }); continue }
    if (existing.some((p) => p.status === 'reverted' && p.revertedAt && (now - Date.parse(p.revertedAt)) < cooldownMs)) {
      results.skipped.push({ id: signal.id, reason: 'cooldown-after-revert' }); continue
    }

    // (e) Govern: the pure auto/review/reject decision (logs to the timeline).
    const proposal = {
      agent: signal.agent, signalId: signal.id, targetFile: plan.targetFile,
      patchType: plan.patchType, section: 'Auto-Learned Guardrails',
      rollback_content: plan.before_text, after_text: plan.after_text,
      blastRadius: 'single-agent-section',
      signal: { kind: signal.kind, severity: signal.severity, occurrences: signal.occurrences, projects: signal.projects },
    }
    const verdict = govern(proposal, ctx)
    let decision = verdict.decision
    const reasons = [...verdict.reasons]

    // (f) Gentle pacing: ≤1 auto-apply per agent per 48h (unless P0). A second
    //     auto for the same agent in-window downgrades to review.
    if (decision === 'auto' && signal.severity !== 'p0') {
      const lastApplied = db.getTrainingPatches({ agent: signal.agent, status: 'applied', limit: 50 })
        .filter((p) => p.appliedAt).sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt))[0]
      if (lastApplied && (now - Date.parse(lastApplied.appliedAt)) < cooldownMs) { decision = 'review'; reasons.push('agent-48h-cooldown') }
    }

    // (g) Persist the patch row + act on the decision.
    const base = {
      agent: signal.agent, signalId: signal.id, patchType: plan.patchType,
      targetFile: plan.targetFile, section: 'Auto-Learned Guardrails',
      before_text: plan.before_text, after_text: plan.after_text,
      decision, decisionReasons: reasons,
    }

    if (decision === 'reject') {
      const { id } = db.insertTrainingPatch({ ...base, status: 'rejected' })
      results.rejected.push({ id, agent: signal.agent, reasons }); continue
    }

    if (decision === 'review' || !apply) {
      const { id } = db.insertTrainingPatch({ ...base, status: 'proposed' })
      results.proposed.push({ id, agent: signal.agent, reasons }); continue
    }

    // decision === 'auto' (apply mode): write the edit, then record it.
    const { id } = db.insertTrainingPatch({ ...base, status: 'proposed' })
    const w = writePatch(plan)
    if (!w.ok) {
      db.logSelfImprovement({ kind: 'decision', agent: signal.agent, refId: signal.id, decision: 'review', summary: `AUTO→deferred · write failed (${w.reason}) → ${signal.agent}`, data: { patchId: id, reason: w.reason } })
      results.proposed.push({ id, agent: signal.agent, reasons: [...reasons, `write-failed:${w.reason}`] }); continue
    }
    const appliedAt = new Date().toISOString()
    const scoreBefore = scoreFromRuns(agentRunsInWindow(allRuns, signal.agent, now - cfg.observeWindowHours * 3600000, now))
    db.updateTrainingPatch(id, { status: 'applied', appliedAt, impact: { scoreBefore, scoreAfter: null, runsObserved: 0, regressionPct: null } })
    db.updateTrainingSignalStatus(signal.id, 'patched')
    db.logSelfImprovement({ kind: 'patch_applied', agent: signal.agent, refId: id, decision: 'auto', summary: `APPLIED · ${plan.patchType} → ${signal.agent}: "${String(signal.signature).slice(0, 60)}"`, data: { signalId: signal.id, targetFile: plan.targetFile, scoreBefore } })
    appendChangelog(`- **${appliedAt}** · \`applied\` · **${signal.agent}** · ${plan.patchType} · ${signal.kind} · seen ${signal.occurrences}×/${(signal.projects || []).length}proj · rollback:\`${id}\``)
    enqueueReindex(plan.targetFile, 'patch-applied')
    results.applied.push({ id, agent: signal.agent, signature: signal.signature })
  }

  return results
}

// ── Impact measurement + auto-rollback (run after a settling window) ─────────
export function measureAndRollback(opts = {}) {
  const cfg = { ...TRAINER_DEFAULTS, ...(opts.cfg || {}) }
  const now = Date.now()
  const minObserveMs = cfg.minObserveHours * 3600000
  const appliedAll = db.getTrainingPatches({ status: 'applied', limit: 500 }) || []
  const applied = opts.onlyAgent ? appliedAll.filter((p) => p.agent === opts.onlyAgent) : appliedAll
  const allRuns = (() => { try { return db.getRecentAgentRuns(cfg.observeWindowHours) || [] } catch { return [] } })()
  const out = { measured: [], reverted: [], waiting: [] }

  for (const patch of applied) {
    if (!patch.appliedAt) { out.waiting.push({ id: patch.id, reason: 'no-appliedAt' }); continue }
    const appliedMs = Date.parse(patch.appliedAt)
    if (now - appliedMs < minObserveMs) { out.waiting.push({ id: patch.id, reason: 'settling' }); continue }

    const runsAfter = agentRunsInWindow(allRuns, patch.agent, appliedMs, now)
    if (runsAfter.length < cfg.minRunsForImpact) {
      db.updateTrainingPatch(patch.id, { status: 'applied', appliedAt: patch.appliedAt, impact: { ...(patch.impact || {}), runsObserved: runsAfter.length } })
      out.waiting.push({ id: patch.id, reason: `insufficient-runs(${runsAfter.length}/${cfg.minRunsForImpact})` }); continue
    }
    const scoreAfter = scoreFromRuns(runsAfter)
    let scoreBefore = patch.impact && typeof patch.impact.scoreBefore === 'number' ? patch.impact.scoreBefore : null
    if (scoreBefore == null) scoreBefore = scoreFromRuns(agentRunsInWindow(allRuns, patch.agent, appliedMs - cfg.observeWindowHours * 3600000, appliedMs))
    const regressionPct = (scoreBefore != null && scoreBefore > 0 && scoreAfter != null) ? (scoreBefore - scoreAfter) / scoreBefore : 0
    db.updateTrainingPatch(patch.id, { status: 'applied', appliedAt: patch.appliedAt, impact: { scoreBefore, scoreAfter, runsObserved: runsAfter.length, regressionPct: Number(regressionPct.toFixed(3)) } })
    out.measured.push({ id: patch.id, agent: patch.agent, scoreBefore, scoreAfter, regressionPct: Number(regressionPct.toFixed(3)) })

    if (regressionPct > cfg.regressionThreshold) {
      revertPatch(patch.id, `measured-regression ${(regressionPct * 100).toFixed(0)}% (before ${scoreBefore?.toFixed?.(2)} → after ${scoreAfter?.toFixed?.(2)}, n=${runsAfter.length})`)
      out.reverted.push({ id: patch.id, agent: patch.agent, regressionPct: Number(regressionPct.toFixed(3)) })
    }
  }
  return out
}

// Convenience for the scheduled handler: one cycle + one measurement pass.
export function runTrainerPass(opts = {}) {
  const cycle = runTrainingCycle(opts)
  const impact = measureAndRollback(opts)
  return { cycle, impact }
}

export { brainSignals }
