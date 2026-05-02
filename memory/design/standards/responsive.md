# Responsive Design Standards

**Last updated: 2026-04-04**

## Overview

Responsive design is non-negotiable for SaaS applications. Users access from desktop, tablet, and mobile—all must work seamlessly. Use a **mobile-first approach**: design for the smallest screen first, then progressively enhance with larger breakpoints.

---

## Mobile-First Philosophy

Start with mobile (smallest viewport), then add complexity for larger screens. This forces prioritization of core functionality.

**Principle:** Unprefixed utilities apply to all screen sizes; prefixed utilities (sm:, md:, lg:) apply *only at that breakpoint and above*.

```tsx
// ✓ GOOD: Mobile-first
<div className="flex flex-col md:flex-row gap-4">
  {/* Mobile: stacked vertically; md+: horizontal row */}
  <Card>Sidebar</Card>
  <div className="flex-1">Main content</div>
</div>

// ✗ BAD: Desktop-first (requires "undo" for mobile)
<div className="flex flex-row md:flex-col gap-4">
  {/* Confusing: undoing on smaller screens */}
</div>
```

---

## Tailwind Breakpoints

Tailwind's default breakpoints align with real device ranges:

| Breakpoint | Viewport Width | Use Case | Typical Device |
|------------|-----------------|----------|---|
| *none* (base) | < 640px | Mobile | Phone (default) |
| **sm:** | ≥ 640px | Large phone | Large phone / small tablet |
| **md:** | ≥ 768px | Tablet | iPad / small laptop |
| **lg:** | ≥ 1024px | Desktop | Laptop / desktop (primary) |
| **xl:** | ≥ 1280px | Large desktop | Large desktop / external monitor |
| **2xl:** | ≥ 1536px | Extra large | Ultra-wide desktop (rare) |

**Most SaaS apps optimize for: mobile → md → lg** (rarely need xl or 2xl)

---

## Common Layout Patterns

### Sidebar Visibility

Desktop shows sidebar; mobile hides it behind a drawer/hamburger.

```tsx
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      {/* Hidden on mobile, visible on md+ */}
      <aside className="hidden md:block w-64 border-r">
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col">
        {/* Mobile header with hamburger menu */}
        <header className="md:hidden flex items-center justify-between p-4 border-b">
          <h1>App</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button>☰</button>
            </SheetTrigger>
            <SheetContent side="left">
              <Sidebar />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Key:**
- Sidebar: `hidden md:block` (hidden on mobile, visible at md)
- Mobile menu: Sheet/Drawer component from shadcn-ui
- Padding: `p-4` (mobile), `md:p-6` (tablet+)

### Navigation Tabs

Desktop: horizontal tabs. Mobile: potentially different layout (vertical, bottom tabs, or collapsible).

```tsx
// ✓ GOOD: Responsive tab layout
export function Tabs() {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Mobile: stacked buttons; md+: horizontal */}
      <button className="flex-1 md:flex-auto px-4 py-2 border-b-2 border-blue-500">
        Tab 1
      </button>
      <button className="flex-1 md:flex-auto px-4 py-2 border-b-2 border-gray-200">
        Tab 2
      </button>
    </div>
  );
}

// ✓ BETTER: Use Radix Tabs (handles responsive automatically)
import * as RadixTabs from '@radix-ui/react-tabs';

export function ResponsiveTabs() {
  return (
    <RadixTabs.Root defaultValue="tab1">
      <RadixTabs.List className="flex flex-wrap md:flex-nowrap gap-2">
        <RadixTabs.Trigger value="tab1">Tab 1</RadixTabs.Trigger>
        <RadixTabs.Trigger value="tab2">Tab 2</RadixTabs.Trigger>
      </RadixTabs.List>
      {/* Content */}
    </RadixTabs.Root>
  );
}
```

### Card Grid Reflow

4-column grid on desktop → 2-column on tablet → 1-column on mobile.

```tsx
// ✓ GOOD: Progressive collapse
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {items.map((item) => (
    <Card key={item.id}>{item.name}</Card>
  ))}
</div>

// Mobile: 1 col (grid-cols-1 is default)
// Tablet (md): 2 cols (grid-cols-2)
// Desktop (lg): 4 cols (grid-cols-4)
```

**Pattern:** Start with single column (mobile), expand at each breakpoint.

### Form Layout

Desktop: 2-column form. Mobile: single column.

```tsx
<form className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label htmlFor="first-name">First Name</label>
      <input id="first-name" type="text" />
    </div>
    <div>
      <label htmlFor="last-name">Last Name</label>
      <input id="last-name" type="text" />
    </div>
  </div>

  <div>
    <label htmlFor="email">Email</label>
    <input id="email" type="email" />
  </div>

  <button type="submit">Submit</button>
