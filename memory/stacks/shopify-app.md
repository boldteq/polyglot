---
name: Shopify App Stack Knowledge (Deep Training)
description: Complete production-grade patterns for building Shopify apps — covers Remix framework, Polaris UI, billing, webhooks, extensions, App Store approval, and deployment
type: reference
stack: shopify-app
updated: 2026-04
---

## Stack B: Shopify App (Production Grade)

**Core:** Remix (or React Router v7) + TypeScript + Polaris + Prisma + PostgreSQL + Shopify Billing API
**CLI:** Shopify CLI 3.x (`shopify app dev`, `shopify app deploy`)
**Auth:** `@shopify/shopify-app-remix` (session tokens, NOT cookies)
**UI:** `@shopify/polaris` (MANDATORY — no alternatives for admin UI)
**Embedding:** `@shopify/app-bridge-react` (all embedded apps)
**API:** Shopify Admin GraphQL API (REST is deprecated for new apps)

---

## Folder Structure (Production Standard)

```
app/
├── routes/
│   ├── app._index.tsx              # Main dashboard (first page after install)
│   ├── app.settings.tsx            # App settings page
│   ├── app.plans.tsx               # Billing/plan selection
│   ├── app.$resourceId.tsx         # Dynamic resource page
│   ├── app.tsx                     # App layout wrapper (Polaris AppProvider + NavMenu)
│   ├── auth.$.tsx                  # OAuth callback handler
│   ├── auth.login/
│   │   └── route.tsx               # Login page
│   └── webhooks.tsx                # All webhook handlers
├── components/
│   ├── [Feature]Card.tsx           # Polaris Card-based components
│   ├── [Feature]Form.tsx           # Polaris form components
│   ├── [Feature]IndexTable.tsx     # Polaris table components
│   └── EmptyState[Feature].tsx     # Polaris EmptyState components
├── models/
│   ├── Shop.server.ts              # Shop model helpers
│   ├── [Resource].server.ts        # Resource CRUD helpers
│   └── Subscription.server.ts      # Billing status helpers
├── utils/
│   ├── shopify.server.ts           # shopifyApp() configuration
│   ├── billing.server.ts           # Billing plan definitions
│   └── helpers.server.ts           # Shared utilities
├── types/
│   └── index.ts                    # Shared TypeScript types
prisma/
├── schema.prisma                   # Database schema
├── migrations/                     # Migration history
shopify.app.toml                    # App configuration (scopes, webhooks, billing)
extensions/
├── theme-app-extension/            # Theme blocks (Liquid + JS)
│   ├── blocks/
│   │   └── [widget].liquid
│   ├── assets/
│   │   └── [widget].js             # Pure JS — NO React, NO frameworks
│   └── locales/
│       └── en.default.json
├── checkout-ui/                    # Checkout extensions (Preact)
└── function/                       # Shopify Functions (Rust/JS)
```

---

## Auth Pattern (Non-Negotiable)

```typescript
// app/utils/shopify.server.ts
import "@shopify/shopify-app-remix/adapters/node";
import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2025-10",  // Always use latest stable version
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  isEmbeddedApp: true,
  billing: {
    // Defined in billing.server.ts
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
    SHOP_REDACT: {
      deliveryMethod: "http",
      callbackUrl: "/webhooks",
    },
  },
});

export default shopify;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
```

### Every Loader/Action MUST Start With Auth
```typescript
// ✅ CORRECT — auth first, always
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session, billing } = await authenticate.admin(request);
  // session.shop is the ONLY source of shop identity
  const shop = session.shop;

  const data = await prisma.resource.findMany({
    where: { shop },  // ALWAYS scope by shop
    orderBy: { createdAt: "desc" },
  });

  return json({ data });
}

// ❌ WRONG — never get shop from query params or headers
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop"); // SECURITY HOLE
}
```

---

## Polaris UI Rules (MANDATORY — App Store Rejection if Violated)

### Page Structure Pattern
```typescript
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";

export default function SettingsPage() {
  return (
    <Page
      title="Settings"
      subtitle="Configure your app preferences"
      primaryAction={{ content: "Save", onAction: handleSave }}
      backAction={{ onAction: () => navigate("/app") }}
    >
      <Layout>
        <Layout.AnnotatedSection
          title="General"
          description="Basic app configuration"
        >
          <Card>
            <BlockStack gap="400">
              <TextField label="Store name" value={name} onChange={setName} autoComplete="off" />
              <Select label="Currency" options={currencyOptions} value={currency} onChange={setCurrency} />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Notifications"
          description="Choose how you want to be notified"
        >
          <Card>
            <ChoiceList
              title="Email notifications"
              choices={notificationChoices}
              selected={notifications}
              onChange={setNotifications}
              allowMultiple
            />
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
```

### Data Table Pattern (IndexTable)
```typescript
import { IndexTable, Card, Text, Badge, useIndexResourceState } from "@shopify/polaris";

function ResourceListPage({ resources }) {
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(resources);

  const rowMarkup = resources.map((resource, index) => (
    <IndexTable.Row
      id={resource.id}
      key={resource.id}
      selected={selectedResources.includes(resource.id)}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold">{resource.name}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{resource.description}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={resource.active ? "success" : "info"}>
          {resource.active ? "Active" : "Draft"}
        </Badge>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: "resource", plural: "resources" }}
        itemCount={resources.length}
        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
        onSelectionChange={handleSelectionChange}
        headings={[
          { title: "Name" },
          { title: "Description" },
          { title: "Status" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}
```

### Loading State Pattern
```typescript
import { SkeletonPage, Layout, SkeletonBodyText, Card, SkeletonDisplayText } from "@shopify/polaris";

function LoadingState() {
  return (
    <SkeletonPage primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={3} />
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <SkeletonBodyText lines={2} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

### Empty State Pattern
```typescript
import { EmptyState, Page } from "@shopify/polaris";

function EmptyResourcePage() {
  return (
    <Page title="Products">
      <EmptyState
        heading="Create your first product recommendation"
        action={{ content: "Create recommendation", onAction: handleCreate }}
        secondaryAction={{ content: "Learn more", url: "https://help.example.com" }}
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
      >
        <p>Product recommendations help increase average order value by suggesting relevant items to your customers.</p>
      </EmptyState>
    </Page>
  );
}
```

### Form Submission Pattern (useFetcher)
```typescript
import { useFetcher } from "@remix-run/react";
import { Card, BlockStack, TextField, Button, Banner } from "@shopify/polaris";

function SettingsForm({ initialData }) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";
  const hasError = fetcher.data?.error;

  return (
    <fetcher.Form method="post">
      <Card>
        <BlockStack gap="400">
          {hasError && (
            <Banner tone="critical" title="Error saving settings">
              <p>{fetcher.data.error}</p>
            </Banner>
          )}
          <TextField
            label="Widget title"
            name="title"
            defaultValue={initialData.title}
            autoComplete="off"
          />
          <Button submit variant="primary" loading={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </BlockStack>
      </Card>
    </fetcher.Form>
  );
}
```

### Toast Pattern (via App Bridge)
```typescript
import { useAppBridge } from "@shopify/app-bridge-react";

function useToast() {
  const shopify = useAppBridge();

  return {
    success: (message: string) => shopify.toast.show(message),
    error: (message: string) => shopify.toast.show(message, { isError: true }),
  };
}

// Usage in component
const toast = useToast();
// After save: toast.success("Settings saved");
// On error: toast.error("Failed to save settings");
```

### Modal Pattern (via App Bridge)
```typescript
import { Modal, TitleBar } from "@shopify/app-bridge-react";

function DeleteConfirmModal({ open, onClose, onConfirm, resourceName }) {
  return (
    <Modal id="delete-confirm" open={open}>
      <p>Are you sure you want to delete "{resourceName}"? This action cannot be undone.</p>
      <TitleBar title="Delete confirmation">
        <button onClick={onClose}>Cancel</button>
        <button variant="primary" tone="critical" onClick={onConfirm}>Delete</button>
      </TitleBar>
    </Modal>
  );
}
```

### Navigation Pattern (NavMenu in app.tsx)
```typescript
// app/routes/app.tsx — layout wrapper
import { NavMenu } from "@shopify/app-bridge-react";
import { Outlet } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/settings">Settings</a>
        <a href="/app/plans">Plans</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
