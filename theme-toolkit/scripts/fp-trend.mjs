#!/usr/bin/env node
// #2 — gate false-positive trend dashboard. The 26-gate stack is only trustworthy if a gate that
// keeps BLOCKING builds that ship anyway (i.e. its block gets waived) is visible — a chronic
// false-positive is as corrosive as a miss (Seraphine round-5 doctrine: a gate that false-BLOCKs an
// honest build is as bad as a false-pass). This aggregates a run-history ledger and flags gates whose
// findings look like noise, so Witness's weekly sweep (Sprint 4 #44) has data to act on.
//
// FP proxies (no human labels needed — both are mechanical):
//   • waive-rate  — runs where the gate was waived ÷ runs it appeared in. You waive a gate when it
//                   wrongly blocked, so a high waive-rate ≈ a high false-positive rate.
//   • flap        — a blocker id that appears, clears, then reappears across runs without converging.
//                   A finding that won't stay fixed is usually flaky/non-deterministic (a FP smell).
//
// Usage:
//   node fp-trend.mjs --record       append the current gate-reports/summary.json to the ledger
//   node fp-trend.mjs                 aggregate the ledger → gate-reports/fp-trend.json + table
//   node fp-trend.mjs --strict       exit 1 if any gate is flagged (for a cron/Witness gate)
// Env: FP_TREND_LEDGER (gate-reports/fp-trend.jsonl) · REPORT_DIR (gate-reports) · FP_THRESHOLD (0.10)
// Exit: 0 = ok (or recorded) · 1 = flagged (--strict only) · 2 = env error
//
// aggregateFpTrend is PURE + exported so __fixtures__/fp-trend proves it. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// PURE: count "cleared-then-returned" transitions in a chronological presence array. 0 = stable
// (always present, always absent, or fixed-once-and-stayed-fixed); ≥1 = it came back after clearing.
export function flaps(presence) {
  let count = 0
  let wasTrue = false
  let dipped = false
  for (const p of presence) {
    if (p) { if (dipped) { count += 1; dipped = false } wasTrue = true }
    else if (wasTrue) { dipped = true }
  }
  return count
}

// PURE: aggregate chronological run records (each = a summary.json) into per-gate FP stats + flags.
// records[i].gates = { <name>: { pass, blockers:[{id}], warnings:[{id}], waived } }.
export function aggregateFpTrend(records, { threshold = 0.10, minRuns = 3 } = {}) {
  const seq = {} // gate → ordered array of { blockerIds:Set, warnCount, waived }
  for (const rec of records || []) {
    for (const [name, g] of Object.entries(rec?.gates || {})) {
      ;(seq[name] ||= []).push({
        blockerIds: new Set((g?.blockers || []).map(b => b.id)),
        warnCount: (g?.warnings || []).length,
        waived: g?.waived === true,
      })
    }
  }
  const gates = {}
  const flagged = []
  for (const [name, runs] of Object.entries(seq)) {
    const total = runs.length
    const blockRuns = runs.filter(r => r.blockerIds.size > 0).length
    const warnRuns = runs.filter(r => r.warnCount > 0).length
    const waivedRuns = runs.filter(r => r.waived).length
    const waiveRate = total ? waivedRuns / total : 0
    // flap per blocker id across the chronological run sequence
    const allIds = new Set(runs.flatMap(r => [...r.blockerIds]))
    const flappers = []
    for (const id of allIds) {
      const f = flaps(runs.map(r => r.blockerIds.has(id)))
      if (f >= 2) flappers.push({ id, flaps: f })
    }
    const reasons = []
    if (total >= minRuns && waiveRate > threshold) reasons.push(`waive-rate ${(waiveRate * 100).toFixed(0)}% > ${(threshold * 100).toFixed(0)}%`)
    if (flappers.length) reasons.push(`${flappers.length} flapping finding(s): ${flappers.map(x => x.id).slice(0, 3).join(', ')}`)
    gates[name] = { runs: total, blockRuns, warnRuns, waivedRuns, waiveRate: Number(waiveRate.toFixed(3)), flappers }
    if (reasons.length) flagged.push({ gate: name, reasons })
  }
  return { gates, flagged }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2)
  const cwd = process.cwd()
  const reportDir = process.env.REPORT_DIR || 'gate-reports'
  const ledger = path.resolve(cwd, process.env.FP_TREND_LEDGER || path.join(reportDir, 'fp-trend.jsonl'))
  const threshold = Number(process.env.FP_THRESHOLD || '0.10')

  if (argv.includes('--record')) {
    const summaryPath = path.resolve(cwd, reportDir, 'summary.json')
    let summary
    try { summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) } catch (e) { console.error(`fp-trend: ENV-ERROR — no readable summary.json (${e.message}); run the gates first`); process.exit(2) }
    const rec = { ts: new Date().toISOString(), sha: summary.sha ?? null, mode: summary.mode ?? null, gates: summary.gates ?? {}, severityCounts: summary.severityCounts ?? null }
    fs.mkdirSync(path.dirname(ledger), { recursive: true })
    fs.appendFileSync(ledger, `${JSON.stringify(rec)}\n`)
    console.log(`fp-trend: recorded run @ ${rec.sha ? rec.sha.slice(0, 7) : 'no-sha'} → ${path.relative(cwd, ledger)}`)
    process.exit(0)
  }

  let records = []
  try { records = fs.readFileSync(ledger, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) } catch { records = [] }
  const out = aggregateFpTrend(records, { threshold })
  const result = { generatedAt: new Date().toISOString(), ledger: path.relative(cwd, ledger), runs: records.length, threshold, ...out }
  fs.mkdirSync(path.resolve(cwd, reportDir), { recursive: true })
  fs.writeFileSync(path.resolve(cwd, reportDir, 'fp-trend.json'), `${JSON.stringify(result, null, 2)}\n`)

  console.log(`fp-trend — ${records.length} run(s), threshold ${(threshold * 100).toFixed(0)}% waive-rate`)
  const names = Object.keys(out.gates).sort()
  if (!names.length) console.log('  (no run history yet — run `fp-trend --record` after each gate run)')
  for (const n of names) {
    const g = out.gates[n]
    console.log(`  ${n.padEnd(20)} runs=${g.runs} block=${g.blockRuns} warn=${g.warnRuns} waived=${g.waivedRuns} waiveRate=${(g.waiveRate * 100).toFixed(0)}%${g.flappers.length ? ` flap=${g.flappers.length}` : ''}`)
  }
  if (out.flagged.length) {
    console.log(`\n⚠️  ${out.flagged.length} gate(s) flagged (likely false-positive noise):`)
    for (const f of out.flagged) console.log(`  ${f.gate}: ${f.reasons.join('; ')}`)
  } else {
    console.log('\n✓ no gate flagged for FP noise')
  }
  process.exit(argv.includes('--strict') && out.flagged.length ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
