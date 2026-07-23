#!/usr/bin/env node
// audit-vacuous-pass — which static gates report PASS on a theme with NOTHING in it? (QA-7, 2026-07-23)
//
// Sibling of audit-unproven-guards. That one asks "has this blocker ever been shown to fire?"; this one
// asks the complementary question: "when a gate examines nothing, does its green tick still read like
// assurance?" Measured on an empty theme, 26 of 33 static gates reported PASS while declaring neither a
// skip nor an *.n-a-* — and `base` resolved fine, so this is NOT the known missing-tag case. It is an
// empty SCAN that never says so.
//
// The honest nuance, which the allowlist below exists to record: a PASS on zero files is not
// automatically a bug. An absence-check ("no hardcoded secrets", "no conflicting apps") is genuinely
// satisfied by an empty theme. A scan-based gate ("every section is on the type ladder") is not — it
// proved nothing. The point of this audit is that every gate must be CLASSIFIED, and a newly-added
// gate cannot quietly join the vacuous set.
//
// Usage: node audit-vacuous-pass.mjs [--json]
// Exit: always 0 — advisory, like audit-unproven-guards. The classification is the deliverable.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Gates whose verdict is MEANINGFUL on an empty theme: they assert the ABSENCE of something bad, so
// "nothing here" genuinely satisfies them. Each entry is a claim someone has to stand behind.
export const ABSENCE_CHECKS = new Set([
  'secret-scan',        // no secrets in no files — true, and the strongest reading of the gate
  'app-conflicts',      // no conflicting third-party app embeds
  'consent',            // no tracking fired before consent
  'legal-pages',        // asserts required policy pages exist → it BLOCKS when absent, so PASS is real
  'analytics-wiring',   // no mis-wired analytics
  'orchestration',      // audits the gate graph + registry, not the theme — theme size is irrelevant
  'gate-integrity',     // audits other reports, not the theme
  'discovery',          // audits docs/ artifacts, not the theme
  'foundation',         // audits repo provisioning, not the theme
  // theme-check lints the WHOLE theme, not a diff scope: "no lint offenses" in an empty theme is a
  // true statement, the same shape as secret-scan. (It still blocks on a real theme — cravinbyandy
  // 2026-07-23.)
  'code-lint',
  // rule-pack EVALUATED all 8 rules on the empty theme and emitted 3 real findings (html-lang,
  // skip-link, responsive-images). It examined the theme and reported — the opposite of vacuous.
  'rule-pack',
])

// Gates whose empty-theme PASS carries a warning that ESCALATES TO A BLOCKER at publish grade
// (DS_REQUIRE_SCOPE / LENS_REQUIRE / *_ENFORCE). They are not claiming a clean audit — they are saying
// "a required step has not been done yet", and they stop the publish. Renaming those ids to *.n-a-*
// was considered and rejected: it would downgrade a real finding to a shrug.
export const PENDING_DECLARERS = new Map([
  ['design-quality', 'dq.pack-missing — warns in dev, BLOCKS under DS_REQUIRE_SCOPE'],
  ['brand-sync', 'cascade.css-missing — warns in dev, BLOCKS under enforce (asserted by its own fixture)'],
  ['visual-check', 'vt.capture-not-done — warns in dev, becomes vt.capture-missing (BLOCK) at publish grade'],
])

export function classify(name, report) {
  if (!report) return { verdict: 'no-report', why: 'the gate wrote no report at all' }
  const ev = report.evidence || {}
  const sk = ev.skipped !== undefined ? ev.skipped : report.skipped
  const declaredSkip = sk !== undefined && sk !== null && sk !== false && !(Array.isArray(sk) && !sk.length)
  const declaredNA = (report.warnings || []).some((w) => /\.n-a-/.test(w?.id || ''))
  if (report.pass !== true) return { verdict: 'not-pass', why: 'blocked or errored — not a vacuous pass' }
  if (declaredSkip) return { verdict: 'declares-skip', why: 'says it did not run' }
  if (declaredNA) return { verdict: 'declares-n-a', why: 'says it was not applicable' }
  if (ABSENCE_CHECKS.has(name)) return { verdict: 'absence-check', why: 'PASS on an empty theme is a true claim (allowlisted)' }
  if (PENDING_DECLARERS.has(name)) return { verdict: 'declares-pending', why: PENDING_DECLARERS.get(name) }
  return { verdict: 'VACUOUS', why: 'pass:true on an empty theme, with no skip and no N/A — the green tick is not evidence' }
}

