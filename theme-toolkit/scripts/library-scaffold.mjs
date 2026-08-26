#!/usr/bin/env node
// library-scaffold — mechanical instantiator that turns a component-library card into a real
// Shopify section, so agent friction to USE the library ≤ friction to hand-roll.
//
// THE GAP THIS CLOSES (P6, 2026-08-25): the library-first doctrine (`components/**/*.md`) says
// "never paste, build FROM the card's structure" — but until now there was no way to convert a
// card into a working section without a stitch/loom retype pass. The retype is the friction that
// pushed agents back to hand-rolling; the hand-roll is what the AI-look/duplication/thinness
// gates keep catching (rules 04 §A + gate #54 dup-signals + #55 borrowed-assets). This CLI does
// the mechanical part in one command:
//
//   node toolkit/scripts/library-scaffold.mjs --card split-hero-icon-trust-anchor-cta --into hero
//   node toolkit/scripts/library-scaffold.mjs --card <cardId> --into <section-name> --namespace bt
//   node toolkit/scripts/library-scaffold.mjs --card <cardId> --into <section-name> --dry-run
//   node toolkit/scripts/library-scaffold.mjs --card <cardId> --into <section-name> --force
//
// It reads ~/.claude/memory/design/ecom/component-library-premium/components/**/<cardId>.md,
// extracts the fenced ```liquid|html, ```css, and ```json (schema contract) blocks, rewrites the
// card's BEM class prefix to the target section (default: --into value; overridable via
// --namespace), substitutes {{card_id}} placeholders with the section name, and writes into the
// CURRENT CLIENT REPO:
//
//   sections/<ns->?<section>.liquid          (always — ns prefix only when --namespace given)
//   assets/<ns->?<section>.css               (only when the card has a ```css block)
//   templates/_scaffold/<ns->?<section>.section.json  (only when the card has a ```json schema)
//
// The `templates/_scaffold/` file is a REFERENCE snippet stitch/loom splice into the real
// templates/index.json etc. — we never mutate a live template blindly (matches reference-ingest's
// "persist, never assume" doctrine, cravinbyandy 2026-07-22).
//
// SCHEMA: verbatim EXCEPT `name` (→ section name) and any `id` fields (namespaced if provided).
// Exit: 0 ok · 1 refusal (target exists / bad args) · 2 env/card-not-found.
//
// Pure functions are exported for the fixture in __fixtures__/library-scaffold/.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { isMain } from './lib/is-main.mjs'

const LIBRARY_ROOT = path.join(os.homedir(), '.claude/memory/design/ecom/component-library-premium/components')
const NAME_RE = /^[a-z][a-z0-9-]*$/

const die = (msg) => { console.error(`library-scaffold: ${msg}`); process.exit(2) }
const refuse = (msg) => { console.error(`library-scaffold: REFUSED — ${msg}`); process.exit(1) }

// ── argv ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const o = { dryRun: false, force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const val = () => {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`)
      i += 1
      return v
    }
    if (a === '--card') o.card = val()
    else if (a === '--into') o.into = val()
    else if (a === '--namespace') o.namespace = val()
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--force') o.force = true
    else if (a === '--audit') o.audit = true
    else if (a === '--help' || a === '-h') o.help = true
    else throw new Error(`unknown argument: ${a}`)
  }
  return o
}

// ── card location ────────────────────────────────────────────────────────────
// Cards live one folder deep under components/<category>/<cardId>.md. We probe every category
// rather than requiring the caller to know the category — the cardId is unique library-wide.
export function findCardPath(cardId, root = LIBRARY_ROOT) {
  const tried = []
  if (!fs.existsSync(root)) return { path: null, tried: [root] }
  for (const category of fs.readdirSync(root)) {
    const catDir = path.join(root, category)
    let stat
    try { stat = fs.statSync(catDir) } catch { continue }
    if (!stat.isDirectory()) continue
    const candidate = path.join(catDir, `${cardId}.md`)
    tried.push(candidate)
    if (fs.existsSync(candidate)) return { path: candidate, tried }
  }
  return { path: null, tried }
}

