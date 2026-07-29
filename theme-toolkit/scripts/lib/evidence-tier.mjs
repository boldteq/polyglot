// Evidence-tier → enforcement-cap. A finding may not enforce HARDER than its EVIDENCE justifies.
//
// Source: the Shopify Mastery-pack `evidencePolicy` (docs/shopify-mastery/taste-rubric.json) — E
// (study-backed / platform-binding) may reject/block · P (practitioner consensus, unmeasured) may only
// warn · H (house taste) may only note/advise. The pack validates this at INSTALL time (install.sh step 7);
// this module makes the same invariant LIVE in the runtime gate stack, enforced across every gate report by
// check-gate-integrity (#45). It exists because the mastery-pack audit caught a real defect — AT-10 was
// tagged P yet carried a hard-stop action — and our own gate #53 had the identical shape (a [P] cliché-
// headline tell that blocked at publish-grade). An opinion-grade rule that can hard-block a build is a
// false-BLOCK risk, which house doctrine holds is "as bad as a false pass".
//
// PURE, no IO. A finding with no `tier` is EXEMPT (capExceeded → false), so tagging is opt-in and adding
// this is non-breaking for the many gates that assert correctness (not taste) and declare no tier.

// What each evidence tier is ALLOWED to enforce, as a max severity.
export const TIER_CAP = { E: 'block', P: 'warn', H: 'advise' }
// Severity ordering. A finding's severity comes from WHICH report array it sits in: blockers[] → 'block',
// warnings[] → 'warn'. ('advise' has no array today; the rank exists so an H-tier cap is expressible.)
export const SEVERITY_RANK = { advise: 0, warn: 1, block: 2 }

// The cap for a tier, tolerant of case; unknown tier → null (no constraint).
export function capForTier(tier) {
  return TIER_CAP[String(tier || '').toUpperCase()] || null
}

// true when `severity` is STRONGER than what `tier` is allowed to enforce. Unknown/absent tier → false
// (exempt); unknown severity → false (nothing to judge). This is the invariant #45 asserts per finding.
export function capExceeded(tier, severity) {
  const cap = capForTier(tier)
  if (!cap) return false
  const sev = SEVERITY_RANK[severity]
  if (sev === undefined) return false
  return sev > SEVERITY_RANK[cap]
}
