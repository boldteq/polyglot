# Stack A-Lovable — Lovable Project Patterns

description: Patterns for editing Lovable-generated projects in VS Code + Claude Code without breaking Lovable's AI editor compatibility

---

## Stack

Vite + React 18+ + TypeScript + Tailwind CSS + shadcn/ui + Radix UI + Supabase + React Router

---

## When This Applies

Yash builds initial versions in Lovable (AI-powered builder at lovable.dev), then clones via GitHub and opens in VS Code with Claude Code for advanced editing. The Lovable project structure MUST be preserved — Lovable's AI editor depends on the exact folder layout to function.

---

## Folder Structure (Sacred — DO NOT CHANGE)

```
src/
  components/            # Custom components (PascalCase: MyComponent.tsx)
    ui/                  # shadcn/ui primitives — NEVER manually edit
  hooks/                 # ALL custom hooks live here (useMyHook.ts)
  integrations/
    supabase/
      client.ts          # Supabase client — single instance, DO NOT duplicate
      types.ts           # Auto-generated DB types — DO NOT manually edit
  lib/                   # Utilities (camelCase: utils.ts, formatDate.ts)
  pages/                 # Route components (PascalCase: Dashboard.tsx, Settings.tsx)
  App.tsx                # Main app + React Router routes — routing lives HERE
  main.tsx               # Entry point — DO NOT modify
  index.css              # Global styles + Tailwind base
supabase/
  config.toml            # Supabase CLI config
  migrations/            # SQL migrations — YYYYMMDDHHMMSS_description.sql format
public/                  # Static assets
```

### Root Config Files
- `vite.config.ts` — Vite bundler config (dev server port 8080)
- `tailwind.config.ts` — Tailwind configuration
- `tsconfig.json` — TypeScript config (paths: `@/` → `src/`)
- `components.json` — shadcn/ui configuration
- `postcss.config.js` — PostCSS setup
- `eslint.config.js` — ESLint rules

---

## Detection

Identify a Lovable project by these markers:
- `vite.config.ts` at root (NOT `next.config.js`)
- `src/integrations/supabase/` directory exists
- `src/pages/` with PascalCase `.tsx` files
- `components.json` at root (shadcn config)
- `src/App.tsx` with React Router routes

---

## Critical Rules

### DO
- Keep all files in Lovable's expected locations
- Use PascalCase for pages and components, camelCase for utilities
- Import Supabase client from `@/integrations/supabase/client`
- Use `Tables<'table_name'>`, `TablesInsert<>`, `TablesUpdate<>` from `@/integrations/supabase/types`
- Use `@/` path alias for ALL imports (mapped to `src/` in tsconfig)
- Use Tailwind + shadcn/ui for styling
- Add new routes in `App.tsx` via React Router
- Use timestamp format for migrations: `YYYYMMDDHHMMSS_description.sql`
- Use `VITE_` prefix for client-side environment variables

### NEVER
- Restructure folders — Lovable's AI depends on the exact layout
- Use Next.js patterns (no `app/` dir, no server components, no `getServerSideProps`, no API routes)
- Edit `src/main.tsx` or auto-generated `src/integrations/supabase/types.ts`
- Use relative `../../` imports — always `@/`
- Change Vite dev server port (stays 8080)
- Create CSS modules, styled-components, or inline style objects
- Create a second Supabase client instance
- Use sequential migration numbering (001_, 002_) — timestamps only

---

## How to Add Things

| What | Where | Example |
|------|-------|---------|
| New page | `src/pages/NewPage.tsx` + route in `App.tsx` | `<Route path="/new" element={<NewPage />} />` |
| New component | `src/components/NewComponent.tsx` | PascalCase, export default |
| New hook | `src/hooks/useNewHook.ts` | `export function useNewHook()` |
| New utility | `src/lib/newUtil.ts` | camelCase filename |
| New shadcn component | CLI: `npx shadcn-ui@latest add [name]` | Installs to `src/components/ui/` |
| New migration | `supabase/migrations/YYYYMMDDHHMMSS_add_table.sql` | Timestamp format |
| New env var (client) | `.env` with `VITE_` prefix | `VITE_MY_KEY=value` |
| New env var (server) | `.env` without prefix | `MY_SECRET=value` |

---

