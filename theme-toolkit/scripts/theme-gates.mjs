#!/usr/bin/env node
// Boldteq theme-toolkit orchestrator — runs the QA gates against the theme repo in cwd.
//
// Usage:
//   node theme-gates.mjs                       full run (static gates, then URL gates when a
//                                              preview URL is configured — else static-only)
//   node theme-gates.mjs --static-only         theme-check + editability only
//   node theme-gates.mjs --gate <name>         run named gate(s) only (repeatable)
//   node theme-gates.mjs --report-dir <dir>    default: gate-reports
//   node theme-gates.mjs --verify [--require-full]
//
// Env:
//   THEME_PREVIEW_URL          preview URL for URL gates (or STORE + THEME_ID)
//   THEME_STORE_PASSWORD       storefront password (URL gates; STOREFRONT_PASSWORD accepted as alias)
//   SKIP_<GATE>=1              waive a gate (SKIP_THEME_CHECK, SKIP_EDITABILITY,
//                              SKIP_LIGHTHOUSE, SKIP_AXE, SKIP_SEO)
//
// summary.json: { toolkitVersion, ts, sha, dirty, branch, mode, url,
//                 gates: { <name>: { pass, blockers, warnings, skipped, reason } }, pass }
// pass = every executed gate passes AND no exit-2 skip without an explicit SKIP_<NAME>=1.
//
// --verify: summary is fresh iff dirty == false AND (sha == HEAD OR every file changed
// since sha is allowlisted: gate-reports/**, CHANGES.md, merchant-editability.md, docs/**).
// --require-full additionally requires mode == "full" && pass == true.
//
// Exit: 0 = pass/fresh · 1 = block/stale · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, execFileSync } from 'node:child_process'
import { readJson, toolkitVersion, gitInfo } from './lib/report.mjs'

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const FRESHNESS_ALLOWLIST = ['gate-reports', 'CHANGES.md', 'merchant-editability.md', 'docs']

const GATES = [
  { name: 'lighthouse', number: 1, kind: 'url', runner: 'node', script: 'gate-lighthouse.mjs' },
  { name: 'theme-check', number: 2, kind: 'static', runner: 'node', script: 'gate-theme-check.mjs' },
  { name: 'editability', number: 3, kind: 'static', runner: 'bash', script: 'gate-editability-greps.sh' },
  { name: 'axe', number: 5, kind: 'url', runner: 'node', script: 'gate-axe.mjs' },
  { name: 'seo', number: 6, kind: 'url', runner: 'node', script: 'gate-seo.mjs' },
  { name: 'conversion', number: 7, kind: 'url', runner: 'node', script: 'gate-conversion.mjs' },
]

// ── args ──────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`Boldteq theme gates orchestrator

Usage:
  node theme-gates.mjs [--static-only] [--gate <name>]... [--report-dir <dir>]
  node theme-gates.mjs --verify [--require-full] [--report-dir <dir>]

Gates: ${GATES.map(g => `${g.name}(${g.number})`).join(', ')}
Exit codes: 0 pass/fresh · 1 block/stale · 2 env error
`)
}

function parseArgs(argv) {
  const out = { staticOnly: false, gates: [], reportDir: 'gate-reports', verify: false, requireFull: false, help: false }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--static-only') out.staticOnly = true
    else if (a === '--gate') out.gates.push(argv[++i])
    else if (a === '--report-dir') out.reportDir = argv[++i]
    else if (a === '--verify') out.verify = true
    else if (a === '--require-full') out.requireFull = true
    else if (a === '--help' || a === '-h') out.help = true
    else {
      console.error(`unknown arg: ${a} (see --help)`)
      process.exit(2)
    }
  }
  if (out.gates.some(g => !g) || !out.reportDir) {
    console.error('missing value for --gate / --report-dir')
    process.exit(2)
  }
  return out
}

function resolveUrl() {
  if (process.env.THEME_PREVIEW_URL) return process.env.THEME_PREVIEW_URL
  const store = process.env.STORE
  const themeId = process.env.THEME_ID
  if (store && themeId) {
    const origin = (store.startsWith('http') ? store : `https://${store}`).replace(/\/+$/, '')
    return `${origin}/?preview_theme_id=${encodeURIComponent(themeId)}`
  }
  return null
}

function skipEnvName(gateName) {
  return `SKIP_${gateName.toUpperCase().replace(/-/g, '_')}`
}

