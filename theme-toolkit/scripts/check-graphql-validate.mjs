#!/usr/bin/env node
// Gate #51 graphql-validate — the build's GraphQL, judged by SHOPIFY'S own validator (handbook §5).
//
// SIBLING TO #49 shopify-validate: #49 hands our Liquid to @shopify/dev-mcp's `validate_theme`; this
// hands the build's Admin/Storefront GraphQL to `validate_graphql_codeblocks`, which parses each
// operation against the real Shopify schema and rejects hallucinated fields/types. The handbook
// mandates it for Conduit/Porter/Onyx before PR. Response shape verified live 2026-07-24.
//
// SCAN (the build's custom surface only — base..HEAD, like every static gate): (a) `.graphql`/`.gql`
// files (whole file = one operation); (b) template literals in `.js` that carry a GraphQL operation
// signature (`query`/`mutation`/`fragment` … `{`) — the shape Conduit uses for Storefront data (cart,
// predictive search). Themes usually ship ZERO GraphQL → this gate is N/A (empty scope = pass, never a
// silent one). Porter's Admin mutations are validated by calling `validateGraphql({api:'admin'})`
// directly from its own scripts; this theme gate defaults to the Storefront API.
//
// Usage: node check-graphql-validate.mjs
// Env:   BASE_REF (default "base") · REPORT_DIR · GRAPHQL_VALIDATE_SCAN_ALL=1 (fixtures: skip git scope)
//        GRAPHQL_VALIDATE_API (default storefront-graphql) · SHOPIFY_MCP_TIMEOUT_MS · GRAPHQL_VALIDATE_MAX_BLOCKS (40)
// Exit:  0 = pass · 1 = block (Shopify reported a GraphQL error) · 2 = env error
//
// OFFLINE / UNAVAILABLE is a WARNING, never a pass-in-disguise: evidence.scanned stays real so gate #45
// gate-integrity can tell "ran and found nothing" from "never ran".

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
import { validateGraphql } from './lib/shopify-mcp.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const SCAN_ALL = process.env.GRAPHQL_VALIDATE_SCAN_ALL === '1'
const API = process.env.GRAPHQL_VALIDATE_API || 'storefront-graphql'
const MAX_BLOCKS = Number(process.env.GRAPHQL_VALIDATE_MAX_BLOCKS || 40)

