# SaaS Typography System

**Last updated: 2026-04-04**

Comprehensive guide to typography for Boldteq SaaS products. This system defines font selection, type scale, responsive patterns, and accessibility standards.

---

## Font Selection

### Primary Font: **Inter**
- **Why:** Purpose-built for screens (Rasmus Andersson, 2016). Used by Notion, Linear, Shopify, Figma
- **Features:**
  - Tall x-height (open apertures) → readable at small sizes (12px, 14px)
  - Optical sizing axis → adapts rendering for readability at all sizes
  - Variable font (100-900 weight) → smooth weight adjustments
  - Natural line width → reduces eye strain on dashboards
- **Weights used:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Load:** Via Google Fonts (default) or host locally for privacy

### Secondary Font: **System Stack** (for fallback)
```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

### Monospace: **Fira Code** or **JetBrains Mono** (for code blocks)
- Used for: `<code>`, API responses, resume text display
- Load via Google Fonts or include in @font-face

---

## Type Scale (Tailwind + Inter)

### Tailwind to Pixel/Rem Conversion
Tailwind uses a 16px base (1rem = 16px):
- `text-xs` = 12px (0.75rem)
- `text-sm` = 14px (0.875rem)
- `text-base` = 16px (1rem)
- `text-lg` = 18px (1.125rem)
- `text-xl` = 20px (1.25rem)
- `text-2xl` = 24px (1.5rem)
- `text-3xl` = 30px (1.875rem)
- `text-4xl` = 36px (2.25rem)

### Heading Hierarchy

#### **H1** — Page Title (36px, 2.25rem)
- **Tailwind:** `text-4xl font-semibold`
- **Line height:** 1.2 (43.2px)
- **Letter spacing:** -0.02em
- **Weight:** 600 (semibold) or 700 (bold)
- **Usage:** Page heading, main title
- **Example:** "Dashboard", "Admin Panel", "Resume Ranker"
- **Code:**
  ```tsx
  <h1 className="text-4xl font-semibold leading-tight -tracking-wide">
    Page Title
  </h1>
  ```

#### **H2** — Section Heading (30px, 1.875rem)
- **Tailwind:** `text-3xl font-semibold`
- **Line height:** 1.3 (39px)
- **Letter spacing:** -0.01em
- **Weight:** 600 (semibold)
- **Usage:** Major section headers
- **Example:** "User Statistics", "Billing History", "Advanced Settings"
- **Code:**
  ```tsx
  <h2 className="text-3xl font-semibold leading-snug -tracking-tight">
    Section Heading
  </h2>
  ```

#### **H3** — Subsection Heading (24px, 1.5rem)
- **Tailwind:** `text-2xl font-semibold`
- **Line height:** 1.4 (33.6px)
- **Weight:** 600 (semibold)
- **Usage:** Card titles, subsections
- **Example:** "Account Information", "Payment Method", "Resume Details"
- **Code:**
  ```tsx
  <h3 className="text-2xl font-semibold leading-snug">
    Subsection Heading
  </h3>
  ```

#### **H4** — Card / Dialog Title (20px, 1.25rem)
- **Tailwind:** `text-xl font-semibold`
- **Line height:** 1.5 (30px)
- **Weight:** 600 (semibold)
- **Usage:** Dialog titles, card headers, form group titles
- **Example:** "Create New Job", "Edit User", "Confirm Delete"
- **Code:**
  ```tsx
  <h4 className="text-xl font-semibold leading-snug">
    Dialog Title
  </h4>
  ```

#### **H5** — Label / Field Heading (18px, 1.125rem)
- **Tailwind:** `text-lg font-semibold`
- **Line height:** 1.6 (28.8px)
- **Weight:** 600 (semibold)
- **Usage:** Field labels, inline section headers
- **Example:** "Job Description", "Resume File", "Confidence Score"

#### **H6** — Small Heading / Category (16px, 1rem)
- **Tailwind:** `text-base font-semibold`
- **Line height:** 1.5 (24px)
- **Weight:** 600 (semibold)
- **Usage:** Small category headings, mini section titles
- **Example:** "Recent Activity", "Quick Links", "Status"

---

## Body & Paragraph Text

### **Body Regular** (16px, 1rem)
- **Tailwind:** `text-base font-normal` or `text-base`
- **Line height:** 1.6 (25.6px) for readability
- **Letter spacing:** 0 (default)
- **Weight:** 400 (regular)
- **Usage:** Main paragraph text, descriptions, help text
- **Code:**
  ```tsx
  <p className="text-base leading-relaxed">
    This is body text that reads naturally on screen.
  </p>
  ```
- **Spacing:** Space paragraphs with `mb-4` or `space-y-4` on containers

### **Body Small** (14px, 0.875rem)
- **Tailwind:** `text-sm font-normal`
- **Line height:** 1.6 (22.4px)
- **Usage:** Secondary text, descriptions, table cells, metadata
- **Example:** "Last updated: 2 hours ago", "From: john@example.com"
- **Code:**
  ```tsx
  <p className="text-sm text-gray-600">
    Secondary information goes here
  </p>
  ```

### **Body Extra Small** (12px, 0.75rem)
- **Tailwind:** `text-xs font-normal`
- **Line height:** 1.5 (18px)
- **Usage:** Captions, timestamps, fine print, helper text
- **Example:** "Terms of Service", "Privacy Policy", "© 2026"
- **Code:**
  ```tsx
  <p className="text-xs text-gray-500">
    Disclaimer or caption text
  </p>
  ```

---

## Text Styling Modifiers

### Weight Classes
```tsx
<p className="font-light">Light (300)</p>
<p className="font-normal">Regular (400)</p>
<p className="font-medium">Medium (500)</p>
<p className="font-semibold">Semibold (600)</p>
<p className="font-bold">Bold (700)</p>
<p className="font-extrabold">Extra Bold (800)</p>
```

### Line Height Classes
- `leading-tight` = 1.25 (for headings)
- `leading-snug` = 1.375 (for subheadings)
- `leading-normal` = 1.5 (default)
- `leading-relaxed` = 1.625 (for paragraphs)
- `leading-loose` = 2 (for increased readability)

### Letter Spacing Classes
- `-tracking-widest` = -0.16em (tighten headings)
- `-tracking-wide` = -0.02em (slight tighten)
- `tracking-normal` = 0 (default)
- `tracking-wide` = 0.025em (space out)
- `tracking-widest` = 0.1em (spread out captions)

---

## Label & Form Text

### **Form Label** (14px, 0.875rem)
- **Tailwind:** `text-sm font-medium`
- **Line height:** 1.5 (21px)
- **Weight:** 500 (medium)
- **Usage:** Form field labels
- **Code:**
  ```tsx
  <Label className="text-sm font-medium">Email Address</Label>
  ```

### **Helper Text / Hint** (12px, 0.75rem)
- **Tailwind:** `text-xs text-gray-500 mt-1`
- **Usage:** Underneath form fields, clarifications
- **Example:** "We'll never share your email"
- **Code:**
  ```tsx
  <p className="text-xs text-gray-500 mt-1">
    Maximum file size: 10MB
  </p>
  ```

### **Error Text** (12px, 0.75rem)
- **Tailwind:** `text-xs text-red-600 mt-1`
- **Usage:** Validation errors, warnings
- **Code:**
  ```tsx
  <p className="text-xs text-red-600 mt-1">
    {error?.message}
  </p>
  ```

### **Success Text** (12px, 0.75rem)
- **Tailwind:** `text-xs text-green-600 mt-1`

---

## Code & Technical Text

### **Inline Code** (14px, 0.875rem)
- **Tailwind:** `text-sm font-mono bg-gray-100 px-2 py-1 rounded`
- **Background:** Light gray or dark gray (dark mode)
- **Font family:** Monospace
- **Usage:** Variable names, API endpoints, commands
- **Code:**
  ```tsx
  <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
    const apiKey
  </code>
  ```

### **Code Block** (13px, 0.8125rem)
- **Tailwind:** `text-sm font-mono bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto`
- **Line height:** 1.7 (for readability)
- **Usage:** Multi-line code examples
- **Code:**
  ```tsx
  <pre className="text-sm font-mono bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
    <code>{codeSnippet}</code>
  </pre>
  ```

---

## Text Truncation & Overflow

### Single Line Truncation
```tsx
<p className="truncate">
  This text will be cut off with ellipsis...
