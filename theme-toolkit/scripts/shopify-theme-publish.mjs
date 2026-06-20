#!/usr/bin/env node
// theme-publish — the last-mile FLIP (Atrium 8-step, Step 7). `shopify theme publish` flips the
// locked UNPUBLISHED [client]-dev theme to LIVE. Distinct from theme:push (`shopify theme push` =
// code update to the locked theme); this is the one-time go-live flip AFTER the build converged.
//
// It is the consumer the build pipeline was missing: maestro:build proves PUBLISH-READY and emits
// docs/publish-readiness.json, but nothing flipped the theme live. This does — behind the full
// safety chain, so it can NEVER publish an unfinished build or the wrong theme/store.
//
// Gate chain (ALL must pass, in order — early-block on the first failure):
//   1. lock present + valid + not live-unsafe (live role allowed ONLY in singleTheme mode)
//   2. no forbidden flag (--live/--unpublished/--development) + no --store/--theme ≠ lock
//   3. docs/publish-readiness.json exists AND publishReady === true   ← maestro:build's proof
//   4. CHANGES.md complete (check-changes-list.mjs exit 0) — if CHANGES.md exists
//   5. gate evidence fresh+full+passing at HEAD (theme-gates --verify --require-full) — this already
//      requires gate #18 (Lens visual-truth) pass; we TRUST that frozen evidence, we do NOT re-run
//      Lens (expensive; pixels didn't change between converge and flip)
//   6. shopify CLI present → `shopify theme publish --store <lock> --theme <lock> --force`
//   7. (opt-in / CI) post-flip health check: the locked theme is now role main|live
//
// The gate chain IS the speed-bump, so --force is default (hands-off autonomy). `--dry-run` runs the
// full chain and prints the exact flip command WITHOUT flipping — the safe preview.
//
// Usage:  node shopify-theme-publish.mjs [--dry-run]
// Env: BUILD_STATE_DIR (docs) · THEME_PUBLISH_VERIFY_REMOTE=1 (post-flip health check; default on in CI)
// Exit: 0 = published (or dry-run ok) · 1 = blocked (precondition failed) · 2 = env/setup error

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  LOCK_FILE, readLock, lockShapeErrors, lockTargetsLiveUnsafely,
  isSingleThemeLock, isLiveRole, cliAvailable, listThemes, findTheme,
} from './lib/shopify-theme-lock.mjs'
import { postPublishSmoke } from './check-post-publish.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CL_SCRIPT = path.join(HERE, 'check-changes-list.mjs')
const GATES_SCRIPT = path.join(HERE, 'theme-gates.mjs')
const FORBIDDEN = new Set(['--live', '-l', '--unpublished', '-u', '--development', '-d'])

function gitHeadReal(dir) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch { return null }
}

