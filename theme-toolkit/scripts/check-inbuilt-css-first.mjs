#!/usr/bin/env node
// Boldteq "inbuilt-CSS-first / craft-never-paste" validator for PagePilot-crafted theme sections.
//
// Enforces patterns/good/pagepilot-theme-crafting-protocol.md on crafted sections/*.liquid:
//   1. NO PagePilot DOM residue — leaked Tailwind utility classes or `data-block-id` = a paste, not a craft.
//   2. INBUILT-CSS-FIRST — no hardcoded hex/px/font that duplicates an available theme CSS var
//      (color → use scheme / --color-*; radius → --buttons-radius/--blocks-radius/--media-radius;
//       width → --page-width/--container-width; spacing → section padding / --spacing-sections-*).
//   3. CUSTOMIZER-EDITABLE — every crafted section has a `{% schema %}`.
//
// Usage:
//   node check-inbuilt-css-first.mjs                  scan ./sections (or $SECTIONS_DIR)
//   node check-inbuilt-css-first.mjs sections/pp-*.liquid   scan explicit files
//
// Env:
//   SECTIONS_DIR  default "sections"
//   THEME         "dawn" | "minimog" | "auto" (default auto — detects which var set to expect)
//   ALLOW_CSS_WAIVER=1  downgrade hardcoded-dup-of-var blockers to warnings (CHANGES.md ## Waivers)
//   REPORT_DIR    default gate-reports
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const SECTIONS_DIR = process.env.SECTIONS_DIR || 'sections'
const THEME = (process.env.THEME || 'auto').toLowerCase()
const ALLOW_WAIVER = process.env.ALLOW_CSS_WAIVER === '1'

const blockers = []
const warnings = []
let envError = null

// Theme vars whose presence in the theme makes a hardcoded literal a violation.
// (Compact, high-signal set from dawn/minimog theme-architecture + section-reuse-first-protocol.)
const THEME_VARS = {
  color: ['--color-foreground', '--color-background', '--color-button', '--color-button-text', '--color-link', '--color-foreground'],
  radius: ['--buttons-radius', '--blocks-radius', '--media-radius', '--btn-border-radius', '--pcard-radius', '--product-card-corner-radius'],
  width: ['--page-width', '--container-width', '--fluid-container-width'],
  spacing: ['--spacing-sections-desktop', '--section-padding-top'],
}

// Tailwind-ish utility-class signatures that should NEVER survive crafting (PagePilot DOM residue).
const TAILWIND_RE = /class="[^"]*(?:@\dxl:|(?:^|\s)(?:flex|grid|w-full|min-h-screen|items-center|justify-center|gap-\d|px-\d|py-\d|rounded-(?:xl|2xl|full)|bg-\[|text-\[|backdrop-blur)(?:\s|"))[^"]*"/
const DATA_BLOCK_RE = /\bdata-block-id\b/

// Hardcoded literals (used outside Liquid var/scheme context) that duplicate a theme mechanism.
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const PX_RADIUS_RE = /border-radius\s*:\s*\d+(?:px|rem)/g
const PX_WIDTH_RE = /max-width\s*:\s*\d{3,}px/g

function scan(file) {
  let src
  try { src = fs.readFileSync(file, 'utf-8') } catch (e) { warnings.push({ id: 'unreadable', page: file, detail: e.message }); return }
  const rel = path.relative(cwd, file)

  // 1. schema present
  if (!/\{%-?\s*schema\s*-?%\}/.test(src)) {
    blockers.push({ id: 'no-schema', page: rel, detail: 'crafted section has no {% schema %} — not customizer-editable' })
  }

  // 2. Tailwind / data-block-id residue (= pasted, not crafted)
  if (TAILWIND_RE.test(src)) blockers.push({ id: 'tailwind-residue', page: rel, detail: 'Tailwind utility classes leaked from the PagePilot DOM — rebuild with theme-native classes' })
  if (DATA_BLOCK_RE.test(src)) blockers.push({ id: 'data-block-id-residue', page: rel, detail: '`data-block-id` leaked from the PagePilot DOM — this is a paste, not a craft' })

  // 3. inbuilt-CSS-first — only inspect the <style>/CSS portion, ignore Liquid that references vars
  const styleBlocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') || src
  const finding = (label, re, hint) => {
    const hits = [...styleBlocks.matchAll(re)]
      // skip literals that sit inside a var() fallback or a Liquid output (theme/scheme-driven)
      .filter(m => {
        const around = styleBlocks.slice(Math.max(0, m.index - 40), m.index + 40)
        return !/var\(--|\{\{|\{%|color_scheme|settings\./.test(around)
      })
    if (hits.length) {
      const item = { id: label, page: rel, detail: `${hits.length} hardcoded ${label} literal(s) duplicating a theme var (${hint}) — use the theme variable/scheme instead`, evidence: hits.slice(0, 3).map(h => h[0]) }
      if (ALLOW_WAIVER) warnings.push(item); else blockers.push(item)
    }
  }
  finding('color-hex', HEX_RE, 'color scheme / --color-*')
  finding('radius-px', PX_RADIUS_RE, '--buttons-radius / --blocks-radius / --media-radius')
  finding('width-px', PX_WIDTH_RE, '--page-width / --container-width')
}

function collect() {
  const args = process.argv.slice(2)
  if (args.length) return args.flatMap(a => a.includes('*') ? globLite(a) : [a]).filter(f => fs.existsSync(f))
  const dir = path.resolve(cwd, SECTIONS_DIR)
  if (!fs.existsSync(dir)) { envError = `sections dir not found: ${SECTIONS_DIR}`; return [] }
  return fs.readdirSync(dir).filter(f => f.endsWith('.liquid')).map(f => path.join(dir, f))
}
function globLite(pat) {
  const dir = path.dirname(pat); const base = path.basename(pat)
  const re = new RegExp('^' + base.replace(/[.+]/g, '\\$&').replace(/\*/g, '.*') + '$')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f))
}

const files = collect()
if (!envError && files.length === 0) warnings.push({ id: 'no-sections', page: SECTIONS_DIR, detail: 'no .liquid sections found to check' })
files.forEach(scan)

const pass = !envError && blockers.length === 0
writeReport('inbuilt-css-first', 1, {
  cwd, pass, blockers, warnings,
  evidence: { sectionsDir: SECTIONS_DIR, theme: THEME, filesScanned: files.length, reason: envError || undefined },
  duration_ms: Date.now() - t0,
})

if (envError) { console.error(`[inbuilt-css-first] env: ${envError}`); process.exit(2) }
console[pass ? 'log' : 'error'](`[inbuilt-css-first] ${pass ? 'PASS' : 'BLOCK'} — ${files.length} section(s), ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
for (const b of blockers) console.error(`  ✗ ${b.id} ${b.page}: ${b.detail}${b.evidence ? ' [' + b.evidence.join(', ') + ']' : ''}`)
process.exit(pass ? 0 : 1)
