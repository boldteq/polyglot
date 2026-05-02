# Shopify Functions API Reference

**Source**: https://shopify.dev/docs/api/functions/latest
**Last Updated**: 2026-04-04
**Version**: Latest (2024-10+)

---

## Overview

Shopify Functions are extensible APIs that enable you to write custom business logic in WebAssembly (Wasm) to modify Shopify's backend behavior at critical points in the order and checkout lifecycle. Functions are deployed as serverless functions that execute at runtime with strict performance constraints.

**Key Benefits**:
- Unified extension model for backend customization
- Maximum execution time: 10ms per function
- Language support: Rust (native Wasm), JavaScript (compiled via Javy)
- Atomic execution with no side effects
- Concurrent execution across multiple functions

---

## Function Types & APIs

### 1. Discount Function API

**Purpose**: Create discounts that apply to cart lines, order subtotal, and shipping rates in a single unified function.

**Key Capabilities**:
- Exclusions (exclude specific cart lines from discount)
- Tiered discounts (product, order, and shipping)
- Property-based discounts (e.g., engraving on products)
- Support for both code-based and automatic discounts

**Limits**:
- Maximum 25 discount functions per store
- All discount functions run concurrently (no knowledge of each other)
- Outputs can be combined with other discounts following stacking rules

**Deprecated**: The Product Discount API and Order Discount API are deprecated. Migrate to unified Discount Function API.

