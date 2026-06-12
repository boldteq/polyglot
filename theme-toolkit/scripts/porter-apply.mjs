#!/usr/bin/env node
// Porter applier — idempotently applies a declarative store-data-plan.json to a Shopify
// store via the Admin API. Safe to re-run (upsert-or-skip, never duplicates).
//
// Usage:
//   node porter-apply.mjs <plan.json> [--dry-run] [--allow-destructive]
//
// Env: SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN[_<handle>], REPORT_DIR
//
// store-data-plan.json shape (every collection optional):
//   { "store_domain"?, "mode": "production|demo",
//     "products":[{handle,title,action?,descriptionHtml?,vendor?,productType?,tags?,status?,
//                  variants?:[ProductVariantSetInput], media?:[{src,alt}], metafields?:[{namespace,key,type,value}]}],
//     "collections":[{handle,title,action?,descriptionHtml?,ruleSet?}], "pages":[{handle,title,action?,body?,isPublished?}],
//     "articles":[{blog,handle,title,action?,body?}], "menus":[{handle,title,action?,items?:[MenuItemCreateInput]}],
//     "files":[{alt,src,as?}], "metafield_values":[{owner:"product:handle"|"collection:handle"|"page:handle"|"shop",namespace,key,type,value,action?}],
//     "metaobjects":[{type,handle,action?,fields?}], "redirects":[{from,to,action?}], "bulk_edits":[...] }
//   action ∈ upsert(default, non-destructive) | replace | delete (both destructive). bulk_edits = always destructive + NOT auto-applied.
//
// SAFETY: destructive ops (action replace|delete, or bulk_edits) are BLOCKED unless --allow-destructive
//   AND CHANGES.md carries a structured dated per-op sign-off line:
//     - [x] YYYY-MM-DD porter:<delete|replace|bulk> <exact-key>
//   Never touches orders/customers/payments. bulk_edits are never auto-applied (blocker — run manually).
//
// Exit: 0 = applied/clean dry-run · 1 = block (destructive ungated / plan invalid / apply error) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import { resolveStore, resolveToken, adminGraphql, AuthError } from './lib/shopify-admin.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const argv = process.argv.slice(2)
const planPath = argv.find(a => !a.startsWith('--'))
const DRY = argv.includes('--dry-run')
const ALLOW_DESTRUCTIVE = argv.includes('--allow-destructive')

