# Ecom Cart + Checkout Design Patterns

**Owner:** elio
**Source intel:** decoder teardowns + Shopify checkout data + Baymard Institute
**Stack scope:** Stack B (Hydrogen + RR7) + Stack C
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. Cart: Drawer vs Page Decision

### Default: Cart Drawer
Cart drawer (overlay slide-in) is the default for 95% of ecom stores.

**Cart drawer wins because:**
- No page reload (lower friction)
- Shopper stays in context (PDP still visible behind drawer)
- Back button works correctly
- Decoder bank: cart drawer converts 12-17% better than cart page on desktop

**Cart page wins ONLY when:**
| Scenario | Reason |
|----------|--------|
| B2B / wholesale | Line-item review for PO/quote workflows |
| Configurable products | Gift wrap, monogramming, custom text input |
| Typical cart >5 items | Bulk-ordering, subscription bundles |
| Mobile with Shop Pay | Cart page + Shop Pay = 22% CVR vs drawer's 14% on mobile |

Document override reason when choosing page over drawer.

---

## 2. Cart Drawer Design

### STRUCTURE (top to bottom)

```
[Header: "Your Cart (3)" + X close button]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Free-shipping progress bar] ← conditional, ecom-cro provides threshold
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Line items — scrollable area]
  ├─ [Product image — 64px × 64px]
  ├─ [Title + variant detail (Size: M / Color: Black)]
  ├─ [Price]
  ├─ [Quantity stepper: − qty +]
  └─ [Remove × link]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Cart upsell row — 1-3 products] ← conditional
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Promo code field — collapsed by default, "Add promo code ▾"]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Subtotal block]
  ├─ Subtotal: $87.00
  ├─ Shipping: Free (or "Calculated at checkout")
  └─ Estimated total: $87.00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Express checkout row: Shop Pay | Apple Pay | PayPal | Google Pay]
[Primary CTA: "Checkout →" — bg-primary, sticky bottom mobile]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Trust badges row: lock icon + "Secure checkout" | return icon + "Free returns"]
```

### Drawer dimensions
- Mobile: full-height (100dvh), full-width (100vw)
- Desktop: 420px wide, full-height
- Backdrop: `bg-black/50 backdrop-blur-sm`

### Animation
```css
/* Drawer */
transform: translateX(100%);  → translateX(0);
transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1);

/* Backdrop */
opacity: 0 → 1;
transition: opacity 200ms ease;
```

### Accessibility
- `role="dialog" aria-modal="true" aria-label="Shopping cart"`
- Focus trap: first focus = close button
- ESC key dismisses drawer
- Focus returns to ATC button on close
- `aria-live="polite"` on item count for screen readers

---

## 3. Free Shipping Progress Bar

### WHEN
When store offers free shipping above a threshold.

### WHY
Decoder bank: free shipping bar lifts cart AOV 15-30%. Shoppers add items to reach threshold.

### SPEC

**Threshold formula** (from ELI-014):
`threshold = 1.4 × median-AOV` rounded to nearest $5.

**Three states:**

**State 1 — Progress (under threshold):**
```
[Progress bar: 40% filled]
Add $21 more for FREE shipping
```

**State 2 — Near threshold ($5-15 away):**
```
[Progress bar: 90% filled — amber/warning color]
You're SO close! Add $6 more for free shipping
```

**State 3 — Threshold reached:**
```
[Progress bar: 100% — green/success]
🎉 You've unlocked FREE shipping!
```

### Component spec
```tsx
const freeShippingThreshold = 70; // from ecom-cro config
const subtotal = parseFloat(cart.cost.subtotalAmount.amount);
const remaining = freeShippingThreshold - subtotal;
const progress = Math.min((subtotal / freeShippingThreshold) * 100, 100);

// merch writes the copy per state
// ecom-cro provides threshold value
// elio specs the bar + states
```

---

## 4. Quantity Stepper

### WHEN
Every line item in cart drawer/page.

### SPEC
```
[− button] [quantity: 2] [+ button]
```

- Buttons: 32px × 32px minimum
- Input: read-only text display (prevent manual input — too much edge case)
- Minus at qty 1: shows remove confirmation or directly removes (ecom-cro decision)
- Debounce: 300ms before firing cart update (prevent rapid-fire API calls)
- Optimistic: update UI immediately, sync with API in background

