---
name: shadcn base-nova patterns
description: Production-validated rules for shadcn base-nova style apps (render prop, Tailwind v4 tokens, sidebar active state, settings tabs) — derived from Clientloop Phase 1 Vega review.
type: pattern
category: good
last_updated: 2026-04-10
source_project: Clientloop
---

# shadcn base-nova Patterns

Production-validated rules for apps using shadcn/ui with the **base-nova** style (`@base-ui/react` primitives under the hood, not Radix). Derived from the Clientloop Phase 1 Vega punch-list + Sage quality gate.

For the full stack reference (scaffold commands, Tailwind v4 config, tsconfig flags), see `stacks/saas-nextjs-16.md`.

---

## 1. `render` prop replaces `asChild`

base-nova primitives do NOT accept `asChild`. They accept a `render` prop that takes a React element. Koda rediscovered this multiple times across Clientloop steps — stop the bleeding.

```tsx
// ❌ WRONG
<SidebarMenuButton asChild><Link href="/x">Dashboard</Link></SidebarMenuButton>
<Button asChild><Link href="/new">New</Link></Button>

// ✅ CORRECT
<SidebarMenuButton render={<Link href="/x" />}>Dashboard</SidebarMenuButton>
<Button render={<Link href="/new" />}>New</Button>
<BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>
<DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
  <MoreHorizontal className="h-4 w-4" />
</DropdownMenuTrigger>
```

**Detection rule:** If the component imports from `@base-ui/react`, it uses `render`. If from `@radix-ui/*`, it uses `asChild`. Always grep before assuming.

---

## 2. Tailwind v4 tokens belong in `globals.css`, not a JS config

There is **no `tailwind.config.ts`** in v4. All custom shadows, keyframes, colors, and theme extensions go in `app/globals.css` under `@theme inline`:

```css
@theme inline {
  --shadow-soft: 0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06);
  --shadow-soft-md: 0 2px 4px -1px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08);
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.04);
  --animate-fade-in-up: fade-in-up 0.4s ease-out;
  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}
```

Pattern docs that assume a JS config file are **stale** for any v4 app.

---

## 3. Sidebar active state — CSS selector, not state ternaries

Do NOT do this:

```tsx
// ❌ Sage flags this
const { state } = useSidebar();
<SidebarMenuButton className={isActive ? "bg-primary text-white" : ""}>
```

Instead, override in `globals.css`:

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

Component only needs `isActive={pathname === href}`.

---

## 4. Settings tabs that are real routes → Link-based, not `<Tabs>`

shadcn `<Tabs>` is for client-side-only state. If each tab is a Next.js route, use `Link` + `usePathname`:

```tsx
{TABS.map((tab) => {
  const active = pathname === tab.href;
  return (
    <Link
      href={tab.href}
      className={cn(
        "relative py-3 text-sm font-medium transition-colors rounded-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        active && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:content-['']",
      )}
    >
      {tab.label}
    </Link>
  );
})}
```

The `after:-bottom-px` underline is the canonical indicator.

---

## 5. Dark mode `--primary` must stay on brand hue

Default shadcn `.dark` theme sets `--primary` to near-white. This kills brand color in dark mode. Always explicitly override:

```css
.dark {
  --primary: oklch(0.70 0.22 285); /* brand violet, not achromatic */
  --primary-foreground: oklch(0.145 0 0);
  --ring: oklch(0.70 0.22 285);
}
```

---

## 6. Brand accents → `primary` token, never raw palette

```tsx
// ❌ WRONG
<div className="bg-gradient-to-br from-violet-400 to-violet-600" />

// ✅ CORRECT
<div className="bg-gradient-to-br from-primary/80 to-primary" />
```

Rule: The only place raw palette hex is allowed is the **one** designated brand swatch (e.g. a marketing-page hero gradient that's intentionally fixed). Everywhere else uses tokens.

---

## 7. Cards — `shadow-soft` / `shadow-card` / `shadow-soft-md` only

Default Tailwind `shadow-sm` / `shadow-md` are too harsh and inconsistent with the design system. Always use the custom tokens defined in `@theme inline`.

```tsx
<Card className="shadow-soft">        {/* default card */}
<Card className="shadow-card">        {/* subtler */}
<Card className="shadow-soft-md">     {/* elevated / hover */}
```

---

## 8. KPI card fade-in stagger — always include `animationFillMode`

```tsx
<Card
  className="animate-fade-in-up shadow-soft"
  style={{
    animationDelay: `${index * 80}ms`,
    animationFillMode: "both", // ← flashes without this
  }}
>
```

Without `animationFillMode: "both"`, cards render at their final state for one frame before the animation starts — visible flash.

---

## 9. Segmented controls → explicit focus-visible ring

Segmented controls (inbox table/Kanban toggle, etc.) do not get accessible focus rings by default:

```tsx
className={cn(
  "px-3 py-1.5 text-sm rounded-md transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
)}
```

---

## 10. Data tables with filters → `totalCount` prop

When a table has filter state, the footer must show "Showing X of Y" where Y is the unfiltered total. Pass both:

```tsx
<DataTable
  rows={filteredRows}       // after filter
  totalCount={allRows.length} // before filter
/>
// Footer: "Showing 12 of 47 requests"
```

Never show "Showing X of X" when filters are active — user loses context on what was filtered out.

---

## 11. Inter font → `className="font-sans"` on `<body>`

`inter.variable` on `<html>` defines the CSS var but does not apply it. The body must have `font-sans`:

```tsx
<html lang="en" className={inter.variable}>
  <body className="font-sans antialiased">{children}</body>
</html>
```

---

## 12. Extract shared chips/badges at 2+ usages

If a visual element (SLA chip, status badge, role pill) appears in 2 or more places, extract it to `components/shared/` immediately. Do not copy-paste a 3rd time.

Clientloop example: `SlaChip` was inlined in dashboard warnings AND inbox rows — extracted after Vega flagged it. Now one source of truth for SLA color coding.

```tsx
// components/shared/sla-chip.tsx
export function SlaChip({ status }: { status: "on-track" | "at-risk" | "breached" }) {
  const styles = {
    "on-track": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    "at-risk": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    "breached": "bg-red-500/10 text-red-700 dark:text-red-400",
  }[status];
  return <Badge className={cn("border-0", styles)}>{status}</Badge>;
}
```

---

## Quality gate — what Sage checks

When Sage reviews a base-nova app, these are hard fails:

- Any `any` or `as any` or `@ts-ignore`
- Any raw hex color outside the one designated brand swatch
- Any `console.log` / `console.error` left in
- Any `TODO` comment (except explicit markers like `// TODO: dnd wiring in Phase 2`)
- Any `useSidebar()` state ternary in markup (use CSS selector instead)
- Any `asChild` on a base-nova component (use `render`)
- Any default Tailwind shadow where `shadow-soft*` / `shadow-card` exists
- Any route that doesn't return 200/307/404
- Build failure
