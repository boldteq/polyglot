#!/usr/bin/env node
// theme-push — the ONLY sanctioned `shopify theme push`. Reads .boldteq-theme-lock.json
// and forces `--store <locked> --theme <locked>` on every push. Hard-refuses `--live`,
// `--unpublished`, `--development`, and any caller --store/--theme that differs from the
// lock. Safe flags (--only/--ignore/--nodelete/--json/--path/--force/--verbose) pass through.
//
// Usage:
//   node shopify-theme-push.mjs [safe shopify-theme-push flags]
//   node shopify-theme-push.mjs --only templates/index.json --nodelete
//
// Exit: 0 = pushed (CLI exit 0) · 1 = blocked (lock missing / live / mismatch) or CLI failure · 2 = env error

import { spawnSync } from 'node:child_process'
import { LOCK_FILE, readLock, lockShapeErrors, isLiveRole, cliAvailable } from './lib/shopify-theme-lock.mjs'

const cwd = process.cwd()
const die = (code, msg) => { console.error(`theme-push: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

const lock = (() => {
  try { return readLock(cwd) } catch (err) { die(2, `${LOCK_FILE} unreadable: ${err.message}`) }
})()
if (!lock) die(1, `no ${LOCK_FILE} — run \`pnpm theme:link --store <handle> --theme <id>\` before pushing.`)
const shapeErrs = lockShapeErrors(lock)
if (shapeErrs.length) die(1, `${LOCK_FILE} invalid: ${shapeErrs.join('; ')}`)
if (isLiveRole(lock.role)) die(1, `${LOCK_FILE} points at the LIVE theme (role=${lock.role}) — never push to live. Re-link to an unpublished theme.`)

// Selection flags that would retarget away from the lock — rejected outright.
const FORBIDDEN = new Set(['--live', '-l', '--unpublished', '-u', '--development', '-d'])

const passthrough = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  const eq = a.indexOf('=')
  const key = eq !== -1 ? a.slice(0, eq) : a
  const inlineVal = eq !== -1 ? a.slice(eq + 1) : null
  if (FORBIDDEN.has(key)) {
    die(1, `flag ${key} conflicts with the lock — every push goes to the locked theme ${lock.themeId} on ${lock.store}. To target a different theme: \`pnpm theme:relink --confirm\`.`)
  } else if (key === '--store' || key === '-s') {
    const val = inlineVal != null ? inlineVal : argv[++i]
    if (val !== lock.store) die(1, `--store ${val} ≠ locked store ${lock.store}.`)
  } else if (key === '--theme' || key === '-t') {
    const val = inlineVal != null ? inlineVal : argv[++i]
    if (String(val) !== String(lock.themeId)) die(1, `--theme ${val} ≠ locked theme ${lock.themeId}.`)
  } else {
    passthrough.push(a)
  }
}

if (!cliAvailable()) die(2, 'shopify CLI not on PATH (npm install -g @shopify/cli@3)')

const finalArgs = ['theme', 'push', '--store', lock.store, '--theme', String(lock.themeId), ...passthrough]
console.log(`theme-push: → ${lock.store} theme ${lock.themeId} "${lock.themeName}" (role=${lock.role})`)
console.log(`  shopify ${finalArgs.join(' ')}`)
const run = spawnSync('shopify', finalArgs, { stdio: 'inherit', env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' } })
if (run.error) die(2, `failed to run shopify: ${run.error.message}`)
process.exit(run.status ?? 1)
