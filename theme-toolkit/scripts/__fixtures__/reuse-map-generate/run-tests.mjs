// Hermetic fixture for generate-reuse-map (GI-2, 2026-07-23). PURE: exercises deriveCounts() +
// renderMap() only — no git, no disk, no theme.
//
// THE INVARIANT THIS EXISTS TO PROTECT: the generator must NEVER emit `Custom split: {library, scratch}`
// or a `blueprint:` justification. Those encode authorship history that is not in the repo, and a
// fabricated value would let a build pass onyx Audit 7 on invented numbers — indistinguishable from a
// real pass. The generated map is INCOMPLETE BY DESIGN so gate #23 blocks until a human finishes it.
//
// Counts are FILE-based, not instance-based, because gate #23 cross-checks `custom` against the number
// of sections/*.liquid files added since BASE_REF.
import { deriveCounts, renderMap } from '../../generate-reuse-map.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const usedMap = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, { hasSettings: !!v }]))

console.log('case (a) rungs are assigned from git facts, not from template presence')
{
  const c = deriveCounts({
    added: new Set(['cravin-hero', 'cravin-locations']),
    modified: new Set(['image-banner']),
    used: usedMap({ 'cravin-hero': false, 'image-banner': true, 'featured-collection': false, 'contact-form': true }),
  })
  eq(c.custom.join(','), 'cravin-hero,cravin-locations', 'added files → CUSTOM (even the one no template uses)')
  eq(c.extended.join(','), 'image-banner', 'modified stock → EXTEND, never CONFIGURE')
  eq(c.configured.join(','), 'contact-form', 'stock + template settings → CONFIGURE')
  eq(c.reused.join(','), 'featured-collection', 'stock, no settings → REUSE')
}

console.log('case (b) main-* drivers are excluded from the reuse denominator')
{
  // protocol §Targets: "main-* drivers and header/footer groups are excluded ... always REUSE"
  const c = deriveCounts({
    added: new Set(), modified: new Set(),
    used: usedMap({ 'main-product': true, 'main-collection-product-grid': false, 'rich-text': false }),
  })
  eq(c.reused.join(','), 'rich-text', 'main-* not counted as reused')
  eq(c.configured.length, 0, 'main-* not counted as configured even with settings')
}

console.log('case (c) an ADDED main-* still counts as custom (gate cross-checks every new file)')
{
  const c = deriveCounts({ added: new Set(['main-custom-thing']), modified: new Set(), used: usedMap({}) })
  eq(c.custom.join(','), 'main-custom-thing', 'added file counts regardless of name')
}

console.log('case (d) custom sections no template references are surfaced as dead weight')
{
  const c = deriveCounts({
    added: new Set(['used-one', 'orphan']), modified: new Set(), used: usedMap({ 'used-one': false }),
  })
  eq(c.unused.join(','), 'orphan', 'orphaned custom section detected')
  eq(c.custom.length, 2, 'but it still counts toward custom (the file exists)')
}

console.log('case (e) THE ANTI-FABRICATION INVARIANT — never invent the judgement fields')
{
  const c = deriveCounts({
    added: new Set(['a', 'b']), modified: new Set(), used: usedMap({ a: false, b: false }),
  })
  const md = renderMap(c)
  // NB: bind before testing — a statement STARTING with a regex literal parses as division.
  const hasSplit = /^Custom split:/m.test(md)
  const hasBlueprint = /^[a-z0-9-]+:\s*blueprint:/mi.test(md)
  hasSplit
    ? bad('generator emitted a Custom split line — it cannot know library vs scratch')
    : ok('no Custom split line emitted')
  hasBlueprint
    ? bad('generator emitted a blueprint justification — it cannot know why a section went custom')
    : ok('no blueprint justification emitted')
  md.includes('- [ ] a') && md.includes('- [ ] b')
    ? ok('every custom section is listed as an unfilled TODO')
    : bad('custom sections missing from the TODO checklist')
}

console.log('case (f) the emitted Counts line matches gate #23\'s pinned regex')
{
  // pinned in check-reuse-map.mjs — if the generator drifts from it the map reads as counts-missing
  const PINNED = /^Counts:\s*\{reused:\s*(\d+),\s*configured:\s*(\d+),\s*extended:\s*(\d+),\s*custom:\s*(\d+)\}/m
  const c = deriveCounts({
    added: new Set(['x']), modified: new Set(['image-banner']),
    used: usedMap({ 'rich-text': false, 'contact-form': true, 'image-banner': false }),
  })
  const m = renderMap(c).match(PINNED)
  m ? ok('Counts line parses under the gate\'s pinned regex') : bad('Counts line does NOT match the pinned regex')
  if (m) {
    eq(Number(m[1]), 1, 'reused count in the line')
    eq(Number(m[2]), 1, 'configured count in the line')
    eq(Number(m[3]), 1, 'extended count in the line')
    eq(Number(m[4]), 1, 'custom count in the line')
  }
}

console.log('case (g) the table uses only the gate\'s valid rung vocabulary')
{
  const VALID = new Set(['REUSE', 'CONFIGURE', 'EXTEND', 'CUSTOM'])
  const c = deriveCounts({
    added: new Set(['x']), modified: new Set(['image-banner']),
    used: usedMap({ 'rich-text': false, 'contact-form': true, 'image-banner': false }),
  })
  const rows = renderMap(c).split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Zone') && !/^\|\s*-/.test(l))
  const rungs = rows.map(l => l.split('|')[3].trim())
  rungs.length === 4 ? ok('one row per counted section') : bad(`expected 4 rows, got ${rungs.length}`)
  rungs.every(r => VALID.has(r)) ? ok('all rungs in {REUSE, CONFIGURE, EXTEND, CUSTOM}') : bad(`bad rung: ${rungs.join(',')}`)
}

console.log('case (h) an empty theme produces a valid, non-crashing map')
{
  const c = deriveCounts({ added: new Set(), modified: new Set(), used: usedMap({}) })
  const md = renderMap(c)
  const shareOk = /share 0%/.test(md)
  md.includes('Counts: {reused: 0, configured: 0, extended: 0, custom: 0}') ? ok('zero counts render') : bad('empty theme broke the Counts line')
  shareOk ? ok('no divide-by-zero in the share') : bad('share went NaN on an empty theme')
}

console.log(failures === 0 ? '\nreuse-map-generate: ALL CASES PASS' : `\nreuse-map-generate: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
