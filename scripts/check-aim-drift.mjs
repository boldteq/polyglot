#!/usr/bin/env node
// check-aim-drift — the AIM-block ↔ handoff-registry coherence meta-test (Polyglot dev/CI, models the
// toolkit's stack-coherence guard). The 14 Shopify Website agents each carry an `## AIM Operating
// Contract` block naming their REQUIRE (inbound) + PRODUCE (outbound) handoffs. The registry
// (theme-toolkit/lib/aim-handoff-registry.json) is the single naming authority. This asserts no agent
// block references a handoff NAME that isn't a defined registry event (or a known alias) — the exact
// drift the registry was created to end. A stale/renamed handoff name in an agent block silently
// misfires dispatch, so this is the "done means done" guard at the orchestration-doctrine layer.
//
//   node scripts/check-aim-drift.mjs        # exit 0 = coherent · 1 = drift · 2 = env error
// Reads ~/.claude/agents/*.md (not vendored per-client → a dev/CI check, not a per-build gate).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents')
const REGISTRY = path.resolve(HERE, '..', 'theme-toolkit', 'lib', 'aim-handoff-registry.json')

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

let registry
try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf-8')) } catch (e) { console.error(`check-aim-drift: ENV-ERROR — registry unreadable: ${e.message}`); process.exit(2) }
const contracts = registry.contracts || []
const events = new Set(contracts.map(c => c.event))
const aliases = new Set(contracts.flatMap(c => c.aliases || []))
const known = new Set([...events, ...aliases])
// The 14 Shopify Website Team agents that carry an AIM Operating Contract block (matches
// swt-distribute KNOWN_AGENTS). Registry from/to ALSO names non-SWT participants that legitimately
// have NO SWT block — catalyst (cross-squad CRO), vex (cross-dept red-team), maestro (the build engine,
// not a promotable agent), client (the human). Those are excluded from the drift check by design.
const SWT_AGENTS = new Set(['atrium', 'compass', 'drape', 'ink', 'beacon', 'stitch', 'loom', 'conduit', 'lattice', 'keystone', 'porter', 'mantle', 'lumen', 'onyx'])
const allParticipants = [...new Set(contracts.flatMap(c => [c.from, ...(Array.isArray(c.to) ? c.to : [c.to])]))].filter(Boolean)
const participants = allParticipants.filter(a => SWT_AGENTS.has(a))
const excluded = allParticipants.filter(a => !SWT_AGENTS.has(a))

// A token that LOOKS like a handoff event (snake_case ending in a handoff suffix) but isn't known = drift.
const HANDOFF_SUFFIX = /_(ready|published|approved|clear)$/
const tokenRe = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g

console.log(`check-aim-drift — ${participants.length} SWT agents · ${events.size} events · ${aliases.size} aliases (excluded non-SWT: ${excluded.join(', ') || 'none'})`)

for (const agent of participants) {
  const file = path.join(AGENTS_DIR, `${agent}.md`)
  let md
  try { md = fs.readFileSync(file, 'utf-8') } catch { bad(`${agent}: agent file missing (${file})`); continue }
  const m = md.match(/##\s*AIM Operating Contract[\s\S]*?(?=\n##\s|\n#\s|$)/)
  if (!m) { bad(`${agent}: no "## AIM Operating Contract" block`); continue }
  const block = m[0]
  // pull the REQUIRE + PRODUCE lines specifically (that's where handoff names live)
  const lines = block.split('\n').filter(l => /\*\*(REQUIRE|PRODUCE):/i.test(l))
  const tokens = new Set()
  for (const l of lines) for (const t of (l.match(tokenRe) || [])) tokens.add(t)
  const eventTokens = [...tokens].filter(t => HANDOFF_SUFFIX.test(t) || known.has(t))
  const drift = eventTokens.filter(t => !known.has(t))
  const staleAlias = eventTokens.filter(t => aliases.has(t))
  if (drift.length) bad(`${agent}: references unknown handoff(s) not in the registry → ${drift.join(', ')}`)
  else if (staleAlias.length) { console.log(`  WARN  ${agent}: uses legacy alias(es) — prefer canonical → ${staleAlias.join(', ')}`); ok(`${agent}: handoff names resolve (via alias)`) }
  else ok(`${agent}: ${eventTokens.length} handoff name(s) all canonical`)
}

console.log(failures === 0 ? '\n✓ AIM-DRIFT — every agent block matches the handoff registry' : `\n✗ ${failures} agent(s) drift from the registry`)
process.exit(failures === 0 ? 0 : 1)
