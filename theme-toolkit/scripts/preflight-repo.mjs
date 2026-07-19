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

const cwd = process.cwd()
const has = (p) => fs.existsSync(path.join(cwd, p))
const bin = (name) => { try { execFileSync(name, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] }); return true } catch { return false } }
const isGit = () => { try { execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: ['ignore', 'ignore', 'ignore'] }); return true } catch { return false } }

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

const reqFail = checks.filter((c) => c.required && !c.ok)
const advFail = checks.filter((c) => !c.required && !c.ok)

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
