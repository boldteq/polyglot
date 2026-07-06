#!/usr/bin/env node
// Gate #43 rule-pack — data-driven enforcement (the scalable substrate). Loads declarative rules
// (team-default bundled with the toolkit + an optional per-store pack) and runs the shared
// rule-engine over the theme. ENFORCING a guideline = appending a JSON line, not coding a gate.
// The team-default pack is grown AUTOMATICALLY by scripts/quality-loop.mjs — a real caught defect
// becomes an enforced rule, so the same mistake can never silently recur on the next build.
//
// Usage: node check-rule-pack.mjs   ·   Env: RULE_PACK_FILE (per-store, docs/brand/rule-pack.json) · REPORT_DIR
// Exit: 0 = pass · 1 = a rule blocked · 2 = malformed pack

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'
import { evaluateRules } from './lib/rule-engine.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath: repo path has a space
const TEAM_DEFAULT = path.join(HERE, '..', 'toolkit-rules', 'team-default.json')
const STORE_PACK = process.env.RULE_PACK_FILE || 'docs/brand/rule-pack.json'
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'

function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
const readFile = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const toEntries = (files) => files.map((f) => ({ file: f, basename: path.basename(f), text: readFile(f) }))

// Load + merge the bundled team-default pack and the optional per-store pack. Each accepts either a
// bare JSON array of rules or { rules: [...] }. Returns { rules, malformed }.
function loadRules() {
  const out = []; let malformed = null
  for (const [label, file] of [['team-default', TEAM_DEFAULT], ['store', path.resolve(cwd, STORE_PACK)]]) {
    if (!fs.existsSync(file)) continue
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf-8'))
      const rules = Array.isArray(json) ? json : Array.isArray(json.rules) ? json.rules : null
      if (!rules) { malformed = `${label} pack is not a JSON array (or {rules:[]})`; continue }
      for (const r of rules) out.push({ ...r, source: r.source || label })
    } catch (e) { malformed = `${label} pack invalid JSON: ${e.message}` }
  }
  return { rules: out, malformed }
}

function main() {
  const { rules, malformed } = loadRules()
  if (malformed) {
    writeReport('rule-pack', 43, { cwd, pass: false, blockers: [{ id: 'rule-pack.malformed', page: STORE_PACK, detail: malformed, evidence: '' }], warnings: [], evidence: { reason: malformed }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.log(`rule-pack: ENV-ERROR — ${malformed}`)
    process.exit(2)
  }
  if (rules.length === 0) {
    writeReport('rule-pack', 43, { cwd, pass: true, blockers: [], warnings: [{ id: 'rule-pack.empty', page: '(rule-pack)', detail: 'no rules defined yet — the pack grows from real caught defects via quality-loop', evidence: '' }], evidence: { rules: 0 }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.log('rule-pack: PASS — 0 rules')
    process.exit(0)
  }
  // include layout/ (theme.liquid — viewport, <html lang>, meta, skip-link) + snippets/ so rules can
  // see the whole theme, not just sections. Many a11y/SEO patterns live in layout, not sections.
  const sections = toEntries([...walk('sections', ['.liquid']), ...walk('layout', ['.liquid']), ...walk('snippets', ['.liquid'])])
  const corpus = {
    sections,
    templates: toEntries(walk('templates', ['.json'])),
    // assets/*.css + inline <style> blocks inside sections (for forbid-css-pattern)
    css: [...toEntries(walk('assets', ['.css'])), ...sections.filter((s) => /<style[\s>]/i.test(s.text)).map((s) => ({ ...s, basename: `${s.basename}#style` }))],
    ds: (() => { try { return JSON.parse(readFile('docs/design/design-system.json')) } catch { return null } })(),
  }
  const { blockers, warnings, enforced } = evaluateRules(rules, corpus)
  const pass = blockers.length === 0
  writeReport('rule-pack', 43, { cwd, pass, blockers, warnings, evidence: { rules: enforced, team: fs.existsSync(TEAM_DEFAULT), store: fs.existsSync(path.resolve(cwd, STORE_PACK)) }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`rule-pack: ${pass ? 'PASS' : 'BLOCK'} — ${enforced} rule(s) · ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

try { main() } catch (e) {
  writeReport('rule-pack', 43, { cwd, pass: false, blockers: [{ id: 'rule-pack.crash', page: '(rule-pack)', detail: `unexpected failure: ${e.message}`, evidence: '' }], warnings: [], evidence: {}, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.error(`rule-pack: CRASH — ${e.message}`)
  process.exit(2)
}
