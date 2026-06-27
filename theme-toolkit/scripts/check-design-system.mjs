#!/usr/bin/env node
// Boldteq design-system conformance gate — the anti-drift enforcer.
//
// Kills typography drift, random font sizes, inconsistent spacing, and component
// mismatch by failing the build when CUSTOM/EXTEND theme code uses values that are
// NOT in the project's locked design system (docs/design/design-system.json).
//
// Spec: shopify-design-system-contract-schema.md §3. Governed by
// shopify-design-governance-system.md. Run by: loom self-check (before handoff) →
// onyx conformance audit → lumen consistency gate → mantle publish gate.
//
// Usage:
//   node check-design-system.mjs                  scan custom code in cwd
//
// Env:
//   DESIGN_SYSTEM   default docs/design/design-system.json
//   BASE_REF        git ref of the theme base (default "base"); scopes the scan to
//                   sections/snippets/assets CHANGED since base (the build's custom surface).
//                   Falls back to the CUSTOM/EXTEND rows of section-reuse-map.md, else warn-skip.
//   REUSE_MAP       default section-reuse-map.md (fallback scope source)
//   REPORT_DIR      default gate-reports
//   ALLOW_DS_WAIVER=1   downgrade drift BLOCKs to warnings (CHANGES.md ## Waivers)
//
// BLOCKS on: contract missing; off-scale font-size; off-scale spacing; off-token
//   border-radius; hardcoded hex/rgb color (Rule 9); Tailwind/@apply/second-token-prefix.
// WARNS on: bespoke button class; off-token box-shadow; >6 distinct font-sizes in one
//   section; scope unresolved (no BASE_REF + no reuse map).
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const ALLOW_WAIVER = process.env.ALLOW_DS_WAIVER === '1'
// publish/verify context: an unresolvable scan scope must FAIL, not pass green having checked nothing.
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const drift = (id, page, detail, evidence) => ALLOW_WAIVER
  ? add(warnings, `${id}.waived`, page, `${detail} (waived via ## Waivers)`, evidence)
  : add(blockers, id, page, detail, evidence)

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('design-tokens', 8, {
    cwd, pass, blockers, warnings,
    evidence: { contract: DS, baseRef: BASE_REF, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`design-system: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── 1. Contract must exist + parse (design-system-first) ─────────────────────
const dsAbs = path.resolve(cwd, DS)
if (!fs.existsSync(dsAbs)) {
  add(blockers, 'ds.missing', DS, `design-system-first: ${DS} not found — no section may be designed/built before the design system is locked + vega-ratified`)
  finish(null)
}
let contract
try {
  contract = JSON.parse(fs.readFileSync(dsAbs, 'utf-8'))
} catch (err) {
  finish(`${DS} is not valid JSON: ${err.message}`)
}

const allowedFontPx = new Set((contract.typography?.allowed_px || []).map(Number))
const allowedSpace = new Set((contract.spacing?.scale || []).map(Number))
const radiusTokenPx = new Set(Object.values(contract.radius?.tokens || {}).map(Number).filter(n => !Number.isNaN(n)))
const buttonClasses = Object.values(contract.buttons?.variants || {})
  .flatMap(v => String(v.class || '').split('|').flatMap(s => s.trim().split(/\s+/)))
  .filter(Boolean)
if (allowedFontPx.size === 0) warnings.push({ id: 'ds.no-type-scale', page: DS, detail: 'typography.allowed_px is empty — font-size drift cannot be enforced', evidence: '' })
if (allowedSpace.size === 0) warnings.push({ id: 'ds.no-space-scale', page: DS, detail: 'spacing.scale is empty — spacing drift cannot be enforced', evidence: '' })

// ── 2. Determine scope: the build's custom/extended surface ──────────────────
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
  const text = fs.readFileSync(mapAbs, 'utf-8')
  const names = new Set()
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    const rung = (cells.find(c => /^(EXTEND|CUSTOM)$/i.test(c)) || '')
    if (!rung) continue
    // the "theme section" column = the cell that looks like a section file name
    for (const c of cells) {
      const m = c.match(/([a-z0-9][a-z0-9_-]+)(?:\.liquid)?/i)
      if (m && /[a-z]/i.test(m[1]) && !/^(EXTEND|CUSTOM|REUSE|CONFIGURE|LIBRARY)$/i.test(m[1])) {
        if (fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) names.add(`sections/${m[1]}.liquid`)
      }
    }
  }
  if (names.size === 0) return null
  // include paired assets
  const files = new Set(names)
  for (const n of names) {
    const base = path.basename(n, '.liquid')
    for (const ext of ['.css', '.css.liquid', '.js']) {
      const p = `assets/${base}${ext}`
      if (fs.existsSync(path.resolve(cwd, p))) files.add(p)
    }
  }
  return [...files]
}

let targets = gitChanged()
let scopeSource = 'git'
if (targets === null) { targets = reuseMapTargets(); scopeSource = 'reuse-map' }
if (targets === null) {
  if (REQUIRE_SCOPE) {
    // publish/verify: refuse to pass green having scanned nothing
    add(blockers, 'ds.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, and DS_REQUIRE_SCOPE=1 — cannot verify drift; mantle must tag the theme base "base" before publish`)
  } else {
    warnings.push({ id: 'ds.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — drift scan skipped (set BASE_REF or DS_REQUIRE_SCOPE for publish). Contract presence verified only.`, evidence: '' })
  }
  finish(null)
}
targets = targets.filter(f => /\.(liquid|css|scss)$/.test(f) && SCAN_DIRS.some(d => f.startsWith(`${d}/`)))
if (targets.length === 0) {
  warnings.push({ id: 'ds.no-custom-code', page: '.', detail: `no custom/extended CSS-bearing files in scope (${scopeSource}) — nothing to check`, evidence: '' })
  finish(null)
}

// ── 3. CSS extraction ────────────────────────────────────────────────────────
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, ' ')
}
function extractCss(file, raw) {
  if (/\.css(\.liquid)?$|\.scss$/.test(file)) return raw
  // .liquid: pull {% style %}/{% stylesheet %} blocks + inline style="..."
  let css = ''
  const blocks = raw.match(/\{%-?\s*(style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end\1\s*-?%\}/g) || []
  for (const b of blocks) css += '\n' + b
  for (const m of raw.matchAll(/style\s*=\s*"([^"]*)"/g)) css += `\n.inline{${m[1]}}`
  return css
}

const RE_DECL = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g
// rem/em → px ROOT. Dawn-based themes reset html to 62.5% (1rem = 10px) and author the
// scale against THAT root; assuming 16 inflates every rem 1.6× and manufactures phantom
// off-scale drift (the "1.7rem body reads as 27.2px" bug). Honor an explicit contract
// value (typography.rem_root_px), else auto-detect Dawn's 62.5% reset, else 16.
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
// Extract EVERY absolute length literal (px/rem/em) anywhere in a value — so drift
// wrapped in clamp()/calc()/min()/max()/shorthand is caught, not just bare literals.
const lenTokens = (value) => [...value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)]
  .map(m => { const n = parseFloat(m[1]); return m[2] === 'px' ? n : n * REM_ROOT_PX }) // rem/em → px (theme root)

