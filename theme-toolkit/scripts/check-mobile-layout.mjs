#!/usr/bin/env node
// #35 — mobile-layout gate. Mobile coverage today is fragmented + mostly VISUAL: Lens (#18) judges
// mobile via the vision model (subjective), css-layout (#22) catches 100vw overflow, a11y-static (#16)
// enforces the form-input ≥16px floor. The mobile-first RULES exist as KB
// (shopify-theme-mobile-first-protocol.md) but nothing enforces them DETERMINISTICALLY. This is the
// hermetic, every-build enforcer of those rules on the build's CUSTOM surface — complementing Lens, not
// replacing it. Scope = git base..HEAD (sections/snippets/assets) else the reuse-map's CUSTOM/EXTEND
// targets; SKIPS clean when there's no custom surface (refreshes never false-fire), EXCEPT the
// viewport-meta check which runs on layout/ regardless (it's load-bearing for ALL mobile).
//
// Checks (each a pure exported helper):
//   mobile.viewport-meta  — layout/ must have <meta name=viewport width=device-width>. BLOCK-eligible.
//   mobile.font-floor     — font-size literal <12px (BLOCK-eligible) / <14px (warn) → unreadable on phone.
//   mobile.tap-target     — interactive selector with explicit height <44px (WCAG tap target). warn.
//   mobile.hover-only     — a :hover affordance with no :focus/:active peer (touch has no hover). warn.
//   mobile.overflow-guard — 100vw with no overflow-x:clip|hidden guard in the section. warn.
//   mobile.sticky-atc     — a product-form section with no position:sticky anywhere (commerce). advise.
//
// Env: BASE_REF (base) · REUSE_MAP (section-reuse-map.md) · LAYOUT_DIR (layout) · REPORT_DIR ·
//      MOBILE_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (BLOCK-eligible → BLOCK)
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// viewportMetaOk / fontFloorGaps / tapTargetGaps / hoverOnlyGaps / overflowGuardGaps are PURE + exported. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const LAYOUT_DIR = process.env.LAYOUT_DIR || 'layout'
const ENFORCE = process.env.MOBILE_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'

const blockers = []
const warnings = []
// block-eligible findings (severityHint 'block') BLOCK at publish-grade, else warn. 'warn'/'advise' always warn.
function place(file, f) {
  const isBlock = f.severityHint === 'block' && ENFORCE
  const sev = isBlock ? 'block' : (f.severityHint === 'block' ? 'warn' : f.severityHint || 'warn')
  ;(isBlock ? blockers : warnings).push({ id: f.id, page: file, detail: f.detail, evidence: f.value || '', severity: sev })
}

// ── PURE helpers ──────────────────────────────────────────────────────────────────
export function viewportMetaOk(text) {
  return /<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(String(text || '')) && /width\s*=\s*device-width/i.test(String(text || ''))
}

export function fontFloorGaps(css) {
  const gaps = []
  for (const m of String(css || '').matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
    const px = parseFloat(m[1])
    if (px < 12) gaps.push({ id: 'mobile.font-floor', value: `${px}px`, severityHint: 'block', detail: `font-size ${px}px is below the 12px hard floor — effectively unreadable on a phone.` })
    else if (px < 14) gaps.push({ id: 'mobile.font-floor', value: `${px}px`, severityHint: 'warn', detail: `font-size ${px}px is below the 14px mobile body floor — too small on a phone; bind to a --ds type token.` })
  }
  return gaps
}

