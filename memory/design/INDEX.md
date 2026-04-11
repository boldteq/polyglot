# SaaS Design Knowledge Base — Master Index

> Production-grade design system for all Boldteq SaaS products.
> Stack: React + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion
> Last updated: 2026-04-04

---

## Quick Stats

- **36 component files** across 5 sections
- **43,290+ lines** of synthesized design knowledge
- Covers: tokens, 20 UI patterns (with dark mode + responsive), 6 quality standards, and real-world references
- Sources: Tailwind, shadcn/ui, Radix, Linear, Vercel, Stripe, Notion, Figma, and more

---

## File Inventory

### design-vision-system.md — Per-Project Aesthetic Intelligence (LOAD FIRST FOR NEW PROJECTS)

| File | What It Covers |
|------|----------------|
| `design-vision-system.md` | **Per-project design vision briefs.** Auto-research protocol, mood-to-token mapping (Minimal/Premium/Technical/Playful/Corporate/Dark), product-category defaults (12 categories), vision template, multi-project vision library. Vega MUST check for design-vision.md in project root before any design work. |
| `curated-inspirations.md` | **Yash's hand-picked design inspirations (HIGHEST PRIORITY).** Tagged by component type, niche, and mood. Agents match against this FIRST before generic patterns. Yash drops URLs/screenshots/descriptions → auto-categorized → auto-matched at build time. |

### core/ — Design Foundations (5 files, 5,710 lines)

| File | Lines | What It Covers |
|------|-------|----------------|
| `core/design-tokens.md` | 831 | Colors, spacing scale, typography scale, shadows, radii, z-index — the complete token system |
| `core/color-system.md` | 902 | CSS variable architecture, dark mode tokens, brand colors, data viz palettes, accessible combos |
| `core/typography.md` | 487 | Inter/Geist fonts, type scale, heading hierarchy, code typography, prose styling |
| `core/spacing-layout.md` | 720 | 4px grid, container widths, page layouts (sidebar+main), CSS Grid/Flexbox patterns, responsive |
| `core/motion.md` | 2,770 | Duration scale, easing, 17 micro-interactions, Framer Motion patterns, Tailwind animations, a11y, **44 component animation presets** |

### patterns/ — UI Patterns (20 files, 22,686 lines)
> **Note:** Top 7 patterns (dashboards, forms, auth-pages, billing-ui, notifications, settings, data-tables) include dedicated **Dark Mode** and **Responsive Design** sections with full code examples.

| File | Lines | What It Covers |
|------|-------|----------------|
| `patterns/dashboards.md` | 554 | KPI cards, chart patterns, activity feeds, time range selectors, empty/skeleton dashboard |
| `patterns/data-tables.md` | 812 | Sorting, filtering, pagination, bulk actions, row actions, expandable rows, responsive tables |
| `patterns/forms.md` | 960 | Validation (Zod), multi-step wizards, autosave, file upload, React Hook Form + shadcn integration |
| `patterns/navigation.md` | 938 | Sidebar, topbar, command palette (cmdk), breadcrumbs, tabs, mobile nav, workspace switcher |
| `patterns/onboarding.md` | 905 | Welcome screen, setup wizard, checklists, empty states, tooltips, progressive disclosure |
| `patterns/empty-states.md` | 590 | First-time, no-results, error, permission types, illustration style, responsive patterns |
| `patterns/loading-states.md` | 695 | Skeletons, spinners, progress bars, optimistic updates, streaming, React Query patterns |
| `patterns/notifications.md` | 1,693 | Sonner toasts, alert banners, inline alerts, confirmation dialogs, notification center, email prefs |
| `patterns/settings.md` | 1,719 | 9 settings sections, account/profile, team, billing, API keys, integrations, danger zone, save behavior |
| `patterns/auth-pages.md` | 1,636 | Login/signup layouts, social login, magic link, 2FA, forgot password, split layout, responsive |
| `patterns/billing-ui.md` | 1,742 | Pricing page, plan cards, feature comparison, usage meters, upgrade/downgrade, credits, trial banners |
| `patterns/error-pages.md` | 1,739 | 404, 500, 503, 403, offline, rate limited, React ErrorBoundary, maintenance mode |
| `patterns/search.md` | 1,585 | Command palette (cmdk), search results page, inline search, filters, HighlightMatch, keyboard nav |
| `patterns/file-upload.md` | 1,449 | Drag-drop zone, upload progress, file list, image preview, Supabase Storage integration |
| `patterns/landing-page.md` | 1,579 | Hero (3 patterns), social proof, feature grid, testimonials, pricing, footer, navbar |
| `patterns/email-templates.md` | 1,035 | 6 transactional templates, bulletproof button, React Email/Resend, dark mode email |
| `patterns/chat.md` | 970 | Message bubbles, chat input, typing indicator, message types, scroll behavior, AI streaming |
| `patterns/real-time.md` | 992 | Presence indicators, avatar stack, collaborative editing, Supabase Realtime, live cursors |
| `patterns/changelog.md` | 982 | Changelog page, What's New modal, announcement banner, version cards, keyboard shortcuts |
| `patterns/help-center.md` | 1,461 | Help center page, article layout, help widget, FAQ, support form, feature tours, search |