</form>

// Mobile: 1 column
// Tablet+: 2 columns for First Name / Last Name
```

### Table to Card View

Tables don't reflow well on mobile. Transform to card view on small screens.

```tsx
// Desktop: table view
export function ResponsiveTable({ data }) {
  return (
    <>
      {/* Hidden on mobile (< md) */}
      <table className="hidden md:table w-full">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.email}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: card view (visible only < md) */}
      <div className="md:hidden space-y-4">
        {data.map((row) => (
          <div key={row.id} className="border rounded-lg p-4">
            <div className="flex justify-between">
              <span className="font-semibold">{row.name}</span>
              <span className="text-sm text-gray-500">{row.status}</span>
            </div>
            <div className="text-sm text-gray-600 mt-2">{row.email}</div>
          </div>
        ))}
      </div>
    </>
  );
}
```

**Key:**
- `hidden md:table`: Show table only on md and up
- `md:hidden`: Show card view only on mobile

---

## Typography & Font Sizing

**Base font size matters more than responsive scaling.** Good base sizing (16px on mobile) often needs no scaling adjustments.

```tsx
// ✓ GOOD: Consistent base sizes (rarely need responsive adjustments)
<h1 className="text-2xl md:text-3xl font-bold">
  Page Title
</h1>

<p className="text-base md:text-lg">
  Body text
</p>

// ✗ AVOID: Over-adjusting typography
<p className="text-xs sm:text-sm md:text-base lg:text-lg">
  Too much complexity; just use text-base
</p>
```

**General Rule:** Start with good base size; only adjust heading sizes at breakpoints. Body text typically doesn't need responsive scaling.

---

## Padding & Spacing

Adjust padding for screen size to maximize readability and breathing room.

```tsx
// ✓ GOOD: Progressive padding
<div className="px-4 py-6 md:px-6 md:py-8 lg:px-8">
  {/* Mobile: 16px horizontal, 24px vertical */}
  {/* Tablet: 24px horizontal, 32px vertical */}
  {/* Desktop: 32px horizontal, 32px vertical */}
</div>

// ✓ Container padding pattern
<main className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
  {children}
</main>
```

**Pattern:**
- Mobile: `px-4` (16px)
- Tablet (md): `md:px-6` (24px)
- Desktop (lg): `lg:px-8` (32px)

---

## Touch Targets

Buttons and interactive elements must be at least 44px × 44px on mobile (WCAG requirement).

```tsx
// ✓ GOOD: Adequate touch target
<button className="h-11 px-4 py-2">
  {/* 44px height minimum (11 * 4px = 44px) */}
</button>

// ✓ Using shadcn-ui Button (handles sizing automatically)
<Button size="default">Action</Button> {/* 40-44px */}
<Button size="lg">Large Action</Button>    {/* 44px+ */}

// ✗ BAD: Too small for touch
<button className="h-6 px-2">
  {/* Only 24px, hard to tap on mobile */}
</button>
```

---

## Images & Media

Make images responsive and performant across all screen sizes.

```tsx
// ✓ GOOD: Responsive image with proper sizing
<img
  src="image.jpg"
  alt="Description"
  className="w-full h-auto object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>

// ✓ Using Next.js Image (if using Next.js)
import Image from 'next/image';

<Image
  src="/image.jpg"
  alt="Description"
  width={1200}
  height={800}
  responsive
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// ✓ Responsive background image
<div
  className="w-full h-64 md:h-96 bg-cover bg-center"
  style={{
    backgroundImage: 'url(/hero-mobile.jpg)',
  }}
  // Use media query to swap for larger image on desktop
