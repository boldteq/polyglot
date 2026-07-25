#!/usr/bin/env node
// Self-test for check-graphql-validate.mjs (gate #51) — the build's GraphQL judged by SHOPIFY'S validator.
//   (parser)  the markdown→findings parser is pure → tested offline, exactly (verified live 2026-07-24)
//   (empty)   a build with no GraphQL → exit 0 + n-a-no-graphql (never a silent pass)
//   (scope)   unresolvable BASE_REF → exit 0 + scope-unresolved, evidence.scanned = 0
//   (offline) a build WITH a GraphQL block but no validator reachable → WARNS, never blocks
//   (live)    (network) a hallucinated field → exit 1 + graphql.error ; a valid query → exit 0
//
// The live cases need the real @shopify/dev-mcp (network first run, then cached). SKIP_MCP=1 runs only
// the hermetic cases so CI without network still proves the parser + N/A + degradation paths.
//
// Run: node scripts/__fixtures__/graphql-validate/run-tests.mjs   ·   Exit: 0 all pass · 1 a case failed

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseGraphqlReport } from '../../lib/shopify-mcp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-graphql-validate.mjs')
const SKIP_MCP = process.env.SKIP_MCP === '1'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', GRAPHQL_VALIDATE_SCAN_ALL: '1', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env, encoding: 'utf-8', timeout: 300000 })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'graphql-validate.json'), 'utf-8')) } catch { /* died before writing */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return {
    code: r.status,
    report: rep,
    blockerIds: new Set((rep?.blockers || []).map((b) => b.id)),
    warnIds: new Set((rep?.warnings || []).map((w) => w.id)),
  }
}

// ── (parser) — pure, hermetic. This is the exact markdown validate_graphql_codeblocks returned live. ──
const LIVE_MD = `## Validation Summary

**Overall Status:** ❌ INVALID
**Total Code Blocks:** 2

## Detailed Results

### Code Block 1
**Artifact ID:** artifact-1f0c3a79-512d-42b8-9df0-3c7403601fc5
**Revision:** 1
*Use same ID & increment revision when retrying on an improvement of this artifact*

**Status:** ✅ SUCCESS
**Details:** Successfully validated GraphQL query against schema.

### Code Block 2
**Artifact ID:** artifact-9b6738d5-daaa-4d94-96fd-55c7a1984765
**Revision:** 1
*Use same ID & increment revision when retrying on an improvement of this artifact*

**Status:** ❌ FAILED
**Details:** GraphQL validation errors: Cannot query field "nonExistentField123" on type "Shop".; Cannot query field "bogusThing" on type "Shop".


Version validated against is 2026-04.`

{
  const findings = parseGraphqlReport(LIVE_MD, ['storefront.js', 'cart.js'])
  if (findings.length === 1) pass('parser: 1 FAILED block extracted, SUCCESS block ignored')
  else fail(`parser: expected 1 finding, got ${findings.length}`)
  if (findings[0]?.block === 'cart.js') pass('parser: finding mapped to the right source label (by order)')
  else fail(`parser: expected block "cart.js", got "${findings[0]?.block}"`)
  if (/Cannot query field "nonExistentField123"/.test(findings[0]?.message || '')) pass('parser: schema error message preserved')
  else fail(`parser: message not preserved — "${findings[0]?.message}"`)
  if (parseGraphqlReport('', []).length === 0 && parseGraphqlReport(null, []).length === 0) pass('parser: empty/null → no findings')
  else fail('parser: empty/null should yield no findings')
}

// ── (empty) — a build with no GraphQL is N/A, never a silent pass ──
{
  const r = run('empty')
  if (r.code === 0 && r.warnIds.has('graphql-validate.n-a-no-graphql')) pass('empty: no GraphQL → exit 0 + n-a-no-graphql')
  else fail(`empty: expected exit 0 + n-a-no-graphql, got code=${r.code} warns=${[...r.warnIds]}`)
}

// ── (scope) — unresolvable base → cannot tell build GraphQL from vendor → warn, scanned 0 ──
{
  const r = run('broken', { GRAPHQL_VALIDATE_SCAN_ALL: '', BASE_REF: '__no_such_base__' })
  if (r.code === 0 && r.warnIds.has('graphql-validate.scope-unresolved') && r.report?.evidence?.scanned === 0) pass('scope: unresolvable BASE_REF → exit 0 + scope-unresolved, scanned 0')
  else fail(`scope: expected exit 0 + scope-unresolved + scanned 0, got code=${r.code} warns=${[...r.warnIds]} scanned=${r.report?.evidence?.scanned}`)
}

// ── (offline / live) — a build WITH a GraphQL block. Offline: WARN not block. Live: block on bad field. ──
{
  const r = run('broken')
  if (SKIP_MCP) {
    // no network path forced — must degrade to a WARNING, never a false BLOCK
    const degraded = r.warnIds.has('graphql-validate.unavailable') || r.blockerIds.has('graphql.error')
    if (r.code !== 2 && degraded) pass('offline/live: block present → validator attempted (WARN if unreachable, BLOCK if it ran and failed)')
    else fail(`offline: expected a WARN (unavailable) or a real BLOCK, got code=${r.code} warns=${[...r.warnIds]} blockers=${[...r.blockerIds]}`)
  } else {
    if (r.code === 1 && r.blockerIds.has('graphql.error')) pass('live: hallucinated field → exit 1 + graphql.error')
    else if (r.warnIds.has('graphql-validate.unavailable')) pass('live: validator unreachable → WARN (no network) — acceptable')
    else fail(`live: expected exit 1 + graphql.error (or unavailable WARN), got code=${r.code} warns=${[...r.warnIds]} blockers=${[...r.blockerIds]}`)
  }
}
{
  if (!SKIP_MCP) {
    const r = run('clean')
    if (r.code === 0) pass('live: valid Storefront query → exit 0')
    else if (r.warnIds.has('graphql-validate.unavailable')) pass('live: validator unreachable → WARN (no network) — acceptable')
    else fail(`live: expected exit 0 on a valid query (or unavailable WARN), got code=${r.code} warns=${[...r.warnIds]}`)
  }
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
