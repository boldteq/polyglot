# Accessibility (WCAG AA Compliance)

> Source: shopify.dev/docs/apps/design/user-experience | shopify.dev/docs/apps/build/security
> Last extracted: 2026-04-04

## Key Rules

1. **WCAG AA minimum** — 4.5:1 contrast ratio for all text
2. **Keyboard navigation fully functional** — tab order, focus visible, no keyboard traps
3. **Heading hierarchy** — h1 → h2 → h3 (never skip levels)
4. **Form labels mandatory** — every input must have associated label
5. **Touch targets ≥44×44px** — critical for mobile and accessibility
6. **Screen reader support** — semantic HTML + ARIA labels where needed

---

## Contrast Ratio (4.5:1 Minimum)

### Text Contrast
- **Normal text:** 4.5:1 ratio minimum
- **Large text (18pt+):** 3:1 ratio minimum
- **Polaris components** pre-meet this — use design tokens for colors

### Testing Tools
- WebAIM contrast checker
- Chrome DevTools Lighthouse (Accessibility audit)
- Axe DevTools browser extension

### Polaris Colors Meet AA Standards
```typescript
// ✅ CORRECT — Polaris colors pre-meet WCAG AA
<Text tone="critical">Error message</Text>
<Banner tone="success">Saved</Banner>

// ❌ AVOID — custom colors without testing
<Text style={{color: "#999999"}}>Light gray text</Text>
```

---

## Keyboard Navigation

### Requirements
1. **Tab through all interactive elements** — buttons, links, form fields
2. **Tab order logical** — typically left-to-right, top-to-bottom
3. **Focus indicator visible** — outlined/highlighted focus state (Polaris provides)
4. **No keyboard traps** — user can tab out of any element
5. **Enter/Space for buttons** — standard keyboard activation

### Implementation
```typescript
// ✅ CORRECT — semantic buttons are keyboard-accessible by default
<Button onClick={handleSave}>Save</Button>

// ❌ AVOID — div with onClick lacks keyboard support
<div onClick={handleSave} style={{cursor: "pointer"}}>Save</div>

// ✅ CORRECT — use form for proper keyboard flow
<form onSubmit={handleSubmit}>
  <TextField label="Name" {...} />
  <Button submit>Save</Button>
</form>
```

### Testing Keyboard Navigation
1. Press Tab to navigate forward
2. Press Shift+Tab to navigate backward
3. Verify focus visible on all interactive elements
4. Verify logical tab order
5. Test form submission with Enter key

---

## Heading Hierarchy

### Correct Hierarchy
```typescript
// ✅ CORRECT — no skipping levels
<Page title="Products">
  {/* Page title is implicitly h1 */}

  <Layout.AnnotatedSection title="Active">
    {/* Section title is h2 */}
    <p>Section content</p>
  </Layout.AnnotatedSection>

  <Layout.AnnotatedSection title="Draft">
    {/* Another h2 */}
  </Layout.AnnotatedSection>
</Page>

// ❌ AVOID — skipping h2 to h4
<h1>Page Title</h1>
<h4>Subsection</h4>  {/* Should be h2 */}
```

### Semantic Structure
- **h1:** Page title (only one per page)
- **h2:** Major sections
- **h3:** Subsections within h2
- **Text:** Regular body text
- **Label:** Form field labels

---

## Form Labels & Inputs

### Label Association (Required)
```typescript
// ✅ CORRECT — label associated with input
<TextField label="Email address" value={email} onChange={setEmail} />

// ✅ CORRECT — implicit label association
<label htmlFor="email">Email address</label>
<input id="email" value={email} onChange={setEmail} />

// ❌ AVOID — label without association
<label>Email address</label>
<input value={email} onChange={setEmail} />
```

