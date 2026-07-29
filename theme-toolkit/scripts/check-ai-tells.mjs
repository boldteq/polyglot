#!/usr/bin/env node
// Gate #53 ai-tells — the MECHANICAL, non-calibration slice of the AI-design-tell taxonomy.
//
// WHY (shopify-design-taste-doctrine.md, from pack 05-ai-tells.md, verified 2026-07-25): the gate stack
// verifies CORRECTNESS, not DESIRABILITY — which is why "all gates green, still looks AI-built." The doctrine
// reduces "AI-looking" to four measurable axes (duplication · thinness · missing institutional signals ·
// borrowed assets). This gate enforces the two axes that are mechanically checkable in a STATIC theme repo
// WITHOUT a human-theme calibration corpus. The rest (duplication/AT-1, stock imagery/AT-6, emoji-icons)
// need render/store data or a baseline we don't have yet — they live in the doctrine + Lens, not here.
//
// CHECK A — AT-10 cliché headlines [P] (diff-scoped: the copy THIS build authored). Eight CC0 multi-token
//   regex tripwires over the headline/tagline corpus (<h1>/<h2> text + heading-ish schema defaults +
//   heading-ish locale values). Multi-token → high precision, low FP. Diff-scoped so we never re-warn on the
//   vendored theme's own demo copy.
// CHECK B — AT-5 institutional signals [E] (whole-theme: a theme-wide property). Warn if the theme surfaces
//   NO store-policy signal anywhere (no shop.*_policy, no /policies/ link, no policy link text) or NO contact
//   affordance ({% form 'contact' %}, tel:/mailto:, shop.email/phone, contact template). Dawn/Minimog ship
//   both by default, so a normal build passes; only a stripped theme trips it — exactly the missing-signal tell.
//
// NOT here (by design): never penalise a plain/conventional layout (doctrine §Z — prototypicality is
//   rewarded); no em-dash checks; no third-party AI-text detectors on copy. See the doctrine.
//
// WARN-ONLY. AT-10 cliché-headline is practitioner-consensus [P]; the evidence-tier→enforcement-cap
// (lib/evidence-tier.mjs, enforced by gate #45) forbids a [P] tell from hard-blocking a publish — a
// stylistic tripwire that can hard-stop a build is a false-BLOCK risk ("as bad as a false pass"). The
// self-doing loop fixes warnings too, so fix-pressure is kept without that risk. AT-5 institutional-signals
// [E] is under-claimed to warn (a merchant can add policies/contact via settings/admin). Findings carry
// `tier` so #45 can enforce the cap; the publish-grade flag no longer escalates AT-10.
// Usage: node check-ai-tells.mjs   Env: BASE_REF (base) · REPORT_DIR · DS_REQUIRE_SCOPE=1 · AI_TELLS_SCAN_ALL=1
// Exit: 0 pass · 2 env error (no blockers outside a crash — AT-10 is warn-only [P], see gate #45 tier cap)

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1'
const SCAN_ALL = process.env.AI_TELLS_SCAN_ALL === '1'
const COPY_DIRS = ['sections', 'templates', 'locales'] // diff scope for AT-10 (authored copy)

const blockers = []
const warnings = []

