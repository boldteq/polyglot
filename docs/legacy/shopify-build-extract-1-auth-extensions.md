# Shopify Build Phase: Authentication, Extensions, and Configuration
## Extracted Technical Patterns from shopify.dev Documentation

**Last Updated:** April 4, 2026
**Coverage:** Scaffold, App Structure, Authentication & Authorization, App Extensions, App Surfaces, GraphQL Best Practices

---

## 1. Scaffolding & App Templates

### Recommended Scaffold Method

Use Shopify CLI to scaffold new apps:

```bash
shopify app init [--flavor=reactRouter|remix|node|ruby]
```

### Available Templates

| Template | Framework | Package | Status | Recommendation |
|----------|-----------|---------|--------|-----------------|
| **React Router** | React 18 | `@shopify/shopify-app-react-router` | Actively maintained | ✓ Recommended for new apps |
| **Remix** | Remix | `@shopify/shopify-app-remix` | Actively maintained | Legacy migration path available |
| **Node** | Express-like | Native Node.js | Available | Backend-only |
| **Ruby** | Rails | Native Ruby | Available | Backend-only |
| **Custom** | Any | GitHub repository | Flexible | With `--template` flag |

### Key Template Features

- **@shopify/shopify-app-react-router:**
  - Enables authentication with Shopify
  - Handles API calls via `@shopify/shopify-app-react-router` SDK
  - Integrates App Bridge for admin embedding
  - React Router 6 for client-side routing
  - Default dev port: 8080

- **@shopify/shopify-app-remix:**
  - Full-stack React Framework
  - Server components support
  - Built-in API route handling
  - App Bridge integration

