#!/usr/bin/env node
// Self-test for #35 — mobile-layout (pure helpers + the gate end to end).
// Run (Node 20): node scripts/__fixtures__/mobile-layout/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { viewportMetaOk, fontFloorGaps, tapTargetGaps, hoverOnlyGaps, overflowGuardGaps } from '../../check-mobile-layout.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-mobile-layout.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('viewportMetaOk')
eq(viewportMetaOk('<meta name="viewport" content="width=device-width, initial-scale=1">'), true, 'present + device-width → true')
eq(viewportMetaOk('<meta name="viewport" content="width=1024">'), false, 'fixed width → false')
eq(viewportMetaOk('<head></head>'), false, 'absent → false')

console.log('fontFloorGaps')
eq(fontFloorGaps('.x{font-size:11px}').map(g => g.severityHint), ['block'], '11px → block-eligible')
eq(fontFloorGaps('.x{font-size:13px}').map(g => g.severityHint), ['warn'], '13px → warn')
eq(fontFloorGaps('.x{font-size:16px}'), [], '16px → none')

console.log('tapTargetGaps')
tapTargetGaps('.btn{height:30px}').length === 1 ? pass('.btn height 30px → gap') : fail('missed tiny .btn')
eq(tapTargetGaps('.btn{min-height:48px}'), [], '.btn ≥44px → none')
eq(tapTargetGaps('.card{height:20px}'), [], 'non-interactive .card → none')

console.log('hoverOnlyGaps')
hoverOnlyGaps('.btn:hover{color:red}').length === 1 ? pass(':hover with no peer → gap') : fail('missed hover-only')
eq(hoverOnlyGaps('.btn:hover{color:red}.btn:focus{color:red}'), [], ':hover + :focus peer → none')

console.log('overflowGuardGaps')
overflowGuardGaps('.full{width:100vw}').length === 1 ? pass('100vw no guard → gap') : fail('missed 100vw')
eq(overflowGuardGaps('.full{width:100vw;overflow-x:clip}'), [], '100vw + overflow-x:clip → none')
eq(overflowGuardGaps('.x{width:100%}'), [], '100% → none')

console.log('gate end to end')
function build({ viewport, sectionCss }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-'))
  fs.mkdirSync(path.join(d, 'layout'), { recursive: true })
  fs.writeFileSync(path.join(d, 'layout', 'theme.liquid'), `<!doctype html><head>${viewport ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : ''}</head><body>{{ content_for_layout }}</body>`)
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(d, 'sections', 'hero-custom.liquid'), `<section class="hero">{% style %}${sectionCss}{% endstyle %}</section>{% schema %}{}{% endschema %}`)
  fs.writeFileSync(path.join(d, 'section-reuse-map.md'), '# map\n\n| Zone | Section | Rung |\n|---|---|---|\n| hero | hero-custom | CUSTOM |\n')
  return d
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__none__', MOBILE_ENFORCE: '', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'mobile-layout.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const ids = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))

{
  const d = build({ viewport: true, sectionCss: '.hero{font-size:16px}.btn{min-height:48px}.btn:hover{color:red}.btn:focus{color:red}' })
  const { code, rep } = run(d)
  code === 0 && (rep?.blockers || []).length === 0 ? pass('conformant → exit 0, no blockers') : fail(`conformant: code ${code} ids ${[...ids(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = build({ viewport: false, sectionCss: '.hero{font-size:11px}.btn{height:30px}.promo:hover{color:red}.full{width:100vw}' })
  const dev = run(d)
  dev.code === 0 && ids(dev.rep).has('mobile.viewport-meta') && ids(dev.rep).has('mobile.font-floor') ? pass('violations (dev) → warnings, exit 0') : fail(`dev: code ${dev.code} ids ${[...ids(dev.rep)]}`)
  const strict = run(d, { MOBILE_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'mobile.viewport-meta') && (strict.rep?.blockers || []).some(b => b.id === 'mobile.font-floor') ? pass('violations + MOBILE_ENFORCE → BLOCK (viewport-meta + sub-12 font)') : fail(`enforce: code ${strict.code} blockers ${JSON.stringify((strict.rep?.blockers || []).map(b => b.id))}`)
  // tap-target / hover-only / overflow-guard are warnings even at enforce
  ids(strict.rep).has('mobile.tap-target') && ids(strict.rep).has('mobile.hover-only') && ids(strict.rep).has('mobile.overflow-guard') ? pass('tap-target + hover-only + overflow-guard surfaced') : fail(`missing warn ids: ${[...ids(strict.rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-empty-'))
  const { code, rep } = run(d, { MOBILE_ENFORCE: '1' })
  code === 0 && ids(rep).has('mobile.n-a-no-surface') ? pass('no layout + no surface → SKIP/PASS') : fail(`empty: code ${code} ids ${[...ids(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
