#!/usr/bin/env node
// Self-test for check-handoff-contract.mjs (the dispatch helper) + the live registry. Proves the
// registry parses, every contract's requires resolve, and resolveRequire/checkContract behave.
// Run (Node 20): node scripts/__fixtures__/handoff-contract/run-tests.mjs · Exit 0 = all pass.

import { loadRegistry, resolveRequire, checkContract } from '../../check-handoff-contract.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const reg = loadRegistry()

// ── the live registry is well-formed ──
console.log('registry — parses + every contract has event/from/to/requires')
eq(Array.isArray(reg.contracts) && reg.contracts.length > 0, true, 'contracts array present')
{
  const bad = reg.contracts.filter(c => !c.event || !c.from || !c.to || !Array.isArray(c.requires) || !Array.isArray(c.produces))
  eq(bad.length, 0, 'every contract has event/from/to/requires/produces')
  // every contract-event named in a requires must itself be a defined event (no dangling deps)
  const events = new Set(reg.contracts.map(c => c.event))
  const dangling = []
  for (const c of reg.contracts) for (const r of c.requires) {
    if (!r.includes('/') && !/\.(json|md|csv)$/.test(r) && !events.has(r)) dangling.push(`${c.event}→${r}`)
  }
  eq(dangling, [], 'no require names a contract event that does not exist')
}

// ── resolveRequire: path present/absent + upstream contract resolution ──
console.log('resolveRequire — path + contract resolution')
{
  const yes = () => true, no = () => false
  eq(resolveRequire(reg, 'CHANGES.md', yes).ok, true, 'present path → ok')
  eq(resolveRequire(reg, 'CHANGES.md', no).ok, false, 'absent path → not ok')
  // intake_ready produces CHANGES.md + goals.json (path-like) → resolvable as an upstream contract
  eq(resolveRequire(reg, 'intake_ready', yes).ok, true, 'upstream contract with present produces → ok')
  eq(resolveRequire(reg, 'intake_ready', no).ok, false, 'upstream contract with absent produces → not ok')
  eq(resolveRequire(reg, 'store_token_ready', no).ok, true, 'contract with no on-disk artifact → soft pass')
  eq(resolveRequire(reg, 'totally_made_up', yes).ok, false, 'unknown require → not ok')
}

// ── checkContract: ready vs not-ready ──
console.log('checkContract — content_briefs_ready needs intake_ready inputs')
{
  const all = () => true
  const r = checkContract(reg, 'content_briefs_ready', all)
  eq(r.found, true, 'contract found')
  eq(r.ready, true, 'ready when all inputs present')
  const none = checkContract(reg, 'content_briefs_ready', () => false)
  eq(none.ready, false, 'not ready when inputs absent')
  eq(checkContract(reg, 'nope', all).found, false, 'unknown event → not found')
}

console.log(failures === 0 ? '\n✓ HANDOFF-CONTRACT — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
