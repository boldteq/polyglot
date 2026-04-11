# Responsive Design — Mobile-First Patterns

> Source: shopify.dev/docs/apps/design/responsive | shopify.dev/docs/apps/build/performance
> Last extracted: 2026-04-04

## Key Rules

1. **Mobile-first design** — design for mobile first, then enhance for tablet/desktop
2. **Vertical scroll only** — no horizontal scrolling on mobile
3. **Touch targets ≥44×44px** — mandatory for mobile usability
4. **Polaris Layout handles most responsiveness** — Layout.Section variant="oneThird" auto-collapses on mobile
5. **Base spacing 8px** — all spacing multiples of 8px (8, 16, 24, 32, 40, 48...)
6. **Test at actual breakpoints** — don't just zoom; test on actual devices

---

## Responsive Breakpoints

### Standard Breakpoints
```
xs: <768px   (mobile, small tablets)
sm: 768px    (tablet portrait)
md: 1024px   (tablet landscape, small desktop)
lg: 1280px   (standard desktop)
xl: 1536px   (large desktop)
```

### Polaris Default Behavior
```typescript
// ✅ CORRECT — Polaris handles responsive collapse
<Layout>
  <Layout.Section>Main content (full-width on mobile)</Layout.Section>
  <Layout.Section variant="oneThird">
    Sidebar (full-width on mobile, 1/3 width on desktop)
  </Layout.Section>
</Layout>

// Automatically adapts — no media queries needed
```

---

## Mobile-First Grid Layout

### Using Grid for Manual Responsiveness

```typescript
// ✅ CORRECT — mobile-first columns
<Grid columns={{xs: 1, sm: 2, md: 3, lg: 4}}>
  <Grid.Cell>Item 1</Grid.Cell>
  <Grid.Cell>Item 2</Grid.Cell>
  <Grid.Cell>Item 3</Grid.Cell>
  <Grid.Cell>Item 4</Grid.Cell>
</Grid>

// Mobile: 1 column
// Tablet: 2 columns
// Desktop: 3-4 columns
```

### Stack-Based Layouts

```typescript
// ✅ CORRECT — stacks vertically on mobile, horizontally on desktop
<InlineStack gap="400" wrap="wrap">
  <Button>Option 1</Button>
  <Button>Option 2</Button>
  <Button>Option 3</Button>
</InlineStack>

// Mobile: buttons stack vertically
// Desktop: buttons in horizontal row
```

---

## Touch Targets & Spacing

### Mobile-Friendly Buttons
```typescript
// ✅ CORRECT — sufficient touch target size
<Button>Delete</Button>  {/* Default 48px height */}

// ✅ CORRECT — spacing between buttons
<BlockStack gap="300">
  {/* 12px spacing — minimum comfortable tapping */}
  <Button fullWidth>Save</Button>
  <Button fullWidth>Cancel</Button>
</BlockStack>

// ❌ AVOID — too small
<button style={{padding: "2px 4px"}}>Tiny button</button>

// ❌ AVOID — no spacing
<button>DeleteEdit</button>  {/* Can't tap accurately */}
```

### Spacing Scale
```
xs:   4px (micro)
sm:   8px (base)
md:  12px (comfortable)
lg:  16px (generous)
xl:  20px (large)
2xl: 24px (spacious)
3xl: 32px (very spacious)
```

---

## Table Responsiveness

### Responsive Table Pattern
```typescript
{isSmallScreen ? (
  // Mobile: Card list view
  <BlockStack gap="400">
    {products.map(product => (
      <Card key={product.id}>
        <BlockStack gap="200">
          <Text variant="headingMd">{product.name}</Text>
          <Text variant="bodySm">Price: ${product.price}</Text>
          <Button fullWidth onClick={() => handleEdit(product.id)}>Edit</Button>
        </BlockStack>
      </Card>
    ))}
  </BlockStack>
) : (
  // Desktop: Table view
  <IndexTable
    resourceName={{singular: "product", plural: "products"}}
    headings={[{title: "Name"}, {title: "Price"}, {title: "Action"}]}
    // ...
  />
)}
```

