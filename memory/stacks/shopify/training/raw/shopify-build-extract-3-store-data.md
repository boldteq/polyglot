# Shopify Build Phase: Store Data & Extensions — Technical Patterns

**Last Updated:** April 4, 2026
**Focus:** Apps in Online Store, Custom Data (Metafields/Metaobjects), Product Merchandising, Orders & Fulfillment, Purchase Options, Webhooks

---

## 1. Apps in Online Store: Theme App Extensions

### Overview

Theme app extensions allow merchants to integrate app functionality directly into themes without touching Liquid code. They provide two integration methods: **app blocks** (section-specific) and **app embed blocks** (page-level global).

### Key Rules & Constraints

1. **App Store Requirement**: Every new app submitted to Shopify App Store must use theme app extensions (not deprecated ScriptTag API)
2. **Automatic Theme Editor Integration**: Extensions automatically expose in theme editor with visual editing capabilities
3. **Checkout Exclusion**: App blocks and app embed blocks cannot be rendered on checkout pages (Contact Info, Shipping, Payment, Order Status)
4. **Limited Parent Access**: Theme app extensions cannot access parent section properties except `section.id`
5. **Stricter Liquid Parsing**: As of January 13, 2026, Shopify enforces stricter Liquid parsing for improved code quality

### Architecture: App Blocks vs App Embed Blocks

| Aspect | App Blocks | App Embed Blocks |
|--------|-----------|-----------------|
| **Placement** | Within sections/theme blocks (via `@app` type in schema) | Global page-level (floating, overlaid, or metadata) |
| **Theme Support** | Online Store 2.0 themes only | Vintage + Online Store 2.0 themes |
| **Parent Access** | Access to parent section Liquid object | Only global Liquid scope (no dynamic sources) |
| **Dynamic Sources** | Supported via ancestor resources | Not supported |
| **Activation** | Active by default after install | Deactivated by default; merchants activate via Theme Settings > App embeds |
| **Use Cases** | Positioned content blocks (reviews, price plugins, 3D models) | Chat widgets, image badges, analytics pixels, tracking tags, meta tags |
| **Rendering** | `{% content_for 'blocks' %}` Liquid tag | Global script injection |

### Block Structure & Schema

#### Liquid Template (Block File)

```liquid
<div class="my-app-block">
  {%- for product in collection.products limit: block.settings.max_items -%}
    <div>{{ product.title }}</div>
  {%- endfor -%}
</div>

{% schema %}
{
  "name": "My App Block",
  "target": "section",
  "settings": [
    {
      "type": "range",
      "id": "max_items",
      "min": 1,
      "max": 20,
      "default": 5,
      "label": "Max Items"
    },
    {
      "type": "product",
      "id": "product",
      "label": "Select Product"
    }
  ]
}
{% endschema %}
```

#### Dynamic Sources in Block Settings

Use `@app` block type in parent section schema to support app blocks:

```json
{
  "name": "Collection Showcase",
  "blocks": [
    {
      "type": "@app"
    }
  ]
}
```

Nested blocks access ancestor resources using the `closest` pattern:

```liquid
{%- for product in collection.products -%}
  {% content_for 'blocks' %}
  {%- endfor -%}
```

Nested blocks access via: `{{ closest.product }}`

### Data Model Patterns

1. **Block Settings**: Exposed via `block.settings.<key>` in Liquid
2. **Section Context**: Access parent via `section.id` only
3. **Resource Resolution**: Use `closest.<resource_type>` to find nearest ancestor resource (product, collection, blog, page)
4. **Dynamic Source Data**: Merchants connect via theme editor; accessible in block settings

### Configuration Requirements (TOML / shopify.app.toml)

```toml
[[extension]]
name = "my-app-block"
type = "theme"
handle = "my_app_block"

[[extension.blocks]]
handle = "my_block"
name = "My Block"
target = "section"
```

### Common Pitfalls

