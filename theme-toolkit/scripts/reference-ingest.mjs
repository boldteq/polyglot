#!/usr/bin/env node
// reference-ingest — persist "what the client showed us" as a durable, addressable artifact.
//
// THE GAP THIS CLOSES (cravinbyandy forensics, 2026-07-22): a pasted screenshot lived only in chat
// scrollback, and Figma was read transiently (stitch/drape hold get_screenshot but never SAVED it).
// So no gate could ever diff the build against the reference — the homepage hero shipped as a single
// `image-banner` when the reference showed slideshow dots, and passed ~20 green gates because none of
// them had access to the dots. This writes the reference into the repo and records the machine-
// checkable read (the `archetype`) that gate #46 asserts against the real template.
//
//   node toolkit/scripts/reference-ingest.mjs --surface home --name hero --image ~/Desktop/hero.png \
//        --archetype slideshow --must-have "pagination dots,auto-rotate,no arrows" [--order 1] \
//        [--figma 225:1294] [--figma-file lInEfNo3UXiju5B3kq1Tvi]
//   node toolkit/scripts/reference-ingest.mjs --list
//   node toolkit/scripts/reference-ingest.mjs --check-figma 225:1294 [--figma-file <key>]
//   node toolkit/scripts/reference-ingest.mjs --surface home --name hero --archetype slideshow \
//        --video "WhatsApp Video 2026-07-21.mp4" --at 1:30
//
// CLIENT WALKTHROUGH VIDEOS (2026-07-23). Yash sends screen recordings — of Figma, of staging — as
// often as stills, and a video is the ONE reference format guaranteed to be lost: `*.mp4` sits in the
// stock theme .gitignore, so the authoritative design lives in the repo invisible to git, to every
// agent, and to every gate. cravinbyandy's 7-minute Figma walkthrough was still on disk while the
// reference-conformance plan recorded its frames as "discarded with the session". --video + --at
// pulls one frame out and persists it exactly like a still, recording source_video + source_at so the
// moment it came from is reproducible. Survey a recording first with a contact sheet:
//   ffmpeg -i <video> -vf "fps=1/25,scale=400:-1,tile=4x5" -frames:v 1 contact.png
//
// FETCH-ONCE, PERSIST-ALWAYS (FIG-1, 2026-07-23). The Figma MCP is hard-capped on the Starter plan —
// `get_screenshot` returns "You've reached the Figma MCP tool call limit on the Starter plan", verified
// live twice (2026-07-15 and 2026-07-23). A build that re-reads Figma per section WILL die mid-run.
// So: `--check-figma` is a cache PROBE — it spends no Figma call and tells you whether that node is
// already persisted (exit 0 = reuse the file on disk, exit 1 = you may spend one fetch). Run it BEFORE
// every get_screenshot. Node ids are only unique within a file, so the cache key is file+node; pass
// --figma-file whenever more than one Figma file is in play (cravinbyandy has four).
//
// Image is COPIED to docs/design/references/<surface>/<name>.png (inside the repo so the headless
// judge may read it, and NOT under gate-reports/lens which lens-capture wipes on every run).
// Archetype vocabulary + the signal→archetype lookup: patterns/good/reference-archetype-signals.md
// Exit: 0 ok · 2 usage/env error.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const cwd = process.cwd()
const REF_DIR = 'docs/design/references'
const MAP_PATH = 'docs/design/reference-map.json'

// Keep in lockstep with reference-archetype-signals.md + check-reference-match.mjs ARCHETYPE_TYPES.
export const ARCHETYPES = [
  'slideshow', 'carousel', 'image-banner', 'collection-grid', 'featured-grid', 'accordion', 'tabbed',
  'product-card', 'main-product', 'marquee', 'logo-list', 'testimonials', 'image-with-text', 'video',
  'newsletter', 'announcement', 'rich-text', 'custom',
]

const die = (msg) => { console.error(`reference-ingest: ${msg}`); process.exit(2) }

