#!/usr/bin/env node
// reference-capture — the ONE entry point that turns "what Yash pasted in chat" into a durable,
// gate-checkable reference. It NORMALISES whatever arrived (a pasted image, an in-repo file, a
// figma.com link, a screen recording) and hands it to reference-ingest.mjs for persistence — it never
// re-implements the reference-map.json schema, the image copy, or the sticky-provenance upsert.
//
// THE GAP THIS CLOSES (S3): reference-ingest + gate #46 already exist, but NOTHING called them, so #46
// was N/A on every build and always passed. A reference that lives only in chat scrollback is
// unverifiable — the documented cause of the same hero being rebuilt 4× in one day (image-banner shipped
// where the reference showed slideshow dots). This makes capture real and automatic.
//
//   node toolkit/scripts/reference-capture.mjs --surface home --name hero --image ~/Desktop/hero.png
//   node toolkit/scripts/reference-capture.mjs --surface home --name hero --file docs/design/hero.png
//   node toolkit/scripts/reference-capture.mjs --surface home --name hero \
//        --figma "https://www.figma.com/design/<key>/x?node-id=225-1294"
//   node toolkit/scripts/reference-capture.mjs --surface home --name hero --archetype slideshow \
//        --video ~/Downloads/walkthrough.mov --at 1:30
//
// Modes are mutually exclusive except --figma, which doubles as PROVENANCE when combined with --image
// (persist a fetched Figma screenshot: --image saved.png --figma 225:1294 --figma-file <key>).
// Archetype vocabulary + the signal→archetype lookup: patterns/good/reference-archetype-signals.md
// Exit: 0 ok · 2 usage/env error (mirrors reference-ingest).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { ARCHETYPES, readMap, upsertEntry, parseTimestamp } from './reference-ingest.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const INGEST = path.join(HERE, 'reference-ingest.mjs')
const cwd = process.cwd()
const MAP_PATH = 'docs/design/reference-map.json'

const die = (msg) => { console.error(`reference-capture: ${msg}`); process.exit(2) }
const expand = (p) => path.resolve(String(p).replace(/^~/, process.env.HOME || '~'))

// ── PURE: parse a Figma reference into { fileKey, nodeId } ────────────────────
// Accepts a full figma.com URL (design/file/proto/board) or a bare node id ("225:1294" / "225-1294").
// Figma URLs carry the node as node-id=225-1294 (dash) while the MCP + API address it as 225:1294
// (colon) — we normalise to colon so the cache key matches what reference-ingest stores. Node ids are
// unique only WITHIN a file, so fileKey is captured whenever present. Returns null if neither is found.
export function parseFigmaUrl(input) {
  const s = String(input || '').trim()
  if (!s) return null
  let fileKey = null
  let nodeId = null
  const fk = s.match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/i)
  if (fk) fileKey = fk[1]
  const nid = s.match(/[?&]node-id=([^&\s]+)/i)
  if (nid) nodeId = decodeURIComponent(nid[1]).replace(/-/g, ':')
  else if (!fileKey && /^\d+[:-]\d+$/.test(s)) nodeId = s.replace(/-/g, ':')
  if (!fileKey && !nodeId) return null
  return { fileKey, nodeId }
}

