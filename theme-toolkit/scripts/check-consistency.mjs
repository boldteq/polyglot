#!/usr/bin/env node
// Boldteq store-wide consistency gate — the countable half of DGS Mechanism 4.
//
// check-design-system.mjs enforces per-SECTION conformance (no off-scale value).
// This enforces STORE-WIDE consistency: across ALL custom/extend sections, the store
// must use ONE language — not too many distinct font-sizes, not more radii than the
// system defines, not a zoo of button/card classes. "Pages OK alone, not as one store."
//
// Spec: shopify-design-governance-system.md M4. Writes gate-reports/consistency.md +
// consistency.json. Run by: lumen (Step-13 consistency gate) + onyx (code audit) +
// mantle publish gate. vega's visual sweep + lumen device QA are the human layer on top.
//
// Usage: node check-consistency.mjs
// Env: DESIGN_SYSTEM (default docs/design/design-system.json), BASE_REF (default base),
//      REUSE_MAP (default section-reuse-map.md), DS_REQUIRE_SCOPE=1 (publish: unresolved scope = block),
//      MAX_STORE_FONT_SIZES (default 6), ALLOW_DS_WAIVER=1.
// Exit: 0 pass · 1 block · 2 env error.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const ALLOW_WAIVER = process.env.ALLOW_DS_WAIVER === '1'
const MAX_FONT_SIZES = Number.parseInt(process.env.MAX_STORE_FONT_SIZES || '6', 10)

// QA-7: how many files this run actually EXAMINED. pass:true over a zero-file scan proves nothing —
// `no findings` and `nothing was looked at` are different facts wearing the same green tick. null =
// not resolved yet; gate #45 treats an absent count as UNKNOWN, never as fine.
let scannedCount = null
const blockers = []
const warnings = []
const add = (list, id, detail, evidence = '') => list.push({ id, page: 'store-wide', detail, evidence })
const block = (id, detail, evidence) => ALLOW_WAIVER
  ? add(warnings, `${id}.waived`, `${detail} (waived via ## Waivers)`, evidence)
  : add(blockers, id, detail, evidence)
// BUG-8: warn in dev, BLOCK at publish-grade (DS_REQUIRE_SCOPE) — for drift that's tolerable mid-build but
// must not ship (button/card-style zoo). Mirrors the URL-cohesion doctrine (lenient in dev, strict to ship).
const scopeBlock = (id, detail, evidence) => REQUIRE_SCOPE ? block(id, detail, evidence) : add(warnings, id, detail, evidence)

function writeMd(reportDir, stats, pass) {
  const lines = [
    `# Store-Wide Consistency Audit — ${pass ? 'PASS' : 'BLOCK'}`,
    ``,
    `| Dimension | Found | Allowed | Verdict |`,
    `|---|---|---|---|`,
    `| Distinct font-sizes (custom sections) | ${stats.fontSizes.length} (${stats.fontSizes.join(', ')}) | ≤${MAX_FONT_SIZES} | ${stats.fontSizes.length <= MAX_FONT_SIZES ? 'PASS' : 'BLOCK'} |`,
    `| Distinct font-weights | ${stats.fontWeights.length} (${stats.fontWeights.join(', ')}) | ≤${stats.weightCap} | ${stats.fontWeights.length <= stats.weightCap ? 'PASS' : 'BLOCK'} |`,
    `| Distinct radii | ${stats.radii.length} (${stats.radii.join(', ')}) | ≤${stats.radiusAllowed} | ${stats.radii.length <= stats.radiusAllowed ? 'PASS' : 'BLOCK'} |`,
    `| Distinct button-family classes | ${stats.buttonClasses.length} | ≤${stats.buttonAllowed} | ${stats.buttonClasses.length <= stats.buttonAllowed ? 'PASS' : 'block@publish'} |`,
    `| Distinct card classes | ${stats.cardClasses.length} | ≤1 | ${stats.cardClasses.length <= 1 ? 'PASS' : 'warn'} |`,
    ``,
    `Human layer (NOT automated here): vega visual sweep across home/collection/PDP/cart/search/header/footer/account + lumen device QA.`,
    ``,
  ]
  try { fs.writeFileSync(path.join(reportDir, 'consistency.md'), lines.join('\n')) } catch { /* report dir created by writeReport */ }
}

