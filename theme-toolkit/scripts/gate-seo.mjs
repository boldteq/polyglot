#!/usr/bin/env node
// Gate 6 — on-page SEO (lumen). Implements the 10 automated checks from
// ~/.claude/memory/patterns/good/shopify-onpage-seo-checklist.md §14.2 against
// the rendered storefront page matrix from lib/pages.mjs.
//
// Checks × applicability:
//    1  canonical count = 1 .............. home, pdp, collection, article
//    2  canonical correctness ............ pdp: ?variant= form + /collections/x/products/y
//                                          form must both canonicalize to /products/<handle>
//    3  title 10–70 / description 50–320 . title: all pages · description: pdp, collection, article
//    4  exactly one <h1> ................. all pages
//    5  JSON-LD .......................... parse + ≤1 Product/ProductGroup emitter: all pages
//                                          · Product required: pdp only
//                                          · Organization: blocker on home, warning elsewhere
//    6  no unintended noindex ............ home, pdp, collection, blog, article, page
//                                          (cart/search excluded — Shopify robots blocks them anyway)
//    7  og:title + og:image + twitter:card home, pdp, article
//    8  robots.txt + sitemap.xml ......... site-level: robots 200 + "Sitemap:" line,
//                                          sitemap 200 + <urlset|sitemapindex>
//    9  img alt + width/height ........... pdp, collection
//   10  eager/lazy split ................. pdp: first main-content <img> NOT loading="lazy" (blocker)
//                                          collection: grid <img> lazy beyond a 2-image LCP
//                                          allowance (heuristic → warning, never blocks)
//
// Env:   THEME_PREVIEW_URL                       required — else exit 2
//        THEME_STORE_PASSWORD / STOREFRONT_PASSWORD   storefront password (password walls)
//        FIRST_PRODUCT_HANDLE / FIRST_COLLECTION_HANDLE / BLOG_PATH / ARTICLE_PATH / PAGE_PATH
//                                                handle/path discovery overrides (lib/pages.mjs)
//        REPORT_DIR                              default: gate-reports
// Flags: --pages home,pdp,...    subset of the matrix (default: all 8)
//        --report-dir <dir>      overrides REPORT_DIR
// Out:   $REPORT_DIR/seo.json (schema via lib/report.mjs). Unresolvable optional
//        pages land in evidence.skippedPages and never block.
// Exit:  0 = pass · 1 = block · 2 = env error (no URL / password wall / discovery
//        or mandatory-page fetch hard-fail). Exit 2 NEVER reads as pass.
//
// No external deps — global fetch (Node 20), lib/pages.mjs authFetch for every request.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'
import { resolvePages, authFetch, EnvError, MANDATORY_PAGES, OPTIONAL_PAGES } from './lib/pages.mjs'

const started = Date.now()
const ALL_PAGE_IDS = [...MANDATORY_PAGES, ...OPTIONAL_PAGES]
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BoldteqThemeGates/1.0'

const APPLY = {
  canonical: new Set(['home', 'pdp', 'collection', 'article']),
  description: new Set(['pdp', 'collection', 'article']),
  noindex: new Set(['home', 'pdp', 'collection', 'blog', 'article', 'page']),
  og: new Set(['home', 'pdp', 'article']),
  img: new Set(['pdp', 'collection']),
}

// ── args ──────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`Gate 6 — on-page SEO (shopify-onpage-seo-checklist §14.2)

Usage:
  THEME_PREVIEW_URL=https://store.example node scripts/gate-seo.mjs [--pages home,pdp] [--report-dir <dir>]

Pages: ${ALL_PAGE_IDS.join(', ')} (blog/article/page are optional — unresolvable → evidence.skippedPages)
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
  const { file, report } = writeReport('seo', 6, { url: previewUrl, ...data, duration_ms: Date.now() - started }, args.reportDir)
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

// JSON-LD must be pulled from the RAW html — stripNonContent removes <script> blocks.
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

function tagAttr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i'))
  if (!m) return null
  return m[2] ?? m[3] ?? m[4] ?? ''
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  const t = decodeEntities(m[1]).replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

