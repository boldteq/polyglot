#!/usr/bin/env node
// Gate #44 check-orchestration — the fail-closed ORCHESTRATION-COHERENCE gate. Promotes the previously
// test-time-only gap detectors (handoff-registry consistency, gate-citation coherence) into a real
// build gate so a build cannot read PUBLISH-READY on a broken pipeline graph (2026-07-19 done-means-done).
//
// It asserts, deterministically (no dependency on the in-flight summary.json), over the vendored
// aim-handoff-registry.json + the LIVE gate manifest (`theme-gates.mjs --list-json`):
//   A. Dangling requires (BLOCK) — every contract-event named in a `requires[]` is a defined event.
//   B. Gate citations resolve (BLOCK) — every `#N` a contract cites in its `gate` exists in the manifest.
//   C. Critical eyes/dispatch gates present (BLOCK) — the gates that stop "skip reads as pass"
//      (#0.4 discovery, #0.5 foundation, #13 honesty, #18 visual-check, #20 class-d-visual) all exist,
//      so the eyes/dispatch layer can never silently vanish from the stack (the linchpin class).
//   D. Orphan produce (WARN) — a non-terminal contract whose event nothing downstream requires.
//   E. Report identity (BLOCK) — a gate must writeReport() under its manifest name+number (auditReportIdentity).
//   F. Enforcement graduation (BLOCK) — a warn-capable gate (gates a finding behind an *_ENFORCE flag,
//      directly or in an absorbed sub-gate) must carry a dated, reasoned `enforcement` object in the
//      manifest, so "warn-only forever, reporting into a void" is impossible (auditEnforcement).
//
// This is the whole-graph companion to check-handoff-contract.mjs (which checks ONE dispatch edge at a
// time). Registered in theme-gates.mjs + shopify-definition-of-done.md §1. PURE core (auditGraph) is
// hermetically tested by __fixtures__/orchestration.
//
// Usage: node check-orchestration.mjs   Env: REPORT_DIR (gate-reports)   Exit: 0 pass · 1 block · 2 env

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'
import { loadRegistry } from './check-handoff-contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'

// The eyes/dispatch gates whose PRESENCE guarantees the stack can't silently drop the "skip reads as
// pass" defenses. Numbers are stable (theme-gates.mjs manifest).
const CRITICAL_GATES = ['0.4', '0.5', '13', '18', '20']

