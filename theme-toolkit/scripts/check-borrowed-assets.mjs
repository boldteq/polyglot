#!/usr/bin/env node
// Gate #55 borrowed-assets — AI-tell axis 4 (borrowed assets), static slice.
//
// WHY (design-taste doctrine, axis 4): a generated store reads as AI-built when its imagery is BORROWED —
// stock photography or placeholder-service images standing in for the merchant's real brand. NN/g names
// stock photography the #1 trust-negative among factors that hurt credibility. Gate #24 (media) checks a
// hero's weight/format/resolution but NOT its provenance, so a hardcoded stock/placeholder URL sails
// through. This closes that hole for the part that is statically visible in the theme repo.
//
// CHECK (pure, static, offline): scan the build's OWN added/modified liquid/CSS/JS/JSON (base..HEAD) for
// image URLs pointing at a known stock CDN or placeholder service. A hardcoded stock URL is UNAMBIGUOUSLY
// borrowed — low false-positive: a merchant-settings image (`{{ …settings.image | image_url }}`), a local
// `asset_url`, Shopify's own `placeholder_svg_tag`, or `cdn.shopify.com` (the merchant's uploads) never
// match. This gate NEVER touches merchant-uploaded imagery — that render/store slice belongs to Lens/porter.
//
// Placeholder services → BLOCK always (a dev leftover, zero legit reason to ship — like #36 dev-leftovers).
// Stock CDNs → warn-first / BLOCK at publish-grade (DS_REQUIRE_SCOPE=1) — a real borrowed photo, replace it
// with the merchant's own. N/A-tolerant (no base tag / no media files → declares n-a, never a vacuous green).
// Usage: node check-borrowed-assets.mjs   Env: BASE_REF (base) · REPORT_DIR · DS_REQUIRE_SCOPE=1 · BORROWED_SCAN_ALL=1
// Exit: 0 pass · 1 block (placeholder always; stock at publish-grade) · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1'
const SCAN_ALL = process.env.BORROWED_SCAN_ALL === '1'
const SCAN_DIRS = ['sections', 'snippets', 'blocks', 'layout', 'assets', 'templates', 'config']

const blockers = []
const warnings = []

// ── PURE helpers (exported for the fixture) ──────────────────────────────────
// Placeholder image SERVICES — always a dev leftover.
export const PLACEHOLDER_HOSTS = ['placehold.co', 'via.placeholder.com', 'placeholder.com', 'picsum.photos', 'loremflickr.com', 'dummyimage.com', 'placekitten.com', 'placeimg.com']
// Stock-photo CDNs — a borrowed real photo, not the merchant's brand (burst = Shopify's OWN free stock; NOT
// cdn.shopify.com, which is where the merchant's own uploads live and must never be flagged).
export const STOCK_HOSTS = ['images.unsplash.com', 'unsplash.com', 'images.pexels.com', 'pexels.com', 'shutterstock.com', 'gettyimages.com', 'istockphoto.com', 'burst.shopifycdn.com']

// most-specific first so the alternation prefers e.g. images.unsplash.com over unsplash.com
const ALL_HOSTS = [...PLACEHOLDER_HOSTS, ...STOCK_HOSTS].sort((a, b) => b.length - a.length)
const HOST_ALT = ALL_HOSTS.map((h) => h.replace(/[.]/g, '\\.')).join('|')
// only match inside a URL (absolute or protocol-relative) — never bare prose mentioning a host.
const URL_HOST_RE = new RegExp(`(?:https?:)?//[^\\s"'()<>\\\\]*?(${HOST_ALT})[^\\s"'()<>\\\\]*`, 'gi')

export function imageHostHits(text) {
  const hits = []
  const seen = new Set()
  let m
  URL_HOST_RE.lastIndex = 0
  while ((m = URL_HOST_RE.exec(String(text || '')))) {
    const url = m[0].slice(0, 140)
    if (seen.has(url)) continue
    seen.add(url)
    const host = m[1].toLowerCase()
    hits.push({ host, kind: PLACEHOLDER_HOSTS.includes(host) ? 'placeholder' : 'stock', match: url })
  }
  return hits
}

// ── git scope (same pattern as #52/#54) ──────────────────────────────────────
const isScanFile = (f) =>
  (f.endsWith('.liquid') && /^(sections|snippets|blocks|layout)\//.test(f)) ||
  ((f.endsWith('.css') || f.endsWith('.js')) && f.startsWith('assets/')) ||
  (f.endsWith('.json') && /^(templates|config)\//.test(f))

const walk = (dir, acc = []) => {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, acc)
    else acc.push(rel)
  }
  return acc
}
function scopedFiles() {
  if (SCAN_ALL) return { files: SCAN_DIRS.flatMap((d) => walk(d)).filter(isScanFile), scoped: false }
  try { execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { return { files: null, scoped: false, reason: `base ref "${BASE_REF}" unresolvable` } }
  try {
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: out.split('\n').map((s) => s.trim()).filter(isScanFile), scoped: true }
  } catch (e) { return { files: null, scoped: false, reason: `git diff failed: ${e.message}` } }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('borrowed-assets', 55, { cwd, pass, blockers, warnings, evidence: { baseRef: BASE_REF, strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`borrowed-assets: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }
  const { files, scoped, reason } = scopedFiles()
  if (files === null) {
    warnings.push({ id: 'borrowed-assets.scope-unresolved', page: '.', detail: `${reason} — cannot tell this build's files from the vendored theme's, so borrowed-asset detection was skipped. Tag the base commit \`base\`.`, evidence: BASE_REF })
    finish(null, { scanned: 0, scope: 'unresolved' })
  }
  if (files.length === 0) {
    warnings.push({ id: 'borrowed-assets.n-a-no-media', page: '.', detail: 'this build added/modified no liquid/css/js/json that could carry an image URL — nothing to check (absence of signal, not a defect).', evidence: '' })
    finish(null, { scanned: 0, scope: scoped ? 'build-diff' : 'all' })
  }

  let scanned = 0
  for (const rel of files) {
    let raw
    try { raw = fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { continue }
    scanned += 1
    for (const hit of imageHostHits(raw)) {
      if (hit.kind === 'placeholder') {
        blockers.push({ id: 'borrowed.placeholder-image', page: rel, tier: 'E', detail: `placeholder-service image \`${hit.match}\` shipped in the build — a dev leftover that must never reach a shopper. Replace with the merchant's real imagery (upload via Files / a section image setting).`, evidence: hit.host })
      } else {
        const detail = `stock-photo URL \`${hit.match}\` hardcoded in the theme — borrowed imagery, not the merchant's brand (design-taste axis 4; NN/g: stock photography is the #1 trust-negative). Replace with the merchant's own photography, or wire an image setting so they supply it.`
        if (STRICT) blockers.push({ id: 'borrowed.stock-image', page: rel, tier: 'E', detail, evidence: hit.host })
        else warnings.push({ id: 'borrowed.stock-image', page: rel, tier: 'E', detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence: hit.host })
      }
    }
  }
  finish(null, { scanned, files: files.length, scope: scoped ? 'build-diff' : 'all', hits: blockers.length + warnings.filter((w) => w.id === 'borrowed.stock-image').length })
}

if (isMain(import.meta.url)) {
  try { main() } catch (e) {
    writeReport('borrowed-assets', 55, { cwd, pass: false, blockers: [{ id: 'borrowed-assets.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: {}, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`borrowed-assets: CRASH — ${e.message}`)
    process.exit(2)
  }
}
