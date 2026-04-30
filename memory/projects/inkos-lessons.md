---
name: InkOS Build Lessons
description: Lessons extracted from the InkOS 13-sprint tattoo studio SaaS build (2026-04-15 to 2026-04-16). Stack A (Next 16 + Supabase + Dodo + Railway). 644 files, 18 migrations, 140 routes. Every pattern here feeds all future Boldteq builds.
type: project
priority: high
source: InkOS, 2026-04-16
usage_metric: 0
knowledge_version: v1
---

# InkOS Build Lessons

## 1. Recurring Sage Findings — Systematic Pipeline Weaknesses

### 1A. RPC Parameter Mismatches (Dato writes RPC, Koda writes route with different params)

Appeared in Sprint 5 (C1: camelCase `submissionId` vs snake_case `submission_id` in consent PDF job), Sprint 6 (C1: `public_get_invite_by_token` vs `get_invite_by_token`; C2: `accept_team_invite` missing `artist_id` and `commission_default_pct` in return shape), Sprint 7 (M1: `applied_date` vs `applied_at`), and Sprint 8 (S8#1: `set_artist_tax_info` param mismatch). Root cause: Dato writes the migration defining the RPC signature, Koda writes the API route consuming it, and neither verifies the other's contract. The hand-written `lib/supabase/types.ts` masks the drift because TypeScript trusts whatever is manually typed. **Prevention rule:** Before Koda writes any route that calls an RPC, the RPC's exact parameter names and return fields must be extracted from the migration SQL into a shared TypeScript interface. If Dato and Koda run in parallel, the contract must be defined in the design spec as a shared interface BEFORE either starts coding.

### 1B. Column Name Drift (migration says X, types say Y, code says Z)

Appeared in Sprint 1 (C3: `locations` migration missing `zip`/`phone` that types declared), Sprint 3 (C2: `sort_order` column missing from migration but code referenced it), Sprint 6 (C3: `studio_members.last_active_at` not in migration but in types), Sprint 7 (M1: `applied_date` vs `applied_at`), Sprint 8-12 audit (S11#8: `status` column on `marketing_campaigns` missing, S12#12: `payroll_items` table referenced but doesn't exist). Root cause: `lib/supabase/types.ts` was hand-edited throughout the build instead of regenerated from the actual DB schema. **Prevention rule:** Never hand-edit the types file. After every Dato migration, run `pnpm supabase gen types typescript --linked > lib/supabase/types.ts`. If the Supabase project doesn't exist yet (as in InkOS), maintain a strict convention: Dato writes the migration, Dato updates types to exactly match, and Koda does NOT touch the types file. Any column referenced in code must exist in the migration first.

### 1C. `asChild` Violations on base-nova

Every Sage audit checked for `asChild` usage on base-nova (shadcn/ui's `@base-ui-components/react`) components. In InkOS this passed cleanly because it was caught early (Sprint 1 scan), but the automated grep for `asChild` was added to every single audit because this is a known recurring problem across Boldteq builds. **Rule:** All components from base-nova use the `render` prop pattern, never `asChild`. This must be in every project's ESLint config as a custom rule or at minimum in the Sage automated scan.

### 1D. Missing Rate Limits on GET Endpoints

Sprint 1 (M1: auth rate limits architecturally impossible), Sprint 6 (public invite route needed rate limit), Sprint 8-12 combined audit (cross-sprint #17: payroll GET routes missing rate limits). Koda consistently forgets rate limits on read routes, treating them as "safe." But unbounded GETs enable enumeration, scraping, and DoS. **Rule:** Every API route, GET or POST, must import and call either `authedRatelimit` or `publicBookingReadRatelimit` before any DB query. Sage scans for routes missing rate-limit calls.

### 1E. `onValueChange` Null Guards for base-ui Select

Not specific to InkOS (passed here) but flagged as a check item in every audit. When base-ui Select fires `onValueChange`, the value can be `null` on deselect. Without a guard, the handler crashes or sends null to the API. **Rule:** Every `onValueChange` handler must check `if (value === null) return` before processing.

### 1F. `exactOptionalPropertyTypes` Violations

Sprint 4 build report (item #2): interface optionals needed `| undefined` suffix. Throughout the build, Koda hit TypeScript errors where `{ field?: string }` doesn't accept `undefined` under strict optional property types. **Rule:** Under `exactOptionalPropertyTypes: true`, always declare optional fields as `field?: string | undefined` in interfaces. Or better: use Zod schema inference (`z.infer<typeof Schema>`) which handles this automatically.

### 1G. Feature Gate Key Mismatches

Sprint 7 (C1): the plans JSONB in the billing migration used `commission_splits` but all code used `commissions`. Today's static `requireFeature()` compares plan order (not JSONB keys), so it accidentally worked. But if anyone switches to the RPC-based `requireFeatureRpc()` (which reads JSONB), all gates 403. **Rule:** Define all feature gate keys in a single `lib/billing/feature-keys.ts` constant. Both the migration seed data and the `requireFeature()` callers import from this file. Drift is a compile error instead of a runtime surprise.

### 1H. Public Routes Using Session Client Instead of Anon

Sprint 5 (C6, C7): public consent pages imported `createClient` from `@/lib/supabase/server` (session-cookie client) instead of `createPublicClient`. Functional today (RPC grants to anon) but leaks the logged-in user's session into a public route. **Rule:** Every route under `/book/`, `/consent/`, `/invite/`, or `/api/public/` must use `createPublicClient()` from `@/lib/supabase/public`. Sage grepping for `createClient` in public routes is now a mandatory scan.

### 1I. `unstable_cache` Capturing Authenticated Clients

Sprint 7 (M3): `unstable_cache(async () => supabase.rpc(...))` captured the first caller's authenticated client. Subsequent requests within the cache TTL reuse the first caller's JWT. **Rule:** Never wrap `supabase.rpc()` calls in `unstable_cache` when the supabase client is session-scoped. Cache the RESULT of the RPC call (a plain object), not the client invocation. Or just don't use `unstable_cache` for authenticated data -- it's not worth the footgun.

## 2. Sprint Velocity Patterns — What Worked for Parallel Execution

### 2A. Dato + Vega in Parallel (No Dependency)

Dato writes the migration (schema, RPCs, RLS, triggers) while Vega writes the design spec (UI layout, component hierarchy, interaction patterns). These have zero dependencies. Starting them in parallel saves 2-4 hours per sprint. Koda then consumes BOTH outputs to build the API routes and UI.

### 2B. Sage Audit in Background While Next Sprint Starts

After Koda delivers a sprint, Sage audits the output while Dato and Vega start on the next sprint. The next sprint's Koda build can begin on features that don't overlap with the audit scope. This pipeline parallelism was critical for shipping 13 sprints in 2 days. Exception: if Sage's audit is BLOCK severity, the fix Koda must run before proceeding.

### 2C. Fix Koda + Build Koda Can Run in Parallel If File Scopes Don't Overlap

When Sage flags fixes in Sprint N, a "fix Koda" agent addresses those while a "build Koda" agent starts Sprint N+1's non-overlapping files. This worked well when Sprint 3 fixes (client CRM) ran alongside Sprint 4 scaffold (billing). Does NOT work when the fix touches shared infrastructure like `lib/supabase/types.ts` or `lib/supabase/server.ts`.

### 2D. API 500 Errors Recovered by Checking Partial State

When a sprint's build partially failed (e.g., missing column caused a 500), Yash dispatched a fix agent that first checked what was already built and correct, then surgically fixed only the broken parts. Avoids the temptation to rewrite entire files.

### 2E. Batch Sage Audits Are Worse Than Per-Sprint Audits

Sprints 8-12 were batched into one combined Sage audit. This found 4 critical issues that had been compounding for 5 sprints. Per-sprint audits (Sprints 1-7) caught issues immediately, before they could cascade. **Rule:** Run Sage after EVERY sprint, not batched. The 30-minute audit cost per sprint is cheaper than the 4-hour compound fix session.

## 3. Architecture Decisions That Proved Right

### 3A. RPC-Only Writes for Audit-Critical Tables

`consent_form_submissions` has zero direct-write RLS policies -- all writes go through `submit_consent_form` RPC. `commission_records` same pattern. This means: (a) business logic (snapshot creation, audit hash, penalty generation) can't be bypassed; (b) the RPC is the single source of truth for mutation semantics; (c) RLS stays simple (just read policies). **Apply to:** Any table where data integrity is a legal or financial obligation (consent, pay, billing, audit logs).

### 3B. `EXCLUDE USING gist` for Booking Conflicts

The `bookings_artist_no_overlap` exclusion constraint catches double-bookings at the DB level. Every write path (API route, public RPC, admin override) that creates/moves a booking is automatically protected. Without this, every write path would need its own conflict-check query, and one would inevitably be missed. Effort to set up: 5 lines of SQL. Effort saved: hours of bug-hunting. **Apply to:** Any domain with time-range conflicts (schedules, reservations, resource allocation).

### 3C. `GENERATED ALWAYS` Columns for Computed Values

`bookings.end_at` is `GENERATED ALWAYS AS (scheduled_at + (duration_min || ' minutes')::interval) STORED`. This means `end_at` can never drift from `scheduled_at + duration`. No code path can accidentally set a wrong `end_at`. Sage verified this by grepping for `end_at` in INSERT/UPDATE payloads -- zero hits. **Apply to:** Any column that's a deterministic function of other columns (totals, dates, durations).

### 3D. Feature Gate Server-Enforced + UI-Hidden (Dual Enforcement)

Every gated feature has: (1) `requireFeature(plan, 'key')` in the API route that returns 403, AND (2) `featureKey` in the sidebar nav-config that hides the link AND (3) `<UpgradeGate>` component that shows a blur overlay. Three layers means a user can never reach a paid feature through URL manipulation, deep linking, or API probing. **Apply to:** Every SaaS with tiered plans.

### 3E. Worker-Only for Expensive Operations

AI design generation (Claude + DALL-E pipeline), PDF generation (react-pdf/renderer), and low-stock email alerts all run in BullMQ workers, never in API routes. This prevents: request timeouts, memory pressure on the web process, and blocking other requests. **Apply to:** Any operation that takes >5s or uses >100MB memory.

## 4. Architecture Decisions That Caused Problems

### 4A. Hand-Written `lib/supabase/types.ts`

This was the single largest source of bugs across the entire build. Every sprint had at least one finding traceable to types not matching the migration. The types file was 3000+ lines of manually maintained TypeScript that drifted from reality. **Fix for future builds:** Use `pnpm supabase gen types typescript` after every migration. If the Supabase project doesn't exist yet, use `supabase start` locally and generate from the local DB. Never hand-edit.

### 4B. Sprint 2 Availability RPC Stubbed Then Replaced

`public_get_availability` was stubbed in Sprint 2, then substantially rewritten in Sprint 6 when artist schedules landed. The Sprint 2 version returned mock data; callers assumed it was real. When Sprint 6 replaced it, the return shape changed and broke the public booking flow silently (fields were guarded by `&&` checks, so they just disappeared). **Rule:** Stubs must return the EXACT shape of the final implementation (even if values are empty/default). Document which fields are stubbed vs real.

### 4C. `proxy.ts` vs `middleware.ts` in Next 16

Next.js 16 renamed the middleware entrypoint from `middleware.ts` to `proxy.ts`. Every reference to "middleware" in docs, comments, and design specs was wrong. The actual `proxy.ts` file existed and worked, but new contributors would look for `middleware.ts` and not find it. **Rule:** On every Next.js major version, verify the middleware filename convention. Document it in the project CLAUDE.md.

## 5. Koda Recurring Type Fix Patterns

### 5A. `Object.assign` Bypass for Supabase `RejectExcessProperties`

When Supabase client's `.update()` or `.insert()` rejects unknown properties, Koda used `Object.assign(base, { extra_field: value })` to sneak in properties not in the TypeScript type. Sprint 3 (C2): this was used to write a `sort_order` column that didn't exist. The `Object.assign` defeated TypeScript's protection and the write silently no-oped. **Rule:** NEVER use `Object.assign` to build Supabase mutation payloads. If a field isn't in the type, it shouldn't be in the mutation. If it SHOULD be there, fix the type first.

### 5B. `unknown as TableInsert` Cast Pattern

When the Supabase generated types don't match what code needs to insert, Koda cast `payload as unknown as Database['public']['Tables']['x']['Insert']`. This bypasses all type checking. Acceptable ONLY when the mismatch is between the generated type and the actual DB schema (which happens when types aren't regenerated). **Rule:** Fix the root cause (regenerate types) instead of casting.

### 5C. `Resolver<FormValues>` Explicit Cast for react-hook-form

react-hook-form's `zodResolver()` returns a type that doesn't exactly match `Resolver<T>` under strict settings. Koda added explicit `as Resolver<FormValues>` casts. This is a known library typing issue and the cast is safe. **Rule:** Acceptable -- document in codebase as a known workaround.

### 5D. `render` Not `asChild` on Every base-nova Component

Covered in 1C above. Every component from `@base-ui-components/react` uses `render` prop, never `asChild`. Koda initially used `asChild` (Radix habit), caught in Sprint 1, never repeated.

### 5E. `.slice(0, 10)` Instead of `.split('T')[0]` for ISO Date Extraction

Under `noUncheckedIndexedAccess`, `.split('T')[0]` returns `string | undefined` because TypeScript doesn't know the array has a first element. `.slice(0, 10)` returns `string` always. **Rule:** For extracting the date portion of an ISO string, use `.slice(0, 10)`. It's type-safe and doesn't require a non-null assertion.

## 6. Dodo Payments Integration Gotchas

### 6A. `standardwebhooks` Spec (Not Plain HMAC)

Sprint 4 (C1): Dodo webhooks use the `standardwebhooks` library, NOT a plain HMAC. The signing payload is `${webhook-id}.${webhook-timestamp}.${rawBody}`, the secret is base64-decoded (strip `whsec_` prefix), and the signature header format is `v1,base64sig`. A plain `createHmac('sha256', secret).update(rawBody).digest('hex')` will NEVER match. **Rule:** Use `import { Webhook } from 'standardwebhooks'` and call `wh.verify(rawBody, headers)`. The idempotency key is the `webhook-id` header, not a body-level `event_id` field (which Dodo doesn't send).

### 6B. `customer: {customer_id}` Object Format

Dodo SDK v2 `subscriptions.create` and `payments.create` take `customer: CustomerRequest` object (with `customer_id` field inside), NOT a top-level `customer_id` string. **Rule:** Always wrap: `{ customer: { customer_id: dodoCustomerId } }`.

### 6C. `billing: {country}` Required on Checkout

Every Dodo checkout call requires a `billing: { country: 'US' }` field. Without it, the API returns a 400 that's hard to debug. **Rule:** Always include `billing: { country }` in checkout creation.

### 6D. `return_url` Not `success_url/cancel_url`

Dodo uses a single `return_url` for post-checkout redirect, not separate `success_url` and `cancel_url` like Stripe. **Rule:** Pass `return_url` pointing to a confirmation page that checks the subscription/payment status.

### 6E. Portal Method Returns `{link}`

`dodo.customers.customerPortal.create(customerId, { return_url })` returns `{ link: string }`, not a full URL string. Access via `result.link`. **Rule:** Destructure: `const { link } = await dodo.customers.customerPortal.create(...)`.

### 6F. Lazy Proxy Init for SDK Client

Both `lib/dodo/client.ts` and `lib/queue.ts` were constructing SDK clients at module evaluation time. During `pnpm build`, env vars aren't available, causing a crash. Fixed with a lazy proxy pattern that defers construction until first use. **Rule:** Any SDK client that reads env vars at construction time must use lazy initialization. Pattern:

```ts
let _client: DodoPayments | null = null
function getClient(): DodoPayments {
  if (!_client) _client = new DodoPayments({ token: process.env.DODO_API_KEY! })
  return _client
}
```

## 7. What to Do Differently Next Time

### 7A. Generate Types from DB Immediately

The hand-written types file caused the highest density of bugs in this build. Next project: `supabase start` locally on day 1, run `supabase gen types` after every migration, commit the generated file. If using a remote Supabase project, generate from that. Zero hand-editing of the types file.

### 7B. Run Sage After Every Sprint, Not Batched

Sprints 1-7 each got individual Sage audits. Sprints 8-12 were batched into one audit. The batch audit found 4 CRITICAL issues that had been compounding for 5 sprints. Individual audits would have caught each issue in the sprint that introduced it, when the fix is 15 minutes instead of 2 hours. **Rule:** Sage audit is a mandatory step between sprints, not optional or batchable.

### 7C. Define RPC Contracts as Shared TypeScript Interfaces BEFORE Dato Writes Migration

The #1 integration bug category (1A above) is Dato and Koda disagreeing on RPC parameter names and return shapes. Fix: in the design spec, define each RPC as a TypeScript interface:

```ts
// Sprint 5 design spec would include:
interface SubmitConsentFormParams {
  p_studio_id: string
  p_template_id: string
  p_submission_data: Json
  // ... exact param names that Dato will use in CREATE FUNCTION
}
interface SubmitConsentFormReturn {
  submission_id: string
  consent_token: string
  // ... exact fields that Koda will read
}
```

Dato implements the SQL to match. Koda implements the route to match. Mismatch is impossible because both reference the same spec.

### 7D. Create `.env.local.template` That Can Be Copied in One Command

InkOS accumulated 30+ env vars across 13 sprints. Each new env var was mentioned in a build report but not collected in one place until late. **Rule:** Maintain a `.env.local.template` from Sprint 0 that's updated every sprint. New developer setup: `cp .env.local.template .env.local` then fill in secrets.

### 7E. Storage RLS Must Be Checked Per-Bucket, Per-Sprint

Sprint 1 fixed storage RLS for `studio-assets`. Sprint 2 added `design-assets` bucket without copying the RLS pattern. Sprint 2 Sage caught it. Sprint 5 added `consent-forms` bucket -- same risk. **Rule:** Every time a Dato migration creates a new storage bucket, Sage must verify that SELECT/INSERT/UPDATE/DELETE policies exist with folder-prefix tenant checks. Add to the automated scan.

### 7F. Admin Routes Must Use Service-Role Client After Platform Admin Gate

Sprint 4 (C2): All admin billing routes used the session client, so RLS restricted the platform admin to their own studio's data. Admin routes see zero cross-tenant data. **Rule:** After verifying `is_platform_admin`, switch to `createServiceRoleClient()`. The admin gate is authorization; service-role bypasses RLS for the cross-tenant query.

### 7G. CSV/Export Routes Must Sanitize for Formula Injection

Sprint 3 (C3): `Papa.unparse` does not escape cells starting with `= + - @ \t \r`. Any export feature is a CWE-1236 vector. **Rule:** Every CSV export must wrap cell values in a `sanitiseCsvCell()` function that prefixes dangerous characters with `'`. Add this to the shared `lib/utils.ts` in the starter template.

### 7H. Delete Operations Must Verify Affected Row Count

Sprint 3 (M2): Supabase `.delete()` returns `{ error: null }` even when RLS denies the delete (zero rows affected). The UI optimistically removes the item, but on reload it's back. **Rule:** Always use `.delete({ count: 'exact' })` and check `count === 0` to return 403/404. Apply to every DELETE handler.

### 7I. Mutation Routes Must Use RPCs When RPCs Exist

Sprint 6 (M2): Dato wrote `change_member_role` and `deactivate_member` RPCs with last-owner protection and audit logging. Koda's API routes bypassed them with direct `.update()` calls, losing all the safety logic. **Rule:** If a SECURITY DEFINER RPC exists for a mutation, the API route MUST call it. Direct `.update()` or `.insert()` bypasses triggers, audit logging, and business rules baked into the RPC.

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Sprints | 13 (0-12) |
| Duration | ~2 days |
| Migrations | 18 |
| Routes compiled | 140 |
| TS/TSX files | 644 |
| Components | 286 |
| API routes | 194 |
| Sage audits | 8 (7 individual + 1 batch) |
| Critical findings across all audits | ~30 |
| Major findings across all audits | ~40 |
| All critical/major resolved | Yes |
| Tests | 46 |
| Build gates (typecheck/lint/build/test) | Green on every sprint delivery |

---

*Extracted by Mira, 2026-04-15. Source: InkOS `.handoffs/` (33 files). Knowledge version v1.*

---

## Appendix — Calendar Rebuild (2026-04-23, Phases 1-10)

Context: 10-phase rebuild of the multi-chair Day view with dnd-kit drag-drop, Supabase Realtime, SMS notifications, WCAG keyboard accessibility. 29 feature changes + 11 audit fixes + 36 tests. Typecheck / build / tests all green. Reusable patterns lifted to `~/.claude/memory/patterns/good/calendar-drag-drop-and-realtime.md`.

### Booking API rate-limit + auth contract (non-negotiable)

Every new `app/api/bookings/**/route.ts` handler — GET, POST, PATCH, DELETE — must:
1. Call `getAuthenticatedUser()` (internally uses `supabase.auth.getUser()`, validates against auth server). Never `getSession()` server-side.
2. Rate-limit on `authUser.user.id` via `authedRatelimit.limit(authUser.user.id)`. Never on IP / `x-forwarded-for` — spoofable.
3. Only then validate body with Zod and touch the DB.

Any deviation is a Sage hard-fail. The pattern is copy-paste from `app/api/bookings/[id]/route.ts`.

### `CalendarBooking` shape (source-of-truth for any booking-returning endpoint)

Calendar expects nested relations with these exact shapes. Any endpoint that returns bookings for calendar consumption must SELECT matching columns:

- `client: { first_name: string; last_name: string }` — NOT `{ name: string }`. Calendar card concatenates.
- `artist: { display_name: string; avatar_url: string | null; sort_order: number }` — NOT `{ color_index: number }`. `sort_order` drives column order in DayChairGrid.

Supabase select string:
```ts
.select(`
  id, start_at, end_at, status, chair_id, notes,
  client:clients ( first_name, last_name ),
  artist:studio_members ( display_name, avatar_url, sort_order )
`)
```

New endpoints (e.g. `/api/bookings/day`, `/api/bookings/week`) must follow this contract. Shape drift triggers silent UI breakage — card shows blank name, wrong avatar, or `undefined NaN`.

### Multi-chair Day view branches from Week/Month

`CalendarPageClient` picks the renderer based on view mode:
- `view === 'day'` → `<DayChairGrid />` (custom CSS Grid + dnd-kit, multi-chair columns)
- `view === 'week' | 'month' | 'agenda'` → `<FullCalendar />` (existing free-tier)

Any future calendar enhancement (new event type, recurring bookings, blocked time, etc.) must be implemented in BOTH renderers, OR must gracefully no-op in the one it doesn't support. Silent divergence between views is the #1 calendar bug class.

### `client_communications` contract (any SMS/email/WhatsApp flow)

Column names are NOT what you'd guess:
- `channel` (NOT `type`) with values `'email' | 'sms' | 'whatsapp' | 'in_app'`
- `direction` with `'inbound' | 'outbound'`
- `status` with `'queued' | 'sent' | 'delivered' | 'failed' | 'bounced'`

SMS dispatch flow (proven in calendar PATCH handler):
1. INSERT `client_communications` row: `channel='sms'`, `direction='outbound'`, `status='queued'`
2. Enqueue BullMQ job `send-sms` with payload `{ commId, studioId }` — the worker reads the row, calls Twilio, updates `status` to `sent` or `failed`
3. Fire-and-forget from the route handler: `void dispatchFn().catch(log)` — never await, never block the mutation response

Any new notification channel (in-app push, WhatsApp) follows the same pattern: insert row → enqueue job → worker owns the actual send.

---

## Calendar Sprints 1-6 PDF-Compliance Closeout (2026-04-23)

These sprints closed the final PDF-spec compliance gaps after Phases 1-11. Six tight sprints, each shipping distinct patterns. Full patterns preserved in `~/.claude/memory/patterns/good/` (category colors, detail drawer, progressive disclosure, smart linking, QR, NOW line). This appendix captures the InkOS-specific contract + gotcha items that don't belong in cross-project patterns.

### Smart-linking contract — `POST /api/bookings`

The client may send an optional `link_booking_id: string`. Server-side, the route handler:

1. Reads the referenced booking (validating `studio_id === current studio` AND `client_id === body.client_id`).
2. Inherits `project_id` from the referenced booking.
3. Sets `session_number` to `(ref.session_number ?? 1) + 1`.

**Never trust the client to set `project_id` or `session_number` directly.** The server is the only writer of those columns. Any client attempting to POST `project_id` gets 400 (Zod strips unknown keys — ensure the `CreateBookingSchema` does NOT whitelist project_id or session_number).

Candidate detection (client-side heuristic): on client select, fetch `/api/bookings?client_id=X&from=<now-7d>`, pick nearest non-cancelled booking within ±7 days of new booking's date, render inline Sparkles banner with Yes/No pills.

### HOLD auto-cancel is already wired — don't re-create

Two cron workers already own the HOLD lifecycle:

- `workers/cron/auto-cancel-deposits.ts` — runs every 10 min, cancels HOLD bookings whose `deposit_deadline_at` is past.
- `workers/cron/deposit-deadline-reminders.ts` — runs every 15 min, sends SMS/email reminders at 24h / 4h / 1h before deadline.

Before adding any deposit-lifecycle feature, check these workers first. Adding a second auto-cancel path creates race conditions (both workers try to cancel the same row).

### Progressive-disclosure form fields may be silently stripped

`SmartBookingSheet` surfaces `reference_images` (File[]) and `recurring` (`'once' | 'weekly' | 'monthly'`) behind the "+ Add more" toggle. Current `CreateBookingSchema` (Zod on `POST /api/bookings`) does NOT accept these fields — they're stripped server-side.

**When backend support lands** (reference images to Supabase Storage + recurring as a linked child-booking template):

1. Update `CreateBookingSchema` to `z.object({ ..., reference_images: z.array(z.string().url()).max(4).optional(), recurring: z.enum(['once','weekly','monthly']).default('once') })`.
2. Switch from `.strip()` (default) to `.strict()` on the schema so unknown keys error loudly during the transition.
3. Remove the client-side `stripUnsupported(payload)` helper in `SmartBookingSheet`.
4. Wire upload: files → `POST /api/storage/booking-refs` → returned paths → included in create payload.

Until then, the UI silently collects data the backend discards. This is acceptable as a staged rollout but MUST be tracked.

---
*Calendar rebuild appendix added 2026-04-23.*
*Sprints 1-6 PDF-compliance closeout appendix added 2026-04-23.*

---

## Appendix — Messages v1 Sprint (Sprint 13, 2026-04-23)

Context: Omnichannel 3-pane inbox (list + thread + context). 8 agents dispatched in parallel. 59 files, 3 migrations, 20 UI components, 4 hooks, 23 server actions, 1 worker, 4 webhook routes, 167 tests. Patterns below capture items that repeated across agents and must not recur.

### M1. Surgical edits to `lib/supabase/types.ts` — still an antipattern, even for RPCs

Dato hand-edited the generated types file to add `triage_conversation` and `enqueue_auto_reply` to the `Database['public']['Functions']` union. Sage caught the downstream symptom: `as unknown as` casts in `triage.ts` compensating for un-typed return shapes. The fix was to add proper Function signatures to the union — but the root cause is the same recurring antipattern from Section 1B and 4A.

**Rule:** Never hand-edit `lib/supabase/types.ts`, even "just to add an RPC signature." Pattern for adding an RPC to types:
1. Write the migration first (Dato).
2. Apply it locally: `pnpm db:migrate`.
3. Regenerate: `pnpm db:types` → `pnpm supabase gen types typescript --linked > lib/supabase/types.ts`.
4. If regeneration is not available (project not linked), COPY an existing Function entry's exact shape and ADD your new entry — do not invent a new structure.

Any `as unknown as` cast in a file that calls an RPC is a red flag that the types file is behind the schema. Fix the types, not the callsite.

### M2. Feature gate applied to page but NOT to server actions

Dato + Koda added the `omnichannel_inbox` gate to `/settings/messaging` correctly, but the `/messages` page AND all 21 server actions in `actions.ts` were ungated. A user on Solo tier could call any action by URL manipulation or direct fetch, bypassing the UI restriction.

**Rule:** Every gated feature requires gates in THREE places:
1. Sidebar/nav link — hidden via `featureKey` in nav-config (UX clarity).
2. Page route — `requireFeatureRpc(supabase, studioId, 'key')` at the top of the server component (URL-manipulation block).
3. **Every server action and API route** — same `requireFeatureRpc` call (fetch/cURL block).

**DRY pattern for multi-action files:** Add a module-level helper at the top of `actions.ts`:
```ts
async function requireOmnichannelGate(studioId: string) {
  const supabase = await createClient()
  await requireFeatureRpc(supabase, studioId, 'omnichannel_inbox')
  return supabase
}
```
Every action calls `const supabase = await requireOmnichannelGate(studioId)` as its first line. One line per action. Zero skipped gates.

Sage scan: grep `actions.ts` for exported async functions that do NOT call the gate helper — hard-fail any that miss it.

### M3. Service-role client in session-scoped code paths

`lib/messaging/send.ts` used `createServiceRoleClient()` in functions called from server actions. Server actions ALWAYS carry session context (the cookie is on the request); the session-scoped client + RLS is both sufficient and safer — any bug in the send logic can't accidentally write cross-tenant.

**Rule:** `createServiceRoleClient()` is justified ONLY in:
- Webhook handlers (no session — request comes from provider).
- BullMQ workers / cron jobs (no session — background).
- Admin routes AFTER `is_platform_admin` gate (deliberate cross-tenant access).

Everywhere else (server actions, API routes under `/api/*` called from the app, server components), use the session-scoped `createClient()`. Sage grep: `createServiceRoleClient` usage must be in one of the allowed contexts — otherwise fail.

### M4. Orphan-comm antipattern in auto-reply RPC

`enqueue_auto_reply` RPC inserted a `client_communications` row with `status='queued'` AND stamped `conversations.last_auto_reply_at` BEFORE checking whether the dispatch channel was supported. If a channel wasn't wired (e.g. WhatsApp without Twilio config), the comm row was orphaned forever in `queued` state, and the conversation's `last_auto_reply_at` lied about what actually happened.

**Rule:** State-changing RPCs that depend on external dispatchability must gate on capability BEFORE writing state. Order:
1. Validate the channel is supported (env check, config row, capability table).
2. If not → return early with a clear "channel_unsupported" status, write NOTHING.
3. Only after capability check → insert queued row + stamp `last_*_at`.

Equivalent rule for any "enqueue + stamp + dispatch" flow: capability → write → dispatch. Never write → discover-unsupported → leak.

### M5. Webhook returns 200 when config is missing

The Meta (Instagram/Messenger) webhook route returned 200 silently when `META_APP_SECRET` was unset. Meta treats 200 as successful delivery and never retries — messages were dropped with zero observable signal.

**Rule:** Webhook config errors return **503 Service Unavailable**, not 200. 503 signals "provider, retry later, ops will fix this." The provider keeps retrying on its schedule, and the missing-config error shows up in logs, dashboards, and alerts.

Pattern for every webhook route:
```ts
const secret = process.env.META_APP_SECRET
if (!secret) {
  logger.error({ webhook: 'meta' }, 'META_APP_SECRET not configured')
  return new Response('Webhook not configured', { status: 503 })
}
```

Apply to ALL webhook routes: Dodo, Meta, Twilio, Resend, any future provider. The only 200 a webhook returns is after successful processing (or successful idempotent-replay detection).

### M6. BullMQ `throw` for expected transient states

`workers/jobs/send-scheduled-message.ts` had an early `throw new Error('scheduled time not reached')` when the job was processed before its target time. BullMQ counts every throw as a failed attempt — 3 throws and the job is dead-lettered, even though the "failure" was entirely expected (the scheduler just has fuzzy timing).

**Rule:** In BullMQ worker bodies, NEVER throw for expected transient states (not-yet-time, rate-limit-cooldown, external-service-busy-retry-later). Use one of:
- `return` (mark job complete, success) — appropriate if another mechanism will re-schedule.
- `await job.moveToDelayed(nextRunAt.getTime())` — push the job back to the delayed queue until the target time, doesn't count as a failure.
- `throw new UnrecoverableError(...)` — explicit dead-letter, skip remaining retries.

`throw` is for genuine, unexpected failure. Every retry budget is finite; burning it on clock skew is a waste.

### M7. Template rendering must match DEFAULT_TEMPLATES token set exactly

Initial `enqueue_auto_reply` RPC rendered only 3 tokens (`{{studio_name}}`, `{{client_first_name}}`, `{{booking_link}}`) but `DEFAULT_TEMPLATES` shipped with 5 tokens including `{{portfolio_link}}` and `{{aftercare_pdf_link}}`. A follow-up migration was required to add the missing REPLACE chain + a defensive `REGEXP_REPLACE` strip for unresolved `{{anything}}` tokens (so broken templates don't leak raw Liquid to clients).

**Rule:** When designing any templated-string RPC:
1. Enumerate the FULL token set in the design spec before Dato writes the migration.
2. The RPC's REPLACE chain must cover EVERY token the UI/seed data exposes.
3. Add a defensive tail: `REGEXP_REPLACE(rendered, '\{\{[^}]+\}\}', '', 'g')` to strip any unresolved tokens rather than leaking them.
4. If the token set changes, a migration is required — treat the template contract like an API contract.

Canonical pattern: keep token definitions in a single shared source (`lib/messaging/template-tokens.ts`), and reference them from both the seed data and the RPC's REPLACE chain generator.

### M8. `.single()` throws `PGRST116` on upsert with no returned rows

`seedDefaultTemplates()` used `.upsert(...).select('id').single()`. When the upsert was a no-op (row already existed with same values), Supabase returned 0 rows, and `.single()` threw `PGRST116 — Cannot coerce the result to a single JSON object`. The seed function crashed on the happy-path second run.

**Rule:** In seed/idempotent functions, use `.maybeSingle()` (returns `null` instead of throwing) and explicitly guard the `23505` unique-violation code if you're using plain `.insert()` with `ON CONFLICT`. Pattern:
```ts
const { data, error } = await supabase
  .from('message_templates')
  .upsert(payload, { onConflict: 'studio_id,kind' })
  .select('id')
  .maybeSingle()

if (error && error.code !== '23505') throw error
```

`.single()` is only for queries where exactly one row is guaranteed (e.g., primary-key lookups after a verified insert).

### M9. CSS Grid 3+1 pane layout — messaging chrome recipe

3-pane inbox layout that reuses the app sidebar and behaves correctly at every breakpoint:

```tsx
// Outer page container — grid changes based on context-pane visibility
<div
  className="grid h-[calc(100vh-var(--header-height))] transition-[grid-template-columns] duration-150"
  style={{
    gridTemplateColumns: contextOpen
      ? '72px 360px minmax(0,1fr) 380px'
      : '72px 360px minmax(0,1fr) 0px',
  }}
>
  <AppSidebar />              {/* 72px — existing global chrome */}
  <ConversationList />        {/* 360px — own <ScrollArea> */}
  <ConversationThread />      {/* minmax(0,1fr) — own <ScrollArea> */}
  <ContextPane />             {/* 380px when open, 0 when collapsed */}
</div>
```

**Rules:**
- Each pane owns its OWN `<ScrollArea>`. Never a shared scroll container.
- Context-pane collapse is via `grid-template-columns` change, NOT `translateX` — transforms break sticky headers inside the pane.
- Transition the GRID, not the pane itself, so content reflows rather than sliding off.
- Tablet (1024–1279px): replace the 4th column with a `<Sheet>` that slides in over the thread. Mobile (<1024px): single pane, navigation via routes.
- `minmax(0, 1fr)` on the flexible column is REQUIRED — without the `0` min, child overflow pushes the column wider than the viewport.

### M10. Brand color remapping — reject PDF mockups that ship non-brand colors

The Messages audit PDF specified indigo (unread badges), amber (warnings), green (delivered status), and pink (typing) — all forbidden by the InkOS 4-color system.

**Rule:** When a design/audit PDF ships with non-brand colors, the first job of the implementing agent is to remap the semantic intent to Bone/Onyx/Stone/Rust. Canonical remapping for messaging surfaces (lock this in a design handoff note so future sprints inherit it):

| PDF spec | Semantic intent | InkOS remap |
|----------|-----------------|-------------|
| indigo row bg | unread conversation | `rust @ 3% opacity` bg + Onyx sender name (was Stone when read) |
| amber pill | inquiry / pricing / missed_call triage | Rust pill with Bone text |
| green pill | delivered / sent success | Onyx-muted pill (Stone bg + Onyx text) |
| pink ring | typing indicator | Rust 2px ring at 60% opacity, animates opacity only (not color) |
| gray bubble | internal note | Stone-muted background + Stone border, NO Rust |
| blue bubble | auto-reply | `rust @ 6% opacity` bg + Onyx text + tiny "Auto" label in Stone |

Document every remap in the sprint's design handoff. Future sprints that touch messaging read this table before looking at any external reference.

### M11. Supabase Realtime presence channels — typing + viewing indicator pattern

Canonical pattern for "who is looking at / typing in this conversation right now":

```ts
// hooks/messaging/use-conversation-presence.ts
const channel = supabase.channel(`presence:conversation:${conversationId}`, {
  config: { presence: { key: userId } },
})

channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ userId: string; userName: string; state: 'viewing' | 'typing'; ts: number }>()
    setPresent(
      Object.values(state)
        .flat()
        .filter(p => p.userId !== currentUserId), // exclude self
    )
  })
  .subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return
    await channel.track({ userId, userName, state: 'viewing', ts: Date.now() })
  })

// Typing updates — throttled
const trackTyping = throttle(
  () => channel.track({ userId, userName, state: 'typing', ts: Date.now() }),
  TYPING_THROTTLE_MS,
)

// Cleanup on unmount — MUST call removeChannel
return () => void supabase.removeChannel(channel)
```

**Rules:**
- Channel key: `presence:{entity_type}:{entity_id}` — stable, namespaced, predictable.
- Presence `key` = `userId` — deduplicates a user's own multiple tabs (only latest state sticks).
- ALWAYS exclude the current user from the rendered list (`p.userId !== currentUserId`).
- Throttle `track()` calls for typing — 1 per `TYPING_THROTTLE_MS` (e.g., 2000ms). Every keystroke is a network round-trip otherwise.
- ALWAYS clean up with `supabase.removeChannel(channel)` on unmount. Leaked channels accumulate and eventually exceed Realtime's per-project channel cap.
- Presence state is NOT persisted — it's ephemeral. For "last seen at" use a `user_presence` table updated via throttled server action.

### M12. Worker files must be git-tracked before Bolt runs

`workers/jobs/send-scheduled-message.ts` was created locally but never `git add`ed. Sage passed (grep-based scans saw the file on disk), but Bolt's pre-deploy check caught it: Railway would deploy from the commit, and the commit didn't contain the worker. Messages would enqueue into a queue with no consumer.

**Rule:** Before Bolt runs for any sprint that adds workers, verify:
```bash
git status workers/
# Should show no unstaged files in workers/
git ls-files workers/ | wc -l
# Should match the number of files on disk
find workers -type f -name "*.ts" | wc -l
```

Bolt's pre-deploy checklist includes this step explicitly. Add a CI check: `git diff --name-only HEAD` compared to `find workers -type f` — if the on-disk set is larger than the tracked set, fail the build. This generalizes to any directory that Railway's Dockerfile COPYs from: `workers/`, `scripts/`, `supabase/migrations/` — all must be fully tracked before deploy.

---
*Messages v1 sprint appendix added 2026-04-23.*

---

## Appendix — Stripe Connect Foundation Sprint (Plan-S13, 2026-04-30)

> **Sprint numbering note:** The 75-sprint plan at `~/.claude/plans/so-this-is-whole-parallel-pillow.md` numbers Stripe Connect Foundation as **S13** (first epic, first sprint). This is the **14th chronological sprint** in repo history (after Sprints 0–12 + Messages v1). When in doubt, refer to plan numbering for forward planning, chronology for git history.

### CC1. Contract-first prevents drift — proven on first dual-stack sprint
**Pattern:** Author `lib/payments/contracts.ts` (RPC `Args`/`Result` interfaces + branded `CentsAmount` type + `RPC` constant of canonical function names) BEFORE Dato writes the migration. Then Dato mirrors the spec into SQL with parameter names converted to `p_snake_case`. Sage diff-audits both files against each other.

**Result:** Sage's S13 audit caught name-vs-semantics drift (`upsert_from_webhook` was actually UPDATE-only) on first review — fixed in the same sprint, didn't bleed into S14. **No runtime drift bugs.** This is the antipattern (1A — RPC parameter mismatches) prevented by design rather than caught after the fact.

**Rule:** Every new sprint that introduces a new RPC layer starts with the contract file. Dato is read-only on the contract; payments-lead authors it.

### CC2. RPC name must match semantics, not aspiration
**Anti-pattern from Sage audit:** A Postgres function literally named `*_upsert_from_webhook` that internally does UPDATE-only and `RAISE EXCEPTION` on missing row. Anyone reading the name assumes ON CONFLICT semantics and writes a webhook handler that doesn't catch the exception.

**Rule:** If the function does UPDATE-only, name it `*_update_from_webhook`. If it does true upsert, name it `*_upsert_from_webhook`. The name is a contract with the caller. Mismatch causes 500s on edge cases.

**Reinforced:** Sage's H1 finding renamed the RPC pre-S14, before any caller existed. This is a generalizable rule for RPC-naming hygiene.

### CC3. DOWN section function signatures must match `CREATE` exactly
**Pitfall:** PostgreSQL identifies functions by `(name, arg_types_in_order)`. A `DROP FUNCTION IF EXISTS foo(uuid, text, text, ...)` silently no-ops if the actual signature is `foo(uuid, text, uuid, ...)`. The migration "rolls back successfully" but leaves the function in the schema. A re-apply hits `CREATE OR REPLACE` and works, but if the next sprint changes the signature, rollback is broken.

**Rule:** Every Dato migration's DOWN section must list each `DROP FUNCTION` with the exact arg-type tuple from the matching `CREATE FUNCTION`. Sage scans for this in refactor sprints. Also: never use `DROP FUNCTION foo CASCADE` without the arg list — it works for the most-recent overload but is brittle.

### CC4. CHECK-constraint design for ledger reversals — asymmetric is idiomatic
**Pattern:** For ledger-style tables that need to insert negative amounts ONLY for reversal rows:
```sql
CONSTRAINT commission_splits_base_pos CHECK (kind = 'reversal' OR base_amount_cents >= 0)
CONSTRAINT commission_splits_tip_pos  CHECK (kind = 'reversal' OR tip_amount_cents >= 0)
CONSTRAINT commission_splits_reversal_parent_check CHECK (
  (kind = 'reversal' AND parent_split_id IS NOT NULL) OR
  (kind <> 'reversal' AND parent_split_id IS NULL)
)
```
Negative amounts allowed *only* when `kind = 'reversal'`, and reversals *must* point to a parent. Avoids needing a separate reversal table.

**Reinforced:** This pattern handles 70/30 commission splits, refund-driven reversals, and dispute-loss clawbacks in the same table. S14 will validate via Luna replay tests.

### CC5. Tip-only splits need explicit guard against base-amount reversals
**Pitfall caught by Sage H3:** A `commission_splits` row with `kind='tip'` has `base_amount_cents=0` (tips are tip-only by design). The `commission_split_reverse` RPC accepts a `p_reverse_amount_cents` parameter — if a caller mistakenly passes a non-zero base reverse on a tip parent, the bounds check `IF p_reverse_amount_cents > v_parent.base_amount_cents` throws (because parent base is 0), but only for positive values. The intent is silently lost on edge cases.

**Rule:** Add an explicit guard in the reversal RPC:
```sql
IF v_parent.kind = 'tip' AND p_reverse_amount_cents <> 0 THEN
  RAISE EXCEPTION 'commission_split_reverse: tip parent reversals must use tip cents only';
END IF;
```
Generalize: when an RPC accepts multiple amount kinds (base + tip), validate that the kind being reversed matches the parent's kind. Document each invariant in the contract jsdoc.

### CC6. GRANT comments must distinguish authenticated vs service-role server-action
**Pitfall:** A migration comment `GRANT: service_role only (webhook + server action)` is misleading. A "server action" runs in `authenticated` role by default. To call a `service_role`-only RPC, the action must explicitly construct a service-role client. Future engineers reading the comment will write a server action, get a permission-denied error, and waste an hour.

**Rule:** GRANT comments specify the exact role context: `service_role only (webhook handler + server-side service-role client)`. Drop the ambiguous "server action" phrasing.

### CC7. `webhook_events` is the first write of every webhook handler
**Pattern:** Every webhook handler's first SQL operation is:
```sql
INSERT INTO webhook_events (source, event_id, ...) VALUES (...)
ON CONFLICT (source, event_id) DO NOTHING
RETURNING id;
```
If RETURNING produces no row, the event is a replay — return 200 immediately, do not process. This is risk #1 (dual-rail webhook reconciliation) collapsed to a one-line invariant.

**Reinforced:** Sage caught (M1) that the existing Dodo webhook handler does direct `.from('webhook_events').insert()` rather than going through `webhook_event_insert` RPC. Functionally fine (uses unique constraint), but breaks INVARIANT 3. S14 refactors Dodo handler to RPC for parity, then INVARIANT 3 becomes a Sage grep rule for all future webhook handlers.

### CC8. Dual-stack payments — Dodo (L1) and Stripe Connect (L2) must never share a module
**Architecture rule:** `lib/dodo/` is L1 SaaS subscriptions only. `lib/stripe/` (NEW from Sprint 13/14) is L2 in-studio marketplace only. `lib/payments/contracts.ts` is the only shared file — and it contains pure types, no runtime imports of either SDK.

**Rule:** Sage scans for `import.*dodo` AND `import.*stripe` in the same file → hard fail. The two rails serve different layers and conflating them is the path to mixed-up tax / split / dispute reasoning. Plan §5 documents this separation.

### CC9. Money is `bigint`/`CentsAmount`, never `numeric`/`float`
**Reinforced rule:** All money columns are `bigint` (int8) in Postgres, mapped to `CentsAmount` (branded `number`) in TypeScript. Never `numeric`, never `int4` (overflow risk on accumulator tables like `tax_remittance_ledger`), never JS `number` for money in app code (branded type is enforced at compile time).

**Pattern:** `lib/payments/contracts.ts` exports `CentsAmount` as a branded type and a `cents()` constructor with `Number.isInteger` guard. Money math uses banker's rounding when splitting (e.g., `splitCents(100, [70, 30])` → `[70, 30]`, not `[70, 30.0000001]` from float). The `splitCents` helper lands in S15.

---
*Stripe Connect Foundation (Plan-S13) appendix added 2026-04-30. Migration: `supabase/migrations/20260505100000_payments_l2_stripe_connect_schema.sql`. Contract: `lib/payments/contracts.ts`. Audit verdict: APPROVE-WITH-FIXES — all 4 High findings folded into S13 commit.*
