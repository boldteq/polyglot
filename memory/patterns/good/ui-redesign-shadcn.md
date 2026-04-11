---
name: shadcn/ui Redesign Patterns
description: High-leverage UI modernization patterns for shadcn/ui + Tailwind projects. Extracted from a 28-file zero-dependency visual upgrade on ConvertScan.
type: pattern
priority: high
last_updated: 2026-04-06
---

## When This Applies

Any project using shadcn/ui + Tailwind CSS that needs a visual refresh or modernization pass. These patterns require zero new dependencies -- they work purely with existing shadcn primitives, Tailwind utilities, and CSS custom properties.

---

### [PRIMARY PATTERN] --radius CSS Variable Is the Highest-Leverage Design Token
**Context:** Any shadcn/ui project where the UI looks dated or "boxy". The starting point for any visual refresh.
**Pattern:** Change `--radius` in `:root` CSS variables (typically in `index.css`). Example: `0.5rem` (8px) to `0.75rem` (12px). This single change propagates automatically to every Card, Button, Input, Dialog, Badge, Select, and other component in shadcn/ui because they all reference `var(--radius)` through the `rounded-*` utilities configured in `tailwind.config.ts`.
**Why:** shadcn/ui components use `rounded-lg`, `rounded-md`, etc., which are computed relative to `--radius` via the tailwind config. Changing it once ripples through every rounded element in the entire app. No other single change has this much visual impact per line of code changed.
**Example:**
```css
:root {
  /* Before (default shadcn) */
  --radius: 0.5rem;

  /* After (modern, softer feel) */
  --radius: 0.75rem;
}
```
**Relationships:** Foundation for all other redesign patterns below. Apply first, then evaluate what else needs changing.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### PageHeader Title Size Is the Top Typography Indicator of "Dated" UI
**Context:** Any shadcn/ui page with a PageHeader or page title component. The second-highest-impact change after --radius.
**Pattern:** Upgrade page titles from `text-xl font-semibold` to `text-2xl font-bold tracking-tight`. This is the single biggest typography win across all pages. The default shadcn page title style reads as "functional" rather than "premium".
**Why:** Modern SaaS (Linear, Vercel, Stripe) use larger, bolder page titles with tight tracking. The visual hierarchy difference between `text-xl font-semibold` and `text-2xl font-bold tracking-tight` is immediately noticeable -- the page "breathes" better and communicates confidence.
**Example:**
```tsx
// Before (dated)
<h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>

// After (modern)
<h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
```
**Relationships:** Pair with `--radius` change and card shadow refinement for full visual upgrade. Related: `ui-ux-production-standards.md` typography scale (update that scale to match).
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Card Grid to Data Table Is the Highest-Impact Single Page Transformation
**Context:** Data-heavy pages (reports, history, logs, scan lists) that currently use a card grid (3-col layout) to display items. This is the highest-impact single page transformation for these pages.
**Pattern:** Replace card grid with a proper data table using shadcn's Table component. The table approach reduces visual noise, improves scanning speed, and matches modern SaaS conventions (Stripe, Linear, Vercel all use tables for list views).

**Implementation checklist:**
1. Wrap the filter bar in a separate `<Card>` with `<CardContent className="p-4">`
2. Wrap the table in a `<Card>` with `overflow-hidden` and `<CardContent className="p-0">`
3. Make rows clickable: `<TableRow onClick={() => navigate(href)} className="cursor-pointer hover:bg-muted/30">`
4. Use `e.stopPropagation()` on any interactive element within a clickable row (dropdown triggers, buttons) to prevent row click
5. Add a results count footer below the table: `Showing X of Y reports`
6. Add a "Clear Filters" ghost button with X icon that only appears when any filter is active
7. Table skeleton should match table shape (horizontal rows) -- not the old card shape
8. Use favicon + title + hostname as the primary column (most scannable)
9. Use inline ScoreRing or colored badge for score column (visual scanning)
10. Add status badges (completed, pending, failed) and type badges (landing page, product page, etc.)

