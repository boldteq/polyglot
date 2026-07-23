#!/usr/bin/env node
// Gate #46 check-reference-match — "does the build match the picture the client sent?"
//
// THE GAP THIS CLOSES (cravinbyandy, 2026-07-21): the homepage hero shipped as Dawn's single-image
// `image-banner` when the client's reference screenshots showed multiple slides with DOT INDICATORS.
// It passed ~20 green gates (theme-check 0 errors, layout/mobile/consistency pass, 4/4 device toggle,
// 6-page regression sweep) and was pushed live, then rebuilt — 4 rounds in one day. Every existing
// gate scores CODE HEALTH or INTERNAL premium-ness; Lens (#18) is deliberately design-BLIND. Nothing
// ever compared the build to the reference, so nothing could catch the dots.
//
// TWO LAYERS:
//   L1 STRUCTURAL (deterministic, no vision, BLOCKS) — the declared `archetype` in
//      docs/design/reference-map.json vs the ACTUAL section type in templates/*.json.
//      slideshow-declared but image-banner-built ⇒ BLOCK, before anything is rendered.
//      Conservative by design: only blocks when a conflict or absence is PROVABLE; an unrecognised
//      custom section type is unverifiable → warn, never a false block.
//   L2 VISUAL (vision judge, warn-only until REFERENCE_MATCH_ENFORCE=1) — feeds the reference image
//      AND the rendered Lens frame to one `claude -p` call and records the divergences. Own verdict
//      dir (gate-reports/lens/reference-judge/) so gate #18's independent judge stays untouched.
//
// N/A when nothing is declared (mirrors gate #20) → `ref.n-a-no-reference-declared` warn + PASS, so
// every existing repo keeps working. (`*.n-a-*` is warn-by-design for gate #45 skip≠pass.)
//
// Usage: node check-reference-match.mjs   Env: REPORT_DIR · REFERENCE_MATCH_ENFORCE=1 · LENS_JUDGE_MODEL
//        · CLAUDE_BIN · REFERENCE_MATCH_TIMEOUT_MS   Exit: 0 pass · 1 block · 2 env error
// Signal→archetype lookup: ~/.claude/memory/patterns/good/reference-archetype-signals.md

import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const JUDGE_DIR = path.join(LENS_DIR, 'reference-judge')   // NOT judge/ — #18 vacuums that dir
const MAP_PATH = 'docs/design/reference-map.json'
const ENFORCE = process.env.REFERENCE_MATCH_ENFORCE === '1'
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const JUDGE_MODEL = process.env.LENS_JUDGE_MODEL || 'sonnet'
const JUDGE_TIMEOUT_MS = Number(process.env.REFERENCE_MATCH_TIMEOUT_MS || 6 * 60 * 1000)

const blockers = []
const warnings = []
const add = (arr, id, page, detail, evidence = '') => arr.push({ id, page, detail, evidence: String(evidence || '') })

// ── Known Shopify section type → archetype. A type NOT listed here is a custom section we cannot
// classify, so it can never produce a false block (see resolveEntry). Keep in lockstep with
// reference-archetype-signals.md + reference-ingest.mjs ARCHETYPES.
export const TYPE_ARCHETYPE = {
  'slideshow': 'slideshow',
  'image-banner': 'image-banner',
  'main-collection-product-grid': 'collection-grid',
  'featured-collection': 'featured-grid',
  'multicolumn': 'featured-grid',
  'collapsible-content': 'accordion',
  'main-product': 'main-product',
  'featured-product': 'main-product',
  'video': 'video',
  'newsletter': 'newsletter',
  'announcement-bar': 'announcement',
  'image-with-text': 'image-with-text',
  'rich-text': 'rich-text',
  'slideshow-banner': 'slideshow',
}

const stripJsonComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const readJson = (p) => JSON.parse(stripJsonComments(fs.readFileSync(p, 'utf-8')))

// surface → template file (Shopify convention: home = index.json, others = page.<surface>.json | <surface>.json)
function templateFor(surface) {
  const cands = [`templates/${surface === 'home' ? 'index' : surface}.json`, `templates/page.${surface}.json`]
  for (const c of cands) { const abs = path.resolve(cwd, c); if (fs.existsSync(abs)) return { rel: c, abs } }
  return null
}

function sectionsOf(tplAbs) {
  try {
    const j = readJson(tplAbs)
    return Object.entries(j.sections || {}).map(([key, v]) => ({ key, type: (v && v.type) || '' }))
  } catch { return null }
}