```

---

## Polaris Component Quick Reference

### Layout Components
| Component | Use For |
|-----------|---------|
| `Page` | Every route — title, actions, back navigation |
| `Layout` | Organize page sections |
| `Layout.Section` | Content section (full or oneThird) |
| `Layout.AnnotatedSection` | Settings-style section with title + description |
| `Card` | Container for related content |
| `BlockStack` | Vertical spacing between elements |
| `InlineStack` | Horizontal spacing between elements |
| `Box` | Generic container with padding/background |
| `Divider` | Visual separator |
| `Grid` | CSS grid layout |

### Data Display
| Component | Use For |
|-----------|---------|
| `IndexTable` | Primary data table with selection, sorting, pagination |
| `ResourceList` | List of resources with actions |
| `DataTable` | Simple read-only tables |
| `DescriptionList` | Key-value pairs |
| `Badge` | Status indicators (success, warning, critical, info) |
| `Tag` | Removable labels |
| `Thumbnail` | Small images |
| `Avatar` | User/shop images |

### Forms & Input
| Component | Use For |
|-----------|---------|
| `TextField` | Text input (single or multiline) |
| `Select` | Dropdown selection |
| `Checkbox` | Single toggle |
| `ChoiceList` | Multiple options (radio or checkbox) |
| `RangeSlider` | Numeric range |
| `DatePicker` | Date selection |
| `DropZone` | File upload |
| `ColorPicker` | Color selection |
| `Autocomplete` | Search with suggestions |
| `Filters` | Data filtering |

### Feedback & Status
| Component | Use For |
|-----------|---------|
| `Banner` | Important messages (info, warning, critical, success) |
| `Toast` | Temporary notifications (via App Bridge) |
| `Modal` | Dialogs (via App Bridge for embedded) |
| `Spinner` | Loading indicator (inline only — use SkeletonPage for full page) |
| `ProgressBar` | Progress indication |

### Navigation
| Component | Use For |
|-----------|---------|
| `NavMenu` | App navigation (via App Bridge) |
| `Tabs` | In-page section switching |
| `Pagination` | Page navigation for tables |

### Skeleton/Loading
| Component | Use For |
|-----------|---------|
| `SkeletonPage` | Full page loading state |
| `SkeletonBodyText` | Text placeholder |
| `SkeletonDisplayText` | Heading placeholder |
| `SkeletonThumbnail` | Image placeholder |

---

## Billing Pattern (Shopify Billing API)

```typescript
// app/utils/billing.server.ts
export const BILLING_PLANS = {
  Free: {
    amount: 0,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
  },
  Basic: {
    amount: 9.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 7,
  },
  Pro: {
    amount: 29.99,
    currencyCode: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 7,
  },
} as const;
```

### Billing Check in Loader
```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session, billing } = await authenticate.admin(request);

  // Check if user has active subscription
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: ["Basic", "Pro"],
    isTest: process.env.NODE_ENV !== "production",
  });

  if (!hasActivePayment) {
    // Redirect to plan selection
    return redirect("/app/plans");
  }

  const currentPlan = appSubscriptions[0]?.name || "Free";
  return json({ currentPlan });
}
```

### Plan Selection Action
```typescript
export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;

  // Request billing — redirects to Shopify approval page
  await billing.request({
    plan,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app?billing=success`,
  });

  // billing.request() throws a redirect — code below never runs
  return null;
}
```

---

## Webhook Handler Pattern

```typescript
// app/routes/webhooks.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../utils/shopify.server";
import prisma from "../utils/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Clean up shop data
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      await prisma.shop.update({
        where: { shopDomain: shop },
        data: { isActive: false, uninstalledAt: new Date() },
      });
      break;

    case "CUSTOMERS_DATA_REQUEST":
      // Return customer data (GDPR mandatory)
      // Log the request — respond within 30 days
      console.log(`Customer data request for shop: ${shop}`);
      break;

    case "CUSTOMERS_REDACT":
      // Delete customer data (GDPR mandatory)
      const customerId = (payload as any).customer?.id;
      if (customerId) {
        await prisma.customerData.deleteMany({
          where: { shop, customerId: String(customerId) },
        });
      }
      break;

    case "SHOP_REDACT":
      // Delete ALL shop data (GDPR mandatory — 48 hours after uninstall)
      await prisma.shop.delete({ where: { shopDomain: shop } }).catch(() => {});
      await prisma.resource.deleteMany({ where: { shop } }).catch(() => {});
      break;

    case "APP_SUBSCRIPTIONS_UPDATE":
      // Update local subscription status
      const subscription = (payload as any).app_subscription;
      await prisma.shop.update({
        where: { shopDomain: shop },
        data: {
          plan: subscription?.name || "Free",
          planStatus: subscription?.status || "DECLINED",
        },
      });
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return new Response("OK", { status: 200 });
};
```

---

## Database Schema Pattern (Prisma)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Shopify session storage (required by @shopify/shopify-app-session-storage-prisma)
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String?
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)

  @@index([shop])
}

// Shop data (your app's shop-level settings)
model Shop {
  id              String    @id @default(cuid())
  shopDomain      String    @unique
  name            String?
  email           String?
  plan            String    @default("Free")
  planStatus      String    @default("ACTIVE")
  isActive        Boolean   @default(true)
  installedAt     DateTime  @default(now())
  uninstalledAt   DateTime?
  settings        Json      @default("{}")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations to your resources
  resources       Resource[]

  @@index([shopDomain])
}

// Example resource (replace with your app's actual resource)
model Resource {
  id          String   @id @default(cuid())
  shop        String   // ALWAYS scope by shop
  title       String
  description String?
  status      String   @default("draft") // draft | active | archived
  config      Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([shop])
  @@index([shop, status])
  @@index([shop, createdAt(sort: Desc)])
}
```

**Database Rules:**
- EVERY table that stores merchant data MUST have a `shop` column
- EVERY query MUST include `where: { shop: session.shop }`
- Index on `shop` + any filter/sort field
- Use `upsert` for shop onboarding (idempotent)
- Cascade delete shop data when `SHOP_REDACT` webhook fires

---

## Theme App Extension Pattern (Storefront Widget)

```liquid
<!-- extensions/theme-app-extension/blocks/widget.liquid -->
{% comment %}
  Widget block for theme editor
  Settings defined in schema below
{% endcomment %}

<div id="app-widget-{{ block.id }}" class="app-widget" data-shop="{{ shop.permanent_domain }}">
  <!-- Widget content renders here via JS -->
  <noscript>
    <p>{{ block.settings.fallback_text }}</p>
  </noscript>
</div>

{% schema %}
{
  "name": "My Widget",
  "target": "section",
  "settings": [
    {
      "type": "text",
      "id": "title",
      "label": "Widget Title",
      "default": "Recommended for you"
    },
    {
      "type": "color",
      "id": "accent_color",
      "label": "Accent Color",
      "default": "#000000"
    },
    {
      "type": "checkbox",
      "id": "enabled",
      "label": "Enable widget",
      "default": true
    },
    {
      "type": "text",
      "id": "fallback_text",
      "label": "Fallback text (no JS)",
      "default": "Check out our recommendations!"
    }
  ]
}
{% endschema %}
```

```javascript
// extensions/theme-app-extension/assets/widget.js
// CRITICAL: Pure JS only — NO React, NO frameworks, NO npm packages
// Must be < 64KB compressed
// Must load async to never block merchant storefront

(function() {
  'use strict';

  const widgets = document.querySelectorAll('.app-widget');

  widgets.forEach(function(widget) {
    const shop = widget.dataset.shop;
    const blockId = widget.id.replace('app-widget-', '');

    // Fetch widget data from your app's public API
    fetch(`https://your-app.com/api/public/widget?shop=${shop}`)
      .then(function(response) { return response.json(); })
      .then(function(data) {
        widget.innerHTML = renderWidget(data);
      })
      .catch(function(error) {
        console.error('Widget load failed:', error);
        // Fail silently — never break merchant storefront
      });
  });

  function renderWidget(data) {
    // Pure HTML string — no JSX, no templates
    return '<div class="widget-content">' + data.html + '</div>';
  }
})();
```

**Theme Extension Rules:**
- Pure JS + CSS only — NO React, Vue, or any framework
- < 64KB compressed bundle size
- Load async — NEVER block storefront rendering
- Fail silently — widget errors must never break the merchant's store
- Use `section.settings` schema for merchant configuration in theme editor
- Public API endpoints must validate Shopify origin headers
- All CSS scoped to widget container to prevent style leaks

---

## shopify.app.toml Pattern

```toml
# shopify.app.toml
name = "My App"
client_id = "YOUR_CLIENT_ID"
application_url = "https://your-app.com"
embedded = true