// first <meta> whose attrNames[i] equals `value` → decoded content (or null)
function metaContent(html, attrNames, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    for (const an of attrNames) {
      const v = tagAttr(tag, an)
      if (v && v.toLowerCase() === value) {
        const c = tagAttr(tag, 'content')
        if (c == null) return null
        const decoded = decodeEntities(c).replace(/\s+/g, ' ').trim()
        return decoded.length > 0 ? decoded : null
      }
    }
  }
  return null
}

function canonicalHrefs(html) {
  const out = []
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = tagAttr(tag, 'rel')
    if (rel && /(^|\s)canonical(\s|$)/i.test(rel)) out.push(tagAttr(tag, 'href') ?? '')
  }
  return out
}

function mainSlice(html) {
  const m = html.search(/<main\b/i)
  if (m !== -1) return html.slice(m)
  const mc = html.search(/id=["']MainContent["']/i)
  if (mc !== -1) return html.slice(mc)
  const h = html.search(/<\/header>/i)
  return h !== -1 ? html.slice(h) : html
}

function typesOf(node) {
  if (!node || typeof node !== 'object') return []
  const t = node['@type']
  if (Array.isArray(t)) return t.map(String)
  return t ? [String(t)] : []
}

// JSON-LD root nodes: plain object, array of objects, or @graph members.
function rootNodes(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed['@graph'])) return parsed['@graph']
    return [parsed]
  }
  return []
}

function isProductType(t) {
  return t === 'Product' || t === 'ProductGroup'
}

// Organization + common schema.org Organization subtypes the themes emit
function isOrgType(t) {
  return t === 'Organization' || /Organization$/.test(t) || ['OnlineStore', 'Corporation', 'LocalBusiness', 'Store'].includes(t)
}

