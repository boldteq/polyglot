#!/usr/bin/env node
// Self-test for check-design-system.mjs (#8) — the per-project TOKEN enforcer (Rule 9).
//   (a) clean        (theme vars + on-scale font/spacing/radius) → exit 0
//   (b) violations   (@apply + hardcoded hex + off-scale font + off-scale spacing) → exit 1
//   (c) comment-safe (a "no Tailwind" COMMENT + clean code) → exit 0 — guards the 2026-06-19 FP fix
//       (ds.tailwind/ds.second-token must scan COMMENT-STRIPPED text, not raw)
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-design-system.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function run(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', ALLOW_DS_WAIVER: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-tokens.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) }
}

console.log('case (a) clean (theme vars + on-scale) → expect exit 0')
{ const { code } = run('clean'); code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}`) }

console.log('case (b) violations (@apply + hex + off-scale font + off-scale spacing) → expect exit 1')
{ const { code, ids } = run('violations')
  code === 1 ? pass('exit 1 (block)') : fail(`expected 1 got ${code}`)
  for (const id of ['ds.tailwind', 'ds.color-hex', 'ds.font-size', 'ds.spacing'])
    ids.has(id) ? pass(`blocker: ${id}`) : fail(`missing blocker ${id} (saw ${[...ids].join(', ') || 'none'})`) }

console.log('case (c) comment-safe ("no Tailwind" comment + clean code) → expect exit 0, NO ds.tailwind FP')
{ const { code, ids } = run('comment-safe')
  code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`)
  !ids.has('ds.tailwind') ? pass('no ds.tailwind false-positive on a comment') : fail('ds.tailwind FP fired on a comment') }

// ── CB-1: --ds-* is THIS toolkit's own token system, not a bolted-on one ──────────────────
// Until 2026-07-23 this gate flagged --ds-* as ds.second-token while gate #30 (ds-cascade) emitted
// exactly those vars from the toolkit's own generator and WARNED when sections failed to bind to
// them. Doing what the cascade asked tripped a blocker here, so the cascade was unusable: wiring it
// on cravinbyandy traded 150 colour blockers for 15 ds.second-token ones. Foreign systems (--tw-*)
// must still block.
console.log('case (d) a section bound to var(--ds-*) is NOT a second token system')
{ const { code, ids } = run('ds-cascade-binding')
  !ids.has('ds.second-token') ? pass('--ds-* accepted (the cascade is usable)') : fail('ds.second-token fired on the toolkit\'s own tokens')
  code === 0 ? pass('exit 0') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`) }

console.log('case (e) a FOREIGN token system (--tw-*) still blocks')
{ const { ids } = run('tw-foreign')
  ids.has('ds.second-token') ? pass('--tw-* still flagged') : fail('the foreign-system check was disarmed') }

// ── QA-1: three BLOCKING checks here had never been proven to fire ───────────────────────
console.log('case (f) off-token border-radius → ds.radius')
{ const { code, ids } = run('radius-drift')
  ids.has('ds.radius') ? pass('7px is not in radius.tokens [4, 8] → blocked') : fail(`got [${[...ids].join(', ')}]`)
  code === 1 ? pass('exit 1') : fail(`expected exit 1, got ${code}`) }

console.log('case (g) no design-system.json at all → ds.missing (design-system-first)')
{ const { code, ids } = run('no-contract')
  ids.has('ds.missing') ? pass('a build with no locked design system is blocked') : fail(`got [${[...ids].join(', ')}]`)
  code === 1 ? pass('exit 1') : fail(`expected exit 1, got ${code}`) }

console.log('case (h) unresolvable scope at publish grade → ds.scope-unresolved-strict')
{
  // DS_REQUIRE_SCOPE=1 is the publish posture: if the gate cannot work out WHAT to scan it must
  // block, not quietly scan nothing — the cravinbyandy failure that started this whole workstream.
  const { code, ids } = run('clean', { DS_REQUIRE_SCOPE: '1', BASE_REF: '__no_such_base__', REUSE_MAP: '__none__.md' })
  ids.has('ds.scope-unresolved-strict') ? pass('unresolvable scope blocks at publish grade') : fail(`got [${[...ids].join(', ')}]`)
  code === 1 ? pass('exit 1') : fail(`expected exit 1, got ${code}`)
  // ...and at DEV grade the same state must NOT block (a false block would stall every local run)
  const dev = run('clean', { BASE_REF: '__no_such_base__', REUSE_MAP: '__none__.md' })
  dev.code === 0 ? pass('dev grade: same state warns, does not block') : fail(`dev grade blocked (exit ${dev.code})`)
}

console.log('\nspacing scope — positioning and formulas are NOT spacing (2026-07-23)')
{
  // A false BLOCK is as damaging as a false pass. `top: 33.5rem` is a geometric OFFSET that places an
  // element, not rhythm between elements; and a number inside calc()/max()/clamp() is a constant in a
  // responsive formula (max(0px, calc(47vw - 655px - 7rem))) — snapping it to a scale step would
  // change the geometry. 24 of cravinbyandy's 290 ds.spacing findings were these two shapes.
  const tmp = (css) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dsx-'))
    fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
    fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
    fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'),
      JSON.stringify({ typography: { allowed_px: [16, 32] }, spacing: { scale: [8, 16, 24] } }))
    // scope comes from the reuse map (same shape the sibling fixture dirs use) — with no base ref and
    // no map the gate correctly declines to scan, which would make every case below vacuous.
    // NB the map parser needs a section name of 2+ chars (/[a-z0-9][a-z0-9_-]+/) — a 1-char name
    // silently yields an empty scope and every assertion below would pass vacuously.
    fs.writeFileSync(path.join(d, 'section-reuse-map.md'), '# reuse map\n| Frame | section | Rung |\n|---|---|---|\n| Probe | probe | CUSTOM |\n')
    fs.writeFileSync(path.join(d, 'sections', 'probe.liquid'),
      `{% style %}\n${css}\n{% endstyle %}\n<div class="probe"></div>\n{% schema %}{ "name": "Probe" }{% endschema %}\n`)
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'))
    spawnSync('node', [GATE], { cwd: d, env: { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', ALLOW_DS_WAIVER: '' }, encoding: 'utf-8' })
    let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-tokens.json'), 'utf-8')) } catch { /* */ }
    fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(reportDir, { recursive: true, force: true })
    return (rep?.blockers || []).filter(b => b.id === 'ds.spacing')
  }

  tmp('.a { top: 33.5rem; left: 13px; right: 7px; bottom: 3px; }').length === 0
    ? pass('positioning (top/right/bottom/left) is not held to the spacing scale') : fail('positioning still flagged as spacing')
  tmp('.a { padding-top: max(0px, calc(47vw - 655px - 7rem)); }').length === 0
    ? pass('a constant inside calc()/max() is not snapped to the scale') : fail('formula constant still flagged')

  // ...and the rule must still BITE on real spacing, or this fix would have gutted the gate
  tmp('.a { padding: 13px; }').length > 0 ? pass('off-scale padding still blocks') : fail('padding no longer checked')
  tmp('.a { gap: 10px; }').length > 0 ? pass('off-scale gap still blocks') : fail('gap no longer checked')
  tmp('.a { margin-top: 18px; }').length > 0 ? pass('off-scale margin-top still blocks') : fail('margin-top no longer checked')
  tmp('.a { padding: 16px; gap: 24px; }').length === 0 ? pass('on-scale values stay clean') : fail('false positive on on-scale values')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
