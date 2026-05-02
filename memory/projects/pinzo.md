---
name: Pinzo — Shopify ZIP Code Delivery Checker
description: Project-specific decisions, patterns, and lessons for Pinzo
type: project
stack: B (React Router 7 + Polaris v13 + Prisma)
status: active
created: 2026-04-03
---

## Project Overview

**What:** Shopify embedded app that lets merchants configure ZIP code-based delivery rules. Storefront widget lets customers check delivery availability by entering their ZIP code.

**Stack:** React Router 7 + @shopify/polaris v13 + Prisma v6 + SQLite (dev) / PostgreSQL (prod) + Vite v6

**Deploy:** Railway (single instance)

**Key Models:** Session, ZipCode, DeliveryRule, WaitlistEntry, WidgetConfig, Subscription, FeatureRequest, FeatureVote

---

## Architecture Decisions

### GDPR Webhooks: Partner Dashboard, Not TOML
**Date:** 2026-04-03
**Decision:** GDPR webhook topics (`customers/data_request`, `customers/redact`, `shop/redact`) are configured in Shopify Partner Dashboard > App Setup > Privacy, NOT in `shopify.app.toml`.
**Why:** Adding these topics to TOML causes `shopify app deploy` to fail with "The following topic is invalid". Route handler files still exist in `app/routes/`, but registration is external.
**Impact:** Global — applies to ALL Shopify apps, not just Pinzo. Updated in `stacks/shopify/core/shopify-app.md` and `stacks/shopify/build/webhooks.md`.

### Rate Limiting: In-Memory for Single-Instance Deploy
**Date:** 2026-04-03
**Decision:** Built in-memory rate limiter (`app/utils/rate-limit.server.ts`) using sliding window counters per key.
**Why:** Railway runs a single instance. No Redis dependency needed. Clean cleanup loop prevents memory leaks.
**Limits:** zip-check: 60 req/min, widget-config: 30 req/min, waitlist: 10 req/min.
**Upgrade path:** If scaling to multiple instances, replace with Upstash Redis rate limiter (same interface, distributed store).
**Usage Metric:** 0
**Knowledge Version:** v1

### Widget UI: Visual Grouping Over Flat Stacking
**Date:** 2026-04-03
**Decision:** Redesigned widget result card from flat vertical stack to 4 grouped sections with dividers.
**Why:** All info (message, ETA, delivery date, timeline, schedule, badges) stacked vertically with uniform styling created a wall of text. Visual grouping makes the widget scannable.
**Groups:** (1) Primary Info (message + ETA + delivery date), (2) Timeline (ORDER -> SHIPS -> DELIVER), (3) Scheduling (days + cutoff + countdown), (4) Badges (COD + Free Delivery as pill row).
**Rule:** Dividers only render when adjacent groups have content (no empty dividers).
**Usage Metric:** 0
**Knowledge Version:** v1

### Admin Widget Preview Must Mirror Storefront Exactly
**Date:** 2026-04-03
**Decision:** Admin widget preview (React/Polaris) and storefront widget (Liquid + vanilla JS) must use identical CSS class names, conditional rendering logic, and section structure.
**Why:** Merchants configure the widget in admin and expect what they see in the preview to match the storefront exactly. Any divergence causes confusion and support tickets.
**Enforcement:** When changing the Liquid template, always update the React preview in `app.widget.tsx` in the same commit, and vice versa.
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Compliance Audit Findings (2026-04-03)

### GDPR Data Cleanup Gap
**Finding:** `FeatureRequest` and `FeatureVote` models were NOT being deleted in `app/uninstalled` and `shop/redact` webhook handlers.
**Fix:** Added deletion of both models to both handlers.
**Rule:** Every new Prisma model with a `shop` field MUST be added to both `webhooks.app.uninstalled.tsx` and `webhooks.shop.redact.tsx`.

### Database Index Performance
**Finding:** `Session`, `ZipCode`, and `FeatureRequest` models lacked `@@index([shop])`, causing slow queries as data grows.
**Fix:** Added `@@index([shop])` to all models queried by shop.
**Rule:** Every model with a `shop` field MUST have `@@index([shop])` in the Prisma schema.

### Hardcoded Secrets in Source
**Finding:** Admin shop domain and Chatwoot token were hardcoded in source files.
**Fix:** Moved to environment variables (`ADMIN_SHOP`, `CHATWOOT_WEBSITE_TOKEN`). Created `.env.example`.
**Rule:** Never hardcode any value that changes between environments.

### CSS Sanitization Gap
**Finding:** Widget custom CSS was sanitized in the public API response but NOT in the admin preview.
**Fix:** Added identical CSS sanitization to admin widget preview.
**Rule:** Sanitize user-provided CSS at every render point, not just one.

### Raw HTML in Polaris Routes
**Finding:** 12x `<strong>`, 2x `<em>`, 6x `<div style={{ minWidth }}>` across admin routes.
**Fix:** Replaced with `<Text fontWeight="semibold">`, `<Text tone="subdued">`, `<Box minWidth="X">`.
**Rule:** Zero raw HTML in Shopify admin routes. Run a grep for `<strong>|<em>|<div style` after every build.

---

## Session History

### 2026-04-03: Compliance Audit + UI Overhaul
**Agents:** Sage (audit), Yash (UI audit + widget redesign), Koda (implementation)
**Work:**
- Full Shopify compliance audit (GDPR, rate limiting, security)
- Rate limiting on all 3 public API routes
- Replaced all raw HTML with Polaris v13 components
- Expanded FAQ from 6 to 21 entries
- Widget UI redesign with visual grouping
- Admin preview + storefront Liquid sync
**Build status:** Clean build, Prisma schema valid, all changes committed
**Commits:** dcf86ed through 5ff6fad (5 commits)
