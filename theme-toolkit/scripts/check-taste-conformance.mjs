#!/usr/bin/env node
// Gate #P9 check-taste-conformance — "does the RENDERED build still match the taste we extracted
// from the client's inspiration?"
//
// THE GAP THIS CLOSES: gate #46 (reference-match) proves the build matches the client's STRUCTURAL
// reference (right archetype, right section order). Gate #12 (design-system-adherence) proves the code
// obeys tokens. NEITHER proves the pixels the browser painted still resemble the palette / typography /
// vertical rhythm that taste-extract.mjs distilled from the client's inspiration images. So a build
// can pass #12 + #46 and STILL drift off-taste at render (wrong hero blue, thicker heading weight, a
// looser vertical rhythm than the reference) — the exact "gates green, still off-brand" failure mode
// Sprint-3 caught on Stride. This gate closes that loop: read the extract, read the Lens frames, diff.
//
// STRUCTURE mirrors gate #46 (reference-match): iterate the surface map, per-frame comparison,
// N/A-tolerant, pure helpers exported for fixtures, single writeReport at the end.
//
// TWO REALITIES about the comparison:
//   1. COLOR EXTRACTION FROM A FRAME is genuinely non-trivial without a native dep. This gate ships
//      with the extractor STUBBED — the palette dimension emits { deferred: true, note:
//      'extraction_deferred' } and does not compare colours until color-thief-node (or equivalent)
//      is vendored. This is intentional per the design brief: no npm deps are required to run the
//      gate, and a deferred dimension is honestly reported as deferred rather than silently passing.
//   2. TYPOGRAPHY + RHYTHM comparison from a rendered PNG requires OCR (tesseract) — also stubbed
//      and honestly reported as deferred. Everything ELSE (extract load, frame discovery, aggregate
//      arithmetic, verdict logic, N/A handling, report shape) is LIVE and unit-testable.
//
// N/A path when nothing was extracted (no docs/design/taste-extract.json) → `taste.n-a-no-extract`
// warn + PASS. Mirrors gate #46's `ref.n-a-no-reference-declared`.
//
// Usage: node check-taste-conformance.mjs
// Env:   REPORT_DIR · TASTE_ENFORCE=1 · DS_REQUIRE_SCOPE=1 (also enforces)
//        TASTE_EXTRACT_PATH (default docs/design/taste-extract.json)
//        TASTE_TOLERANCE_RGB (default 20)  TASTE_TOLERANCE_DE (default 10)
// Exit:  0 pass · 1 block · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const EXTRACT_PATH = process.env.TASTE_EXTRACT_PATH || 'docs/design/taste-extract.json'
const ENFORCE = process.env.TASTE_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const TOL_RGB = Number(process.env.TASTE_TOLERANCE_RGB || 20)
const TOL_DE = Number(process.env.TASTE_TOLERANCE_DE || 10)
// Aggregate divergence share (0..1) above which the whole gate blocks under enforce.
const AGGREGATE_BLOCK_THRESHOLD = 0.30

const blockers = []
const warnings = []
const add = (arr, id, page, detail, evidence = '') => arr.push({ id, page, detail, evidence: String(evidence || '') })

// ── Colour helpers ────────────────────────────────────────────────────────────
// Parse a "#rrggbb" (or shorthand "#rgb") into { r,g,b } ints. Returns null on garbage — callers treat
// null the same as "no dominant to compare", so a malformed extract never explodes the gate.
export function parseHex(hex) {
  if (typeof hex !== 'string') return null
  let s = hex.trim().replace(/^#/, '')
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) }
}

