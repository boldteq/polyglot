# Mobile Ecom Design Patterns

**Owner:** elio
**Source intel:** Shopify mobile data + Apple HIG + Material Design 3 + decoder teardowns
**Key stat:** 60-70% of ecom traffic is mobile. Mobile spec is PRIMARY spec.
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. Mobile-First Design Mandate

Design mobile FIRST. Then expand to desktop. Never reverse.

**Why:** If you design desktop-first, mobile becomes an afterthought with squeezed layouts. If you design mobile-first, desktop just gains whitespace and optional side-by-side layouts.

**Breakpoints:**
```
Mobile:  375-767px  (primary design canvas: 390px iPhone 15)
Tablet:  768-1023px (expand to 2-column where needed)
Desktop: 1024px+    (max-width containers, whitespace, optional sidebars)
```

**Rule:** Every spec document starts with the 390px mobile frame. Desktop spec comes second.

---

## 2. Touch Target Requirements

**Minimum:** 48×48px for all interactive elements (Apple HIG, Google Material Design 3, WCAG 2.5.8).

| Element | Min size | Notes |
|---------|----------|-------|
| Buttons | 48×48px | ATC, close, navigation |
| Variant swatches | 32×32px + 8px gap | Gap counts toward hit area |
| Quantity stepper | 44×44px per button | Both + and − |
| Form fields | 44px height | Plus visible label above |
| Cart remove | 44×44px | Tap target, not icon size |
| Filter chips | 36px height | Minimum for comfortable tap |
| Navigation items | 48px tall | Bottom nav + header |

**Common mistake:** Designing 24px icons with no padding = 24px hit area = frustrated taps.

---

## 3. Bottom Navigation Bar

### WHEN
Ecom apps and stores with 4+ top-level navigation destinations.

