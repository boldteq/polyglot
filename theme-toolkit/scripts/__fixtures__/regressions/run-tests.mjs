#!/usr/bin/env node
// Self-test for the Lens regression registry (WS-D): the PURE escalation rule + the #18 wiring
// (a cleared finding that returns escalates to a publish-grade blocker — "the same bug shipped twice").
// Run: node scripts/__fixtures__/regressions/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const { applyRegressionRegistry } = await import(path.resolve(HERE, '..', '..', 'lib', 'lens-regressions.mjs'))
const VT = path.resolve(HERE, '..', '..', 'check-visual-truth.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const NOW = '2026-06-21T00:00:00Z'

console.log('applyRegressionRegistry — PURE escalation rule')
{
  const { escalations, registry } = applyRegressionRegistry([{ check: 'css-layout', surface: 'home', key: 'home-mobile' }], { entries: {} }, NOW)
  escalations.length === 0 && registry.entries['css-layout::home-mobile']?.status === 'open' ? ok('new finding → open, no escalation') : bad(`new: esc=${escalations.length}`)
}
{
  const prior = { entries: { 'css-layout::home-mobile': { check: 'css-layout', surface: 'home', status: 'open', recurrences: 0 } } }
  const { registry } = applyRegressionRegistry([], prior, NOW)
  registry.entries['css-layout::home-mobile']?.status === 'cleared' ? ok('open then absent → cleared (fixed this run)') : bad('open→absent not cleared')
}
{
  const prior = { entries: { 'css-layout::home-mobile': { check: 'css-layout', surface: 'home', status: 'cleared', recurrences: 0 } } }
  const { escalations, registry } = applyRegressionRegistry([{ check: 'css-layout', surface: 'home', key: 'home-mobile' }], prior, NOW)
  escalations.length === 1 && escalations[0].recurrences === 1 && registry.entries['css-layout::home-mobile']?.status === 'open'
    ? ok('cleared → recurs → escalation ×1 + flips back to open') : bad(`recur: esc=${escalations.length} rec=${escalations[0]?.recurrences}`)
}

console.log('#18 wiring — a recurring (previously-cleared) warning escalates to a publish-grade BLOCKER')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'))
  const lens = path.join(tmp, 'gate-reports', 'lens'); fs.mkdirSync(path.join(lens, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lens, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', frames: [{ surface: 'home', viewport: 'mobile', key: 'home-mobile', theme: 'light', nav: 'ok', url: 'x', frames: { rest: '', scrollEnd: '' } }] }))
  fs.writeFileSync(path.join(lens, 'judge', 'home-mobile.json'), JSON.stringify({ surface: 'home', viewport: '375x812', key: 'home-mobile', verdict: 'PASS', confidence: 95, findings: [{ check: 'spacing-rhythm', severity: 'warning', evidence: 'tight gaps' }] }))
  // seed: this finding was CLEARED on a prior run → its return is a regression
  fs.writeFileSync(path.join(tmp, '.lens-regressions.json'), JSON.stringify({ version: 1, entries: { 'spacing-rhythm::home-mobile': { check: 'spacing-rhythm', surface: 'home', status: 'cleared', recurrences: 0 } } }))
  const r = spawnSync(process.execPath, [VT], { cwd: tmp, encoding: 'utf-8', env: { ...process.env, DS_REQUIRE_SCOPE: '1', LENS_REGISTRY_DIR: tmp } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  r.status === 1 && ids.has('vt.regression') ? ok('cleared warning returns → exit 1 + vt.regression BLOCKER') : bad(`wiring: code ${r.status}, blockers ${[...ids]}`)
  // and the registry flipped the entry back to open
  let reg = null; try { reg = JSON.parse(fs.readFileSync(path.join(tmp, '.lens-regressions.json'), 'utf-8')) } catch {}
  reg?.entries?.['spacing-rhythm::home-mobile']?.status === 'open' ? ok('registry entry flipped cleared → open') : bad('registry not updated')
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
