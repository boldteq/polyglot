---
name: ConvertScan (CROBOT) -- Reusable Patterns
description: Patterns discovered and validated in CROBOT that should be reused in future work on this project and potentially promoted to global patterns.
type: project
last_updated: 2026-04-06
---

## Project-Specific Patterns

---

### system_config Table for Admin-Controlled Runtime Config
**Context:** Any admin-controlled config (feature flags, plan limits, pillar weights) in a Supabase project.
**Pattern:** Single `system_config` table with key TEXT PK, value JSONB, updated_at TIMESTAMPTZ. RLS-protected for admin/super_admin only.
**Why:** Simple key/value store that scales to any config type without separate tables. JSONB allows flexible schema per key. Validation happens in hooks, not at DB level.
**SQL:**
```sql
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage system_config" ON system_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );
```
**Relationships:** Prevents: localStorage feature flags antipattern. Related: useFeatureFlag hook pattern (below).
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 3 (feature flags, plan limits, pillar weights)
**Knowledge Version:** v1

---

### useFeatureFlag(key, defaultValue) -- Silent Fallback Hook
**Context:** Any React component that needs to check a feature flag without breaking if the table doesn't exist yet.
**Pattern:** `useFeatureFlag(key: string, defaultValue = true): boolean` -- reads from `system_config` via React Query with 5-minute staleTime. Never throws. Returns defaultValue while loading or on error.
**Why:** Feature flags must never break the app. During development (before table exists), during loading, or on network error, the app should work with sensible defaults. Silent fallback means flags are opt-in, not opt-out.
**Implementation:**
```tsx
export function useFeatureFlag(key: string, defaultValue = true): boolean {
  const { data } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchAllFeatureFlags,
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  });
  if (data === undefined) {
    const flagDef = FLAG_DEFINITIONS.find((f) => f.key === key);
    return flagDef?.defaultValue ?? defaultValue;
  }
  return data[key] ?? defaultValue;
}
```
**Key design decisions:**
- Fetches ALL flags in one query (not one per flag) -- single network request
- 5-minute staleTime for app-level consumers (flags change rarely)
- 60-second staleTime for admin-level consumers (need faster updates)
- On mutation: invalidate BOTH `['admin', 'feature-flags']` AND `['feature-flags']` query keys
**Relationships:** Depends on: system_config table pattern (above). Prevents: localStorage feature flags.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 3 (sidebar nav filtering, PDF gate, free scan gate)
**Knowledge Version:** v1

---

### Hash-Based Deterministic Teaser Scores for Guest Users
**Context:** Showing a "preview" score to unauthenticated users without making API calls.
**Pattern:** Compute a deterministic score from the URL string using charCode sum:
```tsx
const hash = Array.from(url).reduce((acc, c) => acc + c.charCodeAt(0), 0);
const teaserScore = (hash % 28) + 45; // Range: 45-72
```
**Why:** Same URL always produces the same score -- feels real and consistent. No API cost. Score range is deliberately mediocre (45-72) to motivate signup ("your site needs work").
**Relationships:** Part of the ScanGateWall component. Conversion-optimized: shows enough to hook, withholds enough to convert.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Google Favicon API with Globe SVG Fallback
**Context:** Displaying site favicons next to URLs in scan history / reports.
**Pattern:** `https://www.google.com/s2/favicons?domain={domain}&sz=32` with `<img onError>` that swaps to a Globe SVG icon.
```tsx
<img
  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
  className="h-5 w-5 rounded"
  alt=""
  onError={(e) => { e.currentTarget.style.display = 'none'; setShowFallback(true); }}
/>
{showFallback && <Globe className="h-5 w-5 text-muted-foreground" />}
```
**Why:** Free, fast, no API key required. Works for most domains. Fallback handles domains without favicons or blocked Google requests.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Bulk Operations with Single Audit Log Entry
**Context:** Admin performing bulk actions (change plan, reset scans) on multiple users.
**Pattern:**
```tsx
const results = await Promise.all(
  userIds.map((uid) => supabase.from("profiles").update({ plan }).eq("id", uid))
);
// ONE audit log entry, not one per user
await writeAuditLog(adminId, "bulk_change_plan", "profiles", "bulk", {
  user_ids: userIds,
  count: userIds.length,
  new_plan: plan,
});
```
**Why:** Looping audit logs per user creates noise and slows down bulk operations. A single entry with metadata: `{ user_ids, count }` is cleaner and more actionable for audit review.
**Relationships:** Related: Admin panel patterns in `project_admin.md`.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 2 (bulk change plan, bulk reset scans)
**Knowledge Version:** v1