### WHY
Thumb zone: bottom of screen is easiest to reach on modern large phones (iPhone 15 Pro = 6.1" screen). Top navigation requires uncomfortable reach.

### STRUCTURE (5 items max)
```
[Home icon | Shop icon | Search icon | Cart (count) | Account icon]
```

**Spec:**
- Height: 56px + `env(safe-area-inset-bottom)` (iPhone notch)
- Active state: icon + label visible, primary color
- Inactive state: icon + label, muted color
- Cart icon: badge with count (use optimistic count)
- `position: fixed; bottom: 0; left: 0; right: 0; z-index: 30`

### Coordination
- Sticky ATC bar (z-index: 40) sits ABOVE bottom nav
- Cart drawer (z-index: 50) sits ABOVE both
- Layout must reserve `pb-[56px]` (+ safe area) at page bottom to prevent content being hidden

---

## 4. Sticky ATC Bar (Mobile)

### WHEN
All PDPs on mobile. Appears when main ATC button scrolls out of viewport.

### WHY
Decoder bank: sticky ATC on mobile = 10-20% conversion lift. Shopper reads content, intent builds, then can't find ATC = lost conversion.

### SPEC
```
[Product name (truncated 1 line)] [Size: M · Black] [Add to Cart →]
```

- `position: fixed; bottom: 0; inset-x: 0; z-index: 40`
- Height: 64px (generous for touch) + `pb-safe` (safe area inset)
- Background: bg-background/95 backdrop-blur-sm border-t border-border
- ATC button: full right section, bg-primary
- Show above bottom nav (if present): `bottom: 56px` (adjust if bottom nav visible)
- Trigger: IntersectionObserver on main ATC leaving viewport
- Dismiss: when cart drawer opens

---

## 5. Swipeable Image Gallery

### WHEN
All product image galleries on mobile.

### WHY
Mobile shoppers scroll fast and are habituated to swipe. Non-swipeable gallery breaks expectations.

### SPEC
- Touch events: `touchstart`, `touchmove`, `touchend`
- Momentum scrolling with snap: `scroll-snap-type: x mandatory`
- Each image: `scroll-snap-align: start`
- No buttons (prev/next) on mobile — swipe only
- Dot indicators below (show up to 8 dots; "3/12" counter above 8)
- Pinch-to-zoom: open lightbox on double-tap or pinch

```css
.gallery {
  display: flex;
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
.gallery-item {
  flex: 0 0 100%;
  scroll-snap-align: start;
}
```

### Performance
- Only render first image eagerly, rest lazy
- Thumbnail strip: optional on mobile (space constraint — omit if <5 images)

---

## 6. Mobile Filter Drawer (Bottom Sheet)

### WHEN
Filter interaction on any listing page.

### WHY
Sidebar takes too much space on mobile. Bottom sheet uses thumb-zone interaction.

### SPEC

**Trigger:**
```
[≡ Filter (3 active)] [Sort: Featured ▾]
```
Both are buttons that open separate bottom sheets.

**Bottom sheet anatomy:**
```
[Drag handle — 40px wide, 4px tall, centered, top margin 8px]
[Sheet header: "Filter" + "Done" / "X" button]
[Filter groups — vertical scroll]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Sticky footer: "View X results" CTA]
```

**Behavior:**
- Slide up from bottom: `translateY(100%) → translateY(0)`
- `transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1)` (Material Design 3 spec)
- Drag handle: downward drag + velocity > 500px/s → dismiss
- Backdrop: `bg-black/50`, tap to dismiss
- Height: 90% of viewport height max
- Content area: scrollable
- Footer: `position: sticky; bottom: 0` — always visible

**Focus management:**
- On open: focus first filter option
- On close: focus back to "Filter" button

---

## 7. Mobile Checkout Patterns

### Express checkout priority (mobile)
Place Shop Pay / Apple Pay / Google Pay ABOVE the form. On mobile, these eliminate the need to type any information:
- Shop Pay: auto-fills from previous Shopify purchase
- Apple Pay: Face ID → one tap → done (2 fewer form steps)
- Google Pay: fingerprint/PIN → one tap

**Decoder bank:** Express checkout above form = +35.8% mobile CVR.

### Form UX
| Field | `inputmode` | `autocomplete` | Notes |
|-------|------------|----------------|-------|
| Email | `email` | `email` | Shows @ keyboard |
| Phone | `tel` | `tel` | Shows numeric + symbols |
| Postal code | `numeric` | `postal-code` | Numeric pad |
| Card number | `numeric` | `cc-number` | No spaces allowed |
| CVV | `numeric` | `cc-csc` | 3-4 chars |
| First name | `text` | `given-name` | Auto-capitalize first letter |
| Address line 1 | `text` | `address-line1` | Trigger autocomplete |

**Address autocomplete:**
- Trigger on `focus` event (not after typing)
- Google Places Autocomplete API (or Shopify's built-in)
- Pre-fill: city, state, zip from selected suggestion

**Sticky CTA:**
- "Pay $X.XX" button: `position: fixed; bottom: 0; inset-x: 0`
- Must stay visible even when keyboard is open (use `dvh` not `vh`)
- Show total in button: "Pay $87.00" > "Checkout" (specificity = trust)

---

## 8. Mobile Cart Drawer

### Full-screen on mobile
Cart drawer = full-screen on mobile (100dvh × 100vw). Not a side panel.

**Why:** Side panel on mobile leaves too-small product area behind. Full-screen matches native app conventions.

**Navigation:**
- Header: "← Back" or X close button
- Swipe-right gesture to close (optional, secondary to button)

---

## 9. Size Guide Modal (Mobile)

### WHEN
Apparel PDPs with multiple sizes. Linked near size selector.

### SPEC
```
[Link: "Size Guide ?" — next to size label]
→ Opens bottom sheet modal (not full-page redirect)
  [Modal header: "Size Guide" + X close]
  [Measurement instructions]
  [Size table — horizontally scrollable if wide]
  [Comparison: "M is X-X chest, X-X waist"]
```

**Table:** Scrollable horizontally (`overflow-x: scroll`) — never force tiny text to fit mobile width.

---

## 10. Mobile Search UX

### Full-screen search
Mobile search input → expands to full-screen overlay (not dropdown):

```
[← Back]  [Search input — autofocused]  [✕ Clear]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Recent searches]
[Trending / Popular searches]
↓ (after typing)
[Search results — product cards 2-col]
```

- `autofocus` on search input when overlay opens
- Dismiss: back button or swipe down
- No "Search" submit button needed — results update on each keystroke (with debounce 300ms)

---

## 11. Mobile Performance Checklist

- [ ] All tap targets ≥48×48px (audit with browser DevTools mobile simulator)
- [ ] Images: `loading="lazy"` except hero
- [ ] Font: `display: swap` to prevent invisible text during load
- [ ] No horizontal scroll on any page (check with iOS Safari + iPhone 13 Mini)
- [ ] `meta viewport` content: `width=device-width, initial-scale=1, viewport-fit=cover`
- [ ] `env(safe-area-inset-bottom)` on all fixed bottom elements (iPhone notch)
- [ ] `dvh` instead of `vh` for full-height elements (keyboard doesn't collapse)
- [ ] Touch feedback: `-webkit-tap-highlight-color: transparent` (remove gray flash)
- [ ] No 300ms tap delay: `touch-action: manipulation` on interactive elements
- [ ] Scroll: `overflow: hidden` on body when drawer/modal open (prevent background scroll)

---

## 12. Anti-Patterns

1. **Desktop hover states as mobile primary UX** — hover doesn't exist on touch. Quick-add buttons must be tappable without hover.
2. **Mega-menu on mobile** — use hamburger + full-screen nav instead.
3. **Fixed header that's too tall** — more than 56px header steals product space. Minimize header on scroll.
4. **Bottom CTA covered by iOS Safari bottom bar** — use `env(safe-area-inset-bottom)` always.
5. **Modals from center screen** — use bottom sheets for mobile. Center modals feel wrong on touch.
6. **No swipe-to-dismiss** — users expect swipe down on modals/sheets.
7. **Form fields without `autocomplete` attributes** — kills iOS autofill / Apple Pay flow.
8. **Zoom on form field focus** — set `font-size: 16px` on all inputs (iOS Safari zooms if font < 16px).
9. **Infinite scroll instead of Load More** — breaks back button.
10. **Heavy animation on scroll** — causes jank on mid-range Android devices. Use `will-change: transform` only when needed; prefer `@prefers-reduced-motion`.
