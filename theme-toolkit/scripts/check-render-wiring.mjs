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
//   4. rw.placeholder-imagery (WARN; BLOCK at publish-grade if the design system declares
//      imagery.custom_photography_required:true) — a hero/product section relies only on
//      placeholder_svg_tag with no image binding → premium gap; if the build's OWN contract
//      requires real photography, grey placeholders violate it (declared-but-unrendered).
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

  // ── 0. reference integrity (whole-theme; round-2 dogfood: a referenced-but-missing theme.js
  // [404 <script>] and {% section 'header/footer' %} files were render-fatal and NO gate caught them).
  // A referenced section/snippet/asset that doesn't exist throws a Liquid/render error → BLOCK. On a real
  // committed base all refs resolve (the base ships them); only a genuinely-missing target flags. ──
  const allLiquidText = [...walkAll('sections', ['.liquid']), ...walkAll('snippets', ['.liquid']), ...walkAll('layout', ['.liquid'])].map(read).join('\n')
  const missingSections = new Set()
  for (const m of layoutText.matchAll(/\{%-?\s*section\s+['"]([a-z0-9_-]+)['"]/gi)) { if (!fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) missingSections.add(m[1]) }
  for (const m of layoutText.matchAll(/\{%-?\s*sections\s+['"]([a-z0-9_-]+)['"]/gi)) { if (!fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.json`))) missingSections.add(`${m[1]} (group)`) }
  const emptyRendered = []
  for (const tf of walkAll('templates', ['.json'])) {
    let j; try { j = JSON.parse(read(tf)) } catch { continue }
    for (const [key, s] of Object.entries(j.sections || {})) {
      const t = s && s.type
      if (!t || !/^[a-z0-9_-]+$/i.test(t)) continue
      const sectionPath = path.resolve(cwd, 'sections', `${t}.liquid`)
      if (!fs.existsSync(sectionPath)) { missingSections.add(t); continue }
      // hollow render (round-2 "headings over empty grids"): the instance wires NO blocks but the
      // section renders its content via a `section.blocks` loop → it paints a header over nothing.
      const blocksEmpty = (!s.blocks || Object.keys(s.blocks).length === 0) && (!Array.isArray(s.block_order) || s.block_order.length === 0)
      if (blocksEmpty && /\{%-?\s*for\s+\w+\s+in\s+section\.blocks\b/.test(read(`sections/${t}.liquid`))) emptyRendered.push(`${path.basename(tf)}:${key} (${t})`)
    }
  }
  evidence.emptyRendered = emptyRendered
  if (emptyRendered.length) {
    warnings.push({ id: 'rw.empty-rendered-section', page: 'templates', detail: `${emptyRendered.length} section instance(s) ship with NO blocks but render via a section.blocks loop (${emptyRendered.join(', ')}) — they paint a header over an empty grid (the round-2 "hollow homepage" look). Either give the section honest non-block default content / an empty-state, seed real blocks, or omit the section until data exists — never a heading over a void.`, evidence: emptyRendered.join(', ') })
  }
  const missingSnippets = new Set()
  for (const m of allLiquidText.matchAll(/\{%-?\s*(?:render|include)\s+['"]([a-z0-9_/-]+)['"]/gi)) { if (!fs.existsSync(path.resolve(cwd, 'snippets', `${m[1]}.liquid`))) missingSnippets.add(m[1]) }
  const missingAssets = new Set()
  for (const m of allLiquidText.matchAll(/['"]([a-z0-9_.\-]+\.(?:js|css|css\.liquid|woff2?|otf|ttf|svg|png|jpe?g|json))['"]\s*\|\s*asset_(?:url|img_url)/gi)) { if (!fs.existsSync(path.resolve(cwd, 'assets', m[1]))) missingAssets.add(m[1]) }
  evidence.referenceIntegrity = { missingSections: [...missingSections], missingSnippets: [...missingSnippets], missingAssets: [...missingAssets] }
  if (missingSections.size) blocker('rw.section-missing', 'layout/templates', `${missingSections.size} referenced section(s) do not exist as files: ${[...missingSections].join(', ')} — \`{% section %}\` / template "type" to a missing section throws a render error (the page cannot load). Add the section file or remove the reference (a real Minimog/Dawn base ships its chrome; a bare scaffold is incomplete).`, [...missingSections].join(', '))
  if (missingSnippets.size) blocker('rw.snippet-missing', 'sections/layout', `${missingSnippets.size} referenced snippet(s) do not exist: ${[...missingSnippets].join(', ')} — \`{% render/include %}\` to a missing snippet is a LiquidError. Add the snippet or remove the reference.`, [...missingSnippets].join(', '))
  if (missingAssets.size) blocker('rw.asset-missing', 'theme', `${missingAssets.size} referenced asset(s) do not exist in assets/: ${[...missingAssets].join(', ')} — a \`| asset_url\` to a missing file ships a 404 <script>/<link> (e.g. a dead carousel/JS controller). Add the asset or remove the reference.`, [...missingAssets].join(', '))

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
  let dsObj = null
  if (fs.existsSync(path.resolve(cwd, DS))) {
    try {
      const ds = JSON.parse(read(DS))
      dsObj = ds
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

  // ── 3b. button variants declared but never rendered (A2 depth, 2026-06-18) ──
  // A "premium 2-button system" that only ever renders .btn--primary is really a 1-button
  // system — the secondary/tertiary variant is a phantom design-system entry. WARN per dead variant.
  const variantClasses = {}
  for (const [name, v] of Object.entries(dsObj?.buttons?.variants || {})) {
    const classes = String(v?.class || '').split(/\s+/).map(s => s.trim()).filter(Boolean)
      .filter(c => /(?:btn|button|cta)/i.test(c) && !/^(?:btn|button|cta)$/i.test(c)) // the variant-distinguishing class, not the base
    if (classes.length) variantClasses[name] = classes
  }
  const deadVariants = []
  for (const [name, classes] of Object.entries(variantClasses)) {
    if (!classes.some(c => sectionText.includes(c))) deadVariants.push(`${name} (${classes[0]})`)
  }
  evidence.buttonVariants = { declared: Object.keys(variantClasses), dead: deadVariants }
  if (Object.keys(variantClasses).length >= 2 && deadVariants.length) {
    warnings.push({ id: 'rw.button-variant-unrendered', page: DS, detail: `${deadVariants.length} declared button variant(s) never render in any section (${deadVariants.join(', ')}) — a declared-but-unused variant is a phantom design-system entry (the build effectively ships fewer button styles than the contract claims). Render it or drop it from buttons.variants.`, evidence: deadVariants.join(', ') })
  }

  // ── 3c. bold weight used but not loaded → synthetic-bold flatness (A2 depth) ──
  // When a Google-Fonts <link> or @font-face loads the family, the weights it ships are explicit
  // (wght@400;600 / font-weight: 600). If sections set a bold weight (≥600) the load doesn't include,
  // the browser fakes it (faux-bold) — a premium-typography tell. Best-effort; WARN. (Skips when no
  // explicit font load to read weights from — fontLoaded via picker/asset can't enumerate weights.)
  const fontUrlMatch = (layoutText + repoStyle).match(/wght@([0-9.;,\s]+)/i)
  const faceWeights = [...(repoStyle.matchAll(/@font-face[\s\S]{0,200}?font-weight\s*:\s*([0-9]{3})/gi))].map(m => Number(m[1]))
  if (fontUrlMatch || faceWeights.length) {
    const loaded = new Set([
      ...(fontUrlMatch ? fontUrlMatch[1].split(/[;,\s]+/).map(s => Number(String(s).split('..').pop())).filter(Boolean) : []),
      ...faceWeights,
    ])
    const usedBold = new Set()
    for (const m of (sectionText + repoStyle).matchAll(/font-weight\s*:\s*([0-9]{3})\b/gi)) { const w = Number(m[1]); if (w >= 600) usedBold.add(w) }
    const missing = [...usedBold].filter(w => !loaded.has(w))
    evidence.fontWeights = { loaded: [...loaded].sort(), usedBold: [...usedBold].sort(), missing }
    if (missing.length) {
      warnings.push({ id: 'rw.font-weight-synthetic', page: 'sections', detail: `bold weight(s) ${missing.join(', ')} are used in CSS but NOT in the loaded font (${[...loaded].sort().join(', ') || 'none'}) — the browser fakes them (faux-bold), which looks flat/heavy vs a real weight. Add the weight to the font <link>/@font-face or use a loaded weight.`, evidence: `used ${[...usedBold].join(',')} / loaded ${[...loaded].join(',')}` })
    }
  }

  // ── 4. placeholder-only imagery (WARN; BLOCK at publish-grade when the contract REQUIRES photography) ──
  // Detection must test whether an image is actually BOUND AT RENDER, not whether the section schema
  // merely OFFERS an image_picker. Stride dogfood 2026-06-19: the hero declared an image_picker but the
  // template instance set image="" → it falls through to Dawn's grey placeholder_svg_tag at render, yet
  // the old "schema has image_picker = has image" heuristic scored it as bound and never flagged it.
  // Precompute every template section instance once, keyed by section type, for binding lookup.
  const tplInstances = new Map()
  for (const tf of walkAll('templates', ['.json'])) {
    let j; try { j = JSON.parse(read(tf)) } catch { continue }
    for (const inst of Object.values(j.sections || {})) {
      if (!inst || typeof inst.type !== 'string') continue
      if (!tplInstances.has(inst.type)) tplInstances.set(inst.type, [])
      tplInstances.get(inst.type).push(inst)
    }
  }
  const imageSettingIds = (raw) => {
    const m = raw.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/)
    if (!m) return []
    let schema; try { schema = JSON.parse(m[1]) } catch { return [] }
    const ids = []
    const scan = (arr) => Array.isArray(arr) && arr.forEach(s => { if (s && s.type === 'image_picker' && s.id) ids.push(s.id) })
    scan(schema.settings)
    if (Array.isArray(schema.blocks)) schema.blocks.forEach(b => scan(b.settings))
    return ids
  }
  const imageBoundInTemplate = (sectionType, ids) => {
    if (!ids.length) return false
    const nonEmpty = (bag) => bag && ids.some(id => typeof bag[id] === 'string' && bag[id].trim() !== '')
    for (const inst of (tplInstances.get(sectionType) || [])) {
      if (nonEmpty(inst.settings)) return true
      for (const blk of Object.values(inst.blocks || {})) if (nonEmpty(blk.settings)) return true
    }
    return false
  }
  // A section falls through to a placeholder via EITHER Dawn's raw `placeholder_svg_tag` OR a render
  // of a custom placeholder snippet (`{% render 'premium-placeholder' %}` etc.) — the sanctioned
  // Dawn-grey replacement loom is INSTRUCTED to use. Both render a non-photo placeholder when no image
  // is bound. Keying only on `placeholder_svg_tag` let the snippet route evade the publish BLOCK
  // (Seraphine beauty dogfood 2026-06-19: unbound hero rendered `premium-placeholder` + passed #14).
  const usesPlaceholderFallback = (raw) => /placeholder_svg_tag/i.test(raw)
    || /\{%-?\s*render\s+['"][a-z0-9_-]*placeholder[a-z0-9_-]*['"]/i.test(raw)
  const heroish = sections.filter(f => /hero|banner|product|pdp|featured|main-product|lookbook/i.test(path.basename(f)))
  const placeholderOnly = []
  for (const f of heroish) {
    const raw = read(f)
    if (!usesPlaceholderFallback(raw)) continue // no placeholder fallback path → nothing to flag
    // A real dynamic product/media binding renders an actual image regardless of merchant config.
    if (/\bproduct\.(?:featured_)?(?:image|media)\b|product\.images\b/i.test(raw)) continue
    // Otherwise the section renders the placeholder UNLESS a template instance binds a real image value.
    if (!imageBoundInTemplate(path.basename(f, '.liquid'), imageSettingIds(raw))) placeholderOnly.push(path.basename(f))
  }
  // The design system can DECLARE that real art-directed photography is required for the premium
  // claim (drape sets imagery.custom_photography_required:true). If it does AND the hero/product
  // still renders only Dawn's grey placeholder_svg_tag, the build's OWN contract is unmet — the
  // store ships as grey wireframe boxes (Stride dogfood 2026-06-19: the adversarial "generic" lens
  // refuted the premium claim on exactly this — 0 image assets, hero fell through to grey SVG).
  // Declared-but-unrendered is the same class #14 exists to catch (font/scheme) → at publish-grade
  // this is a BLOCK, not a soft warning that ships anyway.
  const photoRequired = dsObj?.imagery?.custom_photography_required === true
  evidence.placeholderImagery = placeholderOnly
  evidence.photographyRequired = photoRequired
  if (placeholderOnly.length) {
    const base = `${placeholderOnly.length} hero/product section(s) render only a placeholder (raw placeholder_svg_tag OR a {% render '*placeholder*' %} snippet) with no image bound (${placeholderOnly.join(', ')}) — premium gap; do not assert premium on placeholder imagery. Bind a real image (image_picker value in the template / product media / the kept generated placeholder-library — never Dawn grey).`
    if (photoRequired && REQUIRE_SCOPE) {
      blocker('rw.placeholder-imagery', placeholderOnly.join(', '), `${base} The design system declares imagery.custom_photography_required:true, so shipping grey placeholders violates the build's OWN premium contract — at publish-grade (DS_REQUIRE_SCOPE=1) this BLOCKS. loom/porter must bind real imagery before publish.`, placeholderOnly.join(', '))
    } else {
      warnings.push({ id: 'rw.placeholder-imagery', page: placeholderOnly.join(', '), detail: photoRequired ? `${base} (design system requires custom photography — this BLOCKS at publish-grade DS_REQUIRE_SCOPE=1.)` : base, evidence: placeholderOnly.join(', ') })
    }
  }

  // ── 5. Placeholder TEXT leaking to the customer (round-3 onyx finding + atrium audit P0#6, 2026-06-19) ──
  // A literal [CLAIM], Lorem ipsum, or "your X here" SEEDED into a template/section value (vs a schema
  // info-label or a comment) RENDERS to a shopper — unfinished, not premium. Scan in-scope custom sections'
  // rendered text (outside {% schema %}/{% comment %}) + ALL templates/*.json seeded string values.
  const PLACEHOLDER = /\blorem ipsum\b|\bdolor sit amet\b|\byour (?:headline|text|content|tagline|copy|title|brand|product)\b[^.<>{}\n]{0,12}\bhere\b|\bplaceholder (?:text|copy|content)\b|\breplace with your\b|\bsample (?:text|copy)\b|\[CLAIM\b/i
  const leaks = []
  const stripSchema = (s) => s.replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/g, ' ').replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  for (const f of sections) { const m = stripSchema(read(f)).match(PLACEHOLDER); if (m) leaks.push(`${path.basename(f)} ("${String(m[0]).slice(0, 24)}")`) }
  for (const tf of walkAll('templates', ['.json'])) {
    let j; try { j = JSON.parse(read(tf)) } catch { continue }
    const walkVals = (o) => { if (!o || typeof o !== 'object') return; for (const v of Object.values(o)) { if (typeof v === 'string' && PLACEHOLDER.test(v)) leaks.push(`${path.basename(tf)} ("${v.slice(0, 24)}")`); else if (typeof v === 'object') walkVals(v) } }
    walkVals(j)
  }
  evidence.placeholderText = leaks
  if (leaks.length) {
    warnings.push({ id: 'rw.placeholder-text', page: 'theme', detail: `${leaks.length} customer-rendered placeholder/[CLAIM]/Lorem string(s) would paint to a shopper: ${leaks.slice(0, 6).join(', ')} — a literal "[CLAIM]"/Lorem/"your text here" reaching the storefront is unfinished, not premium (round-3 dogfood: never paint [CLAIM] to a customer). Seed real content or OMIT the section from the template.`, evidence: leaks.slice(0, 8).join(', ') })
  }

  finish(null, evidence)
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
