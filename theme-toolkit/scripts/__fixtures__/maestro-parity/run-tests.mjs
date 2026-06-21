#!/usr/bin/env node
// Self-test for #48 — CLI↔Workflow parity CONTRACT. The CLI (maestro-run → runMaestroLoop) and the
// Workflow (.claude/wf-maestro-loop.mjs) drive the SAME per-surface loop, but the WF sandbox can't
// import the shared core, so it re-implements the loop inline → it can DRIFT. This pins the exact
// outcome contract both must honor: the per-surface status rules (PASS on a passing judge, FAIL after
// maxRounds, error on a draft/render throw) + the aggregate shape {converged, escalated, allPass,
// surfaces:[{surface,status,rounds}], decisions}. wf-maestro-loop.mjs returns that shape (its line ~115)
// and MUST mirror these rules; if runMaestroLoop's contract changes here, update the WF to match.
// Run (Node 20): node scripts/__fixtures__/maestro-parity/run-tests.mjs · Exit 0 = all pass.

import { runMaestroLoop, MAESTRO_MAX_ROUNDS } from '../../lib/maestro-loop.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('runMaestroLoop — the contract the WF mirrors')
eq(MAESTRO_MAX_ROUNDS, 3, 'shared max rounds = 3 (WF default MAX must match)')

const deps = {
  // home passes round 1; pdp never passes (→ escalate after maxRounds); cart's draft throws (→ error)
  draft: async (s) => (s === 'cart' ? { ok: false, error: 'consultant unavailable' } : { ok: true }),
  render: async () => ({ ok: true, url: 'http://x' }),
  judge: async (s) => (s === 'home' ? { pass: true, confidence: 92, findings: [] } : { pass: false, confidence: 60, findings: [{ check: 'hero', severity: 'blocker', fix_owner: 'loom', evidence: 'weak' }] }),
}
const r = await runMaestroLoop(deps, { surfaces: ['home', 'pdp', 'cart'], maxRounds: 3 })

console.log('aggregate shape')
eq(r.converged, ['home'], 'converged = [home]')
eq(r.escalated.sort(), ['cart', 'pdp'], 'escalated = [cart, pdp]')
eq(r.allPass, false, 'allPass=false when any escalates')
eq(Array.isArray(r.surfaces) && r.surfaces.length === 3, true, 'surfaces[] has one entry per surface')
eq(Array.isArray(r.decisions), true, 'decisions[] present (carried-mind ledger)')

console.log('per-surface outcome rules')
const by = Object.fromEntries(r.surfaces.map(s => [s.surface, s]))
eq(by.home.status, 'PASS', 'passing judge → PASS')
eq(by.home.rounds, 1, 'PASS on round 1 stops the loop')
eq(by.pdp.status, 'FAIL', 'never-passing surface → FAIL')
eq(by.pdp.rounds, 3, 'FAIL only after maxRounds (escalate, never loop forever)')
eq(by.pdp.findings.length >= 1, true, 'FAIL carries the last findings (routed to the next redraft)')
eq(by.cart.status, 'error', 'draft throw/ok:false → error status')

console.log(failures === 0 ? '\n✓ MAESTRO-PARITY — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
