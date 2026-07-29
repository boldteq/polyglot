// Hermetic fixture for gate #46 check-reference-match (L1 structural). PURE: exercises resolveEntry()
// against synthetic template sections — no vision, no store, no claude. The headline case is the real
// 2026-07-21 cravinbyandy failure: reference showed slideshow dots, build used image-banner, ~20 gates
// green. L1 must BLOCK that, while never false-blocking a legitimate custom section.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveEntry, TYPE_ARCHETYPE, resolveSectionKey, orderConformance, orderOf } from '../../check-reference-match.mjs'
import { upsertEntry, resolveSurface, PAGE_SURFACES } from '../../reference-ingest.mjs'

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

console.log('case (i) resolveSurface — a section name is remapped to its host page (synthetic-dogfood round 1)')
{
  // the exact round-1 defect: `--surface hero` must NOT stay "hero" (→ templates/hero.json → permanent
  // ref.template-missing). It resolves to home, where the hero section lives.
  const hero = resolveSurface('hero', { templateExists: () => false })
  eq(hero.surface, 'home', 'bare "hero" → home')
  eq(hero.remapped, true, 'flagged as remapped so the caller can tell the user')
  // real page surfaces pass straight through, untouched
  eq(resolveSurface('home').remapped, false, 'home is a page surface — not remapped')
  eq(resolveSurface('product').surface, 'product', 'product passes through')
  // common mis-scoped section-surfaces route to the right page
  eq(resolveSurface('pdp', { templateExists: () => false }).surface, 'product', 'pdp → product')
  eq(resolveSurface('plp', { templateExists: () => false }).surface, 'collection', 'plp → collection')
  // a REAL custom page (templates/page.about.json exists) is kept, never mistaken for a section
  eq(resolveSurface('about', { templateExists: (r) => r === 'templates/page.about.json' }).remapped, false, 'a real custom page is preserved')
  PAGE_SURFACES.includes('home') && PAGE_SURFACES.includes('product') ? ok('PAGE_SURFACES covers the load-bearing pages') : bad('PAGE_SURFACES missing a page')
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

// ── CB-23: global surfaces (header/footer) live in a section GROUP, not a page template ─────
function runGateGroups({ map, groups = {}, templates = {} }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refm-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'templates'), { recursive: true })
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'reference-map.json'), typeof map === 'string' ? map : JSON.stringify(map))
  for (const [n, body] of Object.entries(templates)) fs.writeFileSync(path.join(d, 'templates', n), body)
  for (const [n, body] of Object.entries(groups)) fs.writeFileSync(path.join(d, 'sections', n), body)
  const reportDir = path.join(d, 'gate-reports')
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, REFERENCE_MATCH_ENFORCE: '1' } })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'reference-match.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) }
}
const FOOTER_ENTRY = { surfaces: [{ surface: 'footer', sections: [{ order: 1, name: 'footer', archetype: 'rich-text' }] }] }

console.log('case (k) THE REGRESSION — footer lives in a section GROUP, not a page template → resolves, not a permanent block')
{
  const group = { 'footer-group.json': JSON.stringify({ type: 'footer-group', sections: { f1: { type: 'rich-text' } }, order: ['f1'] }) }
  const { ids } = runGateGroups({ map: FOOTER_ENTRY, groups: group })
  ids.has('ref.template-missing') ? bad(`footer group was not resolved — got [${[...ids].join(', ')}]`) : ok('sections/footer-group.json is found; no permanent template-missing block')
}

console.log('case (l) a NON-global surface with no page template still blocks (the fix is scoped, not a blanket group lookup)')
{
  const { ids } = runGateGroups({ map: ENTRY }) // surface "home" — no templates/index.json, no sections/home-group.json
  ids.has('ref.template-missing') ? ok('a real missing template for a non-global surface still blocks') : bad(`got [${[...ids].join(', ')}] — the scope leaked to non-global surfaces`)
}

console.log('case (m) header follows the same rule as footer')
{
  const group = { 'header-group.json': JSON.stringify({ type: 'header-group', sections: { h1: { type: 'image-with-text' } }, order: ['h1'] }) }
  const map = { surfaces: [{ surface: 'header', sections: [{ order: 1, name: 'header', archetype: 'image-with-text' }] }] }
  const { ids } = runGateGroups({ map, groups: group })
  ids.has('ref.template-missing') ? bad(`header group was not resolved — got [${[...ids].join(', ')}]`) : ok('sections/header-group.json is found for the header surface too')
}

// ── CB-24: resolveSectionKey — which template section a reference entry targets, for Lens to scroll to ──
console.log('case (n) resolveSectionKey — pinned entry resolves by key or type')
{
  const sections = [{ key: 'locations', type: 'locations-slider' }, { key: 'hero', type: 'slideshow' }]
  eq(resolveSectionKey({ section: 'locations' }, sections), 'locations', 'pinned by key')
  eq(resolveSectionKey({ section: 'locations-slider' }, sections), 'locations', 'pinned by type')
  eq(resolveSectionKey({ section: 'ghost' }, sections), null, 'pinned but absent → null, never a guess')
}

console.log('case (o) resolveSectionKey — unpinned entry resolves by first matching archetype')
{
  const sections = [{ key: 's1', type: 'rich-text' }, { key: 'hero', type: 'slideshow' }]
  eq(resolveSectionKey({ archetype: 'slideshow' }, sections), 'hero', 'first section of the declared archetype')
  eq(resolveSectionKey({ archetype: 'carousel' }, sections), null, 'no section of that archetype, no name match → null')
  eq(resolveSectionKey({ archetype: 'slideshow' }, []), null, 'no sections at all → null')
}

