#!/usr/bin/env node
// Lens — Copy Truth Layer (P8 copy quality). The LLM judge for COPY, analogous to lens-judge.mjs
// for vision. Reads shipped copy per surface (hero / pdp / cart / checkout / subscription) + the
// brand voice reference + the niche pack's voice_traits, then dispatches an INDEPENDENT claude -p
// subagent per surface to score three dimensions on a 0–100 scale:
//
//   specificity      — does the copy make concrete claims backed by numbers / ingredients / proof?
//   benefit_clarity  — does the copy name the CUSTOMER'S OUTCOME (not the product's feature)?
//   voice_fit        — does the copy match the declared brand voice traits?
//
// MECHANISM: HEADLESS `claude -p` per surface (the Claude Code CLI — subscription tier, NO API key),
// mirroring lens-judge.mjs's judgeOne pattern: spawn(CLAUDE_BIN, ['-p', prompt, '--model', JUDGE_MODEL,
// '--no-session-persistence', '--allowedTools', 'Read,Write']). Per-surface timeout via setTimeout+kill
// (COPY_JUDGE_TIMEOUT_MS, default 6 * 60_000 ms) since claude -p has no built-in per-call cap.
//
// INDEPENDENCE GUARANTEE (same doctrine as lens-judge line 13): the judge prompt contains ONLY the
// shipped copy strings, the voice reference, the niche voice_traits, brand name + niche label. It is
// given ZERO design-spec, build code, prior copy review, or ink briefs — so it cannot inherit the
// author's blind spots or rubber-stamp.
//
// VERDICT AGGREGATION:
//   per-surface pass = specificity ≥ 70 AND benefit_clarity ≥ 70 AND voice_fit ≥ 70
//   overall pass     = every surface with copy passes
//   BLOCK on any dimension < 70 when COPY_JUDGE_ENFORCE=1 or DS_REQUIRE_SCOPE=1 (Phase B / gated
//   scope); otherwise WARN (Phase A rollout, same warn-first doctrine as check-copy-scorecard.mjs's
//   brief-level checks — the pre-2026-08-25 check-copy-quality.mjs was folded into that gate).
//
// Env: REPORT_DIR (gate-reports) · CLAUDE_BIN (claude) · COPY_JUDGE_MODEL (claude-sonnet-4-6, pinned) ·
//      COPY_JUDGE_TIMEOUT_MS (360000) · LENS_COPY_JUDGE_TIMEOUT_MS (alias) · COPY_JUDGE_ENFORCE=1 ·
//      DS_REQUIRE_SCOPE=1 (→ ENFORCE) · COPY_JUDGE_CONCURRENCY (2) · LENS_NICHE · LENS_BRAND ·
//      BUILD_STATE_DIR (docs) · VOICE_FILE (content/voice.md) · BRAND_FILE (docs/design/brand-direction.md) ·
//      NICHE_PACKS_DIR (~/.claude/memory/design/ecom/niche-dna-packs) · DESIGN_SPEC (docs/design/design-spec.md — for niche fallback only) ·
//      COPY_SURFACES (hero,pdp,cart,checkout,subscription) · COPY_JUDGE_MAX_CHARS (12000 per surface, truncate long dumps)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── env / config ────────────────────────────────────────────────────────────────
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const JUDGE_DIR = path.join(LENS_DIR, 'copy-judge')
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
// PINNED (2026-07-24) — dated model id, not the floating `sonnet` alias, so verdicts are
// reproducible. Override with COPY_JUDGE_MODEL to bump the judge. `claude-sonnet-4-6` is a
// CLI-confirmed full name, same default as lens-judge.mjs.
const MODEL = process.env.COPY_JUDGE_MODEL || 'claude-sonnet-4-6'
const TIMEOUT_MS = Number(process.env.COPY_JUDGE_TIMEOUT_MS || process.env.LENS_COPY_JUDGE_TIMEOUT_MS || 6 * 60_000)
const CONCURRENCY = Math.max(1, Number(process.env.COPY_JUDGE_CONCURRENCY || 2))
const ENFORCE = process.env.COPY_JUDGE_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const VOICE_FILE = process.env.VOICE_FILE || 'content/voice.md'
const BRAND_FILE = process.env.BRAND_FILE || 'docs/design/brand-direction.md'
const NICHE_PACKS_DIR = process.env.NICHE_PACKS_DIR || path.join(os.homedir(), '.claude', 'memory', 'design', 'ecom', 'niche-dna-packs')
const BUILD_STATE_PATH = path.resolve(cwd, process.env.BUILD_STATE_DIR || 'docs', 'build-state.json')
const SPEC_PATH = process.env.DESIGN_SPEC || 'docs/design/design-spec.md'
const MAX_CHARS = Math.max(1000, Number(process.env.COPY_JUDGE_MAX_CHARS || 12000))
const DEFAULT_SURFACES = ['hero', 'pdp', 'cart', 'checkout', 'subscription']

