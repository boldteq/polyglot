#!/usr/bin/env node
// Gate 2 — Shopify theme check (lumen). Runs `shopify theme check --output json`
// against the theme repo in cwd with the repo's .theme-check.yml (Boldteq required
// rules — see theme-toolkit/.theme-check.yml). Posture: 0 errors = pass; warnings
// recorded in warnings[] but never block.
//
// Env:  REPORT_DIR (default: gate-reports)
// Out:  $REPORT_DIR/theme-check.json (schema via lib/report.mjs)
// Exit: 0 = pass · 1 = block (errors) · 2 = env error (CLI missing / unparseable output)

import { spawnSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const started = Date.now()
const reportDir = process.env.REPORT_DIR || 'gate-reports'

function finish(code, data) {
  const { file, report } = writeReport('code-lint', 2, { ...data, duration_ms: Date.now() - started }, reportDir)
  console.log(`report: ${file} (pass=${report.pass}, blockers=${report.blockers.length}, warnings=${report.warnings.length})`)
  process.exit(code)
}

// ── dep guard: shopify CLI present? ───────────────────────────────────────
const probe = spawnSync('shopify', ['version'], { encoding: 'utf-8', timeout: 30_000 })
if (probe.error || probe.status !== 0) {
  console.error('ENV-ERROR: shopify CLI not found on PATH. Install: npm install -g @shopify/cli@3')
  finish(2, {
    pass: false,
    evidence: { skipped: 'env', reason: 'shopify CLI not on PATH', hint: 'npm install -g @shopify/cli@3' },
  })
}

// ── run theme check from the repo root ────────────────────────────────────
const run = spawnSync('shopify', ['theme', 'check', '--output', 'json'], {
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
  timeout: 300_000,
  env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' },
})
if (run.error) {
  console.error(`ENV-ERROR: failed to run shopify theme check: ${run.error.message}`)
  finish(2, { pass: false, evidence: { skipped: 'env', reason: `spawn failed: ${run.error.message}` } })
}

// stdout is a JSON array of per-file offense reports; the CLI may print prose
// around it — slice from the first "[" to the last "]".
const stdout = run.stdout || ''
const start = stdout.indexOf('[')
const end = stdout.lastIndexOf(']')
let results = null
if (start !== -1 && end > start) {
  try {
    results = JSON.parse(stdout.slice(start, end + 1))
  } catch {
    results = null
  }
}
if (!Array.isArray(results)) {
  console.error('ENV-ERROR: could not parse `shopify theme check --output json` output')
  console.error((run.stderr || stdout).slice(0, 1000))
  finish(2, {
    pass: false,
    evidence: {
      skipped: 'env',
      reason: 'unparseable theme-check output (not a theme dir, or CLI flag drift?)',
      exitCode: run.status,
      stderr: (run.stderr || '').slice(0, 500),
    },
  })
}

// theme-check-js severity: 0 = error, 1 = warning, 2 = info (legacy ruby used strings)
const SEV = { 0: 'error', 1: 'warning', 2: 'info', error: 'error', warning: 'warning', info: 'info', suggestion: 'info' }
const blockers = []
const warnings = []
let infoCount = 0
for (const fileResult of results) {
  const filePath = fileResult.path ?? fileResult.absolute_path ?? '(unknown)'
  for (const o of fileResult.offenses ?? []) {
    const sev = SEV[o.severity] ?? 'warning'
    const row = typeof o.start_row === 'number' ? o.start_row + 1 : (o.start_line ?? '?')
    const entry = {
      id: `theme-check.${o.check}`,
      page: filePath,
      detail: `${filePath}:${row} — ${o.message}`,
      evidence: `${o.check} (${sev})`,
    }
    if (sev === 'error') blockers.push(entry)
    else if (sev === 'warning') warnings.push(entry)
    else infoCount += 1
  }
}

const pass = blockers.length === 0
console.log(`theme check: ${blockers.length} error(s), ${warnings.length} warning(s), ${infoCount} info across ${results.length} file(s)`)
finish(pass ? 0 : 1, {
  pass,
  blockers,
  warnings,
  evidence: { files_with_offenses: results.length, errors: blockers.length, warnings: warnings.length, info: infoCount },
})