// ── Signal → archetype, distilled from reference-archetype-signals.md ─────────
// Deliberately CONSERVATIVE. An image is a binary here (no vision), so we infer only from the TEXT the
// agent gave us — the section name, --must-have descriptors, --note and the source filename. A bare
// "hero"/"banner" is never enough; an ambiguous or empty match returns null so the caller ASKS for
// --archetype rather than shipping the wrong component (the image-banner-vs-slideshow rebuild).
const SIGNAL_ARCHETYPE = [
  [/pagination dots?|\bdots?\b|multiple slides?|slide ?show|auto[- ]?rotate/i, 'slideshow'],
  [/\bcarousel\b|left ?\/ ?right arrows?|\barrows?\b|swipe|scrollable|partially[- ]cut/i, 'carousel'],
  [/collection[- ]grid|filter[- ](row|bar|sort)|filter and sort|product matrix/i, 'collection-grid'],
  [/featured[- ](collection|grid|products?)|product cards? grid|\bmulticolumn\b/i, 'featured-grid'],
  [/\baccordion\b|chevrons?|collapsibl\w*|expand(able)?|\bfaqs?\b/i, 'accordion'],
  [/\btabbed\b|\btabs?\b|tab labels?/i, 'tabbed'],
  [/add[- ]to[- ]cart|variant picker|main[- ]product|product[- ](page|detail)/i, 'main-product'],
  [/\bmarquee\b|\bticker\b|scrolling[- ](strip|text|band)/i, 'marquee'],
  [/logo[- ](list|row|strip|cloud|wall)|\blogos\b|brand logos/i, 'logo-list'],
  [/testimonials?|customer quotes?|\breviews?\b/i, 'testimonials'],
  [/image[- ](with|and|beside)[- ]text|text beside (an? )?image/i, 'image-with-text'],
  [/\bvideo\b|play[- ](button|control)/i, 'video'],
  [/newsletter|email[- ](sign[- ]?up|signup|capture)|subscribe form/i, 'newsletter'],
  [/announcement[- ]bar|sticky[- ]bar/i, 'announcement'],
  [/rich[- ]text/i, 'rich-text'],
  [/image[- ]banner|single[- ](image|slide|graphic)|flat[- ](graphic|banner)/i, 'image-banner'],
]

// PURE: resolve an archetype from an explicit flag or the available text signals.
// Returns { archetype, source:'explicit'|'signals', signal } on success; { archetype:null, candidates }
// when nothing/many match; { archetype:null, error } for an invalid explicit value.
export function resolveArchetype({ archetype, name, mustHave, note, file } = {}) {
  if (archetype) {
    if (!ARCHETYPES.includes(archetype)) return { archetype: null, error: `unknown --archetype "${archetype}"` }
    return { archetype, source: 'explicit' }
  }
  const raw = [name, ...(mustHave || []), note, file ? path.basename(String(file)) : '']
    .filter(Boolean).join(' ')
  // Drop negated phrases first: the canonical slideshow must_have is "pagination dots, auto-rotate, no
  // arrows" — without this, "no arrows" would also match the carousel signal and make it ambiguous.
  const hay = raw.replace(/\b(no|without|not|never|non)[- ]?[\w-]+/gi, ' ')
  const hits = []
  for (const [re, a] of SIGNAL_ARCHETYPE) if (re.test(hay) && !hits.includes(a)) hits.push(a)
  // Documented disambiguator: "Dots and arrows → slideshow (dots win)."
  if (hits.length === 2 && hits.includes('slideshow') && hits.includes('carousel')) {
    return { archetype: 'slideshow', source: 'signals', signal: 'dots+arrows→slideshow' }
  }
  if (hits.length === 1) {
    const m = hay.match(SIGNAL_ARCHETYPE.find(([, a]) => a === hits[0])[0])
    return { archetype: hits[0], source: 'signals', signal: m ? m[0].trim() : undefined }
  }
  return { archetype: null, candidates: hits }
}

// PURE: a stable section name from a file path — basename minus extension, kebab-cased, so a pasted
// "Hero Slideshow v2.png" registers as "hero-slideshow-v2".
export function deriveName(filePath) {
  const s = String(filePath || '')
  const base = path.basename(s, path.extname(s))
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null
}

