#!/usr/bin/env node
// Lens — Visual Truth Layer · LAYER 1: CAPTURE (deterministic). The gate stack reads JSON/Liquid/
// settings but NEVER looks at pixels — so spacing collisions, horizontal overflow, broken hierarchy,
// and mis-placed sections are invisible to every gate. Lens opens a real browser and captures the
// rendered surfaces so a vision judge (Layer 2) can SEE them. This script is the eyes; it makes no
// judgments — it produces frames + a metrics manifest. (Plan: "The Visual Truth Layer", 2026-06-19.)
//
// For each surface × viewport × state it screenshots the rendered page and records DOM-level facts a
// screenshot alone can't carry (overflow px, broken images, console/page errors, cumulative layout
// shift, paint timings). Built on Playwright (already used by gate-functional.mjs) against the staging
// URL mantle exposes — zero new infra.
//
// Usage: node lens-capture.mjs [--surfaces home,pdp,…] [--viewports mobile,tablet,desktop]
// Env:
//   THEME_PREVIEW_URL   (required) the staging/preview URL (mantle's unpublished theme)
//   THEME_STORE_PASSWORD / STOREFRONT_PASSWORD   storefront password (if behind /password)
//   REPORT_DIR          default gate-reports  (frames → <REPORT_DIR>/lens/…)
//   FIRST_PRODUCT_HANDLE / FIRST_COLLECTION_HANDLE   pin the PDP/collection target (else auto-resolve)
//   LENS_DARK=1         also capture the dark scheme (prefers-color-scheme: dark)
//
// Exit: 0 = captured (manifest written) · 2 = env error (no URL / password wall / missing dep / unreachable)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const DEP_HINT = 'npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium'

// 6 viewports (WS-A1). `device` = a Playwright device profile (real UA/touch/scale → iOS-Safari quirks)
// applied when present; width/height always override so we pin the exact breakpoint. FAST depth uses the
// 3 core widths; FULL adds 320 (small-mobile overflow), 414 (large-mobile), 1920 (wide-desktop).
const VIEWPORTS = [
  { name: 'mobile-sm', width: 320, height: 568, isMobile: true, deviceScaleFactor: 2, device: 'iPhone SE', tier: 'full' },
  { name: 'mobile', width: 375, height: 812, isMobile: true, deviceScaleFactor: 3, device: 'iPhone 13', tier: 'fast' },
  { name: 'mobile-lg', width: 414, height: 896, isMobile: true, deviceScaleFactor: 2, device: 'iPhone 11', tier: 'full' },
  { name: 'tablet', width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2, device: 'iPad (gen 7)', tier: 'fast' },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1, tier: 'fast' },
  { name: 'desktop-lg', width: 1920, height: 1080, isMobile: false, deviceScaleFactor: 1, tier: 'full' },
]
// surface → path resolver key. PDP/collection auto-resolve from the storefront unless pinned.
const DEFAULT_SURFACES = ['home', 'collection', 'pdp', 'cart', 'search', 'account']
// LENS_DEPTH gates capture cost: fast (dev) = 3 core viewports + base frames; full (publish-grade) =
// 6 viewports + mid-scroll + occluder-clear + content states + conditional per-locale (WS-A guardrail).
const DEPTH = (process.env.LENS_DEPTH || (process.env.DS_REQUIRE_SCOPE === '1' || process.env.LENS_REQUIRE === '1' ? 'full' : 'fast')).toLowerCase()