// PURE: "90" | "1:30" | "01:30.5" | "00:01:30" → seconds. Returns null when unparseable.
// Clients send walkthrough VIDEOS (WhatsApp screen recordings of Figma / the staging site) as often as
// stills, and a video is the one reference format that is guaranteed to be lost: `*.mp4` is in the
// stock theme .gitignore, so the authoritative design sits in the repo invisible to every agent and
// every gate. --video + --at pulls one frame out and persists it like any other reference.
export function parseTimestamp(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (!m) return null
  const [, h, mm, ss] = m
  const mins = Number(mm)
  const secs = Number(ss)
  if (mins > 59 || secs >= 60) return null
  return (Number(h || 0) * 3600) + (mins * 60) + secs
}

// PURE: seconds → a filename-safe stamp ("1:30.5" → "00-01-30.5") so two frames from one video
// never collide and the row records exactly which moment was taken.
export function stampFor(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = (Number.isInteger(s) ? String(s).padStart(2, '0') : String(s.toFixed(1)).padStart(4, '0'))
  return `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}-${ss}`
}

function extractVideoFrame(videoPath, seconds) {
  const src = path.resolve(videoPath.replace(/^~/, process.env.HOME || '~'))
  if (!fs.existsSync(src)) die(`--video not found: ${src}`)
  if (!spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' }).stdout) {
    die('ffmpeg is required for --video (brew install ffmpeg). Alternatively screenshot the frame yourself and pass --image.')
  }
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'refvid-')), 'frame.png')
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(seconds), '-i', src, '-frames:v', '1', out, '-y'], { encoding: 'utf-8' })
  if (r.status !== 0 || !fs.existsSync(out)) die(`ffmpeg could not extract a frame at ${seconds}s from ${src}\n  ${(r.stderr || '').trim()}`)
  return { file: out, src }
}

function parseArgs(argv) {
  const o = { mustHave: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--surface') o.surface = argv[++i]
    else if (a === '--name') o.name = argv[++i]
    else if (a === '--image') o.image = argv[++i]
    else if (a === '--archetype') o.archetype = argv[++i]
    else if (a === '--must-have') o.mustHave = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--order') o.order = Number(argv[++i])
    else if (a === '--figma') o.figma = argv[++i]
    else if (a === '--figma-file') o.figmaFile = argv[++i]
    else if (a === '--check-figma') o.checkFigma = argv[++i]
    else if (a === '--video') o.video = argv[++i]
    else if (a === '--at') o.at = argv[++i]
    else if (a === '--viewport') o.viewport = argv[++i]
    else if (a === '--list') o.list = true
    else if (a === '--note') o.note = argv[++i]
  }
  return o
}

export function readMap(dir = cwd) {
  try { return JSON.parse(fs.readFileSync(path.resolve(dir, MAP_PATH), 'utf-8')) } catch { return { surfaces: [] } }
}

// PURE: upsert one section entry into the map (surface + name is the key).
//
// PROVENANCE IS STICKY (FIG-1). `reference` / `figma_node` / `figma_file` are only ever overwritten by
// a NEW non-empty value — never cleared by an omitted flag. Before this, re-registering an entry to
// correct its archetype (`--surface home --name hero --archetype carousel`, no --image) wrote
// `reference: null` and silently discarded the persisted export, forcing a re-fetch against the very
// API that is rate-limited. "Persist always" has to survive the second command, not just the first.
export function upsertEntry(map, entry) {
  const out = { surfaces: [...(map.surfaces || [])] }
  let s = out.surfaces.find(x => x.surface === entry.surface)
  if (!s) { s = { surface: entry.surface, sections: [] }; out.surfaces.push(s) }
  s.sections = [...(s.sections || [])]
  const i = s.sections.findIndex(x => x.name === entry.name)
  const prev = i >= 0 ? s.sections[i] : {}
  const keep = (next, old) => (next != null && next !== '' ? next : old)
  const reference = keep(entry.reference, prev.reference)
  const figmaNode = keep(entry.figma, prev.figma_node)
  const figmaFile = keep(entry.figmaFile, prev.figma_file)
  const srcVideo = keep(entry.sourceVideo, prev.source_video)
  const srcAt = keep(entry.sourceAt, prev.source_at)
  const row = {
    order: entry.order ?? (i >= 0 ? prev.order : s.sections.length + 1),
    name: entry.name,
    archetype: entry.archetype,
    must_have: entry.mustHave || [],
    reference: reference ?? null,
    ...(keep(entry.viewport, prev.viewport) ? { viewport: keep(entry.viewport, prev.viewport) } : {}),
    ...(figmaNode ? { figma_node: figmaNode } : {}),
    ...(figmaFile ? { figma_file: figmaFile } : {}),
    ...(srcVideo ? { source_video: srcVideo } : {}),
    ...(srcAt != null ? { source_at: srcAt } : {}),
    ...(keep(entry.note, prev.note) ? { note: keep(entry.note, prev.note) } : {}),
  }
  if (i >= 0) s.sections[i] = row; else s.sections.push(row)
  s.sections.sort((a, b) => (a.order || 0) - (b.order || 0))
  return out
}

