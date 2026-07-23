#!/usr/bin/env node
// Gate 10 — functional & interaction smoke (lumen, DGS Verification Layer 3).
// Playwright DRIVES real flows + edge cases on the staging URL — it does NOT just
// screenshot. Per shopify-verification-acceptance-protocol.md: a screenshot is
// evidence, not proof; this gate proves the store actually WORKS.
//
// Checks per page × viewport (mobile 375 / tablet 768 / desktop 1280):
//   • uncaught JS exceptions (pageerror)            → BLOCK   (Layer 1)
//   • first-party console errors                    → BLOCK; third-party → warn
//   • horizontal overflow (scrollWidth > innerWidth)→ BLOCK   (mobile-overflow bug)
//   • broken images (loaded, naturalWidth===0)      → BLOCK
//   • PDP: add-to-cart affordance present           → BLOCK if missing
//   • PDP: add-to-cart FLOW (click → /cart.js item_count increments) → BLOCK
//        (set FUNCTIONAL_SOFT_ATC=1 to downgrade the flow to a warning)
//
// Usage:  node gate-functional.mjs [--pages home,pdp,collection,cart] [--viewports mobile,tablet,desktop]
// Env:    THEME_PREVIEW_URL (required) · THEME_STORE_PASSWORD · REPORT_DIR · FIRST_PRODUCT_HANDLE · FUNCTIONAL_SOFT_ATC
// Out:    $REPORT_DIR/functional.json
// Exit:   0 pass · 1 block · 2 env error (no URL / password wall / missing dep / mandatory page unreachable)

import { writeReport } from './lib/report.mjs'
import { resolvePages, EnvError, MANDATORY_PAGES } from './lib/pages.mjs'
import { STATE_MATRIX } from './gate-axe.mjs' // reuse the cart-drawer open + assertOpen selectors (BUG-2/BUG-3)

const CART_DRAWER = STATE_MATRIX.find(s => s.name === 'cart-drawer') || { open: [], assertOpen: [], settleMs: 600 }

const started = Date.now()
const reportDir = process.env.REPORT_DIR || 'gate-reports'
const SOFT_ATC = process.env.FUNCTIONAL_SOFT_ATC === '1'

// Multi-Device QA matrix (governance: 6 viewports, not one).
const VIEWPORTS = [
  { name: 'mobile-small', width: 320, height: 568 },
  { name: 'mobile-large', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 1920, height: 1080 },
]
const DEFAULT_PAGES = ['home', 'pdp', 'collection', 'cart']
const DEP_HINT = 'npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium'

const blockers = []
const warnings = []
const checks = []

