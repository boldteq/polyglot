#!/usr/bin/env node
// Gate #20 — Class-D Visual (the micro-change evidence bar). Closes the exact bypass the
// 2026-07-18 visual-QA-gap audit found: SAOS Class-D changes (copy swap, color/spacing tweak,
// image swap, setting toggle) shipped with ZERO pixel verification, so the same small bug came
// back re-reported by Yash again and again. This gate makes the discipline ENFORCEABLE (so a rule
// citing it in the swt-rules packs is honestly [ENFORCED], not aspirational):
//
//   A surface DECLARED as touched by a Class-D change MUST have fresh, passing Lens evidence.
//
// It does NOT re-render pixels itself — it reads the SAME artifacts #18 (check-visual-truth.mjs)
// consumes (produced by lens-capture.mjs → lens-judge.mjs, i.e. `pnpm lens:quick --surfaces <s>`):
//   <REPORT_DIR>/lens/lens-manifest.json   — capture facts per frame (nav/render/overflow/broken-img)
//   <REPORT_DIR>/lens/judge/<frame>.json   — vision verdict per frame { surface, viewport, verdict,
//                                            confidence, findings }
//
// Declared surfaces (in priority order):
//   CLASS_D_SURFACES=home,pdp        env, comma-separated  — OR —
//   docs/class-d-touched.txt         one surface per line (# comments + blanks ignored)
//
// No surfaces declared → PASS (N/A): this run is not a Class-D micro-change; formal Class A/B builds
// are covered by the full #18 sweep. Declared-but-unverified → BLOCK (the teeth): "you touched it,
// you didn't look at it." This is what stops the re-report loop.
//
// Usage: node gate-class-d-visual.mjs
// Env: REPORT_DIR (default gate-reports) · CLASS_D_MIN_CONFIDENCE (per-surface default: 90 for
//      money surfaces, else 75) · LENS_OVERFLOW_TOLERANCE (2 px)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const OVERFLOW_TOL = Number(process.env.LENS_OVERFLOW_TOLERANCE ?? 2)
const MIN_CONF_ENV = process.env.CLASS_D_MIN_CONFIDENCE ? Number(process.env.CLASS_D_MIN_CONFIDENCE) : null
// Same money-surface discipline as #18: uncertainty on a hero/PDP/cart is a block; on secondary
// surfaces it warns. Explicit env overrides both.
const CRITICAL_SURFACES = new Set(['home', 'pdp', 'cart', 'collection', 'checkout', 'order-confirmation', 'gift-card'])
const minConfFor = (surface) => (MIN_CONF_ENV != null ? MIN_CONF_ENV : (CRITICAL_SURFACES.has(String(surface)) ? 90 : 75))

const blockers = []
const warnings = []
const add = (arr, id, page, detail, evidence = '') => arr.push({ id, page, detail, evidence: String(evidence || '') })

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')) }

