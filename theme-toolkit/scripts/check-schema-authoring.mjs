#!/usr/bin/env node
// Boldteq schema-authoring gate (#47) — the merchant-admin quality enforcer.
//
// WHY THIS EXISTS: nothing in the 40-gate stack had ever PARSED a section's {% schema %}.
// Gate #3 (editability) literally `sed`-deletes the schema block before its content grep, and the
// #43 rule-pack cannot express these rules at all — it is ONE regex over ONE file's raw text, with
// no JSON parse, no cross-file aggregation and no per-file "require". So the whole merchant-facing
// authoring surface — every label, info string, option value and default a merchant reads in the
// theme customizer — shipped completely unchecked. Measured on the cravinbyandy client theme
// (2026-07-23): 229 non-`t:` schema labels, an asset filename typed into a "text" setting, a nav
// built from custom blocks instead of a link_list, and CHANGES.md/Figma/WCAG-waiver engineering
// notes rendered as merchant help text — with all 40 gate reports green and silent.
//
// Parsing the JSON turns ~12 "impossible" rules into trivial ones. Schema extraction is deliberately
// identical to check-render-wiring.mjs's imageSettingIds() so the two gates agree on what a schema is.
//
// S2 (2026-07-23) adds the admin-panel STRUCTURE checks — the "options not properly structured"
// complaint, mechanized against the official theme-architecture docs (visible_if / presets / max_blocks
// / enabled_on-disabled_on). Every S2 finding cites the shopify.dev page it is derived from; the two
// checks the docs would not support were deliberately NOT shipped (see the note above DOC_COND).
//
// Usage:
//   node check-schema-authoring.mjs                      base-diff scoped (the real mode)
//   SCHEMA_SCAN_ALL=1 node check-schema-authoring.mjs    whole-corpus probe / fixtures
//
// Env:
//   BASE_REF            theme-base git ref (default "base"). Scope = sections/ ADDED|MODIFIED since
//                       base — the build's own authoring surface; the paired assets/*.css a check
//                       reads is scoped the same way, so a modified stock section is never blamed for
//                       the base theme's own CSS. Unresolvable → WARN + skip (evidence.scanned stays 0
//                       so gate #45 sees a skip, not a green pass). Resolved-but-empty → *.n-a-empty-scope.
//   SCHEMA_SCAN_ALL=1   scan every section on disk instead of the base diff. Fixture/probe use only —
//                       a fixture dir is not a git repo, so there is no base ref to diff against.
//   SCHEMA_BASE_FILES   comma-separated section paths to treat as vendored theme base under
//                       SCHEMA_SCAN_ALL (excluded from the scan, used as the name-collision corpus).
//                       Fixture-only; in the real base-diff mode the base set is derived from git.
//   REPORT_DIR          default gate-reports
//
// Exit: 0 = pass · 1 = block · 2 = env error
//
// STANDARD MAPPING: every check id below is cited verbatim by the team standard doc and the trained
// rule set — treat the id strings as a public contract, do not rename them.
//
// A NOTE ON SEVERITY: STD-DYN-01 (missing-title-trio) reads as "blocker for a content section" in the
// standard's prose, but it is a heuristic about intent, and a false BLOCK is as damaging as a false
// pass. It ships at warn, downgraded to `advise` when the section has no text surface at all.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const BASE_REF = process.env.BASE_REF || 'base'
const SCAN_ALL = process.env.SCHEMA_SCAN_ALL === '1'
const SCAN_ALL_BASE = (process.env.SCHEMA_BASE_FILES || '').split(',').map(s => s.trim()).filter(Boolean)
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'

// ── the block/warn split, in one auditable table ─────────────────────────────
// Blockers are the checks that are mechanically certain (a filename in a text setting, an engineering
// note in merchant help text, an unparseable schema). Everything else is a heuristic and warns.
const SEVERITY = {
  'schema.invalid-json': 'block',
  'schema.label-not-translated': 'block',      // STD-ADMIN-01
  'schema.filename-as-text': 'block',          // STD-ADMIN-02
  'schema.dev-note-in-info': 'block',          // STD-ADMIN-03
  'schema.micro-syntax': 'block',              // STD-ADMIN-04
  'schema.nav-not-linklist': 'block',          // STD-NAV-01
  'schema.image-no-empty-state': 'block',      // STD-IMG-02
  'schema.no-color-scheme': 'block',           // STD-TOKEN-05
  'schema.pii-default': 'block',               // STD-NAME-04
  'schema.numbered-settings': 'warn',          // STD-ADMIN-07
  'schema.option-value-mismatch': 'warn',      // STD-ADMIN-08
  'schema.jargon-label': 'warn',               // STD-ADMIN-09
  'schema.name-content-specific': 'warn',      // STD-NAME-01
  'schema.duplicate-default-heading': 'warn',  // STD-NAME-02
  'schema.name-collides-with-base': 'warn',    // STD-NAME-03
  'schema.missing-title-trio': 'warn',         // STD-DYN-01
  'schema.unconditional-render': 'warn',       // STD-DYN-02
  'schema.alignment-not-dynamic': 'warn',      // STD-DYN-03
  // S2 admin-panel structure — grounded in shopify.dev (see DOC_COND / DOC_SECTION_SCHEMA below).
  'schema.visible_if-invalid': 'block',        // a visible_if referencing an undeclared setting id
  'schema.duplicate-setting-id': 'block',      // two settings share an id — Shopify keeps the last, silently dropping the merchant's control (validate_theme misses this; boundary owned here)
  'schema.no-conditional-settings': 'warn',    // a gating checkbox + dependents with no visible_if
  'schema.preset-missing': 'warn',             // a configurable, non-chrome section with no preset
  'schema.blocks-no-limit': 'warn',            // typed blocks with neither max_blocks nor a per-type limit
  'schema.enabled-on-misuse': 'warn',          // both enabled_on + disabled_on, or a malformed one
  'schema.scope-unresolved': 'warn',
  'schema.n-a-empty-scope': 'warn',
}

