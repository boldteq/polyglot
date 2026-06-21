#!/usr/bin/env node
// Self-test for #1 — finding severity tier in lib/report.mjs.
//   • countSeverities: pure roll-up; unknown/absent severity counts as 'warn'.
//   • writeReport: blockers are FORCED to severity 'block' (a blocker can't be downgraded); warnings
//     default to 'warn' but may opt down to 'advise'; the report carries a correct severityCounts.
// Backward-compat is the whole point: nothing that lands in blockers[] stops blocking.
// Run (Node 20): node scripts/__fixtures__/report-severity/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeReport, countSeverities } from '../../lib/report.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('countSeverities — pure roll-up, unknown → warn')
eq(countSeverities([{ severity: 'block' }, { severity: 'warn' }, { severity: 'advise' }, { severity: 'bogus' }, {}]),
  { block: 1, warn: 3, advise: 1 }, 'counts block/warn/advise; bogus + empty default to warn')
eq(countSeverities([]), { block: 0, warn: 0, advise: 0 }, 'empty list → all zero')
eq(countSeverities(null), { block: 0, warn: 0, advise: 0 }, 'null → all zero (no throw)')

console.log('writeReport — severity derived per array + severityCounts rollup')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sev-'))
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sev-out-'))
  const { report } = writeReport('demo', 99, {
    cwd: dir,
    pass: false,
    blockers: [{ id: 'b1', detail: 'x', severity: 'advise' }], // attempt to downgrade a blocker → must be forced to 'block'
    warnings: [{ id: 'w1', detail: 'y' }, { id: 'w2', detail: 'z', severity: 'advise' }],
  }, reportDir)
  eq(report.blockers[0].severity, 'block', 'blocker forced to severity block (cannot be downgraded)')
  eq(report.warnings[0].severity, 'warn', 'warning defaults to severity warn')
  eq(report.warnings[1].severity, 'advise', 'warning opts down to advise')
  eq(report.severityCounts, { block: 1, warn: 1, advise: 1 }, 'report.severityCounts correct')
  // a warning may NOT opt UP to block (that is what blockers[] is for)
  const { report: r2 } = writeReport('demo2', 98, { cwd: dir, pass: true, warnings: [{ id: 'w', severity: 'block' }] }, reportDir)
  eq(r2.warnings[0].severity, 'warn', 'warning cannot opt up to block (coerced to warn)')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(reportDir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
