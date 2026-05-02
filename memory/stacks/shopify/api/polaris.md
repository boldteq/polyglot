# Polaris Web Components API Reference

> Source: shopify.dev/docs/api/app-home/polaris-web-components
> Last extracted: 2026-04-04
> Version: Polaris React v13.9.5 (archived Jan 6, 2026 — maintenance only) + Polaris Web Components (GA 2025-10, recommended for all new development). Feb 2026: 8 new admin components added

## Overview

Polaris is Shopify's comprehensive UI design system and web components library for building interfaces that match the Shopify admin design standard. All Polaris components are built as Web Components (custom HTML elements), making them framework-agnostic and usable with vanilla JavaScript, React, Preact, or any modern framework.

Polaris web components work across all Shopify surfaces:
- Shopify Admin apps
- Checkout UI Extensions
- Admin Extensions
- POS UI Extensions
- Customer Accounts

## Core Principles

1. **Native Web Components**: Built on the Web Components standard — work like native `<button>` or `<input>` elements
2. **Framework Agnostic**: Use with vanilla JS, React, Preact, or any framework
3. **Accessibility First**: Semantic HTML, keyboard navigation, ARIA attributes, focus management, contrast compliance
4. **Design System Native**: All components follow Shopify's official design system and look native to the Shopify admin
5. **Type Safety**: TypeScript support available via `@shopify/polaris-types` npm package

---

## Component Categories & Inventory

### Layout & Structure (Core)
- **Page** (`s-page`) — Main container for app content, provides preset layouts and automatic spacing
- **Layout** (`s-layout`) — Organizes content into sections with responsive behavior
- **Layout.Section** (`s-layout-section`) — Child section within Layout component
- **Card** (`s-card`) — Visual container that creates structure and rhythm, holds related content
- **BlockStack** (`s-block-stack`) — Vertical stack component for arranging items in block axis (top-to-bottom)
- **InlineStack** (`s-inline-stack`) — Horizontal stack component for arranging items inline (left-to-right)
- **Stack** (`s-stack`) — Flexible component for horizontal or vertical stacking with configurable spacing
- **Grid** (`s-grid`) — Matrix-based layout for responsive multi-column designs
- **Box** (`s-box`) — Basic container with customizable spacing and backgrounds

### Form Components (Input)
- **TextField** (`s-text-field`) — Single-line text input with validation, icon support, and connected actions
  - Supports onInput (fires on every keystroke) and onChange (fires on blur/commit)
  - Can include prefix/suffix icons and suffix buttons
- **Select** (`s-select`) — Dropdown menu with option selection
  - Contains Option child components
  - Supports multiple selection modes
- **Checkbox** (`s-checkbox`) — Boolean input with optional indeterminate state (for "select all")
  - Common use: select all functionality when some items are selected
- **ChoiceList** (`s-choice-list`) — Multiple radio or checkbox options for single/multiple selection
- **RadioButton** (`s-radio-button`) — Single selection from mutually exclusive options
- **DateField** (`s-date-field`) — Dedicated date input with validation and calendar interface
- **DatePicker** (`s-date-picker`) — Calendar widget for date selection
- **EmailField** (`s-email-field`) — Email-specific input with built-in validation
- **MoneyField** (`s-money-field`) — Monetary input with automatic currency formatting
- **NumberField** (`s-number-field`) — Numeric input with built-in validation
- **PhoneField** (`s-phone-field`) — Phone number input with formatting
- **PasswordField** (`s-password-field`) — Secure text input for passwords
- **Textarea** (`s-textarea`) — Multi-line text input
- **DropZone** (`s-drop-zone`) — Drag-and-drop file upload interface (NEW Feb 2026)
- **ColorField** (`s-color-field`) — Color selection via text input with validation (NEW Feb 2026)
- **ColorPicker** (`s-color-picker`) — Visual color palette selector (NEW Feb 2026)

### Data Display & Tables
- **DataTable** (`s-data-table`) — Simple tabular data display (use for straightforward summaries)
- **IndexTable** (`s-index-table`) — Advanced data table pattern with:
  - Search and filtering capabilities
  - Sorting options
  - Bulk actions on multiple rows
  - Use when you have lots of data to show
