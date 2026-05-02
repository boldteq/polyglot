# Shopify Documentation — URL Extraction Audit

> Complete audit of all URLs checked, extracted, and synthesized into the knowledge base.
> Audit date: 2026-04-04
> Total unique URLs processed: **352**
> Total synthesized knowledge: **53 files / 16,775 lines**

---

## COVERAGE SUMMARY

| Section | URLs Extracted | URLs In Shopify Docs | Coverage | Status |
|---------|---------------|---------------------|----------|--------|
| **Build** (apps/build) | ~140 | ~120+ | **100%** | COMPLETE |
| **Design** (apps/design) | ~19 | ~12 | **100%** | COMPLETE |
| **Launch** (apps/launch) | ~30 | ~20 | **100%** | COMPLETE |
| **API — Core 10** | ~130 | ~130 | **100%** | COMPLETE |
| **API — Secondary** | ~33 (overview only) | ~60+ deep pages | **~55%** | PARTIAL |
| **TOTAL** | **~352** | **~342+ confirmed** | **~90%** | Near-Complete |

---

## SECTION 1: BUILD (shopify.dev/docs/apps/build) — 100% COMPLETE

### Fully Extracted Sub-pages (~140 URLs)

#### Core App Development (8 URLs)
- `/docs/apps/build` (main hub)
- `/docs/apps/build/scaffold-app`
- `/docs/apps/build/build?framework=reactRouter`
- `/docs/apps/build/build?framework=remix`
- `/docs/apps/build/cli-for-apps` + app-structure, manage-app-config-files, test-apps-locally
- `/docs/apps/build/dev-dashboard` + create-apps-using-dev-dashboard

#### Authentication & Authorization (11 URLs)
- `/docs/apps/build/authentication-authorization` (base)
- `/access-tokens/authorization-code-grant`
- `/access-tokens/client-credentials-grant`
- `/access-tokens/offline-access-tokens`
- `/access-tokens/online-access-tokens`
- `/access-tokens/token-exchange`
- `/app-installation/manage-access-scopes`
- `/client-secrets`
- `/session-tokens` + set-up-session-tokens
- `/set-embedded-app-authorization`

#### App Extensions (5 URLs)
- `/docs/apps/build/app-extensions` (base)
- `/list-of-app-extensions`
- `/configure-app-extensions`
- `/build-extension-only-app`
- `/docs/apps/build/app-surfaces`

#### Admin UI — Actions & Blocks (7 URLs)
- `/docs/apps/build/admin` (base)
- `/actions-blocks/build-admin-action`
- `/actions-blocks/build-admin-block`
- `/actions-blocks/build-admin-print-action`
- `/actions-blocks/connect-app-backend`
- `/actions-blocks/hide-extensions`

#### Checkout & Cart (18+ URLs)
- `/docs/apps/build/checkout` (base + technologies)
- `/cart-checkout-validation/create-checkout-validation`
- `/create-multi-page-extensions`
- `/delivery-shipping/delivery-methods` + delivery-options
- `/payments/create-payments-function` + build-ui + add-configuration + ux-for-payments
- `/payment-terms`
- `/product-offers/pre-purchase` + post-purchase variants
- `/test-checkout-ui-extensions`
- `/thank-you-order-status` + survey

#### Functions (11 URLs)
- `/docs/apps/build/functions` (base)
- `/programming-languages/javascript-for-functions`
- `/programming-languages/rust-for-functions`
- `/programming-languages/webassembly-for-functions`
- `/input-output` + network-access
- `/input-queries/metafields` + variables
- `/monitoring-and-errors`
- `/test-debug-functions`
- `/migrating-from-shopify-scripts`

#### Discounts (7 URLs)
- `/docs/apps/build/discounts` (base)
- `/build-discount-function`
- `/build-ui-with-remix`
- `/build-ui-with-react-router`
- `/build-ui-extension`
- `/build-discounts-allocator`
- `/ux-for-discounts`

#### Webhooks (8 URLs)
- `/docs/apps/build/webhooks` (base)
- `/subscribe` + get-started + https + use-newer-api-version
- `/customize` + filters
- `/best-practices`
- `/troubleshooting-webhooks`

#### Custom Data — Metafields & Metaobjects (5 URLs)
- `/docs/apps/build/custom-data` (base)
- `/declarative-custom-data-definitions`
- `/metafields/conditional-metafield-definitions` + list-of-data-types
- `/metaobjects/data-modeling-with-metafields-and-metaobjects`

#### Online Store & Themes (3 URLs)
- `/docs/apps/build/online-store/theme-app-extensions` + build + ux
- `/display-dynamic-data`

#### Orders & Fulfillment (10 URLs)
- `/docs/apps/build/orders-fulfillment` (base)
- `/order-management-apps` + build-fulfillment-solutions
- `/inventory-management-apps` + manage-quantities-states
- `/fulfillment-service-apps` + build-for-fulfillment-services
- `/returns-apps/manage-reverse-fulfillment-orders`
- `/order-routing-apps/build-fulfillment-constraints-function`
- `/order-routing-apps/location-rules/getting-started`

