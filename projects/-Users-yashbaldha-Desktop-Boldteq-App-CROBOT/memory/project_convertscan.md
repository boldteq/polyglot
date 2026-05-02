---
name: ConvertScan (CROBOT) -- Full Project State
description: AI-powered CRO audit SaaS. Complete project status, architecture decisions, what's built, what's pending.
type: project
stack: Stack A-Lovable (React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase + React Query + React Router)
status: active -- MVP features + admin panel deep features + Dodo Payments migration complete
last_updated: 2026-04-06
---

## Project Overview

ConvertScan is a CRO (Conversion Rate Optimization) audit tool. Users paste a URL and get an instant, scored analysis across 7 CRO pillars with specific AI-generated suggestions to boost conversions.

**Target market:** SMBs who need CRO analysis but can't afford enterprise tools ($5k+/mo) and are unsatisfied with free garbage tools.

**Billing:** Dodo Payments (NOT Stripe). Migration from Stripe completed 2026-04-06. See `project_billing.md`.

**Admin panel:** Ships alongside user app at `/admin/*` routes, same codebase. See `project_admin.md`.

---

## Architecture Decisions

### system_config Table for Admin-Controlled Config
**Date:** 2026-04-05
**Decision:** Single `system_config` table (key TEXT PK, value JSONB, updated_at TIMESTAMPTZ) for all admin-controlled configuration: feature flags, plan limits, pillar weights.
**Why:** Simple key/value store, RLS-protected (admin/super_admin only), single source of truth. Avoids separate tables for each config type. JSONB allows flexible schema per key.
**Tradeoff:** No schema validation at DB level (JSONB is schemaless) -- validation happens in the hooks.
**Cross-ref:** Pattern documented in `project_patterns.md` and `~/.claude/memory/projects/crobot.md`.

### Feature Flags: DB-Backed, Not localStorage
**Date:** 2026-04-05
**Decision:** Feature flags live in `system_config` table, not localStorage.
**Why:** localStorage flags are not shared across sessions, devices, or users. Admin toggling a flag in localStorage only affects their browser. DB-backed flags are global and immediate.
**Implementation:**
- Admin hook (`useFeatureFlags`): reads/writes `system_config` with short staleTime (60s)
- App hook (`useFeatureFlag(key, defaultValue)`): reads with long staleTime (5min), never throws, returns defaultValue on error/loading
- On mutation: invalidate both `['admin', 'feature-flags']` AND `['feature-flags']` query keys

### SQL Migrations as Comments in Hook Files
**Date:** 2026-04-05
**Decision:** SQL CREATE TABLE statements embedded as JSDoc comments at the top of hook files.
**Why:** Supabase projects without automated migration tooling need SQL docs somewhere. Keeping them next to the code that uses the table ensures they stay discoverable and up-to-date.

### Hash-Based Teaser Scores for Guest Gate Wall
**Date:** 2026-04-05
**Decision:** Unauthenticated users see a simulated scan animation (no API calls) followed by a gate wall with a teaser score. Score is deterministic based on URL string (charCode sum % range + base = 45-72 range).
**Why:** Same URL always produces the same teaser score -- feels real and consistent. No API cost for unauthenticated users. Score range deliberately mediocre (45-72) to motivate signup.

### TopBar: Linear/Vercel-Grade Design
**Date:** 2026-04-06
**Decision:** TopBar uses shadcn DropdownMenuTrigger with `asChild` pattern for custom trigger elements. Notifications dropdown with empty state. User dropdown with plan badge and role-based items.
**Why:** Previous TopBar had import abstraction mismatches (DropdownMenuPrimitive.Trigger from Radix mixed with shadcn DropdownMenu components) and hardcoded breadcrumb labels.

### Stripe to Dodo Payments Migration
**Date:** 2026-04-06
**Decision:** Completed full migration from Stripe to Dodo Payments.
**What changed:** `use-billing.ts` now references `dodo-checkout` and `dodo-portal` edge functions. `@stripe/stripe-js` removed from package.json. Database columns renamed from `stripe_*` to `dodo_*`. CLAUDE.md still references Stripe in some places (documentation lag).

### Production-Grade UI Redesign
**Date:** 2026-04-06
**Decision:** Full UI redesign across 48 files. Refined design system: warm neutral palette, custom `shadow-soft`, Inter font, antialiasing enabled globally. Sidebar, TopBar, and AdminLayout received tighter spacing and backdrop blur header. All pages updated for consistent visual language.
**Commit:** `8996e2d`
**Why:** Previous UI was functional but not premium. Redesign brings visual quality to Linear/Vercel/Stripe tier. Consistent design tokens applied across all components.

