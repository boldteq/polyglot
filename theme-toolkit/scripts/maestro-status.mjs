#!/usr/bin/env node
// maestro:status — the morning snapshot. A read-only glance that consolidates the artifacts a hands-off
// run leaves behind — docs/build-state.json (carried mind), docs/maestro-report.json (loop result),
// docs/publish-readiness.json (the PUBLISH-READY verdict), gate-reports/summary.json (full gate stack) —
// into one view: which surfaces converged vs escalated, the publish verdict + where it stopped, the gate
// pass/blockers, the coherence ledger, and the single next action. Run it after an overnight build to see
// exactly where it landed without opening five files.
//
// Pure read (never mutates). Every input is tolerant of absence (a half-run / never-run repo reads clean).
// Proven hermetically by __fixtures__/maestro-status (scaffolded artifacts → asserted snapshot + output).
// Node 20 ESM, no external deps.
//
// Usage:  node maestro-status.mjs [--json]
// Exit:   0 = PUBLISH-READY or nothing-run-yet (informational) · 1 = built but NOT publish-ready.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }

// ── snapshot (exported for the fixture) ────────────────────────────────────────────
export function status(opts = {}) {
  const {
    dir = process.cwd(),
    buildStateDir = process.env.BUILD_STATE_DIR || 'docs',
    reportDir = process.env.REPORT_DIR || 'gate-reports',
  } = opts
  const bs = readJson(path.resolve(dir, buildStateDir, 'build-state.json'))
  const report = readJson(path.resolve(dir, buildStateDir, 'maestro-report.json'))
  const readiness = readJson(path.resolve(dir, buildStateDir, 'publish-readiness.json'))
  const summary = readJson(path.resolve(dir, reportDir, 'summary.json'))

  const hasArtifacts = !!(bs || report || readiness || summary)

  // surfaces — richest source is build-state (status/lens/rounds); else the loop report's surface list
  const surfaces = Array.isArray(bs?.surfaces) && bs.surfaces.length
    ? bs.surfaces.map(s => ({ surface: s.surface, status: s.status, lens: s.lens || null, rounds: s.rounds ?? 0 }))
    : (Array.isArray(report?.surfaces) ? report.surfaces.map(s => ({ surface: s.surface, status: s.status, lens: s.status, rounds: s.rounds ?? 0 })) : [])

  // converged / escalated — prefer the loop report; else derive from build-state statuses
  const converged = Array.isArray(report?.converged) ? report.converged
    : surfaces.filter(s => s.status === 'done' || s.lens === 'PASS').map(s => s.surface)
  const escalated = Array.isArray(report?.escalated) ? report.escalated
    : surfaces.filter(s => s.status === 'blocked' || s.lens === 'FAIL').map(s => s.surface)

  // gate stack
  const gates = summary ? {
    pass: summary.pass === true,
    blockers: Object.values(summary.gates || {}).reduce((n, g) => n + ((g.blockers || []).length), 0),
    mode: summary.mode || null,
    sha: summary.sha ? String(summary.sha).slice(0, 7) : null,
    dirty: !!summary.dirty,
  } : null

  // verdict — publish-readiness is authoritative; else infer
  const publishReady = readiness ? !!readiness.publishReady
    : (hasArtifacts ? (escalated.length === 0 && gates?.pass === true) : null)

  return {
    hasArtifacts,
    client: bs?.client || null,
    niche: bs?.niche || null,
    publishReady,
    stage: readiness?.stage || null,
    reason: readiness?.reason || null,
    surfaces, converged, escalated,
    gates,
    decisions: Array.isArray(bs?.decisions) ? bs.decisions : [],
    updated: readiness?.updated || report?.updated || bs?.updated || null,
  }
}

// the single most useful next action given the state
export function nextAction(s) {
  if (!s.hasArtifacts) return 'No build has run. Start one: pnpm maestro:build --auto-preview'
  if (s.publishReady) return 'PUBLISH-READY. Publish: pnpm theme:push (gates:verify:full re-checks freshness at publish).'
  if (s.stage === 'preflight') return 'Preconditions missing. Run: pnpm maestro:preflight (shows the fix per gap).'
  if (s.escalated.length) return `${s.escalated.length} surface(s) escalated (${s.escalated.join(', ')}). Inspect docs/build-state.md + gate-reports/lens/, fix, re-run pnpm maestro:build.`
  if (s.gates && !s.gates.pass) return `Gate stack blocked${s.gates.blockers ? ` (${s.gates.blockers} blocker(s))` : ''}. See gate-reports/SUMMARY.md, fix, re-run pnpm maestro:build.`
  return s.reason ? `Not publish-ready: ${s.reason}. Re-run pnpm maestro:build.` : 'Not publish-ready. Re-run pnpm maestro:build.'
}

// ── formatting ──────────────────────────────────────────────────────────────────────
export function formatStatus(s) {
  const L = [`Maestro Status${s.client ? ` — ${s.client}${s.niche ? ` (${s.niche})` : ''}` : ''}${s.updated ? `  ·  updated ${s.updated}` : ''}`, '']
  if (!s.hasArtifacts) {
    L.push('Publish:  — no build has run yet', '', nextAction(s), '')
    return L.join('\n')
  }
  L.push(`Publish:  ${s.publishReady ? '✅ PUBLISH-READY' : `⛔ NOT READY${s.stage ? ` — stopped at ${s.stage}` : ''}${s.reason ? `: ${s.reason}` : ''}`}`, '')

  if (s.surfaces.length) {
    L.push(`Surfaces (${s.surfaces.length}):`)
    for (const f of s.surfaces) {
      const mark = (f.status === 'done' || f.lens === 'PASS') ? '✓' : (f.status === 'blocked' || f.lens === 'FAIL') ? '✗' : '·'
      const esc = s.escalated.includes(f.surface) ? '  ← escalated' : ''
      L.push(`  ${mark} ${String(f.surface).padEnd(12)} ${String(f.lens || f.status || '—').padEnd(5)} ${f.rounds ? `${f.rounds}r` : ''}${esc}`)
    }
    L.push('')
  }

  L.push(`Gates:  ${!s.gates ? '— not run' : s.gates.pass ? `✅ PASS${s.gates.mode ? ` (mode=${s.gates.mode}${s.gates.sha ? ` · sha ${s.gates.sha}` : ''}${s.gates.dirty ? ' · dirty' : ''})` : ''}` : `❌ BLOCK${s.gates.blockers ? ` — ${s.gates.blockers} blocker(s)` : ''} → ${process.env.REPORT_DIR || 'gate-reports'}/SUMMARY.md`}`, '')

  if (s.decisions.length) { L.push(`Coherence ledger (${s.decisions.length} decision(s)):`); for (const d of s.decisions.slice(0, 8)) L.push(`  - ${d}`); if (s.decisions.length > 8) L.push(`  …and ${s.decisions.length - 8} more`); L.push('') }

  L.push(`Next:  ${nextAction(s)}`, '')
  return L.join('\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json')
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node maestro-status.mjs [--json]   (morning snapshot of the last maestro build)')
    process.exit(0)
  }
  const s = status({ dir: process.cwd() })
  console.log(json ? JSON.stringify(s, null, 2) : formatStatus(s))
  // informational when nothing ran or it's ready; non-zero only when a build landed NOT publish-ready
  process.exit(s.hasArtifacts && s.publishReady === false ? 1 : 0)
}
