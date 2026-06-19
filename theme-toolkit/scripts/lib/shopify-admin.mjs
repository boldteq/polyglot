// Shopify Admin API client for Porter (store-operator) scripts.
// Node 20 ESM, no external deps (global fetch). Shared by porter-preflight/apply/verify.
//
// Token + store resolution (never hardcode — env / 1Password only):
//   SHOPIFY_STORE_DOMAIN            e.g. acme.myshopify.com (or pass store handle)
//   SHOPIFY_ADMIN_API_TOKEN         the custom-app Admin API access token
//   SHOPIFY_ADMIN_API_TOKEN_<handle>  per-store override (handle uppercased, non-alnum→_)

export const API_VERSION = '2025-04'

// Minimal scopes Porter needs — preflight checks these are granted.
export const REQUIRED_SCOPES = [
  'write_products', 'read_products',
  'write_content', 'read_content',
  'write_files', 'read_files',
  'write_metaobjects', 'read_metaobjects',
  'write_online_store_navigation',
]
// Scopes Porter must NEVER hold/use (surfaced as a warning if granted — least privilege).
export const FORBIDDEN_SCOPES = ['write_orders', 'write_customers', 'write_payment_terms', 'write_payment_gateways']

export function normalizeStore(input) {
  if (!input) return null
  let s = String(input).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!s.includes('.')) s = `${s}.myshopify.com`
  return s
}

export function storeHandle(store) {
  return normalizeStore(store).replace(/\.myshopify\.com$/, '')
}

export function resolveStore(arg) {
  return normalizeStore(arg || process.env.SHOPIFY_STORE_DOMAIN || process.env.STORE || '')
}

// Per-store token override wins, then the generic env. Returns null if absent.
export function resolveToken(store) {
  if (store) {
    const key = `SHOPIFY_ADMIN_API_TOKEN_${storeHandle(store).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
    if (process.env[key]) return process.env[key]
  }
  return process.env.SHOPIFY_ADMIN_API_TOKEN || null
}

export function adminEndpoint(store) {
  return `https://${normalizeStore(store)}/admin/api/${API_VERSION}/graphql.json`
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// GraphQL with exponential backoff on THROTTLED / 429 / 5xx (admin-graphql.md cost model).
export async function adminGraphql(store, token, query, variables = {}, { maxRetries = 5 } = {}) {
  if (!query) throw new Error('adminGraphql: missing query (likely an unsupported owner/resource type)')
  const url = adminEndpoint(store)
  let lastErr = null
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const isLast = attempt === maxRetries - 1
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
    } catch (err) {
      lastErr = err
      if (!isLast) await sleep(2 ** attempt * 500)
      continue
    }
    if (res.status === 429) { if (!isLast) await sleep(2 ** attempt * 1000); lastErr = new Error('throttled (429)'); continue }
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '')
      throw new AuthError(`Admin API ${res.status} (token invalid or insufficient scope): ${body.slice(0, 200)}`)
    }
    if (res.status >= 500) { lastErr = new Error(`Admin API ${res.status}`); if (!isLast) await sleep(2 ** attempt * 500); continue }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Admin API HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    let json
    try { json = await res.json() } catch (err) { lastErr = err; if (!isLast) await sleep(2 ** attempt * 500); continue }
    const throttled = json.errors?.some(e => e.extensions?.code === 'THROTTLED')
    if (throttled) { lastErr = new Error('throttled (GraphQL)'); if (!isLast) await sleep(2 ** attempt * 1000); continue }
    if (json.errors?.length) throw new GraphQLError(json.errors.map(e => e.message).join('; '), json.errors)
    return json.data
  }
  throw lastErr || new Error('adminGraphql: exhausted retries')
}

export class AuthError extends Error {}
export class GraphQLError extends Error {
  constructor(message, errors) { super(message); this.errors = errors }
}

// Granted scopes via the REST access-scopes endpoint (no GraphQL equivalent).
export async function getGrantedScopes(store, token) {
  const url = `https://${normalizeStore(store)}/admin/oauth/access_scopes.json`
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' } })
  if (res.status === 401 || res.status === 403) throw new AuthError(`access_scopes ${res.status}: token invalid`)
  if (!res.ok) throw new Error(`access_scopes HTTP ${res.status}`)
  const json = await res.json()
  return (json.access_scopes || []).map(s => s.handle)
}

// Probe store identity + product count; classifies fresh vs live.
// NOTE: deliberately does NOT query ordersCount — that requires read_orders, which Porter's
// least-privilege token does NOT grant (orders are out of scope). productsCount (read_products,
// which Porter holds) is the safe signal: any existing catalog ⇒ treat as a live store for the
// destructive gate. A store with products but 0 orders is still "live" data we must not clobber.
export async function probeStore(store, token) {
  const data = await adminGraphql(store, token, `{
    shop { name myshopifyDomain }
    productsCount { count }
  }`)
  const products = data.productsCount?.count ?? 0
  return {
    name: data.shop?.name ?? null,
    domain: data.shop?.myshopifyDomain ?? normalizeStore(store),
    products,
    classification: products > 0 ? 'live' : 'fresh',
  }
}

// Pure content-quality helper (porter-preflight #20): is a product description missing / generic /
// too short to be real merchandising copy? Used to flag autonomous stores shipping placeholder copy.
const GENERIC_DESC = /^(?:product description|default(?: description)?|description|sample(?: description)?|n\/?a|tbd|todo|placeholder)$|lorem ipsum|dolor sit amet/i
export function isWeakDescription(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  return !text || text.length < 40 || GENERIC_DESC.test(text)
}