function finish(code, data) {
  const { file, report } = writeReport('functionality', 10, { ...data, duration_ms: Date.now() - started }, reportDir)
  console.log(`functional: ${report.pass ? 'PASS' : code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${report.blockers.length} blocker(s), ${report.warnings.length} warning(s)`)
  for (const b of report.blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  console.log(`report: ${file}`)
  process.exit(code)
}
function envFail(reason, extra = {}) {
  console.error(`ENV-ERROR: ${reason}`)
  finish(2, { pass: false, url: process.env.THEME_PREVIEW_URL ?? null, blockers, warnings, evidence: { skipped: 'env', reason, ...extra } })
}

function parseArgs(argv) {
  const out = { pages: [...DEFAULT_PAGES], viewports: VIEWPORTS.map(v => v.name) }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { console.log('node gate-functional.mjs [--pages …] [--viewports …]'); process.exit(0) }
    else if (a === '--pages') out.pages = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--viewports') out.viewports = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else { console.error(`unknown arg: ${a}`); process.exit(2) }
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
  await page.waitForTimeout(1200) // settle hydration / lazy sections
}

// In-page checks (run in the browser). Returns { overflow, brokenImgs }.
async function domChecks(page, vpWidth) {
  return page.evaluate((vw) => {
    const doc = document.documentElement
    const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
    const broken = [...document.images].filter(img => img.complete && img.naturalWidth === 0)
      .map(img => img.currentSrc || img.src).slice(0, 5)
    return { overflow, brokenImgs: broken, innerWidth: window.innerWidth, vw }
  }, vpWidth)
}

async function addToCartFlow(page, origin, password) {
  // before count
  const before = await page.evaluate(async () => { try { return (await (await fetch('/cart.js')).json()).item_count } catch { return null } })
  const SUBMIT_SEL = 'button[type="submit"], button[name="add"], [data-add-to-cart], input[type="submit"]'
  const forms = page.locator('form[action*="/cart/add"]')
  const formCount = await forms.count()
  if (formCount === 0) return { ok: false, reason: 'no add-to-cart form (form[action*="/cart/add"]) on PDP' }
  // Select the FIRST cart/add form that actually carries a submit control. Shop Pay installments
  // (<shopify-payment-terms>) renders its OWN submit-less form[action*="/cart/add"] that frequently
  // precedes the real product form — blindly taking .first() would false-BLOCK a working store.
  let form = null
  for (let i = 0; i < formCount; i += 1) {
    const f = forms.nth(i)
    if (await f.locator(SUBMIT_SEL).count() > 0) { form = f; break }
  }
  if (!form) return { ok: false, reason: 'add-to-cart form present but no submit control found' }
  // pick a variant if a <select>/radio inside the form is unselected
  try {
    const sel = form.locator('select[name="id"], select[name*="option"]').first()
    if (await sel.count() > 0) { const v = await sel.locator('option').nth(0).getAttribute('value'); if (v) await sel.selectOption(v).catch(() => {}) }
  } catch { /* best-effort variant pick */ }
  const submit = form.locator(SUBMIT_SEL).first()
  if (await submit.count() === 0) return { ok: false, reason: 'add-to-cart form present but no submit control found' }
  try { await submit.scrollIntoViewIfNeeded(); await submit.click({ timeout: 8000 }) }
  catch (e) { return { ok: false, reason: `add-to-cart click failed: ${e.message.split('\n')[0]}` } }
  // poll /cart.js for an item_count increase
  for (let i = 0; i < 16; i += 1) {
    await page.waitForTimeout(500)
    const now = await page.evaluate(async () => { try { return (await (await fetch('/cart.js')).json()).item_count } catch { return null } })
    if (now !== null && (before === null || now > before)) return { ok: true, before, after: now }
  }
  return { ok: false, reason: `add-to-cart clicked but /cart.js item_count did not increase (before=${before})` }
}

// BUG-3: drive + assert the cart DRAWER (the slide-out — the shopper's real checkout path, esp. on mobile).
// Silently add an item (so the drawer shows a line item), open the drawer via the shared cart-drawer
// selectors, ASSERT it opened, then check the checkout CTA is present + reachable + sized. A drawer that
// won't open here is a WARNING (the theme may use a cart PAGE) — Lens gate #18 deterministically BLOCKS a
// drawer that should open but doesn't; this gate proves the drawer INTERACTION works when it exists.
async function openCartDrawerPW(page) {
  const isOpen = async () => {
    for (const sel of CART_DRAWER.assertOpen) {
      try { const el = page.locator(sel).first(); if ((await el.count()) && (await el.isVisible())) { const b = await el.boundingBox(); if (b && b.width > 80 && b.height > 120) return true } } catch { /* next */ }
    }
    return false
  }
  if (await isOpen()) return { opened: true, via: 'already-open' }
  for (const sel of CART_DRAWER.open) {
    try {
      const el = page.locator(sel).first()
      if ((await el.count()) && (await el.isVisible())) { await el.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(CART_DRAWER.settleMs); if (await isOpen()) return { opened: true, via: sel } }
    } catch { /* next selector */ }
  }
  return { opened: false, reason: 'no cart toggle opened a visible drawer' }
}

async function cartDrawerCheck(page) {
  // silent add (fetch) so the drawer renders a line item when opened — independent of the UI ATC flow
  const added = await page.evaluate(async () => {
    try {
      const h = location.pathname.split('/products/')[1]?.split(/[?#]/)[0]
      if (!h) return false
      const pj = await (await fetch(`/products/${h}.js`)).json()
      const vid = (pj.variants || []).find(v => v.available)?.id || pj.variants?.[0]?.id
      if (!vid) return false
      await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: vid, quantity: 1 }) })
      return true
    } catch { return false }
  })
  if (!added) return { drawer: 'skip', reason: 'could not add an item to exercise the drawer' }
  const opened = await openCartDrawerPW(page)
  if (!opened.opened) return { drawer: 'closed', reason: opened.reason }
  const facts = await page.evaluate((assertSel) => {
    // NOT `el.offsetParent !== null`: offsetParent is null for EVERY position:fixed element, and a cart
    // drawer is fixed in essentially every theme — so that test made `found` permanently false and both
    // cart-drawer blockers below were unreachable. Proven by the functional-url fixture (QA-2).
    const vis = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      if (!(r.width > 40 && r.height > 80)) return false      // a display:none element measures 0x0
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'
    }
    let drawer = null
    for (const sel of assertSel) { for (const el of document.querySelectorAll(sel)) { if (vis(el)) { drawer = el; break } } if (drawer) break }
    if (!drawer) { for (const el of document.querySelectorAll('aside, [role="dialog"], .drawer, [class*="cart" i]')) { if (/cart/i.test(`${el.id} ${el.className}`) && vis(el)) { const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.position === 'absolute') { drawer = el; break } } } }
    if (!drawer) return { found: false }
    const cta = [...drawer.querySelectorAll('a, button, input[type="submit"]')].find(el => /check\s*out/i.test(el.innerText || el.value || el.getAttribute('aria-label') || ''))
    const r = cta ? cta.getBoundingClientRect() : null
    return {
      found: true,
      hasCheckout: !!(cta && r && r.width > 0 && r.height > 0),
      checkoutCutOff: !!(r && r.bottom > window.innerHeight + 4),
      checkoutSmall: !!(r && r.height > 0 && r.height < 40),
      hasItem: !!drawer.querySelector('img') && /\$|\d/.test(drawer.innerText || ''),
    }
  }, CART_DRAWER.assertOpen)
  return { drawer: 'open', via: opened.via, ...facts }
}

