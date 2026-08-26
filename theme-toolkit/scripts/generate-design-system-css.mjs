#!/usr/bin/env node
// Design-system CASCADE generator (Plan Pillar 3). The root cause of "fix font size on hero / fix
// spacing on PDP / 5 rounds" is that each section hardcodes its own literal sizing — change the
// design system and nothing cascades. This reads docs/design/design-system.json and emits
// assets/design-system.css: one CSS custom property per token (type ladder / spacing / radius /
// weights / fonts). Loom authors CUSTOM sections against these vars (`font-size: var(--ds-h2)`,
// `padding: var(--ds-section-pad)`) instead of literals — so editing ONE design-system.json value
// cascades to every page. (Decision: custom sections + cascade only; Dawn/Minimog bases untouched.)
//
// Usage: node generate-design-system-css.mjs [--out assets/design-system.css]
// Env: DESIGN_SYSTEM (docs/design/design-system.json) · REPORT_DIR
// Exit: 0 = written · 2 = no/invalid contract

import fs from 'node:fs'
import path from 'node:path'
import { dsHash } from './lib/ds-hash.mjs'

const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const die = (m) => { console.error(`ds-css: ENV-ERROR — ${m}`); process.exit(2) }

let out = 'assets/design-system.css'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--out') out = argv[++i]

