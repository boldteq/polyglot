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
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const JUDGE_DIR = path.join(LENS_DIR, 'judge')
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

function judgeFrame(frame, rubric) {
  const outPath = path.join(JUDGE_DIR, `${frame.key || `${frame.surface}-${frame.viewport}`}.json`)
  const prompt = buildPrompt(frame, rubric, outPath)
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
  if (!fs.existsSync(manifestPath)) die(2, `no ${path.relative(cwd, manifestPath)} — run \`pnpm lens:capture\` first`)
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch (e) { die(2, `lens-manifest.json invalid: ${e.message}`) }
  let frames = Array.isArray(manifest.frames) ? manifest.frames : []
  const a = args()
  if (a.surfaces) frames = frames.filter(f => a.surfaces.includes(f.surface))
  if (!frames.length) die(2, 'no frames to judge')

  fs.mkdirSync(JUDGE_DIR, { recursive: true })
  console.log(`lens-judge: judging ${frames.length} frame(s) via headless ${CLAUDE_BIN} (${MODEL}), concurrency ${a.concurrency} …`)
  const rubricCache = {}
  const results = await pool(frames, a.concurrency, (f) => judgeFrame(f, rubricCache[f.surface] ?? (rubricCache[f.surface] = loadRubric(f.surface))))

  let pass = 0, fail = 0, failed = 0
  for (const r of results) {
    if (!r.ok) { failed += 1; console.log(`  ✗ ${r.frame.surface}/${r.frame.viewport}: ${r.reason}`); continue }
    const v = r.verdict; (v.verdict === 'FAIL' ? fail++ : pass++)
    console.log(`  ${v.verdict === 'FAIL' ? '✗' : '✓'} ${r.frame.surface}/${r.frame.viewport}: ${v.verdict} ${v.confidence}% · ${(v.findings || []).length} finding(s)`)
  }
  console.log(`lens-judge: ${pass} PASS · ${fail} FAIL · ${failed} unjudged → ${path.relative(cwd, JUDGE_DIR)}/`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => die(2, `unexpected failure: ${e.message}`))
