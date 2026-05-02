# Cart + Checkout Microcopy Patterns

**Owner:** merch
**Source intel:** Allbirds, Gymshark, Glossier, Warby Parker, Liquid Death teardowns
**Last updated:** 2026-04-27 — Curriculum v2 deep training
**Usage:** Every copy slot has character count. Variants listed high-to-low by recommended usage.

---

## Cart Drawer Header

| Copy | Chars | When to use |
|------|-------|-------------|
| "Your Cart" | 9 | Default |
| "Your Bag" | 8 | Fashion/apparel brands (Allbirds, Gymshark) |
| "Your Order" | 10 | Premium, considered purchase brands |

**With item count:** "Your Bag (3)" or "Your Cart · 3 items"

---

## Free Shipping Progress Bar

### State 1: Progress (>$15 remaining)
| Copy | Chars | Brand voice |
|------|-------|-------------|
| "Add $X for free shipping" | 25 | Direct, functional |
| "You're $X away from free shipping" | 34 | Encouraging |
| "Spend $X more to unlock free shipping" | 38 | Benefit-framed |
| "$X more and we'll ship it free" | 32 | Casual brand voice |

### State 2: Near threshold ($5-15 away)
| Copy | Chars | Brand voice |
|------|-------|-------------|
| "Almost there! Add $X for free shipping" | 38 | Encouraging |
| "Just $X more unlocks free shipping" | 35 | Milestone language |
| "So close — $X away from free shipping" | 38 | Casual urgency |

### State 3: Reached threshold
| Copy | Chars | Brand voice |
|------|-------|-------------|
| "You've unlocked free shipping! 🎉" | 33 | Celebratory |
| "Free shipping unlocked" | 22 | Clean, minimal |
| "Free shipping on us" | 20 | Brand-voice casual |

**Rule:** Never use exclamation marks on State 1-2. Reserve celebration for State 3.

---

## Empty Cart State

| Copy | Chars | Brand voice |
|------|-------|-------------|
| "Your cart is empty" | 19 | Default functional |
| "Your bag is empty" | 18 | Fashion/casual |
| "Nothing here yet" | 18 | Conversational |
| "Nothing in your bag yet — let's fix that" | 40 | Playful CTA lead-in |
| "Start filling it up" | 19 | CTA prompt (use as sub-heading below main) |

**CTA below empty state:**
- "Shop now" | "Browse all products" | "Explore the collection"

---

## Cart Subtotal + Pricing Labels

| Slot | Copy | Notes |
|------|------|-------|
| Subtotal label | "Subtotal" | Never "Sub total" (two words) |
| Shipping | "Free" or "Calculated at checkout" | Never show $0 — show "Free" |
| Tax | "Calculated at checkout" or "Included" | Never estimate tax in cart |
| Total label | "Estimated total" (cart) / "Order total" (checkout) | |
| Discount applied | "Discount (-$X)" | Show in green |

---

## Checkout CTA Variants (on cart drawer/page)

| Copy | Chars | Notes |
|------|-------|-------|
| "Checkout →" | 11 | Default, directional |
| "Secure Checkout →" | 18 | Trust-enhanced |
| "Checkout — $X.XX →" | 18 | Shows amount (highest trust) |
| "Proceed to Checkout" | 20 | Formal, B2B |

**Best practice:** Include total amount in CTA when possible. "Checkout — $87.00" outperforms "Checkout" because specificity = trust.

---

## Checkout Step Labels

### Option A: Descriptive (recommended)
1. Contact → Shipping → Payment → Review

### Option B: Numbered
1. 1 of 3 → 2 of 3 → 3 of 3

### Option C: Action-based (Shopify default)
Information → Shipping → Payment

**Rule:** Maximum 4 steps. Each step name should be a noun, not a verb.

---

## Checkout Form Field Labels + Placeholders

| Field | Label | Placeholder | Notes |
|-------|-------|-------------|-------|
| Email | "Email" | "you@example.com" | |
| First name | "First name" | "Jane" | |
| Last name | "Last name" | "Smith" | |
| Address | "Address" | "123 Main St" | Trigger autocomplete |
| Address 2 | "Apartment, suite, etc." | "Apt 4B" | Collapsed by default |
| City | "City" | "San Francisco" | |
| State | "State" | "California" | Dropdown |
| ZIP | "ZIP code" | "94102" | `inputmode="numeric"` |
| Phone | "Phone" | "(555) 000-0000" | `inputmode="tel"`, optional |

**Never use placeholder as the only label** — placeholder disappears on focus, leaving user confused.

---

## Checkout Error Messages

| Error type | Copy | Max chars |
|-----------|------|-----------|
| Empty required field | "This field is required" | 23 |
| Invalid email | "Please enter a valid email address" | 35 |
| Invalid ZIP | "Please enter a valid ZIP code" | 30 |
| Invalid card | "Your card number is invalid" | 27 |
| Card declined | "Your card was declined. Please try a different payment method." | 60 |
| Address not found | "We couldn't verify this address. Double-check and try again." | 60 |
| Out of stock (checkout) | "One or more items in your cart is no longer available" | 52 |

**Rule:** Error messages should be specific (not "Something went wrong") and tell the user what to do.

---

## Payment Security Microcopy

| Slot | Copy | Chars |
|------|------|-------|
| Lock icon label | "Secure checkout" | 15 |
| SSL note | "256-bit SSL encryption" | 22 |
| Payment badges alt | "We accept Visa, Mastercard, Amex, Apple Pay, Shop Pay" | — |
| Money-back | "30-day money-back guarantee" | 28 |

**Placement:** Below primary CTA button or in checkout footer.

---

## Order Review Page (before final payment)

| Slot | Copy | Chars |
|------|------|-------|
| Review section header | "Review your order" | 18 |
| Edit link | "Edit" | 4 |
| Confirm CTA | "Place order — $X.XX" | variable |
| Confirm sub-text | "You'll be charged $X.XX today" | 30 |
| Legal notice | "By placing your order, you agree to our [Terms] and [Privacy Policy]" | — |

**CTA:** Always include total amount in confirm button. "Place order — $87.00" not "Place order."

---

## Order Confirmation Page

| Slot | Copy options | Chars | Notes |
|------|-------------|-------|-------|
| Headline | "Your order is confirmed!" | 24 | Default |
| | "Thanks for your order!" | 22 | Casual |
| | "It's on its way soon!" | 21 | Anticipation |
| | "Order confirmed. You're all set." | 32 | Clean/minimal |
| | "You made a great choice." | 24 | Confident brand voice |
| Order number label | "Order #12345" | variable | |
| Email confirmation | "A confirmation has been sent to [email]" | variable | |
| Delivery estimate | "Estimated delivery: May 20-22" | variable | |

**Sub-headline / what happens next:**
```
"We're preparing your order. You'll receive a shipping confirmation 
with tracking info once your order ships."
(Max 120 chars)
```

---

## Anti-Dark-Pattern Rules for Microcopy

**NEVER use these patterns:**
1. Fake countdown timers ("Sale ends in 00:04:32" without real expiry)
2. "Only 3 left!" without verified inventory
3. Pre-checked subscription boxes
4. Hidden fees revealed only at final checkout step (tax surprise)
5. "Free" shipping that requires minimum purchase — not disclosed prominently
6. Vague confirmation ("Your request has been submitted") — use specific action ("Your order is confirmed")
7. Guilt-trip dismiss copy ("No thanks, I don't want to save money")
8. Required account creation before purchase
