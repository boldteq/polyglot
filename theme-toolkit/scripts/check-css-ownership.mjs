#!/usr/bin/env node
// Gate #52 css-ownership — a component's {% stylesheet %} styles ITS OWN markup, nothing else.
//
// WHY (platform-truth 2026 §A1, verified via Dev MCP 2026-07-25): each section/block/snippet has exactly
// one {% stylesheet %}, and that CSS is the component's own. A class whose selector is DEFINED in one
// component's stylesheet but RENDERED by another file is a cross-file dependency — under Shopify's
// per-component CSS model it can ship unstyled on a page where the defining component didn't render. So
// "scope CSS to its own file" stopped being a preference and became a correctness rule. Same signal
// catches plain dead CSS.
//
// CHECK (pure, static, offline — no MCP): for each sections/ blocks/ snippets/ .liquid in the build's
// custom surface (base..HEAD), split the {% stylesheet %} from the rest; every class token the stylesheet
// DEFINES must appear somewhere in that same file's markup/Liquid/JS. A class defined here but mentioned
// nowhere else in this file is an orphan → owned by another component (move it) or dead (remove it).
//
// LOW-FALSE-POSITIVE: a class used ANYWHERE in the same file (even a dynamic `class="x {{ y }}"` or a JS
// toggle) counts as used — only a class the file defines and never otherwise mentions is flagged. Shared
// tokens live in design-system.css / the base theme, not a component stylesheet, so they never trip this.
//
// WARN by default; BLOCK at publish-grade (DS_REQUIRE_SCOPE=1) — a false BLOCK is as bad as a false pass.
// Usage: node check-css-ownership.mjs   Env: BASE_REF (base) · REPORT_DIR · DS_REQUIRE_SCOPE=1 · CSS_OWNERSHIP_SCAN_ALL=1
// Exit: 0 pass · 1 block (publish-grade + orphans) · 2 env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { isMain } from './lib/is-main.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const SCAN_ALL = process.env.CSS_OWNERSHIP_SCAN_ALL === '1'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1'
const SCAN_DIRS = ['sections', 'blocks', 'snippets']

const blockers = []
const warnings = []

// ── PURE helpers (exported for the fixture) ──────────────────────────────────
const STYLESHEET_RE = /\{%-?\s*stylesheet\s*-?%\}([\s\S]*?)\{%-?\s*endstylesheet\s*-?%\}/gi
// a class token in a selector: `.name`, `.name__el`, `.name--mod` — NOT keyframes (@keyframes has no dot),
// pseudo (:hover), or attribute ([data-x]) selectors.
const CLASS_IN_SELECTOR = /(?:^|[\s,>+~(){}])\.(-?[a-zA-Z_][\w-]*)/g

export function classesDefinedIn(css) {
  const out = new Set()
  let m
  while ((m = CLASS_IN_SELECTOR.exec(String(css || '')))) out.add(m[1])
  return out
}

// Does a class token appear anywhere in this text (markup / Liquid / JS)? Word-boundary-ish so `card`
// doesn't match `cards`. Matches `class="card"`, `class="card {{x}}"`, `'card'`, `classList.add('card')`.
export function classMentioned(text, token) {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(text)
}

// Split one file's raw content → orphan class names (defined in its stylesheet, mentioned nowhere else in it)
export function orphanClasses(raw) {
  const src = String(raw || '')
  let css = ''
  const rest = src.replace(STYLESHEET_RE, (_, body) => { css += `\n${body}`; return ' ' })
  const defined = classesDefinedIn(css)
  if (!defined.size) return { defined: 0, orphans: [] }
  const orphans = [...defined].filter((c) => !classMentioned(rest, c))
  return { defined: defined.size, orphans }
}

// ── scope to the build's own files (base..HEAD), like every static gate ──────
const walk = (dir, acc = []) => {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, acc)
    else if (e.name.endsWith('.liquid')) acc.push(rel)
  }
  return acc
}
function scopedFiles() {
  if (SCAN_ALL) return { files: SCAN_DIRS.flatMap((d) => walk(d)), scoped: false }
  try { execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { return { files: null, scoped: false, reason: `base ref "${BASE_REF}" unresolvable` } }
  try {
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: out.split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.liquid')), scoped: true }
  } catch (e) { return { files: null, scoped: false, reason: `git diff failed: ${e.message}` } }
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('css-ownership', 52, { cwd, pass, blockers, warnings, evidence: { baseRef: BASE_REF, strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`css-ownership: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout'))) {
    finish('not a theme repo (no sections/ or layout/) — run from the theme root')
  }
  const { files, scoped, reason } = scopedFiles()
  if (files === null) {
    warnings.push({ id: 'css-ownership.scope-unresolved', page: '.', detail: `${reason} — cannot tell this build's components from the vendored theme's, so nothing was checked. Tag the base commit \`base\`.`, evidence: BASE_REF })
    finish(null, { scanned: 0, scope: 'unresolved' })
  }
  if (files.length === 0) {
    warnings.push({ id: 'css-ownership.n-a-no-components', page: '.', detail: 'no custom section/block/snippet in the build — nothing to check (absence of signal, not a defect).', evidence: '' })
    finish(null, { scanned: 0, scope: scoped ? 'build-diff' : 'all' })
  }

  let withCss = 0
  for (const rel of files) {
    let raw
    try { raw = fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { continue }
    const { defined, orphans } = orphanClasses(raw)
    if (defined > 0) withCss += 1
    for (const c of orphans) {
      const detail = `\`.${c}\` is defined in ${rel}'s {% stylesheet %} but never referenced in its own markup — CSS ownership (platform-truth §A1): a component's stylesheet styles its own markup. Move \`.${c}\` to the component that renders it, or to a shared stylesheet (design-system.css); if unused, remove it.`
      if (STRICT) blockers.push({ id: 'css.orphan-selector', page: rel, detail, evidence: c })
      else warnings.push({ id: 'css.orphan-selector', page: rel, detail: `${detail} (publish-grade BLOCK; warn in dev)`, evidence: c })
    }
  }
  finish(null, { scanned: withCss, files: files.length, scope: scoped ? 'build-diff' : 'all', orphans: blockers.length + warnings.filter((w) => w.id === 'css.orphan-selector').length })
}

// CLI only — importable for its pure helpers (classesDefinedIn / classMentioned / orphanClasses) without running.
if (isMain(import.meta.url)) {
  try { main() } catch (e) {
    writeReport('css-ownership', 52, { cwd, pass: false, blockers: [{ id: 'css-ownership.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: { scanned: 0 }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`css-ownership: CRASH — ${e.message}`)
    process.exit(2)
  }
}