// ── pure orchestration (spawn + gitHead injected → hermetically testable, no live store/CLI/git) ──
// Returns { ok, blocked, reason, code, finalArgs, store, themeId, role, themeName, lock }.
export function publishPlan({ dir, argv = [], env = {}, spawn, gitHead = gitHeadReal }) {
  const readinessDir = env.BUILD_STATE_DIR || 'docs'
  const block = (reason, code = 1) => ({ ok: false, blocked: true, reason, code, finalArgs: null })

  // 1. lock
  let lock
  try { lock = readLock(dir) } catch (e) { return block(`${LOCK_FILE} unreadable: ${e.message}`, 2) }
  if (!lock) return block(`no ${LOCK_FILE} — link the theme first (\`pnpm theme:link\`)`, 1)
  const errs = lockShapeErrors(lock)
  if (errs.length) return block(`${LOCK_FILE} invalid: ${errs.join('; ')}`, 1)
  if (lockTargetsLiveUnsafely(lock)) {
    return block(`${LOCK_FILE} targets the LIVE theme (role=${lock.role}) without single-theme mode — refusing to "publish" a theme that is already live / unsafe.`, 1)
  }

  // 2. forbidden / mismatch flags
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const eq = a.indexOf('=')
    const key = eq !== -1 ? a.slice(0, eq) : a
    const inline = eq !== -1 ? a.slice(eq + 1) : null
    if (FORBIDDEN.has(key)) return block(`flag ${key} conflicts with the publish flip — it targets the locked theme ${lock.themeId} on ${lock.store} only.`, 1)
    if (key === '--store' || key === '-s') { const v = inline != null ? inline : argv[++i]; if (v !== lock.store) return block(`--store ${v} ≠ locked store ${lock.store}.`, 1) }
    if (key === '--theme' || key === '-t') { const v = inline != null ? inline : argv[++i]; if (String(v) !== String(lock.themeId)) return block(`--theme ${v} ≠ locked theme ${lock.themeId}.`, 1) }
  }

  // 3. publish-readiness — maestro:build's PUBLISH-READY proof
  const rp = path.resolve(dir, readinessDir, 'publish-readiness.json')
  if (!fs.existsSync(rp)) return block(`no ${readinessDir}/publish-readiness.json — run \`pnpm maestro:build\` to prove PUBLISH-READY (loop converged AND full gate stack passed) before publishing.`, 1)
  let readiness
  try { readiness = JSON.parse(fs.readFileSync(rp, 'utf-8')) } catch (e) { return block(`${readinessDir}/publish-readiness.json invalid JSON: ${e.message}`, 1) }
  // a non-object (null / number / array — JSON.parse succeeds on these) must BLOCK cleanly, not crash
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness)) {
    return block(`${readinessDir}/publish-readiness.json must be a JSON object (got ${Array.isArray(readiness) ? 'array' : readiness === null ? 'null' : typeof readiness}) — re-run \`pnpm maestro:build\`.`, 1)
  }
  if (readiness.publishReady !== true) {
    return block(`NOT PUBLISH-READY — maestro:build stopped at stage "${readiness.stage || 'unknown'}" (${readiness.reason || 'no reason recorded'}). Resolve it + re-run \`pnpm maestro:build\`.`, 1)
  }
  // freshness: the PUBLISH-READY proof must be at HEAD — defeats a stale or BUILD_STATE_DIR-redirected
  // artifact from a prior converged build (gate-freshness is sha-bound; this binds the loop proof too).
  const head = gitHead(dir)
  if (readiness.sha && head && readiness.sha !== head) {
    return block(`publish-readiness.json was produced at ${String(readiness.sha).slice(0, 7)} ≠ HEAD ${head.slice(0, 7)} — the build is stale; re-run \`pnpm maestro:build\` at HEAD.`, 1)
  }

  // 4. CHANGES.md completeness — MANDATORY at publish (absence is not proof of completeness; for a
  // client theme it means no asks were tracked). A truly no-asks build needs an explicit CHANGES.md
  // with a ## Waivers note, never a missing file.
  if (!fs.existsSync(path.resolve(dir, 'CHANGES.md'))) {
    return block('CHANGES.md is required at publish — every client ask must be tracked (`- [ ]`/`- [x]`, or waived in ## Waivers). Create it before publishing.', 1)
  }
  const cl = spawn('node', [CL_SCRIPT, 'CHANGES.md'], { cwd: dir, stdio: 'inherit', env: { ...process.env, ...env } })
  if ((cl.status ?? 1) !== 0) return block('CHANGES.md has unchecked items — every `- [ ]` client ask must be `- [x]` (or waived in ## Waivers) before publish.', 1)

  // 5. gate freshness — full stack fresh+passing at HEAD (already includes Lens #18; not re-run here)
  const gv = spawn('node', [GATES_SCRIPT, '--verify', '--require-full', '--report-dir', 'gate-reports'], { cwd: dir, stdio: 'inherit', env: { ...process.env, ...env } })
  if ((gv.status ?? 1) !== 0) {
    return block('gate evidence is stale, partial, mixed-SHA, or failing — run `pnpm gates` (full sweep) at HEAD so `theme-gates --verify --require-full` exits 0 before publishing.', 1)
  }

  return {
    ok: true, blocked: false, reason: null, code: 0,
    store: lock.store, themeId: String(lock.themeId), role: lock.role, themeName: lock.themeName, lock,
    finalArgs: ['theme', 'publish', '--store', lock.store, '--theme', String(lock.themeId), '--force'],
  }
}

