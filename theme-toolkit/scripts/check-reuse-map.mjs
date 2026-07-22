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
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const ALLOW_WAIVER = process.env.ALLOW_REUSE_WAIVER === '1'

// THE REUSE FLOOR IS THEME-BASE-CONDITIONAL — it is not a universal rule.
// `section-reuse-first-protocol.md` §Targets (Yash, 2026-06-18) states it outright:
//   "Minimog = reuse-first → ≥70% REUSE+CONFIGURE. Dawn = custom-first → 70–80% CUSTOM expected
//    (the ≥70%-reuse row is MINIMOG-ONLY; on Dawn it does not apply)"
// and its table says the enforcement "gate flips by `theme_base`". This gate never implemented that
// flip, so it applied the Minimog quota to every base. A correct Dawn build (custom-first by
// doctrine) therefore scores ~20–30% reuse and trips `reuse-map.reuse-below-target` — i.e. the gate
// would BLOCK the very builds the doctrine asks for the moment REUSE_MAP_ENFORCE=1. A false BLOCK is
// as damaging as a false pass, and this one also explains why the artifact is never authored: an
// honest Dawn map guarantees a failure needing a Yash waiver.
// Dawn imposes no reuse quota; the ladder still governs CODE QUALITY on both bases
// (anti-overengineering budgets) — "custom-first" means bespoke + quality, never overcoded.
export function readThemeBase(dir = cwd, dsPath = DS) {
  try {
    const j = JSON.parse(fs.readFileSync(path.resolve(dir, dsPath), 'utf-8'))
    const b = String(j.theme_base || '').trim().toLowerCase()
    return b || null
  } catch { return null }
}
// Returns the reuse+configure floor, or null when the base imposes none.
export function reuseFloorFor(themeBase, envOverride = process.env.REUSE_TARGET) {
  if (envOverride != null && envOverride !== '') {
    const n = Number.parseFloat(envOverride)
    if (Number.isFinite(n)) return n // explicit operator override always wins, on any base
  }
  if (themeBase === 'dawn') return null // custom-first: no reuse quota (protocol §Targets)
  return 0.70 // Minimog, and the safe default when the base is unknown/unrecorded
}
const THEME_BASE = readThemeBase()
const REUSE_TARGET = reuseFloorFor(THEME_BASE)
// Phase A default = warn-only (surface findings, never block); REUSE_MAP_ENFORCE=1 = Phase B BLOCK.
// Doctrine: register a new manifest gate warn-only, prove on ≥2 stores, then flip to block.
const ENFORCE = process.env.REUSE_MAP_ENFORCE === '1'

const VALID_RUNGS = new Set(['REUSE', 'CONFIGURE', 'EXTEND', 'CUSTOM'])
// #6 — the valid blueprint ids a LIBRARY-rung custom section may cite. null if the index is unreadable.
function loadBlueprintIndex() {
  try {
    const j = JSON.parse(fs.readFileSync(new URL('../lib/blueprint-index.json', import.meta.url), 'utf-8'))
    return new Set((j.blueprints || []).map(s => String(s).toLowerCase()))
  } catch { return null }
}
const blockers = []
const warnings = []
const add = (list, id, detail, evidence = '') => list.push({ id, page: REUSE_MAP, detail, evidence })

// New sections/*.liquid added since BASE_REF — drives BOTH the applicability skip (no new
// sections → the reuse ladder has nothing to govern) AND the custom-count cross-check.
// Returns [] (resolvable, none), [..] (the added files), or null (base ref unresolvable).
function newSectionsSinceBase() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=A', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections/'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').filter(l => l.endsWith('.liquid'))
  } catch { return null }
}

