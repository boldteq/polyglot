#!/usr/bin/env node
// brain:run — fire the brain's ACT layer ON-DEMAND against the REAL db. Same core as the weekly
// sys-tutor handler (systemSchedules.js tutorTraining): read judge calibration → reconcile orphaned
// auto-approved patches → runTrainerPass({apply:true}). Use it to apply auto-approved guardrails NOW
// instead of waiting for the weekly cron / a boot catch-up. Rollback-armed, eval-gated (autos held if
// the judge is miscalibrated). Reuses the brain-proof-proven functions — no new logic.
//
// Run (Node 20): node scripts/brain-run.mjs   ·   pnpm brain:run
// Verify after: sqlite3 data/polyglot.db "SELECT status,COUNT(*) FROM training_patches GROUP BY status"

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const configService = require('../src/lib/configService')
const { runTrainerPass, reconcileAutoPatches } = await import('../src/intelligence/trainer.mjs')
const { getEvalCalibration } = await import('../src/intelligence/governor.mjs')

const cfgN = (k, d) => { const v = configService.getConfig?.(k); return Number.isFinite(v) ? v : d }
const cfg = {
  observeWindowHours: cfgN('trainer.observeWindowHours', 504),
  minRunsForImpact: cfgN('trainer.minRunsForImpact', 5),
  regressionThreshold: cfgN('trainer.regressionThreshold', 0.10),
  cooldownHours: cfgN('trainer.cooldownHours', 48),
  minObserveHours: cfgN('trainer.minObserveHours', 24),
}

const calib = getEvalCalibration()
console.log(`brain:run — eval calibration: ${calib.calibrated ? `OK${calib.ageDays != null ? ` (${calib.ageDays}d old)` : ''}` : `MISCALIBRATED (${calib.reason}) → autos HELD`}`)

const reconciled = reconcileAutoPatches({ evalCalibrated: calib.calibrated, by: 'brain:run' })
const { cycle, impact } = runTrainerPass({ apply: true, cfg, evalCalibrated: calib.calibrated })

const applied = [...(reconciled.applied || []), ...(cycle.applied || [])]
console.log(`brain:run — APPLIED ${applied.length} (reconciled ${(reconciled.applied || []).length} + fresh ${(cycle.applied || []).length}) · proposed-for-review ${(cycle.proposed || []).length} · reverted ${(impact.reverted || []).length} · signals scanned ${cycle.scanned ?? 0}`)
for (const a of applied) console.log(`  ✓ applied  ${a.agent || ''}  ${a.id || ''}`)
if (!calib.calibrated) console.log('  ⚠ autos HELD — run sys-intel-eval to calibrate the judge, then re-run brain:run.')
process.exit(0)
