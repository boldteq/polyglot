# Core: Shopify App Stack Definition

> Source: shopify.dev/docs/apps/build/scaffold-app + shopify.dev/docs/apps/build/cli-for-apps/app-structure
> Last extracted: 2026-04-04

## Stack B Definition

**Framework:** React Router v7 (RECOMMENDED for new apps) OR Remix + TypeScript
**UI System:** Polaris Web Components (React Router) or Polaris React v13.9.5 (Remix, archived Jan 2026)
**Database:** Prisma + PostgreSQL
**Auth:** `@shopify/shopify-app-remix` (session tokens ONLY, never cookies)
**API:** Shopify Admin GraphQL (REST deprecated for new apps)
**Billing:** Shopify Billing API ONLY (never external processors like Dodo for app charges)
**Dev Server:** Port 8080 (Vite or Node)
**CLI:** Shopify CLI 3.x (`shopify app dev`, `shopify app deploy`)

**Template Selection:**
- **New apps:** `shopify-app-template-react-router` (React Router v7 + Polaris Web Components) — GA since Oct 2025
- **Existing apps:** Keep Remix + Polaris React v13.9.5 (still works, upgrade when ready)
- **App Home:** Web components required (Polaris React does not work here)
- **Extensions:** Web components required (theme extensions, checkout UI, functions)

## Folder Structure

```
my-app/
├── app/routes/                   # All route handlers (Remix) OR src/routes/ (React Router)
│   ├── app._index.tsx            # Dashboard (post-install landing)
│   ├── app.settings.tsx          # Settings page
│   ├── app.plans.tsx             # Billing/plan selection
│   ├── app.tsx                   # Layout wrapper (Polaris)
│   ├── auth.$.tsx                # OAuth callback
│   ├── auth.login/route.tsx      # Login page
│   └── webhooks.tsx              # Webhook handlers (all topics)
├── app/components/               # Polaris React (Remix) or regular React (React Router)
│   ├── [Feature]Card.tsx
│   ├── [Feature]Form.tsx
│   └── [Feature]IndexTable.tsx
├── app/models/                   # DB models (Prisma helpers)
│   ├── Shop.server.ts
│   └── [Resource].server.ts
├── app/utils/
│   ├── shopify.server.ts         # shopifyApp() config
│   ├── billing.server.ts         # BILLING_PLANS definition
│   └── db.server.ts              # Prisma client
├── prisma/
│   ├── schema.prisma             # DB schema
│   └── migrations/               # Version-controlled SQL
├── extensions/                   # Web components ONLY (theme, checkout, functions)
│   ├── theme-app-extension/      # Liquid blocks + web components
│   ├── checkout-ui/              # Checkout extensions (Preact)
│   └── function/                 # Shopify Functions (Rust/JS)
├── shopify.app.toml              # MANDATORY app config
├── .env                          # Local env (not committed)
├── .env.example                  # Template for env
├── package.json
└── tsconfig.json
```

## shopify.app.toml (MANDATORY)

**Required fields:**
```toml
scopes = "write_products,read_products,write_orders,read_orders"  # Your app's access
name = "My App"
type = "public|custom"     # public for App Store, custom for single merchant
handle = "my-unique-app"   # Unique identifier
webhooks.api_version = "2025-01"  # Supported version (not deprecated within 90 days)

# Webhook subscriptions (auto-registered on deploy)
[[webhooks.subscriptions]]
topics = ["orders/create", "products/update"]
uri = "https://myapp.com/webhooks"

# Billing (if monetized)
[billing]
# Plans defined here or via API

# Extensions reference
[build]
include_config_on_deploy = ["extensions/*/shopify.extension.toml"]
```

## Auth Flow (Non-Negotiable)

1. **Session tokens ONLY** — never cookies, never bearer tokens in frontend
2. **Every loader/action MUST authenticate first:**
   ```typescript
   const { admin, session, billing } = await authenticate.admin(request);
   const shop = session.shop;  // ONLY valid shop identifier
   ```
3. **Always scope data by shop:**
   ```typescript
   const data = await prisma.resource.findMany({
     where: { shop },  // Critical for multi-tenancy
   });
   ```

## Polaris UI Rules (App Store Requirement)

- **MANDATORY:** Use Polaris ONLY for admin UI
- **Remix apps:** `@shopify/polaris` React components v13.9.5 (archived but functional)
- **React Router apps:** Polaris Web Components + CDN: `<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>`
- **App Home:** Web components required (Polaris React does not work)
- **Extensions:** Web components required for all extension types
- **NO alternatives:** Tailwind, shadcn, custom CSS for admin layouts
- **Page structure:** Every route uses `<Page>` (or `<shopify-page>`) + `<Layout>` + `<Card>` pattern
- **Responsive:** Polaris handles desktop/mobile automatically
- **Theming:** Merchants' brand colors auto-apply via Polaris

**Invalid:**
```typescript
// ❌ WRONG — will cause App Store rejection
import styled from 'styled-components';
import { Card } from '@myui/components';
```

**Valid (Remix + Polaris React):**
```typescript
// ✅ CORRECT
import { Page, Layout, Card, BlockStack } from '@shopify/polaris';
```

**Valid (React Router + Web Components):**
```html
<!-- ✅ CORRECT -->
<shopify-page>
  <shopify-layout>
    <shopify-layout-section>
      <shopify-card></shopify-card>
    </shopify-layout-section>
  </shopify-layout>
</shopify-page>
```

