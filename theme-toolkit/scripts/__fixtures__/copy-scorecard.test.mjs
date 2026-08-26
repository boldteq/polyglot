#!/usr/bin/env node
// Hermetic self-test for check-copy-scorecard.mjs (#58) — Quill's 9-check surface scorecard + the
// hero-formula brief helper (#23, merged from #26 on 2026-08-25).
//
// MOCKING: instead of building 8 fixture theme roots + spawning the gate for each shape case, we
// drive the exported pure helpers directly (`extractSectionCopy` for the one liquid-parse case,
// `scoreCopy` for the seven copy-struct cases, `heroFormulaDeclared` for the brief case). The gate's
// header explicitly documents these as importable — the header calls them "Pure helpers … exported
// so a fixture can drive them without spawning." No fs, no subprocess, no HOME env — a full run
// costs <100ms. The sibling fixture __fixtures__/copy-quality/run-tests.mjs already covers the
// end-to-end fixture-dir + spawn path for the brief-level checks.
//
// A small VOCAB is passed to scoreCopy (mocking what loadSlopVocab returns from
// ~/.claude/memory/content/ai-slop-vocab.md) so check 8 (banned-word) can be exercised
// deterministically — the fixture asserts against terms it names itself, never against whatever the
// real slop vocab currently contains.
//
// Run (Node 20): node scripts/__fixtures__/copy-scorecard.test.mjs · Exit 0 = pass.

import assert from 'node:assert/strict'
import {
  extractSectionCopy,
  scoreCopy,
  heroFormulaDeclared,
  wordCount,
} from '../check-copy-scorecard.mjs'

// Mocked slop vocab — only the two lists the scorecard scans (padding_phrase is intentionally warn-
// only in check-ai-tells and excluded from check 8 by design).
const VOCAB = {
  hollow_verb: ['elevate', 'discover', 'unlock', 'transform'],
  hollow_adjective: ['premium', 'meticulously', 'seamless'],
  padding_phrase: [],
}

let failures = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

// Score a hero built from raw liquid (extraction pipeline exercised).
const scoreHero = (liquid) => scoreCopy('hero', extractSectionCopy(liquid), VOCAB)

// ── 1. good-copy ─────────────────────────────────────────────────────────────
// 8-word hero with a concrete "%" number and no banned words → all 9 checks pass, score = 9.
test('good-copy: hero "15% Vitamin C serum, results in 4 weeks" → score 9', () => {
  const liquid = '<section><h1>15% Vitamin C serum, results in 4 weeks</h1></section>'
  const { score, failed } = scoreHero(liquid)
  assert.equal(score, 9, `expected 9/9, got ${score}/9 (failed: ${failed.join(', ') || 'none'})`)
  assert.deepEqual(failed, [], `expected no failed checks, got: ${failed.join(', ')}`)
})

// ── 2. slop-copy ─────────────────────────────────────────────────────────────
// "Elevate … discover premium quality" is the archetype AI-slop hero: banned verbs + banned
// adjective + zero specificity. Expect check 8 (banned) + check 9 (no-number) to fail, score ≤ 6.
test('slop-copy: hero "Elevate … discover premium quality" → banned>0, no number, score ≤ 6', () => {
  const liquid = '<section><h1>Elevate your morning routine, discover premium quality</h1></section>'
  const { score, failed } = scoreHero(liquid)
  assert.ok(score <= 6, `expected score ≤ 6, got ${score}/9 (failed: ${failed.join(', ')})`)
  assert.ok(
    failed.some((f) => f.startsWith('banned-word:')),
    `expected a banned-word:* failure, got: ${failed.join(', ')}`,
  )
  assert.ok(
    failed.includes('no-number-unit-in-hero-headline'),
    `expected no-number-unit-in-hero-headline, got: ${failed.join(', ')}`,
  )
})

// ── 3. too-long-hero ─────────────────────────────────────────────────────────
// >8-word headline. Trailing "in 4 weeks" keeps check 9 passing so the FAIL isolates to check 1.
test('too-long-hero: 16-word headline → hero-headline check fails', () => {
  const headline = 'This is a very long hero headline that exceeds eight words in length in 4 weeks'
  assert.ok(wordCount(headline) > 8, `sanity: expected >8 words, got ${wordCount(headline)}`)
  const { failed } = scoreHero(`<section><h1>${headline}</h1></section>`)
  assert.ok(
    failed.some((f) => f.startsWith('hero-headline-')),
    `expected hero-headline-*-over-8 failure, got: ${failed.join(', ')}`,
  )
})