// ── fenced block extraction ──────────────────────────────────────────────────
// Extract THE FIRST fenced block per tag — variant deltas later in the card are intentionally
// ignored (a scaffold instantiates the BASE composition; picking a variant is a stitch/drape
// authorship decision, not a mechanical one).
export function parseFencedBlocks(md) {
  const blocks = {}
  // ``` (optional info string) \n ...body... \n ```
  // Support tags: liquid, html, css, js, javascript, json
  const re = /^```([a-zA-Z0-9_-]+)\r?\n([\s\S]*?)^```\s*$/gm
  let m
  while ((m = re.exec(md)) !== null) {
    const tag = m[1].toLowerCase()
    const body = m[2]
    const key = tag === 'javascript' ? 'js' : tag
    if (blocks[key] === undefined) blocks[key] = body
  }
  // Prefer `liquid` when both are present; expose it uniformly as `markup`.
  blocks.markup = blocks.liquid ?? blocks.html ?? null
  return blocks
}

// ── prefix detection ─────────────────────────────────────────────────────────
// A card's BEM prefix is the first block-level class on the outermost element (or the first CSS
// selector, if the HTML has none). This is deliberately conservative — we only rewrite classes we
// can prove belong to the card, never generic utility classes.
export function detectBemPrefix(html, css) {
  if (html) {
    // <section class="split-hero ...">  →  split-hero
    const m = html.match(/<[a-zA-Z][a-zA-Z0-9-]*\s[^>]*\bclass\s*=\s*["']([a-z][a-z0-9-]*)/i)
    if (m) return m[1]
  }
  if (css) {
    // .split-hero {   or   .split-hero__x {
    const m = css.match(/\.([a-z][a-z0-9-]*)(__|--|\s|,|\{|:)/)
    if (m) return m[1]
  }
  return null
}

// PURE: rewrite BEM prefix (block, __element, --modifier all included) plus {{card_id}} tokens.
// We ONLY rewrite whole-word occurrences of the prefix; a class like `hero-2` is NEVER matched
// as `hero` + trailing `-2` (that would collide with third-party classes the card references).
// The pattern accepts an optional BEM suffix (__x / --x) OR a word boundary.
export function applyReplacements(text, { cardId, sectionName, oldPrefix, newPrefix }) {
  let out = String(text ?? '')
  if (cardId) {
    // {{card_id}}, {{ card_id }}, {{  card-id  }} — Liquid-ish placeholder families
    out = out.replace(/\{\{\s*card[_-]?id\s*\}\}/g, sectionName)
  }
  if (oldPrefix && newPrefix && oldPrefix !== newPrefix) {
    const esc = oldPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    // Class-name context: preceded by `.`, `"`, `'`, whitespace, `=`; suffixed by __x / --x /
    // boundary. This keeps `some-other-class` untouched even if the prefix appears mid-word.
    const re = new RegExp(`(^|[.\\s"'=\`(])${esc}(__[a-z0-9-]+|--[a-z0-9-]+|\\b)`, 'g')
    out = out.replace(re, (_m, pre, tail) => `${pre}${newPrefix}${tail}`)
  }
  return out
}

// ── schema handling ──────────────────────────────────────────────────────────
// The schema JSON is preserved verbatim except for `name` (→ section name, human readable) and
// any `id` fields (namespaced when a --namespace was passed). settings/blocks/presets stay
// exactly as the card authored them — that is the "structure banked" contract cards carry.
export function normalizeSchema(rawJson, { sectionName, namespace }) {
  let obj
  try { obj = JSON.parse(rawJson) } catch (e) {
    throw new Error(`card schema JSON did not parse: ${e.message}`)
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    obj.name = titleCase(sectionName)
    if (namespace) obj = namespaceIds(obj, namespace)
  }
  return obj
}

function namespaceIds(node, ns) {
  if (Array.isArray(node)) return node.map(v => namespaceIds(v, ns))
  if (!node || typeof node !== 'object') return node
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'id' && typeof v === 'string' && !v.startsWith(`${ns}_`)) out[k] = `${ns}_${v}`
    else out[k] = namespaceIds(v, ns)
  }
  return out
}

const titleCase = (kebab) => String(kebab).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

// PURE: assemble the final section.liquid text — the markup, an optional stylesheet asset link,
// and either the card's schema block (verbatim, with normalized name/id) or a minimal placeholder
// that keeps the file a valid Shopify section without lying about settings the card never
// declared. We never invent settings — an authored schema is stitch/loom's job.
export function buildLiquidSection({ markup, sectionName, cssAssetName, schema }) {
  const parts = []
  if (cssAssetName) parts.push(`{{ '${cssAssetName}' | asset_url | stylesheet_tag }}`)
  parts.push(String(markup ?? '').trimEnd())
  const schemaObj = schema ?? { name: titleCase(sectionName), settings: [], presets: [{ name: titleCase(sectionName) }] }
  parts.push(`{% schema %}\n${JSON.stringify(schemaObj, null, 2)}\n{% endschema %}\n`)
  return parts.join('\n')
}

// PURE: a minimal template-inclusion snippet — the section reference, not a full template.
// stitch/loom splices this into the real templates/index.json (or wherever) once they have chosen
// the surface; we refuse to guess the target template.
export function buildTemplateSnippet({ sectionName, filename, schema }) {
  const type = filename.replace(/\.liquid$/, '')
  const settings = {}
  if (schema && Array.isArray(schema.settings)) {
    for (const s of schema.settings) {
      if (s && typeof s === 'object' && 'id' in s && 'default' in s) settings[s.id] = s.default
    }
  }
  return {
    __note: `library-scaffold: reference snippet — splice into the real template (e.g. templates/index.json). Never commit this folder to production.`,
    section: { type, settings },
    key: sectionName,
  }
}

// ── writes ───────────────────────────────────────────────────────────────────
// Atomic write: temp file in the same dir, then rename. A partial write on ENOSPC/EACCES would
// otherwise leave a truncated section.liquid that theme-check parses as broken — worse than
// leaving the file untouched.
function atomicWrite(abs, text) {
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, abs)
}