## Billing (Shopify Billing API Only)

**CRITICAL:** Shopify Billing API is the ONLY approved payment method for app charges.

- External payment processors (Dodo Payments, Stripe, etc.) are NOT allowed for app subscriptions
- Merchant billing flows use `@shopify/shopify-app-remix` billing helpers
- Plans defined in `shopify.app.toml` or via API
- Trial days configurable per plan
- Free tier must not block core functionality (App Store requirement)

## GDPR Webhooks (MANDATORY)

Every app MUST implement three webhooks — required even if app stores NO user data:

**CRITICAL: GDPR webhooks are NOT registered in shopify.app.toml.**
They are configured in Shopify Partner Dashboard > App Setup > Privacy.
Adding `customers/data_request`, `customers/redact`, or `shop/redact` to TOML
causes deploy error: "The following topic is invalid".

**Configuration:**
1. Go to Shopify Partner Dashboard > App > Configuration > Privacy
2. Set the GDPR webhook URLs there (e.g. `/webhooks/customers/data_request`)
3. Create route handler files in `app/routes/` for each topic
4. Add a TOML comment documenting where GDPR webhooks are configured

```toml
# GDPR compliance webhooks (customers/data_request, customers/redact, shop/redact)
# are NOT registered here — they are configured in Shopify Partner Dashboard > App setup > Privacy.
# Route handlers exist at: webhooks.customers.data_request.tsx, webhooks.customers.redact.tsx, webhooks.shop.redact.tsx
```

Handlers must:
- **customers/data_request:** Export all customer PII held by app
- **customers/redact:** Delete all customer data (async is fine)
- **shop/redact:** Delete all shop data on app uninstall (delete ALL models scoped to that shop)

## App Bridge (Embedded Apps)

**REQUIRED for all embedded apps:**
- `@shopify/app-bridge-react` for React components
- Nav menu, modals, toasts, and session tokens via App Bridge
- Session tokens expire every 1 minute — fetch fresh for each request

## Key Safety Rules

1. **Never use cookies** — session tokens ONLY
2. **Never hardcode secrets** — API key/secret via env vars ONLY
3. **Shop-scoped data mandatory** — every DB query filters by `session.shop`
4. **Polaris mandatory** — no exceptions for admin UI
5. **Shopify Billing mandatory** — no external payment for app charges
6. **HTTPS mandatory** — HTTP rejected in production
7. **API version locked** — update per deploy, never deprecated

## Template Selection Guide

### New Apps (Recommended)
```bash
# React Router v7 + Polaris Web Components (GA since Oct 2025)
shopify app init --template=react-router
```

### Existing Apps (Backward Compatible)
```bash
# Remix + Polaris React v13.9.5 (still works, archival announced Jan 2026)
shopify app init --flavor=remix
```

## Common Setup Commands

```bash
# Scaffold new app (React Router recommended)
shopify app init --template=react-router
# OR legacy
shopify app init --flavor=remix

# Local development
shopify app dev

# Deploy
shopify app deploy

# Generate types from Shopify schema
shopify app schema  # Updates admin.graphql

# Create/manage extensions (uses web components)
shopify app generate extension
```

---

## 2025-2026 Breaking Changes & Updates

> Added: 2026-04-10. Sources: shopify.dev, Polaris blog, Shopify changelog.

### API & Platform Changes
- **April 1, 2025**: REST Admin API deprecated. GraphQL Admin API REQUIRED for all new apps.
- **January 1, 2026**: Legacy custom apps no longer allowed. All apps must be public/reviewed.
- **Billing API**: Now requires line items structure for all pricing models (flat-rate removed).

### App Bridge CDN Migration (July 2025)
- npm package (`@shopify/app-bridge`) is in **maintenance mode**.
- Required: CDN script tag for Built for Shopify status.
```html
<meta name="shopify-api-key" content="%SHOPIFY_API_KEY%" />
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
```
- Trade-off: Auto-updates (always latest) vs. less control over timing.

### Polaris Web Components Unification (October 2025)
- Version 2025-07 was the LAST to support React components.
- v2025-10+ uses Polaris web components only for extensions.
- Standard HTML attributes in markup; property access on DOM elements.
- Responsive values via container queries: `@container (inline-size > 500px) large, small`.
- Commands API: `commandFor` attribute controls components declaratively.

### Checkout Extensions Migration
- React-based checkout UI extensions DEPRECATED.
- v2025-10+ requires web components only.
- Components inherit merchant brand settings — CSS cannot be overridden.
- Block targets allow flexible placement anywhere in checkout.

### Checkout Validation Functions (2025-01+)
- Server-side validation for checkout (supports express checkouts).
- Max 25 validation functions per store.
- Field-level targeting: `$.cart.deliveryGroups[0].deliveryAddress.postalCode`.
- JavaScript or Rust implementation.
- Use cases: tokengating, B2B minimums, PO validation, billing restrictions.

### App Store Approval (Updated 2025-2026)
- Response times: <500ms for 95% of requests.
- Lighthouse: no more than 10-point drop from Shopify admin baseline.
- App Bridge: must use latest version for Built for Shopify status.

### Hydrogen + Storefront MCP (Winter 2026)
- AI-native commerce framework with Storefront MCP.
- AI assistants can query real-time product data, manage carts, guide checkout.
- React + Tailwind + GraphQL Storefront API + Oxygen hosting.
- Mobile performance: 90+ Lighthouse vs traditional themes 60-75.
- Agentic commerce features rolling out March 2026.