- **ResourceList** (`s-resource-list`) — Filterable collection of similar objects (products, customers)
  - Displays objects and guides navigation to detail pages
  - Use with ResourceItem components
  - Better UX than tables for object browsing
- **ResourceItem** (`s-resource-item`) — Individual item within ResourceList

### Navigation & Menus
- **Navigation** (`s-navigation`) — App sidebar navigation (available in admin, header on mobile)
  - Standard place for merchants to move between app pages
- **Tabs** (`s-tabs`) — Secondary navigation tabs
  - Use sparingly for secondary purposes
  - Only change content below when clicked
  - Never wrap onto multiple lines
  - Avoid if s-navigation is sufficient
- **TopBar** (`s-top-bar`) — Header bar via App Bridge (TitleBar action)
  - Populate with button actions and navigation breadcrumbs
- **Menu** (`s-menu`) — Contextual menu with actions (NEW Feb 2026)
  - Dropdown menu for related actions
  - Appears on user interaction
- **AppProvider** (`s-app-provider`) — Root provider setup (Polaris + App Bridge)
  - Available in @shopify/shopify-app-remix for Remix apps
  - Injects App Bridge script
  - Overrides linkComponent to use Remix Link component

### Feedback & Status Indicators
- **Modal** (`s-modal`) — Overlay dialog for distraction-free experiences
  - Use for: confirmation dialogs, settings panels
  - Actions buttons must render properly on mobile
- **Toast** (`s-toast`) — Transient notification message
  - No dedicated component in web components (handled via App Bridge)
- **Banner** (`s-banner`) — Informational bar displaying status or warnings
  - Communicates important messages persistently
- **Badge** (`s-badge`) — Status indicator using color and text
  - Communicates status for orders, products, customers
  - Helps merchants quickly identify important information
- **Spinner** (`s-spinner`) — Loading indicator
  - Standard animated spinner with accessibility label
  - Use for: centered loading with text, inline form submission loading
  - Include accessible label for screen readers
- **Disclosure** (`s-disclosure`) — Expandable/collapsible disclosure widget
- **Popover** (`s-popover`) — Floating content triggered by user interaction (NEW Feb 2026)
  - Displays additional content anchored to a trigger element
- **Tooltip** (`s-tooltip`) — Hover context information (NEW Feb 2026)
  - Lightweight contextual help on hover

### Empty & Loading States
- **EmptyState** (`s-empty-state`) — Placeholder view when no content exists
  - Guide users on what to do next
  - Suggest actions to populate the view
- **SkeletonPage, SkeletonBodyText, SkeletonThumbnail** — NOT available in Polaris web components
  - Shopify recommends using Remix for server-side rendering (eliminates need for skeleton screens)
  - Workarounds: use `s-box` with background="strong" or `s-spinner` for loading states
  - Under investigation by Shopify

### Media & Appearance
- **Icon** (`s-icon`) — Graphic symbols for visual communication
- **Thumbnail** (`s-thumbnail`) — Small image preview (circular or square)
- **Avatar** (`s-avatar`) — User profile image with fallback initials
- **MediaCard** (`s-media-card`) — Card containing media (image/video) with metadata
- **Image** (`s-image`) — Image display component
- **Text** (`s-text`) — Typography component for text content
- **Paragraph** (`s-paragraph`) — Multi-line paragraph text
- **Heading** (`s-heading`) — Page or section headings
- **Caption** (`s-caption`) — Small text for captions and annotations
- **Code** (`s-code`) — Inline code display
- **Chip** (`s-chip`) — Small, contained UI element (like a tag or badge) (NEW Feb 2026)

### Advanced Components
- **AppFrame** (`s-app-frame`) — Top-level frame component for app layout
- **Divider** (`s-divider`) — Visual separator between sections
- **Link** (`s-link`) — Navigational links
- **Clickable** (`s-clickable`) — Generic clickable wrapper (NEW Feb 2026)
  - Makes any content clickable (flexible alternative to Link)
