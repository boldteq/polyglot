#!/usr/bin/env node
// SWT rule distributor — turns the FAQ brain into IMPLEMENTED training.
// For every gap-FAQ it: (1) derives a concrete rule + its owning agent(s) + gate,
// (2) writes the rule into the owning agent's .md (managed section — the agent now
// does it by default), (3) maintains the team-wide enforced-rules digest grouped by
// concern, (4) queues rules whose cited gate doesn't actually exist (mechanization
// gaps). Idempotent + deduped + frontmatter-validated + auto-rollback on corruption.
//
// Run standalone to backfill:  node scripts/swt-distribute.mjs
// Imported by swt-train-loop.mjs to run each cycle.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.HOME
const BRAIN = path.join(HOME, '.claude/memory/patterns/good/shopify-website-faq-brain.md')
const DIGEST = path.join(HOME, '.claude/memory/patterns/good/shopify-website-trained-rules.md')
const AGENTS_DIR = path.join(HOME, '.claude/agents')
const HERE = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath: repo path has a space
const GATE_GAPS = path.join(HERE, 'swt-train/gate-gaps.md')

const KNOWN_AGENTS = [
  'atrium', 'compass', 'drape', 'ink', 'beacon', 'stitch', 'loom', 'conduit',
  'lattice', 'keystone', 'porter', 'mantle', 'lumen', 'onyx',
]
const KNOWN_GATES = new Set([
  '#0', '#0.4', '#0.5', '#1', '#2', '#3', '#5', '#6', '#7', '#8', '#9', '#10',
  '#11', '#12', '#13', '#14', '#15', '#16', '#17', '#18', '#19', '#20', '#21',
  '#22', '#23', '#24', '#25', '#26', '#27', '#28', '#29', '#30', '#31', '#32',
  '#34', '#35',
])

// ---- parse the FAQ brain into structured entries ----
export function parseFaqs() {
  if (!fs.existsSync(BRAIN)) return []
  const txt = fs.readFileSync(BRAIN, 'utf8')
  const out = []
  const re = /^### FAQ-(\d{4}) · ([^·]+?) · (.+)$/gm
  let m
  const idx = []
  while ((m = re.exec(txt))) idx.push({ at: m.index, id: m[1], concern: m[2].trim(), surface: m[3].trim() })
  for (let i = 0; i < idx.length; i++) {
    const block = txt.slice(idx[i].at, i + 1 < idx.length ? idx[i + 1].at : undefined)
    const g = (label) => {
      const mm = block.match(new RegExp(`\\*\\*${label}:\\*\\* ([\\s\\S]*?)(?=\\n\\*\\*|\\n### |\\n## |$)`))
      return mm ? mm[1].replace(/\s+/g, ' ').trim() : ''
    }
    out.push({
      id: idx[i].id, concern: idx[i].concern, surface: idx[i].surface,
      gap: g('Gap'), solution: g('Solution'), autofix: g('Auto-fix'),
    })
  }
  return out
}

