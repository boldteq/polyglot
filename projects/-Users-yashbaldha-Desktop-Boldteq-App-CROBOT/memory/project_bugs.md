---
name: ConvertScan (CROBOT) -- Bug Registry
description: All bugs encountered during CROBOT development, root causes, fixes, and prevention rules.
type: project
last_updated: 2026-04-06
---

## Bug Registry

Every bug encountered in CROBOT is logged here with full context so agents never repeat them.

---

### BUG-001: Duplicate Import SyntaxError (Koda)
**Date:** 2026-04-05
**Severity:** Critical (blank screen crash)
**File:** `src/pages/admin/Users.tsx`
**What happened:** Koda appended `import { ChevronRight } from "lucide-react"` at the bottom of the file while the same import already existed at the top. Caused SyntaxError -- duplicate identifier -- app crashed with blank screen.
**Root cause:** Koda loses track of existing imports when making many edits to the same file in a single session. Instead of merging into the existing import block, it appends a new import statement at the end of the file.
**Fix:** Removed the duplicate import line. Commit: `bfc86c8`.
**Prevention:** After Koda makes 5+ edits to a single file, run: `grep -c "from \"lucide-react\"" src/path/to/file.tsx` -- if count > expected, deduplicate.
**Cross-ref:** `~/.claude/memory/patterns/avoid/antipatterns.md` (Koda Appends Duplicate Imports section)

---

### BUG-002: Empty String SelectItem Crash (Radix UI)
**Date:** 2026-04-05
**Severity:** Critical (runtime crash)
**Files:** `src/pages/admin/Users.tsx`, `src/pages/admin/Scans.tsx`, `src/pages/admin/AuditLog.tsx`
**What happened:** `<SelectItem value="">` passed to Radix UI Select component for "All" filter options. Radix forbids empty string as SelectItem value -- crashes at runtime with TypeError.
**Root cause:** Radix UI internally uses the value for DOM operations requiring non-empty strings. This is a known Radix constraint but not obvious to agents.
**Fix:** Used `"all"` as sentinel value, mapped back to empty string in `onValueChange`:
```tsx
<Select value={filter || "all"} onValueChange={(v) => setFilter(v === "all" ? "" : v)}>
  <SelectItem value="all">All items</SelectItem>
```
**Commits:** `5ed9b29` (Users), `1f35ddb` (Scans + AuditLog)
**Prevention:** Never use empty string for Radix UI SelectItem values. Always use a non-empty sentinel like `"all"`.
**Cross-ref:** `~/.claude/memory/patterns/avoid/antipatterns.md` (Radix UI section)

---

### BUG-003: Sidebar/TopBar Multi-Bug Fix (9 issues)
**Date:** 2026-04-05
**Severity:** Medium-High (UI broken, nav issues)
**Files:** `src/components/AppSidebar.tsx`, `src/components/TopBar.tsx`, `src/components/AdminLayout.tsx`
**What happened:** 9 separate bugs found during sidebar/topbar audit:

1. **Missing AI Agents nav item in user sidebar** -- nav item omitted during build
2. **`agent_hub_enabled` flag never actually filtered nav items** -- flag was checked but the filtering logic didn't apply
3. **No `tooltip` prop on `SidebarMenuButton`** in collapsed state -- buttons showed no label when sidebar collapsed
4. **"Upgrade Plan" shown to Agency users** -- should only show for free/pro users
5. **`/admin/integrations` nav item pointed to non-existent route** -- 404 on click
6. **Collapse button `onClick` malformed** -- nested arrow function `onClick={() => () => setCollapsed(!collapsed)}` did nothing on first click
7. **Empty admin footer in collapsed state** -- rendered empty space
8. **Hardcoded `"Report"` breadcrumb in TopBar** -- showed "Report" for all detail pages instead of deriving from route
9. **Mixed `DropdownMenuPrimitive.Trigger` + shadcn `DropdownMenu`** -- imported from `@radix-ui/react-dropdown-menu` directly instead of using shadcn's `DropdownMenuTrigger`

**Root causes:** Mix of agent oversights and Koda not being aware of shadcn sidebar/dropdown conventions.
**Fix:** All 9 fixed in commit `7e55784`.
**Prevention rules:**
- `SidebarMenuButton` always needs `tooltip={item.title}` AND `isActive={active}` props
- Never import `DropdownMenuPrimitive` from `@radix-ui/react-dropdown-menu` when using shadcn -- use `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`
- Never hardcode breadcrumb labels -- derive from route segment map
- Always cross-check nav item hrefs against App.tsx route definitions
- Conditional UI (upgrade CTA, admin links) must check actual user plan/role
- Arrow function onClick must not be double-wrapped: `onClick={() => fn()}` not `onClick={() => () => fn()}`

---

