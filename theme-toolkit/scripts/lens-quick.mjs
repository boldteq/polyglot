#!/usr/bin/env node
// Lens — Visual Truth Layer · QUICK MODE (Class-D micro-change gate). SAOS §2 Class D ("micro-change":
// copy swap, color/spacing tweak, swap an image, toggle a setting) previously routed
// CONFIGURE-or-EXTEND-check → change → smoke with ZERO pixel verification — the gap that let small
// visual regressions ship silently and forced Yash to re-report the same class of bug repeatedly
// (see shopify-website-team-visual-qa-gap-2026-07-18.md). This composes the EXISTING three-layer
// Lens pipeline (lens-capture.mjs → lens-judge.mjs → check-visual-truth.mjs) at reduced cost instead
// of reimplementing capture/judge logic:
//   - LENS_DEPTH=fast forces the 3 core viewports (mobile/tablet/desktop) instead of the 6-viewport
//     publish-grade sweep — already supported by lens-capture.mjs, just never invoked for Class D.
//   - LENS_JUDGE_MODEL defaults to a fast/cheap tier (haiku) instead of the deep-gate default
//     (sonnet) — lens-judge.mjs already reads this env var, it was just never set to anything but the
//     sonnet default anywhere in the toolkit or doctrine.
//   - check-visual-truth.mjs runs WITHOUT DS_REQUIRE_SCOPE/LENS_REQUIRE, so missing coverage WARNs
//     (not publish-grade), but a real defect (render-error/overflow/judge-FAIL) still exits 1 — a
//     Class-D change is not "done" while this fails.
//
// Usage: node lens-quick.mjs --surfaces home,pdp [--model haiku] [--viewports mobile,desktop]
// Env:   THEME_PREVIEW_URL (required, same as lens-capture.mjs) · LENS_QUICK_MODEL (default haiku,
//        overrides --model's default) · REPORT_DIR (default gate-reports)
// Exit:  0 = pass · 1 = a real visual defect was found (fix before marking the Class-D change done)
//        2 = env/usage error

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const die = (code, msg) => { console.error(`lens-quick: ${code === 2 ? 'USAGE' : 'ERROR'} — ${msg}`); process.exit(code) }

function parseArgs() {
  const a = process.argv.slice(2)
  const out = { surfaces: null, viewports: 'mobile,tablet,desktop', model: process.env.LENS_QUICK_MODEL || 'haiku' }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--help' || a[i] === '-h') {
      console.log('node lens-quick.mjs --surfaces a,b [--model haiku] [--viewports mobile,tablet,desktop]')
      process.exit(0)
    } else if (a[i] === '--surfaces') out.surfaces = (a[++i] || '').trim()
    else if (a[i] === '--model') out.model = (a[++i] || '').trim()
    else if (a[i] === '--viewports') out.viewports = (a[++i] || '').trim()
  }
  return out
}

function run(script, args, env) {
  console.log(`lens-quick: → node ${script} ${args.join(' ')}`)
  const r = spawnSync('node', [path.join(HERE, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return r.status ?? 2
}

const opts = parseArgs()
if (!opts.surfaces) die(2, '--surfaces is required — a Class-D change touches a known surface (e.g. --surfaces pdp). Pass the specific page(s) the edit changed, not the whole site.')
if (!process.env.THEME_PREVIEW_URL) die(2, 'THEME_PREVIEW_URL is not set — point it at the live theme-dev/staging preview before running the quick check.')

const captureEnv = { LENS_DEPTH: 'fast' }
const judgeEnv = { LENS_JUDGE_MODEL: opts.model }

let status = run('lens-capture.mjs', ['--surfaces', opts.surfaces, '--viewports', opts.viewports], captureEnv)
if (status === 2) die(2, 'lens-capture.mjs failed with an env error — see output above.')
if (status !== 0) console.log('lens-quick: capture reported issues (render-error/overflow) — continuing to judge so the report is complete.')

status = run('lens-judge.mjs', ['--surfaces', opts.surfaces], judgeEnv)
if (status === 2) die(2, 'lens-judge.mjs failed with an env error — see output above.')

const enforceStatus = run('check-visual-truth.mjs', [], {})
console.log(`lens-quick: ${enforceStatus === 0 ? 'PASS — no visual defects found on the touched surface(s).' : 'BLOCK — see gate-reports/lens/index.html for the finding(s) before marking this Class-D change done.'}`)
process.exit(enforceStatus === 0 ? 0 : 1)