// PURE: decide one declared entry against the sections actually present. Conservative:
// block only on a PROVABLE conflict/absence; unknown custom types are unverifiable → warn.
export function resolveEntry(entry, sections) {
  const declared = entry.archetype
  if (!declared) return { kind: 'warn', id: 'ref.no-archetype', detail: `"${entry.name}" has no declared archetype — read the reference's structural signals (dots ⇒ slideshow, arrows ⇒ carousel …) and record one` }
  if (!sections || !sections.length) return { kind: 'block', id: 'ref.template-empty', detail: `no sections found in the template for "${entry.name}"` }

  // pinned: the map names the exact template section (key or type)
  if (entry.section) {
    const hit = sections.find(s => s.key === entry.section || s.type === entry.section)
    if (!hit) return { kind: 'block', id: 'ref.section-missing', detail: `declared section "${entry.section}" for "${entry.name}" does not exist in the template (found: ${sections.map(s => s.type).join(', ') || 'none'})` }
    const actual = TYPE_ARCHETYPE[hit.type]
    if (actual && actual !== declared) return { kind: 'block', id: 'ref.archetype-mismatch', detail: `"${entry.name}" must be a ${declared} per the reference, but the build uses "${hit.type}" (${actual}). ${signalHint(declared)}` }
    if (!actual) return { kind: 'warn', id: 'ref.archetype-unverifiable', detail: `"${entry.name}" uses custom section "${hit.type}" — cannot verify it implements ${declared}; confirm by eye or pin a known type` }
    return { kind: 'pass' }
  }

  // unpinned: is ANY section of the declared archetype present on this surface?
  const known = sections.filter(s => TYPE_ARCHETYPE[s.type])
  const unknown = sections.filter(s => !TYPE_ARCHETYPE[s.type])
  if (known.some(s => TYPE_ARCHETYPE[s.type] === declared)) return { kind: 'pass' }
  if (unknown.length) return { kind: 'warn', id: 'ref.archetype-unverifiable', detail: `no stock ${declared} section on this surface; ${unknown.length} custom section(s) (${unknown.map(s => s.type).slice(0, 4).join(', ')}) may implement it — confirm, or pin it with "section" in ${MAP_PATH}` }
  return { kind: 'block', id: 'ref.archetype-absent', detail: `the reference declares "${entry.name}" as a ${declared}, but this surface has no such section — found: ${known.map(s => `${s.type} (${TYPE_ARCHETYPE[s.type]})`).join(', ')}. ${signalHint(declared)}` }
}

function signalHint(a) {
  const h = {
    slideshow: 'Pagination dots in a reference mean MORE THAN ONE SLIDE — never a single-image section.',
    carousel: 'Arrows / a partially-cut card at the edge mean horizontally scrollable.',
    'collection-grid': 'A filter/sort row above a product matrix means the collection grid.',
    accordion: 'Chevrons / +− on stacked rows that expand mean an accordion.',
  }[a]
  return h ? `SIGNAL: ${h}` : ''
}

// ── L2 · visual compare (reference image vs rendered Lens frame) ──────────────
function lensFrameFor(surface, viewport) {
  try {
    const m = readJson(path.join(LENS_DIR, 'lens-manifest.json'))
    const frames = (m.frames || []).filter(f => f.surface === surface && f.frames && f.frames.rest)
    if (!frames.length) return null
    const pick = (viewport && frames.find(f => f.viewport === viewport)) || frames.find(f => f.viewport === 'desktop') || frames[0]
    return { abs: path.join(LENS_DIR, pick.frames.rest), viewport: pick.viewport }
  } catch { return null }
}

function judgeOne(entry, refAbs, frame) {
  const outPath = path.join(JUDGE_DIR, `${entry.surface}-${entry.name}.json`)
  const prompt = [
    `You are comparing a BUILT Shopify page against the CLIENT'S REFERENCE design. Report only real, visible divergences.`,
    `REFERENCE (what the client asked for) = ${refAbs}`,
    `RENDERED (what we built, ${frame.viewport} viewport) = ${frame.abs}`,
    `Read BOTH images. The rendered frame is a real browser screenshot at the ${frame.viewport} viewport and may differ in absolute pixel dimensions, device pixel ratio, font rasterisation, and real content vs placeholder — those are NOT divergences. Judge STRUCTURE, LAYOUT, TYPE HIERARCHY, COLOUR, SPACING RHYTHM and CONTENT PARITY.`,
    `The section under review is "${entry.name}" (declared archetype: ${entry.archetype}${(entry.must_have || []).length ? `; must have: ${entry.must_have.join(', ')}` : ''}).`,
    `IMPORTANT — do NOT report a divergence for anything you cannot actually SEE in these two still frames. Both are static rest-state screenshots: BEHAVIOURAL or STATE-DEPENDENT signals (auto-rotate, transitions, hover/focus states, autoplay, a dot that is only painted after JS init, anything on a later slide) are NOT verifiable here and are enforced structurally by gate #46 L1 instead. Judge ONLY what is visibly present in BOTH images. If the two frames show the same layout and content, report NO findings.`,
    `Report a "blocker" ONLY for a divergence a client would call wrong: a missing/extra element, the wrong component behaviour (e.g. a single static image where the reference shows a multi-slide carousel with dots), wrong ordering, or a clearly different layout. Everything smaller (a few px of spacing, a slight tone difference) is a "warning".`,
    `Write ONLY a JSON file to EXACTLY this path: ${outPath}`,
    `JSON shape: {"surface":"${entry.surface}","section":"${entry.name}","verdict":"PASS"|"FAIL","confidence":0-100,"findings":[{"check":"layout|type|color|spacing|content-parity|component-parity","severity":"blocker"|"warning","evidence":"<what differs + where>","fix_owner":"loom|drape|ink|porter|conduit"}]}`,
    `Do not print anything else.`,
  ].join('\n\n')

  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', JUDGE_MODEL, '--no-session-persistence', '--allowedTools', 'Read,Write'], { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } }, JUDGE_TIMEOUT_MS)
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', () => {
      clearTimeout(timer)
      try { resolve(readJson(outPath)) } catch { resolve(null) }
    })
  })
}