---

## Typography Responsiveness

### Font Sizing
```typescript
// ✅ CORRECT — Polaris Text component handles sizing
<Text variant="headingLg">Heading</Text>  {/* Auto-scales */}
<Text variant="bodySm">Small text</Text>

// ✅ CORRECT — readable line length on all sizes
// Max ~60 characters per line (optimal reading width)

// ❌ AVOID — fixed font sizes that don't scale
<h1 style={{fontSize: "32px"}}>Title</h1>
```

### Line Length (Readability)
```
Mobile (<768px):    ~40-50 characters
Tablet:             ~50-60 characters
Desktop (>1024px):  ~60-75 characters
```

---

## Form Responsiveness

### Mobile-Friendly Forms
```typescript
// ✅ CORRECT — full-width inputs on mobile
<BlockStack gap="400">
  <TextField
    label="Email"
    value={email}
    onChange={setEmail}
    autoComplete="email"
    type="email"
  />
  <TextField
    label="Password"
    value={password}
    onChange={setPassword}
    type="password"
    autoComplete="current-password"
  />
  <Button fullWidth submit>Sign In</Button>
</BlockStack>

// ❌ AVOID — narrow fixed-width forms on mobile
<div style={{maxWidth: "300px"}}>
  {/* 300px is too narrow on mobile */}
</div>
```

### Input Types for Mobile
```typescript
// ✅ CORRECT — proper input types trigger mobile keyboards
<TextField type="email" />      {/* Email keyboard */}
<TextField type="tel" />        {/* Phone keyboard */}
<TextField type="number" />     {/* Number keyboard */}
<TextField type="search" />     {/* Search keyboard */}
```

---

## Image Responsiveness

### Responsive Images
```typescript
// ✅ CORRECT — responsive image sizing
<img
  src="image.jpg"
  alt="Product image"
  sizes="(max-width: 768px) 100vw, 50vw"
  style={{maxWidth: "100%", height: "auto"}}
/>

// ✅ CORRECT — Polaris Thumbnail (handles responsiveness)
<Thumbnail source="image.jpg" alt="..." />

// ❌ AVOID — fixed-width images
<img src="image.jpg" style={{width: "500px"}} />
```

---

## Navigation Responsiveness

### Mobile Navigation
```typescript
// ✅ CORRECT — NavMenu handled by Shopify
// (desktop: sidebar, mobile: drawer)
<NavMenu>
  <a href="/app" rel="home">Dashboard</a>
  <a href="/app/products">Products</a>
</NavMenu>

// Mobile automatically shows drawer navigation
// No custom hamburger menu needed
```

---

## Testing Responsive Design

### Chrome DevTools Responsive Testing
1. Open DevTools (F12)
2. Click responsive icon (device frame)
3. Select device or custom size
4. Test interactions, layout, text readability
5. Test landscape vs. portrait

### Real Device Testing
- Test on actual phones (iOS + Android)
- Test on tablets (iPad, etc.)
- Test keyboard navigation on mobile
- Test touch interactions (tap, long-press)
- Test at different zoom levels (browser zoom)

### Viewport Sizes to Test
- iPhone SE (375px)
- iPhone 12 (390px)
- iPad (768px)
- iPad Pro (1024px)
- Desktop (1280px+)

---

## Pitfalls

- **Desktop-first design** — design mobile second; this creates poor mobile UX
- **Horizontal scrolling on mobile** — absolutely avoid; vertical scroll only
- **Too-small touch targets** — <44px buttons are inaccessible
- **No spacing between targets** — users tap wrong button on mobile
- **Unresponsive images** — images that overflow container on mobile
- **Fixed-width containers** — max-width instead of 100vw
- **No text size adjustment** — text unreadable on small screens
- **Table on mobile without collapse** — tables illegible on mobile; convert to cards
- **Polaris components ignored** — using custom layout instead of Layout/Grid
- **No zoom/pinch support** — blocking viewport zoom hurts accessibility
