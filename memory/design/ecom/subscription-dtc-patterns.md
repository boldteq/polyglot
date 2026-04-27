# Subscription + DTC Design Patterns

**Owner:** elio
**Source intel:** Recharge, Skio, Shopify Subscriptions + AG1, Ritual, Native, Function of Beauty, Curology teardowns
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. Subscription Toggle on PDP

### Default rule (ELI-010)
**One-time is ALWAYS selected by default.** Subscription is option 2.

**Default-subscribe override ONLY when ALL THREE conditions met:**
1. LTV-sub > 3× LTV-one-time (measured, not estimated)
2. Cancel flow has ≥3-step save sequence (pause offer → skip offer → discount → confirm cancel)
3. Pause option is self-serve in account portal (no "contact us to pause")

Most stores don't meet all three. One-time default is correct for 85%+ of brands.

### WHY
Defaulting to subscribe = dark pattern. Forces recurring billing on customers who didn't intend it. EU laws prohibit pre-checked subscriptions. US FTC guidelines prohibit obscuring subscription terms. Trust > short-term LTV.

### SPEC

```
[○ One-time   $29.00]
[● Subscribe & save 20%   $23.20 / delivery]
     [Every month ▾]    [Skip or cancel anytime]
```

**Visual hierarchy:**
- Both options equal visual prominence (same size, same weight)
- Selected state: ring-2 ring-primary + bg-primary/5
- Savings badge: "Save 20%" in success/green color near subscription option
- Savings display: show BOTH % AND dollar amount ("Save 20% / $5.80 per order")

**Frequency selector:**
```
Every 2 weeks | Every month (default) | Every 6 weeks | Every 3 months
```
- Dropdown or inline radio buttons
- Default: Monthly (highest retention, decoder bank)
- No more than 5 frequency options

**Subscription disclaimer:**
```
"Skip or cancel anytime in your account. No fees."
```
Always visible when subscription option is shown. Never hide cancellation info.

---

## 2. Subscription Apps (Shopify)

| App | Best for | Notes |
|-----|----------|-------|
| Shopify Subscriptions | Simple replenishment | Native, no extra app fee |
| Recharge | Scale, custom portal, bundles | Most mature ecosystem |
| Skio | Passwordless portal, retention focus | Best churn mitigation UX |
| Bold Subscriptions | Complex B2B / wholesale | Heavy but flexible |
| Loop Subscriptions | High-growth DTC, good analytics | Strong for supplements |

**Hydrogen integration:** All above apps have Hydrogen-compatible storefronts. Recharge Checkout Extensions = native Shopify checkout (no redirect friction).

---

## 3. Subscriber Account Portal

### WHEN
Any ecom brand with subscription products.

### WHY
Self-serve subscription management is legally required in many markets and is a primary retention tool. Customers who can easily manage (not cancel) their subscription churn less.

### STRUCTURE

**Portal main screen:**
```
[Active subscriptions — card per subscription]
  [Product image + name]
  [Frequency: Every month]
  [Next charge: May 15 · $23.20]
  [Actions: Skip | Pause | Swap | Change frequency | Cancel]
```

**Action hierarchy (show in this order, most to least likely):**
1. **Skip next order** — easiest, zero revenue impact this cycle
2. **Pause subscription** — pauses for X months, shows pause date
3. **Swap product** — change to different product (keeps subscriber)
4. **Change frequency** — address "I have too much"
5. **Cancel** — always visible, never hidden (legal requirement)

**Skio model (best-in-class):** Passwordless login via magic link. No account password required. Makes portal access frictionless → more subscribers engage with portal → lower churn.

---

## 4. Cancel Save Flow (3-Step)

### WHEN
Customer clicks "Cancel" on subscription portal.

### WHY
Churn mitigation: 20-35% of subscribers who click cancel can be saved with the right offer sequence. AG1 saves ~28% at this step.

### SPEC: 3-step sequence

**Step 1: Pause offer**
```
[Before you cancel...]
[Why do you want to cancel?] — multiple choice
  ○ It's too expensive
  ○ I have too much product
  ○ I want to try something else
  ○ I didn't use it
  ○ Other

[Based on selection — address it:]
"Too expensive" → "Pause for 1-2 months: no charges, no cancellation" [Pause subscription]
"Too much product" → "Skip your next 2 deliveries" [Skip deliveries]
[Continue to cancel]
```

**Step 2: Discount/swap offer**
```
[We'd hate to lose you.]
[How about 25% off your next 3 orders?] [Accept offer]
[Or would you prefer a different product?] [Swap product]
[No thanks, continue to cancel]
```

