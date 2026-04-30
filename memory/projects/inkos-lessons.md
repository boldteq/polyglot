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

---

## Appendix — Dual-Webhook Reconciler Sprint (Plan-S14, 2026-04-30)

> **Scope:** New Stripe Connect webhook handler + Dodo handler refactored to use `webhook_event_insert` RPC + 55 RPC replay-safety tests + hourly reconciliation cron + BullMQ dead-letter queue with admin replay endpoint. **5 parallel tracks (A/B/C/D/F)** dispatched simultaneously, audited by Sage at end.

### CC10. Webhook signature verification ordering is the reference impl
**Pattern:** Every webhook entry point follows this exact order:
1. Read raw body via `req.text()` (NOT `req.json()` — HMAC needs raw bytes).
2. Read provider's signature header.
3. Check env config presence → 503 if missing (per CC also documents inkos-lessons M5).
4. IP-based rate limit → 429 if exceeded.
5. Constant-time signature verification (Stripe: `stripe.webhooks.constructEvent`, Dodo: `standardwebhooks.Webhook.verify`). On fail → audit_log entry + 401.
6. `webhook_event_insert` RPC (CC7 invariant). If `inserted=false` → 200 immediately, do NOT process.
7. Switch on event.type → call appropriate RPC. On RPC failure → 500 (provider retries naturally).
8. Return 200 on success with structured `{ received, event_id, event_type }`.

**Reinforced:** Sage verified this ordering on both Stripe (new) and Dodo (refactored) handlers. Future webhook handlers (e.g., Mailchimp in S56, Twilio in marketing flows) MUST follow identical posture. Asymmetry between handlers = open attack surface.

### CC11. Rate-limit posture must be symmetric across all webhook entry points
**Antipattern caught by Sage H2:** Stripe handler had IP rate limit; Dodo handler did not. After Track B's RPC refactor, the Dodo handler still lacked the limiter — Sage flagged + Track B follow-up added it. Inconsistent rate limit posture between entry points lets attackers funnel junk traffic to the unlimited one.

**Rule:** Every webhook handler imports `webhookRatelimit` from `lib/rate-limit.ts` and calls `webhookRatelimit.limit(getClientIp(req))` BEFORE signature verification. Sage scans every webhook route file for this in refactor sprints.

### CC12. Workers cannot transitively import `next/*` — use structural types
**Pitfall caught during S14 H3 fix:** Worker `webhook-replay.ts` needed to import `processStripeEvent` from `lib/payments/process-stripe-event.ts`. But `process-stripe-event.ts` originally imported `import type Stripe from 'stripe'` AND used `import type { createServiceRoleClient }` — the latter transitively pulled `next/headers` into the worker bundle via the type chain.

**Fix:** Replaced `Stripe.Event` with a structural `StripeEventLike` interface (just the fields actually accessed). Replaced `ReturnType<typeof createServiceRoleClient>` with `SupabaseServiceClient` structural type. Now `processStripeEvent` accepts any object satisfying the shape — works in route handler AND worker.

**Rule:** Any code intended for shared use between Next.js routes and Railway workers must use STRUCTURAL TYPES, not `import type` from packages that have non-type runtime impact. Specifically: never `import type X from '@stripe/stripe-node'` in shared code — define a local interface listing the fields you actually use. Same for Supabase client types when sharing with workers.

### CC13. Path aliases in `workers/tsconfig.json` enable code reuse without duplication
**Pattern:** Add `"paths": { "@/*": ["../*"] }` to `workers/tsconfig.json` so workers can import via the same `@/lib/...` alias as the Next.js app. Combined with CC12 (structural types), this lets a single `processStripeEvent` function serve both the route handler (signature-verified path) AND the BullMQ replay worker (signature-bypassed path).

**Antipattern avoided:** Duplicating event-dispatch switch statements across route + worker. Drift between the two means new event types added to one path silently miss the other. Sage caught this as H3 — collapsed via the alias + extraction.

**Generalizable:** Any time two sibling code paths (route + worker, route + cron, route + test) need to call the same business logic, extract to `lib/<domain>/<action>.ts` and import from both. Worker tsconfig path alias makes this frictionless.

### CC14. Dodo and Stripe replay paths can use different mechanics — pick by complexity
**Decision:** Stripe replay = direct `processStripeEvent` call from worker (after CC12+CC13 fixes). Dodo replay = HTTP roundtrip via `/api/webhooks/dodo/internal-replay` with `X-Replay-Secret` header.

**Why asymmetric:** Stripe events deserialize cleanly from JSON to `Stripe.Event` shape (or our `StripeEventLike`). Dodo events go through Zod schema parsing first (`DodoEnvelopeSchema`), which is route-handler-tied. The HTTP roundtrip lets Dodo events re-enter via the same Zod path without duplicating parser logic in workers.

**Rule:** When choosing replay mechanics for a new webhook source, ask: *"is the event format trivially reconstructable from JSON?"* If yes → direct in-worker processing. If no (Zod schemas, complex parsers, signing-key-per-event) → HTTP roundtrip with `timingSafeEqual` shared secret. Both patterns are documented; pick by event-format complexity.

### CC15. Pino `Logger` generic types — drop the bound generic when accepting children
**Pitfall caught by Sage H1 (worker typecheck blocker):** A function parameter typed as `jobLog: ReturnType<typeof logger.child>` resolves to `Logger<never, boolean>`, but pino's child accepts `Logger<string, boolean>` for child-of-child. Mismatch = TS2345 in workers, blocks deploy.

**Rule:** Import `Logger` directly from pino: `import type { Logger } from 'pino'`. Use `jobLog: Logger` (no generic) when accepting an arbitrary pino child. Use `Logger<'mybind', false>` only when you specifically bind that key. Don't rely on `ReturnType` for pino types — too brittle.

### CC16. Reconciliation cron is read-only by default; drift table is later epic
**Pattern S14 chose:** Hourly cron at `:05` past every hour reads Dodo subs + Stripe charges, compares vs DB, logs drift via pino. **Zero DB writes in S14.** Drift table (`reconciliation_reports`) and admin dashboard widget deferred to a future epic.

**Why:** Reconciliation logic is the dangerous part. Auto-remediation (e.g., auto-fixing `subscriptions.status` when Dodo says 'cancelled' and DB says 'active') is high-risk — wrong fix can clobber legitimate state. By logging only in S14 + S15, we observe drift patterns for 1-2 weeks before deciding which classes of drift are safe to auto-remediate.