const blockers = []
const warnings = []
const counts = {}
function finding(id, page, detail, evidence = '', severity) {
  counts[id] = (counts[id] || 0) + 1
  const tier = SEVERITY[id] || 'warn'
  if (tier === 'block') blockers.push({ id, page, detail, evidence: String(evidence) })
  else warnings.push({ id, page, detail, evidence: String(evidence), severity: severity || 'warn' })
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('schema-authoring', 47, {
    cwd, pass, blockers, warnings,
    evidence: { baseRef: BASE_REF, reason: envError || undefined, byCheck: counts, ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`schema-authoring: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const exists = (f) => fs.existsSync(path.resolve(cwd, f))
const isGenerated = (text) => /GENERATED by [\w.-]+/i.test(String(text).slice(0, 400))

function walkSections() {
  const abs = path.resolve(cwd, 'sections')
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs).filter(n => n.endsWith('.liquid')).map(n => `sections/${n}`).sort()
}

function gitChanged(dir) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', dir], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return null }
}

// ── schema extraction (same shape as check-render-wiring.mjs) ────────────────
const SCHEMA_BLOCK = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/
function extractSchema(raw) {
  const m = raw.match(SCHEMA_BLOCK)
  if (!m) return { present: false, json: null, error: null }
  try { return { present: true, json: JSON.parse(m[1]), error: null } }
  catch (err) { return { present: true, json: null, error: err.message } }
}
const stripSchema = (raw) => raw.replace(new RegExp(SCHEMA_BLOCK.source, 'g'), ' ')

const asArray = (v) => (Array.isArray(v) ? v : [])
// Every setting object in the schema, tagged with where it lives (section-level vs a block).
function settingGroups(schema) {
  const groups = [{ where: 'settings', settings: asArray(schema.settings) }]
  for (const b of asArray(schema.blocks)) {
    if (b && typeof b === 'object') groups.push({ where: `block "${b.type || b.name || '?'}"`, settings: asArray(b.settings), block: b })
  }
  return groups
}
const allSettings = (schema) => settingGroups(schema).flatMap(g => g.settings.filter(s => s && typeof s === 'object'))

// ── check helpers ────────────────────────────────────────────────────────────
const TEXTY = new Set(['text', 'textarea'])
const TEXT_SURFACE = new Set(['text', 'textarea', 'richtext', 'inline_richtext', 'html', 'liquid'])

// STD-ADMIN-02. `/fallback/` alone is too loose for a BLOCK ("Fallback heading" is legitimate copy),
// so it only counts when the same id/label also names an image/asset.
const FILENAME_WORD = /file ?name|\basset\b/i
const FALLBACK_WORD = /\bfallback\b/i
const IMAGEY_WORD = /imag|\bimg\b|photo|picture|\bicon\b|\blogo\b|\bsvg\b|\bfile\b|\basset\b/i
const FILENAME_DEFAULT = /\.(jpe?g|png|webp|gif|svg)$/i

// STD-ADMIN-03. Deliberately CASE-SENSITIVE on the shouted tokens: "Do not exceed 2MB" is legitimate
// merchant guidance, "do NOT silently re-guess it" is a note to the next engineer.
const DEV_NOTE = /CHANGES\.md|Figma|REGRESSION|WCAG\s.*waiver|do NOT|TODO|FIXME|see the .* in/

const MICRO_SYNTAX = /one per line|comma[- ]separated|separated by|\bLabel\s*\|/i

const JARGON = /\bschema\b|json-?ld|metafield|metaobject|node id|namespace|\bliquid\b|\bpx\b|\bcss\b/i

// STD-NAME-01. Tunable allowlist: a capitalised token that names a SECTION ROLE is fine
// ("FAQ Accordion"); one that names this store's content is not ("Meet Andy", "Our Locations").
const ROLE_WORDS = new Set([
  'accordion', 'announcement', 'banner', 'bar', 'blog', 'breadcrumb', 'card', 'cards', 'carousel',
  'cart', 'collage', 'collection', 'contact', 'content', 'cta', 'drawer', 'faq', 'featured', 'footer',
  'form', 'gallery', 'grid', 'header', 'hero', 'image', 'images', 'list', 'logo', 'logos', 'main',
  'marquee', 'media', 'menu', 'nav', 'navigation', 'newsletter', 'page', 'pdp', 'popup', 'product',
  'products', 'rich', 'row', 'search', 'section', 'seo', 'slider', 'slideshow', 'social', 'strip',
  'testimonial', 'testimonials', 'text', 'ticker', 'usp', 'video',
])
const CONTENT_NAME_PREFIX = /^(meet|our)\s/i

// Section roles that legitimately carry no heading/subheading trio (chrome, not content).
const CHROME_SECTION = /header|footer|\bnav\b|navigation|announcement|marquee|ticker|breadcrumb|drawer|popup|modal|cart\b/i

const HEADINGISH_ID = /head(ing|line)|(^|_)title($|_)/i
const SUBISH_ID = /sub(head|title)|description|\bbody\b|caption|intro|(^|_)text($|_)|blurb|excerpt/i

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE = /\+?\d[\d\s().-]{7,}\d/
// "+91 0000000000" is a placeholder, not a person — blocking it is a false BLOCK (cravinbyandy
// footer, 2026-07-23). A long identical run or a straight keyboard sequence is nobody's number.
const DUMMY_PHONE = /(\d)\1{5,}|0123456789|1234567890|9876543210/
const PERSON_NAME = /^[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}$/
const PERSONISH_FIELD = /\bname\b|author|founder|owner|person|customer|contact|signature/i

const STOPWORDS = new Set(['to', 'the', 'a', 'an', 'of', 'and', 'or', 'with', 'on', 'in', 'for', 'by', 'from', 'at'])
// Parentheticals are a deliberate short-code hint ("Ticker (Poppins)" → value "poppins"), not a
// contradiction — strip them before comparing so they cannot manufacture a mismatch.
const labelTokens = (s) => String(s).replace(/\([^)]*\)/g, ' ').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOPWORDS.has(t))
const valueTokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const normDefault = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

// ── S2 admin-panel structure (grounded in the official theme-architecture docs) ─
// Each finding cites the exact page the rule is derived from, so a reviewer checks the rule against
// Shopify rather than against a trained recall. Confirmed 2026-07-23 from these fetched pages:
//   DOC_COND            visible_if is a boolean expression — the doc's own example is
//                       `{{ block.settings.layout_style == 'flex' }}`, i.e. a `{{ scope.settings.id … }}`
//                       reference form; only the listed setting types support it; it cannot read
//                       resolved data-source values. The Conditional-settings section lives on the
//                       settings page (#conditional-settings anchor) — the input-settings page has none.
//   DOC_SECTION_SCHEMA  presets are what a merchant selects in "Add section"; the block cap is 50 and
//                       max_blocks lowers it; each block type takes an optional `limit`; enabled_on /
//                       disabled_on restrict templates+groups and "only one" may be used.
// NOT shipped, because the official pages do not support it: a BLOCK for visible_if inside
// config/settings_schema.json (only community forums assert it is ignored there — no doc page states
// it), and any enabled_on↔app-block coupling (the section-schema page ties enabled_on to templates +
// section groups, never to app blocks — so that framing would contradict the doc).
const DOC_COND = 'shopify.dev/docs/storefronts/themes/architecture/settings#conditional-settings'
const DOC_SECTION_SCHEMA = 'shopify.dev/docs/storefronts/themes/architecture/sections/section-schema'

// A checkbox is the one input whose stored value is a plain boolean — the clean, low-false-positive
// gate signal. `show_button`/`enable_video`/`reviews_enabled` → the noun the toggle controls.
const TOGGLE_PREFIX = /^(show|enable|display|use|include)[_-](.+)$/i
const TOGGLE_SUFFIX = /^(.+)[_-](enabled?|visible)$/i
function toggleStem(id) {
  const a = id.match(TOGGLE_PREFIX); if (a) return a[2]
  const b = id.match(TOGGLE_SUFFIX); if (b) return b[1]
  return null
}

// section.settings.X / block.settings.X inside a visible_if expression. A bare global settings.X is
// deliberately NOT matched — it points at config/settings_schema.json, which this gate does not parse,
// so a valid cross-scope reference to a theme setting is never mis-flagged as a missing id.
const VISIBLE_IF_REF = /\b(section|block)\.settings\.([a-zA-Z0-9_]+)/g
const idSet = (list) => new Set(asArray(list).filter(s => s && s.id).map(s => String(s.id)))

function main() {
  const onDisk = walkSections()
  let targets = null
  let scopeSource = 'git'
  // null = "scan every CSS file" (SCAN_ALL); otherwise the assets this build added/modified. A stock
  // section that the team merely edited still pairs with VENDORED assets/section-<name>.css, and
  // blaming the build for the base theme's own text-align is a finding on an untouched file.
  let assetScope = null
  if (SCAN_ALL) {
    scopeSource = 'scan-all'
    targets = onDisk.filter(f => !SCAN_ALL_BASE.includes(f))
  } else {
    targets = gitChanged('sections')
    assetScope = new Set(gitChanged('assets') || [])
  }
  if (targets === null) {
    finding('schema.scope-unresolved', '.', `base ref "${BASE_REF}" is unresolvable — schema-authoring scan SKIPPED (nothing was examined). Tag the theme base "base" (or set BASE_REF) so the gate can scope to the build's own sections.`)
    finish(null, { scope: 'unresolved', scanned: 0, sections: 0 })
  }

  targets = targets.filter(f => /^sections\/[^/]+\.liquid$/.test(f) && exists(f))
  const scanned = []
  const parsed = []   // { file, base, schema, liquid }
  for (const file of targets) {
    const raw = read(file)
    if (isGenerated(raw)) continue
    scanned.push(file)
    const { present, json, error } = extractSchema(raw)
    if (!present) continue
    if (json === null) {
      finding('schema.invalid-json', file, `{% schema %} is present but does not parse as JSON (${error}) — the section cannot load in the theme editor at all. Fix the JSON (trailing comma / comment / unquoted key are the usual causes).`, String(error).slice(0, 120))
      continue
    }
    parsed.push({ file, base: path.basename(file, '.liquid'), schema: json, liquid: stripSchema(raw), raw })
  }

  // Vendored theme-base corpus = every section on disk that is NOT part of this build's surface.
  // Derived, never a hardcoded Dawn list — a Minimog/Horizon base must work identically.
  const baseSet = SCAN_ALL ? SCAN_ALL_BASE : onDisk.filter(f => !targets.includes(f))
  const baseNames = new Map()
  for (const f of baseSet) {
    const { json } = extractSchema(read(f))
    if (json && typeof json.name === 'string') baseNames.set(normName(json.name), f)
  }

  const headingDefaults = new Map() // normalised default → [ "file:settingId" ]

  for (const { file, base, schema, liquid } of parsed) {
    const settings = allSettings(schema)
    const groups = settingGroups(schema)

    // ── STD-ADMIN-01: every merchant-facing string is a translation key ──────
    // Aggregated per file: 229 individual blockers is a wall, not a work list.
    // (Boldteq standard, not a Shopify rule — the Theme Store does not require universal translation.)
    const untranslated = []
    const pushStr = (where, v) => { if (typeof v === 'string' && v.trim() && !v.trim().startsWith('t:')) untranslated.push(`${where}="${v.slice(0, 40)}"`) }
    pushStr('name', schema.name)
    for (const g of groups) {
      g.settings.forEach((s, i) => {
        if (!s || typeof s !== 'object') return
        pushStr(`${g.where}[${i}].label`, s.label)
        pushStr(`${g.where}[${i}].info`, s.info)
        pushStr(`${g.where}[${i}].content`, s.content)
        asArray(s.options).forEach((o, j) => pushStr(`${g.where}[${i}].options[${j}].label`, o && o.label))
      })
      if (g.block) pushStr(`${g.where}.name`, g.block.name)
    }
    asArray(schema.presets).forEach((p, i) => pushStr(`presets[${i}].name`, p && p.name))
    if (untranslated.length) {
      finding('schema.label-not-translated', file, `${untranslated.length} merchant-facing schema string(s) are raw text, not "t:" translation keys (e.g. ${untranslated.slice(0, 3).join('; ')}) — a raw label cannot be localised and drifts from locales/en.default.schema.json. Move each string into the schema locale file and reference it as t:sections.${base}.*`, untranslated.slice(0, 6).join(' | '))
    }

    // ── duplicate setting id (Shopify's validate_theme MISSES this — coverage.md 7/9) ──
    // Two settings with the same id inside one group: Shopify keeps only the LAST, silently dropping
    // the merchant's other control. Per-group (section vs each block) — an id may legitimately repeat
    // across a section setting and a block setting. Mechanically certain → block.
    for (const g of groups) {
      const seen = new Map()
      for (const s of g.settings) {
        if (!s || typeof s !== 'object' || !s.id) continue
        const id = String(s.id)
        seen.set(id, (seen.get(id) || 0) + 1)
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`)
      if (dups.length) {
        finding('schema.duplicate-setting-id', file, `${g.where}: duplicate setting id(s) ${dups.join(', ')} — Shopify keeps only the last definition, so the earlier control silently vanishes from the admin and its value never saves. Give each setting in a group a unique id. See ${DOC_SECTION_SCHEMA} (Settings).`, dups.join(', '))
      }
    }

    for (const g of groups) {
      for (const s of g.settings) {
        if (!s || typeof s !== 'object') continue
        const id = String(s.id || '')
        const label = String(s.label || '')
        const info = String(s.info || '')
        const def = typeof s.default === 'string' ? s.default : ''
        const where = `${g.where} #${id || s.type}`

        // ── STD-ADMIN-02: an asset filename typed into a text box ────────────
        if (TEXTY.has(s.type)) {
          const idLabel = `${id} ${label}`
          const nameSignal = FILENAME_WORD.test(idLabel) || (FALLBACK_WORD.test(idLabel) && IMAGEY_WORD.test(idLabel))
          if (nameSignal || FILENAME_DEFAULT.test(def)) {
            finding('schema.filename-as-text', file, `${where} is a "${s.type}" setting that asks the merchant to type an asset filename (label "${label}", default "${def}") — a filename in a text box is not editable content: it silently 404s the moment the asset is renamed and no merchant knows the file list. Use "type": "image_picker" and render the empty state in Liquid.`, `${id}: ${def || label}`)
          }
        }

        // ── STD-ADMIN-03: engineering notes rendered as merchant help text ───
        if (info) {
          const m = info.match(DEV_NOTE)
          if (m) finding('schema.dev-note-in-info', file, `${where} info text carries an engineering note ("${m[0]}") that renders in the theme customizer: "${info.slice(0, 90)}" — a merchant sees Figma node ids, CHANGES.md references and regression history as product help. Move the note into a {% comment %} / CHANGES.md and write info for the merchant.`, info.slice(0, 120))
        }

        // ── STD-ADMIN-04: a delimited micro-format the merchant must type ────
        if (TEXTY.has(s.type) && info && MICRO_SYNTAX.test(info)) {
          finding('schema.micro-syntax', file, `${where} instructs the merchant to type a delimited micro-format into a "${s.type}" setting ("${info.slice(0, 70)}") — one typo silently breaks the whole list and there is no reorder, no per-item image, no validation. Model it as blocks.`, info.slice(0, 120))
        }

        // ── STD-ADMIN-09: internal jargon in a merchant-facing label ─────────
        if (label) {
          const m = label.match(JARGON)
          if (m) finding('schema.jargon-label', file, `${where} label "${label}" contains internal jargon ("${m[0]}") — a merchant does not know what a schema/metafield/namespace/px is. Name the setting after the outcome the merchant wants.`, label)
        }

        // ── STD-ADMIN-08: an option value that contradicts its label ─────────
        if ((s.type === 'select' || s.type === 'radio')) {
          for (const o of asArray(s.options)) {
            if (!o || typeof o !== 'object') continue
            const lt = labelTokens(o.label)
            const vt = valueTokens(o.value)
            if (lt.length < 2 || vt.length === 0) continue
            if (vt.length < lt.length && vt.every(t => lt.includes(t))) {
              finding('schema.option-value-mismatch', file, `${where} option label "${o.label}" maps to value "${o.value}", which drops part of the label — the stored value no longer describes the choice, so the Liquid branch and the merchant's mental model diverge (and the next editor "fixes" the wrong one). Make the value a full slug of the label.`, `${o.label} → ${o.value}`)
            }
          }
        }

        // ── STD-NAME-04: real PII shipped as a default ───────────────────────
        if (def) {
          const idLabel = `${id} ${label}`
          let hit = null
          const digits = (def.match(/\d/g) || []).join('')
          if (EMAIL.test(def)) hit = 'an email address'
          else if (PHONE.test(def) && digits.length >= 7 && !DUMMY_PHONE.test(digits)) hit = 'a phone number'
          else if (PERSON_NAME.test(def.trim()) && PERSONISH_FIELD.test(idLabel)) hit = 'a personal name'
          if (hit) finding('schema.pii-default', file, `${where} ships ${hit} as its schema default ("${def.slice(0, 60)}") — a default is theme code: it reappears on every new section instance, survives the merchant deleting it, and leaks a real person's details into the repo and into every store this section is reused on. Leave the default blank and seed the real value in the template/preset.`, `${id}: ${def.slice(0, 60)}`)
        }

        // ── STD-NAME-02 corpus: heading defaults, compared across files ──────
        // TEXT_SURFACE only: `heading_size`/`heading_level` are selects whose defaults are "large"/"2",
        // and every section legitimately ships the same one — comparing them manufactured 2 of the 4
        // duplicate findings on cravinbyandy (2026-07-23). A duplicate only matters for heading COPY.
        if (HEADINGISH_ID.test(id) && TEXT_SURFACE.has(s.type) && def && normDefault(def)) {
          const key = normDefault(def)
          if (!headingDefaults.has(key)) headingDefaults.set(key, [])
          headingDefaults.get(key).push(`${file}#${id}`)
        }
      }

      // ── STD-ADMIN-07: numbered settings are blocks wearing a disguise ──────
      const numbered = new Map()
      for (const s of g.settings) {
        const id = String((s && s.id) || '')
        const m = id.match(/^(.*?[a-z0-9])[_-]?(\d+)$/i)
        if (!m || m[1].length < 2) continue
        if (!numbered.has(m[1])) numbered.set(m[1], [])
        numbered.get(m[1]).push(id)
      }
      for (const [stem, ids] of numbered) {
        if (ids.length < 2) continue
        finding('schema.numbered-settings', file, `${g.where} declares ${ids.length} settings that differ only by a trailing number (${ids.join(', ')}) — the merchant cannot add a ${stem.replace(/_/g, ' ')} beyond ${ids.length}, cannot reorder them and cannot remove one from the middle. Model them as blocks.`, ids.join(', '))
      }
    }

    // ── STD-NAME-01: a section name that describes THIS store's content ──────
    const name = String(schema.name || '')
    if (name) {
      let why = null
      if (/['’]s\b/.test(name)) why = `a possessive ("${name}")`
      else if (CONTENT_NAME_PREFIX.test(name)) why = `a content lead-in ("${name.split(/\s/)[0]} …")`
      else {
        const tokens = name.trim().split(/\s+/)
        const offender = tokens.slice(1).find(tk => /^[A-Z]/.test(tk) && !/^[A-Z]{2,4}$/.test(tk) && !ROLE_WORDS.has(tk.toLowerCase().replace(/[^a-z]/g, '')))
        if (offender) why = `a capitalised content word ("${offender}")`
      }
      if (why) finding('schema.name-content-specific', file, `section name "${name}" is content-specific — ${why}. The name is what the merchant picks from "Add section": it must describe the ROLE (what the section does) so it survives the content changing. Rename to the role and put the content in the settings.`, name)

      const collision = baseNames.get(normName(name))
      if (collision) finding('schema.name-collides-with-base', file, `section name "${name}" is identical to the theme base's ${collision} — the "Add section" list shows two entries with the same name and the merchant cannot tell which is which (and support cannot either). Give the custom section a distinct role name.`, `${name} == ${collision}`)
    }

    // ── STD-DYN-01: the heading / subheading trio ────────────────────────────
    const ids = settings.map(s => String(s.id || ''))
    const hasHeading = ids.some(i => HEADINGISH_ID.test(i))
    const hasSub = ids.some(i => SUBISH_ID.test(i))
    const hasTextSurface = settings.some(s => TEXT_SURFACE.has(s.type))
    if (!hasHeading || !hasSub) {
      const missing = [!hasHeading && 'heading', !hasSub && 'subheading/description'].filter(Boolean).join(' + ')
      const chrome = CHROME_SECTION.test(base) || CHROME_SECTION.test(name)
      finding('schema.missing-title-trio', file, `section exposes no ${missing} setting — the merchant cannot retitle the section without an engineer, so the next copy change becomes a code change. Add heading + subheading settings and render them.`, ids.join(', ').slice(0, 120), (chrome || !hasTextSurface) ? 'advise' : 'warn')
    }

    // ── STD-DYN-02: every text output must render conditionally ──────────────
    // "Abhi koi bhi section properly conditionally render nahi ho raha hai" — a merchant who clears a
    // subheading gets an empty <p> holding its margin open, so blanking a field visibly breaks the page
    // and the merchant learns not to touch it. A setting nobody dares clear is not really editable.
    // Guarded to text-ish settings only: an image or a url renders inside markup that needs no guard.
    for (const s of settings) {
      const sid = String(s.id || '')
      if (!sid || !TEXT_SURFACE.has(s.type)) continue
      const out = new RegExp(`\\{\\{\\s*(?:section\\.settings|block\\.settings)\\.${sid}\\b`)
      if (!out.test(liquid)) continue // declared but never rendered — a different problem, not this one
      // A guard is any {% if %}/{% unless %}/ternary naming the same id, or a `default:` filter on the
      // output itself (which substitutes rather than emitting an empty element).
      const guard = new RegExp(`\\{%-?\\s*(?:els)?if[^%]*\\.${sid}\\b|\\{%-?\\s*unless[^%]*\\.${sid}\\b|\\{\\{[^}]*\\.${sid}\\s*\\|[^}]*default:`)
      if (!guard.test(liquid)) {
        finding('schema.unconditional-render', file, `"${sid}" is rendered with no {% if ${sid} != blank %} guard — when the merchant clears it the markup still emits, leaving an empty element holding its spacing. Wrap the output (or give it a default: filter).`, sid)
      }
    }

    // ── STD-DYN-03: alignment hardcoded in CSS instead of a setting ──────────
    const cssFiles = [`assets/section-${base}.css`, `assets/${base}.css`, `assets/section-${base}.css.liquid`, `assets/${base}.css.liquid`]
      .filter(f => exists(f) && (assetScope === null || assetScope.has(f)))
    const styleText = liquid + cssFiles.map(read).join('\n')
    const alignHit = styleText.match(/text-align\s*:\s*(left|right|center|centre|justify|start|end)\b/i)
    const hasAlignSetting = settings.some(s => s.type === 'text_alignment' || /align/i.test(String(s.id || '')))
    if (alignHit && !hasAlignSetting) {
      finding('schema.alignment-not-dynamic', file, `alignment is hardcoded ("${alignHit[0]}") and the schema exposes no alignment setting — the merchant must file a ticket to move text left. Add a "type": "text_alignment" setting and bind it (text_alignment is a current input type; style.* settings were sunset 2025-07-14).`, `${alignHit[0]} in ${cssFiles[0] || file}`)
    }

    // ── STD-TOKEN-05: the section must sit in a color scheme ─────────────────
    const hasSchemeSetting = settings.some(s => s.type === 'color_scheme')
    const hasSchemeClass = /color-\{\{/.test(liquid) || /class="[^"]*\{\{\s*section\.settings\.color_scheme/.test(liquid)
    if (!hasSchemeSetting || !hasSchemeClass) {
      const why = !hasSchemeSetting ? 'no "color_scheme" setting in the schema' : 'no color-{{ … }} wrapper class in the Liquid'
      finding('schema.no-color-scheme', file, `${why} — the section cannot participate in the theme's colour schemes, so it paints whatever its own CSS says and drifts the moment the merchant restyles the store. Add a color_scheme setting and wrap the section in class="color-{{ section.settings.color_scheme }}".`, `setting=${hasSchemeSetting} class=${hasSchemeClass}`)
    }

    // ── STD-NAV-01: navigation must bind a link_list ─────────────────────────
    // Nav-ness is deliberately narrow (tag/filename/name), NOT "the word menu appears anywhere":
    // a "Menu cards" section with `card_link` url blocks is a card grid, not navigation.
    const navish = /^(header|footer)$/i.test(String(schema.tag || ''))
      || /\bheader\b|\bfooter\b|\bnav(igation)?\b|main[- ]?menu/i.test(`${base} ${name}`)
      || asArray(schema.blocks).some(b => b && /nav|menu[-_ ]?(link|item)/i.test(`${b.type || ''} ${b.name || ''}`))
    if (navish) {
      const hasLinkList = settings.some(s => s.type === 'link_list')
      const linkBlocks = asArray(schema.blocks).filter(b => b && asArray(b.settings).some(s => s && s.type === 'url'))
      const iteratesBlocks = /\{%-?\s*for\s+\w+\s+in\s+section\.blocks\b/.test(liquid)
      if (!hasLinkList && linkBlocks.length && iteratesBlocks) {
        finding('schema.nav-not-linklist', file, `navigation is built from custom blocks (${linkBlocks.map(b => b.type).join(', ')}) with url settings instead of a "link_list" setting — the merchant edits this store's navigation in Online Store → Navigation, and a block-built nav means their menu edits do nothing here while the two menus silently diverge (and nested/current-page state is impossible). Bind a link_list setting and iterate linklists[…].links.`, linkBlocks.map(b => b.type).join(', '))
      }
    }

    // ── STD-IMG-02: an image_picker with no empty state ──────────────────────
    for (const s of settings) {
      if (s.type !== 'image_picker' || !s.id) continue
      const id = String(s.id)
      if (!new RegExp(`\\b${id.replace(/[^\w]/g, '')}\\b`).test(liquid)) continue // declared but never rendered — not this gate's call
      const guarded = new RegExp(`\\{%-?\\s*(?:if|unless|liquid)[\\s\\S]{0,120}?\\b${id}\\b`).test(liquid)
        || new RegExp(`\\b${id}\\b[^\\n]{0,60}(?:!=\\s*blank|==\\s*blank|\\|\\s*default:)`).test(liquid)
      const placeholder = /placeholder_svg_tag/i.test(liquid) || /\{%-?\s*render\s+['"][a-z0-9_-]*placeholder/i.test(liquid)
      if (!guarded && !placeholder) {
        finding('schema.image-no-empty-state', file, `image_picker "${id}" is rendered with no empty state — before the merchant uploads anything (and on every fresh install of this section) the markup emits an empty <img>/broken box. Wrap it in {% if section.settings.${id} != blank %} … {% else %} {{ 'image' | placeholder_svg_tag }} {% endif %}.`, id)
      }
    }

    // ══ S2 ADMIN-PANEL STRUCTURE — the "options not properly structured" complaint, mechanized ══════
    const sectionIds = idSet(schema.settings)

    // ── visible_if referencing an undeclared setting id (BLOCK) ─────────────────
    // DOC_COND: visible_if is a boolean expression `{{ scope.settings.id == '…' }}`. A reference whose
    // id is not declared in that scope can never evaluate — the setting silently never toggles (stuck
    // hidden or stuck shown). section.settings.* always resolves against the section's own settings;
    // block.settings.* resolves against the block the visible_if lives in. A global settings.* ref is
    // left alone (it targets settings_schema.json, which this gate does not parse).
    for (const g of groups) {
      const groupIds = g.block ? idSet(g.settings) : sectionIds
      for (const s of g.settings) {
        if (!s || typeof s !== 'object' || !('visible_if' in s)) continue
        const at = `${g.where} #${s.id || s.type}`
        if (typeof s.visible_if !== 'string') {
          finding('schema.visible_if-invalid', file, `${at} has a non-string visible_if — the docs define it as a boolean expression string like "{{ section.settings.x == 'y' }}", so a non-string value is ignored and the setting shows unconditionally. See ${DOC_COND} (Conditional settings).`, JSON.stringify(s.visible_if).slice(0, 60))
          continue
        }
        for (const ref of s.visible_if.matchAll(VISIBLE_IF_REF)) {
          const [, scope, rid] = ref
          if (scope === 'section' && !sectionIds.has(rid)) {
            finding('schema.visible_if-invalid', file, `${at} has visible_if "${s.visible_if.slice(0, 60)}" referencing section.settings.${rid}, which is not a setting in this section — the condition can never resolve, so the setting is permanently hidden (or permanently shown). Reference an id that exists in "settings". See ${DOC_COND} (Conditional settings).`, `section.settings.${rid}`)
          } else if (scope === 'block' && g.block && !groupIds.has(rid)) {
            finding('schema.visible_if-invalid', file, `${at} has visible_if "${s.visible_if.slice(0, 60)}" referencing block.settings.${rid}, which is not a setting in this block — the condition never resolves and the setting is stuck hidden/shown. Reference an id declared in this block's settings. See ${DOC_COND} (Conditional settings).`, `block.settings.${rid}`)
          }
        }
      }
    }

    // ── a gating checkbox with dependent settings but no visible_if anywhere (WARN)
    // DOC_COND documents visible_if for exactly this: hide settings that don't apply. A checkbox that
    // clearly gates sibling settings, with zero visible_if in the group, is the merchant seeing fields
    // that do nothing until an unrelated box is ticked — the "unstructured admin panel" report itself.
    // Conservative: checkbox only (the plain-boolean input), stem ≥3 chars, ≥1 sibling by id-prefix,
    // and skip the whole group the moment ANY setting already uses visible_if (the author knows the tool).
    for (const g of groups) {
      if (g.settings.some(s => s && typeof s === 'object' && 'visible_if' in s)) continue
      for (const s of g.settings) {
        if (!s || s.type !== 'checkbox' || !s.id) continue
        const stem = toggleStem(String(s.id))
        if (!stem || stem.length < 3) continue
        const deps = g.settings.filter(o => o && o.id && o.id !== s.id &&
          (String(o.id) === stem || String(o.id).startsWith(`${stem}_`) || String(o.id).startsWith(`${stem}-`)))
        if (!deps.length) continue
        const scope = g.block ? 'block' : 'section'
        finding('schema.no-conditional-settings', file, `${g.where}: checkbox "${s.id}" gates ${deps.length} sibling setting(s) (${deps.map(d => d.id).join(', ')}) but none use visible_if — the merchant sees those fields even when "${s.id}" is off and cannot tell which controls apply. Add "visible_if": "{{ ${scope}.settings.${s.id} }}" to each dependent setting. See ${DOC_COND} (Conditional settings).`, `${s.id} → ${deps.map(d => d.id).join(', ')}`)
        break // one nudge per group is a work item, not a wall
      }
    }

    // ── a configurable section with no preset (WARN) ────────────────────────────
    // DOC_SECTION_SCHEMA: "Presets are predefined section configurations that merchants can select when
    // adding sections to a JSON template" and presets "appear in the Add section picker". A section with
    // settings/blocks but no preset is not offerable from the theme editor. Group-only chrome
    // (header/footer/aside) is statically rendered and legitimately preset-less — exempt it.
    const hasConfigurable = asArray(schema.settings).length > 0 || asArray(schema.blocks).length > 0
    const hasPreset = asArray(schema.presets).length > 0
    const groupOnly = CHROME_SECTION.test(base) || CHROME_SECTION.test(name) || /^(header|footer|aside)$/i.test(String(schema.tag || ''))
    if (hasConfigurable && !hasPreset && !groupOnly) {
      finding('schema.preset-missing', file, `section has ${asArray(schema.settings).length} setting(s) / ${asArray(schema.blocks).length} block type(s) but no "presets" — without a preset the merchant cannot add it from the theme editor's "Add section" picker (a preset is what they select when adding a section to a JSON template). Add a presets entry with a role name. See ${DOC_SECTION_SCHEMA} (Presets).`, `settings=${asArray(schema.settings).length} blocks=${asArray(schema.blocks).length}`)
    }

    // ── typed blocks with no upper bound (WARN) ─────────────────────────────────
    // DOC_SECTION_SCHEMA: "There's a limit of 50 blocks per section. You can specify a lower limit with
    // the max_blocks attribute", and each block type takes an optional "limit". A section that offers
    // concrete typed blocks but sets neither inherits the 50 default — for a bounded layout (a 3-up
    // row, a logo strip) that is never intended. @app/@theme catch-all blocks imply no bound → skipped.
    const typedBlocks = asArray(schema.blocks).filter(b => b && typeof b === 'object' && b.type && !/^@(app|theme)$/i.test(String(b.type)))
    const hasMaxBlocks = Number.isFinite(schema.max_blocks)
    const anyTypeLimit = asArray(schema.blocks).some(b => b && Number.isFinite(b.limit))
    if (typedBlocks.length && !hasMaxBlocks && !anyTypeLimit) {
      finding('schema.blocks-no-limit', file, `section defines ${typedBlocks.length} block type(s) (${typedBlocks.map(b => b.type).join(', ')}) but sets neither "max_blocks" nor a per-type "limit" — the merchant can add up to the default of 50, which a bounded layout does not expect. Set "max_blocks" (section total) or a "limit" on the block type. See ${DOC_SECTION_SCHEMA} (max_blocks).`, typedBlocks.map(b => b.type).join(', '))
    }

    // ── enabled_on / disabled_on misuse (WARN) ──────────────────────────────────
    // DOC_SECTION_SCHEMA: enabled_on/disabled_on restrict a section to template page types and section
    // group types, and "You can use only one of enabled_on or disabled_on". The docs do NOT tie these
    // to app blocks, so this fires only on the documented misuse — both present, or a malformed value —
    // never on a legitimate placement rule.
    const placeMisuse = []
    if ('enabled_on' in schema && 'disabled_on' in schema) placeMisuse.push('both enabled_on and disabled_on are set (the docs allow only one)')
    for (const key of ['enabled_on', 'disabled_on']) {
      if (!(key in schema)) continue
      const v = schema[key]
      if (!v || typeof v !== 'object' || Array.isArray(v)) { placeMisuse.push(`${key} must be an object with "templates" and/or "groups"`); continue }
      if ('templates' in v && !Array.isArray(v.templates)) placeMisuse.push(`${key}.templates must be an array`)
      if ('groups' in v && !Array.isArray(v.groups)) placeMisuse.push(`${key}.groups must be an array`)
    }
    if (placeMisuse.length) {
      finding('schema.enabled-on-misuse', file, `section placement is misconfigured: ${placeMisuse.join('; ')}. enabled_on/disabled_on take {"templates":[…]} and/or {"groups":[…]} and only one of the two may appear. See ${DOC_SECTION_SCHEMA} (enabled_on / disabled_on).`, placeMisuse[0])
    }
  }

  // ── STD-NAME-02: the same default heading shipped by two sections ──────────
  for (const [value, where] of headingDefaults) {
    if (where.length < 2) continue
    finding('schema.duplicate-default-heading', where.map(w => w.split('#')[0]).join(', '), `${where.length} sections ship the identical default heading "${value.slice(0, 50)}" (${where.join(', ')}) — duplicated defaults mean a merchant who edits one page still sees the old copy on the other, and search engines see two identical H2s. Give each section a role-appropriate default (or leave it blank).`, where.join(', '))
  }

  // A resolved scope that covers nothing is legitimate (a CSS-only or template-only sprint), but
  // `pass:true` + `scanned:0` is indistinguishable from a masked skip — gate #45 blocks it as
  // integrity.vacuous-pass unless the gate declares an *.n-a-* marker. Same convention as #8/#9/#16/#22.
  if (scanned.length === 0) {
    finding('schema.n-a-empty-scope', '.', `scope resolved via ${scopeSource} but covers 0 hand-authored sections — nothing was scanned for schema-authoring defects. This is correct for a sprint that touched no sections; it contributes no quality signal.`)
  }
  finish(null, { scope: scopeSource, scanned: scanned.length, sections: parsed.length, baseCorpus: baseNames.size })
}

try { main() } catch (err) {
  writeReport('schema-authoring', 47, {
    cwd, pass: false,
    blockers: [{ id: 'schema-authoring.crash', page: '(schema-authoring)', detail: `unexpected failure: ${err.message}`, evidence: '' }],
    warnings: [], evidence: { scanned: 0 }, duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  console.error(`schema-authoring: CRASH — ${err.message}`)
  process.exit(2)
}
