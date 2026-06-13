// Shopify OAuth helpers for the Keystone provisioning service.
// Custom-distribution apps install via standard OAuth — the install link hits our
// redirect_uri, and we exchange the code for an offline Admin API token.
// Refs: shopify.dev authorization-code-grant + offline-access-tokens (expiry/refresh, 2026).
import crypto from 'node:crypto'

// Porter's exact scope set — MUST match theme-toolkit/scripts/lib/shopify-admin.mjs REQUIRED_SCOPES.
// (The service is a separate codebase so it can't import it; keystone-status.mjs cross-checks parity.)
export const PORTER_SCOPES = [
  'write_products', 'read_products',
  'write_content', 'read_content',
  'write_files', 'read_files',
  'write_metaobjects', 'read_metaobjects',
  'write_online_store_navigation',
]

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

export function normalizeShop(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const host = s.includes('.') ? s : `${s}.myshopify.com`
  return SHOP_RE.test(host) ? host : null
}

export function buildAuthorizeUrl({ shop, clientId, scopes, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: (scopes || PORTER_SCOPES).join(','),
    redirect_uri: redirectUri,
    state,
    'grant_options[]': '', // offline access token (omit per-user)
  })
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`
}

// Verify the HMAC on the OAuth callback query (forgery protection). Shopify signs all params
// except `hmac` (and the legacy `signature`) with the app's client_secret (HMAC-SHA256 hex).
export function verifyCallbackHmac(query, clientSecret) {
  const { hmac, signature, ...rest } = query
  if (!hmac) return false
  const message = Object.keys(rest).sort().map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`).join('&')
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
  const a = Buffer.from(digest)
  const b = Buffer.from(String(hmac))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Exchange the authorization code for a token. Offline-token responses (2026) may include
// refresh_token + expires_in (expiring) OR be a classic non-expiring token (no expiry/refresh).
export async function exchangeCode({ shop, clientId, clientSecret, code }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() // { access_token, scope, [refresh_token, expires_in, refresh_token_expires_in] }
}

// Refresh an expiring offline token (only when the app issues expiring tokens — refresh_token present).
export async function refreshAccessToken({ shop, clientId, clientSecret, refreshToken }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`token refresh ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// Confirm the token works + report the granted scopes (parity check happens client-side in keystone-status).
export async function fetchGrantedScopes({ shop, accessToken }) {
  const res = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`access_scopes ${res.status}`)
  const json = await res.json()
  return (json.access_scopes || []).map(s => s.handle)
}

export function scopesMatchPorter(granted) {
  const g = new Set(granted)
  const missing = PORTER_SCOPES.filter(s => !g.has(s))
  return { ok: missing.length === 0, missing }
}
