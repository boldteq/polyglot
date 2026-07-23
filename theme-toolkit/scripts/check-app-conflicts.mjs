#!/usr/bin/env node
// #55 — app-conflict scanner. Two third-party apps fighting over the same surface (popup wars, duplicate
// review widgets, double subscription selectors, competing page builders) silently break a storefront.
// This scans the theme source for app markers and flags any conflict GROUP with ≥2 members present.
// Warn-first (APP_CONFLICTS_ENFORCE=1 / DS_REQUIRE_SCOPE=1 → BLOCK). KB: patterns/good/app-conflict-matrix.md.
//
// Usage: node check-app-conflicts.mjs        scan the theme in cwd
// Env: APP_CONFLICTS_ENFORCE=1 | DS_REQUIRE_SCOPE=1 (→ BLOCK) · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// detectApps / findConflicts are PURE + exported (hermetically tested). Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

// app → marker regex (script/snippet/class/handle names that appear in theme source when installed)
const APP_MARKERS = {
  klaviyo: /klaviyo/i, privy: /privy/i, justuno: /justuno/i, optinmonster: /optinmonster|optin-monster/i, sumo: /\bsumo(me)?\b/i,
  'judge.me': /judge\.?me|jdgm/i, loox: /\bloox\b/i, yotpo: /yotpo/i, stamped: /stamped/i, okendo: /okendo/i, fera: /\bfera\b/i,
  recharge: /recharge|rechargepayments/i, skio: /\bskio\b/i, seal: /seal[\s_-]?subscription/i, appstle: /appstle/i,
  'slide-cart': /slide[\s_-]?cart|slidecart/i, upcart: /upcart/i, icart: /\bicart\b/i, rebuy: /rebuy/i,
  reconvert: /reconvert/i, 'zipify-ocu': /zipify|one[\s_-]?click[\s_-]?upsell|\bocu\b/i, honeycomb: /honeycomb[\s_-]?upsell/i,
  shogun: /shogun/i, gempages: /gempages/i, pagefly: /pagefly/i, pagepilot: /pagepilot/i,
  'best-currency': /best[\s_-]?currency/i, 'currency-converter': /currency[\s_-]?converter/i,
  'sticky-atc-app': /sticky[\s_-]?(add[\s_-]?to[\s_-]?cart|atc)[\s_-]?app|app[\s_-]?sticky[\s_-]?atc/i,
  triplewhale: /triple[\s_-]?whale|triplewhale/i, elevar: /elevar/i, northbeam: /northbeam/i,
}

// conflict groups — only one member of each group should be installed.
const CONFLICT_GROUPS = [
  { name: 'popup/email-capture', members: ['klaviyo', 'privy', 'justuno', 'optinmonster', 'sumo'], note: 'popup wars / double opt-ins / one covers the hero' },
  { name: 'product-reviews', members: ['judge.me', 'loox', 'yotpo', 'stamped', 'okendo', 'fera'], note: 'duplicate review widgets + double Review JSON-LD (gate #6)' },
  { name: 'subscriptions', members: ['recharge', 'skio', 'seal', 'appstle'], note: 'two selling-plan selectors → ATC binds the wrong plan' },
  { name: 'cart-drawer', members: ['slide-cart', 'upcart', 'icart', 'rebuy'], note: 'two cart drawers intercept the ATC' },
  { name: 'upsell', members: ['reconvert', 'rebuy', 'zipify-ocu', 'honeycomb'], note: 'two upsell engines inject competing offers' },
  { name: 'page-builder', members: ['shogun', 'gempages', 'pagefly', 'pagepilot'], note: 'two section systems → CSS specificity wars' },
  { name: 'currency', members: ['best-currency', 'currency-converter'], note: 'two currency switchers double-convert prices' },
  { name: 'analytics-doublecount', members: ['triplewhale', 'elevar', 'northbeam'], note: 'multiple dataLayer owners double-fire events' },
]

// PURE: which apps are present in the theme text.
export function detectApps(text) {
  const hay = String(text || '')
  return Object.keys(APP_MARKERS).filter(app => APP_MARKERS[app].test(hay))
}
// PURE: conflict groups with ≥2 detected members.
export function findConflicts(apps) {
  const present = new Set(apps || [])
  const out = []
  for (const g of CONFLICT_GROUPS) {
    const hit = g.members.filter(m => present.has(m))
    if (hit.length >= 2) out.push({ group: g.name, apps: hit, note: g.note })
  }
  return out
}

function themeText(cwd) {
  let t = ''
  for (const d of ['sections', 'snippets', 'templates', 'assets', 'layout', 'config']) {
    const abs = path.resolve(cwd, d)
    let entries = []
    try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isFile() || !/\.(liquid|json|js|css)$/.test(e.name)) continue
      try { t += `\n${fs.readFileSync(path.join(abs, e.name), 'utf-8')}` } catch { /* skip */ }
    }
  }
  return t
}

function main() {
  const t0 = Date.now()
  const cwd = process.cwd()
  const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
  const ENFORCE = process.env.APP_CONFLICTS_ENFORCE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
  const blockers = []
  const warnings = []

  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'snippets'))) {
    warnings.push({ id: 'app-conflict.n-a-no-theme', page: '.', detail: 'no theme (sections/snippets) here — app-conflict scan skipped', evidence: '' })
  } else {
    const apps = detectApps(themeText(cwd))
    for (const c of findConflicts(apps)) {
      const detail = `app conflict — ${c.apps.join(' + ')} both present (group: ${c.group}): ${c.note}. Keep ONE; remove the other (app-conflict-matrix.md).`
      ;(ENFORCE ? blockers : warnings).push({ id: 'app-conflict.collision', page: c.group, detail, evidence: c.apps.join(', ') })
    }
  }

  const pass = blockers.length === 0
  writeReport('app-conflicts', 27, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`app-conflicts: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

if (isMain(import.meta.url)) {
  main()
}
