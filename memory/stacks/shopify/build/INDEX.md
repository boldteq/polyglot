# Build Phase Reference Index

This index lists all component-based build phase files. Each file stands alone with complete patterns, code examples, and pitfalls.

---

## Core Extension Types

**1. extensions.md**
- All extension types (admin_block, checkout_ui, theme, function types, pos_ui, etc.)
- Extension-only apps (no backend required)
- shopify.extension.toml configuration
- Extension targets reference
- Source: shopify.dev/docs/apps/build/app-extensions

**2. admin.md**
- Admin blocks (inline cards on resource pages)
- Admin actions (modal workflows)
- Admin print actions (document generation)
- Connecting to backend from admin extensions
- Conditional visibility (shouldRender)
- Source: shopify.dev/docs/apps/build/admin

**3. checkout.md**
- Checkout UI extensions (web components, targets, Polaris-based)
- Cart & checkout validation functions
- Delivery customization functions
- Payment customization functions
- Product offers (pre-purchase & post-purchase)
- Source: shopify.dev/docs/apps/build/checkout

**4. online-store.md**
- Theme app extensions (app blocks vs app embed blocks)
- Block schema and Liquid template structure
- Dynamic sources with `closest` pattern
- Configuration and common pitfalls
- Source: shopify.dev/docs/apps/build/online-store/theme-app-extensions

---

## Business Logic & Data

**5. functions.md**
- Shopify Functions overview (Wasm-based, < 10ms timeout)
- Function types: discount, delivery, payment, cart_transform, validation
- Code patterns (JavaScript and Rust examples)
- Input query patterns and output formats
- Testing and deployment
- Source: shopify.dev/docs/api/functions

**6. data-models.md**
- Metafields vs metaobjects decision tree
- Metafield ownership (app-owned vs merchant-owned) and TOML declaration
- Metaobject capabilities (publishable, translatable, renderable, online store)
- Product hierarchy (3-tier: Product > Options > Variants)
- Product bundles and catalogs
- Source: shopify.dev/docs/apps/build/metafields + shopify.dev/docs/apps/build/metaobjects

**7. webhooks.md**
- Webhook configuration (TOML vs GraphQL mutation)
- GDPR compliance webhooks (mandatory customers/data_request, customers/redact, shop/redact)
- Delivery guarantees and retry behavior (8 retries, 4 hours)
- Idempotency and reconciliation patterns
- Event topics reference (orders, products, customers, fulfillment, shop)
- Best practices: queueing, idempotency, exponential backoff, event sourcing
- Source: shopify.dev/docs/apps/build/webhooks

---

## Commerce Features

**8. orders.md**
- FulfillmentOrder lifecycle (OPEN → IN_PROGRESS → CLOSED)
- Fulfillment service integration (callback endpoints)
- Returns management
- Inventory management (query and adjust operations)
- Source: shopify.dev/docs/apps/build/orders-fulfillment

**9. subscriptions.md**
- Selling plans overview (pricing, billing, delivery, inventory policies)
- Subscribe & Save (pay per delivery) pattern
- Prepaid plans pattern (buy 3, save 15%)
- Deferred purchases (pre-order, try before you buy)
- Subscription contracts and billing cycles
- Source: shopify.dev/docs/apps/build/purchase-options

**10. b2b.md**
- Prerequisites (Shopify Plus only)
- Company and location management
- Catalog assignment per location
- Draft orders for B2B (with custom pricing support)
- Payment terms configuration
- Quantity rules
- Source: shopify.dev/docs/apps/build/b2b

---

## Platforms & Surfaces

**11. pos.md**
- POS extensions overview (cross-platform native, iOS/Android)
- Extension targets (tiles, actions, blocks)
- Web components and APIs
- Configuration pattern
- Mobile-first design requirements
- Source: shopify.dev/docs/apps/build/pos

**12. customer-accounts.md**
- Sandbox security model (no sensitive data access)
- Full-page extensions and order action extensions
- Inline extensions on order status page
- Metafields in customer accounts
- Navigation and direct linking constraints
- Source: shopify.dev/docs/apps/build/customer-accounts

---

## Growth & Engagement

**13. marketing.md**
- Web pixels (behavioral data collection in sandbox)
- Standard events (page_viewed, product_viewed, checkout_*, etc.)
- Custom events
- Customer segments (definition, filtering, workflow)
- Marketing activities integration
- Source: shopify.dev/docs/apps/build/marketing-analytics

**14. markets.md**
- Multi-market support structure (locales, domains, URLs, currencies)
- App localization benefits (5-7% lower churn, store visibility)
- Multi-language support (dynamic URLs, Storefront API)
- Currency handling (presentment currencies, local payment)
- Product localization (market-specific restrictions, catalogs)
- Source: shopify.dev/docs/apps/build/markets

---

## Automation

**15. flow.md**
- Flow overview (automation app for merchants)
- Triggers (events that start workflows)
- Actions (tasks executed when conditions met)
- Conditions (developer constraint: only Shopify builds these)
- Common patterns (trigger → condition → action)
- Public endpoint requirements for actions
- Source: shopify.dev/docs/apps/build/flow

---

## Coverage Map

| Feature | File | Shopify Docs Path |
|---------|------|---|
| Admin extensions | admin.md | /docs/apps/build/admin |
| App extensions | extensions.md | /docs/apps/build/app-extensions |
| B2B | b2b.md | /docs/apps/build/b2b |
| Checkout extensions | checkout.md | /docs/apps/build/checkout |
| Customer accounts | customer-accounts.md | /docs/apps/build/customer-accounts |
| Data models | data-models.md | /docs/apps/build/metafields, /metaobjects |
| Flow | flow.md | /docs/apps/build/flow |
| Functions | functions.md | /docs/api/functions |
| Marketing | marketing.md | /docs/apps/build/marketing-analytics |
| Markets | markets.md | /docs/apps/build/markets |
| Orders | orders.md | /docs/apps/build/orders-fulfillment |
| Online store | online-store.md | /docs/apps/build/online-store/theme-app-extensions |
| POS | pos.md | /docs/apps/build/pos |
| Subscriptions | subscriptions.md | /docs/apps/build/purchase-options |
| Webhooks | webhooks.md | /docs/apps/build/webhooks |

---

**Last Updated:** 2026-04-04
**Total Files:** 15 build files (standalone, no cross-references needed)
**Format:** Each file includes Key Rules, Code Patterns, and Pitfalls sections
