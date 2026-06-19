#!/usr/bin/env node
// Toolkit regression gate — runs EVERY gate fixture self-test (__fixtures__/<gate>/run-tests.mjs)
// in one pass and fails if any does. `pnpm test`. Keeps the 18-gate stack honest: a change that
// breaks a gate's behavior (or a false-positive fix) is caught here, not in a client build.
//
// Usage: node run-all-tests.mjs   ·   Exit: 0 = all suites pass · 1 = ≥1 suite failed

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FX = path.join(HERE, '__fixtures__')

const suites = fs.existsSync(FX)
  ? fs.readdirSync(FX, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(FX, d.name, 'run-tests.mjs')))
      .map(d => d.name).sort()
  : []

if (!suites.length) { console.error('run-all-tests: no fixture suites found'); process.exit(1) }

console.log(`toolkit tests — ${suites.length} gate fixture suite(s)\n`)
let failed = 0
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(FX, s, 'run-tests.mjs')], { encoding: 'utf-8' })
  const ok = r.status === 0
  const last = (r.stdout || '').trim().split('\n').pop() || ''
  console.log(`  ${ok ? '✓' : '✗'} ${s.padEnd(16)} ${last}`)
  if (!ok) { failed += 1; const out = (r.stdout || '') + (r.stderr || ''); console.log(out.split('\n').filter(l => /FAIL/.test(l)).map(l => `      ${l.trim()}`).join('\n')) }
}
console.log(failed ? `\n${failed}/${suites.length} suite(s) FAILED` : `\nALL ${suites.length} SUITES PASS`)
process.exit(failed ? 1 : 0)