const SCAN_DIRS = ['assets', 'snippets', 'sections', 'templates', 'blocks']
const blockers = []
const warnings = []

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('graphql-validate', 51, {
    cwd, pass, blockers, warnings,
    evidence: { baseRef: BASE_REF, api: API, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`graphql-validate: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings.slice(0, 10)) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const walk = (dir, acc = []) => {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, acc)
    else if (/\.(graphql|gql|js|liquid)$/.test(e.name)) acc.push(rel)
  }
  return acc
}

// Files this build added/modified vs the vendored base — Shopify's vendor code is never our defect.
function scopedFiles() {
  if (SCAN_ALL) return { files: SCAN_DIRS.flatMap((d) => walk(d)), scoped: false, reason: 'GRAPHQL_VALIDATE_SCAN_ALL=1' }
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return { files: null, scoped: false, reason: `base ref "${BASE_REF}" unresolvable` }
  }
  try {
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', ...SCAN_DIRS], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: out.split('\n').map((s) => s.trim()).filter((f) => /\.(graphql|gql|js|liquid)$/.test(f)), scoped: true, reason: null }
  } catch (e) {
    return { files: null, scoped: false, reason: `git diff failed: ${e.message}` }
  }
}

// A GraphQL operation signature: `query`/`mutation`/`fragment` (optionally named) then a `{`. Low-FP —
// requires the keyword + an opening brace within the same fragment of text.
const GQL_SIG = /\b(query|mutation|fragment)\b[\s\S]{0,80}?\{/
// Backtick template literals (themes don't nest them) — the shape Conduit emits Storefront queries in.
const TEMPLATE_LITERAL = /`([^`]*)`/g

// Extract GraphQL operations from one file → [{ content, label }]
function extractBlocks(rel) {
  const abs = path.resolve(cwd, rel)
  let raw
  try { raw = fs.readFileSync(abs, 'utf-8') } catch { return [] }
  if (/\.(graphql|gql)$/.test(rel)) {
    return GQL_SIG.test(raw) ? [{ content: raw.trim(), label: rel }] : []
  }
  // .js / .liquid → template literals that look like a GraphQL operation
  const out = []
  let m
  while ((m = TEMPLATE_LITERAL.exec(raw))) {
    const body = m[1]
    if (GQL_SIG.test(body) && body.includes('{')) out.push({ content: body.trim(), label: rel })
  }
  return out
}

async function main() {
  if (!fs.existsSync(path.resolve(cwd, 'sections')) && !fs.existsSync(path.resolve(cwd, 'layout')) && !fs.existsSync(path.resolve(cwd, 'assets'))) {
    finish('not a theme repo (no sections/ layout/ assets/) — run from the theme root')
  }

  const { files: scopeFiles, scoped, reason } = scopedFiles()
  if (scopeFiles === null) {
    warnings.push({ id: 'graphql-validate.scope-unresolved', page: '.', detail: `${reason} — cannot tell this build's GraphQL from the vendored theme's, so nothing was validated. Tag the base commit \`base\`.`, evidence: BASE_REF })
    finish(null, { scanned: 0, scope: 'unresolved' })
  }

  const blocks = scopeFiles.flatMap(extractBlocks)
  if (blocks.length === 0) {
    warnings.push({ id: 'graphql-validate.n-a-no-graphql', page: '.', detail: 'no GraphQL operations in the build\'s custom surface — nothing to validate (an absence of signal, not a defect). Most themes ship zero GraphQL.', evidence: '' })
    finish(null, { scanned: 0, scope: scoped ? 'build-diff' : 'all' })
  }

  const capped = blocks.length > MAX_BLOCKS
  const selected = blocks.slice(0, MAX_BLOCKS)
  if (capped) {
    warnings.push({ id: 'graphql-validate.scan-capped', page: '.', detail: `${blocks.length} GraphQL blocks exceed the ${MAX_BLOCKS}-block cap — only the first ${MAX_BLOCKS} were validated. Raise GRAPHQL_VALIDATE_MAX_BLOCKS; this run does NOT clear the remainder.`, evidence: `${blocks.length} > ${MAX_BLOCKS}` })
  }

  const res = await validateGraphql(selected, { api: API })

  if (res.unavailable) {
    warnings.push({ id: 'graphql-validate.unavailable', page: '.', detail: `Shopify's GraphQL validator could not run — ${res.reason}. The build's GraphQL was NOT checked against Shopify's schema. (A corrupt ~/.npm/_npx cache is the usual cause: delete the offending dir and let npx refetch.)`, evidence: String(res.reason).slice(0, 200) })
    finish(null, { scanned: 0, attempted: selected.length, scope: scoped ? 'build-diff' : 'all', unavailable: true })
  }

  for (const f of res.findings) {
    blockers.push({ id: 'graphql.error', page: f.block || '(graphql)', detail: f.message, evidence: f.artifact || '' })
  }

  finish(null, {
    scanned: selected.length,
    scope: scoped ? 'build-diff' : 'all',
    capped: capped || undefined,
    totalBlocks: blocks.length,
    errors: blockers.length,
  })
}

main().catch((e) => {
  writeReport('graphql-validate', 51, {
    cwd, pass: false,
    blockers: [{ id: 'graphql-validate.crash', page: '(gate)', detail: `unexpected failure: ${e.message}`, evidence: '' }],
    warnings: [], evidence: { scanned: 0 }, duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  console.error(`graphql-validate: CRASH — ${e.message}`)
  process.exit(2)
})
