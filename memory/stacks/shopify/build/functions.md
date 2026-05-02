# Build: Shopify Functions

> Source: shopify.dev/docs/api/functions
> Last extracted: 2026-04-04

## Overview

**What:** Wasm-based business logic that runs on Shopify servers (NOT in your app).

**Characteristics:**
- Written in Rust (preferred) or JavaScript
- Compiled to WebAssembly
- Runs in Shopify runtime (< 10ms timeout)
- Input: GraphQL query result
- Output: JSON response (actions, errors, or modifications)

**Key rules:**
- Must complete < 10ms (strict timeout)
- No external API calls
- No side effects (pure functions)
- Input defined by query, output defined by API
- Deployed via `shopify app deploy`

## Function Types

### Discount Function

**Purpose:** Custom discount logic

**Input:** Cart data (items, quantities, prices)

**Output:** Discount rules (targets, types, amounts)

**Use cases:**
- Volume discounts
- Custom rule-based discounts
- Time-based promotions
- Loyalty-based discounts

### Delivery Customization Function

**Purpose:** Hide, reorder, rename delivery options

**Input:** Cart, shipping address, delivery methods

**Output:** Modified delivery options

**Use cases:** Region-specific shipping, hide methods

### Payment Customization Function

**Purpose:** Hide, reorder payment methods

**Input:** Cart, payment methods

**Output:** Modified payment list

**Constraint:** Cannot rename branded methods (Shop Pay, Apple Pay, Google Pay)

### Cart Transform Function

**Purpose:** Modify cart contents

**Input:** Cart data

**Output:** Updated cart (add/remove items, apply discounts)

**Use cases:** Auto-add bundles, apply gift with purchase

### Validation Function

**Purpose:** Block checkout if conditions not met

**Input:** Cart, addresses, custom fields

**Output:** Error messages

**Use cases:** Order limits, shipping restrictions, B2B validation

## Code Pattern: Discount Function (JavaScript)

```javascript
// src/run.ts
export default function run(input) {
  const lines = input.cart.lines;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  // Apply 10% discount if > 10 items
  if (totalQuantity > 10) {
    return {
      discounts: [
        {
          targets: [
            {
              lineItem: {
                id: lines[0].id,
              },
            },
          ],
          value: {
            percentage: {
              value: '10.0',
            },
          },
        },
      ],
    };
  }

  return {
    discounts: [],
  };
}
```

## Code Pattern: Delivery Customization (Rust)

```rust
use shopify_function::prelude::*;

#[derive(Clone, Debug)]
pub struct Config;

fn input(input: String) -> Result<input::ResponseData> {
  let input: input::Input = serde_json::from_str(&input)?;
  Ok(input.root)
}

fn function(input: input::ResponseData) -> Result<output::FunctionResult> {
  let mut operations = vec![];

  for method in &input.delivery_customization.delivery_methods {
    // Hide methods for certain countries
    if method.shipping_address.country_code == input::CountryCode::JP {
      operations.push(output::Operation::Hide {
        delivery_method_id: method.id.clone(),
      });
    }
  }

  Ok(output::FunctionResult {
    operations,
  })
}

pub fn main(input: String) -> Result<String> {
  let input = input(input)?;
  let result = function(input)?;
  Ok(serde_json::to_string(&result)?)
}
```

## Configuration Pattern

**shopify.extension.toml:**
```toml
type = "discount_function"
targets = ["purchase.checkout.discount.render-discount-nodes"]
name = "Volume Discount"
description = "10% off orders over 10 items"

# Settings (merchant-configurable)
[settings]
discount_percentage = { type = "number", min = 0, max = 100 }
minimum_quantity = { type = "number", min = 1 }
```

## Input Query Pattern

**Input defined in extension:**
```graphql
query Input {
  cart {
    lines {
      id
      quantity
      cost {
        subtotalAmount {
          amount
          currencyCode
        }
      }
      merchandise {
        product {
          title
          category {
            name
          }
        }
      }
    }
  }
}
```

## Testing Functions Locally

```bash
# Run local test
shopify function test

# Watch mode
shopify function test --watch
```

## Deployment

```bash
# Deploy via CLI
shopify app deploy

# Automatically deploys all functions in extensions/
```

## Performance Constraints

**Strict < 10ms timeout:**
- No complex loops
- No deep recursion
- Minimize string operations
- Cache computed values

**Optimization tips:**
- Keep input query minimal (only needed fields)
- Avoid nested loops
- Use early returns
- Batch operations in output

## Common Patterns

**Pattern 1: Conditional Discount**
```javascript
if (qualifiesForDiscount(input.cart)) {
  return { discounts: [createDiscount()] };
}
return { discounts: [] };
```

**Pattern 2: Filter Delivery Methods**
```javascript
const filtered = input.delivery_methods.filter(
  method => !restrictedRegions.includes(method.destination.country)
);
return { operations: filtered.map(hide) };
```

**Pattern 3: Validation with Errors**
```javascript
if (!validateMinimumOrder(input.cart)) {
  return {
    errors: [
      {
        message: 'Minimum order $50 required',
        target: 'cart',
      },
    ],
  };
}
return { errors: [] };
```

## Pitfalls

- **Timeout (> 10ms)** — Keep logic simple and tight
- **External API calls** — Not allowed, use input data only
- **Side effects** — Pure functions only
- **Complex data structures** — Keep input/output simple
- **State management** — Stateless by design
- **Nested bundles** — Not supported in functions
