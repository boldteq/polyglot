#!/usr/bin/env node
// Self-test for #9 (planJudge — fresh/cached/budget partition) + #12 (effectiveChecks — mobile overlay).
// Run (Node 20): node scripts/__fixtures__/lens-judge/run-tests.mjs · Exit 0 = all pass.

import { planJudge, effectiveChecks } from '../../lens-judge.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('planJudge — #9 cache + budget partition')
{
  const items = [{ id: 1, cached: true }, { id: 2, cached: false }, { id: 3, cached: false }, { id: 4, cached: false }]
  const a = planJudge(items, { maxFresh: 0 })
  eq([a.fresh.length, a.cached.length, a.skipped.length], [3, 1, 0], 'unlimited budget → 3 fresh, 1 cached, 0 skipped')
  const b = planJudge(items, { maxFresh: 2 })
  eq([b.fresh.length, b.cached.length, b.skipped.length], [2, 1, 1], 'budget 2 → 2 fresh, 1 cached, 1 skipped')
  eq(planJudge(null, {}), { fresh: [], cached: [], skipped: [] }, 'null items → empty partition')
}

console.log('effectiveChecks — #12 mobile overlay merge')
{
  const rubric = { checks: [{ id: 'base' }], mobile_overlay: [{ id: 'tap-target' }] }
  eq(effectiveChecks(rubric, { viewport: 'mobile' }).map(c => c.id), ['base', 'tap-target'], 'mobile viewport → base + overlay')
  eq(effectiveChecks(rubric, { viewport: 'desktop' }).map(c => c.id), ['base'], 'desktop viewport → base only')
  eq(effectiveChecks(rubric, { width: 375 }).map(c => c.id), ['base', 'tap-target'], 'width ≤600 → mobile (overlay)')
  eq(effectiveChecks(rubric, { viewport: '375x812' }).map(c => c.id), ['base', 'tap-target'], 'dims with 375 → mobile')
  eq(effectiveChecks({ checks: [{ id: 'base' }] }, { viewport: 'mobile' }).map(c => c.id), ['base'], 'no overlay defined → base only on mobile')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
