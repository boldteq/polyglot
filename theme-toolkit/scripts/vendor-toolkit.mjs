#!/usr/bin/env node
// vendor-toolkit — copy the toolkit into a client repo from COMMITTED state, and record where it came from.
//
// The hazard this closes is one I created. Client repos gitignore `toolkit/`, so the vendored copy is
// refreshed by hand — and the documented recipe was `cp -R <Polyglot>/theme-toolkit/. ./toolkit/`,
// which copies the WORKING TREE. On 2026-07-23 that shipped 21 uncommitted paths from a concurrent
// workstream into cravinbyandy, including a half-finished gate (check-repo-hygiene) that immediately
// added 29 blockers to a client's build. Nobody chose that; a copy command did.
//
// So: vendor from `git archive <ref>` (committed state), refuse when the source toolkit is dirty
// unless that is opted into, and write toolkit/.vendor-provenance.json so the client's copy can say
// exactly which commit it is. QA-6 showed TOOLKIT_VERSION alone cannot: two very different trees both
// reported 1.0.0 while eleven gate scripts were missing.
//
//   node theme-toolkit/scripts/vendor-toolkit.mjs --to <client-repo>
//   node theme-toolkit/scripts/vendor-toolkit.mjs --to <client-repo> --ref <sha|tag>
//   node theme-toolkit/scripts/vendor-toolkit.mjs --to <client-repo> --allow-dirty   # records the fact
//
// Exit: 0 vendored · 1 refused (dirty source, or bad target) · 2 env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOLKIT_ROOT = path.resolve(HERE, '..')          // theme-toolkit/
const REPO_ROOT = path.resolve(TOOLKIT_ROOT, '..')     // Polyglot/
const PREFIX = path.basename(TOOLKIT_ROOT)             // 'theme-toolkit'

// Directories that are BUILD OUTPUT or per-repo state — never travel with the toolkit.
const EXCLUDE = new Set(['node_modules', 'gate-reports'])

const die = (msg, code = 2) => { console.error(`vendor-toolkit: ${code === 2 ? 'ENV-ERROR' : 'REFUSED'} — ${msg}`); process.exit(code) }

export function dirtyToolkitPaths(porcelain, prefix) {
  return String(porcelain).split('\n').filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .map((p) => { const i = p.indexOf(' -> '); return i === -1 ? p : p.slice(i + 4) })
    .filter((p) => p === prefix || p.startsWith(`${prefix}/`))
}

function copyTree(from, to) {
  let n = 0
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (EXCLUDE.has(ent.name)) continue
    const src = path.join(from, ent.name)
    const dst = path.join(to, ent.name)
    if (ent.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); n += copyTree(src, dst) }
    else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n += 1 }
  }
  return n
}

function main() {
  const argv = process.argv.slice(2)
  const at = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null)
  const to = at('--to')
  const ref = at('--ref') || 'HEAD'
  const allowDirty = argv.includes('--allow-dirty')
  if (!to) die('--to <client-repo> is required')

  const target = path.resolve(to)
  if (!fs.existsSync(target)) die(`target not found: ${target}`)
  // A theme repo, not an arbitrary directory — vendoring into the wrong place is hard to notice.
  if (!fs.existsSync(path.join(target, 'sections')) && !fs.existsSync(path.join(target, 'layout'))) {
    die(`${target} has no sections/ or layout/ — that does not look like a Shopify theme repo`, 1)
  }

  let sha, porcelain
  try {
    sha = execFileSync('git', ['rev-parse', ref], { cwd: REPO_ROOT, encoding: 'utf-8' }).trim()
    porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf-8' })
  } catch (e) { die(`cannot read git state: ${e.message}`) }

  const dirty = dirtyToolkitPaths(porcelain, PREFIX)
  if (dirty.length && !allowDirty) {
    console.error(`vendor-toolkit: REFUSED — ${dirty.length} uncommitted path(s) under ${PREFIX}/.`)
    console.error('Vendoring the WORKING TREE ships unreviewed work to a client. On 2026-07-23 that put a')
    console.error("concurrent workstream's half-finished gate into cravinbyandy and added 29 blockers.")
    console.error('Commit them, or vendor an explicit --ref, or opt in with --allow-dirty (recorded).')
    for (const p of dirty.slice(0, 8)) console.error(`  ${p}`)
    process.exit(1)
  }

  // Materialise the COMMITTED tree — never the working copy.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'))
  let source
  if (allowDirty && dirty.length) {
    source = TOOLKIT_ROOT
  } else {
    try {
      const tar = execFileSync('git', ['archive', '--format=tar', sha, PREFIX], { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 256 })
      fs.writeFileSync(path.join(stage, 't.tar'), tar)
      execFileSync('tar', ['-xf', 't.tar'], { cwd: stage })
      source = path.join(stage, PREFIX)
    } catch (e) { fs.rmSync(stage, { recursive: true, force: true }); die(`git archive failed: ${e.message}`) }
  }

  const dest = path.join(target, 'toolkit')
  fs.mkdirSync(dest, { recursive: true })
  const files = copyTree(source, dest)

  let version = 'unknown'
  try { version = fs.readFileSync(path.join(dest, 'TOOLKIT_VERSION'), 'utf-8').trim() } catch { /* keep */ }
  const provenance = {
    source: 'Polyglot/theme-toolkit',
    sha,
    ref,
    version,
    dirty: allowDirty && dirty.length ? dirty : false,
    files,
    vendoredAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(dest, '.vendor-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
  fs.rmSync(stage, { recursive: true, force: true })

  console.log(`vendor-toolkit: ${files} file(s) → ${path.relative(process.cwd(), dest) || dest}`)
  console.log(`  version ${version} · sha ${sha.slice(0, 7)}${provenance.dirty ? ` · DIRTY (${dirty.length} uncommitted path(s) included)` : ''}`)
  if (provenance.dirty) console.log('  ⚠ this client is running unreviewed work — re-vendor from a clean commit when it lands')
  console.log('  run `npm ci --prefix toolkit` if dependencies changed')
  process.exit(0)
}

// Compare REAL paths: on macOS a temp dir is /var/folders/... via symlink but /private/var/folders/...
// once resolved, so a plain path.resolve comparison silently fails and main() never runs — the script
// then exits 0 having done nothing, which is the worst possible failure mode for a vendor tool.
const realOf = (p) => { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main()