function isThemeRepo(cwd) {
  return fs.existsSync(path.join(cwd, 'sections')) &&
    (fs.existsSync(path.join(cwd, 'config', 'settings_schema.json')) || fs.existsSync(path.join(cwd, 'layout', 'theme.liquid')))
}

// ── audit ────────────────────────────────────────────────────────────────────
// The library lives in Polyglot memory (~/.claude/memory/design/ecom/component-library-premium/) —
// NEVER in a client repo. Clients import ONLY what they use. Drift = a client repo that has
// pulled dozens of cards; the library was meant to stay central. --audit surfaces that drift
// by listing every card a repo has imported, so it can be pruned back to what templates actually
// reference. A card is "imported" when either the marker comment written by scaffold is present,
// or the section basename kebab-matches a library card id (fallback for pre-marker imports).

export function scanImportedCards(cwd, libraryRoot = LIBRARY_ROOT) {
  const sectionsDir = path.join(cwd, 'sections')
  if (!fs.existsSync(sectionsDir)) return []
  const cardIds = new Set()
  if (fs.existsSync(libraryRoot)) {
    for (const cat of fs.readdirSync(libraryRoot)) {
      const catDir = path.join(libraryRoot, cat)
      let stat
      try { stat = fs.statSync(catDir) } catch { continue }
      if (!stat.isDirectory()) continue
      for (const f of fs.readdirSync(catDir)) {
        if (f.endsWith('.md')) cardIds.add(f.slice(0, -3))
      }
    }
  }
  const rows = []
  for (const f of fs.readdirSync(sectionsDir)) {
    if (!f.endsWith('.liquid')) continue
    const abs = path.join(sectionsDir, f)
    let head = ''
    try { head = fs.readFileSync(abs, 'utf-8').slice(0, 500) } catch { continue }
    const marker = head.match(/\{%\s*comment\s*%\}\s*library-source:\s*([a-z0-9-]+)\s+imported\s+([0-9T:.Z+-]+)/i)
    if (marker) {
      rows.push({ card: marker[1], file: f, importedAt: marker[2], source: 'marker' })
      continue
    }
    const base = f.replace(/\.liquid$/, '')
    // Section files may carry an optional namespace prefix (e.g. `bt-hero.liquid`); try both.
    const stripped = base.replace(/^[a-z][a-z0-9]{0,2}-/, '')
    const hit = cardIds.has(base) ? base : (cardIds.has(stripped) ? stripped : null)
    if (hit) rows.push({ card: hit, file: f, importedAt: gitFirstTouch(cwd, `sections/${f}`), source: 'name-match' })
  }
  return rows
}

