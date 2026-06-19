#!/usr/bin/env node
// Self-test for check-discovery.mjs (gate #0.4 — dispatch refusal).
//   (a) GOOD: complete goals.json (§1 schema) + substantive brand-direction.md → exit 0 dispatch-grade.
//   (b) BROKEN content: adjective target + empty priority_surfaces + null cvr + missing area + stub
//        brand → exit 1 with the specific blockers.
//   (c) EMPTY repo (no docs/ at all) → exit 1 with goals-missing + brand-missing at dispatch-grade.
//   (d) BROKEN in DEV mode (no DS_REQUIRE_SCOPE) → exit 0 (warnings only — never blocks dev).
// Run (Node 20): node scripts/__fixtures__/discovery/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-discovery.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-report-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', DISCOVERY_REQUIRED: '', EXISTING_STORE: '', ...env }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'discovery.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('case (a) GOOD discovery at dispatch-grade → expect exit 0')
{
  const { code, report } = runGate(path.join(HERE, 'good'), { DS_REQUIRE_SCOPE: '1' })
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
}

console.log('case (b) BROKEN content at dispatch-grade → expect exit 1 + specific blockers')
{
  const { code, report } = runGate(path.join(HERE, 'broken'), { DS_REQUIRE_SCOPE: '1' })
  const ids = blockerIds(report)
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['discovery.goals-area-missing', 'discovery.no-priority-surfaces', 'discovery.no-cvr-target', 'discovery.goal-as-adjective', 'discovery.brand-stub']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (c) EMPTY repo at dispatch-grade → expect exit 1 + goals-missing + brand-missing')
{
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-empty-'))
  const { code, report } = runGate(empty, { DS_REQUIRE_SCOPE: '1' })
  fs.rmSync(empty, { recursive: true, force: true })
  const ids = blockerIds(report)
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}`)
  for (const id of ['discovery.goals-missing', 'discovery.brand-missing']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (d) BROKEN in DEV mode → expect exit 0 (warnings only)')
{
  const { code, report } = runGate(path.join(HERE, 'broken'))
  if (code === 0) pass(`exit 0 (warnings=${(report?.warnings || []).length}, blockers=${(report?.blockers || []).length})`)
  else fail(`expected exit 0 in dev, got ${code}`)
  if ((report?.blockers || []).length === 0) pass('no blockers in dev mode')
  else fail(`dev mode produced blockers: ${JSON.stringify([...blockerIds(report)])}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
