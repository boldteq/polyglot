---
name: Known Antipatterns
description: Patterns that caused problems across Boldteq projects — never repeat these
type: feedback
---

## Cross-Stack Antipatterns

### Security
- **Never** trust client-sent user IDs or shop IDs — always get from authenticated session
- **Never** expose service role keys or secret keys to client-side code
- **Never** skip input validation on API endpoints — always use Zod

### Database
- **Never** run `findMany` without a `where` clause on tables with >1000 rows — causes timeouts
- **Never** use `any` type in TypeScript — masks real type errors that become runtime bugs
- **Never** do database schema changes directly in dashboards for production — always use migrations

### Performance
- **Never** do heavy computation in Remix loaders — they run on every navigation
- **Never** block page render with synchronous external API calls

### Architecture
- **Never** start building without researching competitors — leads to building features nobody wants
- **Never** skip auth or billing on v1 "to add later" — it causes painful retrofits

### Dependencies
- **Never** use `file:` or `link:` local dependencies in package.json — they break in CI/CD, Vercel, Lovable, and any environment that doesn't have the local path. Incident: `@boldteq/agents: file:../claude-hub/sdk` caused `bun install` to treat `.env` as install target and fail silently. If you need shared code, publish to npm or copy the source.
- **Never** reference paths outside the project root (`../`) in package.json dependencies — build environments are isolated.
- **Never** add dependencies to package.json without verifying they install cleanly: `bun install && bun run build` (or `npm install && npm run build`).

### Lovable-Specific
- **Never** restructure a Lovable project's folder layout — Lovable's AI depends on exact paths (`src/pages/`, `src/components/`, `src/hooks/`, `src/lib/`, `src/integrations/supabase/`)
- **Never** use Next.js patterns in Lovable projects — no `app/` directory, no server components, no API routes. It's Vite + React SPA.
- **Never** manually edit `src/integrations/supabase/types.ts` — it's auto-generated. Regenerate with `npx supabase gen types typescript`.
- **Never** create a second Supabase client instance — import from `@/integrations/supabase/client` only.

### Shopify-Specific
- **Never** use Tailwind, shadcn/ui, or custom CSS in Shopify admin apps — Polaris only. Shopify reviewers reject non-Polaris UI.
- **Never** use external payment providers (Dodo Payments, etc.) for Shopify app billing — Shopify Billing API only.
- **Never** query database without shop scope — every Prisma query needs `where: { shop: session.shop }`.
- **Never** skip GDPR webhooks — `customers/data_request`, `customers/redact`, `shop/redact` are mandatory even with zero stored data.
- **Never** add GDPR webhook topics (`customers/data_request`, `customers/redact`, `shop/redact`) to `shopify.app.toml` — they cause deploy error "The following topic is invalid". Configure them in Shopify Partner Dashboard > App Setup > Privacy instead. (Pinzo, 2026-04-03)
- **Never** use raw HTML elements (`<strong>`, `<em>`, `<div style>`) in Shopify admin routes — use Polaris equivalents: `<Text fontWeight="semibold">`, `<Text tone="subdued">`, `<Box minWidth="X">`. (Pinzo, 2026-04-03)
- **Never** skip CSS sanitization on user-provided custom CSS in widget configs — sanitize both on save (admin) and on render (storefront API). Double-sanitize prevents XSS from either vector. (Pinzo, 2026-04-03)
- **Never** hardcode admin-specific values (shop domains, chat widget tokens) in source code — use environment variables and `.env.example`. These leak into version control and break multi-environment deploys. (Pinzo, 2026-04-03)
- **Never** forget to delete ALL shop-scoped models in `shop/redact` and `app/uninstalled` webhook handlers — audit every Prisma model with a `shop` field. Missing models = GDPR compliance gap. (Pinzo, 2026-04-03)
- **Never** run `prisma migrate dev` when migration history is drifted on the production database — use `prisma db push` to sync schema without creating a new migration. `migrate dev` fails when drift is detected. (Pinzo, 2026-04-03)

---

## Agent Output Antipatterns (Crobot Incident — 2026-04)

These patterns were discovered when agents reported "done" on the Crobot project but the app was not functional. **Every agent must verify against these before claiming completion.**

### Redesign Agent Placeholder Components (NEW — 2026-04-06)
- **Never** use a component name that doesn't exist in the project or its dependencies — redesign agents sometimes invent placeholder names like `BrandIcon`, `LogoIcon`, `AppIcon` that "look right" but are not real components. The build may still pass if the undefined reference doesn't trigger a strict TypeScript error.
- **Never** assume an icon exists in lucide-react without checking — the library has 1400+ icons but agents still invent names that aren't in it. After a redesign: `grep -rn "BrandIcon\|PlaceholderIcon\|CustomIcon\|LogoIcon\|AppIcon" src/`
- **Never** skip `npm run build` after a UI redesign touching 10+ files — this is the minimum verification. Also run `npm run lint` to catch unused/undefined imports.
- **Root cause:** When redesign agents rewrite UI across many files in one session, they lose track of which components are real imports vs. conceptual placeholders. The agent "thinks" of a brand icon concept and writes `BrandIcon` instead of picking an actual icon like `ScanLine` from lucide-react.
- **Incident:** CROBOT, 2026-04-06. `BrandIcon` used in Landing.tsx (lines 124, 727) — never imported, doesn't exist. Fixed by replacing with `ScanLine`. Commit: `10f68f1`.
- **Prevention:** After any redesign of 10+ files, run the Post-Redesign Verification Checklist (documented in CROBOT `project_patterns.md`).

