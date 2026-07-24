#!/usr/bin/env node
// bulk-extract — measure a niche's reference storefronts from the LIVE DOM and emit DRAFT evidence cards.
//
// WHY THIS EXISTS. A niche DNA pack only enforces taste once `_meta.calibration` is "tuned", and the
// promotion rule (reference-examples/README.md) is ≥3 converging cards. So a pack is untuned until
// somebody measures 3 real stores — and measuring by eye produces inferred numbers that quietly
// mis-calibrate the gate. This reads COMPUTED values (getComputedStyle on the rendered page), so a
// card's numbers are observations, not impressions. It grew out of a one-URL session script that
// produced the fable + wild-one pet cards; promoted here so the next niche is one command, not a
// scratchpad rewrite.
//
//   node toolkit/scripts/dna/bulk-extract.mjs --brands brands.json --niche haircare
//   node toolkit/scripts/dna/bulk-extract.mjs --brands brands.json --niche pet --concurrency 2 --out ./drafts
//   node toolkit/scripts/dna/bulk-extract.mjs --brands brands.json --niche pet --dry-run
//
// GOOD CITIZEN. Public marketing pages only, GET-only, no login, no cart, no form submission — this is
// a READ-ONLY MEASUREMENT of pages any visitor renders. Sequential by default (--concurrency raises it,
// deliberately opt-in), a real desktop user agent, one page load per brand. Do not point it at a page
// behind auth, and do not raise concurrency on a small merchant's site.
//
// NEVER AUTO-PROMOTES. Every card is written `**Status:** DRAFT` and DRAFT cards do not count toward
// the ≥3 rule (same rule check-design-quality.mjs #12 warns on). A human reconciles the numbers into
// the pack and drops the DRAFT line — that is the promotion.
//
// Card format: ~/.claude/memory/design/ecom/reference-examples/_STORE-CARD-TEMPLATE.md
// Exit: 0 ok · 1 one or more brands failed to measure · 2 usage/env error.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from '../lib/is-main.mjs'

export const SURFACES = ['home', 'pdp']
export const PROMOTION_MIN_CARDS = 3
const REFERENCE_DIR = process.env.REFERENCE_EXAMPLES_DIR
  || path.join(os.homedir(), '.claude', 'memory', 'design', 'ecom', 'reference-examples')
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const VIEWPORT = { width: 1440, height: 1200 }

