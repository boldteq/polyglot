#!/usr/bin/env node
// Self-test for lib/library-search.mjs — hermetic. Injects a 5-card in-memory corpus via
// searchLibrary(query, { corpus, nichePack }) so nothing here reads the on-disk 142-card
// library. Style mirrors the CLI-gate fixtures (price-binding / secret-scan): plain
// node assert + PASS/FAIL lines + exit 0 = all pass.
//
// Run: node scripts/__fixtures__/library-search.test.mjs

import assert from 'node:assert/strict'
import { searchLibrary } from '../lib/library-search.mjs'

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }

// ─── in-memory corpus ────────────────────────────────────────────────────────
// Card shape mirrors parseCard() output: cardId · path · title · concept · category ·
// sectionFamily · matches[] · nicheInclude[] · nicheExclude[] · body.
const CORPUS = [
  {
    cardId: 'hero-slideshow-classic',
    path: 'hero/hero-slideshow-classic.md',
    title: 'Hero Slideshow — Classic',
    concept: 'hero-slideshow',
    category: 'hero',
    sectionFamily: 'Hero & Above-the-Fold',
    matches: ['slideshow', 'hero-slideshow', 'pagination-dots', 'full-bleed'],
    nicheInclude: [],
    nicheExclude: [],
    body: 'A classic hero slideshow with pagination-dots and full-bleed imagery.',
  },
  {
    cardId: 'hero-static-plain',
    path: 'hero/hero-static-plain.md',
    title: 'Hero Static — Plain',
    concept: 'hero-static',
    category: 'hero',
    sectionFamily: 'Hero & Above-the-Fold',
    matches: ['static-hero', 'single-image-hero'],
    nicheInclude: [],
    nicheExclude: [],
    body: 'A single-image hero for brands that prefer stillness over motion.',
  },
  {
    cardId: 'pdp-buybox-simple',
    path: 'pdp/pdp-buybox-simple.md',
    title: 'PDP Buybox — Simple',
    concept: 'pdp-buybox',
    category: 'pdp',
    sectionFamily: 'Product Detail',
    matches: ['buy-box', 'atc', 'product-form'],
    nicheInclude: [],
    nicheExclude: [],
    body: 'A minimal PDP buybox with price, variants, and add-to-cart.',
  },
  {
    cardId: 'pdp-buybox-haircare',
    path: 'pdp/pdp-buybox-haircare.md',
    title: 'PDP Buybox — Haircare',
    concept: 'pdp-buybox',
    category: 'pdp',
    sectionFamily: 'Product Detail',
    matches: ['buy-box', 'atc', 'ingredient-callout'],
    nicheInclude: ['haircare'],
    nicheExclude: [],
    body: 'A PDP buybox tuned for haircare: hair-type filter, key ingredients, subscribe-and-save.',
  },
  {
    cardId: 'featured-collection-grid',
    path: 'collection/featured-collection-grid.md',
    title: 'Featured Collection — Grid',
    concept: 'featured-collection',
    category: 'collection',
    sectionFamily: 'Collections & Grids',
    matches: ['collection-grid', 'product-grid'],
    nicheInclude: [],
    nicheExclude: ['haircare'],
    body: 'A responsive featured-collection grid.',
  },
]

// helper: does a card mention any of the given keywords across its metadata?
function cardMentions(cardId, keywords) {
  const c = CORPUS.find((x) => x.cardId === cardId)
  if (!c) return false
  const hay = [c.cardId, c.concept, c.category, c.sectionFamily, ...(c.matches || []), c.body]
    .join(' ')
    .toLowerCase()
  return keywords.some((k) => hay.includes(String(k).toLowerCase()))
}

// ─── 1. exact-archetype-match ────────────────────────────────────────────────
console.log('library-search — exact archetype match')
{
  const out = searchLibrary({ archetype: 'hero-slideshow' }, { corpus: CORPUS, nichePack: null })
  try {
    assert.ok(Array.isArray(out.results) && out.results.length > 0, 'expected at least one result')
    const top = out.results[0]
    assert.equal(top.cardId, 'hero-slideshow-classic', `top cardId; got "${top.cardId}"`)
    assert.ok(
      cardMentions(top.cardId, ['hero', 'slideshow']),
      `top card should mention "hero" or "slideshow" in its metadata`,
    )
    ok(`top for {archetype:"hero-slideshow"} is ${top.cardId} (score ${top.score})`)
  } catch (e) { bad(`exact-archetype: ${e.message}`) }
}

