#!/usr/bin/env node
// Self-test for check-css-layout.mjs (gate #22 — deterministic CSS-layout complement to Lens).
//   (a) CLEAN section CSS (width:100%, flex-wrap, normal wrap) → exit 0, 0 css findings
//   (b) VIOLATIONS (default dev) → exit 0; all 4 css.* findings present as WARNINGS
//   (c) VIOLATIONS at publish-grade (DS_REQUIRE_SCOPE=1) → exit 1; css.viewport-overflow is a BLOCKER
// Run (Node 20): node scripts/__fixtures__/css-layout/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-css-layout.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runGate(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csslayout-report-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', DS_REQUIRE_SCOPE: '', CSS_LAYOUT_STRICT: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: dir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'layout.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

const EXPECT = ['css.viewport-overflow', 'css.flex-no-wrap', 'css.text-nowrap', 'css.negative-margin']

console.log('case (a) clean section CSS → expect exit 0, 0 css findings')
{
  const { code, report } = runGate(path.join(HERE, 'clean'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}`)
  const findings = [...(report?.warnings || []), ...(report?.blockers || [])].filter(x => x.id.startsWith('css.'))
  if (findings.length === 0) pass('zero css findings on clean')
  else fail(`expected 0 css findings, saw ${findings.map(f => f.id).join(', ')}`)
}

console.log('case (b) violations (dev) → expect exit 0 + all 4 css warnings')
{
  const { code, report } = runGate(path.join(HERE, 'violations'))
  if (code === 0) pass('exit 0 (advisory in dev)')
  else fail(`expected exit 0, got ${code}`)
  const ids = new Set((report?.warnings || []).map(w => w.id))
  for (const id of EXPECT) { if (ids.has(id)) pass(`warning present: ${id}`); else fail(`missing warning: ${id} (saw ${[...ids].join(', ')})`) }
}

console.log('case (c) violations at publish-grade (DS_REQUIRE_SCOPE=1) → expect exit 1, viewport-overflow BLOCKS')
{
  const { code, report } = runGate(path.join(HERE, 'violations'), { DS_REQUIRE_SCOPE: '1' })
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}`)
  const blk = new Set((report?.blockers || []).map(b => b.id))
  if (blk.has('css.viewport-overflow')) pass('blocker present: css.viewport-overflow')
  else fail(`expected css.viewport-overflow blocker (saw ${[...blk].join(', ')})`)
}

console.log('case (d) hero <hr> with no mobile guard → exit 0 + css.hero-rule-bleed WARNING (warn-only); guarded sibling does NOT warn')
{
  const { code, report } = runGate(path.join(HERE, 'hero-rule'))
  if (code === 0) pass('exit 0 (warn-only hint, never blocks)'); else fail(`expected 0, got ${code}`)
  const warns = (report?.warnings || []).filter(w => w.id === 'css.hero-rule-bleed')
  if (warns.length === 1) pass('exactly 1 css.hero-rule-bleed (unguarded fires, fit-content sibling does not)'); else fail(`expected 1 hero-rule warn, saw ${warns.length}: ${warns.map(w => w.page).join(', ')}`)
  if (!(report?.blockers || []).some(b => b.id === 'css.hero-rule-bleed')) pass('hero-rule never blocks'); else fail('hero-rule must never block')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
