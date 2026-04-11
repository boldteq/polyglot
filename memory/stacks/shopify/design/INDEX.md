# Design Phase — Complete Index

This index covers the design and user experience requirements for Shopify apps during the **design phase** before launch. All sections are mandatory for App Store approval.

---

## Files & Topics

### 1. **polaris.md** — Polaris Design System (Mandatory)
Comprehensive guide to Polaris components and design tokens. Covers layout, data display, forms, feedback, navigation, and actions. Includes component quick reference table, design token usage, and common compositions.
- **Reference:** [Polaris Design System](https://shopify.dev/docs/apps/tools/polaris) | [Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- **Key Rule:** Polaris is MANDATORY for all admin UI; no Tailwind, shadcn, or custom CSS

### 2. **navigation.md** — App Navigation Design
Rules for NavMenu placement (sidebar desktop, header mobile), label best practices (nouns, max 20 chars), max 7 items before truncation, and rel="home" requirement. Includes tab patterns for secondary navigation.
- **Reference:** [Navigation Guidelines](https://shopify.dev/docs/apps/design/navigation)
- **Key Rule:** Max 7 primary nav items; labels must be nouns ("Dashboard", not "View dashboard")

### 3. **layouts.md** — Page Structure & Composition
Five layout types: single-column (forms), full-width (tables), two-column (editors), settings (AnnotatedSection), immersive (full-screen). Explains Page > Layout > Section > Card hierarchy and responsive behavior.
- **Reference:** [App Structure](https://shopify.dev/docs/apps/design/app-structure) | [Layout](https://shopify.dev/docs/apps/design/layout)
- **Key Rule:** Strict component hierarchy; Polaris Layout handles mobile responsiveness automatically

### 4. **states.md** — Loading, Empty, Error States
SkeletonPage for full-page loading, EmptyState pattern with title + description + CTA, Banner vs Toast (persistent vs transient), error message guidelines. Covers success states and messaging best practices.
- **Reference:** [User Experience](https://shopify.dev/docs/apps/design/user-experience) | [Alerts](https://shopify.dev/docs/apps/design/alerts)
- **Key Rule:** Never show blank screens; always show loading state, empty state, or error with actionable fix

### 5. **accessibility.md** — WCAG AA Compliance
Covers 4.5:1 contrast ratio, keyboard navigation, heading hierarchy (h1→h2→h3), form labels, screen reader support, touch targets (44×44px minimum), and ARIA labeling. Includes testing tools and manual verification steps.
- **Reference:** [Accessibility](https://shopify.dev/docs/apps/design/user-experience) | [Security](https://shopify.dev/docs/apps/build/security)
- **Key Rule:** WCAG AA minimum required; contrast 4.5:1, keyboard fully functional, heading hierarchy strict

### 6. **responsive.md** — Mobile-First Design
Mobile-first approach, standard breakpoints (xs <768px, sm 768px, md 1024px, lg 1280px), touch targets ≥44×44px, spacing scale (8px multiples), responsive tables, forms, and Grid component usage. Includes testing strategies.
- **Reference:** [Responsive Design](https://shopify.dev/docs/apps/design/responsive)
- **Key Rule:** Design mobile first; vertical scroll only; Layout component auto-handles mobile collapse

### 7. **performance.md** — Lighthouse & Web Vitals
Performance budgets (JS <10KB, CSS <50KB, checkout 64KB hard limit), Core Web Vitals targets (LCP <2.5s, FID <100ms, CLS <0.1), Lighthouse score >90, image optimization, code splitting, caching. Monitoring and audit tools.
- **Reference:** [Performance](https://shopify.dev/docs/apps/build/performance) | [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)
- **Key Rule:** Max -10 Lighthouse regression; 64KB hard limit for checkout extensions

### 8. **content.md** — UX Microcopy & Writing
Button labels (action verbs, max 3 words, sentence case), error messages (problem + fix, no jargon), success messages (toast ≤3 words, banner with next step), empty state copy, form labels, global-friendly language (no idioms). Tone consistency.
- **Reference:** [Content Guidelines](https://shopify.dev/docs/apps/design/user-experience) | [Onboarding](https://shopify.dev/docs/apps/design/user-experience/onboarding)
- **Key Rule:** Action verbs for buttons; error messages explain what + how to fix; no jargon or idioms

---

## Quick Reference: When to Use Each File

| Scenario | File |
|----------|------|
| "What Polaris components should I use?" | polaris.md |
| "How should I structure my navigation?" | navigation.md |
| "Should this be single-column or full-width?" | layouts.md |
| "How do I show loading/empty/error states?" | states.md |
| "What contrast ratio do I need?" | accessibility.md |
| "How do I make this mobile-friendly?" | responsive.md |
| "What's my performance budget?" | performance.md |
| "How should I write button labels?" | content.md |

---

## App Store Submission Checklist (Design Phase)

- [ ] All pages use Polaris components (no Tailwind, no custom CSS)
- [ ] Page hierarchy: Page > Layout > Section > Card (no skipping levels)
- [ ] NavMenu has max 7 items, all labels are nouns, rel="home" on default
- [ ] All interactive elements have keyboard support (Tab, Enter)
- [ ] Heading hierarchy correct (h1 → h2 → h3, no skipping)
- [ ] Form labels on all inputs, error messages show problem + fix
- [ ] Touch targets ≥44×44px with 8px minimum spacing
- [ ] Loading states: SkeletonPage for full page, SkeletonBodyText for inline
- [ ] Empty states have title, description, and primary CTA
- [ ] Error messages use Banner (persistent) or validation inline, never jargon
- [ ] 4.5:1 contrast ratio on all text
- [ ] Responsive: Layout.Section auto-collapses on mobile, no horizontal scroll
- [ ] Images responsive, lazy-loaded
- [ ] JS <10KB per route, CSS <50KB per page
- [ ] Lighthouse >90 (Performance, Accessibility, Best Practices, SEO)
- [ ] Core Web Vitals passing (LCP <2.5s, FID <100ms, CLS <0.1)
- [ ] No hardcoded colors/spacing; use Polaris design tokens only

---

## Design System Patterns Summary

### Mandatory Patterns
1. **Page Wrapper** — every route uses `<Page title="..." />`
2. **Form Layout** — `Page > Layout > Section > Card > BlockStack > TextField`
3. **Table Layout** — `Page > Layout > Section > Card (padding="0") > IndexTable`
4. **Loading** — `SkeletonPage` for full page, `SkeletonBodyText` for inline
5. **Empty** — `EmptyState` with heading, description, primary action
6. **Error** — `Banner tone="critical"` for persistent, inline validation for forms
7. **Success** — `shopify.toast.show("Message")` for transient, `Banner tone="success"` for persistent

### Forbidden Patterns
1. ~~Tailwind CSS in admin UI~~ → Use Polaris only
2. ~~Custom CSS frameworks~~ → Polaris only
3. ~~Blank loading screens~~ → Always show skeleton
4. ~~Vague error messages~~ → Explain problem + fix
5. ~~Verb-based button labels~~ → Use nouns ("Create", not "Create X")
6. ~~No form labels~~ → All inputs must have labels
7. ~~Touch targets <44×44px~~ → Minimum 44×44px
8. ~~Color alone for status~~ → Add icons, text, or patterns

---

## Resources

- **Polaris Components:** https://shopify.dev/docs/api/app-home
- **Design Guidelines:** https://shopify.dev/docs/apps/design
- **Accessibility:** https://shopify.dev/docs/apps/design/user-experience
- **Performance:** https://shopify.dev/docs/apps/build/performance
- **Built for Shopify:** https://shopify.dev/docs/apps/launch/built-for-shopify
