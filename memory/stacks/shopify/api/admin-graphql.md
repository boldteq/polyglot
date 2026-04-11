# Shopify Admin GraphQL API Reference

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest](https://shopify.dev/docs/api/admin-graphql/latest)
**API Version:** 2026-01 (latest)
**Last Updated:** 2026-04-04
**Query Cost Model:** All queries cost up to 1000 points; requests cost points based on field complexity

---

## Overview

The Shopify Admin GraphQL API allows apps to interact with shop data, create orders, manage customers, handle billing, and more. All queries use cursor-based pagination and a cost-based rate limiting system.

**Key Characteristics:**
- **Async execution** via `bulkOperationRunQuery()` for large datasets
- **Cursor-based pagination** with `PageInfo` and connection edges
- **Cost-based rate limiting:** requests cost points; bucket capacity varies by plan
- **Real-time mutations** for immediate operations
- **Webhook subscriptions** for event-driven workflows

---

## Authentication & Admin Client

All Admin GraphQL requests require an authenticated admin context (from `authenticate.admin()` in React Router SDK).

```typescript
const { admin } = await authenticate.admin(request);

// Execute a query
const response = await admin.graphql(`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
    }
  }
`, {
  variables: { id: 'gid://shopify/Product/123' }
});

// Handle response
if (response.errors) {
  console.error(response.errors);
} else {
  const { data } = response;
}
```

---

## Product Queries & Mutations

### Query: `products`

Fetch a paginated list of products.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/queries/products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products)

```graphql
query GetProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: TITLE) {
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
        media(first: 5) {
          edges {
            node {
              id
              alt
              mediaContentType
            }
          }
        }
      }
    }
  }
}
```

**Variables:**
```json
{ "first": 50, "after": "cursor_string_or_null" }
```

---

### Mutation: `productCreate`

Create a new product.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productCreate)

```graphql
mutation CreateProduct($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      id
      title
      handle
      status
      variants(first: 1) {
        edges {
          node {
            id
            title
            price
          }
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

**Input Variables (API 2024-10+):**
```json
{
  "input": {
    "title": "New Product",
    "productType": "Clothing",
    "vendor": "My Vendor",
    "status": "ACTIVE",
    "descriptionHtml": "<p>Product description</p>",
    "tags": ["new", "sale"],
    "options": [
      {
        "name": "Size",
        "values": ["S", "M", "L", "XL"]
      }
    ],
    "variants": [
      {
        "title": "Small",
        "price": "29.99",
        "sku": "SKU-001",
        "barcode": "123456789",
        "taxable": true
      }
    ]
  }
}
```

**Key Notes:**
- Use `ProductCreateInput` (not `ProductInput`) in API 2024-10+
- Variants are created inline during product creation
- Media (images/videos) can be attached after product creation via separate mutations

---

### Mutation: `productUpdate`

Update an existing product.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate)

```graphql
mutation UpdateProduct($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      status
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input (API 2024-10+):**
```json
{
  "input": {
    "id": "gid://shopify/Product/123",
    "title": "Updated Title",
    "status": "ARCHIVED",
    "vendor": "New Vendor"
  }
}
```

**Important:** Use `ProductUpdateInput` (API 2024-10+); variants require `productVariantsBulkUpdate`.

---

### Mutation: `productVariantsBulkCreate`

Create multiple product variants at once.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkCreate)

```graphql
mutation BulkCreateVariants($productId: ID!, $variants: [ProductVariantInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    productVariants {
      id
      title
      price
      sku
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "productId": "gid://shopify/Product/123",
  "variants": [
    {
      "title": "Medium",
      "price": "29.99",
      "sku": "SKU-002",
      "barcode": "123456790"
    },
    {
      "title": "Large",
      "price": "34.99",
      "sku": "SKU-003"
    }
  ]
}
```

---

## Order Queries & Mutations

### Query: `orders`

Fetch paginated list of orders.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/queries/orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)

