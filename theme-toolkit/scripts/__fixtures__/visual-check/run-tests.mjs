import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-visual-truth.mjs')
let failures = 0
const ok = m => console.log('  PASS  ' + m), bad = m => { console.log('  FAIL  ' + m); failures++ }
function run(dir, env = {}) {
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env: { ...process.env, ...env }, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(require('fs').readFileSync(path.join(HERE, dir, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  return { code: r.status, out: r.stdout + r.stderr, rep }
}
import fs from 'node:fs'
import os from 'node:os'
global.require = (m) => (m === 'fs' ? fs : null)
console.log('case (a) clean (facts clean + judge PASS ≥80) → expect exit 0')
{ const { code, rep } = run('clean'); code === 0 ? ok('exit 0 (pass)') : bad(`expected 0 got ${code}; blockers=${JSON.stringify(rep?.blockers?.map(b=>b.id))}`) }
console.log('case (b) broken (overflow + render-error + judge FAIL + low-conf + blocker + systemic) → expect exit 1')
{ const { code, rep } = run('broken'); const ids = new Set((rep?.blockers||[]).map(b=>b.id))
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  for (const id of ['vt.overflow','vt.render-error','vt.frame-fail','vt.low-confidence','vt.blocker-finding','vt.inconsistent'])
    ids.has(id) ? ok(`blocker: ${id}`) : bad(`missing blocker ${id} (saw ${[...ids].join(', ')})`) }
console.log('case (c) coverage: a captured frame with no judge verdict (publish-grade) → expect exit 1 (vt.coverage-unjudged)')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-cov-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens')
  fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', frames: [
    { surface: 'home', viewport: 'desktop', theme: 'light', nav: 'ok', url: 'x', frames: { rest: '', scrollEnd: '' } },
    { surface: 'home', viewport: 'mobile', theme: 'light', nav: 'ok', url: 'x', frames: { rest: '', scrollEnd: '' } },
  ] }))
  // only the desktop frame is judged → the mobile frame is captured-but-unjudged
  fs.writeFileSync(path.join(lensDir, 'judge', 'home-desktop.json'), JSON.stringify({ surface: 'home', viewport: '1440x900', verdict: 'PASS', confidence: 95, findings: [] }))
  const r = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, DS_REQUIRE_SCOPE: '1' }, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  r.status === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${r.status}; blockers=${[...ids].join(', ')}`)
  ids.has('vt.coverage-unjudged') ? ok('blocker: vt.coverage-unjudged') : bad(`missing vt.coverage-unjudged (saw ${[...ids].join(', ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('case (d) cart drawer captured but did NOT open (BUG-1/BUG-2) → expect exit 1 (vt.cart-drawer-not-open)')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-drawer-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens'); fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', frames: [
    { surface: 'pdp', viewport: 'mobile', theme: 'light', state: 'drawer', key: 'pdp-mobile-drawer', nav: 'ok', url: 'x', frames: { rest: '' }, drawerOpened: { opened: false, reason: 'no toggle opened a visible cart drawer' } },
  ] }))
  // judge it PASS so the ONLY thing that can block is the DETERMINISTIC drawer-not-open fact (vision can't be relied on to notice a missing drawer)
  fs.writeFileSync(path.join(lensDir, 'judge', 'pdp-mobile-drawer.json'), JSON.stringify({ surface: 'pdp', viewport: '375x812', key: 'pdp-mobile-drawer', verdict: 'PASS', confidence: 95, findings: [] }))
  const r = spawnSync('node', [GATE], { cwd: tmp, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  r.status === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${r.status}; blockers=${[...ids].join(', ')}`)
  ids.has('vt.cart-drawer-not-open') ? ok('blocker: vt.cart-drawer-not-open') : bad(`missing vt.cart-drawer-not-open (saw ${[...ids].join(', ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log('case (e) cart drawer opened OK → NO drawer-not-open blocker')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-drawer-ok-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens'); fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', frames: [
    { surface: 'pdp', viewport: 'mobile', theme: 'light', state: 'drawer', key: 'pdp-mobile-drawer', nav: 'ok', url: 'x', frames: { rest: '' }, drawerOpened: { opened: true, via: '[data-cart-drawer-toggle]' } },
  ] }))
  fs.writeFileSync(path.join(lensDir, 'judge', 'pdp-mobile-drawer.json'), JSON.stringify({ surface: 'pdp', viewport: '375x812', key: 'pdp-mobile-drawer', verdict: 'PASS', confidence: 95, findings: [] }))
  const r = spawnSync('node', [GATE], { cwd: tmp, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  !ids.has('vt.cart-drawer-not-open') ? ok('no false drawer-not-open blocker when it opened') : bad('false drawer-not-open blocker on an opened drawer')
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('case (f) STALE capture at publish-grade (BUG-20) → expect exit 1 (vt.capture-stale)')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-stale-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens'); fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', capturedAt_ms: Date.now() - 60 * 60_000 /* 1h ago > 30m TTL */, frames: [
    { surface: 'home', viewport: 'desktop', theme: 'light', key: 'home-desktop', nav: 'ok', url: 'x', frames: { rest: '', scrollEnd: '' } },
  ] }))
  fs.writeFileSync(path.join(lensDir, 'judge', 'home-desktop.json'), JSON.stringify({ surface: 'home', viewport: '1440x900', key: 'home-desktop', verdict: 'PASS', confidence: 95, findings: [] }))
  const r = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, DS_REQUIRE_SCOPE: '1' }, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  r.status === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${r.status}; blockers=${[...ids].join(', ')}`)
  ids.has('vt.capture-stale') ? ok('blocker: vt.capture-stale') : bad(`missing vt.capture-stale (saw ${[...ids].join(', ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log('case (g) FRESH capture → NO stale blocker')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-fresh-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens'); fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', capturedAt_ms: Date.now(), frames: [
    { surface: 'home', viewport: 'desktop', theme: 'light', key: 'home-desktop', nav: 'ok', url: 'x', frames: { rest: '', scrollEnd: '' } },
  ] }))
  fs.writeFileSync(path.join(lensDir, 'judge', 'home-desktop.json'), JSON.stringify({ surface: 'home', viewport: '1440x900', key: 'home-desktop', verdict: 'PASS', confidence: 95, findings: [] }))
  const r = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, DS_REQUIRE_SCOPE: '1' }, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  !ids.has('vt.capture-stale') ? ok('no false stale blocker on a fresh capture') : bad('false vt.capture-stale on a fresh capture')
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ── QA-1: five Layer-1 blockers had never been proven to fire ────────────────────────────
// Layer 1 is the deterministic half of Lens — facts a screenshot cannot lie about. These are the
// findings that say a shopper would be looking at a broken page, so an unproven one is the worst
// kind: the gate would report visual truth while never checking it.
function lensRun(frames, { judge = {}, env = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-qa1-'))
  const lensDir = path.join(tmp, 'gate-reports', 'lens')
  fs.mkdirSync(path.join(lensDir, 'judge'), { recursive: true })
  fs.writeFileSync(path.join(lensDir, 'lens-manifest.json'),
    JSON.stringify({ previewUrl: 'x', capturedAt_ms: Date.now(), frames }))
  for (const [name, v] of Object.entries(judge)) fs.writeFileSync(path.join(lensDir, 'judge', name), JSON.stringify(v))
  const r = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  fs.rmSync(tmp, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) }
}
const FRAME = { surface: 'home', viewport: 'desktop', theme: 'light', nav: 'ok', url: 'x', frames: { rest: '' } }
const PASSING_JUDGE = { 'home-desktop.json': { surface: 'home', viewport: 'desktop', verdict: 'PASS', confidence: 95, findings: [], passed_checks: ['a'] } }

