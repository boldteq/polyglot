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

import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import {
  resolveStore, resolveToken, getGrantedScopes, probeStore, adminGraphql, isWeakDescription,
  REQUIRED_SCOPES, FORBIDDEN_SCOPES, AuthError,
} from './lib/shopify-admin.mjs'
import { readLock, LOCK_FILE } from './lib/shopify-theme-lock.mjs'
import { scanImages } from './check-image-quality.mjs'

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

  // 3. Product CONTENT quality — an autonomous store that ships placeholder descriptions / no imagery
  // looks incomplete (atrium audit P1). Sample up to 100 products; WARN by default, BLOCK only at
  // publish-grade (PORTER_REQUIRE_CONTENT=1) when ≥20% are weak. Image bytes aren't in GraphQL, so we
  // use pixel dimensions as the unoptimized proxy (resize/WebP happens in porter-apply on upload).
  let productQuality = null
  if (probe.products > 0) {
    const sample = Math.min(probe.products, 100)
    const Q = `query($n:Int!){ products(first:$n){ nodes{ title descriptionHtml featuredImage{ width height } images(first:3){ nodes{ width height } } } pageInfo{ hasNextPage } } }`
    let data = null
    try { data = await adminGraphql(store, token, Q, { n: sample }) } catch { /* leave null — don't fail preflight on a quality probe */ }
    const nodes = data?.products?.nodes || []
    if (nodes.length) {
      let weakDesc = 0, noImage = 0, oversized = 0; const examples = []
      for (const p of nodes) {
        if (isWeakDescription(p.descriptionHtml)) { weakDesc += 1; if (examples.length < 5) examples.push(p.title) }
        if (!p.featuredImage) noImage += 1
        if ((p.images?.nodes || []).some(i => (i.width || 0) > 2500 || (i.height || 0) > 2500)) oversized += 1
      }
      const pct = Math.round((weakDesc / nodes.length) * 100)
      productQuality = { sampled: nodes.length, totalProducts: probe.products, weakDescriptions: weakDesc, weakPct: pct, noImage, oversizedImages: oversized, examples }
      const strict = process.env.PORTER_REQUIRE_CONTENT === '1'
      if (weakDesc) {
        const msg = `${weakDesc}/${nodes.length} sampled product(s) (${pct}%) have a missing/generic/too-short description (e.g. ${examples.slice(0, 3).join(', ')}) — provide real merchandising copy (compass/client) before publish; a store of placeholder descriptions looks unfinished.`
        if (strict && pct >= 20) add(blockers, 'store-preflight.weak-descriptions', msg)
        else add(warnings, 'store-preflight.weak-descriptions', msg)
      }
      if (noImage) add(warnings, 'store-preflight.products-no-image', `${noImage}/${nodes.length} sampled product(s) have NO image — every PDP needs real product media.`)
      if (oversized) add(warnings, 'store-preflight.images-oversized', `${oversized}/${nodes.length} sampled product(s) have an image >2500px — likely unoptimized (slow LCP); porter-apply should resize to ~1200–2048px + WebP on upload.`)
    }
  }

  // 4. Local image preflight (#34) — validate the images we're about to UPLOAD (weight/resolution/
  // format) BEFORE porter-apply touches the store, so a cheap-looking, LCP-tanking image set is caught
  // at the source. WARN by default; oversized → BLOCK at publish-grade (PORTER_REQUIRE_CONTENT=1).
  let imageScan = null
  if (process.env.PORTER_IMAGES_DIR) {
    const r = scanImages(path.resolve(cwd, process.env.PORTER_IMAGES_DIR), { maxKB: Number(process.env.MAX_KB || '500'), minWidth: Number(process.env.MIN_WIDTH || '800') })
    const strict = process.env.PORTER_REQUIRE_CONTENT === '1'
    for (const f of r.findings) {
      ;(f.severityHint === 'block' && strict ? blockers : warnings).push({ id: `store-preflight.${f.id}`, page: path.relative(cwd, f.page), detail: f.detail, evidence: '' })
    }
    imageScan = { dir: process.env.PORTER_IMAGES_DIR, scanned: r.scanned, findings: r.findings.length }
  }

  finish(null, { granted, classification: probe.classification, shop: probe.name, products: probe.products, productQuality, imageScan })
} catch (err) {
  if (err instanceof AuthError) finish(`token rejected: ${err.message}`)
  finish(`store unreachable / API error: ${err.message}`)
}
