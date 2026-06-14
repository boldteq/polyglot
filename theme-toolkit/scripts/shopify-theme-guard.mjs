#!/usr/bin/env node
// theme-guard (Gate 0 — theme-lock) — asserts the repo's theme lock is present, valid,
// not pointed at the live theme, and consistent with the configured store. Registered in
// theme-gates.mjs so it runs in --static-only / full / --verify evidence; also run as a
// standalone publish-gate step (theme-publish.yml) with THEME_LOCK_REQUIRED=1.
//
// Default posture (dev / orchestrated static run): a MISSING lock is a warning (repo may be
// pre-link). A PRESENT-but-broken lock (bad shape, role=live, store mismatch) always BLOCKS.
//   THEME_LOCK_REQUIRED=1   missing lock becomes a BLOCKER (publish/CI).
//   THEME_LOCK_VERIFY_REMOTE=1  also verify via `shopify theme list` that the locked theme
//                               still exists and is still NOT live (needs CLI + store creds).
//
// Env:  REPORT_DIR (default gate-reports), SHOPIFY_FLAG_STORE (the configured store)
// Out:  $REPORT_DIR/theme-lock.json
// Exit: 0 = pass · 1 = block · 2 = env error

import { writeReport } from './lib/report.mjs'
import { LOCK_FILE, readLock, lockShapeErrors, isLiveRole, listThemes, findTheme } from './lib/shopify-theme-lock.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const reportDir = process.env.REPORT_DIR || 'gate-reports'
const REQUIRED = process.env.THEME_LOCK_REQUIRED === '1'
const VERIFY_REMOTE = process.env.THEME_LOCK_VERIFY_REMOTE === '1'
const configuredStore = process.env.SHOPIFY_FLAG_STORE || null

const blockers = []
const warnings = []
const add = (list, id, detail, evidence = '') => list.push({ id, page: LOCK_FILE, detail, evidence })

function finish(envError) {
  const pass = !envError && blockers.length === 0
  writeReport('theme-lock', 0, {
    cwd, pass, blockers, warnings,
    evidence: { required: REQUIRED, verifyRemote: VERIFY_REMOTE, configuredStore, reason: envError || undefined },
    duration_ms: Date.now() - t0,
  }, reportDir)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`theme-lock: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

let lock
try { lock = readLock(cwd) } catch (err) { finish(`${LOCK_FILE} is not valid JSON: ${err.message}`) }

if (!lock) {
  if (REQUIRED) add(blockers, 'theme-lock.missing', `no ${LOCK_FILE} — run \`pnpm theme:link\` to lock the target theme before publish.`)
  else add(warnings, 'theme-lock.missing', `no ${LOCK_FILE} yet — run \`pnpm theme:link --store <handle> --theme <id>\` before any \`pnpm theme:push\`.`)
  finish(null)
}

const shapeErrs = lockShapeErrors(lock)
if (shapeErrs.length) {
  add(blockers, 'theme-lock.invalid', `${LOCK_FILE} invalid: ${shapeErrs.join('; ')}`)
  finish(null)
}

if (isLiveRole(lock.role)) {
  add(blockers, 'theme-lock.live-target', `lock points at the LIVE theme (${lock.themeId} role=${lock.role}) — pushes must never target live. Re-link to an unpublished theme.`)
}
if (configuredStore && lock.store !== configuredStore) {
  add(blockers, 'theme-lock.store-mismatch', `configured store ${configuredStore} ≠ locked store ${lock.store} — refusing to operate on a store other than the linked one.`)
}

if (VERIFY_REMOTE) {
  const list = listThemes(lock.store)
  if (!list.ok) {
    add(warnings, 'theme-lock.remote-unverified', `could not verify the locked theme on ${lock.store}: ${list.reason}`)
  } else {
    const t = findTheme(list.themes, { themeId: lock.themeId })
    if (!t) add(blockers, 'theme-lock.theme-gone', `locked theme ${lock.themeId} no longer exists on ${lock.store} — re-link.`)
    else if (isLiveRole(t.role)) add(blockers, 'theme-lock.now-live', `locked theme ${lock.themeId} is now the LIVE theme on ${lock.store} — pushes would hit live. Re-link to an unpublished theme.`)
  }
}

finish(null)
