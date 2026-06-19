#!/usr/bin/env node
// maestro:run — the PRODUCTION Maestro runner (maestro-build-protocol.md §1). Drives the proven loop
// (lib/maestro-loop.mjs) on a REAL build, hands-off, surface by surface:
//
//   draft (claude consultant) → render (theme:push / live dev) → judge (lens:surface) → record (build-state)
//
// The loop ALGORITHM is proven hermetically by maestro-dryrun.mjs. THIS file is the WIRING — it must
// (a) construct the right subprocess calls, (b) map each tool's exit code to a loop verdict, and
// (c) carry Lens findings into the next round's draft. So `makeRealDeps` takes an injectable `spawn`:
// __fixtures__/maestro/run-tests.mjs drives the whole runner with a FAKE spawn (no live store, no
// claude CLI, no theme dev) and asserts the wiring — the stop-gate before this runs on a client build.
//
// Surfaces come from docs/build-state.json (build-state init). Each surface's verdict is written back
// to build-state (the carried mind) as it converges, and a docs/maestro-report.{json,md} is emitted.
//
// Usage:
//   THEME_PREVIEW_URL=http://127.0.0.1:9292 node maestro-run.mjs            # live-dev render (default)
//   node maestro-run.mjs --surfaces home,pdp,cart --max-rounds 3
//   node maestro-run.mjs --render push                                      # push each draft instead of live-dev
//   node maestro-run.mjs --dry                                              # no-op draft (wiring smoke, no claude)
//
// Env: THEME_PREVIEW_URL (required unless --render push) · THEME_STORE_PASSWORD · BUILD_STATE_DIR (docs)
//      MAESTRO_CLAUDE_BIN (claude) · REPORT_DIR (gate-reports)
// Exit: 0 = every surface converged (allPass) · 1 = ≥1 surface escalated/errored · 2 = setup error.
//
// No external deps. No Date.now()/Math.random() (determinism; caller stamps via MAESTRO_TS). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runMaestroLoop, MAESTRO_MAX_ROUNDS } from './lib/maestro-loop.mjs'
import { preflight, formatChecklist } from './maestro-preflight.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url))

// ── verdict mapping ────────────────────────────────────────────────────────────
// lens-surface.mjs exit codes: 0 = surface PASS · 1 = visual defect (FAIL, fix + redraft) · 2 = env error.
export const JUDGE_PASS = 0
export const JUDGE_FAIL = 1
export const JUDGE_ENV = 2

// Read the latest per-surface Lens findings (written by lens-judge → gate-reports/lens/). Tolerant:
// returns [] when absent (fake-spawn fixture, or a defect with no machine report) — the loop still
// redrafts on a bare FAIL, just without itemised fix_owners.
function readLensFindings(dir, reportDir, surface) {
  for (const rel of [
    path.join(reportDir, 'lens', `${surface}.json`),
    path.join(reportDir, 'lens', 'verdict.json'),
    path.join(reportDir, 'lens', 'findings.json'),
  ]) {
    try {
      const obj = JSON.parse(fs.readFileSync(path.resolve(dir, rel), 'utf-8'))
      const f = Array.isArray(obj) ? obj : (obj.findings || obj.surfaces?.[surface]?.findings || [])
      if (Array.isArray(f) && f.length) return f
    } catch { /* missing/parse — try next */ }
  }
  return []
}

