---
name: 5-Variant CRO Landing Structure
description: Reusable scaffold for testing 5 distinct buyer psychologies on one DTC brand. Verified on Vela (nootropic) build 2026-04-27.
type: feedback
---

# 5-Variant CRO Landing Structure

Portable pattern for DTC ecom: same brand, same below-fold, 5 distinct above-fold conversion psychologies.

## Why: CRO mandate
A/B/C/D/E test 5 distinct opening moves before committing to one hero treatment.
Sharing below-fold means the variable is ONLY the hero — clean signal.

## Hero archetype map (5 slots)

| Slot | Archetype | Buyer | Above-fold key |
|------|-----------|-------|----------------|
| V1 | Spec-hero | Rational/data | Numbers, facts table, 0 blends claim |
| V2 | Lifestyle | Emotional/aspirational | Full-bleed product, single-line promise |
| V3 | Split-hero | Skeptical/transparency | Ingredient photo left, dose ladder right |
| V4 | Founder-video | Narrative/story | Looping b-roll, founder quote, origin |
| V5 | Clinical/authority | Credentialed | MD endorsement, cert badges, RCT stats |

## Shared below-fold rhythm (all 5)
BenefitsGrid → TrustBar → IngredientModule → ReviewsSection → FAQAccordion → CTABlock → Footer

## Cart state isolation
- Each variant = a standalone React tree with its own `<CartProvider>`
- No cross-variant state — each is self-contained for measurement purity

## CRO mechanics (shared across all variants)
SubscribeToggle (subscribe default) · BundleSelector (1/2/3-pack) · StickyAddToCart (mobile, IntersectionObserver) · CartDrawer (Sheet, free-ship bar, upsell) · ExitIntent (Dialog, desktop, once/session, suppressed if cart open) · FAQAccordion (soft CTA after 3 opens) · IngredientModule (accordion expand-in-place)

## Index gallery route
`/` shows all 5 variant cards with: archetype label, psychology, hook line, hero theme preview.
Enables stakeholder review at single URL. Each card deep-links to full variant.

## Supplement-specific confirmed patterns
- Safety cert (NSF/Informed Sport) in hero zone — 5/6 top brands do this
- Realistic review distribution 62/24/9/3/2 (not clean 90/8/2)
- Subscribe-default with "cancel anytime" framing outperforms one-time default
- Per-unit cost in daily format: "$2.23/day" > "$67/month"
- Two-timeline claim: "Day 1: focus. Week 8: memory." resolves timeframe objection AND extends subscription reasoning

## File structure template
```
src/
  variants/         ← V1-V5, each a full page with CartProvider
  components/shared/ ← all CRO mechanics (Cart, Toggle, Bundle, FAQ etc.)
  pages/Index.tsx   ← variant gallery
  data/mock.ts      ← Product type + pricing math functions
  data/hero-copy.ts ← 5 typed above-fold copy bundles
  data/page-copy.ts ← shared below-fold copy (benefits, ingredients, reviews, FAQ)
  lib/use-cart-state.ts ← CartState hook
  lib/types.ts      ← shared types (Product, CartState, BundleSize, etc.)
  index.css         ← @theme tokens (Tailwind 4 CSS-first)
```

## Reuse this for
Any DTC vertical: wellness, beauty, apparel, food, fitness equipment.
Swap: brand bible, palette tokens, hero copy bundles, product data.
Keep: component architecture, CRO mechanics, below-fold rhythm.
