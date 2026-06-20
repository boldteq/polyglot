#!/usr/bin/env node
// Self-test for maestro-preflight.mjs (the Maestro readiness gate). All external probes are injected
// (preview reachability, shopify CLI, claude CLI) so this runs with NO network and NO CLIs.
//
//   (a) all preconditions present → READY (exit-equivalent ready=true), every check ok.
//   (b) each missing precondition → NOT-READY + that check fails + a fix string is offered.
//   (c) render=push waives the live-preview check; render=dev requires a reachable URL.
//   (d) driver=workflow waives the claude-CLI check; driver=cli requires it.
//   (e) formatChecklist renders the verdict + per-failure fix lines.
// Run (Node 20): node scripts/__fixtures__/maestro-preflight/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preflight, formatChecklist } from '../../maestro-preflight.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
const check = (res, id) => res.checks.find(c => c.id === id)

// scaffold a fully-ready repo; `omit` removes one artifact to test its check
function scaffold(omit = null) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-pf-'))
  fs.mkdirSync(path.join(repo, 'docs/discovery'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'docs/design'), { recursive: true })
  if (omit !== 'discovery') fs.writeFileSync(path.join(repo, 'docs/discovery/goals.json'), JSON.stringify({ conversion: { cvr_target_pct: 2.8 } }))
  if (omit !== 'bootstrap') fs.writeFileSync(path.join(repo, 'docs/design/design-system.json'), JSON.stringify({ typography: { fonts: { heading: 'Fraunces' } } }))
  if (omit !== 'theme-lock') fs.writeFileSync(path.join(repo, '.boldteq-theme-lock.json'), JSON.stringify({ version: 1, store: 'demo.myshopify.com', themeId: '123', role: 'unpublished', singleTheme: true }))
  if (omit !== 'build-state') fs.writeFileSync(path.join(repo, 'docs/build-state.json'), JSON.stringify({ surfaces: [{ surface: 'home', status: 'todo' }, { surface: 'pdp', status: 'todo' }] }))
  if (omit !== 'changes-ledger') fs.writeFileSync(path.join(repo, 'CHANGES.md'), '# Changes\n- [x] done\n')
  return repo
}
// inject all-green external probes by default
const GREEN = { probe: async () => true, cliCheck: () => true, claudeCheck: () => true }
const cleanup = (r) => fs.rmSync(r, { recursive: true, force: true })

// ── case a: all present → READY ──
console.log('case a — all preconditions present → READY')
{
  const repo = scaffold()
  const res = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://127.0.0.1:9292' }, ...GREEN })
  eq(res.ready, true, 'ready true when everything present')
  eq(res.checks.every(c => c.ok), true, 'every check ok')
  cleanup(repo)
}

// ── case b: each missing file fails ITS check + blocks ready, with a fix ──
console.log('case b — each missing artifact fails its own check + offers a fix')
for (const omit of ['discovery', 'bootstrap', 'theme-lock', 'build-state']) {
  const repo = scaffold(omit)
  const res = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...GREEN })
  eq(res.ready, false, `ready false when ${omit} missing`)
  eq(check(res, omit).ok, false, `${omit} check fails`)
  eq(typeof check(res, omit).fix === 'string' && check(res, omit).fix.length > 0, true, `${omit} offers a fix command`)
  // unrelated checks still pass (failure is isolated to the missing one)
  const others = res.checks.filter(c => c.id !== omit && ['discovery', 'bootstrap', 'theme-lock', 'build-state'].includes(c.id))
  eq(others.every(c => c.ok), true, `other artifact checks still ok when only ${omit} missing`)
  cleanup(repo)
}

// ── case c: render mode controls the preview check ──
console.log('case c — render=push waives preview; render=dev requires a reachable URL')
{
  const repo = scaffold()
  const unreachable = { probe: async () => false, cliCheck: () => true, claudeCheck: () => true }
  const devNoUrl = await preflight({ dir: repo, env: {}, ...GREEN }) // dev, no THEME_PREVIEW_URL
  eq(check(devNoUrl, 'preview').ok, false, 'dev + no preview URL → preview check fails')
  eq(devNoUrl.ready, false, 'dev + no preview → NOT-READY')

  const devUnreachable = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...unreachable })
  eq(check(devUnreachable, 'preview').ok, false, 'dev + unreachable URL → preview check fails')

  const push = await preflight({ dir: repo, env: {}, renderMode: 'push', ...GREEN })
  eq(check(push, 'preview').ok, true, 'render=push → preview check waived (ok)')
  eq(push.ready, true, 'render=push ready without a preview URL')
  cleanup(repo)
}

// ── case d: driver controls the consultant check ──
console.log('case d — driver=cli requires claude; driver=workflow waives it')
{
  const repo = scaffold()
  const noClaude = { probe: async () => true, cliCheck: () => true, claudeCheck: () => false }
  const cli = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://x:9292' }, driver: 'cli', ...noClaude })
  eq(check(cli, 'consultant').ok, false, 'cli driver + no claude → consultant check fails')
  eq(cli.ready, false, 'cli driver + no claude → NOT-READY')

  const wf = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://x:9292' }, driver: 'workflow', ...noClaude })
  eq(check(wf, 'consultant').ok, true, 'workflow driver → consultant check waived (agent, not CLI)')
  eq(wf.ready, true, 'workflow driver ready without claude CLI')
  cleanup(repo)
}

// ── case e: shopify CLI missing blocks both modes ──
console.log('case e — missing shopify CLI blocks readiness')
{
  const repo = scaffold()
  const noCli = { probe: async () => true, cliCheck: () => false, claudeCheck: () => true }
  const res = await preflight({ dir: repo, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...noCli })
  eq(check(res, 'shopify-cli').ok, false, 'shopify CLI missing → check fails')
  eq(res.ready, false, 'shopify CLI missing → NOT-READY')
  cleanup(repo)
}

// ── case f: formatChecklist renders verdict + fix lines ──
console.log('case f — formatChecklist output')
{
  const repo = scaffold('discovery')
  const res = await preflight({ dir: repo, env: {}, ...GREEN })
  const text = formatChecklist(res)
  eq(/NOT-READY/.test(text), true, 'checklist shows NOT-READY verdict')
  eq(/fix:/.test(text), true, 'checklist shows a fix line for the failure')
  const repo2 = scaffold()
  const ready = formatChecklist(await preflight({ dir: repo2, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...GREEN }))
  eq(/READY/.test(ready) && !/NOT-READY/.test(ready), true, 'all-green checklist shows READY')
  cleanup(repo); cleanup(repo2)
}

console.log(failures === 0 ? '\n✓ MAESTRO-PREFLIGHT — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
