#!/usr/bin/env node
// maestro:preflight — the READINESS GATE both Maestro drivers (maestro-run.mjs CLI + wf-maestro-loop.mjs
// Workflow) must clear before a hands-off run. Both share one unguarded precondition set — discovery +
// bootstrap done, theme linked, build-state seeded, a live preview for Lens, the consultant binary on
// PATH. If any is missing an overnight run face-plants at 2am with no actionable message. This gate
// turns that into a single READY / NOT-READY verdict with the EXACT fix command per missing precondition,
// so the run either confirms it's safe to go or fails fast with the checklist.
//
// Read-only (a gate never mutates). Every external probe (preview reachability, shopify CLI, claude CLI)
// is injectable so the whole gate is proven hermetically by __fixtures__/maestro-preflight (no network,
// no CLIs). Node 20 ESM, no external deps. setTimeout is used for the probe timeout (allowed); no
// Date.now()/Math.random().
//
// Usage:
//   node maestro-preflight.mjs                         # driver=cli, render=dev (default)
//   node maestro-preflight.mjs --render push           # no live preview required
//   node maestro-preflight.mjs --driver workflow       # consultant runs as an agent, not claude CLI
//   THEME_PREVIEW_URL=http://127.0.0.1:9292 node maestro-preflight.mjs --json
// Exit: 0 = READY (every hard precondition met) · 1 = NOT-READY (≥1 missing) · 2 = usage error.

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readLock, lockShapeErrors, cliAvailable, LOCK_FILE } from './lib/shopify-theme-lock.mjs'

// ── default real probes (overridable for tests) ─────────────────────────────────
// GET the preview URL; resolve true on any HTTP response, false on error/timeout. Never throws.
export function defaultProbe(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    let req
    try {
      const lib = url.startsWith('https:') ? https : http
      req = lib.get(url, (res) => { res.resume(); finish(res.statusCode != null) })
    } catch { return finish(false) }
    req.on('error', () => finish(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); finish(false) })
  })
}

export function defaultClaudeAvailable() {
  try {
    const r = spawnSync('claude', ['--version'], { encoding: 'utf-8', timeout: 30_000 })
    return !r.error && (r.status ?? 1) === 0
  } catch { return false }
}

const readJson = (p) => { try { return { ok: true, value: JSON.parse(fs.readFileSync(p, 'utf-8')) } } catch (e) { return { ok: false, error: e } } }
const exists = (p) => { try { return fs.existsSync(p) } catch { return false } }

