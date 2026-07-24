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

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { LOCK_FILE, readLock, lockShapeErrors, isSingleThemeLock, lockTargetsLiveUnsafely, cliAvailable } from './lib/shopify-theme-lock.mjs'

const cwd = process.cwd()
const die = (code, msg) => { console.error(`theme-push: ${code === 2 ? 'ENV-ERROR' : 'BLOCK'} — ${msg}`); process.exit(code) }

// THEME_PUSH_ALLOW_STALE=1 drops every publish precondition (gate freshness, Lens, CHANGES completeness)
// — the biggest bypass in the pipeline. It must leave a RECORD, not vanish silently: a `## Waivers`
// section in CHANGES.md with at least one bullet. Same shape as theme-gates.mjs changesWaives(); kept
// local since this script imports no shared helper. Reads CHANGES.md relative to cwd (repo root), like below.
// CHANGES.md `## Waivers` reader + durable waiver logger — shared with theme-gates' waiver check so a
// bypass is validated + recorded the same way everywhere (lib/waivers.mjs).
import { readWaiverText, changesHasWaiver, logWaiver } from './lib/waivers.mjs'

const lock = (() => {
  try { return readLock(cwd) } catch (err) { die(2, `${LOCK_FILE} unreadable: ${err.message}`) }
})()
if (!lock) die(1, `no ${LOCK_FILE} — run \`pnpm theme:link --store <handle> --theme <id>\` before pushing.`)
const shapeErrs = lockShapeErrors(lock)
if (shapeErrs.length) die(1, `${LOCK_FILE} invalid: ${shapeErrs.join('; ')}`)
if (lockTargetsLiveUnsafely(lock)) die(1, `${LOCK_FILE} points at the LIVE theme (role=${lock.role}) — never push to live. Re-link to an unpublished theme, or \`pnpm theme:link --single\` if this client intentionally runs one theme.`)

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

