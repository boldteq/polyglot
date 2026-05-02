# Navigation Design — App Navigation Rules

> Source: shopify.dev/docs/apps/design/navigation
> Last extracted: 2026-04-04

## Key Rules

1. **Navigation uses NavMenu component** — defined in app layout wrapper (app.tsx)
2. **Desktop = sidebar, mobile = header** — Shopify handles responsive placement automatically
3. **Max 7 items before truncation** — items beyond 7 roll into "View more" button
4. **Labels must be nouns, not verbs** — "Dashboard", "Products", "Reports" (not "View dashboard", "Add products")
5. **Keep labels short and scannable** — max 20 characters before truncation
6. **Default page has rel="home"** — mark first/default nav item with rel="home"
7. **No nested navigation** — navigation must be flat (no dropdowns in primary nav)

---

## Navigation Structure

### Desktop (Sidebar)
- Appears in left sidebar of Shopify admin
- 7-20 character labels (optimal for sidebar width)
- Gray icon when inactive, green when active
- Smooth transition between pages

### Mobile (Header)
- App name + icon in mobile header
- Navigation appears in collapsible drawer
- Touch-friendly spacing (44px+ buttons)
- Full screen drawer experience

---

## Implementation Pattern

```typescript
// app/routes/app.tsx — app layout wrapper
import { NavMenu } from "@shopify/app-bridge-react";
import { Outlet } from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <AppProvider i18n={{}}>
      <NavMenu>
        {/* rel="home" marks default page — MUST have one */}
        <a href="/app" rel="home">
          Dashboard
        </a>

        {/* 1-2 word nouns; max 7 items before "View more" */}
        <a href="/app/products">Products</a>
        <a href="/app/orders">Orders</a>
        <a href="/app/reports">Reports</a>
        <a href="/app/customers">Customers</a>
        <a href="/app/integrations">Integrations</a>
        <a href="/app/settings">Settings</a>

        {/* 8th+ item will auto-truncate into "View more" */}
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}
```

---

## Label Guidelines

### Noun-Based Labels (Correct)
- "Dashboard" — overview page
- "Products" — product management
- "Orders" — order list
- "Reports" — analytics/reporting
- "Settings" — configuration
- "Customers" — customer management
- "Integrations" — third-party connections

### Verb-Based Labels (Incorrect — Avoid)
- ~~"View dashboard"~~ → "Dashboard"
- ~~"Add products"~~ → "Products"
- ~~"Create order"~~ → "Orders"
- ~~"Run reports"~~ → "Reports"
- ~~"Manage settings"~~ → "Settings"

---

## Icon Design

### Requirements
1. **Dedicated app icon** — one icon per nav item (usually same icon for all)
2. **Color scheme:**
   - Gray (inactive state, default)
   - Green (active state, current page)
   - Auto-switched by Shopify — no custom color logic needed
3. **Clear at small sizes** — test icon at 16×16 and 24×24px
4. **Consistent style** — all icons should use same stroke/fill style
5. **No text in icons** — icons only; labels are separate

---

## Secondary Navigation (Tabs)

Use tabs sparingly for subsections within a page:

### Tab Rules
1. **Placement** — tabs appear below page title, above content
2. **Content scope** — tabs change content **below** them (never reposition tab bar)
3. **No wrapping** — tabs must never wrap to multiple lines
4. **Max 5-6 tabs** — if more, reconsider structure (use dropdown or separate pages)
5. **Don't use for primary navigation** — primary nav is NavMenu only

### Tab Implementation

```typescript
<Page title="Products">
  <Tabs
    tabs={[
      { id: "all", content: "All", panelID: "all-panel" },
      { id: "active", content: "Active", panelID: "active-panel" },
      { id: "draft", content: "Draft", panelID: "draft-panel" },
    ]}
    selected={selectedTab}
    onSelect={setSelectedTab}
  >
    <Layout>
      <Layout.Section>
        {selectedTab === "all" && <AllProducts />}
        {selectedTab === "active" && <ActiveProducts />}
        {selectedTab === "draft" && <DraftProducts />}
      </Layout.Section>
    </Layout>
  </Tabs>
</Page>
```

---

## Pitfalls

- **Verb-based labels** ("Manage X", "View Y") are confusing; use nouns
- **More than 7 nav items visible** — auto-truncated but indicates poor IA; consolidate or use subpages
- **No rel="home"** on default page — Shopify admin needs this to identify home
- **Nested/dropdown navigation** in NavMenu — not supported; use separate pages instead
- **Inconsistent icon colors** — let Shopify handle gray/green; don't override
- **Tabs wrapping** to multiple lines — indicates too many tabs; reorganize
- **Dynamic nav items** — nav should be static per app; routes handle dynamic content
- **Missing icon** — all nav items should have distinct, recognizable icons
