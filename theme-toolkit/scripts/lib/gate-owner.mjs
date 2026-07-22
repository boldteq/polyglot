// Gate → owner routing + auto-fix eligibility for gate-autofix.mjs (the code/content sibling of
// lens-autofix). PURE, no IO — hermetically testable. Mirrors src/lib/gateFindings.js GATE_OWNER but
// keyed by the CURRENT branded gate names (theme-gates.mjs) and split into "auto-fixable by a code
// owner" vs "ESCALATE — needs real content/assets/claims/decisions a blind LLM edit must never invent."
//
// Doctrine (full-autonomy-rules.md + shopify-definition-of-done.md): honesty, real assets, brand
// identity, legal, store-data (porter), and anything ambiguous ESCALATE — the loop fixes only what an
// owner can deterministically edit inside the locked design system (gate #8 still blocks bad tokens).

// Static code/content gates a code owner can deterministically fix by editing theme files.
export const CODE_GATE_OWNER = {
  'code-lint': 'loom',        // #2  theme-check lint
  'editability': 'loom',      // #3  hardcoded content → merchant-editable
  'dead-code': 'loom',        // #11 unused assets / orphan sections
  'layout': 'loom',           // #22 CSS overflow / layout defects
  'design-tokens': 'loom',    // #8  off-scale/hardcoded → --ds-* tokens
  'consistency': 'loom',      // #9  store-wide type/weight/radii drift
  'render-check': 'loom',     // #14 declared tokens actually render / refs resolve
  'section-reuse': 'loom',    // #23 reuse-map
  'brand-sync': 'loom',       // #30 ds-cascade regenerated
  'static-a11y': 'loom',      // #16 alt/labels/tap-targets in markup
  'translations': 'loom',     // #28 locale key completeness
  'social-assets': 'loom',    // #39 favicon / OG present
  'consent': 'loom',          // #42 GDPR consent wired, non-blocking CTA
  'content-quality': 'ink',   // #36 dev placeholders / copy quality
  'design-quality': 'drape',  // #12 premium taste bar
  'reference-match': 'drape', // #46 built result vs the client's reference (archetype + visual diff)
  'class-d-visual': 'loom',   // #20 Class-D micro-change visual evidence
  'analytics-wiring': 'conduit', // #41 GA4/Meta events wired
  'app-conflicts': 'conduit', // #27 clashing apps
  'email-triggers': 'conduit',// #29 lifecycle triggers wired
}

// Gates that ALWAYS escalate — the fix needs real content/assets/claims/decisions, or is a security
// incident, that a blind edit must never fabricate.
export const ESCALATE_GATES = new Set([
  'honesty',      // #13 fabricated claims / fake urgency — needs real evidence, not a code edit
  'legal-pages',  // #37 privacy/terms/refund — real legal content
  'imagery',      // #24 art-direction / real photography — never invent an asset
  'redirects',    // #25 migration URL decisions
  'secret-scan',  // #0.6 leaked secret — security incident, human
  'price-binding',// #38 price data — never fabricate a price
])

// Per-check escape hatch: a finding whose id smells like a real-asset / honesty / legal / money need
// escalates EVEN inside an otherwise code-fixable gate (e.g. render-check `rw.placeholder-imagery`).
export const ESCALATE_CHECK_RE =
  /real[-_]?asset|placeholder[-_]?imagery|missing[-_]?(image|photo|asset|product)|brand[-_.]?name|founder|press|testimonial|award|clinical|fabricat|scarcity|countdown|unsourced|efficacy|\binci\b|legal|privacy|refund|payment|checkout|irreversible|secret|token[-_]?leak/i

// PURE. Given a finding {gate, check}, decide who fixes it (a code owner) or that it ESCALATES.
// → { fixable:true, owner } | { fixable:false, reason }
export function classifyFinding(finding) {
  const gate = String(finding.gate || '')
  const check = String(finding.check || finding.id || '')
  if (ESCALATE_GATES.has(gate)) return { fixable: false, reason: `${gate}: needs real content/asset/decision — escalate` }
  if (ESCALATE_CHECK_RE.test(check)) return { fixable: false, reason: `${check}: real-asset/claim/legal — escalate` }
  const owner = CODE_GATE_OWNER[gate]
  if (owner) return { fixable: true, owner }
  return { fixable: false, reason: `${gate}: no code owner (unknown gate) — escalate rather than blind-fix` }
}

// The owners the loop may dispatch a code fix to (everything else routes to the escalate bucket).
export const CODE_OWNERS = new Set(['loom', 'drape', 'ink', 'conduit', 'beacon'])
// Sentinel owner for findings that must escalate (not in CODE_OWNERS → the loop's "data" bucket).
export const ESCALATE_OWNER = 'human'
