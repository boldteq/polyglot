# Build: Data Models (Metafields, Metaobjects, Products)

> Source: shopify.dev/docs/apps/build/metafields + shopify.dev/docs/apps/build/metaobjects
> Last extracted: 2026-04-04

## Metafields vs Metaobjects Decision Tree

| Use Case | Metafield | Metaobject |
|----------|-----------|-----------|
| Add single custom value to existing resource | ✓ | |
| Model standalone "object" with multiple fields | | ✓ |
| Complex data structure (nested, relationships) | | ✓ |
| Reference from multiple resources | Via JoinedString | ✓ (native) |
| Merchant-editable in admin | ✓ | ✓ |
| Translatability requirement | ✓ | ✓ |
| SEO/storefront rendering | ✓ | ✓ |

## Metafields

### Ownership Models

**App-owned metafields:**
- Managed entirely by your app
- Namespace: `$app` (reserved prefix)
- Declared in `shopify.app.toml`
- Merchant view-only by default
- Use: App configuration, AI metadata, scoring data

**Merchant-owned metafields:**
- Merchants create and manage
- Custom namespace (2–20 characters)
- Created via Shopify Admin UI
- Full merchant control
- Use: Custom attributes, internal notes

### TOML Declaration

```toml
# App-owned product metafield
[product.metafields.app.page_count]
type = "number_integer"
description = "Number of pages"

# Sub-namespace: app--{id}--analytics
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

# List of values (JoinedString with "|" separator)
[product.metafields.app.related_ids]
type = "joined_string"
description = "Related product IDs"

# Product reference
[order.metafields.app.assigned_product]
type = "product_reference"
description = "Product assigned to order"
```

### Data Types

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

### GraphQL Operations

```graphql
# Write metafield
mutation {
  metafieldsSet(ownerId: "gid://shopify/Product/123", metafields: [
    {
      namespace: "$app"
      key: "page_count"
      value: "42"
      type: "number_integer"
    }
  ]) {
    metafields { id }
    userErrors { message }
  }
}

# Read metafield
query {
  product(id: "gid://shopify/Product/123") {
    metafield(namespace: "$app", key: "page_count") {
      value
    }
  }
}
```

### Pitfalls

- **Type validation** — Submitted values must match declared type
- **Namespace conflicts** — Only `$app` reserved; prevent merchant collisions
- **Performance** — Filtering on metafields is expensive; avoid heavy queries
- **Version control** — Schema changes deploy incrementally

## Metaobjects

### Capabilities

**Publishable:**
- Status: DRAFT | ACTIVE
- Merchants stage content before publication
- Use: Content publishing workflows

**Translatable:**
- Translation API support
- Compatible with Translate & Adapt app
- All fields marked translatable
- Use: Multi-language storefronts

**Renderable:**
- Adds SEO metadata (title, description, slug)
- Accessible via Liquid and Storefront API
- Enables storefront rendering
- Use: SEO-friendly custom pages

**Online Store:**
- Assigns theme template for URL rendering
- Defines custom URL paths
- Accessible as web pages in online store
- Use: Custom landing pages, content hubs

### TOML Declaration

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

    [metaobject_definition.capabilities.renderable.theme_template]
    handle = "author"

  # Capability: Translatable
  [metaobject_definition.capabilities.translatable]
  enabled = true
```

### GraphQL Operations

```graphql
# Create metaobject
mutation {
  metaobjectCreate(input: {
    type: "author"
    fields: [
      { key: "name", value: "Jane Doe" }
      { key: "email", value: "jane@example.com" }
      { key: "bio", value: "Expert writer" }
    ]
  }) {
    metaobject { id }
    userErrors { message }
  }
}

# Query metaobject
query {
  metaobject(id: "gid://shopify/Metaobject/123") {
    type
    handle
    fields {
      key
      value
    }
  }
}
```

### Constraints

- **Max 25 definition changes per deploy** — Cannot CRUD > 25 definitions
- **Handle immutability** — Cannot be changed after creation
- **Field type immutability** — Cannot change existing field types
- **No field deletion** — Deprecate fields instead (preserves data)

## Product Hierarchy

**3-tier model:**
```
Product (e.g., T-Shirt)
├── Option 1: Color (Black, White, Red)
├── Option 2: Size (S, M, L)
└── Option 3: Fit (Slim, Regular) [optional]
    └── Variants (purchasable SKUs)
        ├── Black / S / Slim
        ├── Black / S / Regular
        └── ... (combinations)
```

### Constraints

| Aspect | Limit |
|--------|-------|
| Max options per product | 3 |
| Max variants per product | 100 (default) or 2048 (with advanced features) |
| Max option values | Unlimited |
| Max variant combinations | Min(options × values, 2048) |

### Bulk Variant Creation

```graphql
mutation {
  productVariantsBulkCreate(productId: "gid://shopify/Product/123", variants: [
    {
      optionValues: [
        { name: "Color", value: "Black" }
        { name: "Size", value: "S" }
      ]
    }
    {
      optionValues: [
        { name: "Color", value: "Black" }
        { name: "Size", value: "M" }
      ]
    }
  ]) {
    productVariants { id sku }
    userErrors { message }
  }
}
```

Supports up to 2048 variants in single operation.

## Product Bundles

**Fixed bundles** (Shopify native):
- Standard and Multipack variants
- Up to 30 component products
- Up to 3 bundle options
- Fits within variant limits

**Customized bundles** (Third-party apps):
- Mix-and-match, complex compositions
- Exceed variant limits
- Merchant-configurable at checkout

### Bundle Consolidation

```graphql
mutation {
  productBundleCreate(productId: "gid://shopify/Product/123", components: [
    {
      productId: "gid://shopify/Product/456"
      consolidatedOptions: true  # Maps multiple options to one selection
    }
  ]) {
    bundle { id }
    userErrors { message }
  }
}
```

## Catalogs & Visibility

Products must be published in ≥1 catalog to be visible.

```graphql
mutation {
  catalogCreate(input: {
    title: "US Market"
    type: "SHOP"
  }) { catalog { id } }
}

mutation {
  catalogPublish(catalogId: "gid://shopify/Catalog/123", input: {
    products: ["gid://shopify/Product/456"]
  }) {
    publicationIds
  }
}
```

**Visibility rules:**
- Publication catalog controls product visibility
- Price list defines price adjustments
- Customer sees lowest price across catalogs
- Context segmentation per market/company/app

## Pitfalls

- **Exceeding variant limit with bundles** — Use consolidation or fixed bundles
- **Nested bundles not supported** — Create single-level bundles only
- **Forgetting metafield type validation** — Mismatched types fail GraphQL mutation
- **Assuming all products published** — Must explicitly publish to catalog