console.log('case (d) a Liquid error rendered into the page → vt.liquid-error')
{
  const { ids } = lensRun([{ ...FRAME, liquidError: 'Liquid error: undefined method' }], { judge: PASSING_JUDGE })
  ids.has('vt.liquid-error') ? ok('a Liquid error on the rendered page is blocked') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (e) broken images (naturalWidth=0) → vt.broken-image')
{
  const { ids } = lensRun([{ ...FRAME, brokenImages: ['/a.jpg', '/b.jpg'] }], { judge: PASSING_JUDGE })
  ids.has('vt.broken-image') ? ok('broken images are blocked') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (f) navigation failed → vt.nav-failed')
{
  const { ids } = lensRun([{ ...FRAME, nav: 'timeout' }], { judge: PASSING_JUDGE })
  ids.has('vt.nav-failed') ? ok('a surface that never loaded is blocked') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (g) publish-grade with NO capture at all → vt.capture-missing')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vt-nocap-'))
  fs.mkdirSync(path.join(tmp, 'gate-reports'), { recursive: true })
  const r = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, LENS_REQUIRE: '1' }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-check.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  ids.has('vt.capture-missing') ? ok('no Lens capture at publish grade is blocked') : bad(`got [${[...ids].join(', ')}]`)
  r.status === 1 ? ok('exit 1') : bad(`expected exit 1, got ${r.status}`)
  // ...and in DEV the same state must only warn — a false block would stop every local run
  const dev = spawnSync('node', [GATE], { cwd: tmp, env: { ...process.env, LENS_REQUIRE: '', DS_REQUIRE_SCOPE: '' }, encoding: 'utf-8' })
  dev.status === 0 ? ok('dev grade: no capture warns, does not block') : bad(`dev blocked (exit ${dev.status})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('case (h) captured frames but NO judge verdicts at publish grade → vt.judge-missing')
{
  const { ids } = lensRun([FRAME], { judge: {}, env: { LENS_REQUIRE: '1' } })
  ids.has('vt.judge-missing') ? ok('Layer 2 never run is blocked at publish grade') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('case (i) NO false blocks — a clean frame + passing judge raises none of them')
{
  const { ids } = lensRun([FRAME], { judge: PASSING_JUDGE })
  const bad5 = [...ids].filter(i => /liquid-error|broken-image|nav-failed|capture-missing|judge-missing/.test(i))
  bad5.length === 0 ? ok('a healthy capture raises none of the five') : bad(`false blocks: ${bad5.join(', ')}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
