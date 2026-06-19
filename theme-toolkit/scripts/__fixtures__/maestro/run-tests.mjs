#!/usr/bin/env node
// Self-test for maestro-run.mjs (the PRODUCTION Maestro runner). Proves the WIRING — how the runner
// turns the proven loop into real subprocess calls — with a FAKE spawn (no live store, no claude CLI,
// no theme dev). Plus it shells out to maestro-dryrun.mjs so the loop ALGORITHM proof rides the same
// regression gate (run-all-tests.mjs auto-discovers this suite → it runs under `pnpm test`).
//
//   (a) all-PASS: each surface draft→judge→record once; judge gets the surface + THEME_PREVIEW_URL;
//       record maps verdict→PASS with the round count.
//   (b) FAIL,FAIL,PASS: converges on round 3; round-2 draft prompt carries the round-1 Lens findings.
//   (c) always-FAIL: escalates at maxRounds (no infinite loop); record maps verdict→FAIL.
//   (d) judge env-error (exit 2): that surface isolates to status=error; the loop continues.
//   (e) consultant fails (claude exit 1): surface isolates to status=error; the loop continues.
//   (f) render=push: each round pushes the theme before judging.
//   (g) algorithm proof: maestro-dryrun.mjs exits 0.
// Run (Node 20): node scripts/__fixtures__/maestro/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeRealDeps, runMaestro } from '../../maestro-run.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUNNER = path.resolve(HERE, '..', '..', 'maestro-run.mjs')
const DRYRUN = path.resolve(HERE, '..', '..', 'maestro-dryrun.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const argStr = (args) => (args || []).join(' ')
const isJudge = (args) => argStr(args).includes('lens-surface.mjs')
const isRecord = (args) => argStr(args).includes('build-state.mjs') && (args || []).includes('record')
const isPush = (args) => argStr(args).includes('shopify-theme-push.mjs')
const isDraft = (cmd) => cmd === 'claude' || cmd === 'CLAUDEBIN'

const ENV = { THEME_PREVIEW_URL: 'http://127.0.0.1:9292' }
// fake spawn factory: `judge(surface, callIndexForSurface) -> exitCode`; claude(draft) & others default 0
function fakeSpawnWith(judgeExit, { draftExit = () => 0 } = {}) {
  const calls = []
  const perSurface = new Map()
  const spawn = (cmd, args, opts) => {
    calls.push({ cmd, args: args || [], env: opts?.env || {}, timeout: opts?.timeout })
    if (isDraft(cmd)) {
      const ex = draftExit(args)
      if (ex && typeof ex === 'object' && ex.error) return { error: ex.error, status: null, stdout: '', stderr: '' } // timeout-shaped
      return { status: ex, stdout: 'edited', stderr: '' }
    }
    if (isJudge(args)) {
      const surface = (args || []).find(a => !a.startsWith('-') && !a.endsWith('.mjs'))
      const n = (perSurface.get(surface) || 0) + 1
      perSurface.set(surface, n)
      return { status: judgeExit(surface, n), stdout: '', stderr: 'defect' }
    }
    return { status: 0, stdout: '', stderr: '' } // render-push / record succeed
  }
  return { spawn, calls }
}

// ── case (a): all PASS ──
console.log('case a — every surface converges round 1; judge + record wired correctly')
{
  const { spawn, calls } = fakeSpawnWith(() => 0)
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-a', render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['home', 'pdp', 'cart'], dir: '/tmp/maestro-a', writeReportFile: false })
  eq(res.converged, ['home', 'pdp', 'cart'], 'all 3 surfaces converged')
  eq(res.allPass, true, 'allPass true')
  const judgeCalls = calls.filter(c => isJudge(c.args))
  eq(judgeCalls.length, 3, 'judge ran once per surface')
  eq(judgeCalls[0].args.includes('home'), true, 'judge argv carries the surface name')
  eq(judgeCalls[0].env.THEME_PREVIEW_URL, 'http://127.0.0.1:9292', 'judge gets THEME_PREVIEW_URL in env')
  const recHome = calls.find(c => isRecord(c.args) && c.args.includes('home'))
  eq(!!recHome, true, 'build-state record called for home')
  eq(recHome.args.includes('PASS'), true, 'record maps verdict → PASS')
  eq(recHome.args.includes('--rounds') && recHome.args.includes('1'), true, 'record carries the round count')
  const draftCall = calls.find(c => isDraft(c.cmd))
  eq(!!draftCall && draftCall.args[0] === '-p', true, 'consultant invoked headless (claude -p)')
  eq(draftCall.args.includes('--permission-mode') && draftCall.args.includes('acceptEdits'), true, 'consultant runs autonomously (acceptEdits)')
}

// ── case (b): FAIL,FAIL,PASS — converge round 3, findings carry into round-2 draft ──
console.log('case b — converges round 3; round-2 draft prompt carries round-1 Lens findings')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-b-'))
  fs.mkdirSync(path.join(tmp, 'gate-reports', 'lens'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'gate-reports', 'lens', 'home.json'),
    JSON.stringify({ findings: [{ check: 'hero-contrast', severity: 'blocker', fix_owner: 'loom', evidence: 'amber on cream fails AA' }] }))
  const { spawn, calls } = fakeSpawnWith((s, n) => (n > 2 ? 0 : 1))
  const deps = makeRealDeps({ spawn, env: ENV, dir: tmp, render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['home'], dir: tmp, writeReportFile: false })
  eq(res.converged, ['home'], 'home converged')
  eq(res.surfaces[0].rounds, 3, 'took exactly 3 rounds')
  const draftCalls = calls.filter(c => isDraft(c.cmd))
  eq(draftCalls.length, 3, '3 draft rounds')
  eq(/hero-contrast/.test(draftCalls[1].args[1] || ''), true, 'round-2 draft prompt carries the round-1 finding (fix loop wired)')
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ── case (c): always FAIL — escalate, never loop forever ──
console.log('case c — escalates at maxRounds; record maps verdict → FAIL')
{
  const { spawn, calls } = fakeSpawnWith(() => 1)
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-c', render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['pdp'], maxRounds: 3, dir: '/tmp/maestro-c', writeReportFile: false })
  eq(res.escalated, ['pdp'], 'pdp escalated')
  eq(res.surfaces[0].rounds, 3, 'stopped at maxRounds=3')
  const rec = calls.find(c => isRecord(c.args))
  eq(rec.args.includes('FAIL'), true, 'record maps escalation → FAIL')
}

// ── case (d): judge env-error (exit 2) isolates that surface, loop continues ──
console.log('case d — judge env-error isolates surface to status=error; loop continues')
{
  const { spawn } = fakeSpawnWith((s) => (s === 'home' ? 2 : 0))
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-d', render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['home', 'pdp'], dir: '/tmp/maestro-d', writeReportFile: false })
  eq(res.surfaces.find(s => s.surface === 'home').status, 'error', 'home isolated to status=error')
  eq(res.converged, ['pdp'], 'pdp still converged despite home env-error')
}

// ── case (e): consultant (claude) failure isolates that surface ──
console.log('case e — consultant exit 1 isolates surface to status=error; loop continues')
{
  const { spawn } = fakeSpawnWith(() => 0, { draftExit: (args) => (/pdp/.test(argStr(args)) ? 0 : 1) })
  // draftExit keys off the prompt, which names the surface
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-e', render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['home', 'pdp'], dir: '/tmp/maestro-e', writeReportFile: false })
  eq(res.surfaces.find(s => s.surface === 'home').status, 'error', 'home (consultant failed) → status=error')
  eq(res.surfaces.find(s => s.surface === 'home').error?.startsWith('draft:'), true, 'error attributed to draft:')
  eq(res.converged, ['pdp'], 'pdp still converged')
}

// ── case (f): render=push pushes the theme each round before judging ──
console.log('case f — render=push pushes the theme before judging')
{
  const { spawn, calls } = fakeSpawnWith(() => 0)
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-f', render: 'push', claudeBin: 'claude' })
  await runMaestro({ deps, surfaces: ['home'], dir: '/tmp/maestro-f', writeReportFile: false })
  eq(calls.some(c => isPush(c.args)), true, 'theme:push invoked in render=push mode')
}

// ── case (h): per-subprocess timeouts are threaded to spawn (unattended safety) ──
console.log('case h — configurable timeouts reach the draft/judge/record spawns')
{
  const { spawn, calls } = fakeSpawnWith(() => 0)
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-h', render: 'dev', claudeBin: 'claude',
    timeouts: { draft: 11111, judge: 22222, record: 33333 } })
  await runMaestro({ deps, surfaces: ['home'], dir: '/tmp/maestro-h', writeReportFile: false })
  eq(calls.find(c => isDraft(c.cmd)).timeout, 11111, 'draft spawn got its timeout')
  eq(calls.find(c => isJudge(c.args)).timeout, 22222, 'judge spawn got its timeout')
  eq(calls.find(c => isRecord(c.args)).timeout, 33333, 'record spawn got its timeout')
}

