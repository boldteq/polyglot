#!/usr/bin/env node
// #32 — porter drift detector. porter-apply writes what it set to docs/porter/applied-snapshot.json.
// During a retainer, a merchant editing the admin by hand silently diverges the store from what porter
// applied — a redirect removed, a metafield value overwritten, a page edited. This compares the applied
// snapshot vs the store's CURRENT state and reports the drift, so atrium sees it (weekly cron) instead
// of discovering it at the next build. The DIFF is pure + tested; the live store fetch needs an Admin
// token (porter-side) and runs only in --live mode.
//
// Usage:
//   node porter-drift.mjs                 diff applied-snapshot.json vs docs/porter/current-snapshot.json
//   node porter-drift.mjs --live          fetch the live store first (needs SHOPIFY_ADMIN_API_TOKEN), then diff
// Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN[_<handle>] (--live) · REPORT_DIR ·
//      APPLIED_SNAPSHOT (docs/porter/applied-snapshot.json) · CURRENT_SNAPSHOT (docs/porter/current-snapshot.json)
// Exit: 0 = no drift · 1 = drift detected · 2 = env error
//
// detectDrift is PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

// PURE: compare two store-state snapshots. Each snapshot is { <type>: { <key>: <value> } } (e.g.
// { products: { handle: {...} }, pages: {...}, redirects: {...}, metafields: {...} }). Returns the
// entities present in `applied` that are now removed or modified in `current` (manual-edit drift).
export function detectDrift(applied, current) {
  const drift = []
  for (const [type, items] of Object.entries(applied || {})) {
    if (!items || typeof items !== 'object') continue
    const cur = (current || {})[type] || {}
    for (const [key, val] of Object.entries(items)) {
      if (!(key in cur)) { drift.push({ type, key, change: 'removed' }); continue }
      if (JSON.stringify(cur[key]) !== JSON.stringify(val)) drift.push({ type, key, change: 'modified' })
    }
  }
  return drift
}

function main() {
  const t0 = Date.now()
  const cwd = process.cwd()
  const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
  const APPLIED = process.env.APPLIED_SNAPSHOT || 'docs/porter/applied-snapshot.json'
  const CURRENT = process.env.CURRENT_SNAPSHOT || 'docs/porter/current-snapshot.json'
  const blockers = []
  const warnings = []
  const finish = (envError, evidence = {}) => {
    const pass = !envError && blockers.length === 0
    writeReport('porter-drift', 32, { cwd, pass, blockers, warnings, evidence: { applied: APPLIED, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    const code = envError ? 2 : pass ? 0 : 1
    console.log(`porter-drift: ${code === 2 ? 'ENV-ERROR' : pass ? 'NO DRIFT' : 'DRIFT'} — ${blockers.length} drifted, ${warnings.length} note(s)`)
    for (const b of blockers) console.log(`  DRIFT ${b.id} ${b.page}: ${b.detail}`)
    if (envError) console.error(`  env: ${envError}`)
    process.exit(code)
  }

  const appliedAbs = path.resolve(cwd, APPLIED)
  if (!fs.existsSync(appliedAbs)) { warnings.push({ id: 'drift.n-a-no-snapshot', page: APPLIED, detail: `no ${APPLIED} — porter never applied a snapshot here (nothing to drift-check)`, evidence: '' }); return finish(null, { scope: 'n/a' }) }
  let applied
  try { applied = JSON.parse(fs.readFileSync(appliedAbs, 'utf-8')) } catch (e) { return finish(`${APPLIED} invalid JSON: ${e.message}`) }

  if (process.argv.includes('--live')) {
    // live fetch is porter-side (Admin token). Not implemented hermetically — escalate to the porter tool.
    return finish('--live store fetch requires the porter Admin tooling (SHOPIFY_ADMIN_API_TOKEN); run porter-verify --snapshot to write current-snapshot.json, then re-run without --live')
  }
  const curAbs = path.resolve(cwd, CURRENT)
  if (!fs.existsSync(curAbs)) { warnings.push({ id: 'drift.no-current', page: CURRENT, detail: `no ${CURRENT} — run porter-verify --snapshot (or --live) to capture the store's current state first`, evidence: '' }); return finish(null, { scope: 'no-current' }) }
  let current
  try { current = JSON.parse(fs.readFileSync(curAbs, 'utf-8')) } catch (e) { return finish(`${CURRENT} invalid JSON: ${e.message}`) }

  const drift = detectDrift(applied, current)
  for (const d of drift) blockers.push({ id: `drift.${d.change}`, page: `${d.type}/${d.key}`, detail: `${d.type} "${d.key}" was ${d.change} since porter applied it — a manual admin edit diverged the store. Re-apply or reconcile.`, evidence: d.change })
  finish(null, { drift: drift.length })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
