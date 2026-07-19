#!/usr/bin/env node
// gate-autofix — the CODE/CONTENT sibling of lens-autofix.mjs. Where lens-autofix heals VISUAL (#18)
// blockers, this heals the STATIC code/content gate blockers (theme-check, editability, design-tokens,
// render-check, a11y, layout, content-quality, …) that the maestro loop used to only REPORT + escalate.
// Together they make `maestro:build` CONVERGE every layer to green instead of stopping at "here are
// the problems" — the Lovable "it fixes itself" behavior (2026-07-19 done-means-done build).
//
// One pass: re-run the code gates → collect blockers → route each to its owner (gate-owner.mjs) →
// dispatch a headless `claude -p` owner fix (edit theme files, stay inside the design system) →
// re-run only the affected gates → converge or escalate. ≤N rounds; a fix that PERSISTED once is not
// retried (cross-run anti-loop via fix-outcomes.jsonl); anything needing a real asset/claim/legal
// decision (honesty, imagery, legal, secret, porter store-data, unknown gate) ESCALATES, never a blind edit.
//
// REUSES the proven loop control (lib/lens-autofix-loop.mjs) + the anti-loop ledger
// (lib/lens-fix-outcomes.mjs) — identical algorithm, different injected effects.
//
// Env: REPORT_DIR (gate-reports) · GATE_FIX_MAX_ROUNDS (3) · LENS_FIX_MODEL (sonnet) · CLAUDE_BIN (claude)
// Exit: 0 = converged (code gates green) · 1 = unresolved after max rounds / escalations · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { persistedKeys, readOutcomes, appendOutcomes } from './lib/lens-fix-outcomes.mjs'
import { runAutofixLoop } from './lib/lens-autofix-loop.mjs'
import { CODE_GATE_OWNER, CODE_OWNERS, ESCALATE_OWNER, classifyFinding } from './lib/gate-owner.mjs'

const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REPORT_ABS = path.resolve(cwd, REPORT_DIR)
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const FIX_MODEL = process.env.LENS_FIX_MODEL || 'sonnet'
const MAX_ROUNDS = Number(process.env.GATE_FIX_MAX_ROUNDS || 3)
const OUTCOMES_DIR = path.join(REPORT_ABS, 'gate-autofix') // separate ledger from lens
const ESCALATION = path.join(REPORT_ABS, 'gate-autofix-escalation.json')