function gitFirstTouch(cwd, rel) {
  try {
    const out = execSync(`git log --diff-filter=A --follow --format=%aI -- ${JSON.stringify(rel)}`, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const lines = out.split('\n').filter(Boolean)
    return lines[lines.length - 1] || null
  } catch { return null }
}

function templatesUsingSection(cwd, sectionType) {
  const templatesDir = path.join(cwd, 'templates')
  if (!fs.existsSync(templatesDir)) return []
  const uses = []
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const abs = path.join(dir, f)
      let stat
      try { stat = fs.statSync(abs) } catch { continue }
      if (stat.isDirectory()) { walk(abs); continue }
      if (!f.endsWith('.json')) continue
      let text = ''
      try { text = fs.readFileSync(abs, 'utf-8') } catch { continue }
      if (text.includes(`"type": "${sectionType}"`) || text.includes(`"type":"${sectionType}"`)) {
        uses.push(path.relative(cwd, abs))
      }
    }
  }
  walk(templatesDir)
  return uses
}

function runAudit(cwd) {
  if (!isThemeRepo(cwd)) die(`${cwd} is not a theme repo — expected sections/ plus config/settings_schema.json or layout/theme.liquid`)
  const rows = scanImportedCards(cwd)
  console.log(`library-scaffold: audit of ${cwd}`)
  console.log(`  library root: ${LIBRARY_ROOT}`)
  console.log(`  imported cards: ${rows.length}`)
  if (rows.length === 0) { console.log(`  (none)`); process.exit(0) }
  const enriched = rows.map(r => {
    const type = r.file.replace(/\.liquid$/, '')
    const uses = templatesUsingSection(cwd, type)
    return { ...r, uses: uses.length ? uses.join(', ') : '(unused)' }
  })
  const maxCard = Math.max('cardId'.length, ...enriched.map(r => r.card.length))
  const maxFile = Math.max('section-file'.length, ...enriched.map(r => r.file.length))
  const maxDate = Math.max('imported-at'.length, ...enriched.map(r => (r.importedAt || '—').length))
  const pad = (s, n) => String(s).padEnd(n, ' ')
  console.log()
  console.log(`  ${pad('cardId', maxCard)}  ${pad('section-file', maxFile)}  ${pad('imported-at', maxDate)}  used-by-templates`)
  console.log(`  ${'-'.repeat(maxCard)}  ${'-'.repeat(maxFile)}  ${'-'.repeat(maxDate)}  -----------------`)
  for (const r of enriched) {
    console.log(`  ${pad(r.card, maxCard)}  ${pad(r.file, maxFile)}  ${pad(r.importedAt || '—', maxDate)}  ${r.uses}`)
  }
  console.log()
  if (rows.length > 20) {
    console.error(`library-scaffold: WARNING — this repo has imported ${rows.length} library cards. The library is meant to live in Polyglot memory — clients import ONLY what they use. Investigate drift.`)
  }
  process.exit(0)
}

