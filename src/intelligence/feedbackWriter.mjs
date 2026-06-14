// Boldteq Intelligence — safe writer for ~/.claude/memory/user/feedback.md.
// feedback.md is the highest-priority "corrections" file every agent loads, so it
// is NEVER auto-written by the learning loop — only an explicit human Approve in
// the Polyglot Learning Inbox calls this. The append is atomic (temp-file rename)
// and lock-guarded so a concurrent writer can't corrupt the file.
//   appendFeedback({ title, directive, context?, date? }) → { ok, anchor }

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const FEEDBACK_PATH = path.join(os.homedir(), '.claude', 'memory', 'user', 'feedback.md')
const LOCK_PATH = FEEDBACK_PATH + '.lock'
const HERE = path.dirname(fileURLToPath(import.meta.url))

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60)

export async function appendFeedback({ title, directive, context = '', date } = {}) {
  if (!directive || !directive.trim()) throw new Error('appendFeedback: directive is required')
  if (!fs.existsSync(FEEDBACK_PATH)) throw new Error(`feedback.md not found at ${FEEDBACK_PATH} — cannot append`)

  const day = date || new Date().toISOString().slice(0, 10)
  const heading = (title || directive).toString().trim().toUpperCase().slice(0, 80)
  const section = [
    `## ★ ${day} — ${heading}`,
    '',
    `**Directive:** ${directive.trim()}`,
    ...(context && context.trim() ? ['', `**Context:** ${context.trim()}`] : []),
    '',
    '---',
    '',
  ].join('\n')

  // Lock so two approvals can't interleave a read-modify-write.
  let lockFd
  try {
    lockFd = fs.openSync(LOCK_PATH, 'wx') // throws EEXIST if already locked
  } catch (err) {
    if (err.code === 'EEXIST') { const e = new Error('feedback.md is being written by another request — retry'); e.retryable = true; throw e }
    throw err
  }

  try {
    const raw = fs.readFileSync(FEEDBACK_PATH, 'utf-8')
    // Insert the new entry at the top of the dated entries: right before the
    // first "## ★" heading. If none exists yet, append after the intro block.
    const firstEntry = raw.search(/^## ★ /m)
    let next
    if (firstEntry >= 0) {
      next = raw.slice(0, firstEntry) + section + raw.slice(firstEntry)
    } else {
      next = raw.replace(/\s*$/, '') + '\n\n' + section
    }
    const tmp = FEEDBACK_PATH + '.tmp'
    fs.writeFileSync(tmp, next, 'utf-8')
    fs.renameSync(tmp, FEEDBACK_PATH) // atomic on same filesystem
  } finally {
    try { fs.closeSync(lockFd) } catch { /* ignore */ }
    try { fs.unlinkSync(LOCK_PATH) } catch { /* ignore */ }
  }

  // Re-embed so the new directive is semantically searchable. feedback.md is
  // already a reindex source; the reindex is incremental + content-hash gated,
  // so this only re-embeds the changed file. Best-effort, detached, never blocks.
  try {
    const script = path.join(HERE, 'reindex.mjs')
    spawn(process.execPath, [script], { detached: true, stdio: 'ignore' }).unref()
  } catch { /* reindex is best-effort; nightly cron will catch up */ }

  return { ok: true, anchor: `feedback.md#${day}-${slug(heading)}` }
}
