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
// Extract "name (#N)" citation PAIRS — "theme-check (#2) + conversion (#7)" → [{name,number}]. A #N
// paired with a NON-gate name (e.g. "check-handoff-contract (#39)" — an enforcer script + an AIM
// feature id, NOT a toolkit gate) is intentionally not a gate citation and is ignored downstream.
const gateCitations = (gateStr) => {
  const out = []; const re = /([a-z][a-z0-9-]+)\s*\(#(\d+(?:\.\d+)?)/gi; let m
  while ((m = re.exec(String(gateStr || '')))) out.push({ name: m[1].toLowerCase(), number: m[2] })
  return out
}
// Legacy gate names → current, so a valid alias citation isn't a false mismatch (mirrors theme-gates GATE_ALIAS).
const GATE_ALIAS = { 'commerce-readiness': 'conversion', 'render-wiring': 'render-check', 'a11y-static': 'static-a11y', 'visual-truth': 'visual-check', 'css-layout': 'layout', 'antipatterns': 'dead-code', 'design-system': 'design-tokens', 'lighthouse': 'performance', 'axe': 'accessibility', 'functional': 'functionality', 'reuse-map': 'section-reuse', 'ds-cascade': 'brand-sync', 'locale-completeness': 'translations', 'bootstrap': 'foundation', 'theme-check': 'code-lint' }

// PURE: audit the registry graph against the live gate manifest [{number,name}]. → { blockers[], warnings[] }.
export function auditGraph(registry, manifest) {
  const blockers = []
  const warnings = []
  const contracts = registry.contracts || []
  const events = new Set(contracts.map(c => c.event))
  const liveByName = new Map()
  const live = new Set()
  for (const g of (manifest || [])) { liveByName.set(String(g.name), String(g.number)); live.add(String(g.number)) }
  const add = (arr, id, page, detail) => arr.push({ id, page, detail, evidence: '' })

  // A. dangling requires — a require that is neither a path nor a defined contract event
  for (const c of contracts) {
    for (const r of (c.requires || [])) {
      if (isPathish(r)) continue
      if (!events.has(r)) add(blockers, 'orch.dangling-require', c.event, `contract "${c.event}" requires "${r}" — not a path and not a defined contract event (broken handoff edge)`)
    }
  }

  // B. gate citations resolve BY IDENTITY — a cited "name (#N)" whose name IS a real gate must carry
  //    that gate's actual number (catches a citation drifting to the wrong gate — the board/red-team
  //    #39/#40 masking the audit found). A #N paired with a non-gate name (enforcer script / AIM
  //    feature id) is not a gate citation and is skipped — never a false pass NOR a false block.
  for (const c of contracts) {
    for (const { name, number } of gateCitations(c.gate)) {
      const canonical = GATE_ALIAS[name] || name
      if (!liveByName.has(canonical)) continue // not a gate name → not a gate citation
      if (liveByName.get(canonical) !== number) add(blockers, 'orch.gate-citation-mismatch', c.event, `contract "${c.event}" cites "${name} (#${number})" but gate "${canonical}" is #${liveByName.get(canonical)} in the live manifest — wrong-gate citation`)
    }
  }

  // C. critical eyes/dispatch gates present — the skip-reads-as-pass linchpin
  for (const n of CRITICAL_GATES) {
    if (!live.has(String(n))) add(blockers, 'orch.critical-gate-missing', 'manifest', `critical eyes/dispatch gate #${n} is absent from the live manifest — the "skip reads as pass" defense could vanish`)
  }

  // D. orphan produce (WARN) — a contract event nothing downstream requires (terminal events are OK)
  const requiredEvents = new Set()
  for (const c of contracts) for (const r of (c.requires || [])) if (!isPathish(r)) requiredEvents.add(r)
  // Terminal / leaf contracts: the end of the line — not another contract's `requires`.
  // (design_review_board + red_team are now REQUIRED by `published`, so they're consumed, not orphans.)
  const TERMINAL = new Set(['published', 'launch_watch_clear'])
  for (const c of contracts) {
    if (TERMINAL.has(c.event)) continue
    if (!requiredEvents.has(c.event)) add(warnings, 'orch.orphan-produce', c.event, `contract "${c.event}" is produced but no downstream contract requires it (dead handoff, or a missing consumer)`)
  }

  return { blockers, warnings }
}

function liveManifest() {
  try {
    const manifest = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'theme-gates.mjs'), '--list-json'], { cwd, encoding: 'utf-8' }))
    return manifest.map(g => ({ number: String(g.number), name: String(g.name) }))
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
  const manifest = liveManifest()
  if (manifest && manifest.error) {
    writeReport('check-orchestration', 44, { cwd, pass: false, blockers: [{ id: 'orch.manifest-unreadable', page: 'theme-gates.mjs', detail: `could not read the live gate manifest: ${manifest.error}`, evidence: '' }], warnings: [], evidence: { reason: 'manifest' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error('check-orchestration: ENV-ERROR — manifest'); process.exit(2)
  }
  const { blockers, warnings } = auditGraph(registry, manifest)
  const pass = blockers.length === 0
  writeReport('check-orchestration', 44, { cwd, pass, blockers, warnings, evidence: { contracts: (registry.contracts || []).length, liveGates: manifest.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`check-orchestration: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s) · ${(registry.contracts || []).length} contracts`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
