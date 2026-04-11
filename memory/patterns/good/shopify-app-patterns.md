---
name: Shopify App Build Patterns
description: Proven patterns from actual Shopify app builds -- reuse these
type: pattern
stack: B (React Router 7 + Polaris v13 + Prisma)
created: 2026-04-03
---

## Rate Limiting for Public API Routes

### In-Memory Rate Limiter for Single-Server Deploys
**Context:** Stack B -- public API routes (storefront widget endpoints) that need rate limiting without external dependencies
**Pattern:** Build a sliding-window in-memory rate limiter with per-key counters and automatic cleanup. Apply to all public-facing API routes with different limits based on endpoint sensitivity.
**Why:** Public API routes are unauthenticated and exposed to the internet. Without rate limiting, a single malicious actor can exhaust server resources. In-memory works perfectly for single-instance deploys (Railway, Render, Fly single-machine).
**Relationships:**
- Builds on: Shopify app public API pattern (api.*.tsx routes)
- Prevents: "No rate limiting on public endpoints" (security gap)
- Upgrade path: Replace Map with Upstash Redis for multi-instance deployments
- Primary stacks: B
- Used in projects: Pinzo

**Implementation:**
```typescript
// app/utils/rate-limit.server.ts
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  cleanup(); // Remove expired entries periodically
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: limit - 1, resetAt: now + windowMs };
  }
  entry.count++;
  if (entry.count > limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }
  return { limited: false, remaining: limit - entry.count, resetAt: entry.resetAt };
}
```

**Recommended limits per endpoint type:**
| Endpoint Type | Limit | Window | Rationale |
|--------------|-------|--------|-----------|
| Read-heavy (zip-check) | 60/min | 60s | Frequent customer lookups |
| Config (widget-config) | 30/min | 60s | Cached by theme, less frequent |
| Write (waitlist signup) | 10/min | 60s | Prevents spam submissions |

**Response:** Return 429 with `Retry-After` header (seconds until window resets).

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Widget Preview / Storefront Sync

### Admin Preview Must Mirror Storefront Exactly
**Context:** Stack B -- any app with a storefront widget (theme app extension) that has an admin preview
**Pattern:** The admin widget preview (React component in `app.widget.tsx`) and the storefront widget (Liquid template in `extensions/*/blocks/*.liquid`) must use identical CSS class names, identical conditional rendering logic, and identical section grouping. When changing one, always change the other in the same commit.
**Why:** Merchants configure widgets in the admin and expect the preview to match the live storefront. Any divergence between preview and storefront causes merchant confusion, support tickets, and negative reviews. This is the single most common source of "it looks different on my store" complaints.
**Relationships:**
- Prevents: "Widget preview doesn't match storefront" (merchant confusion)
- Related: Widget UI visual grouping pattern (below)
- Primary stacks: B
- Used in projects: Pinzo

**Enforcement checklist:**
1. Same CSS class names in React `dangerouslySetInnerHTML` preview and Liquid template
2. Same conditional logic (e.g., `if deliveryFee !== null` vs `{% if deliveryFee != blank %}`)
3. Same section divider placement
4. Same feature toggle behavior (11 toggles in Pinzo: showEta, showDeliveryDate, showTimeline, etc.)
5. Test: toggle each feature on/off in admin, verify preview matches what storefront would show

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Widget UI: Visual Grouping for Information-Dense Results

### Group Related Information with Dividers, Not Flat Stacking
**Context:** Stack B -- storefront widgets that display multiple data points (ETA, delivery date, schedule, fees, badges, etc.)
**Pattern:** Group related information into visual sections separated by subtle dividers. Each group has its own visual hierarchy. Dividers only render when adjacent groups both have content.
**Why:** Stacking all information vertically with uniform spacing creates a wall of text. Customers scan, not read -- visual grouping lets them find what matters. This directly impacts conversion (customers who can quickly confirm delivery = more likely to buy).
**Relationships:**
- Builds on: UI/UX production standards (visual hierarchy)
- Prevents: "Wall of text" widget antipattern
- Primary stacks: B (storefront widgets), A (any information-dense UI)
- Used in projects: Pinzo

**Grouping structure (from Pinzo):**
1. **Primary Info** -- message + ETA + delivery date (what customers care about most)
2. **Timeline** -- visual ORDER -> SHIPS -> DELIVER progress (builds confidence)
3. **Scheduling** -- delivery days + cutoff time + countdown (urgency driver)
4. **Badges** -- COD + Free Delivery as horizontal pill row (trust signals)

**Rules:**
- Each group gets its own internal spacing and visual treatment
- Dividers are subtle (1px, muted color) -- separate groups, not dominate
- Countdown timers get accent-colored cards (urgency = conversion)
- Return policy and secondary info rendered with subdued styling (tertiary importance)
- Conditional dividers: `{showTimeline && (showSchedule || showBadges) && <Divider />}`

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## GDPR Compliance: Complete Data Cleanup

### Audit Every Model on Uninstall and shop/redact
**Context:** Stack B -- every Shopify app with database models scoped by shop
**Pattern:** When implementing `app/uninstalled` and `shop/redact` webhook handlers, enumerate EVERY Prisma model that has a `shop` field and delete all records for that shop. Maintain a checklist in the webhook handler code comments.
**Why:** Missing even one model means the app retains data after uninstall, which is a GDPR violation. New models added during development are commonly forgotten in cleanup handlers. The checklist-in-comments pattern ensures new models trigger a review.
**Relationships:**
- Builds on: GDPR webhooks (stacks/shopify/build/webhooks.md)
- Prevents: "GDPR compliance gap from forgotten models" antipattern
- Primary stacks: B
- Used in projects: Pinzo