**Why:** Cards are great for browsing (visual discovery), but tables are superior for task-oriented scanning (finding a specific item, comparing scores, acting on items). Most data-heavy SaaS pages (Stripe transactions, GitHub issues, Linear tasks) use tables for this reason.
**Example structure:**
```tsx
{/* Filter bar in its own Card */}
<Card className="border-border/40 shadow-soft">
  <CardContent className="p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input placeholder="Search..." />
      <Select>...</Select>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-3.5 w-3.5 mr-1" /> Clear Filters
        </Button>
      )}
    </div>
  </CardContent>
</Card>

{/* Table in its own Card */}
<Card className="border-border/40 shadow-soft overflow-hidden">
  <CardContent className="p-0">
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead>Page</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Issues</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => (
          <TableRow
            key={item.id}
            onClick={() => navigate(`/report/${item.id}`)}
            className="cursor-pointer hover:bg-muted/30"
          >
            ...
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <div className="border-t px-4 py-3 text-xs text-muted-foreground">
      Showing {items.length} of {total} reports
    </div>
  </CardContent>
</Card>
```
**Relationships:** Related: `design/patterns/data-tables.md` for comprehensive table patterns. Contradicts the card-grid default many agents use for list views.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Staggered Entrance Animations for KPI Cards
**Context:** Dashboard pages with 3-4+ KPI/stat cards rendered in a row. Cards that all appear at once feel flat; staggered entrance creates rhythm and premium feel.
**Pattern:** Wrap each KPI card in a div with `animate-fade-in` and inline style for `animationDelay` and `animationFillMode: "both"`. The `animationFillMode: "both"` is critical -- without it, the card is fully visible before the animation starts (flash).
**Why:** Staggered entrance (80ms delay between cards) draws the eye across the row, creates a sense of "loading fresh data", and feels polished. The 80ms interval is fast enough to not feel slow but perceptible enough to create rhythm.
**Example:**
```tsx
{stats.map((stat, i) => (
  <div
    key={stat.label}
    className="animate-fade-in"
    style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
  >
    <KpiCard {...stat} />
  </div>
))}
```
**Prerequisite:** A `fade-in` keyframe animation must exist in `tailwind.config.ts`:
```ts
keyframes: {
  "fade-in": {
    from: { opacity: "0", transform: "translateY(8px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
},
animation: {
  "fade-in": "fade-in 0.35s ease-out",
},
```
**Relationships:** Related: `design/core/motion.md` for comprehensive animation patterns. This is a specific application of the "staggered list items" pattern in `ui-ux-production-standards.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Gradient Top Accent Bar on Featured Cards
**Context:** Any "featured" or "hero" card that needs to stand out from other cards on the page (e.g., a "Quick Scan" CTA card on a dashboard, a pricing plan card, a primary action card).
**Pattern:** Add a thin (2px) gradient accent bar at the top of the card using an absolute-positioned div. Card must have `overflow-hidden relative`.
**Example:**
```tsx
<Card className="overflow-hidden relative">
  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/80 to-primary" />
  <CardContent className="p-6">
    {/* card content */}
  </CardContent>
</Card>
```
**Why:** The 2px gradient is subtle enough to not feel gimmicky but immediately signals "this card is important". Premium SaaS products (Stripe's revenue card, Linear's project card) use this pattern. Works in both light and dark mode because it uses the `primary` token.
**Relationships:** Related: `design/core/color-system.md` for gradient patterns. Do not overuse -- limit to 1-2 featured cards per page.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### CSS Pseudo-Elements via Tailwind Arbitrary Variants for Sidebar Active Indicators
**Context:** Sidebar navigation where the active item needs a visual indicator (vertical bar on the left edge). Replaces the common bg-accent approach with a more refined indicator.
**Pattern:** Use Tailwind's `before:` arbitrary variant to create a pseudo-element indicator:
```tsx
<SidebarMenuButton
  className={cn(
    isActive && "relative before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-primary"
  )}
>
```
**Why:** More refined than a full-width background highlight. The 2px vertical bar is the same pattern Linear and Notion use for active nav items. Works entirely in Tailwind (no custom CSS file needed). The `before:` pseudo-element doesn't affect layout or require wrapper elements.
**Relationships:** Related: `design/patterns/navigation.md` for comprehensive nav patterns. Alternative to: `bg-accent` highlight or `border-l-2 border-primary`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Auth Page Testimonial Panel Gradient
**Context:** Login/Signup/ForgotPassword pages with a two-panel layout (form on one side, testimonial/brand panel on the other). The brand panel often uses a flat background color.
**Pattern:** Replace flat `bg-sidebar` with a subtle diagonal gradient that creates depth:
```tsx
<div className="bg-gradient-to-br from-[hsl(222,47%,11%)] via-[hsl(222,47%,14%)] to-[hsl(222,47%,9%)]">
  {/* testimonial content */}
