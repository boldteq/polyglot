# Shopify Storefront API — Complete Reference

**Source:** [shopify.dev/docs/api/storefront/2026-01](https://shopify.dev/docs/api/storefront/2026-01)
**Version:** 2026-01
**Updated:** 2026-04-04

---

## Overview

The Storefront API is a GraphQL API for building custom shopping experiences (headless storefronts) on web, mobile, gaming, and other platforms. It provides read/write access to shop data and enables building fully-custom checkout flows.

**Key characteristics:**
- GraphQL API (JSON requests)
- **No rate limits** on request count (but query complexity limits apply)
- Tokenless access: capacity scales with customer IP
- Public access: use storefront access tokens for delegation
- Different from Admin API — read-only customer data, writable cart/checkout
- HTTPS endpoint: `https://{shop}.myshopify.com/api/2026-01/graphql.json`
- Storefront access tokens created via Admin API (max 100 per shop)

---

## Authentication

### Tokenless Access (Recommended)

No token needed for public queries. Best for public storefronts.

```bash
curl -X POST https://myshop.myshopify.com/api/2026-01/graphql.json \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'
```

**Query complexity limit:** 1,000 (same as Admin API calculation)
**Capacity:** Scales with customer IP address

### Storefront Access Token

For delegated access to specific scopes. Create via Admin API:

```graphql
mutation {
  storefrontAccessTokenCreate(input: {
    title: "My Storefront"
  }) {
    storefrontAccessToken {
      accessToken
      title
    }
    userErrors { message }
  }
}
```

Use in requests:

```bash
curl -X POST https://myshop.myshopify.com/api/2026-01/graphql.json \
  -H "X-Shopify-Storefront-Access-Token: [token]" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'
```

**Limits:** Max 100 active tokens per shop

---

## Core Queries

### Shop

Get shop metadata and capabilities:

```graphql
query {
  shop {
    id
    name
    description
    moneyFormat
    currencyCode
    paymentSettings {
      supportedDigitalWallets
      supportedPaymentMethods
    }
  }
}
```

### Products

Query single product:

```graphql
query {
  product(id: "gid://shopify/Product/123456") {
    id
    title
    handle
    description
    vendor
    availableForSale
    priceRange {
      minVariantPrice { amount currency }
      maxVariantPrice { amount currency }
    }
    variants(first: 10) {
      edges {
        node {
          id
          title
          availableForSale
          selectedOptions { name value }
          price { amount currency }
          image { url altText }
        }
      }
    }
    images(first: 5) {
      edges {
        node {
          url
          altText
        }
      }
    }
    tags
    collections(first: 5) {
      edges { node { id title } }
    }
  }
}
```

Query products list:

```graphql
query {
  products(first: 10, query: "tag:summer") {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
        handle
        priceRange {
          minVariantPrice { amount currency }
          maxVariantPrice { amount currency }
        }
        featuredImage { url }
      }
    }
  }
}
```

### Collections

Get all collections:

```graphql
query {
  collections(first: 10) {
    edges {
      node {
        id
        title
        handle
        description
        image { url }
      }
    }
  }
}
```

Get collection by handle + products:

```graphql
query {
  collectionByHandle(handle: "summer-sale") {
    id
    title
    description
    products(first: 20, sortKey: PRICE, reverse: false) {
      pageInfo { hasNextPage }
      edges {
        node {
          id
          title
          priceRange {
            minVariantPrice { amount currency }
            maxVariantPrice { amount currency }
          }
        }
      }
    }
  }
}
```

### Pages & Blog

```graphql
query {
  pages(first: 10) {
    edges {
      node {
        id
        title
        handle
        body
      }
    }
  }
}

query {
  blogs(first: 10) {
    edges {
      node {
        id
        title
        handle
        articles(first: 10) {
          edges {
            node {
              id
              title
              handle
              publishedAt
              authorV2 { name }
              excerpt
            }
          }
        }
      }
    }
  }
}
```

### Search

Full-text search products, pages, articles:

```graphql
query {
  search(first: 10, query: "blue shoes", types: [PRODUCT, PAGE, ARTICLE]) {
    edges {
      node {
        __typename
        ... on Product {
          id
          title
          handle
        }
        ... on Page {
          id
          title
          handle
        }
      }
    }
  }
}
```

### Predictive Search

Real-time autocomplete suggestions:

```graphql
query {
  predictiveSearch(
    first: 5
    query: "blu"
    types: [PRODUCT, COLLECTION, ARTICLE, PAGE]
  ) {
    products {
      id
      title
      image { url }
    }
    collections {
      id
      title
    }
    articles {
      id
      title
    }
    pages {
      id
      title
    }
    queries {
      text
      storeSearchUrl
    }
  }
}
```

---

## Cart API

### Create Cart

```graphql
mutation {
  cartCreate(input: {
    lines: [
      {
        merchandiseId: "gid://shopify/ProductVariant/456789"
        quantity: 1
      }
    ]
    discountCodes: ["SUMMER20"]
    buyerIdentity: {
      countryCode: US
      email: "customer@example.com"
    }
  }) {
    cart {
      id
      checkoutUrl
      cost {
        subtotalAmount { amount currency }
        totalAmount { amount currency }
        totalTaxAmount { amount currency }
      }
      lines(first: 10) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                product { title }
                price { amount currency }
              }
            }
          }
        }
      }
    }
    userErrors { message field }
  }
}
```

### Add Lines to Cart

```graphql
mutation {
  cartLinesAdd(cartId: "gid://shopify/Cart/abc123", lines: [
    {
      merchandiseId: "gid://shopify/ProductVariant/789456"
      quantity: 2
    }
  ]) {
    cart {
      id
      lines(first: 10) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                product { title }
              }
            }
          }
        }
      }
    }
    userErrors { message }
  }
}
```

### Update Cart Lines

```graphql
mutation {
  cartLinesUpdate(cartId: "gid://shopify/Cart/abc123", lines: [
    {
      id: "gid://shopify/CartLine/xyz789"
      quantity: 3
    }
  ]) {
    cart {
      id
      lines(first: 10) {
        edges {
          node {
            id
            quantity
          }
        }
      }
    }
    userErrors { message }
  }
}
```

### Remove Cart Lines

```graphql
mutation {
  cartLinesRemove(cartId: "gid://shopify/Cart/abc123", lineIds: [
    "gid://shopify/CartLine/xyz789"
  ]) {
    cart { id }
    userErrors { message }
  }
}
```

### Update Buyer Identity

For international pricing & shipping:

```graphql
mutation {
  cartBuyerIdentityUpdate(
    cartId: "gid://shopify/Cart/abc123"
    buyerIdentity: {
      countryCode: CA
      email: "customer@example.com"
      phone: "+1-555-0000"
      deliveryAddressPreferences: [{
        deliveryAddress: {
          firstName: "John"
          lastName: "Doe"
          address1: "123 Main St"
          city: "Toronto"
          provinceCode: "ON"
          country: "CA"
          zip: "M1A 0A1"
        }
      }]
    }
  ) {
    cart {
      id
      cost {
        totalAmount { amount currency }
        totalTaxAmount { amount currency }
      }
    }
    userErrors { message }
  }
}
```

### Cart Metadata

Add custom cart attributes:

```graphql
mutation {
  cartCreate(input: {
    attributes: [
      { key: "gift_message", value: "Happy Birthday!" }
      { key: "order_type", value: "subscription" }
    ]
  }) {
    cart { id }
  }
}
```

---

## Customer API (Legacy)

### Create Access Token

```graphql
mutation {
  customerAccessTokenCreate(input: {
    email: "customer@example.com"
    password: "password123"
  }) {
    customerAccessToken {
      accessToken
      expiresAt
    }
    userErrors { message field }
  }
}
```

### Get Customer

```graphql
query {
  customer(customerAccessToken: "token123") {
    id
    email
    firstName
    lastName
    phone
    defaultAddress {
      id
      formatted
    }
    addresses(first: 10) {
      edges {
        node {
          id
          formatted
        }
      }
    }
    orders(first: 10) {
      edges {
        node {
          id
          orderNumber
          totalPrice { amount currency }
          processedAt
        }
      }
    }
  }
}
```

### Update Customer

```graphql
mutation {
  customerUpdate(customerAccessToken: "token123", customer: {
    firstName: "Jane"
    lastName: "Doe"
    email: "newemail@example.com"
    phone: "+1-555-1234"
  }) {
    customer { id email }
    userErrors { message field }
  }
}
```

### Create Customer Account

```graphql
mutation {
  customerCreate(input: {
    firstName: "John"
    lastName: "Doe"
    email: "newcustomer@example.com"
    password: "securePassword123"
  }) {
    customer { id email }
    customerUserErrors { message field }
  }
}
```

---

## Localization & International Pricing

### Get Available Countries & Currencies

```graphql
query {
  localization {
    availableCountries {
      isoCode
      name
      currency {
        isoCode
        name
        symbol
      }
      languages {
        isoCode
        name
      }
    }
  }
}
```

### Get Country Info by Code

```graphql
query {
  localization {
    country(isoCode: "CA") {
      isoCode
      name
      currency {
        isoCode
        symbol
      }
      languages {
        isoCode
        name
      }
    }
  }
}
```

### Buyer Localization Context

Set customer context for localized pricing:

```graphql
query @inContext(country: CA) {
  products(first: 5) {
    edges {
      node {
        id
        title
        priceRange {
          minVariantPrice {
            amount
            currency  # Will be CAD
          }
        }
      }
    }
  }
}
```

---

## Metafields & Custom Data

### Query Metafields (Read-Only)

```graphql
query {
  product(id: "gid://shopify/Product/123456") {
    metafield(namespace: "my_app", key: "custom_data") {
      id
      namespace
      key
      value
      type
    }
    metafields(namespace: "my_app", first: 10) {
      edges {
        node {
          key
          value
          type
        }
      }
    }
  }
}
```

### Query Metaobjects

```graphql
query {
  metaobject(id: "gid://shopify/Metaobject/123") {
    id
    type
    handle
    field(key: "title") {
      value
    }
    fields {
      key
      value
    }
  }
}

query {
  metaobjects(type: "author", first: 10) {
    edges {
      node {
        id
        handle
        field(key: "name") { value }
        field(key: "bio") { value }
      }
    }
  }
}
```

**Note:** Metafields must be created in Admin API with `access.storefront: PUBLIC_READ` to be visible in Storefront API. Storefront API is read-only for metafields.

---

## Rate Limits & Access

### Query Complexity

**Tokenless access:** 1,000 complexity limit (same calculation as Admin API)

Example complexity:
- Simple query (3-5 fields): ~10 points
- Paginated query (first: 10): ~50-100 points
- Nested query (product + variants + images): ~200+ points

**Best practices:**
- Limit `first` parameter to 10-20 items
- Request only fields you need
- Use aliases to reduce query size

### Rate Limiting

**No explicit rate limits**, but:
- Shopify enforces query complexity limits
- Exceeding complexity = `430 Shopify Security Rejection` error
- Implement exponential backoff for 430 responses

### Access Tokens

- **Storefront tokens:** Max 100 per shop
- **Token scopes:** Unauthenticated + read scopes only
- **Public storefronts:** Use tokenless access
- **Delegated access:** Create token for specific merchant permissions

---

## Checkout Flow (Legacy)

**Note:** Storefront Checkout API is deprecated. Use **Storefront Cart API** for new implementations.

Old mutation (deprecated):
```graphql
mutation {
  checkoutCreate(input: {
    lineItems: [{
      variantId: "gid://shopify/ProductVariant/123"
      quantity: 1
    }]
  }) {
    checkout {
      id
      webUrl
    }
  }
}
```

**Migration path:** Use `cartCreate()` → get `checkoutUrl` → redirect to Shopify checkout.

---

## Common Patterns

### Product Filtering

```graphql
query {
  products(first: 20, query: "tag:summer vendor:Nike") {
    edges {
      node {
        id
        title
        variants(first: 5, query: "available:true") {
          edges {
            node {
              id
              availableForSale
              price { amount }
            }
          }
        }
      }
    }
  }
}
```

### Pagination

```graphql
query($cursor: String) {
  products(first: 10, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node { id title }
    }
  }
}
```

Variables:
```json
{ "cursor": null }  // First page
// After first page, set cursor to endCursor from previous response
```

### Error Handling

```graphql
mutation {
  cartLinesAdd(cartId: "invalid", lines: []) {
    cart { id }
    userErrors {
      message
      field
    }
  }
}
```

All mutations return `userErrors` array. Always check!

---

## Sources

- [Storefront API Reference](https://shopify.dev/docs/api/storefront/2026-01)
- [Getting Started with Products & Collections](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/getting-started)
- [Create & Manage Carts](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)
- [Manage Customer Accounts](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/customer-accounts)
- [Metafields with Storefront API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/metafields)
- [Building Localized Experiences](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets)
- [Filter Products in Collections](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/products-collections/filter-products)
- [Shopify API Limits](https://shopify.dev/docs/api/usage/limits)
- [Shopify API Authentication](https://shopify.dev/docs/api/usage/authentication)