**Rule:** New reconciliation crons start read-only. Promote to write only after observing real drift patterns. The first thing a write-cron clobbers is the state you forgot existed.

### CC17. Admin replay endpoint requires 4-layer gate
**Pattern from `app/api/admin/webhooks/replay/route.ts`:** Every admin destructive endpoint follows:
1. **Auth check:** `is_platform_admin` claim verified (not just authenticated).
2. **Rate limit:** strict — 5 calls/minute (admin manual replays should be rare).
3. **Existence check:** target row must exist; return 404 if missing.
4. **Audit log:** every call logged via `logAuditAction({ event: 'admin_webhook_replay', ... })`.

Internal replay endpoints (e.g., `/api/webhooks/dodo/internal-replay`) skip auth check (service-to-service trust) but ADD a 5th layer: `X-Replay-Secret` header verified via `timingSafeEqual` against env `WEBHOOK_REPLAY_INTERNAL_SECRET` (`.min(32)` length enforced).

**Rule:** No admin-destructive endpoint ships with fewer than these 4 gates. Internal-only endpoints add the shared-secret layer. Both surface `audit_log` rows for security visibility.

---
*Dual-Webhook Reconciler (Plan-S14) appendix added 2026-04-30. Files touched: 22 across 5 tracks. Sage verdict: APPROVE-WITH-FIXES — H1 (Pino Logger generic), H2 (Dodo rate limit), H3 (Stripe dispatch dedup) all folded into S14 commit. Worker + project typecheck clean.*

---

## Appendix — Connect Onboarding Sprint (Plan-S15, 2026-04-30)

> **Scope:** Stripe Connect Express studio + artist onboarding flow. 4 parallel tracks (backend / frontend / capability gate RPCs / tests) + Sage BLOCK verdict + 3 parallel fix tracks → APPROVE.

### CC18. Country is immutable on Stripe Connect — fetch from non-defaultable source
**Pitfall caught by Sage CRIT-2:** Track A's first cut hardcoded `country: 'US'` because `studios.country` column didn't exist yet. Stripe Connect Express accounts are PERMANENTLY locked to the country at creation — there is no Stripe API to change it. Shipping with a default would have permanently corrupted every non-US studio's Connect account, retroactively breaking InkOS's #3 strategic moat (EU REACH compliance per CLAUDE.md §2).

**Rule:** Any external system field that's immutable post-creation must come from a user-confirmed, non-defaultable source. Specifically:
1. Schema column with NO default (or default = null with NOT NULL constraint added later).
2. UI confirmation step BEFORE the API call (modal with explicit "Stripe sets this permanently — we can't change it later").
3. Route validation rejects with structured 400 if missing.

**Generalize:** Stripe `country`, Connect `account_id` (auto-generated by Stripe), tax registration jurisdiction, banking BIN/IBAN — all immutable. Treat them with the same discipline.

### CC19. Test fixtures must match schema join paths exactly — verify before writing tests
**Pitfall caught by Sage CRIT-1:** Track D wrote `setArtistSelfPayouts` updating `artists.payouts_self_enabled` — but per S13 plan §6.2 and migration line 933, the column lives on `studio_members.payouts_self_enabled`. Track C (Dato) joined correctly: `artists.profile_id = studio_members.user_id AND studio_members.studio_id = artists.studio_id`. Tests would have failed at runtime against the real DB.

**Rule:** Before writing test fixtures that touch a column, cross-reference the migration file to confirm:
1. Which table actually owns the column.
2. The full join path needed to reach it from the test's entry point (e.g., artist_id → profile → studio_member).
3. Run `grep -n 'ADD COLUMN.*payouts_self_enabled' supabase/migrations/` to verify.

**Pattern from S15 fix:** `createTestArtistWithProfile(studioId, { payoutsSelfEnabled })` — single fixture wires `auth.users → profiles → studio_members(payouts_self_enabled) → artists(profile_id)` + cleanup in FK-safe order. Reusable for any artist-scoped capability test.

### CC20. UNIQUE partial indexes are the schema-level race-condition guard
**Pattern reinforced from Sage HIGH-3 + HIGH-1:** When a logical constraint is "one row per (parent, type)", enforce at the schema level via a UNIQUE partial index — not just at the application layer. App-layer existence checks have race windows (concurrent onboard requests can both pass `existingAccount === null` then both INSERT).

**Pattern:**
```sql
CREATE UNIQUE INDEX uniq_table_parent_type
  ON table (parent_id)
  WHERE type = 'singleton_kind';
```

**Reinforced from S15:** Two partial indexes on `stripe_connected_accounts`:
- `(studio_id) WHERE type='studio'` — one studio account per studio
- `(artist_id) WHERE type='artist' AND artist_id IS NOT NULL` — one artist account per artist

