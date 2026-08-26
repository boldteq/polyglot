#!/usr/bin/env node
// Gate copy-scorecard — Quill's 9-check copy scorecard as an executable gate (P8, 2026-08-25).
//
// WHY: today the scorecard exists only as prose in ~/.claude/agents/quill.md — no code enforces it,
// so slop that would score 3/9 has shipped clean on live builds ("Elevate your morning ·
// Meticulously crafted premium quality"). This gate scores the SHIPPED copy 0-9 per surface
// (hero / pdp / cart / checkout) and gates below the floor of 7. Warns by default so the self-doing
// loop can iterate the copy; COPY_SCORECARD_ENFORCE=1 flips it to a hard BLOCK for publish-grade.
//
// THE 9 CHECKS (each = 1 point per surface):
//   1  hero-headline ≤ 8 words              (surface=hero)
//   2  subhead ≤ 25 words
//   3  cta text ≤ 4 words
//   4  Flesch-Kincaid grade ≤ 10            (pure-JS syllable heuristic — no npm dep)
//   5  passive-voice ratio < 10%            (be-verb + past-participle regex approximation)
//   6  avg sentence length ≤ 20 words
//   7  avg paragraph length ≤ 3 sentences
//   8  banned words = 0                     (hollow_verb + hollow_adjective from ai-slop-vocab.md)
//   9  ≥1 specific number / unit in hero headline   (surface=hero)
//
// BRIEF-LEVEL CHECKS (merged from #26 copy-quality on 2026-08-25 — Phase 3 REMOVE 1):
// three brief-driven copy defects, scanned from content/briefs + docs/design/brand-direction.md +
// content/voice.md:
//   #23 copy.hero-formula        — a hero brief must declare `hero_formula: <name>` + a citation
//                                  (`hero_citation:` or a `Decoder:` brand) — hero copy chosen by a
//                                  proven formula, not vibes.
//   #24 copy.objection-uncovered — every objection the brief LISTS must be ADDRESSED somewhere
//                                  (brief body / FAQ / theme copy) — an objection raised but never
//                                  answered leaks.
//   #25 copy.voice-reference     — a voice reference exists (content/voice.md or a brand-direction
//                                  Voice section) so copy has one consistent voice to hold to.
// These are warn-first (Phase A — same doctrine as #23/#24). COPY_ENFORCE=1 / DS_REQUIRE_SCOPE=1 /
// COPY_SCORECARD_ENFORCE=1 → BLOCK. SKIPS cleanly when there are no content/briefs (emits the
// `copy.n-a-no-briefs` warning). Pure helpers (parseObjections / coverageGaps / heroFormulaDeclared)
// are exported for the fixture — semantics identical to the pre-merge check-copy-quality gate.
//
// Checks that don't apply to a surface (a hero-only check on the cart surface, or a check whose
// input is empty — e.g. a section with no CTA) PASS by default. A surface with no matching sections
// at all reports score=null and never blocks; the overall verdict is over surfaces that were scored.
//
// SCOPE: sections/*.liquid + templates/*.json + locales/*.default.json, routed per surface by
// section-name / section-type (hero|banner|slideshow → hero; product|pdp|buy-box|main-product →
// pdp; cart → cart; checkout → checkout). Locale heading-ish keys (per HEADING_KEY from
// check-ai-tells.mjs) flow into the hero corpus — those are the store's cross-page tagline pool.
//
// STYLE: mirrors check-consistency.mjs (finish() + writeReport + blockers/warnings arrays + env-var
// toggles + companion .md). Pure helpers are exported so a fixture can drive them without spawning.
// NO external npm deps — Flesch-Kincaid + passive-voice + slop-vocab are all local.
//
// Usage: node check-copy-scorecard.mjs
// Env:
//   COPY_SCORECARD_ENFORCE=1   hard-block any surface <7 (default: warn)
//   COPY_ENFORCE=1             brief-level checks (hero-formula / objection / voice) BLOCK (default warn)
//   DS_REQUIRE_SCOPE=1         publish-grade — flips both surface scoring AND brief checks to BLOCK
//   BRIEFS_DIR                 default content/briefs
//   BRAND_FILE                 default docs/design/brand-direction.md
//   VOICE_FILE                 default content/voice.md
//   REPORT_DIR                 default gate-reports
//   SLOP_VOCAB_PATH            override ai-slop-vocab.md location (default ~/.claude/memory/content/…)
// Exit: 0 pass · 1 block · 2 env error
//
// NOTE: to be executed by theme-gates.mjs, this gate must be registered in the GATES manifest in
// scripts/theme-gates.mjs (script:'check-copy-scorecard.mjs', kind:'static', category:'Content &
// Trust'). Standalone `node check-copy-scorecard.mjs` from a theme root works today without that.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'
// Reuse the vocab parser so one file (~/.claude/memory/content/ai-slop-vocab.md) drives both
// check-ai-tells.mjs (headline-scoped) and this scorecard (surface-scoped) — a single source of truth.
import { loadSlopVocab } from './check-ai-tells.mjs'