// ─── 2. niche-affinity ───────────────────────────────────────────────────────
console.log('library-search — niche affinity outranks a plain match')
{
  const out = searchLibrary(
    { archetype: 'pdp-buybox', niche: 'haircare' },
    { corpus: CORPUS, nichePack: null }, // no pack — pure nicheInclude affinity path
  )
  try {
    assert.ok(out.results.length >= 2, 'expected at least two buybox results')
    const ids = out.results.map((r) => r.cardId)
    const haircareIdx = ids.indexOf('pdp-buybox-haircare')
    const plainIdx = ids.indexOf('pdp-buybox-simple')
    assert.ok(haircareIdx !== -1 && plainIdx !== -1, `both buybox cards should rank; got ${JSON.stringify(ids)}`)
    assert.ok(
      haircareIdx < plainIdx,
      `haircare card must outrank plain card; got haircareIdx=${haircareIdx} plainIdx=${plainIdx}`,
    )
    ok(`pdp-buybox-haircare outranks pdp-buybox-simple for niche=haircare`)
  } catch (e) { bad(`niche-affinity: ${e.message}`) }
}

// ─── 3. must-have boost ──────────────────────────────────────────────────────
console.log('library-search — must-have keywords boost the right card')
{
  const out = searchLibrary(
    { archetype: 'hero', mustHave: ['pagination-dots', 'full-bleed'] },
    { corpus: CORPUS, nichePack: null },
  )
  try {
    assert.ok(out.results.length >= 1, 'expected at least one hero result')
    const top = out.results[0]
    assert.equal(top.cardId, 'hero-slideshow-classic', `top cardId; got "${top.cardId}"`)
    assert.ok(
      cardMentions(top.cardId, ['pagination-dots', 'full-bleed']),
      `top card must mention at least one of the must-haves in its metadata`,
    )
    // Belt-and-suspenders: assert the "+3 must-have" evidence rows are present on the top result.
    const whyText = (top.why || []).join(' ').toLowerCase()
    assert.ok(
      whyText.includes('must-have "pagination-dots"') || whyText.includes('must-have "full-bleed"'),
      `top result's "why" should record a +3 must-have hit; got: ${JSON.stringify(top.why)}`,
    )
    ok(`must-have keywords boosted hero-slideshow-classic (score ${top.score})`)
  } catch (e) { bad(`must-have-boost: ${e.message}`) }
}

// ─── 4. empty corpus ─────────────────────────────────────────────────────────
console.log('library-search — empty corpus returns no results')
{
  try {
    const out = searchLibrary({ archetype: 'hero-slideshow' }, { corpus: [], nichePack: null })
    assert.ok(Array.isArray(out.results), 'results must be an array')
    assert.equal(out.results.length, 0, `empty corpus must yield []; got length ${out.results.length}`)
    assert.equal(out.corpusSize, 0, `corpusSize must be 0; got ${out.corpusSize}`)
    ok('empty corpus → results = []')
  } catch (e) { bad(`empty-corpus: ${e.message}`) }
}

// ─── 5. malformed input ──────────────────────────────────────────────────────
// Task spec: "searchLibrary(null) or ({archetype:''}) → returns [] gracefully (no crash)".
// We test BOTH shapes. The empty-archetype path is well-defined and must return [].
// The null-query path is a defensive-input probe: if the module doesn't handle it, this
// fixture will FAIL and expose the gap.
console.log('library-search — malformed input handled gracefully')
{
  try {
    const out = searchLibrary({ archetype: '' }, { corpus: CORPUS, nichePack: null })
    assert.ok(Array.isArray(out.results), 'results must be an array')
    assert.equal(out.results.length, 0, `{archetype:""} must yield []; got length ${out.results.length}`)
    ok('{archetype:""} → results = []')
  } catch (e) { bad(`malformed {archetype:""}: ${e.message}`) }

  let out, threw
  try { out = searchLibrary(null, { corpus: CORPUS, nichePack: null }) }
  catch (e) { threw = e }
  if (threw) {
    bad(`searchLibrary(null) threw instead of returning gracefully: ${threw.message}`)
  } else if (!out || !Array.isArray(out.results) || out.results.length !== 0) {
    bad(`searchLibrary(null) should yield {results:[]}; got ${JSON.stringify(out)}`)
  } else {
    ok('searchLibrary(null) → results = []')
  }
}

console.log(failures === 0 ? '\n✓ LIBRARY-SEARCH — ALL ASSERTIONS PASS' : `\n✗ ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