// ── PURE helpers (exported for the fixture) ──────────────────────────────────
// AT-10 cliché-headline tripwires — CC0 expert-elicited list (pack 05 AT-10). Multi-token → high precision.
export const CLICHE_PATTERNS = [
  // apostrophes accept straight ' AND curly ’ — real storefront copy is smart-quoted, so a straight-only
  // pattern silently misses the cliché it's meant to catch.
  { id: 'negative-parallelism', re: /\b(?:it['’]?s|it is|this is|we['’]?re)\s+not\s+(?:just|only|merely|simply)\b[^.!?;]{0,60}?[,—–-]{0,3}\s*(?:it['’]?s|it is|but)\b/i },
  { id: 'not-only-but-also', re: /\bnot\s+only\b[^.!?;]{1,80}\bbut\s+(?:also\b)?/i },
  { id: 'todays-world', re: /\bin\s+(?:today['’]?s|a|an|this)\s+(?:[a-z-]+\s+){0,2}(?:world|landscape|market|era)\b/i },
  { id: 'unlock-power', re: /\bunlock(?:s|ing)?\s+(?:the\s+)?(?:power|potential|secret(?:s)?|magic)\b/i },
  { id: 'elevate-your', re: /\belevat(?:e|es|ing)\s+(?:your|the|every)\b/i },
  { id: 'meticulously-crafted', re: /\b(?:meticulous|careful|thoughtful|expert|lovingly)(?:ly)?\s+(?:crafted|curated|designed|sourced)\b/i },
  { id: 'more-than-just', re: /\bmore\s+than\s+just\b/i },
  { id: 'paving-the-way', re: /\bpav(?:e|es|ed|ing)\s+the\s+way\b/i },
]

export function clicheHits(text) {
  const s = String(text || '')
  const hits = []
  for (const { id, re } of CLICHE_PATTERNS) {
    const m = re.exec(s)
    if (m) hits.push({ id, snippet: m[0].trim().replace(/\s+/g, ' ').slice(0, 80) })
  }
  return hits
}

const HEADING_KEY = /head(ing|line)?|title|tagline|subheading|hero|slogan|banner_text/i
const HTML_HEADING = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi
const STRIP_TAGS = /<[^>]+>/g
const LIQUID_OUT = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i

// Headline/tagline corpus from one .liquid file: <h1>/<h2> inner text + heading-ish schema `default` values.
export function headlineCorpusFromLiquid(raw) {
  const src = String(raw || '')
  const out = []
  let m
  HTML_HEADING.lastIndex = 0
  while ((m = HTML_HEADING.exec(src))) {
    const txt = m[1].replace(LIQUID_OUT, ' ').replace(STRIP_TAGS, ' ').replace(/\s+/g, ' ').trim()
    if (txt) out.push(txt)
  }
  const sch = SCHEMA_RE.exec(src)
  if (sch) {
    try {
      const json = JSON.parse(sch[1])
      const walkSettings = (arr) => {
        if (!Array.isArray(arr)) return
        for (const s of arr) {
          if (s && typeof s === 'object' && typeof s.default === 'string' && HEADING_KEY.test(`${s.id || ''} ${s.label || ''}`)) out.push(s.default)
        }
      }
      walkSettings(json.settings)
      if (Array.isArray(json.blocks)) for (const b of json.blocks) walkSettings(b && b.settings)
    } catch { /* non-JSON schema — skip */ }
  }
  return out
}

// Heading-ish string values from a locale JSON object (keys matching HEADING_KEY, at any depth).
export function headlineCorpusFromLocale(obj, key = '') {
  const out = []
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') { if (HEADING_KEY.test(k)) out.push(v) }
      else if (v && typeof v === 'object') out.push(...headlineCorpusFromLocale(v, k))
    }
  }
  return out
}

// AT-5 institutional signals over concatenated theme text (+ file paths) → which are present.
const POLICY_RE = /shop\.(?:privacy_policy|terms_of_service|refund_policy|shipping_policy|subscription_policy)|\/policies\/|(?:privacy|refund|return|shipping|terms)\s+policy/i
const CONTACT_RE = /\{%-?\s*form\s+['"]contact['"]|(?:href|url)\s*=?\s*['"]?(?:tel:|mailto:)|shop\.(?:email|phone)|\/pages\/contact|templates\/page\.contact|sections\/contact-form/i
export function institutionalSignals(allText) {
  const s = String(allText || '')
  return { policy: POLICY_RE.test(s), contact: CONTACT_RE.test(s) }
}

// ── file walking ─────────────────────────────────────────────────────────────
const walk = (dir, exts, acc = []) => {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
// AT-10 copy files: .liquid in sections/templates + `*.default.json` in locales (never *.schema.json — those
// are editor labels, per the gate #36 lesson).
const isCopyFile = (f) => (f.endsWith('.liquid') && (f.startsWith('sections') || f.startsWith('templates'))) || /locales\/.*\.default\.json$/.test(f)
function scopedCopyFiles() {
  if (SCAN_ALL) return { files: COPY_DIRS.flatMap((d) => walk(d, ['.liquid', '.json'])).filter(isCopyFile), scoped: false }
  try { execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { return { files: null, scoped: false, reason: `base ref "${BASE_REF}" unresolvable` } }
  try {
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...COPY_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: out.split('\n').map((s) => s.trim()).filter(isCopyFile), scoped: true }
  } catch (e) { return { files: null, scoped: false, reason: `git diff failed: ${e.message}` } }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('ai-tells', 53, { cwd, pass, blockers, warnings, evidence: { baseRef: BASE_REF, strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`ai-tells: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }

  // ── CHECK B — AT-5 institutional signals: whole-theme scan (a theme-wide property) ──
  const themeFiles = [
    ...walk('sections', ['.liquid']), ...walk('snippets', ['.liquid']), ...walk('layout', ['.liquid']),
    ...walk('templates', ['.liquid', '.json']), ...walk('config', ['.json']),
  ]
  let allText = themeFiles.join('\n')
  for (const rel of themeFiles) { try { allText += '\n' + fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { /* skip */ } }
  const sig = institutionalSignals(allText)
  if (!sig.policy) warnings.push({ id: 'ai.missing-policy-links', page: '(theme)', tier: 'E', detail: 'no store-policy signal anywhere in the theme (no shop.*_policy reference, no /policies/ link, no policy link text) — "missing institutional signals" is a top AI-tell (design-taste doctrine, axis 3). Wire the footer policy menu / policy links (Dawn & Minimog ship this by default).', evidence: '' })
  if (!sig.contact) warnings.push({ id: 'ai.missing-contact', page: '(theme)', tier: 'E', detail: 'no contact affordance found (no {% form "contact" %}, tel:/mailto: link, shop.email/shop.phone, or contact template/section) — add a contact route so the store carries a real institutional signal.', evidence: '' })

  // ── CHECK A — AT-10 cliché headlines: diff-scoped to the copy this build authored ──
  const { files, scoped, reason } = scopedCopyFiles()
  if (files === null) {
    warnings.push({ id: 'ai-tells.scope-unresolved', page: '.', detail: `${reason} — cannot tell this build's copy from the vendored theme's, so the cliché-headline scan was skipped. Tag the base commit \`base\`.`, evidence: BASE_REF })
    finish(null, { at5: sig, cliche: 'skipped-no-base' })
  }
  if (files.length === 0) {
    // AT-10 (the only BLOCKING dimension) had no authored copy to examine — declare N/A so a green tick is
    // never mistaken for "verified" (skip≠pass, per audit-vacuous-pass). AT-5's whole-theme warnings above stand.
    warnings.push({ id: 'ai-tells.n-a-no-copy', page: '.', detail: 'no custom section/template/locale copy in the build — no headline to scan for cliché templates (absence of signal, not a defect).', evidence: '' })
    finish(null, { at5: sig, headlineFiles: 0, headlines: 0, copyFiles: 0, scope: scoped ? 'build-diff' : 'all', cliche: 'n-a' })
  }
  let headlineFiles = 0
  let headlineCount = 0
  for (const rel of files) {
    let raw
    try { raw = fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { continue }
    let corpus = []
    if (rel.endsWith('.liquid')) corpus = headlineCorpusFromLiquid(raw)
    else { try { corpus = headlineCorpusFromLocale(JSON.parse(raw)) } catch { corpus = [] } }
    if (corpus.length) headlineFiles += 1
    for (const line of corpus) {
      headlineCount += 1
      for (const h of clicheHits(line)) {
        // AT-10 is practitioner-consensus [P]: the evidence-tier cap (lib/evidence-tier.mjs, enforced by
        // gate #45) forbids a [P] tell from hard-blocking — always WARN, even at publish-grade. Tagged
        // tier:'P' so #45 can hold the cap. The self-doing loop fixes warnings, so it still gets rewritten.
        warnings.push({ id: 'ai.cliche-headline', page: rel, tier: 'P', detail: `cliché-headline template "${h.id}" in a heading/tagline: "${h.snippet}" — LLM-default phrasing (design-taste doctrine / AT-10 [P]). Rewrite to concrete, brand-specific copy.`, evidence: h.id })
      }
    }
  }
  finish(null, { at5: sig, headlineFiles, headlines: headlineCount, copyFiles: files.length, scope: scoped ? 'build-diff' : 'all', cliche: blockers.length + warnings.filter((w) => w.id === 'ai.cliche-headline').length })
}

// CLI only — importable for its pure helpers without running the gate.
if (isMain(import.meta.url)) {
  try { main() } catch (e) {
    writeReport('ai-tells', 53, { cwd, pass: false, blockers: [{ id: 'ai-tells.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: {}, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`ai-tells: CRASH — ${e.message}`)
    process.exit(2)
  }
}