- **SkeletonText** (`s-skeleton-text`) — Text skeleton (animation placeholder, limited availability)

---

## Design Tokens: Complete Reference

### Spacing Scale (4px Grid)

Shopify admin is built on a **4px spacing grid**. All spacing uses multiples of 4px for consistency.

| Token | Value | Use Case |
|-------|-------|----------|
| `space-0` | 0px | No spacing |
| `space-1` | 4px | Minimal spacing, icon-to-text |
| `space-2` | 8px | Small gaps, related items |
| `space-3` | 12px | Standard spacing, default gap |
| `space-4` | 16px | Medium spacing, component gaps |
| `space-5` | 20px | Card padding, section margins |
| `space-6` | 24px | Large spacing, major sections |
| `space-8` | 32px | Extra large spacing, page sections |
| `space-12` | 48px | Major layout spacing |

**Best Practice**: Use `BlockStack` and `InlineStack` with gap prop instead of hardcoding spacing values to maintain consistency.

### Color Tokens

Polaris provides semantic color tokens (not a fixed palette). Colors are applied using **tone** + **color intensity**:

**Tone (semantic meaning)**:
- `critical` — Error, danger, destructive actions (red)
- `success` — Success, positive, confirmation (green)
- `warning` — Caution, warning, requires attention (orange)
- `info` — Information, neutral, secondary (blue)
- `default` — Standard, neutral (gray)

**Color Intensity** (applied per component):
- `subdued` — Lower contrast, less prominent
- `default` — Standard visibility
- `strong` — Higher contrast, more prominent

**Contrast Requirements**:
- Background-to-text contrast ratio must be **at least 4.5:1** for WCAG AA compliance
- Verify contrast in all color combinations used

### Typography Scale

**Minimum Font Sizes**:
- `13px` — Minimum for headings, body text, interactive elements
- `12px` — Minimum for smaller copy, captions, subheadings
- Never go below 12px for readability in Shopify admin

**Typography Components**:
- **Heading** — Page/section titles, hierarchy
- **Text** — Body copy, descriptions
- **Paragraph** — Multi-line text blocks
- **Caption** — Annotations, helper text, secondary info
- **Code** — Inline or block code snippets

**Font Family**:
- Default: Shopify Sans (system font stack with fallbacks)
- All Polaris components use consistent font family

**Line Height & Spacing**:
- Maintain readable line height (1.4 minimum)
- Use BlockStack/InlineStack for consistent vertical rhythm
- Avoid manually setting line-height on typography

---

## Web Component Usage & Syntax

### Component Tag Naming Convention
All Polaris web components use the `s-` prefix:
- React component: `Button` → Web component: `<s-button>`
- React component: `TextField` → Web component: `<s-text-field>`
- React component: `DataTable` → Web component: `<s-data-table>`

### HTML Attributes vs JavaScript Properties

**Simple values as HTML attributes**:
```html
<s-button variant="primary" disabled>Click me</s-button>
<s-text-field label="Name" required value="John" />
<s-select disabled>
  <s-option value="a">Option A</s-option>
  <s-option value="b">Option B</s-option>
</s-select>
```

**Complex data as JavaScript properties**:
```javascript
const table = document.querySelector('s-data-table');
table.rows = [
  { id: '1', name: 'Product A', price: '$10' },
  { id: '2', name: 'Product B', price: '$20' }
];
table.headings = ['ID', 'Name', 'Price'];
```

### Event Handling

**Web components use standard DOM events** (not React synthetic events):

```typescript
// Vanilla JS
const field = document.querySelector('s-text-field');
field.addEventListener('change', (e) => {
  console.log('Value committed:', e.target.value);
});
field.addEventListener('input', (e) => {
  console.log('Real-time input:', e.target.value);
});

// React with ref
import { useRef } from 'react';

export function MyComponent() {
  const fieldRef = useRef<any>(null);

  const handleChange = () => {
    console.log('Value:', fieldRef.current.value);
  };

  return (
    <s-text-field
      ref={fieldRef}
      label="Name"
      onChange={handleChange}
    />
  );
}
```