// ── case (i): a draft TIMEOUT (spawn returns an error) isolates the surface ──
console.log('case i — a hung draft (spawn error/timeout) isolates the surface; loop continues')
{
  const { spawn } = fakeSpawnWith(() => 0, { draftExit: (args) => (/home/.test(argStr(args)) ? { error: new Error('spawnSync ETIMEDOUT') } : 0) })
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-i', render: 'dev', claudeBin: 'claude' })
  const res = await runMaestro({ deps, surfaces: ['home', 'pdp'], dir: '/tmp/maestro-i', writeReportFile: false })
  eq(res.surfaces.find(s => s.surface === 'home').status, 'error', 'timed-out draft → status=error (not a hang)')
  eq(res.surfaces.find(s => s.surface === 'home').error?.includes('ETIMEDOUT'), true, 'timeout reason captured')
  eq(res.converged, ['pdp'], 'pdp still converged after the hung surface was isolated')
}

// ── case (j): wall-clock budget breaker — surfaces past the deadline escalate without drafting ──
console.log('case j — budget breaker escalates remaining surfaces (no runaway overnight)')
{
  const { spawn, calls } = fakeSpawnWith(() => 0)
  // injected clock: t=0 at init, then jumps past the 1000ms budget before surface 2's draft
  let t = 0
  const now = () => { const v = t; t += 700; return v } // 0, 700, 1400(>1000), ...
  const deps = makeRealDeps({ spawn, env: ENV, dir: '/tmp/maestro-j', render: 'dev', claudeBin: 'claude', budgetMs: 1000, now })
  const res = await runMaestro({ deps, surfaces: ['home', 'pdp', 'cart'], dir: '/tmp/maestro-j', writeReportFile: false })
  eq(res.converged, ['home'], 'only the first surface (within budget) converged')
  eq(res.surfaces.find(s => s.surface === 'pdp').status, 'error', 'pdp escalated on budget breach')
  eq(res.surfaces.find(s => s.surface === 'pdp').error?.includes('budget'), true, 'budget reason captured')
  const cartDraft = calls.find(c => isDraft(c.cmd) && /cart/.test(argStr(c.args)))
  eq(!cartDraft, true, 'cart never drafted (no claude spawn) once over budget')
}

// ── case (g): the loop ALGORITHM proof (maestro-dryrun) rides this gate ──
console.log('case g — maestro-dryrun.mjs (algorithm proof) exits 0')
{
  const r = spawnSync(process.execPath, [DRYRUN], { encoding: 'utf-8' })
  eq(r.status, 0, 'maestro-dryrun.mjs all assertions pass')
}

console.log(failures === 0 ? '\n✓ MAESTRO-RUN — ALL WIRING ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