const die = (code, msg) => { console.error(`gate-autofix: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }
const gatesScript = path.join(HERE, 'theme-gates.mjs')

// The static code gates we can auto-heal that ALSO exist in the live manifest (stays coherent if a
// gate is renamed/retired — never pass an unknown --gate name, which theme-gates rejects with exit 2).
function liveCodeGates() {
  // Optional scoping: GATE_FIX_GATES=consistency,design-tokens heals only those (a bounded run).
  const only = (process.env.GATE_FIX_GATES || '').split(',').map(s => s.trim()).filter(Boolean)
  let names
  try {
    const manifest = JSON.parse(execFileSync(process.execPath, [gatesScript, '--list-json'], { cwd, encoding: 'utf-8' }))
    const live = new Set(manifest.filter(g => g.kind === 'static').map(g => g.name))
    names = Object.keys(CODE_GATE_OWNER).filter(n => live.has(n))
  } catch {
    names = Object.keys(CODE_GATE_OWNER)
  }
  return only.length ? names.filter(n => only.includes(n)) : names
}

function runGates(gateNames) {
  const args = [gatesScript, ...gateNames.flatMap(n => ['--gate', n]), '--report-dir', REPORT_DIR]
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf-8', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') }
}

// Read the just-written summary.json → blockers as findings, tagged with the owner (or ESCALATE_OWNER).
// surface = the GATE NAME so the loop's `affected` re-runs exactly the gates that blocked.
function collectBlockers(gateNames) {
  const out = []
  let summary
  try { summary = JSON.parse(fs.readFileSync(path.join(REPORT_ABS, 'summary.json'), 'utf-8')) } catch { return out }
  for (const gate of gateNames) {
    const g = (summary.gates || {})[gate]
    if (!g || !Array.isArray(g.blockers)) continue
    for (const b of g.blockers) {
      const cls = classifyFinding({ gate, check: b.id })
      out.push({
        gate, check: b.id, surface: gate, viewport: '',
        fix_owner: cls.fixable ? cls.owner : ESCALATE_OWNER,
        reason: cls.fixable ? null : cls.reason,
        evidence: `${b.detail || ''}${b.page ? ` [${b.page}]` : ''}`.slice(0, 240),
      })
    }
  }
  return out
}

function dispatchFix(owner, findings) {
  const byGate = {}
  for (const f of findings) (byGate[f.gate] = byGate[f.gate] || []).push(f)
  const list = Object.entries(byGate).map(([gate, fs_]) =>
    `Gate ${gate}:\n${fs_.map(f => `  - ${f.check}: ${f.evidence}`).join('\n')}`).join('\n')
  const prompt = [
    `You are ${owner}, a Boldteq Shopify Website Team engineer. The theme repo is your working directory: ${cwd}.`,
    `The static quality gates found these code/content blockers. EDIT the theme files to fix each one.`,
    list,
    `RULES: stay strictly inside the locked design system — use the theme's CSS variables / --ds-* tokens, NEVER a hardcoded hex/rgb or off-scale px (gate #8 blocks them). Fix ONLY these blockers; change nothing unrelated. Do NOT edit a base Dawn/Minimog section (pulls its whole body into the diff) — fix via your own custom sections/snippets/templates. If a blocker actually needs REAL content, a real image/asset, a factual claim's evidence, a legal decision, or store data (not theme code) — do NOT invent it; say so and leave it for escalation.`,
    `When done, print one line: FIXED: <comma-separated gate.check ids you actually fixed in code>.`,
  ].join('\n\n')
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', FIX_MODEL, '--no-session-persistence'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { out += d.toString() })
    child.on('error', e => resolve({ owner, ok: false, note: `spawn failed: ${e.message}` }))
    child.on('close', () => resolve({ owner, ok: true, note: (out.match(/FIXED:[^\n]*/) || ['(no FIXED line)'])[0].slice(0, 200) }))
  })
}

function escalate(findings, rounds) {
  fs.mkdirSync(REPORT_ABS, { recursive: true })
  fs.writeFileSync(ESCALATION, `${JSON.stringify({ rounds, ts_note: 'stamp at read time', unresolved: findings.map(f => ({ gate: f.gate, check: f.check, owner: f.fix_owner, reason: f.reason || null, evidence: f.evidence })) }, null, 2)}\n`)
  console.log(`gate-autofix: ESCALATION → ${path.relative(cwd, ESCALATION)} (${findings.length} unresolved)`)
  for (const f of findings) console.log(`  ⤴ [${f.fix_owner}] ${f.gate}/${f.check}: ${String(f.evidence).slice(0, 90)}`)
}

async function main() {
  if (spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' }).error) die(2, `claude CLI not found (${CLAUDE_BIN}) — the self-heal loop dispatches owner fixes via 'claude -p'`)
  const codeGates = liveCodeGates()
  if (!codeGates.length) die(2, 'no code gates resolved from the live manifest')
  fs.mkdirSync(OUTCOMES_DIR, { recursive: true })
  const persisted = persistedKeys(readOutcomes(OUTCOMES_DIR))
  console.log(`gate-autofix: ${codeGates.length} code gate(s), max ${MAX_ROUNDS} round(s)${persisted.size ? `, ${persisted.size} prior persisted finding(s) loaded` : ''}`)

  // ONE round = re-run the (affected, else all) code gates → collect blockers. Reuses the SAME loop
  // control + anti-loop ledger as lens-autofix; escalate-bucket findings (fix_owner='human') fall to
  // the loop's `data` path and, with porterOptIn=false, escalate instead of being blind-fixed.
  const runRound = (affected) => {
    const gates = (affected && affected.length) ? affected.filter(g => codeGates.includes(g)) : codeGates
    if (!gates.length) return { enforcePass: true, findings: [] }
    console.log('\n──')
    const r = runGates(gates)
    const findings = collectBlockers(gates)
    console.log(`gate-autofix: ${gates.join(',')} → ${findings.length} blocker(s)`)
    return { enforcePass: r.code === 0 && findings.length === 0, findings }
  }
  const fix = async (owner, list) => { console.log(`  → ${owner}: fixing ${list.length} blocker(s)…`); const r = await dispatchFix(owner, list); console.log(`    ${owner}: ${r.note}`) }
  const recordOutcomes = (round, diff) => appendOutcomes(OUTCOMES_DIR, round, diff, new Date().toISOString())

  let result
  try {
    result = await runAutofixLoop(
      { runRound, fix, fixPorter: async () => {}, recordOutcomes, log: (m) => console.log(`gate-autofix: ${m}`) },
      { maxRounds: MAX_ROUNDS, codeOwners: CODE_OWNERS, porterOptIn: false, persisted, affected: null },
    )
  } catch (e) { die(2, e.message) }

  if (result.converged) { console.log(`\ngate-autofix: ✅ CONVERGED in ${result.rounds} round(s) — code gates green.`); process.exit(0) }
  const esc = result.escalation || {}
  const unresolved = esc.findings || []
  escalate(unresolved, result.rounds)
  console.log(`gate-autofix: ❌ not converged after ${result.rounds} round(s).`)
  process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => die(2, `unexpected failure: ${e.message}`))
}

export { collectBlockers, liveCodeGates }
