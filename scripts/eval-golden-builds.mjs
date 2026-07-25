#!/usr/bin/env node
// eval-golden-builds — the held-out BENCHMARK for the build fleet (audit gap 2 / roadmap Phase 2).
//
// The 16 golden cases in src/intelligence/eval/golden are single-ARTIFACT unit tests (one section, one
// trust block). Nothing scored a whole brief → built theme, and no change was ever scored against a
// build corpus before it shipped — so "did this change help?" could not be answered before the fleet
// inherited it. This is that missing benchmark: a corpus of briefs, each with a mechanical `must_pass`
// checklist, scored against a real build's gate-reports. A change to an agent .md / a gate / a rule-pack
// runs the corpus and MUST NOT drop the aggregate score (the regression gate, wired in CI).
//
// The corpus starts small and GROWS via the ratchet: every fixed bug becomes a regression-<id>.json case
// (see docs/ratchet). Seeded from the real client repos on disk — provenance recorded per case, never
// invented. Read-only: it reads a build's gate-reports/summary.json + sections/, never writes a client repo.
//
// Usage:
//   node scripts/eval-golden-builds.mjs --corpus              # score every case vs its reference repo → aggregate
//   node scripts/eval-golden-builds.mjs <buildDir> --case <id>  # score one build against one case
//   node scripts/eval-golden-builds.mjs --regression [--baseline <n>]  # exit 1 if aggregate dropped below baseline
//   node scripts/eval-golden-builds.mjs --write-baseline       # record the current aggregate as the baseline
// Env: GOLDEN_DIR (default evals/golden-builds), GOLDEN_BASELINE (overrides baseline.json)
// Exit: 0 ok · 1 regression / a case failed under --regression · 2 usage/env error
//
// The SCORING is pure (scoreCase / scoreCorpus) + hermetically tested in src/evalGoldenBuilds.test.mjs.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..')
const GOLDEN_DIR = process.env.GOLDEN_DIR || path.join(REPO, 'evals', 'golden-builds')
const BASELINE_F = path.join(GOLDEN_DIR, 'baseline.json')

// PURE: score one build's evidence against a case's must_pass checklist. Every criterion is mechanical
// (a gate that must be green + not skipped, a section that must exist, a pass-rate/blocker ceiling) so a
// score is reproducible without a model. Returns { pass, score, failures, checks }.
export function scoreCase(summary, sections, mustPass) {
  const failures = []
  const gates = (summary && summary.gates) || {}
  const names = Object.keys(gates)

  for (const g of mustPass.gates_green || []) {
    const r = gates[g]
    if (!r) failures.push(`gate "${g}" absent from the run`)
    else if (r.skipped) failures.push(`gate "${g}" was skipped (skip ≠ pass)`)
    else if (!r.pass) failures.push(`gate "${g}" failed`)
  }
  for (const s of mustPass.sections_present || []) {
    if (!sections.includes(s)) failures.push(`section "${s}" missing`)
  }
  let passRate = null
  if (names.length) {
    const passed = names.filter((n) => gates[n].pass && !gates[n].skipped).length
    passRate = passed / names.length
  }
  if (mustPass.min_pass_rate != null) {
    if (passRate == null) failures.push('no gates ran — cannot judge pass-rate')
    else if (passRate < mustPass.min_pass_rate) failures.push(`pass-rate ${(passRate * 100).toFixed(0)}% < required ${(mustPass.min_pass_rate * 100).toFixed(0)}%`)
  }
  if (mustPass.max_blockers != null) {
    const blockers = names.reduce((a, n) => a + ((gates[n].blockers || []).length), 0)
    if (blockers > mustPass.max_blockers) failures.push(`${blockers} blocker(s) > allowed ${mustPass.max_blockers}`)
  }

  const checks = (mustPass.gates_green || []).length + (mustPass.sections_present || []).length
    + (mustPass.min_pass_rate != null ? 1 : 0) + (mustPass.max_blockers != null ? 1 : 0)
  const score = checks ? +((checks - failures.length) / checks).toFixed(3) : null
  // buildHealth = the raw gate pass-rate, surfaced SEPARATELY from `score` (bar-satisfaction). A
  // low-water case (e.g. catalog @ min_pass_rate 0.35) can score 1.0 while the build is only 39% healthy;
  // reporting both stops "corpus 100%" being misread as "every build is good".
  return { pass: failures.length === 0, score, buildHealth: passRate == null ? null : +passRate.toFixed(3), failures, checks }
}

