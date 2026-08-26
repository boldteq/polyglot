#!/usr/bin/env node
// Keystone token — fetch the captured Admin API token for a store from the CLONED catcher
// (the local-dev-environment-derived OAuth app deployed for this client), and print ONLY the
// token to stdout so the build can: export SHOPIFY_ADMIN_API_TOKEN_<H>=$(keystone-token <shop> …)
//
// Source order: (1) a local `tokens/<shop>.env` file (local-mode capture) — but ONLY if it still
// authenticates against Shopify right now; (2) the catcher's `GET <service>/token?shop=&key=`
// endpoint (Railway), which is also liveness-checked before being trusted/returned.
//
// WHY the liveness check (LEARNED 2026-08-23, grafilabel-app): a custom-distribution app's
// offline token dies the instant the store reinstalls/reapproves the app OR a NEW app version is
// deployed (`shopify app deploy`) — even when the deployed scopes are byte-identical to before.
// The old code trusted the local cache unconditionally, so every reinstall/redeploy silently kept
// serving a dead token to every consumer (Porter, this script's callers) until a human noticed the
// 401 and manually recaptured. That's a loop, not a one-off bug — fix it here once, for every client.
//
// Usage:
//   node keystone-token.mjs <shop> [--service <url>] [--admin-key <key>] [--tokens-dir <path>] [--no-check]
// Env: KEYSTONE_SERVICE_URL (the clone's Railway URL), KEYSTONE_ADMIN_KEY
//
// Exit: 0 = token on stdout · 2 = env/usage error · 3 = not captured yet / cache dead + can't refresh
import fs from 'node:fs'
import path from 'node:path'
import { normalizeStore, storeHandle } from './lib/shopify-admin.mjs'

const argv = process.argv.slice(2)
const get = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }
const MOCK = argv.includes('--mock')
const SKIP_CHECK = argv.includes('--no-check') // trust cache blindly (fast path for callers that just verified liveness themselves)
const shop = normalizeStore(argv.find(a => !a.startsWith('--')))
const service = (get('service') || process.env.KEYSTONE_SERVICE_URL || '').replace(/\/+$/, '')
const adminKey = get('admin-key') || process.env.KEYSTONE_ADMIN_KEY || ''
const tokensDir = get('tokens-dir') || path.join(process.cwd(), 'tokens')

if (!shop) { console.error('keystone-token: usage: keystone-token.mjs <shop> [--service <url>] [--admin-key <key>] [--no-check]'); process.exit(2) }
if (MOCK) { process.stdout.write('shpca_mocktoken000\n'); process.exit(0) }

// Pull SHOPIFY_ADMIN_TOKEN out of a catcher env block (file contents or HTTP body).
function parseToken(text) {
  const m = String(text).match(/^\s*SHOPIFY_ADMIN_TOKEN\s*=\s*(\S+)\s*$/m)
  return m ? m[1] : null
}

// Cheap, side-effect-free liveness probe — the same check Shopify itself uses to reject a dead
// token (401 "access_scopes: token invalid"). ~200-400ms; worth it to never hand out a dead token.
async function isLive(token) {
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, { headers: { 'X-Shopify-Access-Token': token } })
    return res.ok
  } catch { return false } // network blip ≠ dead token — don't discard a possibly-good cache on a fluke
}

const localPaths = [`${storeHandle(shop)}.env`, `${shop}.env`].map(f => path.join(tokensDir, f))
let cachedTok = null, cachedPath = null
for (const f of localPaths) {
  if (fs.existsSync(f)) { const tok = parseToken(fs.readFileSync(f, 'utf-8')); if (tok) { cachedTok = tok; cachedPath = f; break } }
}

// 1. local cache — trust immediately only with --no-check; otherwise verify it still authenticates.
if (cachedTok && (SKIP_CHECK || await isLive(cachedTok))) {
  process.stdout.write(`${cachedTok}\n`)
  process.exit(0)
}
if (cachedTok) console.error(`keystone-token: cached token in ${cachedPath} is DEAD (revoked by reinstall/redeploy) — refreshing from the live catcher…`)

// 2. the deployed catcher's /token endpoint (also liveness-checked before trusting)
if (!service) {
  console.error(cachedTok
    ? `keystone-token: cached token is dead and no --service/KEYSTONE_SERVICE_URL to refresh from — recapture: open <service>/?shop=${shop} logged into the store admin, then re-run.`
    : `keystone-token: NOT-FOUND locally + no --service/KEYSTONE_SERVICE_URL (the clone's Railway URL) to fetch from`)
  process.exit(cachedTok ? 3 : 2)
}
if (!adminKey) { console.error('keystone-token: need --admin-key or KEYSTONE_ADMIN_KEY (the clone catcher ADMIN_KEY)'); process.exit(2) }
try {
  const res = await fetch(`${service}/token?shop=${encodeURIComponent(shop)}&key=${encodeURIComponent(adminKey)}`)
  if (res.status === 404 || res.status === 409) { console.error(`keystone-token: NOT-INSTALLED — ${shop} has no captured token yet; send the install link + wait`); process.exit(3) }
  if (!res.ok) { console.error(`keystone-token: error ${res.status} from ${service}/token`); process.exit(1) }
  const tok = parseToken(await res.text())
  if (!tok) { console.error(`keystone-token: response had no SHOPIFY_ADMIN_TOKEN for ${shop}`); process.exit(3) }
  if (!(await isLive(tok))) {
    console.error(`keystone-token: the catcher's stored token is ALSO dead (last capture predates the current reinstall/redeploy) — recapture: open ${service}/?shop=${shop} logged into the store admin, then re-run.`)
    process.exit(3)
  }
  // Self-heal the local cache so the next call is fast AND correct.
  const outPath = cachedPath || path.join(tokensDir, `${storeHandle(shop)}.env`)
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `SHOP_DOMAIN=${shop}\nSHOPIFY_ADMIN_TOKEN=${tok}\nAPI_VERSION=2026-01\n`)
  } catch { /* best-effort cache refresh — a write failure shouldn't block returning a good token */ }
  process.stdout.write(`${tok}\n`)
  process.exit(0)
} catch (err) {
  console.error(`keystone-token: ${err.message}`); process.exit(1)
}
