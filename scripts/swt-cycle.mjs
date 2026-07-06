#!/usr/bin/env node
// swt-cycle — ONE command for the train + measure cycle (replaces the ~6 hand-run steps).
//   ① distribute  FAQ brain → per-agent rule packs + digest + gate-coverage
//   ② reindex     semantic store (so memory_search retrieves the new rules) — inside distribute()
//   ③ quality-loop (optional) a build's gate-reports → snapshot + promote enforced rules from real defects
//   ④ quality-trend  the day-by-day scoreboard
//
// Usage: node scripts/swt-cycle.mjs [buildDir]
//   buildDir (optional) → harvest that build's defects (snapshot + rule promotion).
//   Env: SWT_REINDEX=0 to skip the semantic reindex (faster dry run) · PROMOTE_MIN (rule-promotion bar).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { distribute } from './swt-distribute.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath: repo path has a space
const REPO = path.join(HERE, '..')
const run = (script, args = []) => spawnSync('node', [path.join(HERE, script), ...args], { stdio: 'inherit', cwd: REPO })
const bar = '━'.repeat(60)

const t0 = Date.now()
console.log(`\n${bar}\nswt-cycle — train + measure\n${bar}`)

console.log('① distribute — FAQ brain → per-agent packs + digest + gate-coverage')
const d = distribute()
console.log(`   ${d.faqs} FAQs → ${d.rules} rules · ${d.agentsUpdated}/14 agents · ${d.coverage.enforced} ENFORCED / ${d.coverage.guideline} guideline · ${d.gateGaps} gate-gaps`)

console.log(`② reindex — ${d.reindex.ok === null ? 'skipped (SWT_REINDEX=0)' : d.reindex.ok ? 'OK · ' + d.reindex.out : 'FAILED (Ollama down?) · ' + d.reindex.out}`)

const buildDir = process.argv[2]
if (buildDir) {
  console.log(`③ quality-loop — ${buildDir}`)
  run('quality-loop.mjs', [buildDir])
} else {
  console.log('③ quality-loop — skipped (pass a buildDir to harvest defects + promote rules)')
}

console.log('④ quality-trend —')
run('quality-trend.mjs')

console.log(`${bar}\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s\n${bar}\n`)