// Build the emptiest thing that is still a git repo with a resolvable base tag, so scope resolution
// SUCCEEDS and yields zero files. That distinction is the whole point: this is not "the tag is
// missing", it is "the scan legitimately covered nothing and still reported green".
export function makeEmptyTheme() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vacuous-'))
  const run = (args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })
  run(['init', '-q', '.'])
  run(['-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'])
  run(['tag', 'base'])
  for (const d of ['sections', 'assets', 'snippets', 'templates', 'layout', 'docs/design']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true })
  }
  fs.writeFileSync(path.join(dir, 'docs/design/design-system.json'), '{}')
  return dir
}

function main() {
  const asJson = process.argv.includes('--json')
  let manifest
  try {
    manifest = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'theme-gates.mjs'), '--list-json'], { encoding: 'utf-8' }))
  } catch (e) {
    console.error(`audit-vacuous-pass: could not read the gate manifest — ${e.message}`)
    process.exit(0)
  }
  const statics = manifest.filter((g) => g.kind === 'static')
  const dir = makeEmptyTheme()
  const rows = []
  for (const g of statics) {
    try {
      // honour the manifest's runner exactly as theme-gates does — `editability` is a bash gate, and
      // running it with node made it look like it wrote no report at all. An audit that mis-runs a
      // gate invents a finding, which is the failure mode this whole workstream exists to stop.
      const runner = g.runner === 'node' ? process.execPath : g.runner
      execFileSync(runner, [path.join(HERE, g.script)], {
        cwd: dir, stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000,
        env: { ...process.env, REPORT_DIR: 'gate-reports' },
      })
    } catch { /* a non-zero exit is a verdict, not an error */ }
    let report = null
    try { report = JSON.parse(fs.readFileSync(path.join(dir, 'gate-reports', `${g.name}.json`), 'utf-8')) } catch { /* none */ }
    rows.push({ gate: g.name, number: g.number, ...classify(g.name, report) })
  }
  fs.rmSync(dir, { recursive: true, force: true })

  const vacuous = rows.filter((r) => r.verdict === 'VACUOUS')
  if (asJson) { console.log(JSON.stringify({ total: rows.length, vacuous: vacuous.length, rows }, null, 2)); process.exit(0) }

  console.log(`audit-vacuous-pass: ${rows.length} static gate(s) run against an EMPTY theme\n`)
  const by = (v) => rows.filter((r) => r.verdict === v)
  for (const [label, v] of [['declares a skip', 'declares-skip'], ['declares N/A', 'declares-n-a'], ['declares work PENDING (blocks at publish)', 'declares-pending'], ['absence-check (allowlisted)', 'absence-check'], ['blocked / errored', 'not-pass'], ['wrote NO report', 'no-report']]) {
    const g = by(v)
    if (g.length) console.log(`  ${String(g.length).padStart(2)} ${label}: ${g.map((r) => r.gate).join(', ')}`)
  }
  console.log('')
  if (!vacuous.length) { console.log('✅ no vacuous passes — every gate either scanned something, declared a skip/N-A, or is an allowlisted absence-check.'); process.exit(0) }
  console.log(`⚠️  ${vacuous.length} VACUOUS pass(es) — green on an empty theme, with no skip and no N/A:`)
  for (const r of vacuous) console.log(`   #${r.number} ${r.gate}`)
  console.log('\nEach needs a call: is it an absence-check (add it to ABSENCE_CHECKS with the reason),')
  console.log('or should it declare an *.n-a-empty-scope* warning when it examines nothing?')
  console.log('A PASS from a gate that looked at nothing is not evidence — and `theme-gates --verify')
  console.log('--require-full` treats it as if it were.')
  process.exit(0)
}

if (isMain(import.meta.url)) main()