</div>
```
**Why:** The three-stop gradient (`from`, `via`, `to`) creates a sense of depth and visual interest without changing the color family. The values should stay within the same hue and saturation range as your sidebar background color. Diagonal (`to-br`) feels more dynamic than horizontal or vertical gradients.
**Relationships:** Use the same hue/saturation as your `--sidebar-background` CSS variable. Related: `design/patterns/auth-pages.md`.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Settings Tab Underline Style (Horizontal Tab Navigation)
**Context:** Settings pages with multiple sections (Account, Billing, Notifications, etc.) using shadcn Tabs. The default shadcn TabsList has a gray background pill container.
**Pattern:** Replace the default pill container with an underline tab style:
```tsx
<TabsList className="bg-transparent p-0 h-auto gap-0 flex-wrap border-b border-border/50 rounded-none w-full justify-start">
  <TabsTrigger className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
    Account
  </TabsTrigger>
  {/* more triggers */}
</TabsList>
```
**Why:** Underline tabs are the standard modern SaaS pattern for settings pages (GitHub, Stripe, Linear). They take less vertical space, feel lighter, and clearly indicate the active section with a colored bottom border. The default shadcn pill style is better suited for content tabs within a page section, not top-level page navigation.
**Relationships:** Use this for settings/config page-level tabs. For content-area tabs (e.g., "All Findings" / "Critical" / "Suggestions"), use the Pill-Style Tab Bar pattern below instead.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Pill-Style Tab Bar (Content Tabs Within a Page)
**Context:** Content tabs within a page section (e.g., filtering findings by type, switching between "Overview" and "Details" within a card). Not for settings page navigation.
**Pattern:** Use a pill-style container with individual rounded triggers:
```tsx
<TabsList className="bg-muted/40 rounded-xl p-1">
  <TabsTrigger className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
    All Findings
  </TabsTrigger>
  <TabsTrigger className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
    Critical
  </TabsTrigger>