[access_scopes]
# Request ONLY what you need — over-requesting = rejection
scopes = "read_products,write_products,read_orders"

[auth]
redirect_urls = ["https://your-app.com/auth/callback"]

[webhooks]
api_version = "2025-10"

  # GDPR compliance webhooks (customers/data_request, customers/redact, shop/redact)
  # WARNING: Do NOT add these to TOML — causes deploy error "The following topic is invalid"
  # Configure in: Shopify Partner Dashboard > App > Configuration > Privacy
  # Route handlers still needed in app/routes/ (they receive the requests)

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  topics = ["app_subscriptions/update"]
  uri = "/webhooks"

[pos]
embedded = false

[billing]
  [billing.Basic]
  amount = 9.99
  currency_code = "USD"
  interval = "every_30_days"
  trial_days = 7

  [billing.Pro]
  amount = 29.99
  currency_code = "USD"
  interval = "every_30_days"
  trial_days = 7
```

---

## App Store Approval Checklist (BLOCKING)

### Mandatory Technical Requirements
- [ ] HTTPS on all endpoints (SSL certificate valid)
- [ ] GDPR webhooks implemented: `customers/data_request`, `customers/redact`, `shop/redact`
- [ ] API scopes are minimal — only request what the app actually uses
- [ ] API version is current (not deprecated within 90 days): use `2025-10` or later
- [ ] Session tokens for auth (NOT cookies) — `@shopify/shopify-app-remix` handles this
- [ ] CSP headers set for iframe embedding (`frame-ancestors`)
- [ ] Billing uses Shopify Billing API — NO external payment providers
- [ ] App uninstall webhook cleans up properly (removes scripts, cancels jobs)

### Mandatory UI Requirements
- [ ] ALL admin UI uses Polaris components — NO Tailwind, NO custom CSS, NO shadcn
- [ ] App Bridge used for navigation, modals, toasts in embedded context
- [ ] Loading states use `SkeletonPage` / `SkeletonBodyText` (not spinners)
- [ ] Empty states use Polaris `EmptyState` component with helpful messaging
- [ ] Error states show Polaris `Banner` with tone="critical" and recovery action
- [ ] Responsive design — Polaris handles this, don't override with custom breakpoints
- [ ] No Lighthouse regression > 10 points on merchant storefront

### Mandatory UX Requirements
- [ ] Clear onboarding — merchant understands what to do after install
- [ ] All features accessible and functional — no "coming soon" or broken paths
- [ ] Settings page exists with app configuration
- [ ] Help/support link provided (URL or email)
- [ ] App description matches actual functionality
- [ ] Screenshots in listing match current UI

### Common Rejection Reasons (Avoid These)
1. **Non-Polaris UI** — using Tailwind, shadcn, Material UI, or custom CSS for admin
2. **Missing GDPR webhooks** — mandatory even if you store zero customer data
3. **Over-scoped API permissions** — requesting `write_orders` when you only read
4. **External billing** — using Stripe/Dodo Payments instead of Shopify Billing API
5. **Theme code injection** — using ScriptTag API instead of Theme App Extensions
6. **Broken uninstall** — app code remains in theme after uninstall
7. **No onboarding** — merchant installs and has no idea what to do
8. **Fake reviews/ratings** — Shopify detects and rejects
9. **App slows storefront** — widget script too large or synchronous loading
10. **Deprecated API version** — must use supported version

---

## Deployment

### Vercel (Standard)
- Works for most Shopify apps
- Set `SHOPIFY_APP_URL` to your Vercel URL
- Environment variables in Vercel dashboard
- `shopify app deploy` updates Shopify configuration

### Railway (When Needed)
- Use when app needs: persistent connections, background jobs, queues, cron
- PostgreSQL included
- Set `DATABASE_URL` and `SHOPIFY_APP_URL`

### Environment Variables
```bash
SHOPIFY_API_KEY=           # From Shopify Partners dashboard
SHOPIFY_API_SECRET=        # From Shopify Partners dashboard
SHOPIFY_APP_URL=           # Your deployed URL (https://...)
SCOPES=                    # Comma-separated API scopes
DATABASE_URL=              # PostgreSQL connection string
NODE_ENV=production        # For production billing
```

---

## Projects Built On This Stack
- Pinzo (ZIP code checker widget)
- Size Chart & Recommender (AI size recommendations)

---

## Common Gotchas
1. Remix loaders run on every navigation — keep them fast, avoid heavy computation
2. `IndexTable` requires `resourceName` and `itemCount` props — easy to forget
3. `useFetcher` for mutations (not `useSubmit`) — avoids full page navigation
4. Session tokens expire — always handle 401 by redirecting to re-auth
5. `billing.check()` returns `{ hasActivePayment: false }` on free plan — handle this
6. Webhook payloads can arrive AFTER app uninstall — `session` may be undefined
7. Theme extensions auto-removed on uninstall — prefer over ScriptTag API
8. `shopify app dev` creates a tunnel — don't hardcode localhost URLs
9. GraphQL Admin API has rate limits — batch operations, use `bulkOperationRunQuery` for large datasets
10. Test billing with `isTest: true` — Shopify provides test mode for billing flows

*(Updated 2026-04 — comprehensive Shopify app training for Boldteq Software Factory)*

---

## Config Files Deep Dive

### shopify.app.toml Comprehensive Reference

**Primary app configuration file — auto-updated by `shopify app dev` and `shopify app config link`.**

```toml
# Basic identity
name = "My App"
client_id = "auto-assigned"              # Set by Shopify Partners
api_secret_key = "keep-private"          # Set by Shopify Partners
type = "public|custom"                   # public for App Store, custom for single merchant
handle = "my-app"                        # Unique app handle
embedded = true                          # Embedded in admin (NOT theme extensions)

# API version (CRITICAL — must be supported, not deprecated within 90 days)
webhooks.api_version = "2025-10"

# Access scopes (MANDATORY — over-requesting = rejection)
scopes = "write_products,read_products,write_orders,read_orders"

# OAuth redirect
auth.redirect_urls = ["https://your-app.com/auth/callback"]

# Webhook subscriptions (declarative method)
# NOTE: GDPR topics (customers/data_request, customers/redact, shop/redact)
# are NOT registered here — configure in Shopify Partner Dashboard > App Setup > Privacy.
# Adding them to TOML causes deploy error: "The following topic is invalid"

[[webhooks.subscriptions]]
topics = ["orders/create", "orders/updated"]
uri = "/webhooks/orders"

# Billing plans (if monetized)
[billing.Basic]
amount = 9.99
currency_code = "USD"
interval = "every_30_days"
trial_days = 7

[billing.Pro]
amount = 29.99
currency_code = "USD"
interval = "every_30_days"
trial_days = 7

# App extensions (optional; referenced but not defined here)
[build]
include_config_on_deploy = ["extensions/*/shopify.extension.toml"]

# POS configuration (if POS app)
[pos]
embedded = true
```

**Rules:**
1. Scopes are MANDATORY — over-scoping = App Store rejection
2. API version must NOT be deprecated within 90 days from Shopify
3. GDPR webhooks required even if app stores zero customer data
4. Billing plans use ISO currency codes (USD, EUR, GBP, etc.)
5. Trial days capped at 90 days

### shopify.web.toml (Multi-Process Setup)

Only needed for multi-process deployments (frontend/backend separate):

```toml
type = "backend|frontend"
commands.dev = "npm run dev"
commands.build = "npm run build"
port = 3000
```

### shopify.extension.toml (Per Extension)

Each extension requires its own TOML:

```toml
type = "admin_block|admin_action|checkout_ui_extension|theme|function|pos_ui"
targets = ["admin.product-details.block.render", "admin.product-details.action.render"]
name = "My Extension"
description = "Brief description"

