// Helper for MERGED gates: run the absorbed gate scripts (which already work + writeReport their own
// report) into a temp dir, then aggregate their blockers/warnings into the merged gate's findings.
// Reuses the proven, tested check logic without refactoring each absorbed script's exports/guards.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readJson } from './report.mjs'

const SCRIPTS = path.dirname(path.dirname(fileURLToPath(import.meta.url))) // .../scripts

// parts: [{ script: 'check-x.mjs', report: 'x' }] — `report` is the absorbed script's writeReport name.
// Returns { blockers, warnings, skipped, sources } with each finding tagged by its source gate.
export function runAbsorbed(parts, { cwd = process.cwd(), env = process.env } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-merge-'))
  const out = { blockers: [], warnings: [], skipped: [], sources: {} }
  for (const p of parts) {
    const scriptPath = path.join(SCRIPTS, p.script)
    if (!fs.existsSync(scriptPath)) { out.skipped.push(`${p.report}: script missing`); continue }
    const r = spawnSync('node', [scriptPath], { cwd, env: { ...env, REPORT_DIR: tmp }, encoding: 'utf8', timeout: 180000 })
    let rep = null
    try { rep = readJson(path.join(tmp, `${p.report}.json`)) } catch { rep = null }
    if (!rep) { out.skipped.push(`${p.report}: no report (exit ${r.status})`); out.sources[p.report] = 'skipped'; continue }
    // absorbed scripts already namespace their finding ids (drb.*, rt.*, art-direction.*, img.*…) — keep as-is.
    for (const b of rep.blockers || []) out.blockers.push(b)
    for (const w of rep.warnings || []) out.warnings.push(w)
    out.sources[p.report] = rep.pass ? 'pass' : 'block'
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* best effort */ }
  return out
}
