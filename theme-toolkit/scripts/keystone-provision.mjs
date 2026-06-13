#!/usr/bin/env node
// Keystone provision — drive the Shopify CLI to build a per-client custom-distribution app,
// then surface the irreducible 3-step Dashboard checklist. "create folder → call agent → app built".
//
// Automates (CLI, after a one-time `shopify auth login` to the org): scaffold the app project in
// ~/Desktop/Shopify Task/Client Shopify App/<store>/, register it in the org, set the 9 Porter
// scopes + the Keystone redirect_uri in shopify.app.toml, deploy, read the client_id.
//
// Shopify forces 3 things to stay manual (NO CLI/API — verified shopify.dev 2026): copy client_secret,
// toggle custom distribution, click "Generate link". This script prints that exact checklist + the
// follow-up `keystone-register` command. The install URL is the DASHBOARD's, not the agent's
// (custom-dist apps cannot install via a self-built authorize URL).
//
// Usage:
//   node keystone-provision.mjs --store <domain> [--org-id <id>] [--app-dir <path>] [--mock]
//
// Env: KEYSTONE_PARTNER_ORG_ID (org "insight infoway"), KEYSTONE_APP_DIR
//      (default ~/Desktop/Shopify Task/Client Shopify App), KEYSTONE_BASE_URL (the service callback host)
//
// Exit: 0 = app built + checklist printed · 1 = block (bad input / CLI failure) · 2 = env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { normalizeStore, storeHandle, REQUIRED_SCOPES } from './lib/keystone.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const MOCK = argv.includes('--mock')
const get = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }

const store = normalizeStore(get('store'))
const handle = store ? storeHandle(store) : null
const orgId = get('org-id') || process.env.KEYSTONE_PARTNER_ORG_ID || null
const appDirRoot = get('app-dir') || process.env.KEYSTONE_APP_DIR || path.join(os.homedir(), 'Desktop', 'Shopify Task', 'Client Shopify App')
const baseUrl = (process.env.KEYSTONE_BASE_URL || '').replace(/\/+$/, '')
const redirectUri = baseUrl ? `${baseUrl}/auth/callback` : 'https://YOUR-KEYSTONE-SERVICE/auth/callback'
const appName = `Boldteq — ${handle || 'client'}`