### Supabase Migrations Not Applied (NEW — 2026-04-06)
- **Never** assume Supabase migrations are auto-applied in Lovable-origin projects — they are NOT. Lovable generates migration files in `supabase/migrations/` but never executes them against the Supabase project.
- **Never** skip database table verification after project setup — always check Supabase Dashboard > Table Editor to confirm tables exist.
- **Never** claim a Supabase-backed app is "architecturally complete" without verifying the database has actual tables — code-complete and database-ready are two different states.
- **Root cause:** No workflow step was responsible for applying migrations. The Supabase CLI `db push` requires local Docker. Lovable does not run migrations. The app builds and starts successfully with zero tables — failures are silent runtime errors.
- **Incident:** CROBOT, 2026-04-06. Supabase project `hyxlmmkrbipufoqkkhba` had zero public tables despite 4 migration files existing. All 4 had to be combined and run manually in SQL Editor.
- **Prevention:** Add "verify tables exist in Supabase Dashboard" as a mandatory step after scaffold. For Lovable projects, always manually apply migrations via SQL Editor.

### "Done But Broken" Patterns
- **Never** claim a page is "built" if it returns <500 bytes of content — that's an empty page
- **Never** claim billing is "integrated" if the pricing page shows $0, "TBD", or placeholder prices
- **Never** claim admin panel is "ready" if /admin returns 404 or loads with empty tables
- **Never** claim auth is "working" if the login form renders but doesn't submit or create sessions
- **Never** claim dashboard is "complete" if it shows only empty states with no data fetching logic
- **Never** claim a feature is "done" based solely on the build succeeding — build ≠ functional

### Verification Failures
- **Never** skip functional verification — running `npm run build` is not the same as verifying the app works
- **Never** report "tests pass" if the tests only check compilation, not actual feature behavior
- **Never** deploy without verifying that critical pages load with real content (>minimum byte thresholds)
- **Never** mark a sprint as complete without someone (human or agent) actually navigating to every claimed page

### Architecture Gaps
- **Never** skip admin panel in architecture — every SaaS product needs user management
- **Never** leave pricing/billing as "to be added later" — it's a V1 requirement
- **Never** define pages without specifying what content/components they contain
- **Never** hand off architecture to Koda without a complete page/route map with component details

### Copy/Content Gaps
- **Never** ship pages with "Coming Soon", "Lorem ipsum", "TODO", or "[App Name]" placeholder text
- **Never** leave empty states undefined — every list/table needs an empty state with a call to action
- **Never** ship error messages that just say "Error" — include what happened and what to do next

### Navigation & Layout Bugs (CRITICAL — #1 Recurring Issue Across ALL Projects)

**Full protocol:** `~/.claude/memory/patterns/good/layout-navigation-consistency.md`

**The core rule: EVERY authenticated page MUST be wrapped in a shared layout with sidebar + header. No exceptions.**

- **Never** render an authenticated page without a shared layout wrapper — EVERY page needs sidebar + header. This is the SINGLE MOST COMMON bug agents produce.
- **Never** build a page as a standalone component without importing AppLayout/SidebarLayout — this creates "orphan pages" with no navigation
- **Never** create a page without ALSO adding its sidebar nav link in the SAME commit — pages without nav links are unreachable
- **Never** add a route to App.tsx without verifying the page component uses the layout wrapper — run `grep -rn "SidebarLayout" src/pages/NewPage.tsx` after every new page
- **Never** add a new admin sidebar item without adding the corresponding component to `sectionComponents` — leads to blank tab content
- **Never** hardcode sidebar width differently per page — use a shared layout with consistent sidebar width (w-56)
- **Never** forget sidebar active state — sidebar must highlight the current page/tab
- **Never** skip mobile sidebar testing — sidebar must collapse to drawer on mobile with a trigger button (SidebarTrigger)
- **Never** build Settings, Billing, or Profile pages without the same sidebar as Dashboard — these are the #1 pages where sidebar goes missing
- **Never** claim admin panel is "done" if any sidebar item renders blank content when clicked
- **Never** let sidebar links point to routes that don't exist — every sidebar item must map to a real, rendered page
- **Never** accept "page is done" without verifying sidebar + header render visually — `npm run build` passing does NOT mean layout is correct

**Mandatory post-page-creation check:**
```bash
# Route count vs sidebar link count — must match (minus public pages)
echo "Routes:" && grep -c "path=" src/App.tsx
echo "Pages with sidebar:" && grep -rln "SidebarLayout" src/pages/ | wc -l
```

### Layout Structure Anti-Patterns
- **Never** use `min-h-screen` without `overflow-hidden` on the flex container — causes double scrollbars
- **Never** put the sidebar inside individual page components — sidebar belongs in the shared layout
- **Never** use different header components on different pages — one AppHeader for all authenticated pages
- **Never** skip `overflow-y-auto` on the main content area — content must scroll independently from sidebar
- **Never** forget `h-svh` (or `h-screen`) on the root layout container — prevents proper full-viewport layout

### Sidebar Anti-Patterns (NEW -- 2026-04-06)
**Full patterns:** `~/.claude/memory/patterns/good/sidebar-patterns.md`

- **Never** build a custom `<aside>` element for sidebar navigation when shadcn `Sidebar` + `SidebarProvider` is available — custom aside misses cookie persistence, mobile drawer, tooltips in collapsed mode, and smooth width transitions. (CROBOT session 7: entire AdminLayout custom aside was replaced with shadcn Sidebar)
- **Never** use `text-primary` for active nav icons on a colored/primary background — the icon becomes invisible (same color on same color). Use `text-white` instead. (CROBOT: purple icon on purple `bg-white/10` was invisible)
- **Never** leave a `<Separator>` visible when the element above it is conditionally hidden — creates an orphan line. Gate the separator with the same condition: `{!collapsed && <Separator />}`.
- **Never** duplicate navigation destinations — if Settings is in the sidebar, remove it from the topbar dropdown. If Admin Panel is in the topbar, remove it from the sidebar footer. Each destination appears in exactly one place.
- **Never** add sidebar nav items for pages that don't exist — "AI Agents" was in sidebar but the page was removed. Verify every nav item maps to a real, rendered page.
- **Never** use `bg-primary/8` or other non-standard Tailwind opacity steps — Tailwind only supports 0, 5, 10, 15, 20, 25, etc. `bg-primary/8` silently outputs no CSS. Use `bg-primary/10` or `bg-primary/[0.08]`.
- **Never** use `useSidebar()` state with ternary className for collapsed styling — use `group-data-[collapsible=icon]:*` Tailwind variants instead. The JS approach causes flash; the CSS approach transitions smoothly.
- **Never** build admin sidebar with different component stack than user sidebar — both must use identical shadcn Sidebar components for consistent behavior.

