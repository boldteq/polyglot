// Keystone provisioning service — captures + serves per-store Shopify Admin API tokens
// for custom-distribution apps via OAuth. Deployed as a standalone Railway service.
//
// Public routes (Shopify / client hits these): GET /install, GET /auth/callback, GET /health
// Authed routes (Keystone API key — agency/Porter): POST /register, GET /token, GET /status, POST /revoke
//
// Env: PORT, DATABASE_URL, KEYSTONE_ENC_KEY (64 hex), KEYSTONE_API_KEY, KEYSTONE_BASE_URL
import express from 'express'
import * as db from './db.mjs'
import { randomNonce, safeEqual } from './crypto.mjs'
import {
  normalizeShop, buildAuthorizeUrl, verifyCallbackHmac, exchangeCode,
  refreshAccessToken, fetchGrantedScopes, PORTER_SCOPES,
} from './shopify.mjs'

const app = express()
app.use(express.json())

const BASE_URL = (process.env.KEYSTONE_BASE_URL || '').replace(/\/+$/, '')
const CALLBACK = `${BASE_URL}/auth/callback`
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // refresh expiring tokens 7d before expiry

function requireApiKey(req, res, next) {
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!process.env.KEYSTONE_API_KEY || !safeEqual(got, process.env.KEYSTONE_API_KEY)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

function expiresAtFrom(tokenResponse) {
  return tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString() : null
}

// ── health (public) ──────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  let dbOk = false
  try { dbOk = await db.ping() } catch { dbOk = false }
  const configOk = Boolean(process.env.KEYSTONE_ENC_KEY && process.env.KEYSTONE_API_KEY && BASE_URL)
  res.status(dbOk && configOk ? 200 : 503).json({ status: dbOk && configOk ? 'ok' : 'degraded', db: dbOk, config: configOk })
})

// ── register an app's creds (authed) ──────────────────────────────────────────
app.post('/register', requireApiKey, async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  const { client_id: clientId, client_secret: clientSecret, app_name: appName } = req.body
  if (!shop) return res.status(400).json({ error: 'invalid shop (expect <store>.myshopify.com)' })
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'client_id and client_secret required' })
  await db.upsertRegistration({ shop, appName, clientId, clientSecret, scopes: PORTER_SCOPES })
  res.json({ ok: true, shop, install_url: `${BASE_URL}/install?shop=${encodeURIComponent(shop)}`, scopes: PORTER_SCOPES })
})

// ── start install (public — the link you send the client) ─────────────────────
app.get('/install', async (req, res) => {
  const shop = normalizeShop(req.query.shop)
  if (!shop) return res.status(400).send('invalid shop')
  const appRow = await db.getApp(shop)
  if (!appRow) return res.status(404).send('store not registered — run keystone register first')
  const state = randomNonce()
  await db.setPendingState(shop, state)
  res.redirect(buildAuthorizeUrl({ shop, clientId: appRow.clientId, scopes: PORTER_SCOPES, redirectUri: CALLBACK, state }))
})

// ── OAuth callback (public — Shopify redirects here; HMAC + state verified) ────
app.get('/auth/callback', async (req, res) => {
  const shop = normalizeShop(req.query.shop)
  if (!shop) return res.status(400).send('invalid shop')
  const appRow = await db.getApp(shop)
  if (!appRow) return res.status(404).send('store not registered')
  if (!verifyCallbackHmac(req.query, appRow.clientSecret)) return res.status(401).send('hmac verification failed')
  if (!req.query.state || !appRow.pendingState || !safeEqual(req.query.state, appRow.pendingState)) {
    return res.status(403).send('state mismatch (possible CSRF)')
  }
  try {
    const tok = await exchangeCode({ shop, clientId: appRow.clientId, clientSecret: appRow.clientSecret, code: req.query.code })
    await db.saveTokens(shop, { accessToken: tok.access_token, refreshToken: tok.refresh_token || null, expiresAt: expiresAtFrom(tok), scopes: tok.scope || PORTER_SCOPES.join(',') })
    res.status(200).send('✅ Boldteq store access granted. You can close this window.')
  } catch (err) {
    res.status(502).send(`token exchange failed: ${err.message}`)
  }
})