const head = (s) => String(s).split(/[\s(]/)[0]
const isPathish = (s) => { const h = head(s); return h.includes('/') || /\.(json|md|csv|js|mjs|liquid)$/.test(h) }
// Extract "name (#N)" citation PAIRS — "theme-check (#2) + conversion (#7)" → [{name,number}]. A #N
// paired with a NON-gate name (e.g. "check-handoff-contract (#39)" — an enforcer script + an AIM
// feature id, NOT a toolkit gate) is intentionally not a gate citation and is ignored downstream.
const gateCitations = (gateStr) => {
  const out = []; const re = /([a-z][a-z0-9-]+)\s*\(#(\d+(?:\.\d+)?)/gi; let m
  while ((m = re.exec(String(gateStr || '')))) out.push({ name: m[1].toLowerCase(), number: m[2] })
  return out
}
// Legacy gate names → current, so a valid alias citation isn't a false mismatch (mirrors theme-gates GATE_ALIAS).
const GATE_ALIAS = { 'commerce-readiness': 'conversion', 'render-wiring': 'render-check', 'a11y-static': 'static-a11y', 'visual-truth': 'visual-check', 'css-layout': 'layout', 'antipatterns': 'dead-code', 'design-system': 'design-tokens', 'lighthouse': 'performance', 'axe': 'accessibility', 'functional': 'functionality', 'reuse-map': 'section-reuse', 'ds-cascade': 'brand-sync', 'locale-completeness': 'translations', 'bootstrap': 'foundation', 'theme-check': 'code-lint' }

// PURE: audit the registry graph against the live gate manifest [{number,name}]. → { blockers[], warnings[] }.
export function auditGraph(registry, manifest) {
  const blockers = []
  const warnings = []
  const contracts = registry.contracts || []
  const events = new Set(contracts.map(c => c.event))
  const liveByName = new Map()
  const live = new Set()
  for (const g of (manifest || [])) { liveByName.set(String(g.name), String(g.number)); live.add(String(g.number)) }
  const add = (arr, id, page, detail) => arr.push({ id, page, detail, evidence: '' })

  // A. dangling requires — a require that is neither a path nor a defined contract event
  for (const c of contracts) {
    for (const r of (c.requires || [])) {
      if (isPathish(r)) continue
      if (!events.has(r)) add(blockers, 'orch.dangling-require', c.event, `contract "${c.event}" requires "${r}" — not a path and not a defined contract event (broken handoff edge)`)
    }
  }

  // B. gate citations resolve BY IDENTITY — a cited "name (#N)" whose name IS a real gate must carry
  //    that gate's actual number (catches a citation drifting to the wrong gate — the board/red-team
  //    #39/#40 masking the audit found). A #N paired with a non-gate name (enforcer script / AIM
  //    feature id) is not a gate citation and is skipped — never a false pass NOR a false block.
  for (const c of contracts) {
    for (const { name, number } of gateCitations(c.gate)) {
      const canonical = GATE_ALIAS[name] || name
      if (!liveByName.has(canonical)) continue // not a gate name → not a gate citation
      if (liveByName.get(canonical) !== number) add(blockers, 'orch.gate-citation-mismatch', c.event, `contract "${c.event}" cites "${name} (#${number})" but gate "${canonical}" is #${liveByName.get(canonical)} in the live manifest — wrong-gate citation`)
    }
  }

  // C. critical eyes/dispatch gates present — the skip-reads-as-pass linchpin
  for (const n of CRITICAL_GATES) {
    if (!live.has(String(n))) add(blockers, 'orch.critical-gate-missing', 'manifest', `critical eyes/dispatch gate #${n} is absent from the live manifest — the "skip reads as pass" defense could vanish`)
  }

  // G. gate-number uniqueness (BLOCK) — a stable gate number must map to exactly ONE gate. theme-gates
  //    keys reports by NAME (and `live` above is a Set that silently swallows a repeat), so two gates
  //    sharing a NUMBER pass every other check yet corrupt every "#N" citation, report lookup and dispatch
  //    order. Asserted off the LIVE manifest — no hardcoded numbers. (A latent gap a 2026-07 audit alleged
  //    as an EXISTING defect while none existed; this makes the alleged failure genuinely impossible.)
  const gatesByNumber = new Map()
  for (const g of (manifest || [])) {
    const num = String(g.number)
    if (!gatesByNumber.has(num)) gatesByNumber.set(num, [])
    gatesByNumber.get(num).push(String(g.name))
  }
  for (const [num, names] of gatesByNumber) {
    if (names.length > 1) add(blockers, 'orch.duplicate-gate-number', 'manifest', `gate number #${num} is assigned to ${names.length} gates (${names.join(', ')}) — a gate number must be unique. theme-gates keys reports by name, so a shared number silently corrupts #N citations, report lookup and dispatch ordering. Renumber all but one (stable IDs are never reused).`)
  }

  // D. orphan produce (WARN) — a contract event nothing downstream requires (terminal events are OK)
  const requiredEvents = new Set()
  for (const c of contracts) for (const r of (c.requires || [])) if (!isPathish(r)) requiredEvents.add(r)
  // Terminal / leaf contracts: the end of the line — not another contract's `requires`.
  // (design_review_board + red_team are now REQUIRED by `published`, so they're consumed, not orphans.)
  const TERMINAL = new Set(['published', 'launch_watch_clear'])
  for (const c of contracts) {
    if (TERMINAL.has(c.event)) continue
    if (!requiredEvents.has(c.event)) add(warnings, 'orch.orphan-produce', c.event, `contract "${c.event}" is produced but no downstream contract requires it (dead handoff, or a missing consumer)`)
  }

  return { blockers, warnings }
}

// Strip comments so a `writeReport(` MENTIONED in a doc comment is not counted as a call.
//
// Single pass, NOT "block comments then line comments": `// ... sections/*.liquid ...` is a real line
// in these gates, and stripping block comments first made that `/*` open a fake block that swallowed
// the rest of the file — check-honesty then looked like it wrote no report at all. Comment and string
// state have to be tracked together, in order.
function stripComments(src) {
  let out = ''
  let state = 'code'
  let quote = null
  const text = String(src)
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    const n = text[i + 1]
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i += 1; continue }
      if (c === '/' && n === '*') { state = 'block'; i += 1; continue }
      if (c === "'" || c === '"' || c === '`') { state = 'str'; quote = c; out += c; continue }
      out += c
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c }
    } else if (state === 'block') {
      if (c === '*' && n === '/') { state = 'code'; i += 1 }
      else if (c === '\n') out += c            // keep line numbers/structure roughly intact
    } else { // inside a string literal — preserved, the call regex needs the name
      out += c
      if (c === '\\') { out += text[i + 1] ?? ''; i += 1; continue }
      if (c === quote) { state = 'code'; quote = null }
    }
  }
  return out
}

