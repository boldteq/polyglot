# Shopify API Hub — Master Reference Index

**Source:** [shopify.dev/docs/api](https://shopify.dev/docs/api)
**Updated:** 2026-04-04

---

## API Hub Overview

Shopify provides a comprehensive set of APIs for different use cases:

1. **Backend/Integration APIs** — Read/write store data, manage operations
2. **Storefront APIs** — Build custom shopping experiences
3. **Extensions APIs** — Customize admin, checkout, customer accounts
4. **Tools & Libraries** — SDKs, CLIs, frameworks

---

## Core Backend APIs

### GraphQL Admin API (Recommended)

**Use for:** App logic, data mutations, webhooks, everything backend

**What it does:**
- Full read/write access to shop data
- Products, inventory, orders, customers, fulfillment
- Subscriptions, pricing, discount rules
- Webhooks management
- Bulk operations
- Access control via scopes

**Key entry points:**
- `Query` — products, customers, orders, inventory
- `Mutation` — create/update products, orders, etc.
- Subscriptions via webhooks (TOML or GraphQL)

**Endpoint:** `https://{shop}.myshopify.com/api/2026-01/graphql.json`

**Auth:** OAuth app token (from Shopify CLI/App Bridge) or custom app token

**Rate limits:** 2 queries/second (bucket system)

**Link:** [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest)

---

### REST Admin API (Legacy)

**Use for:** Legacy integrations, REST-preferred systems

**What it does:**
- REST endpoints for products, orders, customers
- Older than GraphQL Admin API
- Resource-based structure (/products, /orders, etc.)

**Recommendation:** Migrate to GraphQL Admin API for new projects.

**Link:** [REST Admin API](https://shopify.dev/docs/api/admin-rest)

---

### Partner API

**Use for:** Manage Shopify Partner Dashboard operations

**What it does:**
- Create/manage apps
- Manage app listings
- Revenue tracking
- Org management

**Typical users:** Agencies, consultants, app publishers

**Link:** [Partner API](https://shopify.dev/docs/api/partner)

---

### Payments Apps API

**Use for:** Custom payment processing integration

**What it does:**
- Create payment apps for custom checkout
- Handle payment methods
- Refund management

**Typical users:** Payment processors, fintech integrations

**Link:** [Payments Apps API](https://shopify.dev/docs/api/payments-apps)

---

## Storefront & Customer APIs

### Storefront API (GraphQL)

**Use for:** Build custom shopping experiences (headless storefronts)

**What it does:**
- Query products, collections, pages, blogs
- Create/manage shopping carts
- Customer authentication & account management
- Product search & autocomplete
- International pricing & localization
- Metafields access

**No rate limits** — but query complexity limits apply

**Endpoint:** `https://{shop}.myshopify.com/api/2026-01/graphql.json`

**Auth:** Storefront access token (public) or no token (tokenless for public queries)

**Key difference from Admin API:** Customer-facing, minimal scopes, cart/checkout focus

**Link:** [Storefront API Reference](https://shopify.dev/docs/api/storefront/latest)

**Detailed doc:** `shopify/api/storefront.md`

---

### Customer Account API

**Use for:** Manage customer profile & order data post-login

**What it does:**
- Query customer profile (name, email, phone)
- Retrieve customer order history
- Update customer profile
- Manage customer addresses

**Use case:** Build custom customer account pages

**Auth:** Customer access token (from Storefront API login flow)

**Link:** [Customer Account API](https://shopify.dev/docs/api/customer/latest)

---

### Customer Privacy API

**Use for:** Manage GDPR consent & data privacy

**What it does:**
- Store/retrieve customer consent preferences
- Manage email marketing consent
- Manage SMS/push notification consent
- Handle data deletion requests

**Required for:** Compliance with privacy laws (GDPR, CCPA)

**Link:** [Customer Privacy API](https://shopify.dev/docs/api/customer-privacy)

---

### AJAX API

**Use for:** Add dynamic elements to existing Storefront/Liquid themes

**What it does:**
- Fetch product data
- Manage cart without page reload
- Add products to cart via AJAX
- Get shop settings

**Lightweight** — JSON endpoints, no GraphQL required

**Link:** [AJAX API Reference](https://shopify.dev/docs/api/ajax/reference)

---

## Catalog API (New)

**Use for:** Build agentic commerce, product discovery

**What it does:**
- Search products across multiple Shopify merchants
- Retrieve product details, pricing, reviews
- Designed for AI agents / recommendation engines

**Typical users:** Generative AI apps, marketplace aggregators

**Link:** [Catalog API](https://shopify.dev/docs/api/catalog-api)

---

## ShopifyQL (New)

**Use for:** Query store data with SQL-like syntax

**What it does:**
- SQL-like language for Shopify data
- Simpler alternative to GraphQL for data analysts
- Built-in aggregations (SUM, AVG, COUNT, GROUP BY)

**Typical users:** Data analysts, business intelligence tools

**Link:** [ShopifyQL Documentation](https://shopify.dev/docs/storefronts/liquid/reference)

---

## Extensions APIs

### Admin UI Extensions API

**Use for:** Customize Shopify admin interface

**What it does:**
- Add custom sections/blocks to product/order/customer pages
- Create custom actions in admin
- Add custom fields & validation

**Targets:**
- `admin.product-details.render` — Product detail page
- `admin.order-details.block.render` — Order detail page
- `admin.customer-segment.render` — Customer segment editor
- `admin.settings.custom-data.render` — Custom data section

**Tech:** JavaScript/React + Web Components

**Styling:** Shopify Design System components

**Link:** [Admin UI Extensions](https://shopify.dev/docs/api/admin-extensions/latest)

---

### Checkout UI Extensions API

**Use for:** Customize Shopify checkout experience

**What it does:**
- Add fields to checkout form
- Customize payment options
- Add custom discount fields
- Add delivery instructions

**Targets:**
- `purchase.checkout.block.render` — Between checkout sections
- `purchase.checkout.shipping-option-list.render-after` — After shipping options
- `purchase.paymentMethod.render-after` — After payment methods

**Tech:** JavaScript/Preact (64 KB bundle limit) + Web Components

**Link:** [Checkout UI Extensions](https://shopify.dev/docs/api/checkout-ui-extensions/latest)

---

### Customer Account UI Extensions API

**Use for:** Customize customer account pages (orders, profile)

**What it does:**
- Add custom sections to order pages
- Add fields to customer profile
- Extend order status page

**Targets:**
- `customer-account.order-status.render-after` — After order status
- `customer-account.page.render` — Custom account pages
- `customer-account.profile.render` — Customer profile section

**Tech:** JavaScript/Preact (64 KB limit) + Web Components

**Isolation:** Sandboxed, no access to sensitive payment data

**Link:** [Customer Account UI Extensions](https://shopify.dev/docs/api/customer-account-ui-extensions/latest)

---

### Theme Blocks/Sections API

**Use for:** Build reusable Shopify theme blocks

**What it does:**
- Create custom Liquid blocks for themes
- Add to theme customizer
- Merchant can drag/drop your blocks

**Tech:** Liquid template language

**Link:** [Theme Development](https://shopify.dev/docs/themes/architecture)

---

### POS (Point of Sale) UI Extensions API

**Use for:** Customize Shopify POS system

**What it does:**
- Add custom screens to POS checkout
- Add custom buttons/actions
- Integrate with POS orders

**Link:** [POS UI Extensions](https://shopify.dev/docs/api/pos-ui-extensions/latest)

---

## Libraries & Tools

### App Bridge (@shopify/app-bridge-react)

**Use for:** React apps inside Shopify admin

**What it does:**
- Provides React hooks & components
- Navigation, modals, toasts
- Admin context access
- Embedded app experience

**Includes:** Polaris UI components, authentication helpers

**Latest version:** v4.x

**Link:** [App Bridge](https://shopify.dev/docs/api/app-bridge)

**Detailed doc:** `shopify/api/app-bridge.md`

---

### Shopify App Remix

**Use for:** Full-stack Shopify app development

**What it does:**
- Remix framework preconfigured for Shopify
- OAuth handling
- Database setup (Prisma + SQLite/PostgreSQL)
- Webhooks routing
- App Bridge integration
- CLI scaffolding

**Includes:** Template, example components, billing setup

**Link:** [Shopify App Remix](https://shopify.dev/docs/api/shopify-app-remix)

---

### Polaris (Design System)

**Use for:** UI components for Shopify apps

**What it does:**
- React component library
- Tailored for admin apps
- Accessible (WCAG 2.1 AA)
- Responsive design

**Components:** Button, Card, Form, Modal, ResourceList, DataTable, etc.

**Link:** [Polaris Documentation](https://polaris.shopify.com)

---

### Shopify CLI

**Use for:** Scaffold, develop, deploy Shopify apps

**Commands:**
- `shopify app create` — Scaffold new app
- `shopify app dev` — Dev server
- `shopify app deploy` — Deploy to Shopify hosting
- `shopify functions` — Manage Function extensions
- `shopify webhooks trigger` — Test webhooks locally

**Link:** [Shopify CLI Documentation](https://shopify.dev/docs/api/shopify-cli)

---

### GraphQL Codegen

**Use for:** Type-safe GraphQL queries in TypeScript

**Generates:**
- TypeScript types from GraphQL schema
- Hooks for React (with `graphql-request`)
- Prevents runtime errors from schema changes

**Link:** [GraphQL Codegen](https://the-guild.dev/graphql/codegen)

---

## API Quick Reference Matrix

| API | Use Case | Auth | Rate Limit | Read/Write |
|-----|----------|------|-----------|-----------|
| **GraphQL Admin** | App backend | OAuth token | 2 req/sec | Both |
| **REST Admin** | Legacy integration | OAuth token | Bucket | Both |
| **Storefront** | Custom storefront | Token or none | Complexity | Both |
| **Customer Account** | Customer profile | Access token | — | Read |
| **Customer Privacy** | GDPR compliance | Token | — | Both |
| **AJAX** | Theme enhancement | None | — | Limited |
| **Catalog** | Product discovery | Token | — | Read |
| **Partner API** | Partner operations | OAuth | — | Both |
| **Webhooks** | Event notifications | Signed | 8 retries/4h | — |
| **Admin Extensions** | Admin customization | — | — | — |
| **Checkout Extensions** | Checkout UI | — | — | — |
| **Customer Account Extensions** | Account UI | — | — | — |

---

## Which API Should I Use?

### Building a Shopify App (Inside Admin)?
→ **GraphQL Admin API** + **App Bridge React** + **Webhooks**

### Building a Custom Storefront?
→ **Storefront API** (maybe Hydrogen for template)

### Building a Headless Store?
→ **Storefront API** + **Catalog API** (for discovery)

### Customizing Checkout?
→ **Checkout UI Extensions** + **Storefront API**

### Customizing Admin?
→ **Admin UI Extensions** + **GraphQL Admin API**

### Integrating with Third-Party System?
→ **GraphQL Admin API** + **Webhooks**

### Building a Payment Integration?
→ **Payments Apps API** + **Webhooks**

### Selling Across Multiple Channels?
→ **GraphQL Admin** + **Channel API** (if available)

---

## Learning Path (For App Developers)

1. **Start:** Shopify CLI scaffold + Remix template
2. **Auth:** OAuth via Shopify App Remix (handled automatically)
3. **UI:** Polaris + App Bridge React for admin components
4. **Data:** GraphQL Admin API queries/mutations
5. **Events:** Webhooks for async updates
6. **Products:** Query/manage via Admin API
7. **Orders:** Listen to order webhooks, update status
8. **Billing:** Dodo Payments (for the project) or Shopify Billing API
9. **Testing:** `shopify webhooks trigger` + admin console
10. **Deployment:** `shopify app deploy` to Shopify Hosting

---

## Documentation Structure

- **webhooks.md** — Webhook topics, delivery, HMAC, compliance
- **storefront.md** — Product queries, cart API, customer auth, localization
- **app-bridge.md** — React components, modals, navigation, styling

---

## Sources

- [Shopify APIs Overview](https://shopify.dev/docs/api)
- [About Shopify APIs](https://shopify.dev/docs/api/usage)
- [Shopify API Authentication](https://shopify.dev/docs/api/usage/authentication)
- [Shopify API Limits](https://shopify.dev/docs/api/usage/limits)
- [Shopify Changelog](https://shopify.dev/changelog)
