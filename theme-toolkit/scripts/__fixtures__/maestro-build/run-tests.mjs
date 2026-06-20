#!/usr/bin/env node
// Self-test for maestro-build.mjs (the hands-off orchestrator). Every stage is faked (no live store,
// no claude, no gates) so this proves the ORCHESTRATION: stage order, short-circuit at the first
// failure, the PUBLISH-READY verdict, and the docs/publish-readiness.json artifact.
//
//   (a) preflight NOT-READY → stop at 'preflight'; loop + gates never run; publishReady=false.
//   (b) loop escalates → stop at 'loop'; gates never run (never gate a non-converged store).
//   (c) loop converges but gates block → stop at 'gates'; publishReady=false.
//   (d) all stages pass → stage 'ready'; publishReady=true.
//   (e) build-state init runs only when build-state is absent.
//   (f) the readiness artifact is written with the right shape + verdict.
// Run (Node 20): node scripts/__fixtures__/maestro-build/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { maestroBuild, makeRealSteps } from '../../maestro-build.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// a recording fake-step set; flags pick which stage fails
function steps(flags = {}) {
  const calls = []
  return {
    calls,
    preflight: async () => { calls.push('preflight'); return { ready: flags.preflightReady !== false, checks: [{ id: 'discovery', ok: flags.preflightReady !== false, soft: false }] } },
    ensureBuildState: async () => { calls.push('ensureBuildState'); return { ok: flags.bsOk !== false, initialized: !!flags.bsInit } },
    runLoop: async () => { calls.push('runLoop'); return flags.loopAllPass === false ? { allPass: false, converged: ['home'], escalated: ['pdp'] } : { allPass: true, converged: ['home', 'pdp'], escalated: [] } },
    runGates: async () => { calls.push('runGates'); return { pass: flags.gatesPass !== false, blockers: flags.gatesPass === false ? 3 : 0 } },
  }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-build-'))
const noWrite = { writeArtifact: false }

// ── case a: preflight not ready → stop ──
console.log('case a — preflight NOT-READY short-circuits before loop/gates')
{
  const s = steps({ preflightReady: false })
  const res = await maestroBuild({ steps: s, ...noWrite })
  eq(res.publishReady, false, 'publishReady false')
  eq(res.stage, 'preflight', 'stopped at preflight stage')
  // build-state is seeded BEFORE preflight (so preflight can see it); loop + gates never ran
  eq(s.calls, ['ensureBuildState', 'preflight'], 'build-state seeded before preflight; loop + gates never ran')
}

// ── case b: loop escalates → stop before gates ──
console.log('case b — loop escalation short-circuits before the gate stack')
{
  const s = steps({ loopAllPass: false })
  const res = await maestroBuild({ steps: s, ...noWrite })
  eq(res.stage, 'loop', 'stopped at loop stage')
  eq(res.publishReady, false, 'publishReady false on escalation')
  eq(s.calls.includes('runGates'), false, 'gate stack NOT run on a non-converged store')
  eq(res.loop.escalated, ['pdp'], 'escalated surface carried into result')
}

// ── case c: loop converges, gates block ──
console.log('case c — converged loop + blocked gates → NOT ready at gates stage')
{
  const s = steps({ gatesPass: false })
  const res = await maestroBuild({ steps: s, ...noWrite })
  eq(res.stage, 'gates', 'stopped at gates stage')
  eq(res.publishReady, false, 'publishReady false when gates block')
  eq(res.gates.blockers, 3, 'blocker count carried into result')
  eq(s.calls, ['ensureBuildState', 'preflight', 'runLoop', 'runGates'], 'all 4 stages ran in order (build-state seeded first)')
}

// ── case d: everything passes → PUBLISH-READY ──
console.log('case d — all stages pass → PUBLISH-READY')
{
  const s = steps({})
  const res = await maestroBuild({ steps: s, ...noWrite })
  eq(res.stage, 'ready', 'stage ready')
  eq(res.publishReady, true, 'publishReady true')
  eq(res.loop.allPass, true, 'loop allPass carried')
  eq(res.gates.pass, true, 'gates pass carried')
  eq(s.calls, ['ensureBuildState', 'preflight', 'runLoop', 'runGates'], 'all 4 stages ran in order (build-state seeded first)')
}

// ── case e: build-state runs FIRST and is best-effort (preflight is the real gate) ──
console.log('case e — build-state seeds before preflight; a seed miss is non-fatal (preflight gates it)')
{
  // build-state seed "fails" (bsOk:false) but preflight is READY → the build proceeds (seed is best-effort)
  const s = steps({ bsOk: false })
  const res = await maestroBuild({ steps: s, ...noWrite })
  eq(s.calls[0], 'ensureBuildState', 'ensureBuildState runs FIRST (before preflight)')
  eq(s.calls[1], 'preflight', 'preflight runs after the seed attempt')
  eq(res.stage, 'ready', 'a non-fatal seed miss does NOT stop the build when preflight is ready')
  // and when the seed miss leaves build-state absent, preflight (not ensureBuildState) is what blocks
  const s2 = steps({ bsOk: false, preflightReady: false })
  const res2 = await maestroBuild({ steps: s2, ...noWrite })
  eq(res2.stage, 'preflight', 'a missing build-state surfaces as a preflight block (its checklist), not a silent build-state stop')
}

// ── case f: readiness artifact written with the right shape ──
console.log('case f — docs/publish-readiness.json artifact')
{
  const dir = tmp()
  const res = await maestroBuild({ steps: steps({}), dir, buildStateDir: 'docs', writeArtifact: true })
  const p = path.join(dir, 'docs', 'publish-readiness.json')
  eq(fs.existsSync(p), true, 'publish-readiness.json written')
  const art = JSON.parse(fs.readFileSync(p, 'utf-8'))
  eq(art.publishReady, true, 'artifact publishReady=true on success')
  eq(art.stage, 'ready', 'artifact records the final stage')
  eq(typeof art.loop === 'object' && art.loop.allPass === true, true, 'artifact carries the loop summary')
  // and a blocked build writes publishReady=false
  const dir2 = tmp()
  await maestroBuild({ steps: steps({ gatesPass: false }), dir: dir2, buildStateDir: 'docs', writeArtifact: true })
  const art2 = JSON.parse(fs.readFileSync(path.join(dir2, 'docs', 'publish-readiness.json'), 'utf-8'))
  eq(art2.publishReady, false, 'artifact publishReady=false when blocked')
  eq(art2.stage, 'gates', 'artifact records the blocking stage')
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true })
}

