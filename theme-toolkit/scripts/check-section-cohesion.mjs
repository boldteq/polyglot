#!/usr/bin/env node
// Boldteq INTER-SECTION COHESION gate (#19) — the render-time "do the sections feel like ONE page?"
// enforcer. #8 locks the token SET and #9 counts store-wide VARIETY, but neither sees a RENDERED page:
// section A can ship h2=32px and section B h2=28px and both pass — yet the page reads disjoint. This
// gate pulls COMPUTED styles per section (Shopify's native #shopify-section-* wrappers) on the staging
// URL and enforces cohesion ACROSS sections against docs/design/design-system.json. (Plan Pillar 2.)
//
// Per page it checks: (1) type-scale-at-render — every heading/body computed font-size maps to a
// design-system step (±0.6px); (2) heading-hierarchy — sections don't mix H1-level headings; (3)
// padding-rhythm — consecutive section vertical paddings come from the spacing scale; (4) container-
// alignment — sections share horizontal padding + max-width (edge alignment); (5) font-weight-inventory
// — ≤ the contract's weight cap per page; (6) scheme-adjacency — ≤ scheme cap, no identical scheme
// back-to-back unless allowed. BLOCKS on a real drift with the exact section + diff. mantle gates publish.
//
// Usage: node check-section-cohesion.mjs [--surfaces home,pdp,collection]
// Env: THEME_PREVIEW_URL (req) · THEME_STORE_PASSWORD · DESIGN_SYSTEM (docs/design/design-system.json)
//      · REPORT_DIR · FIRST_PRODUCT_HANDLE · COHESION_FONT_TOL (0.6 px) · DS_REQUIRE_SCOPE (publish-grade)
// Exit: 0 = cohesive · 1 = drift (block) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const FONT_TOL = Number(process.env.COHESION_FONT_TOL || 0.6)
const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const die = (code, msg) => { writeReport('section-consistency', 19, { cwd, pass: false, blockers, warnings, evidence: { reason: msg }, duration_ms: Date.now() - t0 }, REPORT_DIR); console.error(`section-cohesion: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

function loadContract() {
  let j = {}
  try { j = JSON.parse(fs.readFileSync(path.resolve(cwd, DS), 'utf-8')) } catch { /* contract optional → bands relax */ }
  const allowedPx = new Set((j.typography?.allowed_px || []).map(Number))
  const spacing = new Set((j.spacing?.scale || []).map(Number))
  const weightCap = j.typography?.max_weights_per_page ?? (Array.isArray(j.typography?.allowed_weights) ? j.typography.allowed_weights.length : 3)
  const schemeCap = j.color?.scheme_count_max ?? j.color_roles?.scheme_count_max ?? 4
  const adjacencySameAllowed = j.color?.allow_adjacent_same_scheme === true
  return { allowedPx, spacing, weightCap, schemeCap, adjacencySameAllowed, hasType: allowedPx.size > 0, hasSpace: spacing.size > 0 }
}

function nearestMiss(px, allowed, tol) { // returns the offending value if not within tol of any allowed step
  if (!allowed.size) return null
  for (const a of allowed) if (Math.abs(px - a) <= tol) return null
  return px
}

// #4 — page-level RHYTHM (whole-page cadence #19's per-section checks can't see). PURE so it's
// hermetically testable on synthetic section data. Two checks across the page's CONTENT sections:
//   rhythm.heading-not-monotonic — representative heading sizes must step DOWN (h1≥h2≥h3≥h4); a
//     section rendering an h3 LARGER than the page's h2 inverts the hierarchy (a real type-ladder bug).
//   rhythm.padding-cadence — a section whose vertical padding is a wild outlier (>2.2× or <½ the page
//     median) breaks the inter-section cadence even if each value is individually on-scale. Advisory.
export function analyzeRhythm(sections, { surface = '', tol = 0.6 } = {}) {
  const findings = []
  const secs = (sections || []).filter(s => s && !s.isChrome)
  if (secs.length < 2) return findings
  // (A) heading step-down monotonicity (median size per tag, in document order h1→h4)
  const order = ['H1', 'H2', 'H3', 'H4']
  const rep = {}
  for (const tag of order) {
    const sizes = secs.filter(s => s.headingTag === tag && s.headingPx).map(s => s.headingPx).sort((a, b) => a - b)
    if (sizes.length) rep[tag] = sizes[Math.floor(sizes.length / 2)]
  }
  const present = order.filter(t => rep[t] != null)
  for (let i = 1; i < present.length; i += 1) {
    const hi = present[i - 1]
    const lo = present[i]
    if (rep[lo] > rep[hi] + tol) findings.push({ id: 'rhythm.heading-not-monotonic', page: surface, detail: `${lo} renders larger (${rep[lo]}px) than ${hi} (${rep[hi]}px) across the page — headings must step DOWN (h1≥h2≥h3≥h4). Fix the type-ladder mapping so the visual hierarchy matches the document order.`, severity: 'warn' })
  }
  // (B) vertical-padding cadence outliers
  const vpads = secs.map(s => (s.padTop || 0) + (s.padBottom || 0)).filter(v => v > 0).sort((a, b) => a - b)
  if (vpads.length >= 3) {
    const med = vpads[Math.floor(vpads.length / 2)]
    if (med > 0) {
      for (const s of secs) {
        const v = (s.padTop || 0) + (s.padBottom || 0)
        if (v > 0 && (v > med * 2.2 || v < med / 2.2)) findings.push({ id: 'rhythm.padding-cadence', page: `${surface}/${s.id}`, detail: `section vertical padding ${v}px is ${v > med ? '>2.2× larger than' : '<½'} the page median (${med}px) — uneven inter-section cadence; bring it toward the page rhythm.`, severity: 'advise' })
      }
    }
  }
  return findings
}

async function main() {
  const previewUrl = process.env.THEME_PREVIEW_URL || null
  if (!previewUrl) die(2, 'THEME_PREVIEW_URL not set — cohesion is a render-time check; needs a staging URL')
  let chromium
  try { ({ chromium } = await import('playwright')) } catch { die(2, 'missing dep: playwright (npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium)') }
  const contract = loadContract()

  const args = process.argv.slice(2)
  let surfaces = ['home', 'pdp', 'collection']
  for (let i = 0; i < args.length; i += 1) if (args[i] === '--surfaces') surfaces = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean)

  let browser
  try { browser = await chromium.launch({ headless: true }) } catch (e) { die(2, `could not launch chromium: ${e.message}`) }
  const origin = new URL(previewUrl).origin
  const password = process.env.THEME_STORE_PASSWORD || process.env.STOREFRONT_PASSWORD || null
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
  const page = await ctx.newPage()

  const gotoAuth = async (url) => {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    if (/\/password\/?$/.test(new URL(page.url()).pathname) && password) {
      const inp = page.locator('input[name="password"]').first(); await inp.fill(password); await inp.press('Enter'); await page.waitForLoadState('load'); await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    }
    await page.waitForTimeout(1000)
  }

  // resolve surface URLs (pdp/collection from products.json/collections.json)
  const urlOf = async (s) => {
    if (s === 'home') return origin + '/'
    if (s === 'pdp') { let h = process.env.FIRST_PRODUCT_HANDLE; if (!h) { try { const pj = await page.evaluate(async (o) => { const r = await fetch(o + '/products.json?limit=5'); return r.ok ? (await r.json()).products : [] }, origin); h = (pj || []).map(p => p.handle).find(x => x && x !== 'gift-card') } catch { /* */ } } return h ? `${origin}/products/${h}` : null }
    if (s === 'collection') { let h = process.env.FIRST_COLLECTION_HANDLE; if (!h) { try { const cj = await page.evaluate(async (o) => { const r = await fetch(o + '/collections.json?limit=5'); return r.ok ? (await r.json()).collections : [] }, origin); h = (cj || []).map(c => c.handle).find(x => x && x !== 'frontpage') } catch { /* */ } } return `${origin}/collections/${h || 'all'}` }
    return null
  }

  const perSurface = []
  try {
    await gotoAuth(previewUrl)
    for (const s of surfaces) {
      const url = await urlOf(s)
      if (!url) { warnings.push({ id: 'cohesion.surface-unresolved', page: s, detail: `could not resolve ${s} URL`, evidence: '' }); continue }
      await gotoAuth(url)
      // extract per-section computed facts
      const data = await page.evaluate(() => {
        const px = v => Math.round((parseFloat(v) || 0) * 10) / 10
        const sections = [...document.querySelectorAll('[id^="shopify-section-"], .shopify-section')].filter(el => el.getBoundingClientRect().height > 20)
        const seen = new Set()
        const out = []
        for (const sec of sections) {
          if (seen.has(sec)) continue; seen.add(sec)
          const cs = getComputedStyle(sec)
          const inner = sec.querySelector(':scope > *') || sec
          const ics = getComputedStyle(inner)
          const heads = [...sec.querySelectorAll('h1,h2,h3,h4')].filter(h => h.offsetParent !== null)
          const firstHead = heads[0]
          const weights = new Set()
          const fontSizes = []
          for (const el of sec.querySelectorAll('h1,h2,h3,h4,p,a,span,button,li')) {
            const e = getComputedStyle(el); const fs = px(e.fontSize)
            if (fs >= 11 && fs <= 90 && (el.textContent || '').trim().length > 1) { fontSizes.push(fs); weights.add(parseInt(e.fontWeight, 10) || 400) }
          }
          const idc = (sec.id || '') + ' ' + sec.className
          const isChrome = /header|footer|announcement|cart-drawer|cart_drawer|popup|modal|drawer|newsletter-popup|age-gate|cookie/i.test(idc)
          out.push({
            id: sec.id || sec.className.slice(0, 40), isChrome,
            padTop: px(cs.paddingTop), padBottom: px(cs.paddingBottom),
            containerPadL: px(ics.paddingLeft), containerMaxW: px(ics.maxWidth) || px(ics.width),
            headingTag: firstHead ? firstHead.tagName : null, headingPx: firstHead ? px(getComputedStyle(firstHead).fontSize) : null,
            weights: [...weights], fontSizes: [...new Set(fontSizes)], bg: cs.backgroundColor,
            schemeClass: (sec.className.match(/color-([a-z0-9-]+)/) || [])[1] || cs.backgroundColor,
          })
        }
        const h1 = document.querySelector('h1')
        return { sections: out, pageH1Px: h1 ? px(getComputedStyle(h1).fontSize) : null }
      })
      perSurface.push({ surface: s, url, ...data })
    }
  } catch (e) { await browser.close().catch(() => {}); die(2, e.message) }
  await browser.close().catch(() => {})

  // ── cohesion checks per surface (CONTENT sections only — chrome is excluded) ──
  const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1'
  const measurable = (id, page, detail, evidence) => REQUIRE ? add(blockers, id, page, detail, evidence) : warnings.push({ id, page, detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence })
  for (const surf of perSurface) {
    const secs = surf.sections.filter(s => !s.isChrome) // cohesion is about CONTENT, not header/footer/popups
    if (secs.length < 2) continue
    const at = surf.surface

    // (1) type-scale-at-render (BLOCK) — every rendered size on the design-system ladder. THE cohesion
    //     guarantee: if every section's type is on the one ladder, the page reads as one system. Catches
    //     a section hardcoding 19px when the scale is 18/20, or a 73px one-off.
    if (contract.hasType) {
      for (const sec of secs) {
        for (const fs of sec.fontSizes) {
          const miss = nearestMiss(fs, contract.allowedPx, FONT_TOL)
          if (miss !== null) { add(blockers, 'cohesion.type-offscale', `${at}/${sec.id}`, `rendered font-size ${miss}px is off the design-system type ladder [${[...contract.allowedPx].join(', ')}] (±${FONT_TOL}px) — bind it to a --ds type token`, `${sec.id}: ${miss}px`); break }
        }
      }
    }
    // (2) multi-h1 (BLOCK) — only the hero owns the H1; a second is a real a11y/SEO/cohesion bug.
    const h1Sections = secs.filter(s => s.headingTag === 'H1')
    if (h1Sections.length > 1) add(blockers, 'cohesion.multi-h1', at, `${h1Sections.length} content sections render an <h1> (${h1Sections.map(s => s.id).join(', ')}) — only the hero may; downstream sections start at h2`, h1Sections.map(s => s.id).join(', '))
    // (3) heading-drift (WARN) — same-tag headings that are CLOSE-but-unequal look like a mistake (28 vs
    //     32), not intentional hierarchy (62 vs 24). Only flag a SMALL gap; the autofix snaps it. NOT a
    //     hard block — large size differences across sections are legitimate visual hierarchy.
    const byTag = {}; for (const s of secs) if (s.headingTag && s.headingPx) (byTag[s.headingTag] = byTag[s.headingTag] || []).push(s)
    for (const [tag, list] of Object.entries(byTag)) {
      const sizes = [...new Set(list.map(s => s.headingPx))].sort((a, b) => a - b)
      for (let i = 1; i < sizes.length; i += 1) {
        const gap = sizes[i] - sizes[i - 1]
        if (gap > FONT_TOL && gap <= 8) { warnings.push({ id: 'cohesion.heading-drift', page: at, detail: `${tag} headings render at ${sizes[i - 1]}px AND ${sizes[i]}px across sections — only ${gap}px apart, which reads as a mistake not deliberate hierarchy; snap both to one --ds type step`, evidence: `${tag}: ${sizes.join(', ')}` }); break }
      }
    }
    // (4) padding-rhythm (BLOCK at publish) — section vertical paddings on the spacing scale; a 73/81px
    //     one-off breaks the cadence between sections.
    if (contract.hasSpace) {
      for (const sec of secs) {
        for (const [edge, v] of [['top', sec.padTop], ['bottom', sec.padBottom]]) {
          const miss = nearestMiss(v, contract.spacing, 2)
          if (miss !== null && miss > 0) { measurable('cohesion.padding-offscale', `${at}/${sec.id}`, `section padding-${edge} ${miss}px is off the spacing scale [${[...contract.spacing].join(', ')}] — snap to a --ds spacing token so the inter-section cadence is even`, `${sec.id}: ${edge} ${miss}px`); break }
        }
      }
    }
    // (5) container-alignment (WARN) — content sections share a max-width (no jagged left/right edges).
    const maxWs = secs.map(s => s.containerMaxW).filter(w => w > 100)
    if (maxWs.length >= 2) { const spread = Math.max(...maxWs) - Math.min(...maxWs); if (spread > 40) warnings.push({ id: 'cohesion.container-edge', page: at, detail: `content containers have different max-widths (${[...new Set(maxWs)].join('px, ')}px, spread ${Math.round(spread)}px) — jagged edges; share one container width`, evidence: '' }) }
    // (6) font-weight-inventory (WARN) — too many weights blur the system. Cap from contract.allowed_weights
    //     (or 3); premium brands legitimately use regular + 2 emphasis, so don't hard-block.
    const pageWeights = [...new Set(secs.flatMap(s => s.weights))].sort((a, b) => a - b)
    if (pageWeights.length > contract.weightCap) warnings.push({ id: 'cohesion.weight-inventory', page: at, detail: `${pageWeights.length} font-weights render on this page (${pageWeights.join(', ')}) — keep ≤${contract.weightCap}; a stray 500 on a 400/700 system reads as a different family`, evidence: pageWeights.join(', ') })
    // (7) scheme-adjacency (WARN) — ≤ cap; no identical CONTENT scheme back-to-back unless allowed.
    const schemes = secs.map(s => s.schemeClass)
    if ([...new Set(schemes)].length > contract.schemeCap) warnings.push({ id: 'cohesion.scheme-count', page: at, detail: `${[...new Set(schemes)].length} distinct content schemes on this page — cap ${contract.schemeCap}`, evidence: [...new Set(schemes)].slice(0, 6).join(', ') })
    if (!contract.adjacencySameAllowed) { for (let i = 1; i < schemes.length; i += 1) if (schemes[i] && schemes[i] === schemes[i - 1] && schemes[i] !== 'rgba(0, 0, 0, 0)') { warnings.push({ id: 'cohesion.scheme-adjacent-same', page: at, detail: `content sections ${secs[i - 1].id} + ${secs[i].id} render the SAME scheme back-to-back — they blur; alternate or add a divider`, evidence: schemes[i] }); break } }
    // (8) page-rhythm (#4) — heading step-down monotonicity + vertical-padding cadence across the page.
    for (const fnd of analyzeRhythm(secs, { surface: at, tol: FONT_TOL })) warnings.push({ id: fnd.id, page: fnd.page, detail: fnd.detail, evidence: '', severity: fnd.severity })
  }

  const requireScope = process.env.DS_REQUIRE_SCOPE === '1'
  if (!perSurface.length && requireScope) add(blockers, 'cohesion.no-surfaces', '.', 'no surfaces rendered — cannot verify cohesion at publish-grade')
  const pass = blockers.length === 0
  // 'section-consistency' is the manifest name theme-gates reads (gate-reports/<name>.json) and the
  // name die() already used. The pass path wrote the RETIRED alias 'section-cohesion', so a passing
  // gate 19 left no report where anything looks for it — evidence, freshness and #45 all saw a hole.
  writeReport('section-consistency', 19, { cwd, pass, blockers, warnings, evidence: { contract: DS, surfaces: perSurface.map(s => ({ surface: s.surface, sections: s.sections.length })) }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`section-cohesion: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 8)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().catch(e => die(2, `unexpected failure: ${e.message}`))
