// Gate report writer — single source of the report schema for every theme gate.
//
// Exact schema (every gate, every run):
//   {
//     "gate": "<name>", "gateNumber": <n>, "toolkitVersion": "1.0.0",
//     "ts": "<iso>", "sha": "<git HEAD|null>", "dirty": <bool>, "url": "<string|null>",
//     "pass": <bool>,
//     "blockers": [{ "id", "page", "detail", "evidence" }],
//     "warnings": [same shape],
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

function normalizeFindings(list) {
  if (!Array.isArray(list)) return []
  return list.map(f => ({
    id: String(f.id ?? 'unknown'),
    page: String(f.page ?? ''),
    detail: String(f.detail ?? ''),
    evidence: String(f.evidence ?? ''),
  }))
}

// writeReport('editability', 3, { pass, blockers, warnings, evidence, url, duration_ms, cwd }, reportDir)
// → { file, report }
export function writeReport(gateName, gateNumber, data = {}, reportDir = process.env.REPORT_DIR || 'gate-reports') {
  const cwd = data.cwd ?? process.cwd()
  const { sha, dirty } = data.git ?? gitInfo(cwd)
  const report = {
    gate: gateName,
    gateNumber,
    toolkitVersion: toolkitVersion(),
    ts: new Date().toISOString(),
    sha,
    dirty,
    url: data.url ?? null,
    pass: data.pass === true,
    blockers: normalizeFindings(data.blockers),
    warnings: normalizeFindings(data.warnings),
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
