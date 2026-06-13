#!/usr/bin/env node
// Keystone token — fetch the captured Admin API token for a store from the CLONED catcher
// (the local-dev-environment-derived OAuth app deployed for this client), and print ONLY the
// token to stdout so the build can: export SHOPIFY_ADMIN_API_TOKEN_<H>=$(keystone-token <shop> …)
//
// Source order: (1) a local `tokens/<shop>.env` file (local-mode capture) if present;
// (2) the catcher's `GET <service>/token?shop=<shop>&key=<ADMIN_KEY>` endpoint (Railway).
//
// Usage:
//   node keystone-token.mjs <shop> [--service <url>] [--admin-key <key>] [--tokens-dir <path>]
// Env: KEYSTONE_SERVICE_URL (the clone's Railway URL), KEYSTONE_ADMIN_KEY
//
// Exit: 0 = token on stdout · 2 = env/usage error · 3 = not captured yet (build should wait)
import fs from 'node:fs'
import path from 'node:path'
import { normalizeStore, storeHandle } from './lib/shopify-admin.mjs'

const argv = process.argv.slice(2)
const get = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }
const MOCK = argv.includes('--mock')
const shop = normalizeStore(argv.find(a => !a.startsWith('--')))
const service = (get('service') || process.env.KEYSTONE_SERVICE_URL || '').replace(/\/+$/, '')
const adminKey = get('admin-key') || process.env.KEYSTONE_ADMIN_KEY || ''
const tokensDir = get('tokens-dir') || path.join(process.cwd(), 'tokens')

if (!shop) { console.error('keystone-token: usage: keystone-token.mjs <shop> [--service <url>] [--admin-key <key>]'); process.exit(2) }
if (MOCK) { process.stdout.write('shpca_mocktoken000\n'); process.exit(0) }

// Pull SHOPIFY_ADMIN_TOKEN out of a catcher env block (file contents or HTTP body).
function parseToken(text) {
  const m = String(text).match(/^\s*SHOPIFY_ADMIN_TOKEN\s*=\s*(\S+)\s*$/m)
  return m ? m[1] : null
}

// 1. local tokens/<shop>.env (the catcher writes <shop-handle>.env or <shop>.env)
for (const fname of [`${storeHandle(shop)}.env`, `${shop}.env`]) {
  const f = path.join(tokensDir, fname)
  if (fs.existsSync(f)) {
    const tok = parseToken(fs.readFileSync(f, 'utf-8'))
    if (tok) { process.stdout.write(`${tok}\n`); process.exit(0) }
  }
}

// 2. the deployed catcher's /token endpoint
if (!service) { console.error(`keystone-token: NOT-FOUND locally + no --service/KEYSTONE_SERVICE_URL (the clone's Railway URL) to fetch from`); process.exit(2) }
if (!adminKey) { console.error('keystone-token: need --admin-key or KEYSTONE_ADMIN_KEY (the clone catcher ADMIN_KEY)'); process.exit(2) }
try {
  const res = await fetch(`${service}/token?shop=${encodeURIComponent(shop)}&key=${encodeURIComponent(adminKey)}`)
  if (res.status === 404 || res.status === 409) { console.error(`keystone-token: NOT-INSTALLED — ${shop} has no captured token yet; send the install link + wait`); process.exit(3) }
  if (!res.ok) { console.error(`keystone-token: error ${res.status} from ${service}/token`); process.exit(1) }
  const tok = parseToken(await res.text())
  if (!tok) { console.error(`keystone-token: response had no SHOPIFY_ADMIN_TOKEN for ${shop}`); process.exit(3) }
  process.stdout.write(`${tok}\n`)
  process.exit(0)
} catch (err) {
  console.error(`keystone-token: ${err.message}`); process.exit(1)
}
