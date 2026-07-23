#!/usr/bin/env node
// Self-test for check-price-binding.mjs (#38). `| money`-bound PDP PASSES; a hardcoded "$39.99"
// in a product surface WARNS (dev) / BLOCKS (publish); a free-ship threshold line doesn't flag.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-price-binding.mjs')
let failures = 0; const ok = (m) => console.log(`  PASS  ${m}`); const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }
function run(files, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'price-'))
  for (const [rel, body] of Object.entries(files)) { const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body) }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports'), DS_REQUIRE_SCOPE: '', PRICE_REQUIRE: '', ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'price-binding.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, b: new Set((rep?.blockers || []).map((x) => x.id)), w: new Set((rep?.warnings || []).map((x) => x.id)) }
}
console.log('check-price-binding — money-bound PDP passes')
{ const r = run({ 'sections/product-price.liquid': '<span class="price">{{ product.price | money }}</span>' }); r.code === 0 && r.b.size === 0 && r.w.size === 0 ? ok('| money bound → exit 0') : bad(`ok: code ${r.code} b${[...r.b]} w${[...r.w]}`) }
console.log('check-price-binding — hardcoded price warns (dev) / blocks (publish)')
{ const r = run({ 'sections/product-buybox.liquid': '<span class="price">$39.99</span>' }); r.code === 0 && r.w.has('price.hardcoded') ? ok('dev: hardcoded → exit 0 + warning') : bad(`dev: code ${r.code} w${[...r.w]}`) }
{ const r = run({ 'sections/product-buybox.liquid': '<span class="price">$39.99</span>' }, { DS_REQUIRE_SCOPE: '1' }); r.code === 1 && r.b.has('price.hardcoded') ? ok('publish: hardcoded → BLOCK') : bad(`pub: code ${r.code} b${[...r.b]}`) }
console.log('check-price-binding — free-ship threshold copy does NOT flag')
{ const r = run({ 'sections/product-shipbar.liquid': '{{ product.price | money }} — Free shipping when you spend $50.00' }, { DS_REQUIRE_SCOPE: '1' }); r.code === 0 ? ok('free-ship $50 copy → exit 0 (no false positive)') : bad(`freeship false-positive: code ${r.code} b${[...r.b]}`) }
console.log('check-price-binding — Liquid CODE and CSS are not rendered copy (2026-07-23)')
{
  // All 15 findings on cravinbyandy were false positives: PRICE_LITERAL's bare-decimal branch matches
  // ANY 2-dp number, so Dawn's responsive padding and a layout ratio read as money. Zero true
  // positives — and promoting this check to BLOCK would have blocked every Dawn theme.
  const pad = '{% style %}\n.x { padding-top: {{ section.settings.padding_top | times: 0.75 | round: 0 }}px; }\n{% endstyle %}'
  { const r = run({ 'sections/product-pad.liquid': pad }); r.w.has('price.hardcoded') ? bad('Dawn responsive padding still flagged as a price') : ok('padding with `| times: 0.75` is not a price') }

  const ratio = '{%- assign media_width = 0.65 -%}\n<div class="m">{{ product.title }}</div>'
  { const r = run({ 'sections/product-ratio.liquid': ratio }); r.w.has('price.hardcoded') ? bad('a layout ratio still flagged as a price') : ok('{% assign media_width = 0.65 %} is not a price') }

  // ...and the check must STILL catch real money in rendered copy, or the fix gutted it
  { const r = run({ 'sections/product-real.liquid': '<span class="price">$39.99</span>' }); r.w.has('price.hardcoded') ? ok('a real hardcoded $39.99 still warns') : bad('the fix gutted the check') }
  { const r = run({ 'sections/product-bare.liquid': '<p class="price">Only 1299.00 today</p>' }); r.w.has('price.hardcoded') ? ok('a bare 2-dp price in visible copy still warns') : bad('bare price in copy no longer caught') }
}

console.log(failures === 0 ? '\n✓ PRICE-BINDING — ALL PASS' : `\n✗ ${failures} FAILED`); process.exit(failures === 0 ? 0 : 1)
