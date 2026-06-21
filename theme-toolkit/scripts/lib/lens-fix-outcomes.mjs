// Lens autofix learning loop (WS-E1) — PURE logic + tiny IO. Each autofix round, classify the PRIOR
// round's findings: a finding still present after a fix attempt = `persisted` (the fix didn't work);
// gone = `resolved`. Persisted findings are NOT retried with the same approach next round — they escalate.
// Append-only `fix-outcomes.jsonl` per store so the learning survives across runs, not just rounds.

import fs from 'node:fs'
import path from 'node:path'

export const OUTCOMES_FILE = 'fix-outcomes.jsonl'
export const findingKey = (f) => `${f.check}::${f.surface}::${f.viewport || ''}`

// PURE. Classify each PRIOR-round finding against the CURRENT round: persisted (still there) | resolved (gone).
export function diffOutcomes(prev, cur) {
  const curSet = new Set(cur.map(findingKey))
  return prev.map(f => ({ check: f.check, surface: f.surface, viewport: f.viewport, owner: f.fix_owner, result: curSet.has(findingKey(f)) ? 'persisted' : 'resolved' }))
}

// PURE. Keys that persisted after a fix at least once (tried + failed → don't retry the same way).
export function persistedKeys(outcomes) {
  const s = new Set()
  for (const o of outcomes) if (o && o.result === 'persisted') s.add(`${o.check}::${o.surface}::${o.viewport || ''}`)
  return s
}

export function readOutcomes(dir) {
  try { return fs.readFileSync(path.join(dir, OUTCOMES_FILE), 'utf-8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}
export function appendOutcomes(dir, round, records, nowISO) {
  if (!records || !records.length) return
  try { fs.appendFileSync(path.join(dir, OUTCOMES_FILE), `${records.map(r => JSON.stringify({ round, ...r, at: nowISO })).join('\n')}\n`) } catch { /* best-effort */ }
}