---

### Pillar Weight Validation (Must Sum to 100%)
**Context:** Admin editing CRO pillar weights in the System page.
**Pattern:** Live total percentage validator -- display current sum, disable save if sum != 100%, show red warning.
```tsx
const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
const isValid = total === 100;
// Show: "Total: 98% (must equal 100%)" in red if invalid
// Disable Save button when !isValid
```
**Why:** Pillar weights must sum to exactly 100% for the scoring algorithm to work correctly. Client-side validation prevents invalid state from being saved.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Dashboard At-Limit Amber Warning State
**Context:** User dashboard when scans used equals or exceeds scan limit.
**Pattern:** When `scansUsed >= scanLimit`:
- Amber warning banner at top of dashboard
- URL input field disabled with visual indicator
- "Upgrade Plan" CTA button prominent
- Prevents wasted API calls (no scan submission when at limit)
**Why:** Better UX than letting users submit and get an error. Drives upgrade conversion at the exact moment the user feels the limit.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Settings Billing Tab (Free User Optimization)
**Context:** Settings page billing tab for a freemium SaaS.
**Pattern:**
- Plan card with gradient background showing current tier
- Usage progress bar (scansUsed / scanLimit) with percentage
- Plan comparison table shown ONLY for free users (drives upgrades)
- Billing history section (empty state for users without payment history)
**Why:** Free users see the comparison table as a constant upgrade nudge. Pro/Agency users don't need it -- they see their current plan details and usage instead.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### SidebarMenuButton Must Have tooltip + isActive Props
**Context:** shadcn/ui `SidebarMenuButton` component in collapsed sidebar state.
**Pattern:** Always pass `tooltip={item.title}` AND `isActive={isCurrentPage}` to every SidebarMenuButton.
**Why:** Without `tooltip`, the collapsed sidebar shows icon-only buttons with no way to identify them. Without `isActive`, there's no visual indicator of the current page.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 1
**Knowledge Version:** v1

---

### DropdownMenuTrigger from shadcn, Never from Radix Primitives
**Context:** Any dropdown menu in a shadcn/ui project.
**Pattern:** Import `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`, NEVER from `@radix-ui/react-dropdown-menu`.
**Why:** Mixing Radix primitive imports with shadcn wrapper imports causes type conflicts and breaks composition patterns. shadcn's DropdownMenuTrigger includes necessary ref forwarding and styling that the primitive lacks.
**Source:** ConvertScan (CROBOT), 2026-04-05 (TopBar rewrite)
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Supabase Migrations: Manual Application for Lovable-Origin Projects
**Context:** Any Supabase-backed project scaffolded via Lovable or without a local Supabase CLI + Docker setup.
**Pattern:** Lovable does NOT auto-apply SQL migrations from `supabase/migrations/`. You must manually apply them via the Supabase SQL Editor (Dashboard > SQL Editor > New query). For projects with multiple migration files, combine them into a single SQL block in dependency order:
1. Schema creation (CREATE TABLE, types, functions)
2. RLS policies (ALTER TABLE ... ENABLE ROW LEVEL SECURITY, CREATE POLICY)
3. Triggers (CREATE FUNCTION ... RETURNS TRIGGER, CREATE TRIGGER)
4. RBAC/seed data (INSERT/UPDATE for initial config, admin roles)