### UI/UX Micro-Bugs (Common in Agent-Built Apps — Zero Tolerance)

**Loading & State Bugs:**
- **Never** show a blank area while data loads — always use Skeleton components matching final layout shape
- **Never** show a raw spinner (Spinner/CircularProgress) as a loading state — use Skeleton instead
- **Never** render a list/table without an empty state — icon + message + CTA button required
- **Never** show an error as just "Error" or "Something went wrong" — include what failed and a retry action
- **Never** leave a form without inline validation errors — red border + error text next to the field

**Button & Form Bugs:**
- **Never** leave an async button without loading state — show spinner + disable during operation
- **Never** allow double-click on submit buttons — disable immediately on first click
- **Never** allow a delete/destructive action without confirmation dialog
- **Never** reset form fields when validation fails — preserve user input
- **Never** submit a form without success feedback — toast.success() with specific message

**Feedback & Notification Bugs:**
- **Never** use window.alert() or window.confirm() — use sonner toast or Dialog component
- **Never** show a generic "Success" toast — say what succeeded ("Project saved", "User invited")
- **Never** show a generic "Error" toast — say what failed ("Failed to save project — please try again")
- **Never** complete a mutation silently — every create/update/delete needs a toast

**Visual Consistency Bugs:**
- **Never** use text-gray-500, bg-blue-600, or any hardcoded color — use theme tokens (text-muted-foreground, bg-primary)
- **Never** mix font sizes for the same purpose — page titles always text-2xl, body always text-sm
- **Never** use inconsistent spacing — gap-4 between cards, space-y-4 in forms, p-6 page padding
- **Never** use font-bold in SaaS UI — use font-semibold for titles, font-medium for labels
- **Never** leave console.log in production components — remove all debug logging

**Responsive Bugs:**
- **Never** use grid-cols-3 or higher without responsive breakpoints (md:grid-cols-3)
- **Never** use fixed pixel widths (w-[400px]) on content that should be flexible
- **Never** hide important functionality behind a breakpoint (must work on mobile)
- **Never** leave tables without horizontal scroll or card-layout fallback on mobile

**Interaction Bugs:**
- **Never** use onClick on a div/span without role="button" and keyboard support
- **Never** leave an interactive element without a hover effect
- **Never** leave an input without a visible focus ring
- **Never** let focus escape a modal/dialog — trap focus and return on close

---

## Package Management Failures (Lovable/Vite Projects)

**The #1 recurring issue.** App goes blank after installing a package. Full protocol: `patterns/good/lovable-package-management.md`

**Banned Patterns:**
- **Never** use `"pkg": "file:../path"` or `"pkg": "link:../path"` in package.json — breaks ALL remote builds (Lovable, Vercel, CI/CD). Incident: `"@boldteq/agents": "file:../claude-hub/sdk"` caused silent bun install failure.
- **Never** install packages with `--force` as a permanent fix — masks dependency conflicts that cause runtime crashes
- **Never** mix package managers — don't use both npm and bun. Pick one, delete the other's lock file.
- **Never** install 5+ packages at once — install one, verify build, then next. Can't isolate breakage otherwise.
- **Never** install Node.js-only packages for browser use — `fs`, `path`, `crypto` don't exist in Vite/browser
- **Never** skip `npm run build` after installing a package — the build catches 90% of issues
- **Never** blindly accept Lovable's auto-fix suggestions — often corrupts `vite.config.ts` (check `base: './'` and plugin list)
- **Never** ignore peer dependency warnings — they become runtime crashes in production
- **Never** modify files in `node_modules/` directly — changes lost on next install

---

## Billing Migration Antipatterns (CROBOT Stripe-to-Dodo, 2026-04-06)

### Incomplete Migration Cleanup
- **Never** claim a billing migration is "complete" without verifying dead files are removed -- `src/lib/stripe.ts` was left as a dead file importing a removed package. Nothing broke because nothing imported it, but it creates confusion for future developers.
- **Never** leave old provider edge functions alongside new ones -- `stripe-checkout/`, `stripe-webhook/`, `stripe-portal/` directories lingered after creating `dodo-checkout/`, `dodo-webhook/`, `dodo-portal/`. Delete old functions in the same commit as creating new ones.
- **Never** skip updating project CLAUDE.md during a billing migration -- CLAUDE.md had 9 Stripe references after "complete" migration. Every agent reads CLAUDE.md first, so stale billing references cause confusion.
- **Never** add frontend env vars for server-side-only billing providers -- `.env.example` had `VITE_DODO_PUBLISHABLE_KEY` but Dodo Payments has no frontend SDK. All API calls are server-side through edge functions. No VITE_-prefixed Dodo env vars should exist.
- **Never** migrate without reconciling data discrepancies -- CLAUDE.md said Pro plan has 25 scans but webhook handler hardcoded `pro: 50`. Decide the canonical limit before shipping.

### Billing Migration Checklist (Prevents All Above)
After any billing provider migration, verify:
1. Old provider package removed from package.json (grep for package name)
2. All old provider edge functions/API routes deleted (ls the functions directory)
3. All old provider utility files deleted (grep for old provider name in src/)
4. CLAUDE.md updated with new provider name and correct env vars
5. .env.example only contains env vars that are actually used by code
6. Type files (database.ts, integrations/supabase/types.ts) have correct column names
7. Legal pages (Terms, Privacy) reference new provider
8. Admin integration cards reference new provider
9. No data discrepancies between CLAUDE.md limits and code limits
10. `npm run build` passes

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

## SaaS Product Failures (Market-Validated Anti-Patterns)

Based on research into 101 failed SaaS products and 50 successful ones, these antipatterns have quantified failure rates. Prevention rules are specific and testable.