</p>
```
- **Tailwind:** `truncate`
- **CSS:** `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`

### Multi-line Truncation
```tsx
<p className="line-clamp-3">
  Long text that spans multiple lines but stops at 3 lines with ellipsis
</p>
```
- **Tailwind:** `line-clamp-2`, `line-clamp-3`, `line-clamp-4`, etc.
- **Usage:** Preview text, card descriptions

### Overflow Breaking
```tsx
<p className="break-words">
  VeryLongwordWithoutspacesthatcanbreaklines
</p>
```
- **Tailwind:** `break-words` or `break-all`

---

## Responsive Typography

### Scaling Headings for Mobile
```tsx
<h1 className="text-2xl md:text-4xl font-semibold">
  Responsive Heading
</h1>
```

### Scaling Body Text
```tsx
<p className="text-sm md:text-base leading-relaxed">
  Paragraph text scales from 14px on mobile to 16px on desktop
</p>
```

### Breakpoint-Specific Sizes
- `sm:text-sm` — apply on 640px and up
- `md:text-base` — apply on 768px and up
- `lg:text-lg` — apply on 1024px and up
- `xl:text-xl` — apply on 1280px and up
- `2xl:text-2xl` — apply on 1536px and up

### Fluid Typography Pattern (CSS Clamp)
For smooth scaling without breakpoints:
```tsx
<h1 className="text-[clamp(24px,5vw,48px)] font-semibold">
  Scales from 24px to 48px as viewport changes
