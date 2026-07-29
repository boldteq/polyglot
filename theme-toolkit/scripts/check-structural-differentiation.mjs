#!/usr/bin/env node
// Gate #54 structural-differentiation — the #1 AI-tell (duplication), enforced.
//
// WHY (design-taste doctrine, axis 1 — the single most important tell: "the check that most directly
// explains 'all gates green, still looks AI-built'"): a generated store reads as AI-built when the
// generator's fingerprint is more legible than the brand — i.e. it is a RECOLOUR of the base theme (same
// DOM/schema, only colours/spacing/values changed), or it serialises to the same structure as another
// client's store. Shopify's own Theme-Store requirement says it verbatim: "Cosmetic or additive alterations
// are insufficient … spacing tweaks, colour or typography swaps, gradients … or adding a few settings."
// Uniqueness must be ARCHITECTURAL, not cosmetic.
//
// TWO CHECKS (both static, offline; git only):
//  A · cosmetic-only-vs-base [E] — CALIBRATION-FREE. For each section MODIFIED base..HEAD, diff its
//    STRUCTURAL fingerprint (tag.sortedClasses token stream + {% schema %} type/id signature — NOT css
//    values/colours/defaults) at `git show base:<file>` vs HEAD. If EVERY modified section is ≥90%
//    structurally identical to base AND the build added ZERO genuinely-new custom sections, the build is a
//    recolour → flag. No human-theme corpus needed: the base IS the baseline.
//  B · cross-build near-dup [E] — registry-backed, WARN-only, absolute-threshold-free. Cosine the build's
//    overall structural fingerprint against a registry of PRIOR builds (FINGERPRINT_REGISTRY). >0.95 → warn
//    (two unrelated client stores serialising to the same DOM is the top machine-detectable AI/fraud signal).
//    Compares OUR builds to each other, so it needs no corpus; opt-in registry, never blocks.
//
// WARN by default; BLOCK check A at publish-grade (DS_REQUIRE_SCOPE=1). N/A-tolerant (no base tag / nothing
// modified → declares n-a, never a vacuous green — gate #45). A false BLOCK is as bad as a false pass.
// Usage: node check-structural-differentiation.mjs
// Env: BASE_REF (base) · REPORT_DIR · DS_REQUIRE_SCOPE=1 · FINGERPRINT_REGISTRY=<path> · STRUCT_NO_REGISTRY=1
//      · STRUCT_BUILD_NAME=<name> · COSMETIC_THRESHOLD (0.90) · CROSS_BUILD_THRESHOLD (0.95)
// Exit: 0 pass · 1 block (publish-grade + cosmetic-only) · 2 env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1'
const COSMETIC_THRESHOLD = Number(process.env.COSMETIC_THRESHOLD || 0.90)
const CROSS_BUILD_THRESHOLD = Number(process.env.CROSS_BUILD_THRESHOLD || 0.95)

const blockers = []
const warnings = []

// ── PURE helpers (exported for the fixture) ──────────────────────────────────
const LIQUID_OUT = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
const NON_DOM_BLOCK = /\{%-?\s*(stylesheet|javascript|schema)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/gi
const TAG_RE = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g
const CLASS_ATTR = /class\s*=\s*("([^"]*)"|'([^']*)')/i
const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i

// DOM structure of a section: each element → `tag.sortedClasses` (class NAMES are structure; their VALUES,
// colours, and inline styles are not). Liquid + non-DOM blocks stripped first.
export function tokenStream(src) {
  let s = String(src || '').replace(NON_DOM_BLOCK, ' ').replace(LIQUID_OUT, ' ')
  const out = []
  let m
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(s))) {
    const tag = m[1].toLowerCase()
    if (tag === 'br' || tag === 'hr') continue
    const cm = CLASS_ATTR.exec(m[2] || '')
    const cls = cm ? (cm[2] || cm[3] || '').split(/\s+/).filter(Boolean).sort().join('.') : ''
    out.push(cls ? `${tag}.${cls}` : tag)
  }
  return out
}