# For functions (Shopify Functions)
[configuration]
runtime = "rust|javascript"

# For extensions with capabilities
[settings]
# Settings available to merchant configuration
```

### Multiple Config Pattern

Use `shopify.app.{config-name}.toml` for multiple app linking:

```bash
shopify app dev --config-name=staging
shopify app dev --config-name=production
```

Each maintains separate linking state (different client_ids, secrets).

---

## Authentication Deep Dive

### Token Types Matrix (Complete Reference)

| Aspect | Offline Access | Online Access | Session Token |
|--------|----------------|---------------|---------------|
| **Use Case** | Webhooks, background jobs, service-to-service | User-initiated API calls, ephemeral | Embedded app frontend auth |
| **Lifespan** | 90 days (refreshable) | 24 hours OR user logout | 1 minute (must refresh per request) |
| **Refresh Available** | Yes (90-day refresh token) | No | No (fetch fresh via App Bridge) |
| **Format** | Bearer token string | Bearer token string | JWT (HS256 signed) |
| **User Linked** | No | Yes (specific Shopify user) | Yes (session-specific) |
| **Renewal Mechanism** | Token rotation (Dec 2025+) | User logout ends | App Bridge `getSessionToken()` |
| **Scope Guarantees** | All scopes from install | Same as offline | Same as app scopes |

### Offline Access (Service-to-Service)

**New in Dec 2025: Expiring Access Tokens**
- 90-day refresh token validity
- Access tokens auto-rotate
- Enhanced security through rotation
- Apps continue background operations without merchant intervention

```javascript
// Initial exchange (authorization code grant)
const response = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code: authorizationCode,
    grant_type: 'authorization_code',
    redirect_uri: process.env.REDIRECT_URI,
  }),
});

const { access_token, refresh_token, expires_in } = await response.json();
// Store both tokens; access_token expires per expires_in, use refresh_token to get new one

// Token refresh (every 90 days or when access_token expires)
const refreshResponse = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    refresh_token: storedRefreshToken,
    grant_type: 'refresh_token',
  }),
});

const { access_token: newAccessToken } = await refreshResponse.json();
```

### Online Access Tokens

**24-hour expiry OR immediate logout** — whichever comes first.

```javascript
// Must explicitly request access_type=online
const params = new URLSearchParams({
  client_id: process.env.SHOPIFY_API_KEY,
  scope: 'write_products,read_orders',
  redirect_uri: process.env.REDIRECT_URI,
  state: generateRandomState(),
  access_type: 'online',  // EXPLICIT
});
```

Use case: User-initiated actions where token doesn't need to live beyond user's session.

### Session Tokens (Embedded Apps)

**JWT format: `<header>.<payload>.<signature>` — all base64-encoded**

**Payload contains:**
- `exp`: UNIX timestamp (1 minute from creation)
- `iss`: Issuer (Shopify)
- `sub`: Subject (shop info)
- `aud`: Audience

**Rules:**
1. Lifetime: 1 minute — ALWAYS fetch fresh per request
2. Signed with HS256 using app shared secret
3. Verify signature and expiry before use
4. Fetch via App Bridge `getSessionToken()`

```javascript
// Frontend (React + App Bridge)
import { useAppBridge } from '@shopify/app-bridge-react';

function MyComponent() {
  const app = useAppBridge();

  const fetchProtectedData = async () => {
    // Fetch fresh session token (1-min expiry)
    const sessionToken = await app.getSessionToken();

    const response = await fetch('/api/protected', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    return response.json();
  };
}

// Backend (verify token)
function verifySessionToken(token) {
  const secret = process.env.SHOPIFY_API_SECRET;
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

  // Check expiry
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return decoded;
}
```

### Token Acquisition Methods

#### 1. Token Exchange (Embedded Apps) — RECOMMENDED

```
1. Frontend uses App Bridge to fetch session token (1-min expiry)
2. Frontend sends session token to backend `/token-exchange` endpoint
3. Backend exchanges session token for longer-lived access token (24h)
4. Backend returns access token to frontend
```

**Advantage:** No merchant redirect required; works from within admin

#### 2. Authorization Code Grant (Non-Embedded or Initial Setup)

```
1. Redirect merchant to: https://admin.shopify.com/oauth/authorize?client_id=...&scope=...
2. Merchant logs in and grants scopes
3. Shopify redirects back with ?code=... (store this code)
4. Backend exchanges code for access token
```

**Implementation:**
```javascript
// 1. Initiate authorization
const authUrl = new URL('https://admin.shopify.com/oauth/authorize');
authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
authUrl.searchParams.set('scope', 'write_products,read_orders');
authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
authUrl.searchParams.set('state', generateRandomState());
window.location.href = authUrl.toString();

// 2. Callback handler (backend)
app.get('/auth/callback', async (req, res) => {
  const { code, shop, state } = req.query;

  // CRITICAL: Verify state parameter (CSRF protection)
  if (state !== storedState) return res.status(403).send('Invalid state');

  // Exchange code for token
  const response = await fetch('https://admin.shopify.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  const { access_token, scope, expires_in } = await response.json();
  // Store access_token securely (database, encrypted)
  res.redirect('/app');
});
```

#### 3. Client Credentials Grant (Service Apps)

For apps built for your own organization (no merchant interaction):

```javascript
const response = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    grant_type: 'client_credentials',
    scope: 'write_products,read_orders',
  }),
});

const { access_token, expires_in } = await response.json();
```

**CRITICAL:** Never expose client_secret in frontend or commit to git.

### Access Scopes Best Practices

1. **Minimal principle:** Request ONLY scopes your app uses
2. **Scope updates require re-authorization:** Changing scopes in TOML forces merchant to re-approve
3. **Document justification:** Be ready to explain each scope to Shopify reviewers
4. **Common scopes:** `read_products`, `write_products`, `read_orders`, `read_customers`, `read_inventory`, `write_fulfillments`

---

## App Extension Types Complete Reference

### Extension Categories

**Admin Extensions (Resource-Facing)**
1. `admin_block` — Card-like blocks on product/order/customer detail pages
2. `admin_action` — Modal workflows triggered from resource pages
3. `admin_ui_extension` — Custom full-page UI components in admin

**Storefront Extensions (Customer-Facing)**
1. `theme` — Theme blocks (merchant adds via theme editor, no code)
2. `checkout_ui_extension` — Custom checkout behavior/UI (Preact-based)

**Automation**
1. `delivery_customization` — Customize shipping methods (hide, rename, fees)
2. `payment_customization` — Customize payment options
3. `discount_function` — Custom discount logic (Wasm-based functions)
4. `cart_transform` — Modify cart line items programmatically

**Point of Sale**
1. `pos_ui_extension` — Custom screens, smart grid customization (cross-platform native)

**Marketing & Customer**
1. `marketing_activity_extension` — Marketing automation hooks
2. `customer_account_ui_extension` — Customer account pages (full-page, inline, order actions)

**Flow**
1. `flow_trigger` — App event triggers workflow
2. `flow_action` — Workflow executes app action

### Extension Target Examples

```toml
# Admin block on product page
type = "admin_block"
targets = ["admin.product-details.block.render"]

# Admin action (modal) on order page
type = "admin_action"
targets = ["admin.orders.order-details.action.render"]

# Checkout UI
type = "checkout_ui_extension"
targets = ["purchase.checkout.delivery-address.render-after"]

# POS tile on home screen
type = "pos_ui"
targets = ["pos.home.tile.render"]

