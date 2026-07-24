#!/usr/bin/env node
// Self-test for scripts/dna/bulk-extract.mjs — the PURE half only.
//
// Deliberately OFFLINE: no network, no chromium. bulk-extract keeps its browser work behind a dynamic
// `import('playwright')` inside measureAll(), so importing the module here costs nothing and the three
// things that can silently rot — input validation, the card format, and the ≥3-card promotion rule —
// are all testable in-process. The live DOM read is not mocked; a fake DOM would only test the fake.
//
// Run (Node 20): node scripts/__fixtures__/dna-extract/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import {
  validateBrands, promotionVerdict, isEvidenceCard, renderCard, summarize, sourceLine,
  nameRatio, slug, SURFACES, PROMOTION_MIN_CARDS,
} from '../../dna/bulk-extract.mjs'

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }
const ok = (cond, msg) => (cond ? pass(msg) : fail(msg))

// ── (a) input-schema validation ───────────────────────────────────────────────
console.log('case (a) brands input schema')
{
  const good = [
    { brand: 'Amika', url: 'https://www.loveamika.com/', surface: 'home' },
    { brand: 'Prose', url: 'https://prose.com/products/x', surface: 'pdp' },
  ]
  const r = validateBrands(good)
  ok(r.errors.length === 0 && r.brands.length === 2, `valid input accepted (errors=${r.errors.length})`)

  ok(validateBrands({}).errors.some(e => /must be a JSON array/.test(e)), 'non-array rejected')
  ok(validateBrands([]).errors.some(e => /empty/.test(e)), 'empty array rejected')
  ok(validateBrands([{ url: 'https://a.com', surface: 'home' }]).errors.some(e => /"brand" is required/.test(e)), 'missing brand rejected')
  ok(validateBrands([{ brand: 'A', surface: 'home' }]).errors.some(e => /"url" is required/.test(e)), 'missing url rejected')
  ok(validateBrands([{ brand: 'A', url: 'notaurl', surface: 'home' }]).errors.some(e => /http\(s\) URL/.test(e)), 'non-http url rejected')
  ok(validateBrands([{ brand: 'A', url: 'https://a.com', surface: 'collection' }]).errors.some(e => /must be one of/.test(e)), 'unknown surface rejected')
  const dup = validateBrands([
    { brand: 'A', url: 'https://a.com', surface: 'home' },
    { brand: 'a', url: 'https://a.com/2', surface: 'home' },
  ])
  ok(dup.errors.some(e => /duplicate brand\+surface/.test(e)), 'duplicate brand+surface rejected')
  ok(SURFACES.join(',') === 'home,pdp', 'surface vocabulary is home|pdp')
}

// ── (b) the ≥3-converging-cards promotion rule ────────────────────────────────
console.log('case (b) promotion rule (≥3 sourced non-draft cards)')
{
  const sourced = (n) => ({ name: `${n}.md`, text: `# ${n}\n**Inspected:** 2026-07-23 · **Source:** live DOM extraction\n` })
  const draft = (n) => ({ name: `${n}.md`, text: `# ${n}\n**Status:** DRAFT — machine-extracted\n**Inspected:** 2026-07-23 · **Source:** live DOM extraction\n` })
  const unsourced = (n) => ({ name: `${n}.md`, text: `# ${n}\nNo provenance at all.\n` })

  ok(PROMOTION_MIN_CARDS === 3, 'threshold is 3')

  const three = promotionVerdict([sourced('a'), sourced('b'), sourced('c')])
  ok(three.eligible && three.calibration === 'tuned' && three.evidence === 3, `3 sourced → eligible (${three.evidence} evidence)`)

  const two = promotionVerdict([sourced('a'), sourced('b')])
  ok(!two.eligible && two.calibration === 'draft', '2 sourced → NOT eligible')

  // the exact failure this rule exists to catch: enough FILES, not enough EVIDENCE
  const mixed = promotionVerdict([sourced('a'), draft('b'), unsourced('c'), sourced('d')])
  ok(mixed.cards === 4 && mixed.evidence === 2 && !mixed.eligible, `4 files but 2 evidence → NOT eligible (draft=${mixed.draft})`)

  // index/template files are not cards
  const withIndex = promotionVerdict([sourced('a'), sourced('b'), sourced('c'), { name: '_index.md', text: '**Source:** x' }])
  ok(withIndex.cards === 3, '_-prefixed files are not counted as cards')

  ok(!isEvidenceCard({ name: 'a.txt', text: '**Source:** x' }), 'non-.md is not a card')
  ok(isEvidenceCard({ name: 'a.md', text: 'Source: live site' }), 'unbolted "Source:" line still counts')
  ok(!isEvidenceCard({ name: 'a.md', text: '**Source:**\n' }), 'empty Source: does not count')
}