// {% schema %} SHAPE (setting/block TYPES + ids), never DEFAULTS — a recolour changes defaults, not types,
// so this is identical across a value-only edit.
export function schemaSignature(src) {
  const m = SCHEMA_RE.exec(String(src || ''))
  if (!m) return []
  let j
  try { j = JSON.parse(m[1]) } catch { return ['schema:unparseable'] }
  const sig = []
  for (const s of (j.settings || [])) if (s && s.type) sig.push(`set:${s.type}:${s.id || ''}`)
  for (const b of (j.blocks || [])) { if (b && b.type) { sig.push(`blk:${b.type}`); for (const s of (b.settings || [])) if (s && s.type) sig.push(`blkset:${b.type}:${s.type}`) } }
  for (const _ of (j.presets || [])) sig.push('preset')
  return sig
}

// the value-agnostic structural token bag for ONE file.
export function structuralTokens(src) { return [...tokenStream(src), ...schemaSignature(src)] }

export function freqVec(tokens) {
  const m = new Map()
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1)
  return m
}

// cosine similarity of two token-frequency vectors (Map or plain object). 0 when either is empty.
export function cosine(a, b) {
  const ma = a instanceof Map ? a : new Map(Object.entries(a || {}))
  const mb = b instanceof Map ? b : new Map(Object.entries(b || {}))
  let dot = 0; let na = 0; let nb = 0
  for (const v of ma.values()) na += v * v
  for (const v of mb.values()) nb += v * v
  for (const [k, v] of ma) { const w = mb.get(k); if (w) dot += v * w }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// two versions of a section differ ONLY cosmetically (values/colours/spacing) when their structural
// fingerprints are ≥ thresh identical.
export function isCosmeticOnly(baseSrc, headSrc, thresh = COSMETIC_THRESHOLD) {
  return cosine(freqVec(structuralTokens(baseSrc)), freqVec(structuralTokens(headSrc))) >= thresh
}

// a build's overall structural fingerprint (plain object, JSON-serialisable for the registry).
export function structuralFingerprint(srcList) {
  const all = []
  for (const s of srcList || []) all.push(...structuralTokens(s))
  return Object.fromEntries(freqVec(all))
}

// a section is a GENUINELY-new custom component (not an empty stub) when it renders real structure.
export function isNonTrivialSection(src) { return tokenStream(src).length >= 3 }

// ── git scope (like every static gate) ───────────────────────────────────────
function gitLines(args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map((s) => s.trim()).filter(Boolean) }
  catch { return null }
}
function baseResolves() {
  try { execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); return true } catch { return false }
}
function showAtBase(rel) {
  try { return execFileSync('git', ['show', `${BASE_REF}:${rel}`], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch { return null }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('structural-differentiation', 54, { cwd, pass, blockers, warnings, evidence: { baseRef: BASE_REF, strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`structural-differentiation: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── B · cross-build registry (best-effort, warn-only, never a side-effect on empty/test) ─────────────
function crossBuildCheck(buildSrcs) {
  if (process.env.STRUCT_NO_REGISTRY === '1') return
  const fp = structuralFingerprint(buildSrcs)
  if (Object.keys(fp).length < 5) return // too little structure to fingerprint meaningfully
  const regPath = process.env.FINGERPRINT_REGISTRY || path.join(os.homedir(), '.claude', 'memory', 'swt', 'build-fingerprints.json')
  const name = process.env.STRUCT_BUILD_NAME || path.basename(cwd)
  let reg = []
  try { reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')); if (!Array.isArray(reg)) reg = [] } catch { reg = [] }
  for (const prior of reg) {
    if (!prior || prior.name === name || !prior.fp) continue
    const c = cosine(fp, prior.fp)
    if (c > CROSS_BUILD_THRESHOLD) {
      warnings.push({ id: 'struct.cross-build-dup', page: '.', tier: 'E', detail: `this build's structure is ${(c * 100).toFixed(0)}% identical to a prior build "${prior.name}" — two unrelated client stores serialising to the same DOM/schema is the top machine-detectable AI/template-reuse signal (design-taste axis 1). Differentiate the architecture, not just the theme settings.`, evidence: prior.name })
    }
  }
  try {
    fs.mkdirSync(path.dirname(regPath), { recursive: true })
    const next = [...reg.filter((r) => r && r.name !== name), { name, fp }]
    fs.writeFileSync(regPath, JSON.stringify(next, null, 2) + '\n')
  } catch { /* registry is best-effort */ }
}

function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }
  if (!baseResolves()) {
    warnings.push({ id: 'structural-differentiation.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable — cannot diff this build against its base theme, so cosmetic-only detection was skipped. Tag the base commit \`base\` (see preflight-repo).`, evidence: BASE_REF })
    finish(null, { scope: 'unresolved' })
  }
  const modified = (gitLines(['diff', '--diff-filter=M', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections']) || []).filter((f) => f.endsWith('.liquid'))
  const added = (gitLines(['diff', '--diff-filter=A', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections']) || []).filter((f) => f.endsWith('.liquid'))
  if (modified.length === 0 && added.length === 0) {
    warnings.push({ id: 'structural-differentiation.n-a-no-sections', page: '.', detail: 'this build modified/added no sections vs base — nothing to differentiate (absence of signal, not a defect).', evidence: '' })
    finish(null, { scanned: 0, scope: 'build-diff' })
  }

  // A · cosmetic-only-vs-base
  const buildSrcs = []
  let cosmetic = 0; let structural = 0
  for (const rel of modified) {
    const baseSrc = showAtBase(rel)
    let headSrc = ''
    try { headSrc = fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { continue }
    buildSrcs.push(headSrc)
    if (baseSrc == null) { structural += 1; continue } // no base version → treat as new/structural
    if (isCosmeticOnly(baseSrc, headSrc)) cosmetic += 1
    else structural += 1
  }
  let newCustom = 0
  for (const rel of added) {
    let src = ''
    try { src = fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { continue }
    buildSrcs.push(src)
    if (isNonTrivialSection(src)) newCustom += 1
  }

  // The recolour smell: only value-tweaked base sections, and NOT ONE genuinely-new custom section.
  if (newCustom === 0 && structural === 0 && cosmetic > 0) {
    const detail = `this build changed ${cosmetic} base section(s) by VALUES only (same DOM/schema structure) and added 0 new custom sections — it is a recolour of the base theme. Shopify Theme-Store rule (verbatim): "cosmetic or additive alterations are insufficient … colour/typography swaps, gradients, or adding a few settings." Uniqueness must be architectural (design-taste axis 1: duplication). Custom-first bases (Dawn) especially expect ≥1 real new/rebuilt section; reuse-first bases (Minimog) still need architectural differentiation, not just settings.`
    if (STRICT) blockers.push({ id: 'struct.cosmetic-only', page: '.', tier: 'E', detail, evidence: `cosmetic:${cosmetic} newCustom:0` })
    else warnings.push({ id: 'struct.cosmetic-only', page: '.', tier: 'E', detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence: `cosmetic:${cosmetic}` })
  }

  // B · cross-build near-dup (warn-only, best-effort)
  crossBuildCheck(buildSrcs)

  finish(null, { modified: modified.length, added: added.length, cosmetic, structural, newCustom, scope: 'build-diff' })
}

if (isMain(import.meta.url)) {
  try { main() } catch (e) {
    writeReport('structural-differentiation', 54, { cwd, pass: false, blockers: [{ id: 'structural-differentiation.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: {}, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`structural-differentiation: CRASH — ${e.message}`)
    process.exit(2)
  }
}
