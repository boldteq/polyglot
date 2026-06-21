#!/usr/bin/env node
// Self-test for #4 — page-rhythm (analyzeRhythm, the pure core of check-section-cohesion's page-level
// cadence checks). Operates on the same per-section computed shape the gate extracts in the browser.
// Run (Node 20): node scripts/__fixtures__/section-rhythm/run-tests.mjs · Exit 0 = all pass.

import { analyzeRhythm } from '../../check-section-cohesion.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ids = (f) => new Set(f.map(x => x.id))

console.log('analyzeRhythm — heading step-down monotonicity')
{
  // an H3 rendering larger than the page's H2 = inverted hierarchy
  const f = analyzeRhythm([
    { headingTag: 'H2', headingPx: 24, padTop: 40, padBottom: 40 },
    { headingTag: 'H3', headingPx: 30, padTop: 40, padBottom: 40 },
  ], { surface: 'home' })
  ids(f).has('rhythm.heading-not-monotonic') ? pass('H3 > H2 → heading-not-monotonic') : fail(`monotonic: ${[...ids(f)]}`)
}
{
  const f = analyzeRhythm([
    { headingTag: 'H1', headingPx: 48, padTop: 60, padBottom: 60 },
    { headingTag: 'H2', headingPx: 32, padTop: 60, padBottom: 60 },
    { headingTag: 'H3', headingPx: 24, padTop: 60, padBottom: 60 },
  ], { surface: 'home' })
  !ids(f).has('rhythm.heading-not-monotonic') ? pass('h1>h2>h3 → no monotonicity finding') : fail(`false monotonic: ${[...ids(f)]}`)
}

console.log('analyzeRhythm — vertical-padding cadence')
{
  // one section with 5× the others' vertical padding breaks cadence
  const f = analyzeRhythm([
    { padTop: 40, padBottom: 40 },
    { padTop: 40, padBottom: 40 },
    { padTop: 200, padBottom: 200 },
  ], { surface: 'home' })
  ids(f).has('rhythm.padding-cadence') ? pass('outlier padding → padding-cadence') : fail(`cadence: ${[...ids(f)]}`)
}
{
  const f = analyzeRhythm([
    { padTop: 60, padBottom: 60 },
    { padTop: 60, padBottom: 60 },
    { padTop: 64, padBottom: 56 },
  ], { surface: 'home' })
  !ids(f).has('rhythm.padding-cadence') ? pass('even paddings → no cadence finding') : fail(`false cadence: ${[...ids(f)]}`)
}

console.log('analyzeRhythm — guards')
{
  // chrome sections excluded; <2 content sections → no findings
  const f = analyzeRhythm([{ isChrome: true, headingTag: 'H3', headingPx: 99 }, { headingTag: 'H1', headingPx: 40 }], { surface: 'home' })
  f.length === 0 ? pass('chrome excluded + <2 content → no findings') : fail(`guard: ${JSON.stringify(f)}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