### Admin Integrations Redesign: Tabs + Brand Icons + Accent Borders
**Date:** 2026-04-06
**Decision:** Redesigned Admin Integrations page from vertical info dump to tabbed detail panel (Overview | Configuration | Setup Guide) with inline SVG brand icons, copy-to-clipboard env var names, left-border accent colors per category, and dot-style status badges.
**Why:** Previous version stacked all information (description, env vars, setup steps) in a single CollapsibleContent, making expanded cards too tall and hard to scan. Tabbed layout lets admins jump directly to Configuration or Setup Guide. Brand SVGs provide instant visual recognition (generic Lucide icons are indistinguishable at small sizes). Left-border accents provide color-coded context when multiple cards are expanded.
**Implementation details:** `React.FC<{ className?: string }>` type for brand icons (not `React.ElementType`). `CATEGORY_STYLE` lookup map for icon backgrounds (white for colorful logos, dark for Resend). `CopyButton` with `e.stopPropagation()` to prevent Collapsible toggle. `StatChip` danger variant renders neutral when count=0 (prevents alarm fatigue).
**Cross-ref:** Full pattern in `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.

### Supabase Migrations: Manual Application via SQL Editor
**Date:** 2026-04-06
**Decision:** All 4 SQL migrations (001_schema, 002_rls, 003_triggers, 004_admin_rbac) were combined into a single SQL block and executed manually in Supabase SQL Editor. Migrations had never been applied -- the project had zero public tables despite migration files existing.
**Why:** Lovable does not auto-apply `supabase/migrations/` files. The Supabase CLI `db push` requires local Docker setup. For remote-first Supabase projects, the SQL Editor is the fastest path. Combining migrations avoids dependency ordering issues.
**Important:** Admin role backfill (`UPDATE profiles SET role = 'admin' WHERE email = 'boldteq@gmail.com'`) was included in the same execution block.

---

## Database Tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `profiles` | User profiles with plan/billing info, role column for RBAC | Yes -- user can read/update own |
| `scans` | Audit scan records | Yes -- user owns their scans |
| `scan_results` | Per-pillar results with findings JSONB | Yes -- via scan ownership |
| `integrations` | Third-party service connections | Yes |
| `system_config` | Admin key/value config (flags, limits, weights) | Yes -- admin/super_admin only |
| `support_requests` | Support tickets from users | Yes -- user sees own tickets, admin sees all |
| `audit_logs` | Admin action audit trail | Yes -- admin read-only |

---

## The 7 CRO Pillars

| # | Pillar | Weight | Key |
|---|--------|--------|-----|
| 1 | Value Proposition | 18% | value_proposition |
| 2 | CTA Effectiveness | 20% | cta_effectiveness |
| 3 | Trust Signals | 17% | trust_signals |
| 4 | Visual Hierarchy | 12% | visual_hierarchy |
| 5 | Mobile Experience | 13% | mobile_experience |
| 6 | Content & Copy | 11% | content_copy |
| 7 | Page Performance | 9% | page_performance |

Weights are editable by super_admin via System page. Must sum to 100% -- validated client-side before save.

---

## Pricing Tiers

| Tier | Price | Scans/mo | Features |
|------|-------|----------|----------|
| Free | $0 | 3 | Basic score, top 3 suggestions, blurred AI rewrites |
| Pro | $49/mo | 25 | All suggestions, AI rewrites, PDF export, monitoring |
| Agency | $199/mo | 500 | White-label, multi-client, API access |

Plan limits editable by super_admin via System page. Billing via Dodo Payments.

---

## Routes

### Public
- `/` -- Landing page (hero with URL input)
- `/login`, `/signup`, `/auth/callback` -- Auth flow
- `/forgot-password`, `/reset-password` -- Password recovery
- `/pricing` -- Public pricing page
- `/privacy`, `/terms` -- Legal

### Authenticated (inside AppLayout)
- `/dashboard` -- KPI cards, recent scans, charts, at-limit state
- `/scan` -- New scan submission (or ScanGateWall for guests)
- `/reports` -- Scan history grid (Google favicons)
- `/reports/:id` -- Full audit report (7 pillars)
- `/integrations` -- Third-party integrations
- `/settings` -- Account, billing tab, support tab

### Admin (inside AdminLayout, requires admin/super_admin role)
- `/admin` -- Dashboard (4 KPIs, User Growth AreaChart, Scan Volume BarChart)
- `/admin/users` -- User management with bulk ops
- `/admin/users/:userId` -- User detail
- `/admin/audit-log` -- Admin action audit trail
- `/admin/scans` -- All scans with retry failed
- `/admin/billing` -- Billing overview
- `/admin/system` -- Plan limits + pillar weights editors (super_admin)
- `/admin/flags` -- Feature flags management
- `/admin/integrations` -- Platform integrations (Dodo, Supabase, Resend, etc.)
- `/admin/support` -- Support ticket management

---

## Current State (as of 2026-04-06)

### Completed
- Full AI scan engine (Claude Vision + Text analysis via Supabase Edge Functions) -- code-complete, not yet deployed
- 7 CRO pillars with weighted scoring algorithm
- Auth (Google OAuth + email/password via Supabase)
- 7 database tables with RLS -- **migrations now applied to Supabase project `hyxlmmkrbipufoqkkhba`**
- Admin role set for boldteq@gmail.com
- React Query hooks for all data operations
- PDF report generation (client-side jsPDF)
- Email service (Resend: welcome, scan_complete, weekly_digest)
- Admin panel: 10 sections (Dashboard, Users, Scans, Audit Log, Billing, System, Feature Flags, Integrations, Support)
- Bulk user operations (change plan, reset scans)
- DB-backed feature flags with admin UI + app-level silent fallback hook
- Dynamic plan limits + pillar weight editors (super_admin only)
- Support ticket system (user-facing + admin management)
- Retry failed scans (admin)
- CSV user export (admin)
- Free scan gate wall for unauthenticated users
- AI suggestion gating (blur for free, full for Pro/Agency)
- Share score modal (Twitter/LinkedIn/copy-link)
- Dashboard at-limit state
- Landing page with functional URL input
- Settings billing tab with plan comparison, usage bar
- TopBar: Linear/Vercel-grade dropdowns (notifications, user menu)
- Dodo Payments migration complete (no Stripe in codebase)
- **Production-grade UI redesign (48 files, warm neutral palette, Inter font, shadow-soft, backdrop blur)**
- **BrandIcon bug fixed (undefined placeholder component replaced with ScanLine)**
- **Admin Integrations redesign** (tabbed detail panel, 6 brand SVG icons, copy-to-clipboard, accent borders, dot-style status badges)
- **UI Modernization v2** (42 files, 5-phase visual refresh: tokens -> components -> pages -> secondary -> nav shell) -- --radius 0.75rem, shadow-soft, semantic colors, badge variants, Reports card-to-table, staggered KPI animations, underline/pill tab styles, sidebar active indicators, ScoreRing radial backdrop, auth gradients. Zero deps, zero functionality changes. Commits `4b2c649` + `e859380`.

### BLOCKING -- Env Vars Not Set as Supabase Secrets
These must be configured in Supabase > Edge Functions > Secrets before any edge function works:
- `ANTHROPIC_API_KEY` -- required for analyze-url AI pipeline
- `SCREENSHOTONE_ACCESS_KEY` or `SCREENSHOT_SERVICE_URL` + `SCREENSHOT_SERVICE_API_KEY` -- required for screenshots
- `PAGESPEED_API_KEY` -- required for PageSpeed Insights pillar

### Still Needed -- Infrastructure
- Edge functions deployment (analyze-url, pagespeed, dodo-checkout, dodo-webhook, send-email) -- code-complete, not deployed
- Screenshot service setup (Railway Puppeteer or ScreenshotOne API)
- Supabase Storage `screenshots` bucket creation
- Production DNS + Vercel deployment
- Real Dodo Payments account + webhook configuration
- Monitoring / error tracking (Sentry or equivalent)

### Still Needed -- Code Fixes
- Landing.tsx: URL submit should route unauthenticated users to `/signup?redirect=/scan&url=...` (currently may not handle unauthenticated flow correctly)
- Scan.tsx: should pre-fill URL from query parameter when redirected from landing/signup
- SEO meta tags for public pages
- Onboarding flow for new users
- End-to-end testing of actual scan flow with live AI

### MVP Plan Reference
Full MVP execution plan saved at: `~/.claude/plans/majestic-percolating-planet.md`

---

*(Updated by Mira -- 2026-04-06, session 6: UI Modernization v2 -- 5-phase visual refresh, 42 files, 16 patterns extracted)*