</h1>
```

---

## Color + Typography

### Text Color Classes
```tsx
<p className="text-gray-900">Primary text (dark)</p>
<p className="text-gray-600">Secondary text (medium gray)</p>
<p className="text-gray-500">Tertiary text (light gray)</p>
<p className="text-gray-400">Disabled text (very light)</p>
<p className="text-blue-600">Link text</p>
<p className="text-red-600">Error text</p>
<p className="text-green-600">Success text</p>
```

### Dark Mode Text Colors
```tsx
<p className="text-gray-900 dark:text-gray-100">
  Adapts for dark mode
</p>
```

---

## Typography Presets (Reusable Combinations)

Create Tailwind `@apply` rules in `globals.css`:

```css
@layer components {
  .h1 {
    @apply text-4xl font-semibold leading-tight -tracking-wide;
  }

  .h2 {
    @apply text-3xl font-semibold leading-snug -tracking-tight;
  }

  .h3 {
    @apply text-2xl font-semibold leading-snug;
  }

  .h4 {
    @apply text-xl font-semibold leading-snug;
  }

  .body {
    @apply text-base leading-relaxed;
  }

  .body-sm {
    @apply text-sm leading-relaxed;
  }

  .body-xs {
    @apply text-xs leading-snug;
  }

  .label {
    @apply text-sm font-medium;
  }

  .caption {
    @apply text-xs text-gray-500;
  }

  .code {
    @apply text-sm font-mono bg-gray-100 px-2 py-1 rounded;
  }
}
```

**Usage:**
```tsx
<h1 className="h1">Main Title</h1>
<p className="body">Body paragraph</p>
<label className="label">Form Label</label>
```

---

## Prose Plugin (@tailwindcss/typography)

For rich text content (blog posts, descriptions with HTML):

### Install
```bash
npm install -D @tailwindcss/typography
```

### Configure tailwind.config.js
```js
export default {
  plugins: [require("@tailwindcss/typography")],
}
```

### Usage
```tsx
<div className="prose prose-lg max-w-prose">
  {htmlContent}
</div>
```

**Prose styles:** h1-h6, p, ul, ol, blockquote, code, pre, img, table

---

## Accessibility Notes

### Contrast Ratios
- **WCAG AA (required):** 4.5:1 for normal text, 3:1 for large text (18px+)
- **WCAG AAA (preferred):** 7:1 for normal text, 4.5:1 for large text
- **Test:** Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Font Size Accessibility
- **Minimum:** 14px for body text; 12px for captions (if high contrast)
- **Recommended:** 16px for body, 18px+ for headings
- **Mobile:** Don't reduce below 14px even on small screens

### Line Height Accessibility
- **Minimum:** 1.5 for body text (better for dyslexia)
- **Recommended:** 1.6 (more readable, especially for long paragraphs)
- **Headings:** 1.2-1.3 (tighter, visual balance)

### Color Not Alone
- Don't rely only on color for meaning (error in red text alone)
- Pair with icon or text indicator: "✗ Error: Invalid email"

### Screen Reader Optimization
- Use semantic HTML: `<h1>`, `<h2>`, `<p>`, `<label>`, `<code>`
- Don't skip heading levels: h1 → h2 → h3 (not h1 → h3)
- Use `aria-label` for icons: `<Icon aria-label="Close dialog" />`

---

## Best Practices

### Do's
- Use consistent font size for same purpose (all labels 14px)
- Maintain 1.5+ line height for paragraphs
- Left-align body text (easier to read)
- Use max-width: 70-80 characters for paragraphs
- Pair weight + size (bold + large for emphasis; light + small for secondary)

### Don'ts
- Don't use more than 2-3 different font sizes per page
- Don't center align paragraphs (only headings/hero text)
- Don't use all caps for body text (hard to read)
- Don't reduce font size below 12px without good reason
- Don't mix serif + sans-serif on same page (use one primary + maybe one accent)

---

## Implementation Checklist

- [ ] Import Inter font (Google Fonts or local)
- [ ] Set Inter as base font in `globals.css`
- [ ] Define CSS custom properties for colors
- [ ] Create `@apply` presets (h1, h2, body, label, etc.)
- [ ] Test all heading levels, body text, code blocks
- [ ] Check contrast ratios (WCAG AA minimum)
- [ ] Test on mobile (responsive scaling)
- [ ] Test with screen reader (heading order, semantic HTML)

---

## Sources & Further Reading

- [SaaS Typography Playbook](https://fullstop360.com/blog/insights/branding/saas-typography-playbook-what-leading-companies-use) — What 50+ SaaS companies use
- [Inter Font Details](https://rsms.me/inter/) — Official Inter documentation
- [Inter on Google Fonts](https://fonts.google.com/specimen/Inter)
- [SaaS Typography Best Practices 2025](https://evietek.com/blogs/typography-guide-for-modern-saas-brands-2025)
- [Tailwind CSS Typography](https://tailwindcss.com/docs/font-size)
- [Web Typography Best Practices](https://www.trydrool.com/blog/typography-in-saas-how-it-transforms-user-experience/)