// ── makeRealDeps: the production wiring (injectable spawn for hermetic testing) ──
export function makeRealDeps(opts = {}) {
  const {
    spawn = spawnSync,
    env = process.env,
    dir = process.cwd(),
    claudeBin = env.MAESTRO_CLAUDE_BIN || 'claude',
    reportDir = env.REPORT_DIR || 'gate-reports',
    render: renderMode = 'dev', // 'dev' (rely on live preview) | 'push' (theme:push each draft)
    previewUrl = env.THEME_PREVIEW_URL || env.LENS_PREVIEW_URL || null,
    dryDraft = false, // --dry: skip the claude consultant (wiring smoke only)
    log = () => {},
  } = opts

  const run = (cmd, args, extraEnv) =>
    spawn(cmd, args, { cwd: dir, encoding: 'utf-8', env: { ...env, ...extraEnv } })

  // draft: the consultant edits the theme for this surface. round-1 = build; round-N>1 = fix the
  // carried Lens findings. Autonomous (no human) via headless claude. A non-zero claude exit or a
  // missing binary returns { ok:false } → loop records 'error' for the surface and continues.
  const draft = (surface, round, ctx) => {
    if (dryDraft) return { ok: true }
    const findings = ctx.lastFindings || []
    const prompt = [
      `You are the Maestro consultant for the "${surface}" surface of a Shopify theme build.`,
      `Read docs/build-state.md (the carried decisions every surface must honour) before editing.`,
      round > 1 && findings.length
        ? `Round ${round}: FIX these Lens findings, do not regress passing surfaces:\n${findings.map(f => `- [${f.severity || '?'}] ${f.check || f.title || 'finding'} (owner ${f.fix_owner || '?'}): ${f.evidence || ''}`).join('\n')}`
        : `Round ${round}: build/refine "${surface}" to render premium, on-brand, and pass Lens. Bind docs/design/design-system.json tokens. Only substantiated claims (no invented stats/urgency).`,
      `Edit theme files directly. Output only a one-line summary of what you changed.`,
    ].filter(Boolean).join('\n\n')
    const r = run(claudeBin, ['-p', prompt, '--permission-mode', 'acceptEdits'], {})
    if (r.error) return { ok: false, error: `consultant unavailable: ${r.error.message}` }
    if ((r.status ?? 1) !== 0) return { ok: false, error: `consultant exited ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}` }
    return { ok: true }
  }

  // render: make the latest draft visible to Lens. 'dev' = the live `theme:dev` preview already
  // auto-reloads on edit → no push needed, just carry the URL. 'push' = push to the linked theme.
  const render = (surface, ctx) => {
    if (renderMode === 'push') {
      const r = run(process.execPath, [scriptPath('shopify-theme-push.mjs')], {})
      if (r.error) return { ok: false, error: `theme:push failed to run: ${r.error.message}` }
      if ((r.status ?? 1) !== 0) return { ok: false, error: `theme:push exited ${r.status}` }
    }
    const url = ctx.previewUrl || previewUrl
    if (!url) return { ok: false, error: 'no THEME_PREVIEW_URL — start `pnpm theme:dev` (the loop must SEE the surface)' }
    return { ok: true, url }
  }

  // judge: the eyes. lens:surface scopes capture→vision-judge→enforce to ONE surface.
  const judge = (surface, ctx) => {
    const url = ctx.previewUrl || previewUrl
    const r = run(process.execPath, [scriptPath('lens-surface.mjs'), surface], { THEME_PREVIEW_URL: url || '' })
    if (r.error) throw new Error(`lens:surface failed to run: ${r.error.message}`)
    const status = r.status ?? JUDGE_ENV
    if (status === JUDGE_PASS) return { pass: true, confidence: 90, findings: [] }
    if (status === JUDGE_ENV) throw new Error(`lens:surface env error (exit 2): ${(r.stderr || '').trim().slice(0, 200)}`)
    // JUDGE_FAIL (or any other non-zero) — visual defect; carry findings for the redraft.
    return { pass: false, confidence: 60, findings: readLensFindings(dir, reportDir, surface) }
  }

  // record: write the surface verdict back to the carried mind (build-state.json/.md).
  const record = (surface, verdict, info) => {
    const v = verdict === 'PASS' ? 'PASS' : 'FAIL'
    run(process.execPath, [scriptPath('build-state.mjs'), 'record', surface, v, '--rounds', String(info?.rounds ?? 0)], {})
  }

  return { draft, render, judge, record, log }
}

// ── report ───────────────────────────────────────────────────────────────────
function writeReport(dir, result, opts) {
  const stateDir = opts.buildStateDir || 'docs'
  const ts = process.env.MAESTRO_TS || 'pending'
  const json = {
    updated: ts,
    allPass: result.allPass,
    converged: result.converged,
    escalated: result.escalated,
    decisions: result.decisions,
    surfaces: result.surfaces,
  }
  const L = [
    `# Maestro Run — ${result.allPass ? '✓ ALL SURFACES CONVERGED' : `✗ ${result.escalated.length} ESCALATED`}   ·  updated ${ts}`,
    '',
    `Converged (${result.converged.length}): ${result.converged.join(', ') || '—'}`,
    `Escalated (${result.escalated.length}): ${result.escalated.join(', ') || '—'}`,
    '',
    '| surface | status | rounds | findings/error |',
    '|---|---|---|---|',
    ...result.surfaces.map(s => `| ${s.surface} | ${s.status} | ${s.rounds ?? 0} | ${s.error || (s.findings ? `${s.findings.length} finding(s)` : '')} |`),
    '',
    '## Carried decisions',
    ...(result.decisions.length ? result.decisions.map(d => `- ${d}`) : ['_none_']),
    '',
  ]
  try {
    fs.mkdirSync(path.resolve(dir, stateDir), { recursive: true })
    fs.writeFileSync(path.resolve(dir, stateDir, 'maestro-report.json'), `${JSON.stringify(json, null, 2)}\n`)
    fs.writeFileSync(path.resolve(dir, stateDir, 'maestro-report.md'), L.join('\n'))
  } catch (e) { console.error(`maestro:run: could not write report — ${e.message}`) }
}