const blockers = []
const warnings = []
const add = (list, id, where, detail) => list.push({ id, page: where, detail, evidence: '' })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('store-apply', 21, {
    cwd, pass, blockers, warnings,
    evidence: { plan: planPath || null, dryRun: DRY, allowDestructive: ALLOW_DESTRUCTIVE, ...evidence, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`store-apply: ${code === 2 ? 'ENV-ERROR' : code === 0 ? (DRY ? 'DRY-OK' : 'APPLIED') : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}] ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}] ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── load + validate plan (offline) ──────────────────────────────────────────
if (!planPath) finish('no plan file — usage: porter-apply.mjs <store-data-plan.json> [--dry-run] [--allow-destructive]')
const planAbs = path.resolve(cwd, planPath)
if (!fs.existsSync(planAbs)) finish(`plan not found: ${planPath}`)
let plan
try { plan = JSON.parse(fs.readFileSync(planAbs, 'utf-8')) } catch (err) { finish(`plan not valid JSON: ${err.message}`) }

const RESOURCES = [
  { key: 'products', idField: 'handle', label: 'product' },
  { key: 'collections', idField: 'handle', label: 'collection' },
  { key: 'pages', idField: 'handle', label: 'page' },
  { key: 'articles', idField: 'handle', label: 'article' },
  { key: 'menus', idField: 'handle', label: 'menu' },
  { key: 'files', idField: 'alt', label: 'file' },
  { key: 'metafield_values', idField: null, label: 'metafield' },
  { key: 'metaobjects', idField: 'handle', label: 'metaobject' },
  { key: 'redirects', idField: 'from', label: 'redirect' },
]

function idemKey(resKey, item) {
  if (resKey === 'metafield_values') return `${item.owner}#${item.namespace}.${item.key}`
  if (resKey === 'files') return item.alt || (item.src ? path.basename(item.src) : null)
  if (resKey === 'redirects') return item.from
  return item.handle ?? null
}
const isDestructive = item => item.action === 'delete' || item.action === 'replace'

const ops = []
let invalid = 0
for (const r of RESOURCES) {
  const list = plan[r.key]
  if (list == null) continue
  if (!Array.isArray(list)) { add(blockers, 'apply.bad-shape', r.key, `"${r.key}" must be an array`); invalid += 1; continue }
  for (const item of list) {
    if (!item || typeof item !== 'object') { add(blockers, 'apply.bad-item', r.key, 'entry must be an object'); invalid += 1; continue }
    const key = idemKey(r.key, item)
    if (!key) { add(blockers, 'apply.no-key', r.key, `entry missing its idempotency key (${r.idField || 'owner+namespace.key'})`); invalid += 1; continue }
    ops.push({ resource: r.key, label: r.label, key, action: item.action || 'upsert', destructive: isDestructive(item), item })
  }
}
const bulkEdits = Array.isArray(plan.bulk_edits) ? plan.bulk_edits : []
for (let i = 0; i < bulkEdits.length; i += 1) {
  const b = bulkEdits[i]
  ops.push({ resource: 'bulk_edits', label: `bulk-${b.kind || '?'}`, key: `${b.kind || 'bulk'}#${i}`, action: 'bulk', destructive: true, item: b })
}

if (invalid > 0) finish(null, { ops: ops.length, invalid })

// ── destructive gate (offline) — structured dated per-op CHANGES.md sign-off ──
// Required line shape (case-insensitive): "...YYYY-MM-DD...porter:<verb>...<exact-key>..."
// where verb ∈ delete|replace|bulk and <exact-key> is a whole-token match (no substring).
const destructiveOps = ops.filter(o => o.destructive)
if (destructiveOps.length > 0) {
  if (!ALLOW_DESTRUCTIVE) {
    for (const o of destructiveOps) add(blockers, 'apply.destructive-ungated', o.resource, `${o.action} ${o.label} "${o.key}" is destructive — needs --allow-destructive + a dated CHANGES.md sign-off line "- [x] YYYY-MM-DD porter:${o.action} ${o.key}"`)
    finish(null, { destructive: destructiveOps.length, ops: ops.length })
  }
  const changesAbs = path.resolve(cwd, 'CHANGES.md')
  const lines = fs.existsSync(changesAbs) ? fs.readFileSync(changesAbs, 'utf-8').split('\n') : []
  for (const o of destructiveOps) {
    const verb = o.action // delete | replace | bulk
    const keyRe = new RegExp(`(^|[^a-z0-9_-])${escapeRe(String(o.key).toLowerCase())}([^a-z0-9_-]|$)`)
    const signed = lines.some(line => {
      const l = line.toLowerCase()
      return /\d{4}-\d{2}-\d{2}/.test(l) && new RegExp(`porter:\\s*${verb}\\b`).test(l) && keyRe.test(l)
    })
    if (!signed) add(blockers, 'apply.destructive-no-signoff', o.resource, `${o.action} "${o.key}" needs a dated CHANGES.md sign-off line: "- [x] YYYY-MM-DD porter:${verb} ${o.key}" (none found)`)
  }
  if (blockers.length) finish(null, { destructive: destructiveOps.length, ops: ops.length })
}

// bulk_edits are never auto-applied (destructive + complex) — block so the run never falsely reports success.
for (const o of ops) {
  if (o.resource === 'bulk_edits') add(blockers, 'apply.bulk-not-automated', 'bulk_edits', `bulk edit "${o.key}" is not auto-applied by Porter — run it manually via a dedicated bulkOperationRunMutation step (admin-write-operations.md §8)`)
}
if (blockers.length) finish(null, { ops: ops.length })

// ── dry-run: report the intended ops, no network ──────────────────────────────
if (DRY) {
  console.log(`store-apply DRY-RUN — ${ops.length} op(s):`)
  const counts = {}
  for (const o of ops) {
    counts[o.resource] = (counts[o.resource] || 0) + 1
    console.log(`  ${o.action.padEnd(7)} ${o.label.padEnd(10)} ${o.key}${o.destructive ? '  [destructive]' : ''}`)
  }
  finish(null, { ops: ops.length, byResource: counts, destructive: destructiveOps.length })
}

// ── live apply (network) ──────────────────────────────────────────────────────
const store = resolveStore(plan.store_domain)
const token = resolveToken(store)
if (!store) finish('no store — set SHOPIFY_STORE_DOMAIN or plan.store_domain')
if (!token) finish('no Admin API token — set SHOPIFY_ADMIN_API_TOKEN (run porter-preflight first)')

const gql = (q, v) => adminGraphql(store, token, q, v)
const applied = { products: 0, collections: 0, pages: 0, articles: 0, menus: 0, files: 0, metafields: 0, metaobjects: 0, redirects: 0, deleted: 0, skipped: 0 }

function checkUE(data, root, ctx) {
  const errs = data?.[root]?.userErrors || []
  if (errs.length) throw new Error(`${root} ${ctx}: ${errs.map(e => e.message).join('; ')}`)
  return data[root]
}

// Identifier-based lookups (productByHandle/collectionByHandle are deprecated on 2025-04).
async function findId(otype, handle) {
  if (otype === 'shop') { const d = await gql(`{ shop { id } }`); return d.shop.id }
  if (otype === 'product') { const d = await gql(`query($h:String!){ productByIdentifier(identifier:{handle:$h}){ id } }`, { h: handle }); return d.productByIdentifier?.id ?? null }
  if (otype === 'collection') { const d = await gql(`query($h:String!){ collectionByIdentifier(identifier:{handle:$h}){ id } }`, { h: handle }); return d.collectionByIdentifier?.id ?? null }
  if (otype === 'page') { const d = await gql(`query($q:String!){ pages(first:1, query:$q){ nodes{ id handle } } }`, { q: `handle:${handle}` }); return d.pages?.nodes?.find(n => n.handle === handle)?.id ?? null }
  throw new Error(`unsupported owner type "${otype}" (supported: product, collection, page, shop)`)
}

async function setMetafields(ownerId, metafields) {
  if (!ownerId) throw new Error('cannot set metafields — owner not found (resource may not have committed yet)')
  for (let i = 0; i < metafields.length; i += 25) { // metafieldsSet max 25/call
    const chunk = metafields.slice(i, i + 25).map(m => ({ ownerId, namespace: m.namespace, key: m.key, type: m.type, value: typeof m.value === 'string' ? m.value : JSON.stringify(m.value) }))
    const d = await gql(`mutation($mf:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$mf){ metafields{ id } userErrors{ field message } } }`, { mf: chunk })
    checkUE(d, 'metafieldsSet', `${chunk.length} fields`)
    applied.metafields += chunk.length
  }
}

// Resolve an image/file source to an originalSource usable by fileCreate/productCreateMedia.
// http(s) URL → passthrough (Shopify fetches it). Local path → staged upload of the bytes.
function mimeFor(p) { const e = path.extname(p).toLowerCase(); return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' }[e] || 'application/octet-stream' }
async function resolveSource(src) {
  if (/^https?:\/\//i.test(src)) return src
  const abs = path.resolve(cwd, src)
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${src}`)
  const filename = path.basename(abs)
  const stg = await gql(`mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }`,
    { input: [{ filename, mimeType: mimeFor(abs), httpMethod: 'POST', resource: 'FILE' }] })
  checkUE(stg, 'stagedUploadsCreate', filename)
  const target = stg.stagedUploadsCreate.stagedTargets[0]
  const form = new FormData()
  for (const p of target.parameters) form.append(p.name, p.value)
  form.append('file', new Blob([fs.readFileSync(abs)], { type: mimeFor(abs) }), filename)
  const up = await fetch(target.url, { method: 'POST', body: form })
  if (!up.ok) throw new Error(`staged upload POST failed (${up.status}) for ${src}`)
  return target.resourceUrl
}

// ── per-resource handlers (idempotent: lookup-or-create / native upsert) ──────
async function applyProduct(p) {
  if (p.action === 'delete') {
    const id = await findId('product', p.handle)
    if (!id) { applied.skipped += 1; return }
    checkUE(await gql(`mutation($id:ID!){ productDelete(input:{id:$id}){ deletedProductId userErrors{ field message } } }`, { id }), 'productDelete', p.handle)
    applied.deleted += 1; return
  }
  const input = { title: p.title, descriptionHtml: p.descriptionHtml, vendor: p.vendor, productType: p.productType, tags: p.tags, status: p.status || 'ACTIVE' }
  if (Array.isArray(p.productOptions)) input.productOptions = p.productOptions
  if (Array.isArray(p.variants)) input.variants = p.variants // ProductVariantSetInput[] — caller-supplied
  Object.keys(input).forEach(k => input[k] === undefined && delete input[k])
  const d = await gql(`mutation Upsert($h:String!,$input:ProductSetInput!){ productSet(identifier:{handle:$h}, input:$input){ product{ id } userErrors{ field message } } }`, { h: p.handle, input })
  const productId = checkUE(d, 'productSet', p.handle).product?.id
  applied.products += 1
  if (Array.isArray(p.media) && p.media.length) {
    const media = []
    for (const m of p.media) media.push({ originalSource: await resolveSource(m.src), mediaContentType: (m.as || 'IMAGE'), alt: m.alt || '' })
    checkUE(await gql(`mutation($id:ID!,$media:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$media){ media{ id } mediaUserErrors{ field message } } }`, { id: productId, media }), 'productCreateMedia', p.handle)
  }
  if (Array.isArray(p.metafields) && p.metafields.length) await setMetafields(productId, p.metafields)
}

async function applyCollection(c) {
  const id = await findId('collection', c.handle)
  if (c.action === 'delete') { if (!id) { applied.skipped += 1; return } checkUE(await gql(`mutation($input:CollectionDeleteInput!){ collectionDelete(input:$input){ deletedCollectionId userErrors{ field message } } }`, { input: { id } }), 'collectionDelete', c.handle); applied.deleted += 1; return }
  const input = { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, ruleSet: c.ruleSet }
  Object.keys(input).forEach(k => input[k] === undefined && delete input[k])
  if (id) { input.id = id; checkUE(await gql(`mutation($input:CollectionInput!){ collectionUpdate(input:$input){ collection{ id } userErrors{ field message } } }`, { input }), 'collectionUpdate', c.handle) }
  else checkUE(await gql(`mutation($input:CollectionInput!){ collectionCreate(input:$input){ collection{ id } userErrors{ field message } } }`, { input }), 'collectionCreate', c.handle)
  applied.collections += 1
}

async function applyPage(pg) {
  const id = await findId('page', pg.handle)
  if (pg.action === 'delete') { if (!id) { applied.skipped += 1; return } checkUE(await gql(`mutation($id:ID!){ pageDelete(id:$id){ deletedPageId userErrors{ field message } } }`, { id }), 'pageDelete', pg.handle); applied.deleted += 1; return }
  const page = { title: pg.title, handle: pg.handle, body: pg.body, isPublished: pg.isPublished !== false }
  Object.keys(page).forEach(k => page[k] === undefined && delete page[k])
  if (id) checkUE(await gql(`mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id, page:$page){ page{ id } userErrors{ field message } } }`, { id, page }), 'pageUpdate', pg.handle)
  else checkUE(await gql(`mutation($page:PageCreateInput!){ pageCreate(page:$page){ page{ id } userErrors{ field message } } }`, { page }), 'pageCreate', pg.handle)
  applied.pages += 1
}

async function applyArticle(a) {
  const blogs = await gql(`query($q:String!){ blogs(first:1, query:$q){ nodes{ id } } }`, { q: `handle:${a.blog}` })
  const blogId = blogs.blogs?.nodes?.[0]?.id
  if (!blogId) throw new Error(`blog "${a.blog}" not found for article "${a.handle}"`)
  const found = await gql(`query($q:String!){ articles(first:1, query:$q){ nodes{ id handle } } }`, { q: `handle:${a.handle}` })
  const id = found.articles?.nodes?.find(n => n.handle === a.handle)?.id
  const article = { blogId, handle: a.handle, title: a.title, body: a.body }
  Object.keys(article).forEach(k => article[k] === undefined && delete article[k])
  if (id) checkUE(await gql(`mutation($id:ID!,$article:ArticleUpdateInput!){ articleUpdate(id:$id, article:$article){ article{ id } userErrors{ field message } } }`, { id, article }), 'articleUpdate', a.handle)
  else checkUE(await gql(`mutation($article:ArticleCreateInput!){ articleCreate(article:$article){ article{ id } userErrors{ field message } } }`, { article }), 'articleCreate', a.handle)
  applied.articles += 1
}

async function applyMenu(m) {
  const found = await gql(`query($q:String!){ menus(first:1, query:$q){ nodes{ id handle } } }`, { q: `handle:${m.handle}` })
  const id = found.menus?.nodes?.find(n => n.handle === m.handle)?.id
  const items = m.items || []
  if (m.action === 'delete') { if (!id) { applied.skipped += 1; return } checkUE(await gql(`mutation($id:ID!){ menuDelete(id:$id){ deletedMenuId userErrors{ field message } } }`, { id }), 'menuDelete', m.handle); applied.deleted += 1; return }
  if (id) checkUE(await gql(`mutation($id:ID!,$title:String!,$handle:String!,$items:[MenuItemUpdateInput!]!){ menuUpdate(id:$id, title:$title, handle:$handle, items:$items){ menu{ id } userErrors{ field message } } }`, { id, title: m.title, handle: m.handle, items }), 'menuUpdate', m.handle)
  else checkUE(await gql(`mutation($title:String!,$handle:String!,$items:[MenuItemCreateInput!]!){ menuCreate(title:$title, handle:$handle, items:$items){ menu{ id } userErrors{ field message } } }`, { title: m.title, handle: m.handle, items }), 'menuCreate', m.handle)
  applied.menus += 1
}

async function applyFile(f) {
  const alt = f.alt || path.basename(f.src)
  const existing = await gql(`query($q:String!){ files(first:1, query:$q){ nodes{ id alt } } }`, { q: `alt:${alt}` })
  if (existing.files?.nodes?.some(n => n.alt === alt)) { applied.skipped += 1; return }
  const originalSource = await resolveSource(f.src)
  checkUE(await gql(`mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id } userErrors{ field message } } }`, { files: [{ alt, contentType: f.as || 'IMAGE', originalSource }] }), 'fileCreate', alt)
  applied.files += 1
}

async function applyRedirect(r) {
  const found = await gql(`query($q:String!){ urlRedirects(first:1, query:$q){ nodes{ id path } } }`, { q: `path:${r.from}` })
  const id = found.urlRedirects?.nodes?.find(n => n.path === r.from)?.id
  if (r.action === 'delete') { if (!id) { applied.skipped += 1; return } checkUE(await gql(`mutation($id:ID!){ urlRedirectDelete(id:$id){ deletedUrlRedirectId userErrors{ field message } } }`, { id }), 'urlRedirectDelete', r.from); applied.deleted += 1; return }
  if (id) checkUE(await gql(`mutation($id:ID!,$input:UrlRedirectInput!){ urlRedirectUpdate(id:$id, urlRedirect:$input){ urlRedirect{ id } userErrors{ field message } } }`, { id, input: { path: r.from, target: r.to } }), 'urlRedirectUpdate', r.from)
  else checkUE(await gql(`mutation($input:UrlRedirectInput!){ urlRedirectCreate(urlRedirect:$input){ urlRedirect{ id } userErrors{ field message } } }`, { input: { path: r.from, target: r.to } }), 'urlRedirectCreate', r.from)
  applied.redirects += 1
}

async function applyMetaobject(mo) {
  checkUE(await gql(`mutation($h:MetaobjectHandleInput!,$mo:MetaobjectUpsertInput!){ metaobjectUpsert(handle:$h, metaobject:$mo){ metaobject{ id } userErrors{ field message } } }`,
    { h: { type: mo.type, handle: mo.handle }, mo: { fields: Object.entries(mo.fields || {}).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })) } }), 'metaobjectUpsert', `${mo.type}/${mo.handle}`)
  applied.metaobjects += 1
}

async function applyStandaloneMetafield(mf) {
  const idx = mf.owner.indexOf(':') // split on FIRST colon only (gid owners contain colons)
  const otype = idx === -1 ? 'shop' : mf.owner.slice(0, idx)
  const ohandle = idx === -1 ? null : mf.owner.slice(idx + 1)
  const ownerId = await findId(otype, ohandle)
  await setMetafields(ownerId, [{ namespace: mf.namespace, key: mf.key, type: mf.type, value: mf.value }])
}

const HANDLERS = {
  products: applyProduct, collections: applyCollection, pages: applyPage, articles: applyArticle,
  menus: applyMenu, files: applyFile, redirects: applyRedirect, metaobjects: applyMetaobject, metafield_values: applyStandaloneMetafield,
}

// Per-op isolation: one bad item records a blocker but does not abort the rest of the run.
for (const o of ops) {
  try {
    const handler = HANDLERS[o.resource]
    if (!handler) { add(blockers, 'apply.no-handler', o.resource, `no handler for "${o.resource}"`); continue }
    await handler(o.item)
  } catch (err) {
    if (err instanceof AuthError) finish(`token rejected mid-apply: ${err.message}`)
    add(blockers, 'apply.op-failed', o.resource, `${o.label} "${o.key}": ${err.message}`)
  }
}
finish(null, { applied, ops: ops.length })
