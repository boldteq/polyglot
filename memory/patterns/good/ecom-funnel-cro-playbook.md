# Ecom Funnel CRO Playbook

**Owner:** catalyst
**Status:** SCAFFOLD — authored W2 by catalyst from decoder teardowns + first-build wins.
**Companion:** `~/.claude/memory/patterns/good/cro-decoded-patterns.md` (validated CRO patterns library — decoder-promoted)
**Skill ref:** `~/.claude/skills/catalyst/cro-strategy-playbook.md`

---

## Funnel Stages + Benchmarks

| Stage | Median DTC | Top quartile | Boldteq target |
|-------|-----------|--------------|----------------|
| Visitor → Cart | 5-8% | 12%+ | ≥10% |
| Cart → Checkout | 40-50% | 65%+ | ≥55% |
| Checkout → Purchase | 65-75% | 85%+ | ≥80% |
| First Purchase → Repeat | 25-35% | 50%+ | ≥40% |
| Subscriber retention (90d) | 55-65% | 80%+ | ≥70% |

---

## Lift Mandate

40%+ relative improvement on baseline per surface tested. Baseline measured against:
1. Decoder bank median for same niche (until live A/B traffic available)
2. Live control variant (post-traffic threshold)

---

## Surface Priority Order (default)

1. **PDP hero** — highest visitor-touch leverage (decoder confidence: high)
2. **Cart drawer mechanics** — every cart-creator sees
3. **Checkout flow** — express-first, address autocomplete, field optimization
4. **Post-purchase upsell** — one-click 30-min window
5. **Subscription toggle** — default-state per niche
6. **Email signup discount** — 10-15% standard
7. **Listing filters** — faceted UX
8. **FAQ structure** — objection-handling

---

## Per-Niche Adjustments

(To be populated by decoder niche audits + catalyst tests.)

| Niche | Surface 1 priority | Reason |
|-------|--------------------|--------|
| Apparel | Fit-finder UX (often beats hero) | Size uncertainty = #1 objection |
| Supplements | Trust signals (3rd-party testing) | Skepticism dominates |
| Beauty | Shade-finder + ingredient transparency | Personalization = differentiation |
| Home | Configurator UX + room-context photography | Visualization = decision driver |
| Tech | Spec-table positioning + competitor comparison | Decision-tree shoppers |

---

## Test Sequencing Rules

- 1-2 tests live per project per week
- ≤3 tests on same surface simultaneously
- Top tests: 90/10 holdout for 8+ weeks
- Stat gate: 14-day min, p<0.05, MDE met, no SRM, ≥10% effect

---

## Pattern Templates (To Validate)

(Populated post-W2 from decoder teardowns + catalyst confidence scoring.)

### Pattern A: Above-fold trust trio
- Reviews stars + count
- Free-shipping promise
- 30-day return policy
Position: above primary CTA. Expected lift: 8-15% visitor→cart in skeptical niches.

### Pattern B: Cart drawer free-shipping bar
- Threshold $50-80 (per niche)
- Progress bar with completion celebration
Expected lift: 12-18% AOV.

### Pattern C: Checkout express-first (mobile)
- Shop Pay / Apple Pay / Google Pay / PayPal above the form
Expected reduction: 15-25% mobile checkout abandonment.

### Pattern D: Post-purchase one-click upsell
- 30-min eligibility window
- Single-click charge (no re-payment)
Expected lift: 8-15% AOV.

### Pattern E: Subscription default
- Default-select subscribe vs one-time on PDP
- Caveat: only with strong churn-prevention
Expected lift: 25-40% subscription rate.

---

## Pattern → Lift Lookup (validated tests)

(Empty — populated as catalyst confirms wins post-W3.)

| Pattern | Project | Surface | Lift % | Stat sig | Date | Notes |
|---------|---------|---------|--------|----------|------|-------|

---

## Project-Level Funnel Diagnoses

(Linked from per-project diagnosis files in `funnel-diagnoses/`.)

---

## Cross-References
- Decoder library: `ecom-brand-teardowns.md`
- Validated CRO patterns: `cro-decoded-patterns.md`
- Catalyst skill — strategy: `~/.claude/skills/catalyst/cro-strategy-playbook.md`
- Catalyst skill — A/B prioritization: `~/.claude/skills/catalyst/ab-test-prioritization.md`
- Catalyst skill — scope split: `~/.claude/skills/catalyst/scope-split-enforcement.md`
- Ecom-cro mechanics: `~/.claude/skills/ecom-cro/`
- Spark above-fold: `~/.claude/skills/spark/`
- Merch on-page: `~/.claude/skills/merch/`
- Sequence lifecycle: `~/.claude/skills/sequence/`
