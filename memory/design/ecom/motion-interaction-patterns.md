# Ecom Motion + Interaction Patterns

**Owner:** elio
**Source intel:** GSAP docs + CSS scroll-driven animations + decoder teardowns (Allbirds, Gymshark, Nike)
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. Motion Principles for Ecom

### Prime directive: Motion serves conversion, not decoration.
Every animation must have a functional purpose:
- **Feedback:** "This action worked" (ATC optimistic, swatch tap)
- **Context:** "Here is where this thing went" (cart drawer slide)
- **Attention:** "Look at this" (free shipping bar fill)
- **Navigation:** "You are moving through a space" (page transitions, modal reveals)

### Duration token system
| Token | Value | Use |
|-------|-------|-----|
| `--duration-instant` | 100ms | Hover states, focus rings |
| `--duration-fast` | 200ms | Tooltip appear, button tap feedback |
| `--duration-base` | 300ms | Variant swatch selection, dropdown |
| `--duration-slow` | 500ms | Cart drawer, modal, page-level reveals |

### @prefers-reduced-motion (MANDATORY)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
WCAG 2.1 SC 2.3.3 (AAA): motion triggered by interaction must be disableable. This rule is best practice even for AA targets.

---

## 2. Variant Swatch Tap Response

### WHEN
Every PDP with variant swatches (color, material).

### WHY
Instant visual feedback communicates "selection registered." Delay = confusion = double-tap.

### SPEC
```
Tap/click swatch:
→ Ring animation: outline-offset 0px → outline-offset 2px (100ms, ease)
→ Image gallery: crossfade to variant image (200ms, ease)
→ Price block: update (instant)
→ URL update: pushState with new variant params (instant)
```

```css
.swatch {
  transition: outline-offset var(--duration-instant) ease,
              transform var(--duration-instant) ease;
}
.swatch:active {
  transform: scale(0.92);
}
.swatch.selected {
  outline: 2px solid hsl(var(--color-primary));
  outline-offset: 2px;
}
```

**Gallery crossfade on variant change:**
```css
.gallery-image {
  transition: opacity var(--duration-fast) ease;
}
.gallery-image.transitioning {
  opacity: 0;
}
```

---

## 3. Add to Cart Optimistic Feedback

### WHEN
Every ATC button.

### WHY
Without feedback, user thinks nothing happened → taps again → double-add. Optimistic feedback eliminates this.

### SPEC: State sequence
```
Idle    → "Add to Cart" (default)
Pending → Spinner (200ms after tap) + button disabled
Success → Checkmark + "Added!" (800ms) → back to default
Error   → "Try Again" (brief shake animation)
```

**Cart count in header/nav:** increment IMMEDIATELY (optimistic, via `useOptimisticCart`). No waiting for server.

**Toast notification (optional):**
```
"White T-Shirt added to cart" [View Cart →]
```
Appear from bottom-right, auto-dismiss 3s, `role="status"` for accessibility.

### Implementation
```tsx
import { useOptimisticCart } from '@shopify/hydrogen';
// Cart count updates before server round-trip
```

---

## 4. Cart Drawer Animation

### WHEN
Every cart open/close event.

### WHY
Drawer slide communicates spatial relationship: cart is "to the right" of content. Directional motion = spatial memory.

### SPEC

**Open:**
```
translateX(100%) → translateX(0)
transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1)
```

**Close:**
```
translateX(0) → translateX(100%)
transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1)
```

**Backdrop:**
```
opacity: 0 → 0.5
transition: opacity 200ms ease
```

**Spring physics alternative (Framer Motion):**
```tsx
// Cart drawer with spring
<motion.div
  initial={{ x: '100%' }}
  animate={{ x: 0 }}
  exit={{ x: '100%' }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
```

---

## 5. Image Zoom — Desktop

### WHEN
PDP image gallery on desktop. Not mobile (pinch-to-zoom is native).

### WHY
Product inspection is key for high-AOV items. Decoder bank: zoom functionality increases PDP-to-cart rate for apparel/fashion/beauty by 8-12%.

### Patterns by niche
| Niche | Zoom pattern | Example |
|-------|-------------|---------|
| Fashion/apparel | Hover-magnify loupe (cursor: zoom-in) | Aritzia, Cuyana |
| Beauty/supplements | Click-to-lightbox (fullscreen) | Ritual, AG1 |
| Home goods | Hover-magnify + lightbox | Brooklinen |
| CPG/food | Lightbox only | Magic Spoon |

**Hover magnify loupe:**
```css
.gallery-image:hover {
  cursor: zoom-in;
}
/* On hover: show 2x zoomed region in a 300×300 "loupe" following cursor */
/* Implementation: use react-zoom-pan-pinch or custom canvas magnifier */
```

**Lightbox:**
- Full-viewport overlay (`position: fixed; inset: 0; z-index: 100`)
- Black backdrop: `bg-black`
- Image centered: `object-contain` (preserve ratio, no crop)
- Close: X button (top-right) + Escape key + click outside
- Navigation: prev/next arrows + keyboard arrow keys
- Mobile: swipe to navigate, pinch to zoom (native)

---

## 6. Product Card Hover Animation

### WHEN
Product cards in listing grids on desktop.

### WHY
Secondary image reveal on hover increases product exploration (shopper sees more SKU angles without clicking).

### SPEC

**Image swap on hover:**
```css
.card-image-primary {
  opacity: 1;
  transition: opacity var(--duration-fast) ease;
}
.card-image-secondary {
  opacity: 0;
  position: absolute; inset: 0;
  transition: opacity var(--duration-fast) ease;
}
.card:hover .card-image-primary { opacity: 0; }
.card:hover .card-image-secondary { opacity: 1; }
```

