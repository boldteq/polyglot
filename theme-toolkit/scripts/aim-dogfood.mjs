#!/usr/bin/env node
// aim:dogfood — the HERMETIC adversarial proof of AIM's "never falsely say done" forcing-functions.
// It assembles realistic temp theme-repos and TRIES TO REFUTE each guard with the REAL toolkit scripts
// (no live store, no claude, no Playwright). Every refutation MUST be blocked; a guard that fails to
// block is a real bug. This is the integration layer above the unit fixtures (which inject fakes): it
// proves the guards COMPOSE on a real-shaped repo. The live-store dogfood (≥2 stores) is still owed —
// this is everything provable without store access.
//
// Run (Node 20): node aim-dogfood.mjs   ·   pnpm aim:dogfood
// Exit: 0 = every refutation was correctly BLOCKED · 1 = a guard failed to block (bug) · 2 = harness error.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { preflight } from './maestro-preflight.mjs'
import { consolidateEscalation } from './maestro-escalate.mjs'
import { status } from './maestro-status.mjs'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))
const node = process.execPath
const sp = (script, args, env, cwd) => spawnSync(node, [path.join(SCRIPTS, script), ...args], { cwd, encoding: 'utf-8', env: { ...process.env, ...env } })
const GREEN = { probe: async () => true, cliCheck: () => true, claudeCheck: () => true }

let fails = 0
const ok = (m) => console.log(`  ✓ BLOCKED — ${m}`)
const bad = (m) => { console.log(`  ✗ NOT BLOCKED (BUG) — ${m}`); fails += 1 }
const note = (m) => console.log(`    ${m}`)

// scaffold a temp repo; `have` lists which foundation artifacts to include
function repo(have = []) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-dogfood-'))
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), body) }
  if (have.includes('goals')) w('docs/discovery/goals.json', JSON.stringify({ conversion: { cvr_target_pct: 2.8 } }))
  if (have.includes('brand')) w('docs/design/brand-direction.md', '# Brand Direction\n5 adjectives.\n')
  if (have.includes('ds')) w('docs/design/design-system.json', JSON.stringify({ typography: { fonts: { heading: 'Fraunces' } } }))
  if (have.includes('briefs')) { w('content/sitemap.md', '# Sitemap\n- home\n'); w('content/briefs/home.md', '# Home\n') }
  if (have.includes('spec')) w('docs/design/design-spec.md', '# Design spec\n')
  if (have.includes('lock')) w('.boldteq-theme-lock.json', JSON.stringify({ version: 1, store: 'demo.myshopify.com', themeId: '123', role: 'unpublished', singleTheme: true }))
  if (have.includes('buildstate')) w('docs/build-state.json', JSON.stringify({ surfaces: [{ surface: 'home', status: 'todo' }] }))
  return d
}
const rm = (d) => fs.rmSync(d, { recursive: true, force: true })

console.log('AIM hermetic adversarial dogfood — trying to REFUTE every "never falsely say done" guard\n')

// ── R1: dispatch refusal — no discovery (goals.json) → preflight NOT-READY ──
console.log('R1 — start a build with NO discovery (goals.json missing)')
{
  const d = repo(['ds', 'briefs', 'spec', 'lock', 'buildstate'])
  const r = await preflight({ dir: d, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...GREEN })
  const c = r.checks.find(x => x.id === 'discovery')
  if (!r.ready && c && !c.ok) ok('preflight refuses to start without goals.json (#0.4)')
  else bad(`preflight let a no-discovery build through (ready=${r.ready}, discovery.ok=${c?.ok})`)
  rm(d)
}

// ── R2: decision #3 — foundation present but NO briefs/design-spec → handoff-contracts blocks ──
console.log('R2 — foundation present but the build-input contracts (briefs + design-spec) are MISSING')
{
  const d = repo(['goals', 'brand', 'ds', 'lock', 'buildstate']) // no briefs, no spec
  const r = await preflight({ dir: d, env: { THEME_PREVIEW_URL: 'http://x:9292' }, ...GREEN })
  const c = r.checks.find(x => x.id === 'handoff-contracts')
  const disc = r.checks.find(x => x.id === 'discovery')
  if (!r.ready && c && !c.ok && disc?.ok) ok('preflight refuses the build loop without content_briefs_ready + design_spec_ready (decision #3)')
  else bad(`handoff-contracts did not block (ready=${r.ready}, handoff.ok=${c?.ok}, discovery.ok=${disc?.ok})`)
  rm(d)
}

// ── R3: check:handoff — dispatch a contract whose inputs are absent ──
console.log('R3 — dispatch content_briefs_ready with no intake artifacts')
{
  const d = repo([])
  const r = sp('check-handoff-contract.mjs', ['content_briefs_ready'], {}, d)
  if (r.status === 1) ok('check:handoff refuses dispatch (exit 1) when inputs are missing')
  else bad(`check:handoff did not refuse (exit ${r.status})`)
  rm(d)
}

