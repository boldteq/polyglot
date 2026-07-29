// Gate report writer — single source of the report schema for every theme gate.
//
// Exact schema (every gate, every run):
//   {
//     "gate": "<name>", "gateNumber": <n>, "toolkitVersion": "1.0.0",
//     "ts": "<iso>", "sha": "<git HEAD|null>", "dirty": <bool>, "url": "<string|null>",
//     "pass": <bool>,
//     "blockers": [{ "id", "page", "detail", "evidence", "severity", "tier"? }],
//     "warnings": [same shape],   // "tier" (E|P|H) present only when the gate declares it
//     "evidence": { ...gate-specific compact },
//     "duration_ms": <n>
//   }
//
// No external deps. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export function toolkitVersion() {
  try {
    return fs.readFileSync(path.join(HERE, '..', '..', 'TOOLKIT_VERSION'), 'utf-8').trim()
  } catch (err) {
    console.error(`[report] TOOLKIT_VERSION unreadable: ${err.message}`)
    return '0.0.0'
  }
}

function git(args, cwd) {
  return gitRaw(args, cwd).trim()
}

function gitRaw(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function matchesPrefix(p, prefixes) {
  return prefixes.some(pre => p === pre || p.startsWith(pre.endsWith('/') ? pre : `${pre}/`))
}

// sha + dirty of the repo under audit. Outside a git repo → { sha: null, dirty: false }.
// `ignore` = path prefixes excluded from the dirty computation (report artifacts etc.).
export function gitInfo(cwd = process.cwd(), ignore = []) {
  try {
    const sha = git(['rev-parse', 'HEAD'], cwd)
    // NOTE: porcelain must NOT be trimmed — the first line's leading status space
    // (e.g. " M path") is significant for the `XY path` slice below.
    const porcelain = gitRaw(['status', '--porcelain'], cwd)
    const dirtyEntries = porcelain
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const p = line.slice(3).replace(/^"|"$/g, '')
        const arrow = p.indexOf(' -> ') // rename entries: "R  old -> new" — judge by destination
        return arrow === -1 ? p : p.slice(arrow + 4)
      })
      .filter(p => !matchesPrefix(p, ignore))
    return { sha, dirty: dirtyEntries.length > 0 }
  } catch {
    return { sha: null, dirty: false }
  }
}

// #1 — finding severity tier: 'block' (publish-stopping) · 'warn' (advisory) · 'advise' (soft/FYI).
// ADDITIVE + backward-compatible by construction: severity is DERIVED from which array a finding sits
// in — blockers are forced to 'block', warnings default to 'warn'. So nothing that blocks today stops
// blocking; the tier only adds resolution. A gate opts a warning DOWN to 'advise' by setting
// `severity:'advise'` on the finding (a warning can't opt UP to 'block' — that's what blockers[] is
// for). The FP-trend dashboard (#2) + governance routing (#39/#40/#50) read severityCounts.
const SEVERITIES = new Set(['block', 'warn', 'advise'])
// Evidence tier of the RULE that produced a finding — E (study-backed / platform-binding) · P
// (practitioner consensus) · H (house taste). Orthogonal to severity: severity is how hard the finding
// enforces, tier is how strong the evidence is. Preserved here (the schema's single source) so
// check-gate-integrity (#45) can hold the evidence-tier→enforcement-cap (see lib/evidence-tier.mjs).
const TIERS = new Set(['E', 'P', 'H'])

function normalizeFindings(list, defaultSeverity, forced = false) {
  if (!Array.isArray(list)) return []
  const allowed = forced
    ? new Set([defaultSeverity])
    : (defaultSeverity === 'warn' ? new Set(['warn', 'advise']) : SEVERITIES)
  return list.map(f => {
    const out = {
      id: String(f.id ?? 'unknown'),
      page: String(f.page ?? ''),
      detail: String(f.detail ?? ''),
      evidence: String(f.evidence ?? ''),
      severity: allowed.has(f.severity) ? f.severity : defaultSeverity,
    }
    // Carry `tier` only when a gate declares a valid one (opt-in; untagged findings stay exempt from the cap).
    const tier = String(f.tier ?? '').toUpperCase()
    if (TIERS.has(tier)) out.tier = tier
    return out
  })
}

// Roll findings up into {block, warn, advise} counts. Pure — used in the per-gate report AND the
// orchestrator summary rollup. A finding with no/unknown severity counts as 'warn' (the safe default).
export function countSeverities(findings) {
  const c = { block: 0, warn: 0, advise: 0 }
  for (const f of findings || []) c[SEVERITIES.has(f?.severity) ? f.severity : 'warn'] += 1
  return c
}

// #3 — per-gate freshness TTL. URL gates reflect a live render and go stale by WALL-CLOCK even at the
// same git SHA (a lighthouse/axe score from days ago is not publish evidence). PURE: given a
// {gateName → ttlMs} map and the per-gate reports [{gate, ts}], return the gates whose report age
// exceeds their TTL. Gates with no TTL (static, deterministic from the tree) are never time-stale.
export function staleReportsByTtl(ttlByGate, reports, nowMs) {
  const stale = []
  for (const r of reports || []) {
    const ttl = ttlByGate?.[r.gate]
    if (!Number.isFinite(ttl) || ttl <= 0) continue
    const t = Date.parse(r.ts)
    if (!Number.isFinite(t)) continue
    const ageMs = nowMs - t
    if (ageMs > ttl) stale.push({ gate: r.gate, ageMs, ttlMs: ttl })
  }
  return stale
}

// writeReport('editability', 3, { pass, blockers, warnings, evidence, url, duration_ms, cwd }, reportDir)
// → { file, report }
export function writeReport(gateName, gateNumber, data = {}, reportDir = process.env.REPORT_DIR || 'gate-reports') {
  const cwd = data.cwd ?? process.cwd()
  const { sha, dirty } = data.git ?? gitInfo(cwd)
  const blockers = normalizeFindings(data.blockers, 'block', true)
  const warnings = normalizeFindings(data.warnings, 'warn')
  const report = {
    gate: gateName,
    gateNumber,
    toolkitVersion: toolkitVersion(),
    ts: new Date().toISOString(),
    sha,
    dirty,
    url: data.url ?? null,
    pass: data.pass === true,
    blockers,
    warnings,
    severityCounts: countSeverities([...blockers, ...warnings]),
    evidence: data.evidence ?? {},
    duration_ms: Number.isFinite(data.duration_ms) ? Math.max(0, Math.round(data.duration_ms)) : 0,
  }
  const dir = path.resolve(cwd, reportDir)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${gateName}.json`)
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  return { file, report }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}