**Step 3: Final confirmation**
```
[Are you sure?]
Your subscription ends on [date]. You won't be charged after [date].
[Yes, cancel my subscription]   [Keep my subscription]
```

**Rules:**
- Offer must be different at each step
- Never repeat the same offer twice
- Always show a path to cancel (no infinite loops — illegal)
- Maximum 3 steps (EU regulations, FTC guidelines)
- Legal: can't hide cancel behind "contact us" wall (FTC's "click-to-cancel" rule 2024)

---

## 5. Subscription PDP Copy Slots (merch)

These are copy slots that elio reserves in the PDP design. merch writes the copy.

| Slot | Example | Char limit |
|------|---------|------------|
| Toggle label: one-time | "One-time purchase" | 20 |
| Toggle label: subscribe | "Subscribe & save 20%" | 22 |
| Frequency default label | "Delivered every month" | 24 |
| Savings display | "Save 20% / $5.80 per order" | 30 |
| Subscription disclaimer | "Skip or cancel anytime. No fees." | 35 |
| Cancel save Step 1 headline | "Before you cancel..." | 22 |

---

## 6. Build-a-Box UX

### WHEN
Brands with complementary products (supplement stacks, skincare routines, meal kit bundles).

### WHY
Build-a-box: higher AOV (bundled savings drive cart value) + higher subscription LTV (customers invested in multi-product routine stay longer).

### SPEC

```
[Step 1: Choose your base] — required product (hero SKU)
[Step 2: Add supplements / add-ons] — optional add-ons, each toggleable
  [Product card + "Add to stack +" toggle]
  [Price: included in bundle OR +$X/mo]
[Step 3: Choose frequency]
[Summary panel: what's included + total price/mo]
[Subscribe CTA: "Start my routine — $X/month"]
```

**Pricing mechanic:** Bundled price < sum of individual prices. Show savings on summary panel. ecom-cro handles the pricing logic.

---

## 7. Replenishment Reminder

### WHEN
Subscription products with predictable usage cycle (supplements, pet food, skincare).

### WHY
Proactive re-order reminders before the customer runs out convert 60-65% of targeted customers (highest conversion rate of any ecom email trigger per decoder bank).

### Types
1. **Pre-charge reminder** (5-7 days before next billing): "Your next delivery is in 5 days"
2. **Shipped notification**: tracking link
3. **Running low reminder** (based on average consumption): "Based on your order history, you might be running low"
4. **Reorder nudge** (for one-time buyers to convert to subscribe): "Ready to reorder? Subscribe and save 20%"

sequence agent handles email copy and timing.

---

## 8. Trial-to-Paid Conversion

### WHEN
Brands offering trial box, starter kit, or free-trial subscription.

### SPEC

**Trial landing page CTA:**
```
"Start your trial for $X" (not "Subscribe" — lower commitment language)
Sub-text: "Cancel anytime. No charges until Day X."
```

**In-portal trial status:**
```
[Trial active — X days remaining]
[Your subscription starts on: May 15 · $29/month]
[Cancel before May 15 to avoid charges]
```

**Day X-5 email (sequence):** "Your trial ends in 5 days. Stay subscribed to keep your results."

**Day X email (sequence):** "Thank you for subscribing! Your first full delivery ships [date]."

**Cancel before trial ends:**
- No friction — instant cancellation, no save flow on trial (user hasn't paid, high anger risk)
- Simple: "[Cancel trial]" → confirmation → "Your trial has been cancelled. No charges."

---

## 9. Anti-Patterns

1. **Default-subscribe without meeting ELI-010 conditions** — dark pattern, legal risk (EU, FTC)
2. **Hidden cancel path** — "contact us to cancel" (FTC violation since 2024, EU Consumer Rights Directive)
3. **Pre-checked subscription upsell at checkout** — dark pattern, illegal in many markets
4. **Cancel flow with >3 steps** — feels like a trap, damages brand reputation
5. **Repeating the same save offer** — users feel manipulated
6. **No pause option** — biggest churn driver is "I have too much." Pause solves this.
7. **Frequency selector with only "Monthly"** — forces churn when usage rate doesn't match delivery rate
8. **Subscription portal requiring password login** — friction = unengaged subscribers = higher churn
9. **Trial that auto-converts without reminder** — surprise charges = chargebacks + brand damage
10. **"Cancel Subscription" button smaller than "Keep Subscription" button** — visual manipulation, dark pattern
