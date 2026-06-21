#!/usr/bin/env node
// Self-test for #55 — app-conflict scanner (detectApps + findConflicts pure + the gate end to end).
// Run (Node 20): node scripts/__fixtures__/app-conflicts/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { detectApps, findConflicts } from '../../check-app-conflicts.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-app-conflicts.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('detectApps + findConflicts — pure')
{
  const apps = detectApps('<script src="klaviyo.js"></script> privy-popup judge.me-widget')
  apps.includes('klaviyo') && apps.includes('privy') && apps.includes('judge.me') ? pass('detects klaviyo + privy + judge.me') : fail(`detected ${JSON.stringify(apps)}`)
}
{
  const c = findConflicts(['klaviyo', 'privy'])
  c.length === 1 && c[0].group === 'popup/email-capture' ? pass('klaviyo + privy → 1 popup conflict') : fail(`got ${JSON.stringify(c)}`)
}
{
  const c = findConflicts(['klaviyo'])
  c.length === 0 ? pass('single popup app → no conflict') : fail(`got ${JSON.stringify(c)}`)
}
{
  const c = findConflicts(['judge.me', 'loox', 'recharge', 'skio'])
  c.length === 2 ? pass('reviews + subscriptions → 2 conflicts') : fail(`got ${c.map(x => x.group).join(', ')}`)
}

console.log('check-app-conflicts gate — end to end')
function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appc-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, APP_CONFLICTS_ENFORCE: '', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'app-conflicts.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'appc-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(d, 'sections', 'header.liquid'), '<script src="//static.klaviyo.com/onsite.js"></script>\n<div class="privy-popup"></div>')
  const dev = runGate(d)
  dev.code === 0 && allIds(dev.rep).has('app-conflict.collision') ? pass('two popup apps (dev) → warn, exit 0') : fail(`dev: code ${dev.code} ids ${[...allIds(dev.rep)]}`)
  const strict = runGate(d, { APP_CONFLICTS_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'app-conflict.collision') ? pass('+ENFORCE → BLOCK') : fail(`enforce: code ${strict.code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'appc-'))
  const { code, rep } = runGate(d)
  code === 0 && allIds(rep).has('app-conflict.n-a-no-theme') ? pass('no theme → SKIP/PASS') : fail(`no-theme: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