/>
```

**Key Points:**
- `w-full h-auto`: Fill width, maintain aspect ratio
- `object-cover`: Maintain aspect ratio, crop if necessary
- `sizes` attribute: Helps browser load appropriate image size
- Compress images (use WebP, AVIF formats)

---

## Dialog → Drawer Pattern

Dialogs don't work well on mobile. Use Drawer on small screens, Dialog on desktop.

```tsx
// ✓ GOOD: Responsive dialog/drawer
export function ResponsiveModal({ isOpen, onClose, children }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="rounded-t-lg">
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// Alternative: Use Radix's built-in responsive behavior
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Content className="md:max-w-lg">
  {/* Drawer-like on mobile via CSS, Dialog-like on desktop */}
</Dialog.Content>
```

---

## Hiding & Showing Elements

Use `hidden` and block utilities to show/hide content at breakpoints.

```tsx
// ✓ Show on desktop only
<nav className="hidden lg:block">
  {/* Full navigation menu, only on desktop */}
</nav>

// ✓ Show on mobile only
<Sheet>
  <SheetTrigger className="lg:hidden">
    {/* Hamburger menu, only on mobile */}
  </SheetTrigger>
</Sheet>

// ✓ Hide non-essential elements on mobile
<div className="hidden md:block">
  {/* Sidebar content, hidden on mobile */}
</div>

<div className="md:hidden">
  {/* Mobile-only content */}
</div>
```

---

## Container Queries (Future-Proof)

CSS Container Queries allow responsive styling based on parent container width (not viewport). Useful for reusable components.

```tsx
// ✓ Component adjusts based on its container, not viewport
<div className="@container">
  <Card className="@md:grid @md:grid-cols-2">
    {/* Grid layout only if container is large enough */}
  </Card>
</div>

// Tailwind config for container queries
module.exports = {
  theme: {
    extend: {
      containers: {
        sm: '20rem',
        md: '28rem',
        lg: '32rem',
      },
    },
  },
};
```

**Benefits:** Components are responsive regardless of page layout. Sidebar resizes? Cards reflow automatically.

---

## Testing Responsive Design

### Browser DevTools
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Test at multiple breakpoints:
   - Mobile (375px - 480px)
   - Tablet (768px - 1024px)
   - Desktop (1440px+)
4. Test orientation (landscape/portrait)
5. Test with zoom (100%, 125%, 200%)

### Real Device Testing
- **Critical:** Test on actual devices if possible
- iPhones (SE, 12, 14, 15 Pro)
- Android phones (Pixel, Samsung)
- iPad / Android tablets
- Landscape orientation on phones

### Automated Testing
```bash
# Percy.io or similar for visual regression testing
npm install --save-dev @percy/cli

# Lighthouse CI for performance at different viewports
npm install --save-dev @lhci/cli@
```

### Checklist
- [ ] Mobile (< 640px): all content accessible, touch targets 44x44px
- [ ] Tablet (640-1024px): layout optimized, sidebar or drawer navigation
- [ ] Desktop (> 1024px): full UI, sidebar visible, grid expanded
- [ ] Zoom at 200%: still readable, no horizontal scroll
- [ ] Orientation changes: portrait/landscape work correctly
- [ ] Images load properly at all sizes
- [ ] Typography readable at all sizes
- [ ] No horizontal scrolling on mobile
- [ ] Forms fill full width on mobile (not constrained)
- [ ] Buttons/links are 44x44px minimum on mobile

---

## Common Mistakes

1. **Desktop-first instead of mobile-first**
   ```tsx
   // ✗ BAD: Start with desktop, undo on mobile
   <div className="flex flex-row md:flex-col">
   ```

2. **Too many breakpoints**
   ```tsx
   // ✗ BAD: Overcomplicating
   <div className="w-full sm:w-1/2 md:w-2/3 lg:w-1/3 xl:w-1/4 2xl:w-1/5">

   // ✓ GOOD: Simple and clear
   <div className="w-full md:w-1/2 lg:w-1/3">
   ```

3. **Forgetting viewport meta tag**
   ```html
   <!-- REQUIRED in <head> -->
   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
   ```

4. **Fixed widths instead of responsive**
   ```tsx
   // ✗ BAD: Fixed width breaks on mobile
   <div className="w-800px">

   // ✓ GOOD: Responsive
   <div className="w-full md:w-2/3 max-w-4xl">
   ```

5. **Not testing on real mobile devices**
   - DevTools emulation misses real performance, touch behavior, orientation bugs
   - Always test on 2-3 real devices

---

## References

- [Tailwind CSS Responsive Design Docs](https://tailwindcss.com/docs/responsive-design)
- [MDN: Responsive Web Design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design)
- [Mobile-First CSS Guide](https://www.freecodecamp.org/news/how-to-use-css-media-queries-to-create-responsive-websites/)
- [CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Container_queries)
- [SaaS Design Patterns 2024](https://www.flexy.global/resources/saas/5-best-practices-for-saas-product-design-2024)
