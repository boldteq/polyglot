#!/usr/bin/env node
// Self-test for check-commerce-readiness.mjs (gate #15) — "can the PDP transact?". A product template
// wiring a section with a product form passes; an editorial-only PDP blocks (the Sprint-3 dogfood bug).
// Run (Node 20): node scripts/__fixtures__/commerce-readiness/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-commerce-readiness.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function build(sectionType, sectionLiquid) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'commerce-'))
  fs.mkdirSync(path.join(d, 'templates'), { recursive: true })
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(d, 'templates', 'product.json'), JSON.stringify({ sections: { main: { type: sectionType } }, order: ['main'] }))
  fs.writeFileSync(path.join(d, 'sections', `${sectionType}.liquid`), `${sectionLiquid}{% schema %}{}{% endschema %}`)
  return d
}
function run(dir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commerce-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'commerce-readiness.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('PDP with product form + price → PASS')
{
  const d = build('main-product', `<section>{% form 'product', product %}<button name="add">Add to cart</button>{% endform %}<span>{{ product.price | money }}</span></section>`)
  const { code, rep } = run(d)
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('editorial-only PDP (no form) → BLOCK commerce.pdp-no-buy')
{
  const d = build('product-macro-hero', `<section><h1>{{ product.title }}</h1><a href="#">Add to bag</a></section>`)
  const { code, rep } = run(d)
  code === 1 && blockerIds(rep).has('commerce.pdp-no-buy') ? ok('exit 1 + pdp-no-buy') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('no product template → SKIP/PASS (homepage-only build)')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'commerce-empty-'))
  const { code, rep } = run(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'commerce.no-product-template') ? ok('exit 0 + skip note') : bad(`empty: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
