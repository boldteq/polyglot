#!/usr/bin/env node
// Toolkit regression gate — runs EVERY gate fixture self-test (__fixtures__/<gate>/run-tests.mjs)
// in one pass and fails if any does. `pnpm test`. Keeps the 18-gate stack honest: a change that
// breaks a gate's behavior (or a false-positive fix) is caught here, not in a client build.
//
// Usage: node run-all-tests.mjs   ·   Exit: 0 = all suites pass · 1 = ≥1 suite failed

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FX = path.join(HERE, '__fixtures__')

const suites = fs.existsSync(FX)
  ? fs.readdirSync(FX, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(FX, d.name, 'run-tests.mjs')))
      .map(d => d.name).sort()
  : []

if (!suites.length) { console.error('run-all-tests: no fixture suites found'); process.exit(1) }

// Suites are independent processes over their own temp dirs, so they run CONCURRENTLY. Sequentially
// this crossed the 10-minute single-command cap once audits-live landed, and a suite that cannot be run
// in one command is a suite people stop running — the same "nobody runs it" failure the gates
// themselves keep hitting.
//
// Bounded, not unbounded: several fixtures drive a real chromium (functional-url, lens-visibility,
// section-cohesion) and a few spawn the whole static gate stack (audits-live, vacuous-pass), so an
// unbounded fan-out would thrash. TEST_CONCURRENCY overrides.
const CONCURRENCY = Math.max(1, Number(process.env.TEST_CONCURRENCY) || Math.min(4, Math.max(1, os.cpus().length - 1)))

console.log(`toolkit tests — ${suites.length} gate fixture suite(s) · concurrency ${CONCURRENCY}\n`)
const t0 = Date.now()

function runSuite(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [path.join(FX, name, 'run-tests.mjs')], { encoding: 'utf-8' })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('error', (e) => resolve({ name, code: 1, out: String(e.message), ms: Date.now() - started }))
    child.on('close', (code) => resolve({ name, code, out, ms: Date.now() - started }))
  })
}

// Results are printed in MANIFEST ORDER regardless of finish order, so the output stays diffable.
const results = new Map()
let next = 0
async function worker() {
  while (next < suites.length) {
    const name = suites[next++]
    results.set(name, await runSuite(name))
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, suites.length) }, worker))

let failed = 0
let slowest = { name: '-', ms: 0 }
for (const s of suites) {
  const r = results.get(s) || { code: 1, out: 'no result', ms: 0 }
  const ok = r.code === 0
  const last = (r.out || '').trim().split('\n').pop() || ''
  if (r.ms > slowest.ms) slowest = { name: s, ms: r.ms }
  console.log(`  ${ok ? '✓' : '✗'} ${s.padEnd(16)} ${last}`)
  if (!ok) { failed += 1; console.log((r.out || '').split('\n').filter(l => /FAIL/.test(l)).map(l => `      ${l.trim()}`).join('\n')) }
}
const wall = ((Date.now() - t0) / 1000).toFixed(0)
console.log(failed ? `\n${failed}/${suites.length} suite(s) FAILED · ${wall}s` : `\nALL ${suites.length} SUITES PASS · ${wall}s (slowest: ${slowest.name} ${(slowest.ms / 1000).toFixed(0)}s)`)
process.exit(failed ? 1 : 0)
