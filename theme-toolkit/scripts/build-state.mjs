#!/usr/bin/env node
// build-state — the Maestro's CARRIED MEMORY (maestro-build-protocol.md §2). The substitute for a
// persistent context: the orchestrating session re-reads + updates this each surface iteration so
// the 7th section inherits the 1st section's decisions (kills "section A ≠ section B" drift).
//
// Source of truth = docs/build-state.json (machine, deterministic). Human/context view =
// docs/build-state.md (rendered from the JSON). Same split as the gates (.json + .md companion).
//
//   node build-state.mjs init [--surfaces home,pdp,…]
//       seed from docs/discovery/goals.json + docs/design/design-system.json + brand-direction.md
//       (+ docs/brand/client-overrides.md decisions). PRESERVES recorded surfaces/decisions on re-run.
//   node build-state.mjs record <surface> <PASS|WIP|FAIL> [--rounds N] [--note "..."] [--decision "..."]
//       update one surface's verdict; --decision appends a cross-surface coherence rule.
//   node build-state.mjs show          print build-state.md
//
// Env: BUILD_STATE_DIR (docs) · GOALS_FILE · DS_FILE · BRAND_FILE · OVERRIDES_FILE
// Exit: 0 = ok · 1 = usage/validation error · 2 = env error (missing inputs on init)

import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const DIR = process.env.BUILD_STATE_DIR || 'docs'
const JSON_PATH = path.resolve(cwd, DIR, 'build-state.json')
const MD_PATH = path.resolve(cwd, DIR, 'build-state.md')
const GOALS = process.env.GOALS_FILE || 'docs/discovery/goals.json'
const DS = process.env.DS_FILE || 'docs/design/design-system.json'
const BRAND = process.env.BRAND_FILE || 'docs/design/brand-direction.md'
const OVERRIDES = process.env.OVERRIDES_FILE || 'docs/brand/client-overrides.md'
const DEFAULT_SURFACES = ['home', 'collection', 'pdp', 'cart', 'search', 'account']
const VERDICTS = new Set(['PASS', 'WIP', 'FAIL'])

