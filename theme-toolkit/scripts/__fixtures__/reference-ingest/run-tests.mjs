// Hermetic fixture for reference-ingest FETCH-ONCE / PERSIST-ALWAYS (FIG-1, 2026-07-23).
//
// WHY: the Figma MCP is hard-capped on the Starter plan — `get_screenshot` returns "You've reached the
// Figma MCP tool call limit on the Starter plan" (verified live 2026-07-15 and again 2026-07-23). A
// build that re-reads Figma per section dies mid-run, so an export must be fetched ONCE and then
// survive forever. Two things have to hold:
//   1. re-registering an entry must never DISCARD the persisted export (the bug this fixture pins),
//   2. a cache probe must answer hit/miss/ambiguous without spending a Figma call.
// PURE: exercises upsertEntry() + findFigmaEntry() only — no MCP, no network, no disk.
import { upsertEntry, findFigmaEntry } from '../../reference-ingest.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const sec = (map, surface, name) =>
  (map.surfaces.find(s => s.surface === surface)?.sections || []).find(x => x.name === name)

console.log('case (a) THE REGRESSION — re-registering without --image must NOT wipe the persisted export')
{
  let map = upsertEntry({ surfaces: [] }, {
    surface: 'home', name: 'hero', archetype: 'slideshow', mustHave: ['dots'],
    reference: 'docs/design/references/home/hero.png', figma: '225:1293', figmaFile: 'lInEfNo3UXiju5B3kq1Tvi',
  })
  eq(sec(map, 'home', 'hero').reference, 'docs/design/references/home/hero.png', 'first ingest stores the export')

  // the realistic second command: correct the archetype, no --image, no --figma
  map = upsertEntry(map, { surface: 'home', name: 'hero', archetype: 'carousel', mustHave: ['arrows'] })
  const row = sec(map, 'home', 'hero')
  eq(row.reference, 'docs/design/references/home/hero.png', 'export SURVIVES the re-register')
  eq(row.figma_node, '225:1293', 'figma node provenance survives')
  eq(row.figma_file, 'lInEfNo3UXiju5B3kq1Tvi', 'figma file provenance survives')
  eq(row.archetype, 'carousel', 'the archetype still updates')
  eq(row.must_have.join(','), 'arrows', 'must_have still updates')
}

console.log('case (b) a NEW non-empty value still overwrites (sticky must not mean frozen)')
{
  let map = upsertEntry({ surfaces: [] }, {
    surface: 'home', name: 'hero', archetype: 'slideshow',
    reference: 'docs/design/references/home/hero.png', figma: '1:1', figmaFile: 'FILE_A',
  })
  map = upsertEntry(map, {
    surface: 'home', name: 'hero', archetype: 'slideshow',
    reference: 'docs/design/references/home/hero-v2.png', figma: '2:2', figmaFile: 'FILE_B',
  })
  const row = sec(map, 'home', 'hero')
  eq(row.reference, 'docs/design/references/home/hero-v2.png', 'newer export replaces the old one')
  eq(row.figma_node, '2:2', 'newer node replaces')
  eq(row.figma_file, 'FILE_B', 'newer file replaces')
}

console.log('case (c) cache probe — hit / miss')
{
  const map = upsertEntry({ surfaces: [] }, {
    surface: 'home', name: 'hero', archetype: 'slideshow',
    reference: 'docs/design/references/home/hero.png', figma: '225:1293', figmaFile: 'FILE_A',
  })
  eq(findFigmaEntry(map, { node: '225:1293', file: 'FILE_A' }).status, 'hit', 'known node+file → hit (spend no call)')
  eq(findFigmaEntry(map, { node: '225:1293' }).status, 'hit', 'known node, no file given → hit')
  eq(findFigmaEntry(map, { node: '999:999', file: 'FILE_A' }).status, 'miss', 'unknown node → miss (one fetch allowed)')
  eq(findFigmaEntry(map, { node: '225:1293', file: 'FILE_B' }).status, 'miss', 'same node id, DIFFERENT file → miss, not a wrong-design hit')
  eq(findFigmaEntry({ surfaces: [] }, { node: '1:1' }).status, 'miss', 'empty map → miss')
}

console.log('case (d) AMBIGUITY IS REFUSED — same node id registered in two files')
{
  // cravinbyandy has four Figma keys in play; node ids are unique only WITHIN a file, so a bare
  // node match across files must never silently hand back one of them.
  let map = upsertEntry({ surfaces: [] }, {
    surface: 'home', name: 'hero', archetype: 'slideshow', reference: 'a.png', figma: '1:1', figmaFile: 'FILE_A',
  })
  map = upsertEntry(map, {
    surface: 'about', name: 'banner', archetype: 'image-banner', reference: 'b.png', figma: '1:1', figmaFile: 'FILE_B',
  })
  const r = findFigmaEntry(map, { node: '1:1' })
  eq(r.status, 'ambiguous', 'bare node across two files → ambiguous, caller must disambiguate')
  eq(r.matches.length, 2, 'both candidates reported')
  eq(findFigmaEntry(map, { node: '1:1', file: 'FILE_B' }).status, 'hit', 'passing the file resolves it')
  eq(findFigmaEntry(map, { node: '1:1', file: 'FILE_B' }).matches[0].surface, 'about', 'resolves to the RIGHT entry')
}

console.log('case (e) an entry with unknown provenance is never claimed for a specific file')
{
  const map = upsertEntry({ surfaces: [] }, {
    surface: 'home', name: 'hero', archetype: 'slideshow', reference: 'a.png', figma: '1:1',
  })
  eq(findFigmaEntry(map, { node: '1:1', file: 'FILE_A' }).status, 'miss', 'no recorded file → not a hit for FILE_A')
  eq(findFigmaEntry(map, { node: '1:1' }).status, 'hit', 'but still findable without a file filter')
}

console.log(failures === 0 ? '\nreference-ingest: ALL CASES PASS' : `\nreference-ingest: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
