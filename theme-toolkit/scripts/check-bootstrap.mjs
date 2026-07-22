#!/usr/bin/env node
// Gate #0.5 — bootstrap-complete. The "don't let a build reach the QA gates on a broken
// foundation" pre-gate. Sprint 2026-06-20: the gpt-test-1 build reached publish-grade with NO
// design-system.json (the contract every section binds to), NO baseline tag, and a placeholder
// store identity — and ~12 downstream gates SKIPPED ("scope unresolvable") because the foundation
// was missing. A skipped gate reads as "fine"; it isn't. This gate makes the foundation a hard
// precondition so the run fails LOUDLY at the door instead of quietly producing garbage.
//
// Checks (publish-grade = DS_REQUIRE_SCOPE=1 / BOOTSTRAP_REQUIRED=1 → BLOCK; dev → WARN):
//   1. design-system.json present + parseable at docs/design/design-system.json (the locked DGS
//      contract drape authors + every section binds to). Absent → the #8/#14/#17/#19 chain can't
//      anchor. This is the single most load-bearing foundation file.
//   2. JSON templates + config parse (Shopify-comment-tolerant — these files legitimately carry a
//      `/* auto-generated */` header). A genuinely malformed templates/*.json or config/*.json
//      means the editor/PDP can't render. (Strict JSON.parse would false-block the header comment —
//      we strip /* */ first, exactly as Shopify's own parser tolerates.)
//   3. Store identity is not a placeholder — "gpt test", "test store", "my store", "© … test …" in
//      config/settings_data.json or locales/*.default.json. A test name shipping live is the
//      Meridian/gpt-test failure class (Lens caught "© GPT TEST 1.0" at render; this catches it at
//      source, pre-render, for free).
//   4. A baseline git tag exists — gates that diff against a baseline ("changed since base") silently
//      skip AND report pass without one (this disabled 8 gates for 9 days on cravinbyandy). Publish-
//      grade BLOCKS; dev WARNs (the dev contract stands) — but the CONSEQUENCE always blocks at any
//      grade via gate #45 check-gate-integrity, which catches a gate reporting pass on a skipped scan.
//      Fix: `git tag base`.
//
// Usage: node check-bootstrap.mjs
// Env: REPORT_DIR (gate-reports) · DS_REQUIRE_SCOPE=1 | BOOTSTRAP_REQUIRED=1 (publish-grade: 1–3 BLOCK)
//      · BOOTSTRAP_BASELINE_TAG (regex of an acceptable baseline tag; default /^base(line)?\b|^v?0/i)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.BOOTSTRAP_REQUIRED === '1'
const BASELINE_RE = (() => {
  try { return process.env.BOOTSTRAP_BASELINE_TAG ? new RegExp(process.env.BOOTSTRAP_BASELINE_TAG, 'i') : /^base(line)?\b|^v?0\./i }
  catch { return /^base(line)?\b|^v?0\./i }
})()

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
// publish-grade → blocker; dev → warning (same posture as #17/#18: warn in dev, block at publish).
const issue = (id, page, detail, evidence = '') => (REQUIRE ? add(blockers, id, page, detail, evidence) : add(warnings, id, page, detail, evidence))

