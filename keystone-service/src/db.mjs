// Per-store app + token store (Railway Postgres). Secrets encrypted at rest via crypto.mjs.
import pg from 'pg'
import { encrypt, decrypt } from './crypto.mjs'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_app (
      shop                  TEXT PRIMARY KEY,
      app_name              TEXT,
      client_id             TEXT NOT NULL,
      client_secret_enc     TEXT NOT NULL,
      access_token_enc      TEXT,
      refresh_token_enc     TEXT,
      token_expires         TIMESTAMPTZ,
      scopes                TEXT,
      pending_state         TEXT,
      status                TEXT NOT NULL DEFAULT 'registered',
      installed_at          TIMESTAMPTZ,
      last_refreshed_at     TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

export async function upsertRegistration({ shop, appName, clientId, clientSecret, scopes }) {
  await pool.query(
    `INSERT INTO client_app (shop, app_name, client_id, client_secret_enc, scopes, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,'registered',now())
     ON CONFLICT (shop) DO UPDATE SET
       app_name=EXCLUDED.app_name, client_id=EXCLUDED.client_id,
       client_secret_enc=EXCLUDED.client_secret_enc, scopes=EXCLUDED.scopes, updated_at=now()`,
    [shop, appName ?? null, clientId, encrypt(clientSecret), (scopes || []).join(',')],
  )
}

export async function getApp(shop) {
  const { rows } = await pool.query('SELECT * FROM client_app WHERE shop=$1', [shop])
  if (!rows[0]) return null
  const r = rows[0]
  return {
    shop: r.shop, appName: r.app_name, clientId: r.client_id,
    clientSecret: decrypt(r.client_secret_enc),
    accessToken: r.access_token_enc ? decrypt(r.access_token_enc) : null,
    refreshToken: r.refresh_token_enc ? decrypt(r.refresh_token_enc) : null,
    tokenExpires: r.token_expires, scopes: r.scopes, pendingState: r.pending_state,
    status: r.status, installedAt: r.installed_at, lastRefreshedAt: r.last_refreshed_at,
  }
}

export async function setPendingState(shop, state) {
  await pool.query('UPDATE client_app SET pending_state=$2, updated_at=now() WHERE shop=$1', [shop, state])
}

export async function saveTokens(shop, { accessToken, refreshToken, expiresAt, scopes }) {
  await pool.query(
    `UPDATE client_app SET access_token_enc=$2, refresh_token_enc=$3, token_expires=$4, scopes=$5,
       status='installed', installed_at=COALESCE(installed_at, now()), last_refreshed_at=now(),
       pending_state=NULL, updated_at=now() WHERE shop=$1`,
    [shop, encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, expiresAt ?? null, scopes ?? null],
  )
}

// Rows with an expiring token within the window (for the refresh job). Non-expiring tokens (no
// token_expires / no refresh token) are skipped — they never need refresh.
export async function appsNeedingRefresh(windowMs) {
  const cutoff = new Date(Date.now() + windowMs).toISOString()
  const { rows } = await pool.query(
    `SELECT shop FROM client_app WHERE status='installed' AND refresh_token_enc IS NOT NULL
       AND token_expires IS NOT NULL AND token_expires < $1`, [cutoff])
  return rows.map(r => r.shop)
}

export async function revoke(shop) {
  await pool.query(
    `UPDATE client_app SET access_token_enc=NULL, refresh_token_enc=NULL, token_expires=NULL,
       status='revoked', updated_at=now() WHERE shop=$1`, [shop])
}

export async function ping() { await pool.query('SELECT 1'); return true }
