#!/usr/bin/env node
// Boldteq honesty gate (#13) — the fake-urgency / fabricated-claim killer.
//
// Yash hard rule (2026-06-15, patterns/avoid/fake-urgency-and-fabricated-claims.md):
// Boldteq stores must NEVER ship fake urgency (evergreen / per-visit countdowns,
// hardcoded "only N left"), fake recent-activity, or fabricated stats. The GemPages /
// Seal builder templates were full of these. This gate makes the rule mechanical.
//
// A REAL countdown reads a FIXED end date (an ISO string, block.settings.* date, or a
// metafield) → PASS. Only the now+duration / storage-reset forms FAIL. A scarcity line
// bound to real inventory (inventory_quantity / inventory_management) → PASS; a hardcoded
// number with no inventory binding → FAIL.
//
// Scope (same convention as check-design-system / check-consistency): sections/*.liquid +
// snippets/*.liquid + assets/*.js CHANGED since BASE_REF "base"; falls back to the
// CUSTOM/EXTEND rows of section-reuse-map.md (+ paired assets), else lenient warn-skip
// (DS_REQUIRE_SCOPE=1 makes an unresolvable scope a publish-grade block).
//
// Usage: node check-honesty.mjs
// Env:
//   BASE_REF              theme-base git ref (default "base") — scopes the scan
//   REUSE_MAP             default section-reuse-map.md (fallback scope source)
//   REPORT_DIR            default gate-reports
//   DS_REQUIRE_SCOPE=1    publish-grade: unresolvable scope = block (not warn-skip)
//   STRICT_CONVERSION=1   promote fake-activity from warning → blocker
//   ALLOW_HONESTY_WAIVER=1  downgrade blockers → warnings IF CHANGES.md ## Waivers names honesty
//
// BLOCKS on: honesty.fake-countdown (now+duration / storage-reset countdown);
//   honesty.hardcoded-scarcity ("only N left" with no inventory binding).
// WARNS on:  honesty.fake-activity (hardcoded "N people bought … today");
//   honesty.unsourced-stat (a "N% of customers …" claim with no citation).
//   (STRICT_CONVERSION=1 promotes fake-activity to a blocker.)
//
// Escape hatch (per-element opt-out for legitimately data-bound cases):
//   data-honesty="real" on the element, OR a {%- # honesty:real -%} / <!-- honesty:real -->
//   marker in the same block, suppresses the finding for that match.
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const STRICT = process.env.STRICT_CONVERSION === '1'
// ALLOW_HONESTY_WAIVER only downgrades when CHANGES.md ## Waivers actually names honesty —
// a bare env flag must not silently green a dishonest store.
const ALLOW_WAIVER = process.env.ALLOW_HONESTY_WAIVER === '1' && changesWaivesHonesty()

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
// blocker(): honors the waiver escape hatch — downgrades to a waived warning when justified.
const blocker = (id, page, detail, evidence) => ALLOW_WAIVER
  ? add(warnings, `${id}.waived`, page, `${detail} (waived via CHANGES.md ## Waivers)`, evidence)
  : add(blockers, id, page, detail, evidence)