**Optimistic pattern:**
```tsx
// Use useOptimisticCart — instant visual update
const optimisticCart = useOptimisticCart(cart);
```

---

## 5. Cart Upsell Row

### WHEN
Cart has items + upsell products available from ecom-cro's eligibility query.

### WHY
Cart upsell: 10-20% of shoppers add a cart upsell item. Low-friction because intent is already high.

### SPEC
```
["Complete the look" or "You might also need" — merch writes]
[Horizontal scroll on mobile]
[1-3 product mini-cards:]
  [Image — 56px × 56px]
  [Title — 1 line truncated]
  [Price]
  [+ Quick-add button]
```

**Upsell product eligibility:** ecom-cro determines (related items, frequently bought together, complementary accessories). elio specs the slot.

---

## 6. Checkout Flow Design

### Default: Single-page checkout
Shopify's native checkout is single-page on Shopify Plus. Non-Plus: Shopify's standard multi-step.

**For Hydrogen/custom checkout (rare — Shopify Plus only):**

### Layout: Single-page checkout

```
[Checkout header: logo + secure lock badge]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[EXPRESS CHECKOUT — first, above all forms]
  [Shop Pay button] [Apple Pay button] [PayPal button] [Google Pay button]
  — or —
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Contact info section]
  Email (returning customer auto-detect)
  [OR: Login with Shop — returns customer link]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Delivery section]
  First name | Last name
  Address line 1 (with autocomplete)
  Address line 2 (optional, collapsed)
  City | State | ZIP
  Country
  Phone (numeric keypad on mobile: inputmode="tel")
[Shipping method selection]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ORDER BUMP — above payment, single product] ← ecom-cro provides
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Payment section]
  [Card: Stripe Elements or Shop Pay]
  [BNPL: Klarna/Afterpay badge]
  Billing address (same as delivery toggle, collapsed by default)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Order review + final CTA]
  [Order summary accordion]
  Subtotal / Shipping / Tax / Total
  [Pay now: $X.XX →]
  Security badges: SSL + payment logos
```

**Multi-step variant (high-AOV >$200 + configurable products only):**
```
Step 1: Contact → Step 2: Delivery → Step 3: Payment → Step 4: Review
```
Step indicator: `1 ●━━━━━ 2 ○━━━━━ 3 ○━━━━━ 4 ○`

---

## 7. Express Checkout Placement

### WHEN
Every checkout. Place ABOVE the form, not at the bottom.

### WHY
Decoder bank + Shopify data: Express checkout above form = +35.8% mobile CVR. Shop Pay = +50% vs guest checkout. Two fewer form-fill steps = fewer abandonments.

### Order of express buttons
1. Shop Pay (Shopify-native, highest Shopify CVR)
2. Apple Pay (iOS/Safari only — hide on Android/Chrome)
3. Google Pay (Android/Chrome — hide on iOS/Safari)
4. PayPal (fallback for all browsers)

**Implementation:**
```tsx
// Detect available payment methods
// Apple Pay: window.ApplePaySession?.canMakePayments()
// Google Pay: PaymentRequest API check
// Always show Shop Pay — Shopify handles eligibility
```

---

## 8. Mobile Checkout Specifics

| Element | Spec |
|---------|------|
| Express checkout | Full-width stacked buttons (not inline) |
| Address autocomplete | Trigger on focus, ≥1 char, Google Places API |
| Postal code | `inputmode="numeric"` |
| Phone number | `inputmode="tel"` |
| Email | `inputmode="email"` |
| Card number | `inputmode="numeric"` |
| First+Last name | Separate fields (autocomplete="given-name" / "family-name") |
| Sticky CTA | Fixed bottom, above keyboard |
| CTA text | "Pay $X.XX" (include amount — highest trust) |

---

## 9. Order Bump Design

### WHEN
Shopify Plus with Checkout Extensibility. Single product, positioned above payment section.

### WHY
Order bumps: 10-15% of customers click. High-AOV stores see $3-8 AOV lift per transaction.

### SPEC
```
[Checkbox] Yes! Add [Product Name] for just $X.XX
[Product image — 48px]  [Name + 1-line benefit]
[Price — discounted if applicable]
```