// PURE: is `abs` inside `root`? Decides whether --file must be copied in (outside) or referenced in
// place (inside — never duplicate a file the repo already tracks).
export function isInsideRepo(abs, root) {
  const rel = path.relative(root, abs)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function parseArgs(argv) {
  const o = { mustHave: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--surface') o.surface = argv[++i]
    else if (a === '--name') o.name = argv[++i]
    else if (a === '--image') o.image = argv[++i]
    else if (a === '--file') o.file = argv[++i]
    else if (a === '--figma') o.figma = argv[++i]
    else if (a === '--figma-file') o.figmaFile = argv[++i]
    else if (a === '--video') o.video = argv[++i]
    else if (a === '--at') o.at = argv[++i]
    else if (a === '--archetype') o.archetype = argv[++i]
    else if (a === '--must-have') o.mustHave = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--order') o.order = argv[++i]
    else if (a === '--note') o.note = argv[++i]
    else if (a === '--viewport') o.viewport = argv[++i]
  }
  return o
}

// VISION pre-resolve (2026-07-24): before falling back to text signals, actually LOOK at the image. This
// is the difference between reading a screenshot and asking the human to describe it — Yash's "screenshot
// reading should be amazing and high accurate". Only runs when there is an image AND no explicit
// --archetype (an explicit flag is the human overriding, and always wins). On any failure it returns
// null and the caller drops to the text-signal path — a vision read that could not happen must never
// invent an archetype. Mutates o.archetype so the sync mustArchetype() downstream treats it as explicit,
// and records the visible signals into --must-have so gate #46 L1 has them.
async function visionPreResolve(o, imgPath) {
  if (o.archetype || !imgPath || process.env.REFERENCE_CAPTURE_NO_VISION === '1') return
  let readArchetype
  try { ({ readArchetype } = await import('./lib/vision-read.mjs')) } catch { return }
  let r
  try { r = await readArchetype(imgPath, ARCHETYPES) } catch { return }
  if (!r || !r.ok) {
    console.log(`reference-capture: vision read unavailable (${r ? r.reason : 'import failed'}) — falling back to text signals.`)
    return
  }
  const { archetype, signals, confidence } = r.data
  // Low confidence is not a licence to guess — leave it for the text path / the ask-don't-guess degrade.
  if (typeof confidence === 'number' && confidence < 55) {
    console.log(`reference-capture: vision read was low-confidence (${confidence}) — not trusting it; using text signals.`)
    return
  }
  o.archetype = archetype
  o._visionRead = true
  if (Array.isArray(signals) && signals.length && !o.mustHave.length) o.mustHave = signals.slice(0, 8)
  console.log(`reference-capture: VISION read the image → archetype "${archetype}" (confidence ${confidence}). Override with --archetype if wrong.`)
}

// Resolve an archetype or DIE with a signal-literate message (the honest "ask, don't guess" degrade).
function mustArchetype(o, file) {
  const r = resolveArchetype({ archetype: o.archetype, name: o.name, mustHave: o.mustHave, note: o.note, file })
  if (r.error) die(`${r.error}. Use one of: ${ARCHETYPES.join(' | ')}`)
  if (r.archetype) {
    if (r.source === 'signals') console.log(`reference-capture: archetype "${r.archetype}" inferred from signal "${r.signal}" — override with --archetype if that read is wrong.`)
    return r.archetype
  }
  const amb = r.candidates && r.candidates.length
    ? ` — the signals point to several (${r.candidates.join(', ')})`
    : ' — no clear structural signal in the name / --must-have'
  die(`could not resolve an archetype for "${o.name}"${amb}.\n`
    + `  Read the picture's structural signals and pass --archetype <one of: ${ARCHETYPES.join(' | ')}>.\n`
    + `  Do NOT guess — the wrong archetype is the image-banner-vs-slideshow rebuild.\n`
    + `  Lookup: ~/.claude/memory/patterns/good/reference-archetype-signals.md`)
}

// --figma passed alongside --image/--file records provenance. Normalise to node id + file key so the
// cache probe (--check-figma) later finds it.
function figmaProvenance(o) {
  if (!o.figma) return { flags: [], node: undefined, fileKey: undefined }
  const p = parseFigmaUrl(o.figma)
  const node = (p && p.nodeId) || o.figma
  const fileKey = o.figmaFile || (p && p.fileKey) || null
  return { flags: ['--figma', node, ...(fileKey ? ['--figma-file', fileKey] : [])], node, fileKey: fileKey || undefined }
}

// Persist via reference-ingest — the single source of the copy + map write. stdio inherited so the
// agent sees its confirmation; we add our own compact summary afterwards.
function runIngest(args) {
  const r = spawnSync(process.execPath, [INGEST, ...args], { cwd, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status || 2)
}

function finishSummary(surface, name) {
  const map = readMap(cwd)
  const s = (map.surfaces || []).find(x => x.surface === surface)
  const entry = s ? (s.sections || []).find(x => x.name === name) || null : null
  console.log('\nreference-capture: reference-map.json entry —')
  console.log(entry
    ? JSON.stringify(entry, null, 2).split('\n').map(l => `  ${l}`).join('\n')
    : '  (entry not found — registration may have failed)')
  console.log('\nNEXT (run BEFORE building): node toolkit/scripts/check-reference-match.mjs')
  console.log('  It asserts the section you build matches this archetype (L1) — the check that catches the')
  console.log('  image-banner-vs-slideshow miss before it ships.')
  process.exit(entry ? 0 : 2)
}

function captureImage(o) {
  const src = expand(o.image)
  if (!fs.existsSync(src)) die(`--image not found: ${src}`)
  const arch = mustArchetype(o, src)
  const prov = figmaProvenance(o)
  runIngest([
    '--surface', o.surface, '--name', o.name, '--archetype', arch, '--image', src,
    ...(o.mustHave.length ? ['--must-have', o.mustHave.join(',')] : []),
    ...(o.order != null ? ['--order', String(o.order)] : []),
    ...(o.note ? ['--note', o.note] : []),
    ...(o.viewport ? ['--viewport', o.viewport] : []),
    ...prov.flags,
  ])
  finishSummary(o.surface, o.name)
}

function captureFile(o) {
  const src = expand(o.file)
  if (!fs.existsSync(src)) die(`--file not found: ${src}`)
  const arch = mustArchetype(o, src)
  if (!isInsideRepo(src, cwd)) {
    // Outside the repo → it behaves exactly like --image (copy it in so the headless judge can read it).
    console.log('reference-capture: --file is outside the repo — copying it in (same as --image).')
    return captureImage({ ...o, image: o.file })
  }
  // Inside the repo → register the EXISTING path; never duplicate a file the repo already tracks.
  const refRel = path.relative(cwd, src)
  const prov = figmaProvenance(o)
  const map = upsertEntry(readMap(cwd), {
    surface: o.surface, name: o.name, archetype: arch, mustHave: o.mustHave,
    reference: refRel,
    order: o.order != null ? Number(o.order) : undefined,
    note: o.note, viewport: o.viewport,
    figma: prov.node, figmaFile: prov.fileKey,
  })
  const abs = path.resolve(cwd, MAP_PATH)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, `${JSON.stringify(map, null, 2)}\n`)
  console.log(`reference-capture: registered ${o.surface}/${o.name} → "${arch}" using in-repo ${refRel} (not copied).`)
  finishSummary(o.surface, o.name)
}

function captureVideo(o) {
  const src = expand(o.video)
  if (!fs.existsSync(src)) die(`--video not found: ${src}`)
  if (o.at == null) die('--video requires --at (the timestamp of the frame), e.g. --at 1:30 or --at 90.')
  if (parseTimestamp(o.at) == null) die(`--at "${o.at}" is not a timestamp — use seconds (90), M:SS (1:30) or H:MM:SS (00:01:30).`)
  const arch = mustArchetype(o, src)
  if (!spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' }).stdout) {
    die('ffmpeg is required to pull a frame from a video (brew install ffmpeg).\n'
      + '  Or screenshot the exact frame yourself and register it with --image instead.')
  }
  // Survey the recording so the right --at is easy to pick — a contact sheet at 1 frame / 25s.
  // Best-effort: the frame extraction that reference-ingest does is what actually persists the reference.
  try {
    const sheet = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'refcap-')), 'contact.png')
    const s = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-vf', 'fps=1/25,scale=400:-1,tile=4x5', '-frames:v', '1', sheet, '-y'], { encoding: 'utf-8' })
    if (s.status === 0 && fs.existsSync(sheet)) console.log(`reference-capture: contact sheet (survey) → ${sheet}`)
  } catch { /* survey is optional */ }
  runIngest([
    '--surface', o.surface, '--name', o.name, '--archetype', arch,
    '--video', src, '--at', String(o.at),
    ...(o.mustHave.length ? ['--must-have', o.mustHave.join(',')] : []),
    ...(o.order != null ? ['--order', String(o.order)] : []),
    ...(o.note ? ['--note', o.note] : []),
    ...(o.viewport ? ['--viewport', o.viewport] : []),
  ])
  finishSummary(o.surface, o.name)
}

