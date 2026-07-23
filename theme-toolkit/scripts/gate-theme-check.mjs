#!/usr/bin/env node
// Gate 2 — Shopify theme check (lumen). Runs `shopify theme check --output json`
// against the theme repo in cwd with the repo's .theme-check.yml (Boldteq required
// rules — see theme-toolkit/.theme-check.yml). Posture: 0 errors = pass; warnings
// recorded in warnings[] but never block.
//
// Env:  REPORT_DIR (default: gate-reports)
// Out:  $REPORT_DIR/theme-check.json (schema via lib/report.mjs)
// Exit: 0 = pass · 1 = block (errors) · 2 = env error (CLI missing / unparseable output)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { classifyProbe } from './lib/cli-probe.mjs'


// Where is the CLI's entry script? `shopify` on PATH is a symlink into the npm global lib.
function cliEntry() {
  const w = spawnSync('which', ['shopify'], { encoding: 'utf-8' })
  const bin = (w.stdout || '').trim()
  if (!bin) return null
  try {
    const real = fs.realpathSync(bin)
    return real.endsWith('.js') ? real : null
  } catch { return null }
}

// Candidate node binaries that might be able to launch the CLI, newest first.
function candidateNodes() {
  const out = []
  if (process.env.SHOPIFY_CLI_NODE) out.push(process.env.SHOPIFY_CLI_NODE)
  const nvm = path.join(os.homedir(), '.nvm', 'versions', 'node')
  try {
    const vs = fs.readdirSync(nvm)
      .filter((v) => /^v\d+/.test(v))
      .sort((a, b) => Number(b.slice(1).split('.')[0]) - Number(a.slice(1).split('.')[0]))
    for (const v of vs) out.push(path.join(nvm, v, 'bin', 'node'))
  } catch { /* no nvm */ }
  return out.filter((p) => { try { return fs.existsSync(p) } catch { return false } })
}

// Decide how to invoke the CLI: directly, or via a Node that can actually load it.
function resolveCli() {
  const probe = spawnSync('shopify', ['version'], { encoding: 'utf-8', timeout: 30_000 })
  const c = classifyProbe(probe)
  if (c.kind === 'ok') return { ok: true, cmd: 'shopify', args: [] }
  if (c.kind === 'missing') {
    return { ok: false, reason: 'shopify CLI not found on PATH', hint: 'npm install -g @shopify/cli' }
  }

  // Installed but this runtime cannot launch it — look for one that can before giving up.
  const entry = cliEntry()
  if (entry) {
    for (const node of candidateNodes()) {
      if (path.resolve(node) === path.resolve(process.execPath)) continue // already proven to fail
      const t = spawnSync(node, [entry, 'version'], { encoding: 'utf-8', timeout: 60_000 })
      if (!t.error && t.status === 0) return { ok: true, cmd: node, args: [entry], via: node }
    }
  }
  return {
    ok: false,
    reason: c.kind === 'incompatible-runtime'
      ? `shopify CLI is installed but cannot run under this Node (${process.version})`
      : 'shopify CLI is installed but failed to launch',
    detail: c.detail,
    hint: entry
      ? `install a Node the CLI supports (it loaded fine under Node 22 here) or set SHOPIFY_CLI_NODE=/path/to/node — reinstalling the CLI will NOT help`
      : 'npm install -g @shopify/cli',
  }
}

const started = Date.now()
const reportDir = process.env.REPORT_DIR || 'gate-reports'

function finish(code, data) {
  const { file, report } = writeReport('code-lint', 2, { ...data, duration_ms: Date.now() - started }, reportDir)
  console.log(`report: ${file} (pass=${report.pass}, blockers=${report.blockers.length}, warnings=${report.warnings.length})`)
  process.exit(code)
}

// ── dep guard: can we actually RUN the shopify CLI? ───────────────────────
// 2026-07-23: this gate had been permanently inert and the message sent everyone the wrong way.
// The CLI was installed and on PATH, but crashed on launch under the Node version this toolkit
// mandates: `@shopify/cli` imports `enableCompileCache` from `node:module`, which Node 20.20.1 does
// not export (verified: `typeof m.enableCompileCache === 'undefined'`; Node 22.22.3 runs it fine).
// The old guard collapsed that into "not found on PATH — install @shopify/cli@3", so the remedy it
// printed could never work: reinstalling does not change the Node that launches it. Meanwhile
// theme-check — the Liquid linter — silently never ran on any build.
// It reported pass:false, so it was honest (gate #45), but it was also unfixable by anyone following
// its own advice. Now: distinguish MISSING from BROKEN, and if the current runtime cannot launch the
// CLI, find one that can rather than skipping forever.
const cliInvocation = resolveCli()
if (!cliInvocation.ok) {
  console.error(`ENV-ERROR: ${cliInvocation.reason}`)
  if (cliInvocation.detail) console.error(`  detail: ${cliInvocation.detail}`)
  console.error(`  fix: ${cliInvocation.hint}`)
  finish(2, {
    pass: false,
    evidence: { skipped: 'env', reason: cliInvocation.reason, detail: cliInvocation.detail, hint: cliInvocation.hint },
  })
}

// ── run theme check from the repo root ────────────────────────────────────
const run = spawnSync(cliInvocation.cmd, [...cliInvocation.args, 'theme', 'check', '--output', 'json'], {
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
// SCAN-SCOPE HYGIENE (2026-07-22 cravinbyandy forensics): theme-check followed the vendored toolkit
// into its own DELIBERATELY-BROKEN test fixtures — 52 of 56 "blockers" pointed at
// toolkit/scripts/__fixtures__/**. `.shopifyignore` doesn't apply (theme-check doesn't read it), so
// the gate sat permanently red for reasons unrelated to the theme, which trains everyone to ignore
// red. These paths are never part of the shipped theme; drop their offenses outright.
const OUT_OF_SCOPE = /(^|\/)(toolkit|node_modules|gate-reports|\.git)(\/|$)/
let outOfScopeDropped = 0
for (const fileResult of results) {
  const filePath = fileResult.path ?? fileResult.absolute_path ?? '(unknown)'
  if (OUT_OF_SCOPE.test(filePath)) { outOfScopeDropped += (fileResult.offenses ?? []).length; continue }
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
console.log(`theme check: ${blockers.length} error(s), ${warnings.length} warning(s), ${infoCount} info across ${results.length} file(s)${outOfScopeDropped ? ` · ignored ${outOfScopeDropped} offense(s) in toolkit/node_modules/gate-reports (not part of the theme)` : ''}`)
finish(pass ? 0 : 1, {
  pass,
  blockers,
  warnings,
  evidence: { files_with_offenses: results.length, errors: blockers.length, warnings: warnings.length, info: infoCount, out_of_scope_offenses_ignored: outOfScopeDropped },
})