// ── PURE planning helpers (no browser/IO → hermetically testable; exported for the fixture) ──
// The base frame KEY is backward-compatible: `surface-viewport` for the default state+locale (existing
// judge verdicts/fixtures keep working); a non-base content state or non-default locale appends a suffix.
export function frameKey({ surface, viewport, state = 'base', locale = 'default' }) {
  return `${surface}-${viewport}${state && state !== 'base' ? `-${state}` : ''}${locale && locale !== 'default' ? `-${locale}` : ''}`
}
// Which image states to capture within ONE surface×viewport page visit. Mid-scroll/hover are EXTRA
// images in the same frame-set (one judge verdict), NOT separate verdicts — keeps judge cost sane.
export function frameStates(surface, depth) {
  if (depth !== 'full') return ['rest', 'scrollEnd']
  const long = ['home', 'pdp', 'collection'].includes(surface)
  const states = ['rest']
  if (long) states.push('scroll25', 'scroll50', 'scroll75')
  states.push('scrollEnd')
  if (['home', 'pdp'].includes(surface)) states.push('hover')
  return states
}
// Content STATES that change the page (own frame-set → own verdict). Best-effort; skipped if setup fails.
export function contentStates(surface, depth) {
  if (depth !== 'full') return []
  if (surface === 'cart') return ['populated']
  // BUG-1: the cart DRAWER (slide-out) was never captured — only the /cart page. Open it from the PDP
  // (add-to-cart → drawer), assert it opened, and capture it so the judge can SEE the real cart UX.
  if (surface === 'pdp') return ['drawer']
  return []
}
// The capture matrix: surface × viewport × locale × theme. Pure. (Image states handled within a visit.)
export function planCaptures({ surfaces, viewports, locales = ['default'], themes = ['light'] }) {
  const plan = []
  for (const locale of locales) for (const vp of viewports) for (const theme of themes) for (const s of surfaces) {
    plan.push({ surface: s.surface, url: s.url, viewport: vp.name, width: vp.width, height: vp.height, device: vp.device || null, theme, locale })
  }
  return plan
}
// Append ?locale=xx to a surface URL (PURE). Used only for non-default locales.
export function addLocale(u, locale) { try { const x = new URL(u); x.searchParams.set('locale', locale); return x.toString() } catch { return u } }

