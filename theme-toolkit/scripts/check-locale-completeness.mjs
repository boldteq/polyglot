#!/usr/bin/env node
// #51 — multi-locale completeness. A multi-language store with missing translations renders raw keys
// or English fallbacks in another language (the Lens judge flags untranslated strings, but only if that
// locale was captured). This is the deterministic, hermetic complement: every key in the DEFAULT
// storefront locale must exist in every other storefront locale. SKIPS a monolingual store (<2 locales).
// Schema locales (locales/*.schema.json — theme-editor labels) are excluded.
//
// Usage: node check-locale-completeness.mjs        scan locales/ in cwd
// Env: LOCALE_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (→ BLOCK) · REPORT_DIR · LOCALES_DIR (locales)
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// flattenKeys / localeParityGaps are PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

// PURE: every leaf key path in a nested translation object (arrays treated as leaves).
export function flattenKeys(obj, prefix = '') {
  const keys = []
  if (!obj || typeof obj !== 'object') return keys
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flattenKeys(v, key))
    else keys.push(key)
  }
  return keys
}

// PURE: parse a Shopify locale file. Shopify AUTO-GENERATES every locale (incl. en.default.json) with a
// leading `/* ... auto-generated ... */` header comment — valid Shopify, but not strict JSON. Strip a
// leading block comment (+ BOM) before JSON.parse so the real locale content parses. Throws on real errors.
export function parseLocaleJson(text) {
  const stripped = String(text).replace(/^﻿/, '').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
  return JSON.parse(stripped)
}

// PURE: keys present in the default locale but MISSING in each other locale. locales = {loc: parsedJson}.
export function localeParityGaps(locales, defaultLocale) {
  const def = locales?.[defaultLocale]
  if (!def) return {}
  const defKeys = new Set(flattenKeys(def))
  const gaps = {}
  for (const [loc, obj] of Object.entries(locales)) {
    if (loc === defaultLocale) continue
    const has = new Set(flattenKeys(obj))
    const missing = [...defKeys].filter(k => !has.has(k))
    if (missing.length) gaps[loc] = missing
  }
  return gaps
}

function main() {
  const t0 = Date.now()
  const cwd = process.cwd()
  const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
  const LOCALES_DIR = process.env.LOCALES_DIR || 'locales'
  const ENFORCE = process.env.LOCALE_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
  const blockers = []
  const warnings = []
  const finish = (evidence = {}) => {
    const pass = blockers.length === 0
    writeReport('translations', 28, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.log(`locale-completeness: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
    for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
    for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
    process.exit(pass ? 0 : 1)
  }

  const dir = path.resolve(cwd, LOCALES_DIR)
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.schema.json')) } catch { /* none */ }
  if (files.length < 2) { warnings.push({ id: 'locale.n-a-monolingual', page: LOCALES_DIR, detail: `<2 storefront locale files — monolingual store, parity check skipped`, evidence: '' }); return finish({ locales: files.length }) }

  const locales = {}
  let defaultLocale = null
  for (const f of files) {
    const loc = f.replace(/\.default\.json$|\.json$/, '')
    if (f.endsWith('.default.json')) defaultLocale = loc
    try { locales[loc] = parseLocaleJson(fs.readFileSync(path.join(dir, f), 'utf-8')) } catch (e) { warnings.push({ id: 'locale.unparseable', page: f, detail: `invalid JSON: ${e.message}`, evidence: '' }) }
  }
  if (!defaultLocale) defaultLocale = Object.keys(locales)[0] // no *.default.json → first as reference

  const gaps = localeParityGaps(locales, defaultLocale)
  for (const [loc, missing] of Object.entries(gaps)) {
    const detail = `locale "${loc}" is missing ${missing.length} key(s) present in the default "${defaultLocale}" (e.g. ${missing.slice(0, 4).join(', ')}) — untranslated strings will render the default-language fallback.`
    ;(ENFORCE ? blockers : warnings).push({ id: 'locale.missing-keys', page: loc, detail, evidence: missing.slice(0, 8).join(', ') })
  }
  finish({ locales: files.length, defaultLocale, gapLocales: Object.keys(gaps).length })
}

if (isMain(import.meta.url)) {
  main()
}