function finish(envError) {
  // Phase A (warn-only): downgrade every blocker to a warning so the gate surfaces findings
  // but never blocks a build until it's proven on ≥2 stores (REUSE_MAP_ENFORCE=1 flips to block).
  if (!ENFORCE && blockers.length) {
    warnings.push(...blockers)
    warnings.push({ id: 'reuse-map.warn-only', page: REUSE_MAP, detail: 'Phase A warn-only — set REUSE_MAP_ENFORCE=1 to BLOCK on the above', evidence: '' })
    blockers.length = 0
  }
  const pass = !envError && blockers.length === 0
  writeReport('section-reuse', 23, {
    cwd, pass, blockers, warnings,
    evidence: {
      reuseMap: REUSE_MAP, baseRef: BASE_REF, themeBase: THEME_BASE,
      reuseTarget: REUSE_TARGET, reuseFloorApplies: REUSE_TARGET != null,
      reason: envError || undefined,
    },
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
  // APPLICABILITY: a build that added NO custom sections has nothing for the reuse ladder to
  // govern → SKIP (never a false-BLOCK on refreshes / micro-changes / legacy repos). Only a
  // build that ADDED sections but shipped no map is a real onyx-Audit-7 miss.
  const ns = newSectionsSinceBase()
  if (ns === null) {
    add(warnings, 'reuse-map.n-a-base-unresolved', `no ${REUSE_MAP} + base ref "${BASE_REF}" unresolvable — can't prove sections were added; not applicable, skipping`)
    finish(null)
  } else if (ns.length === 0) {
    add(warnings, 'reuse-map.n-a-no-new-sections', `no ${REUSE_MAP} + 0 new sections/*.liquid since ${BASE_REF} — not applicable (no custom section work), skipping`)
    finish(null)
  } else {
    add(blockers, 'reuse-map.missing', `${REUSE_MAP} not found but ${ns.length} new section(s) added since ${BASE_REF} — onyx Audit 7 auto-rejects a build that adds custom sections with no reuse map`)
    finish(null)
  }
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
  const pct = (share * 100).toFixed(0)
  if (REUSE_TARGET == null) {
    // Dawn (custom-first): report the ratio, never gate on it. Still visible in the report so a
    // genuinely over-reused Dawn build is readable by a human — just not a machine BLOCK.
    add(warnings, 'reuse-map.reuse-share-informational', `reuse+configure ${pct}% · custom ${((custom / total) * 100).toFixed(0)}% — theme_base "${THEME_BASE}" is custom-first, so no reuse floor applies (section-reuse-first-protocol.md §Targets). Set REUSE_TARGET to override.`)
  } else if (share < REUSE_TARGET) {
    const tgt = (REUSE_TARGET * 100).toFixed(0)
    const baseNote = THEME_BASE ? `theme_base "${THEME_BASE}"` : `theme_base unrecorded in ${DS} — defaulting to the reuse-first floor`
    if (ALLOW_WAIVER) add(warnings, 'reuse-map.reuse-below-target-waived', `reuse+configure ${pct}% < ${tgt}% (${baseNote}) (waived via ## Waivers)`)
    else add(blockers, 'reuse-map.reuse-below-target', `reuse+configure ${pct}% < target ${tgt}% (${baseNote}) — needs a Yash-approved CHANGES.md ## Waivers entry`)
  }
}

// ── scratch custom needs `blueprint: none (...)` justification ───────────────
if (scratch > 0) {
  const blueprintNone = (text.match(/blueprint:\s*none\s*\(/gi) || []).length
  if (blueprintNone < scratch) {
    add(blockers, 'reuse-map.scratch-no-justification', `scratch=${scratch} but only ${blueprintNone} \`blueprint: none (checked: ..., gap: ...)\` justification block(s)`)
  }
}

// ── #6: LIBRARY custom must CITE a real blueprint (the other half of the ladder discipline) ──
// scratch cites `blueprint: none (...)`; library must cite the actual blueprint id it's built from
// (`blueprint: <id>@vN`). Without this, a "library" custom is indistinguishable from un-justified
// scratch — the reuse claim is unprovable. Cited ids are linted against lib/blueprint-index.json (warn
// only — the index can lag a newly-authored blueprint; Sprint 3 #20 grows it; #22 does the schema match).
if (library > 0) {
  const cited = [...text.matchAll(/blueprint:\s*([a-z0-9][a-z0-9-]+)(?:@v?\d+)?/gi)].map(m => m[1].toLowerCase()).filter(n => n !== 'none')
  if (cited.length < library) {
    add(blockers, 'reuse-map.library-no-blueprint', `library=${library} but only ${cited.length} \`blueprint: <id>@vN\` citation(s) — each LIBRARY-rung section must cite the blueprint it's built from (not "none", which is for scratch).`)
  }
  const known = loadBlueprintIndex()
  if (known) for (const id of cited) if (!known.has(id)) add(warnings, 'reuse-map.unknown-blueprint', `cited blueprint "${id}" is not in lib/blueprint-index.json — typo, or author it into custom-section-blueprint-library.md + the index first.`)
}

// ── #22: each blueprint citation must attach to a REAL section (the cited section file exists on disk) ──
// catches a citation drifting off its section (renamed/removed) — the ref-vs-build consistency the reuse
// map claims. Deterministic + warn-only (a deeper blueprint↔schema match is the opt-in LLM check). Lines
// look like `<section-name>: blueprint: <id>[@vN] (...)`.
for (const m of text.matchAll(/^([a-z0-9][a-z0-9_-]+):\s*blueprint:\s*([a-z0-9-]+)/gim)) {
  const section = m[1]
  const id = m[2].toLowerCase()
  if (id === 'none') continue
  if (!fs.existsSync(path.resolve(cwd, 'sections', `${section}.liquid`))) {
    add(warnings, 'reuse-map.blueprint-section-missing', `citation "${section}: blueprint: ${id}" names section "${section}" but sections/${section}.liquid does not exist — the blueprint ref drifted off its section (renamed/removed?).`)
  }
}

// ── custom count vs newly-added sections/*.liquid on disk ────────────────────
const newSections = newSectionsSinceBase()
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
