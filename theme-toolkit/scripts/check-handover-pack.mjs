#!/usr/bin/env node
// Gate #56 handover-pack — the client Handover Pack must be complete before publish.
//
// WHY (client-handover-pack.md §0): at Step 16 (UAT) atrium delivers a 6-artifact Handover Pack under
// `docs/handover/` in the theme repo, and mantle "refuses publish" if it's incomplete. Until now that
// refusal was PROSE + a manual CHANGES.md checkbox — no code verified the six files exist or have
// substance (grep `handover` in this toolkit = 0). A pack silently missing `support.md` (the SLA) would
// still publish. This gate closes that: it reads the canonical artifact list from `lib/handover-pack-spec.json`
// (spec-as-data — the filenames are NOT hardcoded here) and checks the pack on disk.
//
// CHECK (static, offline): for each artifact the spec names, verify the file exists under the pack dir,
// is non-thin (>= minBytes), and carries no leftover TBD/TODO/`{{…}}` placeholder (a WARN — support.md
// legitimately carries commercial `{{…}}` until Yash fills them, so placeholders never hard-block).
//
// N/A-tolerant / block at publish-grade: when the pack dir is ABSENT (dev/QA runs before Step 16) →
// declare n-a (pass, so gate #45 vacuous-pass stays green). At publish-grade (DS_REQUIRE_SCOPE=1) a
// missing or thin artifact → BLOCK. A false BLOCK on a build that isn't at handover yet is as bad as a
// false pass, hence the N/A gate.
// Usage: node check-handover-pack.mjs   Env: REPORT_DIR · DS_REQUIRE_SCOPE=1 · HANDOVER_SPEC (override path)
// Exit: 0 pass · 1 block (publish-grade + missing/thin artifact) · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1'
const SPEC_PATH = process.env.HANDOVER_SPEC || path.join(HERE, 'lib', 'handover-pack-spec.json')

const blockers = []
const warnings = []

// ── PURE helpers (exported for the fixture) ──────────────────────────────────
const PLACEHOLDER_RE = /\{\{[^}]*\}\}|\bTBD\b|\bTODO\b|<[^>]*placeholder[^>]*>/i

// Assess one artifact's file content. Pure — the gate does the IO, this judges the bytes.
// → { ok, thin, placeholder } (ok=false means missing; caller passes null for a missing file).
export function assessArtifact(content, minBytes = 200) {
  if (content == null) return { ok: false, thin: false, placeholder: false }
  const bytes = Buffer.byteLength(content, 'utf-8')
  return { ok: true, thin: bytes < minBytes, placeholder: PLACEHOLDER_RE.test(content) }
}

export function loadSpec(specPath = SPEC_PATH) {
  const j = JSON.parse(fs.readFileSync(specPath, 'utf-8'))
  if (!j || !Array.isArray(j.artifacts) || !j.dir) throw new Error('handover-pack spec malformed (need { dir, artifacts[] })')
  return { dir: String(j.dir), minBytes: Number(j.minBytes) || 200, artifacts: j.artifacts }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('handover-pack', 56, { cwd, pass, blockers, warnings, evidence: { strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`handover-pack: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }
  let spec
  try { spec = loadSpec() } catch (e) { finish(`handover-pack spec unreadable (${SPEC_PATH}): ${e.message}`) }

  const packDir = path.resolve(cwd, spec.dir)
  if (!fs.existsSync(packDir)) {
    // Pre-Step-16: the pack isn't assembled yet. Absence of signal, not a defect (skip != vacuous-pass).
    warnings.push({ id: 'handover.n-a-not-assembled', page: spec.dir, detail: `no \`${spec.dir}/\` yet — the Handover Pack is assembled at Step 16 (UAT); nothing to check before then. At publish-grade this becomes a BLOCK.`, evidence: '' })
    // At publish-grade an entirely-missing pack IS the defect — you cannot publish without a handover pack.
    if (STRICT) blockers.push({ id: 'handover.pack-missing', page: spec.dir, detail: `publish-grade run but no \`${spec.dir}/\` — the 6-artifact client Handover Pack (client-handover-pack.md) must exist before publish. atrium assembles it at Step 16.`, evidence: '' })
    finish(null, { scanned: 0, dir: spec.dir, scope: STRICT ? 'publish-grade' : 'dev' })
  }

  let present = 0
  for (const art of spec.artifacts) {
    const rel = `${spec.dir}/${art.file}`
    let content = null
    try { content = fs.readFileSync(path.join(packDir, art.file), 'utf-8') } catch { content = null }
    const a = assessArtifact(content, spec.minBytes)
    if (!a.ok) {
      const detail = `Handover Pack artifact "${art.title}" (\`${rel}\`, owner ${art.owner}) is missing — the client can't be handed a store without it (client-handover-pack.md §0).`
      if (STRICT) blockers.push({ id: 'handover.artifact-missing', page: rel, detail, evidence: art.owner })
      else warnings.push({ id: 'handover.artifact-missing', page: rel, detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence: art.owner })
      continue
    }
    present += 1
    if (a.thin) {
      const detail = `Handover Pack artifact "${art.title}" (\`${rel}\`) is only a stub (< ${spec.minBytes} bytes) — a placeholder file, not a real deliverable.`
      if (STRICT) blockers.push({ id: 'handover.artifact-thin', page: rel, detail, evidence: `< ${spec.minBytes}B` })
      else warnings.push({ id: 'handover.artifact-thin', page: rel, detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence: `< ${spec.minBytes}B` })
    }
    if (a.placeholder) {
      // Never a hard block: support.md legitimately carries commercial `{{…}}` until Yash fills them.
      warnings.push({ id: 'handover.artifact-placeholder', page: rel, detail: `"${art.title}" (\`${rel}\`) still contains a TBD/TODO/\`{{…}}\` placeholder — fill it before delivery${art.allowsPlaceholders ? ' (commercial SLA terms are Yash\'s to complete)' : ''}.`, evidence: '' })
    }
  }
  finish(null, { present, required: spec.artifacts.length, dir: spec.dir, scope: STRICT ? 'publish-grade' : 'dev' })
}

if (isMain(import.meta.url)) {
  try { main() } catch (e) {
    writeReport('handover-pack', 56, { cwd, pass: false, blockers: [{ id: 'handover-pack.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: {}, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`handover-pack: CRASH — ${e.message}`)
    process.exit(2)
  }
}