# Customer account inline extension
type = "customer_account_ui_extension"
targets = ["customer-account.order-status.delivery-information.render-after"]
```

---

## App Surfaces (Where Apps Appear)

### Admin Surfaces

**App Home** — Primary entry point, renders in sidebar
**Resource Detail Pages** — Admin blocks/actions on products, orders, customers
**Dashboard** — Optional custom dashboard in admin
**Settings** — App configuration pages

### Non-Admin Surfaces

**Checkout** — Custom UI via `checkout_ui_extension`, backend logic via payment/delivery functions
**Storefront** — Theme blocks (merchants add via theme editor)
**Shopify Point of Sale** — Native app screens on iOS/Android tablets
**Customer Accounts** — Order status, full-page, inline, and action extensions

### Multi-Surface Strategy

Single app can span multiple surfaces simultaneously:
- Admin for merchant configuration + webhooks for automation + POS for staff + Checkout for customers

---

## GraphQL Admin API Best Practices

### Rate Limits: Cost-Based Model (NOT Request Count)

**Key difference from REST:** Cost units per second, not requests per second.

```bash
# Debug header to see cost breakdown
Shopify-GraphQL-Cost-Debug: 1
```

**Limits:**
- Standard: 4 cost units/sec (50 cost units/12 sec burst)
- Max single query: Varies by API version (typically 100-2000 cost units)

**Cost calculation:** Each field has cost; total = sum of all fields. Pagination limits scale cost.

### Bulk Operations (RECOMMENDED for Large Datasets)

**New in 2026-01: Up to 5 concurrent bulk operations per shop**

```graphql
# Create bulk operation (no max cost limit, not rate-limited)
mutation {
  bulkOperationRunQuery(query: """
    query {
      products {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  """) {
    bulkOperation {
      id
      status  # CREATED, RUNNING, COMPLETED, FAILED
      createdAt
    }
  }
}

# Poll for status (cheap: ~1 cost)
query {
  node(id: "gid://shopify/BulkOperation/123") {
    ... on BulkOperation {
      status
      objectCount
      fileSize
      url  # Download JSONL when COMPLETED
    }
  }
}
```

**When to use:**
- Fetching/modifying > 100 items
- Avoiding rate limit issues on complex queries
- Batch operations on large datasets

### Query Best Practices

1. **Specify fields explicitly** (avoid overfetching)
2. **Pagination:** Use cursor-based with `first`/`after`
3. **Bulk operations** for large datasets instead of pagination loops
4. **Batch mutations** for bulk updates

---

## Admin Extensions Deep Dive

### Admin Blocks (Inline Cards)

**Placement:** Within resource detail pages (persistent card display)

```toml
type = "admin_block"
targets = ["admin.product-details.block.render", "admin.orders.order-details.block.render"]
name = "My Block"
```

**Characteristics:**
- Read-only display by default
- No parent section property access (beyond `section.id`)
- Use dynamic sources for resource data
- Multiple blocks can stack on same page

### Admin Actions (Modal Workflows)

**Placement:** Triggered from resource pages (transactional workflows)

```toml
type = "admin_action"
targets = ["admin.product-details.action.render", "admin.customers.customer-details.action.render"]
name = "Bulk Update"
```

**Characteristics:**
- Modal-based interaction
- Full action form capabilities
- Access to selected resource data
- Triggered by merchant button click

### Admin Print Actions

Extensions that add print functionality to orders/invoices:

```toml
type = "admin_print_action"
targets = ["admin.orders.order-details.print-action.render"]
```

### Visibility Control (shouldRender)

```typescript
// Conditionally show extension based on context
export function ShouldRender({ context }) {
  // Only show if product has specific attribute
  return context.resource.productType === 'Digital';
}
```

---

## Checkout Extensions Deep Dive

### Checkout UI Targets

```
purchase.checkout.payment-method.render-after
purchase.checkout.delivery-address.render-after
purchase.checkout.shipping-method.render-after
purchase.checkout.contact-information.render-after
purchase.checkout.cart-line-item.render-after  # Per line item
```

### Validation Functions

```typescript
// Run server-side validation in checkout
export async function validateCheckout(input) {
  return {
    valid: true,
    errors: []
  };
}
```

### Delivery & Shipping Customization

```graphql
# Via delivery_customization function
mutation {
  deliveryCustomizationCreate(input: {
    functionId: "gid://shopify/Function/123"
  }) {
    deliveryCustomization { id }
  }
}
```

Customize:
- Hidden delivery methods
- Renamed methods
- Dynamic fees

### Payment Customization Functions

```graphql
mutation {
  paymentCustomizationCreate(input: {
    functionId: "gid://shopify/Function/456"
  }) {
    paymentCustomization { id }
  }
}
```

Control payment option visibility and behavior.

### Shopify Plus Requirements

Checkout extensions require Shopify Plus for full feature access.

---

## Shopify Functions (Wasm-Based)

### Overview

Serverless functions running in Wasm with <10ms timeout.

**Types:**
- `discount_function` — Custom discount logic
- `delivery_customization` — Shipping customization
- `payment_customization` — Payment option control
- `cart_transform` — Cart modification logic
- `validation_function` — Order validation

### Language Options

- **Rust** — Recommended (faster, safer)
- **JavaScript** — Via QuickJS runtime

### Function API Constraints

- **Timeout:** <10ms (strict)
- **Memory:** Limited
- **I/O:** No external API calls (pure computation only)

### Code Pattern (Rust)

```rust
#[shopify_function]
fn discount(input: input::ResponseData) -> Result<output::FunctionResult, String> {
  // Logic here
  Ok(output::FunctionResult {
    discounts: vec![],
    discount_application_strategy: output::DiscountApplicationStrategy::AllDiscounts,
  })
}
```

---

## Theme App Extensions (Storefront)

### App Blocks vs App Embed Blocks

**App Blocks:**
- Merchant adds via theme editor (section-specific)
- Access parent section context via dynamic sources
- Online Store 2.0 themes only
- Active by default after install

**App Embed Blocks:**
- Global page-level (floating, overlay, meta tags)
- NO parent context access
- Vintage + Online Store 2.0 support
- Deactivated by default (merchant activates in Theme Settings)

### Liquid + JavaScript Pattern

```liquid
<!-- blocks/my-block.liquid -->
<div class="app-block" id="block-{{ block.id }}">
  {% assign max_items = block.settings.max_items %}
  <!-- Liquid logic here -->
</div>

{% schema %}
{
  "name": "My Block",
  "target": "section",
  "settings": [
    {
      "type": "range",
      "id": "max_items",
      "min": 1,
      "max": 20,
      "default": 5,
      "label": "Max Items"
    }
  ]
}
{% endschema %}
```

```javascript
// assets/my-block.js — Pure JS, NO frameworks
(function() {
  document.querySelectorAll('.app-block').forEach(function(block) {
    // Load and render content
    fetch('/api/block-data?id=' + block.id)
      .then(r => r.json())
      .then(data => {
        block.innerHTML = renderBlock(data);
      })
      .catch(() => {
        // Fail silently — never break storefront
      });
  });
})();
```

### Key Rules

1. **Pure JS only** — NO React, Vue, or frameworks
2. **< 64KB compressed** — Keep bundle size small
3. **Load async** — Never block storefront rendering
4. **Fail silently** — Errors must not break merchant store
5. **CSS scoped** — Prevent style leaks with class prefixes
6. **Validate origin** — Public API endpoints check Shopify headers

### Stricter Liquid Parsing (Jan 2026+)

Shopify now enforces stricter Liquid syntax validation. Test locally with `shopify app dev`:
- Unclosed tags → deployment failure
- Unknown tags → validation error
- Invalid syntax → clear error messages

---

## Metafields & Metaobjects Deep Dive

### Metafields: App-Owned vs Merchant-Owned

**App-Owned:**
```toml
[product.metafields.app.page_count]
type = "number_integer"
description = "Page count"
```
- Managed by app exclusively
- Namespace: `$app`
- Declared in TOML
- View-only for merchant (unless explicitly enabled)

**Merchant-Owned:**
- Created via Shopify Admin UI
- Custom namespace (2-20 chars)
- Merchant has full control
- App can read/write if scopes permit

### Data Types Reference

```toml
# Text
type = "single_line_text_field"      # ≤ 1000 chars
type = "multi_line_text_field"       # Unlimited

# Numbers
type = "number_integer"              # 64-bit int
type = "number_decimal"              # Float with validation

# Boolean & Date
type = "boolean"                      # true/false
type = "date"                         # ISO 8601 date
type = "date_time"                    # ISO 8601 datetime

# Complex
type = "json"                         # Arbitrary JSON object
type = "joined_string"                # Array as pipe-separated string

