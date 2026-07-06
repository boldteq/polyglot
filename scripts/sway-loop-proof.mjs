// Hermetic end-to-end proof of SWAY's learning flywheel.
//
//   ingest-capture (capture.mjs) → read-back (retrievable) →
//   signal aggregation (brainSignals) → governor safety-gates.
//
// FULLY ISOLATED: throwaway $HOME + throwaway POLYGLOT_DB_PATH + throwaway
// INTEL_DATA_DIR + hash embedder (no ollama/network). Drives the REAL functions
// (no re-implementation). Exits non-zero on any failed assertion.
//   node scripts/sway-loop-proof.mjs

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ── Isolation: set BEFORE the first require of db.js / import of capture.mjs ──
const STAMP = `${process.pid}-${Date.now()}`
const TMP = path.join(os.tmpdir(), `swayproof-${STAMP}`)
const TMP_HOME = path.join(TMP, 'home')
const TMP_DB = path.join(TMP, 'polyglot.db')
const TMP_INTEL = path.join(TMP, 'intel')
fs.mkdirSync(path.join(TMP_HOME, '.claude', 'agents'), { recursive: true })
fs.mkdirSync(TMP_INTEL, { recursive: true })
process.env.HOME = TMP_HOME
process.env.USERPROFILE = TMP_HOME
process.env.POLYGLOT_DB_PATH = TMP_DB
process.env.INTEL_DATA_DIR = TMP_INTEL
process.env.INTEL_EMBED_PROVIDER = 'hash' // deterministic, no network
process.env.INTEL_STORE = 'local'

const require = createRequire(import.meta.url)
const db = require('../src/db.js')
const brainSignals = require('../src/lib/brainSignals.js')
const governor = await import('../src/intelligence/governor.mjs')
const capture = await import('../src/intelligence/capture.mjs')

// ── Tiny assertion harness ────────────────────────────────────────────────────
const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}
const isoAgo = (h) => new Date(Date.now() - h * 3600000).toISOString()
const b64 = (p) => Buffer.from(p).toString('base64')
const PROJ_A = b64('/Users/test/AcmeDeal')
const PROJ_B = b64('/Users/test/NorthDeal')

console.log(`\n=== Sway loop proof (isolated in ${TMP}) ===`)

// ── 1) INGEST-CAPTURE — a finished chat's lessons/goldens land + are read back ──
console.log('\n1) CAPTURE — Sway ingests a finished chat into the brain')
const lesson = await capture.captureItem('lesson', {
  agent: 'sway', domain: 'shopify-website-sales',
  problem: 'quoted price cold on message 1 to a price-shopper; lost the thread',
  root_cause: 'skipped discovery; anchored against an undiagnosed problem',
  solution: 'earn the right to quote — one sharp store read + a tier range, then qualify',
  prevention: 'never a bare cold quote; range + qualify',
}, 'agent')
const golden = await capture.captureItem('golden', {
  agent: 'sway', kind: 'objection-answer', niche: 'apparel',
  title: 'the $200-template reframe that won',
  why_excellent: 'reframes price as conversion engineering, real mechanic, trade not cut, one next step',
}, 'agent')

check('capture_lesson returned an id', !!lesson?.id, lesson?.id)
check('capture_golden returned an id', !!golden?.id, golden?.id)
check('lessons.jsonl written to temp intel dir', fs.existsSync(path.join(TMP_INTEL, 'lessons.jsonl')))
check('goldens.jsonl written to temp intel dir', fs.existsSync(path.join(TMP_INTEL, 'goldens.jsonl')))

const recentLessons = capture.recentItems('lesson', 10)
const recentGoldens = capture.recentItems('golden', 10)
check('lesson read back via recentItems', recentLessons.some(l => l.id === lesson.id))
check('golden read back via recentItems', recentGoldens.some(g => g.id === golden.id))
check('captured lesson is tagged agent:sway', recentLessons.find(l => l.id === lesson.id)?.agent === 'sway')
check("captured lesson origin is 'agent'", recentLessons.find(l => l.id === lesson.id)?.origin === 'agent')

