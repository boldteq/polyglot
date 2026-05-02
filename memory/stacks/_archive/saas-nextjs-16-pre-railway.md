---
name: Stack A-16 — Next.js 16 + shadcn base-nova + Tailwind v4
description: Production SaaS stack memory for Next.js 16 apps using shadcn base-nova style, Tailwind v4 CSS-first config, strict TypeScript, and pnpm.
type: stack
last_updated: 2026-04-10
source_project: Clientloop (Phase 1 UI shell, approved by Sage) + Rankora migration plan (2026-04-10)
---

# Stack A-16 — Next.js 16 + shadcn base-nova + Tailwind v4

The current default for new Boldteq SaaS web apps. Replaces the older Next 14/15 + shadcn new-york notes in `saas-nextjs-supabase.md` for **UI layer** decisions. Backend (Supabase, Dodo) patterns still apply from that file.

**Validated on:** Clientloop Phase 1 UI shell — 9 routes, mock data, zero `any`, Sage approved.

---

## Versions (locked as of 2026-04-10)

- Next.js **16.2.3** (App Router) — **not 15**. Next 16 is the current default.
- React **19.2.4**
- TypeScript 5.x, `strict: true` + 3 extra flags (see below)
- Tailwind CSS **v4** (CSS-first, no JS config file)
- shadcn/ui CLI, style: **`base-nova`** (NOT `new-york`). Primitives: `@base-ui/react`.
- pnpm **10.33.0** (via corepack). Node 20+.

---

## Scaffold commands (exact)

```bash
# 1. Enable pnpm on fresh machine (one-time)
corepack enable
corepack prepare pnpm@latest --activate

# 2. Create the app
pnpm create next-app@latest <name> \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias "@/*" \
  --use-pnpm \
  --eslint \
  --turbopack

# 3. shadcn init — choose base-nova
cd <name>
pnpm dlx shadcn@latest init
# style: base-nova
# base color: neutral
# css variables: yes

# 4. Add components used in the Clientloop shell
pnpm dlx shadcn@latest add \
  button card badge input label textarea select \
  dialog dropdown-menu sheet separator skeleton \
  sidebar breadcrumb avatar tooltip sonner \
  table tabs switch checkbox
```

---

## tsconfig strictness (non-negotiable)

Beyond `strict: true`, enable these 3 flags:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,  // array/object access returns T | undefined
    "noImplicitReturns": true,         // every code path must return
    "noFallthroughCasesInSwitch": true // switch cases must break
  }
}
```

`noUncheckedIndexedAccess` is the one that forces clean mock-data handling — you'll get compile errors for `arr[0].foo`, which is exactly what we want.

---

## Tailwind v4 — CSS-first config (no `tailwind.config.ts`)

Tailwind v4 does NOT use a JS config file. All theme customization lives in `app/globals.css` via `@theme inline`. Older pattern docs assuming a `tailwind.config.ts` are **stale** for this stack.

### `app/globals.css` skeleton

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* Brand colors (CSS vars defined in :root below) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-ring: var(--ring);
  /* ... */

  /* Custom shadows (use instead of Tailwind defaults) */
  --shadow-soft: 0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06);
  --shadow-soft-md: 0 2px 4px -1px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08);
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.04);

  /* Custom keyframes */
  --animate-fade-in-up: fade-in-up 0.4s ease-out;

  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.58 0.22 285); /* brand violet */
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.58 0.22 285);
  /* ... */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.70 0.22 285); /* IMPORTANT: keep brand hue in dark */
  --primary-foreground: oklch(0.145 0 0);
  --ring: oklch(0.70 0.22 285);
}
```

### Dark mode `--primary` gotcha

Default shadcn dark theme sets `--primary` to near-white/achromatic. This **kills brand color** in dark mode (buttons, active nav, brand dot all go grey). Always explicitly override `--primary` and `--ring` in `.dark` to stay on brand hue.

---

## shadcn base-nova — `render` prop replaces `asChild`

**This is the #1 gotcha when migrating from new-york style.** base-nova primitives are built on `@base-ui/react`, not Radix. They do NOT accept `asChild`. They accept a **`render`** prop that takes a React element.

### Examples

```tsx
// ❌ WRONG (new-york/Radix pattern)
<SidebarMenuButton asChild>
  <Link href="/dashboard">Dashboard</Link>
</SidebarMenuButton>

// ✅ CORRECT (base-nova pattern)
<SidebarMenuButton render={<Link href="/dashboard" />}>
  Dashboard
</SidebarMenuButton>
```

```tsx
// Breadcrumb link
<BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>

// Dropdown trigger wrapping a custom button
<DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
  <MoreHorizontal className="h-4 w-4" />
</DropdownMenuTrigger>

// Button wrapping a Link
<Button render={<Link href="/inbox/new" />}>
  New request
</Button>
```

**Components known to use `render` (not `asChild`):** `Button`, `SidebarMenuButton`, `SidebarMenuSubButton`, `BreadcrumbLink`, `DropdownMenuTrigger`, `DropdownMenuItem`, `TabsTrigger`, `DialogTrigger`.

