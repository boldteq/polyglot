# Shopify Build Phase: Admin & Checkout Extensibility (Extract 2)

**Date:** 2026-04-04
**Scope:** Admin UI extensions, Checkout UI extensions, Shopify Functions, Discounts
**Sources:** shopify.dev official documentation

---

## 1. APPS IN ADMIN

### 1.1 Admin Actions (Modal-Based Workflows)

**What:** Admin actions are UI extensions that create transactional workflows on existing Shopify admin pages. They render as modals triggered from the More actions menu or bulk action menus.

**Key Rules:**
- Required component: `AdminAction` (configures title, primary/secondary actions)
- Triggers: "More actions" menu on resource pages OR bulk action menu (when resources selected)
- No persistent UI—modal-only workflow
- Direct API access included (GraphQL calls without backend proxy)
- Can launch admin actions directly from admin blocks (nested modal workflows)

**Extension Targets Examples:**
- `admin.abandoned-checkout-details.action.render`
- `admin.catalog-details.action.render`
- `admin.customer-details.action.render`
- `admin.draft-order-details.action.render`
- `admin.order-details.action.render`

**Common Pitfalls:**
- Assuming persistent state across modal closes—modals are ephemeral
- Trying to use `AdminAction` for non-transactional UI (use admin blocks instead)

