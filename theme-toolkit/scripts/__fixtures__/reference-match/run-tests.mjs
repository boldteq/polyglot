// Hermetic fixture for gate #46 check-reference-match (L1 structural). PURE: exercises resolveEntry()
// against synthetic template sections — no vision, no store, no claude. The headline case is the real
// 2026-07-21 cravinbyandy failure: reference showed slideshow dots, build used image-banner, ~20 gates
// green. L1 must BLOCK that, while never false-blocking a legitimate custom section.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveEntry, TYPE_ARCHETYPE } from '../../check-reference-match.mjs'
import { upsertEntry } from '../../reference-ingest.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const S = (...types) => types.map((t, i) => ({ key: `s${i}`, type: t }))

console.log('case (a) THE REGRESSION — reference says slideshow, build uses image-banner → BLOCK')
{
  const r = resolveEntry({ name: 'hero', archetype: 'slideshow' }, S('image-banner', 'rich-text'))
  eq(r.kind, 'block', 'blocks the image-banner-for-slideshow build')
  eq(r.id, 'ref.archetype-absent', 'names it archetype-absent')
  const hasHint = /dots/i.test(r.detail)
  hasHint ? ok('detail carries the dots SIGNAL hint for the fixer') : bad(`no signal hint: ${r.detail}`)
}

console.log('case (b) pinned section with the wrong type → explicit mismatch')
{
  const r = resolveEntry({ name: 'hero', archetype: 'slideshow', section: 'image-banner' }, S('image-banner'))
  eq(r.kind, 'block', 'blocks')
  eq(r.id, 'ref.archetype-mismatch', 'names the pinned mismatch')
}

console.log('case (c) correct build → PASS')
{
  eq(resolveEntry({ name: 'hero', archetype: 'slideshow' }, S('slideshow', 'rich-text')).kind, 'pass', 'slideshow present → pass')
  eq(resolveEntry({ name: 'grid', archetype: 'collection-grid' }, S('main-collection-product-grid')).kind, 'pass', 'collection grid → pass')
  eq(resolveEntry({ name: 'hero', archetype: 'slideshow', section: 'slideshow' }, S('slideshow')).kind, 'pass', 'pinned + correct → pass')
}

console.log('case (d) NO FALSE BLOCKS — a custom section may implement the archetype')
{
  const r = resolveEntry({ name: 'hero', archetype: 'slideshow' }, S('cravin-hero-slider', 'rich-text'))
  eq(r.kind, 'warn', 'unrecognised custom type → warn, never block')
  eq(r.id, 'ref.archetype-unverifiable', 'names it unverifiable')
  const p = resolveEntry({ name: 'hero', archetype: 'slideshow', section: 'cravin-hero-slider' }, S('cravin-hero-slider'))
  eq(p.kind, 'warn', 'pinned custom type → warn, not a false block')
}

console.log('case (e) declared section that does not exist → BLOCK')
{
  const r = resolveEntry({ name: 'hero', archetype: 'slideshow', section: 'ghost-section' }, S('slideshow'))
  eq(r.kind, 'block', 'blocks')
  eq(r.id, 'ref.section-missing', 'names the missing section')
}

console.log('case (f) missing archetype is a read failure, not a pass')
{
  const r = resolveEntry({ name: 'hero' }, S('slideshow'))
  eq(r.kind, 'warn', 'no archetype → warn (the reference was never properly read)')
  eq(r.id, 'ref.no-archetype', 'names it')
}

console.log('case (g) archetype vocabulary is coherent with the type map')
{
  const mapped = new Set(Object.values(TYPE_ARCHETYPE))
  ;['slideshow', 'image-banner', 'collection-grid', 'accordion'].every(a => mapped.has(a))
    ? ok('load-bearing archetypes are all reachable from a known section type')
    : bad('an archetype has no section type mapped to it')
}

console.log('case (h) reference-ingest upsert keeps one row per (surface,name) and sorts by order')
{
  let m = upsertEntry({ surfaces: [] }, { surface: 'home', name: 'hero', archetype: 'image-banner', order: 1, reference: 'a.png' })
  m = upsertEntry(m, { surface: 'home', name: 'marquee', archetype: 'marquee', order: 2, reference: 'b.png' })
  m = upsertEntry(m, { surface: 'home', name: 'hero', archetype: 'slideshow', order: 1, reference: 'a.png' }) // corrected read
  const home = m.surfaces.find(s => s.surface === 'home')
  eq(home.sections.length, 2, 'no duplicate row for the same section')
  eq(home.sections[0].archetype, 'slideshow', 'a corrected read overwrites the old archetype')
  eq(home.sections[1].name, 'marquee', 'sorted by order')
}

// ── the gate's FILE-LEVEL blockers (QA-1: these 3 were unproven) ─────────────────────────
// resolveEntry() above is pure and well covered, but map-invalid / template-missing /
// template-invalid live in the main flow and had never been shown to fire. They matter: each one
// means the reference cannot be checked at all, so a build would sail past gate #46 unverified.
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-reference-match.mjs')
function runGate({ map, templates = {} }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refm-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'templates'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'reference-map.json'), typeof map === 'string' ? map : JSON.stringify(map))
  for (const [n, body] of Object.entries(templates)) fs.writeFileSync(path.join(d, 'templates', n), body)
  const reportDir = path.join(d, 'gate-reports')
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, REFERENCE_MATCH_ENFORCE: '1' } })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'reference-match.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) }
}
const ENTRY = { surfaces: [{ surface: 'home', sections: [{ order: 1, name: 'hero', archetype: 'slideshow' }] }] }

console.log('case (g) the reference map is not valid JSON → ref.map-invalid')
{
  const { ids } = runGate({ map: '{ "surfaces": [' })
  ids.has('ref.map-invalid') ? ok('unparseable map is blocked, not ignored') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (h) the map declares a surface with no template → ref.template-missing')
{
  const { ids } = runGate({ map: ENTRY }) // no templates/index.json written
  ids.has('ref.template-missing') ? ok('a reference for a page that does not exist is blocked') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (i) the template exists but is unparseable → ref.template-invalid')
{
  const { ids } = runGate({ map: ENTRY, templates: { 'index.json': '{ "sections": ' } })
  ids.has('ref.template-invalid') ? ok('an unparseable template is blocked') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (j) NO false blocks — a valid map + template resolves normally')
{
  const good = { 'index.json': JSON.stringify({ sections: { s1: { type: 'slideshow' } }, order: ['s1'] }) }
  const { ids } = runGate({ map: ENTRY, templates: good })
  const fileLevel = [...ids].filter(i => /map-invalid|template-missing|template-invalid/.test(i))
  fileLevel.length === 0 ? ok('a well-formed map + matching template raises none of the three') : bad(`false blocks: ${fileLevel.join(', ')}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