## Supabase Patterns

### Client Usage
```typescript
import { supabase } from '@/integrations/supabase/client'

// Query
const { data, error } = await supabase
  .from('my_table')
  .select('*')
  .eq('user_id', userId)

// Insert
const { error } = await supabase
  .from('my_table')
  .insert({ column: value })

// Real-time subscription
supabase
  .channel('my_channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'my_table' }, callback)
  .subscribe()
```

### Type Safety
```typescript
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types'

type MyRow = Tables<'my_table'>
type MyInsert = TablesInsert<'my_table'>
type MyUpdate = TablesUpdate<'my_table'>
```

---

## Admin Config Patterns (system_config Table)

### system_config Table for All Admin-Controlled Config
**Context:** Any Lovable SaaS with admin panel that needs feature flags, plan limits, or dynamic configuration.
**Pattern:** Single `system_config` table: `key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. RLS: admin/super_admin only. Store feature flags, plan limits, pillar weights, etc. as separate keys with JSONB values.
**Why:** Simple, flexible, one table for all config. JSONB allows any schema per key. RLS protects admin-only access. React Query caching means minimal DB hits.
**Example:**
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
**Relationships:** Related: admin-panel-standards.md. Used with: useFeatureFlag hook pattern (below).
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

### useFeatureFlag Hook (App-Level, Silent Fallback)
**Context:** App components that need to check if a feature is enabled/disabled.
**Pattern:** `useFeatureFlag(key, defaultValue = true)` hook that reads from `system_config` table via React Query. Never throws -- returns `defaultValue` during loading or on error. Long staleTime (5 min) since flags change rarely.
**Why:** App must work even if `system_config` table doesn't exist yet (new Supabase instance). Silent fallback ensures no crashes. Long staleTime reduces DB pressure. `defaultValue = true` means features are ON by default unless explicitly disabled.
**Example:**
```tsx
// App component -- silent, never breaks
const agentHubEnabled = useFeatureFlag("agent_hub_enabled", true);
if (!agentHubEnabled) return null; // hide the feature

// Admin component -- full CRUD
const { data } = useFeatureFlags(); // admin hook, shorter staleTime
const updateFlag = useUpdateFeatureFlag(); // mutation with toast feedback
```
**Key detail:** Admin mutation must invalidate BOTH `['admin', 'feature-flags']` AND `['feature-flags']` query keys so both admin panel and user app see updates immediately.
**Relationships:** Requires: system_config table (above). Antipattern: "Feature flags in localStorage" (patterns/avoid/antipatterns.md).
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

### Hash-Based Teaser Score for Guest Gate Walls
**Context:** SaaS apps that want to show unauthenticated users a "taste" of the product to drive signups.
**Pattern:** Generate a deterministic score from the URL string: `String.fromCharCode` sum of URL characters, modulo a range, plus a base offset. Example: range 27, base 45 = scores between 45-72 (always mediocre, motivates signup).
**Why:** Same URL always produces same score -- feels real and consistent. No API calls needed for unauthenticated users (zero cost). Mediocre range creates urgency ("your site needs improvement").
**Relationships:** Related: SaaS growth patterns (patterns/good/saas-growth-onboarding.md). Implements: free tier strategy.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

### Bulk Admin Operations with Single Audit Log
**Context:** Admin panel with multi-select table rows and bulk actions (change plan, reset usage, etc.).
**Pattern:** Use `Promise.all()` to run individual updates in parallel, then write a single audit log entry with `metadata: { user_ids: [...], count: N }`.
**Why:** Individual updates are simpler than building a bulk RPC function. Single audit log entry keeps the log clean (one "bulk plan change" entry instead of 50 individual entries). `Promise.all` gives parallelism for speed.
**Relationships:** Related: admin-panel-standards.md (bulk operations section).
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

### Google Favicon API with SVG Fallback
**Context:** Any list/table that shows website URLs and needs favicons.
**Pattern:** `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" onError={(e) => /* show Globe SVG fallback */} />`
**Why:** Google's favicon API is free, fast, and handles most domains. `onError` fallback handles missing favicons (new sites, intranet URLs) gracefully with a Globe icon instead of broken image.
**Source:** ConvertScan (CROBOT), 2026-04-05
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Gotchas

