#!/usr/bin/env node
// Self-test for check-shopify-validate.mjs (gate #49) — our Liquid judged by SHOPIFY'S validator.
//   (a) clean        a conforming section → exit 0, no shopify.error
//   (b) broken       unknown filter + missing snippet → exit 1 with shopify.error
//   (c) empty        scope resolves to 0 Liquid files → exit 0 + n-a-empty-scope (never a silent pass)
//   (d) scope        unresolvable BASE_REF → exit 0 + scope-unresolved, evidence.scanned = 0
//   (e) parser       the markdown→findings parser is pure, so it is tested offline and exactly
//   (f) offline      an unreachable validator WARNS, and must never look like a pass
//
// (a)-(d) need the real @shopify/dev-mcp (network on first run, then cached). Set SKIP_MCP=1 to run
// only the hermetic cases — CI without network still proves the parser and the degradation paths.
//
// Run: node scripts/__fixtures__/shopify-validate/run-tests.mjs   ·   Exit: 0 all pass · 1 a case failed

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseValidationReport } from '../../lib/shopify-mcp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-shopify-validate.mjs')
const SKIP_MCP = process.env.SKIP_MCP === '1'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', SHOPIFY_VALIDATE_SCAN_ALL: '1', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env, encoding: 'utf-8', timeout: 300000 })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'shopify-validate.json'), 'utf-8')) } catch { /* died before writing */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return {
    code: r.status,
    report: rep,
    blockerIds: new Set((rep?.blockers || []).map((b) => b.id)),
    warnIds: new Set((rep?.warnings || []).map((w) => w.id)),
    blockers: rep?.blockers || [],
  }
}

// ── (e) parser — pure, hermetic, exact. This is the contract with Shopify's output shape; if they
// change the markdown, this test is what tells us, rather than the gate silently finding nothing.
console.log('case (e) the markdown→findings parser (pure, offline)')
{
  const md = `## Validation Summary

### Them 1
**Artifact ID:** promo
**Status:** ✅ SUCCESS
**Details:** Theme file sections/promo.liquid passed all checks from Shopify's Theme Check.

### Them 2
**Artifact ID:** broken
**Status:** ❌ FAILED
**Details:** Theme file sections/broken.liquid failed to validate:

ERROR: 'snippets/nope.liquid' does not exist
ERROR: Unknown filter 'totally_fake_filter' used.
WARNING: Deprecated filter 'img_url', consider using 'image_url'.; SUGGESTED FIXES: Replace 'img_url' with 'image_url'..
`
  const f = parseValidationReport(md)
  f.length === 3 ? pass('3 findings parsed from 2 artifacts') : fail(`expected 3 findings, got ${f.length}`)
  f.filter((x) => x.severity === 'error').length === 2 ? pass('2 errors') : fail('error count wrong')
  f.filter((x) => x.severity === 'warning').length === 1 ? pass('1 warning') : fail('warning count wrong')
  f[0].file === 'sections/broken.liquid' ? pass('file attributed from the Details line') : fail(`file=${f[0].file}`)
  f[2].fix === 'Replace \'img_url\' with \'image_url\'' ? pass('SUGGESTED FIXES captured') : fail(`fix=${f[2].fix}`)
  parseValidationReport('').length === 0 ? pass('empty input → no findings, no crash') : fail('empty input mishandled')
}

// ── (c) empty scope — the vacuous-pass guard. A gate that examined nothing must SAY so.
console.log('case (c) 0 changed Liquid files → declares n-a-empty-scope, never a silent pass')
{
  const { code, warnIds, report } = run('empty')
  code === 0 ? pass('exit 0 (absence of signal is not a defect)') : fail(`expected 0 got ${code}`)
  warnIds.has('shopify-validate.n-a-empty-scope') ? pass('warn: n-a-empty-scope') : fail(`missing n-a marker (saw ${[...warnIds].join(', ')})`)
  report?.evidence?.scanned === 0 ? pass('evidence.scanned = 0 (gate #45 can see this examined nothing)') : fail(`scanned=${report?.evidence?.scanned}`)
}

// ── (d) unresolvable base — must warn-skip, not pass green having checked the vendored theme.
console.log('case (d) unresolvable BASE_REF → scope-unresolved warning')
{
  const { code, warnIds, report } = run('clean', { SHOPIFY_VALIDATE_SCAN_ALL: '' })
  code === 0 ? pass('exit 0') : fail(`expected 0 got ${code}`)
  warnIds.has('shopify-validate.scope-unresolved') ? pass('warn: scope-unresolved') : fail(`missing (saw ${[...warnIds].join(', ')})`)
  report?.evidence?.scanned === 0 ? pass('scanned = 0') : fail(`scanned=${report?.evidence?.scanned}`)
}

// ── (f) unreachable validator — the honest-degradation path. Point the client at a package that
// cannot resolve and assert we WARN with scanned:0 rather than reporting a clean bill of health.
console.log('case (f) validator unreachable → warns, does not masquerade as a pass')
{
  const { code, warnIds, report } = run('clean', { SHOPIFY_MCP_PKG: '@boldteq/definitely-not-a-real-package-xyz', SHOPIFY_MCP_TIMEOUT_MS: '20000' })
  code === 0 ? pass('exit 0 (unavailable is not a build defect)') : fail(`expected 0 got ${code}`)
  warnIds.has('shopify-validate.unavailable') ? pass('warn: unavailable') : fail(`missing unavailable warning (saw ${[...warnIds].join(', ')})`)
  report?.evidence?.unavailable === true ? pass('evidence.unavailable = true') : fail('evidence did not record unavailability')
  report?.evidence?.scanned === 0 ? pass('scanned = 0 — nothing was actually validated') : fail(`scanned=${report?.evidence?.scanned}`)
}

if (SKIP_MCP) {
  console.log('\n  (skipping live MCP cases (a)/(b) — SKIP_MCP=1)')
} else {
  console.log('case (a) a conforming section → Shopify reports no error')
  {
    const { code, blockerIds, warnIds } = run('clean')
    if (warnIds.has('shopify-validate.unavailable')) {
      console.log('  SKIP  validator unreachable (offline?) — live cases cannot run')
    } else {
      code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}`)
      !blockerIds.has('shopify.error') ? pass('no shopify.error on conforming Liquid') : fail('false positive on clean Liquid')
    }
  }

  console.log('case (b) unknown filter + missing snippet → Shopify BLOCKS')
  {
    const { code, blockerIds, blockers, warnIds } = run('broken')
    if (warnIds.has('shopify-validate.unavailable')) {
      console.log('  SKIP  validator unreachable (offline?)')
    } else {
      code === 1 ? pass('exit 1 (block)') : fail(`expected 1 got ${code}`)
      blockerIds.has('shopify.error') ? pass('blocker: shopify.error') : fail(`missing shopify.error (saw ${[...blockerIds].join(', ')})`)
      const msgs = blockers.map((b) => b.detail).join(' | ');
      (/does not exist/i).test(msgs) ? pass('caught the missing snippet') : fail(`missing-snippet not reported: ${msgs.slice(0, 160)}`);
      (/unknown filter/i).test(msgs) ? pass('caught the unknown filter') : fail(`unknown-filter not reported: ${msgs.slice(0, 160)}`)
    }
  }
}

console.log(failures === 0 ? '\n  shopify-validate: ALL CASES PASS' : `\n  shopify-validate: ${failures} CASE(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
