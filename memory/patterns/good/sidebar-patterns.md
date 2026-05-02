---
name: shadcn/ui Sidebar Patterns
description: Production patterns for sidebar navigation using shadcn's Sidebar component system. Covers collapsed mode, icon mode, active states, admin vs user sidebars.
type: pattern
priority: high
last_updated: 2026-04-06
---

## When This Applies

Any Lovable/Vite/React project using shadcn/ui that needs sidebar navigation. This covers both user-facing app sidebars and admin panel sidebars.

---

### [PRIMARY PATTERN] Always Use shadcn Sidebar -- Never Build Custom Aside
**Context:** Any project with sidebar navigation using shadcn/ui.
**Pattern:** Import and use `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton` from `@/components/ui/sidebar`. Never build a custom `<aside>` element with manual width/transition/collapse logic.
**Why:** The shadcn Sidebar system handles: cookie-based state persistence (`sidebar:state` cookie), smooth width transitions, responsive mobile behavior (sheet drawer), tooltips in collapsed icon mode, proper `SidebarInset` spacer div for flex layout, keyboard accessibility. A custom aside misses all of this and creates inconsistency when the same app has multiple sidebars (user + admin).
**Example:**
```tsx
// Correct: shadcn Sidebar
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, ... } from "@/components/ui/sidebar";

<SidebarProvider defaultOpen={getSidebarDefaultOpen()}>
  <Sidebar collapsible="icon" className="border-r border-border/40">
    <SidebarHeader>...</SidebarHeader>
    <SidebarContent>...</SidebarContent>
    <SidebarFooter>...</SidebarFooter>
  </Sidebar>
  <SidebarInset>{/* page content */}</SidebarInset>
</SidebarProvider>

// Wrong: Custom aside
<aside className={cn("w-56 transition-all", collapsed && "w-14")}>
  {/* manual everything -- no cookie persistence, no mobile drawer, no tooltips */}
</aside>
```
**Relationships:** Prevents: "Custom aside sidebar" antipattern (avoid/antipatterns.md). Related: "Admin sidebar = user sidebar components" (below).
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Admin Sidebar Must Use Same Component Stack as User Sidebar
**Context:** SaaS apps with both a user app sidebar and an admin panel sidebar in the same codebase.
**Pattern:** Both sidebars use the identical shadcn component stack (`Sidebar`, `SidebarProvider`, `SidebarMenu`, etc.). Only the nav items array, footer content, and color scheme differ. Never build the admin sidebar with different components or patterns than the user sidebar.
**Why:** Same collapse behavior, same CSS, same UX, same animations, same cookie persistence, same mobile behavior. Users who are also admins get a consistent experience. Maintenance is halved -- fix a sidebar bug once, it's fixed in both.
**Relationships:** Builds on: "Always Use shadcn Sidebar" (above). Source of the AdminLayout.tsx refactor that removed a custom aside in favor of the same shadcn Sidebar components.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### group-data-[collapsible=icon] for Collapsed State Styling
**Context:** Any content within a shadcn Sidebar that needs to adapt when the sidebar is collapsed to icon-only mode.
**Pattern:** The shadcn `Sidebar` root div has `class="group"` and `data-collapsible="icon"` when collapsed. Child elements use Tailwind's `group-data-[collapsible=icon]:*` variant to conditionally apply styles. This is the correct way -- NOT using `useSidebar()` state with conditional rendering or ternary className.
**Why:** The group-data approach is pure CSS, no re-renders, no state synchronization. It works with the sidebar's transition animation (elements transform as width animates). Using JS state (`useSidebar().state === "collapsed"`) causes a flash because state updates are synchronous but the CSS transition is not.
**Example:**
```tsx
<SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-4 group-data-[collapsible=icon]:items-center">
  <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full">
    <Logo />
    <div className="group-data-[collapsible=icon]:hidden">
      <span className="text-base font-semibold">App Name</span>
    </div>
  </div>
</SidebarHeader>

<SidebarContent className="px-2 group-data-[collapsible=icon]:px-1">
  {/* content -- px reduced in icon mode to give icons more room */}
</SidebarContent>

<SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
  {/* footer adapts padding and centering */}
</SidebarFooter>
```
**Key elements to adapt in icon mode:**
- `SidebarHeader`: reduce padding, center content, hide text
- `SidebarContent`: reduce horizontal padding (px-2 -> px-1)
- `SidebarFooter`: reduce padding, center items
- Text elements: `group-data-[collapsible=icon]:hidden`
- Logo container: `group-data-[collapsible=icon]:justify-center`
**Relationships:** Core mechanism for all sidebar collapsed-state patterns below.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Active Icon Color: text-white on Colored Backgrounds, Not text-primary
**Context:** Sidebar navigation items using `SidebarMenuButton` with an active state that sets a colored background (like `bg-white/10` on a dark sidebar or `bg-sidebar-accent` which maps to the primary color).
**Pattern:** When the active state background IS the primary color (or a translucent variant of it), the icon MUST be `text-white`, NOT `text-primary`. Setting `text-primary` makes the icon invisible (same purple on purple background).
**Why:** This is a contrast/visibility issue. The `text-primary` class outputs the primary brand color (e.g., indigo/purple). When that icon sits on a `bg-primary` or `bg-white/10` background on a dark sidebar, it becomes invisible or nearly so. Always use `text-white` for icons on active colored backgrounds.
**Example:**
```tsx
<Icon className={cn(
  "h-[18px] w-[18px] shrink-0",
  active ? "text-white" : "text-white/55"  // NOT text-primary for active
)} />
```
**Relationships:** Prevents: "Invisible icon on active sidebar item" antipattern. Related: SidebarMenuButton active state patterns.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Orphan Separator: Hide When Adjacent Element Is Hidden
**Context:** A `<Separator>` between two elements in a sidebar, where one element is conditionally rendered (hidden when collapsed, hidden by feature flag, etc.).
**Pattern:** Gate the separator with the same condition as the element it separates:
```tsx
{!collapsed && <Separator className="mb-3 bg-white/5" />}
```
**Why:** Without the condition, the separator renders as a visible orphan line -- a thin horizontal bar floating alone with nothing above or below it. This is a visual bug that looks broken. The separator only has meaning when both elements it separates are visible.
**Relationships:** Common in sidebar footers where a usage indicator or plan badge is hidden in collapsed mode but the separator below it remains visible.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### No Duplicate Navigation: Each Destination in Exactly One Place
**Context:** Apps with both sidebar navigation and topbar dropdown menus.
**Pattern:** Each navigation destination appears in exactly ONE place. If it is in the sidebar nav items, remove it from the topbar dropdown. If it is in the topbar dropdown, do not repeat it in the sidebar footer.
**Why:** Duplicate navigation confuses users ("which one should I click?"), wastes screen space, and creates maintenance burden (update nav label in one place, forget the other).
**Applied examples from ConvertScan:**
- Settings: in sidebar nav only, removed from topbar user dropdown
- Admin Panel: in topbar user dropdown only, removed from sidebar footer
- AI Agents: removed entirely (page did not exist)
**Relationships:** Related: "Layout & navigation consistency" (patterns/good/layout-navigation-consistency.md). Prevents: "Navigation duplication" antipattern.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Sidebar Icon Sizing: Override SidebarMenuButton Default
**Context:** shadcn `SidebarMenuButton` cva includes `[&>svg]:size-4` which forces all direct SVG children to 16px (h-4 w-4).
**Pattern:** To use larger icons (18px), apply `!h-[18px] !w-[18px]` with the `!` important modifier on the icon className to override the parent's `[&>svg]:size-4`. Or accept 16px as standard and use `h-5 w-5` (20px) if you want to go bigger (requires modifying the SidebarMenuButton variant).
**Why:** The cva `[&>svg]:size-4` selector has high specificity because it targets direct children. Regular `h-[18px] w-[18px]` without `!` is overridden. The `shrink-0` class is also important to prevent icon compression in flex layouts.
**Example:**
```tsx
<Icon className={cn("!h-[18px] !w-[18px] shrink-0", active ? "text-white" : "text-white/55")} />
```
**Nav item companion changes for visual balance:**
- Item height: `h-10` (was `h-9`) -- gives more breathing room with larger icons
- Icon gap: `gap-3` (was `gap-2.5`) -- proportional to larger icon
- Label weight: `text-sm font-medium` -- slightly heavier to match bolder icon presence
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Admin TopBar Dropdown Affordance
**Context:** Admin topbar with a user avatar/name that opens a dropdown menu.
**Pattern:** Dropdown triggers in the topbar must have visual affordance. Apply:
- `border border-transparent hover:border-border/60 hover:bg-muted/50` -- subtle border on hover signals interactivity
- `ChevronDown` icon (h-3.5 w-3.5) -- universal dropdown indicator
- `type="button"` -- prevents accidental form submission
- `focus-visible:ring-2 focus-visible:ring-ring` -- keyboard accessibility
**Why:** A button that looks like static text gets zero clicks. Users do not know to click on their name/avatar unless there is a visual hint. The ChevronDown icon is the standard UI convention for "this opens a menu."
**Relationships:** Related: admin-panel-standards.md (topbar section). Applies to both admin and user topbar user menus.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### Admin Breadcrumb Pattern
**Context:** Admin pages with a topbar that shows the current page location.
**Pattern:** Use `<Badge>Admin</Badge>` + `<ChevronRight className="h-3.5 w-3.5" />` + current page name. Never use a plain `/` text character as breadcrumb separator.
**Why:** The ChevronRight icon is the modern standard (GitHub, Vercel, Linear). A plain `/` looks dated and has poor visual weight compared to the rest of the UI. The Admin badge immediately identifies context.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

