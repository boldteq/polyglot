---
name: ConvertScan (CROBOT)
description: AI-powered CRO audit SaaS -- users paste a URL, get instant scored analysis with AI suggestions to boost conversions
type: project
stack: Stack A-Lovable (React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase + React Query + React Router)
status: active -- MVP features + admin + Dodo billing + UI redesign + navigation overhaul complete, migrations applied, blocking on env vars for edge function deployment
---

## Project Overview

ConvertScan is a CRO (Conversion Rate Optimization) audit tool. Users paste a URL and get an instant, scored analysis across 7 CRO pillars with specific AI-generated suggestions to boost conversions.

**Target market:** SMBs who need CRO analysis but can't afford enterprise tools ($5k+/mo) and are unsatisfied with free garbage tools.

**Billing:** Dodo Payments (NOT Stripe). See decision in project-level memory `project_billing.md`.

**Admin panel:** Ships alongside user app at `/admin/*` routes, same codebase. See `project_admin.md` for strategy.

---

## Architecture Decisions

### system_config Table for Admin-Controlled Config
**Date:** 2026-04-05
**Decision:** Use a single `system_config` table (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ) for all admin-controlled configuration: feature flags, plan limits, pillar weights.
**Why:** Simple key/value store, RLS-protected (admin/super_admin only), single source of truth. Avoids separate tables for each config type. JSONB allows flexible schema per key.
**Tradeoff:** No schema validation at DB level (JSONB is schemaless) -- validation happens in the hooks.

### Feature Flags: DB-Backed, Not localStorage
**Date:** 2026-04-05
**Decision:** Migrated feature flags from localStorage to `system_config` table.
**Why:** localStorage flags are not shared across sessions, devices, or users. Admin toggling a flag in localStorage only affects their browser. DB-backed flags are global and immediate.
**Implementation:** Admin hook (`useFeatureFlags`) reads/writes with short staleTime (60s). App hook (`useFeatureFlag(key, defaultValue)`) reads with long staleTime (5min), never throws, returns defaultValue on error/loading.

### Dual Query Key Invalidation for Config
**Date:** 2026-04-05
**Decision:** On mutation success, invalidate both `['admin', 'feature-flags']` AND `['feature-flags']` query keys.
**Why:** Admin hooks use `['admin', 'feature-flags']` namespace. App-level hooks use `['feature-flags']` without admin prefix. Both need fresh data after a flag changes.

### SQL Migrations as Comments in Hook Files
**Date:** 2026-04-05
**Decision:** SQL CREATE TABLE statements embedded as JSDoc comments at the top of hook files (e.g., `use-feature-flags.ts` has the `system_config` CREATE TABLE).
**Why:** Supabase projects without automated migration tooling need SQL docs somewhere. Keeping them next to the code that uses the table ensures they stay discoverable and up-to-date.

### Hash-Based Teaser Scores for Guest Gate Wall
**Date:** 2026-04-05
**Decision:** Unauthenticated users see a simulated scan animation (no API calls) followed by a gate wall with a teaser score. The score is deterministic based on the URL string (charCode sum % range + base = 45-72 range).
**Why:** Same URL always produces the same teaser score -- feels real and consistent. No API cost for unauthenticated users. Score range is deliberately mediocre (45-72) to motivate signup ("your site needs work").

---

## Key Patterns Used

### ScanGateWall (Free Scan Flow)
- `ScanGateWall` component at `src/components/shared/ScanGateWall.tsx`
- Full 7-step scan animation plays (visual only, no API calls)
- Teaser score shown in `ScoreRing` component
- Pillar breakdown shown but blurred with CSS `blur-sm` + Lock icon overlay
- CTA: "Create Free Account" links to `/signup?redirect=/scan&url=...`
- Feature flag `free_scan_enabled` controls whether this flow is available

### FindingCard AI Suggestion Gating
- Free users: AI suggestion section blurred (`blur-sm` + Lock icon + "Upgrade" CTA)
- Pro/Agency users: full suggestion visible with copy-to-clipboard button
- Plan check via `useProfile()` hook

### Bulk Admin Operations
- Checkbox multi-select in Users table
- Bulk action bar appears when selections exist
- `useBulkChangePlan` + `useBulkResetScans` hooks
- Pattern: `Promise.all()` for individual updates + single audit log entry with `metadata: { user_ids, count }`
- Cache invalidation after bulk ops: `['admin', 'users']`

