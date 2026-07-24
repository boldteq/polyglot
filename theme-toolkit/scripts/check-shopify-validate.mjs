#!/usr/bin/env node
// Gate #49 shopify-validate — our Liquid, judged by SHOPIFY'S validator instead of ours.
//
// THE GAP THIS CLOSES (audit 2026-07-23): the team's 5,253 trained rules contained ZERO shopify.dev
// citations. Every rule was model-recall, and the whole gate stack enforced rules we invented — which
// is exactly why the output kept failing the "is this Shopify quality?" test. This gate hands the
// build-added Liquid to @shopify/dev-mcp's `validate_theme`, the same engine behind Shopify's own
// Theme Check, and reports what SHOPIFY says. Proven live on first run: it passed a conforming section
// and caught a missing snippet, an unknown filter, and the deprecated `img_url` on a broken one.
//
// vs #2 code-lint: #2 runs the `shopify` CLI against the WHOLE theme with our .theme-check.yml. This
// runs Shopify's engine against THIS BUILD'S files with Shopify's own defaults, and surfaces the
// suggested fixes verbatim. They disagree on purpose — #2 is our policy, #49 is Shopify's.
//
// MEASURED COVERAGE BOUNDARY (coverage-probe.mjs → __fixtures__/shopify-validate/coverage.md, 2026-07-24).
// One isolated violation per whole minimal theme. Catch-rate 7/9. IMPORTANT: this validator needs
// full-theme context — a single-file probe of `{{ x | bad_filter }}` passes VALID, but the same file
// inside a theme is correctly caught. So #49 is only trustworthy when handed a real theme dir.
//   CAUGHT by Shopify: unknown filter · missing snippet · deprecated img_url · invalid schema JSON ·
//     unknown setting type · unclosed Liquid tag · undefined object.
//   MISSED by Shopify (stay owned by a native gate, do NOT assume #49 covers them):
//     · duplicate setting id      → owned by #47 schema-authoring (schema.duplicate-setting-id)
//     · malformed {% render %} args → owned by #2 theme-check (recommended)
//
// Usage: node check-shopify-validate.mjs
// Env:   BASE_REF (default "base") · REPORT_DIR · SHOPIFY_VALIDATE_SCAN_ALL=1 (fixtures: skip git scope)
//        SHOPIFY_MCP_TIMEOUT_MS (default 180000) · SHOPIFY_MCP_PKG · SHOPIFY_VALIDATE_MAX_FILES (default 40)
// Exit:  0 = pass · 1 = block (Shopify reported an ERROR) · 2 = env error
//
// OFFLINE / UNAVAILABLE is a WARNING, never a pass-in-disguise: the report keeps a real
// evidence.scanned so gate #45 gate-integrity can still tell "ran and found nothing" from "never ran".

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { validateTheme } from './lib/shopify-mcp.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const SCAN_ALL = process.env.SHOPIFY_VALIDATE_SCAN_ALL === '1'
// The validator round-trips every file's content through one JSON-RPC call; a 200-file first build
// would blow the gate's 600s budget. Cap it, and SAY that the scan was capped rather than implying
// full coverage — a silent truncation reads as "all clear" when it is not.
const MAX_FILES = Number(process.env.SHOPIFY_VALIDATE_MAX_FILES || 40)

const SCAN_DIRS = ['sections', 'snippets', 'layout', 'blocks']
const blockers = []
const warnings = []

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('shopify-validate', 49, {
    cwd, pass, blockers, warnings,
    evidence: { baseRef: BASE_REF, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`shopify-validate: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 10)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (warnings.length > 10) console.log(`  …and ${warnings.length - 10} more warning(s)`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const walk = (dir, acc = []) => {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, acc)
    else if (e.name.endsWith('.liquid')) acc.push(rel)
  }
  return acc
}

// Files this build added or modified vs the vendored base — the same scope every other static gate
// uses, so Shopify's vendor code is never reported as our defect.
function scopedFiles() {
  if (SCAN_ALL) return { files: SCAN_DIRS.flatMap((d) => walk(d)), scoped: false, reason: 'SHOPIFY_VALIDATE_SCAN_ALL=1' }
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return { files: null, scoped: false, reason: `base ref "${BASE_REF}" unresolvable` }
  }
  try {
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: out.split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.liquid')), scoped: true, reason: null }
  } catch (e) {
    return { files: null, scoped: false, reason: `git diff failed: ${e.message}` }
  }
}

async function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }

  const { files: scopeFiles, scoped, reason } = scopedFiles()
  if (scopeFiles === null) {
    warnings.push({ id: 'shopify-validate.scope-unresolved', page: '.', detail: `${reason} — cannot tell this build's Liquid from the vendored theme's, so nothing was validated. Tag the base commit \`base\`.`, evidence: BASE_REF })
    finish(null, { scanned: 0, scope: 'unresolved' })
  }

  const present = scopeFiles.filter((f) => fs.existsSync(path.resolve(cwd, f)))
  if (present.length === 0) {
    warnings.push({ id: 'shopify-validate.n-a-empty-scope', page: '.', detail: 'scope resolved but 0 Liquid files were added or modified vs base — nothing to validate (not a defect, an absence of signal)', evidence: '' })
    finish(null, { scanned: 0, scope: scoped ? 'build-diff' : 'all' })
  }

  const capped = present.length > MAX_FILES
  const selected = present.slice(0, MAX_FILES)
  if (capped) {
    warnings.push({ id: 'shopify-validate.scan-capped', page: '.', detail: `${present.length} changed Liquid files exceed the ${MAX_FILES}-file cap — only the first ${MAX_FILES} were validated. Raise SHOPIFY_VALIDATE_MAX_FILES to cover the rest; this run does NOT clear the remainder.`, evidence: `${present.length} > ${MAX_FILES}` })
  }

  const payload = selected.map((f) => ({ path: f, content: fs.readFileSync(path.resolve(cwd, f), 'utf-8') }))
  const res = await validateTheme(cwd, payload)

  if (res.unavailable) {
    warnings.push({ id: 'shopify-validate.unavailable', page: '.', detail: `Shopify's validator could not run — ${res.reason}. This build was NOT checked against Shopify's own rules. (A corrupt ~/.npm/_npx cache is the usual cause: delete the offending dir and let npx refetch.)`, evidence: res.reason.slice(0, 200) })
    finish(null, { scanned: 0, attempted: selected.length, scope: scoped ? 'build-diff' : 'all', unavailable: true })
  }

  for (const f of res.findings) {
    const page = f.file || '(theme)'
    const fix = f.fix ? ` · Shopify suggests: ${f.fix}` : ''
    const entry = { id: `shopify.${f.severity === 'error' ? 'error' : 'warning'}`, page, detail: `${f.message}${fix}`, evidence: f.artifact || '' }
    if (f.severity === 'error') blockers.push(entry); else warnings.push(entry)
  }

  finish(null, {
    scanned: selected.length,
    scope: scoped ? 'build-diff' : 'all',
    capped: capped || undefined,
    totalChanged: present.length,
    errors: blockers.length,
    warnings: res.findings.filter((f) => f.severity === 'warning').length,
  })
}

main().catch((e) => {
  writeReport('shopify-validate', 49, {
    cwd, pass: false,
    blockers: [{ id: 'shopify-validate.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }],
    warnings: [], evidence: { scanned: 0 }, duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  console.error(`shopify-validate: CRASH — ${e.message}`)
  process.exit(2)
})
