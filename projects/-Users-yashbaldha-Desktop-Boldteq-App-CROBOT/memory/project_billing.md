---
name: CROBOT Billing -- Dodo Payments (Migration Complete)
description: CROBOT uses Dodo Payments for billing. Stripe-to-Dodo migration completed 2026-04-06. Full integration details.
type: project
---

## Current State: Dodo Payments (fully migrated)

CROBOT uses Dodo Payments (dodopayments.com) for all billing. The Stripe-to-Dodo migration was completed on 2026-04-06.

**Why:** Yash uses Dodo Payments across all Boldteq SaaS products. Consistent billing provider across the portfolio.

---

## Dodo Payments Integration Architecture

### Edge Functions (Supabase Deno Runtime)

| Function | Purpose | API Endpoint |
|----------|---------|-------------|
| `dodo-checkout` | Create subscription with hosted checkout | `POST /subscriptions` with `payment_link: true` |
| `dodo-webhook` | Process subscription lifecycle events | Receives standardwebhooks-signed payloads |
| `dodo-portal` | Fetch customer self-service portal URL | `GET /customers/{id}/portal` |

### Dodo Payments API Reference

**Base URL:** `https://api.dodopayments.com`
**Auth:** `Authorization: Bearer {DODO_API_KEY}`

**Create Subscription (checkout):**
```typescript
// POST https://api.dodopayments.com/subscriptions
{
  billing: { currency: "USD", interval: "month" | "year", interval_count: 1 },
  customer: {
    create_new_customer: false, customer_id: "cus_xxx"
    // OR: create_new_customer: true, email: "...", name: "..."
  },
  product_id: "prod_xxx",
  payment_link: true,        // <-- returns hosted checkout URL instead of embedded form
  return_url: "https://app.example.com/dashboard?checkout=success",
  metadata: { user_id: "uuid", plan: "pro" }
}
// Response: { payment_link: string, customer_id: string, subscription_id: string }
```

**Customer Portal:**
```typescript
// GET https://api.dodopayments.com/customers/{customer_id}/portal
// Response: { link: string }
```

### Webhook Verification (standardwebhooks)

Dodo Payments uses the `standardwebhooks` spec, NOT a proprietary verifier like Stripe.

```typescript
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const wh = new Webhook(webhookSecret);  // webhookSecret = base64-encoded HMAC key (whsec_xxx)
const headers = {
  "webhook-id": req.headers.get("webhook-id"),
  "webhook-timestamp": req.headers.get("webhook-timestamp"),
  "webhook-signature": req.headers.get("webhook-signature"),
};
const event = wh.verify(body, headers);  // throws on invalid signature
```

### Webhook Events Handled

| Event | Action |
|-------|--------|
| `subscription.active` | Activate plan, set scan_limit + billing_cycle_end, persist customer_id + subscription_id |
| `subscription.renewed` | Update billing_cycle_end for next period |
| `subscription.cancelled` | Downgrade to free plan, clear subscription data, reset scan_limit to 3 |
| `subscription.on_hold` | Log only (future: dunning email) |
| `payment.failed` | Log only (future: dunning email) |
| `subscription.charge_failed` | Log only (future: dunning email) |

### Database Schema (profiles table -- billing columns)

```sql
dodo_customer_id TEXT        -- Dodo customer ID (cus_xxx), set on first checkout
dodo_subscription_id TEXT    -- Dodo subscription ID, set on subscription.active webhook
plan TEXT DEFAULT 'free'     -- 'free' | 'pro' | 'agency'
scan_limit INT DEFAULT 3    -- per billing cycle
billing_cycle_end TIMESTAMPTZ -- when current billing period ends
```

### Frontend Hook (use-billing.ts)

- `useCheckout({ plan, billingCycle })` -- calls `dodo-checkout` edge function, redirects to `payment_link` URL
- `useCustomerPortal()` -- calls `dodo-portal` edge function, redirects to portal URL
- `useUsage()` -- reads from AuthContext profile (no network call), returns scansUsed/scanLimit/usagePercent/plan

### Env Vars (Supabase Edge Function Secrets)

| Var | Description |
|-----|-------------|
| `DODO_API_KEY` | API key from Dodo dashboard (server-side only) |
| `DODO_WEBHOOK_SECRET` | Webhook signing secret (standardwebhooks format: `whsec_xxx`) |
| `DODO_PRODUCT_PRO_MONTHLY` | Product ID for Pro plan monthly |
| `DODO_PRODUCT_PRO_ANNUAL` | Product ID for Pro plan annual |
| `DODO_PRODUCT_AGENCY_MONTHLY` | Product ID for Agency plan monthly |
| `DODO_PRODUCT_AGENCY_ANNUAL` | Product ID for Agency plan annual |

**No frontend env vars needed** -- Dodo checkout is a server-side redirect, no frontend SDK.

---

## Migration Details (completed 2026-04-06)

### Files Created
- `supabase/functions/dodo-checkout/index.ts`
- `supabase/functions/dodo-webhook/index.ts`
- `supabase/functions/dodo-portal/index.ts`
- `supabase/migrations/006_dodo_payments.sql` -- renames `stripe_customer_id` -> `dodo_customer_id`, `stripe_subscription_id` -> `dodo_subscription_id`

### Files Modified
- `src/hooks/use-billing.ts` -- edge function names changed
- `src/types/database.ts` -- field renames
- `src/integrations/supabase/types.ts` -- field renames (mirrors database.ts)
- `.env.example` -- Stripe vars removed, Dodo vars added
- `src/pages/admin/Integrations.tsx` -- Stripe card replaced with Dodo Payments card
- `src/pages/admin/System.tsx` -- stripeConfigured -> dodoConfigured
- `src/pages/Terms.tsx` and `src/pages/Privacy.tsx` -- Stripe references replaced

### Files Removed
- `@stripe/stripe-js` from package.json

### Known Remaining Cleanup (post-migration)
- `src/lib/stripe.ts` still exists (dead file -- imports removed package, nothing imports it)
- `supabase/functions/stripe-checkout/`, `stripe-webhook/`, `stripe-portal/` directories still exist (superseded by dodo-* functions)
- Project CLAUDE.md still references Stripe in 4 lines

---

## Pricing Tiers (unchanged)

| Plan | Price | Scans/Month |
|------|-------|-------------|
| Free | $0 | 3 |
| Pro | $49/mo | 25 (edge function sets 50 in PLAN_LIMITS -- verify against intended limit) |
| Agency | $199/mo | 500 |

**Note:** The webhook handler has `PLAN_LIMITS = { free: 3, pro: 50, agency: 500 }` but CLAUDE.md says Pro is 25 scans. This discrepancy should be resolved -- check which is the intended limit.

---

*(Updated by Mira -- 2026-04-06 Stripe-to-Dodo migration session)*
