#!/usr/bin/env node
// maestro:escalate — the "ask the human" escape hatch. AIM auto-fixes obvious defects in a loop
// (Lens ≤3 rounds, Maestro ≤3 rounds) and only stops to ASK when a finding is genuinely undecidable
// by defaults — a `full-autonomy-rules.md` whitelist hit (brand identity, real-asset-missing, legal,
// money, data-loss, hard input conflict). This script CONSOLIDATES the three escalation artifacts the
// loop already writes into ONE batched, whitelist-tagged ask, so the orchestrator surfaces a single
// question set to Yash instead of leaving him to read three files:
//
//   docs/maestro-report.json            → escalated surfaces + per-surface findings/errors
//   gate-reports/lens/autofix-escalation.json → unresolved Lens findings (by fix_owner)
//   gate-reports/lens/porter-workorder.md     → store-data HUMAN items (real content/decisions)
//        ─────────────────────────────────────────────────────────────────────────────────
//        → docs/ESCALATION.md  (human: "AIM is blocked; here is exactly what I need")
//        → docs/questions.json (machine: whitelist-tagged questions + the auto-fix backlog)
//
// Read-only over the sources (a reporter, never a fixer). buildEscalation is pure + injectable so the
// classification is proven hermetically by __fixtures__/maestro-escalate. Node 20 ESM, no deps.
// No Date.now()/Math.random() (MAESTRO_TS for the stamp). Exit: 0 = consolidated · 2 = usage error.
//
// The discipline (the whole point): a defect an OWNER can fix (loom=code, drape=design, ink=copy,
// conduit=binding) is NEVER a question — it stays in the auto-fix loop (the backlog). Only a finding
// that maps to a whitelist item becomes a question. This keeps the escape hatch from degrading into a
// back-and-forth channel — exactly the Lovable behavior: fix silently, ask once when truly blocked.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Owners whose findings are ALWAYS a human question (store data can't be invented).
const HUMAN_OWNERS = new Set(['porter'])

// Whitelist classification — maps a finding to a full-autonomy-rules.md escalation item, or null
// (null = owner-fixable → stays in the auto-fix loop, never a question).
export function classify(finding) {
  const owner = String(finding.fix_owner || '').toLowerCase()
  const text = `${finding.check || ''} ${finding.evidence || ''}`.toLowerCase()
  if (HUMAN_OWNERS.has(owner)) return { whitelist: 'real-asset-missing', category: 'store-data' }
  if (/\b(brand[\s-]?name|store[\s-]?name|brand identity|logo|rename|naming)\b/.test(text)) return { whitelist: 'brand-identity', category: 'brand' }
  if (/\b(legal|terms|tos|gdpr|privacy|trademark|dmca|compliance)\b/.test(text)) return { whitelist: 'legal-tos', category: 'legal' }
  if (/\b(empty collection|no products|missing.*(photo|image)|real (photo|image|photograph)|photography|real review|testimonial source|unsourced|fabricat)\b/.test(text)) return { whitelist: 'real-asset-missing', category: 'content' }
  if (/\b(payment|refund|charge|billing|money|spend|budget)\b/.test(text)) return { whitelist: 'irreversible-money', category: 'commerce' }
  return null
}

const askText = (f, c) => {
  const where = f.surface ? `[${f.surface}] ` : ''
  return `${where}${f.check || 'finding'}: ${f.evidence || 'needs a real decision/asset'}`
}
const defaultText = (c) => {
  switch (c.whitelist) {
    case 'real-asset-missing': return 'Provide the real asset (photo / product / copy source), or confirm a documented placeholder is acceptable for launch.'
    case 'brand-identity': return 'Confirm the exact brand/store name + logo to use.'
    case 'legal-tos': return 'Confirm the legal/policy text or the source to cite.'
    case 'irreversible-money': return 'Confirm the spend/payment configuration before proceeding.'
    default: return 'Confirm how to proceed.'
  }
}

// PURE core — takes parsed inputs, returns { blocked, escalatedSurfaces, questions, backlog, stage, reason }.
export function buildEscalation({ report = null, autofix = null, workorder = null, readiness = null } = {}) {
  const findings = []
  if (autofix && Array.isArray(autofix.unresolved)) {
    for (const f of autofix.unresolved) findings.push({ ...f, source: 'lens-autofix' })
  }
  if (report && Array.isArray(report.surfaces)) {
    for (const s of report.surfaces) {
      const done = s.status === 'done' || s.status === 'PASS'
      if (Array.isArray(s.findings)) for (const f of s.findings) findings.push({ ...f, surface: s.surface, source: 'maestro-loop' })
      if (s.error && !done) findings.push({ check: 'surface-error', severity: 'blocker', fix_owner: '', evidence: s.error, surface: s.surface, source: 'maestro-loop' })
    }
  }
  const escalatedSurfaces = (report && Array.isArray(report.escalated)) ? report.escalated : []

  const questions = []
  const backlog = []
  let n = 0
  for (const f of findings) {
    const c = classify(f)
    if (c) questions.push({ id: `Q${++n}`, surface: f.surface || null, owner: f.fix_owner || 'porter', category: c.category, whitelist_hit: c.whitelist, ask: askText(f, c), recommended_default: defaultText(c), evidence: f.evidence || f.check || '' })
    else backlog.push({ surface: f.surface || null, owner: f.fix_owner || '?', check: f.check || 'finding', evidence: f.evidence || '' })
  }
  // The porter work-order is, by definition, a set of HUMAN store-data items — represent it as one
  // pointer question (the file itself has the line items).
  if (workorder && String(workorder).trim()) {
    questions.push({ id: `Q${++n}`, surface: null, owner: 'porter', category: 'store-data', whitelist_hit: 'real-asset-missing',
      ask: 'Porter raised store-data items needing real content/decisions — see gate-reports/lens/porter-workorder.md (a confirmed brand/store name, real product photography, or merchandising an empty collection).',
      recommended_default: 'Provide the real asset, or confirm a documented placeholder is acceptable for launch.',
      evidence: 'gate-reports/lens/porter-workorder.md' })
  }

  const blocked = questions.length > 0 || escalatedSurfaces.length > 0 || (readiness ? readiness.publishReady === false : false)
  return { blocked, escalatedSurfaces, questions, backlog, stage: readiness?.stage || null, reason: readiness?.reason || null }
}