function captureFigma(o) {
  const parsed = parseFigmaUrl(o.figma)
  if (!parsed || !parsed.nodeId) die(`--figma "${o.figma}" carries no node id. Paste the Figma URL with ?node-id=… (or a bare "225:1294").`)
  const node = parsed.nodeId
  const fileKey = o.figmaFile || parsed.fileKey || null

  // Cache PROBE first — spends NO Figma call (the Starter-plan MCP cap has killed builds mid-run). We
  // cannot call the Figma MCP from a script, so we emit the exact commands the agent must run.
  const probe = spawnSync(process.execPath, [INGEST, '--check-figma', node, ...(fileKey ? ['--figma-file', fileKey] : [])], { cwd, stdio: 'inherit' })
  if (probe.status === 2) process.exit(2) // ambiguous across files — reference-ingest already explained

  const r = resolveArchetype({ archetype: o.archetype, name: o.name, mustHave: o.mustHave, note: o.note })
  const archFlag = r.archetype ? `--archetype ${r.archetype}` : '--archetype <read the node: dots⇒slideshow, arrows⇒carousel, …>'
  const fileFlag = fileKey ? ` --figma-file ${fileKey}` : ''

  console.log('\nreference-capture: FIGMA — a script cannot call the Figma MCP; do these two steps:')
  if (probe.status === 0) {
    console.log('  1. This node is ALREADY cached (above) — DO NOT call get_screenshot; reuse the file on disk.')
  } else {
    console.log(`  1. Fetch ONCE via the Figma MCP:  get_screenshot(nodeId="${node}"${fileKey ? `, fileKey="${fileKey}"` : ''})  → save the PNG.`)
    console.log('     If the MCP answers "You\'ve reached the Figma MCP tool call limit on the Starter plan":')
    console.log('     STOP — do NOT retry. Degrade to design-spec (Path A) and build from docs/design/design-spec.md.')
  }
  console.log('  2. Persist it (so it is never fetched twice):')
  console.log(`     node toolkit/scripts/reference-capture.mjs --surface ${o.surface} --name ${o.name} --image <saved.png> ${archFlag} --figma ${node}${fileFlag}`)
  console.log('\n  Then, BEFORE building: node toolkit/scripts/check-reference-match.mjs')
  process.exit(0)
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  // --figma is a MODE on its own, but PROVENANCE when combined with a real asset (--image/--file/--video).
  const modes = []
  if (o.image) modes.push('image')
  if (o.file) modes.push('file')
  if (o.video) modes.push('video')
  if (o.figma && !o.image && !o.file && !o.video) modes.push('figma')
  if (modes.length === 0) {
    die('one of --image | --file | --figma | --video is required.\n'
      + '  --image <path>   a pasted/attached image on disk → copied into docs/design/references/\n'
      + '  --file  <path>   a file already in the repo → referenced in place (not copied)\n'
      + '  --figma <url>    a figma.com link/node → probe cache + print the fetch+persist commands\n'
      + '  --video <path> --at <ts>   a screen recording → survey + persist one frame')
  }
  if (modes.length > 1) die(`pass exactly one primary of --image | --file | --figma | --video (got ${modes.map(m => `--${m}`).join(', ')}).`)
  const mode = modes[0]

  if (!o.surface) die('--surface is required (e.g. --surface home).')
  if (!o.name) {
    const source = o.image || o.file || o.video
    o.name = source ? deriveName(source) : null
  }
  if (!o.name) die('--name is required (and could not be derived from the input).')

  if (mode === 'figma') return captureFigma(o)
  if (mode === 'video') return captureVideo(o)
  // An image/file with no explicit archetype → LOOK at it before falling back to text signals.
  if (mode === 'image') { await visionPreResolve(o, expand(o.image)); return captureImage(o) }
  await visionPreResolve(o, expand(o.file))
  return captureFile(o)
}

if (isMain(import.meta.url)) main()
