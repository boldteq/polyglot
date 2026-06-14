#!/usr/bin/env node
// theme-link — link a Shopify theme to this repo and LOCK it. Run once at project
// setup. After this, every `pnpm theme:push` targets the locked theme only;
// `--live` and any other theme/store are hard-blocked (shopify-theme-push.mjs / shopify-theme-guard.mjs).
//
// Usage:
//   node shopify-theme-link.mjs --store <handle> --theme <id>          lock an EXISTING theme
//   node shopify-theme-link.mjs --store <handle> --create --name "..." create an unpublished theme, then lock it
//   node shopify-theme-link.mjs --store <handle> --theme-name "..."    resolve id by exact name, then lock
//
// Refuses to lock the LIVE/published theme (role main|live) — the whole point is to
// never touch live. Refuses to overwrite an existing lock — use `pnpm theme:relink`.
//
// Env:  REPORT_DIR (default gate-reports)
// Out:  .boldteq-theme-lock.json + $REPORT_DIR/theme-lock.json
// Exit: 0 = locked · 1 = block (live theme / existing lock / theme not found) · 2 = env error (no CLI / unreachable)

import { writeReport } from './lib/report.mjs'
import {
  LOCK_FILE, readLock, writeLock, newLock, isLiveRole,
  listThemes, findTheme, pushUnpublished,
} from './lib/shopify-theme-lock.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const reportDir = process.env.REPORT_DIR || 'gate-reports'

function finish(code, { pass, blockers = [], warnings = [], evidence = {} }) {
  writeReport('theme-lock', 0, { cwd, pass, blockers, warnings, evidence, duration_ms: Date.now() - t0 }, reportDir)
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'LOCKED' : 'BLOCK'
  console.log(`theme-link: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  process.exit(code)
}
const block = (id, detail, evidence = {}) => finish(1, { pass: false, blockers: [{ id, page: LOCK_FILE, detail, evidence: '' }], evidence })
const envFail = (reason) => finish(2, { pass: false, evidence: { skipped: 'env', reason } })

function parseArgs(argv) {
  const out = { store: null, theme: null, themeName: null, create: false, name: null }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    const eq = a.indexOf('=')
    const val = eq !== -1 ? a.slice(eq + 1) : null
    const key = eq !== -1 ? a.slice(0, eq) : a
    const next = () => (val != null ? val : argv[++i])
    if (key === '--store' || key === '-s') out.store = next()
    else if (key === '--theme' || key === '-t') out.theme = next()
    else if (key === '--theme-name') out.themeName = next()
    else if (key === '--create') out.create = true
    else if (key === '--name') out.name = next()
    else if (key === '--help' || key === '-h') { out.help = true }
    else envFail(`unknown arg: ${a}`)
  }
  return out
}

const args = parseArgs(process.argv)
if (args.help) {
  console.log('Usage: node shopify-theme-link.mjs --store <handle> (--theme <id> | --create --name "..." | --theme-name "...")')
  process.exit(0)
}
if (!args.store) envFail('missing --store <handle>.myshopify.com')

// Refuse to clobber an existing lock — relinking is a deliberate, logged action.
const existing = readLock(cwd)
if (existing) {
  block('theme-lock.already-locked',
    `${LOCK_FILE} already locks theme ${existing.themeId} on ${existing.store}. To target a different theme, run \`pnpm theme:relink --store <h> --theme <id> --confirm\`.`,
    { existing: { store: existing.store, themeId: existing.themeId } })
}

// Resolve the theme: --create makes a fresh unpublished theme; otherwise look it up.
let resolved // { id, name, role }
if (args.create) {
  const created = pushUnpublished(args.store, args.name)
  if (!created.ok) envFail(created.reason)
  resolved = { id: created.id, name: created.name, role: 'unpublished' }
} else {
  if (!args.theme && !args.themeName) envFail('provide --theme <id>, --theme-name "...", or --create --name "..."')
  const list = listThemes(args.store)
  if (!list.ok) envFail(list.reason)
  const t = findTheme(list.themes, { themeId: args.theme, themeName: args.themeName })
  if (!t) {
    block('theme-lock.not-found',
      `no theme ${args.theme || `"${args.themeName}"`} on ${args.store}. Available: ${list.themes.map(x => `${x.id}:${x.name}[${x.role}]`).join(', ') || '(none)'}`)
  }
  resolved = t
}

// HARD REFUSAL: never lock the live theme.
if (isLiveRole(resolved.role)) {
  block('theme-lock.refuse-live',
    `refusing to lock the LIVE theme (${resolved.id} "${resolved.name}", role=${resolved.role}). Lock an unpublished/development working theme — pushes must never touch live.`,
    { themeId: resolved.id, role: resolved.role })
}

const lock = newLock({ store: args.store, themeId: resolved.id, themeName: resolved.name, role: resolved.role || 'unpublished' })
writeLock(cwd, lock)
console.log(`  locked theme ${lock.themeId} "${lock.themeName}" (role=${lock.role}) on ${lock.store}`)
finish(0, { pass: true, evidence: { store: lock.store, themeId: lock.themeId, themeName: lock.themeName, role: lock.role } })
