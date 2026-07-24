#!/usr/bin/env node
// gepa-optimize — the outcome-optimizer (roadmap Phase 4.2 / audit gap 6). Today agent rules are
// LLM-generated + LLM-critic-filtered: "an LLM thinks this rule is good", never "this rule provably
// raised the score". GEPA/DSPy-style optimization closes that: propose prompt/rule variants, score each
// against the golden benchmark, and KEEP ONLY variants that PROVABLY raise it — a variant that doesn't
// beat the incumbent is discarded, so an optimization pass can only improve or no-op, never regress.
//
// THE TWO SAFETY GUARANTEES (the pure, tested core — selectWinner):
//   1. NO REGRESSION: a candidate is accepted only if it beats the incumbent on TRAIN by ≥ minGain.
//      With no improving candidate, the incumbent is retained unchanged. A pass can never lower quality.
//   2. NO OVERFIT: cases are split TRAIN / HELD-OUT (deterministic, by index). A candidate that improves
//      TRAIN but regresses HELD-OUT is REJECTED — it memorized the train cases instead of generalizing.
//      Winner = the eligible candidate with the best HELD-OUT score (generalization-first).
//
// The LLM steps (propose variants, generate an output, judge it) are INJECTABLE, so the harness + its
// guarantees are proven hermetically (src/gepaOptimize.test.mjs) without burning tokens. A real run
// (--apply) is an expensive batch job: rounds × variants × cases × (generate + judge) Claude calls.
//
// Usage:
//   node scripts/gepa-optimize.mjs --agent <name> [--rounds 2] [--variants 4] [--holdout 0.34] [--base <file>]
// It PROPOSES a proven-better prompt + the full score evidence into docs/gepa/<agent>.optimized.md; it
// does NOT auto-mutate the agent .md (that goes through the governor's safety gates). Dry-run by default.
// Exit: 0 (ran; improved or honestly no-op) · 2 usage/env error

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..')
const GOLDEN = path.join(REPO, 'src', 'intelligence', 'eval', 'golden')

// ── PURE CORE (safety guarantees — tested without a model) ────────────────────
export function aggregate(perCaseScores) {
  const xs = perCaseScores.filter((x) => typeof x === 'number')
  if (!xs.length) return { mean: null, min: null, n: 0 }
  return { mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4), min: +Math.min(...xs).toFixed(4), n: xs.length }
}

// Deterministic TRAIN / HELD-OUT split (every Nth case is held out — no randomness, reproducible).
export function splitCases(cases, holdoutFrac = 0.34) {
  const step = Math.max(2, Math.round(1 / Math.min(0.5, Math.max(0.1, holdoutFrac))))
  const train = [], heldout = []
  cases.forEach((c, i) => ((i % step === step - 1) ? heldout : train).push(c))
  // never leave a side empty (tiny sets): fall back to a 1-case held-out
  if (cases.length >= 2 && (!heldout.length || !train.length)) { train.length = 0; heldout.length = 0; cases.forEach((c, i) => (i === cases.length - 1 ? heldout : train).push(c)) }
  return { train, heldout }
}

// THE GUARANTEE. incumbent/candidates: { id, prompt, train:{mean}, heldout:{mean} }.
// Accept only a candidate that (a) beats incumbent on TRAIN by ≥ minGain AND (b) does NOT regress
// HELD-OUT. Among those, pick the best HELD-OUT (generalization-first). Else keep the incumbent.
export function selectWinner(incumbent, candidates, { minGain = 0.02 } = {}) {
  const EPS = 1e-9
  const eligible = candidates.filter((c) =>
    c.train && typeof c.train.mean === 'number' && c.heldout && typeof c.heldout.mean === 'number' &&
    c.train.mean >= incumbent.train.mean + minGain - EPS &&           // (a) real train gain
    c.heldout.mean >= incumbent.heldout.mean - EPS)                    // (b) no held-out regression
  if (!eligible.length) return { winner: incumbent, changed: false, reason: 'no candidate beat the incumbent without regressing held-out' }
  eligible.sort((a, b) => b.heldout.mean - a.heldout.mean || b.train.mean - a.train.mean)
  const w = eligible[0]
  return { winner: w, changed: w.id !== incumbent.id, reason: `train ${incumbent.train.mean}→${w.train.mean}, held-out ${incumbent.heldout.mean}→${w.heldout.mean}` }
}

// ── IO (injectable — the slow/LLM parts) ──────────────────────────────────────
function loadAgentCases(agent) {
  let files = []
  try { files = fs.readdirSync(GOLDEN).filter((f) => f.endsWith('.json')) } catch { return [] }
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(GOLDEN, f), 'utf-8'))).filter((c) => c.agent === agent)
}

// Default LLM IO — lazy so the pure core + tests never import the model layer.
async function defaultIO() {
  const { judge } = await import('../src/intelligence/eval/judge.mjs')
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { runClaudeSync } = require('../src/lib/runClaude.js')
  return {
    generate: async (prompt, task) => runClaudeSync(`${prompt}\n\n# TASK\n${task}\n\nProduce the result now.`, 180000),
    judge: async ({ task, output, reference }) => (await judge({ task, output, reference })).overall,
    propose: async (incumbentPrompt, failures, n) => {
      const ask = `You are optimizing an agent instruction. CURRENT INSTRUCTION:\n"""${incumbentPrompt}"""\n\nRecent failure notes across the eval cases:\n${failures.slice(0, 8).map((f) => `- ${f}`).join('\n')}\n\nPropose ${n} DISTINCT improved versions of the instruction that would fix these failures WITHOUT overfitting to any single case. Return ONLY a JSON array of ${n} strings.`
      const raw = runClaudeSync(ask, 120000)
      try { const arr = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)); return arr.slice(0, n).map(String) } catch { return [] }
    },
  }
}

