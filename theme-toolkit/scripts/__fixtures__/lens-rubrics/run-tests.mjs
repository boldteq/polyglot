#!/usr/bin/env node
// Self-test for #8 — every Lens rubric file is well-formed against the schema, and the 8 new surfaces
// ship. Validates the shipped lens-rubrics/*.json (not a temp fixture) so a malformed rubric is caught
// here, not at judge time. Run (Node 20): node scripts/__fixtures__/lens-rubrics/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RUBRICS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'lens-rubrics')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

const SEV = new Set(['blocker', 'warning'])
const OWNERS = new Set(['loom', 'drape', 'ink', 'porter', 'conduit'])

function validateCheck(c, where) {
  if (!c || typeof c !== 'object') return fail(`${where}: check not an object`)
  if (typeof c.id !== 'string' || !c.id) fail(`${where}: check missing id`)
  if (typeof c.rule !== 'string' || c.rule.length < 8) fail(`${where}: ${c.id} rule too short / missing`)
  if (!SEV.has(c.severity_if_fail)) fail(`${where}: ${c.id} bad severity_if_fail "${c.severity_if_fail}"`)
  if (!OWNERS.has(c.fix_owner)) fail(`${where}: ${c.id} bad fix_owner "${c.fix_owner}"`)
}

const files = fs.readdirSync(RUBRICS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
console.log(`validating ${files.length} rubric file(s)`)
const surfaces = new Set()
for (const f of files) {
  let r
  try { r = JSON.parse(fs.readFileSync(path.join(RUBRICS_DIR, f), 'utf-8')) } catch (e) { fail(`${f}: invalid JSON — ${e.message}`); continue }
  if (typeof r.surface !== 'string' || !r.surface) fail(`${f}: missing surface`)
  surfaces.add(r.surface)
  if (!Array.isArray(r.checks) || r.checks.length < 1) { fail(`${f}: checks must be a non-empty array`); continue }
  for (const c of r.checks) validateCheck(c, f)
  if (r.mobile_overlay !== undefined) {
    if (!Array.isArray(r.mobile_overlay)) fail(`${f}: mobile_overlay must be an array`)
    else for (const c of r.mobile_overlay) validateCheck(c, `${f}#mobile_overlay`)
  }
  pass(`${f} (${r.checks.length} checks${r.mobile_overlay ? ` + ${r.mobile_overlay.length} mobile` : ''})`)
}

console.log('the 8 new surfaces ship (#8)')
for (const s of ['checkout', 'blog', 'article', 'not-found', 'search-empty', 'policy', 'gift-card', 'order-confirmation']) {
  surfaces.has(s) ? pass(`rubric for "${s}" present`) : fail(`missing rubric surface "${s}"`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