When in doubt: check the component source in `components/ui/`. If it imports from `@base-ui/react`, it's `render`. If from `@radix-ui/*`, it's `asChild`.

---

## Route group + SidebarLayout pattern

All authenticated pages live in a `(dashboard)` route group so they share the sidebar + header chrome without affecting URLs.

```
app/
├── layout.tsx                 // root: fonts, theme provider, sonner Toaster
├── page.tsx                   // redirects to /dashboard
├── not-found.tsx              // 404 with brand illustration
└── (dashboard)/
    ├── layout.tsx             // SidebarProvider + AppSidebar + AppHeader
    ├── dashboard/page.tsx
    ├── inbox/page.tsx
    ├── clients/page.tsx
    ├── services/page.tsx
    └── settings/
        ├── layout.tsx         // Link-based underline tabs
        ├── general/page.tsx
        ├── billing/page.tsx
        ├── team/page.tsx
        └── notifications/page.tsx
```

```tsx
// app/(dashboard)/layout.tsx
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppHeader } from "@/components/shell/app-header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

---

## Sidebar active state override

shadcn's default active state is muted. To brand it (violet bg + white text), override in `globals.css` under `@layer components` — **do NOT** use inline `useSidebar()` state ternaries (Sage flags these).

```css
@layer components {
  [data-sidebar="menu-button"][data-active="true"] {
    @apply bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground;
  }
  [data-sidebar="menu-button"][data-active="true"] svg {
    @apply text-primary-foreground;
  }
}
```

In the component, compute `isActive` from `usePathname()` and pass it as the `isActive` prop. Nothing else.

---

## Settings underline tabs (Link-based, NOT shadcn Tabs)

When each tab is a real Next.js route, use `Link` + `usePathname`, not shadcn `<Tabs>`. The `<Tabs>` component is for client-side-only state.

```tsx
// app/(dashboard)/settings/layout.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/notifications", label: "Notifications" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <nav className="flex gap-6 border-b border-border">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative py-3 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                active && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:content-['']",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
```

---

## KPI card animation contract

Staggered fade-in-up on dashboard KPI cards. **Always include `animationFillMode: "both"`** — without it, cards flash before the animation starts.

```tsx
<Card
  className="shadow-soft animate-fade-in-up"
  style={{
    animationDelay: `${index * 80}ms`,
    animationFillMode: "both", // ← never omit
  }}
>
  {/* ... */}
</Card>
```

---

## Dialog pattern — plain useState, no react-hook-form (for shells)

For UI shells / simple forms, skip `react-hook-form` + `zod` plumbing. Use plain controlled state and sonner for feedback. Add RHF+Zod only when hooking real APIs.

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function NewClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleSave() {
    // mock save
    toast.success(`Client "${name}" created`);
    onOpenChange(false);
    setName("");
    setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name || !email}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Inter font — propagation gotcha

Setting `inter.variable` on `<html>` is not enough. The body must have `className="font-sans"` for the font to actually apply:

```tsx
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

---

## Next 16 + pnpm — rogue lockfile warning

If `~/package-lock.json` (or any ancestor dir lockfile) exists alongside the project's `pnpm-workspace.yaml` or `pnpm-lock.yaml`, `next build` warns about ambiguous workspace root. Non-blocking but noisy.

**Fix options (pick one):**

1. Set `turbopack.root` in `next.config.ts`:
   ```ts
   import path from "node:path";
   export default {
     turbopack: { root: path.join(__dirname) },
   };
   ```
