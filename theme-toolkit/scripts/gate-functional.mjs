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
  const { file, report } = writeReport('functional', 10, { ...data, duration_ms: Date.now() - started }, reportDir)
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
  const form = page.locator('form[action*="/cart/add"]').first()
  if (await form.count() === 0) return { ok: false, reason: 'no add-to-cart form (form[action*="/cart/add"]) on PDP' }
  // pick a variant if a <select>/radio inside the form is unselected
  try {
    const sel = form.locator('select[name="id"], select[name*="option"]').first()
    if (await sel.count() > 0) { const v = await sel.locator('option').nth(0).getAttribute('value'); if (v) await sel.selectOption(v).catch(() => {}) }
  } catch { /* best-effort variant pick */ }
  const submit = form.locator('button[type="submit"], button[name="add"], [data-add-to-cart], input[type="submit"]').first()
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

        // console errors: first-party (same origin or theme cdn, or no url) BLOCK; third-party warn
        const host = new URL(origin).host
        for (const ce of consoleErrors) {
          const firstParty = !ce.url || ce.url.includes(host) || /cdn\.shopify\.com\/.*\/(assets|t\/)/.test(ce.url)
          const entry = { id: 'fn.console-error', page: `${t.id}@${vp.name}`, detail: `console error: ${ce.text.slice(0, 140)}`, evidence: ce.url || '(inline)' }
          if (firstParty) blockers.push(entry); else warnings.push({ ...entry, id: 'fn.console-error-3p' })
        }

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
