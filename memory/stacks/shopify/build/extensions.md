# Build: Extension Types & Architecture

> Source: shopify.dev/docs/apps/build/app-extensions
> Last extracted: 2026-04-04

## Extension-Only Apps

**Use case:** Apps with NO backend web server — extensions handle all functionality.

**Requirements:**
- Must be custom apps (not public App Store apps)
- No web server required
- Extensions handle all functionality
- Defined entirely via TOML configuration

**Benefits:**
- Simpler deployment (no backend to maintain)
- Faster time-to-market
- Lower operational overhead

**Limitations:**
- Cannot make backend API calls (no server)
- Limited to extension capabilities
- No custom business logic execution

**Common use cases:**
- Theme customizations (app blocks)
- Checkout UI modifications
- Admin block displays
- Function extensions (delivery customizations, payment customizations, discounts)

## All Extension Types

### Admin Extensions

**admin_block**
- Card-like blocks on resource pages (products, orders, customers)
- Inline display, not modal
- Merchants must manually add/pin to page
- Contextual information display
- Uses `AdminBlock` component

**admin_action**
- Modal workflows on resource pages
- Triggered from More actions menu or bulk action menu
- Transactional (not persistent UI)
- Direct API access included
- Uses `AdminAction` component

**admin_ui_extension**
- Full custom components on admin pages
- Render as part of page layout
- More flexible than blocks/actions
- Uses admin extension API

### Storefront Extensions

**theme**
- Theme app blocks (Liquid + JS)
- Merchants add via theme editor (no code)
- Section-specific or app embed blocks
- Dynamic elements without Liquid editing

**checkout_ui_extension**
- Custom checkout functionality
- Web components in isolated sandbox
- Polaris-based components
- Multiple targets throughout checkout flow

### Function Extensions

**discount_function**
- Custom discount logic (Wasm-based)
- Input: cart data
- Output: discount rules
- Rust or JavaScript

**delivery_customization**
- Hide, reorder, rename delivery options
- Filter based on cart/shipping address
- Input: cart, address, delivery methods
- Output: filtered/modified options

**payment_customization**
- Hide, reorder payment methods
- Cannot rename branded methods (Shop Pay, Apple Pay, etc.)
- Input: cart, payment methods
- Output: modified payment list

**cart_transform**
- Modify cart contents
- Add/remove items, apply discounts
- Runs before checkout
- Rust or JavaScript

**validation**
- Block checkout if conditions not met
- Validate cart, addresses, custom fields
- Max 25 per store
- Returns errors with target location

### POS Extensions

**pos_ui_extension**
- Native mobile UI (iOS/Android)
- Tiles, actions, blocks
- Remote-dom based
- Mobile-first design required

### Marketing Extensions

**marketing_activity_extension**
- Marketing automation hooks
- Triggers for customer segments
- Actions for campaigns

## Extension Targets

**Admin targets:**
```
admin.product-details.block.render
admin.product-details.action.render
admin.order-details.block.render
admin.customer-details.action.render
admin.inventory.block.render
```

**Checkout targets:**
```
purchase.checkout.block.render
purchase.checkout.delivery-address.render-after
purchase.checkout.payment-method.render-after
purchase.thank-you.block.render
purchase.thank-you.cart-line-item.render-after
```

**Theme targets:**
```
theme.app.blocks
```

**POS targets:**
```
pos.home.tile.render
pos.product.action.render
pos.post-purchase.block.render
```

## shopify.extension.toml Pattern

```toml
# Required
type = "admin_block|theme|checkout_ui_extension|discount_function|..."
targets = ["admin.product-details.block.render"]
name = "My Extension"
description = "What this extension does"

# Optional: Conditional visibility
should_render = "./src/extensions/should-render.js"

# Optional: Merchant-configurable settings
[settings]
my_setting = { type = "string" }
color_setting = { type = "color" }
product_ref = { type = "reference", resource = "Product" }
```

## File Structure per Extension Type

```
extensions/
├── admin-block-1/
│   ├── shopify.extension.toml
│   ├── src/
│   │   ├── index.ts
│   │   └── AdminBlock.tsx
│   └── package.json
├── checkout-ui-1/
│   ├── shopify.extension.toml
│   ├── src/
│   │   ├── index.ts
│   │   └── CheckoutBlock.tsx
│   └── package.json
├── discount-function/
│   ├── shopify.extension.toml
│   ├── src/
│   │   ├── index.ts
│   │   └── run.ts              # Function entrypoint
│   └── package.json
└── theme/
    ├── shopify.extension.toml
    ├── blocks/
    │   └── my-block.liquid
    ├── assets/
    │   └── my-block.js
    └── locales/
        └── en.default.json
```

## Pitfalls

- **Trying to create extension-only app with custom business logic** — Use a backend server if you need APIs beyond Shopify's
- **Not testing all extension targets** — Each target has different data available; test separately
- **Assuming extension visibility by default** — Admin blocks are opt-in; merchants must enable
- **Using external frameworks in extensions** — Limited to Polaris components (admin/checkout) or remote-dom (POS)
- **Ignoring function timeout constraints** — Functions must complete < 10ms; optimize for speed
- **Nested bundles in product functions** — Not supported; use fixed bundles only