### bg-primary/8 Is Invalid Tailwind -- Use /10 or Arbitrary [0.08]
**Context:** Any Tailwind opacity modifier on color utilities.
**Pattern:** Tailwind opacity modifiers via `/` require the value to be a defined opacity step: 0, 5, 10, 15, 20, 25, 30, etc. `bg-primary/8` does not exist. Use `bg-primary/10` (closest step) or `bg-primary/[0.08]` (arbitrary value syntax).
**Why:** Invalid Tailwind classes silently produce no CSS output. The element gets no background color at all, which may look correct in some contexts (transparent background appears the same as no background) but is actually broken. This is especially insidious because `npm run build` does not warn about unused/invalid Tailwind classes.
**Relationships:** Prevents: Silent CSS failures from invalid Tailwind opacity values.
**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 0
**Knowledge Version:** v1

---

## Quick Checklist: New Sidebar Implementation

When building or refactoring a sidebar in any shadcn/ui project:

- [ ] Uses shadcn `Sidebar` + `SidebarProvider` (NOT custom aside)
- [ ] `collapsible="icon"` enabled for collapse support
- [ ] Cookie persistence via `SidebarProvider defaultOpen={readCookie()}`
- [ ] All collapsed styling via `group-data-[collapsible=icon]:*` classes
- [ ] Active state icon color is `text-white` (not `text-primary`) on colored bg
- [ ] No duplicate nav items across sidebar + topbar dropdown
- [ ] Separators gated with same condition as adjacent conditional elements
- [ ] Icon size overrides use `!` important modifier
- [ ] Footer adapts in collapsed mode (hide text, reduce padding, center items)
- [ ] Breadcrumb uses ChevronRight icon separator (not `/`)
- [ ] Dropdown triggers have ChevronDown + hover border affordance
- [ ] Admin sidebar uses same component stack as user sidebar

---

**Knowledge Version History:**
- v1 (2026-04-06): Initial 10 patterns from ConvertScan (CROBOT) sidebar navigation overhaul session.

*(Maintained by Mira. Updated after each sidebar/navigation session.)*
