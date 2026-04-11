---
name: Billing & Subscription Patterns
description: Production-grade billing, subscription, and monetization patterns — how Dodo Payments, Shopify, and LemonSqueezy should be wired across all Boldteq projects
type: reference
---

## Core Principles (Stack-Agnostic)

### 1. Billing Is Day-One Architecture
- Never ship v1 without billing scaffolded — retrofitting billing into an existing app is one of the most painful refactors
- Billing defines the permission model: what users can do is a function of what they pay for
- Design the data model around subscription status from the start

### 2. Webhooks Are the Source of Truth
- The billing provider (Dodo Payments, Shopify Billing) is the canonical source for subscription status
- Local database stores a cached copy, updated via webhooks
- Never trust client-side subscription checks for access control
- Always validate webhook signatures before processing

### 3. Graceful Degradation
- Failed payments → grace period (3-7 days), not instant cutoff
- Downgrade → preserve data, restrict features, show upgrade prompt
- Cancellation → access until end of billing period, then restrict
- Never delete user data on cancellation — allow reactivation

---

## Stack-Specific Patterns

### Stack A — Dodo Payments (Next.js SaaS)

**Customer Lifecycle:**
```
Signup → Create Dodo Customer → Store dodo_customer_id on user
Free Trial → Create Subscription with trial_period_days
Convert → Checkout Session → Subscription Active
Upgrade/Downgrade → Subscription Update (prorate by default)
Cancel → Subscription set to cancel_at_period_end
Reactivate → Remove cancellation before period end
```

**Webhook Handling (Next.js API Routes):**
```typescript
// app/api/webhooks/dodo-payments/route.ts
import { Webhooks } from '@dodopayments/nextjs'

export const POST = Webhooks({
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY!,
  onPayload: async (payload) => {
    // handle subscription and payment events
  },
})
```

**Webhook Handling (Supabase Edge Functions / Deno):**
```typescript
// supabase/functions/dodo-webhook/index.ts
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
const wh = new Webhook(Deno.env.get("DODO_WEBHOOK_SECRET"));
const event = wh.verify(body, {
  "webhook-id": req.headers.get("webhook-id"),
  "webhook-timestamp": req.headers.get("webhook-timestamp"),
  "webhook-signature": req.headers.get("webhook-signature"),
});
// @dodopayments/nextjs is NOT available in Deno -- use standardwebhooks directly
```

**Pricing Model:**
```sql
-- plans table
id, dodo_product_id, name, tier (free/starter/pro/enterprise),
monthly_price, annual_price, features (jsonb), limits (jsonb)

-- subscriptions table
id, user_id, org_id, dodo_subscription_id, dodo_customer_id,
plan_id, status (active/trialing/past_due/canceled/unpaid),
current_period_start, current_period_end, cancel_at_period_end
```

**Feature Gating:**
```typescript
// Server-side check — in loader/API route, never UI-only
const subscription = await getSubscription(user.id)
const plan = await getPlan(subscription.plan_id)

if (!plan.features.includes('advanced_analytics')) {
  return json({ error: 'Upgrade required', requiredPlan: 'pro' }, { status: 403 })
}
```

**Checkout Flow (Dodo Payments Checkout):**
- Use Dodo Payments Checkout Sessions for payment collection — never build custom card forms unless absolutely required
- `success_url` and `cancel_url` with `{CHECKOUT_SESSION_ID}` placeholder
- Verify session completion server-side before granting access
- Store `checkout_session_id` for audit trail

### Stack B — Shopify Billing API (Remix)

**Subscription Check Pattern:**
```typescript
// In loader — check before rendering any paid feature
const { admin, billing } = await authenticate.admin(request)
const { hasActivePayment } = await billing.check({
  plans: ['Pro', 'Enterprise'],
  isTest: process.env.NODE_ENV !== 'production'
})
if (!hasActivePayment) {
  return billing.request({ plan: 'Pro', isTest: true })
}
```

**Shopify Billing Rules:**
- Always offer a free trial on first install (7-14 days standard)
- Use `APP_SUBSCRIPTIONS_UPDATE` webhook to track status changes
- Test billing in dev store before submitting for review
- Recurring charges are per-shop, not per-user
- Usage-based billing available via `appUsageRecordCreate` mutation

### Stack A-Lovable — Dodo Payments via Supabase Edge Functions (Vite SPA)

**Context:** Lovable-origin projects (Vite + React SPA) that use Supabase Edge Functions (Deno runtime) instead of Next.js API routes. No `@dodopayments/nextjs` helper available -- raw REST API calls instead.

**Checkout Flow (Server-Side Redirect, No Frontend SDK):**
```typescript
// Supabase Edge Function (Deno): dodo-checkout/index.ts
// 1. Auth user via Supabase (Authorization header -> getUser())
// 2. Look up profile for dodo_customer_id
// 3. POST https://api.dodopayments.com/subscriptions with payment_link: true
// 4. Return { url: payment_link } to frontend
// 5. Frontend does window.location.href = url (redirect to Dodo-hosted checkout)

// Key: payment_link: true means Dodo returns a hosted checkout URL
// No frontend SDK (like @stripe/stripe-js) needed at all
```