**Quick-add reveal on hover:**
```css
.quick-add {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity var(--duration-fast) ease,
              transform var(--duration-fast) ease;
}
.card:hover .quick-add {
  opacity: 1;
  transform: translateY(0);
}
```

---

## 7. Sticky ATC Reveal

### WHEN
PDP mobile: sticky ATC bar appears when main ATC scrolls out of viewport.

### SPEC

**Trigger:** IntersectionObserver on main ATC button.

```tsx
const [stickyVisible, setStickyVisible] = useState(false);
const mainAtcRef = useRef(null);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => setStickyVisible(!entry.isIntersecting),
    { threshold: 0, rootMargin: '0px' }
  );
  if (mainAtcRef.current) observer.observe(mainAtcRef.current);
  return () => observer.disconnect();
}, []);
```

**Animation (slide up from bottom):**
```css
.sticky-atc {
  transform: translateY(100%);
  transition: transform var(--duration-base) cubic-bezier(0.32, 0.72, 0, 1);
}
.sticky-atc.visible {
  transform: translateY(0);
}
```

---

## 8. Skeleton Loading Patterns

### WHEN
Any content that loads asynchronously: product grid, cart, reviews, search results.

### WHY
Skeleton screens reduce perceived loading time vs spinner. User sees structure → forms expectation → content fills in.

### SPEC

**Product card skeleton:**
```tsx
const ProductCardSkeleton = () => (
  <div className="animate-pulse">
    <div className="bg-muted aspect-[4/5] rounded-lg" />
    <div className="mt-2 space-y-1">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  </div>
);
```

**Cart line item skeleton:**
```tsx
<div className="flex gap-3 animate-pulse">
  <div className="h-16 w-16 bg-muted rounded" />
  <div className="flex-1 space-y-2">
    <div className="h-4 bg-muted rounded w-3/4" />
    <div className="h-4 bg-muted rounded w-1/2" />
    <div className="h-4 bg-muted rounded w-1/4" />
  </div>
</div>
```

**Rule:** Match skeleton shape to actual content shape. Don't use a single shimmer bar for a complex card.

---

## 9. Free Shipping Progress Bar Animation

### WHEN
Cart drawer when free shipping threshold is configured.

### SPEC
```
Width animates from 0 → progress% on cart open
transition: width 500ms ease
```

For milestone completion (100%):
```
Green pulse flash → checkmark icon appears
transition: background-color 200ms ease
```

```css
.progress-fill {
  transition: width 500ms ease, background-color 200ms ease;
}
.progress-fill.complete {
  background-color: hsl(var(--color-success));
}
```

---

## 10. Exit Intent Overlay

### WHEN
Desktop only. First visit, no cart. Triggered by mouse moving toward browser top edge.

### WHY
Last chance to capture email or offer incentive before bounce. Decoder bank: exit intent overlays convert 4-8% of would-be bounces (apparel/beauty).

### SPEC
```
[Backdrop: bg-black/60]
[Modal: max-w-md, centered]
  [Close X — always visible]
  [Brand image or lifestyle photo]
  [Headline: "Wait — before you go"]
  [Sub: "Get 10% off your first order"]
  [Email input + Submit CTA]
  [No thanks → dismiss link]
```

**Trigger conditions:**
- Mouse Y velocity toward top of screen
- Only on: homepage, PDP, collection pages
- NOT on: checkout, cart, account
- Frequency: once per 7-day session (localStorage)
- NOT on mobile (intrusive, not thumb-accessible)

**Animation:**
```css
.exit-modal { animation: fadeInScale 300ms ease forwards; }
@keyframes fadeInScale {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
```

---

## 11. Scroll-Triggered Reveals

### WHEN
Homepage, collection page hero, brand story sections.

### SPEC

**Simple CSS (preferred — no JS):**
```css
/* CSS scroll-driven animations (modern browsers) */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

.reveal {
  animation: fadeUp 500ms ease forwards;
  animation-timeline: view();
  animation-range: entry 0% entry 30%;
}
```

**Fallback (IntersectionObserver for older browsers):**
```tsx
const useScrollReveal = (ref) => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && entry.target.classList.add('revealed'),
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
  }, []);
};
```

**GSAP ScrollTrigger (for complex sequences only):**
- Use only when CSS scroll-driven is insufficient (parallax, stagger, scrub)
- Load GSAP async — heavy library
- `ScrollTrigger.refresh()` on font load, image load, resize

**Stagger rule:** Maximum 5 items staggered per section. More = overwhelming.

---

## 12. Anti-Patterns

1. **Auto-play hero video with sound** — instant bounce. Sound must always be opt-in.
2. **Hero carousel with auto-advance** — slides 2+ get near-zero engagement. Use single hero.
3. **Bouncing/pulsing CTA buttons** — distracting, feels cheap. Static is better.
4. **Parallax on product images** — obscures the product, reduces purchase intent.
5. **Page-transition animations >400ms** — feels slow, not premium.
6. **GSAP for everything** — overkill. CSS transitions handle 90% of ecom needs.
7. **Animation without `prefers-reduced-motion` fallback** — accessibility violation.
8. **Infinite CSS animations on background elements** — CPU burn on mobile, battery drain.
9. **Custom cursor** — usually gimmicky, can confuse, adds zero conversion value.
10. **Scroll-jacking** — overriding native scroll behavior always backfires.