**Source:** [Scaffold an app](https://shopify.dev/docs/apps/build/scaffold-app), [Build a Shopify app using React Router](https://shopify.dev/docs/apps/build/build?framework=remix)

---

## 2. App Structure & Configuration Files

### Standard Directory Structure

```
my-app/
├── shopify.app.toml              # PRIMARY: app-level config & metadata
├── shopify.web.toml              # Backend web server config (optional for multi-process)
├── .env                          # Environment variables
├── extensions/                   # App extensions (optional)
│   ├── app-extension-1/
│   │   └── shopify.extension.toml
│   └── app-extension-2/
│       └── shopify.extension.toml
├── web/                          # Web backend (optional)
│   ├── package.json
│   └── shopify.web.toml          # If multi-process setup
├── app/ (React Router) or        # Frontend code
│   └── routes/
├── src/                          # Frontend code (alternative)
├── prisma/                       # Database models (Prisma)
│   └── schema.prisma
└── public/                       # Static assets
```

### Configuration Files

#### **shopify.app.toml** (MANDATORY)

Primary app configuration file. Auto-updated by `shopify app dev` and `shopify app config link`.

**Required Fields:**
```toml
scopes = "write_products,read_products,write_orders"  # Comma-separated API access scopes
```

**Common Fields:**
```toml
name = "My App"
client_id = "..."          # Set by Shopify after linking
api_secret_key = "..."     # Set by Shopify after linking (keep private!)
type = "public|custom"     # public for App Store, custom for merchant stores
handle = "my-app"          # Unique app handle
webhooks.api_version = "2024-01"  # Must be supported version (not deprecated within 90 days)

# Webhook subscriptions
[webhooks]
api_version = "2024-01"
[[webhooks.subscriptions]]
topics = ["orders/create", "products/update"]
uri = "https://myapp.example.com/webhooks/orders"

# Billing configuration (if monetized)
[pos]
embedded = true            # For POS apps

# Optional: extension configuration reference
[build]
include_config_on_deploy = ["shopify.extension.toml"]
```

#### **shopify.web.toml** (OPTIONAL)

Required only for multi-process setups (backend and frontend on separate processes).

**Sample:**
```toml
type = "frontend|backend"
commands.dev = "npm run dev"
commands.build = "npm run build"
port = 3000                # Or other port
```

### Multiple App Configuration

Use pattern: `shopify.app.{config-name}.toml` to link project to multiple Shopify apps:

```bash
shopify app dev --config-name=staging
shopify app dev --config-name=production
```

Each configuration maintains separate linking state.

**Source:** [App structure](https://shopify.dev/docs/apps/build/cli-for-apps/app-structure), [App configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration), [Manage app config files](https://shopify.dev/docs/apps/build/cli-for-apps/manage-app-config-files)

---

## 3. Authentication & Authorization

### 3.1 Token Types & Selection Matrix

| Aspect | Offline Access | Online Access | Session Token |
|--------|----------------|---------------|---------------|
| **Use Case** | Service-to-service, webhooks, background jobs | User-initiated, ephemeral work | Embedded apps, frontend auth |
| **Lifespan** | 90 days (refreshable) | 24 hours OR user logout | 1 minute (must refresh per request) |
| **Refresh Token** | Yes (90-day validity) | No | No (fetch fresh from App Bridge) |
| **Format** | Bearer token | Bearer token | JWT (HS256 signed) |
| **User Linked** | No | Yes (tied to specific user) | Yes (tied to session) |
| **Token Exchange** | Only via refresh | Not applicable | Not applicable |

### 3.2 Offline Access Tokens (NEW: Expiring Tokens as of Dec 2025)

**Recommended for:**
- Webhooks
- Background jobs
- Maintenance tasks
- Service-to-service requests

**New Expiring Token Features (Dec 2025+):**
- 90-day refresh token lifetime
- Access token auto-rotation enabled
- Enhanced security through token rotation
- Apps continue background operations without user interaction

**Implementation Pattern:**
```javascript
// Initial token exchange (one-time)
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

// Token refresh (every 90 days)
const refreshResponse = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    refresh_token: storedRefreshToken,
    grant_type: 'refresh_token',
  }),
});
```

### 3.3 Online Access Tokens

**Recommended for:**
- User-initiated API calls
- Ephemeral operations
- Merchant-specific actions

**Lifespan:** 24 hours OR user logout (whichever comes first)

**Note:** Online access must be explicitly requested in authorization scope.

**Implementation:**
```javascript
// Token request includes "online" mode
const params = new URLSearchParams({
  client_id: process.env.SHOPIFY_API_KEY,
  scope: 'write_products,read_orders',
  redirect_uri: process.env.REDIRECT_URI,
  state: generateRandomState(),
  access_type: 'online',  // EXPLICIT: online access request
});
```

### 3.4 Session Tokens (for Embedded Apps)

**Format:** JWT (JSON Web Token) with HS256 signature

**Structure:**
```
<header>.<payload>.<signature>
```

All three sections are base64-encoded.

**Payload Contains:**
- `exp`: UNIX timestamp of expiry (1 minute from creation)
- `iss`: Token issuer (Shopify)
- `sub`: Subject (merchant shop information)
- `aud`: Audience claim

**Key Rules:**
1. **Lifetime:** 1 minute (must fetch fresh per request from App Bridge)
2. **Signing:** HS256 algorithm, signed with app shared secret
3. **Verification:** Extract `exp` from payload, verify future datetime in UNIX format
4. **Refresh:** Must use App Bridge to fetch fresh token on each request
5. **Embedded Only:** Only for apps embedded in Shopify admin

**Fetch Pattern (React with App Bridge):**
```javascript
import { useAppBridge } from '@shopify/app-bridge-react';

function MyComponent() {
  const app = useAppBridge();

  // Fetch fresh session token on each request
  const sessionToken = await app.getSessionToken();

  // Use token for API calls (1-minute expiry)
  const response = await fetch('/api/protected', {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
}
```

**Source:** [About session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens), [Set up session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/set-up-session-tokens), [About offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens), [About online access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/online-access-tokens)

### 3.5 Token Acquisition Methods

#### Method 1: Token Exchange (RECOMMENDED for Embedded Apps)

- Used by embedded apps
- Exchanges session token for short-lived access token
- No redirect required
- Faster than authorization code grant

**Flow:**
1. App Bridge fetches session token (1-minute expiry)
2. Session token sent to backend `/token-exchange` endpoint
3. Backend exchanges for access token via GraphQL mutation
4. Backend returns access token to frontend

#### Method 2: Authorization Code Grant (Required for Non-Embedded)

- Used by non-embedded apps (CLI, scripts, external services)
- OAuth 2.0 authorization code grant flow
- Requires redirect to Shopify authorization endpoint
- Merchant grants permission

**Flow:**
1. App redirects merchant to: `https://admin.shopify.com/oauth/authorize`
2. Merchant logs in and grants scopes
3. Shopify redirects back with `code` parameter
4. App exchanges `code` for access token

**Implementation:**
```javascript
// 1. Redirect to authorization endpoint
const authUrl = new URL('https://admin.shopify.com/oauth/authorize');
authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
authUrl.searchParams.set('scope', 'write_products,read_orders');
authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
authUrl.searchParams.set('state', generateRandomState()); // CSRF protection
window.location.href = authUrl.toString();

// 2. Callback handler exchanges code for token
app.get('/auth/callback', async (req, res) => {
  const { code, shop, state } = req.query;

  // Verify state parameter matches stored state
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
  // Store access_token and refresh_token as needed
});
```

**Source:** [Exchange a session token for an access token](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange), [Implement authorization code grant manually](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)

### 3.6 Managing Access Scopes

**Definition in shopify.app.toml:**
```toml
scopes = "write_products,read_products,write_orders,read_orders"
```

**Rules:**
1. **Merchant Prompt:** When app is installed, merchant sees permission grant dialog for all defined scopes
2. **Guarantee:** After installation, app is guaranteed to have all requested scopes
3. **Scope Updates:** Changing scopes in TOML requires merchant re-authorization
4. **Minimal Principle:** Request only scopes your app actually needs
5. **Over-Requesting Penalty:** App Store rejection for excessive scope requests

**Common Scopes:**
- `write_products`, `read_products`
- `write_orders`, `read_orders`
- `write_customers`, `read_customers`
- `write_inventory`, `read_inventory`
- `write_fulfillments`, `read_fulfillments`
- `write_webhooks`, `read_webhooks`

**Source:** [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes), [Manage access scopes](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation/manage-access-scopes)

### 3.7 Client Credentials Grant (Service Apps)

**Use Case:** Apps for own organization (no merchant interaction required), service-to-service auth

**Requirement:** Build for own use, not public App Store

**Credentials:**
- `client_id`: App identifier
- `client_secret`: App secret (KEEP PRIVATE - never expose in frontend)

**Do Not Expose Client Secret:**
- Never commit to git
- Never include in frontend code
- Use environment variables only

**Token Request:**
```javascript
const response = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'write_products,read_orders',
  }),
});

const { access_token, expires_in } = await response.json();
```

**Source:** [Using the client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant), [About client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets)

---

## 4. App Extensions

### 4.1 What Are App Extensions?

**Definition:** Features that surface your app's functionality directly in Shopify user interfaces at points where merchants need it.

**Key Characteristics:**
- Add functionality to Shopify UIs (admin, checkout, storefront, POS)
- Extension-only apps don't require a web server
- Configured via `shopify.extension.toml` files
- Managed via Shopify CLI: `shopify app generate extension`

### 4.2 Extension-Only Apps

**Requirements:**
- Must be custom apps (not public App Store apps)
- No web server required
- Extensions handle all functionality
- Defined entirely via TOML configuration

**Benefits:**
- Simpler deployment
- No backend maintenance
- Focused scope (single responsibility)

**Limitations:**
- Cannot make backend API calls (no server)
- Limited to extension capabilities
- No custom business logic execution

**Use Cases:**
- Theme customizations
- Checkout UI modifications
- Admin block displays
- Function extensions (delivery customizations, payment customizations, discounts)

**Source:** [Build an extension-only app](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app)

### 4.3 Extension Configuration

#### File Structure
```
extensions/
├── my-extension-1/
│   ├── shopify.extension.toml
│   ├── src/
│   │   ├── index.ts|jsx
│   │   └── ...
│   └── package.json
├── my-extension-2/
│   └── shopify.extension.toml
```

#### shopify.extension.toml (MANDATORY per extension)

Generated automatically via: `shopify app generate extension`

**Sample Configuration:**
```toml
type = "admin_block|theme|checkout|function"  # Extension type
targets = ["admin.product-details.block.render"]  # Where to surface
name = "My Product Details Extension"
description = "Adds custom block to product page"

# Example for checkout extension
type = "checkout_ui_extension"
targets = ["purchase.checkout.delivery-address.render-after"]

# Example for theme extension
type = "theme"
```

**Key Fields:**
- `type`: Extension category (see list below)
- `targets`: Where extension renders (specific UI locations)
- `name`: Display name in admin
- `description`: Brief explanation

### 4.4 App Extension Types

**Admin Extensions:**
- `admin_block`: Card-like blocks on resource pages (products, orders, customers)
- `admin_action`: Modal workflows on resource pages (transactional)
- `admin_ui_extension`: Full custom components on admin pages

**Storefront Extensions:**
- `theme`: Theme customizations (merchants add via theme editor without code)
- `checkout_ui_extension`: Custom checkout behavior and UI

**Function Extensions:**
- `delivery_customization`: Customize delivery methods (hide, rename, fees)
- `payment_customization`: Customize payment options
- `discount_function`: Create custom discount logic

**POS Extensions:**
- `pos_ui_extension`: Custom screens and smart grid customizations

**Other:**
- `marketing_activity_extension`: Marketing automation hooks

**Source:** [App extensions](https://shopify.dev/docs/apps/build/app-extensions), [List of app extensions](https://shopify.dev/docs/apps/build/app-extensions/list-of-app-extensions)

---

## 5. App Surfaces

### 5.1 Definition

**Surface:** Any location or interface where an app can display functionality within Shopify ecosystem.

**Key Concept:** A single app can surface functionality across multiple surfaces simultaneously.

### 5.2 Admin Surfaces

#### App Home (PRIMARY)
- The main surface where apps open
- Sidebar link in Shopify admin
- Default entry point for merchant interaction
- Contains your app's primary UI

#### Admin UI Extensions
- Embed directly on resource detail pages (products, orders, customers, inventory, etc.)
- Display as blocks or custom components
- Contextual to the page data
- Enable in-place workflows without navigation

#### Admin Actions
- Powered by UI extensions
- Display as modals
- Transactional workflows
- Appear on products, customers, orders pages
- Enable app interaction without leaving the resource page

#### Admin Blocks
- Card-like persistent displays on resource pages
- Show relevant information contextually
- Non-interactive display focused
- Multiple blocks can exist on same page

### 5.3 Non-Admin Surfaces

#### Checkout
- Customer-facing during purchase
- Custom UI elements via `checkout_ui_extension`
- Backend logic via `payment_customization` or `delivery_customization` functions
- Modify checkout experience

#### Online Store (Storefront)
- Theme app extensions (`theme` type)
- Merchants add elements via theme editor (no code)
- Dynamic elements without Liquid editing
- Storefronts and product pages

#### Shopify Point of Sale (POS)
- Custom app functionality at defined POS points
- Smart grid customizations
- Cart screen extensions
- Post-purchase screens
- Mobile/tablet POS devices

### 5.4 Surface Selection Strategy

Choose surfaces based on user needs:

| Need | Surface(s) | Extension Type |
|------|-----------|-----------------|
| Merchant configures products | Admin Home + Product Details | `admin_ui_extension`, `admin_block` |
| Transactional actions on orders | Orders page with modals | `admin_action`, `admin_ui_extension` |
| Customers customize checkout | Checkout | `checkout_ui_extension` |
| Storefront content | Theme editor | `theme` extension |
| Business logic (discounts) | Backend | `discount_function` |

**Source:** [App surfaces](https://shopify.dev/docs/apps/build/app-surfaces), [Apps in admin](https://shopify.dev/docs/apps/build/admin)

---

## 6. GraphQL Best Practices

### 6.1 Rate Limits & Cost Model

**Model:** Query cost-based (not request count-based)

**Cost Calculation:**
- Each field has a cost value
- Total query cost = sum of all field costs
- Costs scale based on complexity and pagination limits
- DIFFERENT FROM REST API (REST uses request count)

**Debug Endpoint Costs:**
```bash
# Include this header to get detailed cost breakdown
Shopify-GraphQL-Cost-Debug: 1
```

**Limits:**
- Standard: 4 cost units per second (50 cost units per 12 seconds)
- Burst: Temporary spikes allowed, then throttled
- Max single query cost: Varies by API version (typically 100-2000 cost units)

**Cost Breakdown Example:**
```graphql
# This query might cost:
# - products query: 10 cost
# - first(50): +5 cost
# - productType: +1 cost per node
# - images: +2 cost per product
# Total: ~150 cost for 50 products with images
query {
  products(first: 50) {
    edges {
      node {
        id
        title
        productType
        images(first: 5) {
          edges { node { src } }
        }
      }
    }
  }
}
```

### 6.2 Bulk Operations (RECOMMENDED for Large Datasets)

**Key Advantage:** Bulk operations bypass normal rate limits and max cost limits.

**Characteristics:**
- No max cost limit on query execution
- Not subject to rate limiting
- Support up to 5 concurrent bulk operations per shop (API v2026-01+)
- Only the operation polling/cancel requests count as normal API calls (low cost)
- Asynchronous processing
- Results available via webhook or polling

**Use Bulk When:**
- Fetching/modifying > 100 items
- Complex queries on large datasets
- Batch operations needed

**Avoid Single Queries When:**
- Processing thousands of records
- Performance is critical
- Cost efficiency matters

**Bulk Operation Pattern:**
```graphql
# Create bulk operation
mutation {
  bulkOperationRunQuery(query: """
    query {
      products {
        edges {
          node {
            id
            title
            handle
            productType
          }
        }
      }
    }
  """) {
    bulkOperation {
      id
      status  # CREATED -> RUNNING -> COMPLETED/FAILED
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
      url          # Download JSONL results when COMPLETED
      errors {
        message
        code
      }
    }
  }
}

# Results are in JSONL format (one JSON object per line)
```

**Concurrent Bulk Operations (API v2026-01+):**
```
Max: 5 bulk query operations per shop
Enables processing multiple large datasets simultaneously
```

### 6.3 REST to GraphQL Migration

**GraphQL Advantages:**
- Single request fetches exactly needed data
- No overfetching
- Strong typing
- Calculated cost model
- Bulk operations for large datasets

**Migration Pattern:**
```
REST: GET /products.json?fields=id,title,handle → Query cost: REST rate limits
GraphQL: query { products { id, title, handle } } → Cost units: 5-50 (calculated)
```

**When to Use GraphQL:**
- Preferably always (most efficient)
- Explicitly recommended for new apps
- Old REST API deprecated on slow timeline

### 6.4 Query Best Practices

**1. Specify Fields Explicitly:**
```graphql
# ✓ Good: Only fetch needed fields
query {
  products(first: 10) {
    edges {
      node {
        id
        title
      }
    }
  }
}

# ✗ Bad: Fetching entire fragment (costs more)
query {
  products(first: 10) {
    edges {
      node {
        ... all fields
      }
    }
  }
}
```

**2. Pagination Strategy:**
```graphql
# ✓ Use cursor-based pagination with first/after
query {
  products(first: 50, after: "cursor123") {
    pageInfo { hasNextPage, endCursor }
    edges { node { id } }
  }
}
```

**3. Use Bulk for Large Operations:**
```graphql
# ✓ Bulk operation for 1000s of items
mutation {
  bulkOperationRunQuery(query: """
    query { products { edges { node { id, title } } } }
  """) { bulkOperation { id } }
}

# ✗ Not recommended: Pagination loop for 1000s of items
```

**4. Batch Updates When Possible:**
```graphql
# ✓ Use bulk mutation for bulk updates
mutation {
  bulkOperationRunMutation(query: """
    mutation {
      productUpdate(input: { id: $id, title: $title }) {
        product { id }
      }
    }
  """) { bulkOperation { id } }
}
```

**Source:** [Shopify API limits](https://shopify.dev/docs/api/usage/limits), [Perform bulk operations with the GraphQL Admin API](https://shopify.dev/docs/api/usage/bulk-operations/queries), [Bulk import data with the GraphQL Admin API](https://shopify.dev/docs/api/usage/bulk-operations/imports)

---

## 7. Critical Safety Rules (Shopify Apps)

### 7.1 MANDATORY for App Store Approval

1. **GDPR Webhooks Required:**
   - `customers/data_request` → User data export
   - `customers/redact` → User data deletion
   - `shop/redact` → App data removal
   - Must be implemented even if app stores no user data

2. **Billing via Shopify Only:**
   - Use Shopify Billing API ONLY
   - Never external payment processors (no Dodo, Stripe, etc. for app charges)
   - Merchant billing flows: `@shopify/shopify-app-remix` billing helpers

3. **HTTPS/SSL Mandatory:**
   - All endpoints HTTPS only
   - No HTTP in production

4. **Session Token Security:**
   - Verify JWT signature using app shared secret (HS256)
   - Check `exp` expiry timestamp
   - Fetch fresh token per request (1-minute expiry)

5. **Access Scope Minimalism:**
   - Request only required scopes
   - Over-requesting = App Store rejection
   - Document why each scope is needed

6. **API Version Support:**
   - Must use supported API version (not deprecated within 90 days)
   - `webhooks.api_version` in shopify.app.toml
   - Plan migrations ahead of deprecation

7. **Client Secret Protection:**
   - Never expose in frontend code
   - Never commit to git unencrypted
   - Environment variables only
   - Use for offline token refresh and client credentials grant only

### 7.2 Quality & Performance

8. **No Lighthouse Regression:**
   - App must not reduce Lighthouse scores by > 10 points
   - Tested on embedded app embedded contexts

9. **Content Security Policy (CSP):**
   - Set correct `frame-ancestors` for Shopify embedding
   - Prevent clickjacking

10. **Error Handling:**
    - Graceful degradation if API fails
    - User-facing error messages (no raw error dumps)
    - Retry logic with exponential backoff for rate limits

---

## 8. Configuration Checklist (shopify.app.toml)

**Required fields:**
- [ ] `scopes` - API access scopes (comma-separated)
- [ ] `name` - App display name

**Webhook subscriptions:**
- [ ] `webhooks.api_version` - Supported GraphQL API version
- [ ] `webhooks.subscriptions` - Topics array if webhooks needed

**Billing (if monetized):**
- [ ] `billing` object with plans
- [ ] Dodo product IDs mapped

**Extensions:**
- [ ] Each extension gets `shopify.extension.toml`

**Environment:**
- [ ] SHOPIFY_API_KEY (from Shopify Partner Dashboard)
- [ ] SHOPIFY_API_SECRET (keep private!)
- [ ] HOST URL for callbacks

---

## Sources

- [Scaffold an app](https://shopify.dev/docs/apps/build/scaffold-app)
- [Build a Shopify app using React Router](https://shopify.dev/docs/apps/build/build?framework=remix)
- [Shopify App package for React Router](https://shopify.dev/docs/api/shopify-app-react-router/latest)
- [App structure](https://shopify.dev/docs/apps/build/cli-for-apps/app-structure)
- [App configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)
- [About offline access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens)
- [About online access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/online-access-tokens)
- [About session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens)
- [Set up session tokens](https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/set-up-session-tokens)
- [Exchange a session token for an access token](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange)
- [Implement authorization code grant manually](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant)
- [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- [Manage access scopes](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation/manage-access-scopes)
- [Using the client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant)
- [About client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets)
- [App extensions](https://shopify.dev/docs/apps/build/app-extensions)
- [Build an extension-only app](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app)
- [List of app extensions](https://shopify.dev/docs/apps/build/app-extensions/list-of-app-extensions)
- [Configure app extensions](https://shopify.dev/docs/apps/build/app-extensions/configure-app-extensions)
- [App surfaces](https://shopify.dev/docs/apps/build/app-surfaces)
- [Apps in admin](https://shopify.dev/docs/apps/build/admin)
- [Shopify API limits](https://shopify.dev/docs/api/usage/limits)
- [Perform bulk operations with the GraphQL Admin API](https://shopify.dev/docs/api/usage/bulk-operations/queries)
- [Bulk import data with the GraphQL Admin API](https://shopify.dev/docs/api/usage/bulk-operations/imports)
