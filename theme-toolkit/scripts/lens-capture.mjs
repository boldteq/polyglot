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

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const DEP_HINT = 'npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium'

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 },
  { name: 'tablet', width: 768, height: 1024, isMobile: true, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
]
// surface → path resolver key. PDP/collection auto-resolve from the storefront unless pinned.
const DEFAULT_SURFACES = ['home', 'collection', 'pdp', 'cart', 'search', 'account']

class EnvError extends Error {}
const die = (code, msg) => { console.error(`lens-capture: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }

function parseArgs(argv) {
  const out = { surfaces: [...DEFAULT_SURFACES], viewports: VIEWPORTS.map(v => v.name) }
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
  const viewports = args.viewports.map(n => VIEWPORTS.find(v => v.name === n)).filter(Boolean)
  if (!viewports.length) die(2, `no valid viewports (valid: ${VIEWPORTS.map(v => v.name).join(', ')})`)

  let chromium
  try { ({ chromium } = await import('playwright')) } catch { die(2, `missing dep: playwright — ${DEP_HINT}`) }

  let browser
  try { browser = await chromium.launch({ headless: true }) }
  catch (err) { die(2, `could not launch chromium: ${err.message} — ${DEP_HINT}`) }

  fs.rmSync(LENS_DIR, { recursive: true, force: true })
  fs.mkdirSync(LENS_DIR, { recursive: true })
  const origin = new URL(previewUrl).origin
  const frames = []
  const themes = process.env.LENS_DARK === '1' ? ['light', 'dark'] : ['light']

  try {
    // resolve surfaces once (uses a desktop page)
    const resCtx = await browser.newContext()
    const resPage = await resCtx.newPage()
    await gotoWithAuth(resPage, previewUrl, password) // authenticate (sets the storefront_digest cookie on the context… but contexts are isolated, so re-auth per context below)
    const surfaces = await resolveSurfaceUrls(resPage, origin, password, args.surfaces)
    await resCtx.close()
    if (!surfaces.length) throw new EnvError('no surfaces resolved from the storefront')

    for (const vp of viewports) {
      for (const theme of themes) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: vp.deviceScaleFactor,
          colorScheme: theme === 'dark' ? 'dark' : 'light', hasTouch: vp.isMobile,
        })
        const page = await ctx.newPage()
        const consoleErrors = []
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
        page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
        const failedReq = []
        page.on('requestfailed', r => failedReq.push(`${r.failure()?.errorText || 'failed'} ${r.url().slice(0, 120)}`))
        // authenticate this isolated context once
        try { await gotoWithAuth(page, previewUrl, password) } catch (e) { await ctx.close(); throw e }

        for (const { surface, url } of surfaces) {
          const dir = path.join(LENS_DIR, surface)
          fs.mkdirSync(dir, { recursive: true })
          consoleErrors.length = 0; failedReq.length = 0
          let nav = 'ok', renderError = null
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
              await startCLS(page)
              const resp = await page.goto(url, { waitUntil: 'load', timeout: 45_000 })
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
          const tag = `${vp.name}-${theme}`
          // STATE 1: at-rest (above-the-fold)
          const restMetrics = await domMetrics(page)
          const restPng = path.join(dir, `${tag}-rest.png`)
          await page.screenshot({ path: restPng }).catch(() => {})
          // STATE 2: scroll-to-end (lazy content + footer)
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {})
          await page.waitForTimeout(900)
          const endPng = path.join(dir, `${tag}-scrollend.png`)
          await page.screenshot({ path: endPng }).catch(() => {})
          const cls = await readCLS(page).catch(() => null)
          const rel = (p) => path.relative(LENS_DIR, p)
          frames.push({
            surface, url, viewport: vp.name, theme, width: vp.width, height: vp.height,
            frames: { rest: rel(restPng), scrollEnd: rel(endPng) },
            nav, renderError, cls, overflowPx: restMetrics.overflowPx, brokenImages: restMetrics.brokenImgs,
            emptyShells: restMetrics.emptyShells, liquidError: restMetrics.liquidError,
            consoleErrors: [...consoleErrors].slice(0, 10), failedRequests: [...failedReq].slice(0, 8),
          })
        }
        await ctx.close()
      }
    }
  } catch (err) {
    await browser.close().catch(() => {})
    die(2, err.message)
  }
  await browser.close().catch(() => {})

  const manifest = {
    tool: 'lens-capture', version: '1.0.0', previewUrl, origin,
    capturedAt_ms: t0, duration_ms: Date.now() - t0,
    viewports: viewports.map(v => v.name), themes, surfaceCount: new Set(frames.map(f => f.surface)).size,
    frameCount: frames.length, frames,
  }
  const manifestPath = path.join(LENS_DIR, 'lens-manifest.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`lens-capture: captured ${frames.length} frame-set(s) across ${manifest.surfaceCount} surface(s) × ${viewports.length} viewport(s) → ${path.relative(cwd, manifestPath)}`)
  // surface any hard render facts immediately (the judge will see these + the pixels)
  const hard = frames.filter(f => f.nav !== 'ok' || f.renderError || f.liquidError || f.overflowPx > 1 || f.brokenImages.length)
  for (const f of hard) console.log(`  ⚠ ${f.surface} ${f.viewport}/${f.theme}: ${[f.nav !== 'ok' && f.nav, f.renderError && `render-error:"${f.renderError}"`, f.liquidError && `liquid:"${f.liquidError}"`, f.overflowPx > 1 && `overflow ${f.overflowPx}px`, f.brokenImages.length && `${f.brokenImages.length} broken img`].filter(Boolean).join(' · ')}`)
  process.exit(0)
}

main().catch(err => die(2, `unexpected failure: ${err.message}`))
