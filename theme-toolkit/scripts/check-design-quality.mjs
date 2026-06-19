#!/usr/bin/env node
// Boldteq design-QUALITY gate (#12) — the per-niche taste enforcer.
//
// check-design-system.mjs (#8) enforces per-project TOKEN conformance; check-consistency
// (#9) enforces store-wide ONE-language. This gate enforces the niche TASTE FINGERPRINT:
// it scores a built theme against a per-niche "DNA pack" JSON (bands + component floors)
// so a build is premium AND non-generic by construction — not a generic Shopify demo.
//
// The pack is the niche-level layer ABOVE design-system.json and BELOW design-spec.md.
// It is NOT a token set and NOT a fixed layout — it encodes BANDS (ratio ± tolerance,
// rhythm band) and FLOORS (≥N canonical components). Many designs satisfy a pack.
// Schema: ~/.claude/memory/design/ecom/niche-dna-packs/_schema.json.
//
// Usage:
//   node check-design-quality.mjs                 score the theme in cwd vs its declared pack
//
// Component presence is resolved via the concept→section MAP (_concept-section-map.json): each
// canonical_components concept → its Minimog/Dawn section(s) for the active theme_base. Per the map's
// gate_contract, a rung CUSTOM/LIBRARY concept with [] sections is an intentional custom build, proven
// present by a match_token hit on its custom section filename (NOT flagged missing). Falls back to pure
// fuzzy matching only when the map is absent/unreadable (no regression).
//
// Env:
//   DNA_PACKS_DIR       default ~/.claude/memory/design/ecom/niche-dna-packs
//   CONCEPT_MAP         default ~/.claude/memory/design/ecom/component-library-premium/_concept-section-map.json
//   DESIGN_SPEC         default docs/design/design-spec.md (declares `dna_pack:`)
//   DESIGN_SYSTEM       default docs/design/design-system.json (font-family cross-check)
//   BASE_REF            git ref of the theme base (default "base"); scopes the CSS scan to
//                       sections/snippets/assets CHANGED since base (the build's custom surface).
//                       Falls back to the CUSTOM/EXTEND rows of section-reuse-map.md, else lenient.
//   REUSE_MAP           default section-reuse-map.md (fallback scope source)
//   REPORT_DIR          default gate-reports
//   DS_REQUIRE_SCOPE=1  publish-grade: an unresolvable scan scope must BLOCK, not warn-skip.
//   DQ_FORCE_ENFORCE=1  treat any resolved pack as `tuned` (for testing untuned packs).
//   ALLOW_DQ_WAIVER=1   downgrade measurable BLOCKs to warnings (CHANGES.md ## Waivers).
//
// CALIBRATION GATING — the safety valve. `_meta.calibration`:
//   "tuned"                 → measurable failures (checks 1-7) are BLOCKERS.
//   "seed"/"draft"/missing  → ALL measurable failures DEMOTED to warnings (+ dq.pack-not-tuned);
//                             pass=true unless an env/IO error. DQ_FORCE_ENFORCE=1 overrides.
//   Decoder / image-ratio / pdp-order / human-review are ALWAYS warnings regardless.
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const PACKS_DIR = process.env.DNA_PACKS_DIR || path.join(os.homedir(), '.claude', 'memory', 'design', 'ecom', 'niche-dna-packs')
// concept→section map: resolves each canonical_components concept to its Minimog/Dawn section(s) + reuse rung.
// STRUCTURE layer (never taste). Honors `gate_contract`: rung CUSTOM/LIBRARY with [] sections = intentional
// custom build (prove presence by match_tokens against the custom section filename, do NOT flag as missing).
const MAP_FILE = process.env.CONCEPT_MAP || path.join(os.homedir(), '.claude', 'memory', 'design', 'ecom', 'component-library-premium', '_concept-section-map.json')
const DESIGN_SPEC = process.env.DESIGN_SPEC || 'docs/design/design-spec.md'
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const ALLOW_WAIVER = process.env.ALLOW_DQ_WAIVER === '1'
const FORCE_ENFORCE = process.env.DQ_FORCE_ENFORCE === '1'
// publish/verify context: an unresolvable scan scope must FAIL, not pass green having checked nothing.
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
// `enforce` is set once the pack is loaded: tuned (or DQ_FORCE_ENFORCE) → measurable failures BLOCK.
let enforce = false
// measurable() routes checks 1-7: BLOCK when enforcing (unless waived), else WARN (calibration gate).
const measurable = (id, page, detail, evidence) => {
  if (enforce && !ALLOW_WAIVER) return add(blockers, id, page, detail, evidence)
  const suffix = enforce && ALLOW_WAIVER ? ' (waived via ## Waivers)' : enforce ? '' : ' (pack not tuned — demoted to warning)'
  add(warnings, enforce && ALLOW_WAIVER ? `${id}.waived` : id, page, `${detail}${suffix}`, evidence)
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('design-quality', 12, {
    cwd, pass, blockers, warnings,
    evidence: { packsDir: PACKS_DIR, baseRef: BASE_REF, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`design-quality: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── pack resolution ──────────────────────────────────────────────────────────
// niche name → pack filename: kebab-lowercase (e.g. "CPG-Food" → cpg-food.json).
const nicheToFile = (niche) => `${String(niche).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.json`

function readPack(niche) {
  const file = path.join(PACKS_DIR, nicheToFile(niche))
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch (err) { throw new Error(`pack ${path.basename(file)} is invalid JSON: ${err.message}`) }
}

// Deep-merge parent (extends) then overlay (overlay wins). Arrays/scalars overwrite, objects merge.
function deepMerge(base, overlay) {
  const out = { ...base }
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v)
    else out[k] = v
  }
  return out
}

// Resolve a pack by niche, following `extends` (one level of parent chain, guarded against cycles).
function resolvePack(niche, seen = new Set()) {
  if (seen.has(niche.toLowerCase())) return null
  seen.add(niche.toLowerCase())
  const pack = readPack(niche)
  if (!pack) return null
  if (pack.extends) {
    const parent = resolvePack(pack.extends, seen)
    if (parent) return deepMerge(parent, pack)
  }
  return pack
}

// design-spec declares the pack: `dna_pack: <niche>` (top-level or inside a ## brand_tokens block).
function declaredPackNiche() {
  const abs = path.resolve(cwd, DESIGN_SPEC)
  if (!fs.existsSync(abs)) return null
  const txt = fs.readFileSync(abs, 'utf-8')
  const m = txt.match(/^\s*dna_pack:\s*["'`]?([A-Za-z0-9 _-]+?)["'`]?\s*$/im)
  return m ? m[1].trim() : null
}

// ── CSS scope + extraction (mirrors check-design-system.mjs) ──────────────────
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
  for (const n of names) for (const ext of ['.css', '.css.liquid', '.js']) { const p = `assets/${path.basename(n, '.liquid')}${ext}`; if (fs.existsSync(path.resolve(cwd, p))) files.add(p) }
  return [...files]
}
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, ' ')
}
function extractCss(file, raw) {
  if (/\.css(\.liquid)?$|\.scss$/.test(file)) return raw
  let css = ''
  for (const b of (raw.match(/\{%-?\s*(style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end\1\s*-?%\}/g) || [])) css += '\n' + b
  for (const m of raw.matchAll(/style\s*=\s*"([^"]*)"/g)) css += `\n.inline{${m[1]}}`
  return css
}
const RE_DECL = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g
// every absolute length literal anywhere in a value (clamp()/calc()/shorthand too), normalized px (root 16)
const lenTokens = (value) => [...value.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)].map(m => { const n = parseFloat(m[1]); return m[2] === 'px' ? n : n * 16 })

// ── corpus helpers (component presence + scheme/hero/image checks) ────────────
function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
const KEBAB_STOP = new Set(['and', 'or', 'the', 'a', 'of', 'to', 'with', 'plus'])
const conceptTokens = (concept) => String(concept).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !KEBAB_STOP.has(w))

