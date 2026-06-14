#!/usr/bin/env node
// Gate 7 — conversion (catalyst). The MECHANICAL ~60% of the conversion gate
// that is automatable; catalyst's strategic judgment is the real bar (this gate
// is advisory-strict, not brittle). Implements the executable half of
// ~/.claude/memory/patterns/good/shopify-conversion-gate-checklist.md against the
// rendered storefront page matrix from lib/pages.mjs. Lift target rule lives in
// catalyst's strategic review: lift_target = niche_benchmark × 2.5
// (see ecom-niche-lift-benchmarks.md) — NOT enforced here.
//
// Design stance: only the load-bearing buy-path checks BLOCK (1 hero+CTA on the
// landing surfaces, 2 PDP buy-path). Everything else (3–9) is a WARNING by default
// so a configure-only / Liquid-section build never hard-fails on an optional
// merchandising slot. STRICT_TRUST=1 promotes check 3 (social proof) to a blocker.
//
// Checks × applicability × severity:
//    1  hero + primary CTA ........ home + landing-ish: an h1/hero heading AND a
//                                   primary CTA link/button within the first ~15%
//                                   of <body>. BLOCKER if absent.
//    2  PDP buy-path ............. pdp: add-to-cart form/button present AND a price
//                                   present. BLOCKER if either absent.
//    3  trust / social proof ..... pdp: ≥1 of [review/rating widget, AggregateRating
//                                   in JSON-LD, trust-badge/guarantee text].
//                                   WARNING (→ blocker with STRICT_TRUST=1).
//    4  sticky ATC ............... pdp: a sticky/persistent add-to-cart element
//                                   (class/data hint: sticky-atc, m-sticky,
//                                   data-sticky). WARNING if absent.
//    5  free-ship / cart-incentive cart: a progress/free-shipping bar element.
//                                   WARNING if absent.
//    6  cart upsell / cross-sell . cart: a recommendations/upsell block. WARNING.
//    7  email capture ............ home or footer: a newsletter/email-signup form
//                                   (a <form> containing an email input). WARNING.
//    8  decoder citation (STATIC). grep sections/ (+ build diff when in a git repo)
//                                   for `<!-- Decoder: brand1,brand2 -->` on the
//                                   major surfaces. Reports count; WARNING if zero
//                                   on a custom build (informational on configure-only).
//    9  lifecycle email triggers . check for a sequence config artifact
//       (STATIC) ................. (content/email/ or a sequences manifest).
//                                   INFORMATIONAL (never warns/blocks).
//
// Env:   THEME_PREVIEW_URL                            required — else exit 2
//        THEME_STORE_PASSWORD / STOREFRONT_PASSWORD   storefront password (password walls)
//        STRICT_TRUST=1                               promote check 3 to a blocker
//        FIRST_PRODUCT_HANDLE / FIRST_COLLECTION_HANDLE / BLOG_PATH / ARTICLE_PATH / PAGE_PATH
//                                                     handle/path discovery overrides (lib/pages.mjs)
//        REPORT_DIR                                   default: gate-reports
// Flags: --pages home,pdp,cart,...   subset of the matrix (default: home,pdp,cart)
//        --report-dir <dir>          overrides REPORT_DIR
// Out:   $REPORT_DIR/conversion.json (schema via lib/report.mjs). Unresolvable
//        optional pages land in evidence.skippedPages and never block.
// Exit:  0 = pass · 1 = block · 2 = env error (no URL / password wall / discovery
//        or mandatory-page fetch hard-fail). Exit 2 NEVER reads as pass.
//
// No external deps — global fetch (Node 20), lib/pages.mjs authFetch for every request.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { resolvePages, authFetch, EnvError, MANDATORY_PAGES, OPTIONAL_PAGES } from './lib/pages.mjs'

const started = Date.now()
const ALL_PAGE_IDS = [...MANDATORY_PAGES, ...OPTIONAL_PAGES]
const DEFAULT_PAGES = ['home', 'pdp', 'cart']
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BoldteqThemeGates/1.0'

