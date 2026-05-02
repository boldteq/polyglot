# Ecom Training Cycle v1 — Session 6 Changelog

**Date:** 2026-04-27
**Session:** 6 of 8 (Merch PDP body + objections)
**Format:** AskUserQuestion popup, all 12 selected "Recommended"
**Patches composed:** 13

## Per-Q lessons

### ECOM-MRC-001 — Feature-first push-back
**Decision:** Push back with decoder evidence + offer 14-day A/B test. Ship benefits-first by default if client refuses test. Document override in retainer if client REALLY insists.
Patches: `agents/merch.md`, `skills/merch/pdp-body-structure.md`

### ECOM-MRC-002 — Paragraph cap
**Decision:** 60 words default. Flex to 100 for luxury/editorial. Hard ceiling 100 (above splits multi-para).
Patches: `skills/merch/pdp-body-structure.md`

### ECOM-MRC-003 — Bullet count tier
**Decision:** Niche-tier: 3 (apparel/fashion/CPG sleek) / 4 (default) / 5 (supplements/tech/wellness proof-heavy). Cap 5.
Patches: `skills/merch/pdp-body-structure.md`

### ECOM-MRC-004 — Inline 5 max + FAQ overflow
**Decision:** ALWAYS 5-inline cap. FAQ holds rest with smart anchor links from inline ('See N more questions about fit →').
Patches: `skills/merch/pdp-body-structure.md`, `skills/merch/objection-handling-frameworks.md`

### ECOM-MRC-005 — Supplements objection priority
**Decision:** Safety > Efficacy timing > Drug interactions > Money-back > Subscription cancellation.
Patches: `skills/merch/objection-handling-frameworks.md`, `memory/content/ecom/objection-handling-library.md`

### ECOM-MRC-006 — Spec table jargon policy
**Decision:** Use jargon when audience expects it (skincare actives, supplement compounds, tech specs). Add inline tooltip glossary for one-word definitions. Plain language for apparel/CPG.
Patches: `skills/merch/pdp-body-structure.md`

### ECOM-MRC-007 — Inline vs FAQ split
**Decision:** Inline = top 5 by purchase-blocking severity (decoder-ranked). FAQ = lower-severity logistics + edge cases.
Patches: `skills/merch/pdp-body-structure.md`, `skills/merch/objection-handling-frameworks.md`

### ECOM-MRC-008 — Founder story
**Decision:** PDP excludes founder story by default. Lives at /about + welcome email 2. Exception: founder-credentialed niches get 1-line founder credential near trust trio (not full story).
Patches: `skills/merch/pdp-body-structure.md`

### ECOM-MRC-009 — Returns tone
**Decision:** Confident-warm default ('Don't love it? Send it back, free.'). Corporate-precise for B2B / luxury / high-AOV >$300.
Patches: `skills/merch/objection-handling-frameworks.md`

### ECOM-MRC-010 — Review extraction policy
**Decision:** Extract liberally with attribution (first name + verified-purchase tag). Explicit consent for full quotes.
Patches: `memory/content/ecom/pdp-copy-patterns.md`, `skills/merch/pdp-body-structure.md`

### ECOM-MRC-011 — Comparison tables
**Decision:** Allow ONLY for category-disruption brands + high-consideration purchases. NEVER name competitors directly (use 'Other [category]'). Top product only, not full catalog.
Patches: `skills/merch/pdp-body-structure.md`, `agents/merch.md` Anti-Patterns

### ECOM-MRC-012 — Scarcity language
**Decision:** Allow ONLY with verifiable inventory truth + specific numbers. Never vague soft-scarcity ('Limited', 'Selling fast'). Mirrors ELI-003 design rule.
Patches: `agents/merch.md` Anti-Patterns, `skills/merch/objection-handling-frameworks.md`

## Stats
- Q answered: 12/12
- Patches composed: 13
- Patches applied: 13
- Drift: 0
