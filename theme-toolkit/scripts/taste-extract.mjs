#!/usr/bin/env node
// taste-extract — encode inspiration DNA UP-FRONT so drape weaves it into design-system.json
// BEFORE the build starts. Counterpart to reference-ingest: reference-match is DEFENSIVE (diff
// post-build against what the client showed us); taste-extract is PROACTIVE (bake the taste in).
//
// THE GAP THIS CLOSES (P9 — Yash's core ask, 2026-08). Client sends "make it feel like this"
// screenshots. Today drape opens design-system.json blind, guesses a palette from the niche pack,
// ships a theme that is "in the ballpark" but never carries the specific hue, weight rhythm, hero
// drama, or vertical cadence of the reference. Then reference-match flags it AFTER the build and
// we rebuild. This tool reads the reference(s) once, distills the taste into a machine-readable
// artifact at docs/design/taste-extract.json, and lets drape merge it into the design system as
// step ONE — not as a corrective diff at step twelve.
//
//   node toolkit/scripts/taste-extract.mjs --inspiration ~/Desktop/hero.png
//   node toolkit/scripts/taste-extract.mjs --inspiration ~/ref-a.png --inspiration ~/ref-b.png --tag "soft-luxe"
//
// MVP is STUB. This file runs with zero npm deps installed: it copies each inspiration into the
// repo (docs/inspiration/<basename>) and writes the schema at docs/design/taste-extract.json with
// `extraction_deferred: true` on every dimension. That alone unblocks the pipeline — drape can
// consume the schema today and no-op on deferred fields.
//
// DEP READINESS CHECK. At start we probe toolkit/node_modules for color-thief + chroma-js +
// tesseract.js. When they are present we ACTIVATE the palette extractor (dynamic import, wrapped
// in try/catch — a missing/incompatible API safely falls back to stub, never crashes the build).
// To upgrade the tool from stub → live:
//   npm i --prefix toolkit color-thief chroma-js tesseract.js
//
// EXTRACTION DIMENSIONS
//   palette         — dominant + accents. LIVE when color-thief + chroma-js are installed.
//   typography      — family + weight pattern. TODO stub: requires tesseract.js OCR + a
//                     serif/sans heuristic on rasterised glyphs.
//   spacing_rhythm  — dominant vertical gap. TODO stub: needs edge-detection over the image
//                     to cluster horizontal whitespace bands.
//   hero_drama      — full-bleed | contained | split | editorial. TODO stub: needs
//                     aspect-ratio + text-block-position classification.
//   motion_hints    — only extractable from a URL (page load surface), not a still. Always null
//                     in image mode; a future URL mode would populate it.
//
// Exit: 0 ok · 2 usage/env error.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isMain } from './lib/is-main.mjs'

const cwd = process.cwd()
const INSPIRATION_DIR = 'docs/inspiration'
const OUTPUT_PATH = 'docs/design/taste-extract.json'
const TOOLKIT_MODULES = 'toolkit/node_modules'
const REQUIRED_DEPS = ['color-thief', 'chroma-js', 'tesseract.js']
const SCHEMA_VERSION = '1.0'

const die = (msg) => { console.error(`taste-extract: ${msg}`); process.exit(2) }

function parseArgs(argv) {
  const o = { inspirations: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--inspiration') o.inspirations.push(argv[++i])
    else if (a === '--tag') o.tag = argv[++i]
    else if (a === '--help' || a === '-h') o.help = true
  }
  return o
}

// PURE: does a dep resolve under toolkit/node_modules (or the harness's own node_modules)?
// We check both because the toolkit is vendored into client repos as `toolkit/`, but the same
// script also runs from inside the harness where node_modules sits at the repo root.
export function depInstalled(dep, root = cwd) {
  const candidates = [
    path.resolve(root, TOOLKIT_MODULES, dep, 'package.json'),
    path.resolve(root, 'node_modules', dep, 'package.json'),
  ]
  return candidates.some((p) => fs.existsSync(p))
}