### Business Failures

**1. No Market Need (42% of SaaS failures)**

What goes wrong:
- Product is built before validating that people want it
- Team assumes the problem is real without talking to users
- Feature set solves the wrong problem or adds complexity nobody needs
- Launch hits silence because the target audience doesn't care

Real example: A resume screening tool that auto-filters by GPA when hiring managers never mentioned GPA as a criterion (built feature nobody asked for).

Prevention rule:
```
BEFORE building v1 feature set:
- Interview 20+ target users (primary persona for the product)
- Ask "How critical is this problem?" on 1-5 scale
- Record: 40%+ must answer "5" (must have) or defer feature to v2
- Document interview source + date in CLAUDE.md
```

---

**2. Underpricing (70% of SaaS leave money on table)**

What goes wrong:
- First pricing is too low to support team
- Customers anchored to low price; raising prices triggers churn
- Revenue insufficient for payroll, ops, or reinvestment
- Team runs out of runway before hitting profitability

Real example: A SaaS tool priced at $9/mo when users say they'd pay $49-99/mo for the time saved.

Prevention rule:
```
PRICING STRATEGY (from launch):
1. Start at $29-99/mo for primary tier (not $9)
2. Test price increase every 60 days (A/B test: 20% of new users)
3. If churn <5% on increase → lock in new price
4. Track LTV:CAC ratio — if <3, raise price
5. Never launch with "it's so cheap" positioning — position on value, not price
```

---

**3. Wrong Launch Channel (49% of launches fail)**

What goes wrong:
- Launched on Product Hunt when audience is B2B recruiters (not tech enthusiasts)
- Built for mobile-first users but launched only on web
- Target buyers are VCs but founder tweets about it
- No dedicated outreach to actual buyers — just press release

Real example: HR tool launched on Product Hunt (tech community) instead of LinkedIn recruiter groups + HR Slack communities where hiring managers actually congregate.

Prevention rule:
```
LAUNCH CHANNEL RULES:
1. Identify primary buyer: [role, platform they use, where they congregate]
2. Match channel: recruiters → LinkedIn + recruiter Slack communities (not Product Hunt)
3. Plan 2-4 weeks before launch: email, community posts, DMs, direct outreach
4. Do NOT launch on Product Hunt unless target audience actually uses it
5. Track source of first 100 users — validate against target demographic
6. Document which channels worked in project CLAUDE.md for future launches
```

---

**4. No Retention Strategy (churn >10%/month = death spiral)**

What goes wrong:
- Acquisition focused, retention ignored
- Customers sign up, use once, never return
- No onboarding sequence or activation metric
- Churn accelerates; revenue declines; team kills product

Real example: A SaaS tool with no post-signup onboarding: user lands, sees blank job list, doesn't know what to do, never returns.

Prevention rule:
```
RETENTION CHECKLIST (day 1):
1. Define activation metric: [e.g., user uploads 2+ resumes AND sees ≥1 result]
2. Track churn = (users in month N who didn't activate) / (total users month N)
3. Target: churn <5% month 1, <3% by month 6
4. Implement post-signup emails: [onboarding sequence with setup checklist]
5. In-app: show "Getting Started" tasks until activation metric met
6. Weekly report: churn rate + activation rate + cohort analysis
7. If churn >10% for 2 weeks → emergency retention sprint (fix onboarding)
```

---

### Technical Failures

**5. Technical Debt Accumulation (velocity drops 50-70%)**

What goes wrong:
- Shortcuts taken to hit deadlines ("we'll refactor later")
- Code degrades: type safety lost, edge cases unhandled, error handling weak
- New features take 3x longer; bugs multiply; team velocity collapses
- Rewrites become unavoidable; 3+ months lost

Real example: the app initially ships with `any` types in score calculations, shortcuts on error handling, no RLS on admin tables. By month 3, adding a simple filtering feature takes 2 days instead of 4 hours.

Prevention rule:
```
ZERO TODO POLICY (hard rule):
1. NEVER ship code with //TODO, //FIXME, or //HACK comments
2. If found at code review: send back, do not merge
3. At end of sprint: grep for TODO/FIXME; fix all before closing
4. If genuinely "for later": create GitHub issue, link in comment, delete from code
5. Every sprint: dedicate 10-15% time to refactor old code
6. Monthly: review type strictness — no `any` in new code, eliminate existing
```

---

**6. No Performance Budget (3s load = 87% fewer conversions)**

What goes wrong:
- Slow initial load drives away potential customers before they see product
- Performance degrades each release; nobody measures it
- LCP >2.5s, INP >200ms, CLS >0.1; users think app is broken
- Mobile users hit first — highest churn segment

Real example: A SaaS tool loads JD analysis + results in sequence; total page load 4.2s. 60% mobile users bounce before results appear.

Prevention rule:
```
PERFORMANCE BUDGET (non-negotiable):
1. LCP (Largest Contentful Paint): <2.5s (measure with Lighthouse)
2. INP (Interaction Next Paint): <200ms
3. CLS (Cumulative Layout Shift): <0.1
4. On every deploy: run `npm run build && npm run lighthouse` before merge
5. If metrics breach budget: hot fix required before deploy
6. Specific to your project: skeleton loading on results, virtual scroll on large lists
7. Review: https://web.dev/vitals/ every sprint
```

---

**7. Database Without Indexes (queries 100x slower at scale)**

What goes wrong:
- Early dev: queries fast (small dataset)
- 1000+ jobs/resumes: queries suddenly timeout
- Page freezes; users see loading spinner for 10+ seconds
- No way to recover without rewriting queries + adding indexes

Real example: The app's `results` table grows to 100k rows. Query `SELECT * FROM results WHERE job_id = X` without index on `job_id`: takes 8 seconds instead of 50ms.