**Event types**:
- `input` — Fires on every keystroke (real-time)
- `change` — Fires on blur or commit (checkboxes/selects fire immediately)
- `submit` — Form submission
- `click` — Button/interactive element click

### Complete Layout Example

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
  <style>
    html { background: #f3f3f3; }
  </style>
</head>
<body>
  <s-page title="Dashboard">
    <s-layout>
      <s-layout-section>
        <s-card>
          <s-block-stack gap="400">
            <s-text variant="headingMd">Welcome to the project</s-text>

            <s-inline-stack gap="200">
              <s-box flex="grow">
                <s-block-stack gap="200">
                  <s-text variant="bodySm" tone="subdued">Active Jobs</s-text>
                  <s-text variant="headingLg">24</s-text>
                </s-block-stack>
              </s-box>

              <s-box flex="grow">
                <s-block-stack gap="200">
                  <s-text variant="bodySm" tone="subdued">Credits Used</s-text>
                  <s-text variant="headingLg">1,240</s-text>
                </s-block-stack>
              </s-box>
            </s-inline-stack>
          </s-block-stack>
        </s-card>
      </s-layout-section>

      <s-layout-section>
        <s-card>
          <s-block-stack gap="400">
            <s-text variant="headingMd">Create New Job</s-text>

            <s-form-layout>
              <s-form-layout-group>
                <s-text-field
                  label="Job Title"
                  placeholder="e.g., Senior Engineer"
                  required
                />
              </s-form-layout-group>

              <s-form-layout-group>
                <s-textarea
                  label="Job Description"
                  placeholder="Paste job description here..."
                  rows="6"
                  required
                />
              </s-form-layout-group>

              <s-inline-stack gap="200">
                <s-button submit variant="primary">Create Job</s-button>
                <s-button>Cancel</s-button>
              </s-inline-stack>
            </s-form-layout>
          </s-block-stack>
        </s-card>
      </s-layout-section>
    </s-layout>
  </s-page>

  <script>
    // Handle form submission
    document.querySelector('s-form-layout').addEventListener('submit', (e) => {
      const title = document.querySelector('s-text-field').value;
      const description = document.querySelector('s-textarea').value;
      console.log('Job:', { title, description });
    });
  </script>
</body>
</html>
```

### React Integration Pattern

```tsx
import React, { useRef } from 'react';

export function JobForm() {
  const titleRef = useRef<any>(null);
  const descRef = useRef<any>(null);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const data = {
      title: titleRef.current?.value,
      description: descRef.current?.value
    };
    // Submit data...
  };

  return (
    <s-page title="Create Job">
      <s-layout>
        <s-layout-section>
          <s-card>
            <s-form-layout onsubmit={handleSubmit}>
              <s-form-layout-group>
                <s-text-field
                  ref={titleRef}
                  label="Title"
                  required
                />
              </s-form-layout-group>

              <s-form-layout-group>
                <s-textarea
                  ref={descRef}
                  label="Description"
                  required
                  rows="6"
                />
              </s-form-layout-group>

              <s-button submit variant="primary">
                Create
              </s-button>
            </s-form-layout>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}
```

### New Components (Feb 2026)

#### Color Input
```html
<!-- ColorField: text input with validation -->
<s-color-field label="Brand Color" value="#FF00FF" />

<!-- ColorPicker: visual palette selector -->
<s-color-picker value="#FF00FF" />
```

#### Popover & Tooltip
```html
<!-- Popover: floating content -->
<s-popover trigger="click">
  <s-button slot="trigger">Menu</s-button>
  <s-box padding="400">
    <s-text>Additional options</s-text>
  </s-box>
</s-popover>

<!-- Tooltip: hover help -->
<s-tooltip content="This is a helpful tip">
  <s-icon source="info" />
</s-tooltip>
```

#### Menu
```html
<s-menu>
  <s-button slot="trigger">Actions</s-button>
  <s-menu-item onclick="handleEdit()">Edit</s-menu-item>
  <s-menu-item onclick="handleDelete()" tone="critical">Delete</s-menu-item>
</s-menu>
```

#### Chip
```html
<s-chip onremove="handleRemove()">
  Selected Filter
</s-chip>
```

#### Clickable
```html
<!-- Makes any content clickable -->
<s-clickable onclick="handleClick()">
  <s-box padding="400">
    <s-text>Click anywhere on this card</s-text>
  </s-box>
</s-clickable>
```

#### DropZone
```html
<s-drop-zone ondrop="handleFiles(event)">
  <s-block-stack>
    <s-text variant="bodySm" tone="subdued">
      Drag files here or click to upload
    </s-text>
  </s-block-stack>
</s-drop-zone>
```

---

## Common Component Patterns

### Layout Pattern: Standard Page Structure
```html
<s-page>
  <s-layout>
    <s-layout-section>
      <s-card>
        <s-block-stack>
          <!-- Content here -->
        </s-block-stack>
      </s-card>
    </s-layout-section>
  </s-layout>
</s-page>
```

### Form Pattern: Vertical Stack
```html
<s-form-layout>
  <s-form-layout-group>
    <s-text-field label="Field 1" />
  </s-form-layout-group>
  <s-form-layout-group>
    <s-text-field label="Field 2" />
  </s-form-layout-group>
  <s-button submit="true">Submit</s-button>
</s-form-layout>
```

### Data Table Pattern: Complex Data
Use **IndexTable** (not DataTable) for:
- Search and filtering
- Sorting by columns
- Bulk actions on selected rows
- Large datasets

### Resource Browsing: Object Collections
Use **ResourceList** for:
- Products, customers, orders
- Click-through to detail pages
- Filtering and sorting
- Better UX than traditional tables

### Navigation Pattern
- Use **Navigation** component in sidebar for main app navigation
- Use **Tabs** only for secondary navigation within a page
- Tabs should change only the content below, never reload page
- TopBar (App Bridge TitleBar) for breadcrumbs and actions

### Empty/Loading States
```html
<!-- Empty State -->
<s-empty-state
  heading="No results found"
  image="https://cdn.shopify.com/..."
>
  <s-button>Create new</s-button>
</s-empty-state>

<!-- Loading (workaround) -->
<s-box background="strong" padding="8">
  <s-spinner size="large" />
</s-box>
```

---

## Event Handling & Interactivity

### Form Input Events

**onInput** — Fires on every keystroke (real-time):
```html
<s-text-field onInput={(e) => handleRealTimeValidation(e.target.value)} />
```

**onChange** — Fires when value is committed:
- Text fields: on blur (when focus leaves field)
- Checkboxes/Radio: immediately after input
- Selects: on selection change

### Web Component Event Patterns
- Events are standard DOM events
- Use `addEventListener()` or framework event handlers
- Check `event.target.value` or `event.detail` for value
- Stoppage and preventDefault() work as expected

### Framework Integration

**React/Preact**:
- Treat web components like regular HTML elements
- Use standard React event handlers
- Access properties via props or ref.current.property
- Works with hooks (useState, useEffect, etc.)

**Vanilla JS**:
- Use `addEventListener()` for events
- Set properties directly: `element.property = value`
- Use `querySelector()` to access components

---

## Web Components for Extensions (Admin, Checkout, POS)

### Extension Contexts & Component Availability

**Admin Extensions**:
- Full access to Polaris web components
- Use for admin UI surfaces
- Supports most components

**Checkout UI Extensions**:
- Subset of Polaris components available
- Use `shopify.dev/docs/api/checkout-ui-extensions/latest/polaris-web-components`
- Limited to form, display, and layout components
- No navigation/app structure components (different context)

**POS UI Extensions**:
- Polaris web components available
- Reference: `shopify.dev/docs/api/pos-ui-extensions/latest/polaris-web-components`
- Layout differs from admin context

**Admin Function Extensions**:
- No UI components (backend only)

### Extension Development with Polaris

1. Generate extension: `shopify app generate extension`
2. Choose target (admin, checkout, pos)
3. Scaffolded with Preact by default
4. Access Polaris components via web component tags (`<s-button>`, `<s-card>`, etc.)
5. Use Preact hooks for state management
6. Use App Bridge for platform-specific features (navigation, modals, toasts)

---

## API Contract & Configuration

### Component Naming Convention
- Web component prefix: `s-` (example: `<s-button>`, `<s-card>`, `<s-text-field>`)
- CSS class names: kebab-case
- Properties: camelCase or kebab-case (both work, depends on component)

### TypeScript Support

Install type definitions:
```bash
npm install @shopify/polaris-types
```

Use in TypeScript:
```typescript
import type { SButton } from '@shopify/polaris-types';
// Now IDEs provide autocomplete for s-button properties

const button = document.querySelector<SButton>('s-button');
button.disabled = true;
```

### Component Property Binding

**HTML Attribute Binding**:
```html
<s-text-field value="Hello" disabled label="Name" />
```

**JavaScript Property Setting**:
```javascript
const field = document.querySelector('s-text-field');
field.value = 'Updated';
field.disabled = true;
field.label = 'Email Address';
```

**React/JSX**:
```jsx
<s-text-field value={state} onchange={(e) => setState(e.target.value)} />
```

### Form Submission & Validation

- Use `<s-form-layout>` to organize form fields
- TextField, Select, Checkbox support `required`, `error`, `helpText` props
- Validation is responsibility of the developer
- No built-in form validation (validate on blur/submit)
- Return form errors inline under each field

---

## Known Limitations & Workarounds

### Missing Components

**Skeleton Loading**:
- SkeletonPage, SkeletonBodyText, SkeletonThumbnail NOT available in web components
- **Workaround 1**: Use Remix for server-side rendering (eliminates skeleton need)
- **Workaround 2**: Use `<s-box background="strong" padding="8">` as placeholder
- **Workaround 3**: Use `<s-spinner>` for loading indication
- Shopify investigating official skeleton components

**Toast Notifications**:
- No native Toast web component
- Use App Bridge `@shopify/app-bridge-react` for toasts
- Or implement custom toast via CSS animations

**Tabs**:
- Tab web component may not be fully featured in all contexts
- Consider Tab pattern via custom implementation if needed
- Use Navigation (sidebar) instead when possible

### Mobile Considerations

- Modal actions buttons can have rendering issues on Shopify mobile app
- Test modals thoroughly on mobile before shipping
- Navigation component adapts: sidebar on admin, header on mobile

### Browser & Framework Compatibility

- Works with all modern frameworks (React, Vue, Svelte, Preact, etc.)
- Vanilla JavaScript fully supported
- IE11 not supported (use web component polyfills if needed, not recommended)
- Requires Web Components support in browser

---

## Best Practices & Anti-Patterns

### DO ✓
1. **Use design tokens** — Always use spacing scale (4px grid) and semantic color tokens
2. **Leverage Stack components** — Use BlockStack/InlineStack instead of manually setting margins
3. **Follow navigation hierarchy** — Navigation sidebar → Tabs for secondary → individual content
4. **Build mobile-first** — Test all layouts on mobile (responsive by default in Polaris)
5. **Use IndexTable for data** — Not DataTable, when you need search/filter/bulk actions
6. **Include loading states** — Always show loading indication during async operations
7. **Validate inline** — Show validation errors under form fields in real-time
8. **Test accessibility** — Ensure keyboard navigation, color contrast, ARIA labels work
9. **Use App Bridge** — For modals, toasts, navigation in admin context
10. **Pair Polaris with App Bridge** — Together they form the complete admin integration

### DON'T ✗
1. **Don't hardcode spacing** — Never use arbitrary pixels; use design tokens only
2. **Don't mix UI libraries** — No Tailwind, no Material-UI, no custom CSS on Polaris components
3. **Don't hide navigation** — Keep Navigation component visible; it's the standard
4. **Don't abuse tabs** — Tabs are for secondary nav only, not primary navigation
5. **Don't override Polaris styles** — Don't add custom CSS on top of components (breaks design system)
6. **Don't use skeleton screens** — Use Remix SSR or spinners instead
7. **Don't create custom form layouts** — Use s-form-layout instead
8. **Don't skip empty states** — Always show guidance when data is missing
9. **Don't ignore contrast** — All text-to-background must meet WCAG AA (4.5:1)
10. **Don't develop for old browsers** — Assume modern browser standards

---

## Migration Guide: React Polaris → Polaris Web Components

**Status**: Polaris React v13.9.5 is archived (Jan 6, 2026) — maintenance only. All new development should use Polaris Web Components.

### Migration Checklist

1. **Component naming**: `Button` → `<s-button>`, `Card` → `<s-card>`, `TextField` → `<s-text-field>`
2. **Props become attributes/properties**:
   - Simple: `disabled={true}` → `disabled`
   - Events: `onClick={fn}` → `onclick={fn}` or `addEventListener`
   - Complex: Use JS property assignment instead of props
3. **Styles removed**: No Polaris CSS classes needed; use design tokens only
4. **TypeScript**: Use `@shopify/polaris-types` npm package for IDE autocompletion
5. **Event handling**: Web component events are DOM events, use `addEventListener` or ref-based handlers
6. **Testing**: Web components use shadow DOM; use `getByTestId` with `shadow-root` piercing in tests
7. **Layout changes**: Use `s-block-stack`, `s-inline-stack` instead of deprecated Grid/Layout patterns
8. **Form validation**: No automatic validation; validate on blur/submit and display errors inline

### Example: TextField Migration

**Old React Polaris (Remix)**:
```tsx
import { TextField } from '@shopify/polaris';
import { useState } from 'react';

export function MyForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  return (
    <TextField
      label="Name"
      value={name}
      onChange={(val) => setName(val)}
      error={error}
      onBlur={() => {
        if (!name) setError('Required');
      }}
    />
  );
}
```

**New Web Components (React Router)**:
```tsx
import { useRef, useState } from 'react';

