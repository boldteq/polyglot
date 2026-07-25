#!/usr/bin/env node
// swt:synthetic-dogfood — the codified "fake brief → real SWT agents → catch → fix → loop" self-test.
// It proves/improves the agents' GENERATION quality WITHOUT a client store (Yash is barred from those).
// Round 1 (2026-07-25) ran this manually and caught a real gate #46 defect on the first dispatch, plus
// two harness lessons this file bakes in:
//   1. DURABLE dir, never the scratchpad — a session boundary wiped Round 1's in-progress build.
//      Builds live at evals/synthetic-builds/builds/<niche>/ (gitignored), so they survive restarts.
//   2. The agent DISPATCH stays synchronous and is the orchestrator's job (Agent tool / claude -p) —
//      a background agent does not survive a session restart. This script does the deterministic halves:
//      PROVISION (build a real-shaped fixture from a brief spec) and GRADE (run the offline gate stack +
//      extract the defect list). The dispatch plan is printed for the orchestrator to run in between.
//
// The three existing harnesses it complements: aim-dogfood (refutes the guards), maestro-run (real
// agents but needs a live store), the golden corpus (scores existing builds). This one grades what the
// agents GENERATE from a synthetic brief, offline.
//
// Usage (Node 20, from the Polyglot repo root):
//   node theme-toolkit/scripts/swt-synthetic-dogfood.mjs list
//   node theme-toolkit/scripts/swt-synthetic-dogfood.mjs provision <niche>   # build the durable fixture
//   node theme-toolkit/scripts/swt-synthetic-dogfood.mjs grade <niche>       # run static gates → defect list
//   node theme-toolkit/scripts/swt-synthetic-dogfood.mjs clean <niche>
// Brief specs live at evals/synthetic-builds/briefs/<niche>.json.
// Exit: 0 ok · 1 provisioned-but-gates-block (defects to fix — the point) · 2 setup error.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')            // theme-toolkit/scripts → repo root
const DAWN = path.join(REPO, '.research', 'dawn')
const TOOLKIT = path.join(REPO, 'theme-toolkit')
const BRIEFS = path.join(REPO, 'evals', 'synthetic-builds', 'briefs')
const BUILDS = path.join(REPO, 'evals', 'synthetic-builds', 'builds')

// ── PURE: a brief spec → the exact input files the SWT agents receive ─────────────────────────
// Mirrors what Round 1 hand-authored, so the fixture is realistic and the gates have something to bite.
export function briefToInputs(spec) {
  const surfaces = spec.surfaces || ['hero', 'about', 'pdp']
  const brief = {
    id: `synthetic-${spec.niche}-${(spec.brand || 'brand').toLowerCase().replace(/\s+/g, '-')}`,
    brief: spec.brief || `${spec.brand} — ${spec.niche} storefront.`,
    niche: spec.niche,
    base: spec.base || 'dawn',
    surfaces,
    reference: spec.reference ? { [spec.reference.surface || 'home']: { archetype: spec.reference.archetype } } : undefined,
    must_pass: { min_pass_rate: 0.85 },
  }
  const changes = ['# CHANGES — ' + spec.brand + ' synthetic build', '']
    .concat(surfaces.map((s) => `- [ ] ${s} section — owner: loom+ink — accept: honest copy, --ds-* tokens, empty-state guarded`))
    .join('\n') + '\n'
  return {
    'brief.json': JSON.stringify(brief, null, 2) + '\n',
    'docs/design/design-system.json': JSON.stringify(spec.design_system, null, 2) + '\n',
    'docs/discovery/goals.json': JSON.stringify(spec.goals, null, 2) + '\n',
    'docs/design/brand-direction.md': (spec.brand_direction || `# ${spec.brand} — Brand Direction\n`).trimEnd() + '\n',
    'docs/products.json': JSON.stringify(spec.products || [], null, 2) + '\n',
    'CHANGES.md': changes,
    '.shopifyignore': 'toolkit/\ngate-reports/\n',
  }
}

