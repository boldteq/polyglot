// Maestro Loop — the control logic (maestro-build-protocol.md §1). Pure + dependency-injected so it
// is hermetically testable (maestro-dryrun.mjs) WITHOUT a live store / claude CLI / theme dev. The
// production Workflow wires the real draft (consultant agent), render (theme:push), judge
// (lens:surface), record (build-state) into these same injection points; the algorithm is identical
// and proven by the harness — that's the stop-gate before the Workflow runs on a real build.
//
// The loop, per surface: draft → render → judge(see) → if FAIL route findings + redraft (≤maxRounds)
// → PASS records the surface to build-state and advances. ≤3 rounds then ESCALATE (never loop
// forever). A surface that throws is recorded 'error' and the loop continues (one bad surface does
// not sink the build). The carried mind (build-state) is updated via the injected `record`.
//
// No external deps, no Date.now()/Math.random() (determinism). Node 20 ESM.

export const MAESTRO_MAX_ROUNDS = 3

// deps = {
//   draft(surface, round, ctx) -> { ok, edits?, error? }    consult drape/ink/lattice WITH build-state
//   render(surface, ctx)       -> { ok, url?, error? }      theme:push to the single linked theme
//   judge(surface, ctx)        -> { pass, findings:[{check,severity,fix_owner,evidence}], confidence }
//   record(surface, verdict, info)                          build-state record (carried-mind write)
//   log(msg)                                                progress line (optional)
// }
// opts = { maxRounds=3, surfaces:[...] }
export async function runMaestroLoop(deps, opts = {}) {
  const { draft, render, judge, record = () => {}, log = () => {} } = deps
  const maxRounds = opts.maxRounds ?? MAESTRO_MAX_ROUNDS
  const surfaces = opts.surfaces || []
  if (typeof draft !== 'function' || typeof render !== 'function' || typeof judge !== 'function') {
    throw new Error('runMaestroLoop: draft/render/judge must be functions')
  }

  const results = []
  const ctx = { decisions: [] } // accumulating cross-surface coherence ledger (the carried mind)

  for (const surface of surfaces) {
    let round = 0
    let outcome = null // { status, rounds, findings? }
    while (round < maxRounds) {
      round += 1
      log(`[${surface}] round ${round}/${maxRounds}: draft`)
      let d
      try { d = await draft(surface, round, ctx) } catch (e) { outcome = { status: 'error', rounds: round, error: `draft: ${e.message}` }; break }
      if (d && d.ok === false) { outcome = { status: 'error', rounds: round, error: `draft: ${d.error || 'draft failed'}` }; break }
      // a draft may surface a cross-surface decision to carry forward
      if (d && Array.isArray(d.decisions)) for (const dec of d.decisions) if (!ctx.decisions.includes(dec)) ctx.decisions.push(dec)

      let r
      try { r = await render(surface, ctx) } catch (e) { outcome = { status: 'error', rounds: round, error: `render: ${e.message}` }; break }
      if (r && r.ok === false) { outcome = { status: 'error', rounds: round, error: `render: ${r.error || 'render failed'}` }; break }
      if (r && r.url) ctx.previewUrl = r.url

      log(`[${surface}] round ${round}: judge (lens)`)
      let v
      try { v = await judge(surface, ctx) } catch (e) { outcome = { status: 'error', rounds: round, error: `judge: ${e.message}` }; break }

      if (v && v.pass) { outcome = { status: 'PASS', rounds: round, confidence: v.confidence }; break }

      // FAIL — route findings by fix_owner for the next round's draft (carried in ctx)
      ctx.lastFindings = (v && v.findings) || []
      log(`[${surface}] round ${round}: FAIL — ${ctx.lastFindings.length} finding(s); ${round < maxRounds ? 'redraft' : 'escalate'}`)
      if (round >= maxRounds) { outcome = { status: 'FAIL', rounds: round, findings: ctx.lastFindings }; break }
    }
    if (!outcome) outcome = { status: 'FAIL', rounds: round, findings: ctx.lastFindings || [] }

    const verdict = outcome.status === 'PASS' ? 'PASS' : outcome.status === 'error' ? 'FAIL' : 'FAIL'
    try { record(surface, verdict, outcome) } catch { /* recording is best-effort; never sinks the loop */ }
    results.push({ surface, ...outcome })
  }

  const converged = results.filter(r => r.status === 'PASS').map(r => r.surface)
  const escalated = results.filter(r => r.status !== 'PASS').map(r => r.surface)
  return {
    converged, escalated,
    allPass: escalated.length === 0,
    surfaces: results,
    decisions: ctx.decisions,
  }
}