for (const file of targets) {
  const abs = path.resolve(cwd, file)
  if (!fs.existsSync(abs)) continue
  const raw = fs.readFileSync(abs, 'utf-8')

  // Rule-9 reinforcements on the whole file. Scan COMMENT-STRIPPED text — a CSS/Liquid comment
  // like `/* ...no Tailwind, theme vars only */` is documentation, not a Tailwind dependency
  // (Seraphine beauty dogfood 2026-06-19: a "no Tailwind." comment false-fired ds.tailwind).
  const rawNoComments = stripComments(raw)
  if (/@apply|@tailwind|\btailwind\b/i.test(rawNoComments)) drift('ds.tailwind', file, 'Tailwind/@apply present — one CSS system only (Rule 9); use the theme vars', '')
  // Second token system = an unambiguously bolted-on prefix (Tailwind --tw-*, a parallel --ds-*).
  // NOTE: --brand-* is intentionally NOT flagged — many themes expose brand vars as their OWN tokens (Rule-9 compliant).
  for (const m of rawNoComments.matchAll(/--(?:tw|ds)-[a-z0-9-]+/gi)) { drift('ds.second-token', file, `second token system "${m[0]}" — use the theme's design-system vars (Rule 9)`, m[0]); break }

  const css = stripComments(extractCss(file, raw))
  const sizesInFile = new Set()

  for (const d of css.matchAll(RE_DECL)) {
    const prop = d[1].toLowerCase()
    const value = d[2].trim()
    const vLow = value.toLowerCase()
    const hasVar = /var\(/.test(vLow)

    // color (Rule 9) — hex or bare rgb()/rgba() not wrapped as rgb(var(...)).
    // Shadow/filter props legitimately carry rgba() — exempt (shadow drift is the warn below).
    const isShadowProp = prop === 'box-shadow' || prop === 'text-shadow' || prop === 'filter' || prop === 'backdrop-filter'
    if (!isShadowProp && /#[0-9a-fA-F]{3,8}\b/.test(value)) drift('ds.color-hex', file, `hardcoded hex in "${prop}: ${value.slice(0, 40)}" — use rgb(var(--color-*)) / a scheme class (Rule 9)`, value.slice(0, 60))
    else if (!isShadowProp && /\brgba?\(\s*\d/.test(vLow) && !/rgba?\(\s*var\(/.test(vLow)) drift('ds.color-literal', file, `literal rgb()/rgba() in "${prop}" — use rgb(var(--color-*)) (Rule 9)`, value.slice(0, 60))

    // font-size scale (lenTokens catches clamp()/calc()/min()/max() too)
    if (prop === 'font-size' && !hasVar) {
      for (const px of lenTokens(value)) {
        sizesInFile.add(px)
        if (allowedFontPx.size && !allowedFontPx.has(px)) drift('ds.font-size', file, `off-scale font-size ${value} (px≈${px}) — not in typography.allowed_px [${[...allowedFontPx].join(', ')}]; use var(--font-*) or a scale step`, value)
      }
    }

    // spacing scale
    if (/^(margin|padding)(-(top|right|bottom|left))?$|^(gap|row-gap|column-gap|inset|top|right|bottom|left)$/.test(prop) && !hasVar) {
      for (const px of lenTokens(value)) {
        if (allowedSpace.size && !allowedSpace.has(Math.abs(px))) {
          drift('ds.spacing', file, `off-scale ${prop} (px≈${px}) in "${value.slice(0, 40)}" — not on spacing.scale [${[...allowedSpace].join(', ')}]; use var(--spacing-*) or a scale value`, `${prop}: ${value}`)
        }
      }
    }

    // radius tokens
    if (prop === 'border-radius' && !hasVar) {
      for (const px of lenTokens(value)) {
        if (radiusTokenPx.size && !radiusTokenPx.has(px)) drift('ds.radius', file, `off-token border-radius (px≈${px}) in "${value.slice(0, 40)}" — not in radius.tokens [${[...radiusTokenPx].join(', ')}]; use a radius var/token`, value)
      }
    }

    // shadow (warn)
    if (prop === 'box-shadow' && !hasVar && vLow !== 'none') {
      const tokens = Object.values(contract.shadow?.tokens || {}).map(s => String(s).replace(/\s+/g, ''))
      if (tokens.length && !tokens.includes(value.replace(/\s+/g, ''))) add(warnings, 'ds.shadow', file, `box-shadow "${value.slice(0, 40)}" not a shadow.token — prefer a named token`, value.slice(0, 60))
    }
  }

  // too many type sizes in one section (warn) — store-wide cross-page count is check-consistency.mjs's job
  if (sizesInFile.size > 6) add(warnings, 'ds.too-many-sizes', file, `${sizesInFile.size} distinct font-sizes in one section (${[...sizesInFile].sort((a, b) => a - b).join(',')}) — hierarchy should use ≤6`, '')

  // bespoke button (warn) — class styled like a button but not a contract variant
  if (/\.liquid$/.test(file) && buttonClasses.length) {
    for (const m of raw.matchAll(/class\s*=\s*"([^"]*\b(?:btn|button|cta)[a-z0-9_-]*\b[^"]*)"/gi)) {
      const classes = m[1].split(/\s+/)
      const ok = classes.some(c => buttonClasses.includes(c))
      if (!ok) { add(warnings, 'ds.bespoke-button', file, `button-like class "${m[1].slice(0, 40)}" is not a buttons.variants class — use a defined variant`, m[1].slice(0, 60)); break }
    }
  }
}

finish(null)