function finish(envError, stats) {
  const pass = !envError && blockers.length === 0
  const reportDir = process.env.REPORT_DIR || 'gate-reports'
  try { fs.mkdirSync(path.resolve(cwd, reportDir), { recursive: true }) } catch { /* noop */ }
  if (stats) writeMd(path.resolve(cwd, reportDir), stats, pass)
  writeReport('consistency', 9, {
    cwd, pass, blockers, warnings,
    evidence: { contract: DS, baseRef: BASE_REF, scanned: scannedCount ?? undefined, ...(stats || {}), reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`consistency: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── contract ─────────────────────────────────────────────────────────────────
const dsAbs = path.resolve(cwd, DS)
if (!fs.existsSync(dsAbs)) { add(blockers, 'consistency.no-contract', `${DS} not found — design-system-first`); finish(null, null) }
let contract
try { contract = JSON.parse(fs.readFileSync(dsAbs, 'utf-8')) } catch (err) { finish(`${DS} invalid JSON: ${err.message}`, null) }
const radiusAllowed = Object.keys(contract.radius?.tokens || {}).length || 4
const buttonAllowed = Object.keys(contract.buttons?.variants || {}).length || 2
// BUG-7/D5: one type VOICE store-wide — too many distinct font-weights reads as drift. Cap from the
// contract (typography.weight_cap) or a premium default of 3 (e.g. regular/medium/bold). var() is exempt.
const weightCap = Number(contract.typography?.weight_cap) || 3

// ── scope (same convention as check-design-system) ───────────────────────────
const SCAN_DIRS = ['sections', 'snippets', 'assets']
function gitChanged() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
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
  if (names.size === 0) return null
  const files = new Set(names)
  for (const n of names) for (const ext of ['.css', '.css.liquid']) { const p = `assets/${path.basename(n, '.liquid')}${ext}`; if (fs.existsSync(path.resolve(cwd, p))) files.add(p) }
  return [...files]
}

let targets = gitChanged()
let scopeSource = 'git'                       // line-granular scoping only applies to a git-resolved scope
if (targets === null) { targets = reuseMapTargets(); scopeSource = 'reuse-map' }

if (targets === null) {
  if (REQUIRE_SCOPE) { add(blockers, 'consistency.scope-unresolved-strict', `scope unresolvable + DS_REQUIRE_SCOPE=1 — tag the theme base "base"`); finish(null, null) }
  warnings.push({ id: 'consistency.scope-unresolved', page: 'store-wide', detail: `scope unresolvable — store-wide audit skipped (set BASE_REF)`, evidence: '' })
  finish(null, null)
}
targets = targets.filter(f => /\.(liquid|css|scss)$/.test(f) && SCAN_DIRS.some(d => f.startsWith(`${d}/`)))
scannedCount = targets.length
// QA-7: scope RESOLVED but covers nothing — say so. Silence here is a green tick over an empty
// scan, which reads exactly like a clean audit. (Convention: *.n-a-* is what gate #45 and
// audit-vacuous-pass already understand; `honesty`/`design-tokens` have always done this.)
if (targets.length === 0) {
  warnings.push({ id: 'consistency.n-a-empty-scope', page: 'store-wide', detail: 'scope resolved but covers 0 liquid/css files — nothing was scanned for consistency', evidence: '' })
  finish(null, null)
}

// ── gather store-wide stats ──────────────────────────────────────────────────
// rem/em → px ROOT — same Dawn 62.5% (1rem=10px) calibration as check-design-system.mjs;
// a 16px assumption inflates every rem 1.6× and fabricates a font-size/radius "zoo".
function detectRemRootPx() {
  const declared = Number(contract.typography?.rem_root_px)
  if (declared > 0) return declared
  for (const f of ['assets/base.css', 'assets/reset.css', 'assets/theme.css', 'assets/section-password.css', 'assets/template-giftcard.css', 'assets/premium.css']) {
    try {
      const p = path.resolve(cwd, f)
      if (fs.existsSync(p) && /font-size:\s*(?:calc\([^;{}]*?)?62\.5%/.test(fs.readFileSync(p, 'utf-8'))) return 10
    } catch { /* unreadable — try next */ }
  }
  return 16
}
const REM_ROOT_PX = detectRemRootPx()
const lenTokens = (value) => [...value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)].map(m => { const n = parseFloat(m[1]); return m[2] === 'px' ? n : n * REM_ROOT_PX })
// font-weight values are unitless (400, 700) or keywords (normal→400, bold→700). lighter/bolder/inherit are relative → skipped.
const WEIGHT_KW = { normal: 400, bold: 700 }
const weightTokens = (value) => value.split(/[\s,]+/).map(t => t.trim().toLowerCase())
  .map(t => (/^\d{3}$/.test(t) && Number(t) >= 100 && Number(t) <= 900 ? Number(t) : WEIGHT_KW[t] || null)).filter(Boolean)
function extractCss(file, raw) {
  if (/\.css(\.liquid)?$|\.scss$/.test(file)) return raw
  let css = ''
  for (const b of (raw.match(/\{%-?\s*(style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end\1\s*-?%\}/g) || [])) css += '\n' + b
  for (const m of raw.matchAll(/style\s*=\s*"([^"]*)"/g)) css += `\n.x{${m[1]}}`
  return css
}
const RE_DECL = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g
const fontSizes = new Set(), fontWeights = new Set(), radii = new Set(), buttonClasses = new Set(), cardClasses = new Set()

// Lines ADDED/MODIFIED since BASE_REF. Same reasoning as check-design-system (CB-10): scope was
// file-granular, so a stock theme-base stylesheet touched on ONE line contributed its ENTIRE type/
// radius vocabulary to a "store-wide variety" count the team never chose. Measured on cravinbyandy
// 2026-07-23: stock assets/base.css alone added 9/10/12/13/14/15/16/18 to the tally, taking the
// reported font-size variety from 18 (ours) to 25.
//
// This narrows WHOSE variety is being measured — the variety we INTRODUCED on top of the base — which
// is what the rule is actually about. The base's own vocabulary is a given we are told to reuse.
function changedLineSet(file) {
  try {
    const out = execFileSync('git', ['diff', '-U0', `${BASE_REF}..HEAD`, '--', file], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    const lines = new Set()
    for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1]); const count = m[2] === undefined ? 1 : Number(m[2])
      for (let i = 0; i < count; i += 1) lines.add(start + i)
    }
    return lines
  } catch { return null }
}

for (const file of targets) {
  const abs = path.resolve(cwd, file); if (!fs.existsSync(abs)) continue
  const raw = fs.readFileSync(abs, 'utf-8')
  // keep the comments' NEWLINES so an offset still maps to its source line
  const css = extractCss(file, raw).replace(/\/\*[\s\S]*?\*\//g, (m) => ' ' + '\n'.repeat((m.match(/\n/g) || []).length))
  // line-granular for git-resolved plain stylesheets only — see changedLineSet above. .liquid is
  // excluded because extractCss concatenates fragments (offsets stop mapping), and a .liquid in scope
  // is a custom section we authored anyway.
  const lineScoped = scopeSource === 'git' && /\.css(\.liquid)?$|\.scss$/.test(file) ? changedLineSet(file) : null
  const lineOf = (idx) => { let n = 1; for (let i = 0; i < idx && i < css.length; i += 1) if (css[i] === '\n') n += 1; return n }
  for (const d of css.matchAll(RE_DECL)) {
    if (lineScoped !== null && !lineScoped.has(lineOf(d.index))) continue
    const prop = d[1].toLowerCase(); const value = d[2].trim()
    if (/var\(/.test(value)) continue
    if (prop === 'font-size') for (const px of lenTokens(value)) fontSizes.add(px)
    if (prop === 'font-weight') for (const w of weightTokens(value)) fontWeights.add(w)
    if (prop === 'border-radius') for (const px of lenTokens(value)) radii.add(px)
  }
  if (/\.liquid$/.test(file)) {
    for (const m of raw.matchAll(/class\s*=\s*"([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) {
        if (/\b(btn|button|cta)[a-z0-9_-]*/i.test(c) && !/^(btn|button)$/i.test(c)) buttonClasses.add(c.toLowerCase())
        if (/card[a-z0-9_-]*/i.test(c)) cardClasses.add(c.toLowerCase())
      }
    }
  }
}

const stats = {
  fontSizes: [...fontSizes].sort((a, b) => a - b),
  fontWeights: [...fontWeights].sort((a, b) => a - b), weightCap,
  radii: [...radii].sort((a, b) => a - b), radiusAllowed,
  buttonClasses: [...buttonClasses], buttonAllowed,
  cardClasses: [...cardClasses],
}

// ── invariants ───────────────────────────────────────────────────────────────
if (stats.fontSizes.length > MAX_FONT_SIZES) block('consistency.font-size-variety', `store uses ${stats.fontSizes.length} distinct custom font-sizes (${stats.fontSizes.join(', ')}) — keep ≤${MAX_FONT_SIZES} store-wide for one hierarchy`)
if (stats.fontWeights.length > weightCap) block('consistency.font-weight-variety', `store uses ${stats.fontWeights.length} distinct font-weights (${stats.fontWeights.join(', ')}) — keep ≤${weightCap} store-wide for one type voice (set typography.weight_cap to widen)`)
if (stats.radii.length > radiusAllowed) block('consistency.radius-variety', `store uses ${stats.radii.length} distinct radii (${stats.radii.join(', ')}) but the system defines ${radiusAllowed} radius tokens — one radius language store-wide`)
if (stats.buttonClasses.length > buttonAllowed) scopeBlock('consistency.button-variety', `${stats.buttonClasses.length} distinct button-family classes across custom sections (${stats.buttonClasses.join(', ')}) — system allows ${buttonAllowed} variants; CTAs must look the same store-wide (warns in dev, blocks at publish)`)
if (stats.cardClasses.length > 1) scopeBlock('consistency.card-variety', `${stats.cardClasses.length} distinct card classes (${stats.cardClasses.join(', ')}) — one canonical card store-wide (warns in dev, blocks at publish)`)

finish(null, stats)
