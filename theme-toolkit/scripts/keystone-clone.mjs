#!/usr/bin/env node
// Keystone clone — copy the proven local-dev-environment OAuth catcher into a client folder and
// re-value everything to the folder name, so it's a fresh, non-conflicting custom-distribution app.
// "create folder → call agent → cloned + re-valued app ready to deploy".
//
// The agent then runs the live steps (you approve): railway init/up/domain/variables,
// shopify app config link/deploy, the 3 Shopify Dashboard steps. This script only does the
// deterministic copy + re-value (fully offline) + prints the exact follow-up command sequence.
//
// Usage:
//   node keystone-clone.mjs --here                 # clone INTO the current folder (name = folder name)
//   node keystone-clone.mjs --folder <name>        # clone into <KEYSTONE_APP_DIR>/<name>/
//   [--template <path>]                            # default ~/Desktop/Shopify Task/local-dev-environment
//
// Env: KEYSTONE_TEMPLATE, KEYSTONE_APP_DIR (default ~/Desktop/Shopify Task/Client Shopify App)
//
// Exit: 0 = cloned + re-valued · 1 = block (bad input / template missing) · 2 = env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import { REQUIRED_SCOPES } from './lib/shopify-admin.mjs' // Porter's scopes — stays (Porter's source)

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const HERE = argv.includes('--here')
const get = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }

const TEMPLATE = path.resolve(get('template') || process.env.KEYSTONE_TEMPLATE || path.join(os.homedir(), 'Desktop', 'Shopify Task', 'local-dev-environment'))
const APP_DIR_ROOT = get('app-dir') || process.env.KEYSTONE_APP_DIR || path.join(os.homedir(), 'Desktop', 'Shopify Task', 'Client Shopify App')
const folder = (get('folder') || (HERE ? path.basename(cwd) : null) || '').trim()
const target = HERE ? cwd : (folder ? path.join(APP_DIR_ROOT, folder) : null)

const blockers = []
const warnings = []
const add = (list, id, detail) => list.push({ id, page: folder || '', detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('keystone-clone', 27, { cwd, pass, blockers, warnings, evidence: { folder: folder || null, template: TEMPLATE, target: target || null, ...evidence, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  console.error(`\nkeystone-clone: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'OK' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.error(`  BLOCK ${b.id} ${b.detail}`)
  for (const w of warnings) console.error(`  warn  ${w.id} ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const titleCase = s => s.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
const EXCLUDE = new Set(['tokens', '.shopify', 'node_modules', '.git'])
const TEXT_EXT = new Set(['.toml', '.json', '.md', '.txt', '.example', '.mjs', '.js', '.yml', '.yaml'])

function copyTree(src, dst) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (s) => {
      const base = path.basename(s)
      if (EXCLUDE.has(base)) return false
      if (base === '.env' || base.endsWith('.local')) return false // never copy secrets/identity
      return true
    },
  })
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!EXCLUDE.has(e.name)) yield* walk(p) }
    else yield p
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
if (!target) finish('usage: keystone-clone.mjs (--here | --folder <name>) [--template <path>]')
if (!fs.existsSync(TEMPLATE) || !fs.existsSync(path.join(TEMPLATE, 'shopify.app.toml'))) {
  finish(`template not found (or no shopify.app.toml): ${TEMPLATE} — set --template or KEYSTONE_TEMPLATE`)
}
const name = HERE ? path.basename(target) : folder
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) add(warnings, 'clone.name-shape', `folder name "${name}" isn't a clean kebab slug — Shopify app name + Railway subdomain will use it as-is`)

// Derive the tokens to replace from the template's ACTUAL content (robust to dir renames):
// slug = package.json name; title = the toml `name = "..."` display value.
let templateSlug = path.basename(TEMPLATE)
try { templateSlug = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'package.json'), 'utf-8')).name || templateSlug } catch { /* keep dir basename */ }
let templateTitle = titleCase(templateSlug)
try { templateTitle = (fs.readFileSync(path.join(TEMPLATE, 'shopify.app.toml'), 'utf-8').match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1] || templateTitle } catch { /* keep titlecase */ }
const newDomain = `${name}-production.up.railway.app`

