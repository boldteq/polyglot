#!/usr/bin/env node
// Hermetic fixture for B3 — the publish-grade enforcement invariant (lib/publish-grade.mjs).
//
// THE INVARIANT this proves and pins: a FULL (authoritative) run turns on DS_REQUIRE_SCOPE, which is the
// env the block-ELIGIBLE warn gates (app-conflicts / brand-sync / imagery art-direction / scope-aware
// honesty + design-quality) read to BLOCK instead of warn. `theme-gates.mjs --verify --require-full`
// (the publish precondition) mandates mode==="full", so publish evidence is ALWAYS publish-grade. If this
// wiring silently broke, every one of those gates would quietly stop blocking at publish — an invisible
// catastrophic hole. This test makes that impossible to regress unnoticed.
//
// Run (Node 20): node scripts/__fixtures__/publish-grade/run-tests.mjs · Exit 0 = all pass.

import { applyPublishGrade, isPublishGrade } from '../../lib/publish-grade.mjs'

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('applyPublishGrade — a full run is publish-grade')
{
  const full = applyPublishGrade('full', { FOO: 'bar' })
  full.DS_REQUIRE_SCOPE === '1' ? ok('full → DS_REQUIRE_SCOPE=1 (block-eligible warn gates enforce)') : bad(`full DS_REQUIRE_SCOPE=${full.DS_REQUIRE_SCOPE}`)
  full.STRICT_CONVERSION === '1' ? ok('full → STRICT_CONVERSION=1 (fabrication can’t be LENIENT-downgraded)') : bad(`full STRICT_CONVERSION=${full.STRICT_CONVERSION}`)
  full.BASELINE_ENFORCE === '1' ? ok('full → BASELINE_ENFORCE=1 (design-quality enforces the premium floor for un-tuned niches)') : bad(`full BASELINE_ENFORCE=${full.BASELINE_ENFORCE}`)
  full.FOO === 'bar' ? ok('preserves unrelated env') : bad('dropped unrelated env')
  isPublishGrade(full) ? ok('isPublishGrade(full env) → true') : bad('isPublishGrade should be true for a full run')
}

console.log('applyPublishGrade — a partial / static-only run stays warn-grade')
{
  const partial = applyPublishGrade('partial', {})
  partial.DS_REQUIRE_SCOPE === undefined ? ok('partial → DS_REQUIRE_SCOPE unset (warn gates stay warn for fast dev)') : bad(`partial set DS_REQUIRE_SCOPE=${partial.DS_REQUIRE_SCOPE}`)
  partial.STRICT_CONVERSION === undefined ? ok('partial → STRICT_CONVERSION unset') : bad(`partial set STRICT_CONVERSION=${partial.STRICT_CONVERSION}`)
  partial.BASELINE_ENFORCE === undefined ? ok('partial → BASELINE_ENFORCE unset (taste stays warn for fast dev)') : bad(`partial set BASELINE_ENFORCE=${partial.BASELINE_ENFORCE}`)
  !isPublishGrade(partial) ? ok('isPublishGrade(partial env) → false') : bad('isPublishGrade should be false for a partial run')
}

console.log('applyPublishGrade — never overrides an explicit env value (idempotent)')
{
  const preset = applyPublishGrade('full', { DS_REQUIRE_SCOPE: '0', STRICT_CONVERSION: '0' })
  preset.DS_REQUIRE_SCOPE === '0' ? ok('respects a caller’s explicit DS_REQUIRE_SCOPE=0') : bad(`overrode DS_REQUIRE_SCOPE → ${preset.DS_REQUIRE_SCOPE}`)
  preset.STRICT_CONVERSION === '0' ? ok('respects a caller’s explicit STRICT_CONVERSION=0') : bad(`overrode STRICT_CONVERSION → ${preset.STRICT_CONVERSION}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
