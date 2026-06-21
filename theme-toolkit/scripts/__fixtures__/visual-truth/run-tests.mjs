import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-visual-truth.mjs')
let failures = 0
const ok = m => console.log('  PASS  ' + m), bad = m => { console.log('  FAIL  ' + m); failures++ }
function run(dir, env = {}) {
  const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env: { ...process.env, ...env }, encoding: 'utf-8' })
  let rep = null; try { rep = JSON.parse(require('fs').readFileSync(path.join(HERE, dir, 'gate-reports', 'visual-truth.json'), 'utf-8')) } catch {}
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
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(tmp, 'gate-reports', 'visual-truth.json'), 'utf-8')) } catch {}
  const ids = new Set((rep?.blockers || []).map(b => b.id))
  r.status === 1 ? ok('exit 1 (block)') : bad(`expected 1 got ${r.status}; blockers=${[...ids].join(', ')}`)
  ids.has('vt.coverage-unjudged') ? ok('blocker: vt.coverage-unjudged') : bad(`missing vt.coverage-unjudged (saw ${[...ids].join(', ')})`)
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
