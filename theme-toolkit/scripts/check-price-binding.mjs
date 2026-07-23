#!/usr/bin/env node
// Gate #38 price-binding (Catalyst · quality) — prices/stock come from LIVE Shopify data, never
// hardcoded. A hardcoded "$39.99" in a PDP is a fraud/trust risk (it won't match checkout, won't
// update on sale, breaks multi-currency). Static: scan product/PDP section+template Liquid for
// hardcoded price-shaped literals in price context, and reward `| money` / `product.price` usage.
// Warn-first; BLOCKS at publish-grade (PRICE_REQUIRE/DS_REQUIRE_SCOPE). SKIPS when no product surface.
// Exit: 0 pass · 1 block · 2 env-error.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.PRICE_REQUIRE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const blockers = []
const warnings = []

// product/PDP/cart surfaces where a price literal is almost certainly wrong
const PRICE_FILE = /(product|pdp|price|cart|buy-?box|atc|featured-product)/i
// a price-shaped literal: currency symbol + number, or NN.NN, NOT a free-ship threshold sentence
const PRICE_LITERAL = /(?:[$£€₹¥]\s?\d{1,4}(?:[.,]\d{2})|(?<![\w.])\d{1,4}\.\d{2}(?![\w%]))/
const ALLOW_LINE = /free\s+ship|spend|threshold|away from|unlock|comment|\{%-?\s*comment/i

function walk(dir, acc) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) { const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!['node_modules', '.git', 'gate-reports', 'assets'].includes(e.name) && !e.name.startsWith('.')) walk(p, acc) }
    else if (e.name.endsWith('.liquid')) acc.push(p) }
  return acc
}
const files = walk(cwd, []).filter((f) => PRICE_FILE.test(path.basename(f)))
if (files.length === 0) {
  warnings.push({ id: 'price.n-a-no-surface', page: '.', detail: 'no product/price surface in scope — nothing was scanned for price binding', evidence: '' })
  writeReport('price-binding', 38, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no product/price surface' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('price-binding: PASS (no product surface)'); process.exit(0)
}
let boundCount = 0
for (const f of files) {
  let txt; try { txt = fs.readFileSync(f, 'utf8') } catch { continue }
  const rel = path.relative(cwd, f)
  if (/\|\s*money|product\.price|variant\.price|current_variant\.price/i.test(txt)) boundCount++
  const lines = txt.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ALLOW_LINE.test(line)) continue
    // ignore lines that are clearly inside Liquid output of a money filter
    if (/\{\{[^}]*money[^}]*\}\}/.test(line)) continue
    if (PRICE_LITERAL.test(line)) {
      const item = { id: 'price.hardcoded', page: `${rel}:${i + 1}`, detail: `hardcoded price literal in a product/price surface — bind to {{ product.price | money }} (live, multi-currency-safe) instead of a fixed number` }
      if (ENFORCE) blockers.push(item); else warnings.push(item)
    }
  }
}
const pass = blockers.length === 0
writeReport('price-binding', 38, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, moneyBoundFiles: boundCount, scanned: files.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`price-binding: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} hardcoded (block), ${warnings.length} (warn) · ${boundCount} file(s) use | money`)
for (const x of [...blockers, ...warnings].slice(0, 10)) console.log(`  ${blockers.includes(x) ? 'BLOCK' : 'warn '} ${x.id} ${x.page}`)
process.exit(pass ? 0 : 1)
