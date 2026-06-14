// Theme-lock shared lib — the single source of the `.boldteq-theme-lock.json` schema
// and the Shopify-CLI theme-list helpers. Used by theme-link / theme-push /
// theme-guard / theme-relink.
//
// The lock pins ONE theme per client repo: every `pnpm theme:push` targets it and
// nothing else. The lock is committed (no secrets — the CLI token stays in env/vault),
// so CI can enforce it too.
//
// No external deps. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const LOCK_FILE = '.boldteq-theme-lock.json'
export const LOCK_VERSION = 1

// The published/live theme. Admin API calls it "main"; some CLI builds surface "live".
// Treat both as the live theme — the one we must NEVER lock or push to.
const LIVE_ROLES = new Set(['main', 'live'])
export const isLiveRole = role => LIVE_ROLES.has(String(role || '').toLowerCase())

export const lockPath = (cwd = process.cwd()) => path.resolve(cwd, LOCK_FILE)

export function readLock(cwd = process.cwd()) {
  const p = lockPath(cwd)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

export function writeLock(cwd, lock) {
  fs.writeFileSync(lockPath(cwd), `${JSON.stringify(lock, null, 2)}\n`)
}

// Returns a list of human-readable problems; empty array = valid shape.
export function lockShapeErrors(lock) {
  const errs = []
  if (!lock || typeof lock !== 'object') return ['lock is not an object']
  if (lock.version !== LOCK_VERSION) errs.push(`version must be ${LOCK_VERSION} (got ${JSON.stringify(lock.version)})`)
  if (!lock.store || typeof lock.store !== 'string') errs.push('store missing or not a string')
  if (lock.themeId == null || String(lock.themeId).trim() === '') errs.push('themeId missing')
  if (!lock.role || typeof lock.role !== 'string') errs.push('role missing')
  if (lock.history && !Array.isArray(lock.history)) errs.push('history must be an array')
  return errs
}

export function newLock({ store, themeId, themeName, role, lockedBy, history = [] }) {
  return {
    version: LOCK_VERSION,
    store,
    themeId: String(themeId),
    themeName: themeName || '',
    role: role || 'unpublished',
    lockedAt: new Date().toISOString(),
    lockedBy: lockedBy || process.env.AGENT_NAME || 'mantle',
    history,
    note: `Boldteq theme lock. All \`pnpm theme:push\` target theme ${themeId} on ${store} only. Re-target with \`pnpm theme:relink --confirm\`.`,
  }
}

// ── Shopify CLI helpers ──────────────────────────────────────────────────────

export function cliAvailable() {
  const probe = spawnSync('shopify', ['version'], { encoding: 'utf-8', timeout: 30_000 })
  return !probe.error && probe.status === 0
}

// Runs `shopify theme list --store <store> --json`. Returns
// { ok, themes, reason }. themes = [{ id, name, role }] normalized.
export function listThemes(store) {
  if (!cliAvailable()) return { ok: false, themes: [], reason: 'shopify CLI not on PATH (npm install -g @shopify/cli@3)' }
  const args = ['theme', 'list', '--json']
  if (store) args.push('--store', store)
  const run = spawnSync('shopify', args, {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' },
  })
  if (run.error) return { ok: false, themes: [], reason: `spawn failed: ${run.error.message}` }
  const stdout = run.stdout || ''
  const start = stdout.indexOf('[')
  const end = stdout.lastIndexOf(']')
  let parsed = null
  if (start !== -1 && end > start) {
    try { parsed = JSON.parse(stdout.slice(start, end + 1)) } catch { parsed = null }
  }
  if (!Array.isArray(parsed)) {
    const reason = run.status !== 0
      ? `theme list exited ${run.status}: ${(run.stderr || '').split('\n').find(Boolean) || 'auth/store error'}`
      : 'unparseable `theme list --json` output'
    return { ok: false, themes: [], reason }
  }
  const themes = parsed.map(t => ({ id: String(t.id ?? t.theme?.id ?? ''), name: t.name ?? t.theme?.name ?? '', role: t.role ?? t.theme?.role ?? '' }))
  return { ok: true, themes, reason: null }
}

// Find a theme by id (preferred) or by exact name.
export function findTheme(themes, { themeId, themeName }) {
  if (themeId != null && String(themeId).trim() !== '') {
    return themes.find(t => t.id === String(themeId)) || null
  }
  if (themeName) return themes.find(t => t.name === themeName) || null
  return null
}

// Push a new unpublished theme and return its id. Used by theme-link --create.
// Returns { ok, id, name, reason }.
export function pushUnpublished(store, name) {
  if (!cliAvailable()) return { ok: false, reason: 'shopify CLI not on PATH (npm install -g @shopify/cli@3)' }
  const args = ['theme', 'push', '--unpublished', '--json']
  if (name) args.push('--theme', name)
  if (store) args.push('--store', store)
  const run = spawnSync('shopify', args, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' },
  })
  if (run.error) return { ok: false, reason: `spawn failed: ${run.error.message}` }
  const stdout = run.stdout || ''
  const s = stdout.indexOf('{')
  const e = stdout.lastIndexOf('}')
  let obj = null
  if (s !== -1 && e > s) { try { obj = JSON.parse(stdout.slice(s, e + 1)) } catch { obj = null } }
  const id = obj?.theme?.id ?? obj?.id
  if (id == null) {
    return { ok: false, reason: run.status !== 0 ? `theme push exited ${run.status}: ${(run.stderr || '').split('\n').find(Boolean) || ''}` : 'could not parse theme id from push output' }
  }
  return { ok: true, id: String(id), name: obj?.theme?.name ?? obj?.name ?? name ?? '', reason: null }
}
