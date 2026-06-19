#!/usr/bin/env node
// PER-STORE OVERRIDE enforcer (Plan Pillar 6) — "fix once → never again on THIS client". A nitpick you
// gave on build #2 reappearing on build #5 means a missing override line. atrium authors a structured,
// MECHANICALLY-enforceable override per revision in docs/brand/client-overrides.md (a ```json fenced
// block); drape/loom/ink load it BEFORE design-system.json; this gate BLOCKs the build if any override
// is violated — so the corrected mistake cannot recur. Cross-store promotion (≥3 same-niche stores) →
// the niche DNA pack is mira's job (brain Phase F path).
//
// Override shape (in the ```json block):
//   { "decision": "no hero carousel", "reason": "client: 'looks cheap' 2026-06-19",
//     "rule": "forbid-section-pattern", "pattern": "carousel|slideshow|slider", "scope": "hero" }
//   { "decision": "type scale frozen", "rule": "pin-design-system",
//     "field": "typography.allowed_px", "value": [49,39,31,25,22,20,18,16] }
//   { "decision": "never say 'cheap'", "rule": "forbid-text", "pattern": "\\bcheap\\b" }
//   { "decision": "PDP must keep the ingredient section", "rule": "require-section", "pattern": "ingredient" }
//
// Usage: node check-client-overrides.mjs   ·   Env: OVERRIDES_FILE (docs/brand/client-overrides.md) · REPORT_DIR
// Exit: 0 = all overrides respected (or none) · 1 = an override violated · 2 = malformed overrides file

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const FILE = process.env.OVERRIDES_FILE || 'docs/brand/client-overrides.md'
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const blockers = []
const warnings = []
const add = (id, page, detail, evidence = '') => blockers.push({ id, page, detail, evidence })

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('client-overrides', null, { cwd, pass, blockers, warnings, evidence: { file: FILE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`client-overrides: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some(x => e.name.endsWith(x))) acc.push(rel)
  }
  return acc
}
const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const getField = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

function main() {
  if (!fs.existsSync(path.resolve(cwd, FILE))) { warnings.push({ id: 'overrides.none', page: FILE, detail: `no ${FILE} — no per-store overrides locked yet (atrium authors them on each revision)`, evidence: '' }); return finish(null, { present: false }) }
  const text = read(FILE)
  const block = text.match(/```json\s*([\s\S]*?)```/i)
  if (!block) { warnings.push({ id: 'overrides.no-rules', page: FILE, detail: `${FILE} has no \`\`\`json override block — narrative only, nothing enforced`, evidence: '' }); return finish(null, { present: true, rules: 0 }) }
  let overrides
  try { overrides = JSON.parse(block[1]) } catch (e) { return finish(`override json block is invalid: ${e.message}`) }
  if (!Array.isArray(overrides)) return finish('override block must be a JSON array')

  const sections = walk('sections', ['.liquid'])
  const templates = walk('templates', ['.json'])
  const ds = (() => { try { return JSON.parse(read('docs/design/design-system.json')) } catch { return null } })()

  let enforced = 0
  for (const o of overrides) {
    if (!o || !o.rule) continue
    enforced += 1
    const why = o.decision ? ` ["${o.decision}"${o.reason ? ` — ${o.reason}` : ''}]` : ''
    switch (o.rule) {
      case 'forbid-section-pattern': {
        const re = new RegExp(o.pattern, 'i')
        const scope = o.scope ? new RegExp(o.scope, 'i') : null
        const hits = sections.filter(f => (!scope || scope.test(path.basename(f))) && re.test(read(f))).map(f => path.basename(f))
        if (hits.length) add('overrides.forbidden-section', FILE, `override violated${why}: ${hits.length} section(s) match forbidden pattern /${o.pattern}/${o.scope ? ` in scope /${o.scope}/` : ''}: ${hits.join(', ')}`, hits.join(', '))
        break
      }
      case 'pin-design-system': {
        if (!ds) { warnings.push({ id: 'overrides.no-design-system', page: FILE, detail: `cannot enforce pin${why} — no design-system.json`, evidence: '' }); break }
        const actual = getField(ds, o.field)
        if (JSON.stringify(actual) !== JSON.stringify(o.value)) add('overrides.design-system-drift', FILE, `override violated${why}: design-system.json ${o.field} = ${JSON.stringify(actual)} but is PINNED to ${JSON.stringify(o.value)} — a frozen client decision changed`, o.field)
        break
      }
      case 'forbid-text': {
        const re = new RegExp(o.pattern, 'i')
        const hits = []
        for (const f of [...sections, ...templates]) { const m = read(f).match(re); if (m) hits.push(`${path.basename(f)} ("${String(m[0]).slice(0, 24)}")`) }
        if (hits.length) add('overrides.forbidden-text', FILE, `override violated${why}: forbidden text /${o.pattern}/ appears in ${hits.slice(0, 4).join(', ')}`, hits.slice(0, 6).join(', '))
        break
      }
      case 'require-section': {
        const re = new RegExp(o.pattern, 'i')
        const present = sections.some(f => re.test(path.basename(f)) || re.test(read(f)))
        if (!present) add('overrides.missing-required', FILE, `override violated${why}: required section matching /${o.pattern}/ is ABSENT from the build`, o.pattern)
        break
      }
      default:
        warnings.push({ id: 'overrides.unknown-rule', page: FILE, detail: `override "${o.decision || o.rule}" has unknown rule "${o.rule}" — not enforced (valid: forbid-section-pattern, pin-design-system, forbid-text, require-section)`, evidence: o.rule })
    }
  }
  finish(null, { present: true, rules: enforced })
}

try { main() } catch (e) { finish(`unexpected failure: ${e.message}`) }