const die = (code, msg) => { console.error(`lens-copy-judge: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }

// ── CLI ─────────────────────────────────────────────────────────────────────────
function args() {
  const out = { surfaces: null, concurrency: CONCURRENCY }
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--help' || a[i] === '-h') {
      console.log('node lens-copy-judge.mjs [--surfaces hero,pdp,cart,checkout,subscription] [--concurrency N]')
      process.exit(0)
    } else if (a[i] === '--surfaces') out.surfaces = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a[i] === '--concurrency') out.concurrency = Math.max(1, Number(a[++i]))
  }
  return out
}

// ── niche + brand resolution (mirror lens-judge.mjs) ────────────────────────────
const readJsonSafe = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null } }
const readTextSafe = (p) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } }
const specField = (re) => { const t = readTextSafe(path.resolve(cwd, SPEC_PATH)); const m = t.match(re); return m ? m[1].trim() : null }

export function pickNiche({ lensNiche, buildStateNiche, specNiche, buildStateNicheEnv } = {}) {
  if (lensNiche) return { niche: String(lensNiche), src: 'LENS_NICHE env' }
  if (buildStateNiche) return { niche: String(buildStateNiche), src: 'docs/build-state.json' }
  if (specNiche) return { niche: String(specNiche), src: 'design-spec (dna_pack)' }
  if (buildStateNicheEnv) return { niche: String(buildStateNicheEnv), src: 'BUILD_STATE_NICHE env' }
  return { niche: 'general ecommerce', src: 'DEFAULT (niche-blind — no LENS_NICHE, build-state, or dna_pack)' }
}
function resolveNiche() {
  return pickNiche({
    lensNiche: process.env.LENS_NICHE,
    buildStateNiche: readJsonSafe(BUILD_STATE_PATH)?.niche,
    specNiche: specField(/^\s*(?:dna_pack|niche):\s*["'`]?([A-Za-z0-9 _-]+?)["'`]?\s*$/im),
    buildStateNicheEnv: process.env.BUILD_STATE_NICHE,
  })
}
function resolveBrand() {
  if (process.env.LENS_BRAND) return process.env.LENS_BRAND
  const bs = readJsonSafe(BUILD_STATE_PATH)
  if (bs && (bs.client || bs.brand)) return String(bs.client || bs.brand)
  const sb = specField(/^\s*(?:brand|client|store):\s*["'`]?([A-Za-z0-9 ._&'-]+?)["'`]?\s*$/im)
  return sb || 'this brand'
}

// ── voice reference resolution ──────────────────────────────────────────────────
// Prefer content/voice.md; else the "## Voice" section of docs/design/brand-direction.md.
// Returns { text, source } — the judge is given the raw voice text; the whole point is that the
// judge reads it and holds copy to it, so we don't try to structure it here.
export function extractVoiceSection(brandMd) {
  const src = String(brandMd || '')
  // grab the "## Voice" (or "# Voice") section body up to the next same-or-higher heading
  const m = src.match(/^\s*(#{1,6})\s*voice\b[^\n]*\n([\s\S]*?)(?=^\s*#{1,6}\s|\Z)/im)
  if (!m) return ''
  return m[2].trim()
}
function loadVoice() {
  const vp = path.resolve(cwd, VOICE_FILE)
  if (fs.existsSync(vp)) {
    const text = readTextSafe(vp).trim()
    if (text) return { text, source: VOICE_FILE }
  }
  const bp = path.resolve(cwd, BRAND_FILE)
  if (fs.existsSync(bp)) {
    const section = extractVoiceSection(readTextSafe(bp))
    if (section) return { text: section, source: `${BRAND_FILE}#voice` }
  }
  return { text: '', source: null }
}

// ── niche pack voice_traits ─────────────────────────────────────────────────────
// Optional per-niche voice hints (may or may not exist per pack). Path convention lives under
// ~/.claude/memory/design/ecom/niche-dna-packs/<niche>.json — matches memory index. We normalise the
// niche label to a filename by lowercasing + hyphenating spaces/underscores; try a few candidates.
function nicheFilenameCandidates(niche) {
  const norm = String(niche || '').toLowerCase().trim()
  const dashed = norm.replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
  const underscored = norm.replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
  const seen = new Set()
  return [dashed, underscored, norm].filter(Boolean).filter(s => { if (seen.has(s)) return false; seen.add(s); return true })
}
export function loadNichePackVoiceTraits(niche, dir) {
  for (const name of nicheFilenameCandidates(niche)) {
    const p = path.join(dir, `${name}.json`)
    const j = readJsonSafe(p)
    if (!j) continue
    const traits = j.voice_traits ?? j.voice ?? j.voiceTraits ?? null
    if (traits) return { traits, source: p }
  }
  return { traits: null, source: null }
}

// ── shipped-copy extraction per surface ─────────────────────────────────────────
// Liquid themes hold shipped copy in three places:
//   1. sections/*.liquid              — settings text (schema defaults + author-authored)
//   2. templates/*.json               — per-page section blocks with "settings":{ ... } text values
//   3. templates/*.liquid + snippets/ — inline hard-coded strings ({{ 'Foo' | t }})
// We collect FILE→TEXT for the surface, then string-extract user-visible copy: JSON string values,
// Liquid single/double-quoted strings, and prose in <h*>/<p>/<button>/<a> tags. Then we cap at
// MAX_CHARS to keep the judge prompt bounded (long themes overflow the CLI).
const SURFACE_PATTERNS = {
  hero: [/hero/i, /banner/i, /slideshow/i, /image-with-text/i],
  pdp: [/main-product/i, /product-(form|info|template)/i, /^product\./i, /pdp/i, /product-recommendations/i],
  cart: [/main-cart/i, /^cart\b/i, /cart-drawer/i, /cart-notification/i, /mini-cart/i],
  checkout: [/checkout/i, /order-summary/i, /shipping/i],
  subscription: [/subscri/i, /selling-plan/i, /rechrg?e/i, /appstle/i, /bold-subscript/i],
}
const SURFACE_TEMPLATE_HINTS = {
  hero: ['index'],
  pdp: ['product'],
  cart: ['cart'],
  checkout: ['checkout'],
  subscription: ['product'], // subscription blocks live on the PDP
}

function walkDir(rel) {
  const abs = path.resolve(cwd, rel)
  const out = []
  let entries = []
  try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(rel, e.name)
    if (e.isDirectory()) out.push(...walkDir(p))
    else out.push(p)
  }
  return out
}
function fileMatchesSurface(file, surface) {
  const base = path.basename(file)
  const pats = SURFACE_PATTERNS[surface] || []
  return pats.some(re => re.test(base))
}
function templateMatchesSurface(file, surface) {
  const base = path.basename(file).replace(/\.(json|liquid)$/, '')
  const hints = SURFACE_TEMPLATE_HINTS[surface] || []
  return hints.some(h => base === h || base.startsWith(`${h}.`))
}

// PURE — pull user-visible strings out of a raw file body. We intentionally over-collect and let the
// judge filter; a short surface prompt is cheap, a wrong verdict from missing copy is expensive.
export function extractStrings(text) {
  const t = String(text || '')
  const hits = new Set()
  // JSON "settings" text values (templates/*.json)
  for (const m of t.matchAll(/"(?:text|heading|subheading|title|subtitle|button_label|content|caption|description|label|body|announcement|cta|note|promo|paragraph|tagline|badge)"\s*:\s*"((?:[^"\\]|\\.){2,})"/gi)) {
    hits.add(m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim())
  }
  // Liquid `t:"…"` or default:"…" schema strings
  for (const m of t.matchAll(/"(?:default|label|info|placeholder)"\s*:\s*"((?:[^"\\]|\\.){2,})"/gi)) {
    hits.add(m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim())
  }
  // Inline Liquid strings passed to filters/echo (skip {{ obj.field }})
  for (const m of t.matchAll(/{{\s*['"]([^'"{}]{2,})['"]\s*(?:\|\s*t)?\s*(?:\|[^}]*)?}}/g)) {
    hits.add(m[1].trim())
  }
  // HTML text inside common copy elements
  for (const m of t.matchAll(/<(?:h[1-6]|p|button|a|span|strong|em|li)\b[^>]*>([^<{}]{3,}?)<\//gi)) {
    const s = m[1].replace(/\s+/g, ' ').trim()
    if (s && !/^[{%<]/.test(s)) hits.add(s)
  }
  return [...hits].filter(s => s.length >= 2 && s.length <= 400 && !/^[{%<]/.test(s))
}

// gather copy strings for one surface: (a) sections whose filename matches the surface pattern,
// (b) snippets whose filename matches, (c) templates that render the surface (index for hero, cart
// for cart, etc.). Returns { files: [{file, strings}], all: [dedup'd strings] }.
export function collectSurfaceCopy(surface, { root = cwd } = {}) {
  const filesByRel = {}
  const addFile = (rel) => {
    if (filesByRel[rel]) return
    const abs = path.resolve(root, rel)
    let text = ''
    try { text = fs.readFileSync(abs, 'utf-8') } catch { return }
    const strings = extractStrings(text)
    if (strings.length) filesByRel[rel] = strings
  }
  const scanDir = (dir, matcher) => {
    for (const f of walkDir(dir)) {
      if (!/\.(liquid|json|md)$/.test(f)) continue
      if (matcher(f, surface)) addFile(f)
    }
  }
  scanDir('sections', fileMatchesSurface)
  scanDir('snippets', fileMatchesSurface)
  scanDir('templates', templateMatchesSurface)
  // Cross-cut: templates/index.json/liquid ships hero copy in section blocks; templates/product.*
  // ships subscription copy from subscription-app section blocks — captured by SURFACE_TEMPLATE_HINTS.
  const files = Object.entries(filesByRel).map(([file, strings]) => ({ file, strings }))
  const all = [...new Set(files.flatMap(f => f.strings))]
  return { files, all }
}

// cap the strings dump at MAX_CHARS — long themes can dump 100KB of copy which overflows the CLI arg
// buffer. PURE — no IO. Preserves earliest strings + notes how many were truncated.
export function capStringsDump(files, maxChars) {
  const lines = []
  let used = 0
  let truncatedFiles = 0
  let truncatedStrings = 0
  for (const f of files) {
    const header = `\n---\n# ${f.file}\n`
    if (used + header.length > maxChars) { truncatedFiles += (files.length - files.indexOf(f)); break }
    lines.push(header); used += header.length
    for (const s of f.strings) {
      const line = `- ${s}\n`
      if (used + line.length > maxChars) { truncatedStrings += (f.strings.length - f.strings.indexOf(s)); break }
      lines.push(line); used += line.length
    }
  }
  return { text: lines.join(''), truncatedFiles, truncatedStrings }
}

// ── judge prompt + spawn ────────────────────────────────────────────────────────
function buildPrompt({ surface, brand, niche, voice, nicheTraits, copyDump, outPath }) {
  const voiceBlock = voice.text
    ? `Brand voice reference (from ${voice.source}). Hold the copy to THIS voice, not a generic one:\n${voice.text}`
    : `No brand voice reference exists yet (looked for ${VOICE_FILE} and a "## Voice" section of ${BRAND_FILE}). Score voice_fit based on whether the copy READS as one consistent voice (any voice) — a mixed / inconsistent tone across the surface is a voice_fit fail.`
  const traitsBlock = nicheTraits.traits
    ? `Niche voice_traits (from ${nicheTraits.source}) — what the "${niche}" niche expects (tone / formality / register / cadence). Apply as guardrails, NOT as required imitation:\n${JSON.stringify(nicheTraits.traits, null, 2)}`
    : `No niche-specific voice_traits found (looked in ${NICHE_PACKS_DIR}/<${niche}>.json). Score voice_fit on the brand voice reference alone.`
  return [
    `You are Lens-Copy-Judge — an INDEPENDENT copy reviewer for a ${niche} Shopify store ("${brand}"). You have NOT seen the design spec, the ink briefs, or any prior review. Judge ONLY the shipped copy strings below, like a first-time shopper reading the ${surface} of this store.`,
    `Surface: ${surface}`,
    `Shipped copy for this surface (file → visible strings extracted from the theme). If a string looks like a placeholder / lorem / bracket-token / obvious CMS default, call that out under specificity or in findings.\n${copyDump}`,
    voiceBlock,
    traitsBlock,
    `Score each of the three dimensions 0-100:`,
    `  • specificity — does the copy make CONCRETE claims backed by numbers, ingredients, materials, timeframes, or proof (studies / awards / press / customer counts)? Vague adjectives ("premium", "high-quality", "amazing") without substantiation drop the score. Generic placeholder text ("Add your text here", "[CLAIM]") is a hard failure — score ≤ 20.`,
    `  • benefit_clarity — does the copy name the CUSTOMER'S outcome ("sleep through the night", "no midday breakouts", "ship in 24h"), or does it only describe the product's FEATURES ("400 thread count", "SPF 30")? Feature-only copy scores ≤ 60. A benefit stated but not tied to a feature scores in the 60-80 range. Feature + explicit benefit + proof scores 90+.`,
    `  • voice_fit — does the copy match the declared brand voice? Consistent tone / formality / cadence / register throughout the surface. A mix of formal + casual, or of the brand voice with the theme's default placeholder voice, drops the score. If no voice reference exists, judge whether the copy READS as one consistent voice.`,
    `Return findings for each dimension that scores < 70: what specifically fails, and quote the string that fails.`,
    `Write ONLY a JSON file to EXACTLY this path: ${outPath}`,
    `JSON shape: {"surface":"${surface}","brand":"${brand}","niche":"${niche}","scores":{"specificity":0-100,"benefit_clarity":0-100,"voice_fit":0-100},"verdict":"PASS"|"FAIL","confidence":0-100,"findings":[{"dimension":"specificity"|"benefit_clarity"|"voice_fit","severity":"blocker"|"warning","evidence":"<the offending string, quoted>","detail":"<why it fails>"}],"notes":"<one-line summary of what this surface's copy does well / needs>"}`,
    `verdict = PASS if specificity ≥ 70 AND benefit_clarity ≥ 70 AND voice_fit ≥ 70; else FAIL.`,
    `Do not print anything else to stdout.`,
  ].filter(Boolean).join('\n\n')
}

function judgeSurface({ surface, brand, niche, voice, nicheTraits, copyDump, truncatedNote }) {
  const outPath = path.join(JUDGE_DIR, `${surface}.json`)
  const prompt = buildPrompt({ surface, brand, niche, voice, nicheTraits, copyDump, outPath })
  return new Promise((resolve) => {
    // Mirror lens-judge.mjs spawn shape — the prompt explicitly asks for `--allowedTools Read,Write`
    // (the judge writes the verdict FILE at outPath) instead of `--output-format json` (we don't
    // parse stdout; success = the verdict FILE exists + parses).
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', MODEL, '--no-session-persistence', '--allowedTools', 'Read,Write'], { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    let done = false
    const finish = (result) => { if (done) return; done = true; clearTimeout(timer); try { child.kill('SIGKILL') } catch { /* already dead */ } resolve(result) }
    const timer = setTimeout(() => finish({ surface, ok: false, reason: `timed out after ${TIMEOUT_MS}ms (COPY_JUDGE_TIMEOUT_MS)` }), TIMEOUT_MS)
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', e => finish({ surface, ok: false, reason: `spawn failed: ${e.message}` }))
    child.on('close', () => {
      try {
        const v = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
        // provenance — stamp the resolved MODEL (mirrors lens-judge.mjs line 178). A silent `sonnet`
        // alias upgrade would shift verdicts; this makes the shift visible + audit-able.
        v.model = MODEL
        v.truncatedNote = truncatedNote || undefined
        fs.writeFileSync(outPath, `${JSON.stringify(v, null, 2)}\n`)
        finish({ surface, ok: true, verdict: v })
      } catch {
        finish({ surface, ok: false, reason: `no/invalid verdict at ${path.basename(outPath)}${err ? ` — ${err.slice(0, 200)}` : ''}` })
      }
    })
  })
}

async function pool(items, n, worker) {
  const results = []; let i = 0
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await worker(items[idx]) }
  })
  await Promise.all(runners)
  return results
}

