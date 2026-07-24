#!/usr/bin/env node
// Self-test for lens-read-eval.mjs — the screenshot-reading accuracy scorer.
// The vision CALL needs claude; the SCORING math is pure and tested here, offline.
//   (a) all agree            → accuracy 100%, 0 disagreements
//   (b) some miss            → accuracy reflects only the misses, disagreements listed with truth+read
//   (c) unavailable reads    → excluded from the denominator (never inflate or deflate the %)
//   (d) nothing scorable     → accuracy null, NOT a fake 100%
//   (e) an out-of-vocab read → treated as unavailable (not scored), not a silent agree
//
// Run: node scripts/__fixtures__/lens-read-eval/run-tests.mjs   ·   Exit: 0 all pass · 1 a case failed
import { scoreReads } from '../../lens-read-eval.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const near = (a, b) => Math.abs(a - b) < 1e-9

console.log('case (a) all reads agree → 100%')
{
  const r = scoreReads([
    { name: 'x', truth: 'slideshow', read: 'slideshow' },
    { name: 'y', truth: 'accordion', read: 'accordion' },
  ])
  near(r.accuracy, 1) ? pass('accuracy 1.0') : fail(`accuracy=${r.accuracy}`)
  r.disagreements.length === 0 ? pass('0 disagreements') : fail(`${r.disagreements.length} disagreements`)
}

console.log('case (b) one miss of two scored → 50%, the miss is named with truth+read')
{
  const r = scoreReads([
    { name: 'hero', truth: 'slideshow', read: 'image-banner', confidence: 70 },
    { name: 'faq', truth: 'accordion', read: 'accordion' },
  ])
  near(r.accuracy, 0.5) ? pass('accuracy 0.5') : fail(`accuracy=${r.accuracy}`)
  r.disagreements.length === 1 && r.disagreements[0].truth === 'slideshow' && r.disagreements[0].read === 'image-banner'
    ? pass('the disagreement carries both truth and read (the image-banner-vs-slideshow miss)')
    : fail(`disagreement wrong: ${JSON.stringify(r.disagreements)}`)
}

console.log('case (c) an unavailable read is excluded from the denominator')
{
  const r = scoreReads([
    { name: 'a', truth: 'slideshow', read: 'slideshow' },
    { name: 'b', truth: 'accordion', read: null }, // vision could not run
  ])
  r.scored === 1 ? pass('scored counts only the read that happened') : fail(`scored=${r.scored}`)
  r.unavailable === 1 ? pass('the unavailable one is tracked separately') : fail(`unavailable=${r.unavailable}`)
  near(r.accuracy, 1) ? pass('accuracy is over the scored set only (100%), not diluted by the skip') : fail(`accuracy=${r.accuracy}`)
}

console.log('case (d) nothing scorable → accuracy null, never a fake 100%')
{
  const r = scoreReads([{ name: 'a', truth: 'slideshow', read: null }])
  r.accuracy === null ? pass('accuracy is null, not 1.0 (a run that measured nothing must not read as perfect)') : fail(`accuracy=${r.accuracy}`)
}

console.log('case (e) an out-of-vocabulary read is not counted as an agreement')
{
  const r = scoreReads([{ name: 'a', truth: 'slideshow', read: 'not-a-real-archetype' }])
  r.scored === 0 ? pass('a garbage read is excluded, not scored') : fail(`scored=${r.scored}`)
  r.accuracy === null ? pass('accuracy null (nothing valid to score)') : fail(`accuracy=${r.accuracy}`)
}

console.log(failures === 0 ? '\n  lens-read-eval: ALL CASES PASS' : `\n  lens-read-eval: ${failures} CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