console.log('case (o2) resolveSectionKey — unpinned + no archetype match falls back to exact name==key (the realistic all-custom-sections case)')
{
  const sections = [{ key: 'locations', type: 'locations-slider' }, { key: 'hero_banner', type: 'slideshow' }]
  eq(resolveSectionKey({ name: 'locations', archetype: 'carousel' }, sections), 'locations', 'no stock carousel type exists, but "locations" is a real exact key match')
  eq(resolveSectionKey({ name: 'nope', archetype: 'carousel' }, sections), null, 'no archetype match AND no name match → null, never a fuzzy guess')
  eq(resolveSectionKey({ name: 'hero_banner', archetype: 'slideshow' }, sections), 'hero_banner', 'archetype match still wins when both would agree')
}

// ── order-conformance (2026-07-28): the reference-map declares a section order; the build must honour it ──
console.log('case (r) orderConformance — declared reference order vs built render order')
{
  const sections = [{ key: 'hero', type: 'slideshow' }, { key: 'story', type: 'rich-text' }, { key: 'grid', type: 'main-collection-product-grid' }]
  const entries = [
    { name: 'hero', archetype: 'slideshow', section: 'hero', order: 1 },
    { name: 'story', archetype: 'rich-text', section: 'story', order: 2 },
    { name: 'grid', archetype: 'collection-grid', section: 'grid', order: 3 },
  ]
  eq(orderConformance(entries, sections, ['hero', 'story', 'grid']).ok, true, 'matching order → ok')
  const mm = orderConformance(entries, sections, ['hero', 'grid', 'story'])
  eq(mm.ok, false, 'reordered build → mismatch')
  mm.declaredSeq.includes('hero → story → grid') && mm.builtSeq.includes('hero → grid → story') ? ok('reports both sequences for the fixer') : bad(`seqs: ${mm.declaredSeq} | ${mm.builtSeq}`)
  eq(orderConformance([entries[0], entries[2]], sections, ['hero', 'story', 'grid']).ok, true, 'subsequence-monotonic (hero before grid) → ok')
  eq(orderConformance([entries[0]], sections, ['hero', 'story', 'grid']), null, 'single ordered entry → n/a')
  eq(orderConformance(entries, sections, null), null, 'no render order → n/a')
}

console.log('case (s) orderOf — reads the template render order, falls back to section keys')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refm-ord-'))
  const f1 = path.join(d, 'a.json'); fs.writeFileSync(f1, JSON.stringify({ sections: { x: {}, y: {} }, order: ['y', 'x'] }))
  eq(JSON.stringify(orderOf(f1)), JSON.stringify(['y', 'x']), 'uses j.order when present')
  const f2 = path.join(d, 'b.json'); fs.writeFileSync(f2, JSON.stringify({ sections: { x: {}, y: {} } }))
  eq(JSON.stringify(orderOf(f2)), JSON.stringify(['x', 'y']), 'falls back to section object-key order')
  fs.rmSync(d, { recursive: true, force: true })
}

// ── CB-24: sectionTargetsFor (lens-capture.mjs) — the full read+resolve pipeline, via a fresh subprocess
// (its cwd-sensitivity can't be faked with process.chdir() in-process — check-reference-match.mjs's
// templateFor freezes `cwd` at MODULE LOAD, so only a genuinely fresh process proves this end-to-end) ──
function runSectionTargets({ surface, map, templates = {} }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'refm-lens-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'templates'), { recursive: true })
  if (map !== undefined) fs.writeFileSync(path.join(d, 'docs', 'design', 'reference-map.json'), typeof map === 'string' ? map : JSON.stringify(map))
  for (const [n, body] of Object.entries(templates)) fs.writeFileSync(path.join(d, 'templates', n), body)
  const lensCapture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lens-capture.mjs')
  const script = `import(${JSON.stringify(pathToFileURL(lensCapture).href)}).then(m => { process.stdout.write(JSON.stringify(m.sectionTargetsFor(${JSON.stringify(surface)}))) })`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: d, encoding: 'utf-8' })
  fs.rmSync(d, { recursive: true, force: true })
  try { return JSON.parse(r.stdout) } catch { return { __error: r.stderr } }
}
const HOME_TPL = { 'index.json': JSON.stringify({ sections: { locations: { type: 'locations-slider' }, hero_banner: { type: 'slideshow' } }, order: ['hero_banner', 'locations'] }) }

console.log('case (p) THE FEATURE — a declared entry resolves to its real template section key')
{
  const map = { surfaces: [{ surface: 'home', sections: [{ order: 1, name: 'locations', archetype: 'carousel', section: 'locations' }] }] }
  const out = runSectionTargets({ surface: 'home', map, templates: HOME_TPL })
  eq(out.locations, 'locations', 'resolves the declared entry to its template section key')
}

console.log('case (q) NO map / NO template / unresolvable entry → {} (feature is fully additive, never breaks capture)')
{
  const empty = (v, m) => (v && Object.keys(v).length === 0 ? ok(m) : bad(`${m} — got ${JSON.stringify(v)}`))
  empty(runSectionTargets({ surface: 'home', templates: HOME_TPL, map: undefined }), 'no reference-map.json at all → {}')
  const mapNoTpl = { surfaces: [{ surface: 'home', sections: [{ order: 1, name: 'locations', archetype: 'carousel', section: 'locations' }] }] }
  empty(runSectionTargets({ surface: 'home', map: mapNoTpl }), 'no template for the surface → {}')
  const mapGhost = { surfaces: [{ surface: 'home', sections: [{ order: 1, name: 'ghost', archetype: 'accordion' }] }] }
  empty(runSectionTargets({ surface: 'home', map: mapGhost, templates: HOME_TPL }), 'entry with no matching section → {} (not a guess)')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
