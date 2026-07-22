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
//        --archetype slideshow --must-have "pagination dots,auto-rotate,no arrows" [--order 1] [--figma 225:1294]
//   node toolkit/scripts/reference-ingest.mjs --list
//
// Image is COPIED to docs/design/references/<surface>/<name>.png (inside the repo so the headless
// judge may read it, and NOT under gate-reports/lens which lens-capture wipes on every run).
// Archetype vocabulary + the signal→archetype lookup: patterns/good/reference-archetype-signals.md
// Exit: 0 ok · 2 usage/env error.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
export function upsertEntry(map, entry) {
  const out = { surfaces: [...(map.surfaces || [])] }
  let s = out.surfaces.find(x => x.surface === entry.surface)
  if (!s) { s = { surface: entry.surface, sections: [] }; out.surfaces.push(s) }
  s.sections = [...(s.sections || [])]
  const i = s.sections.findIndex(x => x.name === entry.name)
  const row = {
    order: entry.order ?? (i >= 0 ? s.sections[i].order : s.sections.length + 1),
    name: entry.name,
    archetype: entry.archetype,
    must_have: entry.mustHave || [],
    reference: entry.reference,
    ...(entry.viewport ? { viewport: entry.viewport } : {}),
    ...(entry.figma ? { figma_node: entry.figma } : {}),
    ...(entry.note ? { note: entry.note } : {}),
  }
  if (i >= 0) s.sections[i] = row; else s.sections.push(row)
  s.sections.sort((a, b) => (a.order || 0) - (b.order || 0))
  return out
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

  if (!o.surface || !o.name) die('--surface and --name are required (e.g. --surface home --name hero)')
  if (!o.archetype) die(`--archetype is required. Read the picture FIRST and resolve its structural signals (dots ⇒ slideshow, arrows ⇒ carousel, filter row ⇒ collection-grid …).\n  vocabulary: ${ARCHETYPES.join(' | ')}\n  lookup: ~/.claude/memory/patterns/good/reference-archetype-signals.md`)
  if (!ARCHETYPES.includes(o.archetype)) die(`unknown --archetype "${o.archetype}". Use one of: ${ARCHETYPES.join(' | ')}`)

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

  const map = upsertEntry(readMap(), { ...o, mustHave: o.mustHave, reference: refRel })
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
