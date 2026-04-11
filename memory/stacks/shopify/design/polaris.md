# Polaris Design System — Mandatory for Admin UI

> Source: shopify.dev/docs/apps/design/admin-ui | polaris.shopify.com (2026 Web Components GA)
> Last extracted: 2026-04-04

## Version Status (as of April 2026)

**DUAL-STACK REALITY:**
- **Polaris React** (`@shopify/polaris` v13.9.5) — **ARCHIVED Jan 6, 2026**. Still works but no new features. Used by `shopify-app-template-remix`.
- **Polaris Web Components** (custom elements with `s-` prefix) — **THE NEW STANDARD**. GA since Oct 2025. Recommended for all new apps. Used by `shopify-app-template-react-router`.

**When to use which:**
- **New app from scratch** → Use React Router template + Polaris Web Components ✅ (recommended)
- **Existing Remix app with Polaris React** → Keep using it, migrate to web components in future sprints
- **App Home surface** → Web Components ONLY (no choice; Polaris React doesn't support App Home)
- **Extensions** (Checkout, Admin, POS, Customer Accounts) → Web Components ONLY
- **Embedded admin apps** → Can use either, but web components strongly preferred

## Key Rules

1. **Polaris is MANDATORY for all admin-embedded apps** — no Tailwind, no shadcn, no custom CSS frameworks
2. **App Store reviewers reject non-Polaris apps** — visual consistency with Shopify admin is non-negotiable
3. **Web components are the future** — Polaris React is archived; migrate new projects to `s-` prefix components
4. **Follow design tokens** — all spacing, colors, typography, shadows pre-defined; never hardcode values
5. **Component hierarchy matters** — `<s-page> → <s-layout> → <s-section> → <s-card>` (web components) or `Page > Layout > Layout.Section > Card` (React)

---

## Component Categories

### Layout Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `Page` | `<s-page>` | Every route wrapper | Provides title, actions, back navigation, responsive layout |
| `Layout` | `<s-layout>` | Page organization | Organizes multiple sections on a page |
| `Layout.Section` | `<s-section>` | Content section | Full-width or one-third width (sidebar variant) |
| `Layout.AnnotatedSection` | `<s-section>` with attributes | Settings layout | Titled section + description (for settings pages) |
| `Card` | `<s-card>` | Content container | Groups related content (padding, border, shadow) |
| `BlockStack` | `<s-stack direction="block">` | Vertical spacing | Stack elements vertically with gap (8px, 12px, 16px, etc.) |
| `InlineStack` | `<s-stack direction="inline">` | Horizontal spacing | Stack elements horizontally with gap |
| `Box` | `<s-box>` | Generic container | Custom padding/background/styling |
| `Divider` | `<s-divider>` | Visual separator | Separate content sections |
| `Grid` | `<s-grid>` | CSS Grid layout | Complex multi-column responsive layouts |

### Data Display Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `IndexTable` | `<s-index-table>` | Primary data table | Lists with selection, sorting, pagination, bulk actions |
| `ResourceList` | `<s-resource-list>` | Simple lists | Cleaner alternative to IndexTable for simple lists |
| `DataTable` | `<s-data-table>` | Read-only table | Display summary data without interactions |
| `DescriptionList` | — | Key-value pairs | Display attribute-value pairs |
| `Badge` | `<s-badge>` | Status indicator | Show status: success, warning, critical, info |
| `Tag` | `<s-tag>` | Removable label | Taggable content, chip-like elements |
| `Thumbnail` | `<s-thumbnail>` | Small images | Product images, icons |
| `Avatar` | `<s-avatar>` | User/shop image | User profiles, shop avatars |
| — | `<s-chip>` (new Feb 2026) | Interactive chip | Selectable chip with optional close action |

### Form & Input Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `TextField` | `<s-text-field>` | Text input | Single/multi-line text, email, URL, password |
| — | `<s-email-field>` (web comp) | Email input | Email with validation |
| — | `<s-password-field>` (web comp) | Password input | Password with show/hide toggle |
| — | `<s-number-field>` (web comp) | Numeric input | Numbers with spinner controls |
| — | `<s-money-field>` (web comp) | Currency input | Currency amounts with formatting |
| `Select` | `<s-select>` with `<s-option>` | Dropdown | Choose from predefined options |
| `DateField` | `<s-date-field>` | Date input | Date selection with validation |
| `Checkbox` | `<s-checkbox>` | Toggle single option | Binary yes/no choice |
| `ChoiceList` | `<s-choice-list>` | Multiple options | Radio buttons or checkboxes |
| `RangeSlider` | — | Numeric range | Slider for numeric values |
| `ColorPicker` | `<s-color-picker>` (new Feb 2026) | Color picker popup | Pick colors from palette |
| `ColorField` | `<s-color-field>` (new Feb 2026) | Color input field | Text input for color codes |
| `Autocomplete` | — | Search with suggestions | Text input with suggestions |
| `Filters` | — | Data filtering | Filter tables/lists |
| `DropZone` | `<s-drop-zone>` (new Feb 2026) | File upload | Drag-and-drop file upload |

### Feedback & Notification Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `Banner` | `<s-banner>` | Persistent alert | Success, warning, critical, info messages (stays visible) |
| `Toast` | `ui-modal` (App Bridge) | Temporary notification | Via App Bridge; transient feedback (auto-hides) |
| `Modal` | `ui-modal` (App Bridge) | Dialog | Via App Bridge; requires user action |
| `Spinner` | `<s-spinner>` | Loading indicator | Inline loading (never full-page) |
| `ProgressBar` | `<s-progress>` | Progress indication | Show progress of long tasks |
| `SkeletonPage` | — | Full page loading | Placeholder while content loads |
| `SkeletonBodyText` | — | Text placeholder | Skeleton for paragraph text |
| `SkeletonDisplayText` | — | Heading placeholder | Skeleton for heading |
| `SkeletonThumbnail` | — | Image placeholder | Skeleton for images |
| — | `<s-tooltip>` (new Feb 2026) | Inline help text | Hover tooltip with description |
| — | `<s-popover>` (new Feb 2026) | Floating panel | Context-aware popover for menus or details |

### Navigation Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `NavMenu` | — (App Bridge) | App navigation | Top-level app nav (via App Bridge in app.tsx) |
| `Tabs` | `<s-tabs>` | Section switching | In-page tab navigation |
| `Pagination` | `<s-pagination>` | Page navigation | Navigate through table pages |
| `Link` | `<s-link>` | Text link | Anchor links (avoid overuse) |
| — | `<s-menu>` (new Feb 2026) | Dropdown menu | Context-menu with actions |

### Action Components

| React Polaris | Web Component | Purpose | When to Use |
|----------|----------|---------|-------------|
| `Button` | `<s-button>` | Primary/secondary action | Clickable buttons (4 variants: primary, secondary, critical, tertiary) |
| `ButtonGroup` | `<s-button-group>` | Related buttons | Group related actions |
| `ActionList` | `<s-action-list>` | Dropdown menu | Overflow actions, more menu |
| — | `<s-clickable>` (new Feb 2026) | Interactive wrapper | Clickable container for custom interaction zones |

---

## Design Tokens (Never Hardcode Values)

### Spacing Scale
```
xs: 4px
sm: 8px
md: 12px
lg: 16px
xl: 20px
2xl: 24px
3xl: 32px
```

### Color Semantics
- **Success (Green):** Positive states, confirmations
- **Warning (Yellow):** Alerts, attention-needed
- **Critical (Red):** Errors, destructive actions
- **Info (Blue):** Informational messages
- **Subdued (Gray):** Secondary content, disabled states

### Typography
- **Display:** Large headings (2xl, xl, lg sizes)
- **Heading:** Section headings (h1, h2, h3)
- **Body:** Regular body text (md, sm sizes)
- **Code:** Monospace for code blocks

---

## Common Page Compositions

### Single-Column Layout (Linear Workflow)

**React Polaris (Remix template):**
```typescript
import { Page, Layout, Card, BlockStack, TextField, Select, Button } from "@shopify/polaris";

<Page title="Create Widget" primaryAction={...}>
  <Layout>
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <TextField label="Name" value={...} onChange={...} />
          <Select label="Type" value={...} onChange={...} />
          <Button submit>Create</Button>
        </BlockStack>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

**Web Components (React Router template):**
```tsx
<s-page title="Create Widget">
  <s-layout>
    <s-section>
      <s-card>
        <s-stack direction="block" gap="400">
          <s-text-field label="Name"></s-text-field>
          <s-select label="Type">
            <s-option value="option1">Option 1</s-option>
            <s-option value="option2">Option 2</s-option>
          </s-select>
          <s-button variant="primary" type="submit">Create</s-button>
        </s-stack>
      </s-card>
    </s-section>
  </s-layout>
</s-page>
```

### Two-Column Layout (Settings Pattern)

**React Polaris:**
```typescript
<Page title="Settings">
  <Layout>
    <Layout.AnnotatedSection title="General" description="Basic config">
      <Card>
        <BlockStack gap="400">
          <TextField label="Store name" value={...} onChange={...} />
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>

    <Layout.AnnotatedSection title="Notifications" description="Alert settings">
      <Card>
        <ChoiceList title="Email" choices={...} selected={...} onChange={...} />
      </Card>
    </Layout.AnnotatedSection>
  </Layout>
</Page>
```

**Web Components:**
```tsx
<s-page title="Settings">
  <s-layout>
    <s-section>
      <s-text>General</s-text>
      <s-card>
        <s-stack direction="block" gap="400">
          <s-text-field label="Store name"></s-text-field>
        </s-stack>
      </s-card>
    </s-section>

    <s-section>
      <s-text>Notifications</s-text>
      <s-card>
        <s-choice-list title="Email">
          <s-option value="on">Send emails</s-option>
          <s-option value="off">Disable emails</s-option>
        </s-choice-list>
      </s-card>
    </s-section>
  </s-layout>
</s-page>
```

### Full-Width Data Table

**React Polaris:**
```typescript
<Page title="Resources" primaryAction={{content: "Create"}}>
  <Layout>
    <Layout.Section>
      <Card padding="0">
        <IndexTable
          resourceName={{singular: "resource", plural: "resources"}}
          headings={[{title: "Name"}, {title: "Status"}, {title: "Actions"}]}
          itemCount={resources.length}
          selectedItemsCount={selectedResources.length}
          onSelectionChange={handleSelectionChange}
        >
          {/* IndexTable.Row elements */}
        </IndexTable>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

**Web Components:**
```tsx
<s-page title="Resources">
  <s-layout>
    <s-section>
      <s-card padding="0">
        <s-index-table
          resourceName="resource"
          pluralName="resources"
          itemCount={resources.length}
        >
          {/* Row elements */}
        </s-index-table>
      </s-card>
    </s-section>
  </s-layout>
</s-page>
```

---

## Design Tokens in Code

Always use Polaris spacing and color system:

**React Polaris:**
```typescript
// ✅ CORRECT — use Polaris spacing token strings
<BlockStack gap="400">  {/* 16px spacing */}
  <TextField label="..." />
  <Select label="..." />
</BlockStack>

// ❌ WRONG — never hardcode pixel values
<div style={{gap: "16px"}}>
  <TextField label="..." />
</div>

// ✅ CORRECT — use Banner for persistent feedback
<Banner tone="success" title="Created">
  Widget created successfully.
</Banner>

// ❌ WRONG — Toast for critical info (use Banner instead)
<Toast.success>Widget created</Toast.success>  // OK for transient only
```

**Web Components:**
```html
<!-- ✅ CORRECT — use gap attribute -->
<s-stack direction="block" gap="400">
  <s-text-field label="..."></s-text-field>
  <s-select label="..."></s-select>
</s-stack>

<!-- ❌ WRONG — never inline styles for Polaris tokens -->
<div style="gap: 16px">
  <s-text-field label="..."></s-text-field>
</div>

<!-- ✅ CORRECT — use Banner with tone -->
<s-banner tone="success" title="Created">
  Widget created successfully.
</s-banner>

<!-- ✅ CORRECT — Web component event listeners (React example) -->
<s-text-field
  label="Name"
  onInput={(e) => setName(e.target.value)}
></s-text-field>

<!-- ❌ WRONG — onClick doesn't work on form inputs (use onInput) -->
<s-text-field onClick={() => {}}></s-text-field>
```

---

## Pitfalls

### General (Both React & Web Components)
- **Using custom CSS frameworks** alongside Polaris creates visual inconsistency (immediate rejection)
- **Hardcoding spacing/colors** instead of using design tokens breaks consistency
- **Flat card layouts** without proper Layout/Section hierarchy — `Page > Layout > Section > Card` (React) or `<s-page> > <s-layout> > <s-section> > <s-card>` (web comp) must be respected
- **Ignoring responsive behavior** — Polaris components are responsive by default; breaking this creates mobile UX issues
- **Mixing component styles** — using non-Polaris colors or borders in custom styling
- **Page without title** — every route should be wrapped in `<Page title="...">` (React) or `<s-page title="...">` (web comp) for consistency
- **Toast for blocking errors** — toasts are transient; use Banners for persistent critical messages
- **Skeleton states not matching final content** — skeleton should approximate final layout to prevent CLS

### Web Components Specific
- **Using Polaris React for App Home** — won't work. App Home requires web components ONLY
- **Missing CDN script** — web components need `<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>` in HTML before component use
- **Using React event handlers incorrectly** — use `onInput`, `onChange`, `onSubmit` (not `onClick` for inputs)
- **Not including TypeScript types** — install `@shopify/polaris-types` for IDE autocomplete
- **Mixing React Polaris and Web Components** — don't import from both `@shopify/polaris` and use `<s-*>` in the same file. Pick one per file.

### React Polaris Specific
- **Assuming Polaris React will get new features** — it's archived as of Jan 2026. New features only in web components
- **Not migrating from v13** — no new versions coming. Plan migration to web components in future sprints

---

## Which Stack to Use? (Decision Guide)

| Scenario | Recommendation | Why |
|----------|-----------------|-----|
| **New Shopify app from scratch** | React Router + Web Components | Shopify's new standard; GA since Oct 2025. Better performance, all new features. |
| **Existing Remix app with Polaris React** | Keep it, plan migration | No rush; Polaris React v13 is stable. Migrate when time permits. |
| **App Home surface** | Web Components ONLY | Polaris React doesn't support App Home. No choice. |
| **Extensions** (Checkout, Admin, POS, Customer Accounts) | Web Components ONLY | Extensions only work with web components. |
| **Building a new page in existing Remix app** | Use Polaris React (same as codebase) | Consistency with existing code. Can refactor page later. |
| **Migrating a Polaris React page to web components** | Web Components | One file/page at a time. Don't mix both in same file. |

---

## TypeScript Support for Web Components

Install types package for IDE autocomplete:
```bash
npm install --save-dev @shopify/polaris-types
```

In your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["@shopify/polaris-types"]
  }
}
```

Then web component element types are available for custom element attributes:
```tsx
interface SPageElement extends HTMLElement {
  title?: string;
  primaryAction?: { content: string; onAction: () => void };
}

const page = document.querySelector('s-page') as SPageElement;
```

---

## CDN Setup for Web Components

Every HTML page using Polaris web components must include the CDN script:

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
  </head>
  <body>
    <s-page title="My App">
      <!-- Web components work here -->
    </s-page>
  </body>
</html>
```

For React Router apps, add to `src/main.tsx` or in an index.html that's served before React mounts:

```html
<!-- index.html -->
<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
```

Then React components can use web components freely:
```tsx
export function MyApp() {
  return (
    <s-page title="Dashboard">
      <s-layout>
        <s-section>
          {/* React child components can interact with web component props */}
        </s-section>
      </s-layout>
    </s-page>
  );
}
```