// ── verdict aggregation ─────────────────────────────────────────────────────────
// PURE — per-surface pass = all three dims ≥ 70; overall pass = every surface with copy passes.
// Surfaces with no copy on the theme (no matching files) are marked N/A and do NOT gate. Surfaces
// whose judge failed to produce a verdict are "unjudged" and are treated as gaps (block under
// ENFORCE, warn otherwise) — mirrors lens-judge.mjs coverage-unjudged doctrine.
export function aggregate(perSurface, { enforce = false } = {}) {
  const blockers = []
  const warnings = []
  const notes = []
  let judgedPass = 0
  let judgedFail = 0
  for (const r of perSurface) {
    if (r.status === 'n/a') { notes.push({ surface: r.surface, status: 'n/a' }); continue }
    if (r.status === 'unjudged') {
      const bucket = enforce ? blockers : warnings
      bucket.push({ id: `copy-judge.unjudged`, page: r.surface, detail: `judge produced no verdict — ${r.reason}`, evidence: '' })
      continue
    }
    const s = r.verdict?.scores || {}
    const dims = ['specificity', 'benefit_clarity', 'voice_fit']
    const failed = dims.filter(d => Number(s[d]) < 70)
    if (failed.length === 0) { judgedPass += 1; continue }
    judgedFail += 1
    for (const d of failed) {
      const bucket = enforce ? blockers : warnings
      bucket.push({
        id: `copy-judge.${d}`,
        page: r.surface,
        detail: `${d}=${Number(s[d])} < 70 on ${r.surface}${r.verdict?.notes ? ` — ${r.verdict.notes}` : ''}`,
        evidence: (r.verdict?.findings || []).filter(f => f.dimension === d).slice(0, 3).map(f => `"${f.evidence}" — ${f.detail}`).join(' | '),
      })
    }
  }
  return { pass: blockers.length === 0, blockers, warnings, notes, judgedPass, judgedFail }
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  const { niche, src: nicheSrc } = resolveNiche()
  const brand = resolveBrand()
  console.error(`lens-copy-judge: niche="${niche}" · brand="${brand}" · niche source: ${nicheSrc} · enforce=${ENFORCE ? '1' : '0'}`)
  const ver = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' })
  if (ver.error) die(2, `claude CLI not found (${CLAUDE_BIN}) — Lens-copy-judge dispatches headless \`claude -p\`. Install Claude Code or set CLAUDE_BIN.`)

  fs.mkdirSync(JUDGE_DIR, { recursive: true })

  const wanted = args().surfaces?.length ? args().surfaces : DEFAULT_SURFACES
  const concurrency = Math.min(args().concurrency || CONCURRENCY, wanted.length)
  const voice = loadVoice()
  const nicheTraits = loadNichePackVoiceTraits(niche, NICHE_PACKS_DIR)

  // 1. collect shipped copy per surface (skip N/A surfaces where nothing matched)
  const jobs = []
  const naSurfaces = []
  for (const surface of wanted) {
    const collected = collectSurfaceCopy(surface, { root: cwd })
    if (!collected.files.length) { naSurfaces.push(surface); continue }
    const cap = capStringsDump(collected.files, MAX_CHARS)
    const truncatedNote = (cap.truncatedFiles || cap.truncatedStrings)
      ? `dump truncated at ${MAX_CHARS} chars — ${cap.truncatedFiles} file(s) + ${cap.truncatedStrings} string(s) omitted`
      : null
    jobs.push({ surface, brand, niche, voice, nicheTraits, copyDump: cap.text, truncatedNote, filesCount: collected.files.length, stringsCount: collected.all.length })
  }

  console.log(`lens-copy-judge: ${wanted.length} surface(s) requested · ${jobs.length} to judge · ${naSurfaces.length} n/a (no shipped copy on theme) · concurrency ${concurrency} · model ${MODEL}`)
  for (const s of naSurfaces) console.log(`  ◦ ${s}: N/A (no matching sections/snippets/templates found)`)

  // 2. dispatch judges (bounded pool, per-surface timeout, verdict FILE = truth)
  const results = jobs.length
    ? await pool(jobs, concurrency, async (job) => {
      const r = await judgeSurface(job)
      if (r.ok) {
        const s = r.verdict?.scores || {}
        console.log(`  ${r.verdict.verdict === 'FAIL' ? '✗' : '✓'} ${r.surface}: ${r.verdict.verdict} · specificity=${s.specificity} · benefit_clarity=${s.benefit_clarity} · voice_fit=${s.voice_fit}${job.truncatedNote ? ` · ${job.truncatedNote}` : ''}`)
      } else {
        console.log(`  ✗ ${r.surface}: ${r.reason}`)
      }
      return r
    })
    : []

  // 3. aggregate + write the gate report
  const perSurface = [
    ...naSurfaces.map(surface => ({ surface, status: 'n/a' })),
    ...results.map(r => r.ok
      ? { surface: r.surface, status: 'judged', verdict: r.verdict }
      : { surface: r.surface, status: 'unjudged', reason: r.reason }),
  ]
  const agg = aggregate(perSurface, { enforce: ENFORCE })
  const gatePass = agg.pass

  writeReport('copy-judge', 57, {
    cwd,
    pass: gatePass,
    blockers: agg.blockers,
    warnings: agg.warnings,
    evidence: {
      niche, nicheSrc, brand, enforce: ENFORCE, model: MODEL,
      voiceSource: voice.source, nicheTraitsSource: nicheTraits.source,
      surfaces: perSurface.map(r => ({
        surface: r.surface,
        status: r.status,
        scores: r.verdict?.scores || null,
        verdict: r.verdict?.verdict || null,
        confidence: r.verdict?.confidence ?? null,
        findings: (r.verdict?.findings || []).length,
        reason: r.reason || undefined,
      })),
      judgedPass: agg.judgedPass, judgedFail: agg.judgedFail,
      naSurfaces,
    },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)

  const label = gatePass ? 'PASS' : (ENFORCE ? 'BLOCK' : 'WARN')
  console.log(`lens-copy-judge: ${label} — ${agg.judgedPass} judged-pass · ${agg.judgedFail} judged-fail · ${naSurfaces.length} n/a · ${agg.blockers.length} blocker(s) · ${agg.warnings.length} warning(s) → ${path.relative(cwd, JUDGE_DIR)}/`)
  for (const b of agg.blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of agg.warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(gatePass ? 0 : 1)
}

if (isMain(import.meta.url)) {
  main().catch(e => die(2, `unexpected failure: ${e.message}`))
}
