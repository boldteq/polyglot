#!/usr/bin/env node
// check-gate-fires — the meta-gate that proves a gate actually FIRES, so a silently-inert gate can't
// read as green (roadmap Phase 3.1 / audit gap 3). This is the one check that would have caught the
// `.theme-check.yml` hole: the config declared 12 hand-picked rules with no `extends:`, so theme-check
// ran a fraction of the real ruleset and passed builds it should have blocked — for weeks, until forensics.
//
// Two complementary proofs, both against the REAL config (not a fixture's private config):
//   (A) CONFIG INTEGRITY (static, always): .theme-check.yml must `extends:` a real ruleset, and must not
//       declare a rule that doesn't exist in current theme-check (a no-op like ImgLazyLoading). Cheap,
//       and it makes the exact regression that happened structurally impossible to reintroduce silently.
//   (B) KNOWN-BAD FIRING (when a gate ships a `broken/` fixture): run the gate against its own known-bad
//       input and assert it BLOCKS. A gate that passes its own broken fixture is a structural no-op.
//
// Sibling of audit-vacuous-pass (pass-on-empty?) and audit-unproven-guards (has a blocker ever fired?).
// Those ask about coverage; this asks "does the gate fire at all, with the config it will really use?"
//
// Usage: node scripts/check-gate-fires.mjs            (run from the theme repo, or the toolkit for self-test)
// Env: REPORT_DIR · GATE_FIRES_SKIP_BROKEN=1 (config-integrity only — no subprocess gate runs)
// Exit: 0 pass · 1 block (an inert gate / a broken config) · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || path.join(cwd, 'gate-reports')
const blockers = []
const warnings = []
const finding = (arr, id, page, detail, evidence = '') => arr.push({ id, page, detail, evidence: String(evidence) })

// ── (A) config integrity: the .theme-check.yml that will actually run ──────────
// A real ruleset the config may inherit. A bare hand-list with no extends is the inert-config smell.
const REAL_EXTENDS = ['theme-check:recommended', 'theme-check:all', 'theme-check:theme-app-extension']
// rules that existed in theme-check 1.x (Ruby) but NOT in current 2.x (Node) — declaring one is a no-op.
const DEAD_RULES = ['ImgLazyLoading', 'ImgWidthAndHeight', 'SyntaxError']
let scannedConfig = 0
function checkConfig(dir) {
  const p = path.join(dir, '.theme-check.yml')
  if (!fs.existsSync(p)) { finding(warnings, 'gate-fires.no-theme-check-config', '.theme-check.yml', 'no .theme-check.yml in this repo — theme-check (#2) runs Shopify defaults; nothing to assert here.'); return }
  scannedConfig = 1
  const raw = fs.readFileSync(p, 'utf-8')
  const extendsLine = raw.match(/^\s*extends:\s*(.+)$/m)
  if (!extendsLine) {
    finding(blockers, 'gate-fires.config-no-extends', '.theme-check.yml', 'no `extends:` key — the config runs ONLY its hand-listed rules, a fraction of theme-check\'s real ruleset. This is exactly the hole that let 43 offenses ship silently. Add `extends: theme-check:recommended`.', 'extends: missing')
  } else if (!REAL_EXTENDS.some((e) => extendsLine[1].includes(e))) {
    finding(warnings, 'gate-fires.config-unknown-extends', '.theme-check.yml', `extends "${extendsLine[1].trim()}" is not a recognised base ruleset (${REAL_EXTENDS.join(', ')}) — confirm it is real, not a typo that silently inherits nothing.`, extendsLine[1].trim())
  }
  for (const dead of DEAD_RULES) {
    // a dead rule DECLARED with a body (enabled/disabled) is a no-op that reads like coverage.
    if (new RegExp(`^\\s*${dead}:`, 'm').test(raw)) {
      finding(blockers, 'gate-fires.dead-rule-declared', '.theme-check.yml', `rule "${dead}" is declared but does not exist in current theme-check (2.x/Node) — it silently does nothing while looking like a checked rule. Remove it or replace with the live equivalent.`, dead)
    }
  }
}

// ── (B) known-bad firing: run a gate against its own broken fixture, assert BLOCK ──
// Only the gates that SHIP a broken fixture (a curated known-bad input). A gate that passes its own
// broken fixture is inert. Scoped to fixtures so this is deterministic and needs no live theme.
const FIXTURES = path.join(HERE, '__fixtures__')
// DETERMINISTIC, OFFLINE gates only. A network-dependent gate (shopify-validate #49) legitimately
// exits 0 when its validator is unreachable — that is honest degradation, not inertness — so it can't
// prove firing offline and is covered by its own fixture suite instead.
const GATE_SCRIPT = { 'schema-authoring': 'check-schema-authoring.mjs', 'repo-hygiene': 'check-repo-hygiene.mjs' }
const SCAN_ALL_ENV = { 'schema-authoring': 'SCHEMA_SCAN_ALL', 'repo-hygiene': 'HYGIENE_SCAN_ALL' }
function checkKnownBadFiring() {
  if (process.env.GATE_FIRES_SKIP_BROKEN === '1') return 0
  let tested = 0
  for (const [gate, script] of Object.entries(GATE_SCRIPT)) {
    const brokenDir = path.join(FIXTURES, gate, 'broken')
    const scriptPath = path.join(HERE, script)
    if (!fs.existsSync(brokenDir) || !fs.existsSync(scriptPath)) continue
    const rd = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'gf-'))
    const env = { ...process.env, REPORT_DIR: rd, BASE_REF: '__no_such_base__' }
    if (SCAN_ALL_ENV[gate]) env[SCAN_ALL_ENV[gate]] = '1'
    const r = spawnSync('node', [scriptPath], { cwd: brokenDir, env, encoding: 'utf-8', timeout: 120000 })
    fs.rmSync(rd, { recursive: true, force: true })
    tested++
    // exit 1 = BLOCK (fired, correct). exit 0 on a known-bad input = inert (the bug). exit 2 = env error (tolerate).
    if (r.status === 0) finding(blockers, 'gate-fires.inert-on-broken', gate, `gate "${gate}" reported PASS on its OWN broken fixture — it is a structural no-op (a green tick that proves nothing). The broken fixture is a curated known-bad; the gate must BLOCK it.`, `exit ${r.status}`)
  }
  return tested
}

checkConfig(cwd)
const testedGates = checkKnownBadFiring() || 0
const pass = blockers.length === 0
writeReport('gate-fires', 50, {
  cwd, pass, blockers, warnings,
  evidence: { scannedConfig, testedGates, checks: ['config-integrity', 'known-bad-firing'] },
  duration_ms: Date.now() - t0,
}, REPORT_DIR)
const code = pass ? 0 : 1
console.log(`gate-fires: ${code === 0 ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s) · config-scanned=${scannedConfig} gates-fired=${testedGates}`)
for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
process.exit(code)
