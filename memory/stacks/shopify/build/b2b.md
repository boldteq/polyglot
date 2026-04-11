# Build: B2B (Business-to-Business)

> Source: shopify.dev/docs/apps/build/b2b
> Last extracted: 2026-04-04

## Prerequisites

- **Plan requirement:** Shopify Plus only
- **Structure:** B2B features organize customers as companies with locations
- **API version:** Use 2024-07+ for metafield write support on Company/CompanyLocation

## Company & Location Management

### Company Structure

```
Company
├── CompanyLocation 1
│   ├── Catalog
│   ├── Price List
│   ├── Payment Terms
│   └── Contacts
├── CompanyLocation 2
│   ├── Catalog
│   ├── Price List
│   └── Payment Terms
```

### Catalog Management Rules

- **Catalog assignment:** Only at company location level
- **Multiple catalogs:** One location can have multiple catalog assignments
- **Price list association:** Determines displayed prices
- **Currency handling:** Prices convert to market currency without price list

### Purchasing Entity

**Definition:** Company + Contact + Location combination

**Used for:** Draft order creation

**Determines:** Which catalogs/prices apply to order

## Draft Orders for B2B

### Purpose

- Merchants need draft orders for company approval workflows
- Pre-transaction creation and negotiation
- Created for specific purchasing entity

### Draft Order Calculation

```graphql
mutation {
  draftOrderCalculate(input: {
    customerId: "gid://shopify/Customer/123"
    lineItems: [
      {
        productVariantId: "gid://shopify/ProductVariant/456"
        quantity: 10
      }
    ]
  }) {
    calculatedDraftOrder {
      lineItems {
        originalTotal
      }
      subtotalPrice
      shippingLine { price }
      appliedDiscount { amount }
      taxLines { price }
      totalPrice
    }
  }
}
```

Returns calculated totals without creating order.

### Custom Pricing (2025-01+)

- Item prices auto-reflect current product prices at checkout
- Can set custom prices on line items
- Custom prices lock and become basis for tax/discount/total calculations
- Supports B2B negotiated pricing workflows

## Payment Terms

- **Configuration:** Set via BuyerExperienceConfiguration on company location
- **Template-based:** Use PaymentTermsTemplate ID
- **Behavior control:** Determines checkout payment flow
- **Order review:** May require merchant approval before completion

**Use cases:**
- Net 30 / Net 60 payment terms
- Require merchant approval before payment
- Deferred payment arrangements

## Quantity Rules

- **Purpose:** Control min/max/increment quantities for variants
- **B2B-specific:** Applied per company context
- **Implementation:** Delete mutations manage rules
- **Query:** `ProductVariantContextualPricing.quantityRules` shows applied rules

## Pitfalls

- **Shopify Plus only** — Cannot use B2B features on standard plans
- **Catalog complexity** — Careful management of catalog assignments per location
- **Price list confusion** — Without price list, base prices auto-convert
- **Draft order approval** — Must handle multi-step approval workflows
