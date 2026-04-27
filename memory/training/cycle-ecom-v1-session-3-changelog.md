# Ecom Training Cycle v1 — Session 3 Changelog

**Date:** 2026-04-27
**Session:** 3 of 8 (focus: Elio PDP + hero design)
**Format:** AskUserQuestion popup, all 12 selected "Recommended"
**Patches composed:** 14

## Per-Q lessons + patch targets

### ECOM-ELI-001 — PDP hero layout
**Decision:** Mobile-first stack (gallery top, info below) on ALL devices including desktop. Desktop = wider gallery + tighter info column. Single design system, no breakpoint divergence.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md`, `skills/elio/mobile-ecom-design-protocol.md` (stack-on-desktop principle)

### ECOM-ELI-002 — Variant density tiers
**Decision:** Tiered by per-axis count: ≤8 swatches grid / 9-20 hybrid (color swatches + size buttons) / >20 dropdown. Per axis, not total combos.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (variant-density tier table)

### ECOM-ELI-003 — Stock urgency ethics
**Decision:** Display specific count ONLY when ≤5 in real verifiable inventory. Above 5 = hide indicator entirely. NEVER vague text or marketing-soft scarcity. Trust > short-term lift.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (stock-urgency rule), `agents/elio.md` Anti-Patterns (no fake scarcity)

### ECOM-ELI-004 — Trust trio placement niche-tier
**Decision:** ABOVE ATC for skeptical niches (supplements/wellness/luxury). BELOW ATC for default niches (apparel/beauty/CPG/home).
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (trust-trio niche tier)

### ECOM-ELI-005 — Reviews module sort
**Decision:** Most-helpful default + secondary 'most recent' tab + 'photo only' filter. Three-option max.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (reviews-module spec)

### ECOM-ELI-006 — Cross-sell rail position
**Decision:** Bottom for low-AOV (<$50) commodity items. MID-SCROLL for high-AOV (>$100) considered purchases. $50-100 zone defaults bottom.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (cross-sell tier rule)

### ECOM-ELI-007 — PDP image count tiers
**Decision:** Tiered by price: 4-6 (under $40) / 6-10 ($40-150) / 10-15 (>$150). Decoder-validated tier mapping.
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (image-count tier table)

### ECOM-ELI-008 — Homepage hero type
**Decision:** Single static lifestyle photography hero. NO carousel. Video background ONLY for premium niches (luxury, sleep, beauty editorial). Split-hero only for explicit dual-product launches.
**Patches:** `skills/elio/cart-checkout-design-protocol.md` is wrong target — actually `memory/design/ecom/hero-homepage-patterns.md` (hero type rule), `agents/elio.md` Anti-Patterns (no carousel, no auto-play sound)

### ECOM-ELI-009 — Hero text position
**Decision:** Overlay on image (mobile-first), top-left F-pattern aligned, high-contrast 40% black scrim for WCAG AA.
**Patches:** `memory/design/ecom/hero-homepage-patterns.md` (text-overlay rule), `skills/elio/mobile-ecom-design-protocol.md`

### ECOM-ELI-010 — Subscription toggle default
**Decision:** One-time selected by default. Subscription as 2nd option with savings % visible. Default-subscribe ONLY when LTV-sub > 3x (CAT-006 rule) AND churn-prevention strong (≥3-step cancel-save + pause option).
**Patches:** `skills/elio/ecom-pdp-design-protocol.md` (subscription-toggle default), cross-ref `skills/catalyst/cro-strategy-playbook.md`

### ECOM-ELI-011 — Confirmation page hierarchy
**Decision:** Order details FIRST (info-priority, reduces 'did it work?' anxiety) → upsell module SECOND (uses 30-min one-click window) → account-creation+referral THIRD.
**Patches:** `memory/design/ecom/post-purchase-patterns.md` (confirmation-zone order)

### ECOM-ELI-012 — Stack default (Shopify)
**Decision:** Hydrogen + RR7 (Stack B storefront mode) default. Liquid ONLY when (a) budget <$5K + theme exists, (b) theme app extensions required, (c) merchant insists.
**Patches:** `memory/stacks/shopify/storefront/INDEX.md` (stack decision matrix), `agents/elio.md` (stack default)

---

## Patch summary (14 patches)

| # | Target | Type | Source Q |
|---|--------|------|----------|
| 1 | `skills/elio/ecom-pdp-design-protocol.md` | consolidated update_existing | ELI-001..007, ELI-010 |
| 2 | `skills/elio/mobile-ecom-design-protocol.md` | pattern_addition | ELI-001, ELI-009 |
| 3 | `agents/elio.md` Anti-Patterns | pattern_addition | ELI-003, ELI-008 |
| 4 | `agents/elio.md` consolidated | pattern_addition | ELI-001..012 summary |
| 5 | `memory/design/ecom/hero-homepage-patterns.md` | pattern_addition | ELI-008, ELI-009 |
| 6 | `memory/design/ecom/post-purchase-patterns.md` | pattern_addition | ELI-011 |
| 7 | `memory/stacks/shopify/storefront/INDEX.md` | pattern_addition | ELI-012 |

## Stats
- Q answered: 12/12
- Skipped: 0
- Patches composed: 14
- Patches applied: 14 (next bash run)
- Drift incidents: 0

## Cross-references
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md` Session 3
- Session 1+2 changelogs: `~/.claude/memory/training/cycle-ecom-v1-session-{1,2}-changelog.md`
