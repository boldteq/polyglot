# Core: Configuration Files Reference

> Source: shopify.dev/docs/apps/build/cli-for-apps/app-configuration
> Last extracted: 2026-04-04

## shopify.app.toml (PRIMARY)

Auto-updated by `shopify app dev` and `shopify app config link`. This is the source of truth for your app.

### Required Fields

```toml
scopes = "write_products,read_products,write_orders"  # Comma-separated API scopes
name = "My App"                                        # Display name in Shopify admin
```

### Common Fields

```toml
# Core
client_id = "..."              # Set by Shopify after linking (auto-managed)
api_secret_key = "..."         # Set by Shopify after linking (auto-managed, KEEP PRIVATE)
type = "public|custom"         # public for App Store, custom for single merchant
handle = "my-app"              # Unique app handle (identifier)

# API Version
webhooks.api_version = "2025-01"  # Must be supported (not deprecated within 90 days)

# Webhook Subscriptions (auto-registered on deploy)
[[webhooks.subscriptions]]
topics = ["orders/create", "products/update"]
uri = "https://myapp.example.com/webhooks"

# Billing Configuration (if monetized)
[billing]
# Plans configuration (see billing.server.ts)

# App Embedding
[pos]
embedded = true            # For POS apps

# Include extension configs on deploy
[build]
include_config_on_deploy = ["extensions/*/shopify.extension.toml"]
```

### Webhook Subscription Pattern

```toml
# Individual topics
[[webhooks.subscriptions]]
topic = "orders/create"
uri = "https://myapp.example.com/webhooks/orders"

# Multiple topics (same URI)
[[webhooks.subscriptions]]
topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "https://myapp.example.com/webhooks/gdpr"

# With API version override
[[webhooks.subscriptions]]
topic = "orders/paid"
uri = "https://myapp.example.com/webhooks/orders"
api_version = "2024-10"  # Override global version if needed
```

### Billing Configuration Pattern

```toml
[[billing.monthly_plan]]
name = "Basic"
price = 9.99
terms = "Basic plan with 1000 API calls"

[[billing.monthly_plan]]
name = "Pro"
price = 29.99
terms = "Pro plan with 10000 API calls"

[[billing.monthly_plan]]
name = "Premium"
price = 99.99
terms = "Premium plan with unlimited API calls"
```

## shopify.web.toml (OPTIONAL)

Required ONLY for multi-process setups (backend and frontend on separate processes).

```toml
type = "frontend|backend"
commands.dev = "npm run dev"
commands.build = "npm run build"
port = 3000                # Server port
```

**Use case:** When frontend (Vite) and backend (Node) run as separate processes. Not needed for single-process Remix apps.

## shopify.extension.toml (PER EXTENSION)

Generated automatically via `shopify app generate extension`. One file per extension.

### Minimal Pattern

```toml
type = "admin_block|checkout_ui_extension|theme|function"
targets = ["admin.product-details.block.render"]
name = "My Extension"
description = "What this extension does"
```

### Full Pattern (Admin Action)

```toml
type = "admin_action"
targets = ["admin.product-details.action.render"]
name = "Product Action"
description = "Bulk update product properties"

# Conditional visibility
should_render = "./src/extensions/should-render.js"

# Settings (merchant-configurable)
[settings]
my_field = { type = "string" }
product_ref = { type = "reference", resource = "Product" }
```

### Theme App Extension Pattern

```toml
type = "theme"
targets = ["theme.app.blocks"]
name = "My Theme Block"

[[blocks]]
type = "section"
handle = "my_section"
name = "My Custom Section"
target = "section"
```

## Multiple Configuration Pattern (Staging/Production)

Use file naming: `shopify.app.{config-name}.toml`

```bash
# Staging environment
shopify app dev --config-name=staging

# Production environment
shopify app dev --config-name=production
```

Each configuration maintains separate linking state and credentials.

**File structure:**
```
shopify.app.toml              # Default (primary)
shopify.app.staging.toml      # Staging config
shopify.app.production.toml   # Production config
```

**Use case:** Different API keys, scopes, or webhook URIs per environment without re-linking.

## Metafield TOML Declaration (in shopify.app.toml)

```toml
# App-owned metafield (namespace: $app)
[product.metafields.app.page_count]
type = "number_integer"
description = "Number of pages"

# Multi-line text metafield
[order.metafields.app.shipping_notes]
type = "multi_line_text_field"
description = "Special handling notes"

# JSON metafield
[product.metafields.app.seo_config]
type = "json"
description = "SEO configuration"

# Product reference metafield
[order.metafields.app.assigned_product]
type = "product_reference"
description = "Product assigned to order"
```

## Metaobject TOML Declaration (in shopify.app.toml)

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
  name = "Email"
  handle = "email"
  type = "email"

  [metaobject_definition.capabilities.publishable]
  enabled = true

  [metaobject_definition.capabilities.renderable]
  enabled = true
    [metaobject_definition.capabilities.renderable.theme_template]
    handle = "author"
```

## Environment Variables

**Frontend (.env):**
```
SHOPIFY_API_KEY=your-api-key
SHOPIFY_APP_URL=https://myapp.example.com
```

**Backend (.env):**
```
SHOPIFY_API_SECRET=your-api-secret
DATABASE_URL=postgresql://user:password@localhost/dbname
NODE_ENV=production
```

**Critical:** Never commit `.env` files. Use `.env.example` template.

## API Version Management

**Current stable:** 2025-01 (as of Apr 2026)

**Rules:**
- Must use supported version (not deprecated within 90 days)
- Update `webhooks.api_version` in `shopify.app.toml`
- Pin specific version in code, never "latest"
- Plan migrations ahead of deprecation dates

**Deprecation timeline:**
- Shopify announces deprecation 90 days in advance
- Migrate within that window
- Use `shopify app config set` to update versions

## Configuration Checklist

- [ ] `scopes` defined (minimum required for app functionality)
- [ ] `name` set (display name in admin)
- [ ] `webhooks.api_version` pinned to supported version
- [ ] GDPR webhooks configured (customers/data_request, customers/redact, shop/redact)
- [ ] Billing configuration if monetized (via shopify.app.toml or API)
- [ ] Each extension has `shopify.extension.toml`
- [ ] Multiple configs use naming pattern if needed
- [ ] Metafield declarations in TOML if used
- [ ] Metaobject declarations in TOML if used
- [ ] Environment variables in `.env` (never committed)
