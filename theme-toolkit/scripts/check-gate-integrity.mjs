#!/usr/bin/env node
// Gate #45 check-gate-integrity — "A SKIPPED GATE IS NOT A PASSED GATE."
//
// THE DEFECT THIS CLOSES (cravinbyandy forensics, 2026-07-22): with no `base` git tag the scope-
// resolving gates cannot diff, so they skip their scan and still write `pass: true`. SUMMARY.md then
// renders them as "✅ Passed". On that project EIGHT gates — design-system(#8), consistency(#9),
// static-a11y(#16), css-layout(#22), render-check(#14), dead-code(#11), honesty(#13), section-reuse(#23)
// — never actually ran for 9 days while reporting green. The client kept re-reporting spacing/typography
// bugs that no gate was checking. This gate audits the gate reports themselves and BLOCKS that state.
//
// Precise by design (a false BLOCK is as bad as a false pass):
//   BLOCK  `*.scope-unresolved` / `*base-unresolved` on a report that says pass:true  → skip counted as pass
//   BLOCK  a report with `skipped:true` + pass:true                                    → same class
//   BLOCK  `no-baseline-tag` / `base-tag-missing`                                      → the root cause, with the fix
//   WARN   `*.n-a-*` markers                                                           → genuinely not-applicable
//          (no redirect map on a non-migration is CORRECT) — surfaced, never blocking.
// Escape hatch: name the gate in `CHANGES.md` under `## Waivers` (same convention as theme-gates).
//
// Usage: node check-gate-integrity.mjs   Env: REPORT_DIR (gate-reports)   Exit: 0 pass · 1 block · 2 env

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REPORT_ABS = path.resolve(cwd, REPORT_DIR)
const SELF = 'check-gate-integrity'

const SCOPE_SKIP_RE = /(\.scope-unresolved$|base-unresolved$)/
const NA_RE = /\.n-a-/
const ROOT_CAUSE_RE = /(no-baseline-tag|base-tag-missing)/

// Gates named under `## Waivers` in CHANGES.md are exempt (documented, Yash-approved).
function waivedGates() {
  const out = new Set()
  try {
    const md = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = md.match(/##\s*Waivers[\s\S]*?(?=\n##\s|$)/i)
    if (!m) return out
    for (const line of m[0].split('\n')) {
      const g = line.match(/`([a-z0-9-]+)`/gi)
      if (g) for (const t of g) out.add(t.replace(/`/g, '').toLowerCase())
    }
  } catch { /* no CHANGES.md */ }
  return out
}

// PURE: audit parsed reports → { blockers[], warnings[], audited }
export function auditReports(reports, waived = new Set()) {
  const blockers = []
  const warnings = []
  const add = (arr, id, page, detail) => arr.push({ id, page, detail, evidence: '' })
  let rootCauseSeen = false

  for (const { name, json } of reports) {
    const ids = [...(json.blockers || []), ...(json.warnings || [])].map((f) => String(f && f.id || '')).filter(Boolean)
    const scopeSkips = ids.filter((i) => SCOPE_SKIP_RE.test(i))
    const naMarks = ids.filter((i) => NA_RE.test(i))
    const rootCause = ids.filter((i) => ROOT_CAUSE_RE.test(i))
    const isWaived = waived.has(String(name).toLowerCase())

    if (rootCause.length && !rootCauseSeen) {
      rootCauseSeen = true
      add(blockers, 'integrity.no-baseline-tag', name,
        `no \`base\` git tag — every scope-resolving gate (#8/#9/#11/#13/#14/#16/#22/#23) silently skips its scan and still reports pass. FIX: commit the pulled baseline then \`git tag base\` (mantle bootstrap), and re-run the stack.`)
    }
    if (scopeSkips.length && json.pass === true && !isWaived) {
      add(blockers, 'integrity.skip-counted-as-pass', name,
        `gate "${name}" reported pass:true but its scan was SKIPPED (${scopeSkips.join(', ')}) — a skipped gate is not a passed gate. Resolve the scope (usually the missing \`base\` tag) and re-run, or waive "${name}" in CHANGES.md ## Waivers.`)
    }
    if (json.skipped === true && json.pass === true && !isWaived) {
      add(blockers, 'integrity.skipped-but-pass', name,
        `gate "${name}" is marked skipped:true yet reports pass:true — it proved nothing. Run it or waive it explicitly.`)
    }
    if (naMarks.length) {
      add(warnings, 'integrity.gate-not-applicable', name,
        `gate "${name}" was not applicable (${naMarks.join(', ')}) — legitimate when the input genuinely doesn't exist, but it contributes NO quality signal. Confirm that's intended.`)
    }
  }
  return { blockers, warnings, audited: reports.length }
}

function loadReports() {
  const out = []
  let files = []
  try { files = fs.readdirSync(REPORT_ABS) } catch { return out }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    if (f === 'summary.json' || f.startsWith(SELF)) continue
    let json
    try { json = JSON.parse(fs.readFileSync(path.join(REPORT_ABS, f), 'utf-8')) } catch { continue }
    if (!json || typeof json !== 'object' || Array.isArray(json)) continue
    out.push({ name: json.gate || path.basename(f, '.json'), json })
  }
  return out
}

function main() {
  const t0 = Date.now()
  const reports = loadReports()
  if (!reports.length) {
    // Nothing to audit yet — the stack hasn't run. Advisory, not a block (first run ordering).
    writeReport(SELF, 45, { cwd, pass: true, blockers: [], warnings: [{ id: 'integrity.no-reports', page: REPORT_DIR, detail: 'no gate reports found yet — run the gate stack first', evidence: '' }], evidence: { audited: 0 }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.log('check-gate-integrity: PASS — no gate reports to audit yet')
    process.exit(0)
  }
  const { blockers, warnings, audited } = auditReports(reports, waivedGates())
  const pass = blockers.length === 0
  writeReport(SELF, 45, { cwd, pass, blockers, warnings, evidence: { audited }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`check-gate-integrity: ${pass ? 'PASS' : 'BLOCK'} — audited ${audited} report(s) · ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}]: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}]: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