function matchesAllowlist(p) {
  return FRESHNESS_ALLOWLIST.some(pre => p === pre || p.startsWith(pre.endsWith('/') ? pre : `${pre}/`))
}

function gitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function gitBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

// ── verify mode ───────────────────────────────────────────────────────────
function verify(args) {
  const cwd = process.cwd()
  const summaryPath = path.resolve(cwd, args.reportDir, 'summary.json')
  if (!fs.existsSync(summaryPath)) {
    console.error(`verify: ENV-ERROR — no summary at ${summaryPath}; run the gates first`)
    process.exit(2)
  }
  let summary
  try {
    summary = readJson(summaryPath)
  } catch (err) {
    console.error(`verify: ENV-ERROR — unreadable summary.json: ${err.message}`)
    process.exit(2)
  }
  const head = gitHead(cwd)
  if (!head) {
    console.error('verify: ENV-ERROR — not a git repository')
    process.exit(2)
  }
  if (!summary.sha) {
    console.error('verify: ENV-ERROR — summary has no sha (gates ran outside a git repo)')
    process.exit(2)
  }
  if (summary.dirty === true) {
    console.error('verify: STALE — summary was produced from a dirty working tree')
    process.exit(1)
  }
  const { dirty: nowDirty } = gitInfo(cwd, FRESHNESS_ALLOWLIST)
  if (nowDirty) {
    console.error('verify: STALE — working tree has non-allowlisted uncommitted changes')
    process.exit(1)
  }
  if (summary.sha !== head) {
    let changed
    try {
      changed = execFileSync('git', ['diff', '--name-only', `${summary.sha}..HEAD`], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
        .split('\n')
        .filter(Boolean)
    } catch {
      console.error(`verify: STALE — summary sha ${summary.sha} not found in history`)
      process.exit(1)
    }
    const offending = changed.filter(p => !matchesAllowlist(p))
    if (offending.length > 0) {
      console.error(`verify: STALE — ${offending.length} non-allowlisted file(s) changed since ${summary.sha.slice(0, 7)}:`)
      for (const p of offending.slice(0, 10)) console.error(`  ${p}`)
      process.exit(1)
    }
  }
  if (args.requireFull) {
    if (summary.mode !== 'full') {
      console.error(`verify: FAIL — --require-full but summary mode is "${summary.mode}"`)
      process.exit(1)
    }
    if (summary.pass !== true) {
      console.error('verify: FAIL — --require-full but summary pass=false')
      process.exit(1)
    }
  }
  console.log(`verify: FRESH — summary @ ${summary.sha.slice(0, 7)} (mode=${summary.mode}, pass=${summary.pass}, ts=${summary.ts})`)
  process.exit(0)
}

// ── run mode ──────────────────────────────────────────────────────────────
function indent(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map(l => `    │ ${l}`)
    .join('\n')
}

function runGates(args) {
  const cwd = process.cwd()
  const url = resolveUrl()

  let mode
  let selected
  if (args.gates.length > 0) {
    mode = 'gate-subset'
    selected = args.gates.map(name => {
      const gate = GATES.find(g => g.name === name)
      if (!gate) {
        console.error(`unknown gate: ${name} (valid: ${GATES.map(g => g.name).join(', ')})`)
        process.exit(2)
      }
      return gate
    })
  } else if (args.staticOnly) {
    mode = 'static-only'
    selected = GATES.filter(g => g.kind === 'static')
  } else if (url) {
    mode = 'full'
    selected = [...GATES.filter(g => g.kind === 'static'), ...GATES.filter(g => g.kind === 'url')]
  } else {
    mode = 'static-only'
    selected = GATES.filter(g => g.kind === 'static')
    console.log('note: no preview URL (THEME_PREVIEW_URL / STORE+THEME_ID) — URL gates out of scope, mode=static-only')
  }

  const reportDirAbs = path.resolve(cwd, args.reportDir)
  fs.mkdirSync(reportDirAbs, { recursive: true })

  const results = {} // name → { pass, blockers, warnings, skipped, reason, waived, exitCode }
  for (const gate of selected) {
    const skipEnv = skipEnvName(gate.name)
    if (process.env[skipEnv] === '1') {
      console.log(`  gate ${gate.name} ... WAIVED (${skipEnv}=1)`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: `waived via ${skipEnv}=1`, waived: true }
      continue
    }
    const scriptPath = path.join(SCRIPTS_DIR, gate.script)
    if (gate.kind === 'url' && !url) {
      console.log(`  gate ${gate.name} ... SKIP (no preview URL)`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: 'no preview URL', waived: false }
      continue
    }
    if (!fs.existsSync(scriptPath)) {
      console.log(`  gate ${gate.name} ... SKIP (gate script not found: scripts/${gate.script})`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: `gate script not found: scripts/${gate.script}`, waived: false }
      continue
    }

    const reportPath = path.join(reportDirAbs, `${gate.name}.json`)
    fs.rmSync(reportPath, { force: true }) // never read a stale report from a previous run

    process.stdout.write(`  gate ${gate.name} ... `)
    const childEnv = { ...process.env, REPORT_DIR: args.reportDir }
    if (url) childEnv.THEME_PREVIEW_URL = url
    // lumen's runbook uses STOREFRONT_PASSWORD — normalize to the canonical name for every gate
    if (!childEnv.THEME_STORE_PASSWORD && process.env.STOREFRONT_PASSWORD) {
      childEnv.THEME_STORE_PASSWORD = process.env.STOREFRONT_PASSWORD
    }
    const child = spawnSync(gate.runner, [scriptPath], {
      cwd,
      encoding: 'utf-8',
      env: childEnv,
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    })

    let report = null
    try {
      report = readJson(reportPath)
    } catch {
      report = null
    }
    const code = child.error ? 2 : (child.status ?? 2)

    if (code === 0 || code === 1) {
      results[gate.name] = {
        pass: code === 0,
        blockers: report?.blockers ?? [],
        warnings: report?.warnings ?? [],
        skipped: false,
        reason: null,
        waived: false,
        exitCode: code,
      }
      console.log(code === 0 ? 'PASS' : 'BLOCK')
    } else {
      const reason =
        report?.evidence?.reason ??
        (child.error ? child.error.message : null) ??
        String(child.stderr || '').split('\n').find(Boolean) ??
        `gate exited ${code}`
      results[gate.name] = {
        pass: false,
        blockers: report?.blockers ?? [],
        warnings: report?.warnings ?? [],
        skipped: true,
        reason,
        waived: false,
        exitCode: code,
      }
      console.log(`SKIP-ENV (exit ${code})`)
    }
    const output = indent(`${child.stdout || ''}${child.stderr || ''}`)
    if (output) console.log(output)
  }

  // pass = all executed gates pass AND no exit-2 skip without explicit SKIP_<NAME>=1
  const overallPass = Object.values(results).every(r => (r.waived ? true : r.skipped ? false : r.pass))

  const { sha, dirty } = gitInfo(cwd, FRESHNESS_ALLOWLIST)
  const summary = {
    toolkitVersion: toolkitVersion(),
    ts: new Date().toISOString(),
    sha,
    dirty,
    branch: gitBranch(cwd),
    mode,
    url,
    gates: Object.fromEntries(
      Object.entries(results).map(([name, r]) => [
        name,
        { pass: r.pass, blockers: r.blockers, warnings: r.warnings, skipped: r.skipped, reason: r.reason },
      ]),
    ),
    pass: overallPass,
  }
  fs.writeFileSync(path.join(reportDirAbs, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

  // aligned table
  const rows = selected.map(g => {
    const r = results[g.name]
    const status = r.waived ? 'WAIVED' : r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'BLOCK'
    return [String(g.number), g.name, status, r.skipped ? '—' : String(r.blockers.length), r.skipped ? '—' : String(r.warnings.length), r.reason ?? '—']
  })
  const header = ['#', 'GATE', 'RESULT', 'BLOCKERS', 'WARNINGS', 'NOTE']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const fmt = row => row.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(`\n${fmt(header)}`)
  console.log(widths.map(w => '─'.repeat(w)).join('──'))
  for (const row of rows) console.log(fmt(row))
  console.log(`\nmode=${mode} sha=${sha ? sha.slice(0, 7) : 'null'} dirty=${dirty} → ${overallPass ? 'PASS' : 'BLOCK'}`)
  console.log(`summary: ${path.join(reportDirAbs, 'summary.json')}`)

  process.exit(overallPass ? 0 : 1)
}

// ── main ──────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv)
if (args.help) {
  printHelp()
  process.exit(0)
}
if (args.verify) verify(args)
else runGates(args)
