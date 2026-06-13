#!/usr/bin/env node
// Keystone status — the Phase-0 gate before Porter. Confirms the store is installed AND the
// granted scopes match Porter's REQUIRED_SCOPES exactly (so Porter never preflights into a scope fail).
//
// Usage: node keystone-status.mjs <store>
// Env: KEYSTONE_SERVICE_URL, KEYSTONE_API_KEY
//
// Exit: 0 = installed + scopes OK · 1 = not installed / scope mismatch · 2 = env error
import { writeReport } from './lib/report.mjs'
import { ksFetch, normalizeStore, REQUIRED_SCOPES, EnvError } from './lib/keystone.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const MOCK = argv.indexOf('--mock')
const store = normalizeStore(argv.find(a => !a.startsWith('--')))

const blockers = []
const warnings = []
const add = (list, id, detail) => list.push({ id, page: store || '', detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('keystone-status', 25, { cwd, pass, blockers, warnings, evidence: { store: store || null, ...evidence, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`keystone-status: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'INSTALLED+OK' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function checkScopes(granted) {
  const g = new Set(granted || [])
  const missing = REQUIRED_SCOPES.filter(s => !g.has(s))
  if (missing.length) add(blockers, 'status.scope-mismatch', `granted scopes missing Porter's set: ${missing.join(', ')} — recreate the app with the full scope list`)
}

if (!store) finish('usage: keystone-status.mjs <store>')

// Offline mock for CI/smoke: `--mock installed|notinstalled|badscopes`
if (MOCK >= 0) {
  const mode = argv[MOCK + 1] || 'installed'
  if (mode === 'notinstalled') { add(blockers, 'status.not-installed', `${store} registered but client has not installed yet — send the link + wait`); finish(null, { status: 'registered', installed: false }) }
  if (mode === 'badscopes') { checkScopes(['write_products']); finish(null, { status: 'installed', installed: true }) }
  checkScopes(REQUIRED_SCOPES); finish(null, { status: 'installed', installed: true, mock: true })
}

try {
  const { status, json } = await ksFetch('GET', '/status', { query: { shop: store } })
  if (status !== 200) finish(`service returned ${status}: ${json.error || ''}`)
  if (!json.installed) { add(blockers, 'status.not-installed', `${store} status=${json.status} — client has not installed the app yet; send the install link + wait`); finish(null, { status: json.status, installed: false }) }
  checkScopes(json.granted_scopes)
  finish(null, { status: json.status, installed: true, token_expires: json.token_expires })
} catch (err) {
  if (err instanceof EnvError) finish(err.message)
  add(blockers, 'status.failed', err.message); finish(null)
}
