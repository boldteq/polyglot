// Keystone CLI client — thin HTTPS client of the deployed Keystone provisioning service.
// Imports Porter's REQUIRED_SCOPES directly so scope parity is structural (no drift possible).
import { REQUIRED_SCOPES, normalizeStore, storeHandle } from './shopify-admin.mjs'

export { REQUIRED_SCOPES, normalizeStore, storeHandle }

export class EnvError extends Error {}

export function serviceUrl() {
  return (process.env.KEYSTONE_SERVICE_URL || '').replace(/\/+$/, '')
}
export function apiKey() {
  return process.env.KEYSTONE_API_KEY || null
}

export function installLink(shop) {
  const base = serviceUrl()
  if (!base) throw new EnvError('KEYSTONE_SERVICE_URL not set')
  return `${base}/install?shop=${encodeURIComponent(shop)}`
}

// Authed call to the service. Throws EnvError when service URL / API key are unset.
export async function ksFetch(method, path, { query, body } = {}) {
  const base = serviceUrl()
  if (!base) throw new EnvError('KEYSTONE_SERVICE_URL not set (the deployed Keystone service base URL)')
  const key = apiKey()
  if (!key) throw new EnvError('KEYSTONE_API_KEY not set')
  const qs = query ? `?${new URLSearchParams(query)}` : ''
  const res = await fetch(`${base}${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = {}
  try { json = await res.json() } catch { json = {} }
  return { status: res.status, json }
}

// Mask a secret for any human-facing echo (never print the raw value).
export function mask(secret) {
  const s = String(secret || '')
  return s.length <= 8 ? '••••' : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`
}