// ── PURE: summary.json → a flat, owner-attributable defect list ───────────────────────────────
// summary.gates = { <name>: { pass, blockers:[{id,page,detail}], warnings, skipped, reason } }
export function defectsFromSummary(summary) {
  const out = []
  const gates = (summary && summary.gates) || {}
  for (const [gate, g] of Object.entries(gates)) {
    for (const b of (g.blockers || [])) out.push({ gate, id: b.id, page: b.page || '', detail: b.detail || '' })
  }
  return out
}

const die = (m) => { console.error(`synthetic-dogfood: ${m}`); process.exit(2) }
const node = process.execPath
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf-8', ...opts })
const loadSpec = (niche) => {
  const p = path.join(BRIEFS, `${niche}.json`)
  if (!fs.existsSync(p)) die(`no brief spec at ${path.relative(REPO, p)} — run 'list' to see available niches`)
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (e) { die(`brief ${niche}.json is not valid JSON: ${e.message}`) }
}

function provision(niche) {
  if (!fs.existsSync(DAWN)) die(`Dawn base missing at ${DAWN} — this harness runs from the Polyglot repo`)
  const spec = loadSpec(niche)
  const dir = path.join(BUILDS, niche)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  // 1. Dawn base (strip its own git/CI so the fixture is clean)
  sh('cp', ['-R', `${DAWN}/.`, dir])
  for (const d of ['.git', '.github']) fs.rmSync(path.join(dir, d), { recursive: true, force: true })

  // 2. vendor the toolkit WITHOUT node_modules (184MB×N), then symlink to the master's — durable + cheap
  const tkDir = path.join(dir, 'toolkit')
  const rs = sh('rsync', ['-a', '--exclude', 'node_modules', `${TOOLKIT}/`, `${tkDir}/`])
  if (rs.status !== 0) { sh('cp', ['-R', TOOLKIT, tkDir]); fs.rmSync(path.join(tkDir, 'node_modules'), { recursive: true, force: true }) }
  try { fs.symlinkSync(path.join(TOOLKIT, 'node_modules'), path.join(tkDir, 'node_modules')) } catch { /* exists */ }

  // 3. write the requirement inputs
  const inputs = briefToInputs(spec)
  for (const [rel, body] of Object.entries(inputs)) {
    const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body)
  }

  // 3b. the vendored toolkit/ carries intentionally-broken example .liquid (script_tag/theme.js/…) — if
  // .theme-check.yml (and Dev MCP #49) walk it, they report the toolkit's fixtures AS this build's defects.
  // Ensure theme-check ignores it. (round 1 finding: ~5 phantom defects came from this scan pollution.)
  const tcPath = path.join(dir, '.theme-check.yml')
  const tc = fs.existsSync(tcPath) ? fs.readFileSync(tcPath, 'utf-8') : ''
  if (!/^\s*ignore:/m.test(tc)) fs.writeFileSync(tcPath, `ignore:\n  - toolkit/**\n  - gate-reports/**\n  - docs/**\n${tc}`)

  // 4. generate the --ds-* cascade + register the reference (surface auto-normalized by reference-ingest)
  sh(node, [path.join(tkDir, 'scripts', 'generate-design-system-css.mjs')], { cwd: dir })
  if (spec.reference) {
    const r = spec.reference
    const args = ['--surface', r.surface || 'home', '--name', r.name || 'hero', '--archetype', r.archetype]
    if (r.must_have) args.push('--must-have', r.must_have.join(','))
    sh(node, [path.join(tkDir, 'scripts', 'reference-ingest.mjs'), ...args], { cwd: dir })
  }

  // 5. git baseline + `base` tag (8 scope-resolving gates need it)
  for (const a of [['init', '-q'], ['add', '-A'], ['commit', '-qm', `baseline: ${niche} synthetic requirement`], ['tag', 'base']]) sh('git', a, { cwd: dir })

  console.log(`synthetic-dogfood: provisioned ${niche} → ${path.relative(REPO, dir)}`)
  const pf = sh(node, [path.join(tkDir, 'scripts', 'preflight-repo.mjs')], { cwd: dir })
  console.log((pf.stdout || '').split('\n').filter((l) => /READY|NOT READY|❌/.test(l)).join('\n'))
  console.log('\nNEXT (orchestrator, synchronously via the Agent tool):')
  console.log(`  drape → author docs/design/design-spec.md for: ${(spec.surfaces || []).join(', ')}`)
  console.log('  loom  → build the sections (new-section.mjs; --ds-* tokens; t: keys; honest copy)')
  console.log(`  then: node theme-toolkit/scripts/swt-synthetic-dogfood.mjs grade ${niche}`)
}

