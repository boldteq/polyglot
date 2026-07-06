#!/usr/bin/env node
// Self-test for check-consistency.mjs (gate #9) — store-wide DGS consistency. Scope via section-reuse-map
// (non-git) + a design-system.json contract. Run (Node 20): node scripts/__fixtures__/consistency/run-tests.mjs · Exit 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-consistency.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function build(sectionCss, bodyHtml = '') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'consist-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'), JSON.stringify({ typography: {}, radius: { tokens: { sm: 4, md: 8 } }, buttons: { variants: { primary: {}, secondary: {} } } }))
  fs.writeFileSync(path.join(d, 'sections', 'promo.liquid'), `<section class="promo">{% style %}${sectionCss}{% endstyle %}${bodyHtml}</section>{% schema %}{}{% endschema %}`)
  fs.writeFileSync(path.join(d, 'section-reuse-map.md'), '# map\n\n| Zone | Section | Rung |\n|---|---|---|\n| promo | promo | CUSTOM |\n')
  return d
}
function run(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consist-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__none__', DS_REQUIRE_SCOPE: '', ALLOW_DS_WAIVER: '', ...extraEnv }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'consistency.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('≤6 distinct font-sizes → PASS')
{
  const d = build('.a{font-size:16px}.b{font-size:24px}')
  const { code, rep } = run(d)
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('7 distinct font-sizes → BLOCK consistency.font-size-variety')
{
  const d = build('.a{font-size:11px}.b{font-size:13px}.c{font-size:15px}.d{font-size:17px}.e{font-size:19px}.f{font-size:21px}.g{font-size:23px}')
  const { code, rep } = run(d)
  code === 1 && blockerIds(rep).has('consistency.font-size-variety') ? ok('exit 1 + font-size-variety') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('≤3 font-weights → PASS (one type voice)')
{
  const d = build('.a{font-weight:400}.b{font-weight:600}.c{font-weight:bold}') // 400,600,700 = 3 ≤ cap
  const { code, rep } = run(d)
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('4 distinct font-weights → BLOCK consistency.font-weight-variety (BUG-7/D5)')
{
  const d = build('.a{font-weight:400}.b{font-weight:500}.c{font-weight:600}.d{font-weight:700}')
  const { code, rep } = run(d)
  code === 1 && blockerIds(rep).has('consistency.font-weight-variety') ? ok('exit 1 + font-weight-variety') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('button zoo: dev = WARN (not block), publish-grade = BLOCK (BUG-8)')
{
  const d = build('', '<a class="btn-fancy">a</a><a class="btn-weird">b</a><a class="cta-special">c</a>') // 3 > allowed 2
  const dev = run(d) // DS_REQUIRE_SCOPE='' → warn only
  dev.code === 0 && new Set((dev.rep?.warnings || []).map(w => w.id)).has('consistency.button-variety') ? ok('dev: exit 0 + button-variety WARNING') : bad(`dev expected warn+pass, got code ${dev.code}; warns ${[...new Set((dev.rep?.warnings || []).map(w => w.id))]}`)
  const pub = run(d, { DS_REQUIRE_SCOPE: '1' }) // publish-grade → block
  pub.code === 1 && blockerIds(pub.rep).has('consistency.button-variety') ? ok('publish: exit 1 + button-variety BLOCK') : bad(`publish expected block, got ${pub.code}; blockers ${[...blockerIds(pub.rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