// Shopify JSON-template/config files carry a `/* auto-generated */` header that strict JSON.parse
// rejects but Shopify itself tolerates. Strip block comments before parsing so we flag only REAL
// corruption, never the header. Returns { ok, value, error }.
function parseShopifyJson(raw) {
  try { return { ok: true, value: JSON.parse(raw) } } catch { /* fall through to comment-strip */ }
  try {
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    return { ok: true, value: JSON.parse(stripped) }
  } catch (e) { return { ok: false, error: e.message } }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('foundation', 0.5, {
    cwd, pass, blockers, warnings,
    evidence: { required: REQUIRE, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`bootstrap: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── 1. design-system.json — the locked DGS contract ──────────────────────────
// Canonical location is docs/design/design-system.json. (gate-reports/design-system.json is the
// GATE's OUTPUT, not the contract — must not be mistaken for the real file.)
function checkDesignSystem() {
  const rel = 'docs/design/design-system.json'
  const p = path.resolve(cwd, rel)
  if (!fs.existsSync(p)) {
    issue('bootstrap.ds-missing', rel,
      `no ${rel} — the locked design-system contract every section binds to (--ds-* tokens, type scale, schemes) is absent. drape authors it before build; #8/#14/#17/#19 cannot anchor without it. This is why gates "skip — scope unresolvable".`)
    return
  }
  let raw
  try { raw = fs.readFileSync(p, 'utf-8') } catch (e) { issue('bootstrap.ds-unreadable', rel, `unreadable: ${e.message}`); return }
  const parsed = parseShopifyJson(raw)
  if (!parsed.ok) { issue('bootstrap.ds-invalid', rel, `invalid JSON: ${parsed.error}`); return }
  // A present-but-empty contract is as useless as a missing one — require the load-bearing keys.
  const ds = parsed.value || {}
  const haveTokens = ds.tokens || ds.colors || ds.color_schemes || ds.palette
  const haveType = ds.type || ds.typography || ds.fonts || ds.type_scale
  if (!haveTokens || !haveType) {
    issue('bootstrap.ds-empty', rel,
      `design-system.json present but missing core sections (need color/token defs AND a type scale; saw keys: ${Object.keys(ds).slice(0, 8).join(', ') || '∅'}).`)
  }
  // A contract that cannot be ENFORCED is a missing contract (2026-07-22 cravinbyandy forensics):
  // the file had a `typography` key — so the check above passed — but `typography.allowed_px` and
  // `spacing.scale` were BOTH null, so gate #8 could never flag font-size or spacing drift. That is
  // precisely the class of bug the client re-reported for 9 days ("font too big", "spacing off").
  const nonEmpty = (v) => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : false)
  const typeScale = (ds.typography && (ds.typography.allowed_px || ds.typography.scale)) || ds.type_scale
  const spaceScale = (ds.spacing && (ds.spacing.scale || ds.spacing.allowed_px)) || ds.space_scale
  if (!nonEmpty(typeScale)) {
    issue('bootstrap.ds-no-type-scale', rel,
      'design-system.json has no non-empty typography scale (typography.allowed_px / typography.scale) — font-size drift is UNENFORCEABLE; gate #8 can never block a wrong font size. Populate the allowed px/rem set from the approved design.')
  }
  if (!nonEmpty(spaceScale)) {
    issue('bootstrap.ds-no-space-scale', rel,
      'design-system.json has no non-empty spacing scale (spacing.scale) — spacing drift is UNENFORCEABLE; gate #8 can never block inconsistent section padding. Populate the spacing steps from the approved design.')
  }
}

// ── 2. JSON templates + config parse (Shopify-comment-tolerant) ──────────────
function checkJsonParses() {
  const dirs = ['templates', 'templates/customers', 'config', 'sections']
  let scanned = 0
  for (const d of dirs) {
    const abs = path.resolve(cwd, d)
    let entries
    try { entries = fs.readdirSync(abs) } catch { continue }
    for (const f of entries) {
      if (!f.endsWith('.json')) continue
      const rel = `${d}/${f}`
      let raw
      try { raw = fs.readFileSync(path.join(abs, f), 'utf-8') } catch (e) { issue('bootstrap.json-unreadable', rel, `unreadable: ${e.message}`); continue }
      scanned += 1
      const parsed = parseShopifyJson(raw)
      if (!parsed.ok) {
        // PDP/index/settings corruption is the highest-severity (a shopper hits a broken page).
        issue('bootstrap.json-invalid', rel,
          `malformed JSON (not just the auto-generated comment header) — Shopify cannot render this. ${parsed.error}`)
      }
    }
  }
  return scanned
}

// ── 3. Store identity is not a placeholder ───────────────────────────────────
const PLACEHOLDER_RE = /\b(gpt\s*test|test\s*store|my\s*store|demo\s*store|example\s*store|store\s*name|lorem\s*ipsum|untitled\s*store|acme(\s*(inc|co|store))?)\b/i
function checkIdentity() {
  // settings_data.json (theme name + any name/title preset values) + the storefront locale.
  const candidates = [
    'config/settings_data.json',
    'locales/en.default.json',
  ]
  for (const rel of candidates) {
    const p = path.resolve(cwd, rel)
    if (!fs.existsSync(p)) continue
    let raw
    try { raw = fs.readFileSync(p, 'utf-8') } catch { continue }
    const parsed = parseShopifyJson(raw)
    if (!parsed.ok) continue // parse-failure already flagged by check #2 if under a scanned dir
    // Scan string VALUES (not keys) for placeholder identity. Flatten the object cheaply.
    const hits = new Set()
    const walk = (v) => {
      if (typeof v === 'string') { const m = v.match(PLACEHOLDER_RE); if (m) hits.add(m[0].replace(/\s+/g, ' ').trim()) }
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(parsed.value)
    if (hits.size) {
      issue('bootstrap.placeholder-identity', rel,
        `placeholder store identity in a shipped file: ${[...hits].slice(0, 4).map(h => `"${h}"`).join(', ')} — a real store name/brand must replace it before publish (this is the "© GPT TEST 1.0" render failure class, caught at source).`)
    }
  }
}

// ── 4. Baseline git tag — BLOCKING (2026-07-22 cravinbyandy forensics) ───────
// This was advisory ("not every repo tags, so this never blocks"). That was wrong: without a baseline
// tag EIGHT scope-resolving gates (#8/#9/#11/#13/#14/#16/#22/#23) skip their scan and still report
// pass:true, and SUMMARY.md prints them as "✅ Passed". On cravinbyandy that state held for 9 days
// while the client re-reported spacing/typography bugs no gate was checking. A missing baseline tag is
// not a style preference — it silently disables most of the quality stack. BLOCK it.
function checkBaselineTag() {
  // The baseline tag belongs to the THEME repo. If cwd isn't the git toplevel we're inside some other
  // repo (e.g. a nested fixture/sandbox) and its tags say nothing about this theme — don't judge it.
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (top && path.resolve(top) !== path.resolve(cwd)) return
  } catch { /* handled below */ }
  let tags
  try { tags = execFileSync('git', ['tag'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean) }
  catch { issue('bootstrap.not-git', '.', 'not a git repo (or git unavailable) — baseline-diff gates have no anchor, so they will skip and falsely report pass. `git init` + commit the pulled baseline + `git tag base`.'); return }
  const baseline = tags.find(t => BASELINE_RE.test(t))
  if (!baseline) {
    issue('bootstrap.no-baseline-tag', '.', `no baseline tag (looked for ${BASELINE_RE}) among ${tags.length} tag(s) — gates that diff "since base" SKIP their scan and still report pass (#8/#9/#11/#13/#14/#16/#22/#23). Tag the pulled theme base: \`git tag base\`.`)
  }
}

function main() {
  checkDesignSystem()
  const scanned = checkJsonParses()
  checkIdentity()
  checkBaselineTag()
  finish(null, { jsonScanned: scanned })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
