#!/usr/bin/env node
// Self-test for check-group-coverage.mjs (gate #57) — the honesty guard for gate grouping.
// Proves coverageReport() catches the three ways grouping could silently drop coverage.
// Run (Node 20): node scripts/__fixtures__/group-coverage/run-tests.mjs · Exit 0 = all pass.

import { coverageReport, driftBlockers } from '../../check-group-coverage.mjs'

let f = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); f += 1 }
const eq = (g, w, m) => (JSON.stringify(g) === JSON.stringify(w) ? pass(m) : fail(`${m} — got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`))

const G = [
  { id: 'grp-1', members: ['a.mjs', 'b.mjs'] },
  { id: 'grp-2', members: ['c.mjs'] },
]

console.log('coverageReport — lossless 1:1 mapping')
{
  const r = coverageReport(['a.mjs', 'b.mjs', 'c.mjs'], G)
  eq(r.ok, true, 'exact cover → ok:true')
  eq([r.orphans.length, r.phantoms.length, r.duplicates.length], [0, 0, 0], 'no drift of any kind')
}

console.log('coverageReport — orphan gate (the dangerous one: a check dropped from the grouped view)')
{
  const r = coverageReport(['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs'], G)
  eq(r.ok, false, 'orphan → ok:false')
  eq(r.orphans, ['d.mjs'], 'd.mjs flagged as orphan (in manifest, in no group)')
}

console.log('coverageReport — phantom member (stale mapping)')
{
  const r = coverageReport(['a.mjs', 'b.mjs'], G) // c.mjs no longer in the manifest
  eq(r.ok, false, 'phantom → ok:false')
  eq(r.phantoms, ['c.mjs'], 'c.mjs flagged as phantom (in a group, not in manifest)')
}

console.log('coverageReport — duplicate ownership')
{
  const dup = [{ id: 'x', members: ['a.mjs'] }, { id: 'y', members: ['a.mjs', 'b.mjs'] }]
  const r = coverageReport(['a.mjs', 'b.mjs'], dup)
  eq(r.ok, false, 'duplicate → ok:false')
  eq(r.duplicates.map((d) => d.script), ['a.mjs'], 'a.mjs flagged as claimed by two groups')
  eq(r.duplicates[0].groups, ['x', 'y'], 'names both owning groups')
}

console.log('coverageReport — empty/malformed never throws')
{
  const r = coverageReport(null, null)
  eq(r.ok, true, 'nulls → ok:true, empty drift (no crash)')
}

console.log('driftBlockers — each drift emits its exact blocker id (proves the gate fires them)')
{
  const orphan = driftBlockers(coverageReport(['a.mjs', 'z.mjs'], [{ id: 'g', members: ['a.mjs'] }]))
  orphan.some((b) => b.id === 'groups.orphan-gate' && b.page === 'z.mjs') ? pass('emits groups.orphan-gate') : fail(`no groups.orphan-gate in ${JSON.stringify(orphan)}`)
  const phantom = driftBlockers(coverageReport(['a.mjs'], [{ id: 'g', members: ['a.mjs', 'ghost.mjs'] }]))
  phantom.some((b) => b.id === 'groups.phantom-member' && b.page === 'ghost.mjs') ? pass('emits groups.phantom-member') : fail(`no groups.phantom-member in ${JSON.stringify(phantom)}`)
  const dup = driftBlockers(coverageReport(['a.mjs'], [{ id: 'x', members: ['a.mjs'] }, { id: 'y', members: ['a.mjs'] }]))
  dup.some((b) => b.id === 'groups.duplicate-member' && b.page === 'a.mjs') ? pass('emits groups.duplicate-member') : fail(`no groups.duplicate-member in ${JSON.stringify(dup)}`)
  driftBlockers({ ok: true, orphans: [], phantoms: [], duplicates: [] }).length === 0 ? pass('clean coverage → zero blockers') : fail('clean coverage emitted a blocker')
}

console.log(f === 0 ? '\ngroup-coverage: ALL CASES PASS' : `\ngroup-coverage: ${f} FAILED`)
process.exit(f ? 1 : 0)
