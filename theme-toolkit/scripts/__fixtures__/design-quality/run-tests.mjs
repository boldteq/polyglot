#!/usr/bin/env node
// Self-test for check-design-quality.mjs (gate #12). Runs the gate against three
// fixtures and asserts exit codes + (case b) the blocker ids seen.
//
//   (a) CONFORMANT theme + TUNED pack             → exit 0 (pass)
//   (b) DRIFTED theme  + TUNED pack               → exit 1 (block) with the expected blocker ids
//   (c) DRIFTED theme  + SEED pack (calibration)  → exit 0 with warnings incl. dq.pack-not-tuned
//   (d) TUNED pack backed by <3 evidence cards    → exit 0 with dq.tuned-evidence-thin (never blocks)
//
// Run (Node 20): node scripts/__fixtures__/design-quality/run-tests.mjs
// Exit: 0 = all cases pass · 1 = a case failed.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-design-quality.mjs')
const PACKS_DIR = path.join(HERE, 'packs')

let failures = 0
const pass = (msg) => console.log(`  PASS  ${msg}`)
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures += 1 }

// Run the gate in a fixture dir with an isolated REPORT_DIR; return { code, report }.
function runGate(themeDir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-report-'))
  const env = {
    ...process.env,
    DNA_PACKS_DIR: PACKS_DIR,
    // pin the evidence corpus to the fixture so the suite never reads (or depends on) the real brain
    REFERENCE_EXAMPLES_DIR: path.join(HERE, 'reference-examples'),
    REPORT_DIR: reportDir,
    BASE_REF: '__no_such_base__', // force the reuse-map scope path (no git base in the fixture)
    // unset inherited env that could perturb the run
    DQ_FORCE_ENFORCE: '',
    ALLOW_DQ_WAIVER: '',
    DS_REQUIRE_SCOPE: '',
    ...extraEnv,
  }
  const r = spawnSync('node', [GATE], { cwd: themeDir, env, encoding: 'utf-8' })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-quality.json'), 'utf-8')) } catch { /* no report */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, report, stdout: r.stdout, stderr: r.stderr }
}

const conformant = path.join(HERE, 'conformant')
const drifted = path.join(HERE, 'drifted')

