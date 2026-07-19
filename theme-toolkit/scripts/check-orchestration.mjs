#!/usr/bin/env node
// Gate #44 check-orchestration — the fail-closed ORCHESTRATION-COHERENCE gate. Promotes the previously
// test-time-only gap detectors (handoff-registry consistency, gate-citation coherence) into a real
// build gate so a build cannot read PUBLISH-READY on a broken pipeline graph (2026-07-19 done-means-done).
//
// It asserts, deterministically (no dependency on the in-flight summary.json), over the vendored
// aim-handoff-registry.json + the LIVE gate manifest (`theme-gates.mjs --list-json`):
//   A. Dangling requires (BLOCK) — every contract-event named in a `requires[]` is a defined event.
//   B. Gate citations resolve (BLOCK) — every `#N` a contract cites in its `gate` exists in the manifest.
//   C. Critical eyes/dispatch gates present (BLOCK) — the gates that stop "skip reads as pass"
//      (#0.4 discovery, #0.5 foundation, #13 honesty, #18 visual-check, #20 class-d-visual) all exist,
//      so the eyes/dispatch layer can never silently vanish from the stack (the linchpin class).
//   D. Orphan produce (WARN) — a non-terminal contract whose event nothing downstream requires.
//
// This is the whole-graph companion to check-handoff-contract.mjs (which checks ONE dispatch edge at a
// time). Registered in theme-gates.mjs + shopify-definition-of-done.md §1. PURE core (auditGraph) is
// hermetically tested by __fixtures__/orchestration.
//
// Usage: node check-orchestration.mjs   Env: REPORT_DIR (gate-reports)   Exit: 0 pass · 1 block · 2 env

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'
import { loadRegistry } from './check-handoff-contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'

// The eyes/dispatch gates whose PRESENCE guarantees the stack can't silently drop the "skip reads as
// pass" defenses. Numbers are stable (theme-gates.mjs manifest).
const CRITICAL_GATES = ['0.4', '0.5', '13', '18', '20']

const head = (s) => String(s).split(/[\s(]/)[0]
const isPathish = (s) => { const h = head(s); return h.includes('/') || /\.(json|md|csv|js|mjs|liquid)$/.test(h) }
const gateNumbers = (gateStr) => (String(gateStr || '').match(/#(\d+(?:\.\d+)?)/g) || []).map(t => t.slice(1))

// PURE: audit the registry graph against the set of live gate numbers. → { blockers[], warnings[] }.
export function auditGraph(registry, liveGateNumbers) {
  const blockers = []
  const warnings = []
  const contracts = registry.contracts || []
  const events = new Set(contracts.map(c => c.event))
  const live = new Set([...liveGateNumbers].map(String))
  const add = (arr, id, page, detail) => arr.push({ id, page, detail, evidence: '' })

  // A. dangling requires — a require that is neither a path nor a defined contract event
  for (const c of contracts) {
    for (const r of (c.requires || [])) {
      if (isPathish(r)) continue
      if (!events.has(r)) add(blockers, 'orch.dangling-require', c.event, `contract "${c.event}" requires "${r}" — not a path and not a defined contract event (broken handoff edge)`)
    }
  }

  // B. gate citations resolve — every #N a contract cites must exist in the live manifest
  for (const c of contracts) {
    for (const n of gateNumbers(c.gate)) {
      if (!live.has(n)) add(blockers, 'orch.gate-citation-missing', c.event, `contract "${c.event}" cites gate #${n} which is not in the live gate manifest (theme-gates --list-json)`)
    }
  }

  // C. critical eyes/dispatch gates present — the skip-reads-as-pass linchpin
  for (const n of CRITICAL_GATES) {
    if (!live.has(String(n))) add(blockers, 'orch.critical-gate-missing', 'manifest', `critical eyes/dispatch gate #${n} is absent from the live manifest — the "skip reads as pass" defense could vanish`)
  }

  // D. orphan produce (WARN) — a contract event nothing downstream requires (terminal events are OK)
  const requiredEvents = new Set()
  for (const c of contracts) for (const r of (c.requires || [])) if (!isPathish(r)) requiredEvents.add(r)
  // Terminal / leaf contracts: their produce is a verdict/sign-off consumed by atrium's human
  // acceptance (DoD §1 conditions 7/8) or is the end of the line — not another contract's `requires`.
  const TERMINAL = new Set(['published', 'launch_watch_clear', 'design_review_board', 'red_team'])
  for (const c of contracts) {
    if (TERMINAL.has(c.event)) continue
    if (!requiredEvents.has(c.event)) add(warnings, 'orch.orphan-produce', c.event, `contract "${c.event}" is produced but no downstream contract requires it (dead handoff, or a missing consumer)`)
  }

  return { blockers, warnings }
}

function liveGateNumbers() {
  try {
    const manifest = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'theme-gates.mjs'), '--list-json'], { cwd, encoding: 'utf-8' }))
    return manifest.map(g => String(g.number))
  } catch (e) {
    return { error: e.message }
  }
}

function main() {
  const t0 = Date.now()
  let registry
  try { registry = loadRegistry() } catch (e) {
    writeReport('check-orchestration', 44, { cwd, pass: false, blockers: [{ id: 'orch.registry-unreadable', page: 'lib/aim-handoff-registry.json', detail: `handoff registry unreadable: ${e.message}`, evidence: '' }], warnings: [], evidence: { reason: 'registry' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`check-orchestration: ENV-ERROR — ${e.message}`); process.exit(2)
  }
  const nums = liveGateNumbers()
  if (nums && nums.error) {
    writeReport('check-orchestration', 44, { cwd, pass: false, blockers: [{ id: 'orch.manifest-unreadable', page: 'theme-gates.mjs', detail: `could not read the live gate manifest: ${nums.error}`, evidence: '' }], warnings: [], evidence: { reason: 'manifest' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error('check-orchestration: ENV-ERROR — manifest'); process.exit(2)
  }
  const { blockers, warnings } = auditGraph(registry, nums)
  const pass = blockers.length === 0
  writeReport('check-orchestration', 44, { cwd, pass, blockers, warnings, evidence: { contracts: (registry.contracts || []).length, liveGates: nums.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`check-orchestration: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s) · ${(registry.contracts || []).length} contracts`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
