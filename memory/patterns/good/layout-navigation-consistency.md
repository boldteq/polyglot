# Layout & Navigation Consistency — Mandatory Quality Pattern

> Priority: **CRITICAL** — This is the #1 recurring UI bug across all projects
> Problem: Pages render without sidebar/navigation, breaking app consistency
> Root cause: No enforced layout wrapper at router level — each page must manually include sidebar
> Applies to: ALL stacks (Lovable/Vite, Next.js, Shopify, any app with sidebar navigation)
> Agents: Koda (build), Vex (debug), Luna (test), Sage (audit), Yash (gate)
> Last updated: 2026-04-05

---

## The Problem

When building multi-page apps with sidebar navigation, agents repeatedly produce pages that:
1. **Missing sidebar entirely** — page renders full-width with no navigation
2. **Missing header** — page has content but no AppHeader/top bar
3. **Inconsistent layout structure** — some pages use flex, others grid, spacing differs
4. **Navigation links don't work** — sidebar links point to wrong routes or are missing
5. **New pages not added to sidebar** — page exists at route but can't be reached from nav
6. **Mobile sidebar trigger missing** — sidebar works on desktop but no way to open on mobile

This happens because **there is no shared layout shell at the router level**. Each page must manually wrap itself in the layout. When an agent adds a new page, it often forgets to include the sidebar wrapper.

---

## The Architecture Pattern (How It MUST Work)

### Pattern A: Lovable/Vite Projects (React Router)

Every Lovable project should have a `SidebarLayout` wrapper component:

```
src/components/SidebarLayout.tsx   ← Shared layout wrapper
```

**Every authenticated page MUST use this wrapper:**
```tsx
// CORRECT — page wrapped in SidebarLayout
import SidebarLayout from '@/components/SidebarLayout'

export default function SettingsPage() {
  return (
    <SidebarLayout>
      <div className="p-6">
        <h1>Settings</h1>
        {/* page content */}
      </div>
    </SidebarLayout>
  )
}
```

```tsx
// WRONG — page without layout wrapper (renders with no sidebar!)
export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1>Settings</h1>
      {/* page content — NO SIDEBAR, NO HEADER! */}
    </div>
  )
}
```

**SidebarLayout structure:**
```
SidebarProvider (h-svh overflow-hidden)
├── Sidebar component (navigation links)
│   ├── Header (logo + branding)
│   ├── Navigation items (Dashboard, Jobs, Settings, etc.)
│   ├── Context-specific content (job list, admin tabs, etc.)
│   └── Footer (links, version, etc.)
└── SidebarInset (h-svh overflow-y-auto)
    ├── AppHeader (wallet, notifications, profile menu)
    ├── Mobile sidebar trigger (SidebarTrigger — REQUIRED)
    └── {children} (page content)
```

### Pattern B: Next.js Projects

Use Next.js layout system — `layout.tsx` files enforce consistent structure:

```
app/
├── layout.tsx              ← Root layout (html, body, providers)
├── (auth)/
│   ├── layout.tsx          ← Auth layout (centered, no sidebar)
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (dashboard)/
│   ├── layout.tsx          ← Dashboard layout (sidebar + header) ← THIS ENFORCES SIDEBAR
│   ├── page.tsx            ← Dashboard home
│   ├── settings/page.tsx   ← Inherits sidebar from layout.tsx
│   ├── billing/page.tsx    ← Inherits sidebar from layout.tsx
│   └── [any-new-page]/page.tsx  ← AUTOMATICALLY gets sidebar!
└── (public)/
    ├── layout.tsx          ← Public layout (no sidebar)
    └── page.tsx            ← Landing page
```

**Key advantage:** In Next.js, the `(dashboard)/layout.tsx` automatically wraps ALL child pages. New pages get the sidebar for free. This is the preferred pattern.

### Pattern C: Shopify Apps (Remix/React Router)

Polaris provides the layout shell — `<Page>` component is mandatory:

