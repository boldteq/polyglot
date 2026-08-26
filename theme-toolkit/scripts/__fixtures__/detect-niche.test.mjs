#!/usr/bin/env node
// Hermetic self-test for scripts/lib/detect-niche.mjs.
//   Loads the real niche-dna manifest and exercises 5 self-contained detection cases.
// Run (Node 20): node scripts/__fixtures__/detect-niche.test.mjs · Exit 0 = all pass.

import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectNiche } from '../lib/detect-niche.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = path.join(os.homedir(), '.claude', 'memory', 'design', 'ecom', 'niche-dna-packs', '_manifest.json')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m, err) => { console.log(`  FAIL  ${m}${err ? ` — ${err.message || err}` : ''}`); failures += 1 }

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))

const run = (label, fn) => {
  try { fn(); pass(label) } catch (err) { fail(label, err) }
}

console.log(`detect-niche — manifest packs: ${manifest.packs.length}`)

run('clear-haircare — shampoo/conditioner/hair oil → haircare, confidence >= 15', () => {
  const result = detectNiche({
    manifest,
    products: ['shampoo', 'conditioner', 'hair oil'],
  })
  assert.strictEqual(result.niche, 'haircare')
  assert.ok(result.confidence >= 15, `expected confidence >= 15, got ${result.confidence}`)
})

run('clear-supplements — vitamin c/collagen powder/probiotic → supplements, confidence >= 10', () => {
  const result = detectNiche({
    manifest,
    products: ['vitamin c', 'collagen powder', 'probiotic'],
  })
  assert.strictEqual(result.niche, 'supplements')
  assert.ok(result.confidence >= 10, `expected confidence >= 10, got ${result.confidence}`)
})

run('ambiguous — mug/tote bag → null (below threshold), confidence < 8', () => {
  const result = detectNiche({
    manifest,
    products: ['mug', 'tote bag'],
  })
  assert.strictEqual(result.niche, null)
  assert.ok(result.confidence < 8, `expected confidence < 8, got ${result.confidence}`)
})

run('explicit-override — brief.niche=jewelry beats product keyword shampoo', () => {
  const result = detectNiche({
    manifest,
    brief: { niche: 'jewelry' },
    products: ['shampoo'],
  })
  assert.strictEqual(result.niche, 'jewelry')
})

run('brand-direction-only — "clean beauty dermatologist" → beauty', () => {
  const result = detectNiche({
    manifest,
    brandDirection: 'clean beauty dermatologist',
  })
  assert.strictEqual(result.niche, 'beauty')
})

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures ? 1 : 0)
