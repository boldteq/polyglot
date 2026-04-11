# Build: Webhooks

> Source: shopify.dev/docs/apps/build/webhooks
> Last extracted: 2026-04-04

## Configuration Methods

### Method 1: TOML Declaration (Recommended)

Define subscriptions in `shopify.app.toml` at build time. Auto-registered on deploy.

```toml
# Standard webhooks
[[webhooks.subscriptions]]
topic = "orders/create"
uri = "https://myapp.com/webhooks/orders"

[[webhooks.subscriptions]]
topic = "products/update"
uri = "https://myapp.com/webhooks/products"

# GDPR webhooks (customers/data_request, customers/redact, shop/redact)
# are NOT registered in TOML — they are configured in Shopify Partner Dashboard > App setup > Privacy.
# Adding them here causes deploy error: "The following topic is invalid"
# See: GDPR Compliance Webhooks section below for details.

# API version and filter
[[webhooks.subscriptions]]
topic = "orders/paid"
uri = "https://myapp.com/webhooks/orders"
api_version = "2024-10"
filter = "fulfillmentOrders.status:OPEN"  # Conditional delivery
```

**Benefits:**
- Version-controlled with app code
- Guaranteed consistency across all installs
- Auto-subscribed on deploy

### Method 2: GraphQL Mutation (Programmatic)

Create subscriptions at runtime.

```graphql
mutation {
  webhookSubscriptionCreate(topic: ORDERS_CREATE, webhookSubscription: {
    format: JSON
    callbackUrl: "https://myapp.com/webhooks/orders"
  }) {
    webhookSubscription { id }
    userErrors { field message }
  }
}
```

**Use cases:**
- Dynamic subscription logic based on config
- Conditional webhook setup

## GDPR Compliance Webhooks (MANDATORY)

Every app MUST respond to data subject requests — required even if app stores NO user data.

**CRITICAL REGISTRATION NOTE (Pinzo, 2026-04-03):**
GDPR webhooks are NOT registered in `shopify.app.toml`. They are configured in:
**Shopify Partner Dashboard > App > Configuration > Privacy**

Adding `customers/data_request`, `customers/redact`, or `shop/redact` topics to TOML
causes `shopify app deploy` to fail with: "The following topic is invalid".

Create route handler files but do NOT add these topics to TOML webhook subscriptions.
Add a comment in TOML documenting where they are configured instead.

| Topic | Trigger | Required Action | Registration |
|-------|---------|-----------------|--------------|
| `customers/data_request` | Merchant receives GDPR data request | Export all customer PII held by app | Partner Dashboard |
| `customers/redact` | Customer requests deletion | Delete all customer data from systems | Partner Dashboard |
| `shop/redact` | Merchant uninstalls app or deletes account | Delete all shop data from systems | Partner Dashboard |

**Handler pattern:**
```typescript
export async function handleDataRequest(shop_id: string, customer_id: string) {
  const customerData = await db.query(
    'SELECT * FROM customers WHERE shop_id = ? AND customer_id = ?',
    [shop_id, customer_id]
  );
  return JSON.stringify(customerData);
}

export async function handleCustomerRedact(shop_id: string, customer_id: string) {
  await db.run(
    'DELETE FROM customers WHERE shop_id = ? AND customer_id = ?',
    [shop_id, customer_id]
  );
}

export async function handleShopRedact(shop_id: string) {
  await db.run('DELETE FROM shop_data WHERE shop_id = ?', [shop_id]);
}
```

## Delivery Guarantees & Retry Behavior

**Delivery is NOT guaranteed.** Shopify makes best-effort attempts but may fail silently.

**Retry mechanism:**
- Up to 8 retries over 4 hours (exponential backoff)
- If 8 consecutive failures occur, subscription auto-deleted
- No confirmation after retries exhausted

**Consequence:** Implement idempotency + reconciliation patterns.

## Idempotency Pattern

**Prevent duplicate webhook processing:**

```typescript
// Header: X-Shopify-Event-Id uniquely identifies each event
const eventId = request.headers['x-shopify-event-id'];
const triggeredAt = request.headers['x-shopify-triggered-at'];

// Check if already processed
const isDuplicate = await redis.exists(`webhook:${eventId}`);
if (isDuplicate) return 200;  // Idempotent: ignore duplicate

// Process webhook
await handleWebhook(payload);

// Cache event ID (1 hour to match Shopify's retention)
await redis.setex(`webhook:${eventId}`, 3600, '1');
```

