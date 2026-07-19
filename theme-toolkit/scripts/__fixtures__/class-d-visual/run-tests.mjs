// Hermetic fixture test for gate #20 class-d-visual (Class-D micro-change Lens evidence bar).
// Pure/offline: builds tmp gate-reports/lens artifacts + drives CLASS_D_SURFACES — no browser, no net.
// Proves the exact enforcement that closes the 2026-07-18 visual-QA-gap bypass:
//   declared-touched surface with no/failing Lens evidence → BLOCK; nothing declared → N/A pass.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'gate-class-d-visual.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

// Run the gate in a throwaway cwd with optional lens artifacts + env. Returns {code, rep, ids}.
function run({ surfaces, frames, verdicts, env = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-'))
  if (frames) {
    const lensDir = path.join(tmp, 'gate-reports', 'lens', 'judge')
    fs.mkdirSync(lensDir, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'gate-reports', 'lens', 'lens-manifest.json'), JSON.stringify({ previewUrl: 'x', frames }))
    for (const v of verdicts || []) fs.writeFileSync(path.join(lensDir, `${v.surface}-${v.viewport || 'desktop'}.json`), JSON.stringify(v))
  }
  const runEnv = { ...process.env, ...env }
  if (surfaces) runEnv.CLASS_D_SURFACES = surfaces
  const r = spawnSync('node', [GATE], { cwd: tmp, env: runEnv, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'class-d-visual.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(tmp, { recursive: true, force: true })
  return { code: r.status, rep, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('case (a) no Class-D surfaces declared → N/A, expect exit 0 (pass)')
{ const { code } = run({}); code === 0 ? ok('exit 0 (N/A pass)') : bad(`expected 0 got ${code}`) }

console.log('case (b) surface declared but NO Lens capture → expect exit 1 (cd.no-capture)')
{ const { code, ids } = run({ surfaces: 'pdp' })
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  ids.has('cd.no-capture') ? ok('blocker: cd.no-capture') : bad(`missing cd.no-capture (saw ${[...ids].join(', ')})`) }

console.log('case (c) declared + captured + judge PASS ≥ conf → expect exit 0')
{ const { code, ids } = run({
    surfaces: 'home',
    frames: [{ surface: 'home', viewport: 'desktop', nav: 'ok', url: 'x' }],
    verdicts: [{ surface: 'home', viewport: 'desktop', verdict: 'PASS', confidence: 95, findings: [] }],
  })
  code === 0 ? ok('exit 0 (pass)') : bad(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`) }

console.log('case (d) declared + captured + judge FAIL → expect exit 1 (cd.frame-fail)')
{ const { code, ids } = run({
    surfaces: 'home',
    frames: [{ surface: 'home', viewport: 'desktop', nav: 'ok', url: 'x' }],
    verdicts: [{ surface: 'home', viewport: 'desktop', verdict: 'FAIL', confidence: 90, findings: [{ check: 'hollow-hero', severity: 'blocker', evidence: 'empty hero' }] }],
  })
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  ids.has('cd.frame-fail') ? ok('blocker: cd.frame-fail') : bad(`missing cd.frame-fail (saw ${[...ids].join(', ')})`) }

console.log('case (e) declared + captured but NO judge verdict → expect exit 1 (cd.no-verdict)')
{ const { code, ids } = run({
    surfaces: 'home',
    frames: [{ surface: 'home', viewport: 'desktop', nav: 'ok', url: 'x' }],
    verdicts: [],
  })
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  ids.has('cd.no-verdict') ? ok('blocker: cd.no-verdict') : bad(`missing cd.no-verdict (saw ${[...ids].join(', ')})`) }

console.log('case (f) declared + captured with horizontal overflow → expect exit 1 (cd.overflow)')
{ const { code, ids } = run({
    surfaces: 'pdp',
    frames: [{ surface: 'pdp', viewport: 'mobile', nav: 'ok', url: 'x', overflowPx: 40 }],
    verdicts: [{ surface: 'pdp', viewport: 'mobile', verdict: 'PASS', confidence: 95, findings: [] }],
  })
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  ids.has('cd.overflow') ? ok('blocker: cd.overflow') : bad(`missing cd.overflow (saw ${[...ids].join(', ')})`) }

console.log('case (g) low judge confidence on a money surface → expect exit 1 (cd.low-confidence)')
{ const { code, ids } = run({
    surfaces: 'pdp',
    frames: [{ surface: 'pdp', viewport: 'desktop', nav: 'ok', url: 'x' }],
    verdicts: [{ surface: 'pdp', viewport: 'desktop', verdict: 'PASS', confidence: 70, findings: [] }],
  })
  code === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${code}`)
  ids.has('cd.low-confidence') ? ok('blocker: cd.low-confidence') : bad(`missing cd.low-confidence (saw ${[...ids].join(', ')})`) }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
