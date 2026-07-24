// Hermetic end-to-end proof of the self-improving brain loop.
//
//   perception (aggregator) → decision (governor) → action (trainer auto-patch)
//   → consequence (forced regression) → auto-rollback   + 7 safety gates.
//
// FULLY ISOLATED: a throwaway $HOME (redirects every agent .md, the changelog and
// the reindex queue the trainer writes) + a throwaway POLYGLOT_DB_PATH. Nothing real
// is touched. Drives the REAL functions (no re-implementation). Exits non-zero on any
// failed assertion. Run:  HOME stays overridden inside — just `node scripts/brain-proof.mjs`.

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ── Isolation: set BEFORE the first require of db.js / import of trainer.mjs ──
const STAMP = `${process.pid}-${Date.now()}`
const TMP = path.join(os.tmpdir(), `brainproof-${STAMP}`)
const TMP_HOME = path.join(TMP, 'home')
const TMP_DB = path.join(TMP, 'polyglot.db')
fs.mkdirSync(path.join(TMP_HOME, '.claude', 'agents'), { recursive: true })
process.env.HOME = TMP_HOME
process.env.USERPROFILE = TMP_HOME
process.env.POLYGLOT_DB_PATH = TMP_DB

const require = createRequire(import.meta.url)
const db = require('../src/db.js')
const brainSignals = require('../src/lib/brainSignals.js')
const governor = await import('../src/intelligence/governor.mjs')
const trainer = await import('../src/intelligence/trainer.mjs')

// ── Tiny assertion harness ────────────────────────────────────────────────────
const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const isoAgo = (h) => new Date(Date.now() - h * 3600000).toISOString()
const b64 = (p) => Buffer.from(p).toString('base64')
const PROJ_A = b64('/Users/test/ProjAlpha') // decodeProject → "ProjAlpha"
const PROJ_B = b64('/Users/test/ProjBeta')  //               → "ProjBeta"
const ERR = 'TypeError cannot read property of undefined in handler module'
let RID = 0
function run({ agent, status, error = null, proj, agoH }) {
  db.insertAgentRun({
    id: `r-${RID++}`, agentName: agent, prompt: 'do work', source: 'test',
    timestamp: isoAgo(agoH), duration: 1000, status,
    promptChars: 7, outputChars: 10, estimatedTokens: 5, estimatedCost: 0,
    error, metadata: { projectId: proj },
  })
}

const AGENT = '_brainproof_zz'        // has a .md → attributable → auto-patchable
const NOFILE = '_brainproof_nofile'   // NO .md → must NEVER auto-apply
const REINDEX_QUEUE = path.join(TMP_HOME, '.claude', 'memory', '.brain', 'reindex-queue.jsonl')
const readQueue = () => { try { return fs.readFileSync(REINDEX_QUEUE, 'utf8') } catch { return '' } }
const agentMd = path.join(TMP_HOME, '.claude', 'agents', `${AGENT}.md`)

