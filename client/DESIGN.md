# Polyglot Design System — "Warm Premium" (v2)

The visual contract for the Polyglot UI. **Every color, size, and spacing decision goes
through a token — never a raw Tailwind palette shade (`text-red-400`) or hex (`#ef4444`)
in a component.** Tokens live in [`src/index.css`](src/index.css) and flip automatically
between light and dark mode.

**v3 design language (PagePilot-matched):** **shadcn "slate" base + Geist font + a `#6959ff` brand
accent.** Near-white page (`oklch(98.5% .002 247.8)` — *not* lavender), **white cards** with a
hairline `#e4e4e8` border + subtle `shadow-xs`, **~14px** radius. Indigo `#6959ff` is a *restrained
accent* (active nav pill, links, focus, the hero gradient `#6959ff→#4a25ff`) on a white/slate/
near-black base — not applied to every surface. Success `#2db862`, warning/destructive aligned to
PagePilot. Dismissible "Get Started" hero with solid-white step cards. Dark mode keeps Polyglot's
slate with the brand accent. Principle: **spacious chrome, dense data** — soften cards/headers/nav/
empties/onboarding; keep tables & lists (Logs, Agent Health, HR registry, OrgChart) dense.
Token values were matched from PagePilot's own compiled theme (Tailwind v4 `oklch()` used directly).

### Sidebar (shadcn Sidebar spec, matched to PagePilot)
256px wide; `bg-sidebar` (faint gray vs white content) + `border-sidebar-border`. Nav items:
`flex items-center gap-2 px-2 h-8 rounded-md text-sm`, icon `size-4`. **Active = brand gradient pill**
`bg-gradient-to-r from-accent to-[var(--color-brand-dark)] text-white font-medium` (white icon) — the
one shared `navItem(active)` helper drives all items. Inactive hover = `bg-sidebar-accent`. Section
labels = `h-8 px-4 text-xs font-medium text-text-muted` (not uppercase). Footer = shadcn user-button:
`h-12`, avatar `w-8 h-8 rounded-lg`, name/email truncate, `ChevronsUpDown` right. Tokens:
`--color-sidebar`, `--color-sidebar-accent`, `--color-sidebar-border` in index.css.

### Consistency rules (polish pass)
- **Type scale (keep it tight):** micro `text-[9px]/[10px]/[11px]` (badges, dense labels) · `text-xs`
  (12) · `text-[13px]` (body/nav) · `text-sm` (14) · `text-base` (16) · `text-lg` (18) · `text-xl` (20)
  · `text-[22px]` (page `<h1>`) · `text-[28px]` (stat display). **No other arbitrary `text-[Npx]`** —
  collapse one-offs to the nearest step.
- **Shadows = 3 tokens only:** `shadow-soft` (cards, resting), `shadow-card` (popovers/dropdowns),
  `shadow-pop` (modals/overlays). Never `shadow-sm/md/lg/xl/2xl`. Semantic color-shadows
  (`shadow-accent/20`) are allowed for state accents.
- **Labels are calm sentence-case:** section/group labels use `text-xs font-medium text-text-muted`
  (no `uppercase tracking-wider`). ALL-CAPS only for short status/tier *badges*, not headings.
- **Modals share one shape:** `rounded-2xl bg-surface border border-border shadow-pop`, backdrop
  `bg-black/60 backdrop-blur-sm`, danger/alert icon `w-8 h-8 rounded-full bg-{color}-muted ring-1
  ring-{color}/30`. `ConfirmDialog` is the reference.

### Controls (use the classes — don't inline)
- **Buttons = color × size.** Color/shape: `btn-primary` · `btn-secondary` · `btn-ghost`. Size:
  `btn-sm` (px-3 py-1.5 text-xs) · `btn-md` (px-4 py-2 text-sm, default) · `btn-lg` (px-5 py-2.5).
  e.g. `class="btn-primary btn-md"`. Icon-only buttons stay `p-1.5 rounded-lg text-text-muted
  hover:bg-surface-2`. All buttons are `rounded-lg`.
- **Inputs/textareas/selects:** `class="input"` (compose `w-auto`, `pl-9`, `font-mono`, `resize-y`).
- **Segmented/toggle groups** (filter pills, view/mode/rich-source toggles, the Hr tab pills):
  container `class="segmented"`, items `class={active ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}`.
- **Page-level tabs:** `<TabNav>` (underline). **Cards:** `.card`. **Nested muted card:**
  `bg-surface-2/50 rounded-xl border border-border-subtle`.