Prevention rule:
```
DATABASE INDEXING (mandatory):
1. Index every foreign key: job_id, resume_id, user_id, etc.
2. Index every WHERE clause column: status, created_at, is_active, etc.
3. Compound indexes for multi-column WHERE clauses
4. After schema change: write indexes in same migration
5. Monthly: check slow query logs (Supabase > Query Performance) for unindexed queries
6. Test with 10k+ rows before declaring feature done
7. Specific to your project: indexes on (user_id, created_at) for usage reports
```

---

**8. No Error Monitoring (bugs found by users, not team)**

What goes wrong:
- Critical bug happens in production; user discovers it
- Team never sees the error; bug repeats
- Error rate spikes; revenue impact not noticed until customer complains
- Reputation damage from "broken in production"

Real example: The app's credit deduction fails silently on duplicate payment webhooks; user sees credits vanish but never charged. Team doesn't know until support ticket arrives 2 days later.

Prevention rule:
```
ERROR MONITORING (day 1):
1. Integrate Sentry or equivalent from first deploy (not "later")
2. On EVERY error: automatic email alert to team if severity = critical
3. Dashboard: active error count, error rate by page, P95 response time
4. Review errors daily (standup review of yesterday's Sentry errors)
5. SLA: critical errors fixed within 4 hours, warning errors within 24 hours
6. Specific to your project: webhook errors (Dodo, email) = critical
7. Add error boundaries to EVERY route (prevents white screens)
```

---

### UX Failures

**9. Feature Bloat (50% scope creep, 30% never used)**

What goes wrong:
- Every requested feature added; nobody says no
- Product becomes complex; onboarding grows; user confusion increases
- Core feature buried under 20 optional settings
- Churn increases because app feels overwhelming

Real example: A SaaS tool adds export, comparison, team collaboration, custom scoring, API... by v3, simple tool becomes enterprise software. Onboarding takes 45 minutes; 70% of users never figure it out.

Prevention rule:
```
SCOPE CONTROL (hard limits):
1. For v1: identify CORE feature (the one thing users come for). Everything else = v2+
2. Feature request process: record, evaluate, defer 80% to future versions
3. Reject requests: "We're focused on X; we'll consider Y in v2"
4. At sprint planning: every story must link to core v1 objective
5. Specific to v1: core workflow (input → process → results). Nothing more.
6. v2 features: export, comparison, team features, API, integrations
```

---

**10. Bad Onboarding (75% abandon week 1)**

What goes wrong:
- No guidance on first use; user lands and is lost
- "Getting started" docs that don't actually get user started
- Sign up → blank dashboard → user confusion → abandon
- Time to first value >5 minutes

Real example: User signs up for the app, sees empty job list, doesn't know they need to create a job first. No onboarding prompt. Closes tab.

Prevention rule:
```
ONBOARDING CHECKLIST (non-negotiable):
1. Immediately after signup: show 3-step onboarding modal
   - Step 1: "Paste a job description" (example provided)
   - Step 2: "Upload resumes" (drag-drop zone, sample PDF link)
   - Step 3: "See results" (wait for processing, show live results)
2. Time to value: <2 minutes from signup
3. In-app: "Getting Started" checklist (3 tasks, green checkmarks)
4. Tour: Cmd+K (command palette) + context-aware help
5. Empty state on EVERY view: show what to do next (icon + CTA button)
6. No "Lorem ipsum" or "Coming soon" — every page is functional
```

---

**11. Missing Empty States (users see blank pages, leave)**

What goes wrong:
- User loads app, sees blank table/list
- No message explaining what to do
- User thinks app is broken or empty; closes tab
- 100% of first-time users churn

Real example: the app dashboard loads. User sees blank list of past jobs. No message. Appears broken. User leaves.

Prevention rule:
```
EMPTY STATE TEMPLATE (every list/table):
1. Icon (e.g., folder icon for jobs)
2. Headline: "No jobs yet" or "Start ranking"
3. Description: "Upload a job description and resumes to get started"
4. CTA button: "Create first job" (links to form, pre-fills with example)
5. Optional: link to help doc or video
6. Code: use EmptyState component from ui/
7. Mandatory locations: job list, results (before ranking), all admin tabs
```

---

**12. Missing Loading States (users think app is broken)**

What goes wrong:
- API call takes 2-5s; page shows blank space or no change
- User thinks nothing happened; clicks button again
- Loading spinner finally appears after user has clicked 3 times
- User doubts product quality

Real example: The app's "Rank Resumes" button; modal shows blank area for 3 seconds before results appear. User perceives as frozen.

Prevention rule:
```
LOADING STATE RULES (mandatory):
1. NEVER show blank area while data loads — show Skeleton matching final layout
2. NEVER use raw spinner — context matters (use SkeletonCard, SkeletonTable, SkeletonChart)
3. For tables: show 5-10 skeleton rows
4. For modals: show skeleton of expected content shape
5. For buttons: show spinner + disable while async operation in progress
6. Specific to your project: skeleton cards for results, loader on ranking button
7. Test: does the page EVER show blank space during loading? If yes, add skeleton.
```

---