**References**:
- [Discount Function API](https://shopify.dev/docs/api/functions/latest/discount)
- [Build a Discount Function](https://shopify.dev/docs/apps/build/discounts/build-discount-function)

---

### 2. Cart Transform Function API

**Purpose**: Change the pricing, bundling, and presentation of items in a cart.

**Key Operations**:
- **Expand**: Display bundled items within a parent line item; supports fixed prices and custom titles/images (as of 2024-01)
- **Merge**: Combine multiple cart lines into a single bundle line
- **LineUpdate**: Modify line item presentation (price, title, image)

**Capabilities**:
- Dynamic bundling and product recommendations
- Programmatic pricing overrides
- Custom merchandising strategies

**Limits**:
- Maximum 1 cart transform function per store
- `lineUpdate` operations: development stores or Shopify Plus plans only
- Executes during checkout and cart rendering

**References**:
- [Cart Transform Function API](https://shopify.dev/docs/api/functions/latest/cart-transform)

---

### 3. Cart and Checkout Validation Function API

**Purpose**: Implement validation rules and checks before order completion, including express checkouts (Shop Pay, PayPal, Google Pay, Apple Pay).

**Common Use Cases**:
- Tokengating or membership requirements at checkout
- Age/ID verification for regulated products
- B2B minimums, maximums, multiples, or credit limits
- Quantity limits in flash sales
- Purchase order validation

**Limits**:
- Maximum 25 validation functions per store
- Errors exposed to Storefront API cart object
- Applies to themes using cart template and during checkout

**References**:
- [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/latest/cart-and-checkout-validation)
- [About Cart and Checkout Validation](https://shopify.dev/docs/apps/build/checkout/cart-checkout-validation)

---

### 4. Delivery Customization Function API

**Purpose**: Customize delivery options at checkout (rename, reorder, hide shipping carriers, local delivery, pickup options).

**Key Capabilities**:
- Hide delivery options by product or customer
- Reorder delivery options by preference
- Add messaging to delivery option titles
- Display location-specific options (e.g., bike shipping for specific ZIP codes)

**Limits**:
- Maximum 25 delivery customization functions per store
- Accesses buyer identity, delivery groups, addresses, and cost

**References**:
- [Delivery Customization Function API](https://shopify.dev/docs/api/functions/latest/delivery-customization)
- [Build Delivery Customizations](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/delivery-options/build-function)

---

### 5. Payment Customization Function API

**Purpose**: Customize payment methods at checkout (rename, reorder, hide, set payment terms, require review).

**Key Operations**:
- **Hide Payment Method**: Remove payment method from checkout conditionally
- **Reorder Payment Method**: Change display order based on context
- **Review Requirement**: Submit checkout as draft for merchant review

**Limits**:
- Maximum 25 payment customization functions per store
- Cannot rename payment methods with logos (Shop Pay, Apple Pay, Google Pay, wallets, gift cards)

**References**:
- [Payment Customization Function API](https://shopify.dev/docs/api/functions/latest/payment-customization)
- [About Functions in Payments](https://shopify.dev/docs/apps/build/checkout/payments)

---

### 6. Fulfillment Constraints Function API

**Purpose**: Define fulfillment rules that ensure cart items are fulfilled from specified locations or together.

**Key Operations**:
- Force items to fulfill from a specific location
- Force items to fulfill from the same location (multi-item fulfillment)

**Behavior**:
- If constraints cannot be satisfied, checkout returns no shipping rates (blocks checkout)
- Mutually exclusive constraints block checkout

**Limits**:
- Maximum 25 fulfillment constraint functions per store
- Can associate with one or multiple delivery method types

**References**:
- [Fulfillment Constraints Function API](https://shopify.dev/docs/api/functions/latest/fulfillment-constraints)
- [Build Fulfillment Constraints](https://shopify.dev/docs/apps/build/orders-fulfillment/order-routing-apps/build-fulfillment-constraints-function)

---

### 7. Order Routing Location Rule API

**Purpose**: Write custom order routing rules to determine which fulfillment location fulfills each order.

**Capabilities**:
- Route items to different fulfillment locations per product
- Prioritize locations based on business rules
- Rank locations by product metafields
- Deprioritize based on capacity constraints

**Use Cases**:
- Fulfill from nearest location
- Prioritize warehouse/retail locations
- Metafield-based ranking
- Capacity-based deprioritization

**Availability**:
- Developer preview only
- Shopify Plus plan required
- Available by request from Shopify

**References**:
- [Order Routing Location Rule API](https://shopify.dev/docs/api/functions/latest/order-routing-location-rule)
- [Build Location Rules](https://shopify.dev/docs/apps/build/orders-fulfillment/order-routing-apps/location-rules/getting-started)

---

## Input Query & GraphQL Schema

### Input Query Concept

Each function specifies its input using a GraphQL query. Shopify executes this query before invoking the function and passes the resulting JSON to the run target.

**Optimization Rule**: Only request fields your function requires to optimize performance and minimize execution time.

### Getting the Schema

Every function includes `schema.graphql` containing the complete GraphQL schema for that API type.

**Generate Latest Schema**:
```bash
shopify app function schema
```

This command uses the API type and version from your extension TOML to update `schema.graphql`.

### Using the Schema

- Leverage with VS Code GraphQL plugin for IntelliSense
- Use language-specific code generation (e.g., `graphql_client` for Rust)
- Reference when writing input queries

**References**:
- [About Function Input and Output](https://shopify.dev/docs/apps/build/functions/input-output)

---

## Output Schema & FunctionResult

### FunctionRunResult

Modern function APIs (2023-10+) use `FunctionRunResult` as the output type for the `purchase.[function-name].run` target.

**Structure**: Output is defined by the same Function API schema as input. Each API type has its own FunctionRunResult schema.

**Deprecated**: `FunctionResult` (2023-09 and earlier) is deprecated. Migrate to `FunctionRunResult`.

### Output Examples by API Type

- **Discount**: List of discount operations with exclusions, targets, value
- **Cart Transform**: Merge, expand, or line update operations
- **Validation**: List of validation errors with blocking logic
- **Delivery/Payment**: Hide, reorder, or review requirement operations
- **Fulfillment Constraints**: List of location or same-location constraints
- **Location Rules**: Ranked list of fulfillment locations

**References**:
- [About Function Input and Output](https://shopify.dev/docs/apps/build/functions/input-output)

---

## Language Support & Compilation

### Rust (Recommended)

**Advantages**:
- Compiles directly to WebAssembly (more efficient)
- Better performance than JavaScript
- Type safety via `shopify_function` crate (v1.0.0+)
- Reduced boilerplate with crate-provided macros

**Toolchain**:
```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown
```

**Crate**: `shopify_function` (v1.0.0+) for type generation and testing

**References**:
- [Rust for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/rust-for-functions)

---

### JavaScript/TypeScript

**How It Works**:
1. Shopify CLI uses ESBuild to preprocess TypeScript/JavaScript
2. Dependencies bundled from npm
3. Javy compiles bundled code to WebAssembly
4. Resulting Wasm file must be < 256 kB

**Benefits**:
- Familiar language for web developers
- npm ecosystem support
- TypeScript support via ESBuild

**Limitations**:
- Lower performance than Rust
- Larger bundle size

**Package**: `@shopify/shopify_function` (v2.0.0+)

**References**:
- [JavaScript for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/javascript-for-functions)

---

### WebAssembly Requirements

All compiled Wasm functions must:
- Conform to Shopify Function Wasm API specification
- Be under 256 kB in size
- Execute within 10ms timeout

**References**:
- [WebAssembly for Functions](https://shopify.dev/docs/apps/build/functions/programming-languages/webassembly-for-functions)

---

## Testing & Debugging

### Testing with Shopify CLI

**Local Testing Command**:
```bash
shopify app function run [--path <path>] [--export <export>] [--input <input>]
```

**Approaches**:

1. **Mock Input Testing**
   - Use valid JSON from production logs
   - Shopify CLI mimics production Wasm execution
   - Faster than dev store testing

2. **Unit Testing**
   - Extract valid input JSON from:
     - Log files from `shopify app dev`
     - Output of `shopify app logs` command
     - Function run logs in Dev Dashboard
     - Hand-crafted mock input
   - Write tests as single-unit tests

3. **Dev Store Testing**
   - Use `shopify app dev` to start dev preview
   - Changes to watched files trigger auto-rebuild
   - Immediate testing in live checkout

### Log Streaming & Replay (Beta)

**Capabilities**:
- Stream function execution logs to Shopify CLI
- Replay function executions locally using production input
- Faster debugging and development cycle

**References**:
- [Test and Debug Shopify Functions](https://shopify.dev/docs/apps/build/functions/test-debug-functions)

---

## Network Access (Early Access)

### Overview

Functions cannot make direct HTTP requests. Instead, define HTTP requests in the `fetch` target. Shopify performs the request and includes the response in the input to the `run` target.

### Configuration

**In extension TOML**:
```toml
targets = ["purchases.discount.run", "purchases.discount.fetch"]
```

**GraphQL Input Query**:
```graphql
query fetch {
  networkRequest(url: "https://api.example.com/data") {
    body
    statusCode
  }
}
```

Shopify calls `fetch` target → performs HTTP request → passes response to `run` target.

### Performance & Caching

- **Timeout**: 100ms – 2000ms (configurable)
- **Caching**: Network responses cached by (method, URL, headers, body)
- **Availability**: Enterprise plans only; limited to Shopify for supported plans
- **Restrictions**:
  - GraphQL Storefront API: only with `@defer` directive
  - Online Store Cart Ajax API: not supported

### Use Cases

- Real-time pricing from external systems
- Customer eligibility validation
- Inventory checks from third-party sources

**References**:
- [About Network Access for Shopify Functions](https://shopify.dev/docs/apps/build/functions/network-access)

---

## Performance Constraints

### Hard Limits

| Constraint | Value |
|-----------|-------|
| Execution timeout | 10ms |
| Wasm file size | < 256 kB |
| Network timeout | 100-2000ms (configurable) |
| Concurrent functions | 25 per API type |
| Memory allocation | Limited by Wasm runtime |

### Optimization Tips

1. **Minimize input query**: Request only necessary fields
2. **Use Rust**: 2-3x faster than JavaScript
3. **Cache network requests**: Use built-in caching
4. **Avoid heavy computation**: Pre-compute where possible
5. **Test locally**: Use `shopify app function run` to measure

**References**:
- [About Performance and Resilience](https://shopify.dev/docs/apps/build/functions/input-output/network-access/performance-and-resilience)

---

## Common Patterns & Pitfalls

### Pattern: Feature Flag Functions

Use feature flags to control function behavior without redeployment:
```rust
if feature_flags.my_flag_enabled {
  // Apply custom logic
}
```

### Pattern: Conditional Operations

Most functions accept arrays of operations. Only return operations that apply:
```rust
let mut operations = vec![];
if should_apply_discount(&input) {
  operations.push(discount_operation);
}
Ok(FunctionRunResult { operations })
```

### Pitfall: Over-Requesting Input

Requesting all fields from product, variants, metafields will slow function execution.

**Solution**: Use precise GraphQL queries:
```graphql
query input {
  cart {
    lines {
      merchandise {
        __typename
        ... on ProductVariant {
          id
          title
        }
      }
    }
  }
}
```

### Pitfall: External Dependencies in JavaScript

Large npm dependencies bloat the Wasm bundle. Keep dependencies minimal.

### Pitfall: Ignoring Execution Timeout

Functions have 10ms timeout. Test locally to ensure compliance.

```bash
shopify app function run --input <path-to-json>
# Check timing in output
```

---

## Deployment & Monitoring

### Deployment

Functions are deployed with your app:
```bash
shopify app deploy
```

Deployed functions are available in dev stores immediately. Activate in production via Shopify Admin.

### Monitoring

Track function performance via:
- Dev Dashboard function logs
- `shopify app logs` command
- Admin function execution logs
- Error tracking (Sentry integration available)

### Error Handling

Functions should return valid outputs even on edge cases. Errors are logged and the function output is ignored (no discount/validation applied).

---

## Key Takeaways

1. **Choose your API**: 7 types cover checkout, fulfillment, and order routing
2. **Pick a language**: Rust for performance, JavaScript for familiarity
3. **Optimize input queries**: Request only needed fields
4. **Test locally first**: `shopify app function run` before dev store
5. **Stay under 10ms**: Performance is critical
6. **Deploy with your app**: Functions ship with your app release
7. **Use network access sparingly**: Enterprise feature with caching

---

## Related Documentation

- [About Shopify Functions](https://shopify.dev/docs/apps/build/functions)
- [Language Considerations](https://shopify.dev/docs/apps/build/functions/programming-languages)
- [Monitoring and Handling Errors](https://shopify.dev/docs/apps/build/functions/monitoring-and-errors)
- [Shopify CLI for Apps](https://shopify.dev/docs/api/shopify-cli/app)
