#!/usr/bin/env node
// Self-test for check-secret-scan.mjs (gate #0.6 secret-scan). Proves: clean theme PASSES;
// a planted Shopify token / Stripe key / private-key block BLOCKS; placeholders DON'T false-flag.
// Run: node scripts/__fixtures__/secret-scan/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-secret-scan.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures++ }

function run(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-'))
  for (const [rel, body] of Object.entries(files)) {
    const fp = path.join(d, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, body)
  }
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(d, 'gate-reports') } })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(d, 'gate-reports', 'secret-scan.json'), 'utf-8')) } catch {}
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('check-secret-scan — clean theme passes')
{
  const r = run({ 'config/settings_data.json': '{"current":{"shop_name":"Acme"}}', 'sections/hero.liquid': '<h1>{{ section.settings.title }}</h1>' })
  r.code === 0 && r.ids.size === 0 ? ok('clean theme → exit 0, no secrets') : bad(`clean: code ${r.code} ids ${[...r.ids]}`)
}
console.log('check-secret-scan — planted secrets BLOCK')
{
  const r = run({ 'snippets/api.liquid': 'const token = "shpat_' + 'a'.repeat(32) + '";' })
  r.code === 1 && r.ids.has('secret.shopify-admin-token') ? ok('Shopify admin token → BLOCK') : bad(`shpat: code ${r.code} ids ${[...r.ids]}`)
}
{
  const r = run({ 'assets/pay.js': 'const k = "sk_live_' + '0'.repeat(28) + '"' })
  r.code === 1 && r.ids.has('secret.stripe-live') ? ok('Stripe live key → BLOCK') : bad(`stripe: code ${r.code} ids ${[...r.ids]}`)
}
{
  const r = run({ 'config/keys.txt': '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----' })
  r.code === 1 && r.ids.has('secret.private-key-block') ? ok('private key block → BLOCK') : bad(`pkey: code ${r.code} ids ${[...r.ids]}`)
}
console.log('check-secret-scan — placeholders do NOT false-flag')
{
  const r = run({ 'sections/x.liquid': 'api_key = "your-api-key-here"', 'b.json': '{"token":"shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}' })
  r.code === 0 ? ok('placeholders → exit 0 (no false positive)') : bad(`placeholder false-positive: code ${r.code} ids ${[...r.ids]}`)
}

console.log(failures === 0 ? '\n✓ SECRET-SCAN — ALL ASSERTIONS PASS' : `\n✗ ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
