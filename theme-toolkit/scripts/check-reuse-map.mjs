#!/usr/bin/env node
// Boldteq section-reuse-map validator (stitch self-check + onyx Audit 7 runner).
//
// Executable version of onyx Audit 7/7-D's greps (onyx.md L164/179/180/182) +
// section-reuse-first-protocol.md §verification. stitch runs it before the
// design_to_liquid_conversion_request handoff; onyx runs it in Audit 7.
//
// Usage:
//   node check-reuse-map.mjs               validate section-reuse-map.md in cwd
//
// Env:
//   REUSE_MAP    default section-reuse-map.md
//   BASE_REF     git ref of the theme base (default tag "base") — cross-checks the
//                custom count against newly-added sections/*.liquid. Skipped (warn) if unresolvable.
//   REUSE_TARGET default 0.70 (reuse+configure share of mapped zones)
//   ALLOW_REUSE_WAIVER=1  downgrade the <70% block to a warning (CHANGES.md ## Waivers)
//   REPORT_DIR   default gate-reports
//
// BLOCKS on: map missing, malformed/absent Counts line, missing/invalid Custom split
//   (library+scratch must equal custom), Rung outside {REUSE,CONFIGURE,EXTEND,CUSTOM},
//   reuse share <target, custom count ≠ new section files on disk, scratch custom with
//   no `blueprint: none (...)` justification.
// WARNS on: merchant-editability.md absent when custom>0, base ref unresolvable (count cross-check skipped).
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_TARGET = Number.parseFloat(process.env.REUSE_TARGET || '0.70')
const ALLOW_WAIVER = process.env.ALLOW_REUSE_WAIVER === '1'

const VALID_RUNGS = new Set(['REUSE', 'CONFIGURE', 'EXTEND', 'CUSTOM'])
const blockers = []
const warnings = []
const add = (list, id, detail, evidence = '') => list.push({ id, page: REUSE_MAP, detail, evidence })

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('reuse-map', 11, {
    cwd, pass, blockers, warnings,
    evidence: { reuseMap: REUSE_MAP, baseRef: BASE_REF, reuseTarget: REUSE_TARGET, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`reuse-map: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const mapAbs = path.resolve(cwd, REUSE_MAP)
if (!fs.existsSync(mapAbs)) {
  // onyx: missing map = AUTO-REJECT (a block, not an env error)
  add(blockers, 'reuse-map.missing', `${REUSE_MAP} not found — onyx Audit 7 auto-rejects a build with no reuse map`)
  finish(null)
}
const text = fs.readFileSync(mapAbs, 'utf-8')

// ── Counts line (pinned regex, onyx L164) ───────────────────────────────────
const countsMatch = text.match(/^Counts:\s*\{reused:\s*(\d+),\s*configured:\s*(\d+),\s*extended:\s*(\d+),\s*custom:\s*(\d+)\}/m)
let reused = 0, configured = 0, extended = 0, custom = 0
if (!countsMatch) {
  add(blockers, 'reuse-map.counts-missing', 'no well-formed `Counts: {reused: N, configured: N, extended: N, custom: N}` line')
} else {
  ;[, reused, configured, extended, custom] = countsMatch.map((v, i) => (i === 0 ? v : Number.parseInt(v, 10)))
}

// ── Custom split (pinned regex, onyx L179) — mandatory when custom>0 ─────────
const splitMatch = text.match(/^Custom split:\s*\{library:\s*(\d+),\s*scratch:\s*(\d+)\}/m)
let library = 0, scratch = 0
if (custom > 0) {
  if (!splitMatch) {
    add(blockers, 'reuse-map.custom-split-missing', `custom=${custom} but no \`Custom split: {library: N, scratch: N}\` line`)
  } else {
    library = Number.parseInt(splitMatch[1], 10)
    scratch = Number.parseInt(splitMatch[2], 10)
    if (library + scratch !== custom) {
      add(blockers, 'reuse-map.custom-split-mismatch', `library(${library}) + scratch(${scratch}) ≠ custom(${custom})`)
    }
  }
}

// ── Rung column vocabulary ──────────────────────────────────────────────────
const lines = text.split('\n')
let inTable = false
let rungIdx = -1
for (const line of lines) {
  if (!line.trim().startsWith('|')) { inTable = false; continue }
  const cells = line.split('|').slice(1, -1).map(c => c.trim())
  const lower = cells.map(c => c.toLowerCase())
  if (!inTable && lower.includes('rung')) { inTable = true; rungIdx = lower.indexOf('rung'); continue }
  if (!inTable) continue
  if (/^[-:\s|]+$/.test(line.replace(/\|/g, ''))) continue
  const rung = (cells[rungIdx] || '').toUpperCase().replace(/\s+/g, '')
  if (rung && rung !== 'RUNG' && !VALID_RUNGS.has(rung)) {
    add(blockers, 'reuse-map.bad-rung', `row rung "${cells[rungIdx]}" not in {REUSE, CONFIGURE, EXTEND, CUSTOM} (LIBRARY rows are written CUSTOM)`)
  }
}

// ── ≥70% reuse share ────────────────────────────────────────────────────────
const total = reused + configured + extended + custom
if (countsMatch && total > 0) {
  const share = (reused + configured) / total
  if (share < REUSE_TARGET) {
    const pct = (share * 100).toFixed(0)
    const tgt = (REUSE_TARGET * 100).toFixed(0)
    if (ALLOW_WAIVER) add(warnings, 'reuse-map.reuse-below-target-waived', `reuse+configure ${pct}% < ${tgt}% (waived via ## Waivers)`)
    else add(blockers, 'reuse-map.reuse-below-target', `reuse+configure ${pct}% < target ${tgt}% — needs a Yash-approved CHANGES.md ## Waivers entry`)
  }
}

// ── scratch custom needs `blueprint: none (...)` justification ───────────────
if (scratch > 0) {
  const blueprintNone = (text.match(/blueprint:\s*none\s*\(/gi) || []).length
  if (blueprintNone < scratch) {
    add(blockers, 'reuse-map.scratch-no-justification', `scratch=${scratch} but only ${blueprintNone} \`blueprint: none (checked: ..., gap: ...)\` justification block(s)`)
  }
}

// ── custom count vs newly-added sections/*.liquid on disk ────────────────────
let newSections = null
try {
  execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  const out = execFileSync('git', ['diff', '--diff-filter=A', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections/'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
  newSections = out.split('\n').filter(l => l.endsWith('.liquid'))
} catch {
  newSections = null
}
if (countsMatch) {
  if (newSections === null) {
    add(warnings, 'reuse-map.base-ref-unresolved', `base ref "${BASE_REF}" unresolvable (or not committed yet) — custom-count vs disk cross-check skipped`)
  } else if (newSections.length !== custom) {
    add(blockers, 'reuse-map.custom-count-mismatch', `Counts custom=${custom} but ${newSections.length} new section file(s) added since ${BASE_REF}: ${newSections.map(s => path.basename(s)).join(', ') || '(none)'}`)
  }
}

// ── merchant-editability.md when custom>0 (onyx blocks; here warn for stitch self-check) ──
if (custom > 0 && !fs.existsSync(path.resolve(cwd, 'merchant-editability.md'))) {
  add(warnings, 'reuse-map.no-editability-matrix', 'custom>0 but no merchant-editability.md at repo root — onyx Audit 7-D will BLOCK on this')
}

finish(null)