// Evaluate a prompt across a set of cases → aggregate + the failure notes (for the next proposal round).
export async function evaluatePrompt(prompt, cases, io) {
  const scores = [], failures = []
  for (const c of cases) {
    const output = await io.generate(prompt, c.task)
    const overall = await io.judge({ task: c.task, output, reference: (c.fixtures && c.fixtures.good) || c.reference || '' })
    scores.push(overall)
    if (overall < 0.7) failures.push(`${c.id}: scored ${overall}`)
  }
  return { ...aggregate(scores), failures }
}

// The optimization loop. Returns the winning prompt + a full trace. `io` injectable for tests.
export async function optimize({ agent, base, cases, rounds = 2, variants = 4, holdoutFrac = 0.34, minGain = 0.02, io }) {
  const { train, heldout } = splitCases(cases, holdoutFrac)
  const trace = []
  const eTrain = await evaluatePrompt(base, train, io)
  const eHeld = await evaluatePrompt(base, heldout, io)
  let incumbent = { id: 'base', prompt: base, train: eTrain, heldout: eHeld }
  trace.push({ round: 0, id: 'base', train: eTrain.mean, heldout: eHeld.mean })

  for (let r = 1; r <= rounds; r++) {
    const proposals = await io.propose(incumbent.prompt, incumbent.train.failures || [], variants)
    const candidates = []
    for (let k = 0; k < proposals.length; k++) {
      const t = await evaluatePrompt(proposals[k], train, io)
      const h = await evaluatePrompt(proposals[k], heldout, io)
      const cand = { id: `r${r}v${k}`, prompt: proposals[k], train: t, heldout: h }
      candidates.push(cand)
      trace.push({ round: r, id: cand.id, train: t.mean, heldout: h.mean })
    }
    const { winner, changed } = selectWinner(incumbent, candidates, { minGain })
    if (changed) incumbent = winner
  }
  // Only report an improvement if the FINAL incumbent beats the ORIGINAL base on held-out.
  const improved = incumbent.id !== 'base' && incumbent.heldout.mean > eHeld.mean + 1e-9
  return { agent, improved, base: { train: eTrain.mean, heldout: eHeld.mean }, winner: { id: incumbent.id, train: incumbent.train.mean, heldout: incumbent.heldout.mean, prompt: incumbent.prompt }, trace }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2)
  const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : d }
  const agent = arg('--agent')
  if (!agent) { console.error('usage: gepa-optimize.mjs --agent <name> [--rounds 2] [--variants 4] [--holdout 0.34] [--base <file>]'); process.exit(2) }
  const cases = loadAgentCases(agent)
  if (cases.length < 2) { console.error(`gepa: agent "${agent}" has ${cases.length} golden case(s) — need ≥2 to split train/held-out. Grow the corpus first.`); process.exit(2) }
  const baseFile = arg('--base')
  const base = baseFile ? fs.readFileSync(baseFile, 'utf-8') : `You are ${agent}. Do the task to the team's quality bar.`
  const io = await defaultIO()
  console.log(`gepa: optimizing "${agent}" over ${cases.length} golden case(s) · ${arg('--rounds', 2)} round(s) × ${arg('--variants', 4)} variant(s) — this makes many Claude calls…`)
  const res = await optimize({ agent, base, cases, rounds: Number(arg('--rounds', 2)), variants: Number(arg('--variants', 4)), holdoutFrac: Number(arg('--holdout', 0.34)), io })

  const outDir = path.join(REPO, 'docs', 'gepa'); fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `${agent}.optimized.md`)
  const md = [
    `# GEPA optimization — ${agent}`, '',
    res.improved ? `✅ Found a prompt that PROVABLY improves held-out score: **${res.base.heldout} → ${res.winner.heldout}** (train ${res.base.train} → ${res.winner.train}).`
      : `➖ No variant beat the base without regressing held-out. Base retained (base held-out ${res.base.heldout}). An honest no-op — never a regression.`,
    '', '## Trace (every variant scored)', '',
    '| round | id | train | held-out |', '|---|---|---|---|',
    ...res.trace.map((t) => `| ${t.round} | ${t.id} | ${t.train} | ${t.heldout} |`),
    '', res.improved ? '## Proposed optimized instruction (review → apply via the governor)\n\n```\n' + res.winner.prompt + '\n```' : '',
  ].join('\n')
  fs.writeFileSync(outFile, md + '\n')
  console.log(res.improved ? `gepa: IMPROVED — held-out ${res.base.heldout} → ${res.winner.heldout}. Evidence + proposed prompt → ${path.relative(REPO, outFile)}`
    : `gepa: no improvement found (honest no-op, base retained). Trace → ${path.relative(REPO, outFile)}`)
  process.exit(0)
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main()
