#!/usr/bin/env node
// audit-unproven-guards — find BLOCKING checks that no fixture ever exercises.
//
// WHY (2026-07-23). Five separate guards were found this week that looked present, were believed, and
// could never fire: gate #45's skipped-but-pass watched a field no gate writes (ENV-2); gate #2's CLI
// probe misreported a broken launch as "not installed" (ENV-1); the gate→owner table named gates that
// had been renamed (TEST-1a); a `\.replaceAll?\(` regex bound the `?` to the wrong character so a
// scanner matched nothing (HYG-2); and an index-health check compared a value to itself (BRAIN-2).
// Every one was found by accident. The common shape: a check whose failure path had never been run.
//
// So: enumerate the finding ids each gate can emit in a BLOCKING position, and report the ones no
// fixture references. An untested blocker is a check nobody has proven fires — and, per this repo's own
// doctrine, an unproven guard is indistinguishable from an absent one.
//
// REPORTING ONLY — it never blocks. 79 findings on first run would be an alarm avalanche, and a false
// BLOCK is as damaging as a false pass. Use it to burn the list down, worst-first.
//
//   node toolkit/scripts/audit-unproven-guards.mjs [--json]
// Exit: 0 always (advisory).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// A finding id in a blocking position. Covers the three shapes this toolkit uses.
const BLOCK_PATTERNS = [
  /add\(\s*blockers\s*,\s*['"]([a-z][\w.-]*\.[\w.-]+)['"]/g,
  /drift\(\s*['"]([a-z][\w.-]*\.[\w.-]+)['"]/g,
  /blockers\.push\(\s*\{\s*id:\s*['"]([a-z][\w.-]*\.[\w.-]+)['"]/g,
]

// PURE: every id the source can raise as a blocker.
export function blockingIds(src) {
  const out = new Set()
  for (const re of BLOCK_PATTERNS) for (const m of String(src).matchAll(re)) out.add(m[1])
  return out
}

// PURE: is this id exercised anywhere in the fixture corpus?
// Fixtures assert both fully-qualified (`reuse-map.bad-rung`) and bare-suffix (`mustContain:
// 'custom-split-missing'`), so accept either — requiring the full id alone overstated the gap by 9.
// The suffix must be reasonably long, or short ones like `ds.missing` match unrelated prose.
export function isExercised(id, fixtureText) {
  if (fixtureText.includes(id)) return true
  const suffix = id.split('.').slice(1).join('.')
  return suffix.length >= 8 && fixtureText.includes(suffix)
}

// A URL/browser gate needs a live page, so a hermetic fixture is genuinely harder — worth separating
// from static gates, where "untested" has no such excuse.
export function isUrlGate(src) {
  return /THEME_PREVIEW_URL/.test(String(src))
}

function readFixtureCorpus(dir) {
  const parts = []
  const walk = (d) => {
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.mjs')) { try { parts.push(fs.readFileSync(p, 'utf-8')) } catch { /* skip */ } }
    }
  }
  walk(dir)
  return parts.join('\n')
}

function main() {
  const asJson = process.argv.includes('--json')
  const fixtureText = readFixtureCorpus(path.join(HERE, '__fixtures__'))
  const scripts = fs.readdirSync(HERE).filter((f) => /^(check|gate)-.*\.mjs$/.test(f)).sort()

  const rows = []
  let totalBlocking = 0
  for (const f of scripts) {
    const src = fs.readFileSync(path.join(HERE, f), 'utf-8')
    const ids = blockingIds(src)
    if (!ids.size) continue
    totalBlocking += ids.size
    const untested = [...ids].filter((i) => !isExercised(i, fixtureText)).sort()
    if (untested.length) rows.push({ gate: f, kind: isUrlGate(src) ? 'url' : 'static', blocking: ids.size, untested })
  }
  rows.sort((a, b) => (a.kind === b.kind ? b.untested.length - a.untested.length : a.kind === 'static' ? -1 : 1))

  const staticRows = rows.filter((r) => r.kind === 'static')
  const urlRows = rows.filter((r) => r.kind === 'url')
  const count = (rs) => rs.reduce((n, r) => n + r.untested.length, 0)

  if (asJson) { console.log(JSON.stringify({ totalBlocking, rows }, null, 2)); process.exit(0) }

  console.log(`unproven-guards: ${totalBlocking} blocking check(s) across ${scripts.length} gate scripts`)
  console.log(`  ${count(staticRows)} untested in STATIC gates (no excuse — these are hermetically testable)`)
  console.log(`  ${count(urlRows)} untested in URL gates (need a live page; harder, but still unproven)\n`)
  for (const group of [['STATIC', staticRows], ['URL', urlRows]]) {
    if (!group[1].length) continue
    console.log(`── ${group[0]} ──`)
    for (const r of group[1]) {
      console.log(`  ${String(r.untested.length).padStart(2)}/${String(r.blocking).padEnd(2)} ${r.gate}`)
      console.log(`        ${r.untested.slice(0, 4).join(', ')}${r.untested.length > 4 ? ` … +${r.untested.length - 4}` : ''}`)
    }
  }
  console.log('\nAn untested blocker is a check nobody has proven fires. Advisory only — burn it down worst-first.')
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
