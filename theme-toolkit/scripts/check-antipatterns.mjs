#!/usr/bin/env node
// Boldteq anti-pattern gate (#11) — the executable subset of the Anti-Pattern Library.
// Catches dead-code / bloat anti-patterns NOT owned by another gate (DGS/consistency/
// SEO/asset gates own the rest). Spec: shopify-anti-pattern-library.md §5.
//
// BLOCKS on:  unused asset (build-added asset referenced by zero liquid),
//             unreferenced section (build-added section in zero JSON templates),
//             duplicate asset (two build-added assets byte-identical).
// WARNS on:   mixed aspect-ratios (>3 distinct aspect-ratio values in custom CSS).
//
// Usage: node check-antipatterns.mjs
// Env:   BASE_REF (default base) · REUSE_MAP (default section-reuse-map.md) ·
//        DS_REQUIRE_SCOPE=1 (publish: unresolved scope = block) · REPORT_DIR · ALLOW_AP_WAIVER=1
// Exit:  0 pass · 1 block · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const ALLOW_WAIVER = process.env.ALLOW_AP_WAIVER === '1'

const blockers = []
const warnings = []
const add = (l, id, page, detail, evidence = '') => l.push({ id, page, detail, evidence })
const block = (id, page, detail, evidence) => ALLOW_WAIVER ? add(warnings, `${id}.waived`, page, `${detail} (waived)`, evidence) : add(blockers, id, page, detail, evidence)

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('antipatterns', 11, { cwd, pass, blockers, warnings, evidence: { baseRef: BASE_REF, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`antipatterns: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── scope: build-ADDED files since base (added-only — these are the build's new code) ──
function gitAdded() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    return execFileSync('git', ['diff', '--diff-filter=A', '--name-only', `${BASE_REF}..HEAD`, '--', 'assets', 'sections'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return null }
}
function reuseMapAddedSections() {
  const p = path.resolve(cwd, REUSE_MAP)
  if (!fs.existsSync(p)) return null
  const names = []
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (!cells.some(c => /^(EXTEND|CUSTOM)$/i.test(c))) continue
    for (const c of cells) { const m = c.match(/([a-z0-9][a-z0-9_-]+)/i); if (m && !/^(EXTEND|CUSTOM|REUSE|CONFIGURE|LIBRARY)$/i.test(m[1]) && fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) names.push(`sections/${m[1]}.liquid`) }
  }
  if (names.length === 0) return null
  const files = new Set(names)
  for (const n of names) for (const ext of ['.css', '.css.liquid', '.js']) { const a = `assets/${path.basename(n, '.liquid')}${ext}`; if (fs.existsSync(path.resolve(cwd, a))) files.add(a) }
  return [...files]
}

let added = gitAdded()
let scopeSrc = 'git'
if (added === null) { added = reuseMapAddedSections(); scopeSrc = 'reuse-map' }
if (added === null) {
  if (REQUIRE_SCOPE) { add(blockers, 'ap.scope-unresolved-strict', '.', `scope unresolvable + DS_REQUIRE_SCOPE=1 — tag the theme base "base"`) }
  else warnings.push({ id: 'ap.scope-unresolved', page: '.', detail: `scope unresolvable — anti-pattern scan skipped (set BASE_REF)`, evidence: '' })
  finish(null)
}
const addedAssets = added.filter(f => /^assets\/.+\.(css|js)(\.liquid)?$/.test(f))
const addedSections = added.filter(f => /^sections\/.+\.liquid$/.test(f))

// ── corpus: all liquid (for asset refs) + all json (for section type refs) ──
function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
const liquidFiles = ['sections', 'snippets', 'templates', 'layout', 'blocks'].flatMap(d => walk(d, ['.liquid']))
const jsonFiles = [...walk('templates', ['.json']), ...walk('sections', ['.json']), ...walk('config', ['.json'])]
const liquidText = liquidFiles.map(f => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }).join('\n')
const jsonText = jsonFiles.map(f => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }).join('\n')

// ── 1. unused assets ──
for (const a of addedAssets) {
  const filename = path.basename(a).replace(/\.liquid$/, '') // my-section.css.liquid → my-section.css (compiled name)
  const referenced = liquidText.includes(filename) || jsonText.includes(filename)
  if (!referenced) block('ap.unused-asset', a, `asset "${filename}" is referenced by zero liquid/json files — theme bloat (dead asset)`, a)
}

// ── 2. unreferenced sections ──
for (const s of addedSections) {
  const name = path.basename(s, '.liquid')
  const used = new RegExp(`"type"\\s*:\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(jsonText)
  if (!used) block('ap.unreferenced-section', s, `section "${name}" is used in zero JSON templates — dead code (no template renders it)`, s)
}

// ── 3. duplicate assets (byte-identical among build-added) ──
const hashes = new Map()
for (const a of addedAssets) {
  try {
    const h = crypto.createHash('sha1').update(fs.readFileSync(path.resolve(cwd, a))).digest('hex')
    if (hashes.has(h)) block('ap.duplicate-asset', a, `byte-identical to ${hashes.get(h)} — copy-paste bloat; reuse one`, `${a} == ${hashes.get(h)}`)
    else hashes.set(h, a)
  } catch { /* unreadable — skip */ }
}

// ── 4. mixed aspect-ratios (warn) ──
const ratios = new Set()
for (const s of addedSections) {
  try {
    const raw = fs.readFileSync(path.resolve(cwd, s), 'utf-8')
    for (const m of raw.matchAll(/aspect-ratio\s*:\s*([0-9./\s]+)/g)) ratios.add(m[1].trim().replace(/\s+/g, ''))
  } catch { /* skip */ }
}
if (ratios.size > 3) add(warnings, 'ap.mixed-ratios', 'custom sections', `${ratios.size} distinct aspect-ratio values across custom sections (${[...ratios].join(', ')}) — keep image ratios consistent`, '')

finish(null)
