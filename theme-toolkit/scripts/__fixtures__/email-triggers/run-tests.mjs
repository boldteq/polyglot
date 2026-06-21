#!/usr/bin/env node
// Self-test for #35 — email trigger-wiring (triggerWiringGaps pure + the gate end to end).
// Run (Node 20): node scripts/__fixtures__/email-triggers/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { triggerWiringGaps } from '../../check-email-triggers.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-email-triggers.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('triggerWiringGaps — pure')
{
  const gaps = triggerWiringGaps([{ id: 'welcome', trigger: 'signup' }, { id: 'cart', trigger: 'cart_abandoned' }], ['signup'])
  gaps.length === 1 && gaps[0].id === 'cart' ? pass('unwired cart trigger → gap; wired welcome → none') : fail(`got ${JSON.stringify(gaps)}`)
}
{
  const gaps = triggerWiringGaps([{ id: 'welcome', trigger: 'signup' }], ['signup', 'cart_abandoned'])
  gaps.length === 0 ? pass('all triggers wired → no gaps') : fail(`got ${JSON.stringify(gaps)}`)
}
{
  const gaps = triggerWiringGaps([{ id: 'orphan' }], ['signup'])
  gaps.length === 1 && /no trigger/.test(gaps[0].reason) ? pass('email with no trigger declared → gap') : fail(`got ${JSON.stringify(gaps)}`)
}

console.log('check-email-triggers gate — end to end')
function build({ lifecycle, wiring }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'email-'))
  if (lifecycle) { fs.mkdirSync(path.join(d, 'docs', 'email'), { recursive: true }); fs.writeFileSync(path.join(d, 'docs', 'email', 'lifecycle.json'), JSON.stringify(lifecycle)) }
  if (wiring) fs.writeFileSync(path.join(d, 'docs', 'email', 'wiring.json'), JSON.stringify(wiring))
  return d
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'email-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, EMAIL_ENFORCE: '', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'email-triggers.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
{
  const d = build({ lifecycle: { emails: [{ id: 'welcome', trigger: 'signup' }, { id: 'cart', trigger: 'cart_abandoned' }] }, wiring: { triggers: ['signup'] } })
  const dev = run(d)
  dev.code === 0 && (dev.rep?.warnings || []).some(w => w.id === 'email.trigger-unwired') ? pass('unwired (dev) → warn, exit 0') : fail(`dev: code ${dev.code} ids ${[...allIds(dev.rep)]}`)
  const strict = run(d, { EMAIL_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'email.trigger-unwired') ? pass('+ENFORCE → BLOCK') : fail(`enforce: code ${strict.code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = build({})
  const { code, rep } = run(d)
  code === 0 && allIds(rep).has('email.n-a-no-spec') ? pass('no lifecycle spec → SKIP/PASS') : fail(`no-spec: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
