#!/usr/bin/env node
// check-agent-refs — the "load this file" ↔ "the file exists" coherence gate (Polyglot dev/CI, sibling
// of check-aim-drift.mjs). Every agent .md tells its agent which knowledge files to read; a dead
// `~/.claude/...` path is a silent no-op — the agent simply doesn't load it and nobody ever finds out.
// That failure is worst inside a "Tier 1 — Always Load First" block, because that is an instruction the
// agent is told to follow on EVERY run, so a dead Tier-1 ref means a standard we believe is binding is
// in fact unreachable.
//
//   node scripts/check-agent-refs.mjs [--agents <dir>] [--json]
//   exit 0 = no dead Tier-1 ref (dead body refs listed as warnings) · 1 = dead Tier-1 ref · 2 = env error
//   AGENT_REFS_STRICT=1 → ANY dead ref exits 1.
//
// Day-one policy: the pre-existing body-ref backlog warns, a NEW dead Tier-1 ref blocks.
// Reads ~/.claude/agents/*.md (not vendored per-client → a dev/CI check, not a per-build gate).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A referenced path we recognise as knowledge an agent is told to load. Extension-anchored so prose
// like "see ~/.claude/memory/patterns/good/" (a directory pointer, not a file) isn't treated as a ref.
const REF_RE = /~\/\.claude\/[^\s`'"()[\],;]*\.(?:md|json|mjs|sh|yml)/g

// Refs that are deliberately generic — a shape to fill in, not a file that should exist. Counted
// separately as "skipped-template" so the numbers stay honest instead of being quietly dropped.
const PLACEHOLDER_PATTERNS = [
  /YYYY-MM(-DD)?/,        // ~/.claude/memory/runs/YYYY-MM-DD.md
  /<[^>]*>/,              // <name>, <store>, <slug>
  /[{}]/,                 // {agent}, brace-expansion lists {a.json, b.md}
  /\*/,                   // globs
  /\$\w|\$\{/,            // $VAR, ${VAR}
  /\bNN\b|\bXX\b/,        // numbered stubs
]

const TIER1_RE = /Tier\s*1\b|Always Load First/i
const OTHER_TIER_RE = /Tier\s*[2-9]\b/i
const HEADING_RE = /^\s{0,3}#{1,6}\s/

export function isTemplate(ref) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(ref))
}

export function expandHome(ref, home) {
  return path.join(home, ref.slice(2))
}

// Returns [{ ref, line, tier }] for one agent file. A ref is "tier-1" when it sits inside a Tier-1 /
// Always-Load-First block: the block opens on the marker line and closes at the next markdown heading
// or the next explicit Tier marker.
export function extractRefs(md) {
  const out = []
  let inTier1 = false
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (TIER1_RE.test(line)) inTier1 = true
    else if (inTier1 && (HEADING_RE.test(line) || OTHER_TIER_RE.test(line))) inTier1 = false
    for (const ref of line.match(REF_RE) || []) out.push({ ref, line: i + 1, tier: inTier1 ? 'tier-1' : 'body' })
  }
  return out
}

export function checkAgentRefs({ agentsDir, home }) {
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()
  const dead = []
  let total = 0
  let skippedTemplate = 0
  const exists = new Map() // resolved path → bool; agents cite the same files hundreds of times

  for (const file of files) {
    const agent = file.replace(/\.md$/, '')
    const md = fs.readFileSync(path.join(agentsDir, file), 'utf-8')
    for (const { ref, line, tier } of extractRefs(md)) {
      total++
      if (isTemplate(ref)) { skippedTemplate++; continue }
      const abs = expandHome(ref, home)
      if (!exists.has(abs)) exists.set(abs, fs.existsSync(abs))
      if (!exists.get(abs)) dead.push({ agent, ref, line, tier })
    }
  }

  return {
    agents: files.length,
    total,
    skippedTemplate,
    deadTier1: dead.filter((d) => d.tier === 'tier-1'),
    deadBody: dead.filter((d) => d.tier === 'body'),
  }
}

function report(res, { json, strict }) {
  const { deadTier1, deadBody } = res
  if (json) {
    console.log(JSON.stringify({ ...res, strict, pass: strict ? !deadTier1.length && !deadBody.length : !deadTier1.length }, null, 2))
  } else {
    console.log(`check-agent-refs — ${res.agents} agent file(s) · ${res.total} refs · ${res.skippedTemplate} skipped-template`)
    console.log(`  dead tier-1: ${deadTier1.length} · dead body: ${deadBody.length}`)
    for (const [label, list] of [['FAIL  tier-1', deadTier1], [strict ? 'FAIL  body  ' : 'WARN  body  ', deadBody]]) {
      if (!list.length) continue
      console.log('')
      for (const d of list) console.log(`  ${label}  ${d.agent}.md:${d.line}  ${d.ref}`)
    }
    console.log('')
    if (deadTier1.length) console.log(`✗ ${deadTier1.length} dead Tier-1 reference(s) — an "Always Load First" file that does not exist is a standard the agent never reads`)
    else if (deadBody.length) console.log(strict ? `✗ ${deadBody.length} dead body reference(s) (AGENT_REFS_STRICT=1)` : `✓ no dead Tier-1 refs — ${deadBody.length} dead body ref(s) reported as backlog`)
    else console.log('✓ AGENT-REFS — every referenced knowledge file resolves')
  }
  if (deadTier1.length) return 1
  if (strict && deadBody.length) return 1
  return 0
}

export function main(argv) {
  const json = argv.includes('--json')
  const strict = process.env.AGENT_REFS_STRICT === '1'
  const home = process.env.HOME || os.homedir()
  const ai = argv.indexOf('--agents')
  const agentsDir = ai !== -1 && argv[ai + 1] ? path.resolve(argv[ai + 1]) : path.join(home, '.claude', 'agents')

  let res
  try {
    res = checkAgentRefs({ agentsDir, home })
  } catch (e) {
    console.error(`check-agent-refs: ENV-ERROR — agents dir unreadable (${agentsDir}): ${e.message}`)
    return 2
  }
  return report(res, { json, strict })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // exitCode, not process.exit() — the report can exceed the pipe buffer and process.exit() truncates it.
  process.exitCode = main(process.argv.slice(2))
}
