#!/usr/bin/env node
// #23/#24/#25 — copy-quality gate (#26). ink's Definition-of-Done, made machine-checkable. Three checks:
//   #23 copy.hero-formula      — a hero brief must declare `hero_formula: <name>` + a citation
//                                (`hero_citation:` or a `Decoder:` brand) — hero copy chosen by a proven
//                                formula, not vibes.
//   #24 copy.objection-uncovered — every objection the brief LISTS must be ADDRESSED somewhere (brief
//                                body / FAQ / theme copy) — an objection raised but never answered leaks.
//   #25 copy.voice-reference   — a voice reference exists (content/voice.md or a brand-direction Voice
//                                section) so copy has one consistent voice to hold to.
// Warn-first (Phase A; COPY_ENFORCE=1 / DS_REQUIRE_SCOPE=1 → BLOCK after proving on ≥2 stores — same
// doctrine as #23/#24). SKIPS cleanly when there are no content/briefs (not a brief-driven build).
//
// Env: BRIEFS_DIR (content/briefs) · BRAND_FILE (docs/design/brand-direction.md) · VOICE_FILE (content/voice.md)
//      · COPY_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (→ BLOCK) · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// parseObjections / coverageGaps / heroFormulaDeclared are PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BRIEFS_DIR = process.env.BRIEFS_DIR || 'content/briefs'
const BRAND_FILE = process.env.BRAND_FILE || 'docs/design/brand-direction.md'
const VOICE_FILE = process.env.VOICE_FILE || 'content/voice.md'
const ENFORCE = process.env.COPY_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const finding = (id, page, detail, evidence) => (ENFORCE ? add(blockers, id, page, detail, evidence) : add(warnings, id, page, detail, evidence))

// ── PURE helpers ────────────────────────────────────────────────────────────────
// objections declared as `objections:` (inline `a; b`) or a heading/line followed by a `-`/`*` list.
export function parseObjections(text) {
  const out = []
  const lines = String(text || '').split('\n')
  let inBlock = false
  for (const line of lines) {
    const head = line.match(/^\s*(?:#+\s*)?objections\s*:?(.*)$/i)
    if (head) {
      const inline = (head[1] || '').trim()
      if (inline) { for (const o of inline.split(/[;,]/).map(s => s.trim()).filter(Boolean)) out.push(o); inBlock = false }
      else inBlock = true
      continue
    }
    if (inBlock) {
      const m = line.match(/^\s*[-*]\s+(.*\S)/)
      if (m) out.push(m[1].trim())
      else if (line.trim() === '' || /^\s*#/.test(line)) inBlock = false
    }
  }
  return out
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'is', 'it', 'for', 'with', 'my', 'our', 'your', 'will', 'can', 'that', 'this', 'are', 'be', 'no', 'not', 'do', 'does', 'too', 'how', 'what', 'when', 'why', 'about'])
function keyTerms(s) { return [...new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w)))] }

// an objection is "covered" if ≥half its content terms appear in the corpus (brief body + theme copy).
export function coverageGaps(objections, corpus) {
  const hay = String(corpus || '').toLowerCase()
  const gaps = []
  for (const obj of objections || []) {
    const terms = keyTerms(obj)
    if (!terms.length) continue
    const hits = terms.filter(t => hay.includes(t)).length
    if (hits / terms.length < 0.5) gaps.push(obj)
  }
  return gaps
}

export function heroFormulaDeclared(text) {
  const t = String(text || '')
  return /hero_formula\s*:\s*\S/i.test(t) && (/hero_citation\s*:\s*\S/i.test(t) || /decoder\s*:\s*\S/i.test(t))
}

// ── IO ──────────────────────────────────────────────────────────────────────────
function readDirText(dir, exts) {
  const abs = path.resolve(cwd, dir)
  let out = []
  let entries = []
  try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) out = out.concat(readDirText(path.join(dir, e.name), exts))
    else if (exts.some(x => e.name.endsWith(x))) { try { out.push({ file: path.join(dir, e.name), text: fs.readFileSync(path.join(abs, e.name), 'utf-8') }) } catch { /* skip */ } }
  }
  return out
}
function themeCopy() {
  let t = ''
  for (const d of ['sections', 'snippets', 'templates']) for (const f of readDirText(d, ['.liquid', '.json', '.md'])) t += `\n${f.text}`
  return t
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('copy-quality', 26, { cwd, pass, blockers, warnings, evidence: { briefsDir: BRIEFS_DIR, enforce: ENFORCE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`copy-quality: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  const briefs = readDirText(BRIEFS_DIR, ['.md', '.json'])
  if (!briefs.length) {
    warnings.push({ id: 'copy.n-a-no-briefs', page: BRIEFS_DIR, detail: `no ${BRIEFS_DIR} — not a brief-driven build, copy-quality skipped`, evidence: '' })
    return finish(null, { scope: 'n/a' })
  }
  const briefText = briefs.map(b => b.text).join('\n')

  // #23 — hero formula + citation (in any brief that covers the hero)
  const heroBrief = briefs.find(b => /hero/i.test(b.file) || /\bhero\b/i.test(b.text))
  if (heroBrief && !heroFormulaDeclared(briefText)) {
    finding('copy.hero-formula', heroBrief.file, `hero brief has no \`hero_formula: <name>\` + citation (\`hero_citation:\` or a Decoder brand) — name the proven hero formula (problem-promise / identity / proof) and cite where it's from.`)
  }

  // #24 — every listed objection must be ADDRESSED somewhere. The answer corpus is the brief body
  // (with the objection DECLARATIONS stripped, so an objection can't "cover itself") + the theme copy.
  const objections = parseObjections(briefText)
  let answerText = briefText
  for (const o of objections) answerText = answerText.split(o).join(' ')
  const gaps = coverageGaps(objections, `${answerText}\n${themeCopy()}`)
  for (const g of gaps) finding('copy.objection-uncovered', BRIEFS_DIR, `objection "${g.slice(0, 60)}" is listed but not addressed in the briefs/theme copy — answer it in the PDP body, FAQ, or a trust badge.`, g.slice(0, 80))

  // #25 — a voice reference exists to hold copy consistent
  const hasVoice = fs.existsSync(path.resolve(cwd, VOICE_FILE)) || (() => { try { return /^\s*#+\s*voice\b/im.test(fs.readFileSync(path.resolve(cwd, BRAND_FILE), 'utf-8')) } catch { return false } })()
  if (!hasVoice) finding('copy.voice-reference', VOICE_FILE, `no voice reference (${VOICE_FILE} or a "## Voice" section in ${BRAND_FILE}) — copy needs one defined voice to stay consistent across hero/PDP/email/microcopy.`)

  finish(null, { briefs: briefs.length, objections: objections.length, objectionGaps: gaps.length })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
}
