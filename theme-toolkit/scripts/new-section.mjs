#!/usr/bin/env node
// Boldteq section scaffold — the blank page that already knows the platform conventions.
//
// WHY THIS EXISTS (measured root cause RC3, cravinbyandy 2026-07):
// the team writes CORRECT Shopify code when EDITING a Dawn file — 41-68 `t:` translation keys per
// file, `image_url`/`image_tag`, `{%- if x != blank -%}` guards, alignment as a modifier class —
// and WRONG code when AUTHORING a new section: 16 hand-authored sections produced 0 `t:` keys and
// ~221 raw English `label` strings. `shopify theme check` passes on all of it. The convention was
// never learned; it was being COPIED from whatever file happened to be open. So a new file, which
// has nothing to copy from, gets none of it. This scaffold moves the convention into the blank page
// and — critically — writes the `t:` keys into every `locales/*.schema.json` in the same run, which
// is the step that never happens by hand.
//
// It is a generator, not a gate: it writes no gate report and takes no BASE_REF.
//
// Usage:
//   node toolkit/scripts/new-section.mjs --name story-panel --role "Story panel"
//   node toolkit/scripts/new-section.mjs --name value-props --role "Value props" --blocks item --image
//   node toolkit/scripts/new-section.mjs --name story-panel --role "Story panel" --dry-run
//
//   --name <kebab>    file/type name; ^[a-z][a-z0-9-]*$
//   --role "<Role>"   ROLE-based picker name. Content-specific names (possessives, "Meet <Name>",
//                     "Our <X>", an embedded personal name) are REJECTED — see STD-NAME-01.
//   --blocks <type>   emit a repeatable block + a {% for block in section.blocks %} loop
//   --image           emit an image_picker + a placeholder_svg_tag empty state
//   --force           overwrite an existing section
//   --dry-run         print the plan, write nothing
//
// Env:
//   TEMPLATE_DIR      default <toolkit>/templates/section
//
// Exit: 0 = written · 1 = refusal / validation failure · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = process.env.TEMPLATE_DIR || path.resolve(HERE, '..', 'templates', 'section')

const NAME_RE = /^[a-z][a-z0-9-]*$/
const BLOCK_RE = /^[a-z][a-z0-9_-]*$/
// keys whose VALUE is merchant-facing chrome and must therefore be a translation key
const TRANSLATABLE = new Set(['label', 'info', 'content', 'name'])

class Refusal extends Error {}
class EnvError extends Error {}

// ── argv ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { blocks: null, image: false, force: false, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const val = () => {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw new Refusal(`${a} needs a value`)
      i += 1
      return v
    }
    if (a === '--name') out.name = val()
    else if (a === '--role') out.role = val()
    else if (a === '--blocks') out.blocks = val()
    // --image takes an optional numeric arg purely so `--image 1` reads naturally; any value is truthy
    else if (a === '--image') { out.image = true; if (argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1 }
    else if (a === '--force') out.force = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') out.help = true
    else throw new Refusal(`unknown argument: ${a}`)
  }
  return out
}