const GATE_NAME = 'copy-scorecard'
const GATE_NUMBER = 58

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.COPY_SCORECARD_ENFORCE === '1'
// Brief-level ENFORCE — preserves legacy COPY_ENFORCE semantics from the pre-merge check-copy-quality
// gate. Any of the three flags flips the brief checks (hero-formula / objection-uncovered / voice-
// reference) from warn to BLOCK. COPY_SCORECARD_ENFORCE implies "publish-grade" so it also enforces.
const BRIEF_ENFORCE = process.env.COPY_ENFORCE === '1'
  || process.env.DS_REQUIRE_SCOPE === '1'
  || process.env.COPY_SCORECARD_ENFORCE === '1'
const BRIEFS_DIR = process.env.BRIEFS_DIR || 'content/briefs'
const BRAND_FILE = process.env.BRAND_FILE || 'docs/design/brand-direction.md'
const VOICE_FILE = process.env.VOICE_FILE || 'content/voice.md'
const SLOP_PATH = process.env.SLOP_VOCAB_PATH
  || path.join(process.env.HOME || '', '.claude/memory/content/ai-slop-vocab.md')
const BLOCK_THRESHOLD = 7   // <7 → blocker (or warning when ENFORCE=false)
const WARN_CEILING = 8      // 7-8 → advisory warning always, regardless of ENFORCE
const SURFACES = ['hero', 'pdp', 'cart', 'checkout']

const blockers = []
const warnings = []

// ── pure helpers (exported for fixture — no side effects, no fs) ─────────────

const WORD_RE = /\S+/g
export function wordCount(text) {
  return (String(text || '').match(WORD_RE) || []).length
}

// Syllable count via the standard vowel-group heuristic:
//   1. downcase, strip non-letters; ≤3 letters → 1 syllable (function-word floor)
//   2. drop a silent trailing 'e' (only when preceded by a non-vowel — keeps "-le" etc.)
//   3. count contiguous vowel-groups (a e i o u y); floor at 1
// Known FPs: "premium" (predicted 2, actual 3) and similar — an acceptable Flesch/Kincaid trade-off.
export function countSyllables(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const stripped = /[^aeiou]e$/.test(w) ? w.slice(0, -1) : w
  const groups = stripped.match(/[aeiouy]+/g)
  return groups ? Math.max(1, groups.length) : 1
}

// Standard Flesch-Kincaid grade level. Returns 0 for empty text (never blocks a check that has
// nothing to judge). The formula is fixed by the specification.
export function fleschKincaidGrade(text) {
  const s = String(text || '').trim()
  if (!s) return 0
  const sentences = s.split(/[.!?]+/).map(x => x.trim()).filter(Boolean)
  const words = s.split(/\s+/).filter(w => /[a-z]/i.test(w))
  if (sentences.length === 0 || words.length === 0) return 0
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0)
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59
}

// Passive-voice detector — a sentence containing be-verb + past-participle. Documented approximation
// (real PV detection needs a POS tagger we deliberately don't ship). FPs like "the shirt is red"
// (parses as \w+="r" + "ed") are accepted per the task spec.
export function passiveSentence(sentence) {
  return /\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i.test(String(sentence || ''))
}

export function passiveRatio(text) {
  const sentences = String(text || '').split(/[.!?]+/).map(x => x.trim()).filter(Boolean)
  if (sentences.length === 0) return 0
  return sentences.filter(passiveSentence).length / sentences.length
}

export function avgSentenceLength(text) {
  const sentences = String(text || '').split(/[.!?]+/).map(x => x.trim()).filter(Boolean)
  if (sentences.length === 0) return 0
  const totalWords = sentences.reduce((n, s) => n + wordCount(s), 0)
  return totalWords / sentences.length
}

