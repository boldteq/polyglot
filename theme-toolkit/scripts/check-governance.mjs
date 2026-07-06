#!/usr/bin/env node
// Gate #31 tribunal (Tribunal family) — MERGED governance gate.
// Absorbs #32 red-team (a dedicated adversary attacks 4 axes BEFORE the board; every finding resolved
// or accepted-with-rationale) + #31 design-review-board (the governance-OS §5 8-role sign-off; any
// block / confidence <70 / partial board → fail). Red-team runs first (it precedes the board).
// Both verify their artifact and skip/warn-first when absent → tribunal blocks only at publish-grade.

import { writeReport } from './lib/report.mjs'
import { runAbsorbed } from './lib/merge-spawn.mjs'

const cwd = process.cwd()
const t0 = Date.now()
const { blockers, warnings, skipped, sources } = runAbsorbed(
  [
    { script: 'check-red-team.mjs', report: 'red-team' },
    { script: 'check-design-review-board.mjs', report: 'design-review-board' },
  ],
  { cwd, env: process.env },
)
const pass = blockers.length === 0
writeReport('review-board', 31, {
  cwd, pass, blockers, warnings,
  evidence: { merged: ['red-team', 'design-review-board'], sources, skipped },
  duration_ms: Date.now() - t0,
})
console.log(`tribunal (#31): ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)${skipped.length ? ` · ${skipped.join('; ')}` : ''}`)
process.exit(pass ? 0 : 1)
