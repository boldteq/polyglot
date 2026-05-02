# Build: Orders & Fulfillment

> Source: shopify.dev/docs/apps/build/orders-fulfillment
> Last extracted: 2026-04-04

## FulfillmentOrder Lifecycle

Shopify automatically creates fulfillment orders when an order is placed. Apps interact with fulfillment orders, not manually creating them.

### Status States

| Status | Meaning | Transitions |
|--------|---------|-------------|
| `OPEN` | Ready for fulfillment; initial state | → IN_PROGRESS (accept) or CLOSED (cancel) |
| `SCHEDULED` | Future fulfillment date set | → OPEN (when scheduled date arrives) |
| `IN_PROGRESS` | Fulfillment accepted, work begun | → CLOSED (fulfill) or INCOMPLETE (partial) |
| `CLOSED` | Fully fulfilled or cancelled | Terminal state |
| `INCOMPLETE` | Partially fulfilled, remainder cancelled | Terminal state |

### Fulfillment Workflow

```
Order Created → FulfillmentOrder (OPEN)
  → App accepts request → FulfillmentOrder (IN_PROGRESS)
  → App creates Fulfillment with tracking → FulfillmentOrder (CLOSED)
```

## Fulfillment Service Integration

Apps can integrate with external fulfillment providers via callback endpoints.

### Callback Endpoints (Hosted by Third-Party)

Shopify sends requests to endpoints with common prefix `https://fulfillment-provider.com/shopify`:

1. **Fulfillment Order Notification** (POST)
   - When fulfillment request or cancellation needs processing
   - Mandatory for API v2022-07+
   - Payload: FulfillmentOrder details, line items, actions

2. **Fetch Tracking Numbers** (GET)
   - Only if `tracking_support: true` in config
   - Query: Order IDs, fulfillment IDs

3. **Fetch Stock** (GET)
   - Only if `inventory_management: true` in config
   - Query: Product/variant IDs

### Configuration

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

## Returns Management

Returns apps synchronize return requests between Shopify and fulfillment system.

**Responsibilities:**
1. **Data sync** — Return requests between Shopify and fulfillment system
2. **Authorization** — Approve/deny returns based on policy
3. **Refund processing** — Initiate refunds for approved returns
4. **Inventory restock** — Update inventory when items returned

## Inventory Management

Query and adjust inventory levels:

```graphql
# Query inventory
query {
  inventoryLevels(first: 10) {
    edges {
      node {
        id
        available
        quantities {
          name
          quantity
        }
      }
    }
  }
}

# Adjust inventory
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