// ── the gate ────────────────────────────────────────────────────────────────────
export async function preflight(opts = {}) {
  const {
    dir = process.cwd(),
    env = process.env,
    renderMode = 'dev',       // 'dev' needs a reachable preview · 'push' does not
    driver = 'cli',           // 'cli' (maestro-run → needs claude) · 'workflow' (wf-maestro-loop → agent)
    goalsFile = 'docs/discovery/goals.json',
    dsFile = 'docs/design/design-system.json',
    buildStateFile = 'docs/build-state.json',
    previewUrl = env.THEME_PREVIEW_URL || env.LENS_PREVIEW_URL || null,
    probe = defaultProbe,
    cliCheck = cliAvailable,
    claudeCheck = defaultClaudeAvailable,
  } = opts

  const checks = []
  const add = (c) => checks.push({ soft: false, detail: '', fix: '', ...c })

  // 1 — discovery (#0.4): goals.json present + parseable
  {
    const p = path.resolve(dir, goalsFile)
    const r = exists(p) ? readJson(p) : { ok: false, error: new Error('missing') }
    add({ id: 'discovery', label: 'Discovery goals (#0.4)', ok: r.ok,
      detail: r.ok ? goalsFile : `${goalsFile} ${exists(p) ? 'unparseable' : 'missing'}`,
      fix: 'run discovery → goals.json (`pnpm check:discovery` to verify)' })
  }

  // 2 — bootstrap (#0.5): design-system.json present + parseable
  {
    const p = path.resolve(dir, dsFile)
    const r = exists(p) ? readJson(p) : { ok: false, error: new Error('missing') }
    add({ id: 'bootstrap', label: 'Design system (#0.5)', ok: r.ok,
      detail: r.ok ? dsFile : `${dsFile} ${exists(p) ? 'unparseable' : 'missing'}`,
      fix: 'drape authors design-system.json (`pnpm check:bootstrap` to verify)' })
  }

  // 3 — theme lock: linked + valid shape (theme:dev/push target)
  {
    let ok = false, detail = `${LOCK_FILE} missing`
    try {
      const lock = readLock(dir)
      if (!lock) { ok = false; detail = `${LOCK_FILE} missing` }
      else {
        const errs = lockShapeErrors(lock)
        ok = errs.length === 0
        detail = ok ? `${lock.store} theme ${lock.themeId}${lock.singleTheme ? ' [single-theme]' : ''}` : `${LOCK_FILE} invalid: ${errs.join('; ')}`
      }
    } catch (e) { ok = false; detail = `${LOCK_FILE} unreadable: ${e.message}` }
    add({ id: 'theme-lock', label: 'Theme link', ok, detail,
      fix: 'pnpm theme:link --store <handle> --theme <id> --single' })
  }

  // 4 — build-state: seeded with ≥1 surface (the loop iterates these)
  {
    const p = path.resolve(dir, buildStateFile)
    const r = exists(p) ? readJson(p) : { ok: false }
    const surfaces = r.ok && Array.isArray(r.value?.surfaces) ? r.value.surfaces : []
    const ok = surfaces.length > 0
    const todo = surfaces.filter(s => s.status !== 'done').map(s => s.surface)
    add({ id: 'build-state', label: 'Build-state surfaces', ok,
      detail: ok ? `${surfaces.length} surface(s)${todo.length ? `, ${todo.length} todo: ${todo.join(', ')}` : ' (all done)'}` : `${buildStateFile} missing/empty`,
      fix: 'pnpm build-state init' })
  }

  // 5 — shopify CLI on PATH (needed to serve theme:dev AND to theme:push)
  {
    let ok = false
    try { ok = !!cliCheck() } catch { ok = false }
    add({ id: 'shopify-cli', label: 'Shopify CLI', ok,
      detail: ok ? 'on PATH' : 'not on PATH',
      fix: 'npm install -g @shopify/cli@3' })
  }

  // 6 — preview reachability (dev render only)
  if (renderMode === 'push') {
    add({ id: 'preview', label: 'Live preview', ok: true, detail: 'render=push — no live preview required' })
  } else {
    let ok = false, detail = 'THEME_PREVIEW_URL not set'
    if (previewUrl) {
      try { ok = !!(await probe(previewUrl)) } catch { ok = false }
      detail = ok ? `${previewUrl} reachable` : `${previewUrl} unreachable`
    }
    add({ id: 'preview', label: 'Live preview', ok, detail,
      fix: 'start `pnpm theme:dev`, then export THEME_PREVIEW_URL=$(pnpm -s theme:dev --print-url)' })
  }

  // 7 — consultant binary (cli driver only; the workflow driver uses an agent, not the claude CLI)
  if (driver === 'cli') {
    let ok = false
    try { ok = !!claudeCheck() } catch { ok = false }
    add({ id: 'consultant', label: 'Consultant (claude CLI)', ok,
      detail: ok ? 'on PATH' : 'claude not on PATH',
      fix: 'install the claude CLI (the cli driver shells `claude -p` for each draft) — or use --driver workflow' })
  } else {
    add({ id: 'consultant', label: 'Consultant (agent)', ok: true, detail: 'driver=workflow — drafts run as agents' })
  }

  const ready = checks.every(c => c.ok || c.soft)
  return { ready, checks, renderMode, driver }
}

// ── formatting ───────────────────────────────────────────────────────────────────
export function formatChecklist(result) {
  const L = [`maestro:preflight — driver=${result.driver} · render=${result.renderMode}`, '']
  for (const c of result.checks) {
    const mark = c.ok ? '✓' : (c.soft ? '!' : '✗')
    L.push(`  ${mark} ${c.label.padEnd(26)} ${c.detail}`)
    if (!c.ok && c.fix) L.push(`      └─ fix: ${c.fix}`)
  }
  const missing = result.checks.filter(c => !c.ok && !c.soft)
  L.push('', result.ready
    ? '✓ READY — every precondition met. Safe to start a hands-off Maestro run.'
    : `✗ NOT-READY — ${missing.length} precondition(s) missing: ${missing.map(c => c.id).join(', ')}. Fix the above, re-run.`)
  return L.join('\n')
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { renderMode: 'dev', driver: 'cli', json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--render') o.renderMode = argv[++i]
    else if (a === '--driver') o.driver = argv[++i]
    else if (a === '--preview-url') o.previewUrl = argv[++i]
    else if (a === '--json') o.json = true
    else if (a === '--help' || a === '-h') o.help = true
  }
  return o
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) {
    console.log('Usage: node maestro-preflight.mjs [--render dev|push] [--driver cli|workflow] [--preview-url <url>] [--json]')
    process.exit(0)
  }
  if (!['dev', 'push'].includes(o.renderMode)) { console.error(`maestro:preflight: --render must be dev|push (got ${o.renderMode})`); process.exit(2) }
  if (!['cli', 'workflow'].includes(o.driver)) { console.error(`maestro:preflight: --driver must be cli|workflow (got ${o.driver})`); process.exit(2) }
  const result = await preflight({ renderMode: o.renderMode, driver: o.driver, previewUrl: o.previewUrl || undefined })
  if (o.json) console.log(JSON.stringify({ ready: result.ready, checks: result.checks.map(({ id, ok, soft, detail, fix }) => ({ id, ok, soft, detail, fix })) }, null, 2))
  else console.log(formatChecklist(result))
  process.exit(result.ready ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(`maestro:preflight: ${e.message}`); process.exit(2) })
}
