#!/usr/bin/env node
// Self-test for #32 — porter drift detector (detectDrift pure + the gate end to end).
// Run (Node 20): node scripts/__fixtures__/porter-drift/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectDrift } from '../../porter-drift.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'porter-drift.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('detectDrift — pure')
eq(detectDrift({ products: { a: { title: 'X' } } }, { products: { a: { title: 'X' } } }), [], 'identical → no drift')
eq(detectDrift({ products: { a: { title: 'X' } } }, { products: { a: { title: 'Y' } } }), [{ type: 'products', key: 'a', change: 'modified' }], 'changed value → modified')
eq(detectDrift({ products: { a: { title: 'X' } } }, { products: {} }), [{ type: 'products', key: 'a', change: 'removed' }], 'removed entity → removed')
eq(detectDrift({ redirects: { '/old': '/new' } }, { redirects: { '/old': '/new' }, products: { z: {} } }), [], 'extra entities in current → not drift')
eq(detectDrift(null, null), [], 'null inputs → no throw, no drift')

console.log('porter-drift gate — end to end')
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'porter-drift.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'))
  fs.mkdirSync(path.join(d, 'docs', 'porter'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'porter', 'applied-snapshot.json'), JSON.stringify({ pages: { about: { title: 'About Us' } } }))
  fs.writeFileSync(path.join(d, 'docs', 'porter', 'current-snapshot.json'), JSON.stringify({ pages: { about: { title: 'About' } } }))
  const { code, rep } = run(d)
  code === 1 && (rep?.blockers || []).some(b => b.id === 'drift.modified') ? pass('manual edit → DRIFT exit 1') : fail(`drift: code ${code} ids ${[...allIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-'))
  const { code, rep } = run(d)
  code === 0 && allIds(rep).has('drift.n-a-no-snapshot') ? pass('no applied snapshot → SKIP/PASS') : fail(`no-snap: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