1. **Lovable auto-generates `types.ts`** — if you add tables via Supabase dashboard or migrations, you need to regenerate types: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`
2. **React Router, not file-based routing** — pages don't auto-route. You must add `<Route>` in `App.tsx`.
3. **No SSR** — This is a client-side SPA. No server-side rendering, no `loader` functions, no server components.
4. **Port 8080** — Lovable projects default to port 8080, not 3000 or 5173.
5. **shadcn/ui components in `ui/`** — Don't manually copy component code. Use the CLI to install.
6. **NEVER use `file:` or `link:` local dependencies** in package.json — they break Lovable builds, Vercel deploys, and CI/CD. Incident: `"@boldteq/agents": "file:../claude-hub/sdk"` caused `bun install` to silently fail by treating `.env` as the install target. If you need shared code, copy it into the project or publish to npm.
7. **Always verify after adding deps** — run `npm run build` (or `bun run build`) to confirm nothing is broken.
8. **Don't install Node.js-only packages** — packages that use `fs`, `path`, `crypto`, or other Node APIs will crash in the browser. Use browser-compatible alternatives.
9. **Check React version BEFORE installing** — run `npm ls react` to see your version. Many packages don't support React 19 yet. If peer dep conflicts arise, use `overrides` in package.json, not `--force`.
10. **Install packages ONE AT A TIME** — install one, verify build, then install next. Never add 5+ packages at once — you can't isolate which one broke things.
11. **Don't mix package managers** — if project has `bun.lockb`, use bun. If it has `package-lock.json`, use npm. Never use both. If switching, delete the other's lock file + `node_modules/` first.
12. **Review vite.config.ts after Lovable auto-fixes** — Lovable's AI often corrupts the Vite config when trying to fix dependency issues. Always review: `base` should be `'./'`, `outDir` should be `'dist'`, and only installed plugins should be listed.
13. **Blank screen = check browser console** — if app shows blank page after package install, open DevTools console. The error there tells you what broke (failed import, duplicate React, missing module, etc.).

---

## Production React 18 Patterns (CROBOT Session — 2026-04-06)

### QueryClient — Production Config
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error) => {
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("401") || msg.includes("403")) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});
```
Never use bare `new QueryClient()` — defaults cause excessive re-fetches and infinite retries on auth errors.

### Admin Sidebar Persist via sessionStorage
Layout components remount on every route change. Always use lazy initializer:
```ts
const [collapsed, setCollapsed] = useState<boolean>(() => {
  try { return sessionStorage.getItem("admin:sidebar") === "true"; } catch { return false; }
});
```

### App Sidebar Restore From Cookie
shadcn `SidebarProvider` writes `sidebar:state` cookie automatically. Read it:
```ts
const defaultOpen = (() => {
  const match = typeof document !== "undefined"
    ? document.cookie.split(";").find(c => c.trim().startsWith("sidebar:state="))
    : undefined;
  return match ? match.split("=")[1]?.trim() === "true" : true;
})();
<SidebarProvider defaultOpen={defaultOpen}>
```

### useSyncExternalStore (React 18) for External Stores
Replace `useState(0)` + forceUpdate pattern:
```ts
const snapshot = useSyncExternalStore(
  store.subscribe.bind(store),
  () => ({ data: store.getData(key) }),
  () => ({ data: [] })
);
```

### text-2xs Utility Class
Add to `@layer utilities` in `index.css`:
```css
.text-2xs { font-size: 0.625rem; line-height: 1rem; }
```
Use for badges, metadata, tiny labels instead of `text-[10px]` or `text-[9px]`.

### Non-Theme Color Tokens in :root
```css
:root {
  --mac-red: 0 80% 67%;
  --mac-yellow: 38 100% 59%;
  --mac-green: 133 53% 52%;
}
```
Use as `bg-[hsl(var(--mac-red))]`. Hardcoded `bg-[#FF5F57]` must be replaced with this pattern.

### Copy Button Timer Cleanup
```tsx
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
const handleCopy = async () => {
  if (timerRef.current) clearTimeout(timerRef.current);
  await navigator.clipboard.writeText(text);
  setCopied(true);
  timerRef.current = setTimeout(() => setCopied(false), 2000);
};
```

