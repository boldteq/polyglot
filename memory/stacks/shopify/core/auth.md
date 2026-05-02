# Core: Authentication & Authorization

> Source: shopify.dev/docs/apps/build/authentication-authorization
> Last extracted: 2026-04-04

## Token Types Matrix

| Aspect | Offline Access | Online Access | Session Token |
|--------|---|---|---|
| **Use Case** | Service-to-service, webhooks, background jobs | User-initiated ephemeral work | Embedded apps, frontend auth |
| **Lifespan** | 90 days (refreshable) | 24 hours OR user logout | 1 minute (must refresh per request) |
| **Refresh Available** | Yes (90-day validity) | No | No (fetch fresh from App Bridge) |
| **Format** | Bearer token | Bearer token | JWT (HS256 signed) |
| **User Linked** | No (shop-scoped) | Yes (user-scoped) | Yes (session-scoped) |
| **Token Exchange** | Via refresh grant | Not applicable | Not applicable |

## Offline Access Tokens (NEW: Expiring as of Dec 2025)

**Use for:**
- Webhooks (background processing)
- Background jobs (cron, scheduled tasks)
- Service-to-service API calls
- Maintenance operations

**New features (Dec 2025+):**
- 90-day refresh token lifetime
- Access token auto-rotation enabled
- Enhanced security vs. infinite tokens
- Apps continue background ops without user interaction

**Token Exchange Flow:**
```javascript
// 1. Initial authorization code exchange
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
const { access_token, refresh_token } = await response.json();
// Store both tokens securely

// 2. Token refresh (every 90 days)
const refreshResponse = await fetch('https://stores.shopify.com/api/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    refresh_token: storedRefreshToken,
    grant_type: 'refresh_token',
  }),
});
const { access_token: newAccessToken } = await refreshResponse.json();
// Store new access token
```

## Online Access Tokens

**Use for:**
- User-initiated API calls
- Ephemeral operations
- Merchant-specific actions

**Lifespan:** 24 hours OR user logout (whichever comes first)

**Request pattern:**
```javascript
const authUrl = new URL('https://admin.shopify.com/oauth/authorize');
authUrl.searchParams.set('client_id', SHOPIFY_API_KEY);
authUrl.searchParams.set('scope', 'write_products,read_orders');
authUrl.searchParams.set('access_type', 'online');  // EXPLICIT: online access
authUrl.searchParams.set('state', generateRandomState());
window.location.href = authUrl.toString();
```

## Session Tokens (for Embedded Apps)

**Format:** JWT (JSON Web Token) with HS256 signature

**Structure:**
```
<header>.<payload>.<signature>
```

All three sections are base64-encoded.

**Payload contains:**
- `exp`: UNIX timestamp of expiry (1 minute from creation)
- `iss`: Token issuer (Shopify)
- `sub`: Subject (merchant shop information)
- `aud`: Audience claim

**Key rules:**
1. **Lifetime:** 1 minute (must fetch fresh per request)
2. **Signing:** HS256, signed with app shared secret
3. **Verification:** Extract `exp` from payload, verify future datetime
4. **Refresh:** Must use App Bridge to fetch fresh token on EACH request
5. **Embedded only:** Only for apps embedded in Shopify admin

**Fetch pattern (React + App Bridge):**
```typescript
import { useAppBridge } from '@shopify/app-bridge-react';

function MyComponent() {
  const app = useAppBridge();

  const fetchData = async () => {
    // Fetch fresh session token (1-minute expiry)
    const sessionToken = await app.getSessionToken();

    // Use token for API calls
    const response = await fetch('/api/protected', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  };

  return <button onClick={fetchData}>Load Data</button>;
}
```

## Token Acquisition Methods

### Method 1: Token Exchange (RECOMMENDED for Embedded Apps)

- Exchange session token for short-lived access token
- No redirect required
- Faster than authorization code grant
- Managed by `@shopify/shopify-app-remix`

**Flow:**
1. App Bridge fetches session token (1-minute expiry)
2. Session token sent to backend `/token-exchange` endpoint
3. Backend exchanges for access token via GraphQL mutation
4. Backend returns access token to frontend

### Method 2: Authorization Code Grant (Required for Non-Embedded)

- OAuth 2.0 authorization code grant flow
- Requires redirect to Shopify authorization endpoint
- Merchant grants permission
- Used by CLI, scripts, external services

**Flow:**
1. App redirects merchant to `https://admin.shopify.com/oauth/authorize`
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
authUrl.searchParams.set('state', generateRandomState());  // CSRF protection
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
  // Store access_token and refresh_token
});
```

### Method 3: Client Credentials Grant (Service Apps)

**Use case:** Apps for own organization (no merchant interaction required)

**Requirement:** Custom app, not public App Store

**Credentials:**
- `client_id`: App identifier
- `client_secret`: App secret (KEEP PRIVATE)

**Token request:**
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

**CRITICAL:** Never expose client_secret in frontend code or git history.

## Access Scopes

**Definition in shopify.app.toml:**
```toml
scopes = "write_products,read_products,write_orders,read_orders"
```

**Rules:**
1. **Merchant prompt:** When app is installed, merchant sees permission grant dialog
2. **Guarantee:** After installation, app has all requested scopes
3. **Scope updates:** Changing scopes requires merchant re-authorization
4. **Minimal principle:** Request ONLY scopes your app needs
5. **Over-requesting penalty:** App Store rejection for excessive scopes

**Common scopes:**
- `write_products`, `read_products`
- `write_orders`, `read_orders`
- `write_customers`, `read_customers`
- `write_inventory`, `read_inventory`
- `write_fulfillments`, `read_fulfillments`
- `write_webhooks`, `read_webhooks`

## Session Token Verification (Backend)

When receiving a session token from frontend, verify before processing:

```typescript
import crypto from 'crypto';

function verifySessionToken(token: string): boolean {
  try {
    // Split JWT
    const [headerB64, payloadB64, signatureB64] = token.split('.');

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64').toString('utf-8')
    );

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return false; // Token expired
    }

    // Verify signature (HS256 with app shared secret)
    const message = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return signatureB64 === expectedSignature;
  } catch (error) {
    return false;
  }
}
```

## Pitfalls

- **Reusing expired tokens** — Session tokens must be fetched fresh per request (1-min expiry)
- **Hardcoding credentials** — Use env vars ONLY for API key/secret
- **Storing session tokens** — Never cache; fetch fresh from App Bridge
- **Over-scoping** — Request minimal scopes; over-requesting causes App Store rejection
- **Cookie-based auth** — Use session tokens ONLY, never cookies
