#!/usr/bin/env node
// Gate #0.6 secret-scan (Bedrock · setup) — NO API keys / tokens / secrets committed in the theme.
// A leaked Shopify Admin token / Stripe key / AWS key in a theme file is a brand-kill security incident.
// Static grep over theme source + settings_data.json for known secret shapes. BLOCK on any real hit.
// SKIPS cleanly when there's no theme. Exit: 0 pass · 1 block · 2 env-error.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const blockers = []
const warnings = []

// (id, regex, label). Anchored to real secret shapes — not generic words — to avoid false positives.
const PATTERNS = [
  ['secret.shopify-admin-token', /\bshpat_[a-f0-9]{32}\b/, 'Shopify Admin API access token (shpat_)'],
  ['secret.shopify-storefront-token', /\bshpss_[a-f0-9]{32}\b/, 'Shopify Storefront token (shpss_)'],
  ['secret.shopify-private-token', /\bshppa_[a-f0-9]{32}\b/, 'Shopify private-app token (shppa_)'],
  ['secret.stripe-live', /\b[sr]k_live_[0-9a-zA-Z]{20,}\b/, 'Stripe LIVE secret key (sk_live/rk_live)'],
  ['secret.aws-access-key', /\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id (AKIA…)'],
  ['secret.google-api-key', /\bAIza[0-9A-Za-z_\-]{35}\b/, 'Google API key (AIza…)'],
  ['secret.private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'embedded private key block'],
  ['secret.generic-bearer', /\b(?:api[_-]?key|secret|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i, 'hardcoded api_key/secret/token assignment'],
]
// obvious non-secrets — tested against the MATCHED token only, never the whole line. Testing the whole
// line (with a `<.*>` entry) exempted every line containing an HTML/Liquid tag, so a real token inside
// markup shipped unscanned (2026-07-29 audit G3). The allowlist now only spares a MATCH that itself
// reads as a placeholder; `.myshopify.com` was a line-level guard that can't match a secret token.
const ALLOW = [/your[_-]?(api[_-]?key|secret|token)/i, /example|placeholder|xxxx|dummy|redacted/i, /shpat_xxxx/i]

const SCAN_EXTS = ['.liquid', '.js', '.mjs', '.json', '.css', '.scss', '.md', '.txt', '.yml', '.yaml', '.env']
// `__fixtures__` holds deliberate test secrets — a fake private key is how the secret-scan fixture
// PROVES this gate fires. A client repo vendors toolkit/, so without this the gate scans our own test
// data and BLOCKS every client build on a secret that does not exist. (A false BLOCK is as damaging
// as a false pass.) Found 2026-07-23 by re-vendoring the toolkit into cravinbyandy.
const SKIP_DIRS = new Set(['node_modules', '.git', 'gate-reports', 'dist', 'build', '.shopify', '__fixtures__'])

function walk(dir, acc) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.env') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc) }
    else if (SCAN_EXTS.includes(path.extname(e.name))) acc.push(p)
  }
  return acc
}

const files = walk(cwd, [])
if (files.length === 0) {
  writeReport('secret-scan', 0.6, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no theme files to scan', scanned: 0 }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('secret-scan: PASS (no files)')
  process.exit(0)
}
for (const f of files) {
  let txt
  try { txt = fs.readFileSync(f, 'utf8') } catch { continue }
  const rel = path.relative(cwd, f)
  const lines = txt.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const [id, re, label] of PATTERNS) {
      const m = line.match(re)
      if (!m || ALLOW.some((a) => a.test(m[0]))) continue
      blockers.push({ id, page: `${rel}:${i + 1}`, detail: `${label} — remove the secret + rotate it; never commit credentials to a theme` })
    }
  }
}
const pass = blockers.length === 0
writeReport('secret-scan', 0.6, { cwd, pass, blockers, warnings, evidence: { scanned: files.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`secret-scan: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} secret(s) across ${files.length} file(s)`)
for (const b of blockers.slice(0, 10)) console.log(`  BLOCK ${b.id} ${b.page}`)
process.exit(pass ? 0 : 1)
