#!/usr/bin/env node
// Gate #37 legal-pages (Press · quality) — the required policy pages exist AND are linked.
// A store can't legally go live (or run Meta/Google ads, or pass app review) without Privacy,
// Terms, Refund/Returns, Shipping, and Contact reachable from the footer. Static: scan the theme
// for evidence each policy is linked (shop.*_policy, /policies/<slug>, footer menu text, page.contact).
// Warn-first; BLOCKS at publish-grade (DS_REQUIRE_SCOPE/LEGAL_REQUIRE). SKIPS when there's no theme.
// Exit: 0 pass · 1 block · 2 env-error.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.LEGAL_REQUIRE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const blockers = []
const warnings = []

// required policy → evidence patterns (any match = present)
const POLICIES = [
  ['privacy', [/privacy_policy/i, /\/policies\/privacy-policy/i, />\s*privacy(\s+policy)?\s*</i]],
  ['terms', [/terms_of_service/i, /\/policies\/terms-of-service/i, />\s*terms(\s+of\s+service)?\s*</i]],
  ['refund', [/refund_policy/i, /\/policies\/refund-policy/i, />\s*(refund|returns?)\b/i]],
  ['shipping', [/shipping_policy/i, /\/policies\/shipping-policy/i, />\s*shipping(\s+policy)?\s*</i]],
  ['contact', [/\/pages\/contact/i, /page\.contact/i, /templates\/page\.contact/i, />\s*contact\s*</i, /routes\.root_url/i]],
]

const SCAN = ['.liquid', '.json']
const SKIP = new Set(['node_modules', '.git', 'gate-reports', 'assets'])
function walk(dir, acc) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) { const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(p, acc) }
    else if (SCAN.includes(path.extname(e.name))) acc.push(p) }
  return acc
}
const files = walk(cwd, [])
// also: a contact page template existing is direct evidence
const hasContactTemplate = files.some((f) => /templates[\\/]page\.contact/i.test(f))
const corpus = files.map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')

if (files.length === 0) {
  writeReport('legal-pages', 37, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no theme' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('legal-pages: PASS (no theme)'); process.exit(0)
}
for (const [name, pats] of POLICIES) {
  const present = (name === 'contact' && hasContactTemplate) || pats.some((re) => re.test(corpus))
  if (!present) {
    const item = { id: `legal.missing-${name}`, page: 'footer/menus', detail: `no link/reference to the ${name} policy page — required before publish (footer menu or shop.${name}_policy)` }
    if (ENFORCE) blockers.push(item); else warnings.push(item)
  }
}
const pass = blockers.length === 0
writeReport('legal-pages', 37, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, hasContactTemplate }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`legal-pages: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} missing (block), ${warnings.length} missing (warn)`)
for (const x of [...blockers, ...warnings]) console.log(`  ${blockers.includes(x) ? 'BLOCK' : 'warn '} ${x.id}`)
process.exit(pass ? 0 : 1)