const die = (code, msg) => { console.error(`build-state: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const readText = (p) => { try { return fs.readFileSync(p, 'utf-8') } catch { return null } }

// Compact design-system summary — tolerant of the rich contract shape (typography.fonts.*,
// spacing.scale, color_schemes) AND the minimal shape (type.fonts, tokens.color).
function dsSummary(ds) {
  if (!ds || typeof ds !== 'object') return null
  const typ = ds.typography || ds.type || {}
  const fonts = typ.fonts || ds.fonts || {}
  const heading = fonts.heading?.family || fonts.heading || null
  const body = fonts.body?.family || fonts.body || null
  const accentFont = fonts.accent?.family || fonts.accent || null
  const ratio = typ.scale?.ratio || ds.type?.scale?.ratio || typ.ratio || null
  const colors = ds.color || ds.colors || ds.tokens?.color || {}
  const accent = colors.accent || (Array.isArray(ds.color_schemes) ? null : null)
  const schemes = Array.isArray(ds.color_schemes) ? ds.color_schemes.length : (ds.color_schemes ? Object.keys(ds.color_schemes).length : null)
  const spacing = Array.isArray(ds.spacing?.scale) ? ds.spacing.scale : (Array.isArray(ds.spacing) ? ds.spacing : null)
  return {
    heading, body, accentFont, typeRatio: ratio,
    accent: typeof accent === 'string' ? accent : (accent?.value || null),
    colorSchemes: schemes, spacingScale: spacing,
  }
}

function brandSummary(text) {
  if (!text) return null
  // first non-heading, non-empty line = the brand one-liner
  const line = text.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !l.startsWith('>'))
  return line ? line.slice(0, 160) : null
}

// Seed cross-surface decisions from client-overrides.md json blocks (forbid/pin/require rules).
function overrideDecisions(text) {
  if (!text) return []
  const out = []
  const re = /```json\s*([\s\S]*?)```/g
  let m
  while ((m = re.exec(text))) {
    const obj = (() => { try { return JSON.parse(m[1]) } catch { return null } })()
    if (!obj) continue
    for (const o of (Array.isArray(obj) ? obj : [obj])) {
      if (o.rule === 'forbid-section-pattern' && o.pattern) out.push(`never ${o.pattern}${o.reason ? ` (${o.reason})` : ''}`)
      else if (o.rule === 'forbid-text' && o.text) out.push(`never say "${o.text}"`)
      else if (o.rule === 'pin-design-system' && o.field) out.push(`pinned: ${o.field}=${o.value ?? ''}`)
      else if (o.rule === 'require-section' && o.pattern) out.push(`always include ${o.pattern}`)
    }
  }
  return out
}

function load() { return readJson(JSON_PATH) || null }

function render(state) {
  const L = [`# Build State — ${state.client || 'unnamed'}${state.niche ? ` (${state.niche})` : ''}   ·  updated ${state.updated}`, '']
  const d = state.designSystem
  L.push('## Design system (the floor every surface binds to)')
  if (d) L.push(`accent: ${d.accent || '—'}  ·  heading: ${d.heading || '—'} / body: ${d.body || '—'}  ·  type-ratio: ${d.typeRatio || '—'}  ·  schemes: ${d.colorSchemes ?? '—'}  ·  spacing: ${d.spacingScale ? `[${d.spacingScale.join(',')}]` : '—'}  → ${DS}`)
  else L.push(`_design-system.json not found at ${DS} — run gate #0.5 / drape before build._`)
  if (state.brand) L.push('', `**Brand:** ${state.brand}`)
  L.push('', '## Surfaces')
  L.push('| surface | status | lens | rounds | notes |', '|---|---|---|---|---|')
  for (const s of state.surfaces) L.push(`| ${s.surface} | ${s.status} | ${s.lens || '—'} | ${s.rounds ?? 0} | ${s.note || ''} |`)
  L.push('', '## Cross-surface decisions (the coherence ledger — every surface reads this before drafting)')
  if (state.decisions.length) for (const x of state.decisions) L.push(`- ${x}`)
  else L.push('_none yet — add with `record <surface> <verdict> --decision "…"`_')
  L.push('')
  return `${L.join('\n')}\n`
}

function save(state) {
  state.updated = state.updated || '(stamp after run)'
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true })
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(state, null, 2)}\n`)
  fs.writeFileSync(MD_PATH, render(state))
}

// NOTE: timestamp is intentionally NOT Date.now() (unavailable in some sandboxes + breaks determinism
// in tests). Caller stamps via BUILD_STATE_TS, else a stable placeholder.
const stamp = () => process.env.BUILD_STATE_TS || 'pending'

function cmdInit(args) {
  const goals = readJson(path.resolve(cwd, GOALS))
  const ds = readJson(path.resolve(cwd, DS))
  const brand = readText(path.resolve(cwd, BRAND))
  if (!goals && !ds && !brand) die(2, `no inputs found (looked for ${GOALS}, ${DS}, ${BRAND}) — run discovery (#0.4) + drape (#0.5) first.`)

  const surfacesArg = args.surfaces ? args.surfaces.split(',').map(s => s.trim()).filter(Boolean) : null
  const surfaceNames = surfacesArg || DEFAULT_SURFACES
  const existing = load()
  const prevBySurface = new Map((existing?.surfaces || []).map(s => [s.surface, s]))

  const priority = Array.isArray(goals?.conversion?.priority_surfaces) ? goals.conversion.priority_surfaces : []
  const decisions = new Set([...(existing?.decisions || []), ...overrideDecisions(readText(path.resolve(cwd, OVERRIDES)))])
  if (priority.length) decisions.add(`priority surfaces (optimize first): ${priority.join(', ')}`)

  const state = {
    client: existing?.client || process.env.BUILD_STATE_CLIENT || path.basename(cwd),
    niche: existing?.niche || process.env.BUILD_STATE_NICHE || null,
    updated: stamp(),
    designSystem: dsSummary(ds),
    brand: brandSummary(brand) || existing?.brand || null,
    surfaces: surfaceNames.map(name => prevBySurface.get(name) || { surface: name, status: 'todo', lens: null, rounds: 0, note: '' }),
    decisions: [...decisions],
  }
  save(state)
  console.log(`build-state: init → ${path.relative(cwd, JSON_PATH)} (${state.surfaces.length} surfaces, ${state.decisions.length} decisions)`)
}

function cmdRecord(args) {
  const state = load()
  if (!state) die(1, 'no build-state.json — run `build-state init` first.')
  const surface = args._[0]
  const verdict = (args._[1] || '').toUpperCase()
  if (!surface) die(1, 'usage: record <surface> <PASS|WIP|FAIL> [--rounds N] [--note "…"] [--decision "…"]')
  if (!VERDICTS.has(verdict)) die(1, `verdict must be PASS|WIP|FAIL (got "${args._[1] || ''}")`)
  let row = state.surfaces.find(s => s.surface === surface)
  if (!row) { row = { surface, status: 'todo', lens: null, rounds: 0, note: '' }; state.surfaces.push(row) }
  row.status = verdict === 'PASS' ? 'done' : verdict === 'FAIL' ? 'blocked' : 'wip'
  row.lens = verdict
  if (args.rounds != null) row.rounds = Number(args.rounds)
  if (args.note != null) row.note = args.note
  if (args.decision) { if (!state.decisions.includes(args.decision)) state.decisions.push(args.decision) }
  state.updated = stamp()
  save(state)
  console.log(`build-state: ${surface} → ${verdict}${args.decision ? ' (+1 decision)' : ''}`)
}

function parse(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--surfaces') out.surfaces = argv[++i]
    else if (a === '--rounds') out.rounds = argv[++i]
    else if (a === '--note') out.note = argv[++i]
    else if (a === '--decision') out.decision = argv[++i]
    else out._.push(a)
  }
  return out
}

const [cmd, ...rest] = process.argv.slice(2)
const args = parse(rest)
if (cmd === 'init') cmdInit(args)
else if (cmd === 'record') cmdRecord(args)
else if (cmd === 'show') { const s = load(); if (!s) die(1, 'no build-state.json'); process.stdout.write(render(s)) }
else { console.log('usage: build-state.mjs <init|record|show> …'); process.exit(cmd ? 1 : 0) }
