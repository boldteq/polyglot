#!/usr/bin/env node
// Self-test for check-analytics-wiring.mjs (#41). GA4 + events PASSES; no pixel WARNS (dev) /
// BLOCKS (ANALYTICS_REQUIRE); pixel-without-events WARNS.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-analytics-wiring.mjs')
let failures = 0; const ok = (m) => console.log(`  PASS  ${m}`); const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }
function run(files, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-'))
  for (const [rel, body] of Object.entries(files)) { const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body) }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports'), ANALYTICS_REQUIRE: '', ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'analytics-wiring.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, b: new Set((rep?.blockers || []).map((x) => x.id)), w: new Set((rep?.warnings || []).map((x) => x.id)) }
}
console.log('check-analytics-wiring — GA4 + events passes')
{ const r = run({ 'snippets/analytics.liquid': "gtag('event','view_item'); gtag('event','add_to_cart');" }); r.code === 0 && r.b.size === 0 && r.w.size === 0 ? ok('GA4 + events → exit 0') : bad(`ok: code ${r.code} w${[...r.w]}`) }
console.log('check-analytics-wiring — no pixel warns (dev) / blocks (require)')
{ const r = run({ 'sections/x.liquid': '<h1>hi</h1>' }); r.code === 0 && r.w.has('analytics.no-pixel') ? ok('dev: no pixel → exit 0 + warning') : bad(`dev: code ${r.code} w${[...r.w]}`) }
{ const r = run({ 'sections/x.liquid': '<h1>hi</h1>' }, { ANALYTICS_REQUIRE: '1' }); r.code === 1 && r.b.has('analytics.no-pixel') ? ok('require: no pixel → BLOCK') : bad(`req: code ${r.code} b${[...r.b]}`) }
console.log('check-analytics-wiring — pixel without events warns')
{ const r = run({ 'snippets/a.liquid': "gtag('config','G-ABC123')" }); r.code === 0 && r.w.has('analytics.no-events') ? ok('pixel-no-events → exit 0 + warning') : bad(`noevents: code ${r.code} w${[...r.w]}`) }
console.log(failures === 0 ? '\n✓ ANALYTICS-WIRING — ALL PASS' : `\n✗ ${failures} FAILED`); process.exit(failures === 0 ? 0 : 1)
