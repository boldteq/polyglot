# Shopify Webhooks API — Complete Reference

**Source:** [shopify.dev/docs/api/webhooks/2026-01](https://shopify.dev/docs/api/webhooks/2026-01)
**Version:** 2026-01
**Updated:** 2026-04-04

---

## Overview

Webhooks are near-real-time notifications from Shopify to your app when specific events occur on a shop. Instead of polling, subscribe to webhook topics and receive HTTP POST requests containing event data.

**Key characteristics:**
- HTTP POST requests to your endpoint
- Base64-encoded HMAC-SHA256 verification header
- Automatic retries with exponential backoff (8 times over 4 hours)
- 5-second response timeout
- HTTPS required for production
- Webhook header names are case-insensitive
- Raw body required for HMAC verification

---

## Configuration Methods

### 1. TOML Configuration (Shopify CLI v3.63.0+)

Define webhooks in `shopify.app.toml`:

```toml
[webhooks]
api_version = "2026-01"

[[webhooks.subscriptions]]
topics = [ "products/update", "products/delete" ]
uri = "/webhooks/products"
include_fields = [ "id", "title", "variants" ]

[[webhooks.subscriptions]]
topics = [ "orders/create", "orders/update" ]
uri = "/webhooks/orders"

# Compliance webhooks (MANDATORY for App Store apps)
[[webhooks.subscriptions]]
compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
uri = "/webhooks/compliance"
```

**Options:**
- `topics`: Array of topic strings to subscribe to
- `uri`: Endpoint path (becomes `https://[your-app-domain]/webhooks/[path]`)
- `include_fields`: Fields to include in webhook payload (reduces payload size)
- `compliance_topics`: Mandatory GDPR topics (alternative to topics field)

### 2. GraphQL Admin API

For programmatic subscription management:

```graphql
mutation {
  webhookSubscriptionCreate(topic: PRODUCTS_UPDATE, webhookSubscription: {
    uri: "https://example.com/webhooks/products",
    includeFields: ["id", "title"]
  }) {
    webhookSubscription {
      id
      topic
      endpoint {
        __typename
        ... on WebhookHttpEndpoint {
          uri
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### 3. Alternative Delivery Methods

**Google Pub/Sub (pubSubWebhookSubscriptionCreate):**
- URI format: `pubsub://{project-id}:{topic-id}`
- Use when integrating with Google Cloud

**Amazon EventBridge (eventBridgeWebhookSubscriptionCreate):**
- URI format: EventBridge partner event source ARN
- Use when integrating with AWS EventBridge

---

## Webhook Topics

### App Events
- `app/installed` — App installed on store
- `app/uninstalled` — App uninstalled from store
- `app/scopes_update` — App scopes updated

### Cart & Checkout
- `cart/create` — Cart created
- `cart/update` — Cart updated
- `checkout/create` — Checkout created
- `checkout/delete` — Checkout deleted
- `checkout/update` — Checkout updated

### Collection Events
- `collection/create` — Collection created
- `collection/delete` — Collection deleted
- `collection/update` — Collection updated

### Customer Events
- `customers/create` — Customer created
- `customers/delete` — Customer deleted
- `customers/disable` — Customer disabled
- `customers/enable` — Customer enabled
- `customers/update` — Customer profile updated

### Discount & Promotion
- `discount_codes/create` — Discount code created
- `discount_codes/update` — Discount code updated
- `discounts/create` — Discount created
- `discounts/delete` — Discount deleted
- `discounts/update` — Discount updated

### Draft Order
- `draft_orders/create` — Draft order created
- `draft_orders/delete` — Draft order deleted
- `draft_orders/update` — Draft order updated

### Fulfillment
- `fulfillments/create` — Fulfillment created
- `fulfillments/update` — Fulfillment updated
- `fulfillment_events/create` — Fulfillment event created
- `fulfillment_events/delete` — Fulfillment event deleted

### Inventory
- `inventory_items/create` — Inventory item created
- `inventory_items/delete` — Inventory item deleted
- `inventory_items/update` — Inventory item updated
- `inventory_levels/connect` — Inventory level connected
- `inventory_levels/disconnect` — Inventory level disconnected
- `inventory_levels/update` — Inventory level updated

### Order Events
- `orders/cancelled` — Order cancelled
- `orders/create` — Order created
- `orders/delete` — Order deleted
- `orders/edited` — Order edited
- `orders/fulfilled` — Order fulfilled
- `orders/paid` — Order marked as paid
- `orders/partially_fulfilled` — Order partially fulfilled
- `orders/unreviewed_fulfillment` — Fulfillment not reviewed
- `orders/update` — Order updated

### Product Events
- `products/create` — Product created
- `products/delete` — Product deleted
- `products/update` — Product updated

### Refund Events
- `refunds/create` — Refund created
- `refunds/update` — Refund updated

### Shop Events
- `shop/app_closed` — App closed
- `shop/app_reopened` — App reopened
- `shop/update` — Shop settings updated

### Subscription Events
- `subscription_contracts/create` — Subscription contract created
- `subscription_contracts/delete` — Subscription contract deleted
- `subscription_contracts/expire` — Subscription contract expired
- `subscription_contracts/pause` — Subscription contract paused
- `subscription_contracts/update` — Subscription contract updated

### Theme Events
- `themes/create` — Theme created
- `themes/delete` — Theme deleted
- `themes/publish` — Theme published
- `themes/update` — Theme updated

### Mandatory Compliance Topics (GDPR)
- `customers/data_request` — Customer requests their data
- `customers/redact` — Request to redact customer/order data
- `shop/redact` — Request to redact shop data after uninstall

---

## Webhook Payload Format

### Headers

Every webhook request includes these headers:

```
X-Shopify-Topic: orders/create
X-Shopify-Hmac-SHA256: [base64-encoded HMAC signature]
X-Shopify-Shop-Id: [shop-id]
X-Shopify-Shop-Domain: [shop-domain]
X-Shopify-Webhook-Id: [unique-webhook-id]
X-Shopify-API-Version: 2026-01
Content-Type: application/json
```

**Important:** Header names are case-insensitive. Always handle variations like `x-shopify-topic`, `X-shopify-topic`, etc.

### Body

JSON payload with event data. Example order/create webhook:

```json
{
  "id": 123456789,
  "email": "customer@example.com",
  "created_at": "2026-04-04T12:00:00Z",
  "updated_at": "2026-04-04T12:00:00Z",
  "total_price": "99.99",
  "currency": "USD",
  "line_items": [
    {
      "id": 987654321,
      "variant_id": 456789,
      "title": "Product Name",
      "quantity": 1,
      "price": "99.99"
    }
  ]
}
```

---

## HMAC Verification

### Process

1. Get the `X-Shopify-Hmac-SHA256` header (base64-encoded)
2. Get raw request body as string (before JSON parsing)
3. Compute HMAC-SHA256 using raw body and app's client secret as key
4. Base64-encode the computed hash
5. Compare with the header value (constant-time comparison)

### Node.js Example

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(req) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const rawBody = req.rawBody; // Capture before body parsing middleware
  const secret = process.env.SHOPIFY_API_SECRET;

  // Compute HMAC
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(hmacHeader)
  );
}
```

### Express Middleware (Raw Body Required)

```javascript
import bodyParser from 'body-parser';

