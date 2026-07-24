#!/usr/bin/env node
// lens-read-eval — MEASURE how accurately the model reads a screenshot, instead of trusting it.
//
// Yash's ask was "screenshot reading should be amazing and high accurate". You cannot improve what you
// do not measure, and the vision reader (lib/vision-read.mjs → reference-capture) had never once been
// scored. This is the number: for every reference image with a HUMAN-CONFIRMED archetype in a
// reference-map.json, run the vision read and check whether it agrees. Accuracy = agreements / total.
//
// SELF-LABELLING GOLDEN SET: every reference the team registers via reference-capture is an
// (image, human-set archetype) pair — the human is the ground truth. So the golden set GROWS as the team
// works; no separate labelling chore. Point --maps at one or more repos (default: the known client repos)
// and it scores every persisted reference that carries a saved image.
//
// Usage:
//   node lens-read-eval.mjs [--maps <dir>[,<dir>...]] [--json] [--min <pct>]
//   node lens-read-eval.mjs --score-only <manifest.json>   # score a hand-authored golden manifest instead
// Env: CLAUDE_BIN, VISION_READ_MODEL, VISION_READ_TIMEOUT_MS
// Exit: 0 = accuracy >= --min (default 0, i.e. report-only) · 1 = below --min · 2 = env error / nothing to score
//
// The SCORING is pure + hermetically tested (scoreReads); only the vision call needs claude.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { ARCHETYPES } from './reference-ingest.mjs'
import { readArchetype, claudeAvailable } from './lib/vision-read.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPOS = [
  '/Users/yashbaldha/Desktop/Shopify Task/cravinbyandy',
  '/Users/yashbaldha/Desktop/Shopify Task/gpt test 1',
]

// PURE: given [{ name, truth, read }] (read may be null when vision was unavailable), compute the report.
// Kept separate + exported so the accuracy math is tested without a browser or a model.
export function scoreReads(rows) {
  const scored = rows.filter(r => r.read && ARCHETYPES.includes(r.read))
  const agree = scored.filter(r => r.read === r.truth)
  const disagree = scored.filter(r => r.read !== r.truth)
  const unavailable = rows.filter(r => !r.read)
  const accuracy = scored.length ? (agree.length / scored.length) : null
  return {
    total: rows.length,
    scored: scored.length,
    agreements: agree.length,
    disagreements: disagree.map(r => ({ name: r.name, truth: r.truth, read: r.read, confidence: r.confidence })),
    unavailable: unavailable.length,
    accuracy, // null when nothing could be scored — never report a fake 100%
  }
}

// Gather (image, human-confirmed archetype) pairs from every reference-map.json under the given repos.
function goldenFromMaps(repos) {
  const rows = []
  for (const repo of repos) {
    const mapPath = path.join(repo, 'docs/design/reference-map.json')
    if (!fs.existsSync(mapPath)) continue
    let map
    try { map = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) } catch { continue }
    for (const s of map.surfaces || []) {
      for (const sec of s.sections || []) {
        if (!sec.archetype || !sec.reference) continue
        const img = path.join(repo, sec.reference)
        if (!fs.existsSync(img)) continue
        rows.push({ name: `${path.basename(repo)}:${s.surface}/${sec.name}`, image: img, truth: sec.archetype })
      }
    }
  }
  return rows
}

function goldenFromManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return (m.cases || m).map(c => ({ name: c.name || path.basename(c.image), image: c.image, truth: c.archetype || c.truth }))
}

async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const minPct = (() => { const i = argv.indexOf('--min'); return i !== -1 ? Number(argv[i + 1]) : 0 })()
  const scoreOnly = (() => { const i = argv.indexOf('--score-only'); return i !== -1 ? argv[i + 1] : null })()
  const repos = (() => {
    const i = argv.indexOf('--maps')
    return i !== -1 && argv[i + 1] ? argv[i + 1].split(',').map(s => s.trim()) : DEFAULT_REPOS
  })()

  const golden = scoreOnly ? goldenFromManifest(scoreOnly) : goldenFromMaps(repos)
  if (!golden.length) {
    console.error('lens-read-eval: nothing to score — no reference images with a confirmed archetype found.\n'
      + '  Register references via `reference-capture.mjs --image ...` (each becomes a labelled pair),\n'
      + '  or pass --score-only <manifest.json> with {cases:[{image, archetype}]}.')
    process.exit(2)
  }
  if (!claudeAvailable()) {
    console.error('lens-read-eval: claude CLI not found — vision reads cannot run, so accuracy cannot be measured.')
    process.exit(2)
  }

  const rows = []
  for (const g of golden) {
    process.stderr.write(`  reading ${g.name} … `)
    const r = await readArchetype(g.image, ARCHETYPES)
    if (r.ok) { rows.push({ ...g, read: r.data.archetype, confidence: r.data.confidence }); process.stderr.write(`${r.data.archetype} (truth ${g.truth}) ${r.data.archetype === g.truth ? 'OK' : 'MISS'}\n`) }
    else { rows.push({ ...g, read: null }); process.stderr.write(`unavailable (${r.reason})\n`) }
  }

  const report = scoreReads(rows)
  const pct = report.accuracy == null ? null : (report.accuracy * 100).toFixed(1)

  if (asJson) { console.log(JSON.stringify({ ...report, accuracyPct: pct }, null, 2)); process.exit(pct != null && Number(pct) < minPct ? 1 : 0) }

  console.log('\nScreenshot-reading accuracy (vision archetype vs human-confirmed ground truth)\n')
  console.log(`  labelled references : ${report.total}`)
  console.log(`  vision scored       : ${report.scored}${report.unavailable ? `  (${report.unavailable} unavailable — not counted)` : ''}`)
  console.log(`  agreements          : ${report.agreements}`)
  console.log(`  ACCURACY            : ${pct == null ? 'n/a (nothing scorable)' : pct + '%'}`)
  if (report.disagreements.length) {
    console.log('\n  disagreements (the model read differently than the human — the cases to review):')
    for (const d of report.disagreements) console.log(`   ${d.name}: read "${d.read}" (conf ${d.confidence}) but human said "${d.truth}"`)
  }
  console.log('\n  This set self-grows: every reference registered via reference-capture adds a labelled pair.')
  process.exit(pct != null && Number(pct) < minPct ? 1 : 0)
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main()
