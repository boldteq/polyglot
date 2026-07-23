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
// MUST be the manifest name (theme-gates reads gate-reports/<manifest-name>.json). It was
// 'check-gate-integrity', so gate 45's own report was invisible to the orchestrator — the gate whose
// entire job is "a skipped gate is not a passed gate" was itself unreadable. Enforced by orch.report-name-mismatch.
const SELF = 'gate-integrity'

const SCOPE_SKIP_RE = /(\.scope-unresolved$|base-unresolved$)/
const NA_RE = /\.n-a-/

// PURE: did this report actually RUN? Returns a human-readable marker when it did not.
// Handles both shapes: the legacy top-level `skipped` and `evidence.skipped`, which is what every
// gate in this toolkit really writes. An empty array/string means "nothing was skipped" (the imagery
// gate emits `skipped: []` on a clean merge) and must NOT be read as a skip.
// A gate that reports pass:true having examined ZERO files proved nothing — "no findings" and
// "nothing was looked at" are different facts wearing the same green tick. Several gates already
// RECORD the count (static-a11y writes `scanned: 0`); nothing read it, which is the same
// evidence-nobody-reads shape as the report-name drift. Only gates that actually report a scan size
// are judged here — absence of the field means unknown, never "fine".
//
// Returns the count when it is an explicit zero, else null.
export function emptyScan(json) {
  const ev = json?.evidence
  if (!ev || typeof ev !== 'object') return null
  for (const key of ['scanned', 'filesScanned', 'files_scanned', 'scannedFiles']) {
    if (typeof ev[key] === 'number') return ev[key] === 0 ? key : null
  }
  return null
}

export function skippedMarker(json) {
  const val = json?.evidence?.skipped !== undefined ? json.evidence.skipped : json?.skipped
  if (val === undefined || val === null || val === false) return null
  if (Array.isArray(val)) return val.length ? `skipped: ${val.join(', ')}` : null
  if (typeof val === 'string') return val.trim() ? `skipped: ${val.trim()}` : null
  if (val === true) return 'skipped: true'
  return null
}
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
    // ENV-2 (2026-07-23) — this used to test ONLY `json.skipped === true`, a top-level boolean that
    // **no gate has ever written** (audited: 0 occurrences across every gate script and every report on
    // disk). The shape the toolkit actually uses is `evidence.skipped` — 8 gates emit it
    // (theme-check, lighthouse, axe, seo, functional, conversion, theme-link, theme-relink). So the
    // one check whose whole job is "a skipped gate is not a passed gate" could never fire, while the
    // docstring promised it did. Same class as the other guards found tonight: present, believed,
    // inert. No live false-pass exists today — all 8 correctly set pass:false — so this is
    // preventative, restoring a guarantee the stack already thinks it has.
    const skipMark = skippedMarker(json)
    if (skipMark && json.pass === true && !isWaived) {
      add(blockers, 'integrity.skipped-but-pass', name,
        `gate "${name}" reports pass:true but did not actually run (${skipMark}) — it proved nothing. Run it, or waive "${name}" in CHANGES.md ## Waivers.`)
    }
    // pass + an explicitly-zero scan + no skip/N-A declaration = a green tick over an empty scan
    const emptyKey = emptyScan(json)
    if (json.pass === true && emptyKey && !skipMark && !naMarks.length) {
      add(blockers, 'integrity.vacuous-pass', name,
        `gate "${name}" reports pass:true but ${emptyKey}=0 — it examined nothing, so its green tick is not evidence. Fix the scope (a base tag / an empty changed-file set), or have the gate declare a skip or an *.n-a-* warning.`)
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