// ── (c) card rendering matches the template contract ──────────────────────────
console.log('case (c) card rendering')
{
  const raw = {
    title: 'Amika',
    headingFont: 'Gelica', headingWeight: '500', headingSize: 60, headingSerif: true,
    bodyFont: 'Gelica', bodySize: 16,
    fontSizes: [16, 20, 25, 31.25],
    sectionPads: [12, 40, 64, 80, 80],
    backgrounds: { 'rgb(207, 225, 189)': 4, 'rgb(255, 255, 255)': 2 },
    buttons: [{ bg: 'rgb(176, 199, 250)', color: 'rgb(0, 0, 0)', radius: '4px' }],
    imgRatios: [0.8, 0.79, 0.8], imgAltPct: 100, imgExplicitWhPct: 92,
    lineLengthCh: 68.4, carouselLib: false,
    components: { reviews: true, faq: true, bundle: false },
  }
  const m = summarize(raw)
  ok(m.dominantRatio === 1.25, `dominant type ratio computed (${m.dominantRatio})`)
  ok(m.distinctSizes === 4, 'distinct size count computed')
  ok(JSON.stringify(m.rhythmBand) === '[40,80]', `rhythm band excludes sub-24px padding (${JSON.stringify(m.rhythmBand)})`)
  ok(m.density === 'comfortable', `density derived from the band (${m.density})`)
  ok(m.schemeCount === 2, 'background schemes counted as USED')
  ok(m.singleFamily === true, 'single-family type system detected')
  ok(m.headingStyle === 'serif', 'heading style from the declared generic fallback')
  ok(m.imageRatio && m.imageRatio.label === '4:5', `dominant image ratio named (${m.imageRatio && m.imageRatio.label})`)
  ok(JSON.stringify(m.components) === '["reviews","faq"]', 'only truthy components listed')

  ok(nameRatio(1.0).label === '1:1' && nameRatio(1.78).label === '16:9', 'named ratios snap to common photographic ratios')
  ok(nameRatio(2.6).kind === 'irregular', 'a ratio near nothing common is reported as irregular, not snapped')
  ok(slug('CPG Food!') === 'cpg-food', 'slug is kebab-lowercase')

  const date = '2026-07-23'
  const card = renderCard({ brand: 'Amika', url: 'https://www.loveamika.com/', surface: 'home', niche: 'haircare', date, measured: m, method: sourceLine(date) })

  for (const h of [
    '## Measurable extractions (→ pack calibration)',
    '### Type scale → `type_scale`',
    '### Spacing rhythm → `spacing_rhythm`',
    '### Canonical components present → `canonical_components.list`',
    '### Hero → `hero_treatment`',
    '### PDP order → `pdp_order` (warning-only)',
    '### Color roles → `color_roles`',
    '### Imagery → `imagery`',
    '## Qualitative (human, not gated)',
    '## Batched decisions from this card',
  ]) ok(card.includes(h), `card carries template heading: ${h}`)

  ok(/^# Amika — haircare$/m.test(card), 'card title is "<store> — <niche>"')
  ok(card.includes('**Store:** Amika — https://www.loveamika.com/'), 'card names the store + url')
  ok(SOURCE_HAS(card, date), 'Source: line names the method, the date and the url')
  ok(/^\*\*Status:\*\* DRAFT\b/m.test(card), 'card is emitted as DRAFT')
  ok(!isEvidenceCard({ name: 'amika.md', text: card }), 'a freshly emitted card does NOT count toward promotion')

  // the promotion rule must not be satisfiable by running the extractor three times
  const auto = promotionVerdict(['a', 'b', 'c'].map(n => ({ name: `${n}.md`, text: card })))
  ok(!auto.eligible && auto.draft === 3, 'three machine-written cards cannot self-promote a pack')
}

function SOURCE_HAS(card, date) {
  const line = card.split('\n').find(l => l.includes('**Source:**')) || ''
  return line.includes(date) && /getComputedStyle/.test(line) && line.includes('https://www.loveamika.com/')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