function finish(pass, evidence) {
  writeReport('reference-match', 46, { cwd, pass, blockers, warnings, evidence, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`reference-match: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)${ENFORCE ? '' : ' · L2 visual is warn-only (set REFERENCE_MATCH_ENFORCE=1 to enforce)'}`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

async function main() {
  const mapAbs = path.resolve(cwd, MAP_PATH)
  if (!fs.existsSync(mapAbs)) {
    add(warnings, 'ref.n-a-no-reference-declared', MAP_PATH, 'no reference map — nothing to match against. Register what the client sent: `node toolkit/scripts/reference-ingest.mjs --surface <s> --name <n> --archetype <a> [--image <path>]`')
    return finish(true, { declared: 0, mode: 'n/a' })
  }
  let map
  try { map = readJson(mapAbs) } catch (e) {
    add(blockers, 'ref.map-invalid', MAP_PATH, `reference map is not valid JSON: ${e.message}`)
    return finish(false, { mode: 'invalid' })
  }
  const entries = []
  for (const s of (map.surfaces || [])) for (const sec of (s.sections || [])) entries.push({ ...sec, surface: s.surface })
  if (!entries.length) {
    add(warnings, 'ref.n-a-no-reference-declared', MAP_PATH, 'reference map has no sections declared — nothing to match against')
    return finish(true, { declared: 0, mode: 'n/a' })
  }

  // ── L1 structural ──────────────────────────────────────────────────────────
  let l1Pass = 0
  const bySurface = new Map()
  for (const e of entries) {
    if (!bySurface.has(e.surface)) {
      const tpl = templateFor(e.surface)
      bySurface.set(e.surface, tpl ? { tpl, sections: sectionsOf(tpl.abs) } : null)
    }
    const ctx = bySurface.get(e.surface)
    const page = ctx ? ctx.tpl.rel : `templates/${e.surface}`
    if (!ctx) { add(blockers, 'ref.template-missing', page, `no template found for surface "${e.surface}" — the reference declares sections for a page that does not exist`); continue }
    if (ctx.sections === null) { add(blockers, 'ref.template-invalid', page, `template JSON could not be parsed`); continue }
    const r = resolveEntry(e, ctx.sections)
    if (r.kind === 'block') add(blockers, r.id, page, r.detail)
    else if (r.kind === 'warn') add(warnings, r.id, page, r.detail)
    else l1Pass += 1
  }

  // ── L2 visual (only for entries with a persisted image + a rendered frame) ──
  const withImage = entries.filter(e => e.reference && fs.existsSync(path.resolve(cwd, e.reference)))
  let judged = 0, noFrame = 0
  if (withImage.length) {
    if (spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' }).error) {
      add(warnings, 'ref.judge-unavailable', MAP_PATH, `claude CLI not found (${CLAUDE_BIN}) — L1 structural ran, visual compare skipped`)
    } else {
      fs.mkdirSync(JUDGE_DIR, { recursive: true })
      for (const e of withImage) {
        const frame = lensFrameFor(e.surface, e.viewport)
        if (!frame || !fs.existsSync(frame.abs)) { noFrame += 1; continue }
        const v = await judgeOne(e, path.resolve(cwd, e.reference), frame)
        if (!v) { add(warnings, 'ref.judge-failed', e.surface, `visual compare produced no verdict for "${e.name}"`); continue }
        judged += 1
        for (const f of (v.findings || [])) {
          const detail = `${e.surface}/${e.name}: ${f.check} — ${f.evidence}${f.fix_owner ? ` (→ ${f.fix_owner})` : ''}`
          const isBlocker = f.severity === 'blocker'
          if (isBlocker && ENFORCE) add(blockers, `ref.${f.check}`, e.surface, detail.slice(0, 240))
          else add(warnings, isBlocker ? `ref.${f.check}` : 'ref.divergence', e.surface, `${isBlocker && !ENFORCE ? '[would BLOCK under REFERENCE_MATCH_ENFORCE=1] ' : ''}${detail}`.slice(0, 240))
        }
      }
    }
  }
  if (noFrame) add(warnings, 'ref.no-rendered-frame', 'gate-reports/lens', `${noFrame} reference(s) had no rendered Lens frame to compare against — run lens-capture (or lens-quick --surfaces <s>) then re-run`)
  if (!withImage.length) add(warnings, 'ref.no-reference-image', MAP_PATH, `${entries.length} reference(s) declared with no saved image — L1 (archetype) enforced, visual compare unavailable. Save the screenshot via reference-ingest --image, or export the Figma node.`)

  finish(blockers.length === 0, { declared: entries.length, l1Pass, judged, enforced: ENFORCE })
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`reference-match: ENV-ERROR — ${e.message}`); process.exit(2) })
}
