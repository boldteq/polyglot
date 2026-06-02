#!/usr/bin/env node
// Validate a CHANGES.md file against the schema defined in
// ~/.claude/memory/patterns/good/changes-list-protocol.md
//
// Used as a deploy-gate by Mantle (Shopify) + Bolt (Stack A) + by reviewers
// (Onyx / Sage) inside their completeness audit.
//
// Usage:
//   node scripts/check-changes-list.mjs <path-to-CHANGES.md>
//
// Exit codes:
//   0 → all items checked + evidence present + status review|shipped
//   1 → unchecked items OR checked items without evidence
//   2 → file missing OR schema malformed (no frontmatter / no items section)

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`Validate a CHANGES.md file.\n\nUsage:\n  node scripts/check-changes-list.mjs <path-to-CHANGES.md>\n\nExit codes:\n  0 — all clear (all items checked with evidence; status review or shipped)\n  1 — unchecked items or missing evidence\n  2 — schema error (missing file or malformed)\n`)
  process.exit(args.length === 0 ? 2 : 0)
}

const filePath = path.resolve(args[0])
if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`)
  process.exit(2)
}

const raw = fs.readFileSync(filePath, 'utf-8')

// Parse YAML frontmatter (handwritten, no deps — schema is fixed + small)
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return { error: 'missing frontmatter block' }
  const body = m[1]
  const out = {}
  for (const line of body.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) out[kv[1].trim()] = kv[2].trim()
  }
  return { data: out, rest: text.slice(m[0].length) }
}

const fm = parseFrontmatter(raw)
if (fm.error) {
  console.error(`❌ Schema error: ${fm.error}`)
  process.exit(2)
}

const required = ['client', 'project', 'requestedAt', 'requestedBy', 'status']
const missing = required.filter(k => !fm.data[k])
if (missing.length > 0) {
  console.error(`❌ Schema error: missing frontmatter keys: ${missing.join(', ')}`)
  process.exit(2)
}

const validStatuses = ['in-progress', 'review', 'shipped', 'waived']
if (!validStatuses.includes(fm.data.status)) {
  console.error(`❌ Schema error: status="${fm.data.status}" not in [${validStatuses.join(', ')}]`)
  process.exit(2)
}

// Locate ## Items section — content until next ## heading OR end of file.
const headingIdx = fm.rest.search(/^##\s+Items\b/m)
if (headingIdx === -1) {
  console.error('❌ Schema error: no "## Items" section found')
  process.exit(2)
}
const afterItems = fm.rest.slice(headingIdx).split('\n').slice(1).join('\n')
const nextHeadingMatch = afterItems.match(/^##\s+/m)
const itemsBlock = nextHeadingMatch ? afterItems.slice(0, nextHeadingMatch.index) : afterItems

// Parse each item: `- [ ]` or `- [x]` followed by indented metadata lines.
// We only need: checked-state + presence of an `evidence:` line below.
const items = []
const lines = itemsBlock.split('\n')
let current = null
for (const line of lines) {
  const itemMatch = line.match(/^- \[([ xX])\]\s+(.+)/)
  if (itemMatch) {
    if (current) items.push(current)
    current = {
      checked: itemMatch[1].toLowerCase() === 'x',
      title: itemMatch[2].trim(),
      hasEvidence: false,
      hasAssignee: false,
      hasAcceptance: false,
    }
    continue
  }
  if (current) {
    const meta = line.match(/^\s+-?\s*(\w+):\s*(.*)$/)
    if (meta) {
      if (meta[1] === 'evidence' && meta[2].trim().length > 0) current.hasEvidence = true
      if (meta[1] === 'assignee' && meta[2].trim().length > 0) current.hasAssignee = true
      if (meta[1] === 'acceptance' && meta[2].trim().length > 0) current.hasAcceptance = true
    }
  }
}
if (current) items.push(current)

if (items.length === 0) {
  console.error('❌ Schema error: ## Items section has no items (`- [ ] N. ...` lines)')
  process.exit(2)
}

const unchecked = items.filter(i => !i.checked)
const checkedNoEvidence = items.filter(i => i.checked && !i.hasEvidence)
const missingAssignee = items.filter(i => !i.hasAssignee)
const missingAcceptance = items.filter(i => !i.hasAcceptance)

const total = items.length
const done = items.filter(i => i.checked).length

console.log(`\n📋 CHANGES.md — ${fm.data.project} (${fm.data.client})`)
console.log(`   ${done}/${total} items checked. status=${fm.data.status}\n`)

let failed = false

if (unchecked.length > 0) {
  console.error(`❌ ${unchecked.length} unchecked item${unchecked.length === 1 ? '' : 's'}:`)
  for (const item of unchecked) console.error(`   - ${item.title}`)
  failed = true
}
if (checkedNoEvidence.length > 0) {
  console.error(`\n❌ ${checkedNoEvidence.length} checked item${checkedNoEvidence.length === 1 ? '' : 's'} missing \`evidence:\` line:`)
  for (const item of checkedNoEvidence) console.error(`   - ${item.title}`)
  failed = true
}
if (missingAssignee.length > 0) {
  console.warn(`\n⚠️  ${missingAssignee.length} item${missingAssignee.length === 1 ? '' : 's'} missing \`assignee:\` line (recommend fix at intake)`)
}
if (missingAcceptance.length > 0) {
  console.warn(`⚠️  ${missingAcceptance.length} item${missingAcceptance.length === 1 ? '' : 's'} missing \`acceptance:\` line (recommend fix at intake)`)
}

if (failed) {
  console.error('\n→ Refusing publish. Re-dispatch unchecked items + add evidence to checked items, then re-run.')
  process.exit(1)
}

// Status must be review (about-to-ship) or shipped to publish
if (fm.data.status === 'in-progress') {
  console.error('\n❌ status=in-progress. Intake agent must flip to status=review after specialists finish.')
  process.exit(1)
}

console.log(`✅ All ${total} items checked with evidence. Safe to publish.\n`)
process.exit(0)