**13. Confusing Navigation (users can't find features)**

What goes wrong:
- Sidebar has 15+ items; user can't find the feature they need
- No search/command palette; buried in nested menus
- Navigation labels unclear: "Data Management" vs "Inventory"
- User spends 2 minutes looking instead of using product

Real example: Admin panel has 12 sidebar items in no particular order. User can't find "Email Settings". Looks in "Integrations", "Platform Settings", "Admin Settings" before finding it.

Prevention rule:
```
NAVIGATION RULES (strict):
1. Max 2 levels deep: [Primary] > [Secondary]. No 3-level nesting.
2. Primary groups: Dashboard, Jobs/Data, Team, Settings, Admin (if role matches)
3. Cmd+K command palette on every app (searchable nav + actions)
4. Sidebar: max 8 items per section. Collapse long sections.
5. Labels must be clear: "Email Settings" not "Communication", "Users" not "People"
6. Hierarchy: most-used first (Dashboard, then Core Feature, then Settings)
7. Active state: highlight current section/page
8. Specific to your project: Dashboard > Jobs, Results, Settings, Admin (if role allows)
```

---

### Security Failures

**14. Hardcoded Secrets (one leak = reputation death)**

What goes wrong:
- API key, Supabase key, or private token in source code
- Committed to git and pushed to GitHub
- Attacker finds key, gains full database access
- Customer data exposed; product reputation destroyed
- Recovery: months of incident response, legal, rebuilding trust

Real example: The app's OpenAI API key committed to source. Key appears in public GitHub repo. Attacker uses key for $10k worth of API calls. Team scrambles to rotate key, audit logs, notify customers.

Prevention rule:
```
SECRETS POLICY (zero tolerance):
1. NEVER put API keys in source code, comments, or config files in repo
2. ALL secrets via environment variables ONLY (VITE_, SUPABASE_, etc.)
3. .env.example: list all required vars with placeholder values (no real keys)
4. Pre-commit hook: grep for "OPENAI_KEY\|API_KEY\|SECRET" — prevent commits
5. Git history audit: git log -S "key=" to find any leaked secrets
6. If leaked: rotate immediately, audit logs, invalidate old key
7. Specific to your project: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, OPENAI_API_KEY all in .env (dev) / Vercel (prod)
8. Rule: any new secret → auto-expire test keys after 90 days
```

---

**15. No RLS Policies (data leaks between users)**

What goes wrong:
- Database tables writable by any authenticated user
- User A can see/modify User B's data
- Competitor or malicious user accesses your data
- Regulatory violation (GDPR, SOC2); compliance failure

Real example: the app without RLS: user can query `SELECT * FROM results` and see every user's ranked candidates. Privacy violation.

Prevention rule:
```
RLS POLICY RULES (mandatory before launch):
1. EVERY table with user data: RLS enabled + policy
2. Policy: SELECT/UPDATE/DELETE only WHERE user_id = auth.uid()
3. Test: try to SELECT user_b's row while logged in as user_a → deny
4. Admin exception: admin users can bypass RLS (controlled via role policy)
5. Specific to your project:
   - jobs: RLS on user_id
   - resumes: RLS via job.user_id (join required)
   - results: RLS via resume.job.user_id
   - admin_audit_logs: RLS deny for non-admins
6. Verify: Supabase > Policies > every table has ≥1 active policy
```

---

**16. No Rate Limiting (API abuse possible)**

What goes wrong:
- No limit on requests per user/IP
- Attacker makes 10k requests in 1 minute
- API overloaded; legitimate users get 503 errors
- Cost spike from abuse (OpenAI calls, database queries)

Real example: The app's analyze-jd endpoint without rate limit. Attacker hammers it; costs spike to $500/hour. Product taken offline.

Prevention rule:
```
RATE LIMITING RULES:
1. EVERY API endpoint has rate limit (Edge Function, Supabase RLS, or middleware)
2. Limits per authenticated user (not IP):
   - Ranking: 5 jobs/minute (GPT-4o calls expensive)
   - Analysis: 20 JDs/minute
   - General API: 100 requests/minute
3. Public endpoints: stricter limits (10 req/minute/IP)
4. Return 429 (Too Many Requests) with Retry-After header
5. Specific to your project: implement in Supabase Edge Function wrappers (via Redis cache)
6. Monitor: flag if user exceeds rate limit 3x in 24h (potential abuse)
```

---

### Launch Failures

**17. Launching Too Early (broken first impression = permanent damage)**

What goes wrong:
- v0.5 shipped when should be v1
- Critical bugs, missing features, poor UX
- First-time users see broken product; never return
- Can't recover from "it didn't work" reputation
- Takes 10x effort to re-acquire user who tried and left

Real example: SaaS launches with non-functional checkout. 100 signups, 50 bounce at payment. Reputation damaged; returning users = 5%.

Prevention rule:
```
PRE-LAUNCH CHECKLIST (30 items, all must pass):
1. Core feature works end-to-end without errors
2. No "Coming Soon", "TODO", or placeholder text
3. All pages have proper loading + empty states
4. Forms validate and submit; success toast shown
5. Auth works (signup, login, logout, password reset)
6. Billing/payment tested with real test card (not mocked)
7. Mobile responsive (tested on actual devices, not just browser resize)
8. No console errors (check devtools console)
9. No Lighthouse regressions (<90 score = blocker)
10. All images optimized + load correctly
11. Links verified (no 404s, all navigation working)
12. Copy reviewed (no typos, grammar correct, consistent tone)
13. SEO basics (meta tags, structured data, sitemap)
14. Email workflows tested (signup, reset, notifications)
15. Admin panel tested (user management, settings, logging)
[... continue through 30 items]
Document: share checklist in GitHub issue, checkmark each before merge
```

---

**18. No Email Capture (lose potential users forever)**

What goes wrong:
- Landing page doesn't capture emails
- Interested visitor closes browser; never seen again
- No way to announce launch, feature updates, or special offers
- Growth limited to organic discovery

Real example: The app's landing page has no email field. 500 visitors week 1. 490 never return because no way to remind them.

Prevention rule:
```
EMAIL CAPTURE RULES (day 1):
1. Landing page: email signup form above fold (value prop + CTA)
2. Post-signup: add to waitlist + confirmation email + launch notification
3. Nav bar: newsletter signup CTA (subtle, top-right)
4. Every page: footer newsletter signup
5. Specific to your project: capture → Resend list → launch day notify
6. Offer value: "Notify me at launch" or "Early access + 20% discount"
7. Verify: no spam, legitimate opt-in, GDPR compliant
8. Track: analytics on signup rate, click-through rate to signup form
```

---

**19. No Analytics (can't measure what matters)**

What goes wrong:
- No data on user behavior, drop-off points, feature usage
- Decisions made on gut feel, not data
- Can't measure if changes actually help
- "Is our onboarding good?" → no data to answer

Real example: The app's signup flow redesigned twice. No analytics; team can't tell if version 2 was better. Spins wheels.

Prevention rule:
```
ANALYTICS RULES (day 1):
1. Install Vercel Analytics (built-in) OR PostHog (open-source)
2. Track key events:
   - signup (successful signup completed)
   - first_job_created (user uploaded job description)
   - first_ranking_completed (user saw results)
   - payment_initiated (clicked checkout)
   - payment_completed (subscription/credit purchase)
   - feature_used (track usage of key features)
3. Dashboards:
   - Funnel: signup → first_job → first_ranking → payment
   - Retention: % of users active week 1, week 4, month 1
   - Churn: % of paying users who don't renew
4. Weekly review: check funnel, identify biggest drop-off
5. Specific to your project: track ranking quality feedback (thumbs up/down on results)
```

---

**20. No Feedback Loop (build in vacuum)**

What goes wrong:
- No way for users to report bugs, suggest features, or say "this is broken"
- Team builds based on assumptions, not user needs
- Wrong features prioritized; real problems ignored
- Churn increases; user satisfaction unknown

Real example: the app ships feature X. Users find it useless. Team doesn't know because no feedback channel. Ship 3 more features X doesn't use; revenue suffers.

Prevention rule:
```
FEEDBACK SYSTEM (launch requirement):
1. In-app feedback widget (Crisp, Intercom, or Supabase-powered form)
2. NPS survey: day 7 after signup (email link)
3. Feature request form: prominent in Settings / Help
4. Bug report form: "Report an issue" with error context
5. Email contact: support@[domain] → team responds within 24h
6. Collect data:
   - Feature requests (rank by upvotes)
   - NPS (target >40)
   - Churn reasons (on cancellation, ask why)
   - Satisfaction scores (1-5 on core features)
7. Specific to your project: track ranking accuracy feedback (was the score fair?)
8. Review: weekly analysis of feedback themes
```

---

## Radix UI / shadcn/ui Component Antipatterns

### Empty String SelectItem Value Crashes Radix UI
**Context:** Any Radix UI `<Select>` component (via shadcn/ui `<Select>`) with a "select all" or "no filter" option.
**Pattern:** `<SelectItem value="">` causes a runtime crash. Radix UI forbids empty string as SelectItem value.
**Why:** Radix UI internally uses the value for DOM operations that require non-empty strings. Empty string causes `TypeError` at render time -- blank screen.
**Fix:** Use a non-empty sentinel value like `"all"`, map back to empty string in `onValueChange`:
```tsx
<Select
  value={filter || "all"}
  onValueChange={(v) => setFilter(v === "all" ? "" : v)}
>
  <SelectItem value="all">All items</SelectItem>
  <SelectItem value="active">Active</SelectItem>
</Select>
```
**Relationships:** Related: "shadcn-patterns.md" (design/references/). Prevents: runtime crash on filter dropdowns.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Feature Flags in localStorage -- Broken for Production
**Context:** Any SaaS app with admin-toggleable feature flags.
**Pattern:** Never store feature flags in localStorage. They are not shared across sessions, devices, or users. An admin toggling a flag only affects their own browser.
**Why:** Feature flags must be global and immediate. DB-backed flags (e.g., `system_config` table) provide a single source of truth that all users read from.
**Fix:** Use a server-side key/value store (Supabase table, Redis, etc.) with React Query for caching.
**Relationships:** Related: "system_config Pattern for Admin Config" (patterns/good/). Prevents: flags working for admin but nobody else.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Koda Appends Duplicate Imports on Heavily Modified Files
**Context:** When Koda makes many edits to a single file in one session, it sometimes appends a new `import { X } from "..."` at the bottom of the file even though the same import already exists at the top.
**Pattern:** Duplicate identifier causes SyntaxError -- app crashes with blank screen. No build error in some bundler configs, but runtime dies.
**Why:** Koda's diff-based editing sometimes loses track of existing imports when making many changes. The append goes to the end of file instead of being merged into the existing import block.
**Prevention:** After Koda makes 5+ edits to a single file, run a quick duplicate import check: `grep -c "from \"lucide-react\"" src/pages/SomeFile.tsx` -- if count > expected, deduplicate.
**Relationships:** Agent performance: Koda reliability issue. Prevents: blank screen SyntaxError crashes.
**Source:** ConvertScan (CROBOT), 2026-04-05 -- `Users.tsx` had duplicate `import { ChevronRight } from "lucide-react"`
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Pattern Relationship Map

**These 20 SaaS antipatterns interact:**
- #1 (no market need) → #9 (feature bloat) — if you don't validate, you ship what users don't want
- #2 (underpricing) → #4 (no retention) — low-paying users are low-engagement
- #3 (wrong channel) → #18 (no email capture) — can't build email list from wrong audience
- #5 (tech debt) → #6 (no perf budget) — shortcuts compound; velocity crashes; can't ship perf fixes
- #8 (no monitoring) → #17 (launch too early) — errors go unseen; ship broken; reputation damaged
- #10 (bad onboarding) → #13 (confusing nav) — users lose trust and abandon
- #14 (hardcoded secrets) → #15 (no RLS) — security debt compounds; multiple vectors of compromise
- #19 (no analytics) → #20 (no feedback) — can't measure or respond to user needs

---

## React 18 + Tailwind + shadcn/ui Antipatterns (CROBOT Session — 2026-04-06)

### Rules of Hooks: Never Call Hooks After Early Returns
**Context:** Any React component that conditionally returns early (loading states, error states, guards).
**Pattern:** Placing `useMemo`, `useCallback`, or any other hook AFTER a conditional `if (isLoading) return ...` causes "Rendered more hooks than during the previous render" crash — instant blank screen.
**Why:** React requires hooks to be called in exactly the same order on every render. An early return skips the hooks below it on some renders but not others — React detects the mismatch and throws.
**Fix:** Move ALL hook calls (useMemo, useCallback, useRef, useEffect) to the top of the component, before any conditional returns.
```tsx
// WRONG — useMemo after early return
const Foo = () => {
  const { data, isLoading } = useQuery(...);
  if (isLoading) return <Spinner />;  // ← early return
  const derived = useMemo(() => ..., [data]); // ← CRASH
  ...
};

// CORRECT — all hooks before early returns
const Foo = () => {
  const { data, isLoading } = useQuery(...);
  const derived = useMemo(() => ..., [data]); // ← hook first
  if (isLoading) return <Spinner />;  // ← early return after
  ...
};
```
**Source:** ConvertScan (CROBOT), Dashboard.tsx, 2026-04-06
**Knowledge Version:** v1

---

### useDebounce Refactoring: Remove Dead Setter References
**Context:** Refactoring search inputs from manual debounce (`useState` + `setTimeout` + blur handler) to a `useDebounce` hook.
**Pattern:** After replacing `const [debouncedSearch, setDebouncedSearch] = useState("")` with `const debouncedSearch = useDebounce(search, 350)`, the old `setDebouncedSearch("")` calls in "Clear filters" onClick handlers cause "setDebouncedSearch is not a function" runtime crash.
**Why:** `useDebounce` is a derived value hook — it has no setter. The debounced value auto-updates when the source `search` state changes. Calling the old setter is a dangling reference.
**Fix:** When refactoring to useDebounce, search all onClick/onReset handlers for `setDebouncedSearch` and remove those calls. Setting `setSearch("")` is sufficient — the debounced value follows automatically.
**Source:** ConvertScan (CROBOT), admin/Users.tsx + admin/Scans.tsx, 2026-04-06
**Knowledge Version:** v1

---

### Invalid Tailwind Double Opacity Modifier
**Context:** Any Tailwind CSS class with opacity modifier.
**Pattern:** `bg-muted/40/50` is not valid Tailwind syntax. Only one opacity modifier per utility class is allowed.
**Why:** Tailwind parses the class as `bg-muted` with opacity `40/50` — an invalid fraction. The class is silently dropped, producing unexpected transparent or default background.
**Fix:** Use a single opacity value: `bg-muted/40` or `bg-muted/50`.
**Source:** ConvertScan (CROBOT), AgentMessage.tsx + NewTaskDialog.tsx, 2026-04-06
**Knowledge Version:** v1

---

### Recursive setTimeout Without Cancellation Token — Timer Leak
**Context:** Any simulation or polling loop using recursive `setTimeout` (e.g., message delivery simulation, animation steps).
**Pattern:** A `watchTask(taskId)` method starts a recursive `deliverNextMessage` chain. If the user navigates away and `cleanup()` is called, the in-flight setTimeout callback runs after cleanup and starts a new chain — creating ghost timers that keep firing indefinitely.
**Fix:** Add a `private deliveryToken = 0` field. Increment it in `watchTask()` AND `cleanup()`. Pass token to `deliverNextMessage(taskId, token)`. At the start of the function AND inside each setTimeout callback, check `if (token !== this.deliveryToken) return`.
```ts
private deliveryToken = 0;

watchTask(taskId: string) {
  this.deliveryToken++;
  const token = this.deliveryToken;
  this.deliverNextMessage(taskId, token);
}

cleanup() {
  this.deliveryToken++; // cancels all in-flight chains
}

private deliverNextMessage(taskId: string, token: number) {
  if (token !== this.deliveryToken) return; // stale chain
  setTimeout(() => {
    if (token !== this.deliveryToken) return; // double-check inside callback
    // ... delivery logic
    this.deliverNextMessage(taskId, token); // recurse
  }, delay);
}
```
**Source:** ConvertScan (CROBOT), agent-engine.ts, 2026-04-06
**Knowledge Version:** v1

---

### useState(0) + forceUpdate Anti-Pattern for External Store Subscriptions
**Context:** React 18 components subscribing to an external store (class-based engine, event emitter, etc.).
**Pattern:** `const [, forceUpdate] = useState(0)` + `useEffect(() => store.subscribe(() => forceUpdate(n => n+1)), [])` is an anti-pattern. It creates a subscription that increments state on every event, causing unnecessary re-renders and potential tearing.
**Fix:** Use React 18's built-in `useSyncExternalStore`:
```ts
const snapshot = useSyncExternalStore(
  store.subscribe.bind(store),
  () => ({ data: store.getData() }),    // getSnapshot
  () => ({ data: [] })                   // getServerSnapshot
);
```
This is tear-safe, concurrent-mode-safe, and more efficient than the forceUpdate pattern.
**Source:** ConvertScan (CROBOT), AgentWorkspace.tsx, 2026-04-06
**Knowledge Version:** v1

---

### Admin Sidebar State Resets on Navigation
**Context:** Admin layout sidebar with collapse toggle.
**Pattern:** Using `useState(false)` for collapsed state in an AdminLayout component that remounts on every route change. The state resets to the default on every navigation.
**Fix:** Use a lazy initializer that reads from sessionStorage on first render:
```ts
const [collapsed, setCollapsed] = useState<boolean>(() => {
  try { return sessionStorage.getItem("admin:sidebar") === "true"; } catch { return false; }
});
```
And persist on toggle: `try { sessionStorage.setItem("admin:sidebar", String(next)); } catch {}`
**Source:** ConvertScan (CROBOT), AdminLayout.tsx, 2026-04-06
**Knowledge Version:** v1

---

### Bare `new QueryClient()` Without Production Config
**Context:** Every React Query app — QueryClient is the global cache configuration.
**Pattern:** `new QueryClient()` with no options uses defaults that are too aggressive for production: infinite retries on auth failures, refetch on every window focus, no stale time = every navigation causes a network request.
**Fix:** Always configure:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,          // 2 min cache
      gcTime: 1000 * 60 * 10,            // 10 min garbage collect
      retry: (failureCount, error) => {   // skip retry on auth errors
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("401") || msg.includes("403")) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,        // prevents unnecessary fetches
    },
    mutations: { retry: 0 },
  },
});
```
**Source:** ConvertScan (CROBOT), App.tsx, 2026-04-06
**Knowledge Version:** v1

---

*(Updated by Mira — add antipatterns via `/train`)*