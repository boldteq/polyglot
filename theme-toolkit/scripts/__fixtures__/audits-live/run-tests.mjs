// The three audits, run against the LIVE gate stack and asserted — not just unit-tested.
//
// This closes a gap in my own work. Each audit had a fixture, but every one of them tested the pure
// helpers against synthetic input. None asserted the audit's REAL answer, so the results those audits
// were built to produce could regress in silence the moment someone adds a gate:
//
//   audit-unproven-guards  0 untested blocking checks   (49 static + 28 URL were burned down to reach it)
//   audit-vacuous-pass     0 vacuous passes             (17 were classified or fixed to reach it)
//   audit-ownership        0 misattributions            (6 false-BLOCK classes were fixed to reach it)
//
// A number nobody re-checks is exactly the "evidence nobody reads" shape this whole workstream keeps
// finding in other people's code. It applies to mine too.
//
// These spawn the real audits (~40s total). That cost buys the guarantee that a new gate cannot quietly
// reintroduce an untested blocker, a green tick over an empty scan, or a finding blamed on stock Dawn.

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

function audit(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), '--json', ...args], { encoding: 'utf-8', timeout: 300_000 })
  try { return JSON.parse(r.stdout || '') } catch { return { __unparseable: (r.stdout || '') + (r.stderr || '') } }
}

console.log('audit-unproven-guards — every blocking check has been shown to fire')
{
  const j = audit('audit-unproven-guards.mjs')
  if (j.__unparseable) bad(`could not run: ${String(j.__unparseable).slice(0, 160)}`)
  else {
    const untested = (j.rows || []).filter((r) => (r.untested || []).length)
    // the denominator must be real: 0 untested across 0 checks would be meaningless
    j.totalBlocking > 100
      ? ok(`${j.totalBlocking} blocking checks audited (a real denominator)`) : bad(`only ${j.totalBlocking} blocking checks found — the scan is broken`)
    untested.length === 0
      ? ok('0 untested blocking checks') : bad(`${untested.length} gate(s) regressed: ${untested.map((r) => `${r.script}(${(r.untested || []).length})`).slice(0, 5).join(', ')}`)
  }
}

console.log('\naudit-vacuous-pass — no gate reports PASS having examined nothing')
{
  const j = audit('audit-vacuous-pass.mjs')
  if (j.__unparseable) bad(`could not run: ${String(j.__unparseable).slice(0, 160)}`)
  else {
    j.total > 20 ? ok(`${j.total} static gates exercised on an empty theme`) : bad(`only ${j.total} gates ran — the audit is not measuring the stack`)
    j.vacuous === 0
      ? ok('0 vacuous passes') : bad(`${j.vacuous} gate(s) now pass having scanned nothing: ${(j.rows || []).filter((r) => r.verdict === 'VACUOUS').map((r) => r.gate).slice(0, 6).join(', ')}`)
  }
}

console.log('\naudit-ownership — no gate blames the team for code it does not own')
{
  const j = audit('audit-ownership.mjs')
  if (j.__unparseable) bad(`could not run: ${String(j.__unparseable).slice(0, 160)}`)
  else {
    // the control: gates MUST flag our own dirty code, or "0 misattributions" is vacuous
    ;(j.controls || []).length >= 3
      ? ok(`${(j.controls || []).length} gate(s) flagged OUR code (the control holds)`) : bad(`only ${(j.controls || []).length} gate(s) flagged our code — the fixture theme is not being scanned`)
    ;(j.misattributed || []).length === 0
      ? ok('0 findings blamed on theme-base / generated / merchant-data / vendored')
      : bad(`${j.misattributed.length} misattribution(s): ${j.misattributed.map((r) => `${r.gate}→${r.cls}`).slice(0, 5).join(', ')}`)
  }
}

console.log(failures === 0 ? '\naudits-live: ALL CASES PASS' : `\naudits-live: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