### standards/ — Quality Standards (6 files, 6,340 lines)

| File | Lines | What It Covers |
|------|-------|----------------|
| `standards/accessibility.md` | 1,151 | **Full WCAG 2.1 AA checklist** (POUR principles), ARIA patterns for all shadcn components, keyboard nav map, focus management, screen reader testing |
| `standards/responsive.md` | 529 | Mobile-first, breakpoints, sidebar behavior, grid reflow, table→card, Dialog→Drawer on mobile |
| `standards/dark-mode.md` | 575 | CSS variable architecture, token system, next-themes, common mistakes, testing checklist |
| `standards/performance.md` | 644 | Core Web Vitals, LCP/CLS/INP, bundle optimization, React perf, image/font optimization, budgets |
| `standards/state-management.md` | 1,762 | **React state bible** — 5 state types, React Query deep patterns, React Hook Form + Zod, URL state, Zustand, antipatterns, performance |
| `standards/error-handling.md` | 1,679 | **Error handling bible** — 6 error levels, React Error Boundaries, API errors, Sonner toasts, offline handling, Sentry, graceful degradation |

### references/ — Real-World References (4 files, 3,458 lines)

| File | Lines | What It Covers |
|------|-------|----------------|
| `references/component-compositions.md` | 904 | **LOAD FIRST** — 9 production page compositions (Dashboard, Settings, Data List, Auth, Pricing, Detail View, Dialog+Form, Empty State, Loading Skeleton). Full copy-paste TSX with responsive, dark mode, spacing. Includes quick-ref tables for spacing, icon sizes, badge variants, button variants. |
| `references/shadcn-patterns.md` | 1,650 | All 45+ shadcn/ui components: when to use, props, accessibility, composition patterns, common mistakes |
| `references/best-saas-examples.md` | 633 | Linear, Vercel, Stripe, Notion, Figma, Slack, Raycast, Cal.com, Resend, Clerk, Supabase analysis |
| `reference-library.md` | 271 | Quick reference links and resources |

---

## Agent Loading Guide

Which agent loads which files:

### Vega (Design — PRIMARY OWNER)
Loads for ALL design work (specs, reviews, visual decisions):
```
core/design-tokens.md           → Token values (spacing, colors, radii, shadows)
core/color-system.md            → Color variables, dark mode tokens, brand colors
core/typography.md              → Type scale, font weights, heading hierarchy
core/spacing-layout.md          → 4px grid, page layouts, container widths
core/motion.md                  → 44 component animation presets, easing, durations
patterns/[relevant-pattern].md  → Pattern for current page type (see 20 patterns above)
standards/accessibility.md      → WCAG 2.1 AA checklist (always loaded)
standards/responsive.md         → Breakpoints, mobile behavior (always loaded)
standards/dark-mode.md          → Dark mode token system (always loaded)
standards/performance.md        → CWV budgets that affect design (image sizes, layout shift)
standards/state-management.md   → Loading/error/empty state patterns
standards/error-handling.md     → Error display patterns
references/shadcn-patterns.md   → 45+ shadcn/ui components (Stack A)
references/best-saas-examples.md → Linear, Vercel, Stripe design analysis
```
Stack B additional (Shopify deep training):
```
stacks/shopify/design/polaris.md           → Polaris components (Stack B)
stacks/shopify/api/polaris.md              → Polaris API reference (Stack B)
stacks/shopify/design/app-patterns.md      → 5 official Polaris layout patterns + admin UX (Stack B)
stacks/shopify/design/storefront-widgets.md → Theme/checkout/customer account extensions (Stack B)
stacks/shopify/design/brand-examples.md    → Real brand analysis from 7 top Shopify apps (Stack B)
```