function grade(niche) {
  const dir = path.join(BUILDS, niche)
  if (!fs.existsSync(dir)) die(`${niche} not provisioned — run 'provision ${niche}' first`)
  const tkGates = path.join(dir, 'toolkit', 'scripts', 'theme-gates.mjs')
  sh(node, [tkGates, '--static-only'], { cwd: dir })
  const summaryPath = path.join(dir, 'gate-reports', 'summary.json')
  if (!fs.existsSync(summaryPath)) die(`no summary.json — the gate run did not complete in ${niche}`)
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
  const defects = defectsFromSummary(summary)
  const report = { niche, sha: summary.sha || null, pass: summary.pass, mode: summary.mode, defectCount: defects.length, defects }
  fs.writeFileSync(path.join(dir, 'dogfood-report.json'), JSON.stringify(report, null, 2) + '\n')

  console.log(`\nsynthetic-dogfood: GRADE ${niche} — ${summary.pass ? 'PASS' : 'BLOCK'} · ${defects.length} defect(s)`)
  const byGate = {}
  for (const d of defects) (byGate[d.gate] ||= []).push(d)
  for (const [g, ds] of Object.entries(byGate)) {
    console.log(`  #${g} (${ds.length})`)
    for (const d of ds.slice(0, 6)) console.log(`     ${d.id}${d.page ? ` [${d.page}]` : ''} — ${String(d.detail).slice(0, 110)}`)
  }
  console.log(`\n  report: ${path.relative(REPO, path.join(dir, 'dogfood-report.json'))}`)
  process.exit(summary.pass ? 0 : 1)
}

function list() {
  if (!fs.existsSync(BRIEFS)) { console.log('no briefs yet — add evals/synthetic-builds/briefs/<niche>.json'); return }
  const briefs = fs.readdirSync(BRIEFS).filter((f) => f.endsWith('.json'))
  console.log('synthetic-dogfood — brief specs:')
  for (const f of briefs) {
    const niche = f.replace(/\.json$/, '')
    const built = fs.existsSync(path.join(BUILDS, niche)) ? ' [provisioned]' : ''
    let brand = ''
    try { brand = JSON.parse(fs.readFileSync(path.join(BRIEFS, f), 'utf-8')).brand || '' } catch { /* skip */ }
    console.log(`  ${niche.padEnd(24)} ${brand}${built}`)
  }
}

function main() {
  const [cmd, niche] = process.argv.slice(2)
  if (cmd === 'list' || !cmd) return list()
  if (cmd === 'clean') { if (!niche) die('clean <niche>'); fs.rmSync(path.join(BUILDS, niche), { recursive: true, force: true }); console.log(`cleaned ${niche}`); return }
  if (!niche) die(`${cmd} <niche> — run 'list' for niches`)
  if (cmd === 'provision') return provision(niche)
  if (cmd === 'grade') return grade(niche)
  die(`unknown command "${cmd}" — use list | provision <niche> | grade <niche> | clean <niche>`)
}

if (isMain(import.meta.url)) main()