// 1. copy (excluding tokens/secrets/identity)
fs.mkdirSync(target, { recursive: true })
copyTree(TEMPLATE, target)

// 2. re-value every text file: slug → name (covers domain + package + paths), title → name (display)
let filesTouched = 0
for (const file of walk(target)) {
  if (!TEXT_EXT.has(path.extname(file)) && path.basename(file) !== '.env.example') continue
  let txt
  try { txt = fs.readFileSync(file, 'utf-8') } catch { continue }
  const before = txt
  txt = txt.split(templateSlug).join(name)         // local-dev-environment[-production…] → name[-production…]
  if (templateTitle !== templateSlug) txt = txt.split(templateTitle).join(name) // "Local Dev Environment" → name
  if (txt !== before) { fs.writeFileSync(file, txt); filesTouched += 1 }
}

// 3. shopify.app.toml: clear client_id + union scopes (+ Porter's, esp. write_online_store_navigation)
const tomlPath = path.join(target, 'shopify.app.toml')
let toml = fs.readFileSync(tomlPath, 'utf-8')
toml = toml.replace(/^\s*client_id\s*=\s*".*"\s*$/m, 'client_id = ""')
const scopeLine = toml.match(/^(\s*scopes\s*=\s*")([^"]*)(")/m)
if (scopeLine) {
  const existing = scopeLine[2].split(',').map(s => s.trim()).filter(Boolean)
  const union = [...new Set([...existing, ...REQUIRED_SCOPES, 'read_online_store_navigation'])]
  toml = toml.replace(scopeLine[0], `${scopeLine[1]}${union.join(',')}${scopeLine[3]}`)
}
fs.writeFileSync(tomlPath, toml)

// 4. .env.example: point PUBLIC_URL at the new domain (handles the your-service placeholder)
const envEx = path.join(target, '.env.example')
if (fs.existsSync(envEx)) {
  let e = fs.readFileSync(envEx, 'utf-8').replace(/your-service\.up\.railway\.app/g, newDomain)
  fs.writeFileSync(envEx, e)
}

// ── follow-up sequence (the agent runs these; you approve prompts + the 3 Dashboard steps) ──
console.log(`
✅ Cloned + re-valued: ${templateSlug} → ${name}
   target:  ${target}
   app name / domain base: ${name}
   domain:  https://${newDomain}
   scopes:  union(template, Porter) incl. write_online_store_navigation  ·  client_id cleared

▶ Next (run from the folder; you approve the CLI/Dashboard prompts):
   cd "${target}"
   railway init                              # new Railway project for this client
   railway up                                # first deploy
   railway domain                            # confirm it serves ${name}-production… (or set a custom one)
   railway variables --set "PUBLIC_URL=https://${newDomain}" \\
                     --set "ADMIN_KEY=$(printf 'openssl rand -hex 24')" \\
                     --set "CLIENT_ID=<after the next step>" --set "CLIENT_SECRET=<…>"
   shopify app config link                   # register the app in your org (interactive — approve)
   shopify app deploy                        # push scopes + URLs to Shopify

⚠️  3 Dashboard steps Shopify forces (no CLI/API):
   1. Settings → Client credentials → copy CLIENT SECRET (paste into railway variables above)
   2. Distribution → Custom distribution → enter the client store domain
   3. Generate link → that's the link you send the client to install

▶ After the client installs, bridge the token to Porter:
   export SHOPIFY_ADMIN_API_TOKEN_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}=$(node toolkit/scripts/keystone-token.mjs <store>.myshopify.com --service https://${newDomain})
`)
finish(null, { name, newDomain, filesTouched })