### Google Favicon API
- URL: `https://www.google.com/s2/favicons?domain={domain}&sz=32`
- Fallback: Globe SVG icon on `img onError` event
- Used in Reports page for site icons next to scan URLs

### Dashboard At-Limit State
- When `scansUsed >= scanLimit`: amber warning banner + disabled URL input + "Upgrade Plan" button
- Prevents wasted API calls when user is already at limit

### Settings Billing Tab
- Plan card with gradient background, colored tier badges
- Usage progress bar (scansUsed / scanLimit)
- Plan comparison table shown only for free users (drives upgrades)
- Billing history empty state for users without payment history

---

## Bugs Encountered

### Duplicate Import Crash (Koda)
**Date:** 2026-04-05
**What:** Koda appended `import { ChevronRight } from "lucide-react"` at the bottom of `Users.tsx` even though it was already imported at the top of the file.
**Impact:** SyntaxError -- duplicate identifier crashed the app (blank screen).
**Fix:** Removed the duplicate import.
**Prevention:** After Koda edits heavily modified files, check for duplicate imports. This is a known Koda failure mode when making many edits to the same file in a single session.

### Empty String SelectItem Crash (Radix UI)
**Date:** 2026-04-05
**What:** `<SelectItem value="">` passed to Radix UI Select component. Radix forbids empty string as SelectItem value.
**Impact:** Runtime crash -- component fails to render.
**Fix:** Used `"all"` as sentinel value for "select all" option, mapped back to empty string in `onValueChange`.
**Prevention:** Never use empty string for Radix UI SelectItem values. Always use a non-empty sentinel.

---

## Files of Note (Session Additions)

### User-Facing Features
- `src/components/shared/ShareScoreModal.tsx` -- viral share card (Twitter/LinkedIn/copy-link)
- `src/components/shared/ScanGateWall.tsx` -- free scan teaser gate wall
- `src/components/shared/FindingCard.tsx` -- modified for blur gate on AI suggestions

### Admin Features
- `src/hooks/use-feature-flag.ts` -- app-level feature flag hook (silent fallback)
- `src/hooks/admin/use-feature-flags.ts` -- admin flag management (read/write, FLAG_DEFINITIONS)
- `src/hooks/admin/use-admin-system.ts` -- plan limits + pillar weights editors
- `src/hooks/admin/use-admin-actions.ts` -- bulk operations (useBulkChangePlan, useBulkResetScans)
- `src/pages/admin/AdminDashboard.tsx` -- enhanced with 4 KPIs, User Growth AreaChart, Scan Volume BarChart
- `src/pages/admin/System.tsx` -- plan limits + pillar weights editors (super_admin only)
- `src/pages/admin/Support.tsx` -- ticket system with tabs + expandable accordion
- `src/pages/admin/Users.tsx` -- bulk operations, SelectItem fix
- `src/pages/admin/Scans.tsx` -- retry failed scans

---

## Current State (as of 2026-04-06, session 7)

**Completed:**
- Full AI scan engine (Claude Vision + Text analysis via Supabase Edge Functions) -- code-complete, not yet deployed
- 7 CRO pillars with weighted scoring algorithm
- Auth (Google OAuth + email/password via Supabase)
- 7 database tables with RLS -- **migrations applied to Supabase project `hyxlmmkrbipufoqkkhba`**
- Admin role set for boldteq@gmail.com
- React Query hooks for all data operations
- PDF report generation (client-side jsPDF)
- Email service (Resend: welcome, scan_complete, weekly_digest)
- Admin panel: 10 sections (Dashboard, Users, Scans, Audit Log, Billing, System, Feature Flags, Integrations, Support)
- Bulk user operations (change plan, reset scans)
- DB-backed feature flags with admin UI + app-level silent fallback hook
- Dynamic plan limits + pillar weight editors (super_admin only)
- Support ticket system (user-facing + admin management)
- Free scan gate wall for unauthenticated users
- AI suggestion gating (blur for free, full for Pro/Agency)
- Share score modal (Twitter/LinkedIn/copy-link)
- Dashboard at-limit state
- Landing page with functional URL input
- Settings billing tab with plan comparison, usage bar
- TopBar: Linear/Vercel-grade dropdowns (notifications, user menu)
- Dodo Payments billing (fully migrated from Stripe 2026-04-06)
  - 3 edge functions: dodo-checkout, dodo-webhook, dodo-portal
  - DB migration: stripe_customer_id/stripe_subscription_id -> dodo_customer_id/dodo_subscription_id
  - Frontend hooks: use-billing.ts calls dodo-checkout/dodo-portal
  - Admin Integrations page shows Dodo Payments card
  - Legal pages (Terms, Privacy) updated to reference Dodo Payments
