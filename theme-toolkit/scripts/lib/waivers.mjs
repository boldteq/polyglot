// Shared CHANGES.md `## Waivers` reader + durable waiver logger (audit P3.4 "close the bypass hatches").
// A bypass flag (THEME_PUSH_ALLOW_STALE / THEME_PUSH_SKIP_LENS) is only legitimate WITH a recorded
// reason, and every use must leave a durable trace — not a bare console warn that scrolls away.
// Parameterized by dir so it's unit-testable without a real repo.

import fs from 'node:fs'
import path from 'node:path'

// The first non-empty bullet in CHANGES.md's `## Waivers` section, or null. Turns "someone skipped a
// check" into "someone skipped X because Y" — the difference between an audit trail and a silent hole.
export function readWaiverText(dir = process.cwd()) {
  let text
  try { text = fs.readFileSync(path.join(dir, 'CHANGES.md'), 'utf-8') } catch { return null }
  const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
  if (!m) return null
  const section = m[1].split(/\n##\s/)[0]          // the Waivers section only — up to the next ## heading
  const bullet = section.match(/^\s*[-*]\s+(\S.*)$/m)
  return bullet ? bullet[1].trim() : null
}

export function changesHasWaiver(dir = process.cwd()) { return readWaiverText(dir) != null }

// Append a durable record of the bypass. Best-effort (the caller also console-warns) — a filesystem
// hiccup must never block a publish, but under normal operation every waiver is greppable afterwards.
export function logWaiver(flag, reason, dir = process.cwd(), now = new Date().toISOString()) {
  try {
    fs.mkdirSync(path.join(dir, 'gate-reports'), { recursive: true })
    fs.appendFileSync(path.join(dir, 'gate-reports', 'waivers.jsonl'),
      JSON.stringify({ ts: now, flag, reason: reason || '(no reason bullet)', cwd: dir }) + '\n')
    return true
  } catch { return false }
}
