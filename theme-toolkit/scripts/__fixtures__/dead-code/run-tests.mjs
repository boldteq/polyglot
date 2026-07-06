#!/usr/bin/env node
// Self-test for check-antipatterns.mjs (gate #11) — dead-code/bloat. Scope via section-reuse-map
// (non-git). Run (Node 20): node scripts/__fixtures__/antipatterns/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-antipatterns.mjs')
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

// referenced=true → a templates/index.json wires the section type (so it's NOT dead)
function build(section, referenced) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.mkdirSync(path.join(d, 'templates'), { recursive: true })
  fs.writeFileSync(path.join(d, 'sections', `${section}.liquid`), `<section class="${section}">x</section>{% schema %}{}{% endschema %}`)
  fs.writeFileSync(path.join(d, 'templates', 'index.json'), JSON.stringify(referenced ? { sections: { s: { type: section } }, order: ['s'] } : { sections: {}, order: [] }))
  fs.writeFileSync(path.join(d, 'section-reuse-map.md'), `# map\n\n| Zone | Section | Rung |\n|---|---|---|\n| z | ${section} | CUSTOM |\n`)
  return d
}
function run(dir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__none__', DS_REQUIRE_SCOPE: '', ALLOW_AP_WAIVER: '' }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'dead-code.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const blockerIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))

console.log('section referenced by a template → PASS')
{
  const d = build('promo', true)
  const { code, rep } = run(d)
  code === 0 ? ok('exit 0') : bad(`expected 0, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('section in zero templates → BLOCK ap.unreferenced-section')
{
  const d = build('orphan', false)
  const { code, rep } = run(d)
  code === 1 && blockerIds(rep).has('ap.unreferenced-section') ? ok('exit 1 + unreferenced-section') : bad(`expected block, got ${code}; blockers ${[...blockerIds(rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