- Admin Integrations page (central hub for all platform service connections)
- **Admin Integrations redesign** (tabbed detail panel, 6 brand SVG icons, copy-to-clipboard, accent borders, dot-style status badges) -- 2026-04-06 session 5
- **Production-grade UI redesign** (48 files, warm neutral palette, Inter font, shadow-soft, backdrop blur) -- commit `8996e2d`
- **BrandIcon bug fixed** (undefined placeholder component replaced with ScanLine) -- commit `10f68f1`
- **UI Modernization v2** (42 files, 2 commits: `4b2c649` + `e859380`) -- 5-phase visual refresh: --radius 0.75rem, shadow-soft system, border-border/40, semantic color tokens, custom animations, PageHeader typography, badge variants, Reports card-to-table, staggered KPI entrance, tab styles (underline settings / pill content), sidebar active indicators, auth gradients, ScoreRing backdrop. Zero deps added, zero functionality changes. 16 patterns extracted to `~/.claude/memory/patterns/good/ui-redesign-shadcn.md`. -- 2026-04-06 session 6
- **Sidebar & Navigation Overhaul** (3 files, 7 commits: `6242975` through `a3300d3`) -- AdminLayout.tsx fully refactored from custom `<aside>` to shadcn `Sidebar` + `SidebarProvider`. AppSidebar.tsx: fixed active icon color (text-white not text-primary), removed dead nav items (AI Agents), removed duplicate nav (Admin Panel, Settings), improved icon sizing/spacing, fixed collapsed state. TopBar.tsx: removed duplicate Settings from dropdown. 10 patterns extracted to `~/.claude/memory/patterns/good/sidebar-patterns.md`. -- 2026-04-06 session 7

**BLOCKING -- Env Vars Not Set as Supabase Secrets:**
These must be configured in Supabase > Edge Functions > Secrets before any edge function works:
- `ANTHROPIC_API_KEY` -- required for analyze-url AI pipeline
- `SCREENSHOTONE_ACCESS_KEY` or `SCREENSHOT_SERVICE_URL` + `SCREENSHOT_SERVICE_API_KEY` -- required for screenshots
- `PAGESPEED_API_KEY` -- required for PageSpeed Insights pillar

**Still Needed -- Infrastructure:**
- Edge functions deployment (analyze-url, pagespeed, dodo-checkout, dodo-webhook, send-email)
- Screenshot service setup (Railway Puppeteer or ScreenshotOne API)
- Supabase Storage `screenshots` bucket creation
- Production DNS + Vercel deployment
- Real Dodo Payments account + webhook configuration
- Monitoring / error tracking (Sentry or equivalent)

**Still Needed -- Code Fixes:**
- Landing.tsx: URL submit should route unauthenticated users to `/signup?redirect=/scan&url=...`
- Scan.tsx: should pre-fill URL from query parameter when redirected from landing/signup
- SEO meta tags for public pages
- Onboarding flow for new users
- End-to-end testing of actual scan flow with live AI

**Cleanup Needed (post-migration technical debt):**
- `src/lib/stripe.ts` dead file still exists (imports removed package, nothing references it)
- Old Stripe edge functions still exist: `stripe-checkout/`, `stripe-webhook/`, `stripe-portal/`
- Project CLAUDE.md still references Stripe in some places
- Pro plan scan_limit discrepancy: webhook handler sets pro=50, CLAUDE.md says 25 -- needs resolution

**Agent Hub pages:** Removed (was UI demo only with mock data). Clean deletion in commit c498749.

**MVP Plan Reference:** `~/.claude/plans/majestic-percolating-planet.md`

---

*(Updated by Mira -- 2026-04-06, session 7: Sidebar & Navigation Overhaul -- 10 patterns extracted to sidebar-patterns.md)*