# References
type = "product_reference"            # Link to Product
type = "variant_reference"            # Link to ProductVariant
type = "collection_reference"         # Link to Collection
type = "file_reference"               # Link to File
```

### Metaobjects: Standalone Data Types

```toml
[[metaobject_definition]]
name = "Author"
handle = "author"
description = "Blog post author"

  [[metaobject_definition.fields]]
  name = "Name"
  handle = "name"
  type = "single_line_text_field"
  required = true

  [[metaobject_definition.fields]]
  name = "Bio"
  handle = "bio"
  type = "multi_line_text_field"

  # Capabilities
  [metaobject_definition.capabilities.publishable]
  enabled = true

  [metaobject_definition.capabilities.renderable]
  enabled = true

    [metaobject_definition.capabilities.renderable.theme_template]
    handle = "author"

  [metaobject_definition.capabilities.translatable]
  enabled = true
```

**Capabilities:**
- **Publishable:** DRAFT/ACTIVE status support
- **Translatable:** Multi-language support
- **Renderable:** SEO-friendly URLs + theme template
- **Online Store:** Web-accessible pages

### Constraints

- Max 25 definition changes per deploy
- Handle immutable after creation
- Field types immutable (can't change after creation)
- Field deletion unsupported (deprecate instead)

---

## Product Model (3-Tier Hierarchy)

### Structure

```
Product (e.g., T-Shirt)
├── Option 1: Color (Black, White, Red)
├── Option 2: Size (S, M, L, XL)
├── Option 3: Fit (optional, Slim, Regular)
└── Variants (Purchasable SKUs)
    ├── Black / S / Slim
    ├── Black / S / Regular
    ├── Red / M / Slim
    └── ... (combinations)
```

### Limits

| Aspect | Limit |
|--------|-------|
| **Options per Product** | 3 (e.g., Color, Size, Material) |
| **Variants per Product** | 100 by default; 2048 with advanced features |
| **Option Values** | Unlimited (e.g., thousands of sizes) |
| **Variant Combinations** | Limited by min(options × values, 2048) |

### Bundles

**Fixed Bundles (Native):**
- Up to 30 component products
- Up to 3 bundle options
- Standard and Multipack variants

**Customized Bundles (Third-party):**
- Mix-and-match, complex selections
- Can exceed variant limits
- Managed by third-party apps

### Catalogs & Visibility

Products must be published in ≥1 catalog to be visible:

```graphql
# Create catalog
mutation {
  catalogCreate(input: { title: "USA", type: "SHOP" }) {
    catalog { id }
  }
}

# Publish products to catalog
mutation {
  catalogPublish(catalogId: "gid://shopify/Catalog/123", input: {
    products: ["gid://shopify/Product/456"]
  }) {
    publicationIds
  }
}
```

---

## Orders & Fulfillment

### FulfillmentOrder Lifecycle

Shopify auto-creates fulfillment orders; apps manage their status:

```
Order Created → FulfillmentOrder (OPEN)
  → accept → IN_PROGRESS
  → fulfill → CLOSED (fully) or INCOMPLETE (partial)
```

**Statuses:**
- `OPEN` — Ready for fulfillment
- `SCHEDULED` — Future fulfillment date
- `IN_PROGRESS` — Fulfillment work begun
- `CLOSED` — Fully fulfilled or cancelled
- `INCOMPLETE` — Partially fulfilled

### Fulfillment Service Callbacks

Third-party fulfillment services receive webhooks:

1. **Fulfillment Order Notification** (POST) — Shopify notifies of fulfillment request
2. **Fetch Tracking Numbers** (GET) — Shopify queries tracking info
3. **Fetch Stock** (GET) — Shopify queries inventory

### Returns & Inventory

**Returns Apps:**
- Sync return requests between Shopify and system
- Approve/deny returns
- Process refunds
- Restock inventory

**Inventory Apps:**
- Query `inventoryLevels`
- Adjust with `inventoryAdjustmentCreate`
- Manage multi-location inventory
- Trigger reorder logic

---

## Subscriptions & Purchase Options

### Selling Plans Overview

Product-level configuration defining pricing, billing, delivery, and inventory policies:

```toml
[[selling_plans]]
name = "Subscribe & Save - Monthly"
billing_policy = "recurring"
  [selling_plans.billing_policy.recurring_billing_policy]
  interval = 1
  interval_unit = "MONTH"

delivery_policy = "recurring"
  [selling_plans.delivery_policy.recurring_delivery_policy]
  interval = 1
  interval_unit = "MONTH"

pricing_policy = "recurring"
  [[selling_plans.pricing_policy.recurring_pricing_policy.pricing_adjustments]]
  type = "PERCENTAGE"
  value = -10  # 10% discount
```

### Deferred Purchases (Pre-Order / Try Before You Buy)

```graphql
mutation {
  sellingPlanCreate(input: {
    name: "Pre-Order"
    billingPolicy: {
      fixed: {
        chargeOnDate: "2026-07-01"
        checkoutCharge: {
          type: "PERCENTAGE"
          value: 20  # 20% deposit now
        }
      }
    }
  }) {
    sellingPlan { id }
  }
}
```

**Charge options:** No deposit, percentage, fixed amount, or full

### Subscription Contracts

Merchant-customer agreement for recurring purchases:

```
SubscriptionContract
├── Payment Method (stored securely)
├── Lines (products + selling plan)
├── Status (ACTIVE, PAUSED, CANCELLED)
├── Billing Cycles (scheduled charges)
│   ├── Start/End Date
│   ├── BillingAttemptExpectedDate
│   └── Status (PENDING, SUCCEEDED, FAILED)
└── Next Billing Date
```

**Billing Cycle Flow:**
```
Cycle PENDING → App initiates BillingAttempt → Payment processed → SUCCEEDED (order created) or FAILED
```

---

## Customer Accounts Extensions

### Extension Placement

**Full-Page:** Render new page not tied to specific order
- `customer-account.page.render` — Generic page
- `customer-account.order.page.render` — Order-specific page

**Order Actions:** Quick actions from order context
- `customer-account.order.action.menu-item.render` — Action button
- `customer-account.order.action.render` — Action modal

**Inline:** Render UI on order status page
- `customer-account.order-status.*` targets for before/after sections

### Metafield Support

Write metafields to Order, Customer, Company, CompanyLocation (API 2024-07+):

```javascript
// Extension requests metafield namespace
// On order state change, metafields auto-update via Order Status API
```

### Sandbox Security

- Isolated sandbox prevents access to payment info
- No manipulation of customer account HTML/CSS
- Safe customization of customer journey

---

## POS (Point of Sale) Extensions

### Architecture

**Cross-platform native UI** — iOS and Android with identical experience, not web.

```toml
type = "pos_ui_extension"
targets = ["pos.home.tile.render", "pos.product-details.block.render"]
```

### Extension Targets

1. **Tiles** — Smart grid home screen (quick-access tools)
2. **Actions** — Menu items launching modals/screens
3. **Blocks** — Custom sections within existing screens (product details, post-purchase)

### Components

- Remote-dom based (cross-platform)
- Actions, forms, input fields
- Mobile-first design required
- Target-specific APIs vary

---

## Marketing & Analytics

### Web Pixels

JavaScript running in sandbox on storefront, collecting behavioral data:

```javascript
import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser }) => {
  analytics.subscribe('page_viewed', (event) => {
    // Handle event
  });
});
```

**Standard events:** `page_viewed`, `product_viewed`, `product_added_to_cart`, `checkout_*`, `search_submitted`

### Customer Segments

Groups of customers meeting specific criteria (used for targeting):
- Created via query filters
- Fed by web pixel data
- Used in marketing activities

---

## B2B (Shopify Plus Only)

### Company Structure

```
Company
├── CompanyLocation
│   ├── Catalog (which products visible)
│   ├── Price List (pricing adjustments)
│   ├── Payment Terms (Net 30, etc.)
│   └── Contacts
└── ... more locations
```

### Key Patterns

1. **Catalogs:** Assigned per location (controls product visibility)
2. **Price Lists:** Determine displayed prices per location
3. **Payment Terms:** Control checkout payment flow
4. **Quantity Rules:** Min/max/increment per variant for B2B customers
5. **Draft Orders:** Pre-transaction creation for approval workflows

### Custom Pricing (2025-01+)

```graphql
# Create draft order with custom prices
mutation {
  draftOrderCreate(input: {
    customPrices: true,
    lineItems: [
      { variantId: "123", quantity: 5, customPrice: "49.99" }
    ]
  }) {
    draftOrder { id }
  }
}
```

---

## Markets & Internationalization

### Multi-Market Setup

Shopify handles locale/currency/domain automatically:

```
Market 1: en-US, USD, shop.com/
Market 2: fr-CA, CAD, shop.com/fr
Market 3: de-DE, EUR, shop.com/de
```

### App Localization Benefits

- 5-7% lower churn in non-English markets
- Featured prominently in App Store
- Only 5-7% of public apps available in Europe

### Implementation

1. **Externalize strings** — Separate from code
2. **Format values** — Dates, numbers, currency per locale
3. **Translate** — Per-locale translation files
4. **Load dynamically** — Based on market context at runtime

### Presentment Currencies

**Critical:** Don't assume single base currency. Handle presentment currencies:

```graphql
query {
  products(first: 10) {
    edges {
      node {
        variants {
          # Price in market's currency
          price: presentmentPrice { amount currencyCode }
        }
      }
    }
  }
}
```

---

## Flow Extensions

### Triggers & Actions (NOT Conditions)

**Triggers** — App events that start workflows
```toml
[[triggers]]
name = "my_event"
description = "Event triggered by my app"

