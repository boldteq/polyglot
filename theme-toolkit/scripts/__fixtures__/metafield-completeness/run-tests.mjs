#!/usr/bin/env node
// Self-test for #33 — metafield-value completeness in check-metafield-schema.mjs. A field DEFINED in
// the schema but never REFERENCED in the theme render layer is incomplete wiring (warn in dev, BLOCK
// under SCHEMA_REQUIRE_COMPLETE=1). SKIPS when there's no theme (sections/) to scan.
// Run (Node 20): node scripts/__fixtures__/metafield-completeness/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-metafield-schema.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

const SCHEMA = JSON.stringify({ namespaces: { 'restful.product': { ingredients: { type: 'single_line_text_field', storefront: true } } } })

function build({ section }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-complete-'))
  fs.mkdirSync(path.join(d, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'metafield-schema.json'), SCHEMA)
  if (section !== null) { fs.mkdirSync(path.join(d, 'sections'), { recursive: true }); fs.writeFileSync(path.join(d, 'sections', 'pdp.liquid'), section) }
  return d
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, SCHEMA_REQUIRE_COMPLETE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'metafield-schema.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))

console.log('(a) field referenced in a section → no unrendered-field')
{
  const d = build({ section: '<div>{{ product.metafields.restful.product.ingredients }}</div>' })
  const { code, rep } = run(d)
  code === 0 && !allIds(rep).has('schema.unrendered-field') ? pass('referenced → clean') : fail(`code ${code} ids ${[...allIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('(b) field NOT referenced → unrendered-field warning (dev exit 0)')
{
  const d = build({ section: '<div>no metafields here</div>' })
  const { code, rep } = run(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'schema.unrendered-field') ? pass('unreferenced → warning, exit 0') : fail(`code ${code} ids ${[...allIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('(c) field NOT referenced + SCHEMA_REQUIRE_COMPLETE=1 → BLOCK')
{
  const d = build({ section: '<div>no metafields here</div>' })
  const { code, rep } = run(d, { SCHEMA_REQUIRE_COMPLETE: '1' })
  code === 1 && (rep?.blockers || []).some(b => b.id === 'schema.unrendered-field') ? pass('unreferenced + strict → BLOCK') : fail(`code ${code} ids ${[...allIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('(d) no sections/ dir → completeness skipped')
{
  const d = build({ section: null })
  const { code, rep } = run(d, { SCHEMA_REQUIRE_COMPLETE: '1' })
  code === 0 && !allIds(rep).has('schema.unrendered-field') ? pass('no theme → completeness skipped') : fail(`code ${code} ids ${[...allIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
