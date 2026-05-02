---
name: CROBOT Admin Panel -- Architecture, Features & Patterns
description: Admin panel at /admin/* routes, same codebase as user app. RBAC, 10 sections, feature flags, bulk ops, integrations hub.
type: project
last_updated: 2026-04-06
---

## Admin Panel Architecture

Admin panel is a first-class citizen, built in parallel with the user app from Phase 2 onwards.

**Why:** Yash flagged the missing admin panel in the original plan. Admin is not an afterthought -- it ships alongside the user app.

**Implementation:**
- Routes: `/admin/*` under `AdminLayout` component
- Guard: `AdminRoute` wrapper checks `profiles.role IN ('admin', 'super_admin')`
- Layout: Separate `AdminLayout` with its own sidebar (not shared with user sidebar)
- Bundle: Lazy-loaded routes so user bundle is unaffected
- RBAC: `profiles.role` column (`user`, `admin`, `super_admin`)
- Audit logging: Every admin action writes to `audit_logs` table via `writeAuditLog()` helper

## Key Files
- `src/components/AdminLayout.tsx` -- layout shell with sidebar nav, route matching, active state
- `src/pages/admin/` -- all admin page components
- NAV_ITEMS array in AdminLayout.tsx -- single source of truth for sidebar navigation

---

## Admin Sections (10 total)

### 1. Dashboard (`/admin`)
- 4 KPI metric cards (total users, active scans, revenue, support tickets)
- User Growth AreaChart (30 days rolling)
- Scan Volume BarChart (7 days, completed vs failed)
- **File:** `src/pages/admin/AdminDashboard.tsx`

### 2. Users (`/admin/users`)
- Paginated user table with search + plan/role filters
- Inline actions: change plan, change role, ban/unban, reset scans
- Checkbox multi-select for bulk operations
- Bulk action bar: change plan, reset scans (with confirmation)
- `useBulkChangePlan` + `useBulkResetScans` -- Promise.all + single audit log entry
- CSV export via `useExportUsers` (fetches all rows, browser Blob download)
- **Files:** `src/pages/admin/Users.tsx`, `src/hooks/admin/use-admin-users.ts`, `src/hooks/admin/use-admin-actions.ts`

### 3. User Detail (`/admin/users/:userId`)
- Individual user profile, scan history, billing info
- **File:** `src/pages/admin/UserDetail.tsx`

### 4. Scans (`/admin/scans`)
- All scans across all users with status filters
- Retry failed scans: `useAdminRetryScan` resets to pending + invokes `analyze-url` edge function
- **Files:** `src/pages/admin/Scans.tsx`, `src/hooks/admin/use-admin-scans.ts`

### 5. Audit Log (`/admin/audit-log`)
- Full admin action history with filters (action type, date range)
- **File:** `src/pages/admin/AuditLog.tsx`

### 6. Billing (`/admin/billing`)
- Billing overview and revenue metrics
- **File:** `src/pages/admin/Billing.tsx`

### 7. System (`/admin/system`) -- super_admin only
- **Plan Limits Editor:** Edit scan limits per tier (free/pro/agency), min/max validation
- **Pillar Weights Editor:** Edit CRO pillar weights, live total% validator (must sum 100%)
- Both save to `system_config` table with audit log
- **Files:** `src/pages/admin/System.tsx`, `src/hooks/admin/use-admin-system.ts`

### 8. Feature Flags (`/admin/flags`)
- Toggle feature flags stored in `system_config` table
- Flag definitions with categories (ui/feature/system), descriptions, defaults
- Some flags require super_admin role
- Current flags: `agent_hub_enabled`, `integrations_enabled`, `pdf_export_enabled`, `free_scan_enabled`, `support_enabled`
- **Files:** `src/pages/admin/FeatureFlags.tsx`, `src/hooks/admin/use-feature-flags.ts`

### 9. Integrations (`/admin/integrations`)
- Central hub for all platform service connections (Dodo Payments, Supabase, Resend, PageSpeed, Screenshot Service, Anthropic)
- Row-by-row collapsible layout (Yash rejected 2-column grid)
- **Redesigned 2026-04-06:** Tabbed detail panel (Overview | Configuration | Setup Guide) inside each collapsible card
- **Brand SVG icons:** 6 inline SVG components (SupabaseIcon, GoogleIcon, AnthropicIcon, ResendIcon, DodoPaymentsIcon, ScreenshotIcon) typed as `React.FC<{ className?: string }>`
- **Copy-to-clipboard:** on env var names with group-hover reveal (`group-hover/envrow:opacity-100`)
- **Left-border accent:** color-coded by category when card is expanded (`border-l-4` + `accentColor`)
- **Status badges:** colored dot (1.5x1.5 rounded-full) + text label (Vercel/Linear style)
- **Red alert banner:** above tabs if any env vars are `resolved === false`
- **StatChip summary row:** 4 stat chips (total, connected, server-side, not configured) with conditional danger styling
- **CATEGORY_STYLE lookup:** centralized icon bg/color per category (white for colorful logos, dark for Resend)
- **Full pattern:** `~/.claude/memory/patterns/good/admin-integrations-pattern.md`
- **File:** `src/pages/admin/Integrations.tsx`

### 10. Support (`/admin/support`)
- Tabbed ticket table (all/open/in_progress/resolved/closed)
- Expandable accordion rows showing full ticket details + messages
- Admin can respond, change status, assign
- User-facing support tab exists in Settings page
- **Files:** `src/pages/admin/Support.tsx`, `src/hooks/admin/use-admin-support.ts`, `src/hooks/use-support.ts`

---

## Admin UI Patterns

### Bulk Operations Pattern
```
1. Checkbox multi-select on table rows
2. Bulk action bar appears when selections > 0
3. Confirmation dialog before executing
4. Promise.all() for per-user updates
5. ONE audit log entry with metadata: { user_ids: string[], count: number }
6. Cache invalidation: ['admin', 'users']
7. Toast: "Changed plan for {count} users"
```

### Admin Config Editors Pattern
```
1. Read current config from system_config via React Query
2. Pre-fill form with current values
3. Client-side validation before save (e.g., weights must sum 100%)
4. Upsert to system_config on save
5. Write audit log with old + new values
6. Invalidate both admin and app query keys
7. Toast with confirmation
```

### Row-by-Row Collapsible for Integration Lists (Upgraded to Tabs)
**Context:** Admin pages that display a list of service integrations / connections.
**Pattern:** Use shadcn/ui `Collapsible` component -- single column vertical list, NOT a card grid. **Upgraded 2026-04-06:** CollapsibleContent now uses `Tabs` (Overview | Configuration | Setup Guide) instead of vertical info dump.
**Why:** Yash explicitly rejected the 2-column card grid layout and requested row-by-row collapsible. Tabs further improve scannability by letting admins jump directly to what they need.
```tsx
<Collapsible open={open} onOpenChange={setOpen}
  className={cn(
    "rounded-xl border bg-card overflow-hidden transition-all duration-200",
    open ? cn("border-border shadow-md border-l-4", integration.accentColor) : "border-border/60 shadow-sm hover:border-border hover:shadow-md"
  )}>
  <CollapsibleTrigger asChild>
    <button className="w-full flex items-center justify-between px-5 py-4 text-left ...">
      {/* Brand SVG icon | Name + subtitle + category badge | Status dot badge | ChevronDown */}
    </button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* Alert banner (if missing env vars) */}
    <Tabs defaultValue="overview">
      <TabsContent value="overview">...</TabsContent>
      <TabsContent value="configuration">...</TabsContent>
      <TabsContent value="setup">...</TabsContent>
    </Tabs>
    {/* Footer: Test Connection button + external link */}
  </CollapsibleContent>
</Collapsible>
```
**Full pattern:** `~/.claude/memory/patterns/good/admin-integrations-pattern.md`

---

## Admin Nav Item Verification Rule

**CRITICAL:** After any agent adds a new admin page, ALWAYS verify:
1. The page file exists in `src/pages/admin/`
2. The nav item with correct icon import is in AdminLayout.tsx NAV_ITEMS array
3. The route is registered in App.tsx under the `/admin` parent route

Koda failed to write the Integrations nav item on first attempt (2026-04-06) despite reporting success. Always `grep` the file after agent runs.

---

## Known Issues / Lessons

1. **Nav item without route (404):** An `/admin/integrations` nav item was added but the route was missing in App.tsx. Always cross-check nav items against route definitions.
2. **Missing Integrations nav item:** Koda claimed it added the nav item to AdminLayout.tsx but the change was not actually written to the file. Require verification after Koda claims to modify shared layout files.
3. **Integrations layout rejection:** First version used 2-column card grid. Yash preferred row-by-row collapsible layout. For admin pages with many config items, use collapsible rows, not card grids.

---

*(Updated by Mira -- 2026-04-06)*