## Reconciliation Pattern

Since webhooks are not guaranteed, implement periodic reconciliation:

```typescript
// Every 6 hours, fetch orders from Shopify and compare to local DB
async function reconcileOrders() {
  const shopifyOrders = await shopifyAPI.query(`
    query {
      orders(first: 250) {
        edges { node { id } }
      }
    }
  `);

  const localOrders = await db.query('SELECT shopify_id FROM orders');
  const localIds = new Set(localOrders.map(o => o.shopify_id));

  // Find missing orders (webhook failed)
  const missing = shopifyOrders.filter(
    o => !localIds.has(o.id)
  );

  // Sync missing orders
  for (const order of missing) {
    await syncOrder(order);
  }
}
```

## Webhook Authentication

**Verify webhook authenticity via HMAC:**

```typescript
import crypto from 'crypto';

function verifyWebhook(req: Request): boolean {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = req.rawBody;  // MUST be raw buffer, not parsed JSON

  const computed = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(hmac, computed);
}
```

## Event Topics

### Order Events
```
orders/create           # Order placed
orders/updated          # Order modified
orders/paid             # Order payment received
orders/cancelled        # Order cancelled
orders/fulfilled        # Order fully fulfilled
orders/partially_fulfilled
orders/deleted
```

### Product Events
```
products/create
products/update
products/delete
product_publications/create    # Published to channel
product_publications/delete
```

### Collection Events
```
collections/create
collections/update
collections/delete
```

### Customer Events
```
customers/create
customers/update
customers/delete
customers/data_request         # GDPR [MANDATORY]
customers/redact               # GDPR [MANDATORY]
```

### Fulfillment Events
```
fulfillments/create
fulfillment_orders/open
fulfillment_orders/in_progress
fulfillment_orders/closed
fulfillment_orders/scheduled
```

### Shop Events
```
shop/redact                     # GDPR [MANDATORY]
app/uninstalled
```

## Webhook Handler Best Practices

### 1. Queue Pattern

Don't process synchronously. Return 200 immediately.

```typescript
app.post('/webhooks/orders', async (req, res) => {
  // Verify webhook
  if (!verifyWebhook(req)) return res.status(401).send('Unauthorized');

  const webhook = req.body;

  // Queue asynchronously
  await messageQueue.enqueue({
    type: 'order_created',
    payload: webhook,
  });

  // Return immediately (before processing)
  res.status(200).send('OK');
});

// Worker processes queue asynchronously
async function processOrderQueue() {
  const job = await messageQueue.dequeue();
  await syncOrderToDatabase(job.payload);
}
```

**Benefit:** Avoids timeout (Shopify waits ~5 seconds) and retry loops.

### 2. Idempotency Pattern

```typescript
async function processWebhook(eventId: string, payload: any) {
  // Check if already processed
  const processed = await cache.get(`processed:${eventId}`);
  if (processed) return;

  // Process
  await handleWebhook(payload);

  // Mark as processed (24+ hours)
  await cache.set(`processed:${eventId}`, true, { ttl: 86400 });
}
```

### 3. Exponential Backoff for External Calls

```typescript
async function callExternalAPI(
  url: string,
  data: any,
  maxRetries: number = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (response.ok) return await response.json();
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 4. Event Sourcing

Store raw webhook payload before processing (supports replay).

```typescript
async function processWebhook(req: Request, res: Response) {
  const payload = req.body;
  const eventId = req.headers['x-shopify-event-id'];

  // Store original payload
  await db.insert('webhook_events', {
    event_id: eventId,
    topic: req.headers['x-shopify-topic'],
    payload: JSON.stringify(payload),
    created_at: new Date(),
  });

  // Process
  await handleWebhook(payload);
  res.status(200).send('OK');
}
```

## Monitoring & Alerts

- Track delivery success rate (target: > 99%)
- Alert on subscription deletion (8 failed retries)
- Monitor handler latency
- Set up dead-letter queue for failed attempts
