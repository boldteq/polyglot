#!/usr/bin/env node
// Self-test for the autofix learning loop (WS-E1) — the PURE classification: a finding still present
// after a fix = persisted (don't retry the same way); gone = resolved.
// Run: node scripts/__fixtures__/fix-outcomes/run-tests.mjs · Exit 0 = all pass.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
const { diffOutcomes, persistedKeys, findingKey } = await import(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib', 'lens-fix-outcomes.mjs'))

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('diffOutcomes — persisted (still there after a fix) vs resolved (gone)')
{
  const prev = [{ check: 'css-layout', surface: 'home', viewport: 'mobile', fix_owner: 'loom' }, { check: 'hierarchy', surface: 'home', viewport: 'mobile', fix_owner: 'loom' }]
  const cur = [{ check: 'css-layout', surface: 'home', viewport: 'mobile' }]
  const d = diffOutcomes(prev, cur)
  const css = d.find(x => x.check === 'css-layout'); const hier = d.find(x => x.check === 'hierarchy')
  css?.result === 'persisted' && hier?.result === 'resolved' ? ok('css persisted (fix failed), hierarchy resolved (fix worked)') : bad(`got css=${css?.result} hier=${hier?.result}`)
}
{ diffOutcomes([], [{ check: 'a', surface: 'b' }]).length === 0 ? ok('empty prior round → no outcomes') : bad('empty prev should yield no outcomes') }

console.log('persistedKeys — only persisted findings become give-ups')
{
  const ks = persistedKeys([{ check: 'css-layout', surface: 'home', viewport: 'mobile', result: 'persisted' }, { check: 'x', surface: 'y', viewport: '', result: 'resolved' }])
  ks.has('css-layout::home::mobile') && !ks.has('x::y::') ? ok('persisted in set, resolved excluded') : bad(`set=${[...ks]}`)
}

console.log('findingKey — stable key')
{ findingKey({ check: 'css-layout', surface: 'home', viewport: 'mobile' }) === 'css-layout::home::mobile' ? ok('findingKey = check::surface::viewport') : bad('findingKey wrong') }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
