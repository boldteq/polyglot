#!/usr/bin/env node
// Boldteq Design-Review-Board gate (#31) — mechanizes shopify-agency-governance-os.md §5.
// The board is an 8-role formal sign-off; each role returns APPROVE/BLOCK + a confidence score + an
// impact note on its dimension. ANY block — or ANY confidence <70 — blocks completion; NO page
// completes on a PARTIAL board. This script VERIFIES the board-verdict artifact (atrium convenes the
// board + records it; the roles map to real agents). It does NOT convene the board — it makes the
// doctrine machine-checkable so a page can't quietly "complete" without the board having actually run.
//
// Warn-first (new-gate doctrine): in dev every finding WARNS; at publish-grade (DS_REQUIRE_SCOPE=1 or
// DRB_REQUIRE=1) they BLOCK. A missing artifact in dev is a warning (board pending); at publish it blocks.
//
// Artifact (docs/design/design-review-board.json):
//   { page?, convened_by, timestamp, roles: { <role>: { verdict:"approve"|"block",
//     confidence:0-100, impact?, note? } } }  — the 8 roles below (§5).
//
// Usage: node check-design-review-board.mjs
// Env: DRB_FILE (docs/design/design-review-board.json) · DRB_MIN_CONFIDENCE (70) · REPORT_DIR
//      · DS_REQUIRE_SCOPE=1 / DRB_REQUIRE=1 (publish-grade — findings BLOCK; else WARN)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const FILE = process.env.DRB_FILE || 'docs/design/design-review-board.json'
const MIN_CONF = Number(process.env.DRB_MIN_CONFIDENCE || 70)
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.DRB_REQUIRE === '1'
// The 8 board roles (§5). Keys are snake_case; the doctrine maps each to a real agent.
const ROLES = ['creative_director', 'brand_strategist', 'cro_director', 'shopify_architect', 'seo_director', 'mobile_ux', 'accessibility', 'qa_lead']

const blockers = []
const warnings = []
// warn-first: a finding is a blocker only at publish-grade; in dev it warns (prove-before-block doctrine).
const add = (id, detail) => (REQUIRE ? blockers : warnings).push({ id, page: FILE, detail, evidence: '' })

// Pure verifier (hermetically testable, no fs): returns [{id,detail}] of every board gap.
export function reviewBoardGaps(board, { minConf = 70, roles = ROLES } = {}) {
  const out = []
  if (!board || typeof board !== 'object' || Array.isArray(board)) { out.push({ id: 'drb.invalid', detail: 'board artifact is not a JSON object' }); return out }
  const r = board.roles || {}
  for (const role of roles) {
    const v = r[role]
    if (!v || typeof v !== 'object') { out.push({ id: 'drb.role-missing', detail: `board role "${role}" missing — NO page completes on a PARTIAL board (§5)` }); continue }
    const verdict = String(v.verdict || '').toLowerCase()
    if (verdict !== 'approve' && verdict !== 'block') { out.push({ id: 'drb.role-no-verdict', detail: `role "${role}" verdict must be approve|block (got "${v.verdict ?? 'none'}")` }); continue }
    if (verdict === 'block') out.push({ id: 'drb.role-blocked', detail: `role "${role}" returned BLOCK${v.note ? ` — ${String(v.note).slice(0, 100)}` : ''} (any block blocks completion, §5)` })
    const conf = Number(v.confidence)
    if (!Number.isFinite(conf) || conf < minConf) out.push({ id: 'drb.low-confidence', detail: `role "${role}" confidence ${Number.isFinite(conf) ? conf : 'missing'} < ${minConf} (§2: <70 → do NOT proceed)` })
  }
  if (!board.convened_by) out.push({ id: 'drb.unconvened', detail: 'no convened_by — atrium convenes + records the board (§5)' })
  return out
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('design-review-board', 31, { cwd, pass, blockers, warnings, evidence: { file: FILE, minConfidence: MIN_CONF, requiredRoles: ROLES.length, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`design-review-board: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  const abs = path.resolve(cwd, FILE)
  if (!fs.existsSync(abs)) {
    add('drb.missing', `no ${FILE} — the Design Review Board (8-role sign-off, §5) is MANDATORY before a page completes. atrium convenes it + emits the verdict artifact.`)
    return finish(null, { present: false })
  }
  let board
  try { board = JSON.parse(fs.readFileSync(abs, 'utf-8')) } catch (e) { return finish(`${FILE} is not valid JSON: ${e.message}`) }
  for (const g of reviewBoardGaps(board, { minConf: MIN_CONF })) add(g.id, g.detail)
  finish(null, { present: true, roles: Object.keys(board.roles || {}).length })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