export const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// ── input schema ──────────────────────────────────────────────────────────────
// A JSON array of { brand, url, surface }. Validated up front so a typo fails before a browser
// launches rather than after four page loads.
export function validateBrands(input) {
  const errors = []
  if (!Array.isArray(input)) return { brands: [], errors: ['brands file must be a JSON array of { brand, url, surface }'] }
  if (input.length === 0) errors.push('brands file is empty — nothing to measure')
  const brands = []
  const seen = new Set()
  input.forEach((row, i) => {
    const at = `entry ${i}`
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${at}: must be an object { brand, url, surface }`); return }
    const brand = typeof row.brand === 'string' ? row.brand.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    const surface = typeof row.surface === 'string' ? row.surface.trim().toLowerCase() : ''
    if (!brand) errors.push(`${at}: "brand" is required (non-empty string)`)
    if (!url) errors.push(`${at}: "url" is required (non-empty string)`)
    else if (!/^https?:\/\/\S+$/i.test(url)) errors.push(`${at} (${brand || url}): "url" must be an http(s) URL`)
    if (!surface) errors.push(`${at} (${brand || url}): "surface" is required`)
    else if (!SURFACES.includes(surface)) errors.push(`${at} (${brand || url}): surface "${row.surface}" must be one of ${SURFACES.join(' | ')}`)
    const key = `${slug(brand)}:${surface}`
    if (brand && surface) {
      if (seen.has(key)) errors.push(`${at} (${brand}): duplicate brand+surface "${key}" — one card per brand+surface`)
      seen.add(key)
    }
    if (brand && url && SURFACES.includes(surface)) brands.push({ brand, url, surface })
  })
  return { brands, errors }
}

// ── the ≥3-converging-cards promotion rule (reference-examples/README.md step 4) ──
// A card is EVIDENCE when it (a) is a real card file (not an `_index`/template) AND (b) carries a
// truthful `Source:` line naming how it was measured AND (c) is not still marked DRAFT. Gate #12
// applies the same three conditions when it warns about a pack claiming "tuned".
// The Source: line sits mid-line in the template (`**Inspected:** <date> · **Source:** <how>`), so it
// is read anywhere in the file, with or without bold markers, and must actually NAME something —
// a bare `**Source:**` is a card with no provenance and is not evidence.
export const DRAFT_RE = /^\*\*Status:\*\*\s*DRAFT\b/im
export function sourceValue(text) {
  const m = String(text).match(/Source:(.*)$/im)
  return m ? m[1].replace(/\*/g, '').trim() : ''
}
export const isEvidenceCard = ({ name, text }) =>
  /\.md$/i.test(name) && !name.startsWith('_') && sourceValue(text).length > 0 && !DRAFT_RE.test(text)

export function promotionVerdict(entries) {
  const cards = entries.filter(e => /\.md$/i.test(e.name) && !e.name.startsWith('_'))
  const evidence = cards.filter(isEvidenceCard)
  const eligible = evidence.length >= PROMOTION_MIN_CARDS
  return {
    cards: cards.length,
    evidence: evidence.length,
    draft: cards.length - evidence.length,
    eligible,
    calibration: eligible ? 'tuned' : 'draft',
    reason: eligible
      ? `${evidence.length} sourced non-draft cards ≥ ${PROMOTION_MIN_CARDS} — pack MAY be promoted to "tuned" once a human reconciles the recurring values`
      : `${evidence.length}/${PROMOTION_MIN_CARDS} sourced non-draft cards — not enough converging evidence to tune`,
  }
}

// ── derivations (pure — every number below comes from the measured payload) ───
const round = (n, d = 3) => Number(Number(n).toFixed(d))
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }

// Nearest common photographic ratio, so a card says "4:5 portrait" rather than "0.79".
const NAMED_RATIOS = [[1, 1, 'square'], [4, 5, 'portrait'], [3, 4, 'portrait'], [2, 3, 'portrait'], [5, 4, 'landscape'], [4, 3, 'landscape'], [3, 2, 'landscape'], [16, 9, 'wide'], [21, 9, 'ultra-wide']]
export function nameRatio(decimal) {
  if (!Number.isFinite(decimal) || decimal <= 0) return null
  let best = null
  for (const [w, h, kind] of NAMED_RATIOS) {
    const d = Math.abs(decimal - w / h)
    if (!best || d < best.delta) best = { label: `${w}:${h}`, kind, delta: d }
  }
  return best && best.delta < 0.09 ? best : { label: round(decimal, 2).toString(), kind: 'irregular', delta: 0 }
}

export function summarize(raw) {
  const sizes = (raw.fontSizes || []).filter(n => n > 0).sort((a, b) => a - b)
  const ratios = []
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i - 1] > 0) ratios.push(sizes[i] / sizes[i - 1])
  const pads = [...new Set((raw.sectionPads || []).filter(n => n >= 24))].sort((a, b) => a - b)
  const bgs = Object.entries(raw.backgrounds || {}).sort((a, b) => b[1] - a[1]).map(([color, count]) => ({ color, count }))
  const imgRatios = (raw.imgRatios || []).filter(n => Number.isFinite(n) && n > 0)
  const dominantImg = median(imgRatios)
  // density is read off the rhythm band, matching the pack's spacing_rhythm.density enum
  const topPad = pads.length ? pads[pads.length - 1] : null
  const density = topPad === null ? null : topPad >= 140 ? 'extreme-whitespace' : topPad >= 96 ? 'airy' : topPad >= 56 ? 'comfortable' : 'dense'
  return {
    title: raw.title || null,
    fontSizes: sizes,
    distinctSizes: sizes.length,
    dominantRatio: ratios.length ? round(median(ratios)) : null,
    headingFont: raw.headingFont || null,
    headingWeight: raw.headingWeight || null,
    headingSize: raw.headingSize || null,
    bodyFont: raw.bodyFont || null,
    bodySize: raw.bodySize || null,
    singleFamily: !!(raw.headingFont && raw.bodyFont && raw.headingFont === raw.bodyFont),
    headingStyle: raw.headingSerif === null || raw.headingSerif === undefined ? null : (raw.headingSerif ? 'serif' : 'sans'),
    sectionPads: pads,
    rhythmBand: pads.length ? [pads[0], pads[pads.length - 1]] : null,
    density,
    backgrounds: bgs,
    schemeCount: bgs.length,
    accents: raw.buttons || [],
    lineLengthCh: Number.isFinite(raw.lineLengthCh) ? round(raw.lineLengthCh, 1) : null,
    imageRatio: dominantImg ? nameRatio(dominantImg) : null,
    imageRatios: imgRatios.map(n => round(n, 2)),
    imgAltPct: raw.imgAltPct ?? null,
    imgExplicitWhPct: raw.imgExplicitWhPct ?? null,
    carouselLib: !!raw.carouselLib,
    components: Object.entries(raw.components || {}).filter(([, v]) => v).map(([k]) => k),
  }
}

// ── card rendering (pure) — mirrors _STORE-CARD-TEMPLATE.md heading for heading ──
export function renderCard({ brand, url, surface, niche, date, measured, method }) {
  const m = measured
  const na = '(not measured)'
  const list = (arr, unit = '') => (arr && arr.length ? arr.map(v => `${v}${unit}`).join(', ') : na)
  const accent = m.accents && m.accents.length ? m.accents[0] : null
  const heroLine = surface === 'home'
    ? `- Archetype: <fill in from the screenshot> · Carousel library detected page-wide? ${m.carouselLib ? 'yes' : 'no'} → \`carousel_allowed\``
    : `- (PDP surface — hero not measured on this card.)`

  return `# ${brand} — ${niche}

> DRAFT teardown card. Every number below is a COMPUTED value read off the live DOM — it is an
> observation, not a judgement. The prose fields are deliberately unfilled: a human reconciles them.

**Store:** ${brand} — ${url}
**Niche:** ${niche}
**Status:** DRAFT — machine-extracted, awaiting human reconciliation. Does NOT count toward the ≥${PROMOTION_MIN_CARDS}-card promotion rule until this line is removed.
**Why Yash likes it (his words):** <fill in — a card with no reason is not evidence of taste>
**Focus tags:** <CRO · visual · layout · functions · presentation>
**Inspected:** ${date} · **Source:** ${method} — surface \`${surface}\`, ${url}

---

## Measurable extractions (→ pack calibration)

### Type scale → \`type_scale\`
- Font-size set observed (px): [${list(m.fontSizes)}]
- Dominant adjacent-step **ratio**: ${m.dominantRatio ?? na}
- Distinct sizes on the rendered page: ${m.distinctSizes} → \`max_sizes_per_page\`
- Heading: \`${m.headingFont || na}\` @ weight ${m.headingWeight || na}, rendered ${m.headingSize ? `${m.headingSize}px` : na}
- Body: \`${m.bodyFont || na}\`${m.bodySize ? ` @ ${m.bodySize}px` : ''}${m.singleFamily ? ' — **single-family system** (display + body from one face)' : ''}
- Heading style: ${m.headingStyle || na}
- ⚠ Methodology: this is the WHOLE-PAGE rendered distribution (nav/footer/UI chrome included). Gate #12
  measures only the build's custom-section CSS — a narrower set. Do not re-calibrate \`type_scale.ratio\`
  off this median alone; derive it from the display ladder.

### Spacing rhythm → \`spacing_rhythm\`
- Section vertical padding (px, desktop ${VIEWPORT.width}w): [${list(m.sectionPads)}] → band ${m.rhythmBand ? `[${m.rhythmBand[0]}, ${m.rhythmBand[1]}]` : na} · Density: ${m.density || na}

### Canonical components present → \`canonical_components.list\`
${m.components.length ? m.components.map(c => `- [x] ${c}`).join('\n') : '- (none detected — verify by eye; detection is keyword-based on rendered text)'}

### Hero → \`hero_treatment\`
${heroLine}
- ⚠ A page-wide carousel library also fires on product/review sliders. This contributes NO evidence
  about the HERO specifically until a human confirms it on the screenshot.

### PDP order → \`pdp_order\` (warning-only)
1. <fill in from the PDP surface>

### Color roles → \`color_roles\`
- Distinct section backgrounds AS USED: ${m.schemeCount} → \`scheme_count_max\`
${m.backgrounds.length ? m.backgrounds.map(b => `  - \`${b.color}\` ×${b.count}`).join('\n') : '  - (none measured)'}
- Accent AS USED (first CTA): ${accent ? `bg \`${accent.bg}\` · text \`${accent.color}\` · radius \`${accent.radius}\`` : na}

### Imagery → \`imagery\`
- Dominant product/content ratio: ${m.imageRatio ? `**${m.imageRatio.label}** (${m.imageRatio.kind})` : na} · observed [${list(m.imageRatios)}]
- Alt-text coverage: ${m.imgAltPct === null ? na : `${m.imgAltPct}%`} · explicit width+height (CLS): ${m.imgExplicitWhPct === null ? na : `${m.imgExplicitWhPct}%`}

### Key ratios
- Body line length: ${m.lineLengthCh === null ? na : `~${m.lineLengthCh} characters`}

### Motion / functions (cross-niche candidates)
- <fill in — notable interactions; if niche-agnostic also note in \`_cross-niche/\`>

---

## Qualitative (human, not gated)
- **What makes it feel premium:** <…>
- **What it does BETTER than the niche average:** <…>  ← the reason this card matters
- **Anything to NOT copy:** <…>

## Batched decisions from this card
- DEC-${slug(niche)}-<nn>: <decision> — chosen: <option>
`
}