export function MyForm() {
  const fieldRef = useRef<any>(null);
  const [error, setError] = useState('');

  const handleBlur = () => {
    if (!fieldRef.current?.value) {
      setError('Required');
      fieldRef.current.error = 'Required';
    }
  };

  const handleChange = () => {
    setError('');
    fieldRef.current.error = '';
  };

  return (
    <s-text-field
      ref={fieldRef}
      label="Name"
      onChange={handleChange}
      onBlur={handleBlur}
      error={error}
    />
  );
}
```

---

## Resources & References

- **Official Docs**: https://shopify.dev/docs/api/app-home/polaris-web-components
- **Using Web Components Guide**: https://shopify.dev/docs/api/polaris/using-polaris-web-components
- **Polaris Design Guidelines**: https://shopify.dev/docs/apps/design-guidelines
- **TypeScript Types**: `@shopify/polaris-types` npm package
- **Component Storybook**: (Reference implementation examples)

---

## Pitfalls

### Common Mistakes

1. **Using DataTable instead of IndexTable** — DataTable is for simple summaries; IndexTable is for complex data with search/filter/bulk actions
2. **Hardcoding spacing** — Always use design token spacing scale; never arbitrary pixels
3. **Not testing on mobile** — Responsive design is built-in but must be tested (tabs, modals, nav different on mobile)
4. **Mixing frameworks** — Don't add Tailwind, Material-UI, or custom CSS alongside Polaris
5. **Forgetting empty states** — Users are confused when data is loading or empty; always show state
6. **Modal action buttons failing on mobile** — Test modal actions thoroughly on Shopify mobile app
7. **Using skeleton screens** — Use spinners or Remix SSR instead; skeleton components not available
8. **Accessibility ignored** — Web components have a11y built-in, but developers must use semantic HTML and test keyboard nav
9. **Not using App Bridge with Polaris** — App Bridge (navigation, modals, toasts) complements Polaris; use both together
10. **Trying to style web components** — Shadow DOM encapsulation means CSS doesn't penetrate; use design tokens only

