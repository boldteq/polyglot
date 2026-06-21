#!/usr/bin/env node
// Self-test for #10 — routeFindings (theme-CODE vs store-DATA split that drives autofix dispatch).
// Run (Node 20): node scripts/__fixtures__/lens-route/run-tests.mjs · Exit 0 = all pass.

import { routeFindings } from '../../lens-autofix.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('routeFindings — code (file edits) vs data (porter)')
{
  const findings = [{ fix_owner: 'loom', check: 'a' }, { fix_owner: 'porter', check: 'b' }, { fix_owner: 'drape', check: 'c' }, { fix_owner: 'porter', check: 'd' }, { fix_owner: 'ink', check: 'e' }]
  const r = routeFindings(findings)
  eq(r.code.map(f => f.check), ['a', 'c', 'e'], 'loom/drape/ink → code')
  eq(r.data.map(f => f.check), ['b', 'd'], 'porter → data')
}
eq(routeFindings([]), { code: [], data: [] }, 'empty → empty buckets')
eq(routeFindings(null), { code: [], data: [] }, 'null → no throw')
{
  // an unknown owner is treated as data (store-side) → escalates, never a blind file edit
  const r = routeFindings([{ fix_owner: 'mystery', check: 'x' }])
  eq([r.code.length, r.data.length], [0, 1], 'unknown owner → data bucket (safe default)')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
