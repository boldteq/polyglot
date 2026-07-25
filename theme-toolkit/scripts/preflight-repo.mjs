#!/usr/bin/env node
// preflight-repo — "can the SWT orchestration actually RUN in THIS repo, from VS Code?" (2026-07-19).
// The #1 reason gates/agents "don't work" in a VS Code Shopify session is a repo that isn't provisioned:
// no vendored toolkit/, no deps, no playwright browser, no theme-lock, no preview URL, wrong Node. This
// prints a green/red readiness table with the EXACT fix per gap so nothing fails silently later.
//
// Run from the CLIENT REPO ROOT: node toolkit/scripts/preflight-repo.mjs
// Exit: 0 = every REQUIRED check green (ready for `/shopify-build`) · 1 = a required gap · advisory items never fail.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const cwd = process.cwd()
const has = (p) => fs.existsSync(path.join(cwd, p))
const bin = (name) => { try { execFileSync(name, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] }); return true } catch { return false } }
const isGit = () => { try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'ignore', 'ignore'] }); return true } catch { return false } }
const git = (args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
const hasBaselineTag = () => /(^|\n)(base|baseline|v?0\.)/i.test(git(['tag']) || '')
const uncommitted = () => (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length
const changesTracked = () => { try { execFileSync('git', ['ls-files', '--error-unmatch', 'CHANGES.md'], { cwd, stdio: ['ignore', 'ignore', 'ignore'] }); return true } catch { return !has('CHANGES.md') } }
function dsScalesPopulated() {
  try {
    const ds = JSON.parse(fs.readFileSync(path.join(cwd, 'docs/design/design-system.json'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, ''))
    const nonEmpty = (v) => Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : false)
    return nonEmpty((ds.typography && (ds.typography.allowed_px || ds.typography.scale)) || ds.type_scale)
      && nonEmpty((ds.spacing && (ds.spacing.scale || ds.spacing.allowed_px)) || ds.space_scale)
  } catch { return false }
}

// ── vendored-copy integrity ────────────────────────────────────────────────
// A client repo VENDORS a copy of the toolkit. Every fix shipped in Polyglot reaches a client only
// when that copy is refreshed, and nothing detected staleness: cravinbyandy's copy was missing 11
// scripts (done-check, gate-integrity #45, orchestration #44, reference-match #46, class-d-visual #20,
// gate-autofix, preflight itself, snap-colors-to-tokens, generate-reuse-map, reference-ingest,
// audit-unproven-guards) while BOTH sides reported toolkitVersion 1.0.0 — so the evidence looked
// identical to a current run. CB-1 read as "blocked" for weeks because its own tool was not there.
//
// Offline check, no source tree needed: every gate the vendored manifest itself declares must have
// its script present. A partial copy is then loud instead of silent.
export function missingGateScripts(manifestRows, exists) {
  return (manifestRows || [])
    .filter((g) => g && g.script && !exists(g.script))
    .map((g) => `#${g.number} ${g.name} (${g.script})`)
}

// Version drift against the SOURCE toolkit when it is reachable (POLYGLOT_TOOLKIT, else the default
// checkout path). Unreachable is reported as unknown — never as "up to date".
export function versionDrift(localVersion, sourceVersion) {
  if (!sourceVersion) return { known: false, drifted: false, detail: 'source toolkit not reachable — vendored copy freshness UNKNOWN (set POLYGLOT_TOOLKIT)' }
  const drifted = String(localVersion).trim() !== String(sourceVersion).trim()
  return { known: true, drifted, detail: drifted ? `vendored ${localVersion} != source ${sourceVersion}` : `matches source (${sourceVersion})` }
}

const checks = []
const add = (required, ok, label, fix) => checks.push({ required, ok, label, fix })

// ── REQUIRED — the loop cannot run without these ──
add(true, has('toolkit/scripts/theme-gates.mjs'), 'toolkit vendored at toolkit/',
  'vendor it: cp -R "<Polyglot>/theme-toolkit" ./toolkit   (or run /shopify-bootstrap)')
add(true, has('toolkit/node_modules'), 'toolkit deps installed',
  'npm ci --prefix toolkit')
add(true, has('toolkit/node_modules/playwright') || has('toolkit/node_modules/.bin/playwright'), 'playwright installed (Lens/gates)',
  'npm ci --prefix toolkit')
add(true, Number(process.versions.node.split('.')[0]) >= 20, `Node ≥20 (have ${process.versions.node})`,
  'use Node 20: nvm use 20   (better-sqlite3 + toolchain need it)')
add(true, bin('claude'), 'claude CLI on PATH (self-heal dispatches claude -p)',
  'install + auth Claude Code CLI so gate-autofix/lens-autofix can fix')
add(true, isGit(), 'repo is a git repo (freshness + destructive-fix revert need it)',
  'git init && git add -A && git commit -m "baseline"')
// ── The cravinbyandy class (2026-07-22 forensics) — these four made 8 gates silently skip AND
// report pass for 9 days, so the client kept re-reporting bugs no gate was actually checking.
add(true, hasBaselineTag(), 'baseline `base` git tag exists (8 scope-resolving gates need it)',
  'git tag base   ← without it #8/#9/#11/#13/#14/#16/#22/#23 SKIP their scan and still report pass')
add(true, dsScalesPopulated(), 'design-system has non-empty typography + spacing scales',
  'populate docs/design/design-system.json typography.allowed_px + spacing.scale — else font-size/spacing drift is UNENFORCEABLE')
add(false, uncommitted() <= 20, `working tree is committed (${uncommitted()} uncommitted path(s))`,
  'git add -A && git commit — uncommitted work is invisible to the next agent, so fixes get silently reverted (and one `git checkout` destroys it)')
add(false, changesTracked(), 'CHANGES.md is tracked by git',
  'git add CHANGES.md && git commit — an untracked change-log has no history and cannot be diffed')

// ── ADVISORY — needed for a FULL publish-grade run / live store, but the loop can start ──
add(false, has('.boldteq-theme-lock.json'), 'theme linked (.boldteq-theme-lock.json)',
  'node toolkit/scripts/shopify-theme-link.mjs --single   (needed before push/publish)')
add(false, !!(process.env.THEME_PREVIEW_URL || (process.env.STORE && process.env.THEME_ID)), 'THEME_PREVIEW_URL set (URL + Lens gates)',
  'export THEME_PREVIEW_URL=<shopify theme dev / staging url>   (else URL/Lens gates are out of scope)')
add(false, bin('shopify'), 'shopify CLI on PATH (theme dev/push/publish)',
  'npm i -g @shopify/cli && shopify auth login')
add(false, has('docs/discovery/goals.json'), 'discovery goals seeded (gate #0.4)',
  'compass/atrium author docs/discovery/goals.json in-run (auto)')
add(false, has('docs/design/design-system.json'), 'design-system seeded (gate #0.5)',
  'drape authors docs/design/design-system.json in-run (auto)')
add(false, has('CLAUDE.md'), 'repo CLAUDE.md present (orients any session/agent — Dev-MCP-first + done-means-green)',
  'seed it: cp toolkit/templates/repo-CLAUDE.md ./CLAUDE.md   (durable in-repo pointer for hook-less sessions; never clobber an existing one)')

// ── vendored-copy integrity (the drift that made every fix invisible to clients) ──
{
  const gatesPath = path.join(cwd, 'toolkit/scripts/theme-gates.mjs')
  let rows = []
  if (fs.existsSync(gatesPath)) {
    try {
      rows = JSON.parse(execFileSync(process.execPath, [gatesPath, '--list-json'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }))
    } catch { rows = [] }
  }
  const missing = missingGateScripts(rows, (sc) => fs.existsSync(path.join(cwd, 'toolkit/scripts', sc)))
  add(true, rows.length > 0 && missing.length === 0,
    `vendored toolkit is complete (${rows.length} gate script(s)${missing.length ? `, ${missing.length} MISSING` : ''})`,
    missing.length
      // re-vendor the WHOLE toolkit, not just scripts/: lib/ (aim-handoff-registry), schemas/,
      // templates/, toolkit-rules/, workflows/ and lens-rubrics/ all drift too. Copying scripts/ alone
      // left cravinbyandy with a stale registry and gate #44 blocked on a wrong-gate citation.
      ? `re-vendor ALL of it: for d in lib schemas templates toolkit-rules workflows lens-rubrics scripts; do cp -R "<Polyglot>/theme-toolkit/$d/." "./toolkit/$d/"; done — missing: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` +${missing.length - 4}` : ''}`
      : 'could not read the vendored gate manifest — re-vendor the toolkit')

  const readVer = (base) => { try { return fs.readFileSync(path.join(base, 'TOOLKIT_VERSION'), 'utf-8').trim() } catch { return null } }
  const localVer = readVer(path.join(cwd, 'toolkit'))
  const src = process.env.POLYGLOT_TOOLKIT || path.join(process.env.HOME || '', 'Desktop/Boldteq App/Operation/Polyglot/theme-toolkit')
  const drift = versionDrift(localVer, readVer(src))
  // provenance beats a version string: QA-6 showed two very different toolkits both reporting 1.0.0.
  let prov = null
  try { prov = JSON.parse(fs.readFileSync(path.join(cwd, 'toolkit', '.vendor-provenance.json'), 'utf-8')) } catch { /* older vendor */ }
  add(false, Boolean(prov) && prov.dirty === false,
    prov
      ? `vendored from ${String(prov.sha || '?').slice(0, 7)}${Array.isArray(prov.dirty) ? ` — DIRTY: ${prov.dirty.length} uncommitted path(s) shipped` : ' (clean commit)'}`
      : 'vendored copy has no provenance (copied by hand, source commit unknown)',
    'vendor it properly: node <Polyglot>/theme-toolkit/scripts/vendor-toolkit.mjs --to .   (records the source commit; refuses a dirty source)')
  add(false, drift.known && !drift.drifted, `vendored toolkit version ${localVer || 'unknown'} — ${drift.detail}`,
    'refresh the vendored copy (all dirs, not just scripts/): rsync -a --exclude node_modules --exclude gate-reports "<Polyglot>/theme-toolkit/" ./toolkit/ && npm ci --prefix toolkit')
}

const reqFail = checks.filter((c) => c.required && !c.ok)
const advFail = checks.filter((c) => !c.required && !c.ok)

// run as CLI only — importable for tests (missingGateScripts / versionDrift) without printing or exiting
const IS_CLI = isMain(import.meta.url)
if (!IS_CLI) { /* imported for its pure helpers — no report, no exit */ } else {

console.log(`preflight-repo — ${path.basename(cwd)}\n`)
for (const c of checks) {
  const mark = c.ok ? '✅' : (c.required ? '❌' : '⚠️ ')
  console.log(`${mark} ${c.required ? '[required] ' : '[advisory] '}${c.label}`)
  if (!c.ok) console.log(`      → ${c.fix}`)
}
console.log('')
if (reqFail.length) {
  console.log(`⛔ NOT READY — ${reqFail.length} required gap(s). Fix the ❌ above (or run /shopify-bootstrap), then re-run.`)
  process.exit(1)
}
console.log(`✅ READY for /shopify-build${advFail.length ? ` — ${advFail.length} advisory item(s) (full publish-grade needs them)` : ''}.`)
process.exit(0)
}