// ── declared touched surfaces ────────────────────────────────────────────────
function declaredSurfaces() {
  const fromEnv = (process.env.CLASS_D_SURFACES || '').split(',').map(s => s.trim()).filter(Boolean)
  if (fromEnv.length) return { surfaces: [...new Set(fromEnv)], source: 'CLASS_D_SURFACES' }
  const manifestFile = path.resolve(cwd, 'docs', 'class-d-touched.txt')
  if (fs.existsSync(manifestFile)) {
    try {
      const lines = fs.readFileSync(manifestFile, 'utf-8').split('\n')
        .map(l => l.replace(/#.*$/, '').trim()).filter(Boolean)
      if (lines.length) return { surfaces: [...new Set(lines)], source: 'docs/class-d-touched.txt' }
    } catch { /* fall through to none */ }
  }
  return { surfaces: [], source: null }
}

function finish(pass, evidence) {
  writeReport('class-d-visual', 20, {
    cwd, pass, blockers, warnings,
    evidence: { lensDir: path.relative(cwd, LENS_DIR), ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const label = pass ? 'PASS' : 'BLOCK'
  console.log(`class-d-visual: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

// ── run ──────────────────────────────────────────────────────────────────────
const { surfaces, source } = declaredSurfaces()
if (!surfaces.length) {
  console.log('class-d-visual: no Class-D surfaces declared (CLASS_D_SURFACES / docs/class-d-touched.txt) — N/A; formal builds are covered by #18 visual-check.')
  // QA-7: the prose + `note` already said N/A; the warning id is what gate #45 and
  // audit-vacuous-pass actually read.
  warnings.push({ id: 'cd.n-a-no-class-d-surfaces', page: '.', detail: 'no Class-D micro-change declared — formal builds are covered by #18 visual-check', evidence: '' })
  finish(true, { declared: [], source: null, note: 'no Class-D micro-change declared' })
}

// Load the Lens evidence the same way #18 does.
const manifestPath = path.join(LENS_DIR, 'lens-manifest.json')
if (!fs.existsSync(manifestPath)) {
  for (const s of surfaces) add(blockers, 'cd.no-capture', s, `surface "${s}" declared touched by a Class-D change but there is NO Lens capture (${path.relative(cwd, manifestPath)} missing). Run \`pnpm lens:quick --surfaces ${surfaces.join(',')}\` and re-gate — "it should look fine" is below the evidence bar.`, path.relative(cwd, LENS_DIR))
  finish(false, { declared: surfaces, source, capture: false })
}

let manifest
try { manifest = readJson(manifestPath) } catch (e) { finish(false, (add(blockers, 'cd.capture-invalid', path.relative(cwd, manifestPath), `lens-manifest.json is unreadable: ${e.message}`), { declared: surfaces, source })) }
const frames = Array.isArray(manifest.frames) ? manifest.frames : []

// Judge verdicts, grouped by surface.
const verdictsBySurface = new Map()
const judgeDir = path.join(LENS_DIR, 'judge')
if (fs.existsSync(judgeDir)) {
  for (const fn of fs.readdirSync(judgeDir)) {
    if (!fn.endsWith('.json')) continue
    let v
    try { v = readJson(path.join(judgeDir, fn)) } catch { continue }
    if (!v || !v.surface) continue
    if (!verdictsBySurface.has(v.surface)) verdictsBySurface.set(v.surface, [])
    verdictsBySurface.get(v.surface).push(v)
  }
}

for (const s of surfaces) {
  const surfaceFrames = frames.filter(f => f.surface === s)
  if (!surfaceFrames.length) {
    add(blockers, 'cd.no-capture', s, `surface "${s}" declared touched but no captured frame for it — run \`pnpm lens:quick --surfaces ${s}\`.`, '')
    continue
  }

  // Layer-1 capture facts — a shopper-visible break is a hard block regardless of the judge.
  for (const f of surfaceFrames) {
    const at = `${f.surface} ${f.viewport}/${f.theme || 'light'}`
    if (f.nav && f.nav !== 'ok') add(blockers, 'cd.nav-failed', s, `${at}: navigation failed (${f.nav}) — the surface did not load`, f.url)
    if (f.renderError) add(blockers, 'cd.render-error', s, `${at}: storefront render error — ${f.renderError}`, f.url)
    if (f.liquidError) add(blockers, 'cd.liquid-error', s, `${at}: Liquid error rendered to the page — "${f.liquidError}"`, f.url)
    if (Number(f.overflowPx) > OVERFLOW_TOL) add(blockers, 'cd.overflow', s, `${at}: horizontal overflow ${f.overflowPx}px — an element bleeds past the viewport`, f.url)
    if (Array.isArray(f.brokenImages) && f.brokenImages.length) add(blockers, 'cd.broken-image', s, `${at}: ${f.brokenImages.length} broken image(s): ${f.brokenImages.slice(0, 3).join(', ')}`, f.url)
    if (Number(f.cls) > 0.1) warnings.push({ id: 'cd.layout-shift', page: s, detail: `${at}: CLS ${f.cls} (>0.1) — visible layout shift on load`, evidence: f.url || '' })
  }

  // Layer-2 vision verdict — a captured frame with no eyes on it is not proof.
  const verdicts = verdictsBySurface.get(s) || []
  if (!verdicts.length) {
    add(blockers, 'cd.no-verdict', s, `surface "${s}" was captured but NOT vision-judged — a frame with no eyes on it isn't proof. Run \`pnpm lens:quick --surfaces ${s}\` so lens-judge.mjs produces a verdict.`, '')
    continue
  }
  const mc = minConfFor(s)
  for (const v of verdicts) {
    const at = `${s} ${v.viewport || ''}`.trim()
    if (v.verdict === 'FAIL') {
      add(blockers, 'cd.frame-fail', s, `${at}: vision judge verdict FAIL (confidence ${v.confidence}%) — ${(v.findings || []).slice(0, 2).map(x => x.check || x.detail).filter(Boolean).join('; ') || 'see lens report'}`, '')
    } else if (Number(v.confidence) < mc) {
      add(blockers, 'cd.low-confidence', s, `${at}: judge verdict PASS but confidence ${v.confidence}% < ${mc}% required for this surface — uncertainty on a touched ${CRITICAL_SURFACES.has(s) ? 'money ' : ''}surface is not evidence.`, '')
    }
    for (const fnd of (v.findings || [])) {
      if (String(fnd.severity).toLowerCase() === 'blocker' || String(fnd.severity).toLowerCase() === 'block') {
        add(blockers, 'cd.finding', s, `${at}: ${fnd.check || 'blocker'} — ${fnd.evidence || fnd.detail || ''} (owner: ${fnd.fix_owner || 'loom'})`, '')
      }
    }
  }
}

finish(blockers.length === 0, { declared: surfaces, source, surfacesChecked: surfaces.length, minConfidence: MIN_CONF_ENV ?? 'adaptive(90/75)' })
