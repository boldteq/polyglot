#!/usr/bin/env node
// Gate #24 media (Press family) — MERGED media-quality gate.
// Absorbs #24 art-direction (responsive <picture>/srcset when imagery.art_direction declared) +
// #34 image-quality (per-slot weight/format/resolution — an oversized hero is the #1 LCP killer).
// Both halves skip cleanly when their surface is absent → media skips clean on a thin build.
// Runs the proven absorbed checks via spawn-and-aggregate (lib/merge-spawn.mjs).

import { writeReport } from './lib/report.mjs'
import { runAbsorbed } from './lib/merge-spawn.mjs'

const cwd = process.cwd()
const t0 = Date.now()
const { blockers, warnings, skipped, sources } = runAbsorbed(
  [
    { script: 'check-art-direction.mjs', report: 'art-direction' },
    { script: 'check-image-quality.mjs', report: 'image-quality' },
  ],
  { cwd, env: process.env },
)
const pass = blockers.length === 0
writeReport('imagery', 24, {
  cwd, pass, blockers, warnings,
  evidence: { merged: ['art-direction', 'image-quality'], sources, skipped },
  duration_ms: Date.now() - t0,
})
console.log(`media (#24): ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)${skipped.length ? ` · ${skipped.join('; ')}` : ''}`)
process.exit(pass ? 0 : 1)
