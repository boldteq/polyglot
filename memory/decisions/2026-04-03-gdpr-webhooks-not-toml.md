## Decision: GDPR Webhooks Registered in Partner Dashboard, Not TOML

**Date:** 2026-04-03
**Status:** implemented
**Decision Maker:** Discovered during Sage compliance audit of Pinzo
**Project:** Pinzo (applies to ALL Shopify apps)

### Problem / Context
During Pinzo's compliance audit, agents attempted to add GDPR webhook topics (`customers/data_request`, `customers/redact`, `shop/redact`) to `shopify.app.toml` following the existing memory pattern in `stacks/shopify/core/shopify-app.md` and `stacks/shopify/build/webhooks.md`.

The deploy failed with: "The following topic is invalid"

The existing memory was WRONG. It showed these topics as TOML subscriptions, which would cause every new Shopify app build to fail at deploy time.

### Root Cause
GDPR compliance webhooks are a special category in Shopify's system. Unlike regular webhook subscriptions (orders/create, products/update, etc.) which ARE configured in TOML, GDPR webhooks have a dedicated configuration section in the Shopify Partner Dashboard under App Setup > Privacy.

This is likely because GDPR webhooks are mandatory for all apps and Shopify manages their registration separately from optional business webhooks.

### Resolution
**Chosen approach:** Configure GDPR webhooks exclusively in Partner Dashboard > App Setup > Privacy

**Steps:**
1. Remove GDPR topics from `shopify.app.toml` webhook subscriptions
2. Add a TOML comment documenting where GDPR webhooks are configured
3. Keep route handler files in `app/routes/` (they still receive the requests)
4. Updated all 3 memory files that had the incorrect pattern

### Memory Files Corrected
1. `stacks/shopify/core/shopify-app.md` — GDPR section rewritten with correct registration method
2. `stacks/shopify/build/webhooks.md` — TOML example corrected, GDPR section updated with registration note
3. `patterns/avoid/antipatterns.md` — Added explicit antipattern about GDPR topics in TOML

### Impact
- **All future Shopify apps** will avoid this deploy failure
- **All existing Shopify apps** should verify their TOML does not contain GDPR topics
- Estimated time saved per project: 30-60 minutes of debugging a cryptic deploy error

### Timeline
- Discovered: 2026-04-03
- Fixed: 2026-04-03
- Memory corrected: 2026-04-03

### Reversibility
If Shopify changes their API to accept GDPR topics in TOML in the future, we would update memory again. Currently, this is a hard constraint enforced by their CLI.

### Related Decisions
- Depends on: Shopify app architecture (TOML as source of truth for webhooks)
- Contradicts: Previous memory entry that showed GDPR topics in TOML (now corrected)
