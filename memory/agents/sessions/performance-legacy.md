---
name: Agent Performance
description: Agent velocity, accuracy, and improvement tracking
type: metrics
---

## Agent Performance Tracking

*(Updated by Mira after each project cycle.)*

---

## Session Logs

### 2026-04-03 -- Pinzo -- Sage Performance
**Task:** Full Shopify compliance audit
**Claimed output:** Comprehensive audit covering GDPR, security, performance, and Polaris compliance
**Actual output:** Correctly identified GDPR data cleanup gap, missing DB indexes, hardcoded secrets, CSS sanitization gap, and raw HTML in Polaris routes
**Gap:** Initially suggested adding GDPR topics to TOML (following incorrect memory pattern), which was caught and corrected during deploy testing
**Root cause:** Memory files contained incorrect GDPR webhook registration pattern
**Correction applied:** Sage discovered the correct registration method (Partner Dashboard), memory updated
**Prevention rule:** Memory corrected across 3 files; antipattern added
**Output Quality:** good (caught real issues, one false lead from stale memory)
**Retries Required:** 1 (GDPR TOML attempt -> Partner Dashboard correction)

### 2026-04-03 -- Pinzo -- Rex Performance
**Task:** Full UI audit + widget redesign
**Claimed output:** 100% Polaris compliance, widget redesign with visual grouping, storefront sync
**Actual output:** All claims verified -- raw HTML replaced, widget redesigned with 4 grouped sections, Liquid template updated in sync
**Gap:** None
**Root cause:** N/A
**Correction applied:** N/A
**Prevention rule:** N/A
**Output Quality:** clean
**Retries Required:** 0

### 2026-04-03 -- Pinzo -- Koda Performance
**Task:** Rate limiting implementation, FAQ expansion, code changes
**Claimed output:** Rate limiter utility, expanded FAQ, all code modifications
**Actual output:** Clean rate limiter with proper types, cleanup loop, IP extraction. FAQ expanded from 6 to 21 entries. All build-passing.
**Gap:** None
**Root cause:** N/A
**Correction applied:** N/A
**Prevention rule:** N/A
**Output Quality:** clean
**Retries Required:** 0

---

## Aggregate Metrics

### Sage (Code Review / Audit)
- Sessions tracked: 1
- Clean first-try rate: 0% (1/1 needed correction for GDPR TOML pattern)
- Avg retries: 1.0
- Most common issue: Following stale/incorrect memory patterns
- Best at: Identifying real compliance gaps (GDPR data cleanup, CSS sanitization, hardcoded secrets)
- Note: The GDPR TOML error was caused by incorrect memory, not agent logic. After memory correction, Sage's finding quality was high.

### Rex (Orchestration / UI Audit)
- Sessions tracked: 1
- Clean first-try rate: 100% (1/1)
- Avg retries: 0
- Best at: Systematic UI audit (found 20 raw HTML instances across 6 files), widget UX redesign
- Improvements: None identified

### Koda (Feature Builder)
- Sessions tracked: 1
- Clean first-try rate: 100% (1/1)
- Avg retries: 0
- Best at: Clean utility code (rate limiter), content expansion
- Improvements: None identified

### 2026-04-05 -- CROBOT -- Koda Performance (Round 1: MVP Features)
**Task:** Build 8 MVP features: ShareScoreModal, FindingCard AI gate, ScanGateWall, dashboard at-limit state, Reports polish, Settings billing tab overhaul, landing hero input
**Claimed output:** All 8 features built and functional
**Actual output:** 7 of 8 verified in code (pricing toggle was already complete -- no changes needed). All features confirmed in codebase.
**Gap:** None
**Root cause:** N/A
**Correction applied:** N/A
**Prevention rule:** N/A
**Output Quality:** clean
**Retries Required:** 0

### 2026-04-05 -- CROBOT -- Koda Performance (Round 2: Admin Deep Features)
**Task:** Build 7 deep admin features: DB feature flags, plan limits/pillar weights editors, bulk user ops, enhanced admin dashboard, support ticket system, retry failed scans, CSV export
**Claimed output:** All 7 features built
**Actual output:** All features verified in code. Feature flags correctly migrated to system_config table. Bulk ops use Promise.all pattern. Admin dashboard has charts.
**Gap:** Two bugs introduced:
  1. Duplicate `import { ChevronRight }` appended at bottom of Users.tsx -- SyntaxError crash (blank screen)
  2. `<SelectItem value="">` in Users.tsx filter dropdowns -- Radix UI runtime crash