1. **Section Property Access**: Cannot access parent section properties beyond `id`—use dynamic sources for resource data
2. **Checkout Integration**: App blocks won't render on checkout—use Checkout UI Extensions instead
3. **Schema `type: @app` Required**: Parent sections must explicitly include `{ "type": "@app" }` in blocks array
4. **Liquid Syntax Strictness**: Invalid Liquid syntax (unclosed tags, unknown tags) will cause deployment failures—use `shopify app dev` to test
5. **App Embed Default State**: App embed blocks are inactive by default; merchants must opt-in
6. **Ghost Code Risk**: Removing app blocks leaves ghost code unless merchants manually delete instances (mitigated by theme app extensions' cleaner uninstall)

---

## 2. Custom Data: Metafields & Metaobjects

### Overview

**Metafields** add single-value custom fields to existing Shopify resources (products, orders, customers). **Metaobjects** define entirely new data types with multiple fields, usable as standalone entities or references from other resources.

### Decision Tree: Metafields vs Metaobjects

| Use Case | Metafield | Metaobject |
|----------|-----------|-----------|
| Add single custom value to existing resource | ✓ | |
| Model standalone "object" with multiple fields | | ✓ |
| Complex data structure (nested fields, relationships) | | ✓ |
| Reference from multiple resources | Could via JoinedString field | ✓ (native capability) |
| Merchant-editable in admin | ✓ (via definition type) | ✓ (via capabilities) |
| Translatability requirement | ✓ (translatable metafields) | ✓ (translatable capability) |
| SEO/storefront rendering | ✓ (limited) | ✓ (renderable capability) |

### Metafields

#### Ownership Models

**App-Owned Metafields**
- Managed entirely by your app
- Namespace: `$app` (reserved prefix)
- Declared in `shopify.app.toml`
- Merchant view-only by default (can enable edits via definition)
- Constraints: Only app can modify schema
- Use: App configuration, AI model metadata, scoring data

**Merchant-Owned Metafields**
- Merchants create and manage
- Namespace: Custom (merchant-defined)
- Created via Shopify Admin UI
- Full merchant control over schema
- Use: Custom attributes (color codes, SKU mappings, internal notes)

#### TOML Schema Declaration

```toml
# App-owned product metafield
[product.metafields.app.page_count]
type = "number_integer"
description = "Number of pages"

# Sub-namespaces: app--{id}--analytics
[product.metafields.analytics.lifetime_value]
type = "number_decimal"
description = "Lifetime customer value"

# Multi-line text
[order.metafields.app.shipping_notes]
type = "multi_line_text_field"
description = "Special handling notes"

# JSON object
[product.metafields.app.seo_config]
type = "json"
description = "SEO configuration"

# List of values (JoinedString supports "|" separator)
[product.metafields.app.related_ids]
type = "joined_string"
description = "Related product IDs"

# Reference to product
[order.metafields.app.assigned_product]
type = "product_reference"
description = "Product assigned to order"
```

#### Data Type Reference

- `single_line_text_field` — String up to 1000 chars
- `multi_line_text_field` — String (no limit)
- `number_integer` — 64-bit integer
- `number_decimal` — Float with validation
- `boolean` — True/false
- `date` — ISO 8601 date
- `date_time` — ISO 8601 datetime
- `json` — Arbitrary JSON object
- `joined_string` — Array as pipe-separated string
- `product_reference` — Link to Product
- `variant_reference` — Link to ProductVariant
- `collection_reference` — Link to Collection
- `file_reference` — Link to File object

#### Common Pitfalls

1. **Type Validation**: Submitted values must match declared type or GraphQL mutation fails
2. **Namespace Conflicts**: Only `$app` reserved namespace can be declared in TOML; prevent collisions with merchant namespaces
3. **Performance**: Filtering/sorting on metafields has performance cost; index heavy query patterns
4. **Version Control**: Metafield schema changes deploy incrementally; breaking changes may affect existing data

### Metaobjects

#### Capabilities

**Publishable Capability**
- Allows `status: DRAFT | ACTIVE`
- Merchants stage content before publication
- Queries can filter by status
- Use: Content publishing workflows

**Translatable Capability**
- Enables translation via Translation API
- All fields marked translatable
- Compatible with Shopify's Translate & Adapt app
- Use: Multi-language storefronts

**Renderable Capability**
- Adds SEO metadata attributes (`title`, `description`, `slug`)
- Accessible via Liquid and Storefront API
- Enables storefront rendering
- Use: SEO-friendly custom content pages

**Online Store Capability**
- Assigns theme template for URL rendering
- Defines custom URL paths
- Makes metaobjects accessible as web pages in online store
- Use: Custom landing pages, content hubs

#### TOML Schema Declaration

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

  [[metaobject_definition.fields]]
  name = "Email"
  handle = "email"
  type = "email"

  [[metaobject_definition.fields]]
  name = "Photo"
  handle = "photo"
  type = "file_reference"

  # Capability: Publishable
  [metaobject_definition.capabilities.publishable]
  enabled = true

  # Capability: Renderable (SEO + theme template)
  [metaobject_definition.capabilities.renderable]
  enabled = true

    # Assign theme template for URL rendering
    [metaobject_definition.capabilities.renderable.theme_template]
    handle = "author"

  # Capability: Translatable
  [metaobject_definition.capabilities.translatable]
  enabled = true
```

#### Data Modeling Patterns

1. **Standalone Records**: Define complete entities (Author, FAQ, Testimonial) with full data independence
2. **Multi-Field Grouping**: Use to group related values (address with street, city, zip)
3. **Reference Relationships**: Link to products, collections, or other metaobjects via `*_reference` fields
4. **Versioning**: Store content versions as separate metaobject entries; use status field to track active version
5. **Rich Media**: Use `file_reference` for images, documents; reference from products/collections

#### Constraints & Limitations

- **Max 25 Definition Changes per Deploy**: Cannot update >25 metaobject definitions (CRUD ops) in single deploy
- **Handle Immutability**: Once created, metaobject definition handle cannot be changed
- **Field Type Immutability**: Existing field types cannot be changed without data migration
- **No Field Deletion**: Remove fields by deprecating them, not deleting (preserves merchant data)

---

## 3. Product Merchandising

### 3-Tier Hierarchy: Product > Options > Variants

Shopify models products hierarchically:

```
Product (e.g., T-Shirt)
├── Option 1: Color (Black, White, Red)
├── Option 2: Size (S, M, L)
└── Option 3: Fit (Slim, Regular) [optional]
    └── Variants (purchasable SKUs)
        ├── Black / S / Slim
        ├── Black / S / Regular
        ├── Black / M / Slim
        └── ... (combinations)
```

#### Constraints

| Aspect | Limit |
|--------|-------|
| **Max Options per Product** | 3 (e.g., Color, Size, Material) |
| **Max Variants per Product** | 100 by default; 2048 variants with advanced features |
| **Max Option Values** | Unlimited (e.g., thousands of sizes) |
| **Max Variant Combinations** | Min(product.options_count × option_values, 2048) |

#### API Patterns

**Creating Variants via Bulk Mutation**

```graphql
mutation {
  productVariantsBulkCreate(productId: "gid://shopify/Product/123", variants: [
    { optionValues: [{ name: "Color", value: "Black" }, { name: "Size", value: "S" }] }
    { optionValues: [{ name: "Color", value: "Black" }, { name: "Size", value: "M" }] }
  ]) {
    productVariants { id sku }
  }
}
```

Accepts up to 2048 variants in single operation.

### Product Bundles

#### Fixed vs Customized Bundles

**Fixed Bundles** (Shopify native)
- Standard and Multipack variants
- Up to 30 component products
- Up to 3 bundle options
- Fits within variant limits
- Configuration: Product or Variant level

**Customized Bundles** (Third-party apps)
- Mix-and-match, complex compositions
- Exceed variant limits
- Merchant-configurable at checkout
- Use: Complex product selections

#### Bundle Options & Consolidation

Consolidate multiple component options into single bundle option:

```graphql
mutation {
  productBundleCreate(productId: "gid://shopify/Product/123", components: [
    { productId: "gid://shopify/Product/456", consolidatedOptions: true }
  ]) {
    bundle { id }
  }
}
```

Effect: Multiple component options map to one customer-visible selection.

#### Common Pitfalls

1. **Variant Limit Exceeded**: Bundle option combinations can exceed 100-variant limit; use consolidation or fixed bundles
2. **Nested Bundles Not Supported**: Cannot create bundles containing other bundles
3. **Component SKU Tracking**: Each bundle component has independent SKU; track inventory per component

### Catalogs & Visibility

#### Publication & Pricing Catalogs

Products must be published in ≥1 catalog to be visible:

```graphql
mutation {
  catalogCreate(input: {
    title: "US Market"
    type: "SHOP"
  }) {
    catalog { id }
  }
}

mutation {
  catalogPublish(catalogId: "gid://shopify/Catalog/123", input: {
    products: ["gid://shopify/Product/456"]
  }) {
    publicationIds
  }
}
```

#### Visibility Rules

- **Publication Catalog**: Controls which products appear to customers
- **Price List**: Defines price adjustments per catalog context (Market, CompanyLocation, App)
- **Lowest Price Rule**: Customer sees lowest price from any applicable pricing catalog
- **Context Segmentation**: Show different products/prices per market, B2B company, or sales channel

#### Example: Market-Specific Catalogs

```graphql
# Create US catalog with specific products
mutation {
  catalogCreate(input: {
    title: "USA"
    type: "SHOP"
  }) { catalog { id } }
}

# Create EU catalog with price adjustments (EUR, VAT rules)
mutation {
  catalogCreate(input: {
    title: "Europe"
    type: "SHOP"
    priceListAssociation: {
      priceListId: "gid://shopify/PriceList/eu-vat"
    }
  }) { catalog { id } }
}
```

---

## 4. Orders & Fulfillment

### FulfillmentOrder Lifecycle

Shopify automatically creates fulfillment orders when an order is placed. Apps interact with fulfillment orders, not manually creating them.

#### Status States

| Status | Meaning | Transitions |
|--------|---------|-------------|
| `OPEN` | Ready for fulfillment; initial state | → IN_PROGRESS (accept) or CLOSED (cancel) |
| `SCHEDULED` | Future fulfillment date set | → OPEN (when scheduled date arrives) |
| `IN_PROGRESS` | Fulfillment accepted, work begun | → CLOSED (fulfill) or INCOMPLETE (partial) |
| `CLOSED` | Fully fulfilled or cancelled | Terminal state |
| `INCOMPLETE` | Partially fulfilled, remainder cancelled | Terminal state |

#### Fulfillment Workflow

```
Order Created → FulfillmentOrder (OPEN)
  → App accepts request → FulfillmentOrder (IN_PROGRESS)
  → App creates Fulfillment with tracking → FulfillmentOrder (CLOSED)
```

### Fulfillment Service Integration

#### Callback Endpoints (Hosted by Third-Party)

Shopify sends requests to endpoints with common prefix `https://fulfillment-provider.com/shopify`:

1. **Fulfillment Order Notification** (POST)
   - Endpoint: `/callback_url/fulfillment_order_notification`
   - Trigger: When fulfillment request or cancellation needs processing
   - Mandatory for API v2022-07+
   - Payload: FulfillmentOrder details, line items, actions

2. **Fetch Tracking Numbers** (GET)
   - Endpoint: `/callback_url/fetch_tracking_numbers`
   - Query: Order IDs, fulfillment IDs
   - Conditional: Only if `tracking_support: true` in FulfillmentService config

3. **Fetch Stock** (GET)
   - Endpoint: `/callback_url/fetch_stock`
   - Query: Product/variant IDs
   - Conditional: Only if `inventory_management: true` in config

#### FulfillmentService Configuration

```graphql
mutation {
  fulfillmentServiceCreate(input: {
    name: "My Fulfillment Partner"
    callbackUrl: "https://fulfillment-provider.com/shopify"
    trackingSupport: true
    inventoryManagement: true
  }) {
    fulfillmentService { id }
  }
}
```

### Returns Management

Returns apps capture financial, logistical, and business intent of returns. Key responsibilities:

1. **Data Synchronization**: Sync return requests between Shopify and fulfillment system
2. **Return Authorization**: Approve/deny returns based on policy
3. **Refund Processing**: Initiate refunds for approved returns
4. **Inventory Restock**: Update inventory when items returned

### Inventory Management Apps

Inventory apps automate inventory operations:

1. **Query Inventory**: Fetch stock levels via `inventoryLevels` query
2. **Adjust Inventory**: Update quantities via `inventoryAdjustmentCreate`
3. **Supply Chain Visibility**: Aggregate data from multiple locations/suppliers
4. **Reorder Logic**: Determine when to trigger purchase orders

#### Inventory Adjustment Patterns

```graphql
mutation {
  inventoryAdjustmentCreate(input: {
    inventoryItemId: "gid://shopify/InventoryItem/123"
    availableDelta: -5  # Deduct 5 units
    reason: "CORRECTION"
  }) {
    inventoryAdjustment { id }
  }
}
```

---

## 5. Purchase Options: Subscriptions & Deferred Purchases

### Selling Plans Overview

A selling plan is a product-variant level configuration defining pricing, billing, delivery, and inventory policies:

```
Selling Plan
├── Pricing Policy (price changes per delivery)
├── Billing Policy (charge intervals: recurring or deferred)
├── Delivery Policy (when to fulfill)
└── Inventory Policy (commit at order vs fulfillment)
```

### Common Selling Plan Types

#### "Subscribe & Save" (Pay Per Delivery)

Customer pays recurring charges at each delivery:

```toml
# Selling plan configuration
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
  value = -10  # 10% discount per delivery
```

Merchant sets: Billing interval, delivery interval, price adjustments. Customer commits to recurring payments.

#### "Prepaid" Plan

Customer pays upfront for multiple deliveries:

```toml
[[selling_plans]]
name = "Buy 3, Save 15%"
billing_policy = "fixed"
  [selling_plans.billing_policy.fixed_billing_policy]
  charge_on_date = "2026-06-01"  # Single charge

delivery_policy = "recurring"
  [selling_plans.delivery_policy.recurring_delivery_policy]
  interval = 1
  interval_unit = "MONTH"
  occurrences = 3  # Deliver 3 times after single payment

pricing_policy = "recurring"
  [[selling_plans.pricing_policy.recurring_pricing_policy.pricing_adjustments]]
  type = "PERCENTAGE"
  value = -15  # 15% discount
```

Merchant sets: Prepayment amount, number of deliveries. Customer pays once, receives multiple shipments.

### Deferred Purchase Options (Pre-Order / Try Before You Buy)

#### Charge Models

When configuring billing policy for deferred purchases, set checkout charge:

```graphql
mutation {
  sellingPlanCreate(input: {
    name: "Pre-Order"
    billingPolicy: {
      fixed: {
        chargeOnDate: "2026-07-01"
        checkoutCharge: {
          type: "PERCENTAGE"
          value: 20  # 20% deposit at checkout
        }
      }
    }
  }) {
    sellingPlan { id }
  }
}
```

#### Charge Timing Options

| Charge Type | Config | Behavior |
|------------|--------|----------|
| **No Deposit** | `checkoutCharge: null` | 0% at checkout; 100% on fulfillment date |
| **Percentage Deposit** | `type: "PERCENTAGE", value: 20` | 20% at checkout; 80% on fulfillment date |
| **Fixed Deposit** | `type: "PRICE", value: "99.99"` | $99.99 at checkout; remainder on fulfillment date |
| **Full Amount** | `checkoutCharge: { value: 100 }` | 100% at checkout (order, not pre-order) |

#### Remaining Balance Timing

```graphql
mutation {
  sellingPlanCreate(input: {
    billingPolicy: {
      fixed: {
        remainingBalance: {
          chargeType: "EXACT_TIME"
          chargeDate: "2026-07-24"  # Fixed date
        }
        # OR
        remainingBalance: {
          chargeType: "TIME_AFTER_CHECKOUT"
          daysAfterCheckout: 14  # 14 days post-checkout
        }
      }
    }
  }) { sellingPlan { id } }
}
```

### Subscription Contracts

A subscription contract is the merchant-customer agreement for recurring purchases:

#### Contract Structure

```
SubscriptionContract
├── Customer Payment Method (stored securely)
├── Lines (products + selling plan)
├── Status (ACTIVE, PAUSED, CANCELLED)
├── Billing Cycles (scheduled charge dates)
│   ├── Start Date
│   ├── End Date
│   ├── BillingAttemptExpectedDate (charge date)
│   └── Status (PENDING, SUCCEEDED, FAILED)
└── Next Billing Date
```

#### Billing Cycle Lifecycle

```
Billing Cycle Created (PENDING)
  → App initiates BillingAttempt on billingAttemptExpectedDate
    → Payment processor charges customer
      → BillingAttempt (SUCCESSFUL) → Order created
      → BillingAttempt (FAILED) → Retry or manual intervention
```

#### Querying Active Contracts

```graphql
query {
  subscriptionContracts(first: 10, query: "status:ACTIVE") {
    edges {
      node {
        id
        customer { email }
        lines { product { title } }
        billingCycles(first: 5) {
          edges {
            node {
              startDate
              endDate
              billingAttemptExpectedDate
            }
          }
        }
      }
    }
  }
}
```

#### Initiating Billing

```graphql
mutation {
  subscriptionBillingAttemptCreate(input: {
    subscriptionContractId: "gid://shopify/SubscriptionContract/123"
  }) {
    billingAttempt {
      id
      status  # PENDING
    }
  }
}
```

---

## 6. Webhooks

### Configuration Methods

#### Method 1: TOML Declaration (Declarative)

Define subscriptions in `shopify.app.toml` at build time:

```toml
# Standard webhooks
[[webhooks]]
uri = "https://myapp.com/webhooks/products"
topic = "products/create"

[[webhooks]]
uri = "https://myapp.com/webhooks/orders"
topic = "orders/paid"

# Mandatory GDPR compliance webhooks
[[webhooks]]
uri = "https://myapp.com/webhooks/compliance"
topics = [
  "customers/data_request",
  "customers/redact",
  "shop/redact"
]
```

**Benefits**:
- Version-controlled with app code
- Subscriptions deployed automatically on `shopify app dev` or publish
- Guaranteed consistency across all installs

#### Method 2: GraphQL Mutation (Programmatic)

Create subscriptions at runtime via `webhookSubscriptionCreate`:

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

**Use Cases**:
- Dynamic subscription logic based on shop configuration
- Conditional webhook setup

### Mandatory GDPR Compliance Webhooks

Every app distributed via Shopify App Store must respond to data subject requests:

| Topic | Trigger | Required Action |
|-------|---------|-----------------|
| `customers/data_request` | Merchant receives GDPR data request from customer | Return all personal data held by app |
| `customers/redact` | Customer requests deletion of personal data | Delete all customer PII from app systems |
| `shop/redact` | Merchant uninstalls app or account deleted | Delete all shop data from app systems |

#### Compliance Webhook Handler Pattern

```typescript
// Handle GDPR requests
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

### Webhook Delivery Guarantees & Retry Behavior

#### Delivery Guarantee

Webhook delivery is **NOT guaranteed**. Shopify makes best-effort attempts but may fail silently.

**Retry Mechanism**:
- Shopify retries failed deliveries up to **8 times over 4 hours** using exponential backoff
- If 8 consecutive failures occur, subscription is automatically deleted
- No delivery confirmation after all retries exhausted

#### Identifying Duplicate Webhooks

If your webhook processing is not idempotent, detect duplicates via headers:

```typescript
// Header: X-Shopify-Event-Id uniquely identifies each webhook event
const eventId = request.headers['x-shopify-event-id'];
const triggeredAt = request.headers['x-shopify-triggered-at'];

// Compare eventId to recent events; if match found, skip processing
const isDuplicate = await redis.exists(`webhook:${eventId}`);
if (isDuplicate) return 200;  // Idempotent: ignore duplicate

// Process webhook, then cache eventId
await redis.setex(`webhook:${eventId}`, 3600, '1');  // Cache 1 hour
```

#### Reconciliation Pattern

Since webhooks are not guaranteed, implement periodic reconciliation:

```typescript
// Every 6 hours, fetch orders from Shopify and compare to local DB
async function reconcileOrders() {
  const shopifyOrders = await shopifyAPI.query(/* fetch all orders */);
  const localOrders = await db.query('SELECT * FROM orders');

  // Find missing orders (webhook failed)
  const missing = shopifyOrders.filter(o =>
    !localOrders.find(lo => lo.shopify_id === o.id)
  );

  // Sync missing orders
  for (const order of missing) {
    await db.insert('orders', order);
  }
}
```

### Event Topics Reference

#### Order Events

- `orders/create` — Order placed
- `orders/updated` — Order modified
- `orders/paid` — Order payment received
- `orders/cancelled` — Order cancelled
- `orders/fulfilled` — Order fully fulfilled
- `orders/partially_fulfilled` — Order partially fulfilled

#### Product Events

- `products/create` — Product created
- `products/update` — Product metadata/variants updated
- `products/delete` — Product deleted
- `product_publications/create` — Product published to channel
- `product_publications/delete` — Product unpublished from channel

#### Collection Events

- `collections/create` — Collection created
- `collections/update` — Collection updated (includes products added/removed)
- `collections/delete` — Collection deleted

#### Customer Events

- `customers/create` — Customer created
- `customers/update` — Customer profile updated
- `customers/delete` — Customer deleted
- `customers/data_request` — GDPR data request [MANDATORY]
- `customers/redact` — GDPR deletion request [MANDATORY]

#### Fulfillment Events

- `fulfillments/create` — Fulfillment created
- `fulfillment_orders/open` — FulfillmentOrder ready
- `fulfillment_orders/in_progress` — Fulfillment in progress
- `fulfillment_orders/closed` — Fulfillment closed/cancelled
- `fulfillment_orders/scheduled` — Future fulfillment scheduled

#### Shop Events

- `shop/redact` — Shop deleted / app uninstalled [MANDATORY]
- `app/uninstalled` — App uninstalled (fires with shop/redact)

For full event topics list: https://shopify.dev/docs/api/webhooks/latest

### Webhook Best Practices

#### Error Handling & Async Processing

1. **Queue Pattern**: Don't process synchronously; enqueue and respond 200 immediately

```typescript
app.post('/webhooks/orders', async (req, res) => {
  const webhook = req.body;

  // Queue asynchronously, respond immediately
  await messageQueue.enqueue({
    type: 'order_created',
    payload: webhook
  });

  res.status(200).send('OK');  // Return before processing done
});

// Worker processes queue asynchronously
async function processOrderQueue() {
  const job = await messageQueue.dequeue();
  await syncOrderToDatabase(job.payload);
}
```

**Benefit**: Avoids timeout (Shopify waits ~5 seconds) and retry loops.

2. **Idempotency Pattern**: Use event ID to prevent duplicate processing

```typescript
async function processWebhook(eventId, payload) {
  // Check if already processed
  const processed = await cache.get(`processed:${eventId}`);
  if (processed) return;  // Idempotent

  // Process
  await handleWebhook(payload);

  // Mark as processed (cache 24+ hours; matches Shopify's idempotency key retention)
  await cache.set(`processed:${eventId}`, true, { ttl: 86400 });
}
```

3. **Exponential Backoff for External Calls**: If calling third-party APIs from webhook handler, retry with backoff

```typescript
async function callExternalAPI(url, data, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
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

4. **Event Sourcing**: Store raw webhook payload before processing to support replay

```typescript
async function processWebhook(req, res) {
  const payload = req.body;
  const eventId = req.headers['x-shopify-event-id'];

  // Store original payload
  await db.insert('webhook_events', {
    event_id: eventId,
    topic: req.headers['x-shopify-topic'],
    payload: JSON.stringify(payload),
    created_at: new Date()
  });

  // Process
  await handleWebhook(payload);

  res.status(200).send('OK');
}
```

#### HTTPS & Authentication

- All webhook endpoints must be **HTTPS** (HTTP rejected)
- Verify webhook authenticity via `X-Shopify-Hmac-SHA256` header

```typescript
import crypto from 'crypto';

function verifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = req.rawBody;  // Must be raw buffer, not parsed JSON

  const computed = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(hmac, computed);
}
```

#### Event-Driven Integration (Alternative to HTTPS)

For high-volume webhooks, use managed event services:

- **Amazon EventBridge**: Route webhooks to AWS services (Lambda, SQS, SNS)
- **Google Cloud Pub/Sub**: Route webhooks to GCP services

```toml
[[webhooks]]
topic = "orders/create"
apiVersion = "2025-01"
filter = "fulfillmentOrders.status:OPEN"  # Conditional delivery
address = "arn:aws:events:us-east-1:123456789:event-bus/default"
transport = "eventbridge"
```

Benefits: Decoupling, scalability, automatic retries via managed service.

#### Monitoring & Alerts

- Track webhook delivery success rate (target: >99%)
- Alert on subscription deletion (8 failed retries)
- Monitor handler latency (log processing time)
- Set up dead-letter queue for failed processing attempts

---

## Summary Table: Key Patterns by Feature

| Feature | Primary Pattern | Constraints | Common Pitfall |
|---------|-----------------|-------------|-----------------|
| **App Blocks** | Sections include `@app` block type | Cannot access parent section data beyond ID | Forgetting dynamic sources for resource data |
| **App Embed Blocks** | Global script; no parent required | No dynamic sources available | Forgetting default-inactive state |
| **Metafields** | Declare in TOML; reference via GraphQL | Type validation required; performance on filters | Namespace collisions with merchant fields |
| **Metaobjects** | TOML + capabilities (publishable, translatable, renderable) | Max 25 definition changes per deploy | Attempting to delete fields; breaking field type changes |
| **Product Variants** | Max 3 options, 100 variants per product | Bundles can exceed limits | Nested bundles not supported |
| **Catalogs** | Publication determines visibility; PriceList determines pricing | Customer sees lowest price across catalogs | Forgetting to publish products to catalog |
| **FulfillmentOrder** | Status: OPEN → IN_PROGRESS → CLOSED | Auto-created by Shopify; cannot be manually created | Trying to create FulfillmentOrder directly |
| **Selling Plans** | Pricing + Billing + Delivery + Inventory policies | Subscriptions vs deferred purchases differ structurally | Confusing prepaid (single charge) with recurring |
| **Subscription Contracts** | Customer payment stored; billing cycles scheduled | Contract ties to selling plan; fulfillment per cycle | Missing manual billing attempts for failed payments |
| **Webhooks (TOML)** | Declare in shopify.app.toml | Auto-subscribed on deploy | Forgetting mandatory GDPR webhooks |
| **Webhooks (GraphQL)** | `webhookSubscriptionCreate` mutation | Subscription deleted after 8 failures | Assuming delivery guaranteed; skipping reconciliation |
| **Webhook Reliability** | Implement idempotency + reconciliation | Not guaranteed; retry up to 8 times in 4 hours | Processing without checking X-Shopify-Event-Id duplicate |

---

## Resources

- [Shopify Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
- [About Metafields](https://shopify.dev/docs/apps/build/metafields)
- [About Metaobjects](https://shopify.dev/docs/apps/build/metaobjects)
- [App Blocks for Themes](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks)
- [Product Merchandising](https://shopify.dev/docs/apps/build/product-merchandising)
- [Orders & Fulfillment](https://shopify.dev/docs/apps/build/orders-fulfillment)
- [Purchase Options & Subscriptions](https://shopify.dev/docs/apps/build/purchase-options)
- [Webhooks API](https://shopify.dev/docs/api/webhooks/latest)
- [Webhook Best Practices](https://shopify.dev/docs/apps/build/webhooks/best-practices)
- [Selling Plans](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans)
- [Subscription Contracts](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/contracts)
- [FulfillmentOrder API](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder)
