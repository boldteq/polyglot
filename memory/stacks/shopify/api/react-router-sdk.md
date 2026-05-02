# Shopify App React Router SDK API Reference

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest](https://shopify.dev/docs/api/shopify-app-react-router/latest)
**Framework:** React Router 6 with TypeScript
**Version:** Latest (2026-01)
**Last Updated:** 2026-04-04

---

## Overview

The `@shopify/shopify-app-react-router` package enables React Router apps to authenticate with Shopify and make API calls. It abstracts webhook validation, session management, billing, and CORS handling for embedded and non-embedded distributions.

**Key Features:**
- Built-in authentication for admin and public routes
- Session management (Prisma, MongoDB, Redis backends available)
- Billing helpers (recurring subscriptions, one-time charges)
- Webhook handling with signature validation
- App Bridge integration
- CORS header management
- TypeScript-first design

---

## Core Configuration

### `shopifyApp()` Function

The main entry point that initializes your Shopify app with all configuration options.

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/entrypoints/shopifyapp](https://shopify.dev/docs/api/shopify-app-react-router/latest/entrypoints/shopifyapp)

```typescript
import { shopifyApp } from '@shopify/shopify-app-react-router';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecret: process.env.SHOPIFY_API_SECRET,
  appUrl: process.env.SHOPIFY_APP_URL,
  scopes: ['write_products', 'read_customers'],
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: 'app', // or 'merchant_custom_app', 'sales_channel'
  webhooks: {
    APP_UNINSTALLED: '/webhooks',
    ORDERS_UPDATED: '/webhooks',
  },
  billing: {
    // See Billing section below
  },
  logger: {
    level: 'INFO',
  },
});

export default shopify;
```

**Configuration Options:**

| Option | Type | Required | Notes |
|--------|------|----------|-------|
| `apiKey` | string | Yes | Shopify app API key from env vars |
| `apiSecret` | string | Yes | Shopify app secret from env vars |
| `appUrl` | string | Yes | App installation URL (production: https://...) |
| `scopes` | string[] | Yes | GraphQL Admin API scopes requested by app |
| `sessionStorage` | SessionStorage | Yes | Backend for storing sessions (Prisma/MongoDB/Redis) |
| `distribution` | 'app' \| 'merchant_custom_app' \| 'sales_channel' | Yes | Distribution type affects auth flow |
| `webhooks` | Record<string, string> | No | Topic → route mapping for subscribed webhooks |
| `billing` | BillingConfig | No | Plan and credit pack definitions (see Billing section) |
| `logger` | LoggerConfig | No | Logging level and custom logger |
| `future` | FutureFlags | No | Experimental features (rarely used) |

---

## Authentication Routes

### `authenticate.admin(request)`

Authenticates requests from the Shopify admin (embedded and non-embedded apps). Returns session context, admin API client, CORS helper, and redirect function.

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/admin](https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/admin)

```typescript
import { useLoaderData } from 'react-router-dom';

// Loader function
export const loader = async ({ request }) => {
  const { admin, session, billing, cors, redirect } = await authenticate.admin(request);

  // Check for active subscription
  const hasActivePlan = await admin.graphql(`
    query {
      appInstallation {
        activeSubscriptions { id }
      }
    }
  `);

  return { hasActivePlan };
};

// Component
export default function Dashboard() {
  const { hasActivePlan } = useLoaderData();
  return <div>Plan Active: {hasActivePlan ? 'Yes' : 'No'}</div>;
}
```

**Return Object Shape:**

```typescript
{
  // Session info
  session: {
    shop: string;           // e.g., "mystore.myshopify.com"
    accessToken: string;    // OAuth access token
    state?: string;         // CSRF protection state
  };

  // Admin API GraphQL client
  admin: {
    graphql: (query: string, variables?: object) => Promise<GraphQLResponse>;
    rest: {
      get(path: string): Promise<any>;
      post(path: string, body: any): Promise<any>;
      put(path: string, body: any): Promise<any>;
      delete(path: string): Promise<any>;
    };
  };

  // Billing helpers (if configured)
  billing: {
    require: () => Promise<AppSubscription>;
    request: (plan: string) => Promise<void>;
    cancel: (id: string) => Promise<void>;
  };

  // CORS helper for cross-origin responses
  cors: (response: Response) => Response;

  // Redirect for auth flow (embedded apps only)
  redirect: (url: string) => Response;

  // For merchant custom apps (non-embedded)
  // No session tokens or redirect
}
```

**Key Points:**
- If no session exists, the function performs OAuth token exchange and creates one
- Merchant custom apps return plain admin context (no session tokens)
- Embedded apps return session, session tokens, and redirect function
- Always use this in loaders/actions before accessing protected data
- The `cors()` helper must be used when returning responses accessed by extensions from another domain

---

### `authenticate.webhook(request)`

Validates and authenticates webhook requests from Shopify. Must be called in a route action.

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/guide-webhooks](https://shopify.dev/docs/api/shopify-app-react-router/latest/guide-webhooks)

```typescript
// routes/webhooks.tsx
export const action = async ({ request }) => {
  if (request.method !== 'POST') {
    return { status: 405 };
  }

  const { topic, shop, payload, webhookId } = await authenticate.webhook(request);

  if (topic === 'APP_UNINSTALLED') {
    // Delete shop data, revoke access token, etc.
    await deleteShopData(shop);
  } else if (topic === 'ORDERS_UPDATED') {
    // Process order update
    await syncOrderData(shop, payload);
  }

  // MUST respond with 200 OK immediately
  return new Response(null, { status: 200 });
};
```

**Return Object Shape:**

```typescript
{
  topic: string;              // e.g., "orders/updated", "app/uninstalled"
  shop: string;               // Shop domain
  payload: Record<string, any>; // Webhook event data
  webhookId: string;          // Unique webhook event ID for deduplication
}
```

**Webhook Best Practices:**
- Return HTTP 200 immediately (don't process in request handler)
- Use `webhookId` to detect and skip duplicate deliveries
- Offload long-running tasks to background jobs (queues, cron, etc.)
- Subscribe to topics in `shopifyApp()` config or via `webhookSubscriptionCreate` GraphQL mutation
- Shopify retries failed webhooks (HTTP non-200) for 48 hours

---

### `authenticate.public(request)`

For public routes without authentication (landing pages, public webhooks, etc.).

```typescript
export const action = async ({ request }) => {
  const { shop } = await authenticate.public(request);
  // No session, just shop domain
};
```

---

### `authenticate.unauthenticated.admin(request)`

Access admin context without session validation (for 3rd party integrations, background tasks).

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/unauthenticated/unauthenticated-admin](https://shopify.dev/docs/api/shopify-app-react-router/latest/unauthenticated/unauthenticated-admin)

```typescript
const { admin } = await authenticate.unauthenticated.admin(request);
// Returns admin GraphQL/REST client without session validation
// Use for webhook actions, background jobs
```

**Warning:** No user validation; do not rely on request user input directly.

---

### `authenticate.unauthenticated.storefront(request)`

Offline access to Storefront GraphQL API (for syncing product data, catalog operations).

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/unauthenticated/unauthenticated-storefront](https://shopify.dev/docs/api/shopify-app-react-router/latest/unauthenticated/unauthenticated-storefront)

```typescript
const { storefront } = await authenticate.unauthenticated.storefront(request);
// Returns Storefront API client (offline access token)
// Use for public product queries
```

---

## Session Storage

### Prisma Session Storage (Default)

The template comes with Prisma session storage by default.

**Installation:**
```bash
npm install @shopify/shopify-app-session-storage-prisma
```

**Schema:**
```prisma
// prisma/schema.prisma
datasource db {
  provider = "sqlite" // or "postgresql"
  url      = env("DATABASE_URL")
}

model Session {
  id        String  @primary
  shop      String
  state     String
  isOnline  Boolean @default(true)
  accessToken String
  scope     String
  expiresAt DateTime?
  userId    String?

  @@unique([shop, state])
  @@index([shop])
}
```

**Usage:**
```typescript
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const shopify = shopifyApp({
  sessionStorage: new PrismaSessionStorage(prisma),
  // ... other config
});
```

### Other Session Backends

Shopify provides session storage implementations for:
- **MongoDB:** `@shopify/shopify-app-session-storage-mongodb`
- **Redis:** `@shopify/shopify-app-session-storage-redis`
- **Kv:** `@shopify/shopify-app-session-storage-kv` (Cloudflare)
- **SQLite:** Built-in via Prisma

---

## Billing Configuration

### Subscription Plans

Time-based recurring billing for standard SaaS models.

**Configuration:**
```typescript
const shopify = shopifyApp({
  billing: {
    'basic': {
      amount: 9.99,
      currencyCode: 'USD',
      interval: 'EVERY_30_DAYS',
      lineItems: [
        { quantity: 1 }
      ]
    },
    'pro': {
      amount: 29.99,
      currencyCode: 'USD',
      interval: 'EVERY_30_DAYS',
      lineItems: [
        { quantity: 1 }
      ],
      trialDays: 7, // Free trial period
    }
  }
});
```

### Usage-Based Billing

Charge based on consumption during billing cycle.

```typescript
{
  'usage_plan': {
    amount: 0, // Base amount
    currencyCode: 'USD',
    interval: 'EVERY_30_DAYS',
    lineItems: [
      {
        quantity: null, // Dynamic usage
        pricing: {
          percentageMarkup: {
            percentageValue: 10
          }
        },
        recurringPricing: {
          recurringPrice: {
            amount: 0.01, // $0.01 per unit
          }
        }
      }
    ]
  }
}
```

### Billing Helpers in Loaders/Actions

```typescript
export const loader = async ({ request }) => {
  const { admin, billing } = await authenticate.admin(request);

  // Require active subscription before allowing access
  try {
    const subscription = await billing.require();
    // User has active plan
  } catch (err) {
    // Redirect to plan selection
    return billing.redirect(request, 'choose-plan');
  }

  return { data: 'protected' };
};
```

**Billing Methods:**
- `billing.require()` - Check for active payment; redirects if none
- `billing.request(planKey)` - Request plan change; returns confirmation URL
- `billing.cancel(subscriptionId)` - Cancel active subscription

---

## CORS Headers and Boundaries

### Returning CORS-Safe Responses

When your app endpoint is accessed by extensions or other cross-origin requests:

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/admin](https://shopify.dev/docs/api/shopify-app-react-router/latest/authenticate/admin)

```typescript
export const action = async ({ request }) => {
  const { admin, cors } = await authenticate.admin(request);

  // Do work...
  const response = new Response(JSON.stringify({ data: 'result' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  // Wrap with CORS helper
  return cors(response);
};
```

The `cors()` helper automatically adds:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Shopify-Access-Token`

### Error Boundaries

Use the ErrorBoundary export to catch thrown responses:

```typescript
import { ErrorBoundary } from '@shopify/shopify-app-react-router';

export const errorBoundary = (error) => {
  return <ErrorBoundary error={error} />;
};

export const headers = (headersArgs) => {
  return headersArgs.loaderHeaders;
};
```

---

## App Bridge Integration

### AppProvider Component

Initializes App Bridge and embeds the app in the admin.

**Source:** [https://shopify.dev/docs/api/shopify-app-react-router/latest/entrypoints/appprovider](https://shopify.dev/docs/api/shopify-app-react-router/latest/entrypoints/appprovider)

```typescript
import { AppProvider } from '@shopify/shopify-app-react-router';
import { BrowserRouter } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider isEmbeddedApp apiKey={import.meta.env.VITE_API_KEY}>
        <Routes>
          <Route path="/app" element={<Dashboard />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
```

**Props:**
- `isEmbeddedApp: boolean` - true for embedded, false for standalone
- `apiKey: string` - Shopify app API key
- `router: object` - Optional custom router config for React Router

---

## Loaders and Actions Pattern

### Layout Routes for Shared Authentication

Wrap multiple routes under a layout route to authenticate them once:

```typescript
// routes/app.tsx (layout)
export const loader = async ({ request }) => {
  const { session, admin, cors } = await authenticate.admin(request);
  return { shop: session.shop, admin };
};

export default function AppLayout() {
  return <Outlet />;
}

// routes/app.dashboard.tsx (child)
export const loader = async ({ request }) => {
  const { data } = useLoaderData(); // From parent loader
  return { dashboard: data };
};
```

### Action Pattern for Mutations

```typescript
export const action = async ({ request, params }) => {
  if (request.method === 'POST') {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const result = await admin.graphql(`
      mutation CreateProduct($title: String!) {
        productCreate(input: { title: $title }) {
          product { id }
          userErrors { message }
        }
      }
    `, {
      variables: { title: formData.get('title') }
    });

    return { success: true, data: result };
  }
};
```

---

## Common Patterns

### Polling for Async Operations

```typescript
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Start bulk operation
  const bulkOp = await admin.graphql(`
    mutation {
      bulkOperationRunQuery(query: "...") {
        bulkOperation { id }
      }
    }
  `);

  const operationId = bulkOp.data.bulkOperationRunQuery.bulkOperation.id;

  // Poll for completion (client-side)
  return { operationId };
};
```

### Handling Redirects

Embedded apps may need to redirect outside the admin:

```typescript
export const action = async ({ request }) => {
  const { redirect } = await authenticate.admin(request);

  if (someCondition) {
    return redirect('https://example.com/callback');
  }

  return { ok: true };
};
```

---

## Pitfalls & Common Mistakes

1. **Not calling `authenticate.admin()` in loaders** — Always authenticate before accessing admin resources
2. **Forgetting `cors()` wrapper** — CORS errors occur when extensions can't access your endpoints
3. **Long-running webhook processing** — Always return 200 immediately; use background jobs for heavy work
4. **Session storage misconfiguration** — Verify Prisma schema and env vars before deployment
5. **Not handling billing errors** — `billing.require()` throws on missing payment; wrap in try-catch
6. **App Bridge not initialized** — Ensure `AppProvider` wraps your router and `isEmbeddedApp` is set correctly

---

## Related Resources

- [Building a React Router Shopify App](https://shopify.dev/docs/apps/build/build?framework=reactRouter)
- [Admin API Guide](https://shopify.dev/docs/api/shopify-app-react-router/latest/guide-admin)
- [Webhook Guide](https://shopify.dev/docs/api/shopify-app-react-router/latest/guide-webhooks)
- [Billing Guide](https://shopify.dev/docs/apps/launch/billing)
- [App Bridge React Documentation](https://shopify.dev/docs/api/app-bridge/previous-versions/app-bridge-from-npm/using-react)