**Root cause:** (1) Koda loses track of existing imports when making many edits to same file. (2) Koda didn't know Radix forbids empty string SelectItem values.
**Correction applied:** (1) Removed duplicate import in separate commit. (2) Replaced `""` with `"all"` sentinel.
**Prevention rule:** (1) After 5+ edits to single file, deduplicate imports. (2) Never use empty string for Radix SelectItem value -- use non-empty sentinel.
**Output Quality:** good (features correct, two runtime bugs required separate fixes)
**Retries Required:** 2 (separate fix commits)

### 2026-04-06 -- CROBOT -- Koda Performance (Session 3: TopBar + Integrations + Dodo Migration)
**Task:** TopBar rewrite to Linear/Vercel quality, Admin Integrations page, admin nav fix, Stripe-to-Dodo billing migration
**Claimed output:** TopBar upgraded, Integrations page built, nav item added, Stripe fully replaced with Dodo
**Actual output:** TopBar and Integrations page verified. Dodo migration complete. However:
  - Koda claimed it added Integrations nav item to AdminLayout.tsx but the change was NOT in the file -- required manual fix (commit `66a3bbc`)
  - Integrations page layout rejected by Yash (2-column card grid) and redesigned to row-by-row collapsible (commit `39c73f5`)
**Gap:** (1) Silent write failure on shared layout file. (2) UX choice misaligned with Yash's preference.
**Root cause:** (1) Unknown -- Koda may have failed to apply the edit or it was lost. (2) Agent defaulted to card grid when Yash prefers collapsible rows for config pages.
**Correction applied:** (1) Nav item manually verified and added. (2) Integrations page redesigned.
**Prevention rule:** (1) After Koda claims to modify shared layout/nav files, always grep to verify. (2) For admin config/integration list pages, default to collapsible rows.
**Output Quality:** good (core features correct, 1 write failure + 1 UX rejection)
**Retries Required:** 2

### 2026-04-06 -- CROBOT -- Koda Performance (Session 4: Production-Grade UI Redesign)
**Task:** Full production-grade UI redesign across 48 files -- warm neutral palette, Inter font, shadow-soft, backdrop blur, tighter spacing
**Claimed output:** 48 files redesigned with consistent design system, premium visual quality
**Actual output:** Redesign quality confirmed high -- consistent tokens, premium visual language across all pages and components. However:
  - `BrandIcon` placeholder component introduced in `src/pages/Landing.tsx` (lines 124, 727) -- never imported, doesn't exist in lucide-react or any dependency
  - Build passed because JSX self-closing tags referencing undefined components don't always trigger TypeScript errors depending on configuration
**Gap:** 1 undefined placeholder component in 48 files redesigned (error rate: ~2%)
**Root cause:** When rewriting UI across many files in one session, Koda loses track of which component names are real imports vs. conceptual placeholders. "BrandIcon" was a conceptual name for a brand/logo icon that doesn't map to any real component.
**Correction applied:** Imported `ScanLine` from lucide-react, replaced both `BrandIcon` usages. Commit: `10f68f1`.
**Prevention rule:** After any redesign touching 10+ files, run the Post-Redesign Verification Checklist: (1) `npm run build`, (2) grep for placeholder names (BrandIcon, PlaceholderIcon, CustomIcon, LogoIcon, AppIcon), (3) verify all lucide-react imports are real icons, (4) `npm run lint`.
**Output Quality:** good (high-quality redesign, 1 placeholder bug)
**Retries Required:** 1

### 2026-04-06 -- CROBOT -- Koda Performance (Session 5: Dodo Payments Migration)
**Task:** Full billing migration: Stripe -> Dodo Payments (3 edge functions, DB migration, hooks, types, admin UI, legal pages)
**Claimed output:** Complete billing migration -- Stripe removed, Dodo integrated
**Actual output:** Core migration is correct and high quality:
  - 3 well-structured edge functions with proper auth, validation, CORS, error handling, webhook verification
  - DB migration correct (column renames via ALTER TABLE RENAME COLUMN)
  - Frontend hooks correctly updated (use-billing.ts -> dodo-checkout/dodo-portal)
  - Both type files (database.ts and integrations/supabase/types.ts) properly synced with dodo_ fields
  - Admin Integrations and System pages updated to reference Dodo
  - Legal pages (Terms, Privacy) updated
**Gap:**
  1. Dead file `src/lib/stripe.ts` not deleted (imports removed package, nothing references it)
  2. Old Stripe edge function directories not deleted (stripe-checkout/, stripe-webhook/, stripe-portal/)
  3. CLAUDE.md not updated (still has 9 Stripe references in billing, function names, env vars sections)
  4. Added `VITE_DODO_PUBLISHABLE_KEY` to .env.example -- Dodo has no frontend SDK, this is unused
  5. Pro plan scan_limit set to 50 in webhook handler but CLAUDE.md says 25 -- data discrepancy not flagged
