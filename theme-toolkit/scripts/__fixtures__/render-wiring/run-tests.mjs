#!/usr/bin/env node
// Self-test for check-render-wiring.mjs (gate #14). Asserts the tokens-RENDER enforcer:
//   (a) WIRED   theme (schemes in settings_data + .color-scheme CSS + @font-face + font-family) → exit 0
//   (b) UNWIRED theme (color-scheme classes + declared custom font, but empty settings_data,
//                      no theme CSS, no font loaded) → exit 1 with rw.scheme-unwired + rw.font-unwired
//
// Run (Node 20): node scripts/__fixtures__/render-wiring/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-render-wiring.mjs')

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }

function runGate(themeDir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-report-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', DS_REQUIRE_SCOPE: '', ALLOW_RW_WAIVER: '' }
  const r = spawnSync('node', [GATE], { cwd: themeDir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'render-wiring.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

console.log('case (a) wired theme (schemes + font actually wired) → expect exit 0')
{
  const { code, report } = runGate(path.join(HERE, 'wired'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

console.log('case (b) unwired theme (color-scheme classes + custom font, nothing wired) → expect exit 1')
{
  const { code, report } = runGate(path.join(HERE, 'unwired'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['rw.scheme-unwired', 'rw.font-unwired']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
