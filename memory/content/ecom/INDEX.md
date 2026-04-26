# Ecom Copy Knowledge Base — Master Index

**Status:** SCAFFOLD — populated W1-W3 by merch + spark + sequence + quill.
**Owner:** quill (brand voice) + catalyst (CRO oversight)
**Stack scope:** Stack B + Stack C ecom storefronts
**Counterpart KB:** `~/.claude/memory/content/copy-patterns.md` (SaaS skeleton — empty, do NOT import for ecom)
**Source intel:** `~/.claude/memory/patterns/good/ecom-brand-teardowns.md` (decoder copy formulas extracted)

---

## Scope split — strict (Tutor P0 enforced via catalyst)

| Surface | Owner | Why |
|---------|-------|-----|
| Hero copy, PDP hero block, primary CTAs (above fold) | **spark** | 40% lift mandate; deep CTA psychology |
| PDP body, bullets, FAQ, size guide, cart microcopy, checkout reassurance, post-purchase, subscription pages, objection handling | **merch** | Highest-volume on-page copy; ecom-specific craft |
| Lifecycle email (welcome, cart abandon, browse abandon, post-purchase, win-back) | **sequence** | Owns trigger logic + sequence pacing |
| Brand voice rules + SaaS marketing | **quill** | Cross-product brand voice owner |

**Collision rule:** If unsure who owns a surface, escalate to catalyst. Catalyst rejects PR on overlap.

---

## File Map

| File | Lines (target) | Owner | Status |
|------|----------------|-------|--------|
| [pdp-copy-patterns.md](./pdp-copy-patterns.md) | 600 | merch | Pending |
| [cart-checkout-microcopy.md](./cart-checkout-microcopy.md) | 450 | merch | Pending |
| [hero-cta-copy.md](./hero-cta-copy.md) | 400 | spark | Pending |
| [category-listing-copy.md](./category-listing-copy.md) | 300 | merch | Pending |
| [post-purchase-copy.md](./post-purchase-copy.md) | 250 | merch | Pending |
| [subscription-copy.md](./subscription-copy.md) | 250 | merch | Pending |
| [lifecycle-email-ecom.md](./lifecycle-email-ecom.md) | 350 | sequence (W3) | Pending |
| [objection-handling-library.md](./objection-handling-library.md) | 400 | merch | Pending |

**Total target:** ~3,080 lines.

---

## Coverage Map

### `pdp-copy-patterns.md` (merch)
PDP description structure (benefits-first → objection-handling → spec-table — NEVER lead with features). Bullet hierarchy (primary benefit → 4-6 supporting → social proof → guarantee). FAQ structure (top 5 objections answered). Size/fit copy. Ingredient/material copy. Care instructions copy. Variant naming conventions. Stock urgency copy (real urgency only — no fake "X people viewing"). Cross-sell anchor copy.

### `cart-checkout-microcopy.md` (merch)
Cart empty state, cart with items header, line item context, qty stepper labels, remove confirmation, coupon field placeholder + success/error states, shipping estimator copy, free-shipping progress copy ("$X away from free shipping"), proceed-to-checkout CTA, security reassurance below CTA. Checkout step labels (Shipping → Payment → Review). Form field labels + placeholders + helper text + error messages. Order summary line items. Final CTA microcopy. Confirmation page copy.

### `hero-cta-copy.md` (spark)
Hero headline formulas (benefit-led, identity-led, problem-led, curiosity-led). Subheadline patterns (proof + scope). Primary CTA verb library (Shop, Get, Try, Build, Find — context-by-niche). Secondary CTA patterns (low-commit). Above-fold trust elements copy. Promo banner copy. Seasonal hero copy framework.

### `category-listing-copy.md` (merch)
Category H1 + meta description. Filter labels. Sort labels. Empty-results copy. Product card title formula. Badge copy ("Bestseller", "New", "Low Stock"). Pagination copy.

### `post-purchase-copy.md` (merch)
Order confirmation header copy. Delivery date framing. "What's next" copy. Account creation incentive copy. Referral copy. Shipping update email copy. Unboxing/care content copy. Return initiation copy. Review request copy.

### `subscription-copy.md` (merch)
Subscription benefit framing. Frequency selector copy. Savings display copy. Subscriber portal copy (skip/swap/pause/cancel). Trial-to-paid conversion copy. Build-a-box copy. Replenishment reminder copy.

### `lifecycle-email-ecom.md` (sequence)
Welcome series (3-5 emails). Cart abandonment sequence (3 emails: 1h, 24h, 72h). Browse abandonment. Post-purchase nurture. Replenishment. Win-back. Re-engagement. Subject line library (60-char + preview text patterns). CTA pattern per stage.

### `objection-handling-library.md` (merch)
Top objections per ecom category (apparel sizing, beauty fit, food taste, supplements efficacy, electronics quality, home goods returns). Reassurance copy library. Money-back guarantee copy. Shipping cost objection. Returns friction objection. Brand-vs-cheaper-competitor objection.

---

## Authoring Protocol

1. Decoder teardowns published first → copy formulas extracted per brand.
2. Each copy pattern includes: `STRUCTURE` (template), `EXAMPLES` (3+ from teardowns), `BRAND VOICE NOTES`, `WHEN TO USE`, `ANTI-PATTERNS`.
3. Every copy pattern measured against 40% lift baseline (decoder median for surface).
4. Quill ratifies brand voice consistency before catalyst signs off.

---

## Cross-Refs

- Brand voice rules: `~/.claude/memory/content/brand-voices.md`
- CRO playbook: `~/.claude/memory/patterns/good/ecom-funnel-cro-playbook.md`
- Brand teardowns (source intel): `~/.claude/memory/patterns/good/ecom-brand-teardowns.md`
- Decoded CRO patterns: `~/.claude/memory/patterns/good/cro-decoded-patterns.md`
- Design pairings: `~/.claude/memory/design/ecom/INDEX.md`