### BUG-004: Koda Claims Nav Item Written But File Not Changed
**Date:** 2026-04-06
**Severity:** Medium (missing nav item, caught before deploy)
**File:** `src/components/AdminLayout.tsx`
**What happened:** Koda reported adding the Integrations nav item to AdminLayout.tsx, but verification showed the change was not actually present in the file.
**Root cause:** Unknown -- Koda may have failed to write the edit or the edit was lost.
**Fix:** Manually verified and added the nav item. Commit: `66a3bbc`.
**Prevention:** After Koda claims to modify shared layout/navigation files, always `grep` for the expected content before proceeding.

---

### BUG-005: Integrations Page Layout Rejected by Yash
**Date:** 2026-04-06
**Severity:** Low (UX preference, not functional bug)
**File:** `src/pages/admin/Integrations.tsx`
**What happened:** First version of Integrations page used 2-column card grid layout. Yash rejected it and requested row-by-row collapsible layout.
**Root cause:** Agent default was card grid; Yash prefers collapsible rows for admin config pages.
**Fix:** Redesigned to use shadcn Collapsible component. Commit: `39c73f5`.
**Prevention:** For admin pages displaying lists of config items or integrations, default to row-by-row collapsible layout, not card grids.
**Cross-ref:** `project_admin.md` (Row-by-Row Collapsible pattern)

---

### BUG-006: ForwardRef Warnings on ScoreRing/Badge
**Date:** 2026-04-05
**Severity:** Low (console warnings, not crashes)
**What happened:** React forwardRef warnings in console for ScoreRing and Badge components.
**Fix:** Applied forwardRef pattern to affected components. Commit: `acc085f`.

---

### BUG-007: BrandIcon Undefined Component (Redesign Agent)
**Date:** 2026-04-06
**Severity:** Critical (build would pass but runtime crash -- component renders nothing or throws)
**File:** `src/pages/Landing.tsx` (lines 124, 727)
**What happened:** The redesign agent (Koda) used `BrandIcon` as a component reference in Landing.tsx during the 48-file UI redesign. `BrandIcon` was never imported and does not exist in lucide-react or any other dependency. It was a placeholder name the agent invented during the redesign pass.
**Root cause:** When redesign agents rewrite large swaths of UI across many files in a single session, they sometimes introduce placeholder component names that "look right" but don't actually exist. The agent was likely thinking of a brand/logo icon concept but used a non-existent component name instead of picking from the lucide-react icon set.
**Fix:** Imported `ScanLine` from `lucide-react` and replaced all `BrandIcon` references with `ScanLine`. Commit: `10f68f1`.
**Prevention rules:**
1. After any redesign touching 10+ files, run: `npm run build` -- TypeScript will catch undefined components if they're used in JSX (but only if the component is typed, not if it's just an unresolved identifier in some patterns)
2. After any redesign, grep for common placeholder names: `grep -rn "BrandIcon\|PlaceholderIcon\|CustomIcon\|LogoIcon\|AppIcon" src/`
3. Verify every lucide-react import actually exists: extract all icon names from imports, cross-check against lucide-react package exports
4. The redesign agent should be instructed to ONLY use icons from the lucide-react set or existing project components -- never invent component names
**Cross-ref:** `~/.claude/memory/patterns/avoid/antipatterns.md` (Redesign Agent Placeholder Components section)

---

### BUG-008: Supabase Migrations Never Applied (Zero Tables)
**Date:** 2026-04-06
**Severity:** Critical (app is non-functional -- no database tables exist)
**Files:** `supabase/migrations/001_schema.sql`, `002_rls.sql`, `003_triggers.sql`, `004_admin_rbac.sql`
**What happened:** The Supabase project `hyxlmmkrbipufoqkkhba` had zero public tables. All 4 migration files existed in the codebase but had never been applied. The app was "architecturally complete" in code but had no database to connect to.
**Root cause:** Lovable does not auto-apply SQL migrations from `supabase/migrations/`. The Supabase CLI `supabase db push` requires local Docker. No agent or workflow step was responsible for verifying that migrations had been applied.
**Fix:** Combined all 4 migrations + admin role backfill into a single SQL block and executed in Supabase SQL Editor. Admin role set for boldteq@gmail.com.
**Prevention rules:**
1. After scaffolding any Supabase project, immediately verify tables exist: check Supabase Dashboard > Table Editor
2. Add "migrations applied" as an explicit checkbox in any MVP/deploy checklist
3. For Lovable-origin projects, migrations MUST be manually applied -- they do not auto-run
4. When combining migrations for SQL Editor, order matters: schema first, then RLS, then triggers, then RBAC
**Cross-ref:** `project_patterns.md` (Supabase Migration Manual Application pattern)

---

*(Updated by Mira -- 2026-04-06, session 3. Add new bugs as they occur.)*