// PURE: build the taste-extract.json schema. All dimensions default to `extraction_deferred: true`;
// callers overwrite individual dimensions as extractors come online. Keep this the single source of
// truth for the schema so drape and future extractors read from one shape.
export function buildStubTaste({ extractedFrom, extractedAt, depStatus, tag }) {
  const out = {
    $schema_version: SCHEMA_VERSION,
    extracted_from: extractedFrom,
    extracted_at: extractedAt,
    dep_status: depStatus,
    palette: {
      dominant: null,
      accents: [],
      extraction_deferred: true,
      notes: 'requires `color-thief` npm dep; install via npm i --prefix toolkit color-thief chroma-js',
    },
    typography: {
      family_guess: null,
      weight_pattern: null,
      extraction_deferred: true,
      notes: 'requires `tesseract.js` for OCR + a serif/sans-classifier heuristic on rasterised glyphs',
    },
    spacing_rhythm: {
      vertical_gap_px: null,
      extraction_deferred: true,
      notes: 'needs edge-detection over the image to cluster horizontal whitespace bands',
    },
    hero_drama: {
      archetype: null, // one of: full-bleed | contained | split | editorial (once resolved)
      extraction_deferred: true,
      notes: 'needs aspect-ratio + text-block-position classification',
    },
    motion_hints: {
      count: null,
      extraction_deferred: true,
      notes: 'only extractable from a URL (page-load surface), not a still image',
    },
    evidence: {},
  }
  if (tag) out.tag = tag
  return out
}

// PURE: 6-char SHA1 of a file's bytes. Used to (a) detect basename collisions between two
// --inspiration args that name different files the same thing (e.g. two "hero.png") and (b)
// no-op when the caller re-passes a file we've already persisted verbatim.
function sha1Short(absPath) {
  return crypto.createHash('sha1').update(fs.readFileSync(absPath)).digest('hex').slice(0, 6)
}

// Copy the inspiration into docs/inspiration/<basename> when it lives outside the repo, so the
// artifact is durable (survives session end, is readable by drape, is diffable in git). Returns
// the repo-relative path we recorded in extracted_from.
//
// COLLISION SAFETY (fixes silent clobber, 2026-08-25). Two --inspiration args often share a
// basename ("hero.png" from two different Desktops). copyFileSync would silently overwrite the
// first with the second and we'd lose an inspiration image without any warning in the log. So:
//   - if destination doesn't exist            → copy as-is
//   - if destination exists AND same bytes    → no-op (idempotent re-run)
//   - if destination exists AND different     → append short SHA1 to the stem: hero-a3f2b1.png
// The returned rel path always reflects what actually landed on disk (with suffix if applied).
function persistInspiration(inputPath) {
  const src = path.resolve(String(inputPath || '').replace(/^~/, process.env.HOME || '~'))
  if (!fs.existsSync(src)) die(`--inspiration not found: ${src}`)
  const destDir = path.resolve(cwd, INSPIRATION_DIR)
  fs.mkdirSync(destDir, { recursive: true })
  const base = path.basename(src)
  const alreadyThere = src === path.resolve(destDir, base)
  if (alreadyThere) return path.relative(cwd, src)

  let dest = path.join(destDir, base)
  if (fs.existsSync(dest)) {
    const srcHash = sha1Short(src)
    const destHash = sha1Short(dest)
    if (srcHash === destHash) {
      console.log(`taste-extract: ${base} already persisted (same bytes) — skipping copy`)
      return path.relative(cwd, dest)
    }
    const ext = path.extname(base)
    const stem = base.slice(0, base.length - ext.length)
    const suffixed = `${stem}-${srcHash}${ext}`
    dest = path.join(destDir, suffixed)
    fs.copyFileSync(src, dest)
    console.log(`taste-extract: collision on ${base} — saved as ${suffixed} (different bytes; kept both)`)
    return path.relative(cwd, dest)
  }

  fs.copyFileSync(src, dest)
  return path.relative(cwd, dest)
}

