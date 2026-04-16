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

When a sprint's build partially failed (e.g., missing column caused a 500), Rex dispatched a fix agent that first checked what was already built and correct, then surgically fixed only the broken parts. Avoids the temptation to rewrite entire files.

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
