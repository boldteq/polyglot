// Hermetic fixture for gate #46 check-reference-match (L1 structural). PURE: exercises resolveEntry()
// against synthetic template sections — no vision, no store, no claude. The headline case is the real
// 2026-07-21 cravinbyandy failure: reference showed slideshow dots, build used image-banner, ~20 gates
// green. L1 must BLOCK that, while never false-blocking a legitimate custom section.
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

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