// Load the concept→section map (structure layer). Returns {} if absent/invalid — the gate then
// falls back to pure fuzzy matching (legacy behavior, no regression).
function loadConceptMap() {
  try {
    if (!fs.existsSync(MAP_FILE)) return {}
    const j = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'))
    const out = {}
    for (const [k, v] of Object.entries(j)) if (!k.startsWith('_') && !k.startsWith('$') && v && typeof v === 'object') out[k] = v
    return out
  } catch { return {} }
}

// Active theme base: 'minimog' | 'dawn'. From design-spec `theme_base:` else infer from the repo
// (config/settings_data.json mentions, or a minimog-only section on disk). Default minimog.
function resolveThemeBase(sectionNames) {
  const specAbs = path.resolve(cwd, DESIGN_SPEC)
  if (fs.existsSync(specAbs)) {
    const m = fs.readFileSync(specAbs, 'utf-8').match(/^\s*theme_base:\s*["'`]?(minimog|dawn)["'`]?/im)
    if (m) return m[1].toLowerCase()
  }
  const settings = path.resolve(cwd, 'config/settings_data.json')
  if (fs.existsSync(settings)) { const t = fs.readFileSync(settings, 'utf-8').toLowerCase(); if (t.includes('minimog')) return 'minimog'; if (t.includes('dawn')) return 'dawn' }
  // Heuristic: a Minimog-only section on disk ⇒ minimog; else default minimog (the team's primary base).
  return sectionNames.some(n => /banner-with-slider|favorite-product-slider|icon-box/.test(n)) ? 'minimog' : 'minimog'
}

// Is a concept present in the build? Map-driven per gate_contract, with fuzzy fallback.
// (a) any declared theme section (for the active base) appears as a section filename/template type, OR
// (b) fuzzy: any section name/type contains a concept match_token (also the ONLY path for rung CUSTOM/LIBRARY
//     with [] sections — an intentional custom build is proven present by its custom filename).
function conceptPresent(concept, mapEntry, themeBase, hay) {
  const contains = (needle) => hay.some(h => h.includes(String(needle).toLowerCase()))
  if (mapEntry) {
    const themeSections = mapEntry[`${themeBase}_sections`] || []
    if (themeSections.length && themeSections.some(s => contains(s))) return { present: true, via: 'section' }
    const tokens = (mapEntry.match_tokens && mapEntry.match_tokens.length) ? mapEntry.match_tokens : conceptTokens(concept)
    if (tokens.some(t => contains(t))) return { present: true, via: themeSections.length ? 'token' : 'custom' }
    return { present: false, via: 'none' }
  }
  // no map entry → legacy fuzzy on the concept's own kebab tokens
  return { present: conceptTokens(concept).some(t => contains(t)), via: 'fuzzy-nomap' }
}

// ── main ──────────────────────────────────────────────────────────────────────
function main() {
  // 1. Pack resolves — design-spec declares `dna_pack` AND the pack file exists.
  const niche = declaredPackNiche()
  if (!niche) {
    // No declared pack — measurable-quality scoring is impossible. Lenient unless publish-grade.
    if (REQUIRE_SCOPE) { add(blockers, 'dq.pack-missing', DESIGN_SPEC, `no \`dna_pack:\` declared in ${DESIGN_SPEC} and DS_REQUIRE_SCOPE=1 — a publish-grade build must declare its niche DNA pack`) }
    else warnings.push({ id: 'dq.pack-missing', page: DESIGN_SPEC, detail: `no \`dna_pack:\` declared in ${DESIGN_SPEC} — niche taste scoring skipped (declare a pack or set DS_REQUIRE_SCOPE for publish)`, evidence: '' })
    finish(null, { niche: null })
  }

  let pack
  try { pack = resolvePack(niche) } catch (err) { finish(err.message) }
  if (!pack) {
    // declared but file absent → measurable failure on check #1. Honor calibration? No pack to read
    // calibration from — treat as enforced when publish-grade, else warn (can't score taste).
    if (REQUIRE_SCOPE) add(blockers, 'dq.pack-missing', DESIGN_SPEC, `design-spec declares dna_pack "${niche}" but ${nicheToFile(niche)} not found in ${PACKS_DIR} — author the pack or fix the niche name`)
    else warnings.push({ id: 'dq.pack-missing', page: DESIGN_SPEC, detail: `design-spec declares dna_pack "${niche}" but ${nicheToFile(niche)} not found in ${PACKS_DIR} — taste scoring skipped`, evidence: '' })
    finish(null, { niche })
  }

  const calibration = pack._meta?.calibration || 'missing'
  enforce = FORCE_ENFORCE || calibration === 'tuned'
  if (!enforce) {
    warnings.push({ id: 'dq.pack-not-tuned', page: nicheToFile(niche), detail: `DNA pack "${pack.niche}" calibration="${calibration}" (not "tuned") — measurable failures demoted to warnings; pack is not evidence-backed yet (set _meta.calibration:"tuned" or DQ_FORCE_ENFORCE=1)`, evidence: '' })
  }

  // ── resolve CSS scope (the build's custom/extended surface) ─────────────────
  let targets = gitChanged()
  let scopeSource = 'git'
  if (targets === null) { targets = reuseMapTargets(); scopeSource = 'reuse-map' }
  let scopeNote = scopeSource
  if (targets === null) {
    if (enforce && REQUIRE_SCOPE) {
      add(blockers, 'dq.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, DS_REQUIRE_SCOPE=1 — cannot score type-scale/rhythm; tag the theme base "base" before publish`)
    } else {
      warnings.push({ id: 'dq.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — type-scale/rhythm scan skipped; falling back to whole-theme corpus checks`, evidence: '' })
    }
    targets = [] // CSS-scoped checks (3-5) skip; corpus checks (2,6,7,9) still run on the whole theme.
    scopeNote = 'unresolved'
  } else {
    targets = targets.filter(f => /\.(liquid|css|scss)$/.test(f) && SCAN_DIRS.some(d => f.startsWith(`${d}/`)))
  }

  // ── corpus reads ────────────────────────────────────────────────────────────
  const sectionFiles = walk('sections', ['.liquid'])
  const templateJson = walk('templates', ['.json'])
  const snippetFiles = walk('snippets', ['.liquid'])
  const liquidText = [...sectionFiles, ...snippetFiles, ...walk('layout', ['.liquid'])]
    .map(f => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }).join('\n')
  const templateText = templateJson.map(f => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }).join('\n')

  // section "type" strings declared in JSON templates (fuzzy component-presence resolution)
  const templateTypes = new Set()
  for (const m of templateText.matchAll(/"type"\s*:\s*"([^"]+)"/g)) templateTypes.add(m[1].toLowerCase())
  const sectionNames = sectionFiles.map(f => path.basename(f, '.liquid').toLowerCase())

  // 2. Component presence ≥N — concept→section MAP driven (per gate_contract), fuzzy fallback per concept.
  const conceptMap = loadConceptMap()
  const mapLoaded = Object.keys(conceptMap).length > 0
  const themeBase = resolveThemeBase(sectionNames)
  const evidence = { niche: pack.niche, calibration, enforce, scope: scopeNote, conceptMapStub: !mapLoaded, themeBase, mapConcepts: Object.keys(conceptMap).length }

  const reqMin = Number(pack.canonical_components?.required_min ?? 0)
  const conceptList = Array.isArray(pack.canonical_components?.list) ? pack.canonical_components.list : []
  const hay = [...sectionNames, ...templateTypes]
  const presentConcepts = []
  const presenceVia = {}
  for (const concept of conceptList) {
    const r = conceptPresent(concept, conceptMap[concept], themeBase, hay)
    if (r.present) { presentConcepts.push(concept); presenceVia[concept] = r.via }
  }
  evidence.components = { required_min: reqMin, present: presentConcepts.length, list: presentConcepts, via: presenceVia, mapDriven: mapLoaded }
  if (reqMin > 0 && presentConcepts.length < reqMin) {
    const how = mapLoaded ? 'concept→section map' : 'fuzzy section/type match (map unavailable)'
    measurable('dq.components-below-floor', 'theme', `only ${presentConcepts.length}/${reqMin} canonical components present (${how}) — niche floor is ${reqMin} of [${conceptList.join(', ')}]`, presentConcepts.join(', '))
  }

  // ── 3/4/5: collect font-sizes + section padding from the custom CSS scope ────
  const allFontSizes = new Set()
  const perFileFontSizes = new Map()  // file → Set(px) for per-page max-sizes
  const sectionPaddings = [] // {file, px}
  for (const file of targets) {
    const abs = path.resolve(cwd, file)
    if (!fs.existsSync(abs)) continue
    const css = stripComments(extractCss(file, fs.readFileSync(abs, 'utf-8')))
    const inFile = perFileFontSizes.get(file) || new Set()
    for (const d of css.matchAll(RE_DECL)) {
      const prop = d[1].toLowerCase()
      const value = d[2].trim()
      if (/var\(/.test(value.toLowerCase())) continue
      if (prop === 'font-size') for (const px of lenTokens(value)) { allFontSizes.add(px); inFile.add(px) }
      if (/^padding(-(top|bottom))?$/.test(prop)) {
        // padding shorthand: top is the 1st value, bottom the 3rd (or = top). We take the
        // vertical literals — section rhythm is top+bottom block padding.
        const pxs = lenTokens(value)
        if (prop === 'padding-top' || prop === 'padding-bottom') { for (const px of pxs) sectionPaddings.push({ file, px }) }
        else if (pxs.length) { sectionPaddings.push({ file, px: pxs[0] }); if (pxs.length >= 3) sectionPaddings.push({ file, px: pxs[2] }) }
      }
    }
    if (inFile.size) perFileFontSizes.set(file, inFile)
  }

  // 3. Type-scale ratio — adjacent-step ratios of sorted distinct sizes vs ratio ± tolerance.
  const sorted = [...allFontSizes].filter(n => n > 0).sort((a, b) => a - b)
  const ts = pack.type_scale || {}
  evidence.fontSizes = sorted
  if (targets.length && sorted.length >= 2 && Number.isFinite(ts.ratio)) {
    const ratios = []
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i - 1] > 0) ratios.push(sorted[i] / sorted[i - 1])
    const med = ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)]
    const tol = Number(ts.ratio_tolerance ?? 0.06)
    evidence.typeScale = { dominantRatio: Number(med.toFixed(3)), target: ts.ratio, tolerance: tol }
    if (Math.abs(med - ts.ratio) > tol) {
      measurable('dq.type-scale-off', 'custom sections', `dominant type-scale step ${med.toFixed(3)} is outside ${ts.ratio} ± ${tol} — font sizes [${sorted.join(', ')}] don't follow the niche's modular scale`, sorted.join(', '))
    }
  }

  // 4. Max sizes/page — distinct font-size count per custom section file.
  const maxSizes = Number(ts.max_sizes_per_page ?? 0)
  if (targets.length && maxSizes > 0) {
    for (const [file, set] of perFileFontSizes) {
      if (set.size > maxSizes) measurable('dq.too-many-sizes', file, `${set.size} distinct font-sizes in one section (${[...set].sort((a, b) => a - b).join(', ')}) — niche allows ≤${maxSizes}/page`, '')
    }
  }

  // 5. Section rhythm — section padding literals vs section_rhythm_px ± tolerance.
  const sr = pack.spacing_rhythm || {}
  const rhythm = Array.isArray(sr.section_rhythm_px) ? sr.section_rhythm_px.map(Number) : (Number.isFinite(sr.section_rhythm_px) ? [Number(sr.section_rhythm_px)] : [])
  const rtol = Number(sr.rhythm_tolerance_px ?? 0)
  if (targets.length && rhythm.length) {
    const lo = Math.min(...rhythm) - rtol
    const hi = Math.max(...rhythm) + rtol
    evidence.rhythm = { band: [Math.min(...rhythm), Math.max(...rhythm)], tolerance: rtol, paddings: sectionPaddings.map(p => p.px) }
    for (const { file, px } of sectionPaddings) {
      // only judge "section-scale" padding (≥24px) — small inner paddings aren't section rhythm
      if (px >= 24 && (px < lo || px > hi)) {
        measurable('dq.rhythm-off', file, `section padding ${px}px is outside the niche rhythm band ${lo}–${hi}px — vertical rhythm should sit in [${rhythm.join(', ')}] ± ${rtol}`, `${px}px`)
      }
    }
  }

  // 6. Hero carousel rule — if carousel forbidden, grep hero section(s) for slider markers.
  // SCOPE FIX (Stride apparel-on-Dawn, 2026-06-19): only consider hero sections the BUILD actually
  // USES (referenced in a template) or OWNS (in the custom scope) — NOT every base section sitting in
  // the repo. A real base (Dawn) ships an unused slideshow.liquid; flagging it is a false positive
  // (the build's own static hero is fine). buildSurface = template-referenced types ∪ custom sections.
  if (pack.hero_treatment?.carousel_allowed === false) {
    const buildSurface = new Set([
      ...templateTypes,
      ...(Array.isArray(targets) ? targets : []).filter(f => /^sections\/.*\.liquid$/.test(f)).map(f => path.basename(f, '.liquid').toLowerCase()),
    ])
    const inSurface = (f) => buildSurface.size === 0 || buildSurface.has(path.basename(f, '.liquid').toLowerCase())
    const heroFiles = sectionFiles.filter(f => /hero|banner|slideshow|slider/i.test(path.basename(f)) && inSurface(f))
    const CAROUSEL_RE = /\b(swiper|slick|splide|flickity|glide|autoplay|auto-?rotate|slideshow|carousel|slides_per_view|data-slide|\.slide(?:r|s)?\b)/i
    const offenders = []
    for (const f of heroFiles) {
      let raw = ''
      try { raw = fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { continue }
      // multi-slide schema hint: a {% for ... in section.blocks %} loop driving slides, or carousel libs
      const multiSlide = CAROUSEL_RE.test(raw) || /\{%-?\s*for\b[^%]*\bslide/i.test(raw)
      if (multiSlide) offenders.push(path.basename(f))
    }
    evidence.heroCarousel = { forbidden: true, offenders }
    if (offenders.length) {
      measurable('dq.hero-carousel-forbidden', offenders.join(', '), `hero carousel/slider markers found (${offenders.join(', ')}) but pack forbids it (ELI-008: slides 2+ near-zero engagement) — use a single static hero`, offenders.join(', '))
    }
  }

  // 7. Color scheme count — distinct color-scheme-N / scheme-N / m-color-{n} usages store-wide.
  const schemeMax = Number(pack.color_roles?.scheme_count_max ?? 0)
  const schemes = new Set()
  for (const m of liquidText.matchAll(/\b(?:color-scheme|scheme|m-color)[-_]?([0-9]{1,2})\b/gi)) schemes.add(m[1])
  // Shopify OS2.0 color_scheme settings carry "scheme-N" ids in JSON templates too
  for (const m of templateText.matchAll(/"color_scheme"\s*:\s*"(?:scheme-)?([0-9]{1,2})"/gi)) schemes.add(m[1])
  evidence.colorSchemes = { max: schemeMax, distinct: [...schemes] }
  if (schemeMax > 0 && schemes.size > schemeMax) {
    measurable('dq.too-many-schemes', 'theme', `${schemes.size} distinct color schemes used store-wide (${[...schemes].sort().join(', ')}) — niche allows ≤${schemeMax}`, [...schemes].sort().join(', '))
  }

  // 8. Decoder citations (ALWAYS WARNING) — ≥3 brands on hero/PDP/cart surfaces, in reference_brands.
  const DECODER_RE = /<!--\s*Decoder:\s*([^>]+?)\s*-->/gi
  const SURFACE_RE = /(hero|banner|product|pdp|cart|featured|collection|main-product|buy-box)/i
  const refBrands = new Set((pack.reference_brands || []).map(b => b.trim().toLowerCase().replace(/[.''`/]/g, '')))
  const citedBrands = new Set()
  let onSurfaceCitations = 0
  let offNiche = 0
  for (const f of sectionFiles) {
    let raw = ''
    try { raw = fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { continue }
    const onSurface = SURFACE_RE.test(path.basename(f))
    DECODER_RE.lastIndex = 0
    let m
    while ((m = DECODER_RE.exec(raw)) !== null) {
      const brands = m[1].split(/[,;|]/).map(b => b.trim().toLowerCase().replace(/[.''`/]/g, '')).filter(Boolean)
      for (const b of brands) {
        citedBrands.add(b)
        if (onSurface) onSurfaceCitations += 1
        if (refBrands.size && !refBrands.has(b)) offNiche += 1
      }
    }
  }
  evidence.decoder = { cited: [...citedBrands], onSurfaceCitations, refBrands: [...refBrands], offNiche }
  if (citedBrands.size < 3 || onSurfaceCitations < 3) {
    warnings.push({ id: 'dq.decoder-citations', page: 'sections', detail: `only ${onSurfaceCitations} \`<!-- Decoder: brand -->\` citation(s) on hero/PDP/cart surfaces (${citedBrands.size} distinct brand(s)) — a premium build should cite ≥3 niche reference brands [${[...refBrands].slice(0, 6).join(', ')}]`, evidence: [...citedBrands].join(', ') })
  } else if (offNiche > 0) {
    warnings.push({ id: 'dq.decoder-citations', page: 'sections', detail: `${offNiche} decoder citation(s) name brands not in the niche reference_brands [${[...refBrands].slice(0, 6).join(', ')}] — cite the niche's premium leaders`, evidence: [...citedBrands].filter(b => !refBrands.has(b)).join(', ') })
  }

  // 9. Image ratio (ALWAYS WARNING) — aspect-ratio / Minimog ratio settings vs pack ratios.
  const ratioToDecimal = (s) => { const m = String(s).match(/^(\d+):(\d+)$/); return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : null }
  const declaredRatios = new Set()
  for (const m of liquidText.matchAll(/aspect-ratio\s*:\s*([0-9.]+)\s*\/\s*([0-9.]+)/g)) { if (Number(m[2])) declaredRatios.add(Number(m[1]) / Number(m[2])) }
  for (const m of templateText.matchAll(/"(?:image_ratio|product_ratio|hero_ratio|ratio)"\s*:\s*"([0-9]+):([0-9]+)"/gi)) { if (Number(m[2])) declaredRatios.add(Number(m[1]) / Number(m[2])) }
  const wantRatios = [pack.imagery?.product_ratio, pack.imagery?.hero_ratio].map(ratioToDecimal).filter(n => n !== null)
  evidence.imagery = { want: { product: pack.imagery?.product_ratio, hero: pack.imagery?.hero_ratio }, found: [...declaredRatios].map(n => n.toFixed(3)) }
  if (wantRatios.length && declaredRatios.size) {
    const mismatched = [...declaredRatios].filter(d => !wantRatios.some(w => Math.abs(w - d) < 0.04))
    if (mismatched.length) {
      warnings.push({ id: 'dq.image-ratio', page: 'theme', detail: `image aspect-ratio(s) ${mismatched.map(n => n.toFixed(2)).join(', ')} don't match the niche ratios (product ${pack.imagery?.product_ratio || '—'}, hero ${pack.imagery?.hero_ratio || '—'})`, evidence: mismatched.map(n => n.toFixed(3)).join(', ') })
    }
  }

  // pdp_order deviation (WARNING) — show diff against the expected order if any PDP template declares an order.
  if (Array.isArray(pack.pdp_order) && pack.pdp_order.length) {
    const pdpTpl = templateJson.find(f => /product/i.test(path.basename(f)))
    if (pdpTpl) {
      let order = []
      try {
        const j = JSON.parse(fs.readFileSync(path.resolve(cwd, pdpTpl), 'utf-8'))
        order = Array.isArray(j.order) ? j.order : Object.keys(j.sections || {})
      } catch { /* not parseable — skip pdp_order check */ }
      if (order.length) {
        const want = pack.pdp_order.join(' → ')
        const got = order.join(' → ')
        if (want !== got) warnings.push({ id: 'dq.pdp-order', page: path.basename(pdpTpl), detail: `PDP section order differs from the niche expectation (informational) — expected [${want}], built [${got}]`, evidence: got })
      }
    }
  }

  // font-family cross-check (WARNING) — heading_style vs design-system fonts (optional).
  const dsAbs = path.resolve(cwd, DS)
  if (ts.heading_style && fs.existsSync(dsAbs)) {
    try {
      const dsJson = JSON.parse(fs.readFileSync(dsAbs, 'utf-8'))
      const fonts = JSON.stringify(dsJson.typography?.fonts || dsJson.fonts || dsJson.typography || {}).toLowerCase()
      const wantsSerif = /serif/.test(ts.heading_style)
      const hasSerif = /serif/.test(fonts) && !/sans-?serif/.test(fonts.replace(/serif/g, m => m)) // crude: serif present
      if (fonts && fonts !== '{}' && wantsSerif && !/serif/.test(fonts)) {
        warnings.push({ id: 'dq.font-family', page: DS, detail: `pack heading_style="${ts.heading_style}" but design-system fonts don't appear to include a serif face`, evidence: '' })
      } else if (fonts && fonts !== '{}' && !wantsSerif && hasSerif && /serif/.test(fonts) && !/sans/.test(fonts)) {
        warnings.push({ id: 'dq.font-family', page: DS, detail: `pack heading_style="${ts.heading_style}" (sans) but design-system fonts look serif-led`, evidence: '' })
      }
    } catch { /* unparseable DS — skip cross-check */ }
  }

  // human_review[] — emit each as a warning tagged reviewer:vega (records owed sign-off; never mechanized).
  for (const q of (pack.human_review || [])) {
    warnings.push({ id: 'dq.human-review', page: 'vega', detail: `[reviewer: vega] ${q}`, evidence: '' })
  }

  finish(null, evidence)
}

try {
  main()
} catch (err) {
  finish(`unexpected failure: ${err.message}`)
}