**Root cause:** Koda focused on creating the new integration correctly but didn't perform cleanup of old artifacts or update documentation. The VITE_ env var was added by analogy with Stripe's frontend publishable key without checking Dodo's architecture.
**Correction applied:** Cleanup items logged as technical debt in project memory. No runtime errors.
**Prevention rule:** After any provider migration, run the Billing Migration Checklist (see antipatterns.md). Always grep for old provider name across full codebase after migration.
**Output Quality:** good (core implementation high quality, cleanup incomplete)
**Retries Required:** 0 (no runtime errors)

### 2026-04-06 -- CROBOT -- Koda Performance (Session 7: Sidebar & Navigation Overhaul)
**Task:** Full navigation system overhaul: admin sidebar refactor (custom aside -> shadcn Sidebar), user sidebar fixes (icon color, dead nav items, collapsed state), topbar cleanup
**Claimed output:** Production-grade navigation with consistent shadcn Sidebar pattern across user and admin sidebars
**Actual output:** All changes verified. AdminLayout.tsx fully uses shadcn Sidebar. AppSidebar icon colors correct. No duplicate nav items. Collapsed state works via group-data-[collapsible=icon]. Build passes.
**Gap:** Required 7 iterations (7 commits) to reach final state. Yash provided direction at each step:
  1. Initial accent bar + footer dropdown + breadcrumb (Koda)
  2. Yash: "admin panel sidebar bottom and topbar right both same thing" -> remove duplicate user menu
  3. Yash: collapsed header cramped -> logo IS expand button, remove separate chevron
  4. Yash: icons too small, nav items too short -> increase to 18px/h-10
  5. Yash: AI Agents page doesn't exist, Admin Panel is in topbar not sidebar, Settings duplicate -> cleanup
  6. Yash: collapsed separator orphan, logo not centered, padding too wide -> fix collapsed structure
  7. Yash: "use exactly the same components, css as user sidebar" -> full refactor to shadcn Sidebar
**Root cause of iterations:** Koda initially continued building on the custom `<aside>` approach instead of using the established shadcn Sidebar pattern. Each fix was correct but incremental -- the fundamental issue (wrong component system) wasn't addressed until Yash explicitly requested it in step 7.
**Correction applied:** Final commit replaced entire AdminLayout sidebar with shadcn components matching AppSidebar.
**Prevention rule:** When both user and admin sidebars exist, always use the same component system. Check what the user sidebar uses before building admin sidebar. Never build a custom aside when shadcn Sidebar is already in the project.
**Output Quality:** good (final result is production-grade, but 7 iterations to get there is high)
**Retries Required:** 6 (7 total commits, 1 would be ideal)

---

## Aggregate Metrics (Updated 2026-04-06)

### Koda (Feature Builder)
- Sessions tracked: 7 (Pinzo x1, CROBOT x6)
- Clean first-try rate: 29% (2/7 sessions fully clean, 5/7 needed fixes, iterations, or cleanup)
- Avg retries: 1.14
- Most common issues:
  1. **Builds on wrong foundation instead of reusing existing patterns** (CROBOT session 7 -- built custom aside when shadcn Sidebar already existed in project)
  2. Incomplete cleanup after migrations/refactors (CROBOT session 5 -- dead files, old edge functions)
  3. Duplicate imports on heavily modified files (CROBOT session 2)
  4. Silent write failures on shared layout files (CROBOT session 3)
  5. UX layout choices misaligned with Yash preferences (CROBOT session 3)
  6. Placeholder component names in large redesigns (CROBOT session 4 -- BrandIcon)
  7. Adds env vars by analogy without checking provider docs (CROBOT session 5)
  8. Does not check existing codebase before building -- builds from scratch when existing patterns should be reused (CROBOT session 7)
