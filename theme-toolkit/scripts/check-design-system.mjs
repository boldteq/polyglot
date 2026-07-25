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
    // `section-<name>.css` is Dawn's own convention and what scripts/new-section.mjs emits, but it was
    // missing here — so on any repo falling back to the reuse map (no resolvable `base` tag) a section's
    // stylesheet was never in scope and token drift went unchecked. Proven 2026-07-23: injecting
    // `color: #ff0000; font-size: 17px; margin: 7px` into assets/section-story-panel.css produced PASS
    // with 0 findings. Both spellings are now paired.
    for (const stem of [base, `section-${base}`]) {
      for (const ext of ['.css', '.css.liquid', '.js']) {
        const p = `assets/${stem}${ext}`
        if (fs.existsSync(path.resolve(cwd, p))) files.add(p)
      }
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
  warnings.push({ id: 'ds.n-a-no-custom-code', page: '.', detail: `no custom/extended CSS-bearing files in scope (${scopeSource}) — nothing to check`, evidence: '' })
  finish(null)
}

// ── 3. CSS extraction ────────────────────────────────────────────────────────
// Comments collapse to a space, but their NEWLINES are kept: line-granular scoping (below) maps a
// declaration's offset back to a source line, and swallowing newlines would shift every line after a
// multi-line comment. Matching semantics are unchanged — whitespace either way.
function stripComments(s) {
  const keepLines = (m) => ' ' + '\n'.repeat((m.match(/\n/g) || []).length)
  return s.replace(/\/\*[\s\S]*?\*\//g, keepLines).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, keepLines)
}

// Lines ADDED/MODIFIED in this file since BASE_REF. Returns null when it cannot be determined.
//
// Why this exists: scope was file-granular, so touching ONE line of a big stock theme-base file pulled
// the WHOLE file into the drift scan. Measured on cravinbyandy 2026-07-23: 2 changed lines in
// assets/base.css (a colour token bind + a z-index bind) produced 107 blockers against stock Dawn CSS
// the team never wrote. That is a false BLOCK, and it punishes making a minimal, correct edit.
function changedLineSet(file) {
  try {
    const out = execFileSync('git', ['diff', '-U0', `${BASE_REF}..HEAD`, '--', file], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    const lines = new Set()
    for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      for (let i = 0; i < count; i += 1) lines.add(start + i)
    }
    return lines
  } catch { return null }
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

// A GENERATED file is not hand-authored, and the brand cascade in particular EXISTS to hold the hex
// literals every other file then binds to — flagging it is a false BLOCK that punishes doing the right
// thing. (Generating assets/design-system.css for CB-1 immediately produced 10 such blockers here and
// 10 more in the editability gate.) Detected by the generator's own header, so it covers any generated
// asset rather than one hardcoded filename.
const isGenerated = (text) => /GENERATED by [\w.-]+/i.test(String(text).slice(0, 400))

for (const file of targets) {
  const abs = path.resolve(cwd, file)
  if (!fs.existsSync(abs)) continue
  const raw = fs.readFileSync(abs, 'utf-8')
  if (isGenerated(raw)) continue

  // Rule-9 reinforcements on the whole file. Scan COMMENT-STRIPPED text — a CSS/Liquid comment
  // like `/* ...no Tailwind, theme vars only */` is documentation, not a Tailwind dependency
  // (Seraphine beauty dogfood 2026-06-19: a "no Tailwind." comment false-fired ds.tailwind).
  const rawNoComments = stripComments(raw)
  if (/@apply|@tailwind|\btailwind\b/i.test(rawNoComments)) drift('ds.tailwind', file, 'Tailwind/@apply present — one CSS system only (Rule 9); use the base theme\'s own system (Minimog m:* utilities + rgb(var(--color-*)), or Dawn component-*/theme vars)', '')
  // Second token system = an unambiguously bolted-on FOREIGN prefix (Tailwind --tw-*).
  // NOTE: --brand-* is intentionally NOT flagged — many themes expose brand vars as their OWN tokens (Rule-9 compliant).
  //
  // `--ds-*` was ALSO flagged here until 2026-07-23 (CB-1), which put two gates in direct conflict:
  //   · gate #30 (ds-cascade) emits assets/design-system.css full of `--ds-*` via the toolkit's own
  //     generator, and WARNS (`cascade.literal-not-bound`) when a custom section fails to bind to it
  //   · this gate BLOCKED the section for doing exactly that
  // Doing what the cascade asks tripped a blocker in the design-token gate, so the cascade was
  // unusable in practice — measured: wiring it on cravinbyandy traded 150 colour blockers for 15
  // `ds.second-token` ones. `--ds-*` is not a bolted-on system; it is THIS toolkit's first-class one,
  // generated from the design-system contract. Same reasoning already applied to `--brand-*` above.
  for (const m of rawNoComments.matchAll(/--tw-[a-z0-9-]+/gi)) { drift('ds.second-token', file, `second token system "${m[0]}" — use the theme's design-system vars (Rule 9)`, m[0]); break }

  const css = stripComments(extractCss(file, raw))
  const sizesInFile = new Set()

  // Line-granular scope, git-resolved plain stylesheets only. For .liquid, extractCss concatenates
  // fragments so offsets no longer map to source lines; a .liquid in scope is a custom section we
  // authored anyway, so whole-file remains right there. A reuse-map scope is an explicit "this section
  // is ours" declaration, so it also stays whole-file.
  const lineScoped = scopeSource === 'git' && /\.css(\.liquid)?$|\.scss$/.test(file) ? changedLineSet(file) : null
  const lineOf = (idx) => { let n = 1; for (let i = 0; i < idx && i < css.length; i += 1) if (css[i] === '\n') n += 1; return n }
  const outOfScope = (idx) => lineScoped !== null && !lineScoped.has(lineOf(idx))

  for (const d of css.matchAll(RE_DECL)) {
    if (outOfScope(d.index)) continue
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
    // POSITIONING (top/right/bottom/left/inset) is not spacing: those are geometric offsets that place
    // an element, not rhythm between elements, and holding `top: 33.5rem` to a spacing ladder is a false
    // BLOCK. Likewise a number inside calc()/max()/min()/clamp() is a constant in a responsive formula
    // (`max(0px, calc(47vw - 655px - 7rem))`) — snapping it to a scale step would change the geometry.
    // 24 of cravinbyandy's 290 ds.spacing findings were these two shapes (2026-07-23).
    const isFormula = /\b(calc|min|max|clamp)\(/i.test(vLow)
    if (/^(margin|padding)(-(top|right|bottom|left))?$|^(gap|row-gap|column-gap)$/.test(prop) && !hasVar && !isFormula) {
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
      // scanner artifact: the template literal is add()'s message arg, not a replacement — this
      // replace() uses a literal ''. safe-replace-ok
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
