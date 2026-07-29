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
// B9 (2026-07-29): a full done-check is a PUBLISH verdict — run the stack at publish-grade so "done" can
// never be softer than what shopify-theme-push demands (it runs --require-full). A full run already reaches
// publish-grade via applyPublishGrade(mode='full'); setting the envs explicitly makes the invariant robust,
// adds LENS_REQUIRE, and matches maestro-build. A `--gate <subset>` fast dev check is exempt — it can't be a
// publish verdict anyway (renderVerified below is false without mode=full).
const willBeFull = !!(process.env.THEME_PREVIEW_URL || (process.env.STORE && process.env.THEME_ID))
const gradeEnv = (willBeFull && gateArgs.length === 0)
  ? { DS_REQUIRE_SCOPE: '1', STRICT_CONVERSION: '1', BASELINE_ENFORCE: '1', LENS_REQUIRE: '1' }
  : {}
const r = spawnSync(process.execPath, [gatesScript, ...gateArgs, '--report-dir', REPORT_DIR], { cwd, env: { ...process.env, ...gradeEnv }, encoding: 'utf-8', stdio: ['ignore', 'inherit', 'inherit'] })

let summary
try { summary = JSON.parse(fs.readFileSync(path.join(cwd, REPORT_DIR, 'summary.json'), 'utf-8')) } catch {
  console.error('\ndone-check: ENV-ERROR — no summary.json produced (gates could not run — check preflight-repo.mjs)'); process.exit(2)
}

const gates = summary.gates || {}
const totalBlockers = Object.values(gates).reduce((n, g) => n + ((g.blockers || []).length), 0)
const lens = gates['visual-check'] || gates['visual-truth'] || null
const orch = gates['orchestration'] || null
const ref = gates['reference-match'] || null
const sval = gates['shopify-validate'] || null
const cond = (ok, label, detail) => ({ ok, label, detail })
// RENDER-verified: a static-only run (no THEME_PREVIEW_URL) never looked at the rendered pixels — #18's
// REQUIRE is off, so its "0 blockers" is VACUOUS and `lensOk` below goes vacuously true. mode==='full'
// forces #18 to really capture + judge; it is the honest render-verified signal. This is now a hard term of
// `done` (mirrors maestro-build.mjs, which already fails closed on static-only — the CLI gate was weaker).
// Explicit escape hatch for the rare intentional static check: DONE_ALLOW_STATIC=1.
const renderVerified = summary.mode === 'full' || process.env.DONE_ALLOW_STATIC === '1'
const conditions = [
  cond(summary.pass === true, 'Every gate passes (no blockers, no unwaived skip)', `${totalBlockers} blocker(s) across ${Object.keys(gates).length} gate(s)`),
  cond(renderVerified, 'Render verified at full grade (preview URL → Lens judged real pixels)', `mode=${summary.mode}${!renderVerified ? ' — set THEME_PREVIEW_URL so Lens judges the pixels' : ''}`),
  cond(lens ? (lens.blockers || []).length === 0 && lens.skipped !== true : null, 'Lens visual-truth (#18) — the rendered pixels agree', lens ? `${(lens.blockers || []).length} visual blocker(s)` : 'not run (no preview URL)'),
  cond(orch ? (orch.blockers || []).length === 0 : null, 'Orchestration coherent (#44)', orch ? `${(orch.blockers || []).length} blocker(s)` : 'n/a'),
  cond(sval ? (sval.blockers || []).length === 0 && sval.skipped !== true : null, "Shopify's own validator passes (#49)", sval ? `${(sval.blockers || []).length} validator blocker(s)` : 'n/a — not run'),
  cond(ref ? (ref.blockers || []).length === 0 : null, 'Matches the client\'s reference (#46)', ref ? `${(ref.blockers || []).length} divergence blocker(s)` : 'n/a — no reference registered'),
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
// Reference-match is N/A-TOLERANT (unlike Lens): if the client never sent a reference there is nothing
// to match, so absence must not block. But if a reference IS registered and the build diverges from it,
// that is not done — "every gate green" was never proof we built the right thing (cravinbyandy hero).
const refOk = ref ? (ref.blockers || []).length === 0 : true
// shopify-validate (#49) — Shopify's OWN validator over the build's Liquid (Phase-2 Stage 1). N/A-tolerant
// like ref: if it was not in this run's scope, absence must not block; but if it RAN and found blockers
// (or skipped-but-passed), the build is not done — our other gates enforce rules WE wrote, this one
// enforces Shopify's, so a green stack that never ran Shopify's validator is not a real "done".
const svalOk = sval ? ((sval.blockers || []).length === 0 && sval.skipped !== true) : true
// 2026-07-23 — `dirty` and `mode` were PRINTED in the condition table above but were never terms of
// `done`, so done-check exited 0 on an uncommitted, static-only tree that shopify-theme-push.mjs would
// refuse (it runs `theme-gates --verify --require-full`, which demands mode=full + dirty=false). The
// agent was taught only the weaker gate, so "done" and "publishable" disagreed. They now agree.
// A dirty tree also means the evidence binds to no SHA — the 2026-07-22 forensics failure mode.
const cleanTree = summary.dirty === false
// `done` REQUIRES renderVerified — the 2026-07-29 audit found done-check printed "✅ DONE — every condition
// proven" on a static-only run with ZERO pixels judged (mode was PRINTED but was never a term, and lensOk
// was vacuously true). It is now a hard term, matching maestro-build.mjs's static-only refusal.
const done = summary.pass === true && renderVerified && lensOk && refOk && svalOk && cleanTree
if (done) {
  console.log('\n✅ DONE — every condition proven. Safe to say done.')
  process.exit(0)
}
console.log('\n❌ NOT DONE — do NOT say done. Loop: list the blockers above, fix each (your own way), re-run done-check.')
if (!renderVerified) console.log('   (static-only run — the RENDER was never verified. A build is NOT done until Lens judges the real pixels: set THEME_PREVIEW_URL and re-run. Override only via DONE_ALLOW_STATIC=1 — discouraged.)')
else if (!lensOk && summary.pass === true) console.log('   (gates pass but Lens flagged the render — see gate-reports/visual-check.json.)')
if (!refOk) console.log('   (the build DIVERGES from the reference the client sent — see gate-reports/reference-match.json. Fix the divergences, do not re-explain them.)')
if (!svalOk) console.log("   (Shopify's own validator flagged the Liquid — see gate-reports/shopify-validate.json. Fix the unknown/deprecated filters, missing snippets or schema errors it names.)")
if (!cleanTree) console.log('   (uncommitted edits — commit them. Evidence that binds to no SHA is why 8 gates once skipped and still reported pass. `shopify-theme-push.mjs` refuses a dirty tree too.)')
process.exit(1)