// ── fetch the current token (authed — Porter's build run / keystone-token) ─────
app.get('/token', requireApiKey, async (req, res) => {
  const shop = normalizeShop(req.query.shop)
  if (!shop) return res.status(400).json({ error: 'invalid shop' })
  const appRow = await db.getApp(shop)
  if (!appRow || appRow.status !== 'installed' || !appRow.accessToken) {
    return res.status(409).json({ error: 'not installed', status: appRow?.status || 'unknown' })
  }
  // Refresh an expiring token that is within the window (non-expiring tokens skip this).
  if (appRow.refreshToken && appRow.tokenExpires && new Date(appRow.tokenExpires).getTime() < Date.now() + REFRESH_WINDOW_MS) {
    try {
      const t = await refreshAccessToken({ shop, clientId: appRow.clientId, clientSecret: appRow.clientSecret, refreshToken: appRow.refreshToken })
      await db.saveTokens(shop, { accessToken: t.access_token, refreshToken: t.refresh_token || appRow.refreshToken, expiresAt: expiresAtFrom(t), scopes: t.scope || appRow.scopes })
      return res.json({ access_token: t.access_token, refreshed: true })
    } catch { /* fall through to the existing token if refresh transiently fails */ }
  }
  res.json({ access_token: appRow.accessToken, refreshed: false })
})

// ── status (authed — the Phase-0 gate) ─────────────────────────────────────────
app.get('/status', requireApiKey, async (req, res) => {
  const shop = normalizeShop(req.query.shop)
  if (!shop) return res.status(400).json({ error: 'invalid shop' })
  const appRow = await db.getApp(shop)
  if (!appRow) return res.json({ shop, status: 'not-registered', installed: false })
  let granted = null
  if (appRow.status === 'installed' && appRow.accessToken) {
    try { granted = await fetchGrantedScopes({ shop, accessToken: appRow.accessToken }) } catch { granted = null }
  }
  res.json({
    shop, status: appRow.status, installed: appRow.status === 'installed',
    token_expires: appRow.tokenExpires, granted_scopes: granted, required_scopes: PORTER_SCOPES,
  })
})

// ── revoke (authed — offboarding) ──────────────────────────────────────────────
app.post('/revoke', requireApiKey, async (req, res) => {
  const shop = normalizeShop(req.body.shop)
  if (!shop) return res.status(400).json({ error: 'invalid shop' })
  await db.revoke(shop)
  res.json({ ok: true, shop, status: 'revoked' })
})

// ── refresh loop (expiring tokens only) ────────────────────────────────────────
async function refreshSweep() {
  try {
    const shops = await db.appsNeedingRefresh(REFRESH_WINDOW_MS)
    for (const shop of shops) {
      const a = await db.getApp(shop)
      if (!a?.refreshToken) continue
      try {
        const t = await refreshAccessToken({ shop, clientId: a.clientId, clientSecret: a.clientSecret, refreshToken: a.refreshToken })
        await db.saveTokens(shop, { accessToken: t.access_token, refreshToken: t.refresh_token || a.refreshToken, expiresAt: expiresAtFrom(t), scopes: t.scope || a.scopes })
      } catch (err) { console.error(`[keystone] refresh failed for ${shop}: ${err.message}`) }
    }
  } catch (err) { console.error(`[keystone] refresh sweep error: ${err.message}`) }
}

// ── boot ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080
async function start() {
  await db.initSchema()
  app.listen(PORT, () => console.log(`[keystone] listening on ${PORT} (base ${BASE_URL || 'UNSET'})`))
  setInterval(refreshSweep, 6 * 60 * 60 * 1000) // every 6h; Railway cron can call /internal instead
}

// Only auto-start outside tests (allows `node --check` + import without binding a port).
if (process.env.KEYSTONE_NO_LISTEN !== '1') {
  start().catch(err => { console.error(`[keystone] boot failed: ${err.message}`); process.exit(1) })
}

export { app }