```graphql
query GetOrders($first: Int!, $after: String) {
  orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        name
        email
        phone
        createdAt
        totalPrice
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 10) {
          edges {
            node {
              id
              title
              quantity
              price
            }
          }
        }
        customer {
          id
          email
          firstName
          lastName
        }
        shippingAddress {
          address1
          city
          province
          country
          zip
        }
        fulfillmentOrders(first: 10) {
          edges {
            node {
              id
              status
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

### Mutation: `orderCreate`

Create a manual order (useful for imports, wholesale).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCreate)

```graphql
mutation CreateOrder($input: OrderInput!) {
  orderCreate(input: $input) {
    order {
      id
      name
      email
      totalPrice
      lineItems(first: 10) {
        edges {
          node {
            id
            title
            quantity
          }
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

**Input:**
```json
{
  "input": {
    "email": "customer@example.com",
    "lineItems": [
      {
        "variantId": "gid://shopify/ProductVariant/456",
        "quantity": 2
      }
    ],
    "shippingAddress": {
      "address1": "123 Main St",
      "city": "New York",
      "province": "NY",
      "country": "US",
      "zip": "10001"
    },
    "billingAddress": {
      "address1": "123 Main St",
      "city": "New York",
      "province": "NY",
      "country": "US",
      "zip": "10001"
    },
    "note": "Manual order created via API",
    "notifyCustomer": true
  }
}
```

**Limitation:** Cannot apply multiple discounts; only one discount code per order.

---

### Mutation: `fulfillmentCreateV2`

Create a fulfillment for one or more line items.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreateV2](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreateV2)

```graphql
mutation CreateFulfillment($input: FulfillmentInput!) {
  fulfillmentCreateV2(input: $input) {
    fulfillment {
      id
      status
      lineItems(first: 10) {
        edges {
          node {
            id
            quantity
          }
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

**Input:**
```json
{
  "input": {
    "lineItemsToFulfill": [
      {
        "id": "gid://shopify/FulfillmentOrderLineItem/123",
        "quantity": 1
      }
    ],
    "trackingInfo": {
      "number": "1Z999AA10123456784",
      "company": "UPS",
      "url": "https://tracking.ups.com/?tracknum=1Z999AA10123456784"
    }
  }
}
```

---

## Customer Queries & Mutations

### Mutation: `customerCreate`

Create a new customer.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerCreate)

```graphql
mutation CreateCustomer($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer {
      id
      email
      firstName
      lastName
      phone
      defaultAddress {
        address1
        city
        country
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input:**
```json
{
  "input": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1-555-1234",
    "addresses": [
      {
        "address1": "123 Main St",
        "city": "New York",
        "province": "NY",
        "country": "US",
        "zip": "10001"
      }
    ],
    "emailMarketingConsent": {
      "marketingState": "SUBSCRIBED",
      "consentUpdatedAt": "2026-04-04T00:00:00Z"
    }
  }
}
```

---

### Mutation: `customerUpdate`

Update customer details.

```graphql
mutation UpdateCustomer($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer {
      id
      email
      firstName
      lastName
    }
    userErrors {
      field
      message
    }
  }
}
```

---

### Mutation: `customerSet`

Create or update a customer (upsert) — useful for syncing external data.

```graphql
mutation UpsertCustomer($input: CustomerInput!) {
  customerSet(input: $input) {
    customer {
      id
      email
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## Billing Mutations

### Mutation: `appSubscriptionCreate`

Create a recurring subscription charge (time-based or usage-based).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/appSubscriptionCreate)

```graphql
mutation CreateSubscription($input: AppSubscriptionInput!) {
  appSubscriptionCreate(input: $input) {
    appSubscription {
      id
      status
      confirmationUrl
      currentPeriodEnd
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input (Time-Based):**
```json
{
  "input": {
    "returnUrl": "https://myapp.com/billing/callback",
    "lineItems": [
      {
        "plan": {
          "appRecurringPricingDetails": {
            "price": {
              "amount": 9.99,
              "currencyCode": "USD"
            },
            "interval": "EVERY_30_DAYS"
          }
        }
      }
    ]
  }
}
```

**Input (Usage-Based):**
```json
{
  "input": {
    "returnUrl": "https://myapp.com/billing/callback",
    "lineItems": [
      {
        "plan": {
          "appUsagePricingDetails": {
            "cappedAmount": {
              "amount": 100,
              "currencyCode": "USD"
            },
            "terms": "... per thousand API calls"
          }
        }
      }
    ]
  }
}
```

**Flow:**
1. Merchant sees `confirmationUrl` in response
2. Redirect merchant to `confirmationUrl`
3. Merchant approves subscription on Shopify-hosted page
4. Shopify webhooks notify app of activation (APP_SUBSCRIPTIONS_UPDATE)

---

### Mutation: `appPurchaseOneTimeCreate`

Create a one-time charge (not recurring).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/apppurchaseonetimecreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/apppurchaseonetimecreate)

```graphql
mutation CreateOneTimeCharge($input: AppPurchaseOneTimeInput!) {
  appPurchaseOneTimeCreate(input: $input) {
    appPurchaseOneTime {
      id
      status
      confirmationUrl
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input:**
```json
{
  "input": {
    "name": "Premium Feature Pack",
    "price": {
      "amount": 49.99,
      "currencyCode": "USD"
    },
    "returnUrl": "https://myapp.com/billing/callback",
    "test": false
  }
}
```

---

### Mutation: `appSubscriptionLineItemUpdate`

Update quantity or pricing of existing subscription line items.

```graphql
mutation UpdateLineItem($input: AppSubscriptionLineItemUpdateInput!) {
  appSubscriptionLineItemUpdate(input: $input) {
    lineItem {
      id
      quantity
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## Webhook Subscriptions

### Mutation: `webhookSubscriptionCreate`

Subscribe app to event topics.

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/webhookSubscriptionCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/webhookSubscriptionCreate)

```graphql
mutation SubscribeToWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription {
      id
      topic
      endpoint {
        __typename
        ... on WebhookHttpEndpoint {
          callbackUrl
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

**Variables:**
```json
{
  "topic": "ORDERS_UPDATED",
  "webhookSubscription": {
    "callbackUrl": "https://myapp.com/webhooks",
    "filter": "status:paid",
    "includeFields": ["id", "created_at", "total_price"],
    "metafieldNamespaces": ["custom"]
  }
}
```

**Common Topics:**
- `APP_UNINSTALLED` — App removed from shop
- `ORDERS_CREATED`, `ORDERS_UPDATED`, `ORDERS_CANCELLED`
- `CUSTOMERS_CREATE`, `CUSTOMERS_UPDATE`
- `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`
- `APP_SUBSCRIPTIONS_UPDATE`, `APP_PURCHASES_ONE_TIME_UPDATE`

---

## Metafields & Metaobjects

### Mutation: `metafieldsSet`

Set metafield values on resources (products, orders, customers, etc.).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet)

```graphql
mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input (max 25 metafields per call):**
```json
{
  "metafields": [
    {
      "ownerId": "gid://shopify/Product/123",
      "namespace": "custom",
      "key": "sku_internal",
      "value": "PROD-001",
      "type": "single_line_text_field"
    },
    {
      "ownerId": "gid://shopify/Order/456",
      "namespace": "custom",
      "key": "po_number",
      "value": "PO-2026-001",
      "type": "single_line_text_field"
    },
    {
      "ownerId": "gid://shopify/Customer/789",
      "namespace": "custom",
      "key": "vip_tier",
      "value": "gold",
      "type": "single_line_text_field"
    }
  ]
}
```

**Metafield Types:**
- `single_line_text_field`, `multi_line_text_field`
- `integer`, `decimal`
- `date`, `date_time`
- `json`
- `boolean`
- `url`, `email`

---

### Mutation: `metaobjectCreate`

Create a metaobject entry (custom data structure).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/metaobjectCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metaobjectCreate)

```graphql
mutation CreateMetaobject($input: MetaobjectInput!) {
  metaobjectCreate(input: $input) {
    metaobject {
      id
      type
      handle
      fields {
        key
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## Inventory Management

### Mutation: `inventoryAdjustQuantities`

Adjust inventory levels (increase/decrease quantity).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventoryAdjustQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventoryAdjustQuantities)

```graphql
mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      reason
      changes {
        inventoryLevel {
          id
          available
        }
        quantityAdjustment {
          quantity
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

**Input:**
```json
{
  "input": {
    "reason": "CORRECTION",
    "changes": [
      {
        "inventoryLevelId": "gid://shopify/InventoryLevel/123",
        "delta": 5
      },
      {
        "inventoryLevelId": "gid://shopify/InventoryLevel/456",
        "delta": -2
      }
    ]
  }
}
```

**Reasons:** `CORRECTION`, `DAMAGE`, `EMERGENCY`, `LEGACY`, `LOST`, `RESTOCK`, `RETURN`, `UNKNOWN`

---

### Mutation: `inventorySetQuantities`

Set inventory to absolute values (compare-and-set for concurrency).

```graphql
mutation SetInventory($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryLevels {
      id
      quantities(names: ["available", "committed"]) {
        name
        quantity
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## Bulk Operations

### Mutation: `bulkOperationRunQuery`

Execute a query asynchronously for large datasets (millions of records).

**Source:** [https://shopify.dev/docs/api/admin-graphql/latest/mutations/bulkoperationrunquery](https://shopify.dev/docs/api/admin-graphql/latest/mutations/bulkoperationrunquery)

```graphql
mutation BulkExportProducts($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
      objectCount
      url
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables (query as string):**
```json
{
  "query": "query { products(first: 250) { edges { node { id title variants(first: 100) { edges { node { id price sku } } } } cursor } pageInfo { hasNextPage } } }"
}
```

**Lifecycle:**
1. Submit query → returns bulk operation ID
2. Poll `currentBulkOperation` to check status
3. When `status: COMPLETED`, download JSONL file from `url`
4. File available for 7 days

**Poll Query:**
```graphql
query CheckBulkOperation {
  currentBulkOperation {
    id
    status
    objectCount
    url
    completedAt
  }
}
```

**Results Format (JSONL):**
```jsonl
{"id":"gid://shopify/Product/1","title":"Product A"}
{"id":"gid://shopify/Product/2","title":"Product B"}
...
```

---

## Pagination Pattern

### Cursor-Based Pagination

All list queries use cursor-based pagination (Relay spec).

```graphql
query GetProductsPaginated($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: TITLE, reverse: false) {
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    edges {
      cursor
      node {
        id
        title
      }
    }
  }
}
```

**Pagination Arguments:**
- `first: Int` — Return first N items (forward pagination)
- `after: String` — Start after cursor (use `edge.cursor` from previous page)
- `last: Int` — Return last N items (backward pagination)
- `before: String` — Start before cursor

**PageInfo Fields:**
- `hasNextPage: Boolean` — More items exist forward
- `hasPreviousPage: Boolean` — More items exist backward
- `startCursor: String` — Cursor of first edge
- `endCursor: String` — Cursor of last edge

**Pagination Implementation:**
```typescript
let allProducts = [];
let cursor = null;
let hasMore = true;

while (hasMore) {
  const response = await admin.graphql(`
    query GetProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title } }
      }
    }
  `, {
    variables: { first: 250, after: cursor }
  });

  allProducts.push(
    ...response.data.products.edges.map(e => e.node)
  );

  hasMore = response.data.products.pageInfo.hasNextPage;
  cursor = response.data.products.pageInfo.endCursor;
}
```

---

## Rate Limiting & Cost Model

### Cost Calculation

**Source:** [https://shopify.dev/docs/api/usage/limits](https://shopify.dev/docs/api/usage/limits)

Every GraphQL field has a cost value. Query cost = max possible fields selected.

```graphql
query {
  products(first: 100) {     # Cost: 100
    edges {
      node {
        id                    # +1
        title                 # +1
        variants(first: 100) { # Cost: 100
          edges {
            node {
              id              # +1
              price           # +1
            }
          }
        }
      }
    }
  }
}
# Total cost: 100 + 2 + 100 + 2 = 204 points
```

**Plan Limits:**
- Standard plan: 40 points/second
- Shopify Plus: 500 points/second
- Advanced plan: 100 points/second
- Single query max: 1,000 points (regardless of plan)

### Handling Throttling

When bucket fills, Shopify returns 429 Too Many Requests:

```json
{
  "errors": [
    {
      "message": "Throttled",
      "extensions": {
        "code": "THROTTLED"
      }
    }
  ]
}
```

**Backoff Strategy:**
```typescript
async function executeWithRetry(query, variables, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await admin.graphql(query, { variables });

      if (response.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
    }
  }
}
```

---

## Common Patterns

### Syncing All Shop Products

```typescript
async function syncAllProducts(admin) {
  const query = `
    query {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            status
            createdAt
            updatedAt
            variants(first: 100) {
              edges { node { id price sku } }
            }
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  const bulkOp = await admin.graphql(`
    mutation { bulkOperationRunQuery(query: "${query}") { bulkOperation { id } } }
  `);

  const operationId = bulkOp.data.bulkOperationRunQuery.bulkOperation.id;

  // Poll for completion
  let completed = false;
  while (!completed) {
    const status = await admin.graphql(`
      query { currentBulkOperation { status url } }
    `);

    if (status.data.currentBulkOperation.status === 'COMPLETED') {
      completed = true;
      const url = status.data.currentBulkOperation.url;
      // Download and process JSONL file
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### Batch Create/Update with Error Handling

```typescript
async function batchCreateProducts(admin, products) {
  const results = { successful: [], failed: [] };

  for (const product of products) {
    try {
      const response = await admin.graphql(`
        mutation CreateProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }
      `, {
        variables: { input: product }
      });

      if (response.data.productCreate.userErrors.length > 0) {
        results.failed.push({
          product,
          errors: response.data.productCreate.userErrors
        });
      } else {
        results.successful.push(response.data.productCreate.product);
      }
    } catch (err) {
      results.failed.push({ product, error: err.message });
    }
  }

  return results;
}
```

---

## Pitfalls & Common Mistakes

1. **Ignoring query cost** — Queries with `first: 250` on nested connections = 2500+ points; use bulk operations instead
2. **Not handling throttling** — 429 errors require exponential backoff; don't retry immediately
3. **Pagination cursor errors** — `hasNextPage=true` but `endCursor=null` means connection is empty; handle both
4. **Large bulk operation queries** — Keep nesting ≤2 levels; use multiple smaller bulk operations if needed
5. **Setting conflicting metafields** — Use `metafieldsSet` in single call (max 25) to avoid race conditions
6. **Forgetting userErrors** — GraphQL returns 200 OK with `userErrors` array; always check for errors
7. **Date/time formats** — Use ISO 8601 (e.g., `2026-04-04T00:00:00Z`); Shopify rejects other formats

---

## Related Resources

- [GraphQL Admin API Playground](https://shopify.dev/docs/api/admin-graphql/latest/queries/product)
- [REST Admin API Comparison](https://shopify.dev/docs/api/admin-rest)
- [Bulk Operations Guide](https://shopify.dev/docs/api/usage/bulk-operations/queries)
- [Pagination in GraphQL](https://shopify.dev/docs/api/usage/pagination-graphql)
- [Billing API](https://shopify.dev/docs/apps/launch/billing)
- [Webhook Subscriptions](https://shopify.dev/docs/api/admin-graphql/latest/mutations/webhookSubscriptionCreate)
