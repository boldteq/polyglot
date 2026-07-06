#!/usr/bin/env node
// Self-test for check-consent.mjs (#42). Customer Privacy API PASSES; no consent WARNS (dev) /
// BLOCKS (publish); eager 3rd-party script WARNS.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-consent.mjs')
let failures = 0; const ok = (m) => console.log(`  PASS  ${m}`); const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }
function run(files, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-'))
  for (const [rel, body] of Object.entries(files)) { const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body) }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports'), DS_REQUIRE_SCOPE: '', CONSENT_REQUIRE: '', ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'consent.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, b: new Set((rep?.blockers || []).map((x) => x.id)), w: new Set((rep?.warnings || []).map((x) => x.id)) }
}
console.log('check-consent — customer privacy API passes')
{ const r = run({ 'snippets/consent.liquid': 'window.Shopify.customerPrivacy.setTrackingConsent(true)' }); r.code === 0 && r.b.size === 0 && r.w.size === 0 ? ok('consent API → exit 0') : bad(`ok: code ${r.code} w${[...r.w]}`) }
console.log('check-consent — no consent warns (dev) / blocks (publish)')
{ const r = run({ 'sections/x.liquid': '<h1>hi</h1>' }); r.code === 0 && r.w.has('consent.no-mechanism') ? ok('dev: none → exit 0 + warning') : bad(`dev: code ${r.code} w${[...r.w]}`) }
{ const r = run({ 'sections/x.liquid': '<h1>hi</h1>' }, { DS_REQUIRE_SCOPE: '1' }); r.code === 1 && r.b.has('consent.no-mechanism') ? ok('publish: none → BLOCK') : bad(`pub: code ${r.code} b${[...r.b]}`) }
console.log('check-consent — eager 3p script warns')
{ const r = run({ 'snippets/c.liquid': 'cookie consent banner', 'snippets/px.liquid': '<script src="https://connect.facebook.net/fbevents.js"></script>' }); r.code === 0 && r.w.has('consent.eager-3p-scripts') ? ok('eager fb script → warning') : bad(`eager: code ${r.code} w${[...r.w]}`) }
console.log(failures === 0 ? '\n✓ CONSENT — ALL PASS' : `\n✗ ${failures} FAILED`); process.exit(failures === 0 ? 0 : 1)
