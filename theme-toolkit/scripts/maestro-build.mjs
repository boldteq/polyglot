#!/usr/bin/env node
// maestro:build — the ONE hands-off command. Chains the whole autonomous build-to-publish-ready
// sequence and short-circuits at the first failure, so an overnight run either lands at PUBLISH-READY
// or stops with a precise stage + reason — never a half-built store that reads as done:
//
//   preflight (READY?) → ensure build-state → surface loop (all converge?) → full gate stack (pass?)
//   → emit docs/publish-readiness.{json,md}  ← the single artifact mantle's publish precondition reads
//
// The per-surface Lens inside the loop is NOT the publish gate — a store can converge surface-by-surface
// and still fail the whole-store stack (#0.4→#19 + Lens #18). This orchestrator closes that gap: it only
// declares PUBLISH-READY when BOTH the loop converged AND the full gate stack passed, in one artifact.
//
// Every stage is injectable (makeRealSteps) so the orchestration — ordering, short-circuit, the
// readiness verdict, the artifact — is proven hermetically by __fixtures__/maestro-build with fake
// stages (no live store, no claude, no gates). Node 20 ESM, no external deps. No Date.now()/Math.random().
//
// Usage:
//   THEME_PREVIEW_URL=http://127.0.0.1:9292 node maestro-build.mjs
//   node maestro-build.mjs --render push --surfaces home,pdp,cart
// Exit: 0 = PUBLISH-READY · 1 = blocked (see stage+reason / docs/publish-readiness.md) · 2 = setup error.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { preflight, formatChecklist } from './maestro-preflight.mjs'
import { makeRealDeps, runMaestro, loadSurfaces } from './maestro-run.mjs'
import { withPreviewServer, DEFAULT_PREVIEW_URL } from './lib/preview-server.mjs'
import { status, formatStatus } from './maestro-status.mjs'

const scriptPath = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url))

// ── real stages (overridable for tests) ─────────────────────────────────────────
export function makeRealSteps(opts = {}) {
  const {
    dir = process.cwd(),
    env = process.env,
    renderMode = 'dev',
    surfaces: surfacesOverride = null,
    maxRounds,
    buildStateDir = env.BUILD_STATE_DIR || 'docs',
    spawn = spawnSync,
    budgetMs = 0,   // unattended wall-clock budget (0 = off) — forwarded to the loop deps
    timeouts = {},  // per-subprocess timeouts — forwarded to the loop deps
    now,            // injectable clock (tests only); undefined → makeRealDeps uses Date.now
  } = opts
  const run = (cmd, args, extraEnv) => spawn(cmd, args, { cwd: dir, encoding: 'utf-8', env: { ...env, ...extraEnv }, stdio: 'inherit' })

  return {
    // 1 — readiness gate (in-process)
    preflight: () => preflight({ dir, env, renderMode, driver: 'cli' }),

    // 2 — seed the carried mind if absent (deterministic; safe to re-run — build-state init merges)
    ensureBuildState: () => {
      const p = path.resolve(dir, buildStateDir, 'build-state.json')
      if (fs.existsSync(p)) return { ok: true, initialized: false }
      const r = run(process.execPath, [scriptPath('build-state.mjs'), 'init', ...(surfacesOverride ? ['--surfaces', surfacesOverride.join(',')] : [])])
      return { ok: (r.status ?? 1) === 0, initialized: true }
    },

    // 3 — the surface loop (in-process; reuses maestro-run's proven wiring)
    runLoop: async () => {
      const surfaces = loadSurfaces(dir, buildStateDir, surfacesOverride)
      if (!surfaces.length) return { allPass: false, converged: [], escalated: [], surfaces: [], error: 'no surfaces (build-state empty)' }
      const deps = makeRealDeps({ dir, env, render: renderMode, spawn, budgetMs, timeouts, ...(now ? { now } : {}), log: (m) => console.log(`maestro: ${m}`) })
      return runMaestro({ deps, surfaces, maxRounds, dir, buildStateDir })
    },

    // 4 — the full publish gate stack (separate process; reads gate-reports/summary.json for the verdict)
    runGates: () => {
      const r = run(process.execPath, [scriptPath('theme-gates.mjs')])
      let pass = (r.status ?? 1) === 0
      let blockers = 0
      try {
        const sum = JSON.parse(fs.readFileSync(path.resolve(dir, 'gate-reports', 'summary.json'), 'utf-8'))
        pass = sum.pass === true
        blockers = Object.values(sum.gates || {}).reduce((n, g) => n + ((g.blockers || []).length), 0)
      } catch { /* fall back to exit code */ }
      return { pass, blockers }
    },
  }
}

