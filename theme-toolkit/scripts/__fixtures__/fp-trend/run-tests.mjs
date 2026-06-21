#!/usr/bin/env node
// Self-test for #2 — fp-trend aggregator (aggregateFpTrend + flaps).
//   • flaps: counts cleared-then-returned transitions in a chronological presence array.
//   • aggregate: per-gate runs/blocks/warns/waives; flags gates with waive-rate > threshold OR a
//     blocker id that flaps ≥2× (both FP proxies).
// Run (Node 20): node scripts/__fixtures__/fp-trend/run-tests.mjs · Exit 0 = all pass.

import { aggregateFpTrend, flaps } from '../../fp-trend.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('flaps — cleared-then-returned transitions')
eq(flaps([true, true, true]), 0, 'always present → 0')
eq(flaps([false, false]), 0, 'never present → 0')
eq(flaps([true, false, false]), 0, 'fixed once, stays fixed → 0')
eq(flaps([true, false, true]), 1, 'present→cleared→returned → 1')
eq(flaps([true, false, true, false, true]), 2, 'flapping twice → 2')

console.log('aggregateFpTrend — waive-rate + flap flags')
{
  const records = [
    { gates: { lighthouse: { blockers: [{ id: 'lcp' }], warnings: [], waived: false }, axe: { blockers: [], warnings: [{ id: 'w' }], waived: false } } },
    { gates: { lighthouse: { blockers: [], warnings: [], waived: true }, axe: { blockers: [], warnings: [], waived: false } } },
    { gates: { lighthouse: { blockers: [], warnings: [], waived: true }, axe: { blockers: [], warnings: [], waived: false } } },
    { gates: { lighthouse: { blockers: [{ id: 'lcp' }], warnings: [], waived: false } } },
  ]
  const { gates, flagged } = aggregateFpTrend(records, { threshold: 0.10, minRuns: 3 })
  eq(gates.lighthouse.runs, 4, 'lighthouse seen in 4 runs')
  eq(gates.lighthouse.waivedRuns, 2, 'lighthouse waived in 2 runs')
  eq(gates.lighthouse.waiveRate, 0.5, 'lighthouse waiveRate 0.5')
  flagged.some(f => f.gate === 'lighthouse') ? pass('lighthouse flagged (waiveRate 50% > 10%)') : fail(`lighthouse not flagged: ${JSON.stringify(flagged)}`)
  !flagged.some(f => f.gate === 'axe') ? pass('axe not flagged (no waives, no flaps)') : fail('axe wrongly flagged')
}
{
  // a blocker id that flaps ≥2× is flagged even with zero waives
  const r = (present) => ({ gates: { seo: { blockers: present ? [{ id: 'meta' }] : [], warnings: [], waived: false } } })
  const records = [r(true), r(false), r(true), r(false), r(true)] // meta presence flaps twice
  const { gates, flagged } = aggregateFpTrend(records, { threshold: 0.10, minRuns: 3 })
  gates.seo.flappers.some(x => x.id === 'meta' && x.flaps >= 2) ? pass('seo "meta" flap detected (≥2)') : fail(`flapper missing: ${JSON.stringify(gates.seo.flappers)}`)
  flagged.some(f => f.gate === 'seo') ? pass('seo flagged on flapping finding') : fail('seo not flagged on flap')
}
{
  // below minRuns → waive-rate not yet judged (avoid flagging on 1-2 noisy runs)
  const { flagged } = aggregateFpTrend([{ gates: { x: { blockers: [], warnings: [], waived: true } } }], { threshold: 0.10, minRuns: 3 })
  !flagged.length ? pass('single waived run not flagged (below minRuns)') : fail(`flagged too early: ${JSON.stringify(flagged)}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