### ChartErrorBoundary for Recharts
```tsx
// src/components/shared/ChartErrorBoundary.tsx
export class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Chart unavailable</div>;
    }
    return this.props.children;
  }
}
```
Wrap every `<ResponsiveContainer>` to prevent blank screens from unexpected data.

### Arbitrary Font Size Replacements
| Arbitrary | Standard |
|-----------|----------|
| `text-[9px]` / `text-[10px]` | `text-2xs` |
| `text-[11px]` | `text-xs` |
| `text-[13px]` | `text-sm` |
| `text-[15px]` | `text-base` |
| `text-[22px]` / `text-[24px]` | `text-2xl` |
| `text-[28px]` | `text-3xl` |
| `lg:text-[3.5rem]` | `lg:text-6xl` |

---

## Billing Provider Migration Pattern (Lovable + Supabase Edge Functions)

### Dodo Payments Migration Checklist
**Context:** When migrating from Stripe (or any provider) to Dodo Payments in a Lovable/Supabase project.
**Why:** Billing migrations touch edge functions, hooks, types, env vars, admin UI, legal pages, and DB schema. Missing any one of these creates silent inconsistencies that confuse agents and developers.

**Steps (in order):**
1. Create new edge functions: `dodo-checkout`, `dodo-webhook`, `dodo-portal`
2. Create DB migration: rename old provider columns (e.g., `stripe_customer_id` -> `dodo_customer_id`)
3. Apply migration: `npx supabase db push`
4. Update frontend hooks (`use-billing.ts`): change edge function names
5. Update type files: `src/types/database.ts` AND `src/integrations/supabase/types.ts`
6. Update admin UI: Integrations page, System page
7. Update legal pages: Terms, Privacy
8. Update `.env.example`: remove old vars, add new vars (NO `VITE_` prefix for Dodo -- server-side only)
9. Remove old provider: delete package from package.json, delete old edge functions, delete utility files
10. Update CLAUDE.md: all provider references, env vars section, function names
11. Run `npm run build` to verify
12. Grep entire codebase for old provider name to catch stragglers

**Relationships:** See `patterns/avoid/antipatterns.md` "Billing Migration Antipatterns" for what goes wrong without this checklist.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

## UI Modernization Patterns (shadcn/ui Visual Refresh)

**Full patterns file:** `~/.claude/memory/patterns/good/ui-redesign-shadcn.md`

**Quick reference -- highest-leverage changes (in execution order):**

1. **`--radius` CSS variable** (0.5rem -> 0.75rem) -- ripples through every shadcn component. Start here.
2. **Shadow + border tokens** -- lighten shadows to `soft` tokens, lighten `--border` by 2%. Cards "float" instead of "sit".
3. **PageHeader title** (`text-xl font-semibold` -> `text-2xl font-bold tracking-tight`) -- biggest typography win.
4. **Card component** (`rounded-lg border shadow-sm` -> `rounded-xl border-border/40 shadow-soft`) -- propagates to every page.
5. **Badge variants** -- add `success`, `warning`, `info` to `badge.tsx` for semantic status badges.
6. **Card grid -> Data table** for list/report pages -- highest-impact single page transformation.
7. **Staggered entrance animations** on KPI cards -- `animationFillMode: "both"` prevents pre-animation flash.
8. **Settings tabs: underline style** | **Content tabs: pill style** -- two distinct tab patterns for different contexts.
9. **Always-visible action buttons** over hover-reveal -- better for discoverability and touch devices.

**Execution order:** Tokens -> Shared Components -> High-Impact Pages -> Secondary Pages -> Navigation Shell.

---

## shadcn Sidebar Patterns (CROBOT Session -- 2026-04-06)

**Full patterns file:** `~/.claude/memory/patterns/good/sidebar-patterns.md`

**Quick reference -- critical rules:**

