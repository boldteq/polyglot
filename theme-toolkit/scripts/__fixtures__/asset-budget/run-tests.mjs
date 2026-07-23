// check-asset-budget's 2 BLOCKING checks were unproven (QA-1).
//
// The budget exists because inline {% stylesheet %} / {% javascript %} blocks ship on every page that
// renders the section — an oversized one is a Core Web Vitals regression the Lighthouse gate only sees
// later, against a live URL. These blocks are the cheap, hermetic early warning, and neither had ever
// been shown to fire.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-asset-budget.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

function run(sections, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  for (const [n, body] of Object.entries(sections)) fs.writeFileSync(path.join(d, 'sections', n), body)
  const reportDir = path.join(d, 'gate-reports')
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, ...env } })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'asset-budget.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}
const section = (css = '', js = '') =>
  `<div class="x">hi</div>\n{% stylesheet %}\n${css}\n{% endstylesheet %}\n{% javascript %}\n${js}\n{% endjavascript %}\n`
const filler = (kb) => `/*${'x'.repeat(kb * 1024)}*/`

console.log('check-asset-budget — both BLOCKING budgets')
{
  const { code, ids } = run({ 'ok.liquid': section('.a{color:red}', 'console.log(1)') })
  code === 0 ? ok('a small section passes') : bad(`small section blocked: [${[...ids].join(', ')}]`)
}
{
  const { code, ids } = run({ 'fat.liquid': section(filler(12)) }) // > 10KB CSS budget
  code === 1 && ids.has('asset-budget.section-css-over') ? ok('oversized inline CSS → section-css-over') : bad(`css: exit ${code} [${[...ids].join(', ')}]`)
}
{
  const { code, ids } = run({ 'fat.liquid': section('', filler(18)) }) // > 15KB JS budget
  code === 1 && ids.has('asset-budget.section-js-over') ? ok('oversized inline JS → section-js-over') : bad(`js: exit ${code} [${[...ids].join(', ')}]`)
}
{
  // the budgets are env-tunable — a project may set its own, and the gate must honour it
  const { code, ids } = run({ 'fat.liquid': section(filler(12)) }, { CSS_BUDGET_KB: '20' })
  code === 0 ? ok('a raised CSS_BUDGET_KB is respected') : bad(`raised budget ignored: [${[...ids].join(', ')}]`)
  const tight = run({ 'ok.liquid': section('.a{color:red}') }, { CSS_BUDGET_KB: '0.001' })
  tight.ids.has('asset-budget.section-css-over') ? ok('a lowered budget catches a small block') : bad('lowered budget not applied')
}
{
  // just under the limit must NOT block — an off-by-one here would fail correct builds
  const { code } = run({ 'edge.liquid': section(filler(9)) })
  code === 0 ? ok('9KB under a 10KB budget → allowed') : bad('a section under budget was blocked')
}

console.log(failures === 0 ? '\nasset-budget: ALL CASES PASS' : `\nasset-budget: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