const blockers = []
const warnings = []
const add = (list, id, detail) => list.push({ id, page: store || '', detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('keystone-provision', 26, { cwd, pass, blockers, warnings, evidence: { store: store || null, orgId, ...evidence, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  console.error(`\nkeystone-provision: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'OK' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.error(`  BLOCK ${b.id} ${b.detail}`)
  for (const w of warnings) console.error(`  warn  ${w.id} ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// Ensure shopify.app.toml carries the 9 scopes + the Keystone redirect. Write fresh if absent;
// patch the two lines if the CLI already generated one.
function ensureToml(dir, clientId) {
  const tomlPath = path.join(dir, 'shopify.app.toml')
  const scopes = REQUIRED_SCOPES.join(',')
  if (!fs.existsSync(tomlPath)) {
    fs.writeFileSync(tomlPath, `# Boldteq Keystone — store-access app for ${store}
${clientId ? `client_id = "${clientId}"\n` : ''}name = "${appName}"
application_url = "${baseUrl || 'https://YOUR-KEYSTONE-SERVICE'}/"
embedded = false

[access_scopes]
scopes = "${scopes}"

[auth]
redirect_urls = [ "${redirectUri}" ]
`)
    return tomlPath
  }
  let toml = fs.readFileSync(tomlPath, 'utf-8')
  if (/^\s*scopes\s*=/m.test(toml)) toml = toml.replace(/^\s*scopes\s*=.*$/m, `scopes = "${scopes}"`)
  else toml += `\n[access_scopes]\nscopes = "${scopes}"\n`
  if (/redirect_urls\s*=/m.test(toml)) toml = toml.replace(/redirect_urls\s*=.*$/m, `redirect_urls = [ "${redirectUri}" ]`)
  else toml += `\n[auth]\nredirect_urls = [ "${redirectUri}" ]\n`
  fs.writeFileSync(tomlPath, toml)
  return tomlPath
}

function readClientId(tomlPath) {
  try { return (fs.readFileSync(tomlPath, 'utf-8').match(/^\s*client_id\s*=\s*"([^"]+)"/m) || [])[1] || null } catch { return null }
}

function sh(cmd, args, dir) {
  console.error(`  $ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd: dir, stdio: ['inherit', 'inherit', 'inherit'], env: process.env })
  return r.status === 0
}

// ── main ─────────────────────────────────────────────────────────────────────
if (!store) finish('usage: keystone-provision.mjs --store <domain> [--org-id <id>] [--app-dir <path>] [--mock]')
if (!baseUrl) add(warnings, 'provision.no-base-url', 'KEYSTONE_BASE_URL not set — redirect_uri written as a placeholder; set it before deploying or the OAuth callback will fail')

const dir = path.join(appDirRoot, handle)
fs.mkdirSync(dir, { recursive: true })
console.error(`Provisioning custom-distribution app for ${store}`)
console.error(`  app folder: ${dir}`)
console.error(`  org: ${orgId || '(set --org-id or KEYSTONE_PARTNER_ORG_ID — "insight infoway")'}`)

let clientId = null
if (MOCK) {
  ensureToml(dir, 'MOCK_CLIENT_ID')
  clientId = readClientId(path.join(dir, 'shopify.app.toml'))
} else {
  if (!orgId) finish('no org id — set --org-id or KEYSTONE_PARTNER_ORG_ID (your "insight infoway" org). Run `shopify auth login` once first.')
  // 1. Scaffold + register the app in the org (needs cached `shopify auth login`).
  const inited = sh('shopify', ['app', 'init', '--path', dir, '--name', appName, '--organization-id', orgId], appDirRoot) ||
                 sh('npm', ['init', '@shopify/app@latest', '--', '--path', dir, '--name', appName, '--organization-id', orgId], appDirRoot)
  if (!inited) { add(blockers, 'provision.init-failed', 'shopify app init failed — run `shopify auth login` once, verify the org id, then retry'); finish(null) }
  // 2. Patch the toml with the 9 scopes + the Keystone redirect.
  ensureToml(dir, null)
  // 3. Deploy the config (push scopes + redirect to Shopify).
  if (!sh('shopify', ['app', 'deploy', '--path', dir, '--force'], dir)) add(warnings, 'provision.deploy-warn', 'shopify app deploy did not exit clean — verify config in the Dashboard before generating the link')
  // 4. Read the assigned client_id.
  clientId = readClientId(path.join(dir, 'shopify.app.toml'))
  if (!clientId) add(warnings, 'provision.no-client-id', 'client_id not found in shopify.app.toml yet — run `shopify app dev` once to register, then re-read')
}

// ── the irreducible 3-step Dashboard checklist (Shopify forces these — no CLI/API) ──
console.log(`
✅ App scaffolded + configured for ${store}
   folder:    ${dir}
   app name:  ${appName}
   client_id: ${clientId || '(pending — run `shopify app dev` once to register)'}
   scopes:    ${REQUIRED_SCOPES.join(', ')}
   redirect:  ${redirectUri}

⚠️  3 Dashboard steps Shopify requires (NO CLI/API for these — do them in the Dev Dashboard):
   1. App → Settings → Client credentials → copy the CLIENT SECRET
   2. Distribution → choose "Custom distribution" → enter store: ${store}
   3. Click "Generate link" → copy the install link

▶ Then run (wires token capture + gives Porter the token):
   node toolkit/scripts/keystone-register.mjs \\
     --store ${handle} \\
     --client-id ${clientId || '<from shopify.app.toml>'} \\
     --client-secret <paste the secret> \\
     --install-link "<paste the Dashboard link>"

   The link from step 3 is what you send the client. (Custom-dist apps can't install via a
   self-built URL — the Dashboard owns the link. To make the agent emit the URL instead, the
   only path is an unlisted public app + a one-time Shopify review.)
`)
finish(null, { appDir: dir, appName, clientId, scopes: REQUIRED_SCOPES.length, redirectUri })
