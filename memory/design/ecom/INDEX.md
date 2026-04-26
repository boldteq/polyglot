# Ecom Design Knowledge Base — Master Index

**Status:** SCAFFOLD — populated W1-W2 by elio + vega + pixel + decoder.
**Owner:** vega (Lead) → elio (executor)
**Stack scope:** Stack B (Shopify Native React Router 7 + Polaris) + Stack C (Shopify External standalone)
**Counterpart KB:** `/Users/yashbaldha/.claude/memory/design/INDEX.md` (SaaS — 43K lines, do NOT import for ecom)
**Source intel:** `/Users/yashbaldha/.claude/memory/patterns/good/ecom-brand-teardowns.md` (decoder-authored top-50 DTC teardowns)

---

## Page-Type Pattern Files

| File | Lines (target) | Owner | Status |
|------|----------------|-------|--------|
| [pdp-patterns.md](./pdp-patterns.md) | 800 | elio (+ vega review) | Pending |
| [cart-checkout-patterns.md](./cart-checkout-patterns.md) | 700 | elio | Pending |
| [listing-category-patterns.md](./listing-category-patterns.md) | 500 | elio | Pending |
| [hero-homepage-patterns.md](./hero-homepage-patterns.md) | 450 | pixel + elio | Pending |
| [trust-social-proof-patterns.md](./trust-social-proof-patterns.md) | 400 | elio | Pending |
| [post-purchase-patterns.md](./post-purchase-patterns.md) | 350 | elio | Pending |
| [subscription-dtc-patterns.md](./subscription-dtc-patterns.md) | 400 | elio | Pending |
| [motion-interaction-patterns.md](./motion-interaction-patterns.md) | 350 | elio | Pending |
| [mobile-ecom-patterns.md](./mobile-ecom-patterns.md) | 450 | elio | Pending |

**Total target:** ~4,520 lines (matches density of SaaS design KB).

---

## Coverage Map — what each file MUST contain

### `pdp-patterns.md`
Hero block (image gallery + lifestyle), variant selector (size/color/material), price hierarchy (regular/sale/subscription), add-to-cart UX (sticky behavior, drawer trigger), stock indicators (urgency without false scarcity), spec table, reviews/ratings module, related products, trust badges (shipping/returns/payment), expandable sections (description, ingredients, care, FAQ), social proof placement, sticky ATC mobile pattern.

### `cart-checkout-patterns.md`
Cart drawer vs cart page, line item layout (image/title/variant/qty/price/remove), quantity stepper UX, pricing breakdown (subtotal/shipping/tax/total), coupon code field (collapsed by default), shipping estimator, free-shipping progress bar, save-for-later, recommended add-ons, checkout step flow (single-page vs multi-step), shipping/billing form, payment method selector (cards/Shop Pay/PayPal/Apple Pay), order review, confirmation page, abandonment recovery patterns.

### `listing-category-patterns.md`
Faceted filter sidebar (mobile drawer pattern), filter chips, sort dropdown, grid vs list view toggle, product card anatomy (image/badge/title/price/swatches/quick-add), pagination vs infinite scroll, "no results" state, breadcrumbs, category hero, in-grid promo cards.

### `hero-homepage-patterns.md`
Lifestyle hero vs product hero vs promotional hero, seasonal campaign hero, video hero, split hero, headline + sub + CTA hierarchy, USP strip below hero, featured collection rail, brand story block, social/UGC gallery placement.

### `trust-social-proof-patterns.md`
Reviews module (star avg + count + recent text), UGC gallery (Instagram/TikTok integration), press logos, awards/certifications, founder story, money-back guarantee placement, shipping/returns badges, security badges (checkout), influencer endorsement, "as seen in" strip.

### `post-purchase-patterns.md`
Order confirmation page (delivery date + order summary + next steps), cross-sell module on confirmation, account creation prompt, referral incentive, branded shipping notification page, unboxing/care content, return initiation flow, review request UX.

### `subscription-dtc-patterns.md`
Subscription vs one-time toggle on PDP, frequency selector, subscriber savings display, subscription page UX (skip/swap/pause/cancel), customer portal for managing subscriptions, trial-to-paid conversion patterns, build-a-box, replenishment reminders.

### `motion-interaction-patterns.md`
Variant swatch hover/tap response, image zoom (hover desktop, pinch mobile), gallery swipe, sticky ATC reveal on scroll, cart drawer slide-in, quick-view modal, exit-intent modal, loading skeletons for product grid, optimistic ATC feedback, scroll-triggered reveals on lifestyle imagery.

### `mobile-ecom-patterns.md`
Bottom-nav bar pattern, sticky-ATC bar, swipeable image gallery, thumb-zone CTA placement, mobile filter drawer, mobile checkout (Apple Pay/Google Pay primary), tap targets ≥48px, mobile cart drawer, mobile size guide modal, mobile-first form patterns (numeric keypad for phone, autocomplete for address).

---

## Authoring Protocol

1. Decoder publishes `ecom-brand-teardowns.md` first (top-50 DTC pattern extraction).
2. Each pattern file references decoder data directly (cite brand examples per pattern).
3. Every pattern includes: `WHEN to use`, `WHY it converts`, `STRUCTURE` (component tree), `SPEC` (props/states/responsive), `BRAND EXAMPLES` (3-5 from teardowns), `ANTI-PATTERNS`.
4. Mobile-first responsive specs mandatory.
5. Stack B uses Polaris Web Components for admin only — storefront uses native Tailwind/shadcn or Hydrogen.
6. Stack C is custom React Router 7 + own design system.
7. Vega gates every file before merge into agent first-load manifests.

---

## Cross-Refs

- Tokens / design system: `~/.claude/memory/design/core/` (existing SaaS) + `~/.claude/memory/stacks/shopify/storefront/polaris-vs-storefront-tokens.md` (NEW)
- Accessibility: `~/.claude/memory/design/standards/accessibility.md` (existing — applies to ecom)
- Performance budgets: `~/.claude/memory/design/standards/performance.md` (existing — LCP <2.5s also applies)
- Copy framework: `~/.claude/memory/content/ecom/INDEX.md`
- CRO playbook: `~/.claude/memory/patterns/good/ecom-funnel-cro-playbook.md`
- Figma deliverables: `~/.claude/memory/patterns/good/figma-synth-workflow.md` + `ecom-code-connect-mappings.md`
