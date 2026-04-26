# Shopify Storefront Stack — Master Index

**Status:** SCAFFOLD — populated W2 by elio + token.
**Owner:** elio (UI) + token (design system bridge)
**Counterpart:** `~/.claude/memory/stacks/shopify/INDEX.md` (existing — Shopify ADMIN, do not confuse)

This module covers customer-facing storefronts only. The existing `~/.claude/memory/stacks/shopify/` tree is admin-side (Polaris Web Components, embedded admin, GraphQL Admin API). Storefront is a different surface, different stack choices, different design tokens.

---

## File Map

| File | Lines (target) | Owner | Status |
|------|----------------|-------|--------|
| [hydrogen-react-router-7.md](./hydrogen-react-router-7.md) | 500 | elio (Stack B storefront option) | Pending |
| [standalone-stack-c.md](./standalone-stack-c.md) | 400 | elio (Stack C custom storefront) | Pending |
| [polaris-vs-storefront-tokens.md](./polaris-vs-storefront-tokens.md) | 250 | token | Pending |

---

## Coverage Map

### `hydrogen-react-router-7.md`
Hydrogen architecture (RSC + Oxygen). React Router 7 file conventions. Cart API patterns. Customer Account API. Storefront API GraphQL queries. Image optimization (Shopify CDN). Metafield patterns for PDP enrichment. Localization. Checkout extension hooks. Performance defaults (prefetch on hover, route-level code splitting).

### `standalone-stack-c.md`
Custom React Router 7 + Tailwind/shadcn ecom storefront (no Hydrogen). Headless commerce APIs (Shopify Storefront API, BigCommerce, Medusa). State management (cart in cookie + server actions). Auth patterns (passwordless, social, account). Payment integration (Shop Pay, Stripe, PayPal). SEO (server-rendered, structured data). Performance (LCP <2.0s ecom standard).

### `polaris-vs-storefront-tokens.md`
Critical: Polaris is for ADMIN ONLY. Storefront tokens come from project design system or theme. Token bridge mapping (Polaris → Tailwind). Color/spacing/type scale conversion table. When to use shadcn vs custom for ecom storefront. Dark mode handling for storefront (often opt-in, not system-driven). Brand customization layer.

---

## Stack Decision Matrix

| Use case | Stack | Notes |
|----------|-------|-------|
| Embedded Shopify admin app | Stack B (Pod B) | Polaris Web Components, Admin GraphQL |
| Storefront on top of Shopify (Hydrogen) | Stack B (storefront mode) | Hydrogen + Oxygen, RR7 |
| Standalone ecom (any backend) | Stack C (Pod C) | Custom RR7 + Tailwind/shadcn |
| Boldteq SaaS dashboard | Stack A (Pod A) | Next.js 16 + Supabase |

NEVER mix: do not use Polaris on storefront, do not use Hydrogen for SaaS, do not use Next.js for embedded admin.

---

## Cross-Refs

- Ecom design KB: `~/.claude/memory/design/ecom/INDEX.md`
- Existing Shopify admin KB: `~/.claude/memory/stacks/shopify/INDEX.md`
- Stack registry: `~/.claude/memory/stacks/STACK-REGISTRY.md`
- Tokens (SaaS reference): `~/.claude/memory/design/core/`
