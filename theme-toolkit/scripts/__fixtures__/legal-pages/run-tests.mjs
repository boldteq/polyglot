#!/usr/bin/env node
// Self-test for check-legal-pages.mjs (#37). Footer with all policy links PASSES; missing policies
// WARN in dev, BLOCK under DS_REQUIRE_SCOPE. Exit 0 = all pass.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-legal-pages.mjs')
let failures = 0; const ok = (m) => console.log(`  PASS  ${m}`); const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }
function run(files, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-'))
  for (const [rel, body] of Object.entries(files)) { const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body) }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports'), DS_REQUIRE_SCOPE: '', LEGAL_REQUIRE: '', ...env } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'legal-pages.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, b: new Set((rep?.blockers || []).map((x) => x.id)), w: new Set((rep?.warnings || []).map((x) => x.id)) }
}
const FOOTER_OK = `<a href="{{ shop.privacy_policy.url }}">Privacy</a><a href="{{ shop.terms_of_service.url }}">Terms</a>
<a href="{{ shop.refund_policy.url }}">Refunds</a><a href="{{ shop.shipping_policy.url }}">Shipping</a><a href="/pages/contact">Contact</a>`
console.log('check-legal-pages — all policies linked passes')
{ const r = run({ 'sections/footer.liquid': FOOTER_OK }); r.code === 0 && r.b.size === 0 && r.w.size === 0 ? ok('all 5 policies linked → exit 0') : bad(`ok: code ${r.code} b${[...r.b]} w${[...r.w]}`) }
console.log('check-legal-pages — missing policies warn (dev) / block (publish)')
{ const r = run({ 'sections/footer.liquid': '<a href="/">Home</a>' }); r.code === 0 && r.w.has('legal.missing-privacy') ? ok('dev: missing → exit 0 + warnings') : bad(`dev: code ${r.code} w${[...r.w]}`) }
{ const r = run({ 'sections/footer.liquid': '<a href="/">Home</a>' }, { DS_REQUIRE_SCOPE: '1' }); r.code === 1 && r.b.has('legal.missing-refund') ? ok('publish: missing → BLOCK') : bad(`pub: code ${r.code} b${[...r.b]}`) }
console.log(failures === 0 ? '\n✓ LEGAL-PAGES — ALL PASS' : `\n✗ ${failures} FAILED`); process.exit(failures === 0 ? 0 : 1)
