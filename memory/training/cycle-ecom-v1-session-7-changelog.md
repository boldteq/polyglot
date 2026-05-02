# Ecom Training Cycle v1 — Session 7 Changelog

**Date:** 2026-04-27
**Session:** 7 of 8 (Merch microcopy + ecom-cro mechanics)
**Format:** AskUserQuestion popup, all 14 selected "Recommended"
**Patches composed:** 16

## Per-Q lessons

### ECOM-MRC-013 — Cart empty state
Functional default; niche-flips (playful for casual brands, strict functional luxury/B2B).

### ECOM-MRC-014 — Error tone
Specific + actionable. Default warm; high-friction surfaces neutral. Never apologetic, never vague, never blame-y.

### ECOM-XCR-001 — Cart drawer back button
Close on back (mobile + desktop). Restore via #cart-open URL hash on forward nav.

### ECOM-XCR-002 — Free-ship raw vs display
Mechanic stores raw AOV value; display rounds to $5. Threshold logic fires on raw value.

### ECOM-XCR-003 — Upsell fallback chain
related-by-tag → bestsellers same category → recently viewed → hide row. NEVER unrelated bestsellers.

### ECOM-XCR-004 — Subscription-default-on criterion
ALL 3: cancel-flow save ≥30% AND monthly churn ≤8% AND pause self-serve.

### ECOM-XCR-005 — Cart-abandon min cart value
0.6× median-AOV per niche. Apparel $30 / supplements $20 / beauty $18 / CPG $12 / home $45.

### ECOM-XCR-006 — Post-purchase upsell complementary-only
Tag-related complement, NOT same-category replacement.

### ECOM-XCR-007 — Order bump position
Above payment default. Above review only when payment lacks prominent order summary.

### ECOM-XCR-008 — Bundle discount tiers
2p 10% / 3p 15% / 5p 20% / 10p 25%. Cap 25%. Luxury / high-AOV cap 15%.

### ECOM-XCR-009 — Stockout UX
Disabled greyed swatch + diagonal strikethrough + 'Notify me when back' email capture.

### ECOM-XCR-010 — 3-step cancel save
(1) Reason picker → (2) Contextual save (pause/reduce/discount based on reason) → (3) Confirm cancel OR save.

### ECOM-XCR-011 — Shipping default
Preselect Standard (free if threshold). Express/Overnight opt-in upgrades with clear delta.

### ECOM-XCR-012 — Returning customer detection
After-submit (single API call). Real-time only at 1M+ visitors/mo enterprise scale.

## Stats
- Q answered: 14/14
- Patches composed: 16
- Patches applied: 16
- Drift: 0
