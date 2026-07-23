#!/usr/bin/env node
// check-post-publish — the T+0 storefront SMOKE (Atrium 8/18-step, Step 17). After theme:publish
// flips the theme live, verifyFlip confirms the theme IS live (role) — but not that the storefront
// actually SERVES. This catches a live-but-broken go-live immediately, instead of waiting for the
// lumen T+2h watch (up to 2h of a broken live store otherwise).
//
// Critical (BLOCK): the storefront returns 200, and the password page is OFF (a real go-live is open
// to shoppers — a / that lands on /password means it's not actually live to customers).
// Advisory (WARN): robots.txt + sitemap.xml reachable (SEO surface; not a go-live blocker).
//
// Pure `postPublishSmoke({ storeUrl, fetch })` (fetch injected → hermetic, no live store). The CLI
// reads the lock for the store domain and smokes https://<store>/.
//
// Usage:  node check-post-publish.mjs            (reads .boldteq-theme-lock.json for the store)
//         STORE_URL=https://x.myshopify.com node check-post-publish.mjs
// Exit: 0 = serving (critical pass) · 1 = broken live store (critical fail) · 2 = setup error

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'
import { readLock, lockShapeErrors, LOCK_FILE } from './lib/shopify-theme-lock.mjs'

const isPasswordPath = (u) => { try { return /\/password\/?$/.test(new URL(u).pathname) } catch { return false } }

// pure smoke — fetch injected. Returns { ok, critical, checks:[{name,ok,critical,detail}] }.
export async function postPublishSmoke({ storeUrl, fetch }) {
  const origin = storeUrl.replace(/\/+$/, '')
  const checks = []
  const add = (name, ok, critical, detail) => checks.push({ name, ok, critical, detail })

  // 1+2 — storefront serves + password off (one GET / does both)
  try {
    const res = await fetch(`${origin}/`)
    const status = res.status
    const finalUrl = res.url || `${origin}/`
    add('storefront-200', status >= 200 && status < 400, true, `GET / → ${status}`)
    add('password-off', !isPasswordPath(finalUrl), true, isPasswordPath(finalUrl) ? `/ redirects to ${new URL(finalUrl).pathname} — store is still password-protected (not live to shoppers)` : 'store is open')
  } catch (e) {
    add('storefront-200', false, true, `GET / failed: ${e.message}`)
    add('password-off', false, true, 'could not reach storefront')
  }

  // 3+4 — robots + sitemap (advisory)
  for (const [name, p] of [['robots', '/robots.txt'], ['sitemap', '/sitemap.xml']]) {
    try { const r = await fetch(`${origin}${p}`); add(name, r.status >= 200 && r.status < 400, false, `${p} → ${r.status}`) }
    catch (e) { add(name, false, false, `${p} failed: ${e.message}`) }
  }

  const critical = checks.filter(c => c.critical)
  const ok = critical.every(c => c.ok)
  return { ok, critical: critical.every(c => c.ok), checks }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const cwd = process.cwd()
  const reportDir = process.env.REPORT_DIR || 'gate-reports'
  const die = (code, msg) => { console.error(`post-publish: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

  let storeUrl = process.env.STORE_URL
  if (!storeUrl) {
    let lock
    try { lock = readLock(cwd) } catch (e) { die(2, `${LOCK_FILE} unreadable: ${e.message}`) }
    if (!lock || lockShapeErrors(lock).length) die(2, `no valid ${LOCK_FILE} and no STORE_URL — cannot resolve the storefront to smoke.`)
    storeUrl = lock.store.startsWith('http') ? lock.store : `https://${lock.store}`
  }

  const t0 = Date.now()
  const result = await postPublishSmoke({ storeUrl, fetch: globalThis.fetch })
  const blockers = result.checks.filter(c => c.critical && !c.ok).map(c => ({ id: `post-publish.${c.name}`, page: storeUrl, detail: c.detail, evidence: '' }))
  const warnings = result.checks.filter(c => !c.critical && !c.ok).map(c => ({ id: `post-publish.${c.name}`, page: storeUrl, detail: c.detail, evidence: '' }))
  writeReport('post-publish', 22, { cwd, pass: result.ok, blockers, warnings, url: storeUrl, evidence: { checks: result.checks }, duration_ms: Date.now() - t0 }, reportDir)

  console.log(`post-publish: ${result.ok ? 'PASS' : 'BLOCK'} — ${storeUrl}`)
  for (const c of result.checks) console.log(`  ${c.ok ? '✓' : c.critical ? '✗' : '⚠'} ${c.name}: ${c.detail}`)
  if (!result.ok) die(1, 'the live storefront is not serving correctly — investigate / roll back (mantle keeps a pre-publish snapshot).')
  process.exit(0)
}

if (isMain(import.meta.url)) main()
