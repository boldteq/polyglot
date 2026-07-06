#!/usr/bin/env node
// Lens — Visual Truth Layer · LAYER 2 DRIVER (the missing autonomous piece). For each captured
// frame (Layer 1), dispatch an INDEPENDENT vision judge that SEES the rendered page and scores it
// against the surface rubric, writing judge/<surface>-<vp>.json in the exact shape gate #18
// (check-visual-truth.mjs) consumes. Closes the loop into a single command:
//     pnpm lens:capture && pnpm lens:judge && pnpm lens:enforce
//
// MECHANISM: a HEADLESS `claude -p` call per frame (the Claude Code CLI — subscription vision, NO
// API key, the same model the team already pays for). NOT the Task tool (a plain node process has
// no Task-tool access) and NOT a paid Vision API. Verified: headless claude reads a PNG + writes a
// JSON file (Meridian 2026-06-19).
//
// INDEPENDENCE GUARANTEE (the whole point — the judge must see the page like a shopper, NOT trust
// the builder): the judge prompt contains ONLY {screenshot path(s), the surface rubric, niche,
// brand name}. It is given ZERO design-spec.md, build code, settings_data, or onyx review — so it
// cannot inherit the builder's blind spots or rubber-stamp.
//
// Usage: node lens-judge.mjs [--surfaces a,b] [--concurrency N]
// Env: REPORT_DIR (gate-reports) · LENS_NICHE · LENS_BRAND · LENS_JUDGE_MODEL (sonnet) ·
//      LENS_CONCURRENCY (4) · LENS_RUBRICS (default <toolkit>/lens-rubrics) · CLAUDE_BIN (claude)
// Exit: 0 = every frame judged · 1 = ≥1 frame failed to produce a verdict · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const JUDGE_DIR = path.join(LENS_DIR, 'judge')
const JUDGE_CACHE = path.join(LENS_DIR, 'judge-cache') // #9: content-addressed verdict cache
const NO_CACHE = process.env.LENS_NO_CACHE === '1'
const MAX_FRESH = Number(process.env.LENS_MAX_FRAMES || 0) // #9: cap fresh judge calls per run (0 = unlimited)
const RUBRICS_DIR = process.env.LENS_RUBRICS || path.resolve(HERE, '..', 'lens-rubrics')
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const MODEL = process.env.LENS_JUDGE_MODEL || 'sonnet'
const NICHE = process.env.LENS_NICHE || 'general ecommerce'
const BRAND = process.env.LENS_BRAND || 'this brand'

