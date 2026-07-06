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
// don't flag obvious non-secrets
const ALLOW = [/\.myshopify\.com/, /your[_-]?(api[_-]?key|secret|token)/i, /example|placeholder|xxxx|<.*>/i, /shpat_xxxx/i]

const SCAN_EXTS = ['.liquid', '.js', '.mjs', '.json', '.css', '.scss', '.md', '.txt', '.yml', '.yaml', '.env']
const SKIP_DIRS = new Set(['node_modules', '.git', 'gate-reports', 'dist', 'build', '.shopify'])

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
    if (ALLOW.some((a) => a.test(line))) continue
    for (const [id, re, label] of PATTERNS) {
      if (re.test(line)) blockers.push({ id, page: `${rel}:${i + 1}`, detail: `${label} — remove the secret + rotate it; never commit credentials to a theme` })
    }
  }
}
const pass = blockers.length === 0
writeReport('secret-scan', 0.6, { cwd, pass, blockers, warnings, evidence: { scanned: files.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`secret-scan: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} secret(s) across ${files.length} file(s)`)
for (const b of blockers.slice(0, 10)) console.log(`  BLOCK ${b.id} ${b.page}`)
process.exit(pass ? 0 : 1)