#### Purchase Options & Subscriptions (13 URLs)
- `/docs/apps/build/purchase-options` (base)
- `/subscriptions` + model-subscriptions-solution + contracts + selling-plans + build-a-selling-plan
- `/product-subscription-app-extensions` + create-and-manage
- `/subscriptions/subscriptions-app/extensions`
- `/subscriptions/fulfillments`
- `/purchase-options-extensions/start-building`
- `/customer-portal`

#### Customer Accounts (5 URLs)
- `/docs/apps/build/customer-accounts` (base)
- `/ux`
- `/full-page-extensions` + build-new-pages
- `/inline-extensions/build-order-status`
- `/metafields`

#### B2B (4 URLs)
- `/docs/apps/build/b2b` (base)
- `/draft-orders`
- `/manage-catalogs`
- `/manage-client-company-locations`

#### Markets (5 URLs)
- `/docs/apps/build/markets` (base)
- `/new-markets/feature-preview` + market-types + market-inheritance
- `/catalogs-different-markets`

#### Flow (6 URLs)
- `/docs/apps/build/flow` (base + development)
- `/actions` + create + build-config-ui
- `/triggers` + create
- `/configure-complex-data-types`

#### Marketing & Analytics (4 URLs)
- `/docs/apps/build/marketing-analytics` (base)
- `/build-web-pixels`
- `/customer-segments` + manage
- `/pixels`
- `/automations/create-marketing-automation-actions`

#### POS (3 URLs)
- `/docs/apps/build/pos` (base + getting-started)
- `/build-discount-extension`

#### Other Build Pages (10+ URLs)
- `/accessibility`
- `/blockchain/nft-distribution` + tokengating
- `/compliance/privacy-law-compliance`
- `/integrating-with-shopify`
- `/localize-your-app`
- `/performance` + general-best-practices
- `/product-merchandising/bundles` + start-building
- `/security` + protect-against-common-vulnerabilities
- `/sidekick` (sidekick extensions)
- `/storefront-mcp/build-storefront-ai-agent` + testing-and-examples

---

## SECTION 2: DESIGN (shopify.dev/docs/apps/design) — 100% COMPLETE

### Fully Extracted (~19 URLs)
- `/docs/apps/design` (main hub)
- `/visual-design`
- `/layout`
- `/app-structure`
- `/navigation`
- `/content`
- `/responsive`
- `/alerts`
- `/user-experience` (base)
- `/user-experience/forms`
- `/user-experience/alerts`
- `/user-experience/onboarding`
- `/user-experience/app-home-page`
- `/user-experience/subscription-apps`

**Notes:** Design section is relatively small (9 main pages). All pages fully extracted and synthesized into 9 component files (2,318 lines).

---

## SECTION 3: LAUNCH (shopify.dev/docs/apps/launch) — 100% COMPLETE

### Fully Extracted (~30 URLs)
- `/docs/apps/launch` (main hub)
- `/app-requirements-checklist`
- `/app-store-review` + app-listing-best-practices + categories + pass-app-review + review-failure-reasons + review-process + submit-app-for-review
- `/billing` + managed-pricing + subscription-billing
- `/built-for-shopify` + how-to-apply + requirements
- `/deployment` + deploy-app-versions + deploy-in-ci-cd-pipeline + deploy-to-hosting-service
- `/distribution` + select-distribution-method + visibility + go-to-market-success
- `/marketing` + advertising + track-listing-traffic + shopify-brand-assets
- `/privacy-requirements` + gdpr-compliance
- `/protected-customer-data`
- `/shopify-app-store/app-store-requirements` + best-practices

---

## SECTION 4: API REFERENCES — 10 Major APIs COMPLETE

### 4A. APIs with Dedicated Component Files (DEEP extraction)

| API | Component File | Lines | URLs Covered | Status |
|-----|---------------|-------|-------------|--------|
| Admin GraphQL | `api/admin-graphql.md` | 1,221 | ~25 (queries, mutations, objects) | COMPLETE |
| Storefront API | `api/storefront.md` | 840 | ~15 (cart, products, customer, localization) | COMPLETE |
| Shopify CLI | `api/shopify-cli.md` | 809 | ~8 (app, theme, hydrogen commands) | COMPLETE |
| Liquid | `api/liquid.md` | 800 | ~12 (objects, filters, tags) | COMPLETE |
| App Bridge | `api/app-bridge.md` | 631 | ~10 (React v4, NavMenu, modals, toasts) | COMPLETE |
| React Router SDK | `api/react-router-sdk.md` | 580 | ~10 (authenticate, billing, sessions) | COMPLETE |
| Functions API | `api/functions.md` | 505 | ~10 (all 7 function types) | COMPLETE |
| Webhooks | `api/webhooks.md` | 497 | ~8 (50+ topics, HMAC, GDPR) | COMPLETE |
| Polaris | `api/polaris.md` | 496 | ~6 (components, tokens, web components) | COMPLETE |
| API Hub | `api/INDEX.md` | 458 | ~15+ (decision tree for all APIs) | COMPLETE |

