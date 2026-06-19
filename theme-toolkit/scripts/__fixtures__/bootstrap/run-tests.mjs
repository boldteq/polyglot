#!/usr/bin/env node
// Self-test for check-bootstrap.mjs (gate #0.5).
//   (a) GOOD theme (design-system.json present + real identity + comment-headed product.json)
//        → exit 0 at publish-grade, AND product.json is NOT flagged (comment-tolerant parse).
//   (b) BROKEN theme (no design-system.json + "GPT TEST" identity + malformed index.json)
//        → exit 1 at publish-grade with bootstrap.ds-missing + .placeholder-identity + .json-invalid.
//   (c) BROKEN theme in DEV mode (no DS_REQUIRE_SCOPE) → exit 0 (warnings only — never blocks dev).
// Run (Node 20): node scripts/__fixtures__/bootstrap/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-bootstrap.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-report-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', BOOTSTRAP_REQUIRED: '', ...env }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'bootstrap.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))
const warnIds = (rep) => new Set((rep?.warnings || []).map(b => b.id))

console.log('case (a) GOOD theme at publish-grade → expect exit 0, product.json NOT flagged')
{
  const { code, report } = runGate(path.join(HERE, 'good'), { DS_REQUIRE_SCOPE: '1' })
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
  const allFindings = [...blockerIds(report), ...warnIds(report)]
  if (!allFindings.includes('bootstrap.json-invalid')) pass('comment-headed product.json NOT flagged (no false positive)')
  else fail('FALSE POSITIVE: comment-headed product.json flagged as invalid')
}

console.log('case (b) BROKEN theme at publish-grade → expect exit 1 + 3 blockers')
{
  const { code, report } = runGate(path.join(HERE, 'broken'), { DS_REQUIRE_SCOPE: '1' })
  const ids = blockerIds(report)
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['bootstrap.ds-missing', 'bootstrap.placeholder-identity', 'bootstrap.json-invalid']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (c) BROKEN theme in DEV mode → expect exit 0 (warnings only, never blocks dev)')
{
  const { code, report } = runGate(path.join(HERE, 'broken'))
  if (code === 0) pass(`exit 0 (warnings=${(report?.warnings || []).length}, blockers=${(report?.blockers || []).length})`)
  else fail(`expected exit 0 in dev, got ${code}`)
  if ((report?.blockers || []).length === 0) pass('no blockers in dev mode')
  else fail(`dev mode produced blockers: ${JSON.stringify([...blockerIds(report)])}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