Both coexist with the existing UNIQUE on `account_id` (Stripe's id). The partial-index pattern doesn't prevent multiple rows of OTHER types — perfect for marketplace/Connect-style schemas where `(parent, kind)` is the logical key.

**Generalize:** Any "one of X per parent" constraint (one default location per studio, one primary artist per booking, one active subscription per studio) gets a UNIQUE partial index.

### CC21. Account IDs leak via clickable URLs — mask in display + use generic dashboard URLs
**Pitfall caught by Sage HIGH-2:** Track B's first cut put `acct_xxx` directly into `https://dashboard.stripe.com/connect/accounts/${account_id}` href. Even though only owner/admin saw the page, the account ID landed in:
- Rendered DOM (browser extensions can read).
- Browser history (autocomplete leaks).
- Referrer headers if user clicks through (then leaks to Stripe).

The displayed text was already masked (`acct_•••${last4}`) — but the `href` wasn't.

**Rule:** Account IDs (Stripe acct, Plaid item, Twilio sid, etc.) are sensitive identifiers. Treat them like:
1. Display: ALWAYS mask in UI (last 4 chars after `•••`).
2. URLs: Never include in `href`. Use the generic provider dashboard URL (e.g., `https://dashboard.stripe.com/`) and let the user navigate within the provider's UI.
3. Logs: Mask in pino logger (`{ account_id: maskAcct(acct) }`).
4. Audit log: Full ID is fine (it's the audit trail's job to record everything).

### CC22. Verify URL-driven state before showing UX — don't trust query params
**Pitfall caught by Sage HIGH-4:** Track B's first ConnectReturnHandler trusted `?onboarding=complete&type=studio` and fired a success toast unconditionally. Anyone with the URL crafted could trigger the toast — low impact but a CC: explicit-trust violation.

**Rule:** Any URL-driven UX (return handlers, deep links, magic-link landing pages) must verify against server state BEFORE rendering success copy:

```tsx
useEffect(() => {
  if (urlParam !== expected) return;
  fetch('/api/.../status').then(r => r.json()).then(status => {
    if (status.actually_complete) toast.success(...);
  });
}, [urlParam]);
```

**Reinforced:** Even when the server-side route is auth-gated, the URL params are user-controllable. Server fetch is the source of truth for "did the thing actually complete?"

### CC23. 4-parallel-track sprint pattern is production-proven
**Pattern reinforced over S13/S14/S15:** The factory dispatch shape that consistently ships sprint-grade output:

1. **Pre-sprint:** Add contract additions to `lib/payments/contracts.ts` (CC1 contract-first discipline).
2. **Parallel dispatch (single message, multiple Agent calls):**
   - Track A — backend (Koda)
   - Track B — frontend (Koda or web-platform-frontend when available)
   - Track C — schema/migration (Dato)
   - Track D — tests (Luna)
   - Track E — workflow/cron/replay if needed (Koda)
3. **Sage audit at end** with structured verdict: APPROVE / APPROVE-WITH-FIXES / BLOCK.
4. **Fold High findings into the same sprint** — never push to next sprint. Dispatch fix-tracks in parallel.
5. **Append CC lessons before closing.**

**Key discipline:** Sage finds drift BEFORE it ships. The S15 BLOCK verdict (test fixtures wrong table + hardcoded country) would have been a P0 production bug — caught by audit, folded into sprint, shipped clean. Never ship High findings forward.

---
*Connect Onboarding (Plan-S15) appendix added 2026-04-30. Files touched: 22 (track a/b/c/d) + 9 (fix tracks). Sage verdict: BLOCK → APPROVE after CRIT-1 (test fixtures) + CRIT-2 (country plumbing) + HIGH-1 (test isolation) + HIGH-2 (account_id URL leak) + HIGH-3 (UNIQUE partial indexes) + HIGH-4 (return handler verification) all folded into S15 commit.*

---

## Appendix — Destination Charges + Deposit SAGA Sprint (Plan-S16, 2026-04-30)

> **Scope:** End-to-end session charge flow with capability gate runtime block, country sanity check, deposit pool atomic settlement (SAGA pattern), commission splits, refunds with INVARIANT 5 enforcement, webhook SAGA confirmation. **5 parallel tracks (A/B/C/D/E) + Sage audit + 2 fix dispatches** — first sprint where real cards charge real money.

### CC24. Schema bridge pattern when existing table doesn't match new spec
**Pattern from Track C:** Existing `project_deposit_transactions` (from `20260422100200_project_deposit_transactions.sql`) had column shape:
- `type` (received | applied | refunded | consumed)
- `amount_cents` (single column)
- `applied_to_session_id`

Plan §6.5 had specified different shape:
- `kind` (split | reversal | adjustment | tip)
- `draw_cents`
- `session_id`
- `status` enum + `idempotency_key` + `parent_transaction_id` + `confirmed_at` + `rolled_back_at`

Track C's solution: **additive bridge** — added all new columns alongside old ones via `ADD COLUMN IF NOT EXISTS`. Extended `type` CHECK to include new value `'saga_hold'`. SAGA rows insert with `type='saga_hold'` to bypass the existing INSERT trigger (which only handles `received|applied|refunded|consumed`). RPCs do their own `UPDATE projects SET deposit_applied_cents` for atomicity.

**Rule:** When extending an existing table for a new feature epic, prefer additive ALTER + CHECK extension over destructive renames. Bridge the old/new naming via the new RPCs; document in migration comments. Avoid breaking the existing trigger chain.

**Generalize:** Any table touched by both legacy code paths and new feature work — additive only. Renames require coordinated multi-sprint deprecation cycles.

### CC25. Plan column names don't survive contact with reality — ALWAYS read the actual migration
**Pitfall caught by Sage S16 H1:** Plan §6 listed 4 deposit pool columns (`deposit_pool_cents_in/applied/available/refundable`). Actual S13 schema went with **2 columns** (`deposit_pool_cents` + `deposit_applied_cents`) with available computed. Track E (Luna) wrote test fixtures using the plan's 4-column names. DB-gated tests would have silently failed the moment anyone set `DATABASE_URL` — `column "deposit_pool_cents_in" does not exist`.

**Rule:** Before writing test fixtures or RPCs against an existing table:
1. `grep -E "ADD COLUMN|CREATE TABLE.*<table>" supabase/migrations/` to find the actual schema.
2. Cross-reference the column names in your code against what the migration ACTUALLY shipped, not what the plan specified.
3. If they differ, either match the migration OR file an addendum migration with explicit column rename.

**Reinforced from CC19:** Test fixture column drift is invisible at typecheck time (DB types not regenerated yet during sprint). Only DB-runtime catches it. Sage scan for fixture vs migration drift becomes a refactor-sprint discipline.

### CC26. Stripe SDK literal version drift — features removed across major versions
**Pitfall noted by Track A:** `automatic_tax: { enabled: true }` was a valid PaymentIntent.create param in earlier Stripe SDK versions but removed from the type signature in v22 (`'2026-04-22.dahlia'`). Track A caught at compile time; Stripe Tax STILL works at runtime (configured via Stripe Dashboard on the connected account), but the explicit toggle field is gone.

**Mitigation:** Tax computation moves to webhook side. On `payment_intent.succeeded`, the charge object's tax breakdown gets read and mirrored into `stripe_charges.tax_amount_cents` via `stripe_charge_update_status_from_webhook` RPC.

**Rule:** When pinning a Stripe API version, check the major-version migration guide for removed/renamed fields. Don't assume backward compat. Document deviations in code comments AND lessons.

**Generalize:** Any external SDK with versioned API contracts — pin the version literal, document removed features, move to alternate paths (webhook-side compute, dashboard config, etc.).

### CC27. SAGA pattern for marketplace charges — apply BEFORE external API, rollback on failure
**Canonical pattern from S16:**

```
1. capability gate check        → 403 if not allowed (no Stripe call)
2. country sanity check          → 422 on drift (no Stripe call)
3. SAGA STEP 1: apply_deposit_to_session RPC (writes pending_apply row, decrements available)
4. stripe.paymentIntents.create  → wraps in withIdempotencyKey()
   ├─ On error → CATCH → rollback_deposit_application RPC (re-credits pool)
   └─ On success → mirror in stripe_charges via stripe_charge_record RPC
5. (async) webhook payment_intent.succeeded → SAGA STEP 2: confirm_deposit_application RPC
   (or) payment_intent.payment_failed | canceled → SAGA STEP 2: rollback_deposit_application RPC
```

**Why it works:** the deterministic `idempotencyKeyFor()` ensures Stripe returns the same PI on retry. The SAGA's `idempotency_key` UNIQUE on `project_deposit_transactions` ensures the apply RPC is also idempotent. So both the local DB write AND the external API call dedupe on retry — safe to rethrow at any failure point.

**Reaper safety net:** orphan `pending_apply` rows older than 30 minutes (process killed mid-flight) get swept by a reaper cron in S17. Index `idx_project_deposit_transactions_reaper` partial WHERE `status='pending_apply'` makes this a fast scan.

**Rule:** Any flow that mutates local DB state THEN calls an external service must follow this shape. The catch block IS the rollback path. The webhook IS the confirmation path. Both must be idempotent. The reaper is the safety net for process death between local commit and webhook delivery.

### CC28. `supabase.from` cast pattern needs `.bind(supabase)` for test-mock compatibility
**Pitfall caught during S16 H2 fix:** Track D's `handleChargeRefunded` declared:
```ts
const fromUntyped = supabase.from as unknown as (table: string) => { ... };
fromUntyped('stripe_charges')...
```
Works against the real Supabase client (where `from` is callable). FAILS against Vitest mocks where `supabase.from = vi.fn()` — calling `fromUntyped('table')` invokes `from.call(undefined, 'table')` which loses the bound `this`.

**Fix:** declare with explicit bind:
```ts
const fromUntyped = supabase.from.bind(supabase) as unknown as (table: string) => { ... };
```

This works against BOTH real client and mocks because `bind(supabase)` returns a callable function that carries the right `this` regardless of how it's invoked.

**Rule:** When casting `supabase.from` (or any method-as-callable pattern) to a different signature, always `.bind(supabase)` first. Same applies to `supabase.rpc.bind(supabase)` if the same pattern is used elsewhere. Test mocks don't preserve method binding the same way real clients do.

### CC29. "Reconciliation cron will catch" claims must be VERIFIED, not assumed
**Pitfall caught by Sage S16 H2:** Track A's `stripe_charge_record` failure path logged CRITICAL and continued without throwing, with comment "reconciliation cron will catch this." Sage verified the existing `payments-reconciliation.ts` cron at `workers/cron/`: it only LOGS drift, doesn't INSERT missing rows. Refund flow then 404s on the missing charge row → real-money-at-rest gap.

**Fix shipped in S16:** rethrow on `chargeRecErr`. The PI is idempotent (deterministic `idempotencyKeyFor()`), so caller surfaces 502 → Stripe retries on next webhook → second pass succeeds.

**Rule:** Before committing any code path with comment "X will be repaired by Y," GREP Y's actual implementation to verify the repair logic exists. Aspirational comments compound — Sage's recent verdicts have flagged 3 in 4 sprints (S14, S16, S15-D2 audit).

**Generalize:** Any safety-net assumption needs a Luna test that asserts the safety net actually catches the failure mode being claimed.

### CC30. INVARIANT enforcement via literal boolean + Sage grep, not config or options
**Pattern reinforced for INVARIANT 5:** `lib/stripe/refunds.ts` Stripe refund call:
```ts
stripe.refunds.create({
  payment_intent,
  amount,
  reverse_transfer: true,            // INVARIANT 5: literal true, no branches
  refund_application_fee: true,      // INVARIANT 5: literal true, no branches
  ...
});
```

**Why literal:** Sage scans for `reverse_transfer: true` AND `refund_application_fee: true` literally. If either is replaced with `reverse_transfer: opts?.reverseTransfer ?? true` or `...refundOpts`, the literal grep MISSES the override path.

**Rule:** For invariants that MUST hold across all call sites, encode them as inline literal values, not as defaults that can be overridden. The grep becomes the gate.

**Generalize:**
- INVARIANT 4 `application_fee_amount: ...` — value can vary, but the field must be PRESENT (Sage greps for the key, not the value).
- INVARIANT 2 `metadata.inkos_idempotency_key: key` AND `{ idempotencyKey: key }` request option — both literal, both grepable.
- INVARIANT 5 `reverse_transfer: true` + `refund_application_fee: true` — both literal `true`, both grepable.

When any invariant is "always X" without exception, write it as inline literal. When the code's flexibility is the trap, sacrifice flexibility for greppability.

---
*Destination Charges + Deposit SAGA (Plan-S16) appendix added 2026-04-30. Files touched: 17 (5 parallel tracks A/B/C/D/E) + 3 (Sage fix tracks H1/H2/H3 + Track D bug). Sage verdict: APPROVE-WITH-FIXES → APPROVE after H1 (test column names), H2 (rethrow chargeRecErr), H3 (.todo→it conversions), and Luna-discovered Track D `fromUntyped` TypeError all folded into S16 commit. INVARIANTS 2/4/5 confirmed grep-enforced. SAGA atomicity verified: apply→PI→catch-rollback→webhook-confirm chain holds. Real money flows production-ready.*

---

## Appendix — Per-Tax-Line Attribution + Reaper + Reconciliation Phase C (Plan-S17, 2026-04-30)

> **Scope:** Tax mirror path on PI succeeded webhook + per-tax-line commission split inserts + tax_remittance_ledger accrual + orphan SAGA reaper cron + Phase C drift detection in reconciliation cron. **5 parallel tracks (A/B/C/D/E) + Sage audit + 3 fix dispatches.**

### CC31. Tax mirror webhook pattern — read `amount_details.tax_breakdown` from PI payload, no Stripe API call
**Pattern from Track A:** Stripe Tax computation happens server-side at PI succeed; the breakdown lands in the webhook payload at `event.data.object.amount_details.tax_breakdown[]`. Each entry has `{ amount, jurisdiction: { country, state? }, tax_rate_details? }`. The webhook handler reads this directly — NEVER calls `stripe.charges.retrieve()` to fetch the breakdown (CC: webhook hot path forbidden).

**Webhook flow:**
1. Read `taxTotal = pi.amount_details?.tax?.amount ?? 0`.
2. Read `taxBreakdown = pi.amount_details?.tax_breakdown ?? []`.
3. Update `stripe_charges.tax_amount_cents` via existing `STRIPE_CHARGE_UPDATE_STATUS_FROM_WEBHOOK` (extended in S17 to accept `p_tax_amount_cents`).
4. Loop breakdown → per-line `COMMISSION_SPLIT_TAX_LINE_RECORD` + per-jurisdiction `TAX_REMITTANCE_ACCRUE`.
5. Fallback when breakdown empty + tax > 0: single-line accrual under `'UNKNOWN'` jurisdiction (flagged for manual reclassification).

**Rule:** When Stripe (or any external service) embeds breakdown data in webhook payload, USE IT. Never round-trip the API for data already in hand. Keeps webhook hot-path under 500ms.

### CC32. Synthetic ID pattern when external system doesn't provide stable IDs
**Pitfall caught in S17:** Stripe's `tax_breakdown[]` entries don't have stable IDs across replays. Without idempotency key, replay would create duplicate tax_line rows.

**Fix:** Synthesize ID from caller's stable inputs:
```ts
const taxLineId = `${parentSplitId}:${jurisdiction}`;
```

UNIQUE partial index on `(parent_split_id, tax_line_id) WHERE kind='tax_line'` ensures replay returns existing row (idempotent) instead of inserting duplicate.

**Rule:** When external system lacks stable IDs, derive synthetic ID from stable internal identifiers + the discriminator (jurisdiction, tax_type, etc). Pair with UNIQUE partial index.

**Caveat (M3 from S17 audit):** synthetic key collision risk if the external system sends two entries with same discriminator (e.g., 2 tax breakdown entries both labeled `'US-NY'` but for different tax types). Future-proof by including tax_type or rate in the synthetic key when scope expands.

### CC33. Backward-compat RPC extension via Postgres named-arg DEFAULTs
**Pattern from Track D:** Extending an existing RPC's signature without breaking old callers:

```sql
DROP FUNCTION IF EXISTS my_rpc(arg1, arg2, arg3);          -- drop old signature
CREATE OR REPLACE FUNCTION my_rpc(
  p_arg1 type1,
  p_arg2 type2,
  p_arg3 type3,
  p_new_field type4 DEFAULT NULL                           -- NEW with DEFAULT
)
```

Postgres named-arg calls (`supabase.rpc('my_rpc', { p_arg1, p_arg2, p_arg3 })`) work transparently with DEFAULTs — old callers don't pass the new field, get NULL/DEFAULT.

For UPDATE-style RPCs that should treat NULL as "don't update," use `COALESCE`:
```sql
UPDATE table SET field = COALESCE(p_new_field, field) WHERE id = p_id;
```

**Rule:** Always extend RPCs via DEFAULTs + COALESCE rather than versioning (`my_rpc_v2`). Saves a future deprecation cycle. Document the extended signature in contracts.ts but keep old call sites untouched until refactor sprint.

### CC34. Drift_check RPCs must cover EVERY mirror failure path — repeated false-safety-net trap
**Pitfall caught by Sage S17 H1:** Track A's webhook handler logs `'commission_split_tax_line_record failed — recoverable via reconciliation'` on RPC error WITHOUT throwing. But the existing `commission_splits_drift_check` had only 2 detection legs (PIs missing split, disputes missing reversal) — NO leg for tax_line drift. Sage caught the same false-safety-net pattern Sage flagged in S16 H2 (CC29).

**Fix shipped in S17:** Add Leg 3 to `commission_splits_drift_check`:
```sql
-- Leg 3: succeeded charges with tax_amount_cents > 0 where parent split exists but no tax_line children
SELECT ... FROM stripe_charges sc
INNER JOIN commission_splits parent ON parent.booking_id = sc.booking_id AND parent.kind = 'split'
LEFT JOIN commission_splits taxlines ON taxlines.parent_split_id = parent.id AND taxlines.kind = 'tax_line'
WHERE sc.tax_amount_cents > 0 AND taxlines.id IS NULL;
```

Plus extended `CommissionSplitsDriftCheckResult` interface with `charges_missing_tax_line` field.

**Rule:** For every code path with comment "X will be repaired by Y," GREP Y's actual implementation to verify the repair logic exists for THIS specific failure mode. Aspirational claims compound — Sage has flagged this anti-pattern in S14, S16, AND S17 now. Production discipline: add a Sage-scan rule that every "recoverable via reconciliation" comment must reference a specific drift check leg by name.

### CC35. Test fidelity gap — inline copies of production functions defeat tests
**Pitfall caught by Sage S17 H2:** Track E's Phase C test file declared an INLINE `reconcileCommissionSplitsInline` function with DIFFERENT error semantics than the production `reconcileCommissionSplits` — production throws on RPC error; inline returns empty drift + logs. All 4 tests passed against the inline version, but Phase C in `payments-reconciliation.ts` was effectively untested.

**Fix:** export the production function from its module + import it directly in the test. Update assertions to match production semantics (`rejects.toThrow(...)` for the throw path).

**Rule:** Tests must exercise PRODUCTION code, not inline reimplementations. If the test file declares `function inline*()` or `function *Inline()` parallel to the production code, that's a smell — either the function isn't exported (refactor to export) or the test was written before the function existed (rewrite test against the real one).

**Sage scan rule:** grep test files for function declarations that match a production function name with `Inline` / `Local` / `Test` suffix → flag as potential test fidelity gap.

### CC36. Reaper cron pattern for orphan SAGA rows
**Pattern from Track B:** When a SAGA writes a `pending_*` row before an external API call, process death between write and confirmation leaves orphans. The fix: cron sweeps stale rows and rolls them back.

```ts
const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
const orphans = await supabase.from('saga_table')
  .select('id')
  .eq('status', 'pending_apply')
  .lt('created_at', cutoff)
  .limit(BATCH_SIZE);
for (const row of orphans) {
  await supabase.rpc(RPC.ROLLBACK_SAGA, { p_id: row.id, p_reason: 'reaper_timeout' });
}
```

**Configuration constants:**
- `STALE_THRESHOLD_MINUTES = 30` — long enough that legitimate Stripe API latency doesn't trigger, short enough that pool capacity isn't held overnight.
- `BATCH_SIZE = 100` per 5-min run = max 1200 orphans/hour cleaned. Adequate for normal load; document if mass-failure events need bigger sweeps.

**Rule:** Every SAGA pattern (apply → external → confirm/rollback) must have a matching reaper cron. Index the source table by `(status, created_at)` partial WHERE the pending status, so reaper queries are fast.

### CC37. Phase C reconciliation pattern — concurrent + read-only + sample-logged
**Pattern from Track C:** When adding a new reconciliation phase to an existing cron:
1. Make the phase a separate function (`reconcileCommissionSplits`) that returns structured drift data.
2. Wire into the cron's `Promise.all([phaseA, phaseB, phaseC])` — concurrent, no sequential latency penalty.
3. Each phase has its own `.catch(...)` returning `{ error: message }` — failures isolated per-phase.
4. Drift surfaces at WARN level when found, INFO when clean.
5. Log the COUNT + first 5 sample IDs (not the full list — keeps log lines bounded).
6. **Read-only** — no auto-repair (CC16 reinforced). Drift logs feed dashboards; remediation is manual or future-sprint.

**Rule:** Reconciliation crons grow over time as new mirror paths land. Each new phase = (1) new RPC for drift detection + (2) new function in the cron + (3) wired into Promise.all + (4) sample-logged at warn. Don't merge phases — keep them isolated for failure containment.

---
*Per-Tax-Line Attribution + Reaper + Reconciliation Phase C (Plan-S17) appendix added 2026-04-30. Files touched: 16 (5 parallel tracks A/B/C/D/E) + 3 (Sage fix tracks H1 drift Leg 3 + H2 test fidelity + M2 UNKNOWN fallback log). Sage verdict: APPROVE-WITH-FIXES → APPROVE after H1 (drift_check Leg 3 for tax_line) + H2 (export production reconcileCommissionSplits + import in test) + M2 (UNKNOWN fallback error log + no-locations warn log) all folded into S17 commit. Tax accrual ledger production-ready for quarterly remittance.*

---

## Appendix — Tip Routing + Refund Tax Reversal Sprint (Plan-S18, 2026-04-30)

> **Scope:** Tip routing modes (direct vs studio pool) + refund proportional reversal extended to per-tax-line + drift Leg 4. **5 parallel tracks (A/B/C/D/E) + Sage audit + 2 fix dispatches.** First sprint where the symmetric accrual/release ledger is complete.

### CC38. Tip routing modes — `tip_pool_enabled` flag drives `application_fee_amount` calculation
**Pattern from Track A:** Two routing modes, configurable per studio:

| Mode | `tip_pool_enabled` | application_fee_amount | Where tip lands |
|------|-------------------|------------------------|-----------------|
| Direct (default) | `false` | `applicationFeeCents` (commission share only) | Artist's connected account via destination charge |
| Studio pool | `true` | `applicationFeeCents + tipAmountCents` | Studio's connected account, distributed later |
| No artist Connect | either | `baseAmountCents + tipAmountCents` (everything to studio) | Studio account via payroll path |

**Rule:** Tip routing is a per-studio policy decision — encode it as a boolean column on `studios`, read at charge-creation time, embed in PI metadata (`inkos_tip_destination: 'studio' | 'artist'`) for downstream verification + audit. Pool distribution cron is a separate sprint (S20+).

**Generalize:** Any per-studio billing-policy decision (tip pool, commission floor, deposit minimum) belongs as a column on `studios` — not a hardcoded constant, not per-booking metadata. The studio is the policy boundary.

### CC39. Symmetric ledger pattern — every accrual needs a matching release
**Pattern reinforced in S18:** S17 shipped `tax_remittance_accrue` (additive). S18 ships `tax_remittance_release` (subtractive). Together they're the symmetric pair — accrual on PI succeeded, release on refund.

```
PI succeeded → tax_remittance_accrue(jurisdiction, period, +amount) → ledger.collected += amount
Refund      → tax_remittance_release(jurisdiction, period, -amount) → ledger.collected -= amount
```

**Both sides must:**
1. Be idempotent on a unique key (replay-safe).
2. Have bounds checks (release ≤ collected; accrual prevents overflow).
3. Be tracked for audit (releases get a tracking table `tax_remittance_releases` with idempotency_key UNIQUE).
4. Use `SELECT FOR UPDATE` on the ledger row (concurrent refund + accrual race safety).

**Rule:** Never ship an accrual RPC without the matching release RPC in the same epic. If the accrual is in S17 and the release lands in S18, the gap is a tax-overcollection window. Sage will catch.

**Generalize:** Any ledger-style table (loyalty points, credits, deposits, tax) needs paired write directions in the same architectural milestone. Track the asymmetric exposure as a known gap if cross-sprint sequencing is unavoidable.

### CC40. Composite-ID encoding for replay idempotency in derived rows
**Pattern from Track C:** Refund-driven reversals of `kind='tax_line'` rows encode the refund context into the synthetic ID:

```sql
tax_line_id = 'refund:<refund_id>:<original_tax_line_id>'
```

Combined with a UNIQUE partial index:
```sql
CREATE UNIQUE INDEX uniq_commission_splits_tax_line_reversal
  ON commission_splits (parent_split_id, tax_line_id)
  WHERE kind = 'reversal' AND tax_line_id LIKE 'refund:%';
```

Replay of the same refund inserts the SAME synthetic key → UNIQUE conflict → idempotent return.

**Rule:** When a derived row needs replay idempotency but no natural unique key exists, encode the trigger context (e.g., refund_id) into a string column with a discriminator prefix. UNIQUE partial index where the discriminator matches enforces replay safety at the schema level.

**Caveat:** Verify the encoding delimiters don't collide with the encoded fields. Stripe IDs are colon-free (`re_xxx`, `tax_line_xxx`), so `:` works. For arbitrary user input → use a hash + salt instead.

### CC41. `application_fee_amount` clamp — Stripe rejects when fee > amount
**Pitfall caught by Sage S18 H2:** Stripe's PaymentIntent.create requires `application_fee_amount ≤ amount`. With deposit drawdown reducing the charge amount (`amount = base + tip - drawdown`), the unclamped fee can overflow:

- No-Connect mode: fee = `base + tip` → overflows when `drawdown > 0`
- Pool mode: fee = `applicationFeeCents + tip` → overflows when `drawdown > base × pct / 100`
- Default mode: fee = `applicationFeeCents` → overflows when `drawdown > tip + commission_share`

**Fix:** clamp + log:
```ts
const effectiveApplicationFee = Math.min(rawApplicationFee, amountChargedCents);
if (effectiveApplicationFee !== rawApplicationFee) {
  logger.warn({ raw_fee, amount, drawdown }, 'clamped application_fee_amount');
}
```

**Rule:** Whenever `application_fee_amount` is computed from independent components (base, tip, commission), clamp to actual charge amount. The clamp is a safety net for combinations that overflow. Log the clamp event so reconciliation can detect mis-priced charges (e.g., a rare clamp = study; a frequent clamp = pricing model bug).

**Generalize:** Any external API field with documented bounds (Stripe `application_fee_amount ≤ amount`, max metadata key length, max array size) needs both clamping AND logging when the clamp engages — invisible clamping hides pricing-model bugs.

### CC42. Drift detection cardinality matches available source-of-truth
**Pitfall caught by Sage S18 H1:** Track C's drift Leg 4 was specced to return per-refund granularity (`refund_id`, `payment_intent_id`, `studio_id`, `missing_jurisdictions`). But there's no `stripe_refunds` table in our schema — refunds aren't mirrored locally yet. SQL has no source for `refund_id`, so it emitted `''` (empty string) or omitted the field entirely. TS contract claimed `refund_id: string` non-null → contract drift.

**Fix:** drop `refund_id` from contract type, accept per-charge granularity as the cardinality (a charge with multiple partial refunds collapses to one drift row). Add a comment in both the contract type AND SQL function noting the limitation. Plan for true per-refund granularity in a later sprint when `stripe_refunds` table lands.

**Rule:** Drift detection cardinality is bounded by the source-of-truth tables available. Don't claim per-X granularity if X isn't mirrored in DB. Either:
1. Accept lower cardinality (per-charge instead of per-refund) and document.
2. Add the source-of-truth table first, THEN do the drift detection.

**Generalize:** Contract types must match what the SQL actually emits. If Sage detects a field claimed in TS but absent in SQL, that's contract drift — fix one side or the other before commit.

### CC43. Multi-mode toggle UX with editorial copy
**Pattern from Track A's `TipPoolToggle`:** When a setting has two named modes (not just on/off), use radio cards with explanatory copy, not a simple Switch toggle:

- Each mode has: **Onyx headline name** (e.g., "Direct to artist") + **Stone body copy** explaining what the mode does + when to choose it.
- Onyx primary "Save" CTA enables only when dirty.
- Stone-tinted toast on save: "Tip routing updated." (no exclamations)
- No emojis. No "Amazing!".

**Rule:** Settings UX with named modes deserves named cards, not toggles. Toggle = "this thing is on/off." Radio cards = "you have two valid choices; here's what each does." For brand-compliant InkOS surfaces, this matches the editorial tone — no UX shortcuts.

**Generalize:** Any binary setting where both states are valid business choices (not "feature on/off") gets multi-mode UX. Sage + brand-guardian flag any unjustified Switch component used for multi-mode settings.

---
*Tip Routing + Refund Tax Reversal (Plan-S18) appendix added 2026-04-30. Files touched: 14 (5 parallel tracks A/B/C/D/E with Track B applied directly after agent stuck in plan mode) + 2 (Sage fix tracks H1 contract drift + H2 fee clamp). Sage verdict: APPROVE-WITH-FIXES → APPROVE after H1 (drop `refund_id` from `RefundMissingTaxReversal` contract type + cron interface, accept per-charge granularity) + H2 (`Math.min(rawApplicationFee, amountChargedCents)` clamp with warn log) all folded into S18 commit. Symmetric ledger accrual/release pair complete. 4-leg drift surface live. Refund flow now reverses parent split + per-tax-line children + tax_remittance_ledger atomically (with reconciliation safety net). Real money round-trip production-ready.*

---

## Appendix — Stripe Tax Integration Sprint (Plan-S19, 2026-04-30)

> **Scope:** Largest sprint of EPIC 1 — invoice-backed flow + tax registrations CRUD + refund mirror table + EU OSS quarterly export. **5 parallel tracks (A/B/C/D/E) + Sage audit + 1 Critical fix.** 1335-line migration. ~22 files touched.

### CC44. Invoice-backed flow for Stripe Tax — `automatic_tax` lives on Invoice, not PaymentIntent
**Architecture pivot:** Stripe SDK v22 removed `automatic_tax: { enabled: true }` from `PaymentIntent.create` params. The same flag IS available on `Invoice.create`. To get authoritative `tax_breakdown[]` populated by Stripe Tax automatically, must route through Invoice → finalize → pay flow.

**Flow:**
```
1. stripe.invoices.create({ automatic_tax: { enabled: true }, application_fee_amount, transfer_data, ... })
2. stripe.invoiceItems.create per line (base + tip + drawdown as negative)
3. stripe.invoices.finalizeInvoice(id) — Stripe computes tax, creates underlying PaymentIntent
4. stripe.invoices.pay(id, { off_session: true }) — confirms PI server-side
5. Mirror invoice in stripe_invoices via RPC.STRIPE_INVOICE_RECORD (throws on failure — CC29)
```

**Branching pattern (S20+):**
- Studio HAS active tax registrations → Invoice flow (Stripe Tax computes per registered jurisdiction)
- Studio HAS NO registrations → direct PaymentIntent flow (existing S16/S18 path, manual tax handling)

`studioHasActiveTaxRegistrations(supabase, studioId)` helper exported from `lib/stripe/charges.ts` for branch decision. S19 ships helper + flow; S20 wires the branch.

**Rule:** External SDK feature regressions across major versions can force entire architectural pivots. For S19, the pivot was charge → invoice. Document the trigger (SDK v22 removed flag) so future sprints understand WHY the flow exists.

### CC45. Stripe Tax registrations are per-connected-account — mirror to DB for fast reads
**Pattern from Track C:** Stripe stores tax registrations on the connected account: `stripe.tax.registrations.list({ status: 'all', limit: 100 }, { stripeAccount: connectedAccountId })`. Each entry has `country`, `country_options.us.state` (for state-level), `active_from`, `expires_at`, `status` (computed from dates).

**Sync flow:**
1. List from Stripe via `stripeAccount` header.
2. For each: compute `jurisdiction = state ? '${country}-${state}' : country` (uppercase ISO 3166-1 alpha-2).
3. Compute `status` from active_from + expires_at vs now: `'scheduled' | 'active' | 'expired'`.
4. Mirror to `stripe_tax_registrations` via `RPC.STRIPE_TAX_REGISTRATION_RECORD` (UPSERT on `(studio_id, registration_id)`).

**Rule:** External per-account Stripe data (registrations, tax IDs, customer payment methods) must be mirrored to local DB for two reasons: (1) fast UI reads without per-page Stripe API calls, (2) drift detection via reconciliation. Sync via opt-in admin "Refresh from Stripe" button + automatic sync on every onboarding event.

**`coerceRegistrationStatus` defensive fallback:** unknown Stripe status values default to `'active'` + log warn. If Stripe introduces a new lifecycle state, fail-soft instead of crash. Track audit trail in lessons.

### CC46. Four-table tax stack — full lifecycle traceable
**Pattern reinforced over S13/S15/S17/S18/S19:**

```
stripe_tax_registrations  — jurisdiction config (S19)
tax_remittance_ledger     — accrual on charge succeeded (S13)
tax_remittance_releases   — re-credit on refund (S18)
stripe_refunds            — refund mirror for true per-refund granularity (S19)
```

Plus the commission_splits hierarchy from S13/S17/S18:
```
commission_splits.kind = 'split' (parent base+tip artist payout)
                       = 'tip' (tip-only row when pool mode)
                       = 'tax_line' (per-jurisdiction tax attribution child)
                       = 'reversal' (refund-driven negation, encoded refund_id in tax_line_id)
                       = 'adjustment' (manual ledger correction)
```

**Drift_check** has 4 legs covering every gap between these tables. Reconciliation cron runs hourly; warn log surfaces drift counts + sample IDs.

**Rule:** Tax/payment ledger work cumulative across sprints. Each new feature adds a table OR a column OR a kind enum value AND a corresponding drift detection leg. Never ship the table without the drift leg. Sage caught CC34 (Leg 3) + S18 H1 (Leg 4 cardinality) + S19 H1 (Leg 4 per-refund granularity) — repeated reinforcement that gaps in detection compound silently.

### CC47. Per-refund Drift granularity requires `stripe_refunds` source-of-truth
**Pitfall caught by Sage S18 H1 + closed by S19 Track B:** S18 Leg 4 emitted `refund_id: ''` empty placeholder because no `stripe_refunds` table existed. S18 had to drop `refund_id` from contract type. S19 added the table → Leg 4 rewritten to drive off `stripe_refunds`, `refund_id` restored to contract.

**Generalize:** Drift detection cardinality is bounded by source-of-truth tables. When an entity X drives a derivative entity Y, a drift detector for Y must also have access to X. If X isn't mirrored locally, drift detection collapses to one cardinality higher (per-charge instead of per-refund).

**Rule:** If you need per-X drift detection, add an X mirror table FIRST. Don't defer the table — defer the FEATURE that depends on the table. Sage will catch it eventually anyway.

### CC48. RPC return jsonb shape MUST match contract `*Result` type — Sage greps both
**Critical caught by Sage S19 C1:** `tax_oss_quarterly_export` RPC SQL emitted `total_eu_tax_cents` (single field) but contract declared `total_eu_collected_cents` + `total_eu_outstanding_cents` (two fields). RPC was missing per-jurisdiction `amount_outstanding_cents` field too. CSV builder read all three undefined → corrupted output for the most-used field.

**Fix shipped:** new migration `20260511100000_payments_l2_tax_oss_export_fix.sql` drops + recreates the RPC with correct shape, adds `amount_outstanding_cents = collected - remitted` computation, adds top-level totals.

**Rule:** Every RPC return `jsonb_build_object(...)` must be cross-referenced field-by-field against the contract `*Result` interface. Sage scan: grep `jsonb_build_object` keys in migration + grep contract type fields. Diff must be empty.

**Generalize:** This is a specialization of CC1 (contract-first). Contract-first PREVENTS param drift (RPC inputs); RPC-output-vs-contract grep PREVENTS return drift. Add to sprint Sage audit checklist for every migration that creates a `RETURNS jsonb` function.

### CC49. EU-27 jurisdiction filter pattern + canonical encoding
**Pattern from Track B:** EU member jurisdictions can appear in two encodings:
- Canonical: `'EU-DE'` (prefix discriminator)
- Country-only: `'DE'` (when no state-level tax)

Filter SQL: `(jurisdiction LIKE 'EU-%' OR substring(jurisdiction, 1, 2) = ANY(v_eu_codes))` where `v_eu_codes` is a 27-element array of post-Brexit EU member ISO codes (no GB, no Switzerland, no Norway).

**Rule:** When jurisdiction encodings can vary across producers (manual seeding, Stripe Tax responses, legacy data), filter clauses must accept both forms. Document the canonical form in contracts.ts and migrate non-canonical rows in a separate cleanup sprint.

### CC50. CSV admin export pattern — 5-layer gate + Content-Disposition attachment
**Pattern from Track D:** Admin-only CSV export endpoints follow this shape:

```
1. requirePlatformAdmin(req) → 401 if anon, 403 if non-admin
2. adminExportRatelimit.limit(ip) → 429 if rate-limited (5/60s for manual review)
3. Zod body validation (year/quarter/studioId) → 400 on invalid
4. Service-role supabase client + RPC call (read-only, STABLE)
5. Build CSV from typed Result; emit Content-Disposition: attachment; filename="<resource>-<id>-<period>.csv"
6. logAuditAction(userId, 'admin_<resource>_export', { studio_id, period }) before return
```

**Audit log + Content-Disposition** are non-negotiable on financial admin endpoints — both leave a trail (DB row + browser download history) that ties the admin to the action.

**CSV escape:** S19 fields are bounded (ISO codes, integers, enum) → naive `.join(',')` safe. Add RFC 4180 quote-escape if free-text fields appear (notes, descriptions).

**Rule:** Any admin-only data export gets all 5 layers. Skip rate limit and audit-log surfaces a security gap that Sage will flag immediately.

---
*Stripe Tax Integration (Plan-S19) appendix added 2026-04-30. Files touched: 22 (5 parallel tracks A/B/C/D/E) + 1 (Sage Critical fix C1: tax_oss_quarterly_export RPC return shape match). Migration line count: 1335 + 100 = 1435 SQL lines across 2 files. Sage verdict: BLOCK → APPROVE after C1 (RPC return shape match contract — added amount_outstanding_cents per jurisdiction + total_eu_collected_cents + total_eu_outstanding_cents top-level) folded into S19 commit. Stripe Tax foundation production-ready: registrations CRUD + Invoice flow scaffolding (branching wiring deferred to S20 per Track A note) + per-refund drift Leg 4 + EU OSS quarterly CSV export. Track A `studioHasActiveTaxRegistrations` exported but unwired — must be wired in S20 alongside 1099-NEC work.*
