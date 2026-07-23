#!/usr/bin/env node
// snap-colors-to-tokens — replace hardcoded colour literals with the brand tokens they already equal.
//
// CB-1. Custom sections hardcode colour literals (cravinbyandy: 165 `ds.color-hex` + 36
// `ds.color-literal` blockers) because until now there was no brand token to bind to. The cascade emits
// `--ds-color-*` now, so a literal that EXACTLY equals a token can be swapped mechanically.
//
// THE ONE RULE: the swap must be IDENTITY. A literal is replaced only when its canonical value is
// byte-identical to a token's canonical value — `#6C6C6C` → `var(--ds-color-body-gray)` because that
// var IS `#6C6C6C`. Anything else is left alone and reported: a colour with no exact token is a design
// decision (which brand colour did they mean?), not a mechanical substitution, and guessing it would
// silently change what the client sees.
//
// REFUSES TO APPLY unless the cascade is generated AND referenced by a layout. Swapping to
// `var(--ds-color-*)` in a theme that never loads design-system.css does not preserve the colour — an
// undefined custom property invalidates the declaration, so the colour is DELETED. Dry-run is safe
// anywhere; `--apply` is gated on those two preconditions.
//
//   node toolkit/scripts/snap-colors-to-tokens.mjs                 # dry run — report only
//   node toolkit/scripts/snap-colors-to-tokens.mjs --apply         # write the swaps
//   node toolkit/scripts/snap-colors-to-tokens.mjs --only assets/section-hero.css
//
// Env: DESIGN_SYSTEM (docs/design/design-system.json) · DS_CSS (assets/design-system.css)
// Exit: 0 ok · 1 refused (preconditions unmet, with --apply) · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const DS_CSS = process.env.DS_CSS || 'assets/design-system.css'
const die = (m) => { console.error(`snap-colors: ENV-ERROR — ${m}`); process.exit(2) }

// Shadow/filter values legitimately carry rgba() and the gate exempts them — stay in lockstep so this
// tool never edits something the gate does not ask about.
const EXEMPT_PROP = /^(box-shadow|text-shadow|filter|backdrop-filter)$/i

// PURE: one canonical string per colour, so equality is exact rather than approximate.
// #abc → #aabbcc, case-folded; rgb()/rgba() whitespace-stripped; a fully-opaque rgba collapses to hex
// so `rgba(255,255,255,1)` and `#FFFFFF` compare equal. Returns null for anything unrecognised —
// never a guess.
export function canonicalColor(raw) {
  const s = String(raw || '').trim().toLowerCase()
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`
  m = s.match(/^#([0-9a-f]{6})$/)
  if (m) return `#${m[1]}`
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((n) => Math.round(Number(n)))
    if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (!Number.isFinite(a)) return null
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
    return a === 1 ? hex : `rgba(${r},${g},${b},${a})`
  }
  return null
}

// PURE: token name → canonical value, from the design-system contract.
export function tokenMap(dsJson) {
  const out = new Map() // canonical value → --ds-color-* name
  const kebab = (k) => k.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  for (const [k, v] of Object.entries(dsJson?.color || {})) {
    if (k.startsWith('_') || typeof v !== 'string') continue
    const canon = canonicalColor(v)
    if (!canon) continue
    if (!out.has(canon)) out.set(canon, `--ds-color-${kebab(k)}`) // first name wins — stable output
  }
  return out
}