**Webhook Verification (standardwebhooks -- NOT Stripe-style):**
```typescript
// Supabase Edge Function (Deno): dodo-webhook/index.ts
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const wh = new Webhook(Deno.env.get("DODO_WEBHOOK_SECRET"));
const headers = {
  "webhook-id": req.headers.get("webhook-id"),
  "webhook-timestamp": req.headers.get("webhook-timestamp"),
  "webhook-signature": req.headers.get("webhook-signature"),
};
const event = wh.verify(body, headers); // throws on invalid
// event = { type: "subscription.active", data: { ... } }
```

**Customer Portal:**
```typescript
// GET https://api.dodopayments.com/customers/{customer_id}/portal
// Returns: { link: string }
// Frontend redirects to the link URL
```

**Events to Handle:**
- `subscription.active` -- activate plan (set plan, scan_limit, subscription_id, customer_id, billing_cycle_end)
- `subscription.renewed` -- bump billing_cycle_end
- `subscription.cancelled` -- downgrade to free (reset plan, scan_limit, clear subscription_id)
- `payment.failed`, `subscription.on_hold`, `subscription.charge_failed` -- log, future dunning

**Env Vars (Supabase Edge Function Secrets):**
- `DODO_API_KEY` -- server-side API key
- `DODO_WEBHOOK_SECRET` -- standardwebhooks signing secret (format: `whsec_xxx`)
- `DODO_PRODUCT_{PLAN}_{CYCLE}` -- one per plan/billing-cycle combination (e.g., `DODO_PRODUCT_PRO_MONTHLY`)

**Anti-pattern:** Adding `VITE_DODO_PUBLISHABLE_KEY` to `.env.example` -- Dodo has no frontend SDK. All API calls are server-side. No VITE_-prefixed Dodo env vars needed.

**Post-Migration Cleanup Checklist:** See `patterns/avoid/antipatterns.md` "Billing Migration Antipatterns" section for the full 10-step cleanup checklist.

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1 (verified against live codebase 2026-04-06)
**Knowledge Version:** v1

### Stack C — AI App Billing (Dodo Payments + Usage)

- Same Dodo Payments foundation as Stack A
- Additional: usage-based billing for AI token consumption
- Track tokens per request, aggregate per billing period
- Dodo Payments usage tracking or manual invoice line items
- Hard limits per tier to prevent cost overruns
- Real-time usage dashboard for users to monitor consumption

---

## Pricing Strategy Patterns (From Top SaaS)

### Tier Structure (Industry Standard)
```
Free      — Acquisition (limited features, usage caps)
Starter   — Individual/small team ($9-29/mo)
Pro       — Growth team ($49-99/mo)
Enterprise — Custom pricing, annual contracts
```

### Pricing Psychology
- Annual discount: 15-20% (shows monthly equivalent)
- Feature anchoring: most popular plan highlighted
- Usage limits: generous enough to hook, tight enough to convert
- Social proof on pricing page (logos, testimonials, user counts)

### What Linear/Notion/Vercel Do
- **Linear:** Free for small teams, per-seat pricing for growth
- **Notion:** Free personal, per-seat for teams, volume discounts for enterprise
- **Dodo Payments:** Usage-based (% of transaction), global payments for digital products
- **Vercel:** Free for hobby, per-seat + usage for teams, custom enterprise

---

## Billing UI Patterns

### Pricing Page
- 3-4 tiers max (more causes decision paralysis)
- Monthly/Annual toggle with savings badge
- Feature comparison table below cards
- FAQ section addressing common objections
- CTA hierarchy: Free (outline) → Pro (primary/filled) → Enterprise (contact)

### Settings/Billing Page
- Current plan with usage meter
- Next billing date and amount
- Payment method on file (last 4 digits)
- Invoice history with download links
- Upgrade/downgrade with proration preview
- Cancel with retention flow (reason survey, offer discount)

### Upgrade Prompts (In-App)
- Triggered when user hits a limit, not randomly
- Shows what they'd unlock, not what they're missing
- One-click upgrade (pre-fill checkout with current info)
- Never block the user's current workflow — prompt after action completes

---

## Billing Security Checklist

1. [ ] Webhook signature validation on every request
2. [ ] Webhook handler using @dodopayments/nextjs (Next.js) OR standardwebhooks (Supabase Edge Functions / Deno)
3. [ ] Idempotency: same webhook delivered twice → same result
4. [ ] No billing state derived from client-side data
5. [ ] Dodo Payments customer portal for self-service payment management
6. [ ] PCI compliance: never touch raw card data (use Dodo Payments Checkout)
7. [ ] Invoice receipts sent automatically (Dodo Payments handles this)
8. [ ] Tax handling configured (Dodo Payments or manual per jurisdiction)
9. [ ] Currency handling: always use smallest unit (cents, not dollars)
10. [ ] Refund flow documented and tested

---

## Common Antipatterns (Never Do These)

- Building custom payment forms instead of Dodo Payments Checkout — PCI nightmare
- Checking subscription status only in the UI — server must enforce
- Not handling `invoice.payment_failed` — users silently lose access
- Deleting data on cancellation — they might come back
- Hard-coding prices — use Dodo Payments product objects, fetch dynamically
- Skipping trial periods — reduces conversion significantly
- Not showing proration preview on plan changes — surprise charges create support tickets
- Storing full card numbers anywhere — use Dodo Payments Checkout only

---

*(Updated by trainer agent — add learnings via `/train`)*