### Koda (Implementation)
Loads when building UI:
```
core/design-tokens.md          → Token values for Tailwind config
core/color-system.md            → Color variables and dark mode
core/typography.md              → Type scale classes
core/spacing-layout.md          → Layout patterns and grid
core/motion.md                  → Animation code patterns
patterns/[relevant-pattern].md  → Pattern for current feature (see 20 patterns above)
references/shadcn-patterns.md   → Component usage reference (45+ components)
```

### Arya (Architecture)
Loads when designing page structure:
```
core/spacing-layout.md          → Page layout architecture
patterns/navigation.md          → Navigation architecture decisions
patterns/dashboards.md          → Dashboard layout planning
standards/responsive.md         → Responsive architecture
standards/performance.md        → Performance budgets
```

### Sage (Audit)
Loads when reviewing:
```
standards/accessibility.md      → WCAG compliance check
standards/responsive.md         → Mobile responsiveness audit
standards/dark-mode.md          → Dark mode completeness
standards/performance.md        → Core Web Vitals audit
core/design-tokens.md           → Token consistency check
```

### Quill (Copy/Content)
Loads when writing UX copy:
```
patterns/notifications.md       → Toast/alert/error copy
patterns/empty-states.md        → Empty state copy
patterns/onboarding.md          → Onboarding copy
patterns/auth-pages.md          → Auth flow copy
patterns/error-pages.md         → Error page copy
patterns/help-center.md         → Help center article copy
references/best-saas-examples.md → Tone references
```

### Riko (Scaffold)
Loads when setting up project:
```
core/design-tokens.md           → Tailwind config and CSS variables
core/color-system.md            → Theme setup
standards/dark-mode.md          → Dark mode configuration
references/shadcn-patterns.md   → Which components to install
```

### Luna (Testing)
Loads when writing tests:
```
standards/accessibility.md      → a11y test targets (WCAG AA checklist)
standards/responsive.md         → Responsive test breakpoints (sm/md/lg/xl)
standards/performance.md        → Performance test thresholds (CWV budgets)
```

### Bolt (Deployment)
Loads when deploying:
```
standards/performance.md        → CWV deployment gates (LCP < 2.5s, CLS < 0.1, INP < 200ms)
```

### Hawk (Monitoring)
Loads when setting up monitoring:
```
standards/performance.md        → Monitoring thresholds for CWV alerts
```

### Vex (Debugging)
Loads when debugging UI issues:
```
patterns/loading-states.md      → Loading state debugging reference
patterns/empty-states.md        → Empty state debugging reference
patterns/error-pages.md         → Error boundary debugging
```

### Zeph (SEO)
Loads when auditing SEO:
```
standards/performance.md        → SEO/CWV overlap (LCP, CLS impact on ranking)
patterns/landing-page.md        → Landing page SEO structure
```

---

## How to Use This Knowledge Base

### When Building a New Page
1. Load `core/spacing-layout.md` for page structure
2. Load the relevant `patterns/` file for the page type
3. Load `references/shadcn-patterns.md` for component selection
4. Load `core/motion.md` if page has animations

### When Auditing Design
1. Load all `standards/` files
2. Check against `core/design-tokens.md` for consistency
3. Reference `references/best-saas-examples.md` for quality bar

### When Adding a Feature
1. Identify which pattern file covers the feature
2. Load that pattern file + relevant core files
3. Follow the composition patterns exactly

---

## Adding New Knowledge

### To Add a New Pattern
1. Create file in `patterns/[pattern-name].md`
2. Follow existing format (sections, code examples, shadcn/ui composition)
3. Update this INDEX.md with the new file
4. Update `training/changelog.md`

### To Update Existing Knowledge
1. Edit the relevant file
2. Update "Last updated" date
3. Log the change in `training/changelog.md`

---

## Navigation

- **Memory root:** `../MEMORY.md`
- **Shopify knowledge:** `../stacks/shopify/INDEX.md`
- **UI/UX standards:** `../patterns/good/ui-ux-production-standards.md`

---

Last updated: **2026-04-04**
