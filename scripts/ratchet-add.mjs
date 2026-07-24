#!/usr/bin/env node
// ratchet-add — turn a JUST-FIXED defect into a PERMANENT golden regression case (roadmap "the ratchet",
// audit gap 2). The audit's definition of production-grade is not "bug-free" — it's "the same bug can
// never ship twice". Today a fixed bug rarely becomes a permanent test, so classes of defect recur (the
// theme-check hole, the inverted enforcement set, the image-banner-vs-slideshow hero). This mints an
// evals/golden-builds/regression-<slug>.json anchored to the gate that now PASSES, so if the defect
// returns that gate fails → the case fails → the regression gate (`pnpm golden:check`) BLOCKS in CI.
//
// It is the (1) half of the ratchet; quality-loop.mjs already does (2) — promoting a recurring defect to
// an [ENFORCED] rule. Together: every escaped bug becomes a permanent test AND a permanent gate.
//
// READ-ONLY over the reference build (a client repo). Writes only into Polyglot's evals/golden-builds/.
// REFUSES to ratchet a defect whose gate is still failing or was skipped — you can only lock in a real fix.
//
// Usage:
//   node scripts/ratchet-add.mjs <fixedBuildDir> --gate <gateName> --slug <kebab> [--brief "…"] [--section <name>] [--force]
// Exit: 0 minted (or already present) · 1 refused (gate not green) · 2 usage/env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreCase } from './eval-golden-builds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..')
const GOLDEN_DIR = process.env.GOLDEN_DIR || path.join(REPO, 'evals', 'golden-builds')

const arg = (name, argv) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null }

// Build a regression golden case from a FIXED build. Pure-ish (reads the build's summary; returns the
// case object + a reason if it must be refused) so the decision is testable.
export function mintRegressionCase(buildDir, { gate, slug, brief, section, now } = {}) {
  if (!gate || !slug) return { ok: false, reason: 'gate + slug are required' }
  const summaryPath = path.join(buildDir, 'gate-reports', 'summary.json')
  if (!fs.existsSync(summaryPath)) return { ok: false, reason: `no gate-reports/summary.json in ${buildDir} — run the gates on the fixed build first` }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
  const g = (summary.gates || {})[gate]
  if (!g) return { ok: false, reason: `gate "${gate}" is not in this build's report — can't anchor a regression to a gate that didn't run` }
  // The whole point is locking in a FIX: refuse if the gate is still failing or was skipped (skip ≠ pass).
  if (g.skipped) return { ok: false, reason: `gate "${gate}" was SKIPPED in this build (skip ≠ pass) — fix it and re-run before ratcheting` }
  if (!g.pass) return { ok: false, reason: `gate "${gate}" is still FAILING — a ratchet locks in a fix, not a defect. Fix it first.` }

  const gates_green = [gate]
  const must_pass = { gates_green }
  if (section) must_pass.sections_present = [section]
  const theCase = {
    id: `regression-${slug}`,
    brief: brief || `Regression guard: the "${gate}" defect (${slug}) must never return.`,
    niche: 'regression',
    repo: buildDir,
    known_good_sha: summary.sha || 'capture-on-commit',
    provenance: `Ratcheted ${now || '(date on commit)'}: defect "${slug}" was fixed and gate "${gate}" passed. If it ever fails again, this case blocks the build. The same bug can't ship twice.`,
    must_pass,
  }
  // sanity: the minted case MUST score PASS on the very build it was minted from (else it's malformed).
  const sections = (() => { try { return fs.readdirSync(path.join(buildDir, 'sections')).filter(n => n.endsWith('.liquid')).map(n => n.replace(/\.liquid$/, '')) } catch { return [] } })()
  const scored = scoreCase(summary, sections, must_pass)
  if (!scored.pass) return { ok: false, reason: `minted case does not pass on its own fixed build (${scored.failures.join('; ')}) — refusing to write a malformed regression case` }
  return { ok: true, case: theCase }
}

function main() {
  const argv = process.argv.slice(2)
  const VALUE_FLAGS = ['--gate', '--slug', '--brief', '--section']
  // the positional buildDir = a non-flag token that is NOT the value of a value-taking flag
  const buildDir = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1]))
  const gate = arg('--gate', argv)
  const slug = arg('--slug', argv)
  const brief = arg('--brief', argv)
  const section = arg('--section', argv)
  const force = argv.includes('--force')
  if (!buildDir || !gate || !slug) { console.error('usage: ratchet-add.mjs <fixedBuildDir> --gate <gateName> --slug <kebab> [--brief "…"] [--section <name>] [--force]'); process.exit(2) }

  const outPath = path.join(GOLDEN_DIR, `regression-${slug}.json`)
  if (fs.existsSync(outPath) && !force) { console.log(`ratchet: regression-${slug}.json already exists — the bug is already locked in (use --force to overwrite).`); process.exit(0) }

  const r = mintRegressionCase(buildDir, { gate, slug, brief, section })
  if (!r.ok) { console.error(`ratchet REFUSED: ${r.reason}`); process.exit(1) }
  fs.mkdirSync(GOLDEN_DIR, { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(r.case, null, 2) + '\n')
  console.log(`ratchet: minted ${path.relative(REPO, outPath)} — "${gate}" must stay green forever.`)
  console.log('  next: `pnpm golden:baseline` to re-anchor the corpus, then commit the new case.')
  process.exit(0)
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main()