2. Delete the rogue root lockfile (if it's accidental).

---

## Mock data conventions (for UI shells)

When building a UI shell before the backend exists:

- **Fixed ISO anchor timestamp** — e.g. `const NOW = new Date("2026-04-10T10:00:00Z")`. Never `new Date()` — breaks deterministic rendering and snapshots.
- **Never `Math.random()`** — SSR/CSR mismatch, non-deterministic tests.
- **Stable IDs** — `c01`/`c02` for clients, `s01` for services, `r01` for requests, `a01` for activity, `e01` for events, `k01` for KPIs. Short, predictable, greppable.
- **Strict types everywhere** — every mock array is typed against the same `types.ts` that the real API will produce. No `as any`, no `as unknown as`.
- **Colocate** — `lib/mock-data.ts` for the data, `lib/types.ts` for the interfaces. One file each.

---

## Reusable rules (from Vega review, Clientloop punch list)

1. **Cards** use `shadow-soft` / `shadow-card` / `shadow-soft-md` — never default Tailwind `shadow-sm`/`shadow-md`.
2. **Brand accents** use `from-primary/80 to-primary`, never raw palette (`violet-500`).
3. **Segmented controls** need `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`.
4. **Data tables with filters** need a `totalCount` prop so the footer shows "Showing X of Y", not "Showing X of X".
5. **Inter font** requires `className="font-sans"` on `<body>`, not just `inter.variable` on `<html>`.
6. **Shared badge/chip components** (e.g. `SlaChip`) must be extracted when used in 2+ places.
7. **Link-based underline tabs** for route-backed tabs, never shadcn `<Tabs>`.
8. **Dark mode `--primary`** must be explicitly set in `.dark` to keep brand hue.
9. **No `useSidebar()` state ternaries** in markup — use `[data-active]` CSS selectors in `globals.css`.
10. **`animate-fade-in-up`** staggers require `animationFillMode: "both"`.

---

## Backend additions (when the shell grows up)

This stack file only covers the UI layer. When wiring real backend:

- Auth + DB → see `stacks/saas-nextjs-supabase.md`
- Billing (Dodo) → see `patterns/good/billing-patterns.md`
- AI calls → see `stacks/ai-patterns.md`
- Admin panel → see `patterns/good/admin-panel-standards.md`

---

## Migrating Vite + react-router-dom → Next.js 16 App Router

**Source:** Rankora migration plan (2026-04-10). Applies to any Lovable/Vite SPA moving to Next 16.

### Strategy: In-place rewrite, parallel boot
- Scaffold Next.js 16 **alongside** the Vite app in the same repo. Keep both booting in parallel through every phase. Delete Vite **last**.
- Preserves git history. Enables route-by-route rollback if a page breaks.
- Phase order: scaffold → Supabase SSR → auth middleware → route migration → nav codemod → SEO refactor → client boundary hardening → cleanup → deploy.

### Supabase client split (@supabase/ssr)
Replace the single `src/integrations/supabase/client.ts` with three files:

```
lib/supabase/browser.ts      # createBrowserClient — for client components only
lib/supabase/server.ts       # createServerClient — cookies() from next/headers
lib/supabase/middleware.ts   # createServerClient — request/response cookie shim
```

Keep a **thin shim** at the old path that re-exports `browser.ts` so 100+ existing import sites don't all need touching at once.

**Server client MUST swallow cookie set/remove errors** — RSC context can't mutate cookies during render, but `@supabase/ssr` will try. Wrap in try/catch and no-op.

```ts
// server.ts
cookies: {
  getAll: () => cookieStore.getAll(),
  setAll: (items) => {
    try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
    catch { /* Called from RSC — middleware refreshes instead */ }
  },
}
```

### Auth middleware — getUser(), never getSession()
- `middleware.ts` at project root calls `supabase.auth.getUser()` on every request — this **refreshes the token** and writes new cookies to the response.
- `getSession()` does **not** refresh tokens. Using it in middleware leads to silent logout after ~1hr.
- Middleware must return the mutated response from the Supabase helper, not a fresh `NextResponse.next()`, or cookies get dropped.

### SEO: SeoHead.tsx → generateMetadata()
A Vite SPA doing `document.head` manipulation (e.g. Rankora's 185-line `SeoHead.tsx`) is **fundamentally incompatible** with Next's Metadata API. Full refactor:

1. Delete `SeoHead.tsx`.
2. Add `generateMetadata()` to every page/layout that needs it.
3. Wrap DB reads for SEO config in `unstable_cache` with a tag like `['seo']`.
4. In admin save handlers, call `revalidateTag('seo')` after any SEO settings mutation — keeps admin-editable SEO working server-side with cache.

### Next 15/16 breaking changes to watch
- **`params` and `searchParams` are Promises.** Must `await params` in `page.tsx`, `layout.tsx`, `generateMetadata()`, route handlers. Applies to all dynamic routes.
- **`useSearchParams()` requires a `<Suspense>` boundary** or the build fails. Wrap any client component that uses it.
- **Turbopack is stable for `next build` in Next 16** (not just dev). Opt in via `next build --turbopack` if needed.
- React 19 is bundled — check every library for React 19 peer compatibility before the upgrade.

### react-router-dom → next/link gotchas
- `next/link` has **no `state` prop**. If the old app passed `<Link to="/x" state={{...}}>`, migrate state to query params, context, or server-side fetch.
- `useNavigate()` → `useRouter()` from `next/navigation` (note: `next/navigation`, not `next/router`).
- `<Outlet />` has no direct equivalent — use nested layouts (`layout.tsx`).
- Protected routes become middleware matchers + server-side `getUser()` checks, not `<ProtectedRoute>` wrapper components.

### Client-only libraries need `dynamic({ ssr: false })`
Libraries that touch `window`, `document`, or `ResizeObserver` will SSR-crash. Wrap in dynamic import with SSR disabled:

```ts
const Chart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
```

**Known offenders:** recharts (`ResizeObserver is not defined`), react-pdf, any D3 wrapper, any chart library, Tiptap.

### Peer dep verification before committing to Next 16
Always verify these before starting:
- `@supabase/ssr` — no Next peer, works on any version
- `@sentry/nextjs` — must be 10.48+ for Next 16 peer (`^13 || ^14 || ^15 || ^16`)
- `recharts` 3.x — React 16–19 ✅
- `framer-motion` 12.x — React 18/19 ✅
- `next-themes` 0.4.6+ — React 16–19 ✅

Run `npm view <pkg> version` and `npm view <pkg> peerDependencies` for every non-trivial dep before locking versions.
