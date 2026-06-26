#!/usr/bin/env node
// Self-test for check-a11y-static.mjs (gate #16). Scope via section-reuse-map (non-git). A11Y_STRICT=1
// promotes findings to blockers. Run (Node 20): node scripts/__fixtures__/a11y-static/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-a11y-static.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function build(heroHtml) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(d, 'sections', 'hero.liquid'), `<section class="hero">${heroHtml}</section>{% schema %}{}{% endschema %}`)
  fs.writeFileSync(path.join(d, 'section-reuse-map.md'), '# map\n\n| Zone | Section | Rung |\n|---|---|---|\n| hero | hero | CUSTOM |\n')
  return d
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__none__', A11Y_STRICT: '', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'a11y-static.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('conformant (img has alt, real button) → PASS')
{
  const d = build('<img src="{{ x }}" alt="restful hero" width="1600" height="900"><button type="button">Shop</button>')
  const { code, rep } = run(d, { A11Y_STRICT: '1' })
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('img without alt + A11Y_STRICT=1 → BLOCK a11y.img-no-alt')
{
  const d = build('<img src="{{ x }}">')
  const { code, rep } = run(d, { A11Y_STRICT: '1' })
  code === 1 && blockerIds(rep).has('a11y.img-no-alt') ? ok('exit 1 + img-no-alt') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('img without alt in DEV (no STRICT) → warning, exit 0')
{
  const d = build('<img src="{{ x }}">')
  const { code, rep } = run(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'a11y.img-no-alt') ? ok('exit 0 + warning') : bad(`dev: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('autoplay <video> without muted + STRICT → BLOCK a11y.autoplay-media')
{
  const d = build('<video autoplay src="hero.mp4"></video>')
  const { code, rep } = run(d, { A11Y_STRICT: '1' })
  code === 1 && blockerIds(rep).has('a11y.autoplay-media') ? ok('exit 1 + autoplay-media') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('autoplay <video muted> → no autoplay finding (conformant)')
{
  const d = build('<video autoplay muted playsinline src="hero.mp4"></video>')
  const { code, rep } = run(d, { A11Y_STRICT: '1' })
  const ids = new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
  code === 0 && !ids.has('a11y.autoplay-media') ? ok('muted autoplay → no finding') : bad(`muted: code ${code} ids ${[...ids]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('keyframe animation with NO reduced-motion guard → WARN a11y.motion-no-reduced-guard')
{
  const d = build('{% style %}@keyframes pulse{from{opacity:.5}to{opacity:1}}.hero{animation:pulse 2s infinite}{% endstyle %}<h1>Hi</h1>')
  const { code, rep } = run(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'a11y.motion-no-reduced-guard') ? ok('exit 0 + motion warning') : bad(`motion: code ${code} warns ${[...new Set((rep?.warnings || []).map(w => w.id))]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('<img> with no width/height/aspect-ratio → WARN a11y.img-no-dimensions (CLS)')
{
  const d = build('<img src="{{ x }}" alt="hero">') // alt present (isolates the dimension check), no width/height
  const { code, rep } = run(d)
  code === 0 && (rep?.warnings || []).some(w => w.id === 'a11y.img-no-dimensions') ? ok('exit 0 + img-no-dimensions') : bad(`dims: code ${code} warns ${[...new Set((rep?.warnings || []).map(w => w.id))]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('<img> with width+height → no CLS finding; section aspect-ratio CSS → no CLS finding')
{
  const wh = build('<img src="{{ x }}" alt="hero" width="800" height="800">')
  !new Set((run(wh).rep?.warnings || []).map(w => w.id)).has('a11y.img-no-dimensions') ? ok('width+height → no dim finding') : bad('width+height wrongly flagged')
  fs.rmSync(wh, { recursive: true, force: true })
  const ar = build('{% style %}.hero img{aspect-ratio:16/9}{% endstyle %}<img src="{{ x }}" alt="hero">')
  !new Set((run(ar).rep?.warnings || []).map(w => w.id)).has('a11y.img-no-dimensions') ? ok('section aspect-ratio CSS → no dim finding') : bad('aspect-ratio section wrongly flagged')
  fs.rmSync(ar, { recursive: true, force: true })
}

console.log('keyframe animation WITH reduced-motion guard → no motion finding')
{
  const d = build('{% style %}@keyframes pulse{from{opacity:.5}to{opacity:1}}.hero{animation:pulse 2s infinite}@media (prefers-reduced-motion: reduce){.hero{animation:none}}{% endstyle %}<h1>Hi</h1>')
  const { code, rep } = run(d)
  !new Set((rep?.warnings || []).map(w => w.id)).has('a11y.motion-no-reduced-guard') ? ok('guarded motion → no finding') : bad('guarded motion wrongly flagged')
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
