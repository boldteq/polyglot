#!/usr/bin/env node
// Boldteq commerce-readiness gate (#15) — the "can this store actually SELL?" enforcer.
//
// Render-wiring (#14) proves the design system renders + every reference resolves. This gate
// proves the PDP can TRANSACT. The Sprint-3 round-2 dogfood shipped a product template whose
// "main" section was an editorial hero (product-macro-hero) with NO product form, NO price, NO
// variant selector, and a dead `<a>Add to bag` — a storefront that renders beautifully and sells
// nothing. No gate caught it (the adversarial reviewer did). This makes it mechanical.
//
// Scans the section(s) a product template wires (+ one level of rendered snippets) for the buy
// mechanics. On a real Minimog/Dawn base the main-product section ships them → pass; a custom
// editorial-only PDP → block.
//
// Checks (only when a product template exists — lenient otherwise):
//   commerce.pdp-no-buy (BLOCK)  — no add-to-cart form / variant mechanism anywhere in the PDP sections.
//   commerce.pdp-no-price (WARN) — no price render (| money / product.price) found.
//
// Usage: node check-commerce-readiness.mjs
// Env: REPORT_DIR (default gate-reports) · DS_REQUIRE_SCOPE=1 (a build with NO product template
//      blocks instead of skipping) · ALLOW_COMMERCE_WAIVER=1 (CHANGES.md ## Waivers names commerce).
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const ALLOW_WAIVER = process.env.ALLOW_COMMERCE_WAIVER === '1' && changesWaives('commerce')

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const blocker = (id, page, detail, evidence) => ALLOW_WAIVER
  ? add(warnings, `${id}.waived`, page, `${detail} (waived via CHANGES.md ## Waivers)`, evidence)
  : add(blockers, id, page, detail, evidence)

function changesWaives(word) {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    return m ? new RegExp(`\\b${word}\\b`, 'i').test(m[1].split(/\n##\s/)[0]) : false
  } catch { return false }
}

const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
function walkAll(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(rel, exts, acc)
    else if (!exts || exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('commerce-readiness', 15, { cwd, pass, blockers, warnings, evidence: { reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`commerce-readiness: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// add-to-cart / variant mechanics (any ⇒ the PDP can transact)
const FORM_RE = /\{%-?\s*form\s+['"]product['"]|product[-_]form|action\s*=\s*["'][^"']*\/cart\/add|name\s*=\s*["']add["']|product\.selected_or_first_available_variant|variant_id|\{\{\s*product_form_id|\bvariant-(?:radios|selects|picker)\b|<product-form\b/i
const PRICE_RE = /\|\s*money(?:_with_currency|_without_currency)?\b|\bproduct\.price\b|\bvariant\.price\b|\bcurrent_variant\.price\b|\bprice-item\b/i

function main() {
  const productTemplates = walkAll('templates', ['.json']).filter(f => /(^|\/)product(\.|\b)/i.test(path.basename(f)))
  if (productTemplates.length === 0) {
    if (REQUIRE_SCOPE) add(blockers, 'commerce.no-product-template', 'templates', 'no product template (templates/product*.json) found and DS_REQUIRE_SCOPE=1 — a sellable store must ship a product template')
    else warnings.push({ id: 'commerce.no-product-template', page: 'templates', detail: 'no product template (templates/product*.json) found — commerce-readiness check skipped (homepage-only build?)', evidence: '' })
    finish(null, { productTemplates: [] })
  }

  const evidence = { productTemplates: [], perTemplate: {} }
  for (const tf of productTemplates) {
    evidence.productTemplates.push(tf)
    let j
    try { j = JSON.parse(read(tf)) } catch { warnings.push({ id: 'commerce.template-unparseable', page: tf, detail: `${tf} is not valid JSON — cannot verify commerce mechanics`, evidence: '' }); continue }
    const types = Object.values(j.sections || {}).map(s => s && s.type).filter(Boolean)
    // PDP corpus = the section files this template wires + one level of {% render %}'d snippets
    let pdpText = ''
    const readSections = []
    for (const t of types) {
      const sf = `sections/${t}.liquid`
      if (fs.existsSync(path.resolve(cwd, sf))) { pdpText += '\n' + read(sf); readSections.push(t) }
    }
    for (const m of pdpText.matchAll(/\{%-?\s*render\s+['"]([a-z0-9_/-]+)['"]/gi)) {
      const snf = `snippets/${m[1]}.liquid`
      if (fs.existsSync(path.resolve(cwd, snf))) pdpText += '\n' + read(snf)
    }
    const hasForm = FORM_RE.test(pdpText)
    const hasPrice = PRICE_RE.test(pdpText)
    evidence.perTemplate[tf] = { sections: types, read: readSections, hasForm, hasPrice }
    if (!readSections.length) {
      // every referenced section is missing — #14 rw.section-missing already blocks this; warn here to avoid double-noise
      warnings.push({ id: 'commerce.pdp-sections-absent', page: tf, detail: `none of the product template's sections (${types.join(', ') || 'none'}) exist on disk — commerce cannot be verified (see #14 rw.section-missing)`, evidence: types.join(', ') })
      continue
    }
    if (!hasForm) {
      blocker('commerce.pdp-no-buy', tf, `the product template's section(s) [${readSections.join(', ')}] contain NO add-to-cart form / variant mechanism (no \`{% form 'product' %}\`, no <product-form>, no variant picker, no /cart/add) — the PDP renders but cannot SELL. Wire a real product form + variant selector (a real main-product section ships this).`, readSections.join(', '))
    }
    if (!hasPrice) {
      warnings.push({ id: 'commerce.pdp-no-price', page: tf, detail: `no price render (\`| money\` / product.price) found in the product template's section(s) [${readSections.join(', ')}] — confirm the price displays (it may come from a base section/snippet).`, evidence: readSections.join(', ') })
    }
  }
  finish(null, evidence)
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