**Pattern:**
```typescript
// webhooks.app.uninstalled.tsx AND webhooks.shop.redact.tsx
// GDPR CLEANUP CHECKLIST — update when adding new models:
// [x] Session
// [x] ZipCode
// [x] DeliveryRule
// [x] WaitlistEntry
// [x] WidgetConfig
// [x] Subscription
// [x] FeatureRequest
// [x] FeatureVote
await db.featureVote.deleteMany({ where: { shop } });
await db.featureRequest.deleteMany({ where: { shop } });
await db.waitlistEntry.deleteMany({ where: { shop } });
// ... all other models
```

**Rule:** When adding a new Prisma model with a `shop` field:
1. Add `@@index([shop])` to the model
2. Add deletion to BOTH `app.uninstalled` and `shop.redact` handlers
3. Update the checklist comment

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Database Performance: Shop Index on Every Model

### Always Add @@index([shop]) to Shop-Scoped Models
**Context:** Stack B -- every Prisma model with a `shop` field (which is every model in a Shopify app)
**Pattern:** Add `@@index([shop])` to every model definition in `schema.prisma` that has a `shop` field.
**Why:** Every query in a Shopify app filters by `shop`. Without an index, these queries do full table scans. Acceptable with 10 records, catastrophic with 10,000. Add the index from day 1 -- it costs nothing and prevents a performance cliff as data grows.
**Relationships:**
- Prevents: "Slow queries as shop data grows" performance antipattern
- Primary stacks: B
- Used in projects: Pinzo

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Polaris Compliance: Zero Raw HTML in Admin Routes

### Grep Check After Every Build
**Context:** Stack B -- all admin routes (app.*.tsx)
**Pattern:** After building or modifying any admin route, run a grep check for raw HTML elements that should be Polaris components.
**Why:** Raw HTML elements (`<strong>`, `<em>`, `<div style>`) are easy to write by habit but violate Shopify's Polaris requirement. They also look subtly different from Polaris text components (wrong font weight, wrong color token). Accumulated over time, they create an inconsistent admin UI that can cause App Store rejection.
**Relationships:**
- Prevents: "Raw HTML in Polaris routes" antipattern
- Related: "Never use Tailwind/shadcn in Shopify admin" (antipatterns.md)
- Primary stacks: B
- Used in projects: Pinzo

**Quick grep command:**
```bash
grep -rn '<strong>\|<em>\|<div style\|<span style\|<b>\|<i>' app/routes/app.*.tsx
```

**Replacement map:**
| Raw HTML | Polaris Equivalent |
|----------|-------------------|
| `<strong>text</strong>` | `<Text fontWeight="semibold">text</Text>` |
| `<em>text</em>` | `<Text tone="subdued">text</Text>` or `<Text fontStyle="italic">` |
| `<div style={{ minWidth: 'X' }}>` | `<Box minWidth="X">` |
| `<div style={{ display: 'flex' }}>` | `<InlineStack>` or `<BlockStack>` |
| `<span style={{ color: 'X' }}>` | `<Text tone="critical/success/subdued">` |

**Source:** Pinzo, 2026-04-03 (12x `<strong>`, 2x `<em>`, 6x `<div style>` found and fixed)
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Deploy: shopify app deploy --force for Non-Interactive Environments

### Use --force Flag in CI/CD and Agent Contexts
**Context:** Stack B -- deploying Shopify apps from non-interactive terminals (CI/CD, Claude Code, scripts)
**Pattern:** Use `shopify app deploy --force` when deploying from environments that cannot handle interactive prompts.
**Why:** `shopify app deploy` without `--force` prompts for confirmation of config changes. In non-interactive environments (CI/CD pipelines, agent terminals), the prompt hangs indefinitely.
**Relationships:**
- Primary stacks: B
- Used in projects: Pinzo

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Prisma: db push vs migrate dev for Drifted Schemas

### Use db push When Migration History Has Drifted
**Context:** Stack B (or any Prisma project) -- when the database state doesn't match migration history
**Pattern:** When `prisma migrate dev` fails because of migration history drift (common after manual schema changes or `db push` in development), use `prisma db push` to sync the schema to the database without creating a new migration. Then create a clean migration afterward if needed.
**Why:** `prisma migrate dev` validates the full migration history chain. If any step is out of sync (e.g., from a previous `db push` or manual change), it fails with a drift error. `db push` skips history validation and just syncs current schema to DB.
**Relationships:**
- Prevents: "prisma migrate dev fails on drifted schema" (time sink)
- Primary stacks: B, A
- Used in projects: Pinzo

**When to use which:**
| Scenario | Command |
|----------|---------|
| Normal development, clean history | `prisma migrate dev --name description` |
| Schema drifted, need to sync | `prisma db push` |
| Production deployment | `prisma migrate deploy` (never db push in prod) |
| Check if schema matches DB | `prisma migrate diff` |

**Source:** Pinzo, 2026-04-03
**Usage Metric:** 0
**Knowledge Version:** v1