export function avgParagraphSentences(text) {
  const paragraphs = String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return 0
  const totalSentences = paragraphs.reduce(
    (n, p) => n + p.split(/[.!?]+/).map(x => x.trim()).filter(Boolean).length,
    0,
  )
  return totalSentences / paragraphs.length
}

// A concrete number + unit anywhere in the string. Regex taken verbatim from the spec's list of
// commercial units (%, $, comma-thousands, mg/ml/oz/lbs/hrs/days/weeks/months/years). Optional
// whitespace between number and unit accepts real copy like "8 weeks" as well as "8weeks".
const NUMBER_UNIT_RE = /\d+\s*(?:%|\$|,|mg|ml|oz|lbs|hrs|days|weeks|months|years)\b/i
export function hasNumberUnit(text) {
  return NUMBER_UNIT_RE.test(String(text || ''))
}

// Return the first banned-word hit in `text`, or null. Multi-word phrases match with `\bphrase\b`;
// single tokens with word-boundaries either side (so "premium" won't catch "premiumship"). Case-
// insensitive throughout — real copy is title-cased.
export function firstBannedWord(text, terms) {
  const s = String(text || '')
  for (const raw of terms || []) {
    const term = String(raw || '').trim()
    if (!term) continue
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(s)) return term
  }
  return null
}

// ── brief-level pure helpers (merged from #26 check-copy-quality on 2026-08-25) ───────────────────
// Semantics preserved verbatim — the pure functions and their tests come from the deleted gate.

// Parse `objections:` declarations from a brief body. Two forms:
//   • inline           `objections: too expensive; will it fit`
//   • heading + list   `## Objections\n- is it safe\n- will it last`   (block ends at blank / next `#`)
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

const BRIEF_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'is', 'it', 'for', 'with', 'my', 'our', 'your', 'will', 'can', 'that', 'this', 'are', 'be', 'no', 'not', 'do', 'does', 'too', 'how', 'what', 'when', 'why', 'about'])
function briefKeyTerms(s) { return [...new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !BRIEF_STOP.has(w)))] }

// An objection is "covered" if ≥half its content terms appear in the corpus (brief body + theme copy).
export function coverageGaps(objections, corpus) {
  const hay = String(corpus || '').toLowerCase()
  const gaps = []
  for (const obj of objections || []) {
    const terms = briefKeyTerms(obj)
    if (!terms.length) continue
    const hits = terms.filter(t => hay.includes(t)).length
    if (hits / terms.length < 0.5) gaps.push(obj)
  }
  return gaps
}

// A brief has a declared hero formula when it names BOTH a formula and a citation source.
export function heroFormulaDeclared(text) {
  const t = String(text || '')
  return /hero_formula\s*:\s*\S/i.test(t) && (/hero_citation\s*:\s*\S/i.test(t) || /decoder\s*:\s*\S/i.test(t))
}

// ── extraction ────────────────────────────────────────────────────────────────

const LIQUID_OUT = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
const HTML_TAGS = /<[^>]+>/g
const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i
// role IDs — order matters in categorize() (subhead-ish is tested FIRST because "subtitle" contains
// "title" and "subheading" contains "heading", both of which would otherwise be mis-tagged as headings).
const HEADING_ID = /head(ing|line)|title|hero|banner_text|slogan|tagline/i
const SUBHEAD_ID = /subhead|subtitle|description|caption|body_text|paragraph/i
const CTA_ID = /button_?text|button_?label|^cta$|link_?text|link_?label/i
// HEADING_KEY from check-ai-tells.mjs — duplicated here (small enough to keep in-sync manually,
// avoids importing a private constant that isn't part of that module's export surface).
const LOCALE_HEADING_KEY = /head(ing|line)?|title|tagline|subheading|hero|slogan|banner_text/i

function stripLiquid(s) { return String(s || '').replace(LIQUID_OUT, ' ') }
function stripHtml(s) { return String(s || '').replace(HTML_TAGS, ' ').replace(/\s+/g, ' ').trim() }
function extractInnerText(html) { return stripHtml(stripLiquid(html)) }

// Copy struct — four buckets by role. Every extractor emits into this shape so scoring is uniform.
const emptyCopy = () => ({ headings: [], subheads: [], ctas: [], body: [] })

function categorize(idlabel, val, out) {
  const s = String(val || '').trim()
  if (!s) return
  if (SUBHEAD_ID.test(idlabel)) out.subheads.push(s)
  else if (HEADING_ID.test(idlabel)) out.headings.push(s)
  else if (CTA_ID.test(idlabel)) out.ctas.push(s)
  else out.body.push(s)
}

