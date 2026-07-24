#!/usr/bin/env node
// Self-test for check-gate-fires.mjs (meta-gate #50) — proves a silently-inert gate/config can't pass.
//   (a) clean   .theme-check.yml extends a real ruleset → exit 0
//   (b) broken  no `extends:` + a dead rule (ImgLazyLoading) → exit 1 with both config blockers
// Config-only (GATE_FIRES_SKIP_BROKEN=1) so it is deterministic + offline; the known-bad-firing arm is
// exercised live by the real gate run.
//
// Run: node scripts/__fixtures__/gate-fires/run-tests.mjs   ·   Exit: 0 all pass · 1 a case failed

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-gate-fires.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir) {
  const rd = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-test-'))
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env: { ...process.env, REPORT_DIR: rd, GATE_FIRES_SKIP_BROKEN: '1' }, encoding: 'utf-8', timeout: 60000 })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(rd, 'gate-fires.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(rd, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('case (a) a config that extends a real ruleset passes')
{
  const { code } = run('clean')
  code === 0 ? pass('exit 0 on a valid extends: config') : fail(`expected 0 got ${code}`)
}

console.log('case (b) no extends + a dead rule both block')
{
  const { code, ids } = run('broken')
  code === 1 ? pass('exit 1 (config is inert)') : fail(`expected 1 got ${code}`)
  ids.has('gate-fires.config-no-extends') ? pass('blocker: config-no-extends (the .theme-check.yml hole)') : fail('missing config-no-extends')
  ids.has('gate-fires.dead-rule-declared') ? pass('blocker: dead-rule-declared (ImgLazyLoading no-op)') : fail('missing dead-rule-declared')
}

console.log(failures === 0 ? '\ngate-fires: ALL CASES PASS' : `\ngate-fires: ${failures} CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
