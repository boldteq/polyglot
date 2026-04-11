# Build: Purchase Options & Subscriptions

> Source: shopify.dev/docs/apps/build/purchase-options
> Last extracted: 2026-04-04

## Selling Plans Overview

A selling plan is product-variant level configuration defining pricing, billing, delivery, and inventory policies:

```
Selling Plan
├── Pricing Policy (price changes per delivery)
├── Billing Policy (charge intervals: recurring or deferred)
├── Delivery Policy (when to fulfill)
└── Inventory Policy (commit at order vs fulfillment)
```

## Subscribe & Save (Pay Per Delivery)

Customer pays recurring charges at each delivery:

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
  value = -10  # 10% discount per delivery
```

Merchant sets: Billing interval, delivery interval, price adjustments. Customer commits to recurring payments.

## Prepaid Plan (Buy 3, Save 15%)

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

## Deferred Purchases (Pre-Order / Try Before You Buy)

### Charge Models

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

### Charge Timing Options

| Charge Type | Config | Behavior |
|------------|--------|----------|
| **No deposit** | `checkoutCharge: null` | 0% at checkout; 100% on fulfillment |
| **Percentage** | `type: "PERCENTAGE", value: 20` | 20% at checkout; 80% on fulfillment |
| **Fixed** | `type: "PRICE", value: "99.99"` | $99.99 at checkout; remainder on fulfillment |
| **Full amount** | `checkoutCharge: { value: 100 }` | 100% at checkout (not pre-order) |

### Remaining Balance Timing

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

## Subscription Contracts

A subscription contract is the merchant-customer agreement for recurring purchases.

### Contract Structure

```
SubscriptionContract
├── Customer Payment Method
├── Lines (products + selling plan)
├── Status (ACTIVE, PAUSED, CANCELLED)
├── Billing Cycles (scheduled charge dates)
│   ├── Start/End Date
│   ├── BillingAttemptExpectedDate
│   └── Status (PENDING, SUCCEEDED, FAILED)
└── Next Billing Date
```

### Billing Cycle Lifecycle

```
Billing Cycle Created (PENDING)
  → App initiates BillingAttempt on billingAttemptExpectedDate
    → Payment processor charges customer
      → BillingAttempt (SUCCESSFUL) → Order created
      → BillingAttempt (FAILED) → Retry or manual intervention
```

### Query Active Contracts

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

### Initiate Billing

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

## Key Rules

- **Selling plans are product-level** — Configured on variant, visible at checkout
- **Subscription contracts tie to selling plans** — Customer selects plan, system creates contract
- **Billing attempts are manual** — App must initiate charging (not automatic)
- **Refunds are separate** — Refund API handles refund processing
