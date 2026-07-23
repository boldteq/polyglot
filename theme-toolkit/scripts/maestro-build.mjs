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
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { preflight, formatChecklist } from './maestro-preflight.mjs'
import { makeRealDeps, runMaestro, loadSurfaces } from './maestro-run.mjs'
import { withPreviewServer, DEFAULT_PREVIEW_URL } from './lib/preview-server.mjs'
import { status, formatStatus } from './maestro-status.mjs'
import { consolidateEscalation } from './maestro-escalate.mjs'

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
    heal = opts.heal !== false,  // GAP 1: default-on heal-in-build — autofix whole-store Lens blockers then re-grade
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

    // AIM dual-loop note: the AUTONOMOUS fixer is THIS consultant redraft loop (draft→render→Lens→record,
    // ≤3 rounds/surface). `pnpm lens:autofix` is a SEPARATE standalone owner-batch fixer for manual use —
    // it is NOT invoked here. Stage 4 (runGates) re-captures + judges the whole store for the #18 verdict.
    // 3 — the surface loop (in-process; reuses maestro-run's proven wiring)
    runLoop: async () => {
      const surfaces = loadSurfaces(dir, buildStateDir, surfacesOverride)
      if (!surfaces.length) return { allPass: false, converged: [], escalated: [], surfaces: [], error: 'no surfaces (build-state empty)' }
      const deps = makeRealDeps({ dir, env, render: renderMode, spawn, budgetMs, timeouts, ...(now ? { now } : {}), log: (m) => console.log(`maestro: ${m}`) })
      return runMaestro({ deps, surfaces, maxRounds, dir, buildStateDir })
    },

    // 4 — the full publish gate stack. THREE things make this the WHOLE-STORE verdict, not a loop echo:
    //   (a) regenerate the design-system CSS cascade (ds:css) so #14 render-wiring + #19 section-cohesion
    //       grade against FRESH --ds-* vars, not a stale/absent assets/design-system.css;
    //   (b) re-capture + judge the WHOLE STORE with Lens. The per-surface loop's lens-capture WIPES
    //       gate-reports/lens each iteration and writes only the LAST surface — so without a whole-store
    //       re-capture here, #18 visual-truth would grade a stale single-surface manifest. Mirrors
    //       shopify-theme-push.mjs. Best-effort: no preview URL → capture fails → #18 BLOCKs via LENS_REQUIRE.
    //   (c) run theme-gates at PUBLISH grade. DS_REQUIRE_SCOPE=1 + LENS_REQUIRE=1 + STRICT_CONVERSION=1
    //       promote the dispatch/eyes/honesty gates (#0.4 discovery, #0.5 bootstrap, #17 visual-quality,
    //       #18 Lens, honesty.fake-activity) from dev-WARN to BLOCK — so a SKIP can't read as a PASS.
    //       maestro:build is the verdict that says "ship"; it MUST grade at publish grade.
    // (Locked by __fixtures__/maestro-build case h.)
    runGates: () => {
      const pub = { DS_REQUIRE_SCOPE: '1', LENS_REQUIRE: '1', STRICT_CONVERSION: '1' }
      // one whole-store grade: fresh --ds-* cascade (a) → whole-store Lens capture+judge (b) → publish-grade
      // gate stack (c). Returns {pass, blockers, lensBlockers} (lensBlockers = #18 visual-truth blockers).
      const gradeOnce = () => {
        run(process.execPath, [scriptPath('generate-design-system-css.mjs')])  // (a) fresh --ds-* cascade (best-effort)
        run(process.execPath, [scriptPath('lens-capture.mjs')], pub)           // (b) whole-store eyes — capture …
        run(process.execPath, [scriptPath('lens-judge.mjs')], pub)             //     … then judge every frame
        const r = run(process.execPath, [scriptPath('theme-gates.mjs')], pub)  // (c) publish-grade gate stack
        let pass = (r.status ?? 1) === 0, blockers = 0, lensBlockers = 0, mode = null
        try {
          const sum = JSON.parse(fs.readFileSync(path.resolve(dir, 'gate-reports', 'summary.json'), 'utf-8'))
          pass = sum.pass === true
          mode = sum.mode || null
          blockers = Object.values(sum.gates || {}).reduce((n, g) => n + ((g.blockers || []).length), 0)
          // The Lens gate is named 'visual-check' in the manifest + report ('visual-truth' is only a
          // back-compat ALIAS, never a summary.gates key). Reading 'visual-truth' made lensBlockers
          // ALWAYS 0 → lens-autofix was never invoked by the heal loop (dead branch, 2026-07-19 audit).
          lensBlockers = (((sum.gates || {})['visual-check'] || (sum.gates || {})['visual-truth'] || {}).blockers || []).length
        } catch { /* fall back to exit code */ }
        return { pass, blockers, lensBlockers, mode }
      }
      let v = gradeOnce()
      // UNIVERSAL SELF-HEAL (default-on, 2026-07-19 done-means-done): CONVERGE every layer, not just
      // visual. Each round heals whatever blocks — VISUAL (#18) via lens-autofix AND CODE/CONTENT (all
      // other static gates) via gate-autofix (owner-routed: loom/drape/ink/conduit/beacon edit files,
      // ≤3 rounds + cross-run anti-loop internally; honesty/imagery/legal/secret/real-asset/porter
      // ESCALATE, never a blind edit) — then RE-GRADE, looping until green or a round makes no progress.
      // This is the difference between "here are the problems" and "fixed, done" (the Lovable behavior).
      // A no-progress round breaks out → the remaining blockers land in the escalation hatch. `--no-heal`
      // disables it (report-only). (Locked by __fixtures__/maestro-build.)
      if (heal && !v.pass) {
        const healMax = Math.max(1, Number(process.env.HEAL_MAX_ROUNDS || 3))
        const healDeadline = Date.now() + Number(process.env.HEAL_BUDGET_MS || 30 * 60 * 1000) // wall-clock breaker (audit H4)
        for (let round = 1; round <= healMax && !v.pass; round += 1) {
          if (Date.now() > healDeadline) { console.log('maestro:build — heal budget exhausted (HEAL_BUDGET_MS) → escalate the remainder'); break }
          const before = v.blockers || 0
          const codeBlockers = Math.max(0, before - (v.lensBlockers || 0))
          console.log(`maestro:build — heal round ${round}/${healMax}: ${v.lensBlockers} visual + ${codeBlockers} code/content blocker(s) → autofix, then re-grade…`)
          if (v.lensBlockers > 0) run(process.execPath, [scriptPath('lens-autofix.mjs')], pub)
          if (codeBlockers > 0) run(process.execPath, [scriptPath('gate-autofix.mjs')], pub)
          v = gradeOnce()
          v.healed = true
          if (!v.pass && (v.blockers || 0) >= before) {
            console.log(`maestro:build — heal stalled at ${v.blockers} blocker(s) (no progress) → escalate the remainder`)
            break
          }
        }
      }
      return v
    },
  }
}

