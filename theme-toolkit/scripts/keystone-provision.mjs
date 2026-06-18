#!/usr/bin/env node
// Keystone provision — ONE resumable command for the whole per-client store-access flow.
// Run it from the client folder; re-run it after each manual gate. It detects the current
// phase, auto-does everything scriptable (clone, railway deploy+vars+SCOPES, post-config-link
// toml RESTORE, deploy, token bridge, porter-preflight), and STOPS only at the 3 steps Shopify
// physically forces (config-link picker, the Dashboard secret+distribution, the OAuth install
// click). Idempotent + safe to run anytime — it never repeats a done step and never echoes secrets.
//
// Usage:
//   cd "<client folder>"            # folder name = app slug = railway subdomain
//   node keystone-provision.mjs <store>.myshopify.com
//
// Exit: 0 = a phase advanced or all done · 10 = waiting on a manual gate (re-run after) · 2 = error
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { REQUIRED_SCOPES, normalizeStore, storeHandle } from './lib/shopify-admin.mjs'

const HERE = process.cwd()
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath decodes %20 → space (path has "Boldteq App")
const slug = path.basename(HERE)
const store = normalizeStore(process.argv[2])
const TEMPLATE = process.env.KEYSTONE_TEMPLATE || path.join(os.homedir(), 'Desktop', 'Shopify Task', 'local-dev-environment')

if (!store) { console.error('usage: (cd <client folder>) && node keystone-provision.mjs <store>.myshopify.com'); process.exit(2) }

const envHandle = storeHandle(store).toUpperCase().replace(/[^A-Z0-9]/g, '_')
// Canonical scope set: the catcher's base ∪ Porter's REQUIRED_SCOPES ∪ read nav. Drift-proof.
const BASE = ['read_products','write_products','read_publications','write_publications','read_files','write_files','read_themes','write_themes','read_content','write_content','read_metaobjects','write_metaobjects']
const SCOPES = [...new Set([...BASE, ...REQUIRED_SCOPES, 'read_online_store_navigation'])].join(',') // complete union: base ∪ Porter REQUIRED ∪ nav (UrlRedirect lives under online_store_navigation — no url_redirects scope exists)

