#!/usr/bin/env node
// Lens calibration loop (WS-G) — the human-in-the-loop that keeps the judge honest over time. Three modes:
//   --collect <repo-dir>   append that build's judge verdicts to the corpus (call post-publish to grow it)
//   --sample [n]           sample n (default 20) corpus frames → calibration-queue.json (grade: null) for Yash
//   --apply                read the graded calibration-queue.json → calibration-suggestions.json
//
// Yash grades each sampled frame agree/disagree-with-the-judge (5 min/week in the Learning Inbox). --apply
// turns disagreement into per-check SUGGESTIONS (clarify the rubric rule / nudge its weight). It SUGGESTS,
// never auto-edits rubrics or prompts — Yash/onyx ratify (orphan-rule doctrine: an unproven auto-edit is worse
// than none). The sampling + delta math are PURE (exported, hermetically tested); the IO is thin.
//
// Env: LENS_CALIBRATE_CORPUS (default <cwd>/lens-calibration-corpus.jsonl) · LENS_CALIBRATE_OUT (default cwd)
// Exit: 0 ok · 2 usage/env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = process.cwd()
// Central corpus by default so --collect from every store aggregates → the weekly sample is cross-store.
const CORPUS = process.env.LENS_CALIBRATE_CORPUS || path.join(os.homedir(), '.claude', 'memory', 'lens-calibration-corpus.jsonl')
const OUT = process.env.LENS_CALIBRATE_OUT || cwd
const die = (code, msg) => { console.error(`lens-calibrate: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }

// ── PURE (testable) ──────────────────────────────────────────────────────────
// Deterministic newest-biased spread: pick n frames spread across the corpus (variety of surfaces/checks),
// favouring the most recent. No Math.random → reproducible.
export function sampleFrames(corpus, n = 20) {
  if (!Array.isArray(corpus) || corpus.length <= n) return (corpus || []).slice()
  const step = corpus.length / n
  const out = []
  for (let i = 0; i < n; i += 1) out.push(corpus[Math.max(0, Math.floor(corpus.length - 1 - i * step))])
  return out
}
// graded: [{check, verdict, grade:'agree'|'disagree', note}] → per-check disagreement + suggestions.
// A check the judge is disagreed-with on ≥50% of ≥3 graded frames → its rubric rule is likely mis-calibrated.
export function computeCalibration(graded) {
  const perCheck = {}
  for (const g of (graded || [])) {
    if (!g || !g.grade || !g.check) continue
    const c = perCheck[g.check] || (perCheck[g.check] = { agree: 0, disagree: 0 })
    if (g.grade === 'agree') c.agree += 1; else if (g.grade === 'disagree') c.disagree += 1
  }
  const suggestions = []
  for (const [check, c] of Object.entries(perCheck)) {
    const total = c.agree + c.disagree
    const rate = total ? c.disagree / total : 0
    if (total >= 3 && rate >= 0.5) {
      suggestions.push({ check, disagreeRate: Math.round(rate * 100) / 100, graded: total, action: 'review-rubric-rule', detail: `Yash disagreed with the judge on ${c.disagree}/${total} graded frames for "${check}" — the rubric rule is likely mis-calibrated (too strict / too loose / ambiguous). Clarify the rule or adjust its weight, then re-sample. NOT auto-applied — ratify first.` })
    }
  }
  return { perCheck, suggestions }
}

// ── IO modes ──────────────────────────────────────────────────────────────────
function readJsonl(p) { try { return fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] } }

function collect(repoDir) {
  const jd = path.join(repoDir, 'gate-reports', 'lens', 'judge')
  let added = 0
  try {
    for (const fn of fs.readdirSync(jd)) {
      if (!fn.endsWith('.json')) continue
      let v; try { v = JSON.parse(fs.readFileSync(path.join(jd, fn), 'utf-8')) } catch { continue }
      const rec = { key: v.key || `${v.surface}-${v.viewport}`, surface: v.surface, verdict: v.verdict, confidence: v.confidence, findings: (v.findings || []).map(f => ({ check: f.check, severity: f.severity })) }
      fs.appendFileSync(CORPUS, `${JSON.stringify(rec)}\n`); added += 1
    }
  } catch (e) { die(2, `no judge verdicts at ${jd}: ${e.message}`) }
  console.log(`lens-calibrate: collected ${added} verdict(s) → ${path.relative(cwd, CORPUS)}`)
}

function sample(n) {
  const corpus = readJsonl(CORPUS)
  // graceful: an empty corpus is normal until --collect has run post-build → no-op, exit 0 (the weekly
  // cron stays harmless until there's something to calibrate against).
  if (!corpus.length) { console.log(`lens-calibrate: corpus empty (${CORPUS}) — nothing to sample yet (run --collect after builds). No-op.`); return }
  // one grading row per (frame × finding) so Yash grades specific judge calls, plus the overall verdict
  const frames = sampleFrames(corpus, n)
  const queue = []
  for (const f of frames) {
    const findings = f.findings && f.findings.length ? f.findings : [{ check: `verdict:${f.verdict}`, severity: 'info' }]
    for (const fd of findings) queue.push({ key: f.key, surface: f.surface, check: fd.check, verdict: f.verdict, confidence: f.confidence, grade: null, note: '' })
  }
  const p = path.join(OUT, 'calibration-queue.json')
  fs.writeFileSync(p, `${JSON.stringify({ generated: 'sample', count: queue.length, instructions: "Set grade to 'agree' or 'disagree' for each row (does the judge's call match what YOU see?), add a note, then run --apply.", queue }, null, 2)}\n`)
  console.log(`lens-calibrate: sampled ${queue.length} grading row(s) from ${corpus.length} corpus frame(s) → ${path.relative(cwd, p)} (grade them, then --apply)`)
}

function apply() {
  const p = path.join(OUT, 'calibration-queue.json')
  let q; try { q = JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { die(2, `no graded ${path.relative(cwd, p)} — run --sample + grade first`) }
  const { perCheck, suggestions } = computeCalibration(q.queue || [])
  const out = path.join(OUT, 'calibration-suggestions.json')
  fs.writeFileSync(out, `${JSON.stringify({ generated: 'apply', perCheck, suggestions, note: 'SUGGESTIONS ONLY — ratify before editing rubrics/prompts.' }, null, 2)}\n`)
  console.log(`lens-calibrate: ${suggestions.length} calibration suggestion(s) from ${Object.keys(perCheck).length} graded check(s) → ${path.relative(cwd, out)}`)
  for (const s of suggestions) console.log(`  ⚙ ${s.check}: disagree ${Math.round(s.disagreeRate * 100)}% (${s.graded} graded) — ${s.action}`)
}

function main() {
  const a = process.argv.slice(2)
  if (a[0] === '--collect') { const dir = a[1] || cwd; return collect(dir) }
  if (a[0] === '--sample') { return sample(Number(a[1]) || 20) }
  if (a[0] === '--apply') { return apply() }
  console.log('Usage: lens-calibrate.mjs --collect <repo-dir> | --sample [n] | --apply'); process.exit(a.length ? 2 : 0)
}

// CLI only — importable for tests (sampleFrames/computeCalibration) without side effects
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
