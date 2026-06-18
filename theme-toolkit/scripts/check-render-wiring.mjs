#!/usr/bin/env node
// Boldteq render-wiring gate (#14) — the tokens-RENDER enforcer.
//
// #8 (design-system) proves no value escapes the locked token set; #12 (design-quality)
// proves the tokens form the niche's modular scale. BOTH validate tokens ON PAPER. The
// Sprint-3 dogfood (2026-06-16) shipped two builds that passed #8 AND #12 while NOTHING
// rendered: config/settings_data.json was empty {"current":{}}, no `.color-scheme-N{}` CSS
// existed, and no font was ever loaded — so the page paints flat black-on-white in the UA
// default font and the niche's serif/accent never appears. "No hardcoded hex" is necessary
// but NOT sufficient. This gate closes that: the design system must actually be WIRED to render.
//
// Checks (on the build's custom surface + whole-repo backing):
//   1. rw.scheme-unwired (BLOCK)  — custom sections reference color-scheme-N classes but NOTHING
//      backs them (no color_schemes in settings_data AND no `.color-scheme-N{}` CSS anywhere) →
//      classes resolve to nothing, UA default paints.
//   2. rw.font-unwired (BLOCK)    — design-system declares a non-system heading font but the theme
//      loads NO font (no @font-face / | font_face / | font_url / font_picker / fonts <link>).
//   3. rw.heading-font-not-applied (WARN) — no custom section sets font-family and no --font-heading
//      var is defined anywhere → headings inherit the browser default.
//   4. rw.placeholder-imagery (WARN) — a hero/product section relies only on placeholder_svg_tag with
//      no image binding → premium gap (never assert premium on placeholder imagery).
//
// Usage: node check-render-wiring.mjs
// Env:
//   DESIGN_SYSTEM   default docs/design/design-system.json
//   BASE_REF        theme-base git ref (default "base") — scopes to changed sections; else reuse-map
//   REUSE_MAP       default section-reuse-map.md (fallback scope source)
//   REPORT_DIR      default gate-reports
//   DS_REQUIRE_SCOPE=1   unresolvable scope must BLOCK (publish-grade), not warn-skip
//   ALLOW_RW_WAIVER=1    downgrade blockers → warnings IF CHANGES.md ## Waivers names render-wiring
//   SKIP_RENDER_WIRING=1 waive the gate entirely (handled by the orchestrator)
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
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const ALLOW_WAIVER = process.env.ALLOW_RW_WAIVER === '1' && changesWaives('render-wiring')

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const blocker = (id, page, detail, evidence) => ALLOW_WAIVER
  ? add(warnings, `${id}.waived`, page, `${detail} (waived via CHANGES.md ## Waivers)`, evidence)
  : add(blockers, id, page, detail, evidence)

