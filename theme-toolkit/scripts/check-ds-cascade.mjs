#!/usr/bin/env node
// #2 — design-system cascade gate (#30). The cascade generator (ds:css) emits assets/design-system.css
// from design-system.json so a brand-change cascades via var(--ds-*). But the regen can be FORGOTTEN:
// edit design-system.json (a re-skin / brand-change) and forget `pnpm ds:css`, and the OLD brand ships
// silently. This gate makes the cascade ENFORCED — it compares the content-hash stamped in the CSS vs
// the current design-system.json and BLOCKS when they diverge (or the CSS is missing/unstamped). It
// also WARNs on cascade-coverage gaps (custom sections that hardcode a type/spacing literal instead of
// binding var(--ds-*) — those won't cascade on a brand-change).
//
// Usage: node check-ds-cascade.mjs
// Env: DESIGN_SYSTEM (docs/design/design-system.json) · DS_CSS (assets/design-system.css) · BASE_REF ·
//      DS_CASCADE_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (→ BLOCK) · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// cascadeStale (lib/ds-hash) + cascadeCoverageGaps are PURE + tested. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'
import { cascadeStale } from './lib/ds-hash.mjs'

// PURE: custom-section CSS that hardcodes a type/spacing literal where it should bind a --ds-* var
// (so a brand-change wouldn't reach it). Heuristic + warn-level — render-wiring (#14) owns the hard cases.
// PURE: does this layout source actually pull in the cascade stylesheet? Accepts the Shopify idioms —
// `{{ 'design-system.css' | asset_url | stylesheet_tag }}`, a raw <link href="...design-system.css">,
// or an @import — so a legitimately-wired theme is never falsely flagged.
export function layoutReferencesCss(layoutSrc, cssPath) {
  const base = String(cssPath).split('/').pop()
  if (!base) return false
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`['"\`]?${escaped}['"\`]?`).test(String(layoutSrc))
}

// every layout/*.liquid that references the cascade (a theme may ship more than one layout)
function layoutsReferencing(cssPath) {
  const dir = path.resolve(cwd, 'layout')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.liquid')) } catch { return [] }
  return files.filter((f) => {
    try { return layoutReferencesCss(fs.readFileSync(path.join(dir, f), 'utf-8'), cssPath) } catch { return false }
  })
}

export function cascadeCoverageGaps(cssText) {
  const gaps = []
  const css = String(cssText || '')
  for (const m of css.matchAll(/\bfont-size\s*:\s*([^;{}]+)/gi)) {
    const v = m[1].trim()
    if (/\d+(px|rem|em)\b/.test(v) && !/var\(\s*--ds-/.test(v)) gaps.push({ prop: 'font-size', value: v.slice(0, 32) })
  }
  for (const m of css.matchAll(/\bpadding(?:-(?:top|bottom))?\s*:\s*([^;{}]+)/gi)) {
    const v = m[1].trim()
    // only section-scale vertical padding (≥24px) is cascade-relevant; small insets aren't
    if (/(?:^|\s)([3-9]\d|\d{3,})px/.test(v) && !/var\(\s*--ds-/.test(v)) gaps.push({ prop: 'padding', value: v.slice(0, 32) })
  }
  return gaps
}

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const DS_CSS = process.env.DS_CSS || 'assets/design-system.css'
const BASE_REF = process.env.BASE_REF || 'base'
const ENFORCE = process.env.DS_CASCADE_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const blockers = []
const warnings = []
const eligible = (id, page, detail, evidence = '') => (ENFORCE ? blockers : warnings).push({ id, page, detail, evidence })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('brand-sync', 30, { cwd, pass, blockers, warnings, evidence: { ds: DS, dsCss: DS_CSS, enforce: ENFORCE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`ds-cascade: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 8)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// custom sections changed since base (the build's surface) — fall back to all sections if base unresolvable
function customSections() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    return execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections', 'assets'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map(s => s.trim()).filter(f => /\.(liquid|css)$/.test(f))
  } catch {
    try { return fs.readdirSync(path.join(cwd, 'sections')).filter(f => f.endsWith('.liquid')).map(f => `sections/${f}`) } catch { return [] }
  }
}

function main() {
  const dsAbs = path.resolve(cwd, DS)
  if (!fs.existsSync(dsAbs)) { warnings.push({ id: 'cascade.n-a-no-ds', page: DS, detail: `no ${DS} — design-system cascade not applicable (bootstrap #0.5 owns this)`, evidence: '' }); return finish(null, { scope: 'n/a' }) }
  let dsJson
  try { dsJson = JSON.parse(fs.readFileSync(dsAbs, 'utf-8')) } catch (e) { return finish(`${DS} invalid JSON: ${e.message}`) }

  const cssAbs = path.resolve(cwd, DS_CSS)
  if (!fs.existsSync(cssAbs)) {
    eligible('cascade.css-missing', DS_CSS, `${DS} exists but ${DS_CSS} was never generated — run \`pnpm ds:css\` so the brand cascades (custom sections bind var(--ds-*)).`)
    return finish(null, { present: false })
  }
  const cssText = fs.readFileSync(cssAbs, 'utf-8')

  // #2b (CB-1, 2026-07-23) — PRESENT + FRESH is not the same as LOADED.
  // The gate proved the file exists and its hash matches the contract, but nothing checked that any
  // layout actually includes it. A theme can therefore be fully "cascade-green" while every
  // var(--ds-*) resolves to nothing at render time: undefined custom properties make the whole
  // declaration invalid, so type/spacing/colour silently fall back to inherited values. This is the
  // precondition for snapping literals to tokens — swapping `#6C6C6C` for `var(--ds-color-body-gray)`
  // in an unwired theme does not preserve the colour, it deletes it.
  const wiredIn = layoutsReferencing(DS_CSS)
  if (!wiredIn.length) {
    eligible(
      'cascade.not-wired', DS_CSS,
      `${DS_CSS} exists but NO layout references it — every var(--ds-*) resolves to nothing at render `
      + `time and the declaration is dropped. Add {{ '${path.basename(DS_CSS)}' | asset_url | stylesheet_tag }} `
      + 'to the <head> of layout/theme.liquid.',
    )
  }

  const stale = cascadeStale(dsJson, cssText)
  if (!stale.ok) {
    eligible('cascade.stale', DS_CSS, `${stale.reason}. Re-run \`pnpm ds:css\` (expected ds-hash ${stale.expected}, found ${stale.found || 'none'}).`, `${stale.found || 'none'}→${stale.expected}`)
  }

  // cascade-coverage (warn): custom sections hardcoding type/spacing literals won't cascade
  let coverageGaps = 0
  for (const f of customSections()) {
    let raw = ''
    try { raw = fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { continue }
    const css = /\.css$/.test(f) ? raw : (raw.match(/\{%-?\s*(?:style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end(?:style|stylesheet)\s*-?%\}/gi) || []).join('\n')
    for (const g of cascadeCoverageGaps(css)) { warnings.push({ id: 'cascade.literal-not-bound', page: f, detail: `${g.prop}:${g.value} is a literal, not var(--ds-*) — it won't cascade on a brand-change. Bind it to a --ds-* token.`, evidence: g.value }); coverageGaps += 1 }
  }

  finish(null, { present: true, fresh: stale.ok, coverageGaps })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
}
