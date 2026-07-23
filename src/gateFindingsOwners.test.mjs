// The gate→owner table in src/lib/gateFindings.js must stay in step with the gates that actually run.
//
// TEST-1 (2026-07-23): it had silently rotted. Six of its keys named gates that no longer exist
// (theme-check→code-lint, render-wiring→render-check, a11y-static→static-a11y,
// design-system→design-tokens, antipatterns→dead-code, functional→functionality). Because an unmapped
// gate is SKIPPED (`if (!owner) continue`), the harvester quietly dropped most static-gate defects:
// on a real store only 4 of 15 keys matched any report on disk. Nothing failed — the gate→training
// signal loop just starved. Same silent-skip family as HYG-1 and the skipped-but-passing gates.
//
// These two assertions are what would have caught it:
//   1. every canonical owner key names a gate that exists in the toolkit manifest
//   2. the toolkit's own owner table (the source of truth) and this one never disagree

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { CANONICAL_GATE_OWNER, EXTRA_GATE_OWNER, LEGACY_GATE_ALIAS, GATE_OWNER } = require('../src/lib/gateFindings.js')

// gate names the toolkit manifest declares, e.g. `{ name: 'render-check', number: 14, … }`
function manifestGateNames() {
  const src = fs.readFileSync(path.join(REPO, 'theme-toolkit/scripts/theme-gates.mjs'), 'utf-8')
  return new Set([...src.matchAll(/\bname:\s*'([a-z0-9-]+)'/g)].map(m => m[1]))
}

// The toolkit's auto-fix owner table — the source of truth this file mirrors.
// Parsed as TEXT rather than imported: theme-toolkit is a separate package, and dynamically importing
// across that boundary left the test runner hanging after the first case (reproduced at 90s+).
// A static read is also honest here — we are asserting on the declared table, not running it.
function toolkitOwners() {
  const src = fs.readFileSync(path.join(REPO, 'theme-toolkit/scripts/lib/gate-owner.mjs'), 'utf-8')
  const block = src.match(/export const CODE_GATE_OWNER\s*=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block, 'could not locate CODE_GATE_OWNER in the toolkit gate-owner table')
  const out = {}
  for (const m of block[1].matchAll(/'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g)) out[m[1]] = m[2]
  assert.ok(Object.keys(out).length > 10, `toolkit owner-table parse looks wrong — got ${Object.keys(out).length} entries`)
  return out
}

test('every canonical gate-owner key names a gate that actually exists', () => {
  const known = manifestGateNames()
  assert.ok(known.size > 20, `manifest parse looks wrong — only found ${known.size} gate names`)
  const orphans = Object.keys(CANONICAL_GATE_OWNER).filter(g => !known.has(g))
  assert.deepEqual(
    orphans, [],
    `gate-owner keys that match NO gate in the toolkit manifest. An unmapped gate is silently skipped,\n`
    + 'so these defects never become training signal and nothing reports the loss. Rename them to the\n'
    + `canonical gate name (and add the old name to LEGACY_GATE_ALIAS):\n  ${orphans.join(', ')}`,
  )
})

test('extra + legacy tables also reference real gates', () => {
  const known = manifestGateNames()
  // EXTRA covers gates that are real but not auto-fixable; they must still exist.
  const extraOrphans = Object.keys(EXTRA_GATE_OWNER).filter(g => !known.has(g))
  assert.deepEqual(extraOrphans, [], `EXTRA_GATE_OWNER names non-existent gate(s): ${extraOrphans.join(', ')}`)

  // every legacy alias must point AT a canonical name we actually own
  const danglingAliases = Object.entries(LEGACY_GATE_ALIAS)
    .filter(([, canonical]) => !CANONICAL_GATE_OWNER[canonical] && !EXTRA_GATE_OWNER[canonical])
    .map(([legacy, canonical]) => `${legacy}→${canonical}`)
  assert.deepEqual(danglingAliases, [], `legacy aliases pointing at an unowned gate: ${danglingAliases.join(', ')}`)
})

test('does not drift from the toolkit gate-owner table (the source of truth)', () => {
  const toolkit = toolkitOwners()
  const mismatches = []
  for (const [gate, owner] of Object.entries(toolkit)) {
    const mine = CANONICAL_GATE_OWNER[gate]
    if (!mine) mismatches.push(`${gate}: missing here (toolkit says ${owner})`)
    else if (mine !== owner) mismatches.push(`${gate}: ${mine} here vs ${owner} in the toolkit`)
  }
  assert.deepEqual(
    mismatches, [],
    'src/lib/gateFindings.js CANONICAL_GATE_OWNER has drifted from\n'
    + `theme-toolkit/scripts/lib/gate-owner.mjs CODE_GATE_OWNER:\n  ${mismatches.join('\n  ')}`,
  )
})

test('legacy report names still resolve to the same owner (old builds keep attributing)', () => {
  assert.equal(GATE_OWNER['render-wiring'], 'loom', 'the pre-rename render-wiring name must still map')
  assert.equal(GATE_OWNER['wiring'], 'loom', 'the report field used by older builds must still map')
  assert.equal(GATE_OWNER['theme-check'], GATE_OWNER['code-lint'], 'legacy and canonical must agree')
  assert.equal(GATE_OWNER['design-system'], GATE_OWNER['design-tokens'], 'legacy and canonical must agree')
})