export function renderMarkdown(result, ts = 'pending') {
  const L = [`# AIM Escalation — ${result.blocked ? '⛔ NEEDS YOU' : '✅ no human input needed'}   ·  ${ts}`, '']
  if (result.stage) L.push(`**Stopped at:** ${result.stage}${result.reason ? ` — ${result.reason}` : ''}`, '')
  if (result.escalatedSurfaces.length) L.push(`**Escalated surfaces (did not converge):** ${result.escalatedSurfaces.join(', ')}`, '')
  if (result.questions.length) {
    L.push(`## Questions for you (${result.questions.length}) — batched; each has a recommended default`, '')
    for (const q of result.questions) {
      L.push(`### ${q.id} · ${q.category} · _whitelist: ${q.whitelist_hit}_${q.surface ? ` · ${q.surface}` : ''}`)
      L.push(`- **Ask:** ${q.ask}`)
      L.push(`- **Recommended default:** ${q.recommended_default}`)
      L.push('')
    }
  } else if (result.blocked) {
    L.push('## No human-decidable questions', '', 'Blocked, but every finding is owner-fixable — the auto-fix loop should resolve these. See the backlog below + `docs/maestro-report.md`.', '')
  } else {
    L.push('AIM is not blocked on a human. Nothing to decide here.', '')
  }
  if (result.backlog.length) {
    L.push(`## Auto-fix backlog (${result.backlog.length}) — NOT questions; the loop owns these`, '')
    for (const b of result.backlog.slice(0, 20)) L.push(`- [${b.owner}]${b.surface ? ` ${b.surface}` : ''} ${b.check} — ${b.evidence}`)
    if (result.backlog.length > 20) L.push(`- …and ${result.backlog.length - 20} more`)
    L.push('')
  }
  L.push('---', '_Sources: docs/maestro-report.json · gate-reports/lens/autofix-escalation.json · gate-reports/lens/porter-workorder.md_')
  return L.join('\n')
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const readText = (p) => { try { return fs.readFileSync(p, 'utf-8') } catch { return null } }

// WRAPPER — reads the sources from disk, writes the two artifacts. Best-effort: missing sources are fine.
export function consolidateEscalation({ dir = process.cwd(), buildStateDir = 'docs', reportDir = 'gate-reports' } = {}) {
  const report = readJson(path.resolve(dir, buildStateDir, 'maestro-report.json'))
  const readiness = readJson(path.resolve(dir, buildStateDir, 'publish-readiness.json'))
  const autofix = readJson(path.resolve(dir, reportDir, 'lens', 'autofix-escalation.json'))
  // porter-workorder.md is BEST-EFFORT (only the opt-in lens:autofix LLM step writes it). Porter store-data
  // findings still escalate regardless via autofix-escalation.json → classify()→real-asset-missing, so its
  // absence never drops an escalation; the .md just adds richer line-items when present.
  const workorder = readText(path.resolve(dir, reportDir, 'lens', 'porter-workorder.md'))
  const result = buildEscalation({ report, autofix, workorder, readiness })
  const ts = process.env.MAESTRO_TS || 'pending'
  const outDir = path.resolve(dir, buildStateDir)
  try {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'questions.json'), `${JSON.stringify({ generated: ts, ...result }, null, 2)}\n`)
    fs.writeFileSync(path.join(outDir, 'ESCALATION.md'), `${renderMarkdown(result, ts)}\n`)
  } catch (e) { console.error(`maestro:escalate: could not write artifact — ${e.message}`) }
  return result
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function main() {
  const dir = process.cwd()
  const buildStateDir = process.env.BUILD_STATE_DIR || 'docs'
  const r = consolidateEscalation({ dir, buildStateDir })
  if (r.blocked) {
    console.log(`maestro:escalate — ⛔ ${r.questions.length} question(s) for Yash · ${r.backlog.length} auto-fix item(s) · ${r.escalatedSurfaces.length} escalated surface(s). See ${buildStateDir}/ESCALATION.md`)
  } else {
    console.log(`maestro:escalate — ✅ no human input needed (${buildStateDir}/ESCALATION.md)`)
  }
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
