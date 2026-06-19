#!/usr/bin/env node
// maestro:dryrun — HERMETIC proof of the Maestro Loop control logic (lib/maestro-loop.mjs), the
// stop-gate that must be green BEFORE the production Workflow runs on a real build. Mirrors
// brain-proof.mjs discipline: real loop function, FAKE draft/render/judge (no live store, no claude
// CLI, no theme dev), assert the algorithm converges / escalates / stays resilient / carries state.
//
// "Maestro state bugs are the worst kind" (plan risk #4) — this catches them in CI, not in a client
// build. Run: node maestro-dryrun.mjs (or `pnpm maestro:dryrun`). Exit 0 = all assertions pass.

import { runMaestroLoop, MAESTRO_MAX_ROUNDS } from './lib/maestro-loop.mjs'

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// fakes -------------------------------------------------------------------------
const draftOK = () => ({ ok: true })
const renderOK = () => ({ ok: true, url: 'http://127.0.0.1:9292' })
const pass = (confidence = 92) => ({ pass: true, confidence, findings: [] })
const fail = (n = 1) => ({ pass: false, confidence: 70, findings: Array.from({ length: n }, (_, i) => ({ check: `c${i}`, severity: 'blocker', fix_owner: 'loom', evidence: 'x' })) })
// judge that FAILs the first `failRounds` rounds then PASSes (per surface)
const judgeFailThenPass = (failRounds) => {
  const seen = new Map()
  return (surface) => { const r = (seen.get(surface) || 0) + 1; seen.set(surface, r); return r > failRounds ? pass() : fail(2) }
}

const recordCalls = []
const recorder = (surface, verdict, info) => recordCalls.push({ surface, verdict, rounds: info.rounds })

// ── case 1: converge round 1 (judge always PASS) ──
console.log('case 1 — all surfaces PASS on round 1')
{
  recordCalls.length = 0
  const res = await runMaestroLoop(
    { draft: draftOK, render: renderOK, judge: () => pass(), record: recorder },
    { surfaces: ['home', 'pdp', 'cart'] },
  )
  eq(res.converged, ['home', 'pdp', 'cart'], 'all 3 converged')
  eq(res.allPass, true, 'allPass true')
  eq(res.surfaces.every(s => s.rounds === 1), true, 'each took exactly 1 round')
  eq(recordCalls.map(r => r.verdict), ['PASS', 'PASS', 'PASS'], 'build-state recorded PASS per surface')
}

// ── case 2: converge on round 3 (FAIL,FAIL,PASS) ──
console.log('case 2 — converges on round 3 after 2 fails')
{
  const res = await runMaestroLoop(
    { draft: draftOK, render: renderOK, judge: judgeFailThenPass(2), record: recorder },
    { surfaces: ['home'] },
  )
  eq(res.converged, ['home'], 'home converged')
  eq(res.surfaces[0].rounds, 3, 'took exactly 3 rounds')
}

// ── case 3: escalate (judge always FAIL) — never loops forever ──
console.log('case 3 — escalates after maxRounds when never passing')
{
  const res = await runMaestroLoop(
    { draft: draftOK, render: renderOK, judge: () => fail(3), record: recorder },
    { surfaces: ['pdp'] },
  )
  eq(res.escalated, ['pdp'], 'pdp escalated (not converged)')
  eq(res.surfaces[0].status, 'FAIL', 'status FAIL')
  eq(res.surfaces[0].rounds, MAESTRO_MAX_ROUNDS, `stopped at maxRounds=${MAESTRO_MAX_ROUNDS} (no infinite loop)`)
  eq(res.surfaces[0].findings.length, 3, 'final findings carried for escalation')
}

// ── case 4: resilience — one surface throws, the rest still build ──
console.log('case 4 — a render throw isolates to that surface; loop continues')
{
  const render = (surface) => { if (surface === 'cart') throw new Error('theme push 500'); return renderOK() }
  const res = await runMaestroLoop(
    { draft: draftOK, render, judge: () => pass(), record: recorder },
    { surfaces: ['home', 'cart', 'account'] },
  )
  eq(res.converged, ['home', 'account'], 'home + account still converged despite cart failure')
  // 'error' (infra/render threw) is deliberately distinct from 'FAIL' (visual defect) — more informative
  eq(res.surfaces.find(s => s.surface === 'cart').status, 'error', 'cart isolated to status=error (infra, not a visual FAIL)')
  eq(res.escalated.includes('cart'), true, 'cart still counted as escalated (not converged)')
  eq(res.surfaces.find(s => s.surface === 'cart').error?.startsWith('render:'), true, 'cart error captured as render:')
}

// ── case 5: carried mind — cross-surface decisions accumulate + reach later drafts ──
console.log('case 5 — cross-surface decisions carry forward (the coherence ledger)')
{
  const draftWithDecision = (surface, round, ctx) => {
    // home declares a decision on round 1; later surfaces must SEE it in ctx
    if (surface === 'home') return { ok: true, decisions: ['one accent only (amber on navy)'] }
    return { ok: true, sawDecision: ctx.decisions.includes('one accent only (amber on navy)') }
  }
  let pdpSawDecision = null
  const draftProbe = async (surface, round, ctx) => { const r = draftWithDecision(surface, round, ctx); if (surface === 'pdp') pdpSawDecision = r.sawDecision; return r }
  const res = await runMaestroLoop(
    { draft: draftProbe, render: renderOK, judge: () => pass() },
    { surfaces: ['home', 'pdp'] },
  )
  eq(res.decisions.includes('one accent only (amber on navy)'), true, 'decision recorded in carried ledger')
  eq(pdpSawDecision, true, 'pdp draft SAW home\'s decision (coherence carried forward)')
}

// ── case 6: findings route to the next round's draft (fix loop) ──
console.log('case 6 — round-2 draft receives round-1 Lens findings')
{
  let round2SawFindings = null
  const draftSpy = async (surface, round, ctx) => { if (round === 2) round2SawFindings = (ctx.lastFindings || []).length; return { ok: true } }
  await runMaestroLoop(
    { draft: draftSpy, render: renderOK, judge: judgeFailThenPass(1) },
    { surfaces: ['home'] },
  )
  eq(round2SawFindings, 2, 'round-2 draft saw the 2 findings from round-1 Lens FAIL')
}

console.log(failures === 0 ? '\n✓ MAESTRO DRYRUN — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
