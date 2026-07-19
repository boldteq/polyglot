#!/usr/bin/env node
// done-check — the ONE "is it REALLY done?" command the agent must pass before ever saying "done"
// (2026-07-19 anti-premature-done). Runs the full gate stack, then reports a per-condition DONE/NOT-DONE
// table from the REAL evidence (summary.pass + Lens #18 + blocker count), exit 0 ONLY when truly done.
// The doctrine (CLAUDE.md + agent AIM contracts): you may not report a Shopify build/change done until
// this exits 0 and you have shown its output — otherwise you loop (list bugs → fix → re-test).
//
// Run from the CLIENT REPO ROOT: node toolkit/scripts/done-check.mjs [--gate a,b]  (default: full stack)
// Exit: 0 = DONE (all green) · 1 = NOT DONE (blockers listed) · 2 = env/couldn't-run.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const gatesScript = path.join(HERE, 'theme-gates.mjs')

if (!fs.existsSync(gatesScript)) { console.error('done-check: ENV-ERROR — toolkit not found (run from the repo root; vendor toolkit/ first: /shopify-bootstrap)'); process.exit(2) }

// run the full stack (or a --gate subset for a fast per-change check)
const gateArgs = []
const gi = process.argv.indexOf('--gate')
if (gi !== -1 && process.argv[gi + 1]) for (const g of process.argv[gi + 1].split(',')) gateArgs.push('--gate', g.trim())
console.log('done-check: running the gate stack…\n')
const r = spawnSync(process.execPath, [gatesScript, ...gateArgs, '--report-dir', REPORT_DIR], { cwd, encoding: 'utf-8', stdio: ['ignore', 'inherit', 'inherit'] })

let summary
try { summary = JSON.parse(fs.readFileSync(path.join(cwd, REPORT_DIR, 'summary.json'), 'utf-8')) } catch {
  console.error('\ndone-check: ENV-ERROR — no summary.json produced (gates could not run — check preflight-repo.mjs)'); process.exit(2)
}

const gates = summary.gates || {}
const totalBlockers = Object.values(gates).reduce((n, g) => n + ((g.blockers || []).length), 0)
const lens = gates['visual-check'] || gates['visual-truth'] || null
const orch = gates['orchestration'] || null
const cond = (ok, label, detail) => ({ ok, label, detail })
const conditions = [
  cond(summary.pass === true, 'Every gate passes (no blockers, no unwaived skip)', `${totalBlockers} blocker(s) across ${Object.keys(gates).length} gate(s)`),
  cond(summary.mode === 'full', 'Ran at full grade (preview URL present → URL + Lens gates in scope)', `mode=${summary.mode}${summary.mode !== 'full' ? ' — set THEME_PREVIEW_URL for functional/perf/a11y/Lens' : ''}`),
  cond(lens ? (lens.blockers || []).length === 0 && lens.skipped !== true : null, 'Lens visual-truth (#18) — the rendered pixels agree', lens ? `${(lens.blockers || []).length} visual blocker(s)` : 'not run (no preview URL)'),
  cond(orch ? (orch.blockers || []).length === 0 : null, 'Orchestration coherent (#44)', orch ? `${(orch.blockers || []).length} blocker(s)` : 'n/a'),
  cond(summary.dirty === false, 'Working tree committed (evidence binds to a real SHA)', summary.dirty ? 'uncommitted edits — commit before this counts as publish-ready' : 'clean'),
]

console.log('\n─── done-check ───')
for (const c of conditions) {
  const m = c.ok === true ? '✅' : c.ok === false ? '❌' : '➖'
  console.log(`${m} ${c.label}${c.detail ? `  ·  ${c.detail}` : ''}`)
}

// DONE = the store is verifiably correct: all gates pass AND (Lens ran clean if a URL was available).
// Lens null (no URL) does NOT count as done — a real "done" needs the rendered check.
const lensOk = lens ? ((lens.blockers || []).length === 0 && lens.skipped !== true) : false
const done = summary.pass === true && lensOk
if (done) {
  console.log('\n✅ DONE — every condition proven. Safe to say done.')
  process.exit(0)
}
console.log('\n❌ NOT DONE — do NOT say done. Loop: list the blockers above, fix each (your own way), re-run done-check.')
if (!lensOk && summary.pass === true) console.log('   (gates pass but the RENDER was not verified — run with THEME_PREVIEW_URL so Lens can look at the pixels.)')
process.exit(1)
