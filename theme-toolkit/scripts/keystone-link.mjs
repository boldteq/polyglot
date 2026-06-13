#!/usr/bin/env node
// Keystone link — (re)emit the install link for a registered store. Prints the link to stdout.
//
// Usage: node keystone-link.mjs <store>
// Env: KEYSTONE_SERVICE_URL [, KEYSTONE_API_KEY for the registration check]
//
// Exit: 0 = link printed · 1 = not registered · 2 = env error
import { ksFetch, normalizeStore, installLink, EnvError } from './lib/keystone.mjs'

const argv = process.argv.slice(2)
const MOCK = argv.includes('--mock')
const store = normalizeStore(argv.find(a => !a.startsWith('--')))

if (!store) { console.error('keystone-link: ENV-ERROR — usage: keystone-link.mjs <store>'); process.exit(2) }

if (MOCK) { console.log(`https://keystone.example/install?shop=${store}`); process.exit(0) }

try {
  // Confirm the store is registered before handing out a link (avoids a dead link).
  const { status, json } = await ksFetch('GET', '/status', { query: { shop: store } })
  if (status !== 200 || json.status === 'not-registered') {
    console.error(`keystone-link: BLOCK — ${store} not registered; run keystone-register first`)
    process.exit(1)
  }
  // Prefer the stored Dashboard custom-dist link; fall back to the service-built /install URL.
  console.log(json.install_link || installLink(store))
  process.exit(0)
} catch (err) {
  if (err instanceof EnvError) { console.error(`keystone-link: ENV-ERROR — ${err.message}`); process.exit(2) }
  console.error(`keystone-link: BLOCK — ${err.message}`); process.exit(1)
}
