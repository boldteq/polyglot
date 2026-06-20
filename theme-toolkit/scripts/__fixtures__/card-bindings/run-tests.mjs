#!/usr/bin/env node
// Self-test for check-card-bindings.mjs (#20 — the component-library render-conformance gate). The gate is
// CLI-only AND runs main() on load (no argv guard) — so we exercise it ONLY via spawn, NEVER via import
// (importing would execute the gate + write a report). When the component library is present, run the gate
// OFFLINE (no claude, no network) and assert the real cards conform (--no-broken → exit 0) + a report is
// written; REPORT_DIR → a temp dir so the repo's gate-reports/ is never touched. When the library is
// absent, fall back to a parse-only rot guard (node --check). The broken-synthetic detection proof stays a
// manual run (`node check-card-bindings.mjs`) — keeping this self-test cheap per the chosen scope.
// Run (Node 20): node scripts/__fixtures__/card-bindings/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (got === want ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '../../check-card-bindings.mjs')
const LIBRARY = path.join(os.homedir(), '.claude/memory/design/ecom/component-library-premium')

console.log('case a — gate loads + runs; real library cards pass #8/#13/#14 (--no-broken)')
if (fs.existsSync(LIBRARY)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-fixture-'))
  const r = spawnSync(process.execPath, [SCRIPT, '--no-broken'], { encoding: 'utf-8', env: { ...process.env, REPORT_DIR: tmp } })
  eq(r.status, 0, '--no-broken: gate loads, runs, and every real library card passes #8/#13/#14')
  eq(fs.existsSync(path.join(tmp, 'card-bindings.json')), true, 'writes a card-bindings.json report (to the temp REPORT_DIR, not the repo)')
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('  note: the broken-synthetic detection proof is exercised by `node check-card-bindings.mjs` (manual)')
} else {
  // library absent (e.g. fresh CI checkout) → at least guarantee the gate still parses
  const chk = spawnSync(process.execPath, ['--check', SCRIPT], { encoding: 'utf-8' })
  eq(chk.status, 0, 'component library absent — gate parses (node --check); integration run skipped')
}

console.log(failures === 0 ? '\n✓ CARD-BINDINGS — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
