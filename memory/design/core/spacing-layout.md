# Spacing & Layout System

**Last updated: 2026-04-04**

Complete spacing, layout, and responsive design guide for Boldteq SaaS products. Built on Tailwind CSS with 4px grid foundation.

---

## Spacing Foundation: 4px Grid

All spacing follows a 4px base unit system (Tailwind's default). This allows pixel-perfect alignment while maintaining scalability.

### Spacing Scale (Tailwind Values)

```
0     = 0px      (no space)
1     = 4px      (xxs)
2     = 8px      (xs)
3     = 12px     (xs+)
4     = 16px     (sm)
5     = 20px     (sm+)
6     = 24px     (md) *most common*
8     = 32px     (lg)
10    = 40px     (lg+)
12    = 48px     (xl)
16    = 64px     (2xl)
20    = 80px     (3xl)
24    = 96px     (4xl)
28    = 112px    (5xl)
32    = 128px    (6xl)
```

### Common Spacing Values (Most Used)

- **4px (1):** Border radius, tiny gaps
- **8px (2):** Icon-to-text, small gaps
- **12px (3):** Badge padding
- **16px (4):** Default gap, input padding
- **24px (6):** Card padding, section spacing *(most used)*
- **32px (8):** Large section gaps
- **48px (12):** Page-level spacing
- **64px (16):** Hero/feature spacing
- **96px (24):** Vertical rhythm between major sections

---

## Margin (External Spacing)

Margins separate **components from each other**. Use to create breathing room between distinct sections.

### Horizontal Margin

#### Centered Content
```tsx
<div className="mx-auto max-w-4xl px-4">
  {/* Content centered with max-width constraint */}
</div>
```
- `mx-auto` = `margin-left: auto; margin-right: auto;`
- **Usage:** Center page content on wide screens

#### Symmetric Horizontal Spacing
```tsx
<div className="mx-4">Item</div>  {/* 16px left & right */}
<div className="mx-6">Item</div>  {/* 24px left & right */}
```

#### Asymmetric Horizontal Spacing
```tsx
<div className="ml-4">Item</div>  {/* 16px left only */}
<div className="mr-auto">Item</div>  {/* Push right */}
```

### Vertical Margin

#### Between Components
```tsx
<Card className="mb-6">...</Card>
<Card>...</Card>
```
- `mb-4` = 16px below
- `mb-6` = 24px below (more common)
- `mb-8` = 32px below (larger gap)

#### Vertical Spacing in Containers
```tsx
<div className="space-y-4">
  <item />
  <item />
  <item />
</div>
```
- `space-y-4` = 16px gap between all children
- `space-y-6` = 24px gap (more breathing room)
- **Better than individual mb:** Only one rule, consistent

#### Negative Margin (Rare)
```tsx
<div className="-mt-2">Overlapping element</div>
```
- Use sparingly; prefer gap/space-y instead

### Margin Best Practices

- **Between cards:** `mb-6` or `space-y-6`
- **Between sections:** `mb-8` or `space-y-8`
- **Between page sections:** `mb-12` or `space-y-12`
- **Avoid stacking:** Don't add both `mb` + `mt` on adjacent items; use `space-y` on parent
- **External > internal:** Section margins ≥ card padding

---

## Padding (Internal Spacing)

Padding creates space **inside components**. Defines breathing room for content within a container.

### Common Padding Values

#### Standard Padding
```tsx
<Card className="p-4">content</Card>   {/* 16px on all sides */}
<Card className="p-6">content</Card>   {/* 24px (most common) */}
<Card className="p-8">content</Card>   {/* 32px (spacious) */}
```

#### Asymmetric Padding
```tsx
<Button className="px-4 py-2">Button</Button>   {/* 16px left/right, 8px top/bottom */}
<Card className="px-6 py-4">...</Card>          {/* 24px horizontal, 16px vertical */}
```

### Element-Specific Padding

#### Card Content
```tsx
<Card>
  <CardHeader className="px-6 py-4">
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent className="px-6 py-4">
    {/* Main content */}
  </CardContent>
  <CardFooter className="px-6 py-3">
    {/* Footer actions */}
  </CardFooter>
</Card>
```
- Header/Footer: `py-4` or `py-3`
- Content: `py-4` or `py-6` (depends on content density)
- Horizontal: Always `px-6` for consistency

#### Input Fields
```tsx
<Input className="px-3 py-2" />  {/* 12px left/right, 8px top/bottom */}
```
- Default shadcn Input has built-in padding
- Override if needed: `className="px-4 py-3"`

#### Table Cells
```tsx
<TableCell className="px-4 py-3">Data</TableCell>
```
- Horizontal: `px-4` (16px)
- Vertical: `py-3` (12px)
- Keeps table compact while readable

#### Buttons
```tsx
<Button className="px-6 py-2">Default</Button>      {/* 24px horiz, 8px vert */}
<Button size="lg" className="px-8 py-3">Large</Button>  {/* 32px horiz, 12px vert */}
<Button size="icon">Icon</Button>                     {/* Square, no text padding */}
```

#### Form Labels & Help Text
```tsx
<Label className="mb-2 block">Field Label</Label>
<Input />
<p className="mt-1 text-xs text-gray-500">Helper text</p>
```
- Label spacing: `mb-2` or `mb-3`
- Helper text: `mt-1` or `mt-2` (tight)

---

## Layout Patterns

### Max-Width Constraints

#### Container Max-Widths (Tailwind)
```
max-w-xs      = 320px   (mobile-only)
max-w-sm      = 384px   (narrow)
max-w-md      = 448px   (medium)
max-w-lg      = 512px   (wide)
max-w-xl      = 576px   (extra wide)
max-w-2xl     = 672px   (2xl)
max-w-3xl     = 768px   (3xl)
max-w-4xl     = 896px   (4xl - common for dashboards)
max-w-5xl     = 1024px  (5xl)
max-w-6xl     = 1152px  (6xl)
max-w-7xl     = 1280px  (7xl - full page content)
max-w-prose   = 65ch    (for readable text)
```

#### Centered Page Container
```tsx
<div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
  {/* Page content, responsive padding */}
</div>
```
- Mobile: `px-4` (16px)
- Tablet+: `px-6` (24px)
- Desktop: `px-8` (32px)

#### Content Width for Readability
```tsx
<article className="mx-auto max-w-prose">
  <h1>Article Title</h1>
  <p>Long-form content...</p>
</article>
```
- `max-w-prose` = 65 characters (optimal line length)

### Flexbox Patterns

#### Row Layout (Horizontal)
```tsx
<div className="flex gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```
- `flex` = display: flex (default flex-row)
- `gap-4` = 16px between children
- Default: `items-stretch` (full height)

#### Column Layout (Vertical)
```tsx
<div className="flex flex-col gap-6">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```
- `flex-col` = vertical stack
- `gap-6` = 24px between items

#### Centered Content
```tsx
<div className="flex items-center justify-center h-screen">
  <div>Centered box</div>
</div>
```
- `items-center` = vertical center
- `justify-center` = horizontal center
- `h-screen` = full viewport height

#### Space-Between Layout (Header Nav)
```tsx
<header className="flex items-center justify-between px-6 py-4 border-b">
  <div>Logo</div>
  <nav>Nav items</nav>
  <div>User menu</div>
</header>
```
- `justify-between` = first item left, last item right

#### Flex Grow (Expand to Fill)
```tsx
<div className="flex gap-4">
  <aside className="w-64">Sidebar</aside>
  <main className="flex-1">Content expands</main>
</div>
```
- `flex-1` = `flex-grow: 1` (takes remaining space)
- Sidebar: fixed width (`w-64`)

#### Wrapping Items
```tsx
<div className="flex flex-wrap gap-2">
  <Badge>Tag 1</Badge>
  <Badge>Tag 2</Badge>
</div>
```
- `flex-wrap` = children wrap to next line if needed
- `gap-2` = 8px between items

### Grid Patterns

#### Simple Grid (Equal Columns)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <Card>1</Card>
  <Card>2</Card>
  <Card>3</Card>
</div>
```
- Mobile: 1 column
- Tablet: 2 columns (md: 768px+)
- Desktop: 3 columns (lg: 1024px+)
- Gap: 24px between cards

#### Dashboard Grid (4 Columns)
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard>Stat 1</StatCard>
  <StatCard>Stat 2</StatCard>
  <StatCard>Stat 3</StatCard>
  <StatCard>Stat 4</StatCard>
</div>
```
- Responsive: 1 col → 2 cols → 4 cols
- Smaller gap (4 = 16px) for tight dashboard

#### Auto-Fit (Responsive Without Breakpoints)
```tsx
<div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
  <Card>Auto-fitting card 1</Card>
  <Card>Auto-fitting card 2</Card>
</div>
```
- Uses `auto-fit` to calculate columns
- Min width 250px, grows to fill space
- **Pro:** Works at any viewport width

#### Named Grid Areas (Complex Layouts)
```tsx
<div className="grid grid-cols-4 gap-4 h-screen" style={{
  gridTemplateAreas: `
    "header header header header"
    "sidebar content content content"
    "sidebar content content content"
    "footer footer footer footer"
  `
}}>
  <header style={{ gridArea: "header" }}>Header</header>
  <aside style={{ gridArea: "sidebar" }}>Sidebar</aside>
  <main style={{ gridArea: "content" }}>Content</main>
  <footer style={{ gridArea: "footer" }}>Footer</footer>
</div>
```
- Use for complex dashboard layouts
- Prefer flexbox for simpler layouts

### Sidebar + Main Content Layout

#### Fixed Sidebar Pattern
```tsx
<div className="flex h-screen">
  <aside className="w-64 border-r bg-gray-50 overflow-y-auto">
    {/* Sidebar: fixed 256px */}
  </aside>
  <main className="flex-1 flex flex-col">
    <header className="h-14 border-b px-6 flex items-center">
      {/* Header: fixed height 56px */}
    </header>
    <div className="flex-1 overflow-y-auto">
      {/* Scrollable content */}
    </div>
  </main>
</div>
```
- Sidebar: `w-64` (256px, fixed)
- Main: `flex-1` (fills remaining width)
- Header: `h-14` (56px, typical)
- Content: `flex-1` (fills remaining height)

#### Collapsible Sidebar
```tsx
<div className="flex h-screen">
  {isOpen && (
    <aside className="w-64 border-r transition-all">
      {/* Sidebar content */}
    </aside>
  )}
  <main className="flex-1 flex flex-col">
    <header className="h-14 border-b px-6 flex items-center gap-4">
      <button onClick={() => setIsOpen(!isOpen)}>☰</button>
      {/* Header content */}
    </header>
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Content */}
    </div>
  </main>
</div>
```
- Toggle sidebar visibility
- Use `transition-all` for smooth animation

#### Sidebar Collapse to Icon (SM Breakpoint)
```tsx
const Sidebar = ({ isOpen, onToggle }) => (
  <aside className={`
    border-r overflow-hidden transition-all
    ${isOpen ? 'w-64' : 'w-16'}
  `}>
    <nav className="space-y-2 p-4">
      {items.map(item => (
        <button className="flex gap-3 items-center px-3 py-2 rounded">
          <Icon className="w-5 h-5 shrink-0" />
          {isOpen && <span>{item.label}</span>}
        </button>
      ))}
    </nav>
  </aside>
)
```
- Sidebar: 256px when open, 64px when collapsed
- Icons always visible, labels hidden when collapsed

---

## Gap & Space Utilities

### Flex Gap (Between Flex Children)
```tsx
<div className="flex gap-2">
  {/* gap-2 = 8px between all children */}
</div>
```

### Grid Gap (Between Grid Cells)
```tsx
<div className="grid gap-6">
  {/* gap-6 = 24px between rows and columns */}
</div>
```

### Space-Y (Vertical Spacing)
```tsx
<div className="space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```
- `space-y-2` = 8px vertical gap
- `space-y-4` = 16px (most common)
- `space-y-6` = 24px (more breathing room)

### Space-X (Horizontal Spacing)
```tsx
<div className="space-x-2">
  <Badge>Tag 1</Badge>
  <Badge>Tag 2</Badge>
</div>
```
- `space-x-2` = 8px horizontal gap
- `space-x-4` = 16px gap

---

## Responsive Breakpoints

Tailwind's mobile-first breakpoints:

```
(no prefix) = 0px+        (mobile)
sm:         = 640px+      (small tablet)
md:         = 768px+      (tablet)
lg:         = 1024px+     (laptop)
xl:         = 1280px+     (desktop)
2xl:        = 1536px+     (large desktop)
```

### Responsive Padding Example
```tsx
<div className="px-4 md:px-6 lg:px-8">
  {/* 16px on mobile, 24px on tablet, 32px on desktop */}
</div>
```

### Responsive Grid Example
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
  {/* 1 col + 16px gap → 2 cols + 24px gap → 4 cols + 24px gap */}
</div>
```

### Responsive Text Example
```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl">
  {/* 24px on mobile, 30px on tablet, 36px on desktop */}
</h1>
```

---

## Sticky & Fixed Positioning

### Sticky Header
```tsx
<header className="sticky top-0 z-40 border-b bg-white">
  {/* Stays at top while scrolling, but scrolls away */}
</header>
```
- `sticky` = sticks until parent scrolls past
- `top-0` = distance from top
- `z-40` = stacking order (above content)
- `bg-white` = cover scrolling content

### Fixed Header (Always Visible)
```tsx
<header className="fixed top-0 left-0 right-0 z-50 border-b bg-white h-14">
  {/* Always visible at top */}
</header>
<main className="pt-14 mt-0">
  {/* Offset by header height */}
</main>
```
- `fixed` = doesn't scroll with page
- `pt-14` = padding-top to push content below header

### Sticky Sidebar
```tsx
<aside className="sticky top-0 h-screen overflow-y-auto">
  {/* Sidebar stays visible while scrolling */}
</aside>
```
- `sticky` + `top-0` = sticks to viewport top
- `overflow-y-auto` = scrollable if content exceeds height

---

## Scroll Areas & Overflow

### Scrollable Container
```tsx
<div className="h-64 overflow-y-auto border rounded-lg p-4">
  {/* Vertical scrollbar appears if content exceeds 256px height */}
</div>
```

### Horizontal Scroll (Code Block)
```tsx
<pre className="overflow-x-auto bg-gray-900 text-gray-100 p-4 rounded">
  <code>{codeBlock}</code>
</pre>
```
- `overflow-x-auto` = horizontal scrollbar if needed
- `overflow-y-hidden` = no vertical scrolling

### shadcn ScrollArea
```tsx
<ScrollArea className="h-[200px] w-full rounded-md border p-4">
  {/* Custom scrollbar styling */}
</ScrollArea>
```
- Use when custom scrollbar styling needed
- Cleaner than browser default

### Hide Scrollbar (But Still Scrollable)
```tsx
<div className="overflow-y-auto scrollbar-hide">
  {/* Scrolls but no visible scrollbar */}
</div>
```
- Add to `globals.css`:
  ```css
  .scrollbar-hide {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;      /* Firefox */
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;  /* Chrome, Safari and Opera */
  }
  ```

---

## Height & Width

### Full Height / Width
```tsx
<div className="h-full w-full">
  {/* 100% of parent */}
</div>

<div className="h-screen w-screen">
  {/* 100% of viewport */}
</div>
```

### Min-Height (Prevent Collapse)
```tsx
<main className="min-h-screen flex flex-col">
  <header>Header</header>
  <div className="flex-1">Content</div>
  <footer>Footer</footer>
</main>
```
- `min-h-screen` = at least 100vh
- `flex-1` = footer pushes to bottom if content short

### Fixed Dimensions
```tsx
<div className="h-14">Header (56px)</div>
<div className="w-64">Sidebar (256px)</div>
```

### Aspect Ratio
```tsx
<AspectRatio ratio={16 / 9} className="bg-gray-100">
  <img src="..." className="object-cover" />
</AspectRatio>
```
- Maintains 16:9 ratio at any width
- Useful for video placeholders, images

---

## Common Layout Combinations

### Landing Page Hero
```tsx
<section className="min-h-screen flex items-center justify-center px-4 py-12">
  <div className="text-center max-w-3xl">
    <h1 className="text-4xl font-bold mb-6">Heading</h1>
    <p className="text-xl text-gray-600 mb-8">Subheading</p>
    <Button size="lg">CTA</Button>
  </div>
</section>
```

### Dashboard Card Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {stats.map(stat => (
    <Card key={stat.id} className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
          <p className="text-3xl font-bold">{stat.value}</p>
        </div>
        <Icon className="w-8 h-8 text-blue-600" />
      </div>
    </Card>
  ))}
</div>
```

### Settings Page Layout
```tsx
<div className="max-w-4xl mx-auto px-4 py-8">
  <h1 className="text-4xl font-bold mb-8">Settings</h1>
  <div className="space-y-6">
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Account</h2>
      {/* Form fields */}
    </Card>
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Security</h2>
      {/* Form fields */}
    </Card>
  </div>
</div>
```

### Form Layout
```tsx
<div className="max-w-md">
  <div className="space-y-6">
    <div className="space-y-2">
      <Label>Email</Label>
      <Input type="email" />
      <p className="text-xs text-gray-500">We'll never share your email</p>
    </div>
    <div className="space-y-2">
      <Label>Password</Label>
      <Input type="password" />
    </div>
    <Button className="w-full">Sign In</Button>
  </div>
</div>
```

---

## Best Practices

### Do's
- Use `space-y-*` for vertical spacing (cleaner than individual margins)
- Use `gap` for flexbox/grid (auto-handles spacing)
- Prefer `max-w-*` over fixed widths (responsive)
- Use `px-4 md:px-6` for responsive padding
- Maintain consistent spacing scale (4px grid)
- Use `flex-1` to expand containers (avoids hardcoded widths)

### Don'ts
- Don't mix `space-y` with individual `mb-*` (causes double spacing)
- Don't hardcode viewport-specific widths; use `max-w-*` + responsive padding
- Don't add arbitrary padding to everything; use consistent scale
- Don't use `!important` to override spacing (restructure HTML instead)
- Don't reduce spacing below 4px base unit (breaks alignment)

---

## Spacing Checklist

- [ ] Page container has `max-w-7xl mx-auto px-4 md:px-6`
- [ ] Cards/sections use `p-6` padding (24px)
- [ ] Between cards use `space-y-6` or `mb-6`
- [ ] Form fields use `space-y-4` between inputs
- [ ] Header has fixed height (`h-14` or `h-16`)
- [ ] Sidebar is fixed width (`w-64`) and scrollable
- [ ] Main content has `flex-1` to fill space
- [ ] Footer sticks to bottom with flexbox
- [ ] Responsive padding: `px-4 md:px-6 lg:px-8`
- [ ] Responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`

---

## Sources & Further Reading

- [Tailwind CSS Spacing](https://tailwindcss.com/docs/padding)
- [Tailwind CSS Layout](https://tailwindcss.com/docs/display)
- [Tailwind CSS Grid](https://tailwindcss.com/docs/grid-template-columns)
- [Tailwind CSS Flexbox](https://tailwindcss.com/docs/flex)
- [4px Grid System Design](https://medium.com/@nishaznani/design-with-4px-grid-system-1676d1091f51)
- [Spacing in Design Systems](https://www.designsystems.com/space-grids-and-layouts/)
- [SaaS Dashboard Layouts](https://dev.to/pixel_mosaic/building-a-saas-dashboard-ui-from-scratch-with-code-286i)