// 2026-08-25 (P7 token base contract). Merge canonical base tokens UNDER the client contract so every
// store inherits the 40+ standard tokens (spacing / radius / shadow / motion / z-index / breakpoints)
// without re-declaring them. Client wins on conflicts; base fills gaps. Before this, Grafilabel shipped
// 33 font sizes (Figma dump), Penelope 10, Bunevida 19 — 60-70% overlap was inheritable boilerplate.
// Base absent = 100% legacy behavior (client-only, still works). Override base path via DS_BASE_TOKENS.
const BASE_PATH = process.env.DS_BASE_TOKENS || path.join(process.env.HOME || '', '.claude/memory/design/base-tokens.json')
let base = {}
try { base = JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8')) } catch { /* absent → legacy mode, no base */ }
// strip meta before merge — `$metadata` and `_do_not_inherit` are documentation, not tokens
if (base && typeof base === 'object') { delete base.$metadata; delete base._do_not_inherit; delete base.$schema_version }

function dsDeepMerge(a, b) {
  if (a === undefined || a === null) return b
  if (b === undefined || b === null) return a
  if (typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return b
  const out = { ...a }
  for (const k of Object.keys(b)) out[k] = dsDeepMerge(a[k], b[k])
  return out
}

let clientDs
try { clientDs = JSON.parse(fs.readFileSync(path.resolve(cwd, DS), 'utf-8')) } catch (e) { die(`cannot read ${DS}: ${e.message}`) }
const j = dsDeepMerge(base, clientDs)

const lines = []
const push = (k, v) => lines.push(`  ${k}: ${v};`)

// ── type ladder → --ds-size-<px> + semantic --ds-h1..h6 / --ds-body ──────────
const ladder = [...new Set((j.typography?.allowed_px || []).map(Number))].sort((a, b) => b - a)
if (!ladder.length) die(`${DS} has no typography.allowed_px — nothing to cascade`)
lines.push('  /* type ladder (every section binds heading/body to these — no literals) */')
for (const px of ladder) push(`--ds-size-${px}`, `${px}px`)
const roles = ['--ds-h1', '--ds-h2', '--ds-h3', '--ds-h4', '--ds-h5', '--ds-h6']
ladder.slice(0, 6).forEach((px, i) => push(roles[i], `var(--ds-size-${px})`))
push('--ds-body', `var(--ds-size-${ladder[Math.min(ladder.length - 1, ladder.findIndex(p => p <= 18) >= 0 ? ladder.findIndex(p => p <= 18) : ladder.length - 1)]})`)

// ── spacing scale → --ds-space-<px> + --ds-section-pad (the inter-section rhythm) ──
const scale = [...new Set((j.spacing?.scale || []).map(Number))].sort((a, b) => a - b)
if (scale.length) {
  lines.push('  /* spacing scale (section padding + gaps bind to these — even inter-section cadence) */')
  for (const px of scale) push(`--ds-space-${px}`, px === 0 ? '0' : `${px}px`)
  const rhythm = j.spacing_rhythm?.section_rhythm_px || j.spacing?.section_rhythm_px
  const sectionPad = Array.isArray(rhythm) ? rhythm[0] : (scale.find(s => s >= 56 && s <= 96) || scale[Math.floor(scale.length * 0.7)])
  push('--ds-section-pad', `var(--ds-space-${sectionPad})`)
}

// ── brand colours → --ds-color-<name> ────────────────────────────────────────
// CB-1 (2026-07-23). The cascade emitted type/spacing/weight/font but NOT colour, so the brand palette
// in design-system.json — the PDF-authoritative one — had no CSS variable anywhere in the theme. That
// is why every custom section hardcodes literals: there was nothing to bind to. On cravinbyandy that
// is 201 of the 476 design-token blockers (165 `ds.color-hex` + 36 `ds.color-literal`).
// Emitting them makes the swap PROVABLY identity: `#6C6C6C` → `var(--ds-color-body-gray)` where that
// var holds exactly `#6C6C6C`, so nothing rendered changes. Dawn's `--color-*` scheme vars cannot do
// this job — they resolve per section scheme, so binding a fixed brand colour to them would change
// the rendered result wherever a section is used under a different scheme.
// Keys beginning `_` are documentation (e.g. `_source`), never tokens. A `color` block may nest the
// actual swatches under `brand_palette` (contract §2, 2026-07 shape) rather than flat string leaves —
// walk into `brand_palette` for those, and on EITHER shape only accept values that look like a real
// colour literal (#hex/rgb/hsl). That guards against prose doc strings (`rule`, `wiring_handoff`,
// `system`) being flattened into `--ds-color-rule: <a paragraph>` — a real regression this generator
// shipped with once `color` grew documentation fields (found via haircare dogfood, 2026-07-29).
const COLOR_DOC_KEYS = new Set(['system', 'rule', 'wiring_handoff', 'note', 'max_schemes', 'scheme_count_max_pack', 'schemes'])
const isColorLiteral = (v) => typeof v === 'string' && /^\s*(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(v.trim())
const colorMap = {}
const collectColorLeaves = (obj) => {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith('_') || COLOR_DOC_KEYS.has(k)) continue
    if (isColorLiteral(v)) colorMap[k] = v.trim()
    else if (k === 'brand_palette' && v && typeof v === 'object') collectColorLeaves(v)
  }
}
collectColorLeaves(j.color)
const colorEntries = Object.entries(colorMap)
const kebab = (k) => k.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
if (colorEntries.length) {
  lines.push('  /* brand colours (bind sections to these — a literal hex is unreachable from the kit) */')
  for (const [name, v] of colorEntries) push(`--ds-color-${kebab(name)}`, String(v).trim())
}

// ── radius tokens ────────────────────────────────────────────────────────────
const radius = j.radius?.tokens || {}
if (Object.keys(radius).length) {
  lines.push('  /* radius tokens */')
  for (const [name, v] of Object.entries(radius)) push(`--ds-radius-${name}`, typeof v === 'number' ? `${v}px` : String(v))
}

// ── shadow tokens (named, brand-tinted — never an ad-hoc box-shadow literal) ──
const shadow = j.shadow?.tokens || {}
if (Object.keys(shadow).length) {
  lines.push('  /* shadow tokens (bind box-shadow to these, never an ad-hoc value) */')
  for (const [name, v] of Object.entries(shadow)) push(`--ds-shadow-${name}`, String(v))
}

// ── font weights ─────────────────────────────────────────────────────────────
const weights = Array.isArray(j.typography?.allowed_weights) ? j.typography.allowed_weights : [400, 700]
lines.push('  /* font weights (≤ this set per page — a stray 500 reads as a different family) */')
weights.forEach((w, i) => push(`--ds-weight-${i === 0 ? 'regular' : i === weights.length - 1 ? 'bold' : `m${i}`}`, String(w)))

// ── fonts (alias to the theme's loaded families — don't re-declare the @font-face) ──
lines.push('  /* fonts — alias the theme-loaded families so headings/body inherit them */')
push('--ds-font-heading', 'var(--font-heading-family, inherit)')
push('--ds-font-body', 'var(--font-body-family, inherit)')

// ── z-index layers (CB-4) ────────────────────────────────────────────────────
// A z-index war starts when every section invents its own number. Named layers make the stacking
// order a DESIGN decision recorded in one place. Optional `z_index` in design-system.json overrides.
// NOTE the skip-link sits above everything ON PURPOSE: an accessibility skip link that a modal can
// cover is useless, which is why 9999 there is correct and is not part of the ladder below.
// `skip-link` is deliberately the TOP layer: an accessibility skip link a modal can cover is
// useless, so 9999 there is correct — it just has to be a NAMED layer rather than an ad-hoc bid.
const Z_DEFAULT = { base: 1, dropdown: 10, sticky: 100, drawer: 1000, modal: 2000, toast: 3000, 'skip-link': 9999 }
const zLayers = (j.z_index && typeof j.z_index === 'object' && Object.keys(j.z_index).length) ? j.z_index : Z_DEFAULT
lines.push('  /* z-index layers — bind stacking to a named layer, never a raw 9999 */')
for (const [name, v] of Object.entries(zLayers)) push(`--ds-z-${name}`, String(v))

// #2 — stamp a content-hash of the design system so check-ds-cascade can detect a brand-change that
// wasn't regenerated (the cascade is then ENFORCED, not forgotten).
const css = `/* GENERATED by generate-design-system-css.mjs from ${DS} — do not edit by hand. Re-run after\n   changing the design system; every custom section consumes these vars so one edit cascades.\n   ds-hash:${dsHash(j)} */\n:root {\n${lines.join('\n')}\n}\n`

const outAbs = path.resolve(cwd, out)
fs.mkdirSync(path.dirname(outAbs), { recursive: true })
fs.writeFileSync(outAbs, css)
console.log(`ds-css: wrote ${out} — ${ladder.length} type · ${scale.length} spacing · ${colorEntries.length} colour · ${Object.keys(radius).length} radius · ${weights.length} weight · ${Object.keys(zLayers).length} z-layer tokens`)
console.log(`  loom: in theme.liquid <head> add  {{ 'design-system.css' | asset_url | stylesheet_tag }}  ; in custom sections use var(--ds-h2)/var(--ds-section-pad)/var(--ds-radius-md) — never literals.`)
process.exit(0)
