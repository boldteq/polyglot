#!/usr/bin/env node
// Self-test for check-rule-pack.mjs (gate #43). Proves the data-driven engine end-to-end:
//   (a) clean theme, no per-store pack                          → exit 0 (only bundled warn-rules)
//   (b) per-store forbid-text BLOCK rule + a section with the text → exit 1 (block)
//   (c) same block rule, text ABSENT                            → exit 0
//   (d) malformed per-store pack (bad JSON)                      → exit 2
//   (e) require-pattern rule, pattern absent                     → exit 1 (block)
//
// Run (Node 20): node scripts/__fixtures__/rule-pack/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-rule-pack.mjs')

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function makeTheme({ sections = {}, storePack = null, storePackRaw = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulepack-theme-'))
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true })
  for (const [name, body] of Object.entries(sections)) fs.writeFileSync(path.join(dir, 'sections', name), body)
  if (storePackRaw != null || storePack) {
    fs.mkdirSync(path.join(dir, 'docs', 'brand'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'docs', 'brand', 'rule-pack.json'), storePackRaw != null ? storePackRaw : JSON.stringify(storePack))
  }
  return dir
}
function runGate(themeDir) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulepack-report-'))
  const r = spawnSync('node', [GATE], { cwd: themeDir, env: { ...process.env, REPORT_DIR: reportDir }, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'rule-pack.json'), 'utf-8')) } catch { /* none */ }
  return { code: r.status, report }
}

// (a) clean theme, no store pack → pass (the bundled rules are warn-only and don't match)
{
  const d = makeTheme({ sections: { 'hero.liquid': '<section><h1>Welcome</h1><a href="/shop">Shop now</a></section>' } })
  const { code, report } = runGate(d)
  if (code === 0 && report && report.pass) ok('(a) clean theme → pass (exit 0)')
  else bad(`(a) expected pass exit 0, got ${code} (${report ? report.blockers.length + ' blockers' : 'no report'})`)
}

// (b) per-store forbid-text BLOCK rule + matching text → block
{
  const pack = [{ id: 'no-coming-soon', type: 'forbid-text', pattern: 'coming soon', severity: 'block', message: 'no placeholder copy', owner: 'ink' }]
  const { code, report } = runGate(makeTheme({ sections: { 'banner.liquid': '<p>Coming soon!</p>' }, storePack: pack }))
  if (code === 1 && report && report.blockers.some((b) => b.id === 'rule.no-coming-soon')) ok('(b) forbid-text block + match → block (exit 1)')
  else bad(`(b) expected block exit 1 with rule.no-coming-soon, got ${code}`)
}

// (c) same block rule, text absent → pass
{
  const pack = [{ id: 'no-coming-soon', type: 'forbid-text', pattern: 'coming soon', severity: 'block' }]
  const { code, report } = runGate(makeTheme({ sections: { 'banner.liquid': '<p>Shop the new collection</p>' }, storePack: pack }))
  if (code === 0 && report && report.pass) ok('(c) block rule, text absent → pass (exit 0)')
  else bad(`(c) expected pass exit 0, got ${code}`)
}

// (d) malformed store pack → env-error
{
  const { code } = runGate(makeTheme({ sections: { 'x.liquid': '<p>ok</p>' }, storePackRaw: '{ not valid json' }))
  if (code === 2) ok('(d) malformed pack → env-error (exit 2)')
  else bad(`(d) expected exit 2, got ${code}`)
}

// (e) require-pattern absent → block
{
  const pack = [{ id: 'need-skip-link', type: 'require-pattern', pattern: 'skip-to-content', severity: 'block', message: 'theme must have a skip link' }]
  const { code, report } = runGate(makeTheme({ sections: { 'header.liquid': '<header>nav</header>' }, storePack: pack }))
  if (code === 1 && report && report.blockers.some((b) => b.id === 'rule.need-skip-link')) ok('(e) require-pattern absent → block (exit 1)')
  else bad(`(e) expected block exit 1 with rule.need-skip-link, got ${code}`)
}

console.log(failures ? `\n  rule-pack: ${failures} CASE(S) FAILED` : '\n  rule-pack: ALL CASES PASS')
process.exit(failures ? 1 : 0)
