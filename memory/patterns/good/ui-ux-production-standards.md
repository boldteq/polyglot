# UI/UX Production Standards
## Extracted from production projects + Modern SaaS Best Practices

---

## Build Order: Design First, Logic Second

**Phase 1 — UI Shell (ALL pages, ALL components)**
Build every page with complete visual design, layout, navigation, and placeholder states. No logic yet. Every page must look production-ready with static data.

**Phase 2 — Data Layer & Logic**
Wire up Supabase queries, auth, state management, form submissions. Replace static data with real data.

**Phase 3 — Integration & Polish**
Connect billing (Dodo Payments), third-party services, admin controls. Add animations, transitions, error handling.

**Why this order:**
- Yash can review UI before wasting time on broken logic
- Catches design issues early (layout, spacing, missing pages)
- Prevents "page exists but is empty" — every page has content from Phase 1
- Matches how Lovable builds (visual first, logic second)

---

## Layout Patterns

### App Shell (Authenticated Pages)
```
┌─────────────────────────────────────────────┐
│ Header: Logo + Nav + User menu + Notifications │
├──────────┬──────────────────────────────────┤
│ Sidebar  │ Content area                      │
│ (w-56)   │ (flex-1, overflow-y-auto)         │
│          │                                    │
│ Nav      │ Page title + actions               │
│ items    │ ─────────────────────              │
│          │ Content cards / tables / forms      │
│          │                                    │
│          │                                    │
└──────────┴──────────────────────────────────┘
```

**Implementation:** Use `SidebarLayout` component wrapping all authenticated pages. Sidebar collapses on mobile with `SidebarTrigger` hamburger button.

### Admin Panel Layout
```
┌──────────────────────────────────────────────┐
│ Admin Header: "Admin Panel" + back to app     │
├──────────┬───────────────────────────────────┤
│ Admin    │ Tab content area                   │
│ Sidebar  │                                    │
│ (w-56)   │ Loaded dynamically by active tab   │
│          │ Wrapped in AdminErrorBoundary      │
│ Grouped: │                                    │
│ Overview │                                    │
│ Users    │                                    │
│ Config   │                                    │
│ System   │                                    │
└──────────┴───────────────────────────────────┘
```

### Landing Page Layout
```
Hero → Social Proof → Problem → Solution → Features → Pricing → FAQ → CTA → Footer
```
No sidebar. Full-width sections. Sticky header with CTA button.

---

## Component Patterns (From Production Projects)

### Data Tables
```tsx
// Standard table with pagination, search, filters
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <CardTitle>Users</CardTitle>
    <div className="flex gap-2">
      <Input placeholder="Search..." onChange={onSearch} className="w-64" />
      <Select onValueChange={setFilter}>...</Select>
      <Button onClick={exportCSV}>Export CSV</Button>
    </div>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>...</TableHeader>
      <TableBody>{rows.map(row => <TableRow>...)}</TableBody>
    </Table>
    <div className="flex justify-between mt-4">
      <span className="text-sm text-muted-foreground">
        Showing {start}-{end} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0}>Previous</Button>
        <Button variant="outline" size="sm" disabled={!hasMore}>Next</Button>
      </div>
    </div>
  </CardContent>
</Card>
```