function changesWaivesHonesty() {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    if (!m) return false
    const section = m[1].split(/\n##\s/)[0] // the Waivers section only — up to the next heading
    return /\bhonesty\b/i.test(section)
  } catch {
    return false
  }
}

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('honesty', 13, {
    cwd, pass, blockers, warnings,
    evidence: {
      baseRef: BASE_REF,
      strict: STRICT,
      waiver: ALLOW_WAIVER,
      counts: {
        fakeCountdown: count('honesty.fake-countdown'),
        hardcodedScarcity: count('honesty.hardcoded-scarcity'),
        fakeActivity: count('honesty.fake-activity'),
        unsourcedStat: count('honesty.unsourced-stat'),
      },
      reason: envError || undefined,
    },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`honesty: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function count(id) {
  return blockers.filter(f => f.id === id).length + warnings.filter(f => f.id === id || f.id === `${id}.waived`).length
}

// ── scope: the build's custom/extended surface (incl. assets/*.js for timer logic) ──
const SCAN_DIRS = ['sections', 'snippets', 'assets']
function gitChanged() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return null }
}
function reuseMapTargets() {
  const mapAbs = path.resolve(cwd, REUSE_MAP)
  if (!fs.existsSync(mapAbs)) return null
  const names = new Set()
  for (const line of fs.readFileSync(mapAbs, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (!cells.some(c => /^(EXTEND|CUSTOM)$/i.test(c))) continue
    for (const c of cells) {
      const m = c.match(/([a-z0-9][a-z0-9_-]+)/i)
      if (m && !/^(EXTEND|CUSTOM|REUSE|CONFIGURE|LIBRARY)$/i.test(m[1]) && fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) names.add(`sections/${m[1]}.liquid`)
    }
  }
  if (names.size === 0) return null
  // include paired snippets + JS (the timer logic usually lives in assets/*.js)
  const files = new Set(names)
  for (const n of names) {
    const base = path.basename(n, '.liquid')
    for (const p of [`snippets/${base}.liquid`, `assets/${base}.js`]) {
      if (fs.existsSync(path.resolve(cwd, p))) files.add(p)
    }
  }
  return [...files]
}

let targets = gitChanged()
let scopeSource = 'git'
if (targets === null) { targets = reuseMapTargets(); scopeSource = 'reuse-map' }
if (targets === null) {
  if (REQUIRE_SCOPE) {
    add(blockers, 'honesty.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, and DS_REQUIRE_SCOPE=1 — cannot verify honesty; mantle must tag the theme base "base" before publish`)
  } else {
    warnings.push({ id: 'honesty.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — honesty scan skipped (set BASE_REF or DS_REQUIRE_SCOPE for publish)`, evidence: '' })
  }
  finish(null)
}
targets = targets.filter(f => /\.(liquid|js)$/.test(f) && SCAN_DIRS.some(d => f.startsWith(`${d}/`)))
if (targets.length === 0) {
  warnings.push({ id: 'honesty.no-custom-code', page: '.', detail: `no custom/extended liquid/js files in scope (${scopeSource}) — nothing to check`, evidence: '' })
  finish(null)
}

// ── helpers ──────────────────────────────────────────────────────────────────
const trunc = (s, n = 80) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t }

// A fixed end date the countdown could legitimately read → makes a now+duration false-alarm
// unnecessary, but more importantly the per-finding detector below only fires on the fake forms.
const RE_ISO = /\b\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/                       // a fixed ISO date literal
const RE_DATE_BINDING = /block\.settings\.[a-z0-9_]*(date|deadline|end|until|expire)/i // settings date
const RE_METAFIELD = /\.metafields?\./i                                      // a metafield binding
const RE_INVENTORY = /inventory_quantity|inventory_management|inventory_policy|variant\.available/i

