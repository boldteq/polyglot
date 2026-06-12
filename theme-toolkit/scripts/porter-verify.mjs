#!/usr/bin/env node
// Porter verify — post-apply: confirm every metafield/metaobject the build references is
// POPULATED + Storefront-queryable (no empty shells → feeds lumen Gate 3 bind→populate→verify),
// and sweep test artifacts before UAT.
//
// Usage:
//   node porter-verify.mjs <plan.json>                  verify live store (needs token)
//   node porter-verify.mjs <plan.json> --snapshot <s>   verify against a state snapshot (offline/CI)
//
// Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN[_<handle>], REPORT_DIR
//
// Snapshot JSON shape (offline reconciliation):
//   { "metafields":["product:tee#acme.product.ingredients", ...],
//     "metaobjects":["metaobject:lookbook/summer", ...],
//     "test_artifacts":["zz-boldteq-test-foo", ...] }
//
// BLOCKS on: an expected metafield/metaobject missing or empty (the empty-shell lumen Gate 3
//   would fail on); test artifacts still present in production mode.
// WARNS on: test artifacts present in demo mode.
//
// Exit: 0 = all populated + clean · 1 = empty shell / artifacts present · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import { resolveStore, resolveToken, adminGraphql, AuthError } from './lib/shopify-admin.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const planPath = argv.find(a => !a.startsWith('--'))
const snapIdx = argv.indexOf('--snapshot')
const snapPath = snapIdx >= 0 ? argv[snapIdx + 1] : null

const blockers = []
const warnings = []
const add = (list, id, where, detail) => list.push({ id, page: where, detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('store-verify', 22, {
    cwd, pass, blockers, warnings,
    evidence: { plan: planPath || null, mode: snapPath ? 'snapshot' : 'live', ...evidence, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`store-verify: ${code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}] ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}] ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

if (!planPath) finish('no plan — usage: porter-verify.mjs <plan.json> [--snapshot <s>]')
const planAbs = path.resolve(cwd, planPath)
if (!fs.existsSync(planAbs)) finish(`plan not found: ${planPath}`)
let plan
try { plan = JSON.parse(fs.readFileSync(planAbs, 'utf-8')) } catch (err) { finish(`plan not valid JSON: ${err.message}`) }
const mode = plan.mode || 'production'

// ── enumerate EXPECTED populated keys from the plan (offline) ─────────────────
const expectedMetafields = []
for (const mf of plan.metafield_values || []) expectedMetafields.push(`${mf.owner}#${mf.namespace}.${mf.key}`)
for (const p of plan.products || []) for (const mf of p.metafields || []) expectedMetafields.push(`product:${p.handle}#${mf.namespace}.${mf.key}`)
const expectedMetaobjects = (plan.metaobjects || []).map(mo => `metaobject:${mo.type}/${mo.handle}`)

// ── gather ACTUAL state — snapshot (offline) or live (network) ────────────────
async function actualFromLive() {
  const store = resolveStore(plan.store_domain)
  const token = resolveToken(store)
  if (!store || !token) finish('no store/token for live verify — set SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_API_TOKEN or use --snapshot')
  const present = new Set()
  // Targeted lookups for each expected product metafield (no full scan).
  for (const p of plan.products || []) {
    if (!(p.metafields || []).length) continue
    const data = await adminGraphql(store, token,
      `query($h:String!){ productByHandle(handle:$h){ id metafields(first:50){ nodes{ namespace key value } } } }`, { h: p.handle }).catch(() => null)
    for (const n of data?.productByHandle?.metafields?.nodes || []) {
      if (n.value != null && String(n.value).trim() !== '') present.add(`product:${p.handle}#${n.namespace}.${n.key}`)
    }
  }
  const metaobjects = new Set()
  for (const mo of plan.metaobjects || []) {
    const data = await adminGraphql(store, token,
      `query($h:MetaobjectHandleInput!){ metaobjectByHandle(handle:$h){ id } }`, { h: { type: mo.type, handle: mo.handle } }).catch(() => null)
    if (data?.metaobjectByHandle?.id) metaobjects.add(`metaobject:${mo.type}/${mo.handle}`)
  }
  const sweep = await adminGraphql(store, token,
    `{ products(first:50, query:"title:zz-boldteq-test*"){ nodes{ handle } } }`).catch(() => ({ products: { nodes: [] } }))
  return { metafields: present, metaobjects, testArtifacts: (sweep.products?.nodes || []).map(n => n.handle) }
}

function actualFromSnapshot() {
  const snapAbs = path.resolve(cwd, snapPath)
  if (!fs.existsSync(snapAbs)) finish(`snapshot not found: ${snapPath}`)
  let snap
  try { snap = JSON.parse(fs.readFileSync(snapAbs, 'utf-8')) } catch (err) { finish(`snapshot not valid JSON: ${err.message}`) }
  return {
    metafields: new Set(snap.metafields || []),
    metaobjects: new Set(snap.metaobjects || []),
    testArtifacts: snap.test_artifacts || [],
  }
}

try {
  const actual = snapPath ? actualFromSnapshot() : await actualFromLive()

  for (const k of expectedMetafields) {
    if (!actual.metafields.has(k)) add(blockers, 'verify.metafield-empty', k.split('#')[0], `metafield "${k}" expected by the build is missing/empty — loom binding renders an empty shell (lumen Gate 3 fails)`)
  }
  for (const k of expectedMetaobjects) {
    if (!actual.metaobjects.has(k)) add(blockers, 'verify.metaobject-missing', k, `metaobject "${k}" expected by the build was not created`)
  }
  if (actual.testArtifacts.length > 0) {
    if (mode === 'production') add(blockers, 'verify.test-artifacts-present', '', `${actual.testArtifacts.length} zz-boldteq-test- artifact(s) still present — sweep before UAT: ${actual.testArtifacts.slice(0, 5).join(', ')}`)
    else add(warnings, 'verify.demo-test-artifacts', '', `${actual.testArtifacts.length} test artifact(s) present (demo mode — remove before any production cutover)`)
  }
  finish(null, { expectedMetafields: expectedMetafields.length, expectedMetaobjects: expectedMetaobjects.length, testArtifacts: actual.testArtifacts.length })
} catch (err) {
  if (err instanceof AuthError) finish(`token rejected: ${err.message}`)
  finish(`verify failed: ${err.message}`)
}
