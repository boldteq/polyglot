#!/usr/bin/env node
// Validate a CHANGES.md file against the schema in
// ~/.claude/memory/patterns/good/changes-list-protocol.md
//
// Used as a deploy-gate by Mantle (Shopify) + Bolt (Stack A) + reviewers (Onyx/Sage).
//
// DUAL-MODE (2026-06-21): the protocol mandates YAML frontmatter + `## Items` with
// `evidence:`/`acceptance:` sub-lines. But real autonomous builds write a PROSE header
// (`# CHANGES — …` + `**Status:**`) with inline `_Files: …_` evidence — the strict parser
// false-rejected 100% of them (verified on gpt-test-1), so the gate was silently bypassed.
// Now: if YAML frontmatter is present → STRICT mode (unchanged). Else → PROSE mode: still
// ENFORCE the substance (every checkbox item checked + each cites a real artifact + a
// shippable status), without demanding the exact sub-line shape. Strict is preferred; prose
// is accepted so the gate actually runs on real output instead of being skipped.
//
// Usage: node scripts/check-changes-list.mjs <path-to-CHANGES.md>
// Exit:  0 → all items checked + evidence + status review|shipped · 1 → unchecked/no-evidence · 2 → file missing

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Validate a CHANGES.md file (YAML-frontmatter STRICT mode or prose-header PROSE mode).\n\nUsage:\n  node scripts/check-changes-list.mjs <path-to-CHANGES.md>\n\nExit codes:\n  0 — all clear · 1 — unchecked items / missing evidence / in-progress · 2 — file missing\n`)
  process.exit(args.length === 0 ? 2 : 0)
}

const filePath = path.resolve(args[0])
if (!fs.existsSync(filePath)) { console.error(`❌ File not found: ${filePath}`); process.exit(2) }
const raw = fs.readFileSync(filePath, 'utf-8')

// An evidence/acceptance string must REFERENCE a real artifact (path/URL/SHA/gate-report/file
// extension), not free prose. (Audit fix: presence-only let "acceptance: QA-passed" through.)
function citesArtifact(s) {
  return /https?:\/\//i.test(s) ||
    /\b(?:gate-reports|docs|content|sections|snippets|assets|templates|config|scripts)\/[\w./-]+/i.test(s) ||
    /\.(?:json|md|png|jpe?g|webp|mp4|pdf|csv|liquid)\b/i.test(s) ||
    /\b[a-f0-9]{7,40}\b/.test(s) ||
    // (H4 2026-07-29: the generic `word/word` branch matched "and/or", dates, and the item's own title —
    // it counted any prose as artifact evidence. Removed; real paths still match the dir + extension branches.)
    /\btheme[- ]check\b/i.test(s)
}

const VALID = ['in-progress', 'review', 'shipped', 'waived']

// ── frontmatter / header parse ───────────────────────────────────────────────
function parseYaml(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return null
  const out = {}
  for (const line of m[1].split('\n')) { const kv = line.match(/^(\w+):\s*(.+)$/); if (kv) out[kv[1].trim()] = kv[2].trim() }
  return { data: out, rest: text.slice(m[0].length) }
}
// PROSE fallback: derive project + status from `# CHANGES — …` / `**Project:**` / `**Status:**`.
function parseProse(text) {
  const title = (text.match(/^#\s+(.+)$/m) || [])[1] || (text.match(/\*\*Project:\*\*\s*(.+)$/m) || [])[1] || 'CHANGES'
  const statusLine = (text.match(/\*\*Status:\*\*\s*(.+)$/m) || [])[1] || ''
  let status = null
  // H8 (2026-07-29): a negated status ("Not deployed yet", "isn't live", "pending") must NOT read as shipped.
  if (/shipped|deployed|live|published/i.test(statusLine) && !/\b(?:not|isn'?t|never|pending|un(?:shipped|deployed|published))\b|\byet\b/i.test(statusLine)) status = 'shipped'
  else if (/review|uat|staging/i.test(statusLine)) status = 'review'
  else if (/waived/i.test(statusLine)) status = 'waived'
  else if (/in.?progress|wip|building/i.test(statusLine)) status = 'in-progress'
  return { data: { project: title.replace(/[*_`]/g, '').trim().slice(0, 80), client: '(prose)', status, _statusLine: statusLine }, rest: text, prose: true }
}

const yaml = parseYaml(raw)
const doc = yaml || parseProse(raw)
const prose = !!doc.prose

if (!prose) {
  const required = ['client', 'project', 'requestedAt', 'requestedBy', 'status']
  const missing = required.filter(k => !doc.data[k])
  if (missing.length) { console.error(`❌ Schema error: missing frontmatter keys: ${missing.join(', ')}`); process.exit(2) }
}
if (!doc.data.status || !VALID.includes(doc.data.status)) {
  console.error(`❌ Schema error: ${prose ? 'could not derive a status from `**Status:**`' : `status="${doc.data.status}"`} — must be one of [${VALID.join(', ')}]`)
  process.exit(2)
}

// ── item collection ──────────────────────────────────────────────────────────
// STRICT: items under `## Items` with `evidence:`/`acceptance:` sub-lines.
// PROSE: every checkbox item doc-wide; evidence = the item's block cites an artifact inline.
let itemsBlock
if (!prose) {
  const headingIdx = doc.rest.search(/^##\s+Items\b/m)
  if (headingIdx === -1) { console.error('❌ Schema error: no "## Items" section found'); process.exit(2) }
  const afterItems = doc.rest.slice(headingIdx).split('\n').slice(1).join('\n')
  const nh = afterItems.match(/^##\s+/m)
  itemsBlock = nh ? afterItems.slice(0, nh.index) : afterItems
} else {
  itemsBlock = doc.rest // scan the whole doc for checkbox items
}

const lines = itemsBlock.split('\n')
const items = []
let current = null
for (const line of lines) {
  const itemMatch = line.match(/^\s*- \[([ xX])\]\s+(.+)/)
  if (itemMatch) {
    if (current) items.push(current)
    current = { checked: itemMatch[1].toLowerCase() === 'x', title: itemMatch[2].trim(), block: itemMatch[2].trim(), hasEvidence: false, hasAssignee: false, hasAcceptance: false, evidence: '', acceptance: '' }
    if (prose && citesArtifact(current.title)) current.hasEvidence = true // inline `_Files: …_`
    continue
  }
  if (current) {
    current.block += '\n' + line
    if (prose) { if (citesArtifact(line)) current.hasEvidence = true } // a Verification:/Files: line under the item
    else {
      const meta = line.match(/^\s+-?\s*(\w+):\s*(.*)$/)
      if (meta) {
        const val = meta[2].trim()
        if (meta[1] === 'evidence' && val) { current.hasEvidence = true; current.evidence = val }
        if (meta[1] === 'assignee' && val) current.hasAssignee = true
        if (meta[1] === 'acceptance' && val) { current.hasAcceptance = true; current.acceptance = val }
      }
    }
  }
}
if (current) items.push(current)

if (items.length === 0) { console.error('❌ Schema error: no checkbox items (`- [ ] …`) found'); process.exit(2) }

const unchecked = items.filter(i => !i.checked)
const checkedNoEvidence = items.filter(i => i.checked && !i.hasEvidence)
const total = items.length
const done = items.filter(i => i.checked).length

console.log(`\n📋 CHANGES.md — ${doc.data.project} (${doc.data.client})  [${prose ? 'PROSE' : 'STRICT'} mode]`)
console.log(`   ${done}/${total} items checked. status=${doc.data.status}\n`)

let failed = false
if (unchecked.length) {
  console.error(`❌ ${unchecked.length} unchecked item(s):`); for (const i of unchecked) console.error(`   - ${i.title.slice(0, 80)}`); failed = true
}
if (checkedNoEvidence.length) {
  console.error(`\n❌ ${checkedNoEvidence.length} checked item(s) with no artifact evidence (${prose ? 'inline path/URL/SHA/_Files:_/theme-check' : '`evidence:` line'} required):`)
  for (const i of checkedNoEvidence) console.error(`   - ${i.title.slice(0, 80)}`); failed = true
}
if (!prose) {
  // STRICT-only: separate acceptance: line + assignee:, each artifact-backed.
  const checkedProseEvidence = items.filter(i => i.checked && i.hasEvidence && !citesArtifact(i.evidence))
  const checkedNoAcceptance = items.filter(i => i.checked && !i.hasAcceptance)
  const checkedProseAcceptance = items.filter(i => i.checked && i.hasAcceptance && !citesArtifact(i.acceptance))
  const missingAssignee = items.filter(i => !i.hasAssignee)
  for (const [list, msg] of [[checkedProseEvidence, 'prose `evidence:` (no artifact)'], [checkedNoAcceptance, 'missing `acceptance:`'], [checkedProseAcceptance, 'prose `acceptance:` (no artifact)']]) {
    if (list.length) { console.error(`\n❌ ${list.length} checked item(s): ${msg}:`); for (const i of list) console.error(`   - ${i.title.slice(0, 70)}`); failed = true }
  }
  if (missingAssignee.length) console.warn(`\n⚠️  ${missingAssignee.length} item(s) missing \`assignee:\` (recommend fix at intake)`)
} else {
  console.warn('\nⓘ PROSE mode — enforced: every item checked + cites a real artifact + shippable status. (For full assignee/acceptance discipline, use YAML frontmatter + `## Items`.)')
}

if (failed) { console.error('\n→ Refusing publish. Check all items + cite real evidence, then re-run.'); process.exit(1) }
if (doc.data.status === 'in-progress') { console.error('\n❌ status=in-progress — flip to review/shipped after specialists finish.'); process.exit(1) }
console.log(`✅ All ${total} items checked with artifact evidence. Safe to publish.\n`)
process.exit(0)
