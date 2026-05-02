# Training Log — Shopify Knowledge Base

> Tracks all documentation sources processed into the Shopify knowledge base.
> Maintained by: Mira (knowledge agent)
> Last updated: 2026-04-04

---

## Processed Sources

All extracts below have been saved to `training/raw/` with date prefix for audit trail.

### 2026-04-04 — Build Phase Extraction (4 Parts)

**Source:** shopify.dev/docs/apps/build

**Coverage:**
- Part 1: Authentication systems, access scopes, extension types intro
- Part 2: Admin UI (pages, actions, blocks, navigation), checkout extensions
- Part 3: Online Store (theme extensions, blocks), functions, data models (products, metafields, metaobjects)
- Part 4: POS, B2B, customer accounts, marketing events, orders, subscriptions

**Extracted to:**
- `training/raw/shopify-build-extract-1-auth-extensions.md` (869 lines)
- `training/raw/shopify-build-extract-2-admin-checkout.md` (1,628 lines)
- `training/raw/shopify-build-extract-3-store-data.md` (1,088 lines)
- `training/raw/shopify-build-extract-4-pos-b2b-marketing.md` (778 lines)

**Total build raw data:** 4,363 lines

**Synthesized into:** 16 build component files (2,776 lines total)
- `build/INDEX.md` (175L) — Build phase page map
- `build/extensions.md` (207L) — All extension types, targets
- `build/admin.md` (243L) — Admin actions, blocks, print actions
- `build/checkout.md` (259L) — Checkout UI, validation, Plus gating
- `build/online-store.md` (117L) — Theme app extensions, blocks
- `build/functions.md` (269L) — Shopify Functions (Wasm), all APIs
- `build/data-models.md` (341L) — Products, metafields, metaobjects
- `build/webhooks.md` (327L) — TOML config, GDPR, delivery
- `build/orders.md` (105L) — FulfillmentOrder lifecycle
- `build/subscriptions.md` (195L) — Selling plans, contracts
- `build/pos.md` (95L) — POS tiles, actions, blocks
- `build/b2b.md` (112L) — Companies, catalogs, price lists
- `build/marketing.md` (95L) — Web pixels, customer segments
- `build/customer-accounts.md` (69L) — Full-page, inline extensions
- `build/markets.md` (62L) — Multi-market, translations
- `build/flow.md` (105L) — Flow triggers and actions

**Status:** COMPLETE — all raw data synthesized

---

### 2026-04-04 — Design Phase Extraction

**Source:** shopify.dev/docs/apps/design

**Coverage:**
- Polaris component library (50+ components)
- Navigation patterns, layouts, containers
- States and interactions (loading, empty, error, disabled)
- Accessibility (WCAG 2.1 AA, keyboard nav, screen readers)
- Responsive design (mobile-first, breakpoints)
- Performance optimization (image loading, lazy rendering)
- Content and UX copy patterns (microcopy, error messages, CTAs)

**Extracted to:**
- `training/raw/shopify-design-extract.md` (1,483 lines)

**Synthesized into:** 9 design component files (2,318 lines total)
- `design/INDEX.md` (117L) — Design phase page map
- `design/polaris.md` (222L) — Polaris mandatory rules, tokens
- `design/navigation.md` (151L) — NavMenu, sidebar/header patterns
- `design/layouts.md` (278L) — 5 layout types
- `design/states.md` (266L) — Loading, empty, error states
- `design/accessibility.md` (260L) — WCAG AA, contrast, keyboard
- `design/responsive.md` (278L) — Mobile-first, touch targets
- `design/performance.md` (227L) — Lighthouse, JS/CSS budgets
- `design/content.md` (319L) — Button copy, toast rules, language

**Status:** COMPLETE — all raw data synthesized

---

### 2026-04-04 — Launch Phase Extraction

**Source:** shopify.dev/docs/apps/launch

**Coverage:**
- App Store requirements checklist (mandatory rules)
- Listing page optimization (screenshots, descriptions, media)
- Billing API (setup, plan management, subscription handling)
- Privacy and GDPR compliance (data handling, webhooks)
- Security requirements (HTTPS, scopes, CSP, headers)
- Review process (expectations, common rejections, appeals)
- Distribution models (public, custom, private)
- Built for Shopify badge (criteria and benefits)

**Extracted to:**
- `training/raw/shopify-launch-extract.md` (1,752 lines)

**Synthesized into:** 9 launch component files (2,702 lines total)
- `launch/INDEX.md` (238L) — Launch phase page map + checklist
- `launch/requirements.md` (307L) — 11 blocking requirements
- `launch/listing.md` (229L) — Icon, title, screenshots, SEO
- `launch/billing.md` (332L) — 5 pricing models, 20% commission
- `launch/privacy.md` (323L) — GDPR, 3 mandatory webhooks
- `launch/security.md` (369L) — OWASP Top 10, CSP, HTTPS
- `launch/review.md` (312L) — Review process, 10 rejections
- `launch/distribution.md` (287L) — Public vs Custom vs Private
- `launch/built-for-shopify.md` (305L) — Badge requirements