// PURE: rewrite one stylesheet. Returns { text, swaps[], skipped[] } — every literal is accounted for.
export function snapCss(cssText, tokens) {
  const swaps = []
  const skipped = []
  // `prop: value;` — enough to know the property (for the exemption) and isolate the literals
  const text = String(cssText).replace(/([-a-zA-Z]+)\s*:\s*([^;{}]+)/g, (whole, prop, value) => {
    if (EXEMPT_PROP.test(prop)) return whole
    // `rgba?\((?:[^()]|\([^()]*\))*\)` tolerates ONE level of nesting, so `rgb(var(--color-foreground))`
    // is captured whole instead of being truncated at the inner `)`. Caught on real data: a naive
    // `[^)]*` produced 194 phantom "literals" like `rgba(var(--color-foreground` — those are already
    // correct scheme bindings, and the gate deliberately exempts them (`!/rgba?\(\s*var\(/`).
    const newValue = value.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\((?:[^()]|\([^()]*\))*\)/g, (lit) => {
      if (/^rgba?\(\s*var\(/i.test(lit)) return lit // already bound to a scheme var — not a literal
      const canon = canonicalColor(lit)
      if (!canon) { skipped.push({ prop, literal: lit, reason: 'unparseable (8-digit hex / var / calc)' }); return lit }
      const token = tokens.get(canon)
      if (!token) { skipped.push({ prop, literal: lit, reason: 'no token has this exact value' }); return lit }
      swaps.push({ prop, literal: lit, token })
      return `var(${token})`
    })
    return newValue === value ? whole : `${prop}: ${newValue}`
  })
  return { text, swaps, skipped }
}

function layoutsReferencing(cssPath) {
  const dir = path.resolve(cwd, 'layout')
  const base = String(cssPath).split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.liquid')) } catch { return [] }
  return files.filter((f) => new RegExp(base).test(fs.readFileSync(path.join(dir, f), 'utf-8')))
}

function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const onlyIdx = argv.indexOf('--only')
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null

  let dsJson
  try { dsJson = JSON.parse(fs.readFileSync(path.resolve(cwd, DS), 'utf-8')) } catch (e) { die(`cannot read ${DS}: ${e.message}`) }
  const tokens = tokenMap(dsJson)
  if (!tokens.size) die(`${DS} defines no usable color tokens — nothing to snap to (run generate-design-system-css.mjs first)`)

  // PRECONDITIONS — only enforced for --apply; a dry run is safe anywhere.
  if (apply) {
    const problems = []
    if (!fs.existsSync(path.resolve(cwd, DS_CSS))) problems.push(`${DS_CSS} does not exist — run generate-design-system-css.mjs`)
    else if (!layoutsReferencing(DS_CSS).length) problems.push(`${DS_CSS} is not referenced by any layout — add {{ '${path.basename(DS_CSS)}' | asset_url | stylesheet_tag }} to layout/theme.liquid`)
    if (problems.length) {
      console.error('snap-colors: REFUSING to apply — the cascade is not live, so a swap would DELETE colours, not preserve them:')
      for (const p of problems) console.error(`  · ${p}`)
      console.error('  (re-run without --apply to preview the swaps safely)')
      process.exit(1)
    }
  }

  const assetsDir = path.resolve(cwd, 'assets')
  let files = []
  try { files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css') && f !== path.basename(DS_CSS)) } catch { die('no assets/ directory') }
  if (only) files = files.filter((f) => path.join('assets', f) === only || f === only)

  let totalSwaps = 0
  const unmatched = new Map() // canonical literal → count
  for (const f of files) {
    const rel = path.join('assets', f)
    const abs = path.join(assetsDir, f)
    const src = fs.readFileSync(abs, 'utf-8')
    const { text, swaps, skipped } = snapCss(src, tokens)
    for (const s of skipped) unmatched.set(s.literal.toLowerCase(), (unmatched.get(s.literal.toLowerCase()) || 0) + 1)
    if (!swaps.length) continue
    totalSwaps += swaps.length
    console.log(`${apply ? 'snapped' : 'would snap'} ${String(swaps.length).padStart(3)} in ${rel}`)
    if (apply) fs.writeFileSync(abs, text)
  }

  console.log(`\nsnap-colors: ${apply ? 'applied' : 'DRY RUN —'} ${totalSwaps} literal(s) map exactly to a brand token across ${files.length} stylesheet(s)`)
  if (unmatched.size) {
    const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    console.log(`\n${unmatched.size} distinct literal(s) have NO exact token and were left untouched —`)
    console.log('these are design decisions, not mechanical swaps; add the colour to the kit or pick a token:')
    for (const [lit, n] of top) console.log(`  ${String(n).padStart(3)}×  ${lit}`)
  }
  if (!apply && totalSwaps) console.log('\nre-run with --apply to write (requires the cascade generated + wired into a layout)')
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
