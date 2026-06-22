#!/usr/bin/env node
// Boldteq Red-Team gate (#32) — mechanizes shopify-agency-governance-os.md §6.
// Before the Design Review Board (§5 / gate #31) approves, a dedicated Red Team — agents INDEPENDENT
// of the builder — attacks the work along 4 axes. Every finding must be RESOLVED (work improved) or
// ACCEPTED with a written rationale (a conscious trade-off, logged). An UNANSWERED attack blocks the
// board. This script VERIFIES the red-team artifact (atrium commissions it; the builder never
// red-teams their own page) — making "the adversary actually ran + was answered" machine-checkable.
//
// The 4 mandatory attacks (§6): design_fail (why would this DESIGN fail?), wont_convert (why would it
// NOT convert?), competitor_outperforms (why would a competitor OUTPERFORM us?), customer_leaves
// (why would a customer LEAVE?). Each attack: { finding, status:"resolved"|"accepted", rationale }.
//
// Warn-first: WARNS in dev, BLOCKS at publish-grade (DS_REQUIRE_SCOPE=1 / REDTEAM_REQUIRE=1).
//
// Usage: node check-red-team.mjs
// Env: REDTEAM_FILE (docs/design/red-team.json) · REPORT_DIR · DS_REQUIRE_SCOPE=1 / REDTEAM_REQUIRE=1
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const FILE = process.env.REDTEAM_FILE || 'docs/design/red-team.json'
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.REDTEAM_REQUIRE === '1'
const ATTACKS = ['design_fail', 'wont_convert', 'competitor_outperforms', 'customer_leaves']

const blockers = []
const warnings = []
const add = (id, detail) => (REQUIRE ? blockers : warnings).push({ id, page: FILE, detail, evidence: '' })

// Pure verifier (hermetically testable): returns [{id,detail}] of every unanswered/incomplete attack.
export function redTeamGaps(rt, { attacks = ATTACKS } = {}) {
  const out = []
  if (!rt || typeof rt !== 'object' || Array.isArray(rt)) { out.push({ id: 'rt.invalid', detail: 'red-team artifact is not a JSON object' }); return out }
  const a = rt.attacks || {}
  for (const atk of attacks) {
    const v = a[atk]
    if (!v || typeof v !== 'object') { out.push({ id: 'rt.attack-missing', detail: `red-team attack "${atk}" missing — all 4 §6 attacks are mandatory before the board (an unanswered attack blocks)` }); continue }
    const status = String(v.status || '').toLowerCase()
    if (status !== 'resolved' && status !== 'accepted') { out.push({ id: 'rt.unanswered', detail: `attack "${atk}" status must be resolved|accepted (got "${v.status ?? 'none'}") — an unanswered attack blocks the board (§6)` }); continue }
    const rationale = String(v.rationale || v.resolution || '').trim()
    if (status === 'accepted' && rationale.length < 8) out.push({ id: 'rt.accepted-no-rationale', detail: `attack "${atk}" ACCEPTED but no written rationale — an accepted trade-off must be logged with a reason (§6)` })
    if (!v.finding) out.push({ id: 'rt.no-finding', detail: `attack "${atk}" has no finding recorded — the adversary must state what it found` })
  }
  if (!rt.commissioned_by) out.push({ id: 'rt.uncommissioned', detail: 'no commissioned_by — atrium commissions the red team; the builder never red-teams their own page (§6)' })
  return out
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('red-team', 32, { cwd, pass, blockers, warnings, evidence: { file: FILE, requiredAttacks: ATTACKS.length, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`red-team: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  const abs = path.resolve(cwd, FILE)
  if (!fs.existsSync(abs)) {
    add('rt.missing', `no ${FILE} — a dedicated Red Team (§6, 4 adversarial attacks by agents independent of the builder) MUST run + be answered before the board. atrium commissions it + emits the artifact.`)
    return finish(null, { present: false })
  }
  let rt
  try { rt = JSON.parse(fs.readFileSync(abs, 'utf-8')) } catch (e) { return finish(`${FILE} is not valid JSON: ${e.message}`) }
  for (const g of redTeamGaps(rt)) add(g.id, g.detail)
  finish(null, { present: true, attacks: Object.keys(rt.attacks || {}).length })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