- One product only (decision fatigue with multiple)
- Price ≤ 20% of cart subtotal (impulse threshold)
- Checkbox unchecked by default (never pre-checked — dark pattern)
- merch writes the "Yes! Add..." copy

**Checkout Extensibility target:** `purchase.checkout.payment-method-list.render-after`

---

## 10. Post-Purchase Confirmation Page

### STRUCTURE (order is critical)

```
[Order confirmation header]
  ✓ Order confirmed!
  Order #12345
  A confirmation email has been sent to {email}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Post-purchase upsell — 30-min one-click window] ← ecom-cro determines
  [Product image] [Product name]
  [CTA: "Add to this order — $X"] ← single click, charged to same payment method
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Order summary]
  [Line items + subtotal + shipping + tax + total]
  Estimated delivery: [date range]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Account creation prompt (if guest)]
  "Save your info for faster checkout next time"
  [Create account — 1 click using email already captured]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Referral CTA]
  "Get $10 off your next order when a friend buys"
  [Share link / copy link]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Recommended products rail]
  "You might also love..."
  [4 ProductCards]
```

**Note on post-purchase upsell:** Shopify Post-Purchase Extensions (Shopify Plus). Single click charges to original payment method — no re-entering card. High conversion window: 30 minutes post-purchase. ecom-cro determines eligibility + pricing.

---

## 11. Cart Page Design (when applicable)

Same structure as drawer but full-page layout:

```
[Page header: "Your Cart (3 items)"]
[2-column layout: cart items left | order summary right]

LEFT — Cart items:
  Each line: [Image][Product info + variant][Price][Qty stepper][Remove]
  [Promo code field]
  [← Continue shopping link]

RIGHT — Order summary (sticky):
  Subtotal
  Shipping estimate
  Tax estimate
  Total
  [Express checkout row]
  [Checkout button]
  Trust badges
```

---

## 12. Abandonment Recovery Patterns

### Cart abandonment email (sequence handles)
- Trigger: cart created + no purchase in 1h
- Email 1 (1h): "You left something behind" + cart contents
- Email 2 (24h): social proof + reviews on items in cart
- Email 3 (72h): incentive (10% off code if viable)

### Exit-intent overlay (ecom-cro triggers)
- Desktop only (no mobile — intrusive)
- Trigger: mouse moves toward browser top (exit intent)
- Copy: "Before you go..." + incentive
- Show once per session

### Sticky cart icon (persistent)
- Always visible in header
- Shows cart item count (optimistic)
- Tap/click opens cart drawer

---

## 13. Performance + Accessibility

### Cart drawer performance
- Lazy-hydrate drawer content (client-side only, not SSR)
- Use `Suspense` for cart fetch
- Express checkout buttons: deferred script load (doesn't block render)

### Checkout performance
- Address autocomplete: load Google Places async (not blocking)
- Payment form: Shopify handles (hosted fields, no PCI scope on storefront)

### Accessibility
- Cart drawer: focus trap when open (`@headlessui/react` `Dialog`)
- ESC key closes drawer
- All interactive elements keyboard-navigable
- `aria-live="polite"` on cart count
- Form labels: explicit `<label for="...">` (not placeholder-only)
- Error messages: `role="alert"` (announced to screen readers)

---

## 14. Anti-Patterns

1. **Promo code field always visible** — triggers discount-hunting, hurts margin. Collapse behind "Have a code?" link.
2. **Checkout that redirects to separate domain** — breaks trust, looks phishing-like. Shopify checkout on same domain with subdomain is fine.
3. **Pre-checked upsells or add-ons** — dark pattern, illegal in EU (GDPR), harmful to trust.
4. **Cart page that removes items on page refresh** — session storage vs cookie conflict. Use Shopify cart API (server-side).
5. **No express checkout option** — Shop Pay alone can lift CVR 15-30% for Shopify stores.
6. **Multi-step checkout for simple orders** — friction kills mobile conversion. Default single-page.
7. **Required account creation before checkout** — instant abandonment. Always guest checkout first.
8. **Showing full price in cart including tax before checkout** — tax revealed at checkout = Baymard "hidden fee" shock (top cart abandonment reason). Show "tax calculated at checkout" instead.