// PURE: roll per-case results into one corpus number (the regression-gate metric).
export function scoreCorpus(caseResults) {
  const scored = caseResults.filter((r) => r.score != null)
  const meanScore = scored.length ? +(scored.reduce((a, r) => a + r.score, 0) / scored.length).toFixed(3) : null
  return {
    cases: caseResults.length,
    scored: scored.length,
    passed: caseResults.filter((r) => r.pass).length,
    meanScore,
  }
}

// ── I/O (impure) ──────────────────────────────────────────────────────────────
function loadCases() {
  let files = []
  try { files = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json') && f !== 'baseline.json' && !f.startsWith('_')) } catch { return [] }
  return files.map((f) => { const c = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf-8')); c._file = f; return c })
}
// A real commit sha (not the "capture-on-commit" placeholder or empty) → the reference can be pinned.
export function isRealSha(sha) { return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha.trim()) }

// Reproducibility (2026-07-24): a corpus case scores the PINNED known_good_sha snapshot via `git show`
// (read-only — never touches the working tree or the store), NOT the live tree — else an uncommitted
// gate-rerun in the reference repo silently moves the score (observed: cravinbyandy live 88% vs its
// pinned sha 85%). Falls back to the working tree, flagged `pinned:false`, when the case has no real sha
// (e.g. mexdynamic has no commits → catalog can't be pinned, and the report says so honestly).
function readSummary(buildDir, sha) {
  if (isRealSha(sha)) {
    const r = spawnSync('git', ['-C', buildDir, 'show', `${sha}:gate-reports/summary.json`], { encoding: 'utf-8' })
    if (r.status === 0) { try { return { summary: JSON.parse(r.stdout), pinned: true } } catch { /* fall through to live */ } }
  }
  try { return { summary: JSON.parse(fs.readFileSync(path.join(buildDir, 'gate-reports', 'summary.json'), 'utf-8')), pinned: false } } catch { return { summary: null, pinned: false } }
}
function readSections(buildDir, sha) {
  if (isRealSha(sha)) {
    const r = spawnSync('git', ['-C', buildDir, 'ls-tree', '--name-only', sha, 'sections/'], { encoding: 'utf-8' })
    if (r.status === 0) return r.stdout.split('\n').filter((n) => n.endsWith('.liquid')).map((n) => path.basename(n, '.liquid'))
  }
  try { return fs.readdirSync(path.join(buildDir, 'sections')).filter((n) => n.endsWith('.liquid')).map((n) => n.replace(/\.liquid$/, '')) } catch { return [] }
}
function resolveRepo(c) {
  // a case names its reference build; if absent, the caller must pass a <buildDir>.
  if (!c.repo) return null
  // Portable: GOLDEN_REPO_ROOT relocates the whole corpus to wherever a machine keeps the reference
  // repos (CI, a teammate's Mac), resolving by the case's repo BASENAME. Else expand a leading ~.
  const root = process.env.GOLDEN_REPO_ROOT
  if (root) return path.join(root, path.basename(c.repo))
  return c.repo.replace(/^~/, process.env.HOME || '')
}

function scoreOneCase(c, buildDirOverride) {
  const dir = buildDirOverride || resolveRepo(c)
  if (!dir || !fs.existsSync(dir)) return { id: c.id, pass: false, score: null, failures: [`reference build not found: ${dir || '(none)'}`], checks: 0, missing: true }
  // corpus mode (no override) scores the PINNED known_good_sha snapshot for reproducibility; an ad-hoc
  // <buildDir> (the ratchet minting from a fresh build, or a dev run) scores the live working tree.
  const sha = buildDirOverride ? null : c.known_good_sha
  const { summary, pinned } = readSummary(dir, sha)
  if (!summary) return { id: c.id, pass: false, score: null, failures: [`no gate-reports/summary.json in ${dir} — run the gates first`], checks: 0, missing: true }
  return { id: c.id, pinned, ...scoreCase(summary, readSections(dir, sha), c.must_pass || {}) }
}

function main() {
  const argv = process.argv.slice(2)
  const buildDir = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--case' && argv[argv.indexOf(a) - 1] !== '--baseline')
  const caseId = (() => { const i = argv.indexOf('--case'); return i !== -1 ? argv[i + 1] : null })()
  const cases = loadCases()
  if (!cases.length) { console.error(`eval-golden-builds: no cases in ${GOLDEN_DIR} (add brief-*.json)`); process.exit(2) }

  if (caseId || (buildDir && !argv.includes('--corpus') && !argv.includes('--regression'))) {
    const c = cases.find((x) => x.id === caseId) || cases[0]
    const r = scoreOneCase(c, buildDir)
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  score ${r.score == null ? 'n/a' : (r.score * 100).toFixed(0) + '%'}`)
    for (const f of r.failures) console.log(`   ✗ ${f}`)
    process.exit(r.pass ? 0 : 1)
  }

  // corpus / regression: score every case against its reference repo
  const results = cases.map((c) => scoreOneCase(c))
  const agg = scoreCorpus(results)
  console.log(`\nGolden build corpus — ${agg.cases} case(s), ${agg.scored} scored, ${agg.passed} passing`)
  for (const r of results) {
    const health = r.buildHealth != null ? ` · health ${(r.buildHealth * 100).toFixed(0)}%` : ''
    const pin = r.missing ? '' : r.pinned ? ' · pinned' : ' · ⚠ UNPINNED (live tree)'
    console.log(`  ${r.pass ? '✓' : r.missing ? '·' : '✗'} ${r.id.padEnd(28)} score ${r.score == null ? 'n/a' : (r.score * 100).toFixed(0) + '%'}${health}${pin}${r.failures.length ? '  — ' + r.failures[0] : ''}`)
  }
  const unpinned = results.filter((r) => !r.missing && !r.pinned).length
  console.log(`  AGGREGATE meanScore: ${agg.meanScore == null ? 'n/a' : (agg.meanScore * 100).toFixed(1) + '%'}${unpinned ? ` · ⚠ ${unpinned} case(s) UNPINNED — score reflects the live tree, not a fixed commit` : ''}`)

  if (argv.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE_F, JSON.stringify({ meanScore: agg.meanScore, passed: agg.passed, cases: agg.cases, at: '(stamp on commit)' }, null, 2) + '\n')
    console.log(`  baseline written → ${path.relative(REPO, BASELINE_F)} (meanScore ${agg.meanScore})`)
    process.exit(0)
  }
  if (argv.includes('--regression')) {
    // Honest boundary (2026-07-24): the corpus references LOCAL client repos. On a machine that has NONE
    // of them (a fresh clone, CI), the gate must SKIP — not BLOCK on a null score. It only judges a
    // regression where a real reference build is actually present + gated.
    if (agg.scored === 0) {
      console.log('  REGRESSION GATE: SKIPPED — no reference repo present (set GOLDEN_REPO_ROOT to the corpus location, or run on the dev Mac that holds it). Not a pass, not a block.')
      process.exit(0)
    }
    let baseline = Number(process.env.GOLDEN_BASELINE)
    if (Number.isNaN(baseline)) { try { baseline = JSON.parse(fs.readFileSync(BASELINE_F, 'utf-8')).meanScore } catch { baseline = null } }
    if (baseline == null) { console.error('  no baseline — run --write-baseline first (or set GOLDEN_BASELINE)'); process.exit(2) }
    const dropped = agg.meanScore == null || agg.meanScore < baseline - 1e-9
    console.log(`  REGRESSION GATE: baseline ${(baseline * 100).toFixed(1)}% → now ${agg.meanScore == null ? 'n/a' : (agg.meanScore * 100).toFixed(1) + '%'} → ${dropped ? 'BLOCK (score dropped)' : 'OK'}`)
    process.exit(dropped ? 1 : 0)
  }
  process.exit(0)
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main()