// ── artifact ────────────────────────────────────────────────────────────────────
function writeReadiness(dir, buildStateDir, result) {
  const ts = process.env.MAESTRO_TS || 'pending'
  // Stamp HEAD so theme:publish can bind the PUBLISH-READY proof to the sha it was produced at —
  // a stale / BUILD_STATE_DIR-redirected readiness then fails theme:publish's sha check (adversarial #1).
  let sha = null
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { /* not a git repo */ }
  const json = { updated: ts, sha, publishReady: result.publishReady, stage: result.stage, reason: result.reason, loop: result.loop, gates: result.gates }
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

  // 1 — ensure build-state FIRST: preflight requires build-state.json to exist, so seeding has to
  // happen before the gate (otherwise the auto-seed is unreachable on a fresh repo and maestro:build
  // tells the user to run `build-state init` itself — defeating hands-off). Best-effort: if discovery/
  // bootstrap are missing, init no-ops and the next stage (preflight) reports the real gap.
  log('stage 1/4 — ensure build-state')
  await steps.ensureBuildState()

  // 2 — preflight (the gate; now sees the seeded build-state, or reports the missing foundation)
  log('stage 2/4 — preflight')
  const pf = await steps.preflight()
  if (!pf.ready) return fin('preflight', `preconditions missing: ${pf.checks.filter(c => !c.ok && !c.soft).map(c => c.id).join(', ')}`, { preflight: pf })

  // 3 — surface loop
  log('stage 3/4 — surface loop')
  const loop = await steps.runLoop()
  const loopSummary = { allPass: !!loop.allPass, converged: loop.converged || [], escalated: loop.escalated || [] }
  if (!loop.allPass) return fin('loop', loop.error || `surfaces did not converge: ${loopSummary.escalated.join(', ') || 'none converged'}`, { loop: loopSummary })

  // 4 — full gate stack
  log('stage 4/4 — full gate stack')
  const gates = await steps.runGates()
  if (!gates.pass) return fin('gates', `gate stack blocked${gates.blockers ? ` (${gates.blockers} blocker(s))` : ''}`, { loop: loopSummary, gates })
  // A static-only run (no preview URL) silently DROPS the 7 URL gates (functional/perf/a11y/seo/
  // conversion/Lens) — those never enter the pass computation, so "gates pass" is not a full verdict.
  // PUBLISH-READY requires a full-grade run (audit H1a). ALLOW_STATIC_READY=1 overrides for a code-only pass.
  if (gates.mode && gates.mode !== 'full' && process.env.ALLOW_STATIC_READY !== '1') {
    return fin('gates', `static-only run (no preview URL) — cannot verify functional/perf/a11y/SEO/Lens; set THEME_PREVIEW_URL for a publish-ready verdict`, { loop: loopSummary, gates })
  }

  return fin('ready', 'surface loop converged + full gate stack passed', { loop: loopSummary, gates })
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { renderMode: 'dev', surfaces: null, maxRounds: undefined, autoPreview: false, budgetMs: 0, timeouts: {}, heal: true }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--render') o.renderMode = argv[++i]
    else if (a === '--surfaces') o.surfaces = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--max-rounds') o.maxRounds = Number(argv[++i])
    else if (a === '--auto-preview') o.autoPreview = true
    else if (a === '--no-heal') o.heal = false  // GAP 1: disable the default-on heal-in-build (report-only)
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
    console.log('  --no-heal        report Lens blockers without auto-healing (default: heal whole-store Lens blockers via lens:autofix, then re-grade once)')
    process.exit(0)
  }
  if (!['dev', 'push'].includes(o.renderMode)) { console.error(`maestro:build: --render must be dev|push (got ${o.renderMode})`); process.exit(2) }
  const dir = process.cwd()
  const buildStateDir = process.env.BUILD_STATE_DIR || 'docs'

  const doBuild = async () => {
    const steps = makeRealSteps({ dir, renderMode: o.renderMode, surfaces: o.surfaces, maxRounds: o.maxRounds, buildStateDir, budgetMs: o.budgetMs, timeouts: o.timeouts, heal: o.heal })
    const budgetNote = o.budgetMs ? `  ·  budget=${Math.round(o.budgetMs / 60000)}min` : ''
    console.log(`maestro:build — hands-off build → publish-ready  ·  render=${o.renderMode}${o.autoPreview ? '  ·  auto-preview' : ''}${o.heal ? '  ·  heal-on' : '  ·  heal-off'}${budgetNote}${o.surfaces ? `  ·  surfaces=${o.surfaces.join(',')}` : ''}`)
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
  // Not ready → consolidate the scattered escalation artifacts into ONE batched, whitelist-tagged ask
  // (docs/ESCALATION.md + docs/questions.json). Owner-fixable findings stay in the auto-fix loop; only
  // whitelist hits become questions — so the human sees one ask, not three files. Best-effort.
  if (!result.publishReady) {
    try {
      const esc = consolidateEscalation({ dir, buildStateDir })
      if (esc.blocked && esc.questions.length) console.log(`\nmaestro:build — ${esc.questions.length} question(s) need you (batched) → ${buildStateDir}/ESCALATION.md`)
    } catch (e) { console.error(`maestro:build: escalate consolidation failed — ${e.message}`) }
  }
  process.exit(result.publishReady ? 0 : 1)
}

if (isMain(import.meta.url)) {
  main().catch(e => { console.error(`maestro:build: ${e.message}`); process.exit(2) })
}