// ── case g: makeRealSteps threads budgetMs/timeouts/spawn into the loop deps ──
console.log('case g — makeRealSteps forwards budgetMs + timeouts + spawn to makeRealDeps (not dropped)')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-build-g-'))
  const calls = []
  let t = 0
  const now = () => { const v = t; t += 700; return v } // 0, 700, 1400(>1000 budget), …
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args: args || [], timeout: opts?.timeout }); return { status: 0, stdout: '', stderr: '' } }
  const steps = makeRealSteps({
    dir: tmp, env: { THEME_PREVIEW_URL: 'http://127.0.0.1:9292' }, renderMode: 'dev',
    surfaces: ['home', 'pdp'], buildStateDir: 'docs', spawn, budgetMs: 1000, now, timeouts: { draft: 4242 },
  })
  const loop = await steps.runLoop()
  eq(loop.converged, ['home'], 'budgetMs threaded: only the first surface converged before the budget breach')
  eq(loop.escalated.includes('pdp'), true, 'pdp escalated on budget (budgetMs reached the loop deps, not dropped)')
  const draftCall = calls.find(c => c.cmd === 'claude')
  eq(draftCall?.timeout, 4242, 'timeouts.draft threaded through to the draft subprocess')
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ── case h: runGates grades at PUBLISH grade (the linchpin — #0.4/#0.5/#18 BLOCK, not warn) ──
console.log('case h — makeRealSteps.runGates spawns the gate stack with DS_REQUIRE_SCOPE=1 + LENS_REQUIRE=1')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-build-h-'))
  const calls = []
  const spawn = (cmd, args, opts) => { calls.push({ cmd, args: args || [], env: opts?.env || {} }); return { status: 0, stdout: '', stderr: '' } }
  const steps = makeRealSteps({ dir: tmp, env: { PATH: '/usr/bin' }, spawn })
  await steps.runGates()
  const gateCall = calls.find(c => (c.args || []).some(a => String(a).includes('theme-gates.mjs')))
  eq(!!gateCall, true, 'runGates spawned theme-gates.mjs')
  eq(gateCall?.env?.DS_REQUIRE_SCOPE, '1', 'gate stack runs publish-grade: DS_REQUIRE_SCOPE=1 (else #0.4/#0.5/#17 only warn)')
  eq(gateCall?.env?.LENS_REQUIRE, '1', 'gate stack runs publish-grade: LENS_REQUIRE=1 (else #18 Lens only warns)')
  eq(gateCall?.env?.STRICT_CONVERSION, '1', 'gate stack runs publish-grade: STRICT_CONVERSION=1 (else honesty.fake-activity only warns)')
  eq(gateCall?.env?.PATH, '/usr/bin', 'base env preserved (extraEnv merges, does not replace)')
  // whole-store eyes: runGates re-captures + judges the whole store before grading (not a stale 1-surface manifest)
  eq(calls.some(c => (c.args || []).some(a => String(a).includes('lens-capture.mjs'))), true, 'runGates re-captures the whole store (lens-capture) before #18')
  eq(calls.some(c => (c.args || []).some(a => String(a).includes('lens-judge.mjs'))), true, 'runGates re-judges the whole store (lens-judge) before #18')
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failures === 0 ? '\n✓ MAESTRO-BUILD — ALL ORCHESTRATION ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