// Simple RGB Euclidean distance — the fallback distance metric when chroma-js (Lab dE) is not vendored.
// Not perceptually uniform, but deterministic and dep-free; the TASTE_TOLERANCE_RGB default of 20 is
// calibrated against this metric.
export function rgbDistance(a, b) {
  if (!a || !b) return null
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// Try to load chroma-js dynamically. When present, we return a function that computes CIE Lab dE
// (deltaE 1976; the simple canonical) between two hex strings. When absent (the default here — this
// gate ships dep-free), return null and callers fall back to rgbDistance.
async function tryLoadChroma() {
  try {
    const chroma = (await import('chroma-js')).default
    return (a, b) => {
      try { return chroma.deltaE(a, b) } catch { return null }
    }
  } catch { return null }
}

// PURE: decide whether two colours diverge under whichever metric is available. Returns
// { metric: 'de'|'rgb', distance, tolerance, over } or null if either input is missing.
export function colorDivergence(refHex, builtHex, dE = null, tolRgb = TOL_RGB, tolDe = TOL_DE) {
  if (!refHex || !builtHex) return null
  if (typeof dE === 'function') {
    const d = dE(refHex, builtHex)
    if (Number.isFinite(d)) return { metric: 'de', distance: d, tolerance: tolDe, over: d > tolDe }
  }
  const a = parseHex(refHex), b = parseHex(builtHex)
  const d = rgbDistance(a, b)
  if (d == null) return null
  return { metric: 'rgb', distance: d, tolerance: tolRgb, over: d > tolRgb }
}

// ── Extractor stubs ────────────────────────────────────────────────────────────
// COLOR: the honest thing is to report "deferred" until color-thief-node (or the platform's canvas +
// pixel-count) is vendored. The FILE existence is verified so a downstream operator can see the frame
// the gate WOULD have compared — but no attempt is made to fake a value.
// Live behaviour, expressed as a contract:
//   { hex: '#rrggbb' } — extracted, ready to diff
//   { deferred: true, note } — extraction not yet wired up; caller writes a warning, no block
//   null — the frame file is missing (a different failure mode; caller writes a specific warning)
export function extractDominantColorFromFrame(frameAbs) {
  if (!frameAbs || !fs.existsSync(frameAbs)) return null
  // TODO(color-thief): once color-thief-node is vendored under toolkit/, replace this stub with
  //   `const ct = await import('color-thief-node'); const [r,g,b] = await ct.getColorFromURL(frameAbs);`
  // and return { hex: `#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}` }. Until then we
  // honestly report "deferred" so gate-integrity (#45) and the FP-trend dashboard (#2) don't count
  // this dimension as a pass.
  return { deferred: true, note: 'extraction_deferred' }
}

// TYPOGRAPHY: real comparison needs OCR on the rendered frame (heading size / weight / family, per
// the taste-extract typography contract). Deferred until tesseract.js (or a native binding) is
// vendored. Same contract as extractDominantColorFromFrame.
export function extractTypographyFromFrame(frameAbs) {
  if (!frameAbs || !fs.existsSync(frameAbs)) return null
  // TODO(tesseract): OCR + measured baseline detection → { headingPx, headingWeight, family }
  return { deferred: true, note: 'extraction_deferred' }
}

// VERTICAL RHYTHM: real comparison needs edge/baseline detection on the frame to measure gap between
// hero → next section, and to compare against the extracted rhythm (typical section-gap median).
// Deferred until that pipeline is wired.
export function extractRhythmFromFrame(frameAbs) {
  if (!frameAbs || !fs.existsSync(frameAbs)) return null
  // TODO(edge-detect): measure section-gap distribution from horizontal luminance histogram
  return { deferred: true, note: 'extraction_deferred' }
}

// ── Frame discovery (mirrors gate #46's lensFrameFor semantics) ─────────────────
// Return the manifest's hero frame for a surface, if any. A "hero" frame is either an explicit
// `frames.hero` entry (when lens-capture records one) or the above-the-fold `rest` frame — which
// is what Lens ships today and is a defensible proxy for "the hero region" of the page.
export function heroFrameFor(surface, viewport, manifest) {
  if (!manifest) return null
  const frames = (manifest.frames || []).filter(f => f.surface === surface && f.frames)
  if (!frames.length) return null
  const pick = (viewport && frames.find(f => f.viewport === viewport))
    || frames.find(f => f.viewport === 'desktop')
    || frames[0]
  const rel = (pick.frames && (pick.frames.hero || pick.frames.rest)) || null
  if (!rel) return null
  return { rel, abs: path.join(LENS_DIR, rel), viewport: pick.viewport, kind: pick.frames.hero ? 'hero' : 'rest' }
}

// PURE: aggregate the per-dimension results into { total, diverged, share, blocked }. Deferred
// dimensions do NOT count toward the denominator (they neither pass nor fail — the gate is honest
// about what it could not measure). A dimension with no reference data (e.g. extract has no
// palette.dominant) is likewise excluded.
export function aggregate(dimensions, enforce = ENFORCE, threshold = AGGREGATE_BLOCK_THRESHOLD) {
  const considered = dimensions.filter(d => d && d.status !== 'deferred' && d.status !== 'n/a')
  const diverged = considered.filter(d => d.diverged).length
  const total = considered.length
  const share = total === 0 ? 0 : diverged / total
  return { total, diverged, share, blocked: enforce && share > threshold }
}

function finish(pass, evidence) {
  writeReport('taste-conformance', 47, { cwd, pass, blockers, warnings, evidence, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`taste-conformance: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)${ENFORCE ? ' · ENFORCE mode' : ' · advisory mode (set TASTE_ENFORCE=1 or DS_REQUIRE_SCOPE=1 to block)'}`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

async function main() {
  // ── 1. Extract ────────────────────────────────────────────────────────────────
  const extractAbs = path.resolve(cwd, EXTRACT_PATH)
  if (!fs.existsSync(extractAbs)) {
    add(warnings, 'taste.n-a-no-extract', EXTRACT_PATH, `no taste extract found at ${EXTRACT_PATH} — nothing to compare the build against. Run \`node toolkit/scripts/taste-extract.mjs\` after ingesting the client's inspiration to produce one.`)
    return finish(true, { extract_present: false, mode: 'n/a' })
  }
  let extract
  try { extract = JSON.parse(fs.readFileSync(extractAbs, 'utf-8')) } catch (e) {
    add(blockers, 'taste.extract-invalid', EXTRACT_PATH, `taste extract is not valid JSON: ${e.message}`)
    return finish(false, { extract_present: true, mode: 'invalid' })
  }

  // ── 2. Lens manifest ──────────────────────────────────────────────────────────
  const manifestAbs = path.join(LENS_DIR, 'lens-manifest.json')
  if (!fs.existsSync(manifestAbs)) {
    add(warnings, 'taste.n-a-no-lens-capture', 'gate-reports/lens', `no Lens capture manifest at ${path.relative(cwd, manifestAbs)} — run \`node toolkit/scripts/lens-capture.mjs\` (or lens-quick) then re-run this gate.`)
    return finish(true, { extract_present: true, mode: 'n/a-no-frames' })
  }
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf-8')) } catch (e) {
    add(warnings, 'taste.lens-manifest-invalid', 'gate-reports/lens/lens-manifest.json', `Lens manifest is not valid JSON: ${e.message}`)
    return finish(true, { extract_present: true, mode: 'n/a-manifest-invalid' })
  }

  const dE = await tryLoadChroma() // null when chroma-js is not vendored → callers fall back to RGB

  // ── 3. Per-surface, per-dimension comparison ─────────────────────────────────
  // The extract can be shaped two ways: a flat single-page extract (top-level palette/typography/
  // rhythm — the taste-extract.mjs default output), or a per-surface extract ({ surfaces: [{ surface,
  // palette, typography, rhythm }] }). Support both without forcing the extractor's hand.
  const surfaces = Array.isArray(extract.surfaces) && extract.surfaces.length
    ? extract.surfaces
    : [{ surface: 'home', palette: extract.palette, typography: extract.typography, rhythm: extract.rhythm }]

  const dimensions = { palette: [], typography: [], rhythm: [] }
  const perSurface = []
  let framesFound = 0, framesMissing = 0

  for (const s of surfaces) {
    const surface = s.surface || 'home'
    const frame = heroFrameFor(surface, s.viewport, manifest)
    if (!frame) {
      framesMissing += 1
      add(warnings, 'taste.no-hero-frame', surface, `no Lens frame captured for surface "${surface}" — cannot compare taste. Run \`node toolkit/scripts/lens-quick.mjs --surfaces ${surface}\` then re-run.`)
      continue
    }
    if (!fs.existsSync(frame.abs)) {
      framesMissing += 1
      add(warnings, 'taste.frame-missing', surface, `Lens manifest points at ${frame.rel} but the file is missing — the capture may have been partially cleaned; re-run \`lens-quick --surfaces ${surface}\`.`)
      continue
    }
    framesFound += 1
    const rec = { surface, frame: frame.rel, viewport: frame.viewport, dimensions: {} }

    // ── palette ──────────────────────────────────────────────────────────────
    const refDominant = s.palette && s.palette.dominant
    if (refDominant) {
      const built = extractDominantColorFromFrame(frame.abs)
      if (!built) {
        rec.dimensions.palette = { status: 'n/a', reason: 'frame-unreadable' }
      } else if (built.deferred) {
        rec.dimensions.palette = { status: 'deferred', note: built.note, ref: refDominant, expected_metric: dE ? 'de' : 'rgb' }
        add(warnings, 'taste.extraction-deferred', surface, `palette compare for "${surface}" deferred (${built.note}) — reference dominant is ${refDominant}; extractor stub in place until color-thief-node is vendored.`)
        dimensions.palette.push({ surface, status: 'deferred' })
      } else {
        const div = colorDivergence(refDominant, built.hex, dE)
        rec.dimensions.palette = { status: 'compared', ref: refDominant, built: built.hex, ...div }
        dimensions.palette.push({ surface, status: 'compared', diverged: Boolean(div && div.over) })
        if (div && div.over) {
          add(warnings, 'taste.palette-drift', surface, `hero dominant colour drifted from the extracted taste: reference ${refDominant}, built ${built.hex} — ${div.metric} distance ${div.distance.toFixed(1)} > tolerance ${div.tolerance}.`)
        }
      }
    } else {
      rec.dimensions.palette = { status: 'n/a', reason: 'no-reference' }
    }

    // ── typography ────────────────────────────────────────────────────────────
    if (s.typography && (s.typography.headingPx || s.typography.headingWeight || s.typography.family)) {
      const built = extractTypographyFromFrame(frame.abs)
      if (!built) rec.dimensions.typography = { status: 'n/a', reason: 'frame-unreadable' }
      else if (built.deferred) {
        rec.dimensions.typography = { status: 'deferred', note: built.note, ref: s.typography }
        add(warnings, 'taste.extraction-deferred', surface, `typography compare for "${surface}" deferred (${built.note}) — extractor stub in place until tesseract is vendored.`)
        dimensions.typography.push({ surface, status: 'deferred' })
      }
      // TODO(live): once built is a real measurement, diff each field against the ref and record
      // `diverged` when any single field exceeds its per-field tolerance.
    } else {
      rec.dimensions.typography = { status: 'n/a', reason: 'no-reference' }
    }

    // ── rhythm ────────────────────────────────────────────────────────────────
    if (s.rhythm && (s.rhythm.sectionGapPx || s.rhythm.baselineUnit)) {
      const built = extractRhythmFromFrame(frame.abs)
      if (!built) rec.dimensions.rhythm = { status: 'n/a', reason: 'frame-unreadable' }
      else if (built.deferred) {
        rec.dimensions.rhythm = { status: 'deferred', note: built.note, ref: s.rhythm }
        add(warnings, 'taste.extraction-deferred', surface, `vertical-rhythm compare for "${surface}" deferred (${built.note}) — extractor stub in place until edge-detection is vendored.`)
        dimensions.rhythm.push({ surface, status: 'deferred' })
      }
      // TODO(live): compare measured section-gap distribution against the extracted rhythm.
    } else {
      rec.dimensions.rhythm = { status: 'n/a', reason: 'no-reference' }
    }

    perSurface.push(rec)
  }

  // ── 4. Aggregate + verdict ────────────────────────────────────────────────────
  const flat = [
    ...dimensions.palette,
    ...dimensions.typography,
    ...dimensions.rhythm,
  ]
  const agg = aggregate(flat, ENFORCE, AGGREGATE_BLOCK_THRESHOLD)
  const evidence = {
    extract_present: true,
    extract_path: EXTRACT_PATH,
    de_metric_available: Boolean(dE),
    surfaces: perSurface,
    dimensions: {
      palette: { considered: dimensions.palette.length, deferred: dimensions.palette.filter(d => d.status === 'deferred').length, diverged: dimensions.palette.filter(d => d.diverged).length },
      typography: { considered: dimensions.typography.length, deferred: dimensions.typography.filter(d => d.status === 'deferred').length, diverged: dimensions.typography.filter(d => d.diverged).length },
      rhythm: { considered: dimensions.rhythm.length, deferred: dimensions.rhythm.filter(d => d.status === 'deferred').length, diverged: dimensions.rhythm.filter(d => d.diverged).length },
    },
    aggregate_divergence: agg.share,
    frames_found: framesFound,
    frames_missing: framesMissing,
    enforced: ENFORCE,
  }

  if (agg.blocked) {
    add(blockers, 'taste.divergence', EXTRACT_PATH, `aggregate taste divergence ${(agg.share * 100).toFixed(0)}% (${agg.diverged}/${agg.total}) exceeds ${(AGGREGATE_BLOCK_THRESHOLD * 100).toFixed(0)}% under enforce — the render has drifted from the extracted client taste across multiple dimensions. Re-tune the design tokens or re-extract the taste if the client changed direction.`)
  }

  finish(blockers.length === 0, evidence)
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`taste-conformance: ENV-ERROR — ${e.message}`); process.exit(2) })
}