const INTERACTIVE = /(^|[\s,>~+])(a|button|\.btn\b|\.button\b|\[type=["']?(?:submit|button))/i
export function tapTargetGaps(css) {
  const gaps = []
  for (const rule of String(css || '').split('}')) {
    const [head = '', body = ''] = rule.split('{')
    if (!body || !INTERACTIVE.test(head)) continue
    const h = body.match(/(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/i)
    if (h && parseFloat(h[1]) < 44) gaps.push({ id: 'mobile.tap-target', value: `${h[1]}px`, severityHint: 'warn', detail: `interactive selector "${head.trim().slice(0, 40)}" sets height ${h[1]}px (<44px) — finger tap targets need ≥44px (WCAG 2.5.5).` })
  }
  return gaps
}

export function hoverOnlyGaps(css) {
  const text = String(css || '')
  const hovers = new Set([...text.matchAll(/([.#]?[a-z][\w-]*)\s*:\s*hover/gi)].map(m => m[1].toLowerCase()))
  const peers = new Set([...text.matchAll(/([.#]?[a-z][\w-]*)\s*:\s*(?:focus|active|focus-visible)/gi)].map(m => m[1].toLowerCase()))
  const gaps = []
  for (const h of hovers) if (!peers.has(h)) gaps.push({ id: 'mobile.hover-only', value: `${h}:hover`, severityHint: 'warn', detail: `"${h}" has a :hover state but no :focus/:active peer — touch devices have no hover, so the affordance is invisible on mobile. Add :focus/:active.` })
  return gaps
}

export function overflowGuardGaps(css) {
  const text = String(css || '')
  if (!/\b(?:min-)?width\s*:\s*100vw/i.test(text)) return []
  if (/overflow(?:-x)?\s*:\s*(?:clip|hidden)/i.test(text)) return []
  return [{ id: 'mobile.overflow-guard', value: '100vw', severityHint: 'warn', detail: `a 100vw rule with no overflow-x:clip|hidden guard — 100vw includes the scrollbar → horizontal scroll on mobile. Add overflow-x:clip on an ancestor or use width:100%.` }]
}

// ── scope + IO (mirrors check-css-layout) ───────────────────────────────────────────
const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const cssOf = (file, raw) => (/\.css$/.test(file) ? raw : (raw.match(/\{%-?\s*(?:style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end(?:style|stylesheet)\s*-?%\}/gi) || []).join('\n'))

function gitChanged() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    return execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections', 'snippets', 'assets'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n').map(s => s.trim()).filter(Boolean).filter(f => /\.(liquid|css)$/.test(f))
  } catch { return null }
}
function reuseMapTargets() {
  const mapAbs = path.resolve(cwd, REUSE_MAP)
  if (!fs.existsSync(mapAbs)) return null
  const names = new Set()
  for (const line of fs.readFileSync(mapAbs, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (!cells.some(c => /^(EXTEND|CUSTOM)$/i.test(c))) continue
    for (const c of cells) {
      const m = c.match(/([a-z0-9][a-z0-9_-]+)/i)
      if (m && !/^(EXTEND|CUSTOM|REUSE|CONFIGURE|LIBRARY)$/i.test(m[1]) && fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) names.add(`sections/${m[1]}.liquid`)
    }
  }
  return names.size ? [...names] : null
}
function layoutText() {
  const abs = path.resolve(cwd, LAYOUT_DIR)
  let t = ''
  try { for (const f of fs.readdirSync(abs)) if (f.endsWith('.liquid')) t += `\n${read(path.join(LAYOUT_DIR, f))}` } catch { return null }
  return t
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('mobile', 35, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`mobile-layout: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  // 1. viewport-meta — runs on layout/ regardless of custom surface (load-bearing for ALL mobile)
  const layout = layoutText()
  if (layout !== null && layout.trim()) {
    if (!viewportMetaOk(layout)) place(`${LAYOUT_DIR}/*.liquid`, { id: 'mobile.viewport-meta', severityHint: 'block', value: '', detail: `no <meta name="viewport" content="width=device-width, initial-scale=1"> in ${LAYOUT_DIR}/ — without it mobile browsers render at desktop width (everything tiny). Add it to <head>.` })
  }

  // 2-6. custom-surface CSS checks
  let targets = gitChanged()
  if (targets === null) targets = reuseMapTargets()
  if (targets === null) {
    if (layout === null) { warnings.push({ id: 'mobile.n-a-no-surface', page: '.', detail: 'no layout/ and no resolvable custom surface — not a theme repo, skipping', evidence: '' }) }
    return finish(null, { scope: layout === null ? 'n/a' : 'layout-only' })
  }
  const seen = new Set()
  let productForm = false
  let anySticky = false
  let scanned = 0
  for (const file of targets) {
    const k = path.resolve(cwd, file).toLowerCase()
    if (seen.has(k) || !fs.existsSync(path.resolve(cwd, file))) continue
    seen.add(k)
    const raw = read(file)
    const css = cssOf(file, raw)
    scanned += 1
    if (/\{%-?\s*form\s+['"]product['"]|add[-_ ]?to[-_ ]?cart|addtocart/i.test(raw)) productForm = true
    if (/position\s*:\s*sticky/i.test(css)) anySticky = true
    for (const f of [...fontFloorGaps(css), ...tapTargetGaps(css), ...hoverOnlyGaps(css), ...overflowGuardGaps(css)]) place(file, f)
  }
  // sticky-ATC advisory: a commerce build (product form present) with no sticky anywhere in custom CSS
  if (productForm && !anySticky) place('sections/*', { id: 'mobile.sticky-atc', severityHint: 'advise', value: '', detail: `a product-form section is present but no custom section uses position:sticky — mobile PDPs convert better with a sticky Add-to-Cart (or a repeated in-page CTA). Lens #18 verifies the rendered result.` })

  // QA-7: scope resolved but covers nothing — say so. Silence here is a green tick over an empty
  // scan, indistinguishable from a clean audit.
  if (scanned === 0) warnings.push({ id: 'mobile.n-a-empty-scope', page: '.', detail: 'scope resolved but covers 0 files — nothing was scanned for mobile layout', evidence: '' })
  finish(null, { scanned, productForm, anySticky })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
}