const C = { ok: '\x1b[32m', stop: '\x1b[33m', err: '\x1b[31m', dim: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
const done = m => console.log(`${C.ok}✓${C.x} ${m}`)
const info = m => console.log(`${C.dim}·${C.x} ${m}`)
function stop(title, lines) {
  console.log(`\n${C.stop}${C.b}▸ NEXT (manual — Shopify forces this) — then re-run me${C.x}`)
  console.log(`${C.stop}  ${title}${C.x}`)
  for (const l of lines) console.log(`    ${l}`)
  process.exit(10)
}
// run a command; return {ok, out}. capture stdout; stderr inherits unless quiet.
function sh(cmd, { quiet = true, env = {} } = {}) {
  try {
    const out = execSync(cmd, { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'], env: { ...process.env, ...env } })
    return { ok: true, out: out.trim() }
  } catch (e) { return { ok: false, out: (e.stdout || '').toString().trim(), code: e.status } }
}
function railwayKV() {
  const r = sh('railway variables --kv')
  const m = new Map()
  if (r.ok) for (const line of r.out.split('\n')) { const i = line.indexOf('='); if (i > 0) m.set(line.slice(0, i).trim(), line.slice(i + 1).trim()) }
  return m
}
const tomlPath = path.join(HERE, 'shopify.app.toml')
const readToml = () => fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, 'utf8') : ''
const tomlClientId = () => (readToml().match(/^\s*client_id\s*=\s*"([^"]*)"/m) || [])[1] ?? null

function correctToml(clientId, domain) {
  return `# Learn more about configuring your app at https://shopify.dev/docs/apps/tools/cli/configuration
client_id = "${clientId}"
name = "${slug}"
application_url = "https://${domain}"
embedded = false

[access_scopes]
# Only what the OAuth-catcher tool actually uses (Admin API). Matches server.mjs SCOPES.
scopes = "${SCOPES}"
optional_scopes = [ ]
use_legacy_install_flow = true

[auth]
redirect_urls = [
  "https://${domain}/callback"
]

[webhooks]
api_version = "2026-01"

  [webhooks.privacy_compliance]
  customer_data_request_url = "https://${domain}/webhooks"
  customer_deletion_url = "https://${domain}/webhooks"
  shop_deletion_url = "https://${domain}/webhooks"
`
}

console.log(`${C.b}keystone-provision${C.x}  app=${slug}  store=${store}`)

// ── Phase 1: clone ────────────────────────────────────────────────────────────
if (!fs.existsSync(tomlPath)) {
  if (!fs.existsSync(path.join(TEMPLATE, 'shopify.app.toml'))) stop('template missing', [`expected ${TEMPLATE} — set KEYSTONE_TEMPLATE`])
  info('cloning local-dev-environment → this folder…')
  const r = sh(`node "${path.join(SCRIPTS, 'keystone-clone.mjs')}" --here`, { quiet: false })
  if (!r.ok || !fs.existsSync(tomlPath)) { console.error(`${C.err}clone failed${C.x}`); process.exit(2) }
  done('cloned + re-valued')
} else done('clone present')

// ── Phase 2: railway link ───────────────────────────────────────────────────────
if (!sh('railway status --json').ok) {
  info('linking a new Railway project…')
  const r = sh(`railway init --name "${slug}" --json`)
  if (!r.ok) stop('Railway project link', [`railway init --name "${slug}"`, '(pick your Railway workspace if asked)'])
  done(`railway project "${slug}" linked`)
} else done('railway linked')

// ── Phase 3+4: deploy + domain + base vars (PUBLIC_URL, ADMIN_KEY, SCOPES) ───────
let kv = railwayKV()
let publicUrl = kv.get('PUBLIC_URL')
if (!publicUrl) {
  info('first deploy + domain…')
  sh('railway up --ci -y', { quiet: false })
  const dom = sh('railway domain')
  const domain = (dom.out.match(/([a-z0-9-]+\.up\.railway\.app)/i) || [])[1] || `${slug}-production.up.railway.app`
  publicUrl = `https://${domain}`
  sh(`railway variables --set "PUBLIC_URL=${publicUrl}" --set "ADMIN_KEY=$(openssl rand -hex 24)" --set "SCOPES=${SCOPES}"`)
  done(`deployed · domain ${publicUrl} · PUBLIC_URL/ADMIN_KEY/SCOPES set`)
  kv = railwayKV()
} else {
  if (!kv.get('SCOPES')) { sh(`railway variables --set "SCOPES=${SCOPES}"`); done('SCOPES var set (nav scopes)') }
  if (!kv.get('ADMIN_KEY')) { sh('railway variables --set "ADMIN_KEY=$(openssl rand -hex 24)"'); done('ADMIN_KEY set') }
  done(`deployed · ${publicUrl}`)
}
const domain = publicUrl.replace(/^https?:\/\//, '')
const SVC = publicUrl

// ── Phase 5: register on Shopify (interactive — Shopify-forced) ──────────────────
const cid = tomlClientId()
if (!cid) stop('register the app on Shopify', [
  `shopify app config link    ${C.dim}# pick the correct Partner org for this client → "Create a new app" → name: ${slug}${C.x}`,
  'then re-run me — I auto-restore the toml config link overwrites + deploy.',
])
done(`app registered (client_id ${cid.slice(0, 8)}…)`)

// ── Phase 6: AUTO-FIX the config-link clobber + deploy (the gotcha-killer) ───────
const t = readToml()
const tomlScopes = ((t.match(/^\s*scopes\s*=\s*"([^"]*)"/m) || [])[1] || '').split(',').map(s => s.trim())
const scopeDrift = SCOPES.split(',').some(s => !tomlScopes.includes(s)) // any canonical scope missing → restore
const clobbered = /shopify\.dev\/apps\/default-app-home/.test(t) || /embedded\s*=\s*true/.test(t) || !/use_legacy_install_flow\s*=\s*true/.test(t) || !t.includes(domain) || scopeDrift
if (clobbered) {
  info('restoring catcher toml (config link reset it) + redeploying…')
  fs.writeFileSync(tomlPath, correctToml(cid, domain))
  if (!kv.get('CLIENT_ID')) sh(`railway variables --set "CLIENT_ID=${cid}"`)
  const d = sh('shopify app deploy --allow-updates --message "keystone: restore catcher config + scopes"', { quiet: false, env: { CI: '1' } })
  if (!d.ok) stop('deploy the restored config', ['CI=1 shopify app deploy --allow-updates'])
  done('toml restored (railway URLs, embedded=false, legacy install, nav scopes) + deployed')
} else done('toml config correct (railway URLs, legacy install, nav scopes)')

// ── Phase 7: CLIENT_SECRET (Dashboard-only) ──────────────────────────────────────
if (!railwayKV().get('CLIENT_SECRET')) stop('paste the Client secret into Railway', [
  `partners.shopify.com → the Partner org you registered it in → Apps → ${slug} → Settings → Client credentials → copy CLIENT SECRET`,
  `railway variables --set "CLIENT_SECRET=<the secret>"`,
  'then re-run me.',
])
done('CLIENT_SECRET set')

// ── Phase 8: distribution + install + capture (retry — the Railway domain flakes) ─
const KEY = railwayKV().get('ADMIN_KEY')
const ktCmd = `node "${path.join(SCRIPTS, 'keystone-token.mjs')}" ${store} --service ${SVC} --admin-key "${KEY}"`
let tok = ''
for (let i = 0; i < 4 && !tok; i += 1) { const r = sh(ktCmd); if (r.ok && r.out) tok = r.out }
if (!tok) stop('add the store to Custom distribution, then install', [
  `partners.shopify.com → Apps → ${slug} → Distribution → Custom distribution → enter ${store} → Generate link`,
  `then OPEN this (logged into the ${store} admin) → Approve:`,
  `${C.b}${SVC}/?shop=${store}${C.x}`,
  'then re-run me — I bridge the token + run porter-preflight.',
])
done('token CAPTURED')
// Durable LOCAL copy → survives any Railway restart (ephemeral disk). keystone-token reads it FIRST next time.
const tokensDir = path.join(HERE, 'tokens'); const tokFile = path.join(tokensDir, `${storeHandle(store)}.env`)
if (!fs.existsSync(tokFile)) {
  fs.mkdirSync(tokensDir, { recursive: true })
  fs.writeFileSync(tokFile, `SHOP_DOMAIN=${store}\nSHOPIFY_ADMIN_TOKEN=${tok}\nSCOPES=${SCOPES}\nAPI_VERSION=2025-04\n`)
  done(`token saved locally → tokens/${storeHandle(store)}.env (durable — survives catcher restarts)`)
}
const gi = path.join(HERE, '.gitignore')
if (!fs.existsSync(gi) || !/^\s*tokens\/?\s*$/m.test(fs.readFileSync(gi, 'utf8'))) fs.appendFileSync(gi, '\ntokens/\n')

// ── Phase 9: bridge + porter-preflight ───────────────────────────────────────────
const pf = sh(`node "${path.join(SCRIPTS, 'porter-preflight.mjs')}" ${store}`, { env: { [`SHOPIFY_ADMIN_API_TOKEN_${envHandle}`]: tok, SHOPIFY_STORE_DOMAIN: store } })
console.log(pf.out.split('\n').filter(l => /PASS|BLOCK|warn|BLOCK|scope/.test(l)).map(l => '    ' + l).join('\n'))
if (!/PASS/.test(pf.out)) { console.error(`${C.err}porter-preflight did not PASS — see above${C.x}`); process.exit(2) }

console.log(`\n${C.ok}${C.b}✅ DONE — store access provisioned, Porter green-lit.${C.x}`)
console.log(`${C.dim}  Porter env (run before porter-apply; never commit the token):${C.x}`)
console.log(`  export SHOPIFY_ADMIN_API_TOKEN_${envHandle}=$(node "${path.join(SCRIPTS, 'keystone-token.mjs')}" ${store} --service ${SVC} --admin-key "$(railway variables --kv | grep ^ADMIN_KEY= | cut -d= -f2-)")`)
process.exit(0)