**Status:** COMPLETE — all raw data synthesized

---

### 2026-04-04 — API Reference Extraction (10 APIs)

**Sources:** shopify.dev/docs/api (10 API documentation sets)

**URLs Processed:**
1. shopify.dev/docs/api/polaris
2. shopify.dev/docs/api/shopify-cli
3. shopify.dev/docs/api/functions/latest
4. shopify.dev/docs/api/liquid
5. shopify.dev/docs/api/storefront/latest
6. shopify.dev/docs/api/shopify-app-react-router/latest
7. shopify.dev/docs/api/admin-graphql/latest
8. shopify.dev/docs/api/webhooks/2026-01
9. shopify.dev/docs/api/storefront/2026-01
10. shopify.dev/docs/api (main hub — all APIs mapped)

**Coverage:**
- Polaris component reference (all components, props, design tokens, web components)
- Shopify CLI commands (app init/dev/deploy, generate extension, theme dev)
- Functions API (all 7 function types, input/output schemas, Wasm constraints)
- Liquid reference (objects, filters, tags, theme extension Liquid, dynamic sources)
- Storefront API (product/cart queries, customer auth, localization, metafields)
- React Router SDK (authenticate.admin(), billing helpers, session storage, webhooks)
- Admin GraphQL API (key queries/mutations, billing, bulk operations, rate limits)
- Webhooks reference (50+ topics by category, TOML config, HMAC verification, GDPR)
- App Bridge (React v4.x, NavMenu, modals, toasts, useAppBridge hook)
- API Hub overview (15+ APIs mapped with decision tree)

**Extracted to:** No raw files — synthesized directly into component files via WebSearch

**Synthesized into:** 10 API component files (6,837 lines total)
- `api/INDEX.md` (458L) — Master API hub with decision tree
- `api/polaris.md` (496L) — Component list, props, design tokens
- `api/shopify-cli.md` (809L) — All CLI commands with flags
- `api/functions.md` (505L) — All 7 function APIs, schemas
- `api/liquid.md` (800L) — Objects, filters, tags, patterns
- `api/react-router-sdk.md` (580L) — authenticate.admin(), billing, sessions
- `api/admin-graphql.md` (1221L) — Queries, mutations, bulk ops
- `api/webhooks.md` (497L) — 50+ topics, HMAC, GDPR
- `api/storefront.md` (840L) — Cart, customer auth, localization
- `api/app-bridge.md` (631L) — React v4.x, NavMenu, modals

**Status:** COMPLETE — all 10 major APIs documented

---

## Synthesis Summary

| Phase | Raw Lines | Component Files | Synthesized Lines | Status |
|-------|-----------|----------------|-------------------|--------|
| Core | 735 | 4 files | 996 | COMPLETE |
| Build | 4,363 | 16 files | 2,776 | COMPLETE |
| Design | 1,483 | 9 files | 2,318 | COMPLETE |
| Launch | 1,752 | 9 files | 2,702 | COMPLETE |
| API | (via search) | 10 files | 6,837 | COMPLETE |
| Training | — | 2 + 6 raw | 1,146 | Maintained |
| **Total** | **8,333+** | **53 files** | **16,775** | **100% Complete** |

---

## Pending Sources (Future Extraction)

These APIs have overview entries in `api/INDEX.md` but don't have dedicated deep-extraction files yet:

### High Priority
- **Partner API** — App analytics, app installs, earnings data
- **Customer Account UI Extensions API** — Extension targets, components
- **POS UI Extensions API** — POS-specific extension targets
- **Admin Extensions API** — Action/block extension targets
- **Checkout Extensions API** — Targets and components deep reference

### Medium Priority
- **Customer Privacy API** — Consent management, tracking
- **AJAX API** — Theme JavaScript, Cart API, Product API
- **ShopifyQL** — Query language for analytics
- **Hydrogen/Oxygen** — Headless commerce framework

### Lower Priority
- Real App Store listing case studies
- Performance benchmarks from production apps
- Advanced Wasm/Rust function patterns

---

## How to Process New Sources

### Step 1: Extract
```bash
# For web URL:
Use WebSearch or WebFetch to extract markdown
Save to training/raw/YYYY-MM-DD-topic-description.md

# For document upload:
Read the document, extract relevant sections
Save to training/raw/YYYY-MM-DD-topic-description.md
```

### Step 2: Synthesize
1. Read the raw extract
2. Identify which component file(s) it belongs to
3. Synthesize into component file (don't just copy-paste)
4. Add source comment: `> Source: training/raw/YYYY-MM-DD-description.md`
5. Add date updated: `# Last updated: 2026-04-04`

### Step 3: Update Records
1. Add entry to this INDEX.md under "Processed Sources"
2. Update `../INDEX.md` with new files
3. Update `changelog.md` with version bump

### Step 4: Validate
- Run: `wc -l ../*/` to verify file sizes reasonable
- Spot-check synthesized content for accuracy
- Verify all references are correct

---

## Navigation

- **Back to master index:** `../INDEX.md`
- **Changelog:** `changelog.md`
- **Raw data:** `raw/`

Last updated: **2026-04-04**
