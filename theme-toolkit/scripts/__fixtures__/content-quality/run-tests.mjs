#!/usr/bin/env node
// Self-test for #36 — placeholder / dev-leftover / unreplaced-default detector. Pure devLeftovers +
// unreplacedDefaults, then the gate end-to-end. Run (Node 20): node scripts/__fixtures__/placeholder/run-tests.mjs · Exit 0.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { devLeftovers, unreplacedDefaults } from '../../check-placeholder-text.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-placeholder-text.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('devLeftovers — pure')
devLeftovers('© GPT TEST 1.0').some(d => d.id === 'placeholder.dev-leftover') ? pass('"© GPT TEST 1.0" flagged') : fail('missed GPT TEST copyright')
devLeftovers('Lorem ipsum dolor sit').length >= 1 ? pass('lorem ipsum flagged') : fail('missed lorem')
devLeftovers('[CLAIM — needs substantiation]').length >= 1 ? pass('[CLAIM] marker flagged') : fail('missed [CLAIM]')
devLeftovers('Visit your-store-name.myshopify.com').length >= 1 ? pass('placeholder domain flagged') : fail('missed placeholder domain')
devLeftovers('Premium magnesium for better sleep').length === 0 ? pass('clean real copy → no flag') : fail('false positive on clean copy')

console.log('unreplacedDefaults — pure (Dawn stock copy)')
unreplacedDefaults('Talk about your brand').length >= 1 ? pass('"Talk about your brand" flagged') : fail('missed talk-about-your-brand')
unreplacedDefaults('Button label').length >= 1 ? pass('"Button label" flagged') : fail('missed Button label')
unreplacedDefaults('Our founder started this in 2019').length === 0 ? pass('real story → no flag') : fail('false positive on real copy')

console.log('gate end-to-end')
function run(files, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'))
  for (const [rel, content] of Object.entries(files)) { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content) }
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', PLACEHOLDER_ENFORCE: '', ALLOW_PLACEHOLDER_WAIVER: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'content-quality.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const bIds = (rep) => new Set((rep?.blockers || []).map(b => b.id))
const wIds = (rep) => new Set((rep?.warnings || []).map(w => w.id))

{
  const { code, rep } = run({ 'templates/index.json': '{"sections":{"f":{"settings":{"copyright":"© GPT TEST 1.0"}}}}' })
  code === 1 && bIds(rep).has('placeholder.dev-leftover') ? pass('GPT TEST in template → BLOCK (always)') : fail(`dev-leftover: code ${code} blockers ${[...bIds(rep)]}`)
}
{
  const files = { 'config/settings_data.json': '{"current":{"sections":{"x":{"settings":{"text":"Talk about your brand"}}}}}' }
  const dev = run(files)
  dev.code === 0 && wIds(dev.rep).has('placeholder.unreplaced-default') ? pass('unreplaced default (dev) → WARN, exit 0') : fail(`default dev: code ${dev.code} warns ${[...wIds(dev.rep)]}`)
  const strict = run(files, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('placeholder.unreplaced-default') ? pass('unreplaced default + publish-grade → BLOCK') : fail(`default strict: code ${strict.code}`)
}
{
  const { code, rep } = run({ 'templates/index.json': '{"sections":{"h":{"settings":{"heading":"Sleep better tonight","copyright":"© Restful 2026"}}}}', 'sections/hero.liquid': '<h1>Real brand copy</h1>{% schema %}{}{% endschema %}' })
  code === 0 && bIds(rep).size === 0 ? pass('clean content → PASS') : fail(`clean: code ${code} blockers ${[...bIds(rep)]}`)
}
{
  const { code, rep } = run({ 'README.md': 'not a content surface' })
  code === 0 && wIds(rep).has('placeholder.n-a-no-content') ? pass('no content surfaces → SKIP/PASS') : fail(`n/a: code ${code}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
