#!/usr/bin/env node
// Gate-stack COHERENCE meta-test. The 36-gate stack is built across many sessions; this guards it
// against the "orphan validator — tested but unwired → false coverage" class that already bit reuse-map
// AND image-quality. Invariants over the LIVE manifest (`theme-gates.mjs --list-json`):
//   1. script-exists   — every gate's script resolves on disk.
//   2. number-drift    — each script's writeReport(name, N, …) N == manifest number (card-bindings null exempt).
//   3. static-no-fixture — every kind:'static' gate has __fixtures__/<name>/run-tests.mjs OR is in EXEMPT_STATIC.
//   4. stale-exemption — an EXEMPT_STATIC gate that NOW has a fixture must be de-listed (keeps the ledger shrinking).
// url/library gates are fixture-exempt by design (need a browser / library scope). The checker is PURE
// (injected probes) so it's proven on a SYNTHETIC manifest too — the guard demonstrably BITES.
// Run (Node 20): node scripts/__fixtures__/stack-coherence/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.resolve(HERE, '..', '..')
const FX = path.resolve(HERE, '..')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

// static gates that legitimately lack a hermetic fixture TODAY — a shrinking tech-debt ledger.
// Each MUST carry a reason. Remove an entry the moment its fixture lands (stale-exemption enforces this).
const EXEMPT_STATIC = new Map([
  ['code-lint', 'proxies the Shopify CLI (`shopify theme check`) — no hermetic fixture without the CLI'],
])
const EXEMPT_NUMBER = new Set(['library-cards']) // library gate: writeReport gateNumber is null by design

// PURE: audit a manifest against injected probes. Returns violations [{id, gate, detail}].
function auditCoherence(manifest, { scriptExists, fixtureExists, gateNumberOf, exemptStatic, exemptNumber }) {
  const v = []
  for (const g of manifest) {
    if (!scriptExists(g.script)) v.push({ id: 'script-missing', gate: g.name, detail: `script ${g.script} not found on disk` })
    if (!exemptNumber.has(g.name)) {
      const n = gateNumberOf(g)
      if (n != null && n !== g.number) v.push({ id: 'number-drift', gate: g.name, detail: `writeReport number ${n} ≠ manifest number ${g.number}` })
    }
    if (g.kind === 'static') {
      const hasFx = fixtureExists(g.name)
      if (!hasFx && !exemptStatic.has(g.name)) v.push({ id: 'static-no-fixture', gate: g.name, detail: `static gate has no __fixtures__/${g.name}/run-tests.mjs and is not in EXEMPT_STATIC — write the test or justify+allowlist it` })
      if (hasFx && exemptStatic.has(g.name)) v.push({ id: 'stale-exemption', gate: g.name, detail: `gate is in EXEMPT_STATIC but NOW has a fixture — remove it from the ledger` })
    }
  }
  return v
}

// ── real probes over the on-disk toolkit ──
const scriptExists = (s) => fs.existsSync(path.join(SCRIPTS, s))
const fixtureExists = (name) => fs.existsSync(path.join(FX, name, 'run-tests.mjs'))
const gateNumberOf = (g) => {
  if (!/\.mjs$/.test(g.script)) return null // bash / non-node → no writeReport literal to read
  let text = ''
  try { text = fs.readFileSync(path.join(SCRIPTS, g.script), 'utf-8') } catch { return null }
  const m = text.match(/writeReport\(\s*['"][\w-]+['"]\s*,\s*([\d.]+|null)/)
  if (!m) return null
  return m[1] === 'null' ? null : Number(m[1])
}

// ── load the LIVE manifest via --list-json (never parse the file text) ──
console.log('manifest — theme-gates.mjs --list-json parses')
let manifest = []
{
  const r = spawnSync('node', [path.join(SCRIPTS, 'theme-gates.mjs'), '--list-json'], { encoding: 'utf-8' })
  try { manifest = JSON.parse(r.stdout) } catch { /* leave empty */ }
  Array.isArray(manifest) && manifest.length >= 30 ? pass(`manifest loaded (${manifest.length} gates)`) : fail(`--list-json did not yield a manifest: ${(r.stdout || r.stderr || '').slice(0, 120)}`)
  manifest.every(g => g.name && g.script && g.kind) ? pass('every entry has name/script/kind') : fail('a manifest entry is missing name/script/kind')
}

console.log('live coherence — zero violations on the current stack')
{
  const violations = auditCoherence(manifest, { scriptExists, fixtureExists, gateNumberOf, exemptStatic: EXEMPT_STATIC, exemptNumber: EXEMPT_NUMBER })
  if (violations.length === 0) pass('no coherence violations')
  else { fail(`${violations.length} violation(s):`); for (const x of violations) console.log(`        ✗ [${x.id}] ${x.gate}: ${x.detail}`) }
}

console.log('ledger — print EXEMPT_STATIC (shrinking tech-debt)')
for (const [name, why] of EXEMPT_STATIC) console.log(`        · ${name} — ${why}`)

console.log('the guard BITES — synthetic manifest with a broken gate')
{
  const synthetic = [{ number: 99, name: '__probe', kind: 'static', script: '__nope__.mjs' }]
  const v = auditCoherence(synthetic, { scriptExists: () => false, fixtureExists: () => false, gateNumberOf: () => null, exemptStatic: new Map(), exemptNumber: new Set() })
  v.some(x => x.id === 'script-missing') ? pass('flags a missing script') : fail('missed missing script')
  v.some(x => x.id === 'static-no-fixture') ? pass('flags a static gate with no fixture') : fail('missed missing fixture')
}
{
  const synthetic = [{ number: 7, name: '__drift', kind: 'static', script: 'x.mjs' }]
  const v = auditCoherence(synthetic, { scriptExists: () => true, fixtureExists: () => true, gateNumberOf: () => 9, exemptStatic: new Map(), exemptNumber: new Set() })
  v.some(x => x.id === 'number-drift') ? pass('flags writeReport number drift (9 ≠ 7)') : fail('missed number drift')
}
{
  const synthetic = [{ number: 1, name: '__url', kind: 'url', script: 'u.mjs' }]
  const v = auditCoherence(synthetic, { scriptExists: () => true, fixtureExists: () => false, gateNumberOf: () => null, exemptStatic: new Map(), exemptNumber: new Set() })
  v.length === 0 ? pass('url gate without a fixture is NOT a violation (exempt by kind)') : fail(`url gate wrongly flagged: ${JSON.stringify(v)}`)
}

console.log(failures === 0 ? '\n✓ STACK-COHERENCE — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
