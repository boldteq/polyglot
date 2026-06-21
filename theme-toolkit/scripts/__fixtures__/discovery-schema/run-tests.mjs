#!/usr/bin/env node
// Self-test for #13 — the schema-validation pass + the opt-in LLM positioning judge in check-discovery.
//   (a) bad-shape: revenue is an ARRAY — the procedural checks pass it (typeof []==='object'), only the
//       SCHEMA catches it → dispatch-grade exit 1 with discovery.schema:revenue (proves schema is wired).
//   (b) same repo in DEV mode → exit 0, 0 blockers (schema findings are warnings in dev).
//   (c) clean repo, judge OFF → exit 0 (no positioning finding without the flag).
//   (d) clean repo + DISCOVERY_JUDGE=1 + a "vague" stub CLI → exit 1 + discovery.vague-positioning.
//   (e) clean repo + DISCOVERY_JUDGE=1 + a "specific" stub CLI → exit 0, no positioning finding.
// The judge CLI is stubbed (CLAUDE_BIN) so the suite is deterministic + offline.
// Run (Node 20): node scripts/__fixtures__/discovery-schema/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-discovery.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-schema-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', DISCOVERY_REQUIRED: '', EXISTING_STORE: '', DISCOVERY_JUDGE: '', CLAUDE_BIN: '', ...env }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'discovery.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

// write an executable stub CLI that ignores its args and prints a fixed judge verdict
function makeStub(verdict) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'judge-stub-')), 'claude')
  fs.writeFileSync(f, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ verdict, reason: 'stub' }))})\n`)
  fs.chmodSync(f, 0o755)
  return f
}

console.log('(a) bad-shape (revenue:[]) at dispatch-grade → schema-only block')
{
  const { code, report } = runGate(path.join(HERE, 'bad-shape'), { DS_REQUIRE_SCOPE: '1' })
  const ids = blockerIds(report)
  code === 1 ? pass('exit 1 (block)') : fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  ids.has('discovery.schema:revenue') ? pass('schema blocker discovery.schema:revenue present') : fail(`missing discovery.schema:revenue (saw ${[...ids].join(', ') || 'none'})`)
}

console.log('(b) bad-shape in DEV mode → exit 0, 0 blockers (schema findings are warnings)')
{
  const { code, report } = runGate(path.join(HERE, 'bad-shape'))
  code === 0 ? pass('exit 0 in dev') : fail(`expected exit 0, got ${code}`)
  ;(report?.blockers || []).length === 0 ? pass('no blockers in dev') : fail(`dev produced blockers: ${JSON.stringify([...blockerIds(report)])}`)
  ;(report?.warnings || []).some(w => w.id === 'discovery.schema:revenue') ? pass('schema issue surfaced as a warning in dev') : fail('expected discovery.schema:revenue warning in dev')
}

console.log('(c) clean repo, judge OFF → exit 0, no positioning finding')
{
  const { code, report } = runGate(path.join(HERE, 'clean'), { DS_REQUIRE_SCOPE: '1' })
  code === 0 ? pass('exit 0 (clean)') : fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
  !blockerIds(report).has('discovery.vague-positioning') ? pass('no vague-positioning without the judge flag') : fail('judge ran without DISCOVERY_JUDGE=1')
}

console.log('(d) clean repo + judge ON + vague stub → exit 1 + discovery.vague-positioning')
{
  const stub = makeStub('vague')
  const { code, report } = runGate(path.join(HERE, 'clean'), { DS_REQUIRE_SCOPE: '1', DISCOVERY_JUDGE: '1', CLAUDE_BIN: stub })
  fs.rmSync(path.dirname(stub), { recursive: true, force: true })
  code === 1 ? pass('exit 1 (vague positioning blocks at dispatch-grade)') : fail(`expected exit 1, got ${code}`)
  blockerIds(report).has('discovery.vague-positioning') ? pass('discovery.vague-positioning present') : fail(`missing vague-positioning (saw ${[...blockerIds(report)].join(', ') || 'none'})`)
}

console.log('(e) clean repo + judge ON + specific stub → exit 0, no positioning finding')
{
  const stub = makeStub('specific')
  const { code, report } = runGate(path.join(HERE, 'clean'), { DS_REQUIRE_SCOPE: '1', DISCOVERY_JUDGE: '1', CLAUDE_BIN: stub })
  fs.rmSync(path.dirname(stub), { recursive: true, force: true })
  code === 0 ? pass('exit 0 (specific positioning passes)') : fail(`expected exit 0, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
  !blockerIds(report).has('discovery.vague-positioning') ? pass('no vague-positioning on a specific verdict') : fail('specific verdict wrongly flagged')
}

console.log('(f) #16 brand-direction with NO structured references → brand-references-thin at dispatch')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-thinref-'))
  fs.mkdirSync(path.join(d, 'docs', 'discovery'), { recursive: true })
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.copyFileSync(path.join(HERE, 'clean', 'docs', 'discovery', 'goals.json'), path.join(d, 'docs', 'discovery', 'goals.json'))
  // ≥60 words of plain prose, no "reference", no "Brand — detail" / "Label:" structure → fails #16 only
  fs.writeFileSync(path.join(d, 'docs', 'design', 'brand-direction.md'), 'Brand direction for a calm sleep supplement aimed at tired professionals who wake at three in the morning and want something gentle that actually works without grogginess the next day so they can feel rested and clear headed and ready to perform at their best every single morning of the working week ahead always\n')
  const { code, report } = runGate(d, { DS_REQUIRE_SCOPE: '1' })
  fs.rmSync(d, { recursive: true, force: true })
  code === 1 ? pass('exit 1 (thin references block at dispatch)') : fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...blockerIds(report)])}`)
  blockerIds(report).has('discovery.brand-references-thin') ? pass('discovery.brand-references-thin present') : fail(`missing brand-references-thin (saw ${[...blockerIds(report)].join(', ') || 'none'})`)
}

console.log('(g) #27 goals.json without measurement → measurement-missing at dispatch')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-nomeas-'))
  fs.mkdirSync(path.join(d, 'docs', 'discovery'), { recursive: true })
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  const goals = JSON.parse(fs.readFileSync(path.join(HERE, 'clean', 'docs', 'discovery', 'goals.json'), 'utf-8'))
  delete goals.measurement
  fs.writeFileSync(path.join(d, 'docs', 'discovery', 'goals.json'), JSON.stringify(goals))
  fs.copyFileSync(path.join(HERE, 'clean', 'docs', 'design', 'brand-direction.md'), path.join(d, 'docs', 'design', 'brand-direction.md'))
  const { code, report } = runGate(d, { DS_REQUIRE_SCOPE: '1' })
  fs.rmSync(d, { recursive: true, force: true })
  code === 1 ? pass('exit 1 (no measurement blocks at dispatch)') : fail(`expected exit 1, got ${code}`)
  blockerIds(report).has('discovery.measurement-missing') ? pass('discovery.measurement-missing present') : fail(`missing (saw ${[...blockerIds(report)].join(', ') || 'none'})`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