const LAZY_RE = /\sloading\s*=\s*["']?lazy/i

// #29 — expected JSON-LD per page-type (warning-level: recommended for rich results, not all themes
// emit every type). PURE + exported for the fixture. `types` = all @type strings found on the page.
export function schemaGapsFor(pageId, types) {
  const has = (re) => (types || []).some(t => re.test(String(t)))
  const gaps = []
  if (pageId === 'article' && !has(/^(Article|BlogPosting|NewsArticle)$/)) gaps.push('Article/BlogPosting')
  if ((pageId === 'pdp' || pageId === 'collection') && !has(/^BreadcrumbList$/)) gaps.push('BreadcrumbList')
  return gaps
}

// ── fetch wrapper (always lib/pages.mjs authFetch — never bare fetch) ──────
async function fetchPage(url) {
  const res = await authFetch(url, {
    password,
    headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en', 'user-agent': UA },
  })
  return { status: res.status, html: await res.text(), headers: res.headers }
}

// ── per-page analysis (checks 1, 3, 4, 5, 6, 7, 9, 10) ────────────────────
function analyzePage({ id, path: pagePath }, rawHtml, headers, { blockers, warnings }) {
  const jsonldBlocks = extractJsonLd(rawHtml)
  const html = stripNonContent(rawHtml)
  const ev = { path: pagePath }

  // 1 — canonical count
  const canon = canonicalHrefs(html)
  ev.canonicals = canon.length
  if (APPLY.canonical.has(id) && canon.length !== 1) {
    blockers.push({
      id: 'seo.canonical-count',
      page: id,
      detail: `${canon.length} rel="canonical" tags (expected exactly 1)`,
      evidence: canon.slice(0, 3).join(' | '),
    })
  }

  // 3 — title 10–70 (all pages)
  const title = extractTitle(html)
  ev.title_len = title ? title.length : 0
  if (!title) {
    blockers.push({ id: 'seo.title', page: id, detail: 'no <title>', evidence: '' })
  } else if (title.length < 10 || title.length > 70) {
    blockers.push({ id: 'seo.title', page: id, detail: `title length ${title.length} (pass: 10–70)`, evidence: title.slice(0, 120) })
  }

  // 3 — meta description 50–320 (pdp, collection, article)
  if (APPLY.description.has(id)) {
    const desc = metaContent(html, ['name'], 'description')
    ev.desc_len = desc ? desc.length : 0
    if (!desc) {
      blockers.push({ id: 'seo.meta-description', page: id, detail: 'no meta description (pass: present, 50–320 chars)', evidence: '' })
    } else if (desc.length < 50 || desc.length > 320) {
      blockers.push({
        id: 'seo.meta-description',
        page: id,
        detail: `meta description length ${desc.length} (pass: 50–320)`,
        evidence: desc.slice(0, 120),
      })
    }
  }

  // 4 — exactly one <h1> (all pages)
  const h1 = (html.match(/<h1[\s/>]/gi) || []).length
  ev.h1 = h1
  if (h1 !== 1) {
    blockers.push({ id: 'seo.h1-count', page: id, detail: `${h1} <h1> elements (expected exactly 1)`, evidence: '' })
  }

  // 5 — JSON-LD: every block parses, ≤1 Product emitter, Organization present
  let productBlocks = 0
  let orgPresent = false
  let badBlocks = 0
  const allTypes = []
  for (const [i, src] of jsonldBlocks.entries()) {
    let parsed
    try {
      parsed = JSON.parse(src)
    } catch (err) {
      badBlocks += 1
      blockers.push({
        id: 'seo.jsonld-parse',
        page: id,
        detail: `JSON-LD block ${i + 1}/${jsonldBlocks.length} fails to parse: ${err.message}`,
        evidence: src.replace(/\s+/g, ' ').slice(0, 160),
      })
      continue
    }
    const types = rootNodes(parsed).flatMap(typesOf)
    allTypes.push(...types)
    if (types.some(isProductType)) productBlocks += 1
    if (types.some(isOrgType)) orgPresent = true
  }
  // #29 — recommended structured-data per page-type (Article on articles, BreadcrumbList on pdp/collection)
  for (const g of schemaGapsFor(id, allTypes)) {
    warnings.push({ id: 'seo.jsonld-page-type', page: id, detail: `${id} page is missing recommended ${g} JSON-LD (rich-result eligibility)`, evidence: '' })
  }
  ev.jsonld = jsonldBlocks.length
  ev.jsonld_bad = badBlocks
  ev.product_ld = productBlocks
  ev.org_ld = orgPresent
  if (productBlocks > 1) {
    blockers.push({
      id: 'seo.jsonld-product-dupe',
      page: id,
      detail: `${productBlocks} Product/ProductGroup JSON-LD emitters (max 1 — double-emit = conflicting structured data)`,
      evidence: '',
    })
  }
  if (id === 'pdp' && productBlocks === 0) {
    blockers.push({ id: 'seo.jsonld-product-missing', page: 'pdp', detail: 'no Product/ProductGroup JSON-LD on PDP', evidence: '' })
  }
  if (!orgPresent) {
    const entry = { id: 'seo.jsonld-organization', page: id, detail: 'no Organization JSON-LD', evidence: '' }
    if (id === 'home') blockers.push(entry)
    else warnings.push(entry)
  }

  // 6 — no unintended noindex (indexable templates only)
  if (APPLY.noindex.has(id)) {
    const signals = [metaContent(html, ['name'], 'robots'), metaContent(html, ['name'], 'googlebot'), headers.get('x-robots-tag') || '']
    const offenders = signals.filter(v => v && /noindex|(^|[,\s])none([,\s]|$)/i.test(v))
    ev.noindex = offenders.length > 0
    if (offenders.length > 0) {
      blockers.push({
        id: 'seo.noindex',
        page: id,
        detail: 'indexable template carries noindex (use seo.hidden intentionally, not theme markup)',
        evidence: offenders.join(' | ').slice(0, 160),
      })
    }
  }

  // 7 — og:title / og:image / twitter:card (home, pdp, article)
  if (APPLY.og.has(id)) {
    const missing = []
    if (!metaContent(html, ['property', 'name'], 'og:title')) missing.push('og:title')
    if (!metaContent(html, ['property', 'name'], 'og:image') && !metaContent(html, ['property', 'name'], 'og:image:secure_url')) {
      missing.push('og:image')
    }
    if (!metaContent(html, ['name', 'property'], 'twitter:card')) missing.push('twitter:card')
    if (missing.length > 0) {
      blockers.push({ id: 'seo.og-tags', page: id, detail: `missing social meta: ${missing.join(', ')}`, evidence: '' })
    }
  }

  // 9 — img alt coverage + width/height (pdp, collection)
  if (APPLY.img.has(id)) {
    const imgs = html.match(/<img\b[^>]*>/gi) || []
    const noAlt = imgs.filter(t => !/\salt\s*(=|\s|\/|>)/i.test(t))
    const noDims = imgs.filter(t => !(/\swidth\s*=/i.test(t) && /\sheight\s*=/i.test(t)))
    ev.imgs = imgs.length
    ev.imgs_no_alt = noAlt.length
    ev.imgs_no_dims = noDims.length
    if (noAlt.length > 0) {
      blockers.push({
        id: 'seo.img-alt',
        page: id,
        detail: `${noAlt.length}/${imgs.length} <img> without alt attribute`,
        evidence: noAlt.slice(0, 2).map(t => t.slice(0, 100)).join(' | '),
      })
    }
    if (noDims.length > 0) {
      blockers.push({
        id: 'seo.img-dimensions',
        page: id,
        detail: `${noDims.length}/${imgs.length} <img> without width+height attributes`,
        evidence: noDims.slice(0, 2).map(t => t.slice(0, 100)).join(' | '),
      })
    }
  }

  // 10 — eager/lazy split
  if (id === 'pdp') {
    const first = (mainSlice(html).match(/<img\b[^>]*>/i) || [])[0] ?? null
    if (!first) {
      warnings.push({ id: 'seo.pdp-gallery-lazy', page: 'pdp', detail: 'no <img> found in main content — eager/lazy check skipped', evidence: '' })
    } else if (LAZY_RE.test(first)) {
      blockers.push({
        id: 'seo.pdp-gallery-lazy',
        page: 'pdp',
        detail: 'first gallery <img> is loading="lazy" (the LCP image must load eagerly)',
        evidence: first.slice(0, 160),
      })
    }
  }
  if (id === 'collection') {
    const imgs = mainSlice(html).match(/<img\b[^>]*>/gi) || []
    const eager = imgs.slice(2).filter(t => !LAZY_RE.test(t)) // 2-image LCP allowance (banner + first card)
    if (eager.length > 0) {
      warnings.push({
        id: 'seo.card-images-eager',
        page: 'collection',
        detail: `${eager.length}/${imgs.length} grid <img> without loading="lazy" (beyond 2-image LCP allowance)`,
        evidence: eager.slice(0, 2).map(t => t.slice(0, 100)).join(' | '),
      })
    }
  }

  return ev
}

// ── check 2: canonical correctness on the two PDP URL forms ───────────────
function canonicalVerdict(href, cleanPath, origin) {
  if (!href) return 'no canonical tag'
  let u
  try {
    u = new URL(href, origin)
  } catch {
    return `unparseable canonical href "${href}"`
  }
  if (u.searchParams.has('variant')) return 'canonical retains ?variant='
  if (u.pathname.replace(/\/+$/, '') !== cleanPath) return `canonical pathname ${u.pathname} ≠ ${cleanPath}`
  return null
}

async function checkCanonicalForms({ pdpPage, collectionHandle, withPreserved, origin, blockers, warnings }) {
  const out = {}
  const handle = (pdpPage.path.match(/\/products\/([^/?#]+)/) || [])[1]
  if (!handle) {
    warnings.push({
      id: 'seo.canonical-variant',
      page: 'pdp',
      detail: 'could not derive product handle from PDP path — canonical-form checks skipped',
      evidence: pdpPage.path,
    })
    out.variant = 'skipped: no handle'
    out.collectionForm = 'skipped: no handle'
    return out
  }
  const cleanPath = `/products/${handle}`

  // 2a — ?variant= form
  let variantId = null
  try {
    const res = await authFetch(withPreserved(`/products/${handle}.js`), {
      password,
      headers: { accept: 'application/json', 'user-agent': UA },
    })
    if (res.ok) {
      const data = await res.json()
      variantId = data?.variants?.[0]?.id ?? null
    }
  } catch (err) {
    if (err instanceof EnvError) throw err
    console.error(`[seo] variant id lookup failed: ${err.message}`)
  }
  if (!variantId) {
    warnings.push({
      id: 'seo.canonical-variant',
      page: 'pdp',
      detail: 'no variant id resolvable via /products/<handle>.js — ?variant= canonical check skipped',
      evidence: `${handle}.js`,
    })
    out.variant = 'skipped: no variant id'
  } else {
    const vu = new URL(pdpPage.url)
    vu.searchParams.set('variant', String(variantId))
    const { status, html } = await fetchPage(vu.toString())
    if (status !== 200) {
      warnings.push({
        id: 'seo.canonical-variant',
        page: 'pdp',
        detail: `?variant= form returned HTTP ${status} — check skipped`,
        evidence: vu.toString(),
      })
      out.variant = `skipped: HTTP ${status}`
    } else {
      const href = canonicalHrefs(stripNonContent(html))[0] ?? null
      const verdict = canonicalVerdict(href, cleanPath, origin)
      if (verdict) {
        blockers.push({ id: 'seo.canonical-variant', page: 'pdp', detail: `?variant= page: ${verdict}`, evidence: String(href ?? '') })
        out.variant = 'fail'
      } else {
        out.variant = 'ok'
      }
    }
  }

  // 2b — /collections/<x>/products/<handle> form (try /collections/all first — auto-collection)
  const candidates = ['all']
  if (collectionHandle && collectionHandle !== 'all') candidates.push(collectionHandle)
  let evaluated = false
  for (const c of candidates) {
    const formPath = `/collections/${c}${cleanPath}`
    const { status, html } = await fetchPage(withPreserved(formPath))
    if (status !== 200) continue
    const href = canonicalHrefs(stripNonContent(html))[0] ?? null
    const verdict = canonicalVerdict(href, cleanPath, origin)
    if (verdict) {
      blockers.push({ id: 'seo.canonical-collection-form', page: 'pdp', detail: `${formPath}: ${verdict}`, evidence: String(href ?? '') })
      out.collectionForm = 'fail'
    } else {
      out.collectionForm = 'ok'
    }
    evaluated = true
    break
  }
  if (!evaluated) {
    warnings.push({
      id: 'seo.canonical-collection-form',
      page: 'pdp',
      detail: `no reachable /collections/<x>${cleanPath} form (tried: ${candidates.join(', ')}) — check skipped`,
      evidence: '',
    })
    out.collectionForm = 'skipped: unreachable'
  }
  return out
}

// ── check 8: robots.txt + sitemap.xml ─────────────────────────────────────
async function checkSite(origin, { blockers }) {
  const site = {}

  const robots = await fetchPage(`${origin}/robots.txt`)
  if (robots.status !== 200) {
    blockers.push({ id: 'seo.robots-txt', page: 'site', detail: `robots.txt returned HTTP ${robots.status}`, evidence: `${origin}/robots.txt` })
    site.robots_txt = `HTTP ${robots.status}`
  } else if (!/^\s*sitemap\s*:/im.test(robots.html)) {
    blockers.push({ id: 'seo.robots-txt', page: 'site', detail: 'robots.txt has no Sitemap: directive', evidence: robots.html.slice(0, 160) })
    site.robots_txt = '200, no Sitemap:'
  } else {
    site.robots_txt = 'ok'
  }

  const sitemap = await fetchPage(`${origin}/sitemap.xml`)
  if (sitemap.status !== 200) {
    blockers.push({ id: 'seo.sitemap', page: 'site', detail: `sitemap.xml returned HTTP ${sitemap.status}`, evidence: `${origin}/sitemap.xml` })
    site.sitemap_xml = `HTTP ${sitemap.status}`
  } else if (!/<\s*(sitemapindex|urlset)\b/i.test(sitemap.html)) {
    blockers.push({ id: 'seo.sitemap', page: 'site', detail: 'sitemap.xml is not a valid XML sitemap (<sitemapindex>/<urlset> missing)', evidence: sitemap.html.slice(0, 160) })
    site.sitemap_xml = '200, not XML sitemap'
  } else {
    site.sitemap_xml = 'ok'
  }

  return site
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  if (!previewUrl) {
    console.error('ENV-ERROR: THEME_PREVIEW_URL not set (required for the SEO gate)')
    finish(2, { pass: false, evidence: { skipped: 'env', reason: 'THEME_PREVIEW_URL not set' } })
  }

  console.log(`gate 6 (seo) — ${previewUrl}`)
  const want = args.pages ?? ALL_PAGE_IDS
  const resolved = await resolvePages({ previewUrl, password, want })
  const { origin, preserved } = resolved

  const withPreserved = (pathAndQuery) => {
    const u = new URL(pathAndQuery, origin)
    for (const [k, v] of Object.entries(preserved)) u.searchParams.set(k, v)
    return u.toString()
  }

  const blockers = []
  const warnings = []
  const checkedPages = {}
  const skippedPages = []
  const pagesById = new Map()

  for (const p of resolved.pages) {
    if (p.skipped) {
      skippedPages.push({ id: p.id, reason: p.reason })
      console.log(`  page ${p.id} ... SKIP (${p.reason})`)
      continue
    }
    process.stdout.write(`  page ${p.id} ${p.path} ... `)
    const { status, html, headers } = await fetchPage(p.url)
    if (status !== 200) {
      if (MANDATORY_PAGES.includes(p.id)) {
        console.log(`HTTP ${status}`)
        throw new EnvError(`mandatory page "${p.id}" returned HTTP ${status} at ${p.url}`)
      }
      skippedPages.push({ id: p.id, reason: `HTTP ${status}` })
      console.log(`SKIP (HTTP ${status})`)
      continue
    }
    pagesById.set(p.id, p)
    const before = blockers.length + warnings.length
    checkedPages[p.id] = analyzePage(p, html, headers, { blockers, warnings })
    const found = blockers.length + warnings.length - before
    console.log(found === 0 ? 'ok' : `${found} finding(s)`)
  }

  // check 2 — canonical correctness URL forms (only when pdp is in scope)
  let canonicalForms = { variant: 'skipped: pdp not in scope', collectionForm: 'skipped: pdp not in scope' }
  if (pagesById.has('pdp')) {
    const collectionHandle = (pagesById.get('collection')?.path.match(/\/collections\/([^/?#]+)/) || [])[1] ?? null
    process.stdout.write('  canonical forms (?variant= + /collections/x/products/y) ... ')
    canonicalForms = await checkCanonicalForms({ pdpPage: pagesById.get('pdp'), collectionHandle, withPreserved, origin, blockers, warnings })
    console.log(`variant=${canonicalForms.variant}, collectionForm=${canonicalForms.collectionForm}`)
  }

  // check 8 — robots.txt + sitemap.xml
  process.stdout.write('  site (robots.txt + sitemap.xml) ... ')
  const site = await checkSite(origin, { blockers })
  console.log(`robots=${site.robots_txt}, sitemap=${site.sitemap_xml}`)

  const pass = blockers.length === 0
  console.log(`seo: ${blockers.length} blocker(s), ${warnings.length} warning(s) across ${Object.keys(checkedPages).length} page(s), ${skippedPages.length} skipped`)
  finish(pass ? 0 : 1, { pass, blockers, warnings, evidence: { checkedPages, skippedPages, canonicalForms, site } })
}

if (isMain(import.meta.url)) {
  main().catch(err => {
    if (err instanceof EnvError || err?.isEnvError === true) {
      console.error(`ENV-ERROR: ${err.message}`)
      finish(2, { pass: false, evidence: { skipped: 'env', reason: err.message } })
    }
    console.error(`ENV-ERROR: unexpected failure: ${err.message}`)
    console.error(err.stack)
    finish(2, { pass: false, evidence: { skipped: 'env', reason: `unexpected: ${err.message}` } })
  })
}
