#!/usr/bin/env node
// Boldteq visual-quality gate (#17) — "gates-green ≠ looks-good" enforcer.
//
// The 16 static gates prove the build is correct, renders, sells, and is honest. They CANNOT
// judge whether it actually LOOKS premium at render — the exact gap Yash flagged + the Sprint-3
// dogfood proved (adversarial review caught what static gates missed). This gate does NOT do the
// visual judgment (that's agentic: onyx renders the staging URL + scores the 7 audits, emitting
// `gate-reports/visual-quality.json` as the structured output of its existing visual audit). This
// script VERIFIES that artifact: present + approved + every audit pass + ≥ min-confidence + no
// blocker findings. Mechanical verification of a human/agent verdict — non-skippable, auditable.
//
// Artifact schema (onyx emits): { input_url, reviewed_by, surfaces_reviewed:[],
//   audits: { brand_coherence|color_application|hierarchy_and_readability|spacing_and_layout|
//             cro_surface_fitness|mobile_rendering|brand_conformance_to_system:
//             { result:"pass"|"fail", confidence:0-100, findings:[] } },
//   blocker_findings:[], approval_verdict:"approved"|"blocked", signed_by, timestamp_approved }
//
// Usage: node check-visual-quality.mjs
// Env: VISUAL_QUALITY_FILE (default gate-reports/visual-quality.json) · VISUAL_MIN_CONFIDENCE (80)
//      · DS_REQUIRE_SCOPE=1 / VISUAL_REQUIRE=1 (a MISSING artifact BLOCKS — publish-grade; else WARNs)
//      · REPORT_DIR
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
// The REVIEW artifact (onyx emits) lives in docs/ — NOT gate-reports/, which is where THIS gate
// writes its own result (gate-reports/visual-quality.json); same name there would self-collide.
const FILE = process.env.VISUAL_QUALITY_FILE || 'docs/visual-quality-review.json'
const MIN_CONF = Number(process.env.VISUAL_MIN_CONFIDENCE || 80)
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.VISUAL_REQUIRE === '1'

const AUDITS = ['brand_coherence', 'color_application', 'hierarchy_and_readability', 'spacing_and_layout', 'cro_surface_fitness', 'mobile_rendering', 'brand_conformance_to_system']

const blockers = []
const warnings = []
const add = (list, id, detail, evidence = '') => list.push({ id, page: FILE, detail, evidence })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('visual-quality', 17, { cwd, pass, blockers, warnings, evidence: { file: FILE, minConfidence: MIN_CONF, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`visual-quality: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  const abs = path.resolve(cwd, FILE)
  if (!fs.existsSync(abs)) {
    if (REQUIRE) { add(blockers, 'vq.review-missing', `no ${FILE} — the visual-quality review (onyx renders staging + scores the 7 audits) is MANDATORY before publish. Run it and emit the artifact.`); finish(null, { present: false }) }
    warnings.push({ id: 'vq.review-not-done', page: FILE, detail: `no ${FILE} yet — visual-quality review pending (warns in dev; BLOCKS at publish-grade via DS_REQUIRE_SCOPE/VISUAL_REQUIRE)`, evidence: '' })
    finish(null, { present: false })
  }

  let j
  try { j = JSON.parse(fs.readFileSync(abs, 'utf-8')) } catch (err) { finish(`${FILE} is not valid JSON: ${err.message}`) }

  // 1. approval verdict
  if (j.approval_verdict !== 'approved') {
    add(blockers, 'vq.not-approved', `approval_verdict is "${j.approval_verdict ?? 'missing'}" (must be "approved") — the reviewer blocked or never signed off. Fix the findings + re-review.`)
  }
  // 2. signed_by present (the human/agent who looked)
  if (!j.signed_by) warnings.push({ id: 'vq.unsigned', page: FILE, detail: 'no signed_by — record who performed the review (atrium after lumen/onyx)', evidence: '' })

  // 3. each of the 7 audits: present, pass, ≥ min-confidence
  const audits = j.audits || {}
  const failed = []; const lowConf = []; const missing = []
  for (const key of AUDITS) {
    const a = audits[key]
    if (!a || typeof a !== 'object') { missing.push(key); continue }
    if (a.result !== 'pass') failed.push(key)
    if (Number(a.confidence) < MIN_CONF) lowConf.push(`${key} (${a.confidence ?? '?'})`)
  }
  if (missing.length) add(blockers, 'vq.audits-missing', `missing audit(s): ${missing.join(', ')} — all 7 must be present (${AUDITS.join(', ')})`)
  if (failed.length) add(blockers, 'vq.audit-failed', `audit(s) result=fail: ${failed.join(', ')} — fix the build, re-render, re-review (no "fix it later").`)
  if (lowConf.length) add(blockers, 'vq.low-confidence', `audit(s) below ${MIN_CONF}% confidence: ${lowConf.join(', ')} — uncertainty is a block; resolve it before publish.`)

  // 4. explicit blocker findings
  const bf = Array.isArray(j.blocker_findings) ? j.blocker_findings.filter(Boolean) : []
  if (bf.length) add(blockers, 'vq.blocker-findings', `${bf.length} blocker finding(s) recorded: ${bf.slice(0, 4).join(' · ')}`)

  finish(null, { present: true, approval_verdict: j.approval_verdict, reviewed_by: j.reviewed_by, surfaces: (j.surfaces_reviewed || []).length, failed, lowConf, missing, blockerFindings: bf.length })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