try {
  console.log(`\n▶ Hermetic brain proof  (home=${TMP_HOME})\n`)

  // A real agent .md so the trainer has a file to surgically edit.
  fs.writeFileSync(agentMd,
    `---\nname: ${AGENT}\ndescription: hermetic proof agent\nmodel: claude-sonnet-4-6\n---\n\n# Proof Agent\nBody text that must never be touched by the machine block.\n`)

  // ── Seed history (all pre-patch runs are >31h old; appliedAt will be 30h) ────
  for (let i = 0; i < 12; i++) run({ agent: AGENT, status: 'success', proj: PROJ_A, agoH: 200 - i * 12 }) // 200..68h
  run({ agent: AGENT, status: 'error', error: ERR, proj: PROJ_A, agoH: 60 })
  run({ agent: AGENT, status: 'error', error: ERR, proj: PROJ_A, agoH: 55 })
  run({ agent: AGENT, status: 'error', error: ERR, proj: PROJ_B, agoH: 50 }) // → 3×/2proj
  run({ agent: NOFILE, status: 'error', error: ERR, proj: PROJ_A, agoH: 48 })
  run({ agent: NOFILE, status: 'error', error: ERR, proj: PROJ_A, agoH: 46 })
  run({ agent: NOFILE, status: 'error', error: ERR, proj: PROJ_B, agoH: 44 }) // → 3×/2proj

  console.log('1) PERCEPTION — cross-project aggregator')
  const agg = brainSignals.detectCrossProjectSignals({ windowDays: 30, minOccurrences: 3, minProjects: 2 })
  const open = db.getTrainingSignals({ status: 'open', limit: 100 })
  const sigZ = open.find((s) => s.agent === AGENT)
  const sigN = open.find((s) => s.agent === NOFILE)
  check('aggregator emitted a signal for the attributable agent', !!sigZ)
  check('signal is failure_cluster at the auto bar (≥3× / ≥2 proj)',
    sigZ && sigZ.kind === 'failure_cluster' && sigZ.occurrences >= 3 && sigZ.projects.length >= 2,
    sigZ && `occ=${sigZ.occurrences} proj=${sigZ.projects.length} sev=${sigZ.severity}`)
  check('aggregator also surfaced the no-.md agent signal', !!sigN)
  check('first-detection logged a "signal" event to the timeline',
    db.getSelfImprovementLog({ kind: 'signal', limit: 50 }).length >= 2)

  console.log('\n2) DECISION — governor (pure) routes the strong signal to AUTO')
  const proposalZ = {
    agent: AGENT, signalId: sigZ.id, targetFile: agentMd, patchType: 'anti_pattern',
    rollback_content: '', after_text: '- rule', blastRadius: 'single-agent-section',
    signal: { kind: sigZ.kind, severity: sigZ.severity, occurrences: sigZ.occurrences, projects: sigZ.projects },
  }
  const dZ = governor.decide(proposalZ, { evalCalibrated: true })
  check('governor → AUTO for strong+rollback+single-section+calibrated', dZ.decision === 'auto', dZ.reasons.join(','))

  console.log('\n3) ACTION — trainer auto-applies (real surgical edit + rollback armed)')
  const cycle = trainer.runTrainingCycle({ apply: true, evalCalibrated: true, cfg: { observeWindowHours: 504 } })
  const applied = cycle.applied.find((a) => a.agent === AGENT)
  const proposedNoFile = cycle.proposed.find((p) => p.agent === NOFILE)
  check('trainer auto-APPLIED the attributable agent', !!applied)
  const md1 = fs.readFileSync(agentMd, 'utf8')
  check('agent .md now carries the machine-managed guardrail block',
    md1.includes('BOLDTEQ-AUTOLEARN:START') && md1.includes('🚫 **Avoid:**') && md1.includes(`<!-- ${sigZ.id} -->`))
  check('hand-authored prose was left untouched', md1.includes('must never be touched by the machine block'))
  const patchZ = db.getTrainingPatches({ agent: AGENT, limit: 10 })[0]
  check('patch row is applied, has rollback_content + scoreBefore captured',
    patchZ && patchZ.status === 'applied' && patchZ.before_text === '' &&
    patchZ.impact && Math.abs((patchZ.impact.scoreBefore ?? 0) - 0.8) < 0.001,
    patchZ && `status=${patchZ.status} scoreBefore=${patchZ.impact?.scoreBefore}`)
  check('a "patch_applied" decision=auto event hit the timeline',
    db.getSelfImprovementLog({ kind: 'patch_applied', limit: 10 }).some((e) => e.decision === 'auto'))
  check('reindex was queued for the patched file (memory-alive trigger)',
    readQueue().includes(AGENT) && readQueue().includes('patch-applied'))

  console.log('\n4) SAFETY — the no-.md signal can NEVER auto-apply')
  check('unattributable signal staged to REVIEW, not applied',
    !!proposedNoFile && !cycle.applied.some((a) => a.agent === NOFILE),
    proposedNoFile && proposedNoFile.reason)

  console.log('\n5) CONSEQUENCE — force a regression → auto-rollback fires')
  // Backdate the patch so it has "settled", then seed post-patch failures only.
  db.updateTrainingPatch(patchZ.id, {
    status: 'applied', appliedAt: isoAgo(30),
    impact: { scoreBefore: 0.8, scoreAfter: null, runsObserved: 0, regressionPct: null },
  })
  for (let i = 0; i < 6; i++) run({ agent: AGENT, status: 'error', error: ERR, proj: PROJ_A, agoH: 28 - i * 3 }) // 28..13h (after appliedAt)
  const impact = trainer.measureAndRollback({
    onlyAgent: AGENT,
    cfg: { minObserveHours: 24, minRunsForImpact: 5, observeWindowHours: 504, regressionThreshold: 0.10 },
  })
  check('auto-rollback reverted the regressed patch', impact.reverted.some((r) => r.id === patchZ.id),
    JSON.stringify(impact.reverted[0] || impact.measured[0] || {}))
  const md2 = fs.readFileSync(agentMd, 'utf8')
  check('guardrail line removed from .md on revert', !md2.includes(`<!-- ${sigZ.id} -->`))
  check('block husk cleaned up (no empty AUTOLEARN block left)', !md2.includes('BOLDTEQ-AUTOLEARN:START'))
  const patchZ2 = db.getTrainingPatch(patchZ.id)
  check('patch row marked reverted', patchZ2.status === 'reverted')
  check('signal re-opened for future reconsideration',
    db.getTrainingSignals({ status: 'open', limit: 100 }).some((s) => s.id === sigZ.id))
  check('"patch_reverted" event logged', db.getSelfImprovementLog({ kind: 'patch_reverted', limit: 10 }).length >= 1)
  check('reindex re-queued after revert', readQueue().includes('patch-reverted'))

  console.log('\n6) SAFETY GATES — governor invariants (pure)')
  const strongValid = { rollback_content: '', blastRadius: 'single-agent-section', signal: { kind: 'failure_cluster', occurrences: 4, projects: ['a', 'b'] } }
  check('feedback.md patchType is ALWAYS review (constitution human-only)',
    governor.decide({ ...strongValid, patchType: 'feedback', signal: { kind: 'yash_correction', severity: 'p0' } }, { evalCalibrated: true }).decision === 'review')
  check('a targetFile named feedback.md is ALWAYS review',
    governor.decide({ ...strongValid, targetFile: '/x/feedback.md', signal: { kind: 'yash_correction', severity: 'p0' } }, { evalCalibrated: true }).decision === 'review')
  check('miscalibrated judge BLOCKS auto → review',
    governor.decide(strongValid, { evalCalibrated: false }).decision === 'review')
  check('no rollback_content → REJECT (can\'t undo it)',
    governor.decide({ blastRadius: 'single-agent-section', signal: { kind: 'yash_correction', severity: 'p0' } }, { evalCalibrated: true }).decision === 'reject')
  check('below evidence bar (1×) → review',
    governor.decide({ rollback_content: '', blastRadius: 'single-agent-section', signal: { kind: 'failure_cluster', occurrences: 1, projects: ['a'] } }, { evalCalibrated: true }).decision === 'review')
  check('positive control: strong+valid+calibrated → auto',
    governor.decide(strongValid, { evalCalibrated: true }).decision === 'auto')
  check('behavior_drift signal yields NO rule → never auto-patches a .md',
    trainer.ruleLineFor({ id: 'x', kind: 'behavior_drift' }) === null)
  check('eval_drop signal yields NO rule (Witness owns it)',
    trainer.ruleLineFor({ id: 'x', kind: 'eval_drop' }) === null)
  check('live calibration read on empty eval history is fail-safe FALSE',
    governor.isEvalCalibrated() === false)

  console.log('\n7) FLEET IMPACT — eval_scores measures a patch where sparse agent_runs would starve')
  // audit gap 7 / P4.3: per-agent agent_runs volume is thin (why 0/17 patches were ever measured).
  // eval_scores (build fleet + sales, GRADED) is dense. Same sparse data: runs-only starves, eval reverts.
  const EVAL_AGENT = '_brainproof_eval'
  const EVAL_SIG = 'sig-eval-regression'
  fs.writeFileSync(path.join(TMP_HOME, '.claude', 'agents', `${EVAL_AGENT}.md`),
    `---\nname: ${EVAL_AGENT}\ndescription: fleet-impact proof agent\nmodel: claude-sonnet-4-6\n---\n\n# Eval Agent\n`)
  const scoreOf = (agent, overall, agoH, i) => db.recordEvalScore({ agent, taskType: 'build', overall, pass: overall >= 0.7, ts: isoAgo(agoH), dedupKey: `${agent}:${overall}:${agoH}:${i}` })
  const { id: patchE } = db.insertTrainingPatch({
    agent: EVAL_AGENT, signalId: EVAL_SIG, patchType: 'anti_pattern',
    targetFile: path.join(TMP_HOME, '.claude', 'agents', `${EVAL_AGENT}.md`),
    before_text: '', after_text: '- rule', status: 'applied', appliedAt: isoAgo(30),
    impact: { scoreBefore: 0.9, scoreBeforeSignal: 'eval', scoreAfter: null, runsObserved: 0, regressionPct: null },
  })
  // sparse post-patch runs (2 < minRunsForImpact 5) + dense post-patch evals (4 ≥ minEvalsForImpact 3), all a regression
  run({ agent: EVAL_AGENT, status: 'success', proj: PROJ_A, agoH: 20 })
  run({ agent: EVAL_AGENT, status: 'error', error: ERR, proj: PROJ_A, agoH: 18 })
  for (let i = 0; i < 4; i++) scoreOf(EVAL_AGENT, 0.2, 22 - i * 3, i) // 22..13h ago, overall 0.2 (down from 0.9)

  const CFG = { minObserveHours: 24, minRunsForImpact: 5, minEvalsForImpact: 3, observeWindowHours: 504, regressionThreshold: 0.10 }
  // (a) runs-only (eval channel disabled) → the OLD behaviour: 2 runs < 5 → starves in `waiting`
  const starve = trainer.measureAndRollback({ onlyAgent: EVAL_AGENT, cfg: { ...CFG, minEvalsForImpact: 9999 } })
  check('runs-only STARVES on sparse volume (the old 0/17 failure): patch stuck in waiting, not measured',
    starve.waiting.some((w) => w.id === patchE) && !starve.measured.some((m) => m.id === patchE),
    JSON.stringify(starve.waiting[0] || {}))
  // (b) eval channel ON → measures via the graded fleet signal + reverts the regression
  const fleet = trainer.measureAndRollback({ onlyAgent: EVAL_AGENT, cfg: CFG })
  const measuredE = fleet.measured.find((m) => m.id === patchE)
  check('eval channel MEASURES the same patch (fleet volume unblocks it)', !!measuredE, JSON.stringify(measuredE || fleet.waiting[0] || {}))
  check('measured via the "eval" signal, not agent_runs', measuredE && measuredE.signal === 'eval', measuredE && `signal=${measuredE.signal}`)
  check('regression caught (0.9 → 0.2) → auto-reverted via the fleet signal', fleet.reverted.some((r) => r.id === patchE),
    JSON.stringify(fleet.reverted[0] || measuredE || {}))
  check('reverted patch row persisted', db.getTrainingPatch(patchE).status === 'reverted')

  // ── Verdict ────────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.length - passed
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed}/${results.length} assertions green${failed ? `, ${failed} FAILED` : ''}`)
  process.exitCode = failed === 0 ? 0 : 1
} catch (e) {
  console.error('\n💥 proof threw:', e && e.stack ? e.stack : e)
  process.exitCode = 2
} finally {
  try { db.close && db.close() } catch {}
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {}
  console.log(`(cleaned up ${TMP})`)
}
