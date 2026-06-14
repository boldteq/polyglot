#!/usr/bin/env node
// Porter store-access preflight — fail-fast token + scope validation BEFORE any write.
// Mirrors mantle's theme-access preflight, for the Admin API. Gates all Porter writes.
//
// Usage:
//   node porter-preflight.mjs                  validate $SHOPIFY_STORE_DOMAIN + Admin token
//   node porter-preflight.mjs <store-domain>   explicit store
//
// Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN[_<handle>], REPORT_DIR
//
// BLOCKS on: missing token, store unreachable, a missing REQUIRED scope (exit 2 env-error —
//   nothing can run without access). WARNS on: a granted FORBIDDEN scope (least-privilege),
//   live-with-orders classification (destructive ops will need gating).
// On success: writes evidence (store identity + classification + granted scopes) for porter-apply.
//
// Exit: 0 = access OK · 1 = (reserved) · 2 = env error (no token / unreachable / missing scope)

import { writeReport } from './lib/report.mjs'
import {
  resolveStore, resolveToken, getGrantedScopes, probeStore,
  REQUIRED_SCOPES, FORBIDDEN_SCOPES, AuthError,
} from './lib/shopify-admin.mjs'
import { readLock, LOCK_FILE } from './lib/shopify-theme-lock.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const store = resolveStore(process.argv[2])
const token = resolveToken(store)

const blockers = []
const warnings = []
const add = (list, id, detail) => list.push({ id, page: store || '', detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('store-preflight', 20, {
    cwd, pass, blockers, warnings,
    evidence: { store: store || null, ...evidence, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`store-preflight: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

if (!store) finish('no store — set SHOPIFY_STORE_DOMAIN or pass a store domain')

// Store lock — never write to a store other than the one linked in .boldteq-theme-lock.json.
let themeLock = null
try { themeLock = readLock(cwd) } catch { themeLock = null }
if (themeLock?.store && themeLock.store !== store) {
  add(blockers, 'store-preflight.lock-mismatch', `target store ${store} ≠ locked store ${themeLock.store} (${LOCK_FILE}) — refusing to write to a store other than the linked one. Re-target via \`pnpm theme:relink --confirm\`.`)
  finish(null, { lockedStore: themeLock.store })
}

if (!token) finish(`no Admin API token — set SHOPIFY_ADMIN_API_TOKEN (or per-store override). Create a custom app in Settings > Apps > Develop apps, grant: ${REQUIRED_SCOPES.join(', ')}`)

try {
  // 1. Scope check (cheapest; also proves the token authenticates)
  const granted = await getGrantedScopes(store, token)
  const missing = REQUIRED_SCOPES.filter(s => !granted.includes(s))
  for (const s of FORBIDDEN_SCOPES) {
    if (granted.includes(s)) add(warnings, 'store-preflight.over-scoped', `token holds forbidden scope "${s}" — least-privilege: remove it (Porter never touches orders/customers/payments)`)
  }
  if (missing.length) {
    add(blockers, 'store-preflight.missing-scopes', `token missing required scope(s): ${missing.join(', ')}`)
    finish(`token missing required scope(s): ${missing.join(', ')}`, { granted, missing })
  }

  // 2. Store identity + fresh/live classification (products-based; orders out of scope)
  const probe = await probeStore(store, token)
  if (probe.classification === 'live') {
    add(warnings, 'store-preflight.live-store', `live store with ${probe.products} existing product(s) — destructive ops (delete/replace/bulk) MUST gate behind a dated CHANGES.md sign-off + confirm (preflight §6)`)
  }
  finish(null, { granted, classification: probe.classification, shop: probe.name, products: probe.products })
} catch (err) {
  if (err instanceof AuthError) finish(`token rejected: ${err.message}`)
  finish(`store unreachable / API error: ${err.message}`)
}
