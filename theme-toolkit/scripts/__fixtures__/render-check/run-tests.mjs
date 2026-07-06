#!/usr/bin/env node
// Self-test for check-render-wiring.mjs (gate #14). Asserts the tokens-RENDER enforcer:
//   (a) WIRED   theme (schemes in settings_data + .color-scheme CSS + @font-face + font-family) → exit 0
//   (b) UNWIRED theme (color-scheme classes + declared custom font, but empty settings_data,
//                      no theme CSS, no font loaded) → exit 1 with rw.scheme-unwired + rw.font-unwired
//
// Run (Node 20): node scripts/__fixtures__/render-wiring/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-render-wiring.mjs')

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }

function runGate(themeDir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-report-'))
  const env = { ...process.env, REPORT_DIR: reportDir, BASE_REF: '__no_such_base__', DS_REQUIRE_SCOPE: '', ALLOW_RW_WAIVER: '', ...extraEnv }
  const r = spawnSync('node', [GATE], { cwd: themeDir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'render-check.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report }
}

console.log('case (a) wired theme (schemes + font actually wired) → expect exit 0 + font-weight-synthetic warn')
{
  const { code, report } = runGate(path.join(HERE, 'wired'))
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (warnIds.has('rw.font-weight-synthetic')) pass('warning present: rw.font-weight-synthetic (used 600, loaded 400)')
  else fail(`missing expected warning: rw.font-weight-synthetic (saw ${[...warnIds].join(', ') || 'none'})`)
}

console.log('case (b) unwired theme (color-scheme classes + custom font, nothing wired) → expect exit 1')
{
  const { code, report } = runGate(path.join(HERE, 'unwired'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['rw.scheme-unwired', 'rw.font-unwired']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (warnIds.has('rw.button-variant-unrendered')) pass('warning present: rw.button-variant-unrendered (secondary declared, never rendered)')
  else fail(`missing expected warning: rw.button-variant-unrendered (saw ${[...warnIds].join(', ') || 'none'})`)
}

console.log('case (c) broken-refs theme (missing section/snippet/asset references) → expect exit 1')
{
  const { code, report } = runGate(path.join(HERE, 'broken-refs'))
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass('exit 1 (block)')
  else fail(`expected exit 1, got ${code}; blockers=${JSON.stringify([...ids])}`)
  for (const id of ['rw.section-missing', 'rw.snippet-missing', 'rw.asset-missing']) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

console.log('case (d) hollow theme (section wired with no blocks but renders section.blocks) → expect exit 0 + empty-rendered warn')
{
  const { code, report } = runGate(path.join(HERE, 'hollow'))
  if (code === 0) pass('exit 0 (advisory)')
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (warnIds.has('rw.empty-rendered-section')) pass('warning present: rw.empty-rendered-section')
  else fail(`missing expected warning: rw.empty-rendered-section (saw ${[...warnIds].join(', ') || 'none'})`)
}

console.log('case (e) placeholder-leak (Lorem + seeded [CLAIM] + "your text here") → expect exit 0 + placeholder-text warn')
{
  const { code, report } = runGate(path.join(HERE, 'placeholder-leak'))
  if (code === 0) pass('exit 0 (advisory)')
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (warnIds.has('rw.placeholder-text')) pass('warning present: rw.placeholder-text')
  else fail(`missing expected warning: rw.placeholder-text (saw ${[...warnIds].join(', ') || 'none'})`)
}

console.log('case (f) unbound-hero (image_picker offered but template binds image="" → grey placeholder; design system requires photography)')
{
  // dev-grade: WARN + pass (mid-flight before porter binds imagery)
  const dev = runGate(path.join(HERE, 'unbound-hero'))
  if (dev.code === 0) pass('dev-grade exit 0 (advisory)')
  else fail(`dev-grade expected exit 0, got ${dev.code}; blockers=${JSON.stringify(dev.report?.blockers?.map(b => b.id))}`)
  const devWarn = new Set((dev.report?.warnings || []).map(w => w.id))
  if (devWarn.has('rw.placeholder-imagery')) pass('dev-grade warning: rw.placeholder-imagery (binding-aware — caught despite image_picker in schema)')
  else fail(`dev-grade missing rw.placeholder-imagery (saw ${[...devWarn].join(', ') || 'none'})`)
  // publish-grade: the contract (custom_photography_required:true) turns the placeholder into a BLOCK
  const pub = runGate(path.join(HERE, 'unbound-hero'), { DS_REQUIRE_SCOPE: '1' })
  const pubBlock = new Set((pub.report?.blockers || []).map(b => b.id))
  if (pub.code === 1) pass('publish-grade exit 1 (block)')
  else fail(`publish-grade expected exit 1, got ${pub.code}; blockers=${JSON.stringify([...pubBlock])}`)
  if (pubBlock.has('rw.placeholder-imagery')) pass('publish-grade blocker: rw.placeholder-imagery (contract requires photography)')
  else fail(`publish-grade missing rw.placeholder-imagery blocker (saw ${[...pubBlock].join(', ') || 'none'})`)
}

console.log('case (g) snippet-placeholder (hero renders a {% render \'premium-placeholder\' %} snippet, NO placeholder_svg_tag, image unbound; photography required)')
{
  const dev = runGate(path.join(HERE, 'snippet-placeholder'))
  if (dev.code === 0) pass('dev-grade exit 0 (advisory)')
  else fail(`dev-grade expected exit 0, got ${dev.code}; blockers=${JSON.stringify(dev.report?.blockers?.map(b => b.id))}`)
  const devWarn = new Set((dev.report?.warnings || []).map(w => w.id))
  if (devWarn.has('rw.placeholder-imagery')) pass('dev-grade warning: rw.placeholder-imagery (snippet route caught — not just placeholder_svg_tag)')
  else fail(`dev-grade missing rw.placeholder-imagery (saw ${[...devWarn].join(', ') || 'none'})`)
  const pub = runGate(path.join(HERE, 'snippet-placeholder'), { DS_REQUIRE_SCOPE: '1' })
  const pubBlock = new Set((pub.report?.blockers || []).map(b => b.id))
  if (pub.code === 1) pass('publish-grade exit 1 (block)')
  else fail(`publish-grade expected exit 1, got ${pub.code}; blockers=${JSON.stringify([...pubBlock])}`)
  if (pubBlock.has('rw.placeholder-imagery')) pass('publish-grade blocker: rw.placeholder-imagery (snippet evasion closed)')
  else fail(`publish-grade missing rw.placeholder-imagery blocker (saw ${[...pubBlock].join(', ') || 'none'})`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