// Count REAL `writeReport(` call sites: comments already gone, and an occurrence sitting inside a
// string literal (an error message that quotes the API, say) is not a call either.
function countWriteReportCalls(code) {
  let n = 0
  for (const line of code.split('\n')) {
    let q = null
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i]
      if (line[i - 1] === '\\') continue
      if (q) { if (c === q) q = null; continue }
      if (c === "'" || c === '"' || c === '`') { q = c; continue }
      if (line.startsWith('writeReport(', i)) n += 1
    }
  }
  return n
}

// E. Report identity (BLOCK) — a gate MUST writeReport() under its MANIFEST name and number.
//
// theme-gates reads each gate's evidence from `gate-reports/<manifest-name>.json`. A gate that writes
// under any other name produces a report nothing reads: evidence, freshness and gate #45's
// skip-vs-pass audit all see a hole, and — worst of all — the hole only appears on the PASS path if
// the failure paths happen to use the right name. Found three times by hand (#19 wrote the retired
// alias `section-cohesion`, #44 wrote `check-orchestration`, #45 wrote `check-gate-integrity`), which
// is why it is mechanized here rather than left to review.
//
// `readSource(script)` returns the gate's source, or null if it cannot be read (kept injectable so the
// fixture can drive this hermetically).
export { stripComments, countWriteReportCalls }

export function auditReportIdentity(gates, readSource) {
  const blockers = []
  const warnings = []
  const seen = new Set()
  const push = (list, id, page, detail, evidence) => {
    const key = `${id}|${page}|${detail}`
    if (seen.has(key)) return
    seen.add(key)
    list.push({ id, page, detail, evidence })
  }
  for (const g of gates || []) {
    if (!g || !g.script) continue
    const src = readSource(g.script)
    if (src == null) {
      push(warnings, 'orch.report-script-unreadable', g.script, `manifest lists ${g.script} for gate #${g.number} but it could not be read`, '')
      continue
    }
    const code = stripComments(src)
    // resolve `const X = 'literal'` so a gate naming itself via a constant is still checked
    const consts = new Map()
    for (const m of code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'/g)) consts.set(m[1], m[2])
    const calls = [...code.matchAll(/writeReport\(\s*('[^']*'|[A-Za-z_$][\w$]*)\s*,\s*([\d.]+)/g)]
    // "no call at all" and "a call whose name I cannot read" are different diagnoses and must not be
    // conflated — the second one is where an invisible report would hide.
    const total = countWriteReportCalls(code)
    if (!total) {
      push(warnings, 'orch.report-no-call', g.script, `no writeReport(<name>, <number>) call found — cannot verify gate #${g.number} writes readable evidence`, '')
      continue
    }
    if (total > calls.length) {
      push(warnings, 'orch.report-name-unresolvable', g.script, `${total - calls.length} writeReport(...) call(s) whose name/number is not a literal or simple const — cannot be verified`, '')
    }
    for (const c of calls) {
      const raw = c[1]
      const name = raw.startsWith("'") ? raw.slice(1, -1) : (consts.has(raw) ? consts.get(raw) : null)
      if (name === null) {
        push(warnings, 'orch.report-name-unresolvable', g.script, `writeReport(${raw}, …) — the report name is not a literal or a simple const, so it cannot be verified`, raw)
        continue
      }
      if (name !== g.name) {
        push(blockers, 'orch.report-name-mismatch', g.script,
          `writeReport('${name}', …) but the manifest name is '${g.name}' — theme-gates reads gate-reports/${g.name}.json, so this gate's report is invisible`,
          `${name} != ${g.name}`)
      } else if (String(c[2]) !== String(g.number)) {
        push(blockers, 'orch.report-number-mismatch', g.script,
          `writeReport('${name}', ${c[2]}) but the manifest number is ${g.number}`,
          `${c[2]} != ${g.number}`)
      }
    }
  }
  return { blockers, warnings }
}

// F. Enforcement graduation (BLOCK) — warn-only must never be a silent permanent state.
//
// A gate is "warn-capable" if it gates a finding behind an *_ENFORCE flag (`SOMETHING_ENFORCE === '1'`)
// in its own source, OR in a sub-gate it absorbs via runAbsorbed([{ script: 'check-*.mjs' }]) — imagery
// (check-media-quality) absorbs check-art-direction (ART_DIRECTION_ENFORCE); content-quality
// (check-placeholder-text) absorbs check-copy-quality (COPY_ENFORCE). Every such gate MUST carry an
// `enforcement` object in the manifest with a non-empty reason and a since date (YYYY-MM-DD) — a
// warn-only gate with no recorded, dated reason is a BLOCK (orch.warn-only-unreasoned). This makes
// "13 gates warn-only forever, reporting into a void" mechanically impossible: the reason has to exist,
// and re-graduation is a manifest edit that this gate audits.
//
// `readSource(script)` returns the gate's source or null (injectable so the fixture drives it hermetically).
const ENFORCE_FLAG = /_ENFORCE\s*===\s*'1'/
const SUB_SCRIPT = /script:\s*'(check-[\w-]+\.mjs)'/g
const SINCE_DATE = /^\d{4}-\d{2}-\d{2}$/
export function auditEnforcement(gates, readSource) {
  const blockers = []
  const warnings = []
  // warn-capable = this script (or an absorbed sub-script, transitively) reads an *_ENFORCE flag.
  const warnCapable = (script, seen = new Set()) => {
    if (!script || seen.has(script)) return false
    seen.add(script)
    const raw = readSource(script)
    if (raw == null) return false
    const code = stripComments(raw) // never let a flag MENTIONED in a comment count
    if (ENFORCE_FLAG.test(code)) return true
    for (const m of code.matchAll(SUB_SCRIPT)) { if (warnCapable(m[1], seen)) return true }
    return false
  }
  for (const g of gates || []) {
    if (!g || !g.script) continue
    if (!warnCapable(g.script)) continue
    const e = g.enforcement
    if (!e || typeof e !== 'object') {
      blockers.push({ id: 'orch.warn-only-unreasoned', page: g.script, detail: `gate #${g.number} ${g.name} is warn-capable (a finding is gated behind an *_ENFORCE flag) but its manifest entry declares NO \`enforcement\` object — a warn-only gate with no recorded reason can sit silently un-enforced forever. Add enforcement: { policy:"block"|"warn", provenBuilds, reason, since }.`, evidence: g.script })
      continue
    }
    if (!e.reason || !String(e.reason).trim()) {
      blockers.push({ id: 'orch.warn-only-unreasoned', page: g.script, detail: `gate #${g.number} ${g.name} carries an \`enforcement\` object with an empty reason — record WHY it is "${e.policy || '?'}" (and, if warn, what would graduate it to block).`, evidence: `policy=${e.policy}` })
    }
    if (!e.since || !SINCE_DATE.test(String(e.since))) {
      blockers.push({ id: 'orch.warn-only-unreasoned', page: g.script, detail: `gate #${g.number} ${g.name} \`enforcement.since\` is missing or not YYYY-MM-DD ("${e.since ?? ''}") — the graduation/keep-warn decision must be dated so it can be revisited.`, evidence: `since=${e.since ?? ''}` })
    }
    if (e.policy !== 'block' && e.policy !== 'warn') {
      warnings.push({ id: 'orch.enforcement-policy-unknown', page: g.script, detail: `gate #${g.number} ${g.name} enforcement.policy="${e.policy}" is neither "block" nor "warn".`, evidence: String(e.policy) })
    }
  }
  return { blockers, warnings }
}

function liveManifest() {
  try {
    const manifest = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'theme-gates.mjs'), '--list-json'], { cwd, encoding: 'utf-8' }))
    return manifest.map(g => ({ number: String(g.number), name: String(g.name), script: g.script, enforcement: g.enforcement }))
  } catch (e) {
    return { error: e.message }
  }
}