**Example combined migration block:**
```sql
-- 001_schema.sql
CREATE TABLE IF NOT EXISTS profiles (...);
CREATE TABLE IF NOT EXISTS scans (...);
-- ... all tables

-- 002_rls.sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON profiles FOR ALL USING (...);
-- ... all policies

-- 003_triggers.sql
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ ... $$;
CREATE TRIGGER ... ON profiles ...;
-- ... all triggers

-- 004_admin_rbac.sql
-- Admin backfill
UPDATE profiles SET role = 'admin' WHERE email = 'your-admin@email.com';
```
**Why:** Without this, the app code is "complete" but the database has zero tables -- every query fails silently or with 404. This is especially dangerous because the app builds successfully (TypeScript doesn't validate runtime database existence).
**Relationships:** Prevents: BUG-008 (zero tables). Related: SQL Migrations as Comments in Hook Files pattern (above).
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Post-Redesign Verification Checklist
**Context:** After any large-scale UI redesign (10+ files changed) by any agent.
**Pattern:** Run this verification sequence immediately after a redesign:
```bash
# 1. Build check -- catches most undefined components
npm run build

# 2. Grep for common placeholder component names agents invent
grep -rn "BrandIcon\|PlaceholderIcon\|CustomIcon\|LogoIcon\|AppIcon\|MockIcon" src/

# 3. Verify all lucide-react imports are real icons
grep -h "from \"lucide-react\"" src/**/*.tsx | sed 's/.*import {//' | sed 's/}.*//' | tr ',' '\n' | tr -d ' ' | sort -u | while read icon; do
  grep -q "export.*$icon" node_modules/lucide-react/dist/esm/icons/index.js 2>/dev/null || echo "MISSING: $icon"
done

# 4. Check for components used but never defined or imported
# (TypeScript strict mode catches most, but not all patterns)
npm run lint
```
**Why:** Redesign agents working across many files in a single session are prone to introducing placeholder component names, orphaned imports, or components that "look right" but don't exist. The build may pass if the undefined component is used in a way that doesn't trigger a type error (e.g., JSX self-closing tag that resolves to `undefined`).
**Relationships:** Prevents: BUG-007 (BrandIcon undefined). Related: Post-page-creation check in antipatterns.md.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Inline SVG Brand Icons for Admin Integration Pages
**Context:** Admin Integrations page where each service card needs a recognizable icon (Supabase, Google, Anthropic, Resend, Dodo Payments, Screenshot Service).
**Pattern:** Create inline SVG components typed as `React.FC<{ className?: string }>` (NOT `React.ElementType`). Use official brand SVG paths with correct colors/gradients. Store icon background/color in a `CATEGORY_STYLE` lookup map.
**Why:** Generic Lucide icons (CreditCard, Zap, Gauge) are visually indistinguishable at small sizes and make the admin panel feel generic. Brand SVGs provide instant recognition. The type distinction from Lucide's `React.ElementType` prevents composition bugs.
**Key implementation detail:** Some brand logos are already colorful (Google, Supabase) and need white or transparent backgrounds. Dark-branded services (Resend) need `bg-gray-900 text-white` backgrounds.
**Relationships:** Exception to "Lucide only" icon rule in `ui-ux-production-standards.md` (justified for brand recognition in admin pages). Full pattern: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Tabbed Detail Panel Inside Collapsible Cards
**Context:** Collapsible card list where each card has multiple categories of information (overview, configuration, setup steps).
**Pattern:** Replace vertical info dump with `Tabs` component inside CollapsibleContent. Default to "overview" tab. Keep tabs compact (`h-9`, triggers at `h-7 text-xs`, `w-auto`).
**Why:** Vertical dump makes expanded cards too tall, pushing other cards offscreen. Tabs let the admin jump directly to Configuration or Setup Guide. Overview tab serves as default context for unfamiliar services.
**Relationships:** Upgraded version of "Row-by-Row Collapsible" pattern in `project_admin.md`. Full pattern: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Copy-to-Clipboard with Group-Hover Reveal
**Context:** Environment variable names in admin configuration panels that admins need to copy to deployment configs.
**Pattern:** `CopyButton` component invisible by default, reveals on row hover via `group-hover/envrow:opacity-100`. Uses `navigator.clipboard.writeText` + sonner toast. Shows `Check` icon for 2s. Must call `e.stopPropagation()` if inside a Collapsible/Accordion to prevent parent toggle.
**Why:** Explicit copy buttons clutter the UI when not needed. Group-hover reveals keep the interface clean while still being discoverable. `stopPropagation` is critical when CopyButton lives inside a CollapsibleTrigger ancestor.
**Relationships:** Full pattern: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Left-Border Accent Color for Expanded Cards
**Context:** Collapsible card list where multiple cards may be open simultaneously.
**Pattern:** Each card definition has `accentColor: string` (Tailwind class like `"border-l-emerald-500"`). Apply `border-l-4` + accentColor when card is open. Remove when closed.
**Why:** When multiple cards are expanded, left-border accents provide color-coded context so the admin does not lose track of which service they are configuring.
**Relationships:** Full pattern: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### StatChip Conditional Danger Variant
**Context:** Summary stat chips at the top of admin pages showing counts (total, connected, missing, etc.).
**Pattern:** Danger variant renders red only when `count > 0`; neutral styling when count is 0. Prevents alarm fatigue from permanent red badges that represent a zero-count non-issue.
**Relationships:** Full pattern: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

*(Updated by Mira -- 2026-04-06, session 5: Admin Integrations redesign patterns extracted.)*
