#!/usr/bin/env node
// apply-p0-card-corrections.mjs — Atrium deep-check P0 (corrections C1 + C2), idempotent.
//   C1: remove the ` · **Rung:** …` tag from each card's header line (rung lives in _concept-section-map.json).
//   C2: (a) wrap mapped card-local color custom-props in var(--brand-<role>, <hex-fallback>) — gate-#8-legal
//          (--brand-* is whitelisted by check-design-system.mjs; --ds-* would FAIL as a 2nd token prefix).
//       (b) append a `## Design-system bindings` block mapping the card's vars → DGS contract ROLES,
//          so loom binds role→theme-native var at conversion and gate #8 passes by construction.
// Rule-9-safe + theme-agnostic. token ratifies the var→role map in P1.
//
// Usage: node scripts/apply-p0-card-corrections.mjs --dry   (preview)
//        node scripts/apply-p0-card-corrections.mjs          (apply)

import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium/components')
const dry = process.argv.includes('--dry')

// card-local color var -> { brand: <--brand-* token>, role: <DGS color role> }
const COLOR_MAP = {
  '--fg': { brand: '--brand-text', role: 'color.scheme.text' },
  '--muted': { brand: '--brand-text-subdued', role: 'color.scheme.text (subdued)' },
  '--accent': { brand: '--brand-accent', role: 'color.scheme.button_bg / accent' },
  '--accent-soft': { brand: '--brand-accent-soft', role: 'color.scheme.accent (tint)' },
  '--accent-ink': { brand: '--brand-accent-ink', role: 'color.scheme.button_text on accent' },
  '--accent-fg': { brand: '--brand-accent-fg', role: 'color.scheme.button_text' },
  '--line': { brand: '--brand-border', role: 'color.scheme.border' },
  '--hair': { brand: '--brand-border', role: 'color.scheme.border (hairline)' },
  '--card-bg': { brand: '--brand-surface', role: 'color.scheme.bg (card surface)' },
  '--panel-bg': { brand: '--brand-surface', role: 'color.scheme.bg (panel surface)' },
  '--surface': { brand: '--brand-surface', role: 'color.scheme.bg (surface)' },
  '--box-bg': { brand: '--brand-surface', role: 'color.scheme.bg (box surface)' },
  '--field-bg': { brand: '--brand-surface', role: 'color.scheme.bg (field)' },
  '--tab-bg': { brand: '--brand-surface', role: 'color.scheme.bg (tab)' },
  '--band-bg': { brand: '--brand-surface', role: 'color.scheme.bg (band)' },
  '--chip-bg': { brand: '--brand-surface', role: 'color.scheme.bg (chip)' },
  '--badge-bg': { brand: '--brand-accent-soft', role: 'color.scheme.accent (badge)' },
  '--row-alt': { brand: '--brand-surface', role: 'color.scheme.bg (zebra row)' },
  '--thumb-bg': { brand: '--brand-surface', role: 'color.scheme.bg (thumb)' },
  '--star': { brand: '--brand-accent', role: 'color.scheme.accent (rating)' },
  '--ok': { brand: '--brand-success', role: 'semantic success' },
  '--verified': { brand: '--brand-success', role: 'semantic success (verified)' },
  '--urgent': { brand: '--brand-accent', role: 'color.scheme.accent (promo/urgency)' },
}
const RADIUS_MAP = { '--radius': 'radius.tokens.lg (var(--blocks-radius))', '--radius-sm': 'radius.tokens.sm' }
const SPACING_VARS = ['--space', '--space-1', '--space-2', '--space-3', '--space-4', '--space-x', '--space-y', '--space-block', '--space-inline', '--gap', '--pad']

const HEX = /#[0-9a-fA-F]{3,8}/
let cards = 0, rungStripped = 0, hexWrapped = 0, bindingsAdded = 0, alreadyBound = 0

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : (d.name.endsWith('.md') && d.name !== '_index.md' && d.name !== 'README.md' ? [path.join(dir, d.name)] : []))

for (const p of walk(COMPONENTS)) {
  cards++
  let body = fs.readFileSync(p, 'utf8')
  const before = body
  const usedColor = new Set(), usedRadius = new Set(), usedSpacing = new Set()

  const out = body.split('\n').map((line) => {
    // C1 — strip the Rung tag from the header line (keep Category/Concept)
    if (line.includes('**Category:**') && line.includes('**Rung:**')) {
      rungStripped++
      line = line.replace(/\s*[·|]\s*\*\*Rung:\*\*.*$/, '')
    }
    // C2a — wrap a mapped color custom-prop's hex value in var(--brand-*, hex)
    const m = line.match(/^(\s*)(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;(.*)$/)
    if (m && COLOR_MAP[m[2]]) {
      usedColor.add(m[2])
      if (!line.includes('var(--brand-')) {
        hexWrapped++
        line = `${m[1]}${m[2]}: var(${COLOR_MAP[m[2]].brand}, ${m[3]});${m[4]}`
      }
    } else if (m && RADIUS_MAP[m[2]]) usedRadius.add(m[2])
    // track spacing/radius usage anywhere for the bindings doc
    for (const sv of SPACING_VARS) if (new RegExp(`${sv}\\b`).test(line)) usedSpacing.add(sv)
    for (const rv of Object.keys(RADIUS_MAP)) if (new RegExp(`${rv}\\b`).test(line)) usedRadius.add(rv)
    return line
  }).join('\n')
  body = out

  // C2b — append the Design-system bindings block (idempotent)
  if (/##\s+Design-system bindings/.test(body)) { alreadyBound++ }
  else {
    const lines = []
    lines.push('\n## Design-system bindings')
    lines.push('_loom binds these ROLES to the chosen theme\'s native vars at conversion (Rule 9 — no parallel token system). Values below are neutral fallbacks; the locked `docs/design/design-system.json` supplies the real values. token ratifies this map (P1)._')
    if (usedColor.size) { lines.push(''); lines.push('**Color:**'); for (const v of [...usedColor].sort()) lines.push(`- \`${v}\` → ${COLOR_MAP[v].role}  (binds \`rgb(var(--color-*))\` scheme role)`) }
    lines.push('')
    lines.push('**Typography:** headings → `typography.scale` steps (`var(--font-h*)`, allowed_px [48,36,32,28,26,22,18,16,14,12]); body → `body`/`body_sm`. Never an off-scale literal.')
    if (usedSpacing.size) lines.push(`**Spacing:** ${[...usedSpacing].sort().map((s) => `\`${s}\``).join(', ')} → \`spacing.scale\` [0,4,8,12,16,24,32,40,48,64,80,96,120] via \`var(--spacing-*)\`.`)
    if (usedRadius.size) lines.push(`**Radius:** ${[...usedRadius].sort().map((r) => `\`${r}\` → ${RADIUS_MAP[r]}`).join('; ')}.`)
    lines.push('**Shadow:** any `box-shadow` → `shadow.tokens` (sm/md/lg). **Buttons:** CTAs → a `buttons.variants` class (≤2 store-wide).')
    const block = lines.join('\n') + '\n'
    if (/\n##\s+Variants/.test(body)) body = body.replace(/\n##\s+Variants/, block + '\n## Variants')
    else body = body.replace(/\s*$/, '\n' + block)
    bindingsAdded++
  }

  if (body !== before && !dry) fs.writeFileSync(p, body)
}

console.log(`${dry ? '[DRY] ' : ''}cards=${cards} · rung-stripped=${rungStripped} · hex-wrapped=${hexWrapped} · bindings-added=${bindingsAdded} · already-bound=${alreadyBound}`)