function main() {
  const t0 = Date.now()
  let registry
  try { registry = loadRegistry() } catch (e) {
    writeReport('orchestration', 44, { cwd, pass: false, blockers: [{ id: 'orch.registry-unreadable', page: 'lib/aim-handoff-registry.json', detail: `handoff registry unreadable: ${e.message}`, evidence: '' }], warnings: [], evidence: { reason: 'registry' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error(`check-orchestration: ENV-ERROR — ${e.message}`); process.exit(2)
  }
  const manifest = liveManifest()
  if (manifest && manifest.error) {
    writeReport('orchestration', 44, { cwd, pass: false, blockers: [{ id: 'orch.manifest-unreadable', page: 'theme-gates.mjs', detail: `could not read the live gate manifest: ${manifest.error}`, evidence: '' }], warnings: [], evidence: { reason: 'manifest' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
    console.error('check-orchestration: ENV-ERROR — manifest'); process.exit(2)
  }
  const { blockers, warnings } = auditGraph(registry, manifest)
  const readSource = (script) => { try { return fs.readFileSync(path.join(HERE, script), 'utf-8') } catch { return null } }
  const ident = auditReportIdentity(manifest, readSource)
  blockers.push(...ident.blockers)
  warnings.push(...ident.warnings)
  const enf = auditEnforcement(manifest, readSource)
  blockers.push(...enf.blockers)
  warnings.push(...enf.warnings)
  const pass = blockers.length === 0
  writeReport('orchestration', 44, { cwd, pass, blockers, warnings, evidence: { contracts: (registry.contracts || []).length, liveGates: manifest.length }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`check-orchestration: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s) · ${(registry.contracts || []).length} contracts`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

if (isMain(import.meta.url)) {
  main()
}
