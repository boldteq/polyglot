# Billing & Monetization — Models & Implementation

> Source: shopify.dev/docs/apps/launch/billing | shopify.dev/docs/apps/launch/billing/subscription-billing
> Last extracted: 2026-04-04

## Five Pricing Models

### 1. Time-Based Subscriptions (Recurring)

**Best For:** Fixed monthly/annual charges, predictable revenue

**Characteristics:**
- Recurring charge every 30 or 365 days
- Consistent, predictable amount
- Automatic renewal unless cancelled
- Billing handled by Shopify

**Example Pricing:**
```
Basic: $9.99/month
Pro: $29.99/month
Enterprise: $99.99/month

Annual option: 20% discount
```

**Implementation:**
```typescript
// shopify.app.toml
[billing.Basic]
amount = 9.99
currency_code = "USD"
interval = "every_30_days"
trial_days = 7

[billing.Pro]
amount = 29.99
currency_code = "USD"
interval = "every_30_days"
trial_days = 7
```

---

### 2. Usage-Based Subscriptions (Pay-per-Use)

**Best For:** Variable usage patterns, fairness for different merchant sizes

**Characteristics:**
- Charge based on actual app usage during billing cycle
- 30-day billing cycle (fixed)
- Merchants pay only for what they use
- Unpredictable cost (varies each month)

**Example Pricing:**
```
Base: Free
Usage: $0.10 per email sent
Overage: $0.05 per email over 10,000/month
```

**Use Cases:**
- Email volume-based pricing
- SMS send counts
- API calls processed
- Transaction-based fees

**Best Practices:**
- Set fair usage rates
- Transparent usage reporting in app
- Clear overage notifications
- Grace period before charging overage

---

### 3. Combined (Hybrid) Subscriptions

**Best For:** Base cost + variable overages (SaaS standard model)

**Characteristics:**
- Recurring base fee + usage charges
- Billing cycle: 30 days (only option)
- Base ensures baseline revenue
- Overage encourages tier upgrades

**Example Pricing:**
```
Starter: $50/month base
- Includes: 1,000 emails/month, basic reporting

Pro: $150/month base
- Includes: 10,000 emails/month, advanced analytics, automations

Overage: $0.05 per email over plan limit
```