</TabsList>
```
**Why:** The soft muted container with white active pill feels modern and contained. The `shadow-sm` on the active tab creates subtle depth. This style works better than underlines for in-page content switching because it visually groups the tabs as a single control (like a segmented button).
**Relationships:** Use this for content-area tabs. For page-level navigation tabs (settings, admin sections), use the Settings Tab Underline Style above.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Always-Visible Action Buttons Are Better Than Hover-Reveal
**Context:** Tables or card lists with per-row/per-card action buttons (View, Edit, Delete). Common pattern is `opacity-0 group-hover:opacity-100`.
**Pattern:** Use always-visible subtle text links or small ghost buttons instead of hover-reveal. Replace `opacity-0 group-hover:opacity-100` with always-visible `text-muted-foreground hover:text-primary` or `variant="ghost" size="sm"`.
**Why:** The hidden-on-hover pattern hurts discoverability -- users don't know actions are available until they hover. This is especially bad on touch devices where hover doesn't exist. Mobile users may never discover the actions. Always-visible subtle buttons (muted color, small size) don't add visual noise but are always discoverable.
**Relationships:** Contradicts the common "clean table" instinct to hide actions. Related: `design/patterns/data-tables.md` action column patterns.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### 5-Phase Redesign Execution Order
**Context:** Planning a visual modernization for any shadcn/ui project. This is the execution order, not a pattern to apply to a single component.
**Pattern:** Execute in strict phases:
1. **Design Token Foundation** -- CSS variables (`--radius`, `--background`, `--border`), shadow tokens, animation keyframes, font weights. Highest leverage, fewest files.
2. **Shared Component Upgrades** -- `card.tsx`, `badge.tsx`, `button.tsx`, `input.tsx`, `table.tsx` + shared components (`PageHeader`, `KpiCard`, `EmptyState`). Changes here propagate to every page that uses them.
3. **High-Impact Pages** -- The 2-3 pages users see most (Dashboard, Reports/list views). Focus on structure changes (card-to-table), not just styling.
4. **Secondary Pages** -- Settings, Integrations, Pricing, Auth pages. Apply the token + component changes; add page-specific polish (gradients, tabs, hover effects).
5. **Navigation Shell** -- Sidebar, TopBar. Apply last because nav is the most sensitive to regressions and benefits from all the token changes already applied.

**Why:** This order maximizes the "change one thing, improve everything" principle. Phase 1 changes ripple through Phase 2 components which ripple through Phase 3-4 pages. By the time you reach Phase 5, most of the visual improvement is already done from earlier phases. It also minimizes risk -- if you have to stop mid-redesign, the token and component changes already make the whole app look better.
**Relationships:** Follows the Lovable execution model (layout first -> functionality -> polish). Related: `lovable-execution-model.md` Phase 1/2/3 build cycle.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Refined Shadow and Border Token Values for Modern Feel
**Context:** Default shadcn/ui `shadow-sm` and `border` tokens produce a slightly heavy, "boxy" feel. These refined values create a lighter, more modern appearance.
**Pattern:** In `tailwind.config.ts`, override shadow tokens with lighter values. In `index.css`, lighten the border color slightly:
```ts
// tailwind.config.ts
boxShadow: {
  "soft": "0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 1px 2px -1px rgba(0, 0, 0, 0.03)",
  "soft-md": "0 4px 12px -2px rgba(0, 0, 0, 0.04), 0 2px 6px -2px rgba(0, 0, 0, 0.03)",
  "soft-lg": "0 8px 24px -4px rgba(0, 0, 0, 0.05), 0 4px 12px -4px rgba(0, 0, 0, 0.04)",
  "card": "0 0 0 1px rgba(0, 0, 0, 0.03), 0 2px 8px -2px rgba(0, 0, 0, 0.04)",
}
```
```css
:root {
  /* Default: 220 13% 91%  -> Lighter: 220 13% 93% */
  --border: 220 13% 93%;
  /* Default: 0 0% 98%  -> Whiter: 0 0% 99% */
  --background: 0 0% 99%;
}
```
**Why:** The lighter shadows and borders make cards "float" rather than "sit" on the page. The whiter background makes cards pop more with less visual weight. The `shadow-card` token (with a 1px ring + subtle shadow) is specifically for cards that need to look like cards without heavy borders.
**Relationships:** Apply alongside `--radius: 0.75rem` for full modern effect. These values work with the default shadcn color system -- adjust the lightness percentage for custom color schemes.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

---

### Radial Gradient Backdrop on Score/Progress Rings
**Context:** Circular score indicators (ScoreRing, progress rings) rendered as SVG circles. The flat SVG looks clinical without visual depth.
**Pattern:** Add an absolutely-positioned div behind the SVG ring with a radial gradient using the score color at very low opacity (8% hex = ~3% visual opacity):
```tsx
<div className="relative inline-flex flex-col items-center">
  {/* Glow backdrop */}
  <div className="absolute rounded-full" style={{
    width: size, height: size,
    background: `radial-gradient(circle, ${color}08 0%, transparent 70%)`,
  }} />
  {/* SVG ring on top */}
  <svg width={size} height={size} style={{ filter: glowShadow }}>
    ...
  </svg>