// ── publish precondition: gates must FRESHLY + FULLY pass at the pushed SHA ──
// The ONLY sanctioned proof a build is shippable is `theme-gates.mjs --verify --require-full`
// exiting 0: a full orchestrator run whose summary.json is at HEAD, dirty=false, every gate
// passed, no unjustified waiver, and no per-gate report at a drifting sha. Reading individual
// gate-report JSONs is NOT proof — the Stride dogfood (2026-06-19) had 7 reports at 3 different
// SHAs with no aggregate, so a now-clean build looked blocked and a never-coherent tree looked
// shippable. This is the missing line that binds publish to coherent fresh evidence.
if (process.env.THEME_PUSH_ALLOW_STALE === '1') {
  // The bypass is only legitimate WITH a recorded reason. Refuse it when CHANGES.md has no `## Waivers`
  // entry — today it drops every precondition and leaves no trace, which is exactly how an unverified
  // build ships and nobody can say why.
  if (!changesHasWaiver()) die(1, 'THEME_PUSH_ALLOW_STALE=1 drops every publish precondition (gate freshness, Lens, CHANGES completeness) but CHANGES.md has no `## Waivers` section with a bullet. Add a `## Waivers` heading with at least one `- ` entry naming why this publish bypasses the gates, or run `pnpm gates` at HEAD instead of bypassing.')
  logWaiver('THEME_PUSH_ALLOW_STALE', readWaiverText())
  console.warn('theme-push: ⚠ THEME_PUSH_ALLOW_STALE=1 — gate-freshness/Lens/CHANGES checks SKIPPED (justified + logged to gate-reports/waivers.jsonl). This is still an UNVERIFIED publish.')
} else {
  // ── eyes-on precondition: run the Lens visual pass so the RENDERED page was actually looked at ──
  // The #1 root cause of "gates green but the store looks broken" is that the eyes were optional:
  // the gate orchestrator's #18 (visual-truth) only READS gate-reports/lens/, it never PRODUCES it,
  // so publish-grade runs block on absent Lens evidence with no integrated way to generate it. This
  // step makes Lens MANDATORY + automatic on every publish: capture the live preview, vision-judge
  // every frame, enforce. Set THEME_PUSH_SKIP_LENS=1 only with a CHANGES.md ## Waivers entry.
  if (process.env.THEME_PUSH_SKIP_LENS === '1') {
    // P3.4: SKIP_LENS bypasses the ONLY check that looks at the rendered pixels — it must be as guarded
    // as ALLOW_STALE (was a bare warning). Refuse it without a recorded reason, and log the waiver.
    if (!changesHasWaiver()) die(1, 'THEME_PUSH_SKIP_LENS=1 skips the Lens visual pass — the only gate that looks at the RENDERED page — but CHANGES.md has no `## Waivers` section with a bullet. Add a `## Waivers` heading with a `- ` entry naming why this publish ships without looking at the pixels, or start the preview (`pnpm theme:dev`) and run with THEME_PREVIEW_URL=<url> instead.')
    logWaiver('THEME_PUSH_SKIP_LENS', readWaiverText())
    console.warn('theme-push: ⚠ THEME_PUSH_SKIP_LENS=1 — Lens visual pass SKIPPED (justified + logged to gate-reports/waivers.jsonl). The rendered page was NOT looked at.')
  } else {
    const previewUrl = process.env.THEME_PREVIEW_URL || process.env.LENS_PREVIEW_URL || null
    if (!previewUrl) {
      die(1, 'Lens visual check requires a preview URL but none is set. Start the single-theme preview (`pnpm theme:dev` → copy the URL), then run with THEME_PREVIEW_URL=<url>. (Emergency override: THEME_PUSH_SKIP_LENS=1 + a CHANGES.md ## Waivers entry — publishes WITHOUT looking at the rendered page.)')
    }
    const lensEnv = { ...process.env, THEME_PREVIEW_URL: previewUrl, LENS_REQUIRE: '1', REPORT_DIR: 'gate-reports' }
    const steps = [
      ['lens-capture.mjs', 'capture'],
      ['lens-judge.mjs', 'vision-judge'],
      ['check-visual-truth.mjs', 'enforce'],
    ]
    for (const [script, label] of steps) {
      const s = fileURLToPath(new URL(`./${script}`, import.meta.url))
      console.log(`theme-push: Lens ${label} → ${previewUrl}`)
      const r = spawnSync(process.execPath, [s], { cwd, stdio: 'inherit', env: lensEnv })
      if (r.error) die(2, `Lens ${label} failed to run: ${r.error.message}`)
      if ((r.status ?? 1) !== 0) {
        die(1, `Lens ${label} BLOCKED publish — the rendered page has a visual defect (see gate-reports/lens/). Fix it (or \`pnpm lens:autofix\`) and re-push. Static gates can be green while the page looks broken; this is the pixels-actually-looked-right gate.`)
      }
    }
    console.log('theme-push: ✓ Lens visual pass PASSED (rendered page judged on real pixels)')
  }

  const gatesScript = fileURLToPath(new URL('./theme-gates.mjs', import.meta.url))
  const verify = spawnSync(process.execPath, [gatesScript, '--verify', '--require-full', '--report-dir', 'gate-reports'], { cwd, stdio: 'inherit', env: { ...process.env } })
  if (verify.error) die(2, `failed to run gate verify: ${verify.error.message}`)
  if ((verify.status ?? 1) !== 0) {
    die(1, 'gate evidence is stale, partial, mixed-SHA, or failing — run `pnpm gates` (full static sweep) at HEAD so `theme-gates.mjs --verify --require-full` exits 0 before publishing. Individual gate-report JSONs are NOT ship evidence. (Emergency override: THEME_PUSH_ALLOW_STALE=1 + a CHANGES.md ## Waivers entry.)')
  }
  console.log('theme-push: ✓ gate evidence FRESH + FULL at HEAD (verify --require-full passed)')

  // CHANGES.md completeness (Plan P0 gap 8) — refuse publish on any unchecked `- [ ]` client ask.
  // The validator existed but was never wired to the publish path; an unchecked item could ship.
  const changesPath = fs.existsSync('CHANGES.md') ? 'CHANGES.md' : null
  if (changesPath) {
    const clScript = fileURLToPath(new URL('./check-changes-list.mjs', import.meta.url))
    const cl = spawnSync(process.execPath, [clScript, changesPath], { cwd, stdio: 'inherit', env: { ...process.env } })
    if ((cl.status ?? 1) !== 0) die(1, 'CHANGES.md has unchecked items — every `- [ ]` client ask must be `- [x]` (or waived in a ## Waivers entry) before publish.')
    console.log('theme-push: ✓ CHANGES.md complete')
  }
}

if (!cliAvailable()) die(2, 'shopify CLI not on PATH (npm install -g @shopify/cli@3)')

const finalArgs = ['theme', 'push', '--store', lock.store, '--theme', String(lock.themeId), ...passthrough]
console.log(`theme-push: → ${lock.store} theme ${lock.themeId} "${lock.themeName}" (role=${lock.role})`)
console.log(`  shopify ${finalArgs.join(' ')}`)
const run = spawnSync('shopify', finalArgs, { stdio: 'inherit', env: { ...process.env, SHOPIFY_CLI_NO_ANALYTICS: '1' } })
if (run.error) die(2, `failed to run shopify: ${run.error.message}`)
process.exit(run.status ?? 1)