class EnvError extends Error {}
const die = (code, msg) => { console.error(`lens-capture: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }

function parseArgs(argv) {
  // viewports null → main fills by DEPTH (fast = tier:'fast' three; full = all six)
  const out = { surfaces: [...DEFAULT_SURFACES], viewports: null }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { console.log('node lens-capture.mjs [--surfaces …] [--viewports …]'); process.exit(0) }
    else if (a === '--surfaces') out.surfaces = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--viewports') out.viewports = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else die(2, `unknown arg: ${a}`)
  }
  return out
}

const onPasswordPage = (page) => { try { return /\/password\/?$/.test(new URL(page.url()).pathname) } catch { return false } }
async function gotoWithAuth(page, url, password) {
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 })
  if (onPasswordPage(page)) {
    if (!password) throw new EnvError(`${url} redirects to /password and no THEME_STORE_PASSWORD provided`)
    const input = page.locator('form[action*="password"] input[name="password"], input[name="password"]').first()
    await input.fill(password); await input.press('Enter'); await page.waitForLoadState('load')
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 })
    if (onPasswordPage(page)) throw new EnvError(`storefront password rejected at ${new URL(url).origin}/password`)
  }
}

// Dismiss a blocking consent/cookie overlay so the hero + below-overlay content becomes judgeable.
// The overlay is ALREADY captured in the `rest` frame first (chrome-on-brand still fires on it); this
// only unblocks the page beneath for the layout/headline/art-direction checks (a centered consent
// modal otherwise occludes the hero, so the vision judge can't see it — gpt-test-1 2026-06-21).
// Read-only (clicks an Accept control → sets a consent cookie + hides the banner) — safe in an
// ephemeral capture context. Exact-label match + length cap keeps false-clicks ~nil. Returns true if it acted.
async function dismissOccluders(page) {
  try {
    const acted = await page.evaluate(() => {
      const ACCEPT = /^(accept all|accept|i accept|accept cookies|agree|i agree|allow all|allow|got it|ok|okay|enable all|continue|confirm)$/i
      const CLOSE = /^(close|dismiss|no thanks|no, thanks|maybe later|not now|×|✕|✖|x)$/i  // promo / exit-intent close glyphs + opt-outs
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && el.offsetParent !== null }
      let did = false
      const cands = [...document.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], [aria-label]')]
      for (const el of cands) {
        const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim()
        if (!label || label.length > 24) continue
        const aria = (el.getAttribute('aria-label') || '')
        if ((ACCEPT.test(label) || CLOSE.test(label) || /\b(close|dismiss)\b/i.test(aria)) && visible(el)) { el.click(); did = true }
      }
      return did
    })
    if (acted) await page.waitForTimeout(500)
    return acted
  } catch { return false }
}

// Conditional locale detection (WS-A3): return ['default'] for a single-language store, or
// ['default', <secondary langs…>] when the storefront publishes >1 language (Shopify emits
// <link rel="alternate" hreflang> per published locale). 'default' = primary (no ?locale, no key suffix).
async function detectLocales(page) {
  try {
    const { primary, langs } = await page.evaluate(() => {
      const primary = (document.documentElement.lang || '').split('-')[0].toLowerCase()
      const langs = [...new Set([...document.querySelectorAll('link[rel="alternate"][hreflang]')]
        .map(l => (l.getAttribute('hreflang') || '').split('-')[0].toLowerCase()).filter(h => h && h !== 'x-default'))]
      return { primary, langs }
    })
    const secondary = langs.filter(l => l && l !== primary).slice(0, 3)
    return secondary.length ? ['default', ...secondary] : ['default']
  } catch { return ['default'] }
}

// Best-effort: add the first available variant of the resolved PDP to the cart (for the cart 'populated'
// content state). Throws on failure so the caller skips that state without breaking the run.
async function addToCart(page, surfaces) {
  const pdp = (surfaces.find(s => s.surface === 'pdp') || {}).url
  if (!pdp) throw new Error('no pdp to populate cart')
  await page.goto(pdp, { waitUntil: 'load', timeout: 30_000 })
  const vid = await page.evaluate(async () => {
    try { const h = location.pathname.split('/products/')[1]?.split(/[?#]/)[0]; const r = await fetch(`/products/${h}.js`); const j = await r.json(); return (j.variants || []).find(v => v.available)?.id || j.variants?.[0]?.id || null } catch { return null }
  })
  if (!vid) throw new Error('no resolvable variant')
  await page.evaluate(async (id) => { await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, quantity: 1 }) }) }, vid)
}

// Open the cart DRAWER (slide-out) AND verify it actually opened — theme-agnostic (Dawn `<cart-drawer>`,
// Minimog `<slide-cart>`/`data-cart-drawer-toggle`, custom headers). BUG-1/BUG-2: the drawer was never
// captured, and the a11y gate clicked a toggle without asserting it opened (so it scanned a CLOSED drawer
// on Dawn/custom headers). Returns { opened, via } or { opened:false, reason } — the caller records it as
// a hard fact so a drawer that won't open is itself a finding, not a silent skip.
async function openCartDrawer(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const isOpenDrawer = () => {
      const SEL = 'cart-drawer[open], cart-drawer.active, cart-drawer.is-open, slide-cart[open], slide-cart.is-open, .cart-drawer.active, .cart-drawer.is-open, .cart-drawer.open, .drawer--cart.active, .mini-cart.is-open, .mini-cart.open, .cart-popup.open, #CartDrawer.active, [id*="cart" i][aria-hidden="false"][role="dialog"]'
      for (const el of document.querySelectorAll(SEL)) {
        const r = el.getBoundingClientRect()
        if (r.width > 120 && r.height > 160 && el.offsetParent !== null) return true
      }
      // generic: a fixed/absolute, cart-named, visibly-large panel that's on-screen
      for (const el of document.querySelectorAll('aside, dialog, [role="dialog"], .drawer, [class*="drawer" i], [class*="cart" i]')) {
        const cartish = /cart/i.test(`${el.id} ${el.className}`)
        if (!cartish || el.offsetParent === null) continue
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
        if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 200 && r.height > 240 && r.right > 0 && r.left < window.innerWidth) return true
      }
      return false
    }
    if (isOpenDrawer()) return { opened: true, via: 'already-open' }
    const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null }
    const TOGGLES = ['[data-cart-drawer-toggle]', '#cart-icon-bubble', '.header__icon--cart', 'a[href="/cart"]', 'a[href$="/cart"]', '.cart-icon', '[data-cart-toggle]', '.js-cart-trigger', '[aria-controls*="cart" i]', '[aria-label*="cart" i]']
    for (const sel of TOGGLES) {
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue
        try { el.click() } catch { /* not clickable */ }
        await sleep(450)
        if (isOpenDrawer()) return { opened: true, via: sel }
      }
    }
    // theme custom-element / event fallbacks (Dawn/Minimog dispatch their own open events)
    try {
      const cd = document.querySelector('cart-drawer, slide-cart')
      if (cd && typeof cd.open === 'function') { cd.open(); await sleep(450); if (isOpenDrawer()) return { opened: true, via: 'element.open()' } }
      for (const ev of ['cart:open', 'cart:toggle', 'cart-drawer:open', 'openCart']) document.dispatchEvent(new CustomEvent(ev))
      await sleep(450); if (isOpenDrawer()) return { opened: true, via: 'event' }
    } catch { /* no custom API */ }
    return { opened: false, reason: 'no toggle/API opened a visible cart drawer (theme may lack a drawer, or uses a custom selector)' }
  })
}

// Resolve the concrete URL for each requested surface against the live storefront.
// PDP/collection resolve from the AUTHORITATIVE products.json/collections.json (a real,
// published handle) — NOT by scraping the first `/products/` link, which can point at a
// draft/deleted product that 404s (Meridian dogfood 2026-06-19: the homepage linked
// `/products/morning-protocol` which isn't published → the captured "PDP" was a 404 page).
async function resolveSurfaceUrls(page, origin, password, want) {
  const url = (p) => new URL(p, origin).toString()
  const map = { home: url('/'), cart: url('/cart'), search: url('/search?q=a'), account: url('/account/login') }
  const fetchJson = (p) => page.evaluate(async (u) => { try { const r = await fetch(u); if (!r.ok) return null; return await r.json() } catch { return null } }, url(p))
  if (want.includes('pdp')) {
    let handle = process.env.FIRST_PRODUCT_HANDLE
    if (!handle) {
      const pj = await fetchJson('/products.json?limit=10').catch(() => null)
      // first non-gift-card published product
      handle = (pj?.products || []).map(p => p.handle).find(h => h && h !== 'gift-card') || null
      if (!handle) { // fallback: scrape a homepage product link
        try { await gotoWithAuth(page, url('/'), password)
          handle = await page.evaluate(() => { const a = document.querySelector('a[href*="/products/"]'); const m = a && a.getAttribute('href').match(/\/products\/([^/?#]+)/); return m ? m[1] : null }) } catch {}
      }
    }
    if (handle) map.pdp = url(`/products/${handle}`)
  }
  if (want.includes('collection')) {
    let handle = process.env.FIRST_COLLECTION_HANDLE
    if (!handle) {
      const cj = await fetchJson('/collections.json?limit=10').catch(() => null)
      handle = (cj?.collections || []).map(c => c.handle).find(h => h && h !== 'frontpage') || null
    }
    map.collection = url(handle ? `/collections/${handle}` : '/collections/all')
  }
  return want.map(s => ({ surface: s, url: map[s] || null })).filter(x => x.url)
}

// #8 — resolve secondary surfaces (blog/article/policy/gift-card) for the FULL-depth sweep. Best-effort:
// every probe is guarded so a missing surface is simply omitted (its rubric still ships); a 404 capture
// would flag a broken one. Navigates `page` (the resolver page) — callers use fresh contexts after.
async function resolveSecondarySurfaces(page, origin) {
  const out = []
  const u = (p) => new URL(p, origin).toString()
  // blog listing + first article
  try {
    const blogHref = await page.evaluate(() => { const a = document.querySelector('a[href*="/blogs/"]'); return a ? a.getAttribute('href') : null })
    const m = (blogHref || '/blogs/news').match(/\/blogs\/[^/?#]+/)
    const blogPath = m ? m[0] : '/blogs/news'
    out.push({ surface: 'blog', url: u(blogPath) })
    try {
      await page.goto(u(blogPath), { waitUntil: 'load', timeout: 30_000 })
      const art = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="/blogs/"]')].find(x => /\/blogs\/[^/?#]+\/[^/?#]+/.test(x.getAttribute('href') || '')); return a ? a.getAttribute('href') : null })
      if (art) out.push({ surface: 'article', url: u(art.split(/[?#]/)[0]) })
    } catch { /* no article */ }
  } catch { /* no blog */ }
  // a policy / info page (footer link, else the Shopify standard refund-policy path)
  try {
    const polHref = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="/policies/"], a[href*="/pages/"]')].find(x => /policy|terms|privacy|refund|shipping/i.test(x.href)); return a ? a.getAttribute('href') : null })
    out.push({ surface: 'policy', url: u((polHref || '/policies/refund-policy').split(/[?#]/)[0]) })
  } catch { out.push({ surface: 'policy', url: u('/policies/refund-policy') }) }
  // gift-card product (only if published)
  try {
    const ok = await page.evaluate(async (o) => { try { const r = await fetch(`${o}/products/gift-card.js`); return r.ok } catch { return false } }, origin)
    if (ok) out.push({ surface: 'gift-card', url: u('/products/gift-card') })
  } catch { /* no gift card */ }
  return out
}

// Storefront error pages (CLI 502, theme 404, render failure) render HTTP-200-ish bodies the
// Liquid-error scan misses — detect them explicitly so the DETERMINISTIC layer flags a broken
// surface, not just the vision judge (Meridian dogfood: desktop PDP 502 + mobile PDP 404 slipped
// the manifest with nav=ok). Returns a reason string or null.
function renderErrorIn(text, httpStatus) {
  if (httpStatus && httpStatus >= 500) return `http ${httpStatus}`
  if (/Failed to render storefront|status 502|Bad Gateway|Internal Server Error|should not be disturbed or locked/i.test(text)) return 'storefront render error (502/proxy)'
  if (/\bPage not found\b/i.test(text) && /\b404\b/.test(text)) return '404 page-not-found template'
  return null
}

// In-page facts a screenshot can't carry. Runs in the browser.
async function domMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const overflowPx = Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
    const brokenImgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src).slice(0, 8)
    // empty section shells: a <section>/[id^=shopify-section] with no visible text and no <img>
    const emptyShells = [...document.querySelectorAll('.shopify-section, section, [id^="shopify-section"]')]
      .filter(s => { const r = s.getBoundingClientRect(); return r.height > 40 && (s.innerText || '').trim().length < 2 && !s.querySelector('img,svg,video,iframe,[style*="background-image"]') })
      .map(s => s.id || s.className).slice(0, 6)
    const liquidErr = /Liquid error|translation missing/i.test(document.body.innerText || '') ? (document.body.innerText.match(/Liquid error[^\n]{0,80}|translation missing[^\n]{0,60}/i) || [''])[0] : null
    return { overflowPx, brokenImgs, emptyShells, liquidError: liquidErr, scrollHeight: doc.scrollHeight, innerWidth: window.innerWidth }
  })
}
// Cumulative layout shift via PerformanceObserver — accumulated over the settle window.
async function startCLS(page) {
  await page.evaluate(() => {
    window.__cls = 0
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch {}
  })
}
const readCLS = (page) => page.evaluate(() => Math.round((window.__cls || 0) * 1000) / 1000)

async function main() {
  const args = parseArgs(process.argv)
  const previewUrl = process.env.THEME_PREVIEW_URL || null
  if (!previewUrl) die(2, 'THEME_PREVIEW_URL not set — Lens captures the staging/preview URL (mantle exposes it on the unpublished theme). For a client build: pass the preview link.')
  const password = process.env.THEME_STORE_PASSWORD || process.env.STOREFRONT_PASSWORD || null
  const wantVpNames = args.viewports || VIEWPORTS.filter(v => DEPTH === 'full' || v.tier === 'fast').map(v => v.name)
  const viewports = wantVpNames.map(n => VIEWPORTS.find(v => v.name === n)).filter(Boolean)
  if (!viewports.length) die(2, `no valid viewports (valid: ${VIEWPORTS.map(v => v.name).join(', ')})`)

  let chromium, devices
  try { ({ chromium, devices } = await import('playwright')) } catch { die(2, `missing dep: playwright — ${DEP_HINT}`) }

  let browser
  try { browser = await chromium.launch({ headless: true }) }
  catch (err) { die(2, `could not launch chromium: ${err.message} — ${DEP_HINT}`) }

  fs.rmSync(LENS_DIR, { recursive: true, force: true })
  fs.mkdirSync(LENS_DIR, { recursive: true })
  const origin = new URL(previewUrl).origin
  const frames = []
  const themes = process.env.LENS_DARK === '1' ? ['light', 'dark'] : ['light']
  const rel = (p) => path.relative(LENS_DIR, p)

  // One surface visit → a frame-SET: rest + (FULL: occluder-clear, mid-scroll 25/50/75 on long surfaces,
  // hover on home/pdp) + scroll-end. The extra images are evidence in ONE verdict (keyed by frameKey),
  // NOT separate judge calls — keeps judge cost = surfaces × viewports × locales × content-states.
  async function captureVisit(page, { surface, url, vp, theme, locale, state = 'base' }) {
    const dir = path.join(LENS_DIR, surface); fs.mkdirSync(dir, { recursive: true })
    const gotoUrl = locale && locale !== 'default' ? addLocale(url, locale) : url
    let nav = 'ok', renderError = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await startCLS(page)
        const resp = await page.goto(gotoUrl, { waitUntil: 'load', timeout: 45_000 })
        const status = resp ? resp.status() : null
        await page.waitForTimeout(1400) // settle hydration / lazy sections
        const bodyText = await page.evaluate(() => (document.body.innerText || '').slice(0, 3000)).catch(() => '')
        renderError = renderErrorIn(bodyText, status)
        if (renderError && attempt === 1) { await page.waitForTimeout(1500); continue } // dev-server flake → retry once
        nav = status && status >= 400 ? `http-${status}` : 'ok'
        break
      } catch (e) {
        nav = `nav-failed: ${String(e.message).split('\n')[0].slice(0, 120)}`
        if (attempt === 1) { await page.waitForTimeout(1200); continue }
      }
    }
    const key = frameKey({ surface, viewport: vp.name, state, locale })
    const tag = `${key}-${theme}`
    const shot = async (label) => { const p = path.join(dir, `${tag}-${label}.png`); await page.screenshot({ path: p }).catch(() => {}); return rel(p) }
    // BUG-1/BUG-2: cart-drawer state — open the slide-out + ASSERT it opened, then capture that single
    // frame (no scroll/hover/occluder-dismiss, which would close it). `drawerOpened` is a hard fact the
    // judge/gate sees: a drawer that won't open is a finding, not a silent skip.
    if (state === 'drawer') {
      const drawerOpened = await openCartDrawer(page)
      if (drawerOpened.opened) await page.waitForTimeout(500) // settle slide animation
      const m = await domMetrics(page).catch(() => ({ overflowPx: 0, brokenImgs: [] }))
      return {
        surface, url: gotoUrl, key, state, locale, viewport: vp.name, theme, device: vp.device || null, width: vp.width, height: vp.height,
        frames: { rest: await shot('rest') }, nav, renderError, cls: null,
        overflowPx: m.overflowPx, brokenImages: m.brokenImgs || [], emptyShells: [], liquidError: null, drawerOpened,
      }
    }
    const imgStates = frameStates(surface, DEPTH)
    const imgs = {}
    const restMetrics = await domMetrics(page)
    imgs.rest = await shot('rest')
    // occluder-clear (consent/promo/exit-intent) AFTER rest so chrome-on-brand still fires on rest
    if (await dismissOccluders(page)) { await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {}); await page.waitForTimeout(400); imgs.restClear = await shot('rest-clear') }
    // mid-scroll evidence (FULL, long surfaces) — same verdict
    for (const st of imgStates) {
      const m = st.match(/^scroll(\d+)$/)
      if (m) { const pct = Number(m[1]) / 100; await page.evaluate(p => window.scrollTo(0, document.documentElement.scrollHeight * p), pct).catch(() => {}); await page.waitForTimeout(500); imgs[st] = await shot(st) }
    }
    // hover the primary CTA (FULL, home/pdp)
    if (imgStates.includes('hover')) {
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
      const hovered = await page.evaluate(() => { const b = document.querySelector('a.button, .button, button[name="add"], [data-hero] a, .banner a, .hero a'); if (b) { b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true } return false }).catch(() => false)
      if (hovered) { await page.waitForTimeout(250); imgs.hover = await shot('hover') }
    }
    // scroll-end (lazy content + footer)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {})
    await page.waitForTimeout(900)
    imgs.scrollEnd = await shot('scrollend')
    const cls = await readCLS(page).catch(() => null)
    return {
      surface, url: gotoUrl, key, state, locale, viewport: vp.name, theme, device: vp.device || null, width: vp.width, height: vp.height,
      frames: imgs, nav, renderError, cls, overflowPx: restMetrics.overflowPx, brokenImages: restMetrics.brokenImgs,
      emptyShells: restMetrics.emptyShells, liquidError: restMetrics.liquidError,
    }
  }

  try {
    // resolve surfaces once (uses a desktop page)
    const resCtx = await browser.newContext()
    const resPage = await resCtx.newPage()
    await gotoWithAuth(resPage, previewUrl, password) // authenticate (contexts are isolated, so re-auth per context below)
    const surfaces = await resolveSurfaceUrls(resPage, origin, password, args.surfaces)
    if (DEPTH === 'full') { // error/edge + secondary surfaces (WS-A2 / #8) — own verdict per surface
      surfaces.push({ surface: 'not-found', url: new URL('/lens-404-probe-zzqx', origin).toString() })
      surfaces.push({ surface: 'search-empty', url: new URL('/search?q=zzqxnoresultsxyz', origin).toString() })
      surfaces.push(...await resolveSecondarySurfaces(resPage, origin)) // blog/article/policy/gift-card (#8)
    }
    const locales = DEPTH === 'full' ? await detectLocales(resPage) : ['default'] // conditional (WS-A3)
    await resCtx.close()
    if (!surfaces.length) throw new EnvError('no surfaces resolved from the storefront')

    for (const locale of locales) {
      for (const vp of viewports) {
        for (const theme of themes) {
          const profile = (vp.device && devices && devices[vp.device]) ? devices[vp.device] : {} // real device UA/touch (WS-A1)
          const ctx = await browser.newContext({
            ...profile,
            viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: vp.deviceScaleFactor,
            colorScheme: theme === 'dark' ? 'dark' : 'light', hasTouch: vp.isMobile,
          })
          const page = await ctx.newPage()
          const consoleErrors = []
          page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
          page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
          const failedReq = []
          page.on('requestfailed', r => failedReq.push(`${r.failure()?.errorText || 'failed'} ${r.url().slice(0, 120)}`))
          try { await gotoWithAuth(page, previewUrl, password) } catch (e) { await ctx.close(); throw e }

          for (const { surface, url } of surfaces) {
            consoleErrors.length = 0; failedReq.length = 0
            const f = await captureVisit(page, { surface, url, vp, theme, locale })
            f.consoleErrors = [...consoleErrors].slice(0, 10); f.failedRequests = [...failedReq].slice(0, 8)
            frames.push(f)
            // content states that CHANGE the page (own verdict) — best-effort; never break the run
            for (const st of contentStates(surface, DEPTH)) {
              try {
                consoleErrors.length = 0; failedReq.length = 0
                if (st === 'populated' && surface === 'cart') await addToCart(page, surfaces)
                if (st === 'drawer' && surface === 'pdp') await addToCart(page, surfaces) // populate so the drawer shows an item + upsell
                const cf = await captureVisit(page, { surface, url, vp, theme, locale, state: st })
                cf.consoleErrors = [...consoleErrors].slice(0, 10); cf.failedRequests = [...failedReq].slice(0, 8)
                frames.push(cf)
              } catch { /* content-state setup failed → skip */ }
            }
          }
          await ctx.close()
        }
      }
    }
  } catch (err) {
    await browser.close().catch(() => {})
    die(2, err.message)
  }
  await browser.close().catch(() => {})

  const manifest = {
    tool: 'lens-capture', version: '1.1.0', previewUrl, origin, depth: DEPTH,
    capturedAt_ms: t0, duration_ms: Date.now() - t0,
    viewports: viewports.map(v => v.name), themes, locales: [...new Set(frames.map(f => f.locale))],
    surfaceCount: new Set(frames.map(f => f.surface)).size, frameCount: frames.length, frames,
  }
  const manifestPath = path.join(LENS_DIR, 'lens-manifest.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`lens-capture: ${frames.length} frame-set(s) · ${manifest.surfaceCount} surface(s) × ${viewports.length} viewport(s) × ${manifest.locales.length} locale(s) [depth=${DEPTH}] → ${path.relative(cwd, manifestPath)}`)
  // surface any hard render facts immediately (the judge will see these + the pixels)
  const hard = frames.filter(f => f.nav !== 'ok' || f.renderError || f.liquidError || f.overflowPx > 1 || f.brokenImages.length)
  for (const f of hard) console.log(`  ⚠ ${f.key}/${f.theme}: ${[f.nav !== 'ok' && f.nav, f.renderError && `render-error:"${f.renderError}"`, f.liquidError && `liquid:"${f.liquidError}"`, f.overflowPx > 1 && `overflow ${f.overflowPx}px`, f.brokenImages.length && `${f.brokenImages.length} broken img`].filter(Boolean).join(' · ')}`)
  process.exit(0)
}

// run as CLI only — importable for tests (planCaptures/frameStates/frameKey) without side effects
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => die(2, `unexpected failure: ${err.message}`))
}