// ── 4. too-long-subhead ──────────────────────────────────────────────────────
// A 30+ word subhead on the PDP surface. Drive scoreCopy with a copy struct — extractSectionCopy
// routes <p> to `body`, and no HTML tag maps to `subheads`, so an in-memory struct is the cleanest
// way to isolate check 2.
test('too-long-subhead: 35-word subhead → subhead check fails', () => {
  const copy = {
    headings: [],
    subheads: [
      'This subhead intentionally runs on and on and on with many many words to blow past the twenty five word limit that Quill set for the second of nine checks in the scorecard rubric today',
    ],
    ctas: [],
    body: [],
  }
  const { failed } = scoreCopy('pdp', copy, VOCAB)
  assert.ok(
    failed.some((f) => f.startsWith('subhead-')),
    `expected subhead-*-over-25 failure, got: ${failed.join(', ')}`,
  )
})

// ── 5. too-long-cta ──────────────────────────────────────────────────────────
// An 8-word CTA on the PDP surface → check 3 fails. Empty headings/body/subheads means checks
// 1/4/5/6/7 all silently pass (no input) so the FAIL isolates to check 3.
test('too-long-cta: 8-word CTA → cta check fails', () => {
  const copy = {
    headings: [],
    subheads: [],
    ctas: ['Add this item to my cart right now'],
    body: [],
  }
  const { failed } = scoreCopy('pdp', copy, VOCAB)
  assert.ok(
    failed.some((f) => f.startsWith('cta-')),
    `expected cta-*-over-4 failure, got: ${failed.join(', ')}`,
  )
})

// ── 6. missing-specificity ───────────────────────────────────────────────────
// "Shop now" is the classic vague hero — 2 words, no % / $ / mg / weeks / etc → check 9 fails.
test('missing-specificity: hero "Shop now" → no-number-unit check fails', () => {
  const { failed } = scoreHero('<section><h1>Shop now</h1></section>')
  assert.ok(
    failed.includes('no-number-unit-in-hero-headline'),
    `expected no-number-unit-in-hero-headline, got: ${failed.join(', ')}`,
  )
})

// ── 7. passive-voice-heavy ───────────────────────────────────────────────────
// Five consecutive passive sentences (be-verb + past-participle) → passiveRatio = 100% → check 5
// fails. Body-only copy on the PDP surface avoids tripping check 1 (hero-only).
test('passive-voice-heavy: 5-of-5 passive sentences → passive check fails', () => {
  const passiveBody =
    'The product was designed for daily use. It is loved by our customers. Every batch is tested by our team. The formula was crafted with care. Results are proven by studies.'
  const copy = { headings: [], subheads: [], ctas: [], body: [passiveBody] }
  const { failed } = scoreCopy('pdp', copy, VOCAB)
  assert.ok(
    failed.some((f) => f.startsWith('passive-')),
    `expected passive-*-pct-ge-10 failure, got: ${failed.join(', ')}`,
  )
})

// ── 8. long-sentences ────────────────────────────────────────────────────────
// A single 25-word sentence → avgSentenceLength = 25 → check 6 fails. Other checks may or may not
// also trip (FK may fail on the same input) — the assertion is scoped to check 6 only.
test('long-sentences: 25-word avg sentence → avg-sentence check fails', () => {
  const longSentence =
    'Our carefully written product delivers exceptional results for customers who care deeply about quality and want the very best in every category available today period.'
  const copy = { headings: [], subheads: [], ctas: [], body: [longSentence] }
  const { failed } = scoreCopy('pdp', copy, VOCAB)
  assert.ok(
    failed.some((f) => f.startsWith('avg-sentence-')),
    `expected avg-sentence-*-over-20 failure, got: ${failed.join(', ')}`,
  )
})

// ── hero-formula (brief-level, #23, merged from #26) ─────────────────────────
// The scorecard requires a hero brief to declare BOTH `hero_formula:` and a citation
// (`hero_citation:` OR `Decoder:`). heroFormulaDeclared is the pure predicate that drives it.
test('hero-formula: declared iff formula + citation both present', () => {
  const withCitation = 'hero_formula: problem-promise\nhero_citation: Ritual homepage 2026-08\n'
  const withDecoder = 'hero_formula: identity\nDecoder: Aesop\n'
  const noCitation = 'hero_formula: problem-promise\n\nsome body copy without a citation source'
  const noFormula = 'random brief with no hero declaration at all'
  assert.equal(heroFormulaDeclared(withCitation), true, 'formula + hero_citation → true')
  assert.equal(heroFormulaDeclared(withDecoder), true, 'formula + Decoder → true')
  assert.equal(heroFormulaDeclared(noCitation), false, 'formula without citation → false')
  assert.equal(heroFormulaDeclared(noFormula), false, 'neither → false')
})

// ── runner ───────────────────────────────────────────────────────────────────
for (const c of cases) {
  try { c.fn(); pass(c.name) }
  catch (e) { fail(`${c.name} — ${e.message}`) }
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