### Page structure rule (consistency contract)
- **Hub tab pages** (Settings/Analytics/Schedules children) render **plain content** — the hub's
  `PageShell` provides the one header + `px-8 pb-8`. They must NOT add their own page title or outer
  padding/max-width.
- **Standalone pages** wrap in `<PageShell title subtitle actions>` for the one canonical header.
- **Special full-height pages** (Playground, OrgChart, Orchestration, the 4 editors, ProjectChat,
  Documentation, Memory) keep their unique layout but use the shared controls/cards above.

### Component classes (the single styling control point — `@layer components` in index.css)
- **`.card`** — `bg-surface rounded-2xl border border-border-subtle shadow-soft`. Use for every
  surface/panel. (Inline `bg-surface rounded-xl border border-border` was swept to this.)
  Add **`.card-hover`** for interactive lift.
- **`.btn-primary` / `.btn-secondary` / `.btn-ghost`** — shape + color only (callers keep their
  own `px/py/text-size`). Primary = indigo + soft shadow.
- **`.stat-badge`** — circular icon container (`rounded-full`; set `w-/h-`).
- **`.input`** — standard field (`rounded-xl`, token border, accent focus).

### Shared presentational components
- **`EmptyState`** (`components/EmptyState.tsx`) — icon-in-rounded-square + title + subtext +
  optional CTA; `card` + `size` variants. Use for every empty list (don't hand-roll).
- **`Skeleton` / `SkeletonCards` / `SkeletonText` / `Spinner`** (`components/Skeleton.tsx`) —
  loading states. `Spinner` is the standard Suspense fallback (Hubs import it; no local copies).
- **`GetStartedHero`** (in `pages/Dashboard.tsx`) — the onboarding hero. Its indigo→violet
  gradient uses fixed hex *on purpose* (an always-dark card in both themes, like white/black
  absolutes) — that is the **one** sanctioned hex exception.

---

## 1. Color tokens

Defined as CSS variables in the `@theme` block of `index.css`, with a dark-mode override
under `html[data-theme="dark"]`. Tailwind v4 generates the utilities from these vars.

### Structural (UI chrome)
| Token | Utility examples | Use for |
|---|---|---|
| `bg` | `bg-bg` | app background |
| `surface`, `surface-2`, `surface-3` | `bg-surface`, `bg-surface-2` | cards, panels, raised fills |
| `border`, `border-subtle` | `border-border` | dividers, card edges |
| `text`, `text-secondary`, `text-muted` | `text-text`, `text-text-muted` | foreground text hierarchy |
| `accent`, `accent-hover`, `accent-muted` | `bg-accent`, `text-accent` | primary action / brand (indigo) |

### Semantic palette
Each family has a base token + a `-muted` low-alpha fill, in light **and** dark values:

`red` · `amber` · `green` · `purple` · `emerald` · `blue` · `sky` · `cyan` · `teal` ·
`indigo` · `violet` · `fuchsia` · `pink` · `rose` · `orange` · `yellow` · `lime` ·
`zinc` · `slate` · `gray`

Usage rules:
- **Foreground:** `text-{family}` (e.g. `text-blue`)
- **Muted fill:** `bg-{family}-muted` (preferred for badge/pill backgrounds)
- **Opacity fill/border:** `bg-{family}/15`, `border-{family}/30`, `ring-{family}/40` — the
  `/NN` modifier composes on the base token
- **Charts / `style={{}}` / SVG:** reference the var directly — `var(--color-purple)`. For
  alpha on a var, use `color-mix(in srgb, var(--color-red) 15%, transparent)` (you can't
  string-concat alpha onto a CSS var).

**Forbidden in components:** `text-red-400`, `bg-blue-500/10`, `#ef4444`. A grep for
`(bg|text|border|ring|...)-(family)-(300..700)` must return zero hits in `src/components`
and `src/pages`. (`text-white` / `bg-black/60` are allowed — they're intentional absolutes.)

### Semantic intent
| Intent | Token |
|---|---|
| success / healthy / active | `green` |
| warning / degraded / probation | `amber` |
| error / critical / pip / destructive | `red` |
| info / pending | `accent` or `blue` / `sky` |
| neutral / retired / disabled | `text-muted` + `surface-2` |

---

## 2. Structured color maps

Any key→color lookup (category, level, status, source, log severity, learning type,
priority, tier) is centralized in **[`src/lib/designTokens.ts`](src/lib/designTokens.ts)**
and **[`src/lib/colors.ts`](src/lib/colors.ts)** (health + status). Components import the map;
they never inline a switch of colors.

| Map | Module | Keys |
|---|---|---|
| `CATEGORY_COLOR` / `categoryColor()` | designTokens | agent categories (+ hash fallback) |
| `LEVEL_COLOR` / `levelColor()`, `STATUS_RING` | designTokens | career levels 0–8, status overlays |
| `SOURCE_COLOR` (mirror: `SOURCE_COLORS` in constants.ts) | designTokens | run sources |
| `LEARNING_TYPE_COLOR` | designTokens | lesson/bug/decision/feedback/golden |
| `LOG_LEVEL_COLOR`, `LOG_SOURCE_COLOR`, `LOG_CATEGORY_COLOR` | designTokens | log triage |
| `PRIORITY_COLOR` | designTokens | high/medium/low |
| `TIER_COLOR_VAR` | designTokens | model tiers (returns `var(--color-*)` for charts) |
| `HEALTH_*_COLOR`, `STATUS_COLORS` | colors.ts | health buckets, agent status |

Adding a new semantic mapping → add it to `designTokens.ts`, not to a component. The
`badge(family)` helper builds the `{text, bg, border}` triple from one family name.

---

## 3. Type scale

Font families (`index.css`): `--font-sans` (Inter) for UI, `--font-mono` (JetBrains Mono)
for code/IDs/metrics. The app is information-dense, so the UI scale runs small:

| Role | Class | px |
|---|---|---|
| Page title | `text-xl font-bold` | 20 |
| Section / card title | `text-sm font-semibold` | 14 |
| Body | `text-sm` / `text-[13px]` | 13–14 |
| Secondary / meta | `text-xs` | 12 |
| Label / caption | `text-[11px]` | 11 |
| Micro (badges, counts) | `text-[10px]` | 10 |
| Uppercase section header | `text-[10px] font-semibold uppercase tracking-wider text-text-muted` | 10 |

Prefer the named steps. Reach for an arbitrary `text-[Npx]` only at the 9–11px micro range
where Tailwind has no step.

---

## 4. Spacing, radius, elevation

**Spacing** — 4px-based Tailwind scale. Page gutters: `px-6`/`px-8`. Card padding: `p-4`.
Stack gaps: `gap-2`/`gap-3`. Tight inline gaps: `gap-1`/`gap-1.5`.

**Radius:**
| Class | Use |
|---|---|
| `rounded-md` | small controls, kbd, inline chips |
| `rounded-lg` | buttons, inputs, nav links |
| `rounded-xl` | cards, panels |
| `rounded-2xl` | modals, dialogs |
| `rounded-full` | avatars, pills, dots, badges |

**Elevation:** flat by default; depth comes from `border-border` + `bg-surface` layering.
| Class | Use |
|---|---|
| (none) | inline content on a surface |
| `shadow-sm` | subtle raise (rare) |
| `shadow-lg` | dropdowns, popovers, drawers |
| `shadow-2xl` | modals / dialogs over a backdrop |

Backdrops: `bg-black/60 backdrop-blur-sm`. Z-index: toasts `z-[100]`, dialogs/drawers
`z-[60]`–`z-[100]`, generic overlays `z-50`, sidebar `z-50`.

---

## 5. Interaction & motion

- **Destructive / high-consequence actions** use `ConfirmDialog` (danger mode; add
  `typeNameToConfirm` for irreversible ones). Never `window.confirm()`. Reversible bulk
  actions may instead fire a `toast(..., { action: { label: 'Undo', onClick } })`.
- **Detail / review** opens a right-side drawer (`animate-slide-in`), not a modal.
- **Focus:** every control inherits the global `:focus-visible` ring (`index.css`). Icon-only
  buttons need an `aria-label`. Tab bars use `role=tablist`/`role=tab`/`aria-selected` with
  roving `tabIndex`. Dialogs use `role=dialog` + `aria-modal` + `aria-labelledby`.
- **Motion:** CSS transitions ~100–200ms (`transition-colors`, `transition-all`). All motion
  is gated by the global `prefers-reduced-motion` block in `index.css`.
- **States:** every data view ships three visually distinct states — loading (skeleton/spinner),
  error (`ErrorState` or inline banner + retry), empty (icon + guidance). Never a silent blank.

---

## 6. Component primitives

Reuse before building: `PageShell` / `SectionCard` / `StatRow` / `FilterBar` / `TabNav`
(layout), `ConfirmDialog`, `toast()`, `ErrorState`, `Breadcrumbs`, `LevelBadge`, `AgentIcon`,
`AgentCategoryBadge`, `MarkdownRenderer`. Name display always goes through
`formatAgentDisplay()`.