// ── (a) conformant + tuned → exit 0 ─────────────────────────────────────────
console.log('case (a) conformant theme + tuned pack → expect exit 0')
{
  const { code, report } = runGate(conformant)
  if (code === 0) pass(`exit 0 (pass=${report?.pass})`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
}

// ── (b) drifted + tuned → exit 1 with expected blocker ids ───────────────────
console.log('case (b) drifted theme + tuned pack → expect exit 1 with blocker ids')
{
  const { code, report } = runGate(drifted)
  const ids = new Set((report?.blockers || []).map(b => b.id))
  if (code === 1) pass(`exit 1 (block)`)
  else fail(`expected exit 1, got ${code}`)
  const expected = ['dq.type-scale-off', 'dq.components-below-floor', 'dq.hero-carousel-forbidden', 'dq.too-many-schemes']
  for (const id of expected) {
    if (ids.has(id)) pass(`blocker present: ${id}`)
    else fail(`missing expected blocker: ${id} (saw ${[...ids].join(', ') || 'none'})`)
  }
}

// ── (c) drifted + seed pack → exit 0 with dq.pack-not-tuned warning ──────────
console.log('case (c) drifted theme + seed pack → expect exit 0 with dq.pack-not-tuned')
{
  const { code, report } = runGate(drifted, { DESIGN_SPEC: 'docs/design/design-spec.seed.md' })
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (code === 0) pass(`exit 0 (calibration gate demoted blockers)`)
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  if (warnIds.has('dq.pack-not-tuned')) pass(`warning present: dq.pack-not-tuned`)
  else fail(`missing dq.pack-not-tuned warning (saw ${[...warnIds].join(', ') || 'none'})`)
  // the measurable failures must have become WARNINGS, not vanished
  for (const id of ['dq.type-scale-off', 'dq.components-below-floor', 'dq.hero-carousel-forbidden', 'dq.too-many-schemes']) {
    if (warnIds.has(id)) pass(`demoted to warning: ${id}`)
    else fail(`expected demoted warning: ${id}`)
  }
  if ((report?.blockers || []).length === 0) pass('zero blockers (seed pack)')
  else fail(`expected zero blockers, saw ${report.blockers.map(b => b.id).join(', ')}`)
}

// ── (d) tuned pack with thin evidence → warn, never block ───────────────────
// The defect this catches: `_meta.calibration` is a hand-typed string, so a pack can switch this gate
// to BLOCKING with no measured cards behind it. The thin corpus holds 3 card files of which only 1 is
// evidence (one is DRAFT, one has a bare `Source:`) — proving files are not counted as evidence.
console.log('case (d) tuned pack + <3 evidence cards → expect dq.tuned-evidence-thin warning')
{
  const { code, report } = runGate(conformant, { REFERENCE_EXAMPLES_DIR: path.join(HERE, 'reference-examples-thin') })
  const warn = (report?.warnings || []).find(w => w.id === 'dq.tuned-evidence-thin')
  if (code === 0) pass('exit 0 — an unbacked "tuned" claim warns, it never blocks the build')
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  if (warn) pass('warning present: dq.tuned-evidence-thin')
  else fail(`missing dq.tuned-evidence-thin (saw ${(report?.warnings || []).map(w => w.id).join(', ') || 'none'})`)
  if (warn && /\b1\/3\b/.test(warn.detail)) pass('warning reports the real count (1/3)')
  else fail(`expected "1/3" in the detail, got: ${warn?.detail || '(no warning)'}`)
  const ec = report?.evidence?.evidenceCards
  if (ec && ec.cards === 3 && ec.evidence === 1 && ec.draft === 1 && ec.unsourced === 1) pass('evidence records cards=3 evidence=1 draft=1 unsourced=1')
  else fail(`unexpected evidenceCards: ${JSON.stringify(ec)}`)
}

// ── (e) tuned pack with a full corpus → no evidence warning ─────────────────
console.log('case (e) tuned pack + 3 evidence cards → expect NO dq.tuned-evidence-thin')
{
  const { report } = runGate(conformant)
  const ids = new Set((report?.warnings || []).map(w => w.id))
  if (!ids.has('dq.tuned-evidence-thin')) pass('no false positive on a properly backed pack')
  else fail('dq.tuned-evidence-thin fired on a pack with 3 sourced non-draft cards')
  if (report?.evidence?.evidenceCards?.evidence === 3) pass('_index.md is not counted as a card (evidence=3)')
  else fail(`expected evidence=3, got ${JSON.stringify(report?.evidence?.evidenceCards)}`)
}

// ── (f) C2: serif-display niche + sans-only design-system → dq.font-family warning ──
// The bug this catches: "sans-serif" CONTAINS "serif", so the old check saw a serif face where there
// was only a sans one — a serif-led niche (jewelry, beauty) on a generic sans passed silently.
console.log('case (f) serif pack + sans-only design-system → expect dq.font-family warning')
{
  const serifDir = path.join(HERE, 'serif-mismatch')
  const { code, report } = runGate(serifDir)
  const warn = (report?.warnings || []).find(w => w.id === 'dq.font-family')
  if (code === 0) pass('exit 0 (seed pack — measurable failures demote, no block)')
  else fail(`expected exit 0, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  if (warn) pass('warning present: dq.font-family (serif niche shipped on sans)')
  else fail(`missing dq.font-family warning (saw ${(report?.warnings || []).map(w => w.id).join(', ') || 'none'})`)
  if (warn && /serif/i.test(warn.detail)) pass('warning names the serif/sans mismatch')
  else fail(`expected serif mention in detail, got: ${warn?.detail || '(no warning)'}`)
}

// ── (g) A2 fallback: no design-spec dna_pack → niche resolves from docs/build-state.json ────────────
// The gap the haircare dogfood surfaced: taste enforcement silently skipped when drape forgot the
// `dna_pack:` line, even though build-state.json knew the niche. The gate now falls back to it.
console.log('case (g) no dna_pack in design-spec → niche resolved from docs/build-state.json')
{
  const dir = path.join(HERE, 'build-state-fallback')
  const { code, report } = runGate(dir)
  if (report?.evidence?.niche === 'test-supplements-seed') pass('niche resolved from build-state.json (design-spec dna_pack absent)')
  else fail(`expected niche from build-state, got ${JSON.stringify(report?.evidence?.niche)}`)
  // seed pack → measurable failures demote to warnings → exit 0 (no false block from the fallback)
  if (code === 0) pass('seed pack via fallback does not block')
  else fail(`expected exit 0 via seed fallback, got ${code}; blockers=${JSON.stringify(report?.blockers?.map(b => b.id))}`)
  const warnIds = new Set((report?.warnings || []).map(w => w.id))
  if (!warnIds.has('dq.pack-missing')) pass('no dq.pack-missing — the pack WAS resolved (not skipped)')
  else fail('dq.pack-missing fired — fallback did not resolve the pack')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