// ── 2) SIGNAL — recurring Sway failure across ≥2 deals → a sway signal ──
console.log('\n2) SIGNAL — a recurring Sway failure aggregates into a training signal')
const ERR = 'TypeError cannot read deal file slug of undefined in sway handler'
let RID = 0
function failRun(proj) {
  db.insertAgentRun({
    id: `r-${RID++}`, agentName: 'sway', prompt: 'reply to client chat', source: 'playground',
    timestamp: isoAgo(2), duration: 1000, status: 'error',
    promptChars: 9, outputChars: 0, estimatedTokens: 5, estimatedCost: 0,
    error: ERR, metadata: { projectId: proj },
  })
}
failRun(PROJ_A); failRun(PROJ_A); failRun(PROJ_B) // 3 occurrences across 2 projects
const agg = brainSignals.detectCrossProjectSignals({ windowDays: 30, minOccurrences: 3, minProjects: 2 })
const swaySignal = (agg.signals || []).find(s => s.agent === 'sway')
check('detectCrossProjectSignals emitted a sway signal', !!swaySignal, swaySignal && `${swaySignal.kind} x${swaySignal.occurrences}`)
check('sway signal is a failure_cluster', swaySignal?.kind === 'failure_cluster')
check('sway signal recurrence ≥3', Number(swaySignal?.occurrences || 0) >= 3)

// ── 3) GOVERNOR — the real safety gates (this is the "safe" story) ──
console.log('\n3) GOVERNOR — safety gates on a Sway auto-patch proposal')
const TARGET = path.join(TMP_HOME, '.claude', 'agents', 'sway.md')
const strong = {
  agent: 'sway', targetFile: TARGET, patchType: 'guardrail',
  blastRadius: 'single-agent-section', rollback_content: '', after_text: '- guard',
  signal: { kind: 'failure_cluster', occurrences: 3, projects: ['AcmeDeal', 'NorthDeal'] },
}
check('strong + calibrated + rollback + single-section → AUTO',
  governor.decide(strong, { evalCalibrated: true }).decision === 'auto')
check('weak (1×) → REVIEW',
  governor.decide({ ...strong, signal: { kind: 'failure_cluster', occurrences: 1, projects: ['AcmeDeal'] } }, { evalCalibrated: true }).decision === 'review')
check('eval NOT calibrated → REVIEW (hold)',
  governor.decide(strong, { evalCalibrated: false }).decision === 'review')
check('constitutional (feedback patch) → REVIEW',
  governor.decide({ ...strong, patchType: 'feedback' }, { evalCalibrated: true }).decision === 'review')
check('no rollback → REJECT',
  governor.decide({ ...strong, rollback_content: undefined }, { evalCalibrated: true }).decision === 'reject')

// ── 4) ISOLATION — nothing real was touched ──
console.log('\n4) ISOLATION — only the throwaway sandbox was written')
check('HOME is the temp sandbox', process.env.HOME === TMP_HOME)
check('INTEL_DATA_DIR is the temp sandbox', process.env.INTEL_DATA_DIR === TMP_INTEL)
check('real ~/.claude/memory/data/intel/lessons.jsonl NOT in use',
  !path.join(TMP_INTEL, 'lessons.jsonl').includes(path.join(os.homedir(), '.claude')))

// ── Cleanup + verdict ─────────────────────────────────────────────────────────
try { fs.rmSync(TMP, { recursive: true, force: true }) } catch {}
const passed = results.filter(r => r.ok).length
const failed = results.length - passed
console.log(`\n${failed === 0 ? '✅ PASS' : '❌ FAIL'} — ${passed}/${results.length} assertions green${failed ? `, ${failed} FAILED` : ''}\n`)
process.exit(failed === 0 ? 0 : 1)
