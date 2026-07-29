#!/usr/bin/env node
// SWT simplification Part A — the HONESTY GUARD for gate grouping.
//
// gate-groups.json presents the 49 live gates as 14 concern-groups. That is only a *simplification* (not a
// coverage cut) if the 14 groups losslessly cover every live gate: every manifest gate belongs to exactly
// one group, and no group names a gate that doesn't exist. This gate proves that invariant, so "14 gates"
// can never quietly become "we check less". It is the guardrail that makes the whole grouping refactor safe
// to stage — run it after every group migration.
//
// Usage: node check-group-coverage.mjs        (compares gate-groups.json against the LIVE theme-gates manifest)
// Env: REPORT_DIR (gate-reports) · GROUPS_FILE (../gate-groups.json)
// Exit: 0 = lossless coverage · 1 = drift (orphan/phantom/duplicate) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const GROUPS_FILE = process.env.GROUPS_FILE || path.resolve(HERE, '..', 'gate-groups.json')

// PURE — given the live manifest's member scripts and the groups, return the coverage drift.
//   orphans    = manifest scripts in NO group (a check that vanished from the grouped view — the dangerous one)
//   phantoms   = group members that are not in the manifest (a stale mapping)
//   duplicates = a script claimed by >1 group (ambiguous ownership)
// A member appearing once per group and matching the manifest 1:1 → all three empty → lossless.
export function coverageReport(manifestScripts, groups) {
  const manifest = new Set((manifestScripts || []).filter(Boolean))
  const seen = new Map() // script → [groupIds]
  for (const g of groups || []) {
    for (const m of g.members || []) {
      seen.set(m, [...(seen.get(m) || []), g.id])
    }
  }
  const memberSet = new Set(seen.keys())
  const orphans = [...manifest].filter((s) => !memberSet.has(s)).sort()
  const phantoms = [...memberSet].filter((s) => !manifest.has(s)).sort()
  const duplicates = [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([s, ids]) => ({ script: s, groups: ids })).sort((a, b) => a.script.localeCompare(b.script))
  return { orphans, phantoms, duplicates, ok: orphans.length === 0 && phantoms.length === 0 && duplicates.length === 0 }
}

// PURE — turn a coverageReport() result into the gate's blocker list. Exported + fixture-tested so the
// three blocker ids are proven to fire (audit-unproven-guards), not just asserted at the array level.
export function driftBlockers(r) {
  const blockers = []
  for (const s of (r?.orphans || [])) blockers.push({ id: 'groups.orphan-gate', page: s, detail: `gate "${s}" is in the live manifest but belongs to NO group — grouping would drop it from the simplified view (a silent coverage cut). Add it to a group in gate-groups.json.`, evidence: s })
  for (const s of (r?.phantoms || [])) blockers.push({ id: 'groups.phantom-member', page: s, detail: `gate-groups.json names "${s}" but it is not in the live manifest — stale mapping; remove or fix it.`, evidence: s })
  for (const d of (r?.duplicates || [])) blockers.push({ id: 'groups.duplicate-member', page: d.script, detail: `gate "${d.script}" is claimed by ${d.groups.length} groups (${d.groups.join(', ')}) — a gate belongs to exactly one group.`, evidence: d.groups.join(', ') })
  return blockers
}

function liveManifestScripts() {
  const out = execFileSync(process.execPath, [path.join(HERE, 'theme-gates.mjs'), '--list-json'], { cwd, encoding: 'utf-8' })
  return JSON.parse(out).map((g) => g.script).filter(Boolean)
}

function main() {
  let groups
  try { groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8')).groups } catch (e) { return finish(`cannot read ${path.basename(GROUPS_FILE)}: ${e.message}`) }
  if (!Array.isArray(groups)) return finish('gate-groups.json has no `groups` array')
  let scripts
  try { scripts = liveManifestScripts() } catch (e) { return finish(`cannot read the live manifest: ${e.message}`) }

  const r = coverageReport(scripts, groups)
  return finish(null, { groups: groups.length, gates: scripts.length, ...r }, driftBlockers(r))
}

function finish(envError, evidence = {}, blockers = []) {
  const pass = !envError && blockers.length === 0
  writeReport('group-coverage', 57, { cwd, pass, blockers, warnings: [], evidence: { reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`group-coverage: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${evidence.groups ?? '?'} groups cover ${evidence.gates ?? '?'} gates, ${blockers.length} drift`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

if (isMain(import.meta.url)) {
  try { main() } catch (e) { finish(`unexpected failure: ${e.message}`) }
}
