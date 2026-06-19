#!/usr/bin/env node
// theme-dev — single-theme preview. Reads .boldteq-theme-lock.json and runs `shopify theme dev`
// against the LOCKED store/theme: an ephemeral hot-reloading preview of the ONE theme, no second
// (staging/unpublished) theme created or managed. This is the preview surface for the workflow
// where the client runs one theme end-to-end, edited directly from VS Code.
//
// It also exists so the Lens visual pass has a URL to look at WITHOUT a staging theme: the local
// server `shopify theme dev` serves (default http://127.0.0.1:9292) IS the render Lens captures.
//
//   pnpm theme:dev                 start the hot-reload preview (foreground; Ctrl-C to stop)
//   pnpm theme:dev --print-url     print the local preview URL Lens should target, then exit
//                                  (for scripting:  THEME_PREVIEW_URL=$(pnpm -s theme:dev --print-url))
//
// Safe `shopify theme dev` flags pass through (--port, --theme-editor-sync, --path, etc.).
//
// Env: THEME_DEV_PORT (9292) · SHOPIFY_FLAG_STORE (overridden by the lock's store)
// Exit: 0 = clean exit · 1 = blocked (lock missing/invalid) · 2 = env error (no CLI)

import { spawnSync } from 'node:child_process'
import { LOCK_FILE, readLock, lockShapeErrors, cliAvailable } from './lib/shopify-theme-lock.mjs'

const cwd = process.cwd()
const die = (code, msg) => { console.error(`theme-dev: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

const PORT = process.env.THEME_DEV_PORT || '9292'
const LOCAL_URL = `http://127.0.0.1:${PORT}`

const argv = process.argv.slice(2)
if (argv.includes('--print-url')) { console.log(LOCAL_URL); process.exit(0) }
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node shopify-theme-dev.mjs [--print-url] [safe `shopify theme dev` flags]')
  process.exit(0)
}

const lock = (() => { try { return readLock(cwd) } catch (e) { die(2, `${LOCK_FILE} unreadable: ${e.message}`) } })()
if (!lock) die(1, `no ${LOCK_FILE} — run \`pnpm theme:link --store <handle> --theme <id> [--single]\` first.`)
const shapeErrs = lockShapeErrors(lock)
if (shapeErrs.length) die(1, `${LOCK_FILE} invalid: ${shapeErrs.join('; ')}`)

if (!cliAvailable()) die(2, 'shopify CLI not on PATH (npm install -g @shopify/cli@3)')

// Don't let a passthrough flag retarget the store/theme away from the lock.
const passthrough = []
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]; const key = a.includes('=') ? a.slice(0, a.indexOf('=')) : a
  if (['--store', '-s', '--theme', '-t'].includes(key)) die(1, `${key} is fixed by the lock (${lock.store} / theme ${lock.themeId}) — remove it.`)
  if (key === '--port') { /* keep but reflect into the printed URL note */ }
  passthrough.push(a)
}

const args = ['theme', 'dev', '--store', lock.store, '--theme', String(lock.themeId), ...passthrough]
console.log(`theme-dev: → ${lock.store} theme ${lock.themeId} "${lock.themeName}"${lock.singleTheme ? ' [single-theme]' : ''}`)
console.log(`  preview (Lens target):  ${LOCAL_URL}`)
console.log(`  to run the visual pass against it in another terminal:`)
console.log(`    THEME_PREVIEW_URL=${LOCAL_URL} pnpm lens`)
console.log(`  shopify ${args.join(' ')}\n`)
const run = spawnSync('shopify', args, { stdio: 'inherit', env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' } })
if (run.error) die(2, `failed to run shopify: ${run.error.message}`)
process.exit(run.status ?? 0)