// ── main ─────────────────────────────────────────────────────────────────────
const USAGE = `Usage: node library-scaffold.mjs --card <cardId> --into <section-name> [--namespace <prefix>] [--dry-run] [--force]
       node library-scaffold.mjs --audit`

function main() {
  let o
  try { o = parseArgs(process.argv.slice(2)) } catch (e) { refuse(`${e.message}\n${USAGE}`) }
  if (o.help) { console.log(USAGE); process.exit(0) }

  if (o.audit) return runAudit(process.cwd())

  // Refuse bulk imports. The library is meant to live in Polyglot memory (~/.claude/memory/design/
  // ecom/component-library-premium/) — clients import ONLY what they use, one card per invocation.
  // A comma-separated --card list is not supported and never will be; anything that would pull >5
  // cards in one command is rejected regardless of syntax. Run once per card, or --audit first.
  if (o.card && o.card.includes(',')) {
    const list = o.card.split(',').map(s => s.trim()).filter(Boolean)
    refuse(`--card takes ONE card id, not a comma-separated list (you passed ${list.length}). The library lives centrally in Polyglot memory; clients import ONLY what they use. Bulk imports (>5 cards in one command) are refused — run one card at a time, and use --audit to inspect what's already imported.`)
  }

  if (!o.card) refuse(`--card is required (id of a file under ${LIBRARY_ROOT})\n${USAGE}`)
  if (!o.into) refuse(`--into is required (kebab-case section name)\n${USAGE}`)
  if (!NAME_RE.test(o.into)) refuse(`--into "${o.into}" must be kebab-case (${NAME_RE})`)
  if (o.namespace && !NAME_RE.test(o.namespace)) refuse(`--namespace "${o.namespace}" must be kebab-case (${NAME_RE})`)

  const cwd = process.cwd()
  if (!isThemeRepo(cwd)) die(`${cwd} is not a theme repo — expected sections/ plus config/settings_schema.json or layout/theme.liquid`)

  const { path: cardPath, tried } = findCardPath(o.card)
  if (!cardPath) {
    console.error(`library-scaffold: card "${o.card}" not found. Searched:`)
    for (const p of tried) console.error(`  ${p}`)
    console.error(`  Library root: ${LIBRARY_ROOT}`)
    console.error(`  List categories: ls ${LIBRARY_ROOT}`)
    process.exit(2)
  }

  const md = fs.readFileSync(cardPath, 'utf-8')
  const blocks = parseFencedBlocks(md)
  if (!blocks.markup) die(`card ${o.card} has no \`\`\`liquid or \`\`\`html fenced block — nothing to instantiate (${cardPath})`)

  // Class-prefix rewrite: default new prefix = section name, overridden by --namespace.
  const oldPrefix = detectBemPrefix(blocks.markup, blocks.css)
  const newPrefix = o.namespace || o.into

  const rewrittenMarkup = applyReplacements(blocks.markup, { cardId: o.card, sectionName: o.into, oldPrefix, newPrefix })
  const rewrittenCss = blocks.css ? applyReplacements(blocks.css, { cardId: o.card, sectionName: o.into, oldPrefix, newPrefix }) : null

  // Filename prefix: only when --namespace given (so the default flow writes clean `hero.liquid`).
  const filePrefix = o.namespace ? `${o.namespace}-` : ''
  const sectionFile = `${filePrefix}${o.into}.liquid`
  const cssFile = `${filePrefix}${o.into}.css`
  const templateFile = `${filePrefix}${o.into}.section.json`

  let schemaObj = null
  let schemaWarn = null
  if (blocks.json) {
    try { schemaObj = normalizeSchema(blocks.json, { sectionName: o.into, namespace: o.namespace }) }
    catch (e) { die(e.message) }
  } else {
    schemaWarn = `card has no \`\`\`json schema block — writing .liquid + .css only; a minimal placeholder schema is embedded so the section still loads. Add explicit settings via new-section or hand-authored schema when you promote this beyond a scaffold.`
  }

  // Marker comment — how --audit and future tools recognize a library-imported section without
  // guessing from the filename. ISO-8601 UTC so the audit's imported-at column is stable across
  // machines and cheap to parse. Kept as a Liquid `{% comment %}` (not HTML) so it never ships to
  // the rendered page even if the section is used above the fold.
  const librarySourceComment = `{% comment %} library-source: ${o.card} imported ${new Date().toISOString()} {% endcomment %}\n`
  const sectionText = librarySourceComment + buildLiquidSection({
    markup: rewrittenMarkup,
    sectionName: o.into,
    cssAssetName: rewrittenCss ? cssFile : null,
    schema: schemaObj,
  })

  // Refuse-on-collision. This is the same guard new-section.mjs enforces — silently overwriting
  // an authored section is the worst failure mode (agents lose work AND the loss is invisible).
  const sectionAbs = path.join(cwd, 'sections', sectionFile)
  if (fs.existsSync(sectionAbs) && !o.force) {
    console.error(`library-scaffold: sections/${sectionFile} already exists — pass --force to overwrite`)
    process.exit(1)
  }
  const cssAbs = rewrittenCss ? path.join(cwd, 'assets', cssFile) : null
  if (cssAbs && fs.existsSync(cssAbs) && !o.force) {
    console.error(`library-scaffold: assets/${cssFile} already exists — pass --force to overwrite`)
    process.exit(1)
  }
  const templateAbs = schemaObj ? path.join(cwd, 'templates', '_scaffold', templateFile) : null
  // template snippet is under _scaffold/ — collisions there are harmless to overwrite (it is a
  // reference artifact, never the live template), but we still respect --force for symmetry.
  if (templateAbs && fs.existsSync(templateAbs) && !o.force) {
    console.error(`library-scaffold: templates/_scaffold/${templateFile} already exists — pass --force to overwrite`)
    process.exit(1)
  }

  const writes = [{ rel: `sections/${sectionFile}`, abs: sectionAbs, text: sectionText }]
  if (cssAbs) writes.push({ rel: `assets/${cssFile}`, abs: cssAbs, text: rewrittenCss })
  if (templateAbs) writes.push({ rel: `templates/_scaffold/${templateFile}`, abs: templateAbs, text: `${JSON.stringify(buildTemplateSnippet({ sectionName: o.into, filename: sectionFile, schema: schemaObj }), null, 2)}\n` })

  if (o.dryRun) {
    console.log(`library-scaffold: DRY RUN — ${o.card} → ${o.into}${o.namespace ? ` (namespace: ${o.namespace})` : ''}`)
    console.log(`  card:       ${cardPath}`)
    console.log(`  BEM prefix: ${oldPrefix ?? '(none detected)'} → ${newPrefix}`)
    for (const w of writes) console.log(`  would write ${w.rel}  (${Buffer.byteLength(w.text, 'utf-8')} bytes)`)
    if (schemaWarn) console.log(`  warn: ${schemaWarn}`)
    process.exit(0)
  }

  for (const w of writes) atomicWrite(w.abs, w.text)

  console.log(`library-scaffold: WROTE ${o.into} from ${o.card}${o.namespace ? ` (namespace: ${o.namespace})` : ''}`)
  console.log(`  card:       ${cardPath}`)
  console.log(`  BEM prefix: ${oldPrefix ?? '(none detected)'} → ${newPrefix}`)
  for (const w of writes) console.log(`  ${w.rel}`)
  if (schemaWarn) console.log(`  warn: ${schemaWarn}`)
  if (templateAbs) console.log(`  next: splice templates/_scaffold/${templateFile} into the real template (e.g. templates/index.json), then delete the _scaffold copy.`)
  console.log(`  next: add "${o.into}" to section-reuse-map.md and CHANGES.md.`)
  process.exit(0)
}

if (isMain(import.meta.url)) main()