export function sourceLine(date) {
  return `headless Chromium (Playwright) \`getComputedStyle\` extraction at ${VIEWPORT.width}×${VIEWPORT.height}, ${date}, via \`toolkit/scripts/dna/bulk-extract.mjs\``
}

// ── live measurement (browser) ────────────────────────────────────────────────
// Runs INSIDE the page: no closure over module scope is allowed here.
function measureDom() {
  const px = v => Math.round(parseFloat(v) * 10) / 10
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
  }
  const fam = f => String(f || '').split(',')[0].replace(/["']/g, '').trim()

  const heads = [...document.querySelectorAll('h1,h2')].filter(el => vis(el) && (el.textContent || '').trim().length > 2)
  const paras = [...document.querySelectorAll('p')].filter(el => vis(el) && (el.textContent || '').trim().length > 20)
  const h = heads[0]
  const p = paras[0]

  const sizes = new Set()
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,span,li,button')) {
    if (!vis(el)) continue
    if ((el.textContent || '').trim().length < 2) continue
    const fs = px(getComputedStyle(el).fontSize)
    if (fs >= 10 && fs <= 140) sizes.add(fs)
  }

  const secs = [...document.querySelectorAll('section,[class*="section"],main > div')].filter(el => el.getBoundingClientRect().height > 200).slice(0, 30)
  const pads = []
  const backgrounds = {}
  for (const s of secs) {
    const cs = getComputedStyle(s)
    for (const v of [px(cs.paddingTop), px(cs.paddingBottom)]) if (v >= 16) pads.push(v)
    const bg = cs.backgroundColor
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') backgrounds[bg] = (backgrounds[bg] || 0) + 1
  }

  const buttons = [...document.querySelectorAll('button,a[class*="btn"],a[class*="button"]')].filter(vis).slice(0, 8)
    .map(b => { const cs = getComputedStyle(b); return { bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius } })
    .filter(b => b.bg && b.bg !== 'rgba(0, 0, 0, 0)')

  const imgs = [...document.querySelectorAll('img')].filter(i => i.getBoundingClientRect().width > 150).slice(0, 24)
  const imgRatios = imgs.map(i => { const r = i.getBoundingClientRect(); return r.height ? Math.round((r.width / r.height) * 100) / 100 : 0 })

  // line length in characters ≈ paragraph width ÷ average glyph advance (0.5em is the usual approximation)
  let lineLengthCh = null
  if (p) {
    const cs = getComputedStyle(p)
    const w = p.getBoundingClientRect().width
    const fs = parseFloat(cs.fontSize)
    if (w > 0 && fs > 0) lineLengthCh = w / (fs * 0.5)
  }

  const headFam = h ? fam(getComputedStyle(h).fontFamily) : null
  const headStack = h ? String(getComputedStyle(h).fontFamily).toLowerCase() : ''
  const body = (document.body.innerText || '').toLowerCase()
  const has = s => body.includes(s)

  return {
    url: location.href,
    title: document.title,
    headingFont: headFam,
    headingWeight: h ? getComputedStyle(h).fontWeight : null,
    headingSize: h ? px(getComputedStyle(h).fontSize) : null,
    // the declared stack's generic fallback is the only honest serif/sans signal available without glyph metrics
    headingSerif: headStack ? (/\bserif\b/.test(headStack) && !/sans-serif/.test(headStack)) : null,
    bodyFont: p ? fam(getComputedStyle(p).fontFamily) : fam(getComputedStyle(document.body).fontFamily),
    bodySize: p ? px(getComputedStyle(p).fontSize) : null,
    fontSizes: [...sizes],
    sectionPads: pads,
    backgrounds,
    buttons,
    imgRatios,
    imgAltPct: imgs.length ? Math.round(imgs.filter(i => i.getAttribute('alt') !== null).length / imgs.length * 100) : null,
    imgExplicitWhPct: imgs.length ? Math.round(imgs.filter(i => i.getAttribute('width') && i.getAttribute('height')).length / imgs.length * 100) : null,
    lineLengthCh,
    carouselLib: /swiper|slick|splide|flickity|glide|carousel|slideshow/i.test(document.documentElement.innerHTML.slice(0, 400000)),
    components: {
      reviews: has('review'), subscription: has('subscribe') || has('subscription'),
      faq: has('faq') || has('frequently asked'), ingredients: has('ingredient'),
      bundle: has('bundle') || has('kit'), guarantee: has('guarantee'),
      'free-shipping': has('free shipping'), 'founder-story': has('founder') || has('our story'),
      'size-guide': has('size guide') || has('size chart'), quiz: has('quiz') || has('find your'),
    },
  }
}

