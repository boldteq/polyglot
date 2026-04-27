---
name: Supplement Landing Prototype — Vela
description: 5-variant CRO landing page (fictional nootropic brand). Lessons on shadcn v4 Base UI API, Tailwind 4 token bridge, 5-variant architecture, and subagent execution failures.
type: project
---

# Supplement Landing Prototype — Vela

**Stack:** Vite 8 + React 19 + TS strict + Tailwind 4 (CSS-first) + shadcn v4 (Base UI) + React Router 7
**Location:** `/Users/yashbaldha/Desktop/Boldteq App/Test/Ecom Design testing/`
**Status:** Shipped 2026-04-27. Build clean 482 kB / 150 kB gz. 11/11 smoke tests pass.

## Brand decisions
- Niche: cognitive/nootropic (chosen over women's hormonal / longevity / sleep)
  - **Why:** highest objection density + fits all 5 hero archetypes + thin premium DTC tier (Thesis, Mind Lab Pro, HVMN)
- Brand: **Vela** — Latin (sail/candle). Tagline "Clarity. Every hour."
- Palette: warm cream / deep forest sage / amber gold (token classes: `cream-*` / `forest-*` / `amber-*` / `ink-*`)
- Voice: Precise. Assured. Literate. Anti: never unlock/unleash/boost/supercharge/limitless.

## Architecture decisions
- 5 variants, same brand, same below-fold rhythm, different above-fold psychology
- Each variant page wraps in `<CartProvider>` — `useCart()` throws outside provider
- Below-fold rhythm (all variants): BenefitsGrid → TrustBar → IngredientModule → ReviewsSection → FAQAccordion → CTABlock → Footer
- Cart state: `useReducer` via `useCartState` hook; shared via `CartContext`; no external store
- `.theme-forest` CSS class mirrors `.dark` block — used by Variant1 + Variant5 (dark-base heroes on light pages)

## Pricing math (source of truth)
- Base one-time: $79 / Base subscribe: $67 (15% off)
- Bundle multipliers: 1× / 1.92× / 2.55× → per-bottle $79/$67 / $64.32/$57.84 / $53.55/$47.83
- Free shipping threshold: $50 (always met on 1+)

## Supplement CRO patterns confirmed (decoder Phase 0)
- Safety cert (NSF/Informed Sport) above fold in hero — observed in 5/6 teardowns
- Realistic review distribution 62/24/9/3/2 > "clean" 90/8/2 for skeptical health buyers
- Subscribe default outperforms one-time default in supplement category
- Per-unit cost display ("$2.23/day") critical for premium supplement pricing

## How to apply
- Reuse the 5-variant structure + below-fold rhythm for any DTC ecom build
- Swap tokens + brand identity + copy data files; components are niche-agnostic