```tsx
// CORRECT — Shopify app page with Polaris layout
import { Page, Layout, Card } from '@shopify/polaris'

export default function SettingsPage() {
  return (
    <Page title="Settings" backAction={{ content: 'Dashboard', url: '/app' }}>
      <Layout>
        <Layout.Section>
          <Card>{/* content */}</Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
```

For React Router Shopify apps, the `<shopify-page>` web component replaces the React `<Page>` component.

---

## Mandatory Checklist (EVERY Page, EVERY Time)

When Koda creates or modifies ANY page, these MUST be verified:

### 1. Layout Wrapper Present
- [ ] Page is wrapped in `SidebarLayout` (Lovable/Vite) OR is inside a layout route group (Next.js) OR uses `<Page>` (Shopify)
- [ ] Only PUBLIC pages (auth, landing, 404, public apply) are exempt from sidebar
- [ ] If page is protected (requires auth), it MUST have sidebar + header

### 2. Sidebar Navigation Updated
- [ ] New page has a corresponding link in the sidebar navigation
- [ ] Sidebar link uses correct route path (matches App.tsx / router config)
- [ ] Active state highlights correctly when on this page
- [ ] Sidebar link has appropriate icon

### 3. Header Present
- [ ] AppHeader renders at the top of the page content area
- [ ] Header shows user menu, notifications, and any global actions
- [ ] Header is inside `SidebarInset`, not outside the layout

### 4. Mobile Navigation Works
- [ ] Mobile sidebar trigger (hamburger/menu button) is visible on small screens
- [ ] Sidebar opens/closes correctly on mobile
- [ ] Page content is not cut off or hidden behind sidebar on mobile
- [ ] Touch targets meet minimum 44x44px

### 5. Route Registration
- [ ] Route is added to App.tsx (Lovable) or router config (Next.js/Remix)
- [ ] Route is wrapped in `ProtectedRoute` if it requires auth
- [ ] Route is wrapped in `AdminRoute` if it requires admin role
- [ ] No duplicate routes exist

### 6. Navigation Consistency
- [ ] All sidebar links navigate correctly (no dead links)
- [ ] Back navigation works (browser back button returns to previous page)
- [ ] Breadcrumbs update correctly (if the app uses breadcrumbs)
- [ ] Page title matches the sidebar link text

---

## The Three Layout Categories

Every page in the app falls into exactly one category:

| Category | Sidebar | Header | Example Pages | Layout |
|----------|---------|--------|---------------|--------|
| **Authenticated** | YES | YES | Dashboard, Settings, Billing, Profile, Jobs, any feature page | `SidebarLayout` wrapper |
| **Admin** | YES (Admin sidebar) | YES | Admin dashboard, Users, Billing config, Platform settings | Custom admin layout with `AdminSidebar` |
| **Public** | NO | NO (or minimal) | Auth/Login, Landing, 404, Public apply, Payment callback | Centered/full-width layout |

**Rule:** If you're unsure which category a new page belongs to → it's **Authenticated** (with sidebar).

---

## Adding a New Page — Step-by-Step Protocol

When Koda needs to add a new page, follow this EXACT sequence:

### Step 1: Identify category
```
Is this page public (no auth needed)?
├── YES → Public category (no sidebar, centered layout)
└── NO → Is this an admin-only page?
    ├── YES → Admin category (AdminSidebar + AdminRoute)
    └── NO → Authenticated category (SidebarLayout + ProtectedRoute)
```

### Step 2: Create the page file
```tsx
// For Authenticated pages (most common):
import SidebarLayout from '@/components/SidebarLayout'

export default function NewFeaturePage() {
  return (
    <SidebarLayout>
      <div className="flex-1 p-6 space-y-6">
        <h1 className="text-2xl font-bold">New Feature</h1>
        {/* page content */}
      </div>
    </SidebarLayout>
  )
}
```

### Step 3: Add route to App.tsx
```tsx
<Route
  path="/new-feature"
  element={
    <ProtectedRoute>
      <NewFeaturePage />
    </ProtectedRoute>
  }
/>
```