// ── artifact ────────────────────────────────────────────────────────────────────
function writeReadiness(dir, buildStateDir, result) {
  const ts = process.env.MAESTRO_TS || 'pending'
  const json = { updated: ts, publishReady: result.publishReady, stage: result.stage, reason: result.reason, loop: result.loop, gates: result.gates }
  const L = [
    `# Publish Readiness — ${result.publishReady ? '✅ PUBLISH-READY' : '⛔ NOT READY'}   ·  updated ${ts}`,
    '',
    `**Stopped at stage:** ${result.stage}`,
    `**Reason:** ${result.reason}`,
    '',
    '## Surface loop',
    result.loop
      ? `converged (${result.loop.converged.length}): ${result.loop.converged.join(', ') || '—'}  ·  escalated (${result.loop.escalated.length}): ${result.loop.escalated.join(', ') || '—'}`
      : '_not reached_',
    '',
    '## Full gate stack',
    result.gates ? `${result.gates.pass ? 'PASS' : 'BLOCK'}${result.gates.blockers ? ` — ${result.gates.blockers} blocker(s) (see gate-reports/SUMMARY.md)` : ''}` : '_not reached_',
    '',
    result.publishReady
      ? '→ Both the surface loop converged AND the full gate stack passed. mantle may publish (subject to fresh publish-evidence).'
      : '→ Do NOT publish. Resolve the blocking stage above, then re-run `pnpm maestro:build`.',
    '',
  ]
  try {
    fs.mkdirSync(path.resolve(dir, buildStateDir), { recursive: true })
    fs.writeFileSync(path.resolve(dir, buildStateDir, 'publish-readiness.json'), `${JSON.stringify(json, null, 2)}\n`)
    fs.writeFileSync(path.resolve(dir, buildStateDir, 'publish-readiness.md'), L.join('\n'))
  } catch (e) { console.error(`maestro:build: could not write readiness artifact — ${e.message}`) }
}