function changesWaives(word) {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    if (!m) return false
    return new RegExp(`\\b${word}\\b`, 'i').test(m[1].split(/\n##\s/)[0])
  } catch { return false }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('render-wiring', 14, {
    cwd, pass, blockers, warnings,
    evidence: { contract: DS, baseRef: BASE_REF, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`render-wiring: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── scope: the build's custom/extended surface ────────────────────────────────
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
  return names.size ? [...names] : null
}

function walkAll(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(rel, exts, acc)
    else if (!exts || exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }

function main() {
  let targets = gitChanged()
  let scopeSource = 'git'
  if (targets === null) { targets = reuseMapTargets(); scopeSource = 'reuse-map' }
  if (targets === null) {
    if (REQUIRE_SCOPE) add(blockers, 'rw.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, DS_REQUIRE_SCOPE=1 — cannot verify render-wiring; tag the theme base "base" before publish`)
    else warnings.push({ id: 'rw.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — render-wiring scan skipped`, evidence: '' })
    finish(null, { scope: 'unresolved' })
  }
  const sections = targets.filter(f => /^sections\/.*\.liquid$/.test(f) && fs.existsSync(path.resolve(cwd, f)))
  const sectionText = sections.map(read).join('\n')
  const evidence = { scope: scopeSource, sections: sections.length }

  // ── whole-repo backing corpus ───────────────────────────────────────────────
  const allCssBearing = [...walkAll('sections', ['.liquid']), ...walkAll('snippets', ['.liquid']), ...walkAll('layout', ['.liquid']), ...walkAll('assets', ['.css', '.css.liquid', '.scss', '.js'])]
  const repoStyle = allCssBearing.map(read).join('\n')
  const layoutText = walkAll('layout', ['.liquid']).map(read).join('\n')
  const settingsRaw = read('config/settings_data.json')
  const settingsSchemaRaw = read('config/settings_schema.json')

  // ── 1. color-scheme resolution ──────────────────────────────────────────────
  const schemesRef = new Set()
  for (const m of sectionText.matchAll(/\b(?:color-scheme|m-color|scheme)-([0-9]{1,2})\b/gi)) schemesRef.add(m[1])
  const settingsHasSchemes = /"color_schemes?"\s*:\s*\{\s*["a-z]/i.test(settingsRaw) || /"scheme[-_]?\d+"\s*:/i.test(settingsRaw)
  const cssDefinesScheme = /\.(?:color-scheme|m-color)-\d+\b/.test(repoStyle) || /\[data-(?:color-)?scheme/i.test(repoStyle)
  const schemesWired = settingsHasSchemes || cssDefinesScheme
  evidence.colorSchemes = { referenced: [...schemesRef], settingsHasSchemes, cssDefinesScheme, wired: schemesWired }
  if (schemesRef.size > 0 && !schemesWired) {
    blocker('rw.scheme-unwired', 'theme', `custom sections reference ${schemesRef.size} color-scheme class(es) [color-scheme-${[...schemesRef].sort().join(', ')}] but NOTHING defines them — config/settings_data.json has no color_schemes and no \`.color-scheme-N{}\` CSS exists in the repo. The classes resolve to nothing; the page renders in the UA default (flat black-on-white). Wire the schemes into settings_data.json (Minimog/Dawn) or ship theme CSS that defines them.`, `settingsHasSchemes=${settingsHasSchemes}, cssDefinesScheme=${cssDefinesScheme}`)
  }

  // ── 2 & 3. font wiring ──────────────────────────────────────────────────────
  let headingFont = ''
  if (fs.existsSync(path.resolve(cwd, DS))) {
    try {
      const ds = JSON.parse(read(DS))
      const hf = ds.typography?.fonts?.heading ?? ds.fonts?.heading ?? ds.typography?.heading
      headingFont = typeof hf === 'string'
        ? hf
        : (hf && typeof hf === 'object'
          ? String(hf.family || hf.name || hf.value || hf.font || Object.values(hf).find(v => typeof v === 'string') || '')
          : '')
    } catch { /* skip */ }
  }
  // a "system" heading font needs no loading; a named family (serif-display, Canela, Inter, …) does.
  const SYSTEM_FONT = /^(?:\s*)?(system-ui|-apple-system|sans-serif|serif|monospace|arial|helvetica|georgia|times|inherit|initial|ui-(?:sans|serif|monospace))\b/i
  const namesRealFamily = headingFont && !SYSTEM_FONT.test(headingFont) && /[a-z]{3,}/i.test(headingFont.replace(/serif-display|sans|display/gi, ''))
  const fontLoaded = /@font-face/i.test(repoStyle)
    || /\|\s*font_(?:face|url|modify)/i.test(layoutText + repoStyle)
    || /type:\s*"font_picker"|"type"\s*:\s*"font_picker"/i.test(settingsSchemaRaw)
    || /"[a-z0-9_]*font[a-z0-9_]*"\s*:\s*"[a-z]/i.test(settingsRaw)
    || /<link[^>]+fonts?\.(?:googleapis|gstatic|bunny|typekit|adobe)/i.test(layoutText)
    || /\.(woff2?|otf|ttf)\b/i.test(repoStyle + layoutText)
  evidence.fonts = { headingFont, namesRealFamily, fontLoaded }
  if (namesRealFamily && !fontLoaded) {
    blocker('rw.font-unwired', DS, `design-system declares heading font "${headingFont}" but the theme loads NO font — no @font-face, no \`| font_face\`/\`| font_url\`, no font_picker setting, no fonts <link>, no .woff/.otf asset. The declared font cannot render; headings fall to the browser default. Load the font (Shopify font_picker + \`| font_face\`, an @font-face, or a hosted <link>).`, headingFont)
  }
  // heading family actually applied in custom CSS? (var or literal family on a heading rule)
  const definesHeadingVar = /--font-heading\s*:/.test(repoStyle)
  const setsFontFamily = /font-family\s*:/i.test(sectionText) || /--font-heading\s*:/.test(sectionText)
  if (!setsFontFamily && !definesHeadingVar) {
    warnings.push({ id: 'rw.heading-font-not-applied', page: 'sections', detail: `no custom section sets \`font-family\` and no \`--font-heading\` var is defined anywhere — headings inherit the browser/base default, not the niche's declared face. Apply the heading family (or a defined --font-heading var) on heading rules.`, evidence: '' })
  }

  // ── 4. placeholder-only imagery (WARN) ──────────────────────────────────────
  const heroish = sections.filter(f => /hero|banner|product|pdp|featured|main-product|lookbook/i.test(path.basename(f)))
  const placeholderOnly = []
  for (const f of heroish) {
    const raw = read(f)
    const usesPlaceholder = /placeholder_svg_tag|\bplaceholder\b/i.test(raw)
    const hasImage = /image_url|image_picker|"type"\s*:\s*"image_picker"|\bproduct\.(?:featured_)?(?:image|media)\b|\{\{\s*[a-z0-9_.]*image/i.test(raw)
    if (usesPlaceholder && !hasImage) placeholderOnly.push(path.basename(f))
  }
  evidence.placeholderImagery = placeholderOnly
  if (placeholderOnly.length) {
    warnings.push({ id: 'rw.placeholder-imagery', page: placeholderOnly.join(', '), detail: `${placeholderOnly.length} hero/product section(s) rely only on placeholder_svg_tag with no image binding (${placeholderOnly.join(', ')}) — premium gap; do not assert premium on placeholder imagery. Bind a real image (image_picker / product media).`, evidence: placeholderOnly.join(', ') })
  }

  finish(null, evidence)
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
