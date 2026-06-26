#!/usr/bin/env node
// #36 — placeholder / dev-leftover / unreplaced-default detector. The deterministic enforcer for the
// content-integrity HARD standard (build-standards-checklist §7): a shopper must NEVER see a dev/test
// leftover or unreplaced theme-default string. Mechanizes two real, recurring leaks:
//   • DEV LEFTOVERS (always BLOCK) — "© GPT TEST 1.0" (the gpt-test-1 footer leak that only Lens
//     caught), "lorem ipsum", a rendered [CLAIM]/[PLACEHOLDER]/[TODO], "your-store-name"/"example.com",
//     "test/demo store". Zero legit reason to ship these.
//   • UNREPLACED THEME DEFAULTS (WARN dev → BLOCK publish-grade) — Dawn/Minimog stock copy left in the
//     SHIPPED content ("Talk about your brand", "Button label", "Your collection's name", "Example
//     product", "Welcome to our store"…) = a generic-demo tell.
//
// Scope is deliberate to avoid false positives:
//   • DEV leftovers: the SEEDED/shipped content surfaces (config/settings_data.json, templates/*.json,
//     locales/*.json) + section/snippet rendered Liquid.
//   • Theme defaults: ONLY the shipped values (config/settings_data.json + templates/*.json) — NOT
//     section schema `default:` (a schema legitimately carries "Button label" as ITS default; the leak
//     is when that value ships unchanged into the store's settings/templates).
//
// Usage: node check-placeholder-text.mjs
// Env: PLACEHOLDER_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (theme-defaults → BLOCK) · ALLOW_PLACEHOLDER_WAIVER=1
//      (CHANGES.md ## Waivers) · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// devLeftovers + unreplacedDefaults are PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

// PURE: dev/test leftovers that must NEVER reach a shopper. Returns [{id, match}]. Always block-eligible.
const DEV_PATTERNS = [
  { re: /lorem ipsum/i, what: 'lorem ipsum filler' },
  { re: /\bgpt[ \-]?test\b/i, what: 'GPT TEST dev string' },
  { re: /©[^<\n]{0,40}\btest\b/i, what: 'copyright line contains "TEST" (e.g. "© GPT TEST 1.0")' },
  { re: /\[(claim|placeholder|todo|tbd|fixme)\b/i, what: 'rendered [CLAIM]/[PLACEHOLDER]/[TODO] marker' },
  { re: /\b(your[- ]store[- ]name|yourstore\.com|example\.myshopify|example\.com|yourdomain)\b/i, what: 'placeholder store/domain' },
  { re: /\b(test|demo|sample)\s+(store|product|collection|page)\b/i, what: 'test/demo/sample placeholder noun' },
  { re: /\b(todo|fixme)\s*[:!]/i, what: 'TODO:/FIXME: leftover' },
]
export function devLeftovers(text) {
  const out = []
  const s = String(text || '')
  for (const { re, what } of DEV_PATTERNS) { const m = s.match(re); if (m) out.push({ id: 'placeholder.dev-leftover', match: m[0].slice(0, 60), what }) }
  return out
}

// PURE: unreplaced Dawn/Minimog stock copy in SHIPPED content. Exact-ish stock strings (not substrings
// of normal copy). Returns [{id, match}]. WARN dev → BLOCK publish-grade.
const THEME_DEFAULTS = [
  'talk about your brand',
  'share information about your brand',
  "your collection's name",
  'example product',
  'welcome to our store',
  'add a tagline',
  'use this text to share information about your brand',
  'pair text with an image',
]
export function unreplacedDefaults(text) {
  const out = []
  const s = String(text || '').toLowerCase()
  for (const d of THEME_DEFAULTS) if (s.includes(d)) out.push({ id: 'placeholder.unreplaced-default', match: d })
  // "Button label" only flagged as a SHIPPED value (caller scopes to settings/templates), high-signal there
  if (/\bbutton label\b/i.test(String(text || ''))) out.push({ id: 'placeholder.unreplaced-default', match: 'Button label' })
  return out
}

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1' || process.env.PLACEHOLDER_ENFORCE === '1'
const ALLOW_WAIVER = process.env.ALLOW_PLACEHOLDER_WAIVER === '1' && changesWaives('placeholder')
const blockers = []
const warnings = []

function changesWaives(word) {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    return m ? new RegExp(`\\b${word}\\b`, 'i').test(m[1].split(/\n##\s/)[0]) : false
  } catch { return false }
}

function read(f) { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('placeholder', 36, { cwd, pass, blockers, warnings, evidence: { strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`placeholder: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  // shipped-content surfaces (where seeded shopper-text lives) + rendered Liquid (dev-leftovers only)
  const shipped = [...walk('templates', ['.json']), ...walk('locales', ['.json'])]
  if (fs.existsSync(path.resolve(cwd, 'config/settings_data.json'))) shipped.push('config/settings_data.json')
  const rendered = [...walk('sections', ['.liquid']), ...walk('snippets', ['.liquid'])]

  if (!shipped.length && !rendered.length) {
    warnings.push({ id: 'placeholder.n-a-no-content', page: '-', detail: 'no shipped-content surfaces (templates/locales/settings_data/sections) — nothing to scan (skip)', evidence: '' })
    return finish(null, { scope: 'n/a' })
  }

  let devHits = 0
  let defHits = 0
  // DEV leftovers — across shipped content + rendered Liquid (must never appear anywhere shopper-facing)
  for (const f of [...new Set([...shipped, ...rendered])]) {
    for (const d of devLeftovers(read(f))) {
      const finding = { id: d.id, page: f, detail: `${d.what}: "${d.match}" — a dev/test leftover must never ship to a shopper. Remove or replace with real content.`, evidence: d.match }
      ;(ALLOW_WAIVER ? warnings : blockers).push(ALLOW_WAIVER ? { ...finding, id: `${d.id}.waived` } : finding)
      devHits += 1
    }
  }
  // Unreplaced theme defaults — ONLY the shipped values (not schema defaults)
  for (const f of shipped) {
    for (const d of unreplacedDefaults(read(f))) {
      const detail = `unreplaced theme-default copy: "${d.match}" shipped in ${f} — replace with real brand/store content (a generic-demo tell).`
      if (STRICT && !ALLOW_WAIVER) blockers.push({ id: d.id, page: f, detail, evidence: d.match })
      else warnings.push({ id: ALLOW_WAIVER ? `${d.id}.waived` : d.id, page: f, detail: `${detail}${STRICT ? ' (waived)' : ' (publish-grade BLOCK; warn in dev)'}`, evidence: d.match })
      defHits += 1
    }
  }

  finish(null, { shipped: shipped.length, rendered: rendered.length, devHits, defHits })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
}
