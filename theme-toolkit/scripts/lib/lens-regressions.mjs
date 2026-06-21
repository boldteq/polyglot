// Lens regression registry (WS-D) — PURE logic + tiny IO, so the escalation rule is hermetically
// testable. A finding that was once present, then CLEARED, then comes BACK is a regression ("the same
// bug shipped twice") and escalates one severity tier. Per-store file `.lens-regressions.json` at the
// repo root. check-visual-truth (#18) reads it, applies the rule, and writes it back each run.

import fs from 'node:fs'
import path from 'node:path'

export const REGISTRY_FILE = '.lens-regressions.json'
const keyOf = (f) => `${f.check}::${f.key || `${f.surface}-${f.viewport || ''}`}`

// PURE. Given the run's current findings + the prior registry, return { escalations, registry }.
// - a current finding whose entry was `cleared` → RECURRENCE → escalate (+ flip entry back to open)
// - a new finding → record as open
// - an open entry no longer present → flip to cleared (it was fixed this run)
export function applyRegressionRegistry(current, registry, nowISO) {
  const entries = { ...((registry && registry.entries) || {}) }
  const curKeys = new Set(current.map(keyOf))
  const escalations = []
  for (const f of current) {
    const k = keyOf(f)
    const e = entries[k]
    if (e && e.status === 'cleared') {
      const recurrences = (e.recurrences || 0) + 1
      escalations.push({ ...f, recurrences })
      entries[k] = { check: f.check, surface: f.surface, status: 'open', recurrences, firstSeen: e.firstSeen || nowISO, lastChange: nowISO }
    } else if (!e) {
      entries[k] = { check: f.check, surface: f.surface, status: 'open', recurrences: 0, firstSeen: nowISO, lastChange: nowISO }
    } // else already open → unchanged
  }
  for (const [k, e] of Object.entries(entries)) {
    if (e.status === 'open' && !curKeys.has(k)) entries[k] = { ...e, status: 'cleared', lastChange: nowISO }
  }
  return { escalations, registry: { version: 1, entries } }
}

// PURE (WS-F): post-publish verdict drift — a surface that was PASS pre-publish but is now FAIL on the
// live store (an app injected CSS, a collection emptied, a pixel broke). baseline/current = { key: { verdict, surface } }.
export function verdictDrift(baseline, current) {
  const out = []
  for (const [key, cur] of Object.entries(current || {})) {
    const base = (baseline || {})[key]
    if (base && base.verdict === 'PASS' && cur && cur.verdict === 'FAIL') {
      out.push({ key, surface: cur.surface || base.surface || key, kind: 'verdict-drift', detail: 'was PASS pre-publish, now FAIL on the live store (drift)' })
    }
  }
  return out
}

export function readRegistry(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, REGISTRY_FILE), 'utf-8')) } catch { return { version: 1, entries: {} } }
}
export function writeRegistry(dir, registry) {
  try { fs.writeFileSync(path.join(dir, REGISTRY_FILE), `${JSON.stringify(registry, null, 2)}\n`) } catch { /* best-effort */ }
}