function walkSchemaSettings(arr, out) {
  if (!Array.isArray(arr)) return
  for (const s of arr) {
    if (!s || typeof s !== 'object' || typeof s.default !== 'string') continue
    categorize(`${s.id || ''} ${s.label || ''}`, s.default, out)
  }
}

function parseSchema(raw) {
  const m = SCHEMA_RE.exec(String(raw || ''))
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

// Extract copy from one section .liquid — <h1>/<h2>/<h3> headings + <p> body + schema defaults
// (categorised by settings id/label).
export function extractSectionCopy(rawLiquid) {
  const out = emptyCopy()
  const raw = String(rawLiquid || '')
  for (const m of raw.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const t = extractInnerText(m[1])
    if (t) out.headings.push(t)
  }
  for (const m of raw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = extractInnerText(m[1])
    if (t) out.body.push(t)
  }
  const schema = parseSchema(raw)
  if (schema) {
    walkSchemaSettings(schema.settings, out)
    if (Array.isArray(schema.blocks)) for (const b of schema.blocks) walkSchemaSettings(b && b.settings, out)
  }
  return out
}

// Extract copy from one JSON template file. Returns Map<sectionType, Copy> so the caller can route
// each section's overrides to the right surface. Template overrides are what the merchant actually
// ships; schema defaults are what the admin form shows before editing — both are scored.
export function extractTemplateCopy(templateJson) {
  const out = new Map()
  const t = templateJson && typeof templateJson === 'object' ? templateJson : {}
  const sections = t.sections
  if (!sections || typeof sections !== 'object') return out
  for (const [, sec] of Object.entries(sections)) {
    if (!sec || typeof sec !== 'object') continue
    const type = String(sec.type || '')
    if (!out.has(type)) out.set(type, emptyCopy())
    const bucket = out.get(type)
    const settings = sec.settings && typeof sec.settings === 'object' ? sec.settings : {}
    for (const [id, val] of Object.entries(settings)) {
      if (typeof val === 'string') categorize(id, val, bucket)
    }
    if (sec.blocks && typeof sec.blocks === 'object') {
      for (const [, blk] of Object.entries(sec.blocks)) {
        if (!blk || typeof blk !== 'object' || !blk.settings) continue
        for (const [id, val] of Object.entries(blk.settings)) {
          if (typeof val === 'string') categorize(id, val, bucket)
        }
      }
    }
  }
  return out
}

// Heading-ish string values from a locale JSON, at any depth (per HEADING_KEY from check-ai-tells.mjs).
export function extractLocaleHeadings(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') { if (LOCALE_HEADING_KEY.test(k)) out.push(v) }
    else if (v && typeof v === 'object') extractLocaleHeadings(v, out)
  }
  return out
}

// section-name / section-type → surface bucket. Kept generous: a section named
// "featured-product-carousel" routes to pdp, "cart-drawer" routes to cart, "main-checkout" to
// checkout. Returns null (skip) if nothing matches.
export function routeSurface(nameOrType) {
  const s = String(nameOrType || '').toLowerCase()
  if (/\b(hero|banner|slideshow)\b/.test(s) || /(^|[-_])(hero|banner|slideshow)([-_]|$)/.test(s)) return 'hero'
  if (/\b(product|pdp|buy-box|main-product)\b/.test(s) || /(^|[-_])(product|pdp|buy-box|main-product)([-_]|$)/.test(s)) return 'pdp'
  if (/\bcart\b/.test(s) || /(^|[-_])cart([-_]|$)/.test(s)) return 'cart'
  if (/\bcheckout\b/.test(s) || /(^|[-_])checkout([-_]|$)/.test(s)) return 'checkout'
  return null
}

// ── scoring ──────────────────────────────────────────────────────────────────