### Form Validation
```typescript
// ✅ CORRECT — error message associated with field
<TextField
  label="Email"
  value={email}
  onChange={setEmail}
  error={hasError ? "Please enter a valid email" : undefined}
  type="email"
/>

// ✅ CORRECT — aria-describedby for additional context
<input
  type="password"
  aria-label="Password"
  aria-describedby="pwd-hint"
/>
<div id="pwd-hint">Must be at least 8 characters</div>
```

---

## Screen Reader Support

### ARIA Labels (When Needed)
```typescript
// ✅ CORRECT — icon-only button needs aria-label
<Button icon={<DeleteIcon />} aria-label="Delete product" onClick={handleDelete} />

// ✅ CORRECT — aria-label for data visualization
<div role="img" aria-label="Sales increased 25% this week">
  <BarChart data={...} />
</div>

// ❌ AVOID — redundant labels
<Button aria-label="Delete">
  Delete
</Button>
```

### Semantic HTML
```typescript
// ✅ CORRECT — use semantic elements
<nav>Navigation menu</nav>
<main>Page content</main>
<aside>Sidebar content</aside>
<footer>Footer content</footer>

// ✅ CORRECT — button for clickable actions
<button onClick={handleDelete}>Delete</button>

// ❌ AVOID — div for interactive elements
<div onClick={handleDelete} role="button">Delete</div>
```

### Alt Text for Images
```typescript
// ✅ CORRECT — meaningful alt text
<img src="product.jpg" alt="Blue T-shirt with logo" />

// ❌ AVOID — generic alt text
<img src="product.jpg" alt="Image" />

// ✅ CORRECT — skip decorative images
<img src="divider.svg" alt="" />  {/* empty alt for decorative */}
```

---

## Touch Targets (Mobile & Accessibility)

### Minimum Sizes
- **Touch buttons:** 44×44px minimum
- **Link targets:** 44×44px minimum
- **Spacing between targets:** 8px minimum
- **Larger is better** — don't max out at 44px; go larger if space allows

### Implementation
```typescript
// ✅ CORRECT — Polaris components meet 44px standard
<Button>Delete</Button>  {/* 48px default height */}

// ✅ CORRECT — sufficient spacing
<BlockStack gap="400">
  {/* 16px gap between items */}
  <Button>Option 1</Button>
  <Button>Option 2</Button>
</BlockStack>

// ❌ AVOID — too small
<button style={{padding: "2px 4px"}}>Delete</button>
```

---

## Color & Contrast in Data Visualization

### Accessibility in Charts
```typescript
// ✅ CORRECT — colors + patterns/labels (not color alone)
// Use distinct colors + data labels
// Use patterns or symbols for monochrome support

// ❌ AVOID — relying on color alone
// "Red = bad, green = good" (colorblind users miss meaning)
// Always add text labels, icons, or patterns
```

---

## Testing Accessibility

### Automated Tools
1. **Chrome DevTools Lighthouse** — accessibility audit
2. **Axe DevTools** — browser extension for detailed checks
3. **WebAIM WCAG checker** — contrast and compliance testing
4. **axe-core** — npm package for automated testing

### Manual Testing
1. **Keyboard navigation** — use Tab/Shift+Tab only
2. **Screen reader** — use NVDA (Windows) or VoiceOver (Mac)
3. **Contrast checking** — zoom to 200%, verify readability
4. **Focus indicators** — verify visible focus outline
5. **Mobile testing** — test on actual touch devices

---

## Pitfalls

- **Low contrast text** — check 4.5:1 ratio for all text
- **Color-only indicators** — red/green alone (colorblind users can't see); add icon/label
- **Broken heading hierarchy** — never skip h2 to h4; maintain sequence
- **Missing form labels** — all inputs must have associated labels
- **Tiny touch targets** — <44px buttons are inaccessible on mobile
- **Keyboard traps** — user can tab into element but not out
- **No focus indicators** — focus state invisible; users can't see where they are
- **Missing alt text** — images without descriptions; decorative images need empty alt=""
- **Unannounced dynamic content** — use aria-live for updates
- **Modal without focus management** — focus should trap inside modal
