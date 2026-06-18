#!/usr/bin/env node
// Self-test for check-commerce-readiness.mjs (gate #15).
//   (a) SELLABLE theme (main-product has form + price + variant) → exit 0
//   (b) EDITORIAL-ONLY theme (product template main = editorial hero, no commerce) → exit 1
//        with commerce.pdp-no-buy
// Run (Node 20): node scripts/__fixtures__/commerce/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-commerce-readiness.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commerce-report-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', ALLOW_COMMERCE_WAIVER: '' }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'commerce-readiness.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

console.log('case (a) sellable theme (form + price + variant) → expect exit 0')
{
  const { code, report } = runGate(path.join(HERE, 'sellable'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

console.log('case (b) editorial-only product template (no commerce) → expect exit 1')
{
  const { code, report } = runGate(path.join(HERE, 'editorial-only'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  if (ids.has('commerce.pdp-no-buy')) pass('blocker present: commerce.pdp-no-buy')
  else fail(`missing expected blocker: commerce.pdp-no-buy (saw ${[...ids].join(', ') || 'none'})`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