// Opportunistic palette activation. If color-thief + chroma-js resolve, dynamically import and
// extract dominant + accent hex swatches per image. Any failure (missing dep, ESM/CJS interop
// mismatch, unreadable image) falls back to the stub — a crashed build is worse than a deferred
// dimension. Kept OUT of buildStubTaste so the pure builder stays synchronous and testable.
async function tryActivatePalette(imageRelPaths, depStatus) {
  if (!depStatus['color-thief'] || !depStatus['chroma-js']) return null
  try {
    const ctMod = await import('color-thief')
    const chromaMod = await import('chroma-js')
    const ColorThief = ctMod.default || ctMod
    const chroma = chromaMod.default || chromaMod
    const dominants = []
    const accents = new Set()
    for (const rel of imageRelPaths) {
      const abs = path.resolve(cwd, rel)
      // color-thief exposes either a class or a module-level function depending on version;
      // try instance first, fall back to static. Both signatures return [r,g,b].
      let getColor; let getPalette
      if (typeof ColorThief === 'function') {
        const inst = new ColorThief()
        getColor = (p) => inst.getColor(p)
        getPalette = (p, n) => inst.getPalette(p, n)
      } else {
        getColor = ColorThief.getColor
        getPalette = ColorThief.getPalette
      }
      const dom = await getColor(abs)
      const pal = await getPalette(abs, 6)
      dominants.push(chroma(dom).hex())
      for (const c of (pal || [])) accents.add(chroma(c).hex())
    }
    return {
      dominant: dominants[0] || null,
      accents: [...accents],
      per_image: dominants,
      extraction_deferred: false,
      notes: 'extracted via color-thief + chroma-js',
    }
  } catch (err) {
    console.error(`taste-extract: palette activation failed → falling back to stub. reason: ${err.message}`)
    return null
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help || o.inspirations.length === 0) {
    console.log('usage: node toolkit/scripts/taste-extract.mjs --inspiration <path-to-image> [--inspiration <path> ...] [--tag <name>]')
    console.log('       writes docs/design/taste-extract.json (schema v' + SCHEMA_VERSION + ')')
    process.exit(o.help ? 0 : 2)
  }

  const persistedRel = o.inspirations.map(persistInspiration)
  console.log(`taste-extract: persisted ${persistedRel.length} inspiration image(s) → ${INSPIRATION_DIR}/`)
  for (const p of persistedRel) console.log(`  ${p}`)

  const depStatus = Object.fromEntries(REQUIRED_DEPS.map((d) => [d, depInstalled(d)]))
  const missing = REQUIRED_DEPS.filter((d) => !depStatus[d])

  const taste = buildStubTaste({
    extractedFrom: persistedRel,
    extractedAt: new Date().toISOString(),
    depStatus,
    tag: o.tag,
  })

  const palette = await tryActivatePalette(persistedRel, depStatus)
  if (palette) taste.palette = palette

  const outAbs = path.resolve(cwd, OUTPUT_PATH)
  fs.mkdirSync(path.dirname(outAbs), { recursive: true })
  fs.writeFileSync(outAbs, `${JSON.stringify(taste, null, 2)}\n`)
  console.log(`taste-extract: wrote ${OUTPUT_PATH}`)

  if (missing.length) {
    console.log('')
    console.log(`taste-extract: STUB MODE — ${missing.length} extractor dep(s) missing. Install to activate live extraction:`)
    console.log(`  npm i --prefix toolkit ${missing.join(' ')}`)
    console.log('  (palette activates once color-thief + chroma-js present; typography needs tesseract.js;')
    console.log('   spacing_rhythm + hero_drama remain TODO — see the file for the intended heuristics.)')
  } else if (!palette) {
    console.log('taste-extract: all deps present but palette activation FAILED — see error above; taste-extract.json remains stubbed.')
  } else {
    console.log('taste-extract: LIVE PALETTE — dominant + accents extracted; typography / spacing_rhythm / hero_drama still deferred.')
  }
  console.log('')
  console.log('  NEXT: drape reads docs/design/taste-extract.json and WEAVES the extracted palette,')
  console.log('        typography guess, vertical rhythm and hero archetype into docs/design/design-system.json')
  console.log('        BEFORE the theme build starts. Reference-match stays defensive (post-build); this is proactive.')
  process.exit(0)
}

if (isMain(import.meta.url)) main()
