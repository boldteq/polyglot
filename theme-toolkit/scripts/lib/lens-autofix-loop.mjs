// Lens autofix LOOP control (#3 — find→fix→verify, end-to-end + hermetically proven). Pure +
// dependency-injected so the convergence/escalation/no-retry behavior is testable WITHOUT a live store
// or claude CLI (mirrors lib/maestro-loop.mjs). lens-autofix.mjs wires the real capture→judge→enforce
// pass + the owner dispatches into these injection points; the algorithm is identical and proven by
// __fixtures__/autofix-loop. Node 20 ESM, no deps.
import { diffOutcomes, findingKey } from './lens-fix-outcomes.mjs'

export const AUTOFIX_DEFAULT_OWNERS = new Set(['loom', 'drape', 'ink', 'conduit'])

// deps = {
//   runRound(affected) -> { enforcePass:bool, findings:[{check,surface,viewport,fix_owner,evidence}] }
//       ONE capture→judge→enforce pass; enforcePass=true when gate #18 is clean (converged).
//   fix(owner, findings) -> Promise        dispatch a CODE owner to edit theme files (loom/drape/ink/conduit)
//   fixPorter(findings) -> Promise         dispatch porter for STORE-DATA findings (opt-in)
//   recordOutcomes(round, diff) -> void    persist the fix-outcomes diff (learning)
//   log(msg)
// }
// opts = { maxRounds=3, codeOwners=AUTOFIX_DEFAULT_OWNERS, porterOptIn=false, persisted=Set, affected=null }
// → { converged, rounds, escalation: null | { giveUp, data, findings }, affected }
export async function runAutofixLoop(deps, opts = {}) {
  const { runRound, fix, fixPorter = async () => {}, recordOutcomes = () => {}, log = () => {} } = deps
  if (typeof runRound !== 'function' || typeof fix !== 'function') throw new Error('runAutofixLoop: runRound + fix must be functions')
  const maxRounds = opts.maxRounds ?? 3
  const codeOwners = opts.codeOwners ?? AUTOFIX_DEFAULT_OWNERS
  const persisted = opts.persisted ?? new Set()
  const porterOptIn = !!opts.porterOptIn
  let affected = opts.affected ?? null
  let prevFindings = []

  for (let round = 1; round <= maxRounds; round += 1) {
    log(`autofix round ${round}/${maxRounds}: capture → judge → enforce`)
    const { enforcePass, findings = [] } = await runRound(affected)
    if (enforcePass) { log(`converged in ${round} round(s)`); return { converged: true, rounds: round, escalation: null } }

    // fix-outcomes learning: classify last round's findings; a finding that PERSISTED after a fix is
    // not retried with the same approach (escalate it instead of looping the same edit).
    const diff = diffOutcomes(prevFindings, findings)
    recordOutcomes(round, diff)
    for (const o of diff) if (o.result === 'persisted') persisted.add(`${o.check}::${o.surface}::${o.viewport || ''}`)
    prevFindings = findings

    const code = findings.filter(f => codeOwners.has(f.fix_owner))
    const data = findings.filter(f => !codeOwners.has(f.fix_owner)) // porter / store-data
    const giveUp = code.filter(f => persisted.has(findingKey(f)))    // already tried + failed
    const retryable = code.filter(f => !persisted.has(findingKey(f)))
    affected = [...new Set(findings.map(f => f.surface))]

    // nothing NEW to try → escalate (give-ups + store-data, unless porter opted in)
    if (!retryable.length && !(data.length && porterOptIn)) {
      const esc = [...giveUp, ...data]
      return { converged: false, rounds: round, escalation: { giveUp, data, findings: esc.length ? esc : findings }, affected }
    }

    const byOwner = {}
    for (const f of retryable) (byOwner[f.fix_owner] = byOwner[f.fix_owner] || []).push(f)
    for (const [owner, list] of Object.entries(byOwner)) { log(`fix → ${owner}: ${list.length}`); await fix(owner, list) }
    if (data.length && porterOptIn) { log(`fix → porter: ${data.length}`); await fixPorter(data) }

    // BUG-16 + BUG-18: the FINAL round's fix must be re-verified — the old loop escalated immediately after
    // applying the last edit, so a fix that actually CONVERGED was reported "not converged". And the verify
    // is FULL (runRound(null) = all surfaces), not scoped to `affected`: an in-loop fix is only re-captured
    // on its own surface, so a fix that REGRESSED a previously-passing surface would otherwise ship unseen.
    // The terminal full pass confirms the WHOLE rendered store agrees (and writes a complete manifest).
    if (round >= maxRounds) {
      log(`round ${round} fix applied — terminal FULL re-verify (all surfaces; was previously escalated blind / partial)`)
      const final = await runRound(null)
      if (final.enforcePass) { log(`converged after the round-${round} fix`); return { converged: true, rounds: round, escalation: null } }
      const finalFindings = final.findings && final.findings.length ? final.findings : findings
      return { converged: false, rounds: round, escalation: { giveUp, data, findings: finalFindings }, affected }
    }
  }
  return { converged: false, rounds: maxRounds, escalation: { findings: prevFindings }, affected }
}