// ── STD-NAME-01: the Add-section picker lists a ROLE, not this store's content ─
// A section named for its current content ("Meet Andy") is un-reusable the moment the content
// changes, and it teaches the next merchant that sections are one-offs. Four measurable shapes.
function roleProblem(role) {
  if (!role || !role.trim()) return 'empty'
  if (role.length > 40) return 'longer than 40 characters — a picker label, not a sentence'
  if (/['’]s\b/i.test(role)) return 'possessive ("…’s") — names one owner, not a role'
  if (/^\s*meet\b/i.test(role)) return '"Meet <someone>" names a person, not a role'
  if (/^\s*our\b/i.test(role)) return '"Our <x>" is this store\'s copy, not a role'
  const words = role.trim().split(/\s+/)
  // an ALL-CAPS token is an acronym (FAQ, USP, PDP, CTA), not a personal name
  const proper = words.slice(1).find(w => /^[A-Z][a-z]+$/.test(w))
  if (proper) return `"${proper}" is a capitalised name mid-label — roles are lowercase after the first word`
  return null
}

const titleCase = (kebab) => kebab.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase())

// ── template rendering ────────────────────────────────────────────────────────
// Line-form regions first (a line that is EXACTLY @@IF:FLAG@@ / @@ENDIF@@ drops whole lines), then
// inline pairs — that ordering matters: doing inline first would let a non-greedy inline match run
// across a line-form @@ENDIF@@ and swallow unrelated lines.
function render(tpl, vars, flags) {
  const out = []
  const stack = []
  for (const line of tpl.split('\n')) {
    const open = line.match(/^\s*@@IF:([A-Z_]+)@@\s*$/)
    if (open) { stack.push(flags[open[1]] === true); continue }
    if (/^\s*@@ENDIF@@\s*$/.test(line)) {
      if (stack.length === 0) throw new EnvError('template has an unmatched @@ENDIF@@')
      stack.pop()
      continue
    }
    if (stack.every(Boolean)) out.push(line)
  }
  if (stack.length > 0) throw new EnvError('template has an unclosed @@IF@@')

  let text = out.join('\n')
  text = text.replace(/@@IF:([A-Z_]+)@@([\s\S]*?)@@ENDIF@@/g, (_m, flag, body) => (flags[flag] === true ? body : ''))
  for (const [k, v] of Object.entries(vars)) text = text.split(`@@${k}@@`).join(v)
  const leftover = text.match(/@@[A-Z_:]+@@/)
  if (leftover) throw new EnvError(`template placeholder ${leftover[0]} was never substituted`)
  return text
}

function readTemplate(file) {
  const abs = path.join(TEMPLATE_DIR, file)
  if (!fs.existsSync(abs)) throw new EnvError(`template not found: ${abs}`)
  return fs.readFileSync(abs, 'utf-8')
}

// ── schema validation ─────────────────────────────────────────────────────────
function collectTranslatable(node, trail, hits) {
  if (Array.isArray(node)) { node.forEach((v, i) => collectTranslatable(v, [...trail, i], hits)); return }
  if (!node || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && TRANSLATABLE.has(k)) hits.push({ path: [...trail, k].join('.'), key: k, value: v })
    else collectTranslatable(v, [...trail, k], hits)
  }
}

// Shopify silently rejects a range whose default is not on the min + N*step grid (and whose span is
// not a whole number of steps) — the section then loads with NO padding controls at all.
function rangeProblems(schema) {
  const problems = []
  const walk = (list, where) => {
    for (const s of list || []) {
      if (s?.type !== 'range') continue
      const { min, max, step, default: def, id } = s
      const at = `${where}.${id ?? '(no id)'}`
      if (![min, max, step, def].every(Number.isFinite)) { problems.push(`${at}: range needs numeric min/max/step/default`); continue }
      if (step <= 0) { problems.push(`${at}: step must be > 0`); continue }
      const onGrid = (n) => Math.abs(Math.round((n - min) / step) - (n - min) / step) < 1e-9
      if (def < min || def > max) problems.push(`${at}: default ${def} is outside ${min}..${max}`)
      if (!onGrid(def)) problems.push(`${at}: default ${def} is not on the ${min} + N*${step} grid`)
      if (!onGrid(max)) problems.push(`${at}: max ${max} is not on the ${min} + N*${step} grid`)
    }
  }
  walk(schema.settings, 'settings')
  for (const b of schema.blocks || []) walk(b.settings, `blocks.${b.type}.settings`)
  return problems
}

function resolveKey(subtree, dotted) {
  let node = subtree
  for (const seg of dotted.split('.')) {
    if (!node || typeof node !== 'object' || !(seg in node)) return undefined
    node = node[seg]
  }
  return node
}

// ── locale files: surgical splice, never a reformat ───────────────────────────
// Dawn ships every *.schema.json with a leading /* … */ banner and 1000+ ordered keys. Parsing and
// re-stringifying would reorder nothing but WOULD strip that banner and re-indent the whole file,
// producing a several-thousand-line diff for a nine-line addition. So: parse only to validate, and
// splice the new subtree into the raw text.
function readString(text, i) {
  let j = i + 1
  let out = ''
  while (j < text.length) {
    const c = text[j]
    if (c === '\\') { out += text[j + 1] ?? ''; j += 2; continue }
    if (c === '"') return { value: out, end: j + 1 }
    out += c
    j += 1
  }
  throw new EnvError('unterminated string')
}

// Direct members of the object whose body starts at bodyStart (the index just after its `{`).
function scanMembers(text, bodyStart) {
  const members = []
  let i = bodyStart
  let depth = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      const { value, end } = readString(text, i)
      if (depth === 0) {
        let j = end
        while (j < text.length && /\s/.test(text[j])) j += 1
        if (text[j] === ':') {
          let k = j + 1
          while (k < text.length && /\s/.test(text[k])) k += 1
          members.push({ key: value, valueStart: k })
        }
      }
      i = end
      continue
    }
    if (ch === '{' || ch === '[') { depth += 1; i += 1; continue }
    if (ch === '}' || ch === ']') {
      if (depth === 0) return { members, bodyEnd: i }
      depth -= 1
      i += 1
      continue
    }
    i += 1
  }
  throw new EnvError('unbalanced braces')
}

