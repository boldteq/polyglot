#!/usr/bin/env node
// Self-test for #30 — redirect-map validation (analyzeRedirects pure + the gate end-to-end on a CSV).
// Run (Node 20): node scripts/__fixtures__/redirects/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { analyzeRedirects } from '../../check-redirects.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-redirects.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ids = (r) => new Set(r.blockers.map(b => b.id))
const wids = (r) => new Set(r.warnings.map(w => w.id))

console.log('analyzeRedirects — pure')
{
  const r = analyzeRedirects([{ from: '/a', to: '/a' }])
  ids(r).has('redirect.self') ? pass('self-redirect → blocker') : fail(`self: ${[...ids(r)]}`)
}
{
  const r = analyzeRedirects([{ from: '/a', to: '/b' }, { from: '/b', to: '/a' }])
  ids(r).has('redirect.loop') ? pass('loop → blocker') : fail(`loop: ${[...ids(r)]}`)
}
{
  const strict = analyzeRedirects([{ from: '/a', to: '/b' }, { from: '/b', to: '/c' }], { strict: true })
  ids(strict).has('redirect.chain') ? pass('chain + strict → blocker') : fail(`chain strict: ${[...ids(strict)]}`)
  const dev = analyzeRedirects([{ from: '/a', to: '/b' }, { from: '/b', to: '/c' }], { strict: false })
  wids(dev).has('redirect.chain') && !ids(dev).has('redirect.chain') ? pass('chain dev → warning only') : fail(`chain dev: b=${[...ids(dev)]} w=${[...wids(dev)]}`)
}
{
  const r = analyzeRedirects([{ from: '/a', to: 'ftp://x/y' }])
  ids(r).has('redirect.bad-target') ? pass('non-url/non-path target → blocker') : fail(`bad-target: ${[...ids(r)]}`)
}
{
  const r = analyzeRedirects([{ from: '/a', to: '/x' }, { from: '/a', to: '/y' }])
  wids(r).has('redirect.duplicate-source') ? pass('duplicate source → warning') : fail(`dup: ${[...wids(r)]}`)
}
{
  const r = analyzeRedirects([{ from: '/old-url', to: '/new-url' }, { from: '/legacy', to: 'https://shop.example.com/p' }])
  r.blockers.length === 0 ? pass('clean map → 0 blockers') : fail(`clean produced blockers: ${[...ids(r)]}`)
}

console.log('check-redirects gate — end to end')
function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redir-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', REDIRECTS_ENFORCE: '', REDIRECTS_CRAWL: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'redirects.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'redir-'))
  fs.writeFileSync(path.join(d, 'redirects.csv'), 'Redirect from,Redirect to\n/a,/b\n/b,/a\n')
  const { code, rep } = runGate(d)
  code === 1 && (rep?.blockers || []).some(b => b.id === 'redirect.loop') ? pass('CSV with a loop → BLOCK exit 1') : fail(`loop csv: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'redir-'))
  const { code, rep } = runGate(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'redirect.n-a-no-map') ? pass('no redirect map → SKIP/PASS') : fail(`no-map: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