### CRUD Dialogs
```tsx
// Edit dialog pattern — pre-fill from selected row
<Dialog open={!!editItem} onOpenChange={o => !o && setEditItem(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit {entityName}</DialogTitle>
      <DialogDescription>Update the details below.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-4 items-center gap-4">
        <Label className="text-right">Name</Label>
        <Input className="col-span-3" value={form.name} onChange={...} />
      </div>
      {/* more fields */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Stats Cards (Dashboard)
```tsx
<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  {stats.map(stat => (
    <Card key={stat.label}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
        <stat.icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stat.value}</div>
        <p className="text-xs text-muted-foreground">{stat.change}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

### Form Sections (Settings)
```tsx
<Card>
  <CardHeader>
    <CardTitle>Account Information</CardTitle>
    <CardDescription>Manage your account details</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" value={email} disabled />
    </div>
    <div className="space-y-2">
      <Label htmlFor="name">Display Name</Label>
      <Input id="name" value={name} onChange={...} />
    </div>
    <Button onClick={handleSave}>Save Changes</Button>
  </CardContent>
</Card>
```

---

## Data Fetching Pattern

### React Query + Supabase (Standard)
```tsx
const { data, isLoading } = useQuery({
  queryKey: ["entity-name", filters],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("table")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

// Mutations with cache invalidation
const qc = useQueryClient();
const save = async (values) => {
  const { error } = await supabase.from("table").upsert(values);
  if (error) { toast.error(error.message); return; }
  toast.success("Saved successfully");
  qc.invalidateQueries({ queryKey: ["entity-name"] });
};
```

### Loading States
```tsx
if (isLoading) return <Skeleton className="h-[400px] w-full" />;
if (!data?.length) return (
  <div className="text-center py-12">
    <Icon className="mx-auto h-12 w-12 text-muted-foreground" />
    <h3 className="mt-2 text-sm font-semibold">No items yet</h3>
    <p className="text-sm text-muted-foreground">Get started by creating your first item.</p>
    <Button className="mt-4" onClick={openCreateDialog}>Create Item</Button>
  </div>
);
```

---

## Typography Scale

| Element | Class | Usage |
|---------|-------|-------|
| Page title | `text-2xl font-bold tracking-tight` | One per page, top of content. **Not** `text-xl font-semibold` (looks dated). |
| Section title | `text-lg font-semibold` | Card headers, major sections |
| Subsection | `text-sm font-medium uppercase text-muted-foreground tracking-wide` | Group labels, KPI titles |
| Body | `text-sm` | Default text, table cells |
| Metadata | `text-xs text-muted-foreground` | Timestamps, secondary info |
| Stats number | `text-2xl font-bold leading-none tracking-tight tabular-nums` | Dashboard metric values (tabular-nums for aligned digits) |

**Key insight:** The fastest way to make a shadcn/ui app feel "modern" is upgrading page titles. See `patterns/good/ui-redesign-shadcn.md` for the full redesign playbook.

---

## Spacing System

| Use | Class | Pixels |
|-----|-------|--------|
| Between cards | `gap-4` | 16px |
| Between form fields | `space-y-4` | 16px |
| Inside card | `p-4` or `p-5` | 16-20px |
| Between table rows | Built into Table component | 12px |
| Page padding | `p-4 md:p-6 lg:p-8` | Responsive |
| Button group gap | `gap-2` | 8px |

---

## Color Usage

| Purpose | Token | Usage |
|---------|-------|-------|
| Primary actions | `bg-primary text-primary-foreground` | Main CTA buttons |
| Secondary actions | `variant="outline"` | Secondary buttons |
| Destructive | `variant="destructive"` | Delete, ban, dangerous actions |
| Success | `text-emerald-600` / badge variant | Status indicators |
| Warning | `text-amber-600` / badge variant | Warnings, pending states |
| Muted text | `text-muted-foreground` | Secondary text, metadata |
| Borders | `border-border/60` | Subtle card borders |
| Hover | `hover:bg-accent` | Interactive elements |

---

## Animation Standards

### Fade-in on mount
```tsx
<div className="animate-in fade-in duration-300">
  {content}
</div>
```

### Staggered list items
```tsx
// Each item delays by 80ms. animationFillMode: "both" prevents pre-animation flash.
{items.map((item, i) => (
  <div key={item.id}
       className="animate-fade-in"
       style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}>
    {item.content}
  </div>
))}
```
**Critical:** `animationFillMode: "both"` is required -- without it, items are visible before their animation delay expires, causing a flash. See `patterns/good/ui-redesign-shadcn.md` for full details.

### Button loading state
```tsx
<Button disabled={loading}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {loading ? "Saving..." : "Save"}
</Button>
```

### Hover effects
```tsx
// Cards
className="hover:shadow-md transition-all duration-200"

// Sidebar items
className="hover:bg-accent hover:translate-x-0.5 transition-all"

// Links
className="hover:text-primary/80 transition-colors"
```

---

## Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| Default (mobile) | Single column, stacked, sidebar hidden |
| `sm:` (640px) | 2-column grids, inline form elements |
| `md:` (768px) | Sidebar visible, wider content area |
| `lg:` (1024px) | 3-4 column grids, full admin layout |

**Rule:** Design mobile-first. Enhance on larger screens. Never hide critical functionality behind breakpoints.

---

## Toast Notifications (Sonner)

```tsx
import { toast } from "sonner";

// Success after mutation
toast.success("Plan created successfully");

// Error with context
toast.error("Failed to save: " + error.message);

// Info/warning
toast.info("Changes will take effect after page reload");
toast.warning("This action cannot be undone");
```

**Rules:**
- Every mutation (create/update/delete) shows a toast
- Error toasts include the error message, not just "Something went wrong"
- Success toasts confirm what was done: "User banned" not "Success"
- Never use `alert()` — always sonner toasts

---

## Error Handling

### Error Boundaries (per section, not per app)
```tsx
<AdminErrorBoundary key={activeSection}>
  <ActiveTabComponent />
</AdminErrorBoundary>
```

### Form Validation
- Client-side: validate before submit, show inline errors
- Server-side: catch Supabase errors, show in toast
- Never silent failures — every error visible to user

### Empty States (required for EVERY list/table)
- Icon + heading + description + action button
- Never just "No data" — tell user what to do next
- Different empty state for first-time vs filtered-no-results

---

## Icons (Lucide React)

- Consistent size: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-12 w-12` for empty states
- Color matches context: `text-muted-foreground` for decorative, `text-primary` for active
- Never mix icon libraries — Lucide only
- **Exception:** Inline SVG brand icons (Supabase, Google, Anthropic, etc.) are allowed on admin integration pages where brand recognition is essential. Type them as `React.FC<{ className?: string }>`, not as Lucide's `React.ElementType`. See `patterns/good/admin-integrations-pattern.md`.

---

## What NOT To Do

1. **No gradient hero sections** — use solid colors matching brand
2. **No Lorem ipsum anywhere** — every text must be real or realistic
3. **No empty tables without empty states** — always show what to do next
4. **No buttons without loading states** — every async action shows spinner
5. **No pages without proper spacing** — use the spacing system above
6. **No custom CSS when Tailwind class exists** — no inline styles
7. **No setTimeout for loading** — use actual async state
8. **No alert() or console.log for user feedback** — use sonner toasts
9. **No hardcoded colors** — use theme tokens (primary, muted, destructive)
10. **No missing responsive design** — every page must work on mobile
11. **No hover-reveal action buttons** (`opacity-0 group-hover:opacity-100`) — hurts discoverability and doesn't work on touch devices. Use always-visible ghost buttons instead.
12. **No `text-xl font-semibold` for page titles** — looks dated. Use `text-2xl font-bold tracking-tight`.
13. **No card grids for data-heavy list pages** — use data tables with filter bars for scannable lists.
