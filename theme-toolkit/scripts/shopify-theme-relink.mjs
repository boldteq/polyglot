#!/usr/bin/env node
// theme-relink — the ONLY way to re-target the lock to a different theme/store ("until I
// say update a diff theme"). Deliberate by design: requires --confirm, archives the prior
// lock into history[], and appends an audit line to CHANGES.md.
//
// Usage:
//   node shopify-theme-relink.mjs --store <handle> --theme <id> --confirm
//   node shopify-theme-relink.mjs --store <handle> --theme-name "..." --confirm
//   node shopify-theme-relink.mjs --store <handle> --create --name "..." --confirm
//
// Without --confirm it refuses. Refuses to relink to the LIVE theme (role main|live).
//
// Env:  REPORT_DIR (default gate-reports)
// Out:  rewrites .boldteq-theme-lock.json (prior → history[]) + appends CHANGES.md + $REPORT_DIR/theme-lock.json
// Exit: 0 = relinked · 1 = block (no --confirm / live theme / not found) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
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
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'RELINKED' : 'BLOCK'
  console.log(`theme-relink: ${label} — ${blockers.length} blocker(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  process.exit(code)
}
const block = (id, detail) => finish(1, { pass: false, blockers: [{ id, page: LOCK_FILE, detail, evidence: '' }] })
const envFail = (reason) => finish(2, { pass: false, evidence: { skipped: 'env', reason } })

function parseArgs(argv) {
  const out = { store: null, theme: null, themeName: null, create: false, name: null, confirm: false, changes: 'CHANGES.md' }
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
    else if (key === '--confirm') out.confirm = true
    else if (key === '--changes') out.changes = next()
    else if (key === '--help' || key === '-h') out.help = true
    else envFail(`unknown arg: ${a}`)
  }
  return out
}

const args = parseArgs(process.argv)
if (args.help) {
  console.log('Usage: node shopify-theme-relink.mjs --store <handle> (--theme <id> | --theme-name "..." | --create --name "...") --confirm')
  process.exit(0)
}
if (!args.store) envFail('missing --store <handle>.myshopify.com')
if (!args.confirm) {
  block('theme-lock.relink-unconfirmed',
    `re-targeting the lock is deliberate — re-run with --confirm. This will repoint every \`pnpm theme:push\` to the new theme.`)
}

const prior = readLock(cwd) // may be null (relink can also bootstrap a lock)

let resolved
if (args.create) {
  const created = pushUnpublished(args.store, args.name)
  if (!created.ok) envFail(created.reason)
  resolved = { id: created.id, name: created.name, role: 'unpublished' }
} else {
  if (!args.theme && !args.themeName) envFail('provide --theme <id>, --theme-name "...", or --create --name "..."')
  const list = listThemes(args.store)
  if (!list.ok) envFail(list.reason)
  const t = findTheme(list.themes, { themeId: args.theme, themeName: args.themeName })
  if (!t) block('theme-lock.not-found', `no theme ${args.theme || `"${args.themeName}"`} on ${args.store}. Available: ${list.themes.map(x => `${x.id}:${x.name}[${x.role}]`).join(', ') || '(none)'}`)
  resolved = t
}

if (isLiveRole(resolved.role)) {
  block('theme-lock.refuse-live', `refusing to relink to the LIVE theme (${resolved.id} role=${resolved.role}). Pick an unpublished/development working theme.`)
}

const history = Array.isArray(prior?.history) ? prior.history.slice() : []
if (prior) {
  history.push({ store: prior.store, themeId: prior.themeId, themeName: prior.themeName, role: prior.role, lockedAt: prior.lockedAt, relinkedAt: new Date().toISOString() })
}
const lock = newLock({ store: args.store, themeId: resolved.id, themeName: resolved.name, role: resolved.role || 'unpublished', history })
writeLock(cwd, lock)

// Audit trail in CHANGES.md (checked item — passes the changes-list validator).
const changesPath = path.resolve(cwd, args.changes)
const line = `- [x] ${new Date().toISOString().slice(0, 10)} theme:relink — ${prior ? `${prior.store} theme ${prior.themeId}` : '(no prior lock)'} → ${lock.store} theme ${lock.themeId} "${lock.themeName}" (role ${lock.role}) — Yash-confirmed`
let changesNote = 'CHANGES.md not found — relink not logged there'
if (fs.existsSync(changesPath)) {
  const body = fs.readFileSync(changesPath, 'utf-8')
  const sep = body.endsWith('\n') ? '' : '\n'
  const header = body.includes('## Theme Relink Log') ? '' : '\n## Theme Relink Log\n'
  fs.writeFileSync(changesPath, `${body}${sep}${header}${line}\n`)
  changesNote = `appended to ${args.changes}`
}

console.log(`  relinked → theme ${lock.themeId} "${lock.themeName}" (role=${lock.role}) on ${lock.store}; ${changesNote}`)
finish(0, { pass: true, evidence: { store: lock.store, themeId: lock.themeId, role: lock.role, priorThemeId: prior?.themeId || null, changes: changesNote } })