- Best at: Edge function quality, feature implementation, hook architecture, type safety, large-scale UI redesigns, individual fix quality (each iteration was correct)
- Improvements needed: **CHECK EXISTING CODEBASE FIRST** before building new UI components. Post-migration cleanup checklist. CLAUDE.md updates. Import deduplication.
- Trend: Session 7 reveals a new failure mode: building a custom implementation when the project already has the correct pattern established elsewhere. This is the inverse of the session 5 issue (creates but doesn't clean) -- session 7 shows Koda also **creates instead of reuses**. Both stem from insufficient codebase awareness before starting.

### Sage (Code Review / Audit)
- Sessions tracked: 1
- Clean first-try rate: 0% (1/1 needed correction for GDPR TOML pattern)
- Avg retries: 1.0
- Most common issue: Following stale/incorrect memory patterns
- Best at: Identifying real compliance gaps (GDPR data cleanup, CSS sanitization, hardcoded secrets)
- Note: The GDPR TOML error was caused by incorrect memory, not agent logic.

### Rex (Orchestration / UI Audit)
- Sessions tracked: 1
- Clean first-try rate: 100% (1/1)
- Avg retries: 0
- Best at: Systematic UI audit, widget UX redesign
- Improvements: None identified

---

## Cross-Session Insights

### Memory Quality Matters More Than Agent Quality
The only failure in the 2026-04-03 session was caused by incorrect memory, not agent error.
Sage correctly followed the documented pattern in memory -- but the pattern was wrong.
This reinforces that Mira's memory accuracy is the single most impactful factor in factory quality.
Incorrect memory causes cascade failures: agent trusts memory -> builds wrong thing -> deploy fails -> time wasted debugging.

### Koda Reliability Degrades on High-Volume Edit Sessions
Across 6 tracked sessions, Koda's reliability drops when:
- Making 5+ edits to a single file (duplicate imports appear)
- Modifying shared layout/nav files (writes sometimes fail silently)
- Building 10+ files in a single redesign pass (placeholder component names appear)
- Making UX layout decisions without explicit Yash guidance (defaults to card grids)
- Performing migrations/refactors (creates new code well, but doesn't clean up old artifacts)

**Mitigation protocol:**
1. After heavy Koda edit sessions, always run: `npm run build` + grep for duplicate imports
2. After Koda modifies layout/nav files, grep to verify the expected changes are present
3. After large redesigns (10+ files), run the Post-Redesign Verification Checklist: build, grep for placeholder names, verify lucide-react imports, lint
4. For admin UI layout decisions, default to collapsible rows for config pages (Yash's documented preference)
5. After any migration/refactor, grep for old provider/pattern name across full codebase to catch stragglers

### Pattern: Koda's Error Rate in Large Sessions Is Consistent (~2%)
Session 2: 2 bugs in ~15 features built (~13% feature-level error rate, but bugs were mechanical not logical)
Session 3: 2 issues in ~4 features (1 write failure, 1 UX rejection)
Session 4: 1 bug in 48 files redesigned (~2% file-level error rate)
Session 5: 0 runtime errors, 5 cleanup items missed in billing migration
Takeaway: Koda produces high-quality output. Errors fall into two categories: (1) mechanical errors in large batch sessions (imports, writes, placeholders) and (2) incomplete cleanup after migrations. Core feature logic is consistently correct.

### New Insight: Koda Creates But Doesn't Clean
Session 5 reveals a pattern: Koda excels at building new things (edge functions were production-quality on first try) but consistently misses cleanup of old artifacts. This suggests Koda's planning focuses on "what to create" but not "what to remove/update". The Billing Migration Checklist in antipatterns.md addresses this directly.

### New Insight: Koda Builds From Scratch Instead of Reusing Existing Patterns
Session 7 reveals a second major pattern: Koda builds custom implementations (custom `<aside>` sidebar) when the project already has the correct approach established elsewhere (shadcn `Sidebar` in AppSidebar.tsx). This caused 7 iterations to reach the same result that would have been achieved on first try by examining the user sidebar code and copying its component stack.

**Root cause:** Koda does not systematically scan the existing codebase for established patterns before building. It approaches each task as a fresh build rather than checking "how was this already solved elsewhere in this project?"

**Mitigation:**
1. Before building any UI component, grep the project for similar existing implementations
2. For sidebars specifically: always check if `@/components/ui/sidebar` is already in use elsewhere
3. For layout components: check what the other layout (user vs admin) already does
4. Rule: "If the project already has a working pattern for X, use it. Don't build a different X."

### Pattern: Iteration Count Correlates With Foundation Choice
Sessions with 0-1 retries: Koda chose the right foundation from the start (correct component system, correct library, correct pattern).
Sessions with 2+ retries: Koda started with a suboptimal foundation (custom aside instead of shadcn Sidebar, card grid instead of collapsible rows) and required iterative corrections to reach the right place.
**Takeaway:** The single highest-leverage improvement for Koda is spending 5 minutes checking existing codebase patterns before writing any code. This would eliminate the most expensive failure mode (building on the wrong foundation).

---

*(Updated by Mira -- 2026-04-06, session 7)*