// ── orchestration ─────────────────────────────────────────────────────────────────
export async function maestroBuild({ steps, dir = process.cwd(), buildStateDir = 'docs', writeArtifact = true, log = () => {} } = {}) {
  const fin = (stage, reason, extra = {}) => {
    const result = { publishReady: stage === 'ready', stage, reason, loop: null, gates: null, ...extra }
    if (writeArtifact) writeReadiness(dir, buildStateDir, result)
    return result
  }

  // 1 — preflight
  log('stage 1/4 — preflight')
  const pf = await steps.preflight()
  if (!pf.ready) return fin('preflight', `preconditions missing: ${pf.checks.filter(c => !c.ok && !c.soft).map(c => c.id).join(', ')}`, { preflight: pf })

  // 2 — build-state
  log('stage 2/4 — ensure build-state')
  const bs = await steps.ensureBuildState()
  if (!bs.ok) return fin('build-state', 'build-state init failed (could not seed surfaces)')

  // 3 — surface loop
  log('stage 3/4 — surface loop')
  const loop = await steps.runLoop()
  const loopSummary = { allPass: !!loop.allPass, converged: loop.converged || [], escalated: loop.escalated || [] }
  if (!loop.allPass) return fin('loop', loop.error || `surfaces did not converge: ${loopSummary.escalated.join(', ') || 'none converged'}`, { loop: loopSummary })

  // 4 — full gate stack
  log('stage 4/4 — full gate stack')
  const gates = await steps.runGates()
  if (!gates.pass) return fin('gates', `gate stack blocked${gates.blockers ? ` (${gates.blockers} blocker(s))` : ''}`, { loop: loopSummary, gates })

  return fin('ready', 'surface loop converged + full gate stack passed', { loop: loopSummary, gates })
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { renderMode: 'dev', surfaces: null, maxRounds: undefined, autoPreview: false, budgetMs: 0, timeouts: {} }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--render') o.renderMode = argv[++i]
    else if (a === '--surfaces') o.surfaces = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--max-rounds') o.maxRounds = Number(argv[++i])
    else if (a === '--auto-preview') o.autoPreview = true
    else if (a === '--budget') o.budgetMs = Math.max(0, Number(argv[++i]) || 0) * 60_000 // minutes → ms (wall-clock breaker)
    else if (a === '--timeout') { const m = Math.max(0, Number(argv[++i]) || 0) * 60_000; if (m) o.timeouts = { draft: m, render: m, judge: m, record: m } } // minutes → per-step ms
    else if (a === '--help' || a === '-h') o.help = true
  }
  return o
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) {
    console.log('Usage: THEME_PREVIEW_URL=<url> node maestro-build.mjs [--render dev|push] [--surfaces a,b] [--max-rounds 3] [--auto-preview] [--budget <min>] [--timeout <min>]')
    console.log('  --auto-preview   start theme:dev for the run + tear it down after (no second terminal; render=dev only)')
    console.log('  --budget <min>   wall-clock budget for the whole loop — once elapsed, remaining surfaces escalate cleanly (unattended cap)')
    console.log('  --timeout <min>  per-subprocess timeout applied to draft/render/judge/record (a hung child is killed → that surface escalates)')
    process.exit(0)
  }
  if (!['dev', 'push'].includes(o.renderMode)) { console.error(`maestro:build: --render must be dev|push (got ${o.renderMode})`); process.exit(2) }
  const dir = process.cwd()
  const buildStateDir = process.env.BUILD_STATE_DIR || 'docs'

  const doBuild = async () => {
    const steps = makeRealSteps({ dir, renderMode: o.renderMode, surfaces: o.surfaces, maxRounds: o.maxRounds, buildStateDir, budgetMs: o.budgetMs, timeouts: o.timeouts })
    const budgetNote = o.budgetMs ? `  ·  budget=${Math.round(o.budgetMs / 60000)}min` : ''
    console.log(`maestro:build — hands-off build → publish-ready  ·  render=${o.renderMode}${o.autoPreview ? '  ·  auto-preview' : ''}${budgetNote}${o.surfaces ? `  ·  surfaces=${o.surfaces.join(',')}` : ''}`)
    return maestroBuild({ steps, dir, buildStateDir, log: (m) => console.log(`maestro:build — ${m}`) })
  }

  let result
  if (o.autoPreview && o.renderMode !== 'push') {
    // Hands-off: start theme:dev, wait until it serves, run the whole build against it, then tear it down.
    const url = process.env.THEME_PREVIEW_URL || DEFAULT_PREVIEW_URL
    result = await withPreviewServer(
      { url, dir, env: process.env, log: (m) => console.log(`maestro:build — preview: ${m}`) },
      async (liveUrl) => { process.env.THEME_PREVIEW_URL = liveUrl; return doBuild() },
    )
  } else {
    result = await doBuild()
  }

  // The final output IS the morning snapshot — consolidates the artifacts this run just wrote.
  try { console.log('\n' + formatStatus(status({ dir, buildStateDir }))) }
  catch { console.log(`\n${result.publishReady ? '✅ PUBLISH-READY' : `⛔ NOT READY (stopped at ${result.stage}: ${result.reason})`}  →  ${buildStateDir}/publish-readiness.md`) }
  if (result.stage === 'preflight' && result.preflight) console.error('\n' + formatChecklist(result.preflight))
  process.exit(result.publishReady ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`maestro:build: ${e.message}`); process.exit(2) })
}