const die = (code, msg) => { console.error(`lens-judge: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }

function args() {
  const out = { surfaces: null, concurrency: Number(process.env.LENS_CONCURRENCY || 4) }
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--help' || a[i] === '-h') { console.log('node lens-judge.mjs [--surfaces a,b] [--concurrency N]'); process.exit(0) }
    else if (a[i] === '--surfaces') out.surfaces = (a[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a[i] === '--concurrency') out.concurrency = Number(a[++i])
  }
  return out
}

function loadRubric(surface) {
  const p = path.join(RUBRICS_DIR, `${surface}.json`)
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
}

// A frame's rubric is keyed by surface, EXCEPT a content state that has its own rubric (BUG-1: the cart
// `drawer` state, captured on the PDP, is judged against the cart-drawer rubric — not the PDP rubric — so
// the judge checks drawer-open / checkout-cta-in-drawer / upsell, the real slide-out UX).
export function rubricKeyFor(frame) {
  if (frame && frame.state === 'drawer') return 'cart-drawer'
  return frame ? frame.surface : null
}

// Premium baseline (WS-B2): the niche's 2 reference brands' premium attributes, as a CALIBRATION ANCHOR
// for premium-feel. Text-only (no images) → preserves the judge's independence guarantee. Computed once.
function premiumBaseline(niche) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(RUBRICS_DIR, '_premium-baseline.json'), 'utf-8'))
    const n = String(niche || '').toLowerCase()
    const hit = (j.niches || []).find(e => (e.match || []).some(m => n.includes(m)))
    if (hit && hit.brands) return hit.brands.map(b => `${b.name} — ${b.attributes.join('; ')}`).join('\n')
    return (j.generic?.attributes || []).join('; ')
  } catch { return '' }
}
const BASELINE = premiumBaseline(NICHE)

function buildPrompt(frame, rubric, outPath) {
  const rest = path.join(LENS_DIR, frame.frames?.rest || '')
  const end = path.join(LENS_DIR, frame.frames?.scrollEnd || '')
  const clear = frame.frames?.restClear ? path.join(LENS_DIR, frame.frames.restClear) : ''
  const extra = ['scroll25', 'scroll50', 'scroll75', 'hover'].filter(k => frame.frames?.[k]).map(k => `${k} = ${path.join(LENS_DIR, frame.frames[k])}`).join(' ; ')
  const dims = `${frame.width}x${frame.height}`
  const fkey = frame.key || `${frame.surface}-${frame.viewport}`
  const checks = (rubric?.checks || []).map(c => `- ${c.id} [→ ${c.fix_owner}, ${c.severity_if_fail}]: ${c.rule}`).join('\n')
  // INDEPENDENCE: only the screenshot + rubric + brand/niche. No build artifacts.
  return [
    `You are Lens-Judge — an INDEPENDENT visual-truth reviewer for a ${NICHE} Shopify store ("${BRAND}"). You have NOT seen the build, the design spec, or any prior review. Judge ONLY what is rendered in the screenshots, like a first-time shopper.`,
    `Surface: ${frame.surface} · Viewport: ${dims} (${frame.viewport})${frame.state && frame.state !== 'base' ? ` · State: ${frame.state} (a specific page state — judge it as the shopper sees it)` : ''}${frame.locale && frame.locale !== 'default' ? ` · Locale: ${frame.locale} (check the localized text fits — no overflow/clipping/untranslated strings in this language)` : ''}`,
    `Read the frames: rest = ${rest} ; scroll-end = ${end}${extra ? ` ; ${extra}` : ''}${extra ? '. The scroll-NN frames are mid-scroll evidence (catch lazy-load breakage); hover shows the primary CTA hover state.' : ''}`,
    clear ? `A consent/cookie overlay was present, so ALSO read rest-clear = ${clear} — it shows the above-the-fold page with that overlay DISMISSED. Judge the hero, headline-integrity, image-art-direction, hierarchy, layout, and text-over-image-contrast from rest-clear (the overlay hides them in 'rest'); judge the consent overlay itself (chrome-on-brand) from 'rest'.` : '',
    rubric?.viewport_notes ? `Viewport notes: ${rubric.viewport_notes}` : '',
    `Score each rubric check with PIXEL evidence (cite what you SEE + where). Report ONLY what is actually visible — do not invent.`,
    `Beyond the rubric, ALSO scan for CSS layout defects even when no rubric check names them — spacing collisions / overlapping elements, off-grid misalignment, wrapping failures (text or a flex row overflowing the viewport), typography-cascade breaks (a wrong font / size / weight bleeding into a section), and dark-mode contrast gaps if the surface renders dark. ALSO specifically: (1) headline-integrity — a decorative rule/divider/dash/border that splits a headline phrase into disconnected fragments at this viewport (esp. a desktop inline treatment becoming a full-width rule on mobile that bisects the headline) [blocker]; (2) image-art-direction — a hero/banner image whose mobile crop loses its subject (a blank/dark/subject-less patch) or lacks responsive art-direction [blocker]; (3) text-over-image-contrast — text over a photo / variable-luminance background with no scrim, washing out to low contrast [blocker]. Report each as a finding (fix_owner usually loom) under the closest rubric check id (headline-integrity / image-art-direction / text-over-image-contrast / css-layout) if none fits.`,
    `Rubric:\n${checks || '- broken-state: nothing broken/placeholder/overflow.'}`,
    BASELINE ? `Premium baseline for this niche (calibrate the "premium-feel" check against these world-class references — judge whether THIS store reaches their bar; do NOT require imitation or penalize a different-but-equally-premium direction):\n${BASELINE}` : '',
    `verdict = FAIL if ANY blocker finding is present; else PASS. confidence = your certainty 0-100.`,
    `fix_owner routing (this OVERRIDES the rubric's default owner when the defect is clearly one of these): porter = STORE DATA (a store/brand NAME like a test placeholder, an EMPTY collection / "no products", unconfigured payment or trust icons, missing real product photography); ink = COPY text (typos, placeholder/[CLAIM] text, claims); drape = DESIGN system / brand direction (palette, type scale, premium-feel); loom = THEME CODE (layout, overflow, CSS, hierarchy, off-brand chrome). Otherwise use the rubric's owner for that check.`,
    `Write ONLY a JSON file to EXACTLY this path: ${outPath}`,
    `JSON shape: {"surface":"${frame.surface}","viewport":"${dims}","key":"${fkey}","verdict":"PASS"|"FAIL","confidence":0-100,"findings":[{"check":"<id>","severity":"blocker"|"warning","evidence":"<what you see + where>","fix_owner":"loom|drape|ink|porter|conduit"}],"passed_checks":["<id>"]}`,
    `Do not print anything else.`,
  ].filter(Boolean).join('\n\n')
}

// #12 — mobile rubric overlay: mobile-only defects (tap-target size, thumb-reach, sticky-ATC) score
// ONLY on mobile-viewport frames. PURE: base checks + rubric.mobile_overlay when the frame is mobile.
export function effectiveChecks(rubric, frame) {
  const base = rubric?.checks || []
  const vp = String(frame?.viewport || '')
  const lead = parseInt(vp, 10) // a dims string like "375x812" → 375; a name like "mobile" → NaN
  const w = Number(frame?.width) || (Number.isFinite(lead) ? lead : 0)
  const isMobile = /mobile/i.test(vp) || (w > 0 && w <= 600)
  if (isMobile && Array.isArray(rubric?.mobile_overlay) && rubric.mobile_overlay.length) return [...base, ...rubric.mobile_overlay]
  return base
}

function judgeFrame(frame, rubric) {
  const eff = rubric ? { ...rubric, checks: effectiveChecks(rubric, frame) } : rubric
  const outPath = path.join(JUDGE_DIR, `${frame.key || `${frame.surface}-${frame.viewport}`}.json`)
  const prompt = buildPrompt(frame, eff, outPath)
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', MODEL, '--no-session-persistence', '--output-format', 'json'], { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', e => resolve({ frame, ok: false, reason: `spawn failed: ${e.message}` }))
    child.on('close', () => {
      // success is measured by the verdict FILE existing + parseable (the CLI's own stdout is ignored)
      try { const v = JSON.parse(fs.readFileSync(outPath, 'utf-8')); resolve({ frame, ok: true, verdict: v }) }
      catch { resolve({ frame, ok: false, reason: `no/invalid verdict at ${path.basename(outPath)}${err ? ` — ${err.slice(0, 120)}` : ''}` }) }
    })
  })
}

// #9 — hash the judge INPUTS for a frame (image bytes + rubric + niche/brand/model): anything that
// changes the verdict changes the hash, so a re-run after a CSS-only edit re-judges ONLY changed frames
// and reuses the rest. Identical inputs ⟹ identical verdict, so the cache is correctness-preserving.
function frameHash(frame, rubric) {
  const h = crypto.createHash('sha256')
  h.update(JSON.stringify(rubric || {}))
  h.update(`${NICHE}|${BRAND}|${MODEL}`)
  const imgs = frame.frames || {}
  for (const k of Object.keys(imgs).sort()) {
    try { h.update(k); h.update(fs.readFileSync(path.join(LENS_DIR, imgs[k]))) } catch { h.update(`missing:${k}`) }
  }
  return h.digest('hex')
}

// PURE: partition judge items into {fresh, cached, skipped} given each item's cache-hit + a fresh budget.
// items: [{frame, rubric, hash, cached}]. maxFresh 0 = unlimited. skipped = over-budget fresh frames
// (NOT silent — the caller logs them, and #18's coverage-unjudged catches the gap at publish-grade).
export function planJudge(items, { maxFresh = 0 } = {}) {
  const fresh = []
  const cached = []
  const skipped = []
  for (const it of items || []) {
    if (it.cached) { cached.push(it); continue }
    if (maxFresh && fresh.length >= maxFresh) { skipped.push(it); continue }
    fresh.push(it)
  }
  return { fresh, cached, skipped }
}

async function pool(items, n, worker) {
  const results = []; let i = 0
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await worker(items[idx]) }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const ver = spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' })
  if (ver.error) die(2, `claude CLI not found (${CLAUDE_BIN}) — Lens-judge dispatches headless \`claude -p\`. Install Claude Code or set CLAUDE_BIN.`)

  const manifestPath = path.join(LENS_DIR, 'lens-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    // BUG-19: don't halt the loop on a missing manifest — SELF-START a capture when a preview URL is
    // available (the standalone judge / theme-gates / maestro path may call judge before capture). The
    // judge can't run blind, but "no manifest yet + a URL to capture" should auto-recover, not die.
    if (process.env.THEME_PREVIEW_URL) {
      console.error('lens-judge: no lens-manifest.json yet — self-starting lens-capture first…')
      const surfaces = args().surfaces
      const cap = spawnSync(process.execPath, [path.resolve(HERE, 'lens-capture.mjs'), ...(surfaces ? ['--surfaces', surfaces.join(',')] : [])], { cwd, stdio: 'inherit', env: process.env })
      if (cap.status !== 0 || !fs.existsSync(manifestPath)) die(2, `lens-capture self-start failed (exit ${cap.status ?? '?'}) — run \`pnpm lens:capture\` manually and re-judge`)
    } else {
      die(2, `no ${path.relative(cwd, manifestPath)} and THEME_PREVIEW_URL not set — run \`pnpm lens:capture\` first (it needs the preview URL)`)
    }
  }
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch (e) { die(2, `lens-manifest.json invalid: ${e.message}`) }
  let frames = Array.isArray(manifest.frames) ? manifest.frames : []
  const a = args()
  if (a.surfaces) frames = frames.filter(f => a.surfaces.includes(f.surface))
  if (!frames.length) die(2, 'no frames to judge')

  fs.mkdirSync(JUDGE_DIR, { recursive: true })
  if (!NO_CACHE) fs.mkdirSync(JUDGE_CACHE, { recursive: true })
  const rubricCache = {}
  const outFor = (f) => path.join(JUDGE_DIR, `${f.key || `${f.surface}-${f.viewport}`}.json`)
  // #9 — hash every frame, mark cache hits, then plan: fresh (judge now) · cached (reuse) · skipped (over budget)
  const items = frames.map(f => {
    const rkey = rubricKeyFor(f)
    const rubric = rubricCache[rkey] ?? (rubricCache[rkey] = loadRubric(rkey))
    const hash = NO_CACHE ? null : frameHash(f, rubric)
    const cached = !!(hash && fs.existsSync(path.join(JUDGE_CACHE, `${hash}.json`)))
    return { frame: f, rubric, hash, cached }
  })
  const { fresh, cached, skipped } = planJudge(items, { maxFresh: MAX_FRESH })
  console.log(`lens-judge: ${frames.length} frame(s) — ${fresh.length} to judge · ${cached.length} cached · ${skipped.length} over-budget · headless ${CLAUDE_BIN} (${MODEL}), concurrency ${a.concurrency}`)

  let pass = 0, fail = 0, failed = 0, served = 0
  const tally = (v) => { if (v.verdict === 'FAIL') fail += 1; else pass += 1 }

  // serve cached verdicts (rewrite identity fields to the current frame; cache unreadable → judge fresh)
  const stillFresh = []
  for (const it of cached) {
    try {
      const v = JSON.parse(fs.readFileSync(path.join(JUDGE_CACHE, `${it.hash}.json`), 'utf-8'))
      v.surface = it.frame.surface; v.viewport = `${it.frame.width}x${it.frame.height}`; v.key = it.frame.key || `${it.frame.surface}-${it.frame.viewport}`
      fs.writeFileSync(outFor(it.frame), `${JSON.stringify(v, null, 2)}\n`)
      served += 1; tally(v)
      console.log(`  ◦ ${it.frame.surface}/${it.frame.viewport}: ${v.verdict} ${v.confidence}% (cached)`)
    } catch { stillFresh.push(it) }
  }
  // budget-skipped: NOT silent — gate #18 coverage-unjudged catches the gap at publish-grade
  for (const it of skipped) console.log(`  ⤬ ${it.frame.surface}/${it.frame.viewport}: SKIPPED (LENS_MAX_FRAMES=${MAX_FRESH}) — reads as coverage-unjudged at publish-grade`)

  const toJudge = [...fresh, ...stillFresh]
  const results = await pool(toJudge, a.concurrency, async (it) => {
    const r = await judgeFrame(it.frame, it.rubric)
    if (r.ok && it.hash && !NO_CACHE) { try { fs.writeFileSync(path.join(JUDGE_CACHE, `${it.hash}.json`), `${JSON.stringify(r.verdict, null, 2)}\n`) } catch { /* cache write best-effort */ } }
    return r
  })
  for (const r of results) {
    if (!r.ok) { failed += 1; console.log(`  ✗ ${r.frame.surface}/${r.frame.viewport}: ${r.reason}`); continue }
    tally(r.verdict)
    console.log(`  ${r.verdict.verdict === 'FAIL' ? '✗' : '✓'} ${r.frame.surface}/${r.frame.viewport}: ${r.verdict.verdict} ${r.verdict.confidence}% · ${(r.verdict.findings || []).length} finding(s)`)
  }
  console.log(`lens-judge: ${pass} PASS · ${fail} FAIL · ${served} cached · ${failed} unjudged${skipped.length ? ` · ${skipped.length} budget-skipped` : ''} → ${path.relative(cwd, JUDGE_DIR)}/`)
  process.exit(failed > 0 ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => die(2, `unexpected failure: ${e.message}`))
}