[triggers.settings]
custom_field = { type = "string" }
product_ref = { type = "reference", resource = "Product" }
```

**Actions** — Tasks executed by workflows
```toml
[[actions]]
name = "my_action"
description = "Action executed by Flow"
endpoint = "https://myapp.com/flow/actions/my_action"

[actions.settings]
target_field = { type = "string" }
```

**Conditions** — ONLY Shopify builds these (developer constraint)

### Common Pattern

```
App event → Trigger webhook → Shopify conditions → Flow action → App endpoint
```

---

## Critical Production Safety Rules

1. **GDPR webhooks mandatory** — `customers/data_request`, `customers/redact`, `shop/redact` even if storing zero data
2. **Session token refresh** — 1-minute expiry; fetch fresh per request via App Bridge
3. **Token secret protection** — Never expose client_secret; environment variables only
4. **Offline token rotation** — Handle refresh token logic (90-day validity)
5. **Rate limits:** Cost-based GraphQL (not request-based); bulk operations bypass limits
6. **Webhook reliability:** Not guaranteed; implement idempotency + reconciliation
7. **Scope minimalism** — Over-requesting = App Store rejection
8. **API version support** — Must not be deprecated within 90 days
9. **Polaris ONLY for admin UI** — No Tailwind, shadcn, or custom CSS
10. **Extension validation** — Each target requires separate testing; POS needs iOS + Android

---

## Shopify Design Phase (Official Rules)

### Polaris Mandatory
- **ALL admin UI must use Polaris** — no Tailwind, shadcn, or custom CSS. App Store reviewers reject non-native apps.
- Use web components: `Page`, `Layout`, `Card`, `Button`, `TextField`, `Modal`, `Banner`, `Toast`, `Table`, `ResourceList`, `EmptyState`, `SkeletonPage`
- Design tokens (colors, spacing, shadows) are pre-defined; never hardcode values

### Navigation Rules
- **App nav:** Sidebar (desktop) / header (mobile). Max 20 chars per item, 7 items before truncation
- **Labels:** Use nouns not verbs, 1-2 words. "Products" not "Manage Products"
- **Tabs:** Secondary nav only; don't wrap lines; don't reposition on navigation
- **Icons:** Gray when inactive, green when active. Recognizable at small sizes

### Layout Types (When to Use Each)
- **Single-column:** Linear workflows, forms, onboarding, setup
- **Full-width:** Index/list pages, data tables, many columns
- **Two-column:** Visual editors, preview + editor split
- **Settings:** App config grouped logically
- **Immersive:** Full-screen focused tasks (removes admin context)

### Onboarding & First-Run
- Brief and direct — show value immediately, not setup screens first
- Setup Guide pattern: interactive checklist with visual progress
- "Built for Shopify" requires concise onboarding (non-negotiable)
- "Complete later" OK for complex setup; don't block workflow

### Empty States
- **Pattern:** Centered content + explanation + primary CTA + optional secondary actions
- Use `slot="primary-action"` for main button. Don't use Lorem Ipsum; leverage store data.

### Loading & Error States
- **Skeleton screens:** Use `SkeletonText`, `SkeletonImage` to prevent layout shift. Render immediately; don't block.
- **Errors:** Red banners for blocking issues (with actionable next steps); toasts only for non-critical updates (max 3 words)
- **Warnings:** Yellow banners for attention-needed items
- **Success:** Green banners only when feedback is delayed, persistent, or has CTA (not for immediate actions)

### Accessibility (WCAG AA Mandatory)
- **Color contrast:** 4.5:1 minimum text-to-background (test all combos)
- **Keyboard nav:** Full Tab/Shift+Tab, Esc closes modals, no custom tabindex beyond 0/-1, logical tab order
- **Focus management:** Move focus to modal on open, return to launcher on close. Visible focus indicators on all interactive elements.
- **Screen readers:** Semantic HTML, descriptive labels, ARIA attributes, form errors linked to fields
- **Headings:** Logical h1-h6 sequence (h1 > h2 > h3, no skips). Single h1 per page.
- **Form:** All inputs have labels, required fields marked, error messages accessible
- **Images:** Alt text for all images. Decorative elements marked as such.
- **Motion:** Respect `prefers-reduced-motion`. No auto-play animations.

### Mobile-First Responsive Design
- **Vertical scroll:** Prioritize vertical stacking; avoid horizontal scroll
- **Touch targets:** Min 44×44px (mobile), 8px spacing between targets
- **Text:** Min 13px headings/body/interactive, 12px captions. 16px common for mobile body text.
- **Polaris Page:** Auto-responsive aside slot. Use Polaris Grid for custom breakpoints.
- **Test:** Mobile (<768px), tablet (768-1024px), desktop (>1024px) on real devices

### Performance Constraints
- **Storefront impact:** Max -10 Lighthouse points (failure = rejection)
- **JS bundle:** <10KB at entry point. Load additional code on interaction.
- **CSS bundle:** <50KB per page. Minimize duplication; use design tokens.
- **Checkout extension:** 64KB compiled bundle limit (hard limit; breach blocks deployment)
- **Network:** Keep responses <1s. Use skeleton screens during loading.
- **Core Web Vitals:** LCP <2.5s, FID <100ms, CLS <0.1

### Content & Microcopy
- **Action verbs:** "Save changes", "Create product", "Delete customer" (not "OK", "Add", "Remove")
- **Button labels:** 1-3 words, clear and specific. Strong verbs.
- **Forms:** Stack vertically. Keep inputs scannable. Inline validation on blur (not keystroke).
- **Global friendly:** Simple words, short sentences (≤15 words), avoid idioms/slang/jargon, active voice
- **Error messages:** Explain in merchant terms, suggest recovery, avoid jargon, be empathetic

### Checkout UI Extensions
- **64 KB bundle limit** (hard enforcement at deployment)
- **Components:** Use Polaris web components. Date, Money, Email, Grid, Stack, Box.
- **Performance:** Response <1s, use skeleton loaders, don't block checkout flow
- **Design:** Match checkout system. Minimal, focused. Don't create unexpected form fields.

### Theme App Extensions
- **Responsive:** Blocks adapt to containing section size. Test mobile, tablet, desktop.
- **Design inheritance:** Blocks inherit theme typography, colors, spacing. Integrate seamlessly.
- **Content sync:** Use autofill resource settings for auto-sync.
- **Header integration:** Provide icon-only + text versions for inline header placement.

### POS Extensions
- **Cross-platform native:** iOS + Android identical experience (not web)
- **Components:** Remote-dom based. Actions, forms, inputs. Mobile-first.
- **Touch targets:** Min 44×44px, 8px spacing (retail/gloved hand use)
- **UI components:** Buttons, tiles, modals match POS design system

### Design Quality Checklist
1. Polaris ONLY for admin UI
2. Keyboard nav fully functional
3. Color contrast 4.5:1 (all combos tested)
4. 64KB checkout bundles max
5. Mobile-first responsive (test real devices)
6. Empty states with CTAs
7. Skeleton loaders prevent layout shift
8. Touch targets ≥44×44px
9. Semantic HTML + ARIA for a11y
10. <10KB JS + <50KB CSS per page

---

## Shopify Launch Phase (Official Rules)

### App Store Requirements (BLOCKING)
- **Partner agreement** — Must comply with Shopify Partner Program Agreement
- **Functional:** Web-accessible; no desktop app requirement
- **Privacy policy:** Mandatory, linked from listing, disclose all data collection
- **Unique name:** Must start with brand name (not generic); match Developer Dashboard + submission form
- **API deprecation:** Cannot use APIs deprecated within 90 days. Supported versions only.
- **Demo store:** Provide dev store link showing app functionality. Allows reviewer testing.
- **Support:** Clear Shopify-specific help docs. In-app context. Keep emergency contact updated.
- **Licensing:** Only duplicate product info merchant has permission for (own, licensed, dropshipped). Agencies/freelancers apps blocked.
- **Theme mods:** Use theme app extensions only. No direct code changes.
- **GDPR webhooks:** Subscribe to + verify `customers/data_request`, `customers/redact`, `shop/redact` before submission (required for ALL apps)
- **API reference only:** No deprecation warnings; only use published APIs

### Built for Shopify Badge
- **Visibility:** Dedicated search filter, higher App Store ranking, priority review queue for future submissions
- **Requirements (all must pass):**
  - Design matches Shopify admin (Polaris components for embedded apps)
  - Checkout: p95 response ≤500ms, 0.1% failure max (min 1000 req/28d). Storefront: max -10 Lighthouse. General: <10KB JS, <50KB CSS
  - Security: OWASP Top 10 protected, token encryption, OAuth secure, proper customer data handling
  - UX: Intuitive, minimal setup, reliable, responsive support, clear value prop
  - Privacy: Full GDPR/CPRA, transparent data processing, proper webhooks, privacy policy linked

### App Store Listing Components
- **Icon:** 1200×1200px JPEG/PNG. Bold colors, simple patterns. No text/Shopify marks. Square corners, padding.
- **Title:** Max 30 chars. Start with brand name (not generic)
- **Short description:** 30-50 char hook. Appears in search results.
- **Long description:** Detailed features/benefits (max 250 words)
- **Screenshots:** 3-5 high-quality images showing key features. Labels recommended.
- **Video:** 15-30 sec demo (optional but increases conversion)
- **Category:** Select primary category. Up to 25 structured features.
- **Demo store:** Direct link showing app in action

### App Review Process
- **Submit:** Via Dev Dashboard. Single submission for all merchants (public) or custom link (private).
- **Review time:** 2-5 business days typical (can vary)
- **Status tracking:** Dashboard shows submission status
- **Common rejections:** GDPR webhooks missing, no privacy policy, uses deprecated APIs, non-Polaris UI, Lighthouse regression >10pts, test store broken
- **Resubmit:** Fix issues, resubmit. No penalties for multiple submissions.
- **Approval:** App automatically live once approved. Appears on App Store immediately.

### Billing Models (Choose One or Hybrid)
- **Subscription:** Monthly/annual recurring charge. Base + variable tiers. Shopify Billing API required.
- **Usage-based:** Pay-as-you-go (per order, per product, per action). Metering required.
- **One-time:** Single purchase (not for recurring charges). App credit packs.
- **Free:** No charge. Monetize via premium features, affiliate, or other.
- **Hybrid:** Subscription base + usage overage. Most common for SaaS.
- **No external payment providers:** Use Shopify Billing API only. Dodo/Stripe/external = rejection.

### Protected Customer Data (Access Prerequisites)
- **Access requirement:** Must have legitimate business reason + customer trust
- **Encryption:** All stored access tokens + sensitive data must be encrypted
- **Data minimization:** Collect only necessary data. Don't store everything.
- **Retention:** Delete data when no longer needed
- **Webhooks:** Respond to `customers/data_request`, `customers/redact`, `shop/redact`

### Privacy & GDPR/CPRA Compliance
- **Privacy policy link:** Mandatory in App Store listing
- **Data collection disclosure:** Clearly state what data collected + why
- **3 mandatory webhooks:** `customers/data_request` (export user data), `customers/redact` (delete user data), `shop/redact` (delete shop data). Even if collecting zero data, must have endpoint.
- **Data processing agreement:** If using third-party vendors, DPA required
- **Retention policy:** Define how long data stored. Delete on schedule.
- **Rights:** Provide way for merchants/customers to access + delete their data
- **CPRA (California):** Additional notices if processing CA resident data

### Security Requirements (Non-Negotiable)
- **OWASP Top 10:** Protect against injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, SSRF, log/monitor weaknesses
- **Tokens:** Store encrypted. Never log. Rotate periodically (90d for offline tokens)
- **Secrets:** Environment variables only. Never hardcode API keys/secrets.
- **OAuth:** Proper implementation. Validate state param. Use PKCE for mobile.
- **Session tokens:** 1-minute expiry. Refresh per request.
- **CSRF:** Implement CSRF tokens for state-changing operations
- **CSP:** Content Security Policy headers set. X-Frame-Options for Shopify embedding.
- **TLS/HTTPS:** All endpoints required
- **Third-party audit:** Evaluate security of APIs/services used

### Distribution Methods
- **Public (App Store):** Available to all merchants. Reviewed. 30% revenue share. Significant reach.
- **Custom (Unlisted):** For one store or Shopify Plus org. Share via link. No review. 0% take by Shopify.
- **Private/Internal:** For single merchant. Custom development.

### Pre-Launch Testing Checklist
- [ ] All core features tested on dev store
- [ ] GDPR webhooks subscribed + verified responding
- [ ] Privacy policy written + linked
- [ ] No APIs deprecated within 90 days
- [ ] Demo store link works + shows app functionality
- [ ] Lighthouse scoring <-10pt impact on storefront pages
- [ ] Mobile responsiveness tested (iOS Safari, Android Chrome)
- [ ] Accessibility tested (keyboard nav, screen reader, color contrast)
- [ ] Security audit: OWASP Top 10 + token encryption
- [ ] Checkout/admin performance: p95 response ≤500ms (checkout)
- [ ] Error handling: All edge cases + network failures
- [ ] Billing (if applicable): Charges work, webhooks confirm payment
- [ ] Rate limiting: Handles quota exhaustion gracefully
- [ ] Documentation: Help docs complete + clear

### App Store SEO & Discovery
- **Keywords:** Include in title/description. Merchants search by problem not solution (e.g. "email marketing" not "email tool")
- **Title impact:** Most important ranking factor. Start with keyword. Examples: "Email Marketing for Shopify", "Inventory Sync for Multichannel"
- **Description:** Secondary keyword use. Features + benefits. 250 words optimal.
- **Category selection:** Accurate primary category + tags. Helps discoverability.
- **Screenshot quality:** Clear, professional images showing key features. Labels drive conversions.
- **Reviews:** Positive reviews boost ranking. Encourage satisfied merchants.
- **Rating:** Higher rating = higher rank. Quality app + support = better ratings.
- **Install velocity:** New installs/week boost ranking. Launch + marketing = visibility.

### Common App Store Submission Rejections
1. GDPR webhooks not subscribed + verified
2. No privacy policy or policy link broken
3. Using deprecated APIs (>90d old)
4. Non-Polaris UI or design quality issues
5. Lighthouse regression >10pts
6. Test/demo store broken or inaccessible
7. External payment provider (Stripe, Dodo, etc. for billing)
8. Hardcoded secrets in code/config
9. Missing support documentation
10. Over-requesting API scopes

### Post-Launch Requirements
- **Monitor:** Uptime, performance, error rates (Sentry/Datadog)
- **Support:** Response time <24h. Merchant satisfaction critical.
- **Updates:** Regular bugfixes + features. Stale apps lose merchant trust.
- **Version management:** Release versions; track merchant deployments
- **Deprecation:** Notify merchants 3-6mo before removing features
- **Security updates:** Patch vulnerabilities immediately; notify merchants
