#!/usr/bin/env node
// Self-test for shopify-theme-guard.mjs (gate #0 theme-lock). Build locks via newLock (same as the
// theme-publish fixture). Run (Node 20): node scripts/__fixtures__/theme-lock/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { newLock } from '../../lib/shopify-theme-lock.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shopify-theme-guard.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function build(lock) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'))
  if (lock) fs.writeFileSync(path.join(d, '.boldteq-theme-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  return d
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, THEME_LOCK_REQUIRED: '', SHOPIFY_FLAG_STORE: '', THEME_LOCK_VERIFY_REMOTE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'theme-lock.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('valid unpublished lock → PASS')
{
  const d = build(newLock({ store: 's.myshopify.com', themeId: '111', themeName: 'X-dev', role: 'unpublished' }))
  const { code, rep } = run(d)
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('lock targets LIVE unsafely (role=main, singleTheme=false) → BLOCK theme-lock.live-target')
{
  const d = build(newLock({ store: 's.myshopify.com', themeId: '111', role: 'main', singleTheme: false }))
  const { code, rep } = run(d)
  code === 1 && blockerIds(rep).has('theme-lock.live-target') ? ok('exit 1 + live-target') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('store mismatch (SHOPIFY_FLAG_STORE ≠ lock.store) → BLOCK theme-lock.store-mismatch')
{
  const d = build(newLock({ store: 's.myshopify.com', themeId: '111', role: 'unpublished' }))
  const { code, rep } = run(d, { SHOPIFY_FLAG_STORE: 'evil.myshopify.com' })
  code === 1 && blockerIds(rep).has('theme-lock.store-mismatch') ? ok('exit 1 + store-mismatch') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('missing lock (dev) → warn, exit 0; missing lock + REQUIRED → BLOCK')
{
  const d = build(null)
  const dev = run(d)
  dev.code === 0 && (dev.rep?.warnings || []).some(w => w.id === 'theme-lock.missing') ? ok('dev: warn, exit 0') : bad(`dev: code ${dev.code}`)
  const req = run(d, { THEME_LOCK_REQUIRED: '1' })
  req.code === 1 && blockerIds(req.rep).has('theme-lock.missing') ? ok('REQUIRED: exit 1 + missing') : bad(`required: code ${req.code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
