#!/usr/bin/env node
// #35 — email trigger-wiring check. sequence authors the lifecycle emails; conduit wires their triggers.
// A welcome / cart-abandon / browse-abandon / post-purchase / win-back email that's WRITTEN but whose
// trigger was never wired silently never sends. This is the deterministic precondition for the live
// "abandon a cart → email fires" integration test: every declared email's trigger must appear in the
// wiring manifest. SKIPS when there's no lifecycle spec (not an email build). Warn-first.
//
// Artifacts: docs/email/lifecycle.json { emails: [{ id, trigger }] } (sequence) ·
//            docs/email/wiring.json { triggers: [<trigger ids wired>] } (conduit)
// Env: EMAIL_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (→ BLOCK) · REPORT_DIR · LIFECYCLE_FILE · WIRING_FILE
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// triggerWiringGaps is PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

// PURE: emails whose trigger isn't in the wired set (or that declare no trigger at all).
export function triggerWiringGaps(emails, wiredTriggers) {
  const wired = new Set((wiredTriggers || []).map(t => String(t).toLowerCase()))
  const gaps = []
  for (const e of emails || []) {
    const trig = String(e?.trigger || '').toLowerCase()
    if (!trig) { gaps.push({ id: e?.id || '?', reason: 'no trigger declared' }); continue }
    if (!wired.has(trig)) gaps.push({ id: e?.id || '?', trigger: trig, reason: 'trigger not wired' })
  }
  return gaps
}

function main() {
  const t0 = Date.now()
  const cwd = process.cwd()
  const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
  const LIFECYCLE = process.env.LIFECYCLE_FILE || 'docs/email/lifecycle.json'
  const WIRING = process.env.WIRING_FILE || 'docs/email/wiring.json'
  const ENFORCE = process.env.EMAIL_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
  const blockers = []
  const warnings = []
  const finish = (envError, evidence = {}) => {
    const pass = !envError && blockers.length === 0
    writeReport('email-triggers', 29, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    const code = envError ? 2 : pass ? 0 : 1
    console.log(`email-triggers: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
    for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
    for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
    if (envError) console.error(`  env: ${envError}`)
    process.exit(code)
  }

  const lcAbs = path.resolve(cwd, LIFECYCLE)
  if (!fs.existsSync(lcAbs)) { warnings.push({ id: 'email.n-a-no-spec', page: LIFECYCLE, detail: `no ${LIFECYCLE} — not an email build, trigger-wiring check skipped`, evidence: '' }); return finish(null, { scope: 'n/a' }) }
  let lc
  try { lc = JSON.parse(fs.readFileSync(lcAbs, 'utf-8')) } catch (e) { return finish(`${LIFECYCLE} invalid JSON: ${e.message}`) }
  let wiring = { triggers: [] }
  const wAbs = path.resolve(cwd, WIRING)
  if (fs.existsSync(wAbs)) { try { wiring = JSON.parse(fs.readFileSync(wAbs, 'utf-8')) } catch (e) { return finish(`${WIRING} invalid JSON: ${e.message}`) } }

  const gaps = triggerWiringGaps(lc.emails, wiring.triggers)
  for (const g of gaps) {
    const detail = `lifecycle email "${g.id}" — ${g.reason}${g.trigger ? ` (${g.trigger})` : ''}: it will never send. conduit must wire the trigger (${WIRING}) before publish.`
    ;(ENFORCE ? blockers : warnings).push({ id: 'email.trigger-unwired', page: LIFECYCLE, detail, evidence: g.id })
  }
  finish(null, { emails: (lc.emails || []).length, wired: (wiring.triggers || []).length, gaps: gaps.length })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
