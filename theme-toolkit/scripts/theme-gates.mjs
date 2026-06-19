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
//   GATES_SEQUENTIAL=1         run gates one-at-a-time (default = up to 8 in parallel)
//
//   node theme-gates.mjs --list   print the live gate manifest (ground audits in THIS, not memory)
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
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { readJson, toolkitVersion, gitInfo } from './lib/report.mjs'

// Promisified gate spawn — buffers output, enforces a timeout. (P0 #14: parallel gate execution.)
function runGateProc(runner, gateArgs, opts) {
  return new Promise((resolve) => {
    const child = spawn(runner, gateArgs, { cwd: opts.cwd, env: opts.env })
    let stdout = ''; let stderr = ''
    child.stdout?.on('data', d => { stdout += d })
    child.stderr?.on('data', d => { stderr += d })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } resolve({ code: 2, stdout, stderr, error: new Error('gate timed out') }) }, opts.timeout || 600_000)
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 2, stdout, stderr, error: err }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 2, stdout, stderr, error: null }) })
  })
}

// Bounded-concurrency pool — runs fn over items, at most `limit` at once.
async function pool(items, limit, fn) {
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  })
  await Promise.all(workers)
}

// Human-readable SUMMARY.md — humans read the .md, systems read the .json. Every failure is
// actionable in plain English (audit P3 + the autonomous-build human touchpoints).
function writeSummaryMd(dir, selected, results, summary) {
  const L = ['# Theme Gates — Summary', '']
  L.push(`**${summary.pass ? '✅ PASS' : '❌ BLOCK'}** · mode=${summary.mode} · ${selected.length} gate(s) · toolkit ${summary.toolkitVersion} · sha ${summary.sha ? summary.sha.slice(0, 7) : 'null'}${summary.dirty ? ' · dirty' : ''}`, '')
  const cls = (g) => { const r = results[g.name]; return r.waived || r.skipped ? 'skip' : r.pass ? 'pass' : 'block' }
  const blocked = selected.filter(g => cls(g) === 'block')
  const skipped = selected.filter(g => cls(g) === 'skip')
  const passed = selected.filter(g => cls(g) === 'pass')
  if (blocked.length) {
    L.push(`## ❌ Blocked (${blocked.length}) — fix before publish`, '')
    for (const g of blocked) {
      L.push(`### #${g.number} ${g.name} — ${results[g.name].blockers.length} blocker(s)`)
      for (const b of results[g.name].blockers) L.push(`- **${b.id}**${b.page ? ` \`${b.page}\`` : ''} — ${b.detail}`)
      L.push('')
    }
  }
  const warned = selected.filter(g => cls(g) !== 'skip' && (results[g.name].warnings || []).length)
  if (warned.length) {
    L.push('## ⚠️ Warnings (advisory)', '')
    for (const g of warned) {
      const w = results[g.name].warnings
      L.push(`### #${g.number} ${g.name} — ${w.length} warning(s)`)
      for (const x of w.slice(0, 6)) L.push(`- ${x.id}${x.page ? ` \`${x.page}\`` : ''} — ${x.detail}`)
      if (w.length > 6) L.push(`- …and ${w.length - 6} more (see ${g.name}.json)`)
      L.push('')
    }
  }
  if (skipped.length) { L.push(`## ⏭️ Skipped / waived (${skipped.length})`, ''); for (const g of skipped) L.push(`- #${g.number} ${g.name} — ${results[g.name].reason || 'skipped'}`); L.push('') }
  if (passed.length) L.push(`## ✅ Passed (${passed.length})`, '', passed.map(g => `#${g.number} ${g.name}`).join(' · '), '')
  fs.writeFileSync(path.join(dir, 'SUMMARY.md'), `${L.join('\n')}\n`)
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const FRESHNESS_ALLOWLIST = ['gate-reports', 'CHANGES.md', 'merchant-editability.md', 'docs']

const GATES = [
  // Gate 0 — theme lock: every push targets the linked theme only, never live/another store
  // (static; lenient on a missing lock — THEME_LOCK_REQUIRED=1 makes absence a blocker at publish).
  { name: 'theme-lock', number: 0, kind: 'static', runner: 'node', script: 'shopify-theme-guard.mjs' },
  { name: 'lighthouse', number: 1, kind: 'url', runner: 'node', script: 'gate-lighthouse.mjs' },
  { name: 'theme-check', number: 2, kind: 'static', runner: 'node', script: 'gate-theme-check.mjs' },
  { name: 'editability', number: 3, kind: 'static', runner: 'bash', script: 'gate-editability-greps.sh' },
  { name: 'axe', number: 5, kind: 'url', runner: 'node', script: 'gate-axe.mjs' },
  { name: 'seo', number: 6, kind: 'url', runner: 'node', script: 'gate-seo.mjs' },
  { name: 'conversion', number: 7, kind: 'url', runner: 'node', script: 'gate-conversion.mjs' },
  // DGS — design cohesion (static; run in full + --static-only + covered by --verify/--require-full).
  { name: 'design-system', number: 8, kind: 'static', runner: 'node', script: 'check-design-system.mjs' },
  { name: 'consistency', number: 9, kind: 'static', runner: 'node', script: 'check-consistency.mjs' },
  // Verification Layer 3 — functional/interaction smoke (drives real flows, url-kind).
  { name: 'functional', number: 10, kind: 'url', runner: 'node', script: 'gate-functional.mjs' },
  // Prevention — dead-code/bloat anti-patterns (static; the rest of the library is gates above + the review board).
  { name: 'antipatterns', number: 11, kind: 'static', runner: 'node', script: 'check-antipatterns.mjs' },
  // Design QUALITY — per-niche taste fingerprint vs the DNA pack (static; calibration-gated so
  // an untuned pack warns rather than blocks). Covered by --static-only + --verify/--require-full.
  { name: 'design-quality', number: 12, kind: 'static', runner: 'node', script: 'check-design-quality.mjs' },
  // Honesty — fake-urgency / fabricated-scarcity / unsourced-claim killer (static; blocks
  // evergreen countdowns + hardcoded scarcity, warns on fake-activity/unsourced stats).
  { name: 'honesty', number: 13, kind: 'static', runner: 'node', script: 'check-honesty.mjs' },
  // Render-wiring — tokens must RENDER, not just conform on paper (static; closes the #8/#12 blind
  // spot where color schemes + fonts are declared but never wired → flat black-on-white default).
  { name: 'render-wiring', number: 14, kind: 'static', runner: 'node', script: 'check-render-wiring.mjs' },
  // Commerce-readiness — the PDP must be able to TRANSACT, not just render (static; catches an
  // editorial-only product template with no form/price/variant — a store that sells nothing).
  { name: 'commerce-readiness', number: 15, kind: 'static', runner: 'node', script: 'check-commerce-readiness.mjs' },
  // Static a11y — the high-frequency a11y/mobile defects axe (#5, url-kind) can't catch pre-deploy
  // (advisory WARN; A11Y_STRICT=1 promotes to block). Complements, doesn't replace, the runtime axe gate.
  { name: 'a11y-static', number: 16, kind: 'static', runner: 'node', script: 'check-a11y-static.mjs' },
  // Visual-quality — "gates-green ≠ looks-good" (static VERIFIER of onyx's agentic visual review).
  // Warns if the review artifact is absent in dev; BLOCKS at publish-grade (DS_REQUIRE_SCOPE) when
  // missing/unapproved/<min-confidence/any-fail. The judgment is onyx's; this enforces it mechanically.
  { name: 'visual-quality', number: 17, kind: 'static', runner: 'node', script: 'check-visual-quality.mjs' },
  // Visual-truth (Lens · Layer 3) — the static ENFORCER of the Lens pass (lens-capture.mjs renders
  // every surface; vision subagents judge each frame against its rubric). This gate aggregates
  // gate-reports/lens/{lens-manifest,judge/*}.json → BLOCKS on render-error / overflow / broken image
  // / judge FAIL / low-confidence / blocker finding / systemic cross-frame defect. Warns if the Lens
  // pass is absent in dev; BLOCKS at publish-grade (DS_REQUIRE_SCOPE/LENS_REQUIRE). This is the
  // pixels-actually-looked-right signal #17 (self-attestation) cannot give. mantle blocks publish on it.
  { name: 'visual-truth', number: 18, kind: 'static', runner: 'node', script: 'check-visual-truth.mjs' },
  // Section-cohesion (#19, URL) — the render-time "do the sections feel like ONE page?" enforcer.
  // #8 locks the token SET + #9 counts store-wide variety, but neither sees a rendered page: section A
  // can ship h2=32 and section B h2=28 and both pass. This pulls COMPUTED styles per section on the
  // staging URL and BLOCKs cross-section drift (off-ladder type, off-scale padding, multi-H1) against
  // design-system.json. Content-only (chrome excluded). mantle gates publish.
  { name: 'section-cohesion', number: 19, kind: 'url', runner: 'node', script: 'check-section-cohesion.mjs' },
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
  // evidence coherence: EVERY per-gate report in the dir must share the summary's sha.
  // Catches the piecemeal pattern — gates run one-by-one (check-*.mjs) at drifting SHAs produce
  // a report dir that no single tree ever generated, so summary.json alone (which is internally
  // consistent) can't see the incoherence. Stride dogfood 2026-06-19: 7 reports across 3 SHAs.
  const reportDirAbs = path.resolve(cwd, args.reportDir)
  const incoherent = []
  try {
    for (const f of fs.readdirSync(reportDirAbs)) {
      if (!f.endsWith('.json') || f === 'summary.json') continue
      let rep
      try { rep = readJson(path.join(reportDirAbs, f)) } catch { continue }
      if (rep && typeof rep.sha === 'string' && rep.sha !== summary.sha) incoherent.push(`${f}@${rep.sha.slice(0, 7)}`)
    }
  } catch { /* dir scan is best-effort; absence of reports is handled by per-gate verify */ }
  if (incoherent.length > 0) {
    console.error(`verify: INCOHERENT — ${incoherent.length} gate-report(s) at a sha ≠ summary ${summary.sha.slice(0, 7)} (piecemeal/mixed-SHA run): ${incoherent.slice(0, 8).join(', ')}`)
    console.error('  re-run the full orchestrator (`pnpm gates`) so all evidence is produced together at one sha')
    process.exit(1)
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
    // defense-in-depth: a waived gate is only acceptable under --require-full with a CHANGES.md ## Waivers entry
    const unjustified = Object.entries(summary.gates || {})
      .filter(([name, g]) => g.waived && !changesWaives(cwd, name))
      .map(([name]) => name)
    if (unjustified.length > 0) {
      console.error(`verify: FAIL — --require-full but gate(s) waived without a CHANGES.md ## Waivers entry: ${unjustified.join(', ')}`)
      process.exit(1)
    }
  }
  console.log(`verify: FRESH — summary @ ${summary.sha.slice(0, 7)} (mode=${summary.mode}, pass=${summary.pass}, ts=${summary.ts})`)
  process.exit(0)
}

// A SKIP_<GATE>=1 waiver only counts as a legitimate pass on an authoritative
// (full) run if CHANGES.md `## Waivers` names the gate — otherwise the orchestrator
// must treat the waiver as a FAIL (audit fix: a waived gate cannot silently pass --require-full).
function changesWaives(cwd, gateName) {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    if (!m) return false
    const section = m[1].split(/\n##\s/)[0] // the Waivers section only — up to the next ## heading
    return new RegExp(`\\b${gateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(section)
  } catch {
    return false
  }
}

// ── run mode ──────────────────────────────────────────────────────────────
function indent(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map(l => `    │ ${l}`)
    .join('\n')
}

async function runGates(args) {
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
  const toSpawn = [] // gates needing a subprocess (after synchronous skip/waive pre-checks)

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
    toSpawn.push({ gate, scriptPath, reportPath })
  }

  // Shared child env (identical semantics to the old per-gate env).
  const baseEnv = { ...process.env, REPORT_DIR: args.reportDir }
  if (url) baseEnv.THEME_PREVIEW_URL = url
  // Authoritative (full) run = publish-grade: static scope-aware gates BLOCK on an unresolvable
  // scan scope (no green-on-nothing) + the conversion gate runs strict.
  if (mode === 'full' && !baseEnv.DS_REQUIRE_SCOPE) baseEnv.DS_REQUIRE_SCOPE = '1'
  if (mode === 'full' && !baseEnv.STRICT_CONVERSION) baseEnv.STRICT_CONVERSION = '1'
  if (!baseEnv.THEME_STORE_PASSWORD && process.env.STOREFRONT_PASSWORD) baseEnv.THEME_STORE_PASSWORD = process.env.STOREFRONT_PASSWORD

  // P0 #14 fix: run the gates with bounded concurrency — wall-clock = the SLOWEST gate, not the
  // SUM. Gates are independent processes writing separate reports, so this is safe. SEQUENTIAL=1
  // forces the old serial behavior. Verbose per-gate output is buffered + printed in selected order.
  const cap = process.env.GATES_SEQUENTIAL === '1' ? 1 : Math.max(1, Math.min(8, os.cpus?.().length || 4))
  const logs = {}
  if (toSpawn.length) console.log(`  running ${toSpawn.length} gate(s) — up to ${cap} in parallel...`)
  await pool(toSpawn, cap, async ({ gate, scriptPath, reportPath }) => {
    const child = await runGateProc(gate.runner, [scriptPath], { cwd, env: baseEnv, timeout: 600_000 })
    let report = null
    try { report = readJson(reportPath) } catch { report = null }
    const code = child.error ? 2 : (child.code ?? 2)
    if (code === 0 || code === 1) {
      results[gate.name] = { pass: code === 0, blockers: report?.blockers ?? [], warnings: report?.warnings ?? [], skipped: false, reason: null, waived: false, exitCode: code }
      console.log(`  gate ${gate.name} ... ${code === 0 ? 'PASS' : 'BLOCK'}`)
    } else {
      const reason = report?.evidence?.reason ?? (child.error ? child.error.message : null) ?? String(child.stderr || '').split('\n').find(Boolean) ?? `gate exited ${code}`
      results[gate.name] = { pass: false, blockers: report?.blockers ?? [], warnings: report?.warnings ?? [], skipped: true, reason, waived: false, exitCode: code }
      console.log(`  gate ${gate.name} ... SKIP-ENV (exit ${code})`)
    }
    logs[gate.name] = indent(`${child.stdout || ''}${child.stderr || ''}`)
  })
  for (const gate of selected) { if (logs[gate.name]) console.log(logs[gate.name]) }

  // pass = all executed gates pass; a SKIP_<GATE>=1 waiver only passes on a FULL run if
  // CHANGES.md `## Waivers` justifies it (audit fix); a dev (static-only/subset) run still
  // honors bare waivers. A non-waived skip (exit 2 / no URL / missing script) always fails.
  const overallPass = Object.entries(results).every(([name, r]) =>
    r.waived
      ? (mode === 'full' ? changesWaives(cwd, name) : true)
      : r.skipped ? false : r.pass,
  )

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
        { pass: r.pass, blockers: r.blockers, warnings: r.warnings, skipped: r.skipped, waived: r.waived, reason: r.reason },
      ]),
    ),
    pass: overallPass,
  }
  fs.writeFileSync(path.join(reportDirAbs, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeSummaryMd(reportDirAbs, selected, results, summary) // human-readable companion (gate-reports/SUMMARY.md)

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
// --list prints the live gate manifest (number · name · kind · script). Ground any gap-audit
// in THIS, not from memory — agent audits go stale fast (atrium's 2026-06-19 audit claimed gates
// missing that already shipped). One command = the current source of truth.
if (process.argv.includes('--list')) {
  console.log(`Boldteq theme gate stack — ${GATES.length} gates (toolkit ${toolkitVersion()})`)
  for (const g of GATES) console.log(`  #${String(g.number).padStart(2)} ${g.name.padEnd(20)} ${g.kind.padEnd(7)} ${g.script}`)
  console.log(`
Audit commands (the gates scan the CURRENT directory — run from the theme repo you're auditing):
  cd theme-toolkit            # the pnpm aliases live here
  pnpm theme:audit            # complete STATIC sweep → gate-reports/SUMMARY.md (human-readable)
  pnpm theme:audit:full       # + URL gates (lighthouse/axe/seo/conversion/functional) — needs THEME_PREVIEW_URL
  pnpm gates:list             # this manifest
  pnpm store:preflight        # live-store access + content-quality preflight (needs SHOPIFY_ADMIN_API_TOKEN)
  pnpm gates:verify           # check a PRIOR full run is fresh+passing (publish gate — does NOT run the gates)
In a client theme repo (toolkit vendored as toolkit/): run \`node toolkit/scripts/theme-gates.mjs --static-only\` from the repo root.`)
  process.exit(0)
}
const args = parseArgs(process.argv)
if (args.help) {
  printHelp()
  process.exit(0)
}
if (args.verify) verify(args)
else await runGates(args)