// ---- derive owners + gate + a one-line rule from a FAQ ----
export function deriveRule(faq) {
  const head = faq.solution.slice(0, 60).toLowerCase()
  let owners = KNOWN_AGENTS.filter((a) => new RegExp(`\\b${a}\\b`).test(head))
  if (owners.length === 0) {
    // fall back: any known agent anywhere in the solution (first one)
    const any = KNOWN_AGENTS.find((a) => new RegExp(`\\b${a}\\b`).test(faq.solution.toLowerCase()))
    owners = any ? [any] : ['atrium']
  }
  const gateM = (faq.solution + ' ' + faq.autofix).match(/#\d+(?:\.\d+)?/)
  const gate = gateM ? gateM[0] : ''
  // rule body = the directive — strip a leading "owner · " then a leading "#gate name —/·/: " preamble
  let body = faq.solution.replace(/\s+/g, ' ').trim()
  body = body.replace(/^([a-z]+(?:[/+,&\s]+[a-z]+)*)\s*·\s*/i, (mm, names) => {
    const toks = names.split(/[/+,&\s]+/).filter(Boolean)
    return toks.every((t) => KNOWN_AGENTS.includes(t.toLowerCase())) ? '' : mm
  })
  body = body.replace(/^#\d[\w.\-/+ ]*?\s*[—·:]\s*/, '').trim()
  if (body.length > 200) body = body.slice(0, 197) + '…'
  return { owners, gate, concern: faq.concern, surface: faq.surface, gap: faq.gap, body, id: faq.id }
}

function dedupeKey(r) {
  return `${r.concern}|${r.surface}|${r.gap.slice(0, 50).toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

// ---- digest: full enforced rule set grouped by concern → owner ----
function writeDigest(rules) {
  const byConcern = {}
  const seen = new Set()
  for (const r of rules) {
    const k = dedupeKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    byConcern[r.concern] ||= {}
    for (const o of r.owners) {
      byConcern[r.concern][o] ||= []
      byConcern[r.concern][o].push(r)
    }
  }
  const L = [
    '# Shopify Website Team — Trained Rules (enforced defaults)',
    '',
    '> Auto-distributed from [[shopify-website-faq-brain]] by `swt-train-loop`. The IMPLEMENTATION of every',
    '> gap learning: grouped by design concern → owning agent, deduped. Load it; the cited gate enforces it.',
    `> **${seen.size} rules across ${Object.keys(byConcern).length} concerns.** Updated: ${new Date().toISOString().slice(0, 10)}.`,
    '',
  ]
  for (const concern of Object.keys(byConcern).sort()) {
    L.push(`## ${concern}`, '')
    for (const owner of Object.keys(byConcern[concern]).sort()) {
      L.push(`### owner: ${owner}`)
      for (const r of byConcern[concern][owner]) {
        L.push(`- (${r.surface}) ${r.body}${r.gate ? `  \`${r.gate}\`` : ''}`)
      }
      L.push('')
    }
  }
  fs.writeFileSync(DIGEST, L.join('\n'))
  return seen.size
}

// ---- agent files: lean managed section, ≤1 rule per concern (defaults the agent applies) ----
function updateAgent(agentId, rules) {
  const file = path.join(AGENTS_DIR, `${agentId}.md`)
  if (!fs.existsSync(file)) return false
  const original = fs.readFileSync(file, 'utf8')
  if (!original.startsWith('---')) return false // not a valid agent file — skip

  // one representative rule per concern for this agent
  const perConcern = {}
  for (const r of rules) {
    if (!r.owners.includes(agentId)) continue
    if (!perConcern[r.concern]) perConcern[r.concern] = r
  }
  const concerns = Object.keys(perConcern).sort()
  if (concerns.length === 0) return false

  const lines = [
    '## 🎓 SWT Trained Defaults (auto-maintained by swt-train-loop — do not hand-edit between markers)',
    '<!-- SWT-TRAINED:START -->',
    `Apply these as defaults on every Shopify Website Team task. Full enforced set (your owned slice + all concerns): \`~/.claude/memory/patterns/good/shopify-website-trained-rules.md\`. Gates enforce them.`,
    '',
  ]
  for (const c of concerns) {
    const r = perConcern[c]
    lines.push(`- **${c}** (${r.surface}): ${r.body}${r.gate ? ` \`${r.gate}\`` : ''}`)
  }
  lines.push('<!-- SWT-TRAINED:END -->')
  const section = lines.join('\n')

  let updated
  if (/<!-- SWT-TRAINED:START -->[\s\S]*?<!-- SWT-TRAINED:END -->/.test(original)) {
    // replace the whole managed block (heading line + markers)
    updated = original.replace(
      /## 🎓 SWT Trained Defaults[\s\S]*?<!-- SWT-TRAINED:END -->/,
      section,
    )
  } else {
    updated = original.replace(/\s*$/, '') + '\n\n' + section + '\n'
  }
  // validate: frontmatter intact + non-empty + markers balanced → else rollback (don't write)
  if (
    !updated.startsWith('---') ||
    updated.length < original.length * 0.8 ||
    (updated.match(/SWT-TRAINED:START/g) || []).length !== 1 ||
    (updated.match(/SWT-TRAINED:END/g) || []).length !== 1
  ) {
    return false
  }
  if (updated !== original) fs.writeFileSync(file, updated)
  return true
}

// ---- gate-gap queue: rules claiming a gate that isn't in the registry ----
function writeGateGaps(rules) {
  const gaps = []
  const seen = new Set()
  for (const r of rules) {
    if (!r.gate) continue
    if (KNOWN_GATES.has(r.gate)) continue
    const k = r.gate + r.concern
    if (seen.has(k)) continue
    seen.add(k)
    gaps.push(`- \`${r.gate}\` (cited by FAQ-${r.id}, ${r.concern}/${r.surface}) — gate not in registry; mechanize or correct the citation.`)
  }
  const L = [
    '# SWT gate-gap queue',
    '> Rules that cite an enforcing gate which does NOT exist in the toolkit registry — either build it or fix the citation.',
    `> ${gaps.length} open. Updated ${new Date().toISOString().slice(0, 10)}.`,
    '',
    ...(gaps.length ? gaps : ['_None — every cited gate exists in the registry._']),
    '',
  ]
  fs.writeFileSync(GATE_GAPS, L.join('\n'))
  return gaps.length
}

export function distribute() {
  const faqs = parseFaqs()
  const rules = faqs.map(deriveRule)
  const ruleCount = writeDigest(rules)
  let agentsUpdated = 0
  for (const a of KNOWN_AGENTS) if (updateAgent(a, rules)) agentsUpdated++
  const gateGaps = writeGateGaps(rules)
  return { faqs: faqs.length, rules: ruleCount, agentsUpdated, gateGaps }
}

// run standalone
if (process.argv[1] && process.argv[1].endsWith('swt-distribute.mjs')) {
  const r = distribute()
  console.log(`distributed: ${r.faqs} FAQs → ${r.rules} deduped rules · ${r.agentsUpdated}/14 agents trained · ${r.gateGaps} gate-gaps`)
}
