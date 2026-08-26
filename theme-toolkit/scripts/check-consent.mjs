#!/usr/bin/env node
// Gate #42 consent (Press · quality) — GDPR/CCPA cookie consent is present and implemented right.
// Selling into the EU/UK/CA without consent = fines + Google/ad-network penalties. Static: scan for
// a consent mechanism (Shopify Customer Privacy API / a consent banner / a vetted consent app) and
// that non-essential third-party scripts are deferred/async (so they can be gated on consent). The
// "banner must not occlude the primary CTA" half is enforced by Lens (#18). Warn-first; BLOCKS at
// publish-grade (CONSENT_REQUIRE/DS_REQUIRE_SCOPE). SKIPS when no theme. Exit: 0 · 1 · 2.
//
// 2026-08-25 — P1 canonical alignment verified. This gate is MECHANISM-agnostic (category b):
// the regex below matches `customerPrivacy` / `setTrackingConsent` (Shopify's window.Shopify
// .customerPrivacy API used by the new P1 `snippets/customer-privacy-bar.liquid` canonical
// snippet) as well as legacy `cookie-banner` / `consent-banner` / `gdpr` patterns and vetted
// consent apps that expose `Shopify.loadFeatures`. NO filename check — a theme that renders
// {% render 'customer-privacy-bar' %} passes cleanly. Do NOT tighten to a specific file.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.CONSENT_REQUIRE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const blockers = []
const warnings = []

function walk(dir, acc) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) { const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!['node_modules', '.git', 'gate-reports'].includes(e.name) && !e.name.startsWith('.')) walk(p, acc) }
    else if (/\.(liquid|js)$/.test(e.name)) acc.push(p) }
  return acc
}
const files = walk(cwd, [])
if (files.length === 0) {
  writeReport('consent', 42, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no theme' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('consent: PASS (no theme)'); process.exit(0)
}
const corpus = files.map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')

const hasConsent = /customerPrivacy|customer_privacy|consent[_-]?(banner|management|tracking)|cookie[_-]?(banner|consent|notice)|trackingConsent|gdpr|setTrackingConsent|Shopify\.loadFeatures/i.test(corpus)
if (!hasConsent) {
  const it = { id: 'consent.no-mechanism', page: 'theme', detail: 'no cookie-consent mechanism found — add Shopify Customer Privacy API consent or a vetted consent banner (required for EU/UK/CA traffic); non-essential scripts must be gated on consent' }
  if (ENFORCE) blockers.push(it); else warnings.push(it)
}
// non-essential 3rd-party scripts loaded eagerly (no async/defer) can't be consent-gated cleanly
const eager = [...corpus.matchAll(/<script\s+src=["'][^"']*(?:facebook|googletagmanager|google-analytics|hotjar|klaviyo|tiktok)[^"']*["'][^>]*>/gi)]
  .filter((m) => !/\b(async|defer)\b/i.test(m[0]))
if (eager.length) warnings.push({ id: 'consent.eager-3p-scripts', page: 'theme', detail: `${eager.length} third-party tracking script(s) loaded without async/defer — they fire before consent + hurt CWV; defer them and gate on consent` })

const pass = blockers.length === 0
writeReport('consent', 42, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, hasConsent, eagerScripts: eager.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`consent: ${pass ? 'PASS' : 'BLOCK'} — consent=${hasConsent} eager3p=${eager.length}`)
process.exit(pass ? 0 : 1)
