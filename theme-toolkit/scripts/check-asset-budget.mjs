#!/usr/bin/env node
// Boldteq per-section asset-budget validator (loom pre-QA self-check).
//
// Enforces loom's pinned per-section budget (loom.md / onyx.md L160 / stitch.md L66):
// inline {% stylesheet %} ≤10KB, inline {% javascript %} ≤15KB per section file.
// Makes loom's "keep sections lean" rule a runnable exit-0 gate instead of prose.
//
// Usage:
//   node check-asset-budget.mjs            scan sections/*.liquid (+ assets/) in cwd
//
// Env:
//   SECTIONS_DIR    default sections
//   ASSETS_DIR      default assets
//   CSS_BUDGET_KB   default 10
//   JS_BUDGET_KB    default 15
//   REPORT_DIR      default gate-reports
//
// BLOCKS on: a section's inline {% stylesheet %} or {% javascript %} block over budget.
// WARNS on: a standalone assets/*.css or *.js file over budget (theme-wide assets may
//   legitimately be larger — flagged, not blocked).
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const SECTIONS_DIR = process.env.SECTIONS_DIR || 'sections'
const ASSETS_DIR = process.env.ASSETS_DIR || 'assets'
const CSS_BUDGET = Number.parseFloat(process.env.CSS_BUDGET_KB || '10') * 1024
const JS_BUDGET = Number.parseFloat(process.env.JS_BUDGET_KB || '15') * 1024

const blockers = []
const warnings = []
const add = (list, id, where, detail) => list.push({ id, page: where, detail, evidence: '' })
const kb = bytes => `${(bytes / 1024).toFixed(1)}KB`

function finish() {
  const pass = blockers.length === 0
  writeReport('asset-budget', 13, {
    cwd, pass, blockers, warnings,
    evidence: { sectionsDir: SECTIONS_DIR, cssBudgetKB: CSS_BUDGET / 1024, jsBudgetKB: JS_BUDGET / 1024 },
    duration_ms: Date.now() - t0,
  })
  const code = pass ? 0 : 1
  console.log(`asset-budget: ${code === 0 ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}] ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}] ${w.detail}`)
  process.exit(code)
}

// Sum the byte length of every matched {% tag %}...{% endtag %} block in a file.
function inlineBlockBytes(src, tag) {
  const re = new RegExp(`\\{%-?\\s*${tag}\\s*-?%\\}([\\s\\S]*?)\\{%-?\\s*end${tag}\\s*-?%\\}`, 'g')
  let total = 0
  let m
  while ((m = re.exec(src)) !== null) total += Buffer.byteLength(m[1], 'utf-8')
  return total
}

const sectionsAbs = path.resolve(cwd, SECTIONS_DIR)
if (fs.existsSync(sectionsAbs) && fs.statSync(sectionsAbs).isDirectory()) {
  for (const f of fs.readdirSync(sectionsAbs).filter(n => n.endsWith('.liquid')).sort()) {
    const src = fs.readFileSync(path.join(sectionsAbs, f), 'utf-8')
    const cssBytes = inlineBlockBytes(src, 'stylesheet')
    const jsBytes = inlineBlockBytes(src, 'javascript')
    if (cssBytes > CSS_BUDGET) add(blockers, 'asset-budget.section-css-over', `${SECTIONS_DIR}/${f}`, `inline {% stylesheet %} ${kb(cssBytes)} > ${kb(CSS_BUDGET)} budget`)
    if (jsBytes > JS_BUDGET) add(blockers, 'asset-budget.section-js-over', `${SECTIONS_DIR}/${f}`, `inline {% javascript %} ${kb(jsBytes)} > ${kb(JS_BUDGET)} budget`)
  }
}

const assetsAbs = path.resolve(cwd, ASSETS_DIR)
if (fs.existsSync(assetsAbs) && fs.statSync(assetsAbs).isDirectory()) {
  for (const f of fs.readdirSync(assetsAbs).sort()) {
    const isCss = f.endsWith('.css') && !f.endsWith('.min.css')
    const isJs = f.endsWith('.js') && !f.endsWith('.min.js')
    if (!isCss && !isJs) continue
    const bytes = fs.statSync(path.join(assetsAbs, f)).size
    const budget = isCss ? CSS_BUDGET : JS_BUDGET
    if (bytes > budget) add(warnings, 'asset-budget.standalone-asset-over', `${ASSETS_DIR}/${f}`, `${kb(bytes)} > ${kb(budget)} per-file budget (theme-wide asset — review if it should be split/section-scoped)`)
  }
}

finish()
