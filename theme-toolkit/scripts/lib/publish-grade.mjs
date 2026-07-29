// publish-grade — the one place that decides "this run is authoritative → enforce like a publish".
//
// B3 (2026-07-24): the verification report asked to "promote warn-only gates to block". Investigation
// showed the enforcement ladder ALREADY does this correctly — it is not a global warn→block flip (that
// would refire the false-block class the ≥2-store graduation doctrine exists to prevent). Instead, a FULL
// (authoritative) run is PUBLISH-GRADE: it turns on the env the block-ELIGIBLE warn gates read, so they
// block at publish while staying warn on a fast --static-only dev pass:
//   • DS_REQUIRE_SCOPE=1   → app-conflicts / brand-sync / imagery-art-direction / email-triggers / the
//                            scope-aware honesty + design-quality gates BLOCK instead of warn-skip.
//   • STRICT_CONVERSION=1  → fabricated-activity / unsourced-stat honesty findings can't be LENIENT-downgraded.
//   • BASELINE_ENFORCE=1   → design-quality (#12) enforces the cross-niche PREMIUM BASELINE floor for an
//                            UN-TUNED niche (draft/seed pack, or no pack). Without it, ~60% of niches ship
//                            with taste DEMOTED TO WARNINGS — a generic build reads green (the "green ≠ good
//                            design" hole, 2026-07-29 audit). A tuned niche pack still takes precedence and
//                            blocks on its own bar; a specific floor stays waivable via CHANGES.md ## Waivers.
// `theme-gates.mjs --verify --require-full` (which the publish path requires) mandates mode==="full", so
// publish evidence is always produced under this. Extracted + exported so the invariant is UNIT-PROVEN:
// if this ever stopped setting DS_REQUIRE_SCOPE / BASELINE_ENFORCE, every block-eligible warn gate (and the
// taste floor) would silently stop blocking at publish — a catastrophic, invisible quality hole. Now tested.

export function applyPublishGrade(mode, env = {}) {
  const out = { ...env };
  if (mode === 'full') {
    if (!out.DS_REQUIRE_SCOPE) out.DS_REQUIRE_SCOPE = '1';
    if (!out.STRICT_CONVERSION) out.STRICT_CONVERSION = '1';
    if (!out.BASELINE_ENFORCE) out.BASELINE_ENFORCE = '1';
  }
  return out;
}

// True iff this env would make the block-eligible warn gates enforce (i.e. it is publish-grade).
export function isPublishGrade(env = {}) {
  return env.DS_REQUIRE_SCOPE === '1';
}