const stripBanner = (text) => text.replace(/^\s*\/\*[\s\S]*?\*\//, '')

function rootOpen(text) {
  const banner = text.match(/^\s*\/\*[\s\S]*?\*\//)
  const from = banner ? banner[0].length : 0
  const idx = text.indexOf('{', from)
  if (idx === -1) throw new EnvError('no JSON object found')
  return idx
}

const detectIndent = (text) => (text.match(/\n([ \t]+)"/)?.[1]) ?? '  '

function serialize(obj, unit, depth) {
  const pad = unit.repeat(depth)
  return JSON.stringify(obj, null, unit)
    .split('\n')
    .map((l, i) => (i === 0 ? l : pad + l))
    .join('\n')
}

// → { text, changed }. Idempotent: an existing sections.<name> is left exactly as-is.
function spliceSection(text, name, subtree) {
  const unit = detectIndent(text)
  const root = scanMembers(text, rootOpen(text) + 1)
  const sections = root.members.find(m => m.key === 'sections')

  if (!sections) {
    const block = `${unit}"sections": {\n${unit.repeat(2)}${JSON.stringify(name)}: ${serialize(subtree, unit, 2)}\n${unit}}`
    const head = text.slice(0, root.bodyEnd).replace(/\s*$/, '')
    const comma = root.members.length > 0 ? ',' : ''
    return { text: `${head}${comma}\n${block}\n${text.slice(root.bodyEnd)}`, changed: true }
  }
  if (text[sections.valueStart] !== '{') throw new EnvError('"sections" is not an object')

  const bodyStart = sections.valueStart + 1
  const scan = scanMembers(text, bodyStart)
  if (scan.members.some(m => m.key === name)) return { text, changed: false }

  const block = `${unit.repeat(2)}${JSON.stringify(name)}: ${serialize(subtree, unit, 2)}`
  if (scan.members.length === 0) {
    return { text: `${text.slice(0, bodyStart)}\n${block}\n${unit}${text.slice(scan.bodyEnd)}`, changed: true }
  }
  return { text: `${text.slice(0, bodyStart)}\n${block},${text.slice(bodyStart)}`, changed: true }
}

// ── main ──────────────────────────────────────────────────────────────────────
const USAGE = `Usage: node new-section.mjs --name <kebab> --role "<Role>" [--blocks <type>] [--image] [--force] [--dry-run]`

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { console.log(USAGE); return 0 }

  const cwd = process.cwd()

  if (!args.name) throw new Refusal(`--name is required\n${USAGE}`)
  if (!NAME_RE.test(args.name)) throw new Refusal(`--name "${args.name}" must be kebab-case (${NAME_RE})`)
  if (!args.role) throw new Refusal(`--role is required\n${USAGE}`)

  const problem = roleProblem(args.role)
  if (problem) {
    throw new Refusal(
      `STD-NAME-01: --role "${args.role}" is content-specific — ${problem}.\n` +
      `  The Add-section picker lists a ROLE the merchant can reuse, not this store's current copy.\n` +
      `  Put the person/brand in the section's SETTINGS (heading, image); keep the role in --role.\n` +
      `  Try: --role "${titleCase(args.name)}"`
    )
  }
  if (args.blocks !== null && !BLOCK_RE.test(args.blocks)) {
    throw new Refusal(`--blocks "${args.blocks}" must be a lowercase block type (${BLOCK_RE})`)
  }

  const isTheme = fs.existsSync(path.join(cwd, 'sections')) &&
    (fs.existsSync(path.join(cwd, 'config', 'settings_schema.json')) || fs.existsSync(path.join(cwd, 'layout', 'theme.liquid')))
  if (!isTheme) {
    throw new Refusal(`${cwd} is not a theme repo — expected sections/ plus config/settings_schema.json or layout/theme.liquid`)
  }

  const sectionPath = path.join('sections', `${args.name}.liquid`)
  const cssPath = path.join('assets', `section-${args.name}.css`)
  if (fs.existsSync(path.join(cwd, sectionPath)) && !args.force) {
    throw new Refusal(`${sectionPath} already exists — pass --force to overwrite`)
  }

  const flags = { IMAGE: args.image === true, BLOCKS: args.blocks !== null }
  const vars = {
    NAME: args.name,
    ROLE: args.role.trim(),
    BLOCK: args.blocks ?? '',
    BLOCK_LABEL: args.blocks ? titleCase(args.blocks) : '',
  }

  // 1. render + validate the schema BEFORE anything is written
  const schemaText = render(readTemplate('schema.json.tpl'), vars, flags)
  let schema
  try { schema = JSON.parse(schemaText) } catch (e) { throw new EnvError(`schema.json.tpl did not render valid JSON: ${e.message}`) }

  const localeText = render(readTemplate('locale.schema.json.tpl'), vars, flags)
  let localeSubtree
  try { localeSubtree = JSON.parse(localeText) } catch (e) { throw new EnvError(`locale.schema.json.tpl did not render valid JSON: ${e.message}`) }

  const gridProblems = rangeProblems(schema)
  if (gridProblems.length) throw new EnvError(`range settings are invalid:\n  ${gridProblems.join('\n  ')}`)

  const hits = []
  collectTranslatable(schema, [], hits)
  const raw = hits.filter(h => !h.value.startsWith('t:'))
  if (raw.length) throw new EnvError(`schema has untranslated ${raw.map(h => `${h.path}="${h.value}"`).join(', ')}`)

  const prefix = `t:sections.${args.name}.`
  const unresolved = []
  for (const h of hits) {
    if (!h.value.startsWith(prefix)) { unresolved.push(`${h.value} (not under ${prefix})`); continue }
    const resolved = resolveKey(localeSubtree, h.value.slice(prefix.length))
    if (typeof resolved !== 'string') unresolved.push(`${h.value} has no string in locale.schema.json.tpl`)
  }
  if (unresolved.length) throw new EnvError(`translation keys do not resolve:\n  ${unresolved.join('\n  ')}`)

  // 2. compute every locale file's new text in memory; a single parse failure aborts the whole run
  const localesDir = path.join(cwd, 'locales')
  const localeFiles = fs.existsSync(localesDir)
    ? fs.readdirSync(localesDir).filter(f => f.endsWith('.schema.json')).sort()
    : []
  if (!fs.existsSync(path.join(localesDir, 'en.default.schema.json'))) localeFiles.unshift('en.default.schema.json')

  const writes = []
  const skipped = []
  for (const file of localeFiles) {
    const abs = path.join(localesDir, file)
    let current = '{\n}\n'
    if (fs.existsSync(abs)) {
      current = fs.readFileSync(abs, 'utf-8')
      try { JSON.parse(stripBanner(current)) } catch (e) { throw new EnvError(`locales/${file} is not valid JSON (${e.message}) — nothing was written`) }
    }
    const { text, changed } = spliceSection(current, args.name, localeSubtree)
    if (!changed) { skipped.push(`locales/${file}`); continue }
    try { JSON.parse(stripBanner(text)) } catch (e) { throw new EnvError(`splice into locales/${file} produced invalid JSON (${e.message}) — nothing was written`) }
    writes.push({ rel: path.join('locales', file), text })
  }

  const liquid = render(readTemplate('section.liquid.tpl'), { ...vars, SCHEMA: JSON.stringify(schema, null, 2) }, flags)
  const css = render(readTemplate('section.css.tpl'), vars, flags)
  writes.unshift({ rel: cssPath, text: css })
  writes.unshift({ rel: sectionPath, text: liquid })

  if (args.dryRun) {
    console.log(`new-section: DRY RUN — ${args.name} ("${vars.ROLE}")${flags.BLOCKS ? ` blocks:${vars.BLOCK}` : ''}${flags.IMAGE ? ' image' : ''}`)
    for (const w of writes) console.log(`  would write  ${w.rel}`)
    for (const s of skipped) console.log(`  unchanged    ${s} (key already present)`)
    return 0
  }

  // 3. write
  for (const w of writes) {
    const abs = path.join(cwd, w.rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, w.text)
  }

  console.log(`new-section: WROTE ${args.name} ("${vars.ROLE}")${flags.BLOCKS ? ` blocks:${vars.BLOCK}` : ''}${flags.IMAGE ? ' image' : ''}`)
  for (const w of writes) console.log(`  ${w.rel}`)
  for (const s of skipped) console.log(`  unchanged ${s} (key already present)`)
  const nonDefault = writes.filter(w => w.rel.startsWith('locales/') && !w.rel.endsWith('en.default.schema.json'))
  if (nonDefault.length) console.log(`  note: ${nonDefault.length} non-default locale(s) got the English strings — they resolve now, translate later.`)
  console.log(`  next: add "${args.name}" to section-reuse-map.md and to CHANGES.md`)
  return 0
}

try {
  process.exit(main())
} catch (e) {
  if (e instanceof Refusal) { console.error(`new-section: REFUSED — ${e.message}`); process.exit(1) }
  console.error(`new-section: ENV-ERROR — ${e.message}`)
  process.exit(2)
}
