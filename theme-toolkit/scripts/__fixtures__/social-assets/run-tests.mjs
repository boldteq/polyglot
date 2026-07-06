#!/usr/bin/env node
// Self-test for check-social-assets.mjs (#39). Layout with favicon + og + twitter PASSES; bare
// layout WARNS (dev) / BLOCKS (publish). No layout → SKIP/PASS.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-social-assets.mjs')
let failures = 0; const ok = (m) => console.log(`  PASS  ${m}`); const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }
function run(files, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'social-'))
  for (const [rel, body] of Object.entries(files)) { const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body) }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports'), DS_REQUIRE_SCOPE: '', SOCIAL_REQUIRE: '', ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'social-assets.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, b: new Set((rep?.blockers || []).map((x) => x.id)), w: new Set((rep?.warnings || []).map((x) => x.id)) }
}
const FULL = `<link rel="icon" href="{{ settings.favicon | image_url }}">
<meta property="og:image" content="{{ settings.share_image | image_url }}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="x">`
console.log('check-social-assets — full meta passes')
{ const r = run({ 'layout/theme.liquid': FULL }); r.code === 0 && r.b.size === 0 && r.w.size === 0 ? ok('favicon+og+twitter → exit 0') : bad(`ok: code ${r.code} w${[...r.w]}`) }
console.log('check-social-assets — bare layout warns (dev) / blocks (publish)')
{ const r = run({ 'layout/theme.liquid': '<html><head></head><body></body></html>' }); r.code === 0 && r.w.has('social.no-favicon') && r.w.has('social.no-og-image') ? ok('dev: bare → exit 0 + warnings') : bad(`dev: code ${r.code} w${[...r.w]}`) }
{ const r = run({ 'layout/theme.liquid': '<html></html>' }, { DS_REQUIRE_SCOPE: '1' }); r.code === 1 && r.b.has('social.no-og-image') ? ok('publish: bare → BLOCK') : bad(`pub: code ${r.code} b${[...r.b]}`) }
console.log('check-social-assets — no layout skips clean')
{ const r = run({ 'sections/x.liquid': 'hi' }); r.code === 0 ? ok('no layout → PASS') : bad(`nolayout: code ${r.code}`) }
console.log(failures === 0 ? '\n✓ SOCIAL-ASSETS — ALL PASS' : `\n✗ ${failures} FAILED`); process.exit(failures === 0 ? 0 : 1)