// ── surface discovery ──────────────────────────────────────────────────────────
export function loadSurfaces(dir, stateDir = 'docs', override) {
  if (override && override.length) return override
  try {
    const state = JSON.parse(fs.readFileSync(path.resolve(dir, stateDir, 'build-state.json'), 'utf-8'))
    const todo = (state.surfaces || []).filter(s => s.status !== 'done').map(s => s.surface)
    return todo.length ? todo : (state.surfaces || []).map(s => s.surface)
  } catch { return [] }
}

// ── orchestration (exported for the fixture; deps injectable) ────────────────────
export async function runMaestro({ deps, surfaces, maxRounds = MAESTRO_MAX_ROUNDS, dir = process.cwd(), buildStateDir = 'docs', writeReportFile = true } = {}) {
  const result = await runMaestroLoop(deps, { surfaces, maxRounds })
  if (writeReportFile) writeReport(dir, result, { buildStateDir })
  return result
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { surfaces: null, maxRounds: MAESTRO_MAX_ROUNDS, render: 'dev', dry: false, skipPreflight: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--surfaces') o.surfaces = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--max-rounds') o.maxRounds = Number(argv[++i])
    else if (a === '--render') o.render = argv[++i]
    else if (a === '--dry') o.dry = true
    else if (a === '--skip-preflight') o.skipPreflight = true
    else if (a === '--help' || a === '-h') o.help = true
  }
  return o
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) {
    console.log('Usage: THEME_PREVIEW_URL=<url> node maestro-run.mjs [--surfaces a,b] [--max-rounds 3] [--render dev|push] [--dry] [--skip-preflight]')
    process.exit(0)
  }
  const dir = process.cwd()
  const buildStateDir = process.env.BUILD_STATE_DIR || 'docs'

  // Readiness gate — refuse to start a doomed hands-off run; print the exact fix per missing precondition.
  if (!o.skipPreflight) {
    const pf = await preflight({ dir, renderMode: o.render, driver: o.dry ? 'workflow' : 'cli' })
    if (!pf.ready) {
      console.error(formatChecklist(pf))
      console.error('\nmaestro:run: SETUP — preconditions missing (above). Fix them, or pass --skip-preflight to override.')
      process.exit(2)
    }
  }

  const surfaces = loadSurfaces(dir, buildStateDir, o.surfaces)
  if (!surfaces.length) {
    console.error('maestro:run: SETUP — no surfaces. Run `pnpm build-state init` (seeds docs/build-state.json) or pass --surfaces home,pdp,cart.')
    process.exit(2)
  }
  const deps = makeRealDeps({ dir, render: o.render, dryDraft: o.dry, log: (m) => console.log(`maestro: ${m}`) })
  console.log(`maestro:run — ${surfaces.length} surface(s): ${surfaces.join(', ')}  ·  ≤${o.maxRounds} rounds each  ·  render=${o.render}${o.dry ? '  ·  DRY (no consultant)' : ''}`)
  const result = await runMaestro({ deps, surfaces, maxRounds: o.maxRounds, dir, buildStateDir })
  console.log(result.allPass
    ? `\n✓ maestro:run — ALL ${result.converged.length} surface(s) converged. Report → ${buildStateDir}/maestro-report.md`
    : `\n✗ maestro:run — ${result.escalated.length} escalated: ${result.escalated.join(', ')}. Report → ${buildStateDir}/maestro-report.md`)
  process.exit(result.allPass ? 0 : 1)
}

// run as CLI only (not when imported by the fixture)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`maestro:run: ${e.message}`); process.exit(2) })
}
