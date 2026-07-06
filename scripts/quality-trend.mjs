#!/usr/bin/env node
// Quality trend — reads scripts/swt-train/quality-trend.jsonl and prints the day-by-day
// quality/accuracy scoreboard: pass-rate + defects over time, overall + per agent. This is the
// MEASURABLE half — "is training reducing mistakes?" answerable at a glance.
// Usage: node scripts/quality-trend.mjs [--json]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TREND = path.join(HERE, 'swt-train', 'quality-trend.jsonl')

function load() {
  let lines = []
  try { lines = fs.readFileSync(TREND, 'utf8').split('\n').filter(Boolean) } catch { return [] }
  return lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}
// sparkline over a numeric series (▁▂▃▄▅▆▇█)
const spark = (nums) => {
  if (!nums.length) return ''
  const bars = '▁▂▃▄▅▆▇█', mn = Math.min(...nums), mx = Math.max(...nums), r = (mx - mn) || 1
  return nums.map((n) => bars[Math.min(7, Math.round(((n - mn) / r) * 7))]).join('')
}
const delta = (a, b, lowerBetter = false) => {
  if (b === a) return '– no change'
  const better = lowerBetter ? b < a : b > a
  return `${better ? '✅' : '⚠️'} ${b > a ? '+' : ''}${b - a}`
}

function main() {
  const snaps = load()
  if (process.argv.includes('--json')) { console.log(JSON.stringify(snaps, null, 2)); return }
  if (snaps.length === 0) { console.log('quality-trend: no snapshots yet — run `node scripts/quality-loop.mjs <buildDir>` first.'); return }
  const first = snaps[0], last = snaps[snaps.length - 1]

  console.log(`\n📈 SWT Quality Trend — ${snaps.length} snapshot(s) · ${first.ts.slice(0, 10)} → ${last.ts.slice(0, 10)}\n`)
  console.log(`  pass-rate:  ${first.passRate}% → ${last.passRate}%   ${spark(snaps.map((s) => s.passRate))}   (${delta(first.passRate, last.passRate)} pts)`)
  console.log(`  blockers:   ${first.totalBlockers} → ${last.totalBlockers}   ${spark(snaps.map((s) => s.totalBlockers))}   (${delta(first.totalBlockers, last.totalBlockers, true)} · lower is better)`)

  console.log('\n  recent builds:')
  for (const s of snaps.slice(-8)) {
    console.log(`    ${s.ts.slice(5, 16).replace('T', ' ')}  ${String(s.build).slice(0, 18).padEnd(18)}  pass ${String(s.passRate).padStart(3)}%  ${String(s.totalBlockers).padStart(3)} blk  ${s.gatesFailed}/${s.gatesTotal} gates failed`)
  }

  console.log('\n  latest defects by agent:')
  for (const [a, v] of Object.entries(last.byAgent || {}).sort((x, y) => y[1].blockers - x[1].blockers)) {
    console.log(`    ${a.padEnd(8)} ${String(v.blockers).padStart(3)} blockers · ${String(v.warnings).padStart(3)} warnings · ${v.gatesFailed} gates failed`)
  }

  if (snaps.length > 1) {
    console.log('\n  per-agent blocker trend (← older · newer →, lower bars = better):')
    for (const a of [...new Set(snaps.flatMap((s) => Object.keys(s.byAgent || {})))]) {
      const series = snaps.map((s) => (s.byAgent?.[a]?.blockers) || 0)
      console.log(`    ${a.padEnd(8)} ${spark(series)}  ${series[0]} → ${series[series.length - 1]}`)
    }
  }
  console.log('')
}
main()