// Score one surface — pure. Returns { score:0-9, failed:string[], notes:string[] }.
// A check whose input is missing (surface has no CTA / no body / etc) passes silently — the
// scorecard measures what shipped, and a section without a CTA is not a defect. A hero-only check
// (1 and 9) applied to non-hero surfaces likewise passes as N/A.
export function scoreCopy(surface, copy, vocab = {}) {
  const failed = []
  const notes = []
  let score = 9

  // 1  hero-headline ≤ 8 words
  if (surface === 'hero' && copy.headings.length > 0) {
    const worst = copy.headings.reduce((a, b) => (wordCount(a) >= wordCount(b) ? a : b))
    if (wordCount(worst) > 8) { failed.push(`hero-headline-${wordCount(worst)}w-over-8`); score -= 1 }
  }
  // 2  subhead ≤ 25 words
  if (copy.subheads.length > 0) {
    const worst = copy.subheads.reduce((a, b) => (wordCount(a) >= wordCount(b) ? a : b))
    if (wordCount(worst) > 25) { failed.push(`subhead-${wordCount(worst)}w-over-25`); score -= 1 }
  }
  // 3  cta ≤ 4 words
  if (copy.ctas.length > 0) {
    const worst = copy.ctas.reduce((a, b) => (wordCount(a) >= wordCount(b) ? a : b))
    if (wordCount(worst) > 4) { failed.push(`cta-${wordCount(worst)}w-over-4`); score -= 1 }
  }

  // Prose corpus for readability — every scored string becomes one sentence-boundary chunk. Joining
  // with '. ' means a heading with no terminal period still parses as a sentence for check 4/5/6.
  const prose = [...copy.headings, ...copy.subheads, ...copy.body].join('. ')
  const paraProse = copy.body.join('\n\n')

  // 4  Flesch-Kincaid grade ≤ 10
  if (prose.trim()) {
    const fk = fleschKincaidGrade(prose)
    if (fk > 10) { failed.push(`fk-grade-${fk.toFixed(1)}-over-10`); score -= 1 }
  }
  // 5  passive-voice ratio < 10%
  if (prose.trim()) {
    const pr = passiveRatio(prose)
    if (pr >= 0.10) { failed.push(`passive-${Math.round(pr * 100)}pct-ge-10`); score -= 1 }
  }
  // 6  avg sentence length ≤ 20 words
  if (prose.trim()) {
    const asl = avgSentenceLength(prose)
    if (asl > 20) { failed.push(`avg-sentence-${asl.toFixed(1)}w-over-20`); score -= 1 }
  }
  // 7  avg paragraph length ≤ 3 sentences (paragraphs = body copy only; headings are not paragraphs)
  if (paraProse.trim() && copy.body.length > 0) {
    const apl = avgParagraphSentences(paraProse)
    if (apl > 3) { failed.push(`avg-para-${apl.toFixed(1)}s-over-3`); score -= 1 }
  }
  // 8  banned words = 0  (hollow verbs + hollow adjectives; padding-phrase is warn-only in
  //    check-ai-tells so we exclude it here per the task spec)
  const banned = [...(vocab.hollow_verb || []), ...(vocab.hollow_adjective || [])]
  if (banned.length > 0) {
    let hit = null
    for (const str of [...copy.headings, ...copy.subheads, ...copy.ctas, ...copy.body]) {
      hit = firstBannedWord(str, banned)
      if (hit) break
    }
    if (hit) { failed.push(`banned-word:${hit}`); score -= 1 }
  } else {
    // Absent vocab file → check 8 is a noop; document so a green tick isn't mistaken for "verified".
    notes.push('slop-vocab-empty (check 8 skipped)')
  }
  // 9  ≥1 specific number/unit in hero headline
  if (surface === 'hero' && copy.headings.length > 0 && !copy.headings.some(hasNumberUnit)) {
    failed.push('no-number-unit-in-hero-headline')
    score -= 1
  }
  return { score: Math.max(0, score), failed, notes }
}

// ── file walking ─────────────────────────────────────────────────────────────

function safeRead(rel) {
  try { return fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { return null }
}

function listFiles(dir, exts) {
  const abs = path.resolve(cwd, dir)
  const out = []
  if (!fs.existsSync(abs)) return out
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) continue // Shopify themes keep sections/templates/locales flat
    if (exts.some(x => e.name.endsWith(x))) out.push(path.join(dir, e.name))
  }
  return out
}

function mergeCopy(a, b) {
  a.headings.push(...b.headings)
  a.subheads.push(...b.subheads)
  a.ctas.push(...b.ctas)
  a.body.push(...b.body)
}

// ── brief-level IO + runner (merged from check-copy-quality on 2026-08-25) ────────────────────────
// Walk `dir` recursively for files with any of `exts`. Returns [{file, text}]. Missing dir → [].
function readBriefDir(dir, exts) {
  const abs = path.resolve(cwd, dir)
  let out = []
  let entries = []
  try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (e.isDirectory()) out = out.concat(readBriefDir(path.join(dir, e.name), exts))
    else if (exts.some(x => e.name.endsWith(x))) {
      try { out.push({ file: path.join(dir, e.name), text: fs.readFileSync(path.join(abs, e.name), 'utf-8') }) } catch { /* skip */ }
    }
  }
  return out
}

