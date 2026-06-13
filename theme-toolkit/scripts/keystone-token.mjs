#!/usr/bin/env node
// Keystone token — fetch the current (auto-refreshed) Admin API token for a store.
// Prints ONLY the token to stdout (for `export SHOPIFY_ADMIN_API_TOKEN_X=$(...)`); logs to stderr.
//
// Usage: node keystone-token.mjs <store>
// Env: KEYSTONE_SERVICE_URL, KEYSTONE_API_KEY
//
// Exit: 0 = token on stdout · 2 = env error · 3 = not installed yet (build should wait/ask) · 1 = other
import { ksFetch, normalizeStore, EnvError } from './lib/keystone.mjs'

const argv = process.argv.slice(2)
const MOCK = argv.includes('--mock')
const store = normalizeStore(argv.find(a => !a.startsWith('--')))

if (!store) { console.error('keystone-token: usage: keystone-token.mjs <store>'); process.exit(2) }

if (MOCK) { process.stdout.write('shpat_mocktoken000\n'); process.exit(0) }

try {
  const { status, json } = await ksFetch('GET', '/token', { query: { shop: store } })
  if (status === 409) { console.error(`keystone-token: NOT-INSTALLED — ${store} (status: ${json.status || 'unknown'}). Send the install link + wait.`); process.exit(3) }
  if (status !== 200 || !json.access_token) { console.error(`keystone-token: error ${status}: ${json.error || ''}`); process.exit(1) }
  if (json.refreshed) console.error(`keystone-token: refreshed token for ${store}`)
  process.stdout.write(`${json.access_token}\n`)
  process.exit(0)
} catch (err) {
  if (err instanceof EnvError) { console.error(`keystone-token: ENV-ERROR — ${err.message}`); process.exit(2) }
  console.error(`keystone-token: ${err.message}`); process.exit(1)
}
