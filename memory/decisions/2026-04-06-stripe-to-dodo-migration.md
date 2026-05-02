## Decision: Migrate CROBOT Billing from Stripe to Dodo Payments
**Date:** 2026-04-06
**Status:** implemented
**Decision Maker:** Yash
**Project:** ConvertScan (CROBOT)

### Problem / Context
CROBOT was initially scaffolded with Stripe as the billing provider. Yash uses Dodo Payments as the standard billing provider across all Boldteq SaaS products for consistency, simpler API surface, and global payment support.

The Stripe integration was partially built (edge functions existed but were not production-tested). Migration was needed before launch.

### Options Considered
1. **Option A: Keep Stripe**
   - Pros: Already scaffolded, mature ecosystem, extensive documentation
   - Cons: Inconsistent with Boldteq standard, different webhook patterns per project, Stripe SDK needed on frontend
   - Effort: 0 (keep as-is)
   - Risk: Technical debt across portfolio from mixed billing providers

2. **Option B: Migrate to Dodo Payments**
   - Pros: Consistent across all Boldteq SaaS, simpler API (REST-only, no frontend SDK), global payments, standardwebhooks for verification
   - Cons: Migration effort, less community documentation than Stripe
   - Effort: ~3 hours (create 3 edge functions, update hooks/types/pages/migration)
   - Risk: Low -- Dodo API is straightforward, migration is clean

### Decision
**Chosen:** Option B (Migrate to Dodo Payments)
**Reasoning:**
Portfolio consistency is the primary driver. Every Boldteq SaaS product should use the same billing provider so patterns, webhook handling, and admin integrations are identical. Dodo's API is simpler -- no frontend SDK needed, just server-side REST calls that return payment links. This reduces frontend complexity and eliminates PCI concerns.

### Implementation Notes
- Created 3 Supabase Edge Functions: dodo-checkout, dodo-webhook, dodo-portal
- DB migration: renamed stripe_customer_id/stripe_subscription_id to dodo_customer_id/dodo_subscription_id
- Removed @stripe/stripe-js from package.json
- Webhook verification uses standardwebhooks library (not proprietary Stripe verifier)
- No frontend SDK needed -- dodo-checkout returns a payment_link URL, frontend just redirects
- Customer portal URL fetched from GET /customers/{id}/portal API endpoint

### Timeline
- Decided: 2026-04-06
- Implemented: 2026-04-06
- Committed: 2026-04-06 (commit 3004c49)

### Outcomes
- Build passes (7.25s)
- Frontend hooks correctly reference dodo-checkout/dodo-portal edge functions
- Both type files (database.ts, integrations/supabase/types.ts) updated with dodo_ field names
- Migration SQL applied to production Supabase via db push
- Minor cleanup still needed: dead stripe.ts file, old stripe-* edge function directories, CLAUDE.md references

### Related Decisions
- Establishes: "Dodo Payments as default billing provider for all Boldteq SaaS" (global standard)
- Enables: standardwebhooks as the webhook verification standard for all non-Shopify projects

### Reversibility
If reversed: would need to rebuild 3 Stripe edge functions, re-add @stripe/stripe-js, rename DB columns back. Effort: ~2 hours. No data loss since customer/subscription IDs are just column renames.
Currently: No indication of need to reverse. Dodo API worked as documented.
