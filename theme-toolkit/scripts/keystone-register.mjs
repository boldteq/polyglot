#!/usr/bin/env node
// Keystone register — store a custom-distribution app's creds for a client store, get the install link.
//
// Run AFTER the (Shopify-mandated manual) Partner-Dashboard step: create the custom-dist app named
// for the store, set scopes to the Porter set, set redirect_uri = <service>/auth/callback, copy creds.
//
// Usage:
//   node keystone-register.mjs --store <s> --client-id <id> --client-secret <secret> [--app-name <n>]
//
// Env: KEYSTONE_SERVICE_URL, KEYSTONE_API_KEY
//
// Exit: 0 = registered (prints install link) · 1 = block (bad input / service error) · 2 = env error
import { writeReport } from './lib/report.mjs'
import { ksFetch, normalizeStore, installLink as ksInstallLink, mask, EnvError, REQUIRED_SCOPES } from './lib/keystone.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const MOCK = argv.includes('--mock')
const get = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }

const store = normalizeStore(get('store'))
const clientId = get('client-id')
const clientSecret = get('client-secret')
const appName = get('app-name')
const installLink = get('install-link') // custom-dist: the Dashboard-generated link to serve as-is

const blockers = []
const add = (id, detail) => blockers.push({ id, page: store || '', detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('keystone-register', 23, { cwd, pass, blockers, warnings: [], evidence: { store: store || null, ...evidence, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  console.error(`keystone-register: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'OK' : 'BLOCK'} — ${blockers.length} blocker(s)`)
  for (const b of blockers) console.error(`  BLOCK ${b.id} ${b.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

if (!store) add('register.bad-store', `invalid --store (expect <name> or <name>.myshopify.com); got "${get('store')}"`)
if (!clientId) add('register.no-client-id', 'missing --client-id (from the Partner-Dashboard app)')
if (!clientSecret) add('register.no-client-secret', 'missing --client-secret')
if (blockers.length) finish(null)

console.error(`registering ${store} (client_id ${clientId}, secret ${mask(clientSecret)}) scopes=${REQUIRED_SCOPES.length}`)

if (MOCK) {
  console.log(installLink || `https://keystone.example/install?shop=${store}`)
  finish(null, { mock: true, installLink: installLink || null })
}

try {
  const { status, json } = await ksFetch('POST', '/register', { body: { shop: store, client_id: clientId, client_secret: clientSecret, app_name: appName, install_link: installLink } })
  if (status !== 200) { add('register.service-error', `service returned ${status}: ${json.error || JSON.stringify(json).slice(0, 120)}`); finish(null) }
  // install link to stdout (the thing you send the client): the Dashboard custom-dist link if
  // provided, else the service-built /install URL (public-app path).
  console.log(json.install_url || installLink || ksInstallLink(store))
  finish(null, { registered: true })
} catch (err) {
  if (err instanceof EnvError) finish(err.message)
  add('register.failed', err.message); finish(null)
}
