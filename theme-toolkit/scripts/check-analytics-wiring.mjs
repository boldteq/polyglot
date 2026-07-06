#!/usr/bin/env node
// Gate #41 analytics-wiring (Press · quality) — revenue tracking is actually wired.
// Untracked traffic = no ROAS, no CRO loop, orphaned ad spend. Static: scan the theme for a GA4
// (gtag/G-XXXX) or Meta Pixel (fbq) install + ideally dataLayer events on view_item/add_to_cart.
// WARN-first (analytics often lives in Shopify's pixel manager, not the theme) — never hard-blocks
// alone, but surfaces the gap. SKIPS when there's no theme. Exit: 0 pass · 1 block · 2 env-error.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.ANALYTICS_REQUIRE === '1'
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
  writeReport('analytics-wiring', 41, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no theme' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('analytics-wiring: PASS (no theme)'); process.exit(0)
}
const corpus = files.map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')

const hasGA4 = /gtag\(|googletagmanager\.com\/gtag|G-[A-Z0-9]{6,}|dataLayer\.push/i.test(corpus)
const hasMeta = /fbq\(|connect\.facebook\.net\/.*fbevents|facebook.*pixel/i.test(corpus)
const hasEvents = /(view_item|add_to_cart|begin_checkout|purchase|AddToCart|ViewContent)/i.test(corpus)

if (!hasGA4 && !hasMeta) {
  const it = { id: 'analytics.no-pixel', page: 'theme', detail: 'no GA4 (gtag/G-…) or Meta Pixel (fbq) install found — revenue/conversion tracking is missing; wire GA4 + Meta Pixel (theme or Shopify pixel manager)' }
  if (ENFORCE) blockers.push(it); else warnings.push(it)
} else if (!hasEvents) {
  warnings.push({ id: 'analytics.no-events', page: 'theme', detail: 'a pixel is installed but no commerce events (view_item/add_to_cart/purchase) found — the funnel is untracked; add dataLayer/fbq events on the buy path' })
}
const pass = blockers.length === 0
writeReport('analytics-wiring', 41, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, hasGA4, hasMeta, hasEvents }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`analytics-wiring: ${pass ? 'PASS' : 'BLOCK'} — ga4=${hasGA4} meta=${hasMeta} events=${hasEvents}`)
process.exit(pass ? 0 : 1)