### Step 4: Add sidebar navigation link
In the sidebar component, add the link:
```tsx
{ label: 'New Feature', icon: <SomeIcon />, path: '/new-feature' }
```

### Step 5: Verify (NON-NEGOTIABLE)
```bash
npm run build                    # Must pass
# Then manually verify:
# 1. Navigate to /new-feature → sidebar visible? header visible?
# 2. Click sidebar links → all work?
# 3. Click new feature link in sidebar → navigates correctly?
# 4. Resize to mobile → sidebar trigger visible? sidebar opens?
# 5. Browser back button → returns to previous page?
```

---

## Common Bugs & Root Causes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Page has no sidebar | Missing `SidebarLayout` wrapper | Wrap page in `SidebarLayout` |
| Page has no header | `AppHeader` not inside `SidebarInset` | Check layout structure — header goes inside `SidebarInset` |
| Sidebar shows but navigation links missing | Page not added to sidebar nav items array | Add nav item with correct path and icon |
| Clicking sidebar link does nothing | Route not registered in App.tsx | Add `<Route>` entry |
| Clicking sidebar link shows 404 | Route path doesn't match sidebar link path | Ensure exact match (e.g., `/settings` not `/setting`) |
| Sidebar link active state wrong | Active detection uses `pathname.startsWith()` but path is ambiguous | Use exact match or more specific prefix |
| Mobile: no way to open sidebar | Missing `SidebarTrigger` component | Add `<SidebarTrigger />` in header area |
| Mobile: sidebar won't close after navigation | Missing `onNavigate` close handler | Close sidebar in navigation callback |
| Page content squished with sidebar | Wrong CSS grid/flex setup | Content area needs `flex-1` or `w-full` |
| Admin page shows regular sidebar | Wrapped in `SidebarLayout` instead of admin layout | Use `AdminSidebar` for admin pages |

---

## Verification Commands

For Koda and Vex to run after any page change:

```bash
# 1. Build passes
npm run build

# 2. Check all routes are registered (Lovable/Vite)
grep -n "path=" src/App.tsx | grep -v "//" | sort

# 3. Check all pages import SidebarLayout (should match all authenticated pages)
grep -rn "SidebarLayout" src/pages/ --include="*.tsx"

# 4. Check sidebar has links for all routes
grep -n "path:" src/components/JobSidebar.tsx  # or wherever nav items are defined

# 5. Cross-reference: every route should have a sidebar link (except public pages)
# Compare route paths from step 2 with sidebar link paths from step 4
```

---

## Agent-Specific Instructions

### Koda (Builder)
- **BEFORE creating any new page:** Check if `SidebarLayout` or equivalent exists. If not, create it FIRST.
- **AFTER creating any new page:** Run the 5-point verification checklist above. Every. Single. Time.
- **When building multi-page features:** Add ALL pages to sidebar navigation in the SAME commit as creating the pages. Never create a page without its nav link.

### Vex (Debugger)
- **When user reports "page has no sidebar":** First check if the page imports and wraps with `SidebarLayout`. 90% of the time, that's the fix.
- **When user reports "can't navigate to X":** Check route registration in App.tsx AND sidebar nav items. Both must exist.

### Luna (Tester)
- **Write a layout consistency test** for every project that checks ALL routes render with expected layout elements (sidebar, header, nav links).
- **Navigation smoke test:** Programmatically visit every route and assert sidebar/header presence.

### Sage (Auditor)
- **Pre-deploy check:** Verify every registered route has sidebar wrapper (except known public routes).
- **Cross-reference audit:** Compare route count vs sidebar nav item count. They should match (minus public routes).

### Yash (Orchestrator)
- **Phase gate:** After Koda finishes any page work, Yash verifies: "Does every authenticated route render with sidebar and header?" If not → send back to Koda.
- **Never accept "page is done"** without layout verification proof.

---

*(Layout & navigation consistency training. Prevents the #1 recurring UI bug: pages rendering without sidebar.)*
