import path from 'node:path'; import os from 'node:os'; import fs from 'node:fs'
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-client-overrides.mjs')
let failures = 0; const pass = m => console.log(`  PASS  ${m}`); const fail = m => { console.log(`  FAIL  ${m}`); failures++ }
function run(dir) { const rd = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-')); const r = spawnSync('node', [GATE], { cwd: path.join(HERE, dir), env: { ...process.env, REPORT_DIR: rd }, encoding: 'utf-8' }); let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(rd, 'client-overrides.json'), 'utf-8')) } catch {} fs.rmSync(rd, { recursive: true, force: true }); return { code: r.status, ids: new Set((rep?.blockers || []).map(b => b.id)) } }
console.log('case (a) clean (no carousel, design-system matches pin) → expect exit 0')
{ const { code } = run('clean'); code === 0 ? pass('exit 0') : fail(`expected 0 got ${code}`) }
console.log('case (b) violation (hero carousel + drifted pinned scale) → expect exit 1')
{ const { code, ids } = run('violation'); code === 1 ? pass('exit 1') : fail(`expected 1 got ${code}`)
  for (const id of ['overrides.forbidden-section', 'overrides.design-system-drift']) ids.has(id) ? pass(`blocker: ${id}`) : fail(`missing ${id} (saw ${[...ids].join(', ')})`) }
console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`); process.exit(failures ? 1 : 0)