1. **Always use shadcn `Sidebar` + `SidebarProvider`** -- never custom `<aside>`. Gets you: cookie persistence, mobile drawer, tooltips, smooth transitions.
2. **Collapsed styling via `group-data-[collapsible=icon]:*`** -- the Sidebar root has `class="group"` + `data-collapsible="icon"`. Use CSS variants, NOT `useSidebar()` state.
3. **Active icon color: `text-white`** -- not `text-primary` (invisible on colored active backgrounds).
4. **Admin sidebar = user sidebar** -- same shadcn component stack, only nav items differ.
5. **Icon size override: `!h-[18px] !w-[18px]`** -- SidebarMenuButton cva forces `[&>svg]:size-4`. Need `!` important to override.
6. **Gate separators with adjacent conditions** -- `{!collapsed && <Separator />}` prevents orphan lines.
7. **No duplicate navigation** -- each destination in exactly one place (sidebar OR topbar, never both).
8. **Cookie-based sidebar restore:**
```ts
const defaultOpen = (() => {
  const match = typeof document !== "undefined"
    ? document.cookie.split(";").find(c => c.trim().startsWith("sidebar:state="))
    : undefined;
  return match ? match.split("=")[1]?.trim() === "true" : true;
})();
<SidebarProvider defaultOpen={defaultOpen}>
```

---

## Package Installation Protocol (MANDATORY)

**For full details, read:** `~/.claude/memory/patterns/good/lovable-package-management.md`

Quick version — run this for EVERY package install:

```bash
# 1. Pre-check
npm ls react                    # Know your React version
npm info <package> peerDeps     # Check compatibility

# 2. Install
npm install <package>           # One package at a time

# 3. Verify (NEVER SKIP)
npm run build                   # Must pass
npm run dev                     # Must start
# Open browser → check console → navigate to affected pages
```

---

## 2025-2026 Platform Updates

> Added: 2026-04-10. Sources: Vite 6, shadcn/ui Oct 2025, Supabase 2025, TypeScript 6.0.

### Vite 6 (January 2025)
- **Environment API** (experimental): Multiple entry points with distinct env vars. Framework authors benefit most.
- **Cold start**: <50ms via Rolldown's Rust-based bundler.
- **Adaptive chunk splitting**: ~40% faster page loads with zero config.
- **Node.js**: 18, 20, 22+ support. Dropped 21.
- **Turbopack**: Default bundler in Next.js, near-instant dev server.

### shadcn/ui October 2025 Additions
- `ButtonGroup` + `ButtonGroupSeparator`: split buttons, prefix/suffix controls.
- `InputGroup`: icons, buttons, text inside inputs (also works with textareas).
- `Spinner` & loader patterns: centralized loading states.
- `Kbd`, `Item`, `Empty`: keyboard hints, list rendering, empty states.
- **2026 updates**: shadcn/cli v4 (Feb 2026), RTL support, Base UI support alongside Radix UI, 1,000+ community blocks.

### Supabase Edge Functions (2025 Updates)
- Design for short-lived, idempotent operations. Heavy jobs deferred to background workers.
- **Avoid**: Recursive/nested function calls (rate limit incidents Feb 2025).
- Download functions from CLI without Docker.
- GitHub Actions CI/CD integration with `setup-cli` action.
- Bulk paste and edit secrets in dashboard.

### Supabase Realtime (2025 Patterns)
- **Broadcast**: Pub/sub for ephemeral messages (typing indicators, cursors). Lower latency.
- **Presence**: Track online users, sync shared state.
- **Postgres Changes**: RLS-aware. Use Broadcast for most realtime features (WAL has scale limits).
- **Filtering**: Granular per-column filtering. Multiple subscriptions per channel.

### Supabase RLS (2025-2026)
- **RLS enabled by default** for new tables in dashboard.
- **Index columns used in policies** — 100x improvement on large tables.
- **Wrap functions in SQL** to enable initPlan caching.
- **Use IN/ANY** operations instead of subqueries in policies.
- **Security Advisor** with Splinter for misconfiguration detection.
- Planned: OpenFGA/Zanzibar integrations for fine-grained permissions.

### TypeScript 6.0 (February 2026)
- **Strict mode is now the default** — `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes` all on by default.
- Last JavaScript-based release. TypeScript 7.0 will be Go-based.
- Temporal API types, ES2025 target support.
- **Impact**: 40% reduction in type-related bugs reaching production.
- **With AI tools**: Strict typing acts as verification layer (94% of LLM errors are type-check failures).

### React 19 `use()` Hook
- Direct promise resolution in components without useEffect/useState.
- Can be called conditionally, in loops, if statements (not a true hook).
- **Note**: Primarily for RSC. For Lovable SPAs (client-only), less applicable. Use React Query instead.
