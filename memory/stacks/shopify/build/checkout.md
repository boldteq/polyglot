# Build: Checkout Extensions & Validation

> Source: shopify.dev/docs/apps/build/checkout
> Last extracted: 2026-04-04

## Checkout UI Extensions

**What:** Custom functionality at defined checkout flow points. Web components in isolated sandbox.

**Key rules:**
- Web components (not React directly)
- Polaris-based components (inherit merchant brand)
- CSS cannot be altered or overridden
- Targets are predefined (static & block types)
- Max component count depends on target

**Target types:**

**Static targets** (tied to core checkout features):
```
purchase.checkout.contact-information
purchase.checkout.shipping-method-selection
purchase.checkout.order-summary.cart-line-item
purchase.checkout.payment-method
purchase.thank-you.cart-line-item
```

**Block targets** (render anywhere):
```
purchase.checkout.block.render      # Any checkout page
purchase.thank-you.block.render     # Thank you page
customer-account.order-status.block.render
```

**Components available:**
- Text, Image, Button, Checkbox, TextBlock
- Banner, Choice, Select, TextField, Heading
- ChoiceList, Divider, Link, List, Disclosure
- Form (validation, direct API access)

**Shopify Plus requirement:**
- Information & shipping steps extensions: **Shopify Plus only**
- Block extensions elsewhere: available to all plans

**Common pitfalls:**
- Trying to override brand colors/fonts (impossible)
- Rendering too much content (performance critical)
- Missing client-side validation

## Cart & Checkout Validation Functions

**What:** Server-side validation functions block checkout when business rules aren't met.

**Key rules:**
- Max 25 validation functions per store
- Server-side runs before checkout completion
- Can block checkout with error messages
- Can validate billing address, PO numbers (API v2026-04+)

**Use cases:**
- Enforce order limits for new customers
- Block shipping to restricted locations
- Validate loyalty program rules
- Require PO numbers for B2B orders

**Error targets:**
```
payments              # Payment section
shipping-address      # Shipping address
billing-address       # Billing address
po-number            # Purchase order field
```

**Input query pattern:**
```graphql
query Input {
  cart {
    buyerIdentity {
      countryCode
    }
    lines {
      quantity
      merchandise {
        product { title }
      }
    }
  }
}
```

**Output error format:**
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

**Common pitfalls:**
- Function timeout > 10s (performance critical)
- Returning errors after order created
- Duplicating validation in function + client
- Not testing with express checkout methods

## Delivery Customization Functions

**What:** Hide, reorder, rename delivery options in checkout.

**Key rules:**
- Shopify Plus only for custom apps
- Public app functions available on any plan
- Input: cart, shipping address, delivery methods
- Output: filtered/reordered options

**Delivery methods:**
- Shipping to address (street)
- Local pickup (single location)
- Shipping to pickup point (third-party, Plus only)

**Use cases:**
- Hide methods for restricted regions
- Reorder by speed/cost
- Add custom text to option names
- Filter based on cart content

**Function input:**
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

**Common pitfalls:**
- Assuming custom apps work on all plans
- Not enabling pickup points in admin first
- Function timeout > 1s
- Returning empty delivery options (blocks checkout)

## Payment Customization Functions

**What:** Hide, reorder, rename payment options in checkout.

**Key rules:**
- Max 25 payment customization functions per store
- Cannot rename branded payment methods (Shop Pay, Apple Pay, Google Pay)
- Cannot change logo-based names
- Only affects merchant-configurable methods

**Use cases:**
- Hide methods for specific regions
- Reorder by preference
- Add context text to options
- Filter based on order amount

**Output format:**
```json
{
  "operations": [
    {
      "hide": {
        "paymentMethodId": "gid://shopify/PaymentMethod/1234"
      }
    },
    {
      "move": {
        "paymentMethodId": "gid://shopify/PaymentMethod/5678",
        "index": 0
      }
    }
  ]
}
```

**Limitations:**
- Branded payment methods immutable
- Gift card payment field cannot be renamed
- All wallet payment methods branded
- Order-level discounts affect payment UI

**Common pitfalls:**
- Trying to rename Shop Pay / Apple Pay
- Removing all payment methods (blocks checkout)
- Function timeout > 1s
- Not testing with express checkout

## Product Offers

**Pre-purchase offers** (Shopify Plus only):
- Displayed before checkout completion
- Increase average order value (AOV)
- Implemented as Checkout UI extension
- Bundle recommendations, premium upgrades, add-ons

**Post-purchase offers** (Limited availability):
- Post-purchase page after order confirmed
- Significant revenue boost potential
- Max 3 consecutive upsell offers
- Requires access request

**UX rules:**
- Be transparent about all costs
- Clear accept/decline options
- No pressure tactics
- Respect customer's choice

## Code Pattern: Checkout Block Extension

```typescript
import {
  BlockStack,
  Text,
  Button,
  Banner,
} from '@shopify/checkout-ui-extensions';

export default reactExtension(
  'purchase.checkout.block.render',
  () => <CheckoutBlock />,
);

function CheckoutBlock() {
  const [step, setStep] = useState('initial');

  return (
    <BlockStack spacing="base">
      <Banner title="Special Offer">
        <p>Add this premium widget for just $9.99!</p>
      </Banner>

      {step === 'initial' && (
        <Button kind="primary" onClick={() => setStep('confirm')}>
          Add to Order
        </Button>
      )}

      {step === 'confirm' && (
        <BlockStack spacing="tight">
          <Text>Widget added to your cart</Text>
          <Button onClick={() => setStep('initial')}>
            Remove from Order
          </Button>
        </BlockStack>
      )}
    </BlockStack>
  );
}
```