// PURE: find already-persisted entries for a Figma node. Node ids are unique only WITHIN a file, so a
// bare node match across two different files is AMBIGUOUS — we refuse it rather than risk handing back
// the wrong design (cravinbyandy has four file keys in play). Returns {status, matches}.
//   'hit'       → exactly one match; reuse it, spend no Figma call
//   'miss'      → nothing registered; you may spend one fetch
//   'ambiguous' → same node id in several files; caller must pass --figma-file
export function findFigmaEntry(map, { node, file } = {}) {
  const matches = []
  for (const s of map.surfaces || []) {
    for (const sec of s.sections || []) {
      if (!sec.figma_node || sec.figma_node !== node) continue
      if (file && sec.figma_file && sec.figma_file !== file) continue
      if (file && !sec.figma_file) continue // unknown provenance — don't claim it's this file's node
      matches.push({ ...sec, surface: s.surface })
    }
  }
  if (matches.length === 0) return { status: 'miss', matches }
  if (matches.length > 1) {
    const files = new Set(matches.map(m => m.figma_file || '(unknown)'))
    if (files.size > 1) return { status: 'ambiguous', matches }
  }
  return { status: 'hit', matches }
}

function main() {
  const o = parseArgs(process.argv.slice(2))

  if (o.list) {
    const map = readMap()
    const surfaces = map.surfaces || []
    if (!surfaces.length) { console.log('reference-ingest: no references registered yet (docs/design/reference-map.json absent/empty)'); process.exit(0) }
    for (const s of surfaces) {
      console.log(`\n${s.surface}`)
      for (const sec of s.sections || []) {
        const missing = fs.existsSync(path.resolve(cwd, sec.reference || '')) ? '' : '  ⚠ image missing'
        console.log(`  ${String(sec.order).padStart(2)}. ${sec.name.padEnd(20)} ${String(sec.archetype).padEnd(16)} ${sec.reference || '(no image)'}${missing}`)
      }
    }
    console.log('')
    process.exit(0)
  }

  // Cache probe. Spends NO Figma call — that is the whole point (the MCP is capped on Starter).
  // exit 0 = already persisted, reuse the file. exit 1 = not cached, you may spend one fetch.
  if (o.checkFigma) {
    const { status, matches } = findFigmaEntry(readMap(), { node: o.checkFigma, file: o.figmaFile })
    const label = `${o.figmaFile ? `${o.figmaFile}:` : ''}${o.checkFigma}`
    if (status === 'ambiguous') {
      console.error(`reference-ingest: node ${o.checkFigma} is registered in MULTIPLE Figma files — pass --figma-file to disambiguate.`)
      for (const m of matches) console.error(`  ${m.figma_file || '(unknown file)'} → ${m.surface}/${m.name} → ${m.reference || '(no image)'}`)
      process.exit(2)
    }
    if (status === 'hit') {
      const m = matches[0]
      const onDisk = m.reference && fs.existsSync(path.resolve(cwd, m.reference))
      if (onDisk) {
        console.log(`reference-ingest: CACHED ${label} → ${m.reference}`)
        console.log('  DO NOT call get_screenshot for this node. Read the file above.')
        process.exit(0)
      }
      console.log(`reference-ingest: registered but image MISSING for ${label} (${m.surface}/${m.name}).`)
      console.log('  Fetch it once, then persist with --image so it is never fetched again.')
      process.exit(1)
    }
    console.log(`reference-ingest: NOT CACHED ${label} — you may spend ONE get_screenshot, then persist it:`)
    console.log(`  node toolkit/scripts/reference-ingest.mjs --surface <s> --name <n> --archetype <a> --image <saved.png> --figma ${o.checkFigma}${o.figmaFile ? ` --figma-file ${o.figmaFile}` : ''}`)
    console.log('  If the MCP answers "You\'ve reached the Figma MCP tool call limit", STOP fetching and')
    console.log('  degrade to Path A (design-spec.md) — do not retry, do not build against an unseen design.')
    process.exit(1)
  }

  if (!o.surface || !o.name) die('--surface and --name are required (e.g. --surface home --name hero)')
  if (!o.archetype) die(`--archetype is required. Read the picture FIRST and resolve its structural signals (dots ⇒ slideshow, arrows ⇒ carousel, filter row ⇒ collection-grid …).\n  vocabulary: ${ARCHETYPES.join(' | ')}\n  lookup: ~/.claude/memory/patterns/good/reference-archetype-signals.md`)
  if (!ARCHETYPES.includes(o.archetype)) die(`unknown --archetype "${o.archetype}". Use one of: ${ARCHETYPES.join(' | ')}`)

  // A client walkthrough video is a reference like any other — pull the frame, then persist it.
  let videoRel = null
  let atSeconds = null
  if (o.video) {
    if (o.at == null) die('--video requires --at (e.g. --at 1:30 or --at 90). Survey the recording first:\n  ffmpeg -i <video> -vf "fps=1/25,scale=400:-1,tile=4x5" -frames:v 1 contact.png')
    atSeconds = parseTimestamp(o.at)
    if (atSeconds == null) die(`--at "${o.at}" is not a timestamp. Use seconds (90), M:SS (1:30) or H:MM:SS (00:01:30).`)
    const { file, src } = extractVideoFrame(o.video, atSeconds)
    o.image = file
    videoRel = path.isAbsolute(src) && src.startsWith(cwd) ? path.relative(cwd, src) : path.basename(src)
    if (!o.name) die('--name is required')
    console.log(`reference-ingest: extracted frame @ ${stampFor(atSeconds)} (${atSeconds}s) from ${videoRel}`)
  }

  // Persist the image INSIDE the repo (headless judge reads relative to cwd; never under gate-reports/lens).
  let refRel = null
  if (o.image) {
    const src = path.resolve(o.image.replace(/^~/, process.env.HOME || '~'))
    if (!fs.existsSync(src)) die(`--image not found: ${src}`)
    const ext = (path.extname(src) || '.png').toLowerCase()
    const destDir = path.resolve(cwd, REF_DIR, o.surface)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, `${o.name}${ext}`)
    fs.copyFileSync(src, dest)
    refRel = path.relative(cwd, dest)
    console.log(`reference-ingest: saved image → ${refRel}`)
  } else {
    console.log('reference-ingest: no --image given — registering the STRUCTURED READ only.')
    console.log('  L1 (archetype vs the real section type) still enforces. L2 visual compare needs an image:')
    console.log(`  drop the screenshot in ${REF_DIR}/${o.surface}/ and re-run with --image, or export the Figma node via get_screenshot.`)
  }

  const map = upsertEntry(readMap(), {
    ...o, mustHave: o.mustHave, reference: refRel,
    sourceVideo: videoRel, sourceAt: atSeconds,
  })
  const mapAbs = path.resolve(cwd, MAP_PATH)
  fs.mkdirSync(path.dirname(mapAbs), { recursive: true })
  fs.writeFileSync(mapAbs, `${JSON.stringify(map, null, 2)}\n`)

  console.log(`reference-ingest: registered ${o.surface}/${o.name} → archetype "${o.archetype}"${o.mustHave.length ? ` · must_have: ${o.mustHave.join(', ')}` : ''}`)
  console.log(`  map: ${MAP_PATH}`)
  console.log('  NEXT: run `node toolkit/scripts/check-reference-match.mjs` BEFORE building — it asserts the section you')
  console.log('        chose actually matches this archetype, which is the check that would have caught the')
  console.log('        image-banner-vs-slideshow rebuild. Then build, capture Lens, and run it again to compare pixels.')
  process.exit(0)
}

if (isMain(import.meta.url)) main()