async function measureAll(brands, { concurrency }) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: VIEWPORT, userAgent: USER_AGENT })
  const results = []
  try {
    for (let i = 0; i < brands.length; i += concurrency) {
      const batch = brands.slice(i, i + concurrency)
      const settled = await Promise.all(batch.map(async (b) => {
        const page = await ctx.newPage()
        try {
          await page.goto(b.url, { waitUntil: 'load', timeout: 60000 })
          await page.waitForTimeout(3500) // let webfonts swap in and lazy sections mount before reading styles
          return { ...b, raw: await page.evaluate(measureDom) }
        } catch (err) {
          return { ...b, error: err.message.split('\n')[0] }
        } finally {
          await page.close().catch(() => {})
        }
      }))
      results.push(...settled)
      for (const r of settled) console.log(`  ${r.error ? '✗' : '✓'} ${r.brand} (${r.surface}) ${r.error || ''}`)
    }
  } finally {
    await browser.close()
  }
  return results
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { concurrency: 1 }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--brands') o.brands = argv[++i]
    else if (a === '--niche') o.niche = argv[++i]
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--concurrency') o.concurrency = Number(argv[++i])
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--help' || a === '-h') o.help = true
    else return { ...o, unknown: a }
  }
  return o
}

const USAGE = `usage: node toolkit/scripts/dna/bulk-extract.mjs --brands <file.json> --niche <niche> [--out <dir>] [--concurrency <n>] [--dry-run]
  --brands       JSON array of { brand, url, surface } — surface is ${SURFACES.join(' | ')} (see brands.example.json)
  --niche        niche slug; cards land in <out>/<niche>/ and map to niche-dna-packs/<niche>.json
  --out          card output root (default ${REFERENCE_DIR})
  --concurrency  parallel page loads (default 1 — be a good citizen)
  --dry-run      validate the input and print the plan; launch no browser`

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) { console.log(USAGE); process.exit(0) }
  if (o.unknown) { console.error(`unknown flag ${o.unknown}\n${USAGE}`); process.exit(2) }
  if (!o.brands || !o.niche) { console.error(USAGE); process.exit(2) }
  if (!Number.isFinite(o.concurrency) || o.concurrency < 1 || o.concurrency > 8) { console.error('--concurrency must be 1-8'); process.exit(2) }

  const brandsAbs = path.resolve(process.cwd(), o.brands)
  if (!fs.existsSync(brandsAbs)) { console.error(`brands file not found: ${brandsAbs}`); process.exit(2) }
  let input
  try { input = JSON.parse(fs.readFileSync(brandsAbs, 'utf-8')) } catch (err) { console.error(`brands file is invalid JSON: ${err.message}`); process.exit(2) }

  const { brands, errors } = validateBrands(input)
  if (errors.length) { for (const e of errors) console.error(`  input error: ${e}`); process.exit(2) }

  const niche = slug(o.niche)
  const outDir = path.resolve(process.cwd(), o.out || path.join(REFERENCE_DIR, niche))
  console.log(`dna bulk-extract — niche "${niche}", ${brands.length} brand(s), concurrency ${o.concurrency}`)
  console.log(`  public pages only · read-only measurement · out: ${outDir}`)

  if (o.dryRun) {
    for (const b of brands) console.log(`  would measure ${b.brand} (${b.surface}) → ${path.join(outDir, `${slug(b.brand)}.md`)}`)
    console.log('\ndry run — no browser launched, no cards written')
    process.exit(0)
  }

  const date = new Date().toISOString().slice(0, 10)
  const results = await measureAll(brands, { concurrency: o.concurrency })
  fs.mkdirSync(outDir, { recursive: true })

  let written = 0
  const failed = []
  const skipped = []
  for (const r of results) {
    if (r.error) { failed.push(`${r.brand}: ${r.error}`); continue }
    // A reconciled card is human work — a re-run must never silently overwrite it back to DRAFT.
    const dest = path.join(outDir, `${slug(r.brand)}.md`)
    if (fs.existsSync(dest) && !DRAFT_RE.test(fs.readFileSync(dest, 'utf-8'))) {
      skipped.push(`${r.brand}: ${path.relative(process.cwd(), dest)} is already reconciled (no DRAFT marker) — delete it first to re-measure`)
      continue
    }
    const card = renderCard({
      brand: r.brand, url: r.url, surface: r.surface, niche, date,
      measured: summarize(r.raw), method: sourceLine(date),
    })
    fs.writeFileSync(dest, card)
    written += 1
    console.log(`  wrote ${path.relative(process.cwd(), dest)}`)
  }

  // report where the niche now stands against the promotion rule — WITHOUT promoting anything
  const existing = fs.readdirSync(outDir).filter(n => n.endsWith('.md'))
    .map(name => ({ name, text: fs.readFileSync(path.join(outDir, name), 'utf-8') }))
  const v = promotionVerdict(existing)

  console.log(`\n${written} DRAFT card(s) written · ${skipped.length} kept · ${failed.length} failed`)
  for (const s of skipped) console.log(`  · ${s}`)
  for (const f of failed) console.log(`  ✗ ${f}`)
  console.log(`\nniche "${niche}": ${v.cards} card(s) on disk, ${v.evidence} sourced non-draft, ${v.draft} draft.`)
  console.log(`  ${v.reason}`)
  console.log(`\nRECONCILE (nothing was promoted — this tool never tunes a pack):
  1. Read each DRAFT card, fill the prose fields, and verify the hero/carousel claim on a screenshot.
  2. Drop the "**Status:** DRAFT" line only once the card is reconciled — that is what makes it evidence.
  3. Append a row to ${path.join(outDir, '_index.md')}.
  4. With ≥${PROMOTION_MIN_CARDS} sourced non-draft cards, edit the RECURRING values into
     niche-dna-packs/${niche}.json and set _meta.calibration:"tuned" — gate #12 then hard-blocks on it,
     and warns if the card count does not back the claim.`)
  process.exit(failed.length ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main().catch(err => { console.error(`bulk-extract failed: ${err.message}`); process.exit(2) })
}