// honesty:real escape hatch markers — element attr, a same-block marker comment, or a JS
// comment. (Used both windowed for liquid + file-scoped for single-purpose JS timer modules.)
const RE_REAL = /data-honesty\s*=\s*["']real["']|\{%-?\s*#\s*honesty:real\s*-?%\}|<!--\s*honesty:real\s*-->|\/\*\s*honesty:real\s*\*\/|\/\/\s*honesty:real/i
// In liquid/html, an opt-out must be NEAR the finding (same block) — a marker on another
// section must not silently waive an unrelated one. Window: ~200 chars before, ~80 after.
function isWaivedAt(text, index) {
  return RE_REAL.test(text.slice(Math.max(0, index - 200), index + 80))
}

// strip liquid/html/js comments only for the *parsing context* checks that need clean text;
// the raw text is kept for evidence + escape-hatch window scanning.
function lineAt(text, index) {
  return text.slice(0, index).split('\n').length
}

// ── per-file detection ─────────────────────────────────────────────────────────
for (const file of targets) {
  const abs = path.resolve(cwd, file)
  if (!fs.existsSync(abs)) continue
  const raw = fs.readFileSync(abs, 'utf-8')
  const isJs = /\.js$/.test(file)
  const fileHasInventory = RE_INVENTORY.test(raw)
  // A JS asset is a single-purpose timer module — a file-level honesty:real marker opts the
  // whole file out (the offending now+duration is often deep inside an IIFE/setInterval, away
  // from any element). For liquid/html the marker must stay near the finding (windowed).
  const fileWaived = isJs && RE_REAL.test(raw)

  // ── 1. honesty.fake-countdown ────────────────────────────────────────────────
  // Fake form A: a now-source (Date.now() / getTime() / new Date()) IMMEDIATELY (~40 chars)
  // followed by `+` and a duration number. A real countdown reads a fixed end, not now+delta.
  const nowPlus = /(Date\.now\s*\(\s*\)|getTime\s*\(\s*\)|\bnew\s+Date\s*\(\s*\))[\s\S]{0,40}?\+\s*\(?\s*\d/g
  for (const m of raw.matchAll(nowPlus)) {
    if (fileWaived || isWaivedAt(raw, m.index)) continue
    blocker('honesty.fake-countdown', `${file}:${lineAt(raw, m.index)}`, `evergreen/per-visit countdown — end-time computed as now+duration (${trunc(m[0], 50)}); a real countdown reads a FIXED end date (ISO / block.settings.*date / metafield)`, trunc(m[0], 80))
  }
  // Fake form B: a storage-backed countdown reset (localStorage/sessionStorage holding a
  // deadline that's (re)seeded relative to now / first-visit) → per-visit fake urgency.
  const storageReset = /(local|session)Storage[\s\S]{0,120}?(deadline|countdown|endTime|end_time|expires?|timer)/gi
  for (const m of raw.matchAll(storageReset)) {
    if (fileWaived || isWaivedAt(raw, m.index)) continue
    // a storage countdown that ALSO references a fixed date / metafield in-file is likely real → only flag now-seeded ones
    if (RE_DATE_BINDING.test(m[0]) || RE_METAFIELD.test(m[0]) || RE_ISO.test(m[0])) continue
    blocker('honesty.fake-countdown', `${file}:${lineAt(raw, m.index)}`, `localStorage/sessionStorage countdown-reset (${trunc(m[0], 50)}) — per-visit fake urgency; bind the deadline to a fixed date/metafield instead`, trunc(m[0], 80))
  }
  // Fake form C (JS only): a setInterval/setTimeout countdown ticker with NO fixed-date / metafield
  // / block.settings binding anywhere in the file → unanchored timer (evergreen by omission).
  if (isJs && !fileWaived && /countdown|count-?down|timer|deadline/i.test(raw)) {
    const hasTicker = /set(Interval|Timeout)\s*\(/.test(raw)
    const hasFixedAnchor = RE_ISO.test(raw) || RE_DATE_BINDING.test(raw) || RE_METAFIELD.test(raw)
      || /data-(end|deadline|until|expires?)\s*=/i.test(raw) || /\bgetAttribute\s*\(\s*["']data-(end|deadline|until|expires?)/i.test(raw)
    const alreadyFlagged = blockers.some(b => b.id === 'honesty.fake-countdown' && b.page.startsWith(`${file}:`))
      || warnings.some(b => b.id === 'honesty.fake-countdown.waived' && b.page.startsWith(`${file}:`))
    if (hasTicker && !hasFixedAnchor && !alreadyFlagged) {
      const idx = raw.search(/set(Interval|Timeout)\s*\(/)
      if (!isWaivedAt(raw, idx >= 0 ? idx : 0)) {
        blocker('honesty.fake-countdown', `${file}:${idx >= 0 ? lineAt(raw, idx) : 1}`, `countdown ticker (setInterval/setTimeout) with NO fixed end date / metafield / data-end binding — unanchored timer is evergreen by omission`, trunc(raw.match(/set(Interval|Timeout)\s*\([^)]*/)?.[0] || 'setInterval', 60))
      }
    }
  }

  // ── 2. honesty.hardcoded-scarcity ────────────────────────────────────────────
  // Literal "only N left / N left in stock / N remaining" with NO inventory binding in the file.
  const RE_SCARCITY = /\bonly\s+\d+\s+(left|remaining|in\s+stock)\b|\b\d+\s+(left\s+in\s+stock|items?\s+left|remaining)\b/gi
  for (const m of raw.matchAll(RE_SCARCITY)) {
    if (isWaivedAt(raw, m.index)) continue
    // data-bound? a liquid var / inventory ref INSIDE the match → real, skip
    if (/\{\{|\{%|inventory/i.test(m[0])) continue
    if (fileHasInventory) {
      // file references real inventory — likely the number is liquid-rendered nearby; warn instead of block
      add(warnings, 'honesty.hardcoded-scarcity', `${file}:${lineAt(raw, m.index)}`, `scarcity copy "${trunc(m[0], 40)}" — file references inventory; confirm the number is data-bound, not a literal`, trunc(m[0], 60))
      continue
    }
    blocker('honesty.hardcoded-scarcity', `${file}:${lineAt(raw, m.index)}`, `hardcoded scarcity "${trunc(m[0], 40)}" with no inventory binding (inventory_quantity / variant.available) — fabricated scarcity; bind to real stock`, trunc(m[0], 60))
  }

  // ── 3. honesty.fake-activity (WARN; STRICT promotes to blocker) ───────────────
  // "N people bought/purchased/ordered/viewing/sold" near today|hour|now with no liquid/metafield binding.
  const RE_ACTIVITY = /\b\d+\s+(?:people\s+)?(bought|purchased|ordered|viewing|sold)\b/gi
  for (const m of raw.matchAll(RE_ACTIVITY)) {
    if (isWaivedAt(raw, m.index)) continue
    const ctx = raw.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)
    if (!/\b(today|this\s+hour|in\s+the\s+last|right\s+now|now|recently)\b/i.test(ctx)) continue
    // data-bound ONLY if the number is liquid-rendered (liquid output right before it) or a
    // metafield/liquid var sits on the same line — not just any liquid tag in the window.
    const lineStart = raw.lastIndexOf('\n', m.index) + 1
    const lineEnd = raw.indexOf('\n', m.index); const line = raw.slice(lineStart, lineEnd === -1 ? raw.length : lineEnd)
    if (/\}\}\s*$/.test(raw.slice(Math.max(0, m.index - 24), m.index)) || /metafield/i.test(line)) continue
    const detail = `recent-activity claim "${trunc(m[0], 40)}" with a hardcoded number near "${trunc(ctx.match(/today|this hour|right now|now|recently|in the last[^,.<]*/i)?.[0] || 'now', 24)}" — fabricated social proof unless data-bound`
    if (STRICT) blocker('honesty.fake-activity', `${file}:${lineAt(raw, m.index)}`, `${detail} (STRICT_CONVERSION)`, trunc(m[0], 60))
    else add(warnings, 'honesty.fake-activity', `${file}:${lineAt(raw, m.index)}`, detail, trunc(m[0], 60))
  }

  // ── 4. honesty.unsourced-stat (WARN) ─────────────────────────────────────────
  // "N% of customers/users/… said/saw/…" in static copy with no nearby citation / binding.
  const RE_STAT = /\b\d{1,3}%\s+(?:of\s+)?(customers|users|people|shoppers|said|reported|saw|notice)/gi
  for (const m of raw.matchAll(RE_STAT)) {
    if (isWaivedAt(raw, m.index)) continue
    // Data-bound ONLY if the number itself is liquid-rendered (a liquid output immediately
    // before the % in the match) — an unrelated {%schema%}/{{...}} elsewhere in the file
    // must NOT suppress a hardcoded literal stat. A citation comment on the same line waives.
    const before = raw.slice(Math.max(0, m.index - 24), m.index)
    if (/\}\}\s*%?$/.test(before) || /\}\}$/.test(before)) continue // {{ stat }}% — rendered number
    const lineStart = raw.lastIndexOf('\n', m.index) + 1
    const lineEnd = raw.indexOf('\n', m.index); const line = raw.slice(lineStart, lineEnd === -1 ? raw.length : lineEnd)
    if (/<!--\s*(source|cite)\s*:/i.test(line) || /block\.settings/i.test(line)) continue // cited / setting-bound on this line
    add(warnings, 'honesty.unsourced-stat', `${file}:${lineAt(raw, m.index)}`, `percentage claim "${trunc(m[0], 40)}" with no citation (<!-- source: --> / block.settings binding) — unsourced stat`, trunc(m[0], 60))
  }
}

// ── 5. Fabricated SOCIAL PROOF (non-numeric honesty holes the patterns above miss) ──
// Sprint-3 dogfood (2026-06-16) proved a build can ship a hardcoded "4.9 / 1,284 reviews"
// aggregate, an "as seen in Vogue/Allure" press strip, and preset "Verified buyer" testimonials
// while #13 passed clean — none are countdown/scarcity/activity/percent patterns. This pass closes
// that: aggregate ratings/counts with no review-app source = BLOCK; fabricated press + preset
// "verified" testimonials = WARN. Scope = in-scope custom sections + ALL templates/*.json (where the
// aggregate SETTINGS live, outside the liquid scan above).
{
  function walkAll(dir, acc = []) {
    const abs = path.resolve(cwd, dir)
    if (!fs.existsSync(abs)) return acc
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) walkAll(rel, acc); else acc.push(rel)
    }
    return acc
  }
  const REVIEW_APP_RE = /judge\.?me|yotpo|okendo|\bloox\b|stamped|reviews\.io|shopify[-_]?product[-_]?reviews|\bspr[-_]|okeReviews|\bjdgm\b|trustpilot|reviewsio|fera\.ai|\bjunip\b|\brivyo\b|growave|\bopinew\b/i
  const PUBS = ['vogue', 'allure', 'byrdie', 'refinery29', 'into the gloss', 'cosmopolitan', 'elle', 'harper', 'glamour', 'forbes', 'techcrunch', 'goop', 'marie claire', 'popsugar', 'bustle', 'the cut', 'esquire', 'wwd', 'business insider', 'new york times', 'wall street journal']
  // whole-repo: is a real review platform wired ANYWHERE? (if so, an aggregate may be real → WARN not BLOCK)
  const repoFiles = ['sections', 'snippets', 'templates', 'assets', 'config', 'layout'].flatMap(d => walkAll(d))
  let reviewApp = false
  for (const f of repoFiles) { try { if (REVIEW_APP_RE.test(fs.readFileSync(path.resolve(cwd, f), 'utf-8'))) { reviewApp = true; break } } catch { /* skip */ } }

  const proofTargets = [...new Set([...targets.filter(f => /\.liquid$/.test(f)), ...walkAll('templates').filter(f => /\.json$/.test(f))])]
  const AGG_RATING = /\b(summary_rating|average_rating|aggregate_rating|star_rating)\b["']?\s*[:=]\s*["']?\s*([0-5](?:\.\d+)?)\b/gi
  const AGG_COUNT = /\b(total_reviews|reviews_count|review_count|rating_count)\b["']?\s*[:=]\s*["']?\s*["']?([\d,]{2,})\b/gi
  const isBound = (s) => /\{\{|\{%|metafield|block\.settings|product\.|\.rating\b|\.count\b|aggregate_rating\.value|\| *default/i.test(s)
  for (const file of proofTargets) {
    const abs = path.resolve(cwd, file); if (!fs.existsSync(abs)) continue
    const raw = fs.readFileSync(abs, 'utf-8')
    if (RE_REAL.test(raw)) continue // file-level honesty:real opt-out
    for (const re of [AGG_RATING, AGG_COUNT]) {
      re.lastIndex = 0; let m
      while ((m = re.exec(raw)) !== null) {
        const ctx = raw.slice(Math.max(0, m.index - 48), m.index + m[0].length + 48)
        if (isBound(ctx) || isWaivedAt(raw, m.index)) continue
        if (reviewApp) { add(warnings, 'honesty.unverified-aggregate', `${file}:${lineAt(raw, m.index)}`, `hardcoded ${m[1]} "${m[2]}" — a review app is wired in the repo; confirm this renders from real data, not a literal default`, trunc(m[0], 60)); continue }
        blocker('honesty.fabricated-aggregate', `${file}:${lineAt(raw, m.index)}`, `hardcoded ${m[1]} "${m[2]}" presented as social proof with NO review-app integration (Judge.me/Yotpo/Okendo/Loox/Stamped) and no data binding — fabricated aggregate; wire a real review source or blank it`, trunc(m[0], 60))
      }
    }
    // fabricated press — ≥2 publication names as literal copy under an "as seen in"-style frame, no source
    const pubsHit = PUBS.filter(p => new RegExp(`(?:^|[^a-z])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`, 'i').test(raw))
    if (pubsHit.length >= 2 && /as\s+seen\s+in|featured\s+in|as\s+featured|recognis|recognized|press\s+(strip|mentions)/i.test(raw)) {
      add(warnings, 'honesty.fabricated-press', file, `press/"as seen in" strip names ${pubsHit.length} publications (${pubsHit.slice(0, 4).join(', ')}) as literal copy — fabricated press unless the brand truly has these placements; gate logos behind real, sourced placements`, pubsHit.slice(0, 6).join(', '))
    }
    // preset testimonials shipped pre-flagged "verified" — a verified badge on author-written defaults
    const verifiedHits = (raw.match(/["']?verified["']?\s*:\s*true/gi) || []).length
    if (verifiedHits > 0 && /["'](author|reviewer|name|customer)["']\s*:\s*["'][A-Z]/.test(raw)) {
      add(warnings, 'honesty.preset-testimonial', file, `${verifiedHits} preset review(s) ship "verified": true + an author name as section defaults — a "Verified buyer" badge on author-written content is fabricated UGC; ship reviews empty or from a real review app`, '')
    }

    // ── 6. Unsubstantiated efficacy / composition CLAIMS (re-dogfood 2026-06-16) ──
    // A specific concentration ("at 5%") or capacity figure ("1,000x its weight") shipped as a
    // FACT with no source/citation/[CLAIM]/metafield binding is an invented number — same class as
    // a fabricated rating. The rebuild shipped ingredient-card claims ungated while [CLAIM]-gating
    // every other trust section. BLOCK the figures; WARN drug-like efficacy verbs.
    const FIGURE = /\b(?:at\s+)?\d{1,2}(?:\.\d+)?\s*%\s*(?:[a-z-]+\s+){0,3}?(?:niacinamide|retinol|retinal|vitamin|acid|peptide|ceramide|bakuchiol|active|concentration)\b|\b(?:niacinamide|retinol|retinal|hyaluronic|vitamin\s*c|bakuchiol|salicylic|glycolic|peptides?|ceramides?)\b[^.<>{}\n]{0,48}?\bat\s+\d{1,2}(?:\.\d+)?\s*%|\b\d[\d,]*\s*x\s+(?:its|their|the)?\s*(?:own\s+)?weight\b/gi
    const EFFICACY_VERB = /\b(?:clinically proven|rebuilds the (?:skin )?barrier|restores what [a-z]+ (?:remove|strip)|structurally identical|(?:three|multiple)\s+molecular weights?|boosts? collagen|reduces? (?:the appearance of\s+)?wrinkles)\b/gi
    const cited = (line) => /\[CLAIM|<!--\s*(?:source|cite)|metafield|block\.settings|\{\{|data-honesty\s*=\s*["']real["']|honesty:real/i.test(line)
    for (const re of [FIGURE]) {
      re.lastIndex = 0; let m
      while ((m = re.exec(raw)) !== null) {
        if (/%\s*off\b/i.test(m[0])) continue // discount, not a claim
        const ls = raw.lastIndexOf('\n', m.index) + 1; const le = raw.indexOf('\n', m.index); const line = raw.slice(ls, le === -1 ? raw.length : le)
        if (cited(line) || isWaivedAt(raw, m.index)) continue
        blocker('honesty.unsubstantiated-figure', `${file}:${lineAt(raw, m.index)}`, `specific composition/efficacy figure "${trunc(m[0], 44)}" shipped as fact with no source/citation/[CLAIM]/metafield binding — an invented number is fabrication; cite a real study or gate it [CLAIM — needs substantiation]`, trunc(m[0], 60))
      }
    }
    EFFICACY_VERB.lastIndex = 0; let mv
    while ((mv = EFFICACY_VERB.exec(raw)) !== null) {
      const ls = raw.lastIndexOf('\n', mv.index) + 1; const le = raw.indexOf('\n', mv.index); const line = raw.slice(ls, le === -1 ? raw.length : le)
      if (cited(line) || isWaivedAt(raw, mv.index)) continue
      add(warnings, 'honesty.efficacy-claim', `${file}:${lineAt(raw, mv.index)}`, `drug-like efficacy claim "${trunc(mv[0], 44)}" stated as fact with no source — substantiate (real study/citation) or soften; cosmetic copy must not imply clinical proof it can't show`, trunc(mv[0], 60))
    }
  }
}

// ── 7. Template-SEEDED fabrication (re-dogfood round 3, 2026-06-19) ──
// The fabrication vector moved from section DEFAULTS to TEMPLATE INSTANCE settings: a section
// shipped honest [CLAIM] defaults but templates/*.json OVERRODE them with fabricated clinical
// figures ("97%", "12x", "Independent 12-week study") + named "Verified purchase" testimonials —
// and §1-6 missed bare metrics ("97%"/"12x" have no "of customers"/"weight" anchor). This parses
// template block settings (the rendered, customer-facing values) and catches it at the source.
{
  const REVIEW_APP = /judge\.?me|yotpo|okendo|\bloox\b|stamped|reviews\.io|\bjdgm\b|trustpilot|growave|\bopinew\b|\bjunip\b/i
  const walkR = (d, acc = []) => { const a = path.resolve(cwd, d); if (!fs.existsSync(a)) return acc; for (const e of fs.readdirSync(a, { withFileTypes: true })) { const r = path.join(d, e.name); e.isDirectory() ? walkR(r, acc) : acc.push(r) } return acc }
  let reviewApp = false
  for (const f of ['sections', 'snippets', 'config', 'layout'].flatMap(d => walkR(d))) { try { if (REVIEW_APP.test(fs.readFileSync(path.resolve(cwd, f), 'utf-8'))) { reviewApp = true; break } } catch { /* skip */ } }

  const METRIC = /^\s*[+~]?\d{1,3}(?:[.,]\d+)?\s*(?:%|x|×|wks?|weeks?|days?|hrs?|hours?)\s*$/i
  const STUDY = /\b(?:stud(?:y|ies)|clinical(?:ly)?|trial|control(?: group)?|independent|proven|satisfaction|efficacy|dermatologist|in[\s-]?vivo|consumer[\s-]?test)\b/i
  const SEEDED_VERB = /clinically[\s-]?(?:proven|tested)|dermatologist[\s-]?(?:tested|recommended|reviewed|approved)|independent\s+\d+[\s-]?week\s+study|untreated\s+control|backed by (?:science|research|clinical)/i
  const CERT = /\b(?:derm(?:atologist)?[\s-]?tested|clinically[\s-]?tested|cruelty[\s-]?free|vegan|fragrance[\s-]?free|hypoallergenic|paraben[\s-]?free|non[\s-]?comedogenic|gmp[\s-]?certified|fda[\s-]?(?:approved|registered))\b/i
  const VERIFIED = /verified\s+(?:purchase|buyer|customer|review)/i
  const PERSON = (v) => /^[A-Z][a-z]+\.?\s+[A-Z]\.?$/.test(v.trim()) || /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(v.trim())

  for (const tf of walkR('templates').filter(f => /\.json$/.test(f))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.resolve(cwd, tf), 'utf-8')) } catch { continue }
    const groups = []
    for (const [sk, s] of Object.entries(j.sections || {})) {
      if (s && s.settings) groups.push({ loc: `${path.basename(tf)}:${sk}`, settings: s.settings })
      for (const [bk, b] of Object.entries((s && s.blocks) || {})) if (b && b.settings) groups.push({ loc: `${path.basename(tf)}:${sk}.${bk}`, settings: b.settings, blk: b })
    }
    for (const g of groups) {
      const vals = Object.values(g.settings).filter(v => typeof v === 'string')
      const text = vals.join(' | ')
      if (/\[CLAIM/i.test(text)) continue // honestly gated → ok
      // a) fabricated clinical stat — a bare metric value + study/clinical framing in the same block, no citation
      const metricVals = vals.filter(v => METRIC.test(v))
      if (metricVals.length && STUDY.test(text) && !/https?:\/\/|doi\.org/i.test(text)) {
        blocker('honesty.fabricated-clinical-stat', g.loc, `seeded stat block ships metric(s) ${metricVals.map(v => `"${v.trim()}"`).join(', ')} with clinical/study framing ("${trunc((text.match(STUDY) || [''])[0], 28)}") and no citation — a study-backed-looking figure with no real study is fabrication. Cite a real study/DOI or ship [CLAIM — needs substantiation].`, trunc(text, 70))
      }
      // b) seeded clinical verb (hyphen-tolerant; the in-template analog of §6 efficacy-claim)
      const vb = text.match(SEEDED_VERB); if (vb) add(warnings, 'honesty.efficacy-claim', g.loc, `seeded clinical claim "${trunc(vb[0], 40)}" in a template setting with no source — substantiate (real study) or soften`, trunc(vb[0], 60))
      // c) cert/standard claim shipped as a seeded label (regulated)
      const ct = text.match(CERT); if (ct && !/\[CLAIM/i.test(text)) add(warnings, 'honesty.cert-claim', g.loc, `cert/standard claim "${trunc(ct[0], 28)}" shipped as a seeded label — confirm it is truly certified for THIS store (regulated claim) or ship [CLAIM]/blank`, trunc(ct[0], 50))
      // d) fabricated testimonial — named author + quote + "verified", no review app
      const hasVerified = VERIFIED.test(text) || g.blk?.settings?.verified === true || /"verified"\s*:\s*true/i.test(JSON.stringify(g.settings))
      const hasPerson = vals.some(PERSON)
      const hasQuote = vals.some(v => v.length > 30 && /[a-z]\s+[a-z]/i.test(v))
      if (hasVerified && hasPerson && hasQuote && !reviewApp) {
        blocker('honesty.fabricated-testimonial', g.loc, `a testimonial block ships a named author + quote + a "verified" badge with NO review app wired — fabricated UGC presented as a verified purchase. Wire a real review app or ship reviews blank/[CLAIM].`, trunc(text, 70))
      }
    }
  }
}

finish(null)
