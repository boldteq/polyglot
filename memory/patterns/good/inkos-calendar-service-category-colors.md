---
name: Service Category Color Coding (Data-Layer Accents)
description: Per-service category enum → brand-safe color map rendered as data-driven inline style on booking cards. Breaks the "one palette only" rule deliberately — these are data accents, not UI chrome.
type: pattern
stack: A
source: InkOS Calendar Sprint 1-6, 2026-04-23
usage_metric: 0
knowledge_version: v1
---

## Context

InkOS brand palette is locked to **Bone / Onyx / Stone / Rust**. But studios need to visually distinguish service categories on a dense day calendar at a glance (tattoo vs piercing vs consult vs touch-up). Using only brand colors collapses the grid into grey mush.

**The exception that proves the rule:** `GuestArtistStrip` already uses per-artist accent tint in the calendar. Service categories follow the same precedent. These colors are **data-layer accents applied to content**, never to navigation, CTAs, or chrome.

## Pattern

### 1. Enum + color map in one file

`lib/services/category-colors.ts`:

```ts
export const SERVICE_CATEGORIES = [
  'tattoo',
  'piercing',
  'consultation',
  'touch_up',
  'removal',
  'cover_up',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

// Data-layer accents — not brand palette. Only used inside booking cards.
const CATEGORY_COLOR: Record<ServiceCategory, string> = {
  tattoo:       '#3B3B3B', // near-onyx, feels on-brand
  piercing:     '#7C6FBE', // muted violet
  consultation: '#5B8DBF', // muted blue
  touch_up:     '#6B9E7C', // muted green
  removal:      '#B88A55', // muted amber
  cover_up:     '#8E6B9E', // muted mauve
};

const STONE_TINT = '#787774'; // fallback = Stone

export function resolveCategoryColor(opts: {
  customHex?: string | null;     // per-service override in DB
  category?: ServiceCategory | null;
}): string {
  if (opts.customHex) return opts.customHex;
  if (opts.category && CATEGORY_COLOR[opts.category]) {
    return CATEGORY_COLOR[opts.category];
  }
  return STONE_TINT;
}
```

### 2. Applied as inline style, not Tailwind class

```tsx
// components/calendar/BookingCard.tsx
import { resolveCategoryColor } from '@/lib/services/category-colors';

const accent = resolveCategoryColor({
  customHex: booking.service.custom_color_hex,
  category:  booking.service.category,
});

return (
  <div
    className="rounded-md border bg-bone shadow-card"
    style={{ borderLeft: `3px solid ${accent}` }}
  >
    {/* card content */}
  </div>
);
```

### 3. Fallback hierarchy (non-negotiable)

```
customHex (studio-owner override, per service)
   ↓ if null
categoryColor (enum-driven default)
   ↓ if category null/unknown
stoneTint (#787774 — always valid, brand-safe)
```

## Why

- **Dense grids need chromatic variety.** 8-hour × 6-chair calendars with only Bone/Onyx/Stone/Rust become unreadable.
- **Data accents ≠ chrome.** The color lives on a 3px left border inside a card, never on a button, nav link, or KPI.
- **Owner override path exists.** `custom_color_hex` on the `services` row lets studios brand-match their own system.
- **Stone fallback is always valid.** Even if category is null, the card still renders on-brand.

## When to use this pattern elsewhere

Any Stack A product where:
- A dense list or grid has categorical items the user scans quickly (calendar, Kanban, tag cloud).
- The brand palette is tight (≤4 colors).
- You've already set a precedent with per-entity accents (artist strip, project label, tag pill).

## When NOT to use

- Navigation, sidebars, top bars, modals, buttons, KPIs → brand palette ONLY.
- If the precedent isn't already set in the product, add it to `GuestArtistStrip`-style entity first so the category system is consistent with a sibling.
- Don't introduce more than 8 category colors — at that point switch to pattern/icon differentiation.

## Brand-compliance note

In InkOS, Vega approved this under the "data-layer accent" carve-out documented by the `GuestArtistStrip` precedent. Both systems:
1. Apply color inside cards only (never on chrome).
2. Use muted, low-saturation hues that don't fight Rust.
3. Fall back to Stone when data is missing.

If a future design review asks "why does the calendar have purple?" — the answer is: *same reason the artist strip has teal. Data layer.*

## Source

- `lib/services/category-colors.ts`
- `components/calendar/BookingCard.tsx`
- Precedent: `components/calendar/GuestArtistStrip.tsx`

Sprint 1-6 of InkOS calendar PDF-compliance closeout, 2026-04-23.
