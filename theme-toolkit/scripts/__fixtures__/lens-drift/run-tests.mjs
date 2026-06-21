#!/usr/bin/env node
// Self-test for #11 — computeDrift (judge drift detector over the calibration corpus).
// Run (Node 20): node scripts/__fixtures__/lens-drift/run-tests.mjs · Exit 0 = all pass.

import { computeDrift } from '../../lens-calibrate.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const frames = (n, conf, verdict) => Array.from({ length: n }, () => ({ confidence: conf, verdict }))
const ids = (res) => new Set(res.alerts.map(a => a.metric))

console.log('computeDrift — guards + stability + drift')
{
  const r = computeDrift([], { window: 30 })
  !r.enough ? pass('empty corpus → not enough (no-op)') : fail('empty corpus should be not-enough')
}
{
  // 60 frames, all conf 90 PASS → stable, no alerts
  const r = computeDrift(frames(60, 90, 'PASS'), { window: 30 })
  r.enough && r.ok && r.alerts.length === 0 ? pass('stable corpus → no alerts') : fail(`stable: ${JSON.stringify(r)}`)
}
{
  // prior 30 @ conf 90, recent 30 @ conf 70 → confidence drift (-20pts)
  const r = computeDrift([...frames(30, 90, 'PASS'), ...frames(30, 70, 'PASS')], { window: 30 })
  ids(r).has('confidence') ? pass('confidence drop ≥10pts → confidence alert') : fail(`conf drift: ${JSON.stringify(r.alerts)}`)
}
{
  // prior all PASS, recent half FAIL → fail-rate drift (+50pts)
  const recent = [...frames(15, 80, 'FAIL'), ...frames(15, 80, 'PASS')]
  const r = computeDrift([...frames(30, 80, 'PASS'), ...recent], { window: 30 })
  ids(r).has('fail-rate') ? pass('FAIL-rate jump → fail-rate alert') : fail(`fail drift: ${JSON.stringify(r.alerts)}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