// Answer corpus for objection coverage — all theme copy files (Liquid + JSON + Markdown) concatenated.
function themeCopyForBriefs() {
  let t = ''
  for (const d of ['sections', 'snippets', 'templates']) {
    for (const f of readBriefDir(d, ['.liquid', '.json', '.md'])) t += `\n${f.text}`
  }
  return t
}

// Run the three brief-level checks. Returns { blockers, warnings, evidence }.
// Emits findings under the legacy `copy.*` id namespace so downstream reporters / dashboards that
// already recognize the pre-merge ids keep matching.
export function collectBriefFindings(enforce, opts = {}) {
  const briefsDir = opts.briefsDir || BRIEFS_DIR
  const brandFile = opts.brandFile || BRAND_FILE
  const voiceFile = opts.voiceFile || VOICE_FILE
  const out = { blockers: [], warnings: [], evidence: { briefsDir, briefs: 0, objections: 0, objectionGaps: 0 } }
  const briefs = readBriefDir(briefsDir, ['.md', '.json'])
  if (!briefs.length) {
    out.warnings.push({ id: 'copy.n-a-no-briefs', page: briefsDir, detail: `no ${briefsDir} — not a brief-driven build, copy-quality brief checks skipped`, evidence: '' })
    return out
  }
  const briefText = briefs.map(b => b.text).join('\n')
  out.evidence.briefs = briefs.length

  const push = (id, page, detail, evidence = '') => {
    const f = { id, page, detail, evidence }
    ;(enforce ? out.blockers : out.warnings).push(f)
  }

  // #23 — hero formula + citation (in any brief that covers the hero)
  const heroBrief = briefs.find(b => /hero/i.test(b.file) || /\bhero\b/i.test(b.text))
  if (heroBrief && !heroFormulaDeclared(briefText)) {
    push('copy.hero-formula', heroBrief.file, `hero brief has no \`hero_formula: <name>\` + citation (\`hero_citation:\` or a Decoder brand) — name the proven hero formula (problem-promise / identity / proof) and cite where it's from.`)
  }

  // #24 — every listed objection must be ADDRESSED somewhere. Strip objection DECLARATIONS from the
  // answer corpus so an objection can't "cover itself"; then augment with theme copy.
  const objections = parseObjections(briefText)
  out.evidence.objections = objections.length
  let answerText = briefText
  for (const o of objections) answerText = answerText.split(o).join(' ')
  const gaps = coverageGaps(objections, `${answerText}\n${themeCopyForBriefs()}`)
  out.evidence.objectionGaps = gaps.length
  for (const g of gaps) push('copy.objection-uncovered', briefsDir, `objection "${g.slice(0, 60)}" is listed but not addressed in the briefs/theme copy — answer it in the PDP body, FAQ, or a trust badge.`, g.slice(0, 80))

  // #25 — a voice reference exists to hold copy consistent
  const hasVoice = fs.existsSync(path.resolve(cwd, voiceFile)) || (() => {
    try { return /^\s*#+\s*voice\b/im.test(fs.readFileSync(path.resolve(cwd, brandFile), 'utf-8')) } catch { return false }
  })()
  if (!hasVoice) push('copy.voice-reference', voiceFile, `no voice reference (${voiceFile} or a "## Voice" section in ${brandFile}) — copy needs one defined voice to stay consistent across hero/PDP/email/microcopy.`)

  return out
}

function collectAllCopy() {
  const bySurface = { hero: emptyCopy(), pdp: emptyCopy(), cart: emptyCopy(), checkout: emptyCopy() }
  const sources = { hero: [], pdp: [], cart: [], checkout: [] }
  const recordSource = (surface, rel) => { if (!sources[surface].includes(rel)) sources[surface].push(rel) }

  // sections/*.liquid — routed by filename
  for (const rel of listFiles('sections', ['.liquid'])) {
    const surface = routeSurface(path.basename(rel, '.liquid'))
    if (!surface) continue
    const raw = safeRead(rel)
    if (!raw) continue
    mergeCopy(bySurface[surface], extractSectionCopy(raw))
    recordSource(surface, rel)
  }

  // templates/*.json — routed by template filename first (product.json → pdp; cart.json → cart;
  // checkout.json → checkout), else by each section's `type` (image-banner → hero, etc). Falls back
  // to skipping when nothing matches (e.g. templates/page.json without a routable section type).
  for (const rel of listFiles('templates', ['.json'])) {
    const raw = safeRead(rel)
    if (!raw) continue
    let tpl
    try { tpl = JSON.parse(raw) } catch { continue }
    const base = path.basename(rel, '.json').toLowerCase()
    const templateSurface =
      base.startsWith('product') ? 'pdp'
      : base.startsWith('cart') ? 'cart'
      : base.startsWith('checkout') ? 'checkout'
      : null   // index / page / collection / etc → route per section type
    for (const [type, copy] of extractTemplateCopy(tpl)) {
      const surface = templateSurface || routeSurface(type)
      if (!surface) continue
      mergeCopy(bySurface[surface], copy)
      recordSource(surface, rel)
    }
  }

  // locales/*.default.json — heading-ish keys flow into the hero corpus (cross-page taglines).
  for (const rel of listFiles('locales', ['.json'])) {
    if (!/\.default\.json$/.test(rel)) continue
    const raw = safeRead(rel)
    if (!raw) continue
    let obj
    try { obj = JSON.parse(raw) } catch { continue }
    const heads = extractLocaleHeadings(obj)
    if (!heads.length) continue
    for (const h of heads) bySurface.hero.headings.push(h)
    recordSource('hero', rel)
  }

  return { bySurface, sources }
}

// ── main ─────────────────────────────────────────────────────────────────────

function writeCompanionMd(dir, surfacesReport, overall, pass) {
  const rows = SURFACES.map(s => {
    const r = surfacesReport[s]
    if (!r || r.score === null) return `| ${s} | — | n/a | no matching sections |`
    const verdict = r.score >= BLOCK_THRESHOLD ? (r.score <= WARN_CEILING ? 'pass (borderline)' : 'pass') : (ENFORCE ? 'BLOCK' : 'warn')
    return `| ${s} | ${r.score}/9 | ${verdict} | ${r.failed.join(', ') || '—'} |`
  })
  const md = [
    `# Copy Scorecard — ${pass ? 'PASS' : (ENFORCE ? 'BLOCK' : 'WARN')}`,
    ``,
    `enforce=${ENFORCE} · threshold=<${BLOCK_THRESHOLD}/9 (${ENFORCE ? 'blocks' : 'warns'}) · scored surfaces=${overall.surfacesScored} · avg=${overall.avg.toFixed(2)}`,
    ``,
    `| Surface | Score | Verdict | Failed checks |`,
    `|---|---|---|---|`,
    ...rows,
    ``,
    `9 checks per surface: 1 hero-headline≤8w · 2 subhead≤25w · 3 cta≤4w · 4 FK-grade≤10 · 5 passive<10% · 6 avg-sentence≤20w · 7 avg-para≤3s · 8 banned-word=0 · 9 hero has number/unit.`,
    ``,
    `Set COPY_SCORECARD_ENFORCE=1 for a publish-grade run (a surface <${BLOCK_THRESHOLD}/9 becomes a blocker).`,
    ``,
  ]
  try { fs.writeFileSync(path.join(dir, `${GATE_NAME}.md`), md.join('\n')) } catch { /* report dir handled below */ }
}

function finish(envError, evidence) {
  const pass = !envError && blockers.length === 0
  const dirAbs = path.resolve(cwd, REPORT_DIR)
  try { fs.mkdirSync(dirAbs, { recursive: true }) } catch { /* noop */ }
  if (evidence && evidence.surfaces && evidence.overall) writeCompanionMd(dirAbs, evidence.surfaces, evidence.overall, pass)
  const { file } = writeReport(GATE_NAME, GATE_NUMBER, {
    cwd, pass, blockers, warnings,
    evidence: { enforce: ENFORCE, threshold: BLOCK_THRESHOLD, reason: envError || undefined, ...(evidence || {}) },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  // Also expose { surfaces, overall } at the JSON top level so a scorecard consumer matches the
  // task-spec shape ({ surfaces: {...}, overall: {pass, avg} }) without diving into `evidence`.
  // The standard-schema fields (gate/gateNumber/pass/blockers/warnings/severityCounts/…) remain.
  if (evidence && evidence.surfaces && file) {
    try {
      const rep = JSON.parse(fs.readFileSync(file, 'utf-8'))
      rep.surfaces = evidence.surfaces
      rep.overall = evidence.overall
      fs.writeFileSync(file, `${JSON.stringify(rep, null, 2)}\n`)
    } catch { /* best-effort — the report is still valid without the top-level mirror */ }
  }
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`${GATE_NAME}: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  // Guard relaxed on 2026-08-25 (Phase 3 REMOVE 1): brief-level checks can meaningfully run in a
  // content-only repo (no sections/ yet, briefs already drafted). Env-error only when there is neither
  // a theme skeleton nor a briefs directory — nothing at all for the gate to judge.
  const hasTheme = fs.existsSync(path.resolve(cwd, 'sections')) || fs.existsSync(path.resolve(cwd, 'layout'))
  const hasBriefs = fs.existsSync(path.resolve(cwd, BRIEFS_DIR))
  if (!hasTheme && !hasBriefs) {
    finish(`not a theme or brief repo (no sections/, no layout/, no ${BRIEFS_DIR}/) — run from the theme root, or ensure content/briefs exists for a brief-only check`)
  }

  let vocab = { hollow_verb: [], hollow_adjective: [], padding_phrase: [] }
  try { vocab = loadSlopVocab(fs.readFileSync(SLOP_PATH, 'utf-8')) }
  catch { /* absent → check 8 becomes a documented noop (evidence.slopVocabLoaded=0) */ }
  const vocabLoaded = vocab.hollow_verb.length + vocab.hollow_adjective.length + vocab.padding_phrase.length

  const { bySurface, sources } = collectAllCopy()

  const surfacesReport = {}
  const scored = []
  for (const surface of SURFACES) {
    const copy = bySurface[surface]
    const strings = copy.headings.length + copy.subheads.length + copy.ctas.length + copy.body.length
    if (strings === 0) {
      surfacesReport[surface] = { score: null, failed: [], notes: ['no-matching-sections'], strings: 0, sources: [] }
      continue
    }
    const { score, failed, notes } = scoreCopy(surface, copy, vocab)
    surfacesReport[surface] = { score, failed, notes, strings, sources: sources[surface] }
    scored.push(score)
    if (score < BLOCK_THRESHOLD) {
      const detail = `${surface} copy scored ${score}/9 (${failed.join(', ') || 'unknown'}) — Quill's floor is ${BLOCK_THRESHOLD}. Rewrite the failing lines.`
      const finding = { id: `${GATE_NAME}.${surface}.below-${BLOCK_THRESHOLD}`, page: surface, detail, evidence: failed.join('|') }
      if (ENFORCE) blockers.push(finding)
      else warnings.push(finding)
    } else if (score <= WARN_CEILING) {
      warnings.push({
        id: `${GATE_NAME}.${surface}.borderline`,
        page: surface,
        detail: `${surface} copy scored ${score}/9 — passes but borderline (${failed.join(', ') || 'unknown'})`,
        evidence: failed.join('|'),
      })
    }
  }

  // ── BRIEF-LEVEL CHECKS (merged from #26 check-copy-quality on 2026-08-25) ──────────────────────
  // Scan content/briefs for the three brief-driven copy defects (hero-formula / objection-uncovered
  // / voice-reference). Warn-first unless BRIEF_ENFORCE (COPY_ENFORCE=1 || DS_REQUIRE_SCOPE=1 ||
  // COPY_SCORECARD_ENFORCE=1). Findings namespaced under `copy.*` so downstream reporters that keyed
  // on the pre-merge ids keep matching.
  const briefFindings = collectBriefFindings(BRIEF_ENFORCE)
  blockers.push(...briefFindings.blockers)
  warnings.push(...briefFindings.warnings)

  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0
  const overallPass = scored.length === 0 ? true : scored.every(s => s >= BLOCK_THRESHOLD)
  finish(null, {
    surfaces: surfacesReport,
    overall: { pass: overallPass, avg, surfacesScored: scored.length },
    slopVocabLoaded: vocabLoaded,
    slopPath: SLOP_PATH,
    brief: { enforce: BRIEF_ENFORCE, ...briefFindings.evidence },
  })
}

// CLI only — importable for pure helpers without running the gate.
if (isMain(import.meta.url)) {
  try { main() }
  catch (e) {
    writeReport(GATE_NAME, GATE_NUMBER, {
      cwd, pass: false,
      blockers: [{ id: `${GATE_NAME}.crash`, page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }],
      warnings: [], evidence: {}, duration_ms: Date.now() - t0,
    }, REPORT_DIR)
    console.error(`${GATE_NAME}: CRASH — ${e.message}`)
    process.exit(2)
  }
}