async function main() {
  const args = parseArgs(process.argv)
  const previewUrl = process.env.THEME_PREVIEW_URL || null
  if (!previewUrl) envFail('THEME_PREVIEW_URL not set (URL gates need a preview URL)')
  const viewports = args.viewports.map(n => VIEWPORTS.find(v => v.name === n)).filter(Boolean)
  if (viewports.length === 0) envFail(`no valid viewports (valid: ${VIEWPORTS.map(v => v.name).join(', ')})`)

  let chromium
  try { ({ chromium } = await import('playwright')) } catch { envFail('missing dep: playwright', { hint: DEP_HINT }) }

  const password = process.env.THEME_STORE_PASSWORD || process.env.STOREFRONT_PASSWORD || null
  const { origin, pages } = await resolvePages({ previewUrl, password, want: args.pages })
  const targets = pages.filter(p => !p.skipped)
  if (targets.length === 0) throw new EnvError('no functional pages resolved')

  let browser
  try { browser = await chromium.launch({ headless: true }) }
  catch (err) { throw new EnvError(`could not launch chromium: ${err.message} — run: npx --prefix toolkit playwright install chromium`) }
  let atcDone = false
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      const consoleErrors = []
      page.on('pageerror', err => blockers.push({ id: 'fn.pageerror', page: `@${vp.name}`, detail: `uncaught JS exception: ${String(err.message || err).split('\n')[0]}`, evidence: page.url() }))
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location()?.url || '' }) })

      for (const t of targets) {
        process.stdout.write(`  ${t.id} @ ${vp.name} ... `)
        consoleErrors.length = 0
        try { await gotoWithAuth(page, t.url, password) }
        catch (e) { if (e instanceof EnvError) throw e; blockers.push({ id: 'fn.load', page: `${t.id}@${vp.name}`, detail: `page failed to load: ${e.message.split('\n')[0]}`, evidence: t.url }); console.log('LOAD-FAIL'); continue }

        const { overflow, brokenImgs } = await domChecks(page, vp.width)
        if (overflow > 3) blockers.push({ id: 'fn.overflow', page: `${t.id}@${vp.name}`, detail: `horizontal overflow ${overflow}px beyond the ${vp.width}px viewport (mobile-overflow bug)`, evidence: `scrollWidth - innerWidth = ${overflow}` })
        for (const src of brokenImgs) blockers.push({ id: 'fn.broken-image', page: `${t.id}@${vp.name}`, detail: `broken image (loaded, naturalWidth=0)`, evidence: src })

        // console errors: first-party (same origin or theme cdn, or no url) BLOCK; third-party warn.
        // DEV-NOISE is skipped entirely: `shopify theme dev` hot-reload + proxy + Shopify-platform
        // console errors that DO NOT EXIST on a published store and are not real defects (Meridian
        // 2026-06-19: a `theme dev` run flooded 22 false blockers — [HotReload] reconnect, dev-proxy
        // 502, origin-trial CDN CORS). Run URL gates against the preview-theme URL (not `theme dev`)
        // for a clean read; this filter is the safety net when a dev URL is used.
        const DEV_NOISE = /\[HotReload\]|Connection closed by the server|hot[- ]?reload|origin_trials|web-pixels-manager|\/wpm[@/]|browser_sync|__shopify_dev|status of 50\d \(Bad Gateway\)|net::ERR_FAILED/i
        const host = new URL(origin).host
        let devNoise = 0
        for (const ce of consoleErrors) {
          if (DEV_NOISE.test(ce.text) || DEV_NOISE.test(ce.url || '')) { devNoise += 1; continue }
          const firstParty = !ce.url || ce.url.includes(host) || /cdn\.shopify\.com\/.*\/(assets|t\/)/.test(ce.url)
          const entry = { id: 'fn.console-error', page: `${t.id}@${vp.name}`, detail: `console error: ${ce.text.slice(0, 140)}`, evidence: ce.url || '(inline)' }
          if (firstParty) blockers.push(entry); else warnings.push({ ...entry, id: 'fn.console-error-3p' })
        }
        if (devNoise) checks.push({ check: 'dev-noise-filtered', page: `${t.id}@${vp.name}`, count: devNoise })

        // PDP-specific functional flow (once, on the first viewport that has the PDP)
        if (t.id === 'pdp') {
          const hasForm = await page.locator('form[action*="/cart/add"]').count() > 0
          if (!hasForm) blockers.push({ id: 'fn.no-atc', page: `${t.id}@${vp.name}`, detail: 'no add-to-cart affordance (form[action*="/cart/add"]) on the PDP', evidence: t.url })
          else if (!atcDone) {
            atcDone = true
            const atc = await addToCartFlow(page, origin, password)
            checks.push({ check: 'add-to-cart-flow', viewport: vp.name, ...atc })
            if (!atc.ok) {
              const entry = { id: 'fn.atc-flow', page: `${t.id}@${vp.name}`, detail: `add-to-cart flow did not confirm: ${atc.reason}`, evidence: t.url }
              if (SOFT_ATC) warnings.push(entry); else blockers.push(entry)
            }
          }
          // BUG-3: exercise the cart DRAWER per viewport (the real mobile checkout path) — open + assert
          const d = await cartDrawerCheck(page)
          checks.push({ check: 'cart-drawer', viewport: vp.name, ...d })
          if (d.drawer === 'open') {
            if (d.found && !d.hasCheckout) blockers.push({ id: 'fn.cart-drawer-no-checkout', page: `${t.id}@${vp.name}`, detail: 'cart drawer opened but NO Checkout button is present in it', evidence: t.url })
            if (d.checkoutCutOff) blockers.push({ id: 'fn.cart-drawer-checkout-cutoff', page: `${t.id}@${vp.name}`, detail: 'cart drawer Checkout button is cut off / below the viewport — unreachable', evidence: t.url })
            if (d.checkoutSmall && vp.width <= 600) warnings.push({ id: 'fn.cart-drawer-tap-target', page: `${t.id}@${vp.name}`, detail: 'cart drawer Checkout button is <40px tall on mobile (tap-target too small)', evidence: t.url })
            if (d.found && !d.hasItem) warnings.push({ id: 'fn.cart-drawer-empty', page: `${t.id}@${vp.name}`, detail: 'cart drawer opened but shows no line item (the added product is not visible)', evidence: t.url })
          } else if (d.drawer === 'closed') {
            warnings.push({ id: 'fn.cart-drawer-no-open', page: `${t.id}@${vp.name}`, detail: `add-to-cart did not open a cart drawer (${d.reason}). OK if this theme uses a cart PAGE; if it should have a drawer, Lens gate #18 blocks a drawer that won't open.`, evidence: t.url })
          }
        }
        checks.push({ page: t.id, viewport: vp.name, overflow, brokenImgs: brokenImgs.length, consoleErrors: consoleErrors.length })
        console.log(`overflow=${overflow}px imgs-broken=${brokenImgs.length} console-err=${consoleErrors.length}`)
      }
      await context.close()
    }
  } finally { await browser.close() }

  const pass = blockers.length === 0
  finish(pass ? 0 : 1, { pass, url: previewUrl, blockers, warnings, evidence: { viewports: viewports.map(v => v.name), pages: targets.map(t => t.id), atc_soft: SOFT_ATC, checks } })
}

main().catch(err => {
  const reason = err instanceof EnvError ? err.message : `script error: ${err.message}`
  if (!(err instanceof EnvError)) console.error(err.stack)
  envFail(reason)
})