</div>
```
**Why:** The radial gradient creates a subtle color-matched glow behind the ring that reinforces the score color without being distracting. Combined with a CSS `drop-shadow` filter on the SVG (green for high scores, amber for medium, red for low), this creates depth that flat SVG rings lack. The `08` hex suffix keeps it imperceptible as a shape but noticeable as ambient color.
**Relationships:** Works with score color utilities (`getScoreHex`). Related: glow shadow tokens (`glow-green`, `glow-amber`, `glow-red`) in Phase 1 shadow system.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Semantic Color Tokens (success, warning) for shadcn/ui
**Context:** shadcn/ui ships only with primary/secondary/destructive/muted. Status indicators need success (green) and warning (amber) semantic tokens.
**Pattern:** Add CSS variables in `:root` and `.dark`, then register in `tailwind.config.ts`:
```css
:root {
  --success: 142 71% 45%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;
}
```
```ts
// tailwind.config.ts
colors: {
  success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
  warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
}
```
**Why:** Enables `bg-success`, `text-warning`, Badge `variant="success"`, etc. Eliminates scattered `bg-emerald-500`/`bg-amber-500` hardcodes. Dark mode tokens update automatically via `.dark` class.
**Relationships:** Enables Badge semantic variants (success, warning, info). Used by KpiCard trend indicators, status badges, score labels.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Badge Semantic Variants (success, warning, info)
**Context:** shadcn/ui Badge component only ships with default/secondary/destructive/outline variants. Status indicators need more variants.
**Pattern:** Add to `badge.tsx` cva variants:
```tsx
success: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
warning: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
info: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
```
**Why:** Status indicators (completed/pending/failed, active/inactive, plan tiers) appear on almost every page. Without semantic variants, inline className strings get scattered everywhere. Variants centralize the color decisions and ensure consistency across the app.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Custom Animation Keyframes for Premium Page Transitions
**Context:** Default shadcn only has accordion animations. Modern SaaS needs fade-in, slide-up, scale-in for page transitions and card entrances.
**Pattern:** Add custom keyframes in `tailwind.config.ts`:
```ts
keyframes: {
  "fade-in": {
    from: { opacity: "0", transform: "translateY(6px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  "scale-in": {
    from: { opacity: "0", transform: "scale(0.96)" },
    to: { opacity: "1", transform: "scale(1)" },
  },
  "slide-up": {
    from: { opacity: "0", transform: "translateY(16px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  "pulse-ring": {
    "0%": { boxShadow: "0 0 0 0 rgba(99,102,241,0.35)" },
    "70%": { boxShadow: "0 0 0 8px rgba(99,102,241,0)" },
    "100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" },
  },
},
```
**Why:** 6px translateY on fade-in gives subtle upward emergence. `scale-in` at 0.96 (4% scale) is imperceptible but feels more alive than a flat fade. `pulse-ring` for active/scanning states provides focus attention.
**Relationships:** Used by staggered KPI card entrance, page transitions, dialog animations.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Quick Checklist for Any shadcn/ui Visual Refresh

Run through this checklist when modernizing any shadcn/ui project:

- [ ] `--radius` updated (0.5rem -> 0.75rem or higher)
- [ ] Custom shadow tokens added (`shadow-soft`, `shadow-soft-md`, `shadow-card`)
- [ ] `--border` lightness increased by 2-3%
- [ ] Border opacity reduced on cards (`border-border/40`)
- [ ] `--background` pushed whiter (99% instead of 98%)
- [ ] Semantic color tokens added (`--success`, `--warning`)
- [ ] Custom animation keyframes added (fade-in, scale-in, slide-up, pulse-ring)
- [ ] Font family set to Inter (or equivalent modern font)
- [ ] Font weight 700 (bold) loaded
- [ ] `tracking-tight` on page headings
- [ ] `text-2xl font-bold` on PageHeader (not `text-xl font-semibold`)
- [ ] Badge semantic variants added (success, warning, info)
- [ ] KPI cards have hover lift effect (`hover:-translate-y-0.5 hover:shadow-soft-md`)
- [ ] Staggered entrance animations on card grids (`animationFillMode: "both"`)
- [ ] Settings tabs use underline style (not pill)
- [ ] Content tabs use pill style (not underline)
- [ ] Data tables replace card grids on list pages
- [ ] `e.stopPropagation()` on dropdowns inside clickable rows
- [ ] Auth pages have gradient side panels (not flat bg)
- [ ] Sidebar active indicator uses `before:` pseudo-element
- [ ] Action buttons always visible (not hover-reveal)
- [ ] ScoreRing/progress indicators have radial gradient backdrop
- [ ] Featured cards have gradient top accent bar (2px)

---

**Knowledge Version History:**
- v1 (2026-04-06): Initial 11 patterns from ConvertScan (CROBOT) UI modernization session.
- v2 (2026-04-06): Expanded to 16 patterns -- added radial gradient backdrop, semantic color tokens, badge variants, animation keyframes, and comprehensive checklist.

*(Maintained by Mira. Updated after each UI modernization session.)*
