#!/usr/bin/env node
// Self-test for #3 — the Lens autofix LOOP (runAutofixLoop), find→fix→verify end-to-end. Drives the
// pure core with mock effects (no live store / claude) to prove: converges when a fix lands; escalates
// after maxRounds; never retries a fix that already failed (persisted); routes store-data to porter
// (opt-in) and defers it otherwise. Run (Node 20): node scripts/__fixtures__/autofix-loop/run-tests.mjs · Exit 0.

import { runAutofixLoop } from '../../lib/lens-autofix-loop.mjs'
import { findingKey } from '../../lib/lens-fix-outcomes.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const f = (over = {}) => ({ check: 'hero', surface: 'home', viewport: 'mobile', fix_owner: 'loom', evidence: 'x', ...over })

console.log('A — converges when the fix lands (fail round 1 → fix → pass round 2)')
{
  let n = 0
  const fixed = []
  const r = await runAutofixLoop({
    runRound: () => { n += 1; return n === 1 ? { enforcePass: false, findings: [f()] } : { enforcePass: true, findings: [] } },
    fix: async (owner) => fixed.push(owner),
  }, { maxRounds: 3 })
  r.converged && r.rounds === 2 && JSON.stringify(fixed) === '["loom"]' ? pass('converged round 2 after a loom fix') : fail(`got ${JSON.stringify({ c: r.converged, rounds: r.rounds, fixed })}`)
}

console.log('B — escalates after maxRounds (distinct finding each round → never persists)')
{
  let n = 0
  let fixCount = 0
  const r = await runAutofixLoop({
    runRound: () => { n += 1; return { enforcePass: false, findings: [f({ check: `hero${n}` })] } },
    fix: async () => { fixCount += 1 },
  }, { maxRounds: 3 })
  !r.converged && r.rounds === 3 && fixCount === 3 && (r.escalation?.findings || []).length >= 1 ? pass('3 rounds, 3 fixes, then escalate') : fail(`got ${JSON.stringify({ c: r.converged, rounds: r.rounds, fixCount })}`)
}

console.log('C — never retries a pre-persisted finding (give-up → escalate round 1, 0 fixes)')
{
  let fixCount = 0
  const persisted = new Set([findingKey(f())])
  const r = await runAutofixLoop({
    runRound: () => ({ enforcePass: false, findings: [f()] }),
    fix: async () => { fixCount += 1 },
  }, { maxRounds: 3, persisted })
  !r.converged && fixCount === 0 && r.rounds === 1 && (r.escalation?.giveUp || []).length === 1 ? pass('persisted finding not retried → escalate round 1') : fail(`got ${JSON.stringify({ rounds: r.rounds, fixCount, giveUp: r.escalation?.giveUp?.length })}`)
}

console.log('D — store-data finding, porter opt-OUT → deferred (no fix, no porter), escalate')
{
  let fixCount = 0
  let porterCount = 0
  const r = await runAutofixLoop({
    runRound: () => ({ enforcePass: false, findings: [f({ check: 'empty-collection', surface: 'collection', fix_owner: 'porter' })] }),
    fix: async () => { fixCount += 1 },
    fixPorter: async () => { porterCount += 1 },
  }, { maxRounds: 3, porterOptIn: false })
  !r.converged && fixCount === 0 && porterCount === 0 && (r.escalation?.data || []).length === 1 ? pass('porter finding deferred (opt-out) → escalate') : fail(`got ${JSON.stringify({ fixCount, porterCount, data: r.escalation?.data?.length })}`)
}

console.log('E — store-data finding, porter opt-IN → fixPorter dispatched each round')
{
  let porterCount = 0
  const r = await runAutofixLoop({
    runRound: () => ({ enforcePass: false, findings: [f({ check: 'empty-collection', surface: 'collection', fix_owner: 'porter' })] }),
    fix: async () => {},
    fixPorter: async () => { porterCount += 1 },
  }, { maxRounds: 2, porterOptIn: true })
  !r.converged && porterCount === 2 && r.rounds === 2 ? pass('porter dispatched each round (opt-in)') : fail(`got ${JSON.stringify({ porterCount, rounds: r.rounds })}`)
}

console.log('F — BUG-16: a fix that lands on the FINAL round is re-verified → converged (was escalated blind)')
{
  let n = 0
  const r = await runAutofixLoop({
    // fail rounds 1..3 (distinct, never persists); the TERMINAL re-verify after round 3's fix passes
    runRound: () => { n += 1; return n <= 3 ? { enforcePass: false, findings: [f({ check: `hero${n}` })] } : { enforcePass: true, findings: [] } },
    fix: async () => {},
  }, { maxRounds: 3 })
  r.converged && r.rounds === 3 ? pass('final-round fix re-verified → converged at round 3') : fail(`got ${JSON.stringify({ c: r.converged, rounds: r.rounds })}; expected converged:true rounds:3`)
}

console.log('guards')
{
  let threw = false
  try { await runAutofixLoop({ fix: async () => {} }, {}) } catch { threw = true }
  threw ? pass('missing runRound → throws') : fail('no throw on missing runRound')
}

console.log(failures === 0 ? '\n✓ AUTOFIX-LOOP — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
