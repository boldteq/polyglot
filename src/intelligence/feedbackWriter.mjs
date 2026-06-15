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
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Two-tier dedup so corrections don't pile up + feedback.md stays compact.
// Tier 1 (free): normalized-substring vs existing **Directive:** lines. Tier 2
// (one local Ollama query, no token cost): semantic match against the indexed
// feedback chunk. Returns { dup, reason, anchor } — never throws.
async function isDuplicateFeedback(directive, raw, threshold) {
  const nd = norm(directive)
  if (nd.length < 8) return { dup: false }
  // Tier 1 — normalized substring containment (length-ratio ≥ 0.8 either way).
  for (const line of raw.split('\n')) {
    const m = line.match(/^\*\*Directive:\*\*\s*(.+)$/)
    if (!m) continue
    const ne = norm(m[1])
    if (!ne) continue
    if (nd.includes(ne) || ne.includes(nd)) {
      const ratio = Math.min(nd.length, ne.length) / Math.max(nd.length, ne.length)
      if (ratio >= 0.8) return { dup: true, reason: 'substring', anchor: 'feedback.md' }
    }
  }
  // Tier 2 — semantic (higher bar than capture dedup; feedback rules are short).
  try {
    const { retrieve } = await import('./retrieve.mjs')
    const hits = await retrieve(directive, { topK: 3 })
    const top = hits.find((h) => typeof h.source_ref === 'string' && h.source_ref.endsWith('feedback.md'))
    if (top && top.score >= threshold) return { dup: true, reason: `semantic ${top.score}`, anchor: 'feedback.md' }
  } catch { /* embeddings unavailable — tier 1 already ran */ }
  return { dup: false }
}

export async function appendFeedback({ title, directive, context = '', date, force = false, dedupThreshold = 0.88 } = {}) {
  if (!directive || !directive.trim()) throw new Error('appendFeedback: directive is required')
  if (!fs.existsSync(FEEDBACK_PATH)) throw new Error(`feedback.md not found at ${FEEDBACK_PATH} — cannot append`)

  // Skip the write if this directive already exists (keeps the file compact).
  if (!force) {
    try {
      const existing = fs.readFileSync(FEEDBACK_PATH, 'utf-8')
      const dup = await isDuplicateFeedback(directive, existing, dedupThreshold)
      if (dup.dup) return { ok: true, skipped: true, reason: dup.reason, anchor: dup.anchor }
    } catch { /* dedup best-effort — fall through to write */ }
  }

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
