#!/usr/bin/env node
// lens:surface — the Maestro-Loop ITERATION UNIT. Runs the full Lens pass (capture → vision-judge →
// enforce) scoped to ONE surface so a draft→render→see→fix round is seconds, not a whole-store sweep.
// This is what makes "Lens after every surface" (maestro-build-protocol.md §1) cheap enough to loop.
//
// Enforce (check-visual-truth.mjs) already auto-scopes to whatever was captured, so capturing +
// judging a single surface makes the enforce single-surface too — no new enforce flag needed.
//
// Usage:
//   THEME_PREVIEW_URL=<dev url> node lens-surface.mjs <surface> [--viewports mobile,desktop]
//   THEME_PREVIEW_URL=http://127.0.0.1:9292 node lens-surface.mjs home
//   (surface ∈ home|pdp|collection|cart|search|account — must have a lens-rubrics/<surface>.json)
//
// Env: THEME_PREVIEW_URL (required — `pnpm theme:dev --print-url`) · THEME_STORE_PASSWORD ·
//      LENS_REQUIRE=1 (default here: a missing capture/judge BLOCKs — this is an enforce loop) ·
//      REPORT_DIR (gate-reports)
// Exit: 0 = surface PASSes Lens · 1 = visual defect (fix + re-run) · 2 = env error

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const die = (code, msg) => { console.error(`lens:surface: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: THEME_PREVIEW_URL=<url> node lens-surface.mjs <surface> [--viewports mobile,desktop]')
  process.exit(0)
}
const surface = argv.find(a => !a.startsWith('--'))
if (!surface) die(2, 'no surface — node lens-surface.mjs <home|pdp|collection|cart|search|account>')
if (!process.env.THEME_PREVIEW_URL && !process.env.LENS_PREVIEW_URL) {
  die(2, 'THEME_PREVIEW_URL not set — start the preview (`pnpm theme:dev`, copy the URL). This loop SEES the rendered surface.')
}
const vpIdx = argv.indexOf('--viewports')
const viewports = vpIdx !== -1 ? argv[vpIdx + 1] : null

const env = { ...process.env, LENS_REQUIRE: process.env.LENS_REQUIRE || '1', REPORT_DIR: process.env.REPORT_DIR || 'gate-reports' }
if (process.env.LENS_PREVIEW_URL && !env.THEME_PREVIEW_URL) env.THEME_PREVIEW_URL = process.env.LENS_PREVIEW_URL

const steps = [
  ['lens-capture.mjs', ['--surfaces', surface, ...(viewports ? ['--viewports', viewports] : [])], 'capture'],
  ['lens-judge.mjs', ['--surfaces', surface], 'vision-judge'],
  ['check-visual-truth.mjs', [], 'enforce'],
]
for (const [script, args, label] of steps) {
  const s = fileURLToPath(new URL(`./${script}`, import.meta.url))
  console.log(`lens:surface[${surface}] → ${label}`)
  const r = spawnSync(process.execPath, [s, ...args], { stdio: 'inherit', env })
  if (r.error) die(2, `${label} failed to run: ${r.error.message}`)
  if ((r.status ?? 1) !== 0) {
    if (label === 'enforce') die(1, `surface "${surface}" has a visual defect (see gate-reports/lens/). Fix in context + re-run \`pnpm lens:surface ${surface}\`. ≤3 rounds then escalate (maestro-build-protocol §1).`)
    die(r.status ?? 2, `${label} exited ${r.status}`)
  }
}
console.log(`lens:surface[${surface}] ✓ PASS — surface cleared the eyes; record it in build-state.md + move to the next surface.`)
process.exit(0)