// surfaces where an above-fold hero + primary CTA is load-bearing
const HERO_PAGES = new Set(['home', 'collection', 'page'])
// STRICT_CONVERSION (set by the orchestrator on a publish-grade FULL run) promotes the
// load-bearing CRO mechanics from warnings to BLOCKERS: PDP social proof + a cart conversion
// mechanic + an evidence-backed decoder citation. Dev/subset runs stay lenient (warnings).
const STRICT_CONVERSION = process.env.STRICT_CONVERSION === '1'
const STRICT_TRUST = process.env.STRICT_TRUST === '1' || STRICT_CONVERSION

// Brands the DESIGN actually declared — read from docs/design/design-spec.md `decoder_brands_cited`.
// A section-file `<!-- Decoder: X -->` citation is only evidence-backed if X is one of these
// (audit fix: a free-text comment proves nothing; tie the citation to a real design decision).
function declaredDecoderBrands(cwd) {
  const out = new Set()
  for (const rel of ['docs/design/design-spec.md', 'design-spec.md']) {
    try {
      const txt = fs.readFileSync(path.resolve(cwd, rel), 'utf-8')
      const block = txt.match(/decoder_brands_cited[^\n]*\n?([\s\S]*?)(?:\n##\s|\n[a-z_]+:\s|\n```|$)/i)
      const scope = block ? block[0] : txt
      for (const m of scope.matchAll(/["'\[]?\s*([A-Z][\w&'. -]{1,40}?)\s*["'\]]/g)) {
        const b = m[1].trim().toLowerCase()
        if (b && !/^(hero|pdp|cart|decoder_brands_cited|surfaces|lift_targets|mechanic_slots|path)$/.test(b)) out.add(b)
      }
    } catch { /* no spec on this build — fall back to count-only */ }
  }
  return out
}
const normBrand = (s) => s.trim().toLowerCase().replace(/[.''`]/g, '')

// ── args ──────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`Gate 7 — conversion (shopify-conversion-gate-checklist, mechanical half)

Usage:
  THEME_PREVIEW_URL=https://store.example node scripts/gate-conversion.mjs [--pages home,pdp,cart] [--report-dir <dir>]

Pages: ${ALL_PAGE_IDS.join(', ')} (default: ${DEFAULT_PAGES.join(',')}; blog/article/page optional — unresolvable → evidence.skippedPages)
Blockers: hero+CTA (1) on landing surfaces, PDP buy-path (2). Checks 3–9 are warnings (STRICT_TRUST=1 makes social proof a blocker).
Exit codes: 0 pass · 1 block · 2 env error
`)
}

function parseArgs(argv) {
  const out = { pages: null, reportDir: process.env.REPORT_DIR || 'gate-reports', help: false }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--pages') {
      const v = argv[++i]
      if (!v) {
        console.error('missing value for --pages')
        process.exit(2)
      }
      out.pages = [...new Set(v.split(',').map(s => s.trim()).filter(Boolean))]
    } else if (a === '--report-dir') {
      const v = argv[++i]
      if (!v) {
        console.error('missing value for --report-dir')
        process.exit(2)
      }
      out.reportDir = v
    } else if (a === '--help' || a === '-h') {
      out.help = true
    } else {
      console.error(`unknown arg: ${a} (see --help)`)
      process.exit(2)
    }
  }
  if (out.pages) {
    const bad = out.pages.filter(p => !ALL_PAGE_IDS.includes(p))
    if (bad.length > 0) {
      console.error(`unknown page id(s): ${bad.join(', ')} (valid: ${ALL_PAGE_IDS.join(', ')})`)
      process.exit(2)
    }
  }
  return out
}

const args = parseArgs(process.argv)
if (args.help) {
  printHelp()
  process.exit(0)
}

const previewUrl = process.env.THEME_PREVIEW_URL || null
const password = process.env.THEME_STORE_PASSWORD ?? process.env.STOREFRONT_PASSWORD ?? undefined

function finish(code, data) {
  const { file, report } = writeReport('conversion', 7, { url: previewUrl, ...data, duration_ms: Date.now() - started }, args.reportDir)
  console.log(`report: ${file} (pass=${report.pass}, blockers=${report.blockers.length}, warnings=${report.warnings.length})`)
  process.exit(code)
}

// ── HTML helpers (regex on rendered source — no DOM, no deps) ─────────────
function stripNonContent(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<template\b[\s\S]*?<\/template>/gi, '')
}

// JSON-LD must come from RAW html — stripNonContent removes <script> blocks.
function extractJsonLd(rawHtml) {
  const out = []
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(rawHtml)) !== null) {
    const body = m[1].trim()
    if (body.length > 0) out.push(body)
  }
  return out
}

// slice the <body> (fall back to whole doc), then take the first ~15% as the
// above-fold proxy (rendered order ≈ visual order for the top of the page).
function bodySlice(html) {
  const b = html.search(/<body\b[^>]*>/i)
  if (b === -1) return html
  const after = html.slice(b)
  const end = after.search(/<\/body>/i)
  return end === -1 ? after : after.slice(0, end)
}

// Main content = body minus the header/nav chrome AND the cart-notification /
// cart-drawer markup that Minimog/Dawn render right after </header> in source
// order. We verify PRESENCE of a hero heading + shop CTA across this whole
// region — not a positional "first 15%" slice (the hero sits below the drawer
// chrome in source order, so a positional cut false-blocks every real store).
// The visual above-the-fold judgment is catalyst's strategic review, not a grep.
function mainContent(html) {
  const body = bodySlice(html)
  let main = body
  const headerEnd = body.search(/<\/header>/i)
  if (headerEnd !== -1) main = body.slice(headerEnd)
  // drop trailing cart-drawer / cart-notification / modal chrome so a drawer
  // "shop" link can't satisfy the hero CTA, and so the slice centers on sections
  const chrome = main.search(/<(cart-drawer|cart-notification)\b/i)
  if (chrome !== -1 && chrome < main.length * 0.25) {
    const resumeAt = main.indexOf('<main', chrome)
    if (resumeAt !== -1) main = main.slice(0, chrome) + ' ' + main.slice(resumeAt)
  }
  return main
}

// any JSON-LD node carries an AggregateRating (nested anywhere)
function jsonLdHasAggregateRating(rawHtml) {
  for (const src of extractJsonLd(rawHtml)) {
    if (/"@type"\s*:\s*"AggregateRating"/i.test(src)) return true
    if (/"aggregateRating"\s*:/i.test(src)) return true
  }
  return false
}

const PRIMARY_CTA_RE =
  /<(a|button)\b[^>]*\b(?:class|id|data-[\w-]+)\s*=\s*["'][^"']*(?:btn|button|cta|hero__cta|banner__button|shop-now|js-shop)[^"']*["'][^>]*>|<button\b[^>]*>(?![\s\S]{0,200}?type\s*=\s*["']?(?:search|reset))/i
// A homepage "conversion anchor" section: an h1, OR a top-of-page hero-archetype
// section. Covers the real Minimog + Dawn hero sections (image-with-text,
// image-banner, video-hero, slideshow, promotion, collage, multirow), not just
// the literal word "hero" — themes rarely name a class "hero".
const HERO_HEADING_RE = /<h1\b[^>]*>[\s\S]*?<\/h1>|class\s*=\s*["'][^"']*(?:hero|banner|slideshow|image-with-text|image-banner|video-hero|promotion|collage|multirow|m-section--[\w-]*(?:banner|slide|video|image-with))[^"']*["']/i

function hasPrimaryCta(slice) {
  // a real link/button to shop, or an explicit cta/button-classed element
  if (/<a\b[^>]*\bhref\s*=\s*["'][^"']*\/(?:products|collections|cart)\b[^"']*["'][^>]*>/i.test(slice)) return true
  if (/\b(?:class|data-[\w-]+)\s*=\s*["'][^"']*(?:hero__cta|banner__button|cta|button--primary|shop-now)[^"']*["']/i.test(slice)) return true
  if (/<(a|button)\b[^>]*\b(?:class)\s*=\s*["'][^"']*\bbtn\b[^"']*["'][^>]*>/i.test(slice)) return true
  if (PRIMARY_CTA_RE.test(slice)) return true
  return false
}

// ── per-page mechanical checks ────────────────────────────────────────────
function checkHomeHero(id, rawHtml, { blockers }) {
  const main = mainContent(rawHtml) // raw — class names live on the comment-free markup anyway
  const heading = HERO_HEADING_RE.test(main)
  const cta = hasPrimaryCta(main)
  const ev = { heading, cta }
  if (!heading || !cta) {
    blockers.push({
      id: 'conversion.hero-cta',
      page: id,
      detail: `landing page missing a conversion anchor — ${[!heading && 'no hero heading or hero/banner/slideshow section', !cta && 'no shop/primary CTA anywhere in main content'].filter(Boolean).join(' + ')}`,
      evidence: main.replace(/\s+/g, ' ').slice(0, 160),
    })
  }
  return ev
}

function checkPdpBuyPath(rawHtml, { blockers, warnings }) {
  const html = stripNonContent(rawHtml)
  const ev = {}

  // 2 — add-to-cart form/button + price (BLOCKER)
  const hasAtcForm = /<form\b[^>]*\baction\s*=\s*["'][^"']*\/cart\/add[^"']*["'][^>]*>/i.test(html)
  const hasAtcButton =
    /<button\b[^>]*\b(?:name\s*=\s*["']add["']|type\s*=\s*["']submit["'][^>]*>(?:[\s\S]{0,120}?(?:add to cart|add to bag))|(?:class|data-[\w-]+)\s*=\s*["'][^"']*(?:add-to-cart|product-form__submit|add_to_cart|js-add)[^"']*["'])/i.test(html) ||
    /\b(?:add to cart|add to bag)\b/i.test(html.replace(/<[^>]+>/g, ' '))
  const hasAtc = hasAtcForm || hasAtcButton
  ev.atc = hasAtc
  if (!hasAtc) {
    blockers.push({
      id: 'conversion.pdp-atc',
      page: 'pdp',
      detail: 'no add-to-cart path on PDP (no /cart/add form and no add-to-cart button)',
      evidence: '',
    })
  }

  const hasPrice =
    /<[^>]*\b(?:class|data-[\w-]+)\s*=\s*["'][^"']*\bprice[^"']*["']/i.test(html) ||
    /itemprop\s*=\s*["']price["']/i.test(html) ||
    /"@type"\s*:\s*"Offer"/i.test(rawHtml)
  ev.price = hasPrice
  if (!hasPrice) {
    blockers.push({
      id: 'conversion.pdp-price',
      page: 'pdp',
      detail: 'no price element detected on PDP (no .price/[itemprop=price]/Offer JSON-LD)',
      evidence: '',
    })
  }

  // 3 — trust / social proof (WARNING — blocker under STRICT_TRUST)
  const reviewWidget =
    /\b(?:class|id|data-[\w-]+)\s*=\s*["'][^"']*(?:review|rating|stamped|judgeme|jdgm|yotpo|loox|okendo|stars?)[^"']*["']/i.test(html) ||
    /\bstar-rating\b/i.test(html)
  const aggregateRating = jsonLdHasAggregateRating(rawHtml)
  const trustText =
    /\b(?:money-?back|satisfaction guarantee|guaranteed|free returns|30-day|secure checkout|verified|trust ?badge)\b/i.test(
      html.replace(/<[^>]+>/g, ' '),
    ) || /\b(?:class|data-[\w-]+)\s*=\s*["'][^"']*(?:trust|guarantee|badge)[^"']*["']/i.test(html)
  const trustSignals = [reviewWidget && 'review-widget', aggregateRating && 'aggregate-rating', trustText && 'trust-text'].filter(Boolean)
  ev.trust = trustSignals
  if (trustSignals.length === 0) {
    const entry = {
      id: 'conversion.pdp-trust',
      page: 'pdp',
      detail: 'no social proof / trust signal on PDP (no review widget, AggregateRating JSON-LD, or guarantee text)',
      evidence: '',
    }
    if (STRICT_TRUST) blockers.push(entry)
    else warnings.push(entry)
  }

  // 4 — sticky ATC (WARNING)
  const stickyAtc =
    /\b(?:class|data-[\w-]+)\s*=\s*["'][^"']*(?:sticky-atc|m-sticky|sticky-add|sticky-buy|sticky-cart|is-sticky)[^"']*["']/i.test(html) ||
    /\bdata-sticky\b/i.test(html)
  ev.stickyAtc = stickyAtc
  if (!stickyAtc) {
    warnings.push({
      id: 'conversion.pdp-sticky-atc',
      page: 'pdp',
      detail: 'no sticky/persistent add-to-cart element (hint: sticky-atc / m-sticky / data-sticky)',
      evidence: '',
    })
  }

  return ev
}

function checkCart(rawHtml, { blockers, warnings }) {
  const html = stripNonContent(rawHtml)
  const ev = {}

  // 5 — free-shipping / cart-incentive bar (WARNING)
  const freeShipBar =
    /\b(?:class|id|data-[\w-]+)\s*=\s*["'][^"']*(?:free-?ship|shipping-?bar|cart-?progress|progress-?bar|threshold-?bar|free-?delivery)[^"']*["']/i.test(html) ||
    /\b(?:free shipping|away from free|spend \$?\d+ more)\b/i.test(html.replace(/<[^>]+>/g, ' '))
  ev.freeShipBar = freeShipBar
  if (!freeShipBar) {
    warnings.push({
      id: 'conversion.cart-free-ship-bar',
      page: 'cart',
      detail: 'no free-shipping / cart-incentive progress bar on cart',
      evidence: '',
    })
  }

  // 6 — cart upsell / cross-sell slot (WARNING)
  const upsell =
    /\b(?:class|id|data-[\w-]+)\s*=\s*["'][^"']*(?:upsell|cross-?sell|recommend|you-?may-?also|complete-?the|cart-?addon|frequently-?bought)[^"']*["']/i.test(html) ||
    /\b(?:you may also like|complete the look|pairs well|frequently bought|recommended for you)\b/i.test(html.replace(/<[^>]+>/g, ' '))
  ev.upsell = upsell
  if (!upsell) {
    warnings.push({
      id: 'conversion.cart-upsell',
      page: 'cart',
      detail: 'no cart upsell / cross-sell / recommendations slot',
      evidence: '',
    })
  }

  // STRICT: the cart must carry at least ONE conversion mechanic (incentive bar OR upsell) — a
  // bare cart is a known AOV/conversion leak. Load-bearing → blocker on a publish-grade run.
  if (STRICT_CONVERSION && !freeShipBar && !upsell) {
    blockers.push({
      id: 'conversion.cart-no-mechanic',
      page: 'cart',
      detail: 'cart has NO conversion mechanic (no free-shipping/incentive bar AND no upsell/cross-sell) — a bare cart leaks AOV + conversion',
      evidence: '',
    })
  }

  return ev
}

// 7 — email capture on home (or footer of any page) — WARNING
function hasEmailCaptureForm(html) {
  for (const form of html.match(/<form\b[\s\S]*?<\/form>/gi) || []) {
    const hasEmailInput =
      /<input\b[^>]*\btype\s*=\s*["']email["']/i.test(form) ||
      /<input\b[^>]*\bname\s*=\s*["'][^"']*email[^"']*["']/i.test(form) ||
      /<input\b[^>]*\b(?:placeholder|aria-label)\s*=\s*["'][^"']*e-?mail[^"']*["']/i.test(form)
    const looksNewsletter =
      /\b(?:newsletter|subscribe|sign ?up|signup|customer\[email\]|contact\[email\])\b/i.test(form) ||
      /form_type\s*=\s*["']customer["']/i.test(form)
    if (hasEmailInput && looksNewsletter) return true
    if (hasEmailInput && /form_type=["']?customer/i.test(form)) return true
  }
  return false
}

// ── check 8 (STATIC): decoder citations grepped from the theme repo ───────
function inGitRepo(cwd) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

function listSectionFiles(cwd) {
  const dir = path.resolve(cwd, 'sections')
  let out = []
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.liquid')) out.push(path.join(dir, name))
    }
  } catch {
    /* no sections/ dir — configure-only or non-theme cwd */
  }
  return out
}

const DECODER_RE = /<!--\s*Decoder:\s*([^>]+?)\s*-->/gi
const SURFACE_HINT_RE = /(hero|banner|product|pdp|cart|featured|collection|main-product)/i

function checkDecoderCitations(cwd, { blockers, warnings }) {
  const declared = declaredDecoderBrands(cwd) // brands the design-spec actually committed to
  const declaredNorm = new Set([...declared].map(normBrand))
  const ev = { citations: 0, evidenceBacked: 0, fabricated: 0, surfaces: [], scanned: 0, declaredBrands: [...declared], customBuild: inGitRepo(cwd) }
  const files = listSectionFiles(cwd)
  ev.scanned = files.length
  for (const f of files) {
    let txt
    try { txt = fs.readFileSync(f, 'utf-8') } catch { continue }
    const base = path.basename(f)
    const onSurface = SURFACE_HINT_RE.test(base)
    let m
    DECODER_RE.lastIndex = 0
    while ((m = DECODER_RE.exec(txt)) !== null) {
      ev.citations += 1
      const cited = m[1].split(/[,;|]/).map(normBrand).filter(Boolean)
      const matchesDeclared = cited.some(b => declaredNorm.has(b))
      if (onSurface && (matchesDeclared || declaredNorm.size === 0)) {
        ev.evidenceBacked += 1
        ev.surfaces.push(base)
      }
      // a citation that names brands NONE of which the design-spec declared = fabricated/ungrounded
      if (declaredNorm.size > 0 && !matchesDeclared) ev.fabricated += 1
    }
  }
  ev.surfaces = [...new Set(ev.surfaces)]

  if (declaredNorm.size > 0) {
    // EVIDENCE-DERIVED path: the spec declared brands, so citations must be grounded in them.
    if (ev.scanned > 0 && ev.evidenceBacked === 0) {
      const entry = { id: 'conversion.decoder-citation', page: 'repo', detail: `no evidence-backed decoder citation — a custom build must carry ≥1 \`<!-- Decoder: <brand> -->\` on a hero/pdp/cart section naming a brand the design-spec declared (declared: ${ev.declaredBrands.slice(0, 6).join(', ') || 'none'})`, evidence: 'sections/*.liquid vs docs/design/design-spec.md' }
      STRICT_CONVERSION ? blockers.push(entry) : warnings.push(entry)
    }
    if (ev.fabricated > 0) {
      const entry = { id: 'conversion.decoder-citation-fabricated', page: 'repo', detail: `${ev.fabricated} decoder citation(s) name brands NOT in the design-spec (\`decoder_brands_cited\`) — ungrounded/fabricated; cite the brands the design actually drew from`, evidence: 'sections/*.liquid' }
      STRICT_CONVERSION ? blockers.push(entry) : warnings.push(entry)
    }
  } else if (ev.citations === 0 && ev.scanned > 0) {
    // No design-spec to cross-check (Figma/legacy build) — fall back to a presence warning only.
    warnings.push({ id: 'conversion.decoder-citation', page: 'repo', detail: `no <!-- Decoder: brand,... --> citations across ${ev.scanned} section file(s) (no design-spec.md to evidence-check; custom build expects ≥1 on hero/pdp/cart)`, evidence: 'sections/*.liquid' })
  }
  return ev
}

// ── check 9 (STATIC): lifecycle email triggers — informational ────────────
function checkLifecycleEmail(cwd) {
  const ev = { artifact: null, present: false }
  const candidates = [
    'content/email',
    'content/email/sequences.json',
    'sequences.json',
    'email/sequences.json',
    '.boldteq/sequences.json',
    'content/sequences',
  ]
  for (const rel of candidates) {
    const abs = path.resolve(cwd, rel)
    try {
      if (fs.existsSync(abs)) {
        ev.artifact = rel
        ev.present = true
        break
      }
    } catch {
      /* ignore */
    }
  }
  return ev // informational only — never warns or blocks
}

// ── fetch wrapper (always lib/pages.mjs authFetch — never bare fetch) ─────
async function fetchPage(url) {
  const res = await authFetch(url, {
    password,
    headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en', 'user-agent': UA },
  })
  return { status: res.status, html: await res.text(), headers: res.headers }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  if (!previewUrl) {
    console.error('ENV-ERROR: THEME_PREVIEW_URL not set (required for the conversion gate)')
    finish(2, { pass: false, evidence: { skipped: 'env', reason: 'THEME_PREVIEW_URL not set' } })
  }

  const cwd = process.cwd()
  console.log(`gate 7 (conversion) — ${previewUrl}${STRICT_TRUST ? ' [STRICT_TRUST]' : ''}`)
  const want = args.pages ?? DEFAULT_PAGES
  const resolved = await resolvePages({ previewUrl, password, want })

  const blockers = []
  const warnings = []
  const checkedPages = {}
  const skippedPages = []
  const seen = new Set()

  let footerEmailCapture = false // any page footer satisfies the email-capture check

  for (const p of resolved.pages) {
    if (p.skipped) {
      skippedPages.push({ id: p.id, reason: p.reason })
      console.log(`  page ${p.id} ... SKIP (${p.reason})`)
      continue
    }
    process.stdout.write(`  page ${p.id} ${p.path} ... `)
    const { status, html } = await fetchPage(p.url)
    if (status !== 200) {
      if (MANDATORY_PAGES.includes(p.id)) {
        console.log(`HTTP ${status}`)
        throw new EnvError(`mandatory page "${p.id}" returned HTTP ${status} at ${p.url}`)
      }
      skippedPages.push({ id: p.id, reason: `HTTP ${status}` })
      console.log(`SKIP (HTTP ${status})`)
      continue
    }
    seen.add(p.id)
    const before = blockers.length + warnings.length

    if (HERO_PAGES.has(p.id)) checkedPages[p.id] = checkHomeHero(p.id, html, { blockers })
    else if (p.id === 'pdp') checkedPages[p.id] = checkPdpBuyPath(html, { blockers, warnings })
    else if (p.id === 'cart') checkedPages[p.id] = checkCart(html, { blockers, warnings })
    else checkedPages[p.id] = { note: 'no mechanical conversion check for this page id' }

    // 7 — email capture (home dedicated, any page's footer as fallback)
    const stripped = stripNonContent(html)
    if (p.id === 'home') {
      const has = hasEmailCaptureForm(stripped)
      checkedPages[p.id].emailCapture = has
      if (!has && !footerEmailCapture) {
        warnings.push({
          id: 'conversion.email-capture',
          page: 'home',
          detail: 'no newsletter/email-signup form found on home or in the footer (a <form> with an email input)',
          evidence: '',
        })
      }
    } else if (!footerEmailCapture && hasEmailCaptureForm(stripped)) {
      footerEmailCapture = true
    }

    const found = blockers.length + warnings.length - before
    console.log(found === 0 ? 'ok' : `${found} finding(s)`)
  }

  // If home was checked first and warned for email, but a later page's footer
  // actually carries the form, retract the warning (footer is shared chrome).
  if (footerEmailCapture) {
    const i = warnings.findIndex(w => w.id === 'conversion.email-capture')
    if (i !== -1) warnings.splice(i, 1)
  }

  // 8 — decoder citations (static, repo-side)
  process.stdout.write('  repo (decoder citations) ... ')
  const decoder = checkDecoderCitations(cwd, { blockers, warnings })
  console.log(`${decoder.citations} citation(s) across ${decoder.scanned} section file(s)`)

  // 9 — lifecycle email triggers (static, informational)
  const lifecycle = checkLifecycleEmail(cwd)
  console.log(`  repo (lifecycle email) ... ${lifecycle.present ? `present (${lifecycle.artifact})` : 'no sequence artifact (informational)'}`)

  const pass = blockers.length === 0
  console.log(
    `conversion: ${blockers.length} blocker(s), ${warnings.length} warning(s) across ${Object.keys(checkedPages).length} page(s), ${skippedPages.length} skipped`,
  )
  finish(pass ? 0 : 1, {
    pass,
    blockers,
    warnings,
    evidence: { checkedPages, skippedPages, decoder, lifecycle, strictTrust: STRICT_TRUST },
  })
}

main().catch(err => {
  if (err instanceof EnvError || err?.isEnvError === true) {
    console.error(`ENV-ERROR: ${err.message}`)
    finish(2, { pass: false, evidence: { skipped: 'env', reason: err.message } })
  }
  console.error(`ENV-ERROR: unexpected failure: ${err.message}`)
  console.error(err.stack)
  finish(2, { pass: false, evidence: { skipped: 'env', reason: `unexpected: ${err.message}` } })
})