**Merchants Prefer:**
- Base cost predictable (budgeting)
- Overages fair (don't break bank)
- Clear documentation of included usage

---

### 4. One-Time Charges (Non-Recurring)

**Best For:** Feature packs, credits, add-ons, one-time purchases

**Characteristics:**
- Single charge, no recurring billing
- No trial period
- Instant activation
- Examples: Credit packs, feature unlocks, premium templates

**Example Pricing:**
```
1,000 Email Credits: $25
5,000 Email Credits: $100 (20% savings)
Custom Integrations: $500 (one-time)
```

**Use Cases:**
- Credit packs for overage
- Premium template collections
- Custom setup services
- API integration packages

---

### 5. Managed App Pricing

**Best For:** Simple, fixed pricing without custom implementation

**Characteristics:**
- Define pricing in Partner Dashboard (no code)
- Shopify handles billing automatically
- No custom Billing API mutations needed
- Less flexibility than Billing API
- Simpler to manage

**Best For:**
- Simple pricing plans
- Fixed monthly/annual charges
- Free tier + one paid tier

**Limitation:**
- Cannot do usage-based pricing
- Cannot customize billing flows
- Limited pricing complexity

---

## Shopify's 30% Commission

**Revenue Share:** Shopify takes 30% of app revenue (standard model)
- **Example:** $10/month subscription
  - Merchant pays: $10
  - Shopify takes: $3 (30%)
  - Developer receives: $7
- **Varies:** Commission may be different based on partnership agreement
- **Payment:** Funds deposited monthly to Partner account

**Commission Covers:**
- Payment processing
- Subscription management
- App Store hosting
- Customer support infrastructure

---

## Free Trial Strategy

**Industry Standard:** 7-14 day free trial

**Best Practices:**
- **Trial Length:** 7 days (short), 14 days (generous)
- **Access:** Full feature access during trial
- **No Credit Card Hack:** Require credit card upfront (helps conversion)
- **Clear Expiration:** Notify before trial ends
- **Conversion:** ~3-5% trial-to-paid typical rate
- **Automatic Upgrade:** Charge card on trial expiration (with consent)

**Example Trial Flow:**
```
Day 1: Merchant installs app → trial starts
Day 5: In-app reminder: "Your trial ends in 9 days"
Day 13: Email: "Trial expires tomorrow"
Day 14: Charge credit card automatically (if merchant approved)
```

---

## Billing Requirements (BLOCKING)

### Testing Billing (Before Submission)
- **BLOCKING:** Must test billing system before App Store submission
- **Test Charges:** Create test charges on dev store
- **Verify:**
  - Charge creation works
  - Charge confirmation sent
  - Charge decline handled gracefully
  - Refund flow works
  - Subscription cancellation works
  - Trial period functions correctly

### Billing Functionality (Must Work)
- **BLOCKING:** Billing system must function on dev store
- **Create Subscriptions:** appSubscriptionCreate mutation works
- **Handle Confirmations:** Verify charge_succeeded webhook
- **Manage Cancellations:** cancellations processed correctly
- **Display Billing History:** Merchants can see past charges

### Pricing Transparency (Must Disclose)
- **BLOCKING:** Pricing must be clearly displayed
- **App Store Listing:** Pricing section filled out
- **In-App:** Current plan and cost visible
- **No Surprises:** All fees disclosed upfront
- **Billing History:** Merchants can view and download invoices

---

## Billing Compliance

### Failed Payments
- Graceful handling of declined cards
- Retry logic (typically 3 retries over 7 days)
- Clear notification to merchant
- Option to update payment method
- Grace period before service downgrade

### Subscriptions & Cancellation
- Merchants can cancel anytime (no lock-in)
- Immediate cancellation or end-of-cycle cancellation option
- Prorated refunds if cancelling mid-cycle
- Clear confirmation of cancellation
- Easy re-subscription option

### Billing History
- Merchants can view all charges
- Download invoices (PDF format)
- Export billing history
- Clear billing dashboard
- Receipt/invoice for each charge

### Transparent Pricing & Limits
- Clear usage limits per plan
- Overage notifications (before charging)
- Upgrade prompts when approaching limits
- Fair pricing (merchants don't resent bills)

---

## GraphQL Mutations for Billing

### Create Subscription
```typescript
mutation {
  appSubscriptionCreate(
    name: "Basic Plan"
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: "9.99", currencyCode: "USD" }
            interval: EVERY_30_DAYS
          }
        }
        quantity: 1
      }
    ]
    trialDays: 7
    returnUrl: "https://yourapp.com/billing/callback"
  ) {
    appSubscription {
      id
      status
      confirmationUrl
    }
    userErrors {
      message
    }
  }
}
```

### Create One-Time Purchase
```typescript
mutation {
  appPurchaseOneTimeCreate(
    name: "1000 Email Credits"
    price: { amount: "25.00", currencyCode: "USD" }
    returnUrl: "https://yourapp.com/credits/callback"
  ) {
    appPurchaseOneTime {
      id
      confirmationUrl
    }
    userErrors {
      message
    }
  }
}
```

---

## Billing Checklist

- [ ] Pricing model chosen (subscription, usage-based, hybrid, one-time, managed)
- [ ] Trial period defined (7-14 days recommended)
- [ ] Pricing tiers created (free, starter, pro, enterprise)
- [ ] Pricing clearly displayed in App Store listing
- [ ] Test charges work on dev store
- [ ] Charge confirmation webhook verified
- [ ] Refund flow tested
- [ ] Subscription cancellation tested
- [ ] Trial expiration tested
- [ ] Billing history displayed to merchants
- [ ] Invoice/receipt generation working
- [ ] Payment failure handling implemented
- [ ] Overage handling (if usage-based) implemented
- [ ] Price clear in-app and in listing (no hidden fees)
- [ ] Payment terms documented (30% commission disclosed)

---

## References

- **Billing Overview:** https://shopify.dev/docs/apps/launch/billing
- **Subscription Billing:** https://shopify.dev/docs/apps/launch/billing/subscription-billing
- **Usage-Based Pricing:** https://shopify.dev/docs/apps/launch/billing/subscription-billing/create-usage-based-subscriptions
- **Managed Pricing:** https://shopify.dev/docs/apps/launch/billing/managed-pricing
- **GraphQL Mutations:** https://shopify.dev/api/admin-graphql/2025-01/mutations/appSubscriptionCreate