// ── R4: THE LINCHPIN — gate #18 must BLOCK at publish grade with no Lens evidence, only WARN at dev grade ──
console.log('R4 — converge-looking repo with NO Lens evidence; grade gate #18 at dev vs publish')
{
  const d = repo(['goals', 'brand', 'ds', 'briefs', 'spec', 'lock', 'buildstate'])
  const dev = sp('theme-gates.mjs', ['--gate', 'visual-truth'], {}, d)               // dev grade
  const pub = sp('theme-gates.mjs', ['--gate', 'visual-truth'], { LENS_REQUIRE: '1' }, d) // publish grade
  if (pub.status === 1 && dev.status === 0) ok('#18 visual-truth BLOCKS at publish grade (LENS_REQUIRE=1) but only WARNS at dev grade — exactly the linchpin')
  else if (pub.status !== 1) bad(`#18 did NOT block at publish grade (exit ${pub.status}) — a no-Lens build could read as pass`)
  else { ok('#18 blocks at publish grade'); note(`(dev-grade exit was ${dev.status}, expected 0 — non-fatal)`) }
  rm(d)
}

// ── R5: linchpin — gate #0.4 discovery must BLOCK at publish grade, WARN at dev grade ──
console.log('R5 — no goals.json; grade gate #0.4 at dev vs publish')
{
  const d = repo(['ds', 'briefs', 'spec', 'lock', 'buildstate']) // no goals/brand
  const dev = sp('theme-gates.mjs', ['--gate', 'discovery'], {}, d)
  const pub = sp('theme-gates.mjs', ['--gate', 'discovery'], { DS_REQUIRE_SCOPE: '1' }, d)
  if (pub.status === 1 && dev.status === 0) ok('#0.4 discovery BLOCKS at publish grade (DS_REQUIRE_SCOPE=1) but only WARNS at dev grade')
  else if (pub.status !== 1) bad(`#0.4 did NOT block at publish grade (exit ${pub.status})`)
  else { ok('#0.4 blocks at publish grade'); note(`(dev-grade exit was ${dev.status}, expected 0 — non-fatal)`) }
  rm(d)
}

// ── R6: escalation hatch — a porter store-data finding becomes ONE batched whitelist-tagged question ──
console.log('R6 — a porter (store-data) Lens finding must surface as a batched human question')
{
  const d = repo(['goals', 'brand', 'ds', 'briefs', 'spec', 'lock', 'buildstate'])
  fs.mkdirSync(path.join(d, 'gate-reports/lens'), { recursive: true })
  fs.writeFileSync(path.join(d, 'gate-reports/lens/autofix-escalation.json'), JSON.stringify({ rounds: 3, unresolved: [{ check: 'empty-collection', severity: 'blocker', fix_owner: 'porter', evidence: 'collection has 0 products' }] }))
  const res = consolidateEscalation({ dir: d, buildStateDir: 'docs' })
  const esc = fs.existsSync(path.join(d, 'docs/ESCALATION.md')) ? fs.readFileSync(path.join(d, 'docs/ESCALATION.md'), 'utf-8') : ''
  const q = res.blocked && res.questions.length === 1 && res.questions[0].whitelist_hit === 'real-asset-missing'
  if (q && /NEEDS YOU/.test(esc)) ok('porter finding → 1 batched question (whitelist: real-asset-missing) in ESCALATION.md + questions.json')
  else bad(`escalation hatch wrong (blocked=${res.blocked}, questions=${res.questions.length}, esc has NEEDS YOU=${/NEEDS YOU/.test(esc)})`)
  // and maestro:status must SURFACE it (the morning snapshot)
  const s = status({ dir: d, buildStateDir: 'docs' })
  if (s.questions === 1) ok('maestro:status surfaces the pending question (Needs you)')
  else bad(`maestro:status did not surface the question (s.questions=${s.questions})`)
  rm(d)
}

// ── R7: publish fail-closed — no publish-readiness / no lock → theme:publish --dry-run must refuse ──
console.log('R7 — attempt publish with no publish-readiness verdict + no theme lock')
{
  const d = repo(['goals', 'brand', 'ds', 'briefs', 'spec'])
  const r = sp('shopify-theme-publish.mjs', ['--dry-run'], {}, d)
  if ((r.status ?? 1) !== 0) ok(`theme:publish --dry-run refuses with no readiness/lock (exit ${r.status})`)
  else bad('theme:publish --dry-run did NOT refuse on a repo with no publish-readiness/lock')
  rm(d)
}

console.log(fails === 0
  ? `\n✓ AIM DOGFOOD — ALL REFUTATIONS BLOCKED. The forcing-functions hold on a real-shaped repo.`
  : `\n✗ AIM DOGFOOD — ${fails} guard(s) FAILED TO BLOCK. Fix before trusting the loop.`)
process.exit(fails === 0 ? 0 : 1)