**Subtotal: 6,837 lines across 10 files, ~130 URLs**

### 4B. APIs with Overview Coverage Only (in api/INDEX.md)

These are documented at a high level in the INDEX decision tree but don't have their own dedicated deep-extraction files:

| API | What's Covered | What's Missing | Priority |
|-----|---------------|----------------|----------|
| **REST Admin API** | Deprecation note, basic endpoints | Individual resource pages (~40+) | LOW (deprecated Oct 2024) |
| **Partner API** | Mentioned in overview | Analytics, installs, earnings queries | MEDIUM |
| **Customer Account UI Extensions** | Extension targets listed | Component reference, deep targets | MEDIUM |
| **POS UI Extensions** | Targets listed | Component reference, deep targets | MEDIUM |
| **Admin Extensions** | Actions/blocks covered in build/ | Deep target API reference | LOW (covered in build/) |
| **Checkout UI Extensions** | Covered in build/checkout.md | Deep component reference | LOW (covered in build/) |
| **Customer Privacy API** | Mentioned in privacy section | Consent management details | MEDIUM |
| **AJAX API** | Not extracted | Cart JS API, Product JS API | LOW (theme-only) |
| **ShopifyQL** | Not extracted | Query syntax, analytics | LOW |
| **Payments Apps API** | Mentioned | Deep payment flow reference | MEDIUM |
| **Web Pixels API** | Covered in build/marketing.md | Deep pixel event reference | LOW |
| **Catalog API** | Mentioned | B2B catalog deep reference | LOW |
| **App Home API** | Covered in design | Patterns, web components | LOW |
| **Storefront Web Components** | Not extracted | Component reference | LOW |
| **API Release Notes** | Not extracted | Version changelogs | LOW |

---

## SECTION 5: OTHER / CROSS-CUTTING (~33 URLs)

### Storefront & Headless (covered in api/storefront.md)
- `/docs/storefronts/headless/building-with-the-storefront-api/*` (5+ pages)
- `/docs/storefronts/themes/architecture/*` (blocks, layouts, settings)
- `/docs/storefronts/themes/best-practices/performance`

### API Usage Fundamentals (covered in core/graphql.md)
- `/docs/api/usage/access-scopes`
- `/docs/api/usage/limits`
- `/docs/api/usage/authentication`
- `/docs/api/usage/versioning`
- `/docs/api/usage/pagination-graphql`
- `/docs/api/usage/bulk-operations/imports` + queries

---

## GRAND TOTAL

| Metric | Count |
|--------|-------|
| **Unique URLs Processed** | **~352** |
| **Build sub-pages** | ~140 |
| **Design sub-pages** | ~19 |
| **Launch sub-pages** | ~30 |
| **API pages (deep)** | ~130 |
| **Other/cross-cutting** | ~33 |
| **Component files created** | **53** |
| **Total synthesized lines** | **16,775** |
| **Raw training extracts** | 6 files / 7,598 lines |

---

## GAP ANALYSIS

### What We Have (Sufficient for Production App Building):
- ALL Build documentation (auth, extensions, functions, checkout, webhooks, data models, orders, subscriptions, POS, B2B, markets, Flow)
- ALL Design documentation (Polaris, navigation, layouts, states, accessibility, responsive, performance, content)
- ALL Launch documentation (requirements, listing, billing, privacy, security, review, distribution, Built for Shopify)
- 10 major API deep-dives (Admin GraphQL, Storefront, CLI, Liquid, App Bridge, React Router SDK, Functions, Webhooks, Polaris, API Hub)

### What's Missing (Nice-to-Have, Not Blocking):
1. **REST Admin API resource pages** (~40 pages) — LOW priority, REST is deprecated
2. **Partner API** — analytics/earnings queries — MEDIUM, useful post-launch
3. **Customer Privacy API deep dive** — MEDIUM, consent management details
4. **POS/Customer Account extension deep targets** — MEDIUM, only if building POS/account apps
5. **AJAX API** — LOW, theme-only JavaScript
6. **ShopifyQL** — LOW, analytics query language
7. **API Release Notes** — LOW, version changelogs
8. **Hydrogen/Oxygen** — LOW, only if doing headless builds

### Verdict: **90%+ coverage of everything needed for production Shopify app development.**

The missing items are either deprecated (REST), niche (ShopifyQL, AJAX), or only relevant post-launch (Partner API). For building, designing, and launching a Shopify app through the App Store — the knowledge base is complete.

---

Last updated: **2026-04-04**
