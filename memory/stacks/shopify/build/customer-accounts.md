# Build: Customer Accounts Extensions

> Source: shopify.dev/docs/apps/build/customer-accounts
> Last extracted: 2026-04-04

## Overview & Security

- **Sandbox isolation:** Extensions run in isolated sandbox, separate from customer account page
- **No sensitive data access:** Cannot access payment info, HTML, or other assets
- **Safe customization:** Secure way to customize Order Index, Order Status, Profile pages
- **Use case:** Primary opportunity for adding functionality to customer journey

## Extension Placement

### Full-Page Extensions

**Targets:**
- `customer-account.page.render` — new page not tied to specific order
- `customer-account.order.page.render` — page tied to specific order

**Constraint:** Cannot use direct linking

**Workaround:** Create order action extension or inline extension as navigation entry point.

### Order Action Extensions

**Targets:**
- `customer-account.order.action.menu-item.render` — renders as 1 order action on Index/Status pages
- `customer-account.order.action.render` — static target; renders inside modal when customer clicks action button

**Behavior:** Order action modal only renders if order action button (menu-item.render) is also implemented.

**Use cases:** Request return, track shipment, download invoice.

### Inline Extensions

**Placement:** Specific locations on Order status page

**Targets:** Multiple `customer-account.order-status.*` targets for before/after sections

**Use cases:** Return tracking, shipping updates, inline context.

## Metafields in Customer Accounts

### Writing Metafields

**Supported objects:** Customer, Order, Company, CompanyLocation (API v2024-07+)

**Namespace requirement:** Custom namespace 2–20 characters

**Update mechanism:** Metafields requested in TOML auto-update when merchandise items change

**Read access:** Available via Order Status API in extension context.

### Metafield Access Pattern

```
1. Define metafield namespace in TOML config
2. Request metafields via extension API
3. On order state change, metafields auto-update
4. Extensions read via Order Status API context
```

## Pitfalls

- **No direct linking** — Full-page extensions require action/inline as navigation entry points
- **Metafield mutation timing** — Changes only trigger on merchandise updates
- **Sandbox limitations** — Cannot manipulate customer account HTML or CSS
- **Pre-auth limitations** — Pre-auth order status extensions have restricted data access