// Parse JSON BUT capture raw body for HMAC verification
app.post('/webhooks/:topic',
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }),
  (req, res) => {
    if (!verifyWebhookSignature(req)) {
      return res.status(401).send('Unauthorized');
    }

    const topic = req.headers['x-shopify-topic'];
    const payload = req.body;

    // Process webhook
    console.log(`Received ${topic}:`, payload);
    res.status(200).send('OK');
  }
);
```

---

## Webhook Filtering & Customization

### Sub-Topics

For some topics, filter by sub-topic (API 2024-01+):

```graphql
mutation {
  webhookSubscriptionCreate(topic: PRODUCTS_UPDATE, webhookSubscription: {
    uri: "https://example.com/webhooks/products",
    subTopics: [ "variants_inventory", "variants_prices" ]
  }) {
    webhookSubscription { id }
  }
}
```

Available sub-topics depend on main topic. Example: products/update has `variants_inventory`, `variants_prices`, `variants`, `metafields`.

### Metafield Namespaces

Include specific metafields in webhook payloads:

```toml
[[webhooks.subscriptions]]
topics = [ "products/update" ]
uri = "/webhooks/products"
metafield_namespaces = [ "my_namespace", "another_namespace" ]
```

Or via GraphQL:

```graphql
mutation {
  webhookSubscriptionCreate(topic: PRODUCTS_UPDATE, webhookSubscription: {
    uri: "https://example.com/webhooks/products",
    metafieldNamespaces: [ "my_namespace" ]
  }) {
    webhookSubscription { id }
  }
}
```

### Event Filtering

Use Shopify API search syntax to filter events:

```graphql
mutation {
  webhookSubscriptionCreate(topic: PRODUCTS_UPDATE, webhookSubscription: {
    uri: "https://example.com/webhooks/products",
    filter: "variants.price >= 10.00"
  }) {
    webhookSubscription { id }
  }
}
```

Example filters:
- `variants.price >= 10.00` — Only products with variants ≥ $10
- `vendor:Nike` — Only products from Nike vendor
- `collection:Summer` — Only products in Summer collection

---

## Delivery Guarantees & Retry Logic

### Retry Schedule

If webhook fails (timeout, 4xx/5xx, no response):

1. **Retry 1:** ~5 seconds
2. **Retry 2:** ~30 seconds
3. **Retry 3:** ~2 minutes
4. **Retry 4:** ~5 minutes
5. **Retry 5:** ~15 minutes
6. **Retry 6:** ~30 minutes
7. **Retry 7:** ~1 hour
8. **Retry 8:** ~2 hours

**Total window:** 4 hours from initial attempt

### Failure Handling

- **After 8 failed deliveries:** Webhook subscription is removed automatically
- **Consecutive failures:** If 8 consecutive failures occur, subscription deleted (CLI-configured only)
- **Endpoint changes:** Updating subscription URI during retry cycle does NOT deliver to new address
- **Payload:** Retries use original payload from time event triggered, not current state

### Timeout

Shopify waits **5 seconds** for HTTP 2xx response. Exceeded = immediate retry.

### Best Practices

1. **Return 2xx quickly** — Process async
2. **Queue heavy work** — Use background jobs
3. **Idempotent handlers** — Webhook can arrive multiple times
4. **Log all webhooks** — Track delivery for debugging
5. **Monitor failure rate** — Alert on high failure % to prevent auto-deletion

---

## Mandatory Compliance Webhooks (GDPR)

**Required for App Store apps, regardless of data collection.**

### customers/data_request

Triggered when customer requests their data. App has **30 days** to respond.

```json
{
  "shop_id": "123456789",
  "shop_domain": "myshop.myshopify.com",
  "orders_requested": [
    { "id": "order-123", "line_items": [{ "product_id": "prod-456" }] }
  ],
  "customer": {
    "id": "cust-789",
    "email": "customer@example.com",
    "phone": "+1-555-0000"
  }
}
```

**Response Format:**
```json
{
  "data_request": {
    "id": "request-id-from-webhook",
    "request_data": [
      {
        "resource": "Product",
        "fields": [
          { "name": "id", "value": "123" },
          { "name": "title", "value": "Sample Product" }
        ]
      }
    ]
  }
}
```

### customers/redact

Triggered for data deletion/redaction. App has **30 days**.

```json
{
  "shop_id": "123456789",
  "shop_domain": "myshop.myshopify.com",
  "customer": {
    "id": "cust-789",
    "email": "customer@example.com",
    "phone": "+1-555-0000"
  },
  "orders_to_redact": [ "order-123", "order-456" ]
}
```

### shop/redact

Triggered **48 hours after app uninstall**. App has **30 days** to erase all shop data.

```json
{
  "shop_id": "123456789",
  "shop_domain": "myshop.myshopify.com"
}
```

**Response:** Confirm with HTTP 200. If failing, retry policy applies.

---

## Common Pitfalls

1. **Body parsing before HMAC verification** — Use middleware with `verify` option to capture raw body
2. **Case-sensitive header names** — Always use `.get()` or check all variations
3. **Not returning 2xx quickly** — Shopify retries after 5 seconds idle
4. **Ignoring HMAC verification** — Always verify to prevent spoofed webhooks
5. **Assuming one webhook per event** — Duplicates possible; make handlers idempotent
6. **Missing compliance webhooks** — App Store rejection risk
7. **Hardcoding endpoint URLs** — Use environment variables
8. **Not logging webhook payloads** — Critical for debugging

---

## Sources

- [Shopify Webhooks API 2026-01](https://shopify.dev/docs/api/webhooks/2026-01)
- [About Webhooks](https://shopify.dev/docs/apps/build/webhooks)
- [Subscribe to Webhook Topics](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started)
- [Deliver Webhooks Through HTTPS](https://shopify.dev/docs/apps/build/webhooks/subscribe/https)
- [Privacy Law Compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Troubleshooting Webhooks](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks)
- [Webhook Filtering](https://shopify.dev/docs/apps/build/webhooks/customize/filters)
- [Webhook Sub-Topics](https://shopify.dev/docs/apps/webhooks/sub-topics)
