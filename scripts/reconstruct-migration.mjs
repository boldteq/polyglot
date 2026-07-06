#!/usr/bin/env node
// Reconstructs the gate migration on a CLEAN worktree (at the pre-gate-migration tag) so it can be
// committed with ZERO of Yash's WIP bundled. Run order (see the bash that drives it):
//   1) worktree created at the tag · 2) gate-migration-map.json + apply-gate-renames.mjs copied in
//   3) apply-gate-renames --apply run in the worktree (deterministic writeReport+fixture renames on
//      the clean base) · 4) THIS script copies the clean manual-edited + new files from MAIN and
//      re-applies the check-visual-truth fold · 5) coherence+suite verify · 6) commit.
// MAIN and WT come from argv.

import fs from 'node:fs'
import path from 'node:path'

const [MAIN, WT] = process.argv.slice(2)
if (!MAIN || !WT) { console.error('usage: reconstruct-migration.mjs <MAIN> <WT>'); process.exit(2) }

// Clean migration files (pure migration in MAIN — NOT entangled with Yash's pre-existing WIP).
// EXCLUDES: gate-axe/gate-functional/check-consistency/check-visual-truth (entangled scripts — their
// writeReport rename is reproduced by apply-gate-renames on the clean base) and the harmony/lens
// fixtures (entangled — reproduced clean by apply-gate-renames token rewrite).
const COPY = [
  'scripts/migrate-gate-refs.mjs',
  'scripts/swt-verify-selftest.mjs',
  'scripts/regen-workspace-specs.mjs',
  'scripts/swt-train-loop.mjs',
  'scripts/swt-distribute.mjs',
  'theme-toolkit/scripts/check-media-quality.mjs',
  'theme-toolkit/scripts/check-governance.mjs',
  'theme-toolkit/scripts/lib/merge-spawn.mjs',
  'theme-toolkit/scripts/theme-gates.mjs',
  'theme-toolkit/scripts/gate-conversion.mjs',
  'theme-toolkit/scripts/check-placeholder-text.mjs',
  'theme-toolkit/scripts/aim-dogfood.mjs',
  'theme-toolkit/scripts/__fixtures__/stack-coherence/run-tests.mjs',
  'src/lib/gateFindings.js',
  'src/lib/gateFindings.test.js',
  'src/lib/workspace/readGateReports.js',
  'src/lib/workspace/diskWatcher.js',
  'src/lib/workspace/actionRegistry.js',
  'src/lib/workspace/gatesSpec.json',
  'src/lib/workspace/pipelineSpec.json',
  'src/routes/lens.js',
  'src/routes/workspace.js',
  'client/src/components/workspace/GatesTab.tsx',
  // fixture FIX files that are clean migration (their dirs exist post-apply-gate-renames):
  'theme-toolkit/scripts/__fixtures__/a11y/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/anchor/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/blueprint/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/design-quality-baseline/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/discovery-schema/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/regressions/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/media/run-tests.mjs',
  'theme-toolkit/scripts/__fixtures__/tribunal/run-tests.mjs',
]

let copied = 0, missing = []
for (const f of COPY) {
  const src = path.join(MAIN, f), dst = path.join(WT, f)
  if (!fs.existsSync(src)) { missing.push(f); continue }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  copied++
}

// Re-apply the check-visual-truth FOLD on the worktree's clean+renamed file (apply-gate-renames already
// renamed its writeReport visual-truth→lens; add the runAbsorbed import + the finish() fold).
const vt = path.join(WT, 'theme-toolkit/scripts/check-visual-truth.mjs')
let t = fs.readFileSync(vt, 'utf8')
if (!t.includes('merge-spawn')) {
  t = t.replace(
    "import { writeReport } from './lib/report.mjs'\nimport { applyRegressionRegistry, readRegistry, writeRegistry } from './lib/lens-regressions.mjs'",
    "import { writeReport } from './lib/report.mjs'\nimport { runAbsorbed } from './lib/merge-spawn.mjs'\nimport { applyRegressionRegistry, readRegistry, writeRegistry } from './lib/lens-regressions.mjs'",
  )
  t = t.replace(
    "function finish(envError, evidence = {}) {\n  const pass = !envError && blockers.length === 0",
    "function finish(envError, evidence = {}) {\n  // MERGED #17 visual-quality (onyx self-attestation) — folded into lens's findings as a secondary signal\n  if (!envError) {\n    try {\n      const m = runAbsorbed([{ script: 'check-visual-quality.mjs', report: 'visual-quality' }], { cwd, env: process.env })\n      blockers.push(...m.blockers); warnings.push(...m.warnings)\n    } catch { /* visual-quality attestation fold best-effort */ }\n  }\n  const pass = !envError && blockers.length === 0",
  )
  fs.writeFileSync(vt, t)
}
const foldOk = fs.readFileSync(vt, 'utf8').includes('merge-spawn')
console.log(`reconstruct: copied ${copied}/${COPY.length}${missing.length ? ` · MISSING: ${missing.join(', ')}` : ''} · visual-truth fold ${foldOk ? 'applied' : 'FAILED'}`)
process.exit(missing.length || !foldOk ? 1 : 0)