// ── post-flip health check (pure; listThemes injected → testable) ────────────────────────────────
// After `shopify theme publish`, confirm the flip actually took. Catches a silent Shopify no-op.
export function verifyFlip({ lock, listThemes: list }) {
  if (isSingleThemeLock(lock) && isLiveRole(lock.role)) return { ok: true, reason: 'singleTheme already live — no flip to verify' }
  const res = list(lock.store)
  if (!res.ok) return { ok: true, reason: `could not verify remotely (${res.reason}) — flip reported success`, soft: true }
  const t = findTheme(res.themes, { themeId: lock.themeId })
  if (!t) return { ok: false, reason: `locked theme ${lock.themeId} not found on ${lock.store} after publish` }
  if (!isLiveRole(t.role)) return { ok: false, reason: `published exit 0 but theme ${lock.themeId} is still role=${t.role}, not live — investigate (silent Shopify no-op?)` }
  return { ok: true, reason: `confirmed live (role=${t.role})` }
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const die = (code, msg) => { console.error(`theme-publish: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }
  const rawArgv = process.argv.slice(2)
  const dryRun = rawArgv.includes('--dry-run')
  const argv = rawArgv.filter(a => a !== '--dry-run')

  const plan = publishPlan({ dir: process.cwd(), argv, env: process.env, spawn: spawnSync })
  if (plan.blocked) die(plan.code, plan.reason)

  console.log(`theme-publish: → FLIP ${plan.store} theme ${plan.themeId} "${plan.themeName}" (role=${plan.role}) to LIVE`)
  console.log(`  shopify ${plan.finalArgs.join(' ')}`)
  if (dryRun) { console.log('theme-publish: ✓ --dry-run — all preconditions PASSED; NOT flipping.'); process.exit(0) }

  if (!cliAvailable()) die(2, 'shopify CLI not on PATH (npm install -g @shopify/cli@3)')
  const run = spawnSync('shopify', plan.finalArgs, { stdio: 'inherit', env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' } })
  if (run.error) die(2, `failed to run shopify: ${run.error.message}`)
  if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1)

  if (process.env.THEME_PUBLISH_VERIFY_REMOTE === '1') {
    const v = verifyFlip({ lock: plan.lock, listThemes })
    if (!v.ok) die(1, v.reason)
    // soft = the flip CLI exited 0 but we could NOT remotely confirm it (auth blip / rate-limit /
    // network). The whole point of opt-in verify is proof — never print a confident success here.
    if (v.soft) {
      console.error(`theme-publish: WARN — the flip ran (CLI exit 0) but could NOT be remotely confirmed (${v.reason}). Confirm live status via \`pnpm maestro:status\` / the Shopify admin.`)
      process.exit(3)
    }
    console.log(`theme-publish: health check — ${v.reason}`)
  }

  // T+0 storefront smoke (Step 17): the theme is live — does the storefront actually SERVE? Catches a
  // live-but-broken go-live now, not at the lumen T+2h watch. Additive (post-flip), behind the same
  // remote-verify opt-in; never changes the publish DECISION chain above.
  if (process.env.THEME_PUBLISH_VERIFY_REMOTE === '1' && process.env.THEME_PUBLISH_SKIP_SMOKE !== '1') {
    const storeUrl = plan.lock.store.startsWith('http') ? plan.lock.store : `https://${plan.lock.store}`
    const sm = await postPublishSmoke({ storeUrl, fetch: globalThis.fetch })
    for (const c of sm.checks) console.log(`  ${c.ok ? '✓' : c.critical ? '✗' : '⚠'} smoke ${c.name}: ${c.detail}`)
    if (!sm.ok) {
      console.error('theme-publish: WARN — the theme flipped LIVE but the storefront smoke FAILED (live-but-broken). Investigate / roll back (mantle keeps a pre-publish snapshot).')
      process.exit(3)
    }
  }
  console.log('theme-publish: ✓ published (live)')
  process.exit(0)
}

// run as CLI only (importable for tests without side effects)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