**Resources:**
- [About admin UI extensions](https://shopify.dev/docs/apps/build/admin/actions-blocks)
- [Build an admin action UI extension](https://shopify.dev/docs/apps/build/admin/actions-blocks/build-admin-action)
- [AdminAction component](https://shopify.dev/docs/api/admin-extensions/latest/polaris-web-components/settings-and-templates/adminaction)

---

### 1.2 Admin Blocks (Inline Cards on Resource Pages)

**What:** Admin blocks are inline cards embedded directly on resource detail pages (products, orders, customers, etc.). Merchants must manually add/pin them to their page.

**Key Rules:**
- Component: `AdminBlock` enables inline rendering with auto height management
- Appears on resource detail pages (product, order, customer, draft order, etc.)
- Merchants control placement and visibility via page editor
- Can display contextual info, modify data inline, view/edit simultaneously with native fields
- Supports expansion controls and overflow handling

**Use Cases:**
- Display custom product data, recommendations on product pages
- Show shipping tracking, fulfillment status, order metafields on order pages
- Present customer analytics, loyalty info on customer pages

**Extension Targets Examples:**
- `admin.product-details.block.render`
- `admin.order-details.block.render`
- `admin.customer-details.block.render`
- `admin.inventory.block.render`

**Common Pitfalls:**
- Assuming blocks are always visible (they're optional—merchants must enable them)
- Using for transactional workflows (use admin actions instead)
- Expecting persistent state changes without saving

**Resources:**
- [About admin UI extensions](https://shopify.dev/docs/apps/build/admin/actions-blocks)
- [Build an admin block UI extension](https://shopify.dev/docs/apps/build/admin/actions-blocks/build-admin-block)
- [Admin block component API](https://shopify.dev/docs/api/admin-extensions/latest/web-components/settings-and-templates/admin-block)

---

### 1.3 Admin Print Actions

**What:** Print actions enable printing documents (HTML, PDFs, images) directly from order and product pages. Found under Print menu (not More actions).

**Key Rules:**
- Component: `AdminPrintAction` (denotes URL to print)
- Targets: Order details page, product details page, selection pages for both
- Serve printable documents from app backend
- Must return valid HTML, PDF, or image URL
- Renders interface for merchants to select which documents to print

**Supported Document Types:**
- HTML pages
- PDFs
- Images

**Use Cases:**
- Packing slips (order page)
- Invoices (order page)
- Product information sheets (product page)
- Custom labels, barcodes

**Extension Targets:**
- `admin.order-details.print-action.render`
- `admin.product-details.print-action.render`
- `admin.orders-selection.print-action.render`
- `admin.products-selection.print-action.render`

**Common Pitfalls:**
- Returning invalid MIME types (stick to PDF, HTML, or image)
- Long-running backend rendering (keep timeout < 30s)
- Not handling failed document generation

**Resources:**
- [Build an admin print action UI extension](https://shopify.dev/docs/apps/build/admin/actions-blocks/build-admin-print-action)
- [AdminPrintAction component](https://shopify.dev/docs/api/admin-extensions/latest/components/other/adminprintaction)
- [Print Action Extension API](https://shopify.dev/docs/api/admin-extensions/latest/target-apis/core-apis/print-action-extension-api)

---

### 1.4 Connect Admin Extensions to App Backend

**What:** Admin UI extensions (actions, blocks, print actions) can call your app's backend via `fetch()`. The extension automatically manages auth headers, session tokens, and path resolution.

**Key Rules:**
- Use `fetch()` in extension code
- Session tokens expire every minute → always fetch new token before backend call
- Extension automatically adds `Authorization` header
- Relative paths resolve against app's `app_url`
- Form component provides state management and direct API access

**Session Token Flow:**
1. Call session token API from extension
2. Receive token (1 min TTL)
3. Include in `Authorization` header for backend request
4. Backend validates token with Shopify API

**Direct API Access:**
- Admin actions get direct GraphQL access (no backend proxy required)
- Faster response, better UX
- Session tokens automatically included

**Common Pitfalls:**
- Reusing expired tokens (always fetch fresh)
- Hardcoding auth logic (use session token API)
- Missing CORS headers on backend endpoints
- Assuming token persists across modal closes

**Resources:**
- [Connect UI extensions to backend](https://shopify.dev/docs/apps/build/admin/actions-blocks/connect-app-backend)
- [Block Extension API](https://shopify.dev/docs/api/admin-extensions/latest/target-apis/core-apis/block-extension-api)
- [Action Extension API](https://shopify.dev/docs/api/admin-extensions/latest/target-apis/core-apis/action-extension-api)

---

### 1.5 Hide Admin UI Extensions (Conditional Visibility)

**What:** Use a `shouldRender` script to conditionally show/hide admin action menu items. Runs after page load; doesn't maintain state.

**Key Rules:**
- Companion targets control visibility (e.g., `admin.abandoned-checkout-details.action.should-render`)
- Script evaluates per-page context (product variants, order status, etc.)
- Returns boolean to show/hide in More actions menu
- Each action target has matching `should-render` companion

**Implementation:**
```toml
# shopify.app.toml
[[extensions]]
type = "admin_action"
target = "admin.product-details.action.render"
should_render = "./src/extensions/should-render.js"
```

**Example Logic:**
```javascript
// Show action only if product has multiple variants
export function shouldRender(input) {
  const variantCount = input.admin.product.variants.length;
  return variantCount > 1;
}
```

**Companion Target Naming Pattern:**
- Action: `admin.{resource}.action.render`
- Visibility: `admin.{resource}.action.should-render`

**Common Pitfalls:**
- Logic referencing unavailable fields (check input schema first)
- Trying to maintain state (script re-runs on page load)
- Complex queries that timeout (keep logic simple)

**Resources:**
- [Hide admin UI extensions](https://shopify.dev/docs/apps/build/admin/actions-blocks/hide-extensions)
- [Targets overview](https://shopify.dev/docs/api/admin-extensions/latest/extension-targets)

---

## 2. APPS IN CHECKOUT

### 2.1 Checkout UI Extensions: Components & Targets

**What:** Checkout UI extensions let developers build custom functionality at defined checkout flow points (cart, information, shipping, payment, order summary, Shop Pay, thank you, order status). Extensions run in isolated sandbox.

**Key Rules:**
- Web components (not React directly)
- Polaris-based components inherit merchant brand settings
- CSS cannot be altered or overridden
- Targets are predefined (static & block types)
- Max component count depends on target (varies)

**Target Types:**

**Static Targets** (tied to core checkout features):
- `purchase.checkout.contact-information`
- `purchase.checkout.shipping-method-selection`
- `purchase.checkout.order-summary.cart-line-item`
- `purchase.checkout.payment-method`
- `purchase.thank-you.cart-line-item`

**Block Targets** (render anywhere):
- `purchase.checkout.block.render` (any checkout page)
- `purchase.thank-you.block.render` (thank you page)
- `customer-account.order-status.block.render` (order status)
- Multiple placements per block target

**Key Components:**
- Text, Image, Button, Checkbox, TextBlock
- Banner, Choice, Select, TextField, Heading
- ChoiceList, Divider, Link, List
- Form (with validation, direct API access)

**Rules for Components:**
- All inherit merchant brand (fonts, colors, spacing)
- No CSS overrides allowed
- Performance critical (runs in checkout context)
- Must validate input locally before submission

**Shopify Plus Requirement:**
- Information & shipping steps checkout extensions: **Shopify Plus only**
- Block extensions elsewhere: available to all plans

**Common Pitfalls:**
- Trying to override brand colors/fonts (impossible—honor merchant brand)
- Rendering too much content (performance matters for checkout)
- Missing client-side validation (server validates, but UX is poor without client)

**Resources:**
- [Checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions/latest)
- [Targets overview](https://shopify.dev/docs/api/checkout-ui-extensions/latest/extension-targets-overview)
- [Components](https://shopify.dev/docs/api/checkout-ui-extensions/latest/components)

---

### 2.2 Cart & Checkout Validation (Server-Side)

**What:** Validation functions run on Shopify servers and block checkout progress when business rules aren't met. Implemented as Shopify Functions.

**Key Rules:**
- Max 25 validation functions per store
- Server-side runs before checkout completion
- Can block checkout with error messages
- Can validate billing address and PO numbers (as of API v2026-04)
- Targets: `purchase.checkout.block`, `purchase.thank-you.block`

**Use Cases:**
- Enforce order limits for new customers
- Block shipping to restricted locations
- Validate loyalty program rules
- Require PO numbers for B2B orders
- Block prohibited billing countries

**Error Targets (where validation errors display):**
- `payments` (payment section)
- `shipping-address` (shipping address)
- `billing-address` (billing address)
- `po-number` (purchase order field)

**Input Query Example:**
```graphql
query Input {
  cart {
    buyerIdentity {
      countryCode
    }
    lines {
      quantity
      merchandise {
        product {
          title
        }
      }
    }
  }
}
```

**Output:**
```json
{
  "errors": [
    {
      "message": "Minimum order value not met",
      "target": "cart"
    }
  ]
}
```

**Client-Side Validation (Checkout UI Extensions):**
- Collect input via extension UI
- Use `buyerJourney` intercept to block progress
- Show validation error message
- More flexible but depends on user interaction

**Common Pitfalls:**
- Validation functions that timeout (>10s)
- Returning errors after order created (validate earlier)
- Duplicating same validation in function + client UI
- Not considering express checkout (Shop Pay, PayPal, Google Pay)

**Resources:**
- [About cart and checkout validation](https://shopify.dev/docs/apps/build/checkout/cart-checkout-validation)
- [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation)
- [Create checkout validation](https://shopify.dev/docs/apps/build/checkout/cart-checkout-validation/create-checkout-validation)

---

### 2.3 Delivery & Shipping Functions (Shopify Plus)

**What:** Customize delivery options (hide, reorder, rename) in checkout using Shopify Functions. Native delivery methods: shipping to address, local pickup, pickup points.

**Key Rules:**
- Shopify Plus only for custom apps
- Public app functions available on any plan
- Delivery Customization Function API used
- Input: cart, shipping address, delivery methods
- Output: filtered/reordered delivery options

**Delivery Methods:**
- Shipping to address (street address)
- Local pickup (single location)
- Shipping to pickup point (third-party location)

**Pickup Points Availability:**
- Shopify Plus plan only
- Available by request (contact: pickup-point-generator-early-access@shopify.com)
- Requires location with pickup enabled in admin
- Each pickup point: address, business hours, cost

**Function Input Query:**
```graphql
query Input {
  cart {
    deliveryGroups {
      deliveryAddress {
        countryCode
        postalCode
      }
    }
  }
  presentmentCurrencyCode
}
```

**Use Cases:**
- Hide delivery methods for restricted regions
- Reorder by speed/cost
- Add custom text to delivery option names
- Filter based on cart content (e.g., no shipping for local-only products)

**UX for Delivery:**
- Merchant controls option presentation
- Customers see filtered/ordered options in checkout
- Local pickup & pickup points must be enabled separately

**Common Pitfalls:**
- Assuming custom apps work on all plans (Shopify Plus only)
- Not enabling pickup points in admin first
- Function timeout > 1s (performance critical)
- Returning empty delivery options (blocks checkout)

**Resources:**
- [About delivery and shipping functions](https://shopify.dev/docs/apps/build/checkout/delivery-shipping)
- [Build the delivery options function](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/delivery-options/build-function)
- [Generate pickup points](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/delivery-methods/generate-pickup-points)
- [Delivery Customization Function API](https://shopify.dev/docs/api/functions/latest/delivery-customization)

---

### 2.4 Payment Customizations

**What:** Hide, reorder, and rename payment options in checkout using Shopify Functions.

**Key Rules:**
- Max 25 payment customization functions per store
- Cannot rename branded payment methods (Shop Pay, Apple Pay, Google Pay, wallets, gift cards)
- Cannot change logo-based payment names
- Only affects merchant-configurable payment methods

**Use Cases:**
- Hide payment methods for specific regions
- Reorder by merchant preference
- Add context text to payment options
- Filter based on order amount (e.g., hide for orders < $10)

**Function Input:**
```graphql
query Input {
  cart {
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
    }
    buyerIdentity {
      countryCode
    }
  }
  paymentMethods {
    name
    id
  }
}
```

**Output:**
```json
{
  "operations": [
    {
      "hide": {
        "paymentMethodId": "gid://shopify/PaymentMethod/1234"
      }
    }
  ]
}
```

**Limitations:**
- Branded payment methods immutable (Shop Pay, Apple Pay, Google Pay)
- Gift card payment field cannot be renamed
- All wallet payment methods are branded
- Order-level discounts affect payment UI (discounts apply first)

**Payment Customization UI:**
- Built with Checkout UI extensions (limited targets)
- Or React Router app (full custom UI)
- Or Admin UI extensions (merchant config)

**Common Pitfalls:**
- Trying to rename Shop Pay / Apple Pay (will fail)
- Removing all payment methods (blocks checkout)
- Function timeout > 1s (performance critical)
- Not testing with express checkout methods

**Resources:**
- [Build payment customizations](https://shopify.dev/docs/apps/checkout/payment-customizations)
- [Create the payments function](https://shopify.dev/docs/apps/build/checkout/payments/create-payments-function)
- [Payment Customization UI](https://shopify.dev/docs/apps/checkout/payment-customizations/ui)

---

### 2.5 Product Offers (Pre-Purchase & Post-Purchase)

**What:** Additional sales opportunities shown before (pre-purchase) or after (post-purchase) checkout completion.

#### **Pre-Purchase Offers**

**Key Rules:**
- Shopify Plus only
- Displayed before checkout completion
- Can increase average order value (AOV)
- Implemented as Checkout UI extension
- Merchants control placement in checkout editor

**Use Cases:**
- Bundle recommendations before payment
- Premium upgrade offers
- Add-on products (warranty, services)

**Common Pitfalls:**
- Overloading with too many options (cognitive overload)
- Blocking checkout flow (must have dismiss option)
- Not optimizing for mobile UX

**Resources:**
- [About product offers](https://shopify.dev/docs/apps/build/checkout/product-offers)
- [Build a pre-purchase product offer](https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-pre-purchase-offer)
- [UX for pre-purchase product offers](https://shopify.dev/docs/apps/build/checkout/product-offers/ux-for-pre-purchase-product-offers)

#### **Post-Purchase Offers**

**Key Rules:**
- Post-purchase page appears after order confirmed, before thank you page
- Limited availability (requires access request)
- Different UX rules apply (no forced upsells)
- Can significantly boost revenue

**UX Rules:**
- Maximum 3 consecutive upsell offers
- Be transparent about all costs
- Clear accept/decline options
- No pressure tactics
- Respect customer's choice to decline

**Common Pitfalls:**
- More than 3 sequential upsells (customer frustration)
- Hidden pricing (must disclose all costs upfront)
- Aggressive persuasion (high bounce rates)
- Not optimizing conversion (test variants)

**Resources:**
- [UX for post-purchase product offers](https://shopify.dev/docs/apps/build/checkout/product-offers/ux-for-post-purchase-product-offers)
- [Build a post-purchase product offer](https://shopify.dev/docs/apps/build/checkout/product-offers/build-a-post-purchase-offer)

---

### 2.6 Thank You & Order Status Page Customization

**What:** Customize the post-purchase thank you page and order status page (shown when revisiting checkout URL) using Checkout UI extensions.

**Key Rules:**
- Thank you page: Initial purchase confirmation
- Order status page: Revisit later (same URL, different view)
- Both use Checkout UI extensions (block targets)
- Extensions persist across page refreshes
- Merchants control placement via checkout editor

**Extension Targets:**
- `purchase.thank-you.block.render` (thank you page)
- `customer-account.order-status.block.render` (order status page)
- `purchase.thank-you.cart-line-item.render-after` (per-item customization)
- `customer-account.order-status.cart-line-item.render-after` (per-item status)

**Use Cases:**
- Add survey forms (collect feedback)
- Display tracking info
- Cross-sell/upsell recommendations
- Loyalty program enrollment
- Download digital products
- Live fulfillment updates

**Availability:**
- Shopify Plus for checkout customization (as of 2023-11-07)
- Block extensions render regardless of checkout layout

**Merchant Control:**
- Placement via checkout editor (merchants can position anywhere)
- Remove extensions without code changes
- Test with checkout layout switcher (one-page vs three-page)

**Common Pitfalls:**
- Assuming persistent state (page refresh clears unless saved)
- Blocking page with required actions (users want quick confirmation)
- Not responsive on mobile
- Long-running operations (timeout)

**Resources:**
- [About Thank you and Order status page customization](https://shopify.dev/docs/apps/build/checkout/thank-you-order-status)
- [Add a survey to Thank you and Order status pages](https://shopify.dev/docs/apps/build/checkout/thank-you-order-status/add-survey)
- [UX for Thank you and Order status pages](https://shopify.dev/docs/apps/build/checkout/thank-you-order-status/ux-for-thank-you-order-status)

---

### 2.7 Multi-Page Checkout Extensions

**What:** Extensions that work across multiple checkout pages (cart page, checkout, thank you, order status) using combined targets.

**Key Rules:**
- Use multiple targets in single extension config
- Cart line item customization: `purchase.checkout.cart-line-item.render-after`
- Thank you: `purchase.thank-you.cart-line-item.render-after`
- Order status: `customer-account.order-status.cart-line-item.render-after`
- Same extension code, different contexts

**Target Combination Pattern:**
```toml
[[extensions.targets]]
module = "./src/checkout-item.tsx"
target = "purchase.checkout.cart-line-item.render-after"

[[extensions.targets]]
module = "./src/thank-you-item.tsx"
target = "purchase.thank-you.cart-line-item.render-after"

[[extensions.targets]]
module = "./src/order-status-item.tsx"
target = "customer-account.order-status.cart-line-item.render-after"
```

**Checkout Layout Testing:**
- Default: Three-page checkout (cart, checkout, thank you)
- Settings > Checkout layout > One-page checkout (toggle to test)
- Extensions must handle both layouts

**Context Differences:**
- **Checkout page:** Can modify cart (add/remove items, update quantities)
- **Thank you page:** Read-only (order confirmed)
- **Order status page:** Read-only (order fulfillment view)

**Common Pitfalls:**
- Using same code for write operations on read-only pages (error)
- Not testing both checkout layouts (UX differs)
- Assuming same component tree (context differs per page)

**Resources:**
- [Create multi-page extensions](https://shopify.dev/docs/apps/build/checkout/create-multi-page-extensions)
- [Test checkout UI extensions](https://shopify.dev/docs/apps/build/checkout/test-checkout-ui-extensions)

---

### 2.8 Pickup Points

**What:** Third-party locations where customers can pick up orders instead of shipping to home address.

**Key Rules:**
- Shopify Plus plan only
- Available by request (pickup-point-generator-early-access@shopify.com)
- Requires custom app on development store or Plus plan
- Each pickup point includes: address, business hours, pickup cost
- Generated via Pickup Point Delivery Option Generator Function

**Prerequisites:**
- Location enabled in admin: Settings > Shipping and delivery > Pickup points
- At least one location with pickup points enabled
- Function subscription required (request access)

**Function API:**
- Input: cart, delivery address, store locations
- Output: array of available pickup points with details

**Pickup Point Structure:**
```json
{
  "location": "New York Store",
  "address": {
    "address1": "123 Main St",
    "city": "New York",
    "provinceCode": "NY",
    "countryCode": "US",
    "postalCode": "10001"
  },
  "businessHours": [
    {
      "dayOfWeek": "MONDAY",
      "openingTime": "09:00",
      "closingTime": "17:00"
    }
  ],
  "pickupCost": {
    "amount": "0.00",
    "currencyCode": "USD"
  }
}
```

**UX Requirements:**
- Merchants control pickup point visibility
- Map display recommended (location context)
- Show business hours to customers
- Display pickup cost transparently

**Common Pitfalls:**
- Requesting access without proper plan (requires Plus)
- Returning locations without pickup enabled (error)
- Function timeout on large location lists
- Not considering closed hours (UX issues)

**Resources:**
- [Generate pickup points](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/delivery-methods/generate-pickup-points)
- [UX for pickup points](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/delivery-methods/ux-for-pickup-points)
- [Pickup Point Delivery Option Generator Function API](https://shopify.dev/docs/api/functions/unstable/pickup-point-delivery-option-generator)

---

## 3. SHOPIFY FUNCTIONS

### 3.1 What Are Shopify Functions?

**What:** Shopify Functions allow customization of backend logic during checkout and order workflows. They are WebAssembly (Wasm) modules that run on Shopify servers.

**Key Rules:**
- Compile to WebAssembly (supports any Wasm-compatible language)
- Run on Shopify infrastructure (not your server)
- Multi-call executables with exports mapped to extension targets
- Sub-10ms latency required (performance critical)
- No external network access by default (can be added with caution)

**Execution Model:**
- Function module runs in Wasm sandbox
- Shopify provides input data (GraphQL query result)
- Function processes and returns JSON output
- Output applied to checkout/order state

**Why Wasm:**
- Fast (compiled, not interpreted)
- Secure (sandboxed)
- Language-agnostic (any language that compiles to Wasm)
- Predictable performance

**Supported Languages:**
- **Rust** (recommended for performance)
- **JavaScript/TypeScript** (via Javy runtime, ~40% slower than Rust)
- **Zig, TinyGo, C** (less common)

**Common Pitfalls:**
- Underestimating performance constraints (< 10ms timeout)
- Assuming access to external APIs (no by default)
- Writing in JavaScript expecting native performance (Rust is 2-3x faster)
- Large input queries (timeouts on big carts)

**Resources:**
- [About Shopify Functions](https://shopify.dev/docs/apps/build/functions)
- [WebAssembly for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/webassembly-for-functions)
- [Language considerations](https://shopify.dev/docs/apps/build/functions/programming-languages)

---

### 3.2 Function APIs (Overview & Constraints)

**What:** Function APIs define the input schema, output operations, and targets for different checkout/order workflows.

**Core Function APIs:**

#### **Discount Function API**
- Applies discounts across product, order, and shipping
- Input: cart, discount metafields
- Output: discount operations (fixed amount, percentage, fixed amount per line)
- Single function can apply multiple discount classes
- Max discount cap: enforced per operation

#### **Cart Transform Function API**
- Modify cart item prices, titles, images, bundles
- Input: cart, current prices
- Output: transform operations (price update, attribute update)
- Max 1 cart transform per store
- Cannot create new line items (price transforms only)

#### **Cart and Checkout Validation Function API**
- Block checkout when business rules violated
- Input: cart, buyer identity, delivery address, PO number
- Output: validation errors with target location
- Max 25 validations per store
- Supports express checkout validation

#### **Delivery Customization Function API**
- Hide, reorder, rename delivery options
- Input: cart, shipping address, available delivery methods
- Output: hide/reorder operations
- Shopify Plus only (custom apps)

#### **Payment Customization Function API**
- Hide, reorder, rename payment methods
- Input: cart, available payment methods
- Output: hide/reorder operations
- Max 25 customizations per store

#### **Discount Function Allocator** (advanced)
- Custom discount allocation logic
- Distributes discount across multiple cart lines
- Used in complex discount scenarios

**Function Sequencing (Execution Order):**
1. Discount functions run (all registered)
2. Cart transform (max 1) applies price changes
3. Delivery customization filters options
4. Payment customization filters methods
5. Validation functions block checkout

**Limits Across All APIs:**
| Constraint | Limit |
|-----------|-------|
| Function execution time | < 10ms (strict) |
| Discount functions per store | 25 max |
| Payment customizations per store | 25 max |
| Validation functions per store | 25 max |
| Cart transforms per store | 1 max |
| Input query complexity | Reasonable (no massive nested queries) |

**Common Pitfalls:**
- Blocking checkout in wrong sequence (validate last)
- Input query too large (timeout)
- Function exceeds 10ms (performance)
- Applying discount operation with invalid syntax

**Resources:**
- [Function APIs](https://shopify.dev/docs/api/functions/latest)
- [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation)
- [Discount Function API](https://shopify.dev/docs/api/functions/latest/discount)
- [Cart Transform Function API](https://shopify.dev/docs/api/functions/latest/cart-transform)

---

### 3.3 Function Input & GraphQL Queries

**What:** Each function target specifies an input query (GraphQL) that defines what data the function receives.

**Input Query Structure:**
- Defined in `run.graphql` file
- Customizable per function target
- Shopify executes query, passes JSON result to function
- Input variables supported (from metafields)

**Available Data (Context):**
- Cart data (lines, totals, buyer identity)
- Product data (title, handle, metafields)
- Delivery data (addresses, methods)
- Metafields (custom data on function owner)

**Input Query Example (Discount Function):**
```graphql
query Input($owner: ID!) {
  discountNode(id: $owner) {
    discount {
      ... on DiscountAutomaticApp {
        title
        configuration {
          metafield(namespace: "discount" key: "percentage") {
            value
          }
        }
      }
    }
  }
  cart {
    lines {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          product {
            title
          }
        }
      }
      cost {
        subtotalAmount {
          amount
        }
      }
    }
  }
}
```

**Metafields in Input Queries:**
- Access function owner metafields via `discountNode` or `functionOwner`
- Merchants set metafield values in admin
- Common use: configuration stored in metafields

**Input Variables:**
- Populated from JSON metafield on function owner
- Variable name must match metafield structure
- Example: metafield `{"discountPercentage": 10}` → `$discountPercentage` variable

**Query Optimization Tips:**
- Request only required fields (unused fields timeout)
- Avoid deep nesting (performance)
- Don't query all cart lines if filtering by tag (use filters in query)
- Metafield queries can be slow (cache when possible)

**Common Pitfalls:**
- Query timeout because asking for too much data
- Accessing fields not available in function context
- Variable name mismatch (typo → null value)
- Assuming metafield exists (must handle null)

**Resources:**
- [About Function input and output](https://shopify.dev/docs/apps/build/functions/input-output)
- [Use variables in input queries](https://shopify.dev/docs/apps/build/functions/input-queries/use-variables-input-queries)
- [Metafields for input queries](https://shopify.dev/docs/apps/build/functions/input-queries/metafields-for-input-queries)

---

### 3.4 Rust vs JavaScript for Functions

**What:** Two primary languages for Shopify Functions with different performance/complexity tradeoffs.

#### **Rust**
**Pros:**
- ~2-3x faster than JavaScript (critical for large carts)
- Compiled to native Wasm (zero-cost abstractions)
- Strong type safety (catches errors at compile time)
- Recommended for production

**Cons:**
- Steeper learning curve
- Slower initial development

**Best For:**
- High-performance discount/validation functions
- Complex business logic with large carts
- Functions with strict latency requirements

**Example Rust Pattern:**
```rust
use shopify_function::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Input {
  pub cart: Cart,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Cart {
  pub lines: Vec<CartLine>,
}

pub fn function(input: Input) -> Vec<Operation> {
  // Return discount/validation operations
  vec![Operation { ... }]
}
```

#### **JavaScript**
**Pros:**
- Faster development cycle
- Familiar syntax for web devs
- Adequate performance for many use cases
- ~40% faster as of Shopify CLI 3.67 + Javy 3.1

**Cons:**
- Slower than Rust (dynamic typing, runtime overhead)
- Risk of timeout on very large carts
- Less type safety

**Best For:**
- Rapid prototyping
- Simpler logic (basic discounts, simple validations)
- Small-to-medium cart sizes

**Example JavaScript Pattern:**
```javascript
export function run(input) {
  const { cart } = input;

  const lineItems = cart.lines.map(line => {
    return {
      id: line.id,
      quantity: line.quantity,
    };
  });

  return [{
    discountApplicationStrategy: "ALL",
    discounts: [{
      targets: {
        lineItem: { id: "gid://..." },
      },
      value: {
        percentageValue: 10,
      },
    }],
  }];
}
```

**Performance Comparison:**
| Metric | Rust | JavaScript |
|--------|------|-----------|
| Compilation | ~5-10s | Instant (interpreted) |
| Runtime (simple) | < 1ms | ~3-5ms |
| Runtime (complex) | 2-5ms | 5-10ms |
| Memory usage | Minimal | Moderate |
| Timeout risk (large cart) | Low | High |

**Migration Path:**
- Start with JavaScript for rapid iteration
- Migrate to Rust if performance issues emerge
- Use Rust libraries (shopify_function crate) for type safety

**Common Pitfalls:**
- JavaScript timeout on carts > 500 items (use Rust instead)
- Not using types (TypeScript helps, but still slower)
- Assuming performance parity (Rust is measurably faster)

**Resources:**
- [Rust for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/rust-for-functions)
- [JavaScript for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/javascript-for-functions)
- [Language considerations](https://shopify.dev/docs/apps/build/functions/programming-languages)

---

### 3.5 Testing Shopify Functions

**What:** Unit, integration, and local testing strategies for validating function logic before deployment.

#### **Unit Testing**

**Rust (cargo test):**
```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_discount_calculation() {
    let input = Input {
      cart: Cart {
        lines: vec![CartLine {
          id: "1",
          quantity: 2,
        }],
      },
    };

    let result = function(input);
    assert_eq!(result.len(), 1);
  }
}
```

**JavaScript (Vitest):**
```javascript
import { describe, it, expect } from 'vitest';
import { run } from './function.js';

describe('discount function', () => {
  it('applies 10% discount', () => {
    const input = {
      cart: {
        lines: [{ id: '1', quantity: 2 }],
      },
    };

    const result = run(input);
    expect(result).toHaveLength(1);
  });
});
```

**Best Practices:**
- Test happy path and edge cases
- Mock large carts (performance testing)
- Validate output schema matches expected operations
- Test with actual metafield values

#### **Integration Testing**

**Local Testing with Shopify CLI:**
- `shopify function run` mimics production execution
- Tests compiled Wasm module (not source code)
- Validates performance against function timeout
- Can be automated in CI/CD pipeline

```bash
shopify function run --input input.json
```

**Input File Example:**
```json
{
  "cart": {
    "lines": [
      {
        "id": "gid://shopify/CartLine/123",
        "quantity": 2,
        "merchandise": {
          "product": {
            "title": "T-Shirt"
          }
        },
        "cost": {
          "subtotalAmount": {
            "amount": "100.00"
          }
        }
      }
    ]
  }
}
```

#### **Performance Testing**

- Use CLI to measure function execution time
- Test with various cart sizes (small, medium, large)
- Target < 10ms execution
- JavaScript should be tested on large carts specifically

#### **Validation Testing**

- Ensure output JSON matches function API schema
- Validate operation IDs reference actual cart lines
- Test error message formatting
- Confirm targeting (product, order, shipping discounts)

**Common Pitfalls:**
- Not testing large cart scenarios (JavaScript)
- Missing edge cases (null metafields, empty cart)
- Performance testing only in CI (local testing faster feedback)
- Using test data that doesn't match production

**Resources:**
- [Test and debug Shopify Functions](https://shopify.dev/docs/apps/build/functions/test-debug-functions)
- Rust: `shopify_function::run_function_with_input()` utility
- JavaScript: Vitest framework recommended

---

### 3.6 Deploying Shopify Functions

**What:** Publishing functions to Shopify infrastructure and managing versions.

**Deployment Commands:**
```bash
# Deploy single function
shopify app deploy

# Deploy all functions in app
shopify app function deploy [name]
```

**Deployment Steps:**
1. Test locally (`shopify function run`)
2. Deploy app (`shopify app deploy`)
3. Shopify CLI compiles Wasm
4. Module uploaded to Shopify
5. Function registered with target

**Function Versioning:**
- Functions are versioned (API versions like 2024-10, 2025-01)
- Use latest stable version
- Deprecated versions have 90-day sunset period
- Update input queries when API changes

**Performance Monitoring:**
- Monitor function execution time in Admin
- Use Shopify CLI metrics for baseline
- Watch for timeouts (> 10ms is risky)
- Profile with actual production cart data

**Rollback Strategy:**
- Disable function in admin (immediate)
- Redeploy previous version (if necessary)
- Test locally before redeploying

**Common Pitfalls:**
- Deploying without testing (`shopify function run` first)
- Not updating to latest API version (deprecated functions removed)
- Ignoring performance warnings
- Large input queries after deploy (hard to debug)

**Production Checklist:**
- [ ] Local testing passes (`shopify function run`)
- [ ] Performance < 10ms on test data
- [ ] Large cart testing (JavaScript especially)
- [ ] Error handling validates (no crashes)
- [ ] Input query optimized
- [ ] Metafield schema documented

**Resources:**
- [About Shopify Functions](https://shopify.dev/docs/apps/build/functions)
- [Test and debug Shopify Functions](https://shopify.dev/docs/apps/build/functions/test-debug-functions)

---

## 4. DISCOUNTS (DISCOUNT FUNCTIONS & UI)

### 4.1 Building Discount Functions

**What:** Shopify Functions that calculate and apply discounts across product, order, and shipping classes.

**Key Rules:**
- Single function can apply to 1 or more discount classes (PRODUCT, ORDER, SHIPPING)
- Return only operations for configured classes
- Max discount cap respected per operation
- Support fixed amount and percentage discounts
- Applies to cart lines based on targeting criteria

**Discount Classes:**

**PRODUCT Discount:**
- Applies to individual line items
- Example: "20% off T-shirts"
- Output: per-line discount amounts

**ORDER Discount:**
- Applies to entire order or subtotal
- Example: "10% off orders over $100"
- Output: single discount amount distributed

**SHIPPING Discount:**
- Applies to shipping cost
- Example: "Free shipping on orders > $50"
- Output: shipping cost adjustment

**Function Output Structure:**
```json
{
  "discounts": [
    {
      "targets": {
        "lineItem": { "id": "gid://shopify/CartLine/123" }
      },
      "value": {
        "percentageValue": 20.0
      },
      "message": "20% off T-Shirts"
    }
  ],
  "discountApplicationStrategy": "ALL"
}
```

**Input Query (Discount Function):**
```graphql
query Input {
  discountNode(id: $owner) {
    discount {
      ... on DiscountAutomaticApp {
        title
        configuration {
          metafield(namespace: "discount", key: "percentage") {
            value
          }
        }
      }
    }
  }
  cart {
    lines {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          product {
            title
            handle
            vendor
          }
        }
      }
    }
  }
}
```

**Discount Rules Engine:**
- Check cart line attributes (product tags, type, vendor)
- Match against discount criteria (metafield config)
- Calculate discount value (fixed or percentage)
- Cap discount (max discount per line)
- Return operations for matching lines

**Error Handling:**
- Return empty discounts array if no matches (valid)
- Catch parsing errors (invalid metafield JSON)
- Handle null metafields gracefully

**Performance Consideration:**
- Discount functions run before validation (sequence matters)
- Keep logic simple (< 5ms)
- Avoid nested loops over large product lists

**Common Pitfalls:**
- Applying discount operations to unsupported classes (will error)
- Not respecting maximum discount cap
- Forgot to handle null metafields (NPE)
- Trying to apply discount to SHIPPING without configuring it

**Resources:**
- [About discounts](https://shopify.dev/docs/apps/build/discounts)
- [Build a Discount Function](https://shopify.dev/docs/apps/build/discounts/build-discount-function)
- [Discount Function API](https://shopify.dev/docs/api/functions/latest/discount)

---

### 4.2 Product vs Order Discounts

**What:** Two distinct discount targets with different application logic.

#### **Product Discount (Line-Item Targeting)**

**Applies To:**
- Individual cart line items
- Per-product or per-variant basis
- Multiple lines can receive different discounts

**Use Cases:**
- "20% off all T-shirts"
- "Buy 2, get 10% off third"
- "Loyalty member: 15% off electronics"
- Volume discounts by quantity

**Output Example:**
```json
{
  "targets": {
    "lineItem": { "id": "gid://shopify/CartLine/123" }
  },
  "value": {
    "percentageValue": 20.0
  }
}
```

**Evaluation Logic:**
1. Iterate cart lines
2. Check if line matches discount criteria (product handle, tag, type, etc.)
3. Calculate discount amount per line
4. Return operations for matching lines
5. Each line can have different discount amount

#### **Order Discount (Subtotal Targeting)**

**Applies To:**
- Entire order subtotal
- Distributed across all (or selected) lines
- Single discount amount split

**Use Cases:**
- "10% off orders over $100"
- "Free shipping when subtotal > $50"
- "Seasonal: 15% off everything"
- Promotional: "Take $20 off this weekend"

**Output Example:**
```json
{
  "targets": {
    "order": {}
  },
  "value": {
    "fixedValue": 20.0
  }
}
```

**Evaluation Logic:**
1. Calculate order subtotal
2. Check if meets discount threshold (min order amount, time-based, etc.)
3. Calculate single discount amount
4. Shopify distributes across cart lines
5. Returns one operation for all matching

#### **Key Differences:**

| Aspect | Product | Order |
|--------|---------|-------|
| Target | Individual lines | Entire order |
| Criteria | Product attributes | Order subtotal, date, etc. |
| Discount amount | Per-line | Single amount |
| Distribution | Direct (1:1) | Shopify-distributed |
| Use case | Category/SKU-based | Volume/threshold-based |

**Combined Usage:**
- Function can return both PRODUCT and ORDER discounts
- Discounts stack (customer sees both reductions)
- Each class returned separately in operations array

**Common Pitfalls:**
- Applying product discount to entire order (wrong target)
- Order discount logic applied per-line (inefficient)
- Not considering discount stacking (customer experience)

**Resources:**
- [Build a Discount Function](https://shopify.dev/docs/apps/build/discounts/build-discount-function)
- [Discount Function API](https://shopify.dev/docs/api/functions/latest/discount)

---

### 4.3 Building Discount UI with Admin Extensions

**What:** Admin UI extensions for merchants to configure discount function parameters (criteria, values, etc.).

**Key Rules:**
- Extensions render in admin discount page
- Merchants configure discount rules without code
- Stores configuration in metafields
- Discount function reads metafields at runtime

**Extension Targets:**
- `admin.discount.creation.render` (new discount page)
- `admin.discount.details.render` (edit existing discount)

**Configuration Flow:**
1. Merchant creates new discount in admin
2. Extension renders config form (discount type, percentage, rules)
3. Form submission saves to metafield on discount
4. Discount function runs, reads metafield, applies logic
5. Edit discount → extension pre-populates from metafield

**Example: Percentage Discount Config:**
```javascript
// Extension UI (React)
export default function DiscountConfig() {
  const [percentage, setPercentage] = useState(10);
  const [productTags, setProductTags] = useState(['summer']);

  const handleSave = async () => {
    const configData = {
      discountPercentage: percentage,
      applicableProductTags: productTags,
    };

    // Save to discount metafield via API
    await fetch('/api/discount-config', {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  };

  return (
    <div>
      <input
        type="number"
        value={percentage}
        onChange={(e) => setPercentage(parseInt(e.target.value))}
      />
      <button onClick={handleSave}>Save</button>
    </div>
  );
}
```

**Admin Extension Components:**
- Use Polaris for consistent admin UI
- TextField, Select, Checkbox for config inputs
- Save to metafield (server-side API call)
- Load metafield on edit (pre-populate form)

**Metafield Schema (Custom):**
```json
{
  "namespace": "discount_config",
  "key": "settings",
  "value": {
    "discountType": "PERCENTAGE",
    "discountValue": 15,
    "applicableTags": ["summer", "clearance"],
    "minOrderAmount": 50.00
  }
}
```

**Backend API (Save Config):**
```javascript
// Your app backend
app.post('/api/discount-config', async (req, res) => {
  const { discountId, config } = req.body;

  // Update discount metafield via Admin GraphQL API
  const query = `
    mutation UpdateDiscountMetafield($input: MetafieldInput!) {
      metafieldsSet(inputs: [$input]) {
        metafields {
          id
        }
      }
    }
  `;

  // Call Admin API to save
  const response = await shopify.graphql(query, {
    input: {
      ownerId: discountId,
      namespace: "discount_config",
      key: "settings",
      value: JSON.stringify(config),
      type: "json",
    }
  });
});
```

**Validation:**
- Client-side validation (catch errors early)
- Server-side validation (security, business rules)
- Display validation errors to merchant

**Common Pitfalls:**
- Extension not pre-populating (metafield not read on edit)
- Metafield schema mismatch (discount function expects different key)
- Not validating input (function receives garbage)
- Large metafield values (size limits)

**Resources:**
- [Build a discounts UI with admin UI extensions](https://shopify.dev/docs/apps/build/discounts/build-ui-extension)
- [Discount Function Settings API](https://shopify.dev/docs/api/admin-extensions/latest/target-apis/contextual-apis/discount-function-settings-api)

---

### 4.4 Building Discount UI with React Router / Remix

**What:** Full React Router or Remix app page for complex discount configuration. More powerful than admin extensions but requires custom UI.

**Key Rules:**
- Add custom page to React Router / Remix app
- Render discount config form (full control over UX)
- Save to discount metafield
- Link from admin discount page (if using admin extension for entry point)

**Entry Points:**
- **Option 1:** Admin extension links to custom page
  - Extension renders lightweight button/link
  - Navigates to `/discount-config?id={discountId}`
  - Full page handles complex config

- **Option 2:** Standalone discount configuration
  - Merchant visits `/admin/discount-config` directly
  - Create discount in custom UI
  - Saves all data to metafields

**Example: React Router Discount Page:**
```javascript
// src/pages/DiscountConfig.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function DiscountConfig() {
  const { discountId } = useParams();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load existing discount config
    fetch(`/api/discount/${discountId}`)
      .then(r => r.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      });
  }, [discountId]);

  const handleSave = async () => {
    const response = await fetch(`/api/discount/${discountId}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });

    if (response.ok) {
      // Redirect back to admin
      window.location.href = `/admin/discounts/${discountId}`;
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Configure Discount</h1>
      {/* Complex form with multiple sections */}
      <DiscountRulesForm value={config} onChange={setConfig} />
      <button onClick={handleSave}>Save Discount</button>
    </div>
  );
}
```

**Advantages Over Admin Extensions:**
- Full UI control (custom components, layouts)
- Complex multi-step forms
- Real-time validation with server data
- Better performance (no iframe limitations)
- Richer UX (more features, better UX patterns)

**Disadvantages:**
- More code to maintain
- Must handle deep-linking from admin
- Requires backend API endpoints
- Session management (token-based auth)

**Backend API Pattern:**
```javascript
// GET /api/discount/:id
// Returns existing discount config

// PUT /api/discount/:id
// Updates discount metafield

// POST /api/discount
// Create new discount

// DELETE /api/discount/:id
// Delete discount (soft delete recommended)
```

**Session Token Authentication:**
- Use Shopify session tokens (provided by admin extension if entry point)
- Validate token on backend before mutating
- Token expires → handle gracefully

**Common Pitfalls:**
- Deep-link broken (admin can't reach custom config page)
- Session token missing (auth fails)
- Metafield schema different than function expects
- Not handling edit vs create flow

**Resources:**
- [Build a discounts UI with React Router](https://shopify.dev/docs/apps/build/discounts/build-ui-with-react-router)
- [Build a discounts UI with Remix](https://shopify.dev/docs/apps/build/discounts/build-ui-with-remix)

---

## CROSS-CUTTING PATTERNS & CONSTRAINTS

### Performance Requirements
- Admin extensions: < 1s load (API calls < 500ms)
- Checkout UI extensions: < 500ms initial render
- Shopify Functions: < 10ms execution (strict)
- No external network calls from checkout UI (admin allowed)

### Shopify Plus Requirements (Key)
- Information & shipping step checkout extensions
- Pre-purchase product offers
- Pickup points delivery
- Delivery & payment customization functions
- Certain checkout targets unavailable on regular Shopify plan

### RLS & Authorization
- Admin extensions: Session token + user roles
- Checkout extensions: No auth required (customer context)
- Functions: App-scoped (no user auth, function-scoped metafields)

### Testing Strategy
- Admin extensions: Manual merchant testing
- Checkout UI: Automated testing with checkout layouts (one-page vs three-page)
- Functions: Unit tests + local CLI testing (`shopify function run`)
- Integration: Test with production-like data (big carts, etc.)

---

## REFERENCE: API VERSIONS

Latest stable versions (as of 2026-04):
- **Admin Extensions API:** 2025-01
- **Checkout UI Extensions API:** 2025-07
- **Shopify Functions:** 2025-01
- **Admin GraphQL:** 2025-01

Check deprecation status before deploying; versions sunset after 90 days.
