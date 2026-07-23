// The unproven-guard auditor must itself be proven — otherwise it joins the class it exists to find.
//
// Five guards were found this week that looked present, were believed, and could never fire (ENV-1,
// ENV-2, TEST-1a, HYG-2, BRAIN-2). All were found by accident. This tool enumerates blocking checks
// with no fixture coverage so they stop being found by accident.
//
// The two ways it could lie:
//   · miss a real blocker (under-report → false comfort, the exact failure it hunts)
//   · demand the fully-qualified id when fixtures assert a bare suffix (over-report → alarm avalanche;
//     that mistake alone overstated the gap by 9 on first run)

import { blockingIds, isExercised, isUrlGate } from '../../audit-unproven-guards.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('case (a) every blocking shape this toolkit uses is recognised')
{
  const src = `
    add(blockers, 'ds.color-hex', file, 'msg')
    drift('ds.font-size', file, 'msg')
    blockers.push({ id: 'reuse-map.bad-rung', page, detail })
    add(warnings, 'ds.shadow', file, 'not a blocker')
  `
  const ids = blockingIds(src)
  ids.has('ds.color-hex') ? ok('add(blockers, …)') : bad('missed add(blockers)')
  ids.has('ds.font-size') ? ok('drift(…)') : bad('missed drift()')
  ids.has('reuse-map.bad-rung') ? ok('blockers.push({ id })') : bad('missed blockers.push')
  ids.has('ds.shadow') ? bad('a WARNING id was counted as blocking') : ok('warnings are not counted')
}

console.log('case (b) exercised-detection accepts both fully-qualified and bare-suffix assertions')
{
  // fixtures write both `reuse-map.bad-rung` and `mustContain: 'custom-split-missing'`
  eq(isExercised('reuse-map.bad-rung', "expect('x', { mustContain: 'reuse-map.bad-rung' })"), true, 'full id matches')
  eq(isExercised('reuse-map.custom-split-missing', "mustContain: 'custom-split-missing'"), true, 'bare suffix matches')
  eq(isExercised('reuse-map.bad-rung', 'nothing relevant here'), false, 'absent → not exercised')
}

console.log('case (c) short suffixes do NOT match loose prose (that would under-report)')
{
  // `ds.missing` has suffix "missing" — matching that in any comment would hide a real gap
  eq(isExercised('ds.missing', 'a fixture comment mentioning a missing file'), false, 'short suffix is not enough')
  eq(isExercised('x.abc', 'abc'), false, 'very short suffix rejected')
}

console.log('case (d) URL gates are separated from static ones')
{
  eq(isUrlGate("const url = process.env.THEME_PREVIEW_URL"), true, 'THEME_PREVIEW_URL → url gate')
  eq(isUrlGate("import fs from 'node:fs'"), false, 'no preview URL → static gate')
}

console.log('case (e) the auditor finds a planted untested blocker')
{
  const src = "add(blockers, 'planted.never-tested', f, 'm')\nadd(blockers, 'planted.is-tested', f, 'm')"
  const fixtures = "expect(..., { mustContain: 'planted.is-tested' })"
  const untested = [...blockingIds(src)].filter((i) => !isExercised(i, fixtures))
  eq(untested.length, 1, 'exactly the uncovered one is reported')
  eq(untested[0], 'planted.never-tested', 'and it is the right one')
}

console.log(failures === 0 ? '\nunproven-guards: ALL CASES PASS' : `\nunproven-guards: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
