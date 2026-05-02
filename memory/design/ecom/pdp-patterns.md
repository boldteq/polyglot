# Ecom PDP Design Patterns

**Owner:** elio
**Source intel:** decoder teardowns + Hydrogen 2025 API docs
**Stack scope:** Stack B (Hydrogen + RR7) + Stack C (standalone)
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. PDP Layout Architecture

### WHEN
Every PDP. No exceptions. Mobile spec is primary spec.

### WHY
60-70% of ecom traffic is mobile. Single stacked layout works on all breakpoints — no split-layout divergence to maintain. Glossier, Aritzia, Cuyana, Allbirds all use single-stack PDPs.

### STRUCTURE

```
[Image Gallery — full width]
[Variant Selector]
[Price Block]
[Stock Indicator (conditional)]
[Add to Cart CTA]
[Trust Trio]
[Subscription Toggle (if applicable)]
[Body Content — Zone 2+]
```

**Desktop:** max-width 800px gallery, centered. Info block max-width 600px below.
**Tablet (768-1024px):** same stack, gallery scales to ~720px.
**Mobile (375-768px):** full-width gallery, stacked info below.

### ANTI-PATTERNS
- Split layout (hero left, info right) without explicit brand brief requiring it
- Desktop-first spec that breaks on mobile
- Hiding critical info (trust badges, reviews) below fold on mobile

---

## 2. Hero Image Gallery

### WHEN
Every PDP. 1-15 images depending on price tier.

### WHY
Images are the primary purchase signal for online ecom. No product feel, no texture — images compensate.

### SPEC

**Image count by price tier:**
| Price | Count | Example brand |
|-------|-------|---------------|
| <$40 | 4-6 | Buck Mason basics |
| $40-150 | 6-10 | Vuori, Bombas |
| >$150 | 10-15 | Aritzia, Cuyana |

**Image types (in order):**
1. Hero lifestyle (model, lifestyle context)
2. Product on white / clean background
3. Detail / texture / material close-up
4. Alternate colorway / styling
5. Ingredient / label (supplements)
6. Size reference (with model measurements disclosed)
7. Lifestyle in-use (wearing, using)
8. UGC-style authenticity shot

**Mobile gallery UX:**
- Swipe gesture with momentum + snap to image
- Dot indicator below (up to 8 dots; above 8 use "3/12" counter)
- Pinch-to-zoom on mobile (open lightbox on tap)
- Touch targets: swipe area = full viewport width

**Desktop gallery UX:**
- Thumbnail strip (left side or below)
- Click to zoom (hover magnify loupe for fashion; click-to-lightbox for supplements/home)
- Keyboard navigation (arrow keys)

### Hydrogen implementation
```tsx
<Image
  data={product.featuredImage}
  loading="eager"
  fetchpriority="high"
  sizes="(min-width: 1024px) 800px, 100vw"
  aspectRatio="4/5"
/>
// Subsequent gallery images: loading="lazy"
```

### ANTI-PATTERNS
- Auto-cycling gallery (distracts, confuses, annoys)
- No zoom capability on desktop
- Gallery that takes >2.5s to display hero image (LCP failure)
- Missing alt text on images

---

## 3. Variant Selector

### WHEN
Every PDP with multiple options (size, color, material, bundle).

### WHY
Variant selection is the #1 friction point on PDPs. Wrong pattern = selection confusion = abandoned add-to-cart.

### SPEC

**Density tiers (per-axis, not total combos):**
| Per-axis count | Pattern | Example |
|----------------|---------|---------|
| ≤8 | Clickable swatch/button grid | Allbirds colors, Vuori sizes |
| 9-20 | Hybrid: visual axis = swatches, text axis = buttons | Bombas |
| >20 | Dropdown to avoid sprawl | Aritzia (many size variants) |

**Color swatches:**
- 24px × 24px minimum on desktop; 32px × 32px on mobile
- Border: 1px border/border token, 2px ring-primary on selected
- Out-of-stock: diagonal strikethrough line (CSS linear-gradient trick) + opacity 0.4
- Sold-out label on hover/tap of disabled swatch

**Size buttons:**
- Min 44px height, min 44px width
- Visible text (S/M/L/XL or numeric)
- Out-of-stock: line-through + muted color
- Selected: bg-primary text-primary-foreground

**Hydrogen 2025 implementation (VariantSelector deprecated):**
```tsx
import { getProductOptions, getSelectedProductOptions } from '@shopify/hydrogen';

const selectedOptions = getSelectedProductOptions(request);
const productOptions = getProductOptions({ product, selectedOptions });

{productOptions.map(option => (
  <div key={option.name}>
    <label>{option.name}</label>
    <div className="flex flex-wrap gap-2">
      {option.values.map(({ value, isAvailable, isActive, to }) => (
        <Link
          key={value}
          to={to}
          preventScrollReset
          className={cn(
            'px-3 py-2 border rounded text-sm',
            isActive && 'ring-2 ring-primary',
            !isAvailable && 'opacity-40 line-through'
          )}
        >
          {value}
        </Link>
      ))}
    </div>
  </div>
))}
```

Note: URL-based variant switching = SEO-correct + shareable links. Never JS-state-only.

### ANTI-PATTERNS
- Hiding out-of-stock variants entirely (user should know they exist, just can't select)
- No visual feedback on selected state
- Size guide buried — link prominently near size selector

---

## 4. Price Block

### WHEN
Every PDP. Adjacent to variant selector. Above ATC.

### WHY
Price is a primary purchase decision signal. Hierarchy matters: current price prominent, compare-at secondary.

### STRUCTURE
```
[$current price — large, bold]
[$compare-at price — line-through, muted]  (only when sale)
[Save $X / X% — sale badge]  (only when sale)
[Subscription toggle context: "Or subscribe & save X%"]
```

**Price hierarchy:**
- Current price: text-2xl font-bold text-foreground
- Compare-at: text-base line-through text-muted-foreground
- Sale badge: bg-destructive/10 text-destructive text-xs px-2 py-0.5 rounded

### Hydrogen implementation
```tsx
import { Money } from '@shopify/hydrogen';

<div>
  <Money data={selectedVariant.price} className="text-2xl font-bold" />
  {selectedVariant.compareAtPrice && (
    <Money
      data={selectedVariant.compareAtPrice}
      className="text-base line-through text-muted-foreground ml-2"
    />
  )}
</div>
```

### ANTI-PATTERNS
- Making compare-at price prominent (draws attention away from value)
- Showing fake compare-at prices on non-sale items (legal risk, trust erosion)
- Currency confusion for international storefronts (use Shopify Markets correctly)

---

## 5. Stock Indicator

### WHEN
ONLY when verified inventory count ≤5. Never fake.

### WHY
Real scarcity creates urgency. Fake scarcity destroys trust and repeat purchase rates (decoder bank: -8-15% repeat purchase on brands caught faking urgency).

### SPEC
```
verified inventory ≤5 → "Only {n} left in {selected size/color}"
verified inventory > 5 → [show nothing — no indicator at all]
product out of stock → "Sold out — notify me" input + submit
discontinued product → "Leaving soon" (different from stock urgency)
```

**Real examples:**
- Glossier "Leaving Soon" — used only for genuine discontinuations
- Allbirds — no stock indicator (removed after customer service complaints)
- Gymshark "SELLING OUT FAST" — used only during verified high-velocity sale events

### Hydrogen implementation
```tsx
// selectedVariant.quantityAvailable = null means inventory not tracked
const stockCount = selectedVariant.quantityAvailable;
const showLowStock = stockCount !== null && stockCount > 0 && stockCount <= 5;
const isSoldOut = selectedVariant.availableForSale === false;

{showLowStock && (
  <p className="text-sm text-amber-600">Only {stockCount} left</p>
)}
{isSoldOut && (
  <NotifyMeForm variantId={selectedVariant.id} />
)}
```

### ANTI-PATTERNS
- "Limited stock" (vague, no number)
- "Selling fast" (no number, manipulative)
- "Restock soon" (false hope marketing)
- Showing low stock warning on items with 50+ in inventory

---

## 6. Add to Cart CTA

### WHEN
Every PDP. Primary action. Above fold on mobile (or sticky).

### WHY
ATC is the conversion event. Friction = lost revenue. Optimistic feedback reduces perceived latency.

### STRUCTURE

**States:**
1. Default: "Add to Cart" — bg-primary text-primary-foreground h-12 w-full rounded-lg
2. Loading: spinner + disabled — optimistic update already applied to cart count
3. Success (1s): checkmark icon — "Added to Cart"
4. Out of stock: "Sold Out" — disabled, bg-muted
5. Variant not selected: "Select [Size]" — bg-muted, disabled

**Sticky mobile ATC:**
- Fixed bottom-0 inset-x-0 z-50 px-4 pb-safe
- Appears when main ATC scrolls out of viewport (IntersectionObserver)
- Height: 56px minimum (touch target + visual comfort)
- Includes variant selector summary: "Size: M · Color: Black"
- Hide when cart drawer is open

**Optimistic cart (useOptimisticCart):**
```tsx
import { useOptimisticCart } from '@shopify/hydrogen';
const optimisticCart = useOptimisticCart(cart);
// Instantly shows updated cart count before server confirms
```

### Hydrogen implementation
```tsx
import { AddToCartButton } from '@shopify/hydrogen';

<AddToCartButton
  disabled={!selectedVariant?.availableForSale}
  lines={[{
    merchandiseId: selectedVariant.id,
    quantity: 1,
    selectedVariant,
  }]}
  onClick={() => openCartDrawer()}
>
  {selectedVariant?.availableForSale ? 'Add to Cart' : 'Sold Out'}
</AddToCartButton>
```

### ANTI-PATTERNS
- ATC button that does nothing visible on mobile (no optimistic feedback)
- ATC button that redirects to cart page (kills mobile conversion — use drawer)
- Missing sticky ATC on mobile (30-40% of PDPs need scroll to reach ATC)
- ATC button narrower than full-width on mobile

---

## 7. Trust Trio

### WHEN
Every PDP. Placement depends on niche.

### WHY
Trust removes purchase blockers. Decoder bank: trust trio above ATC lifts conversion 8-15% for skeptical niches (supplements, wellness, luxury).

### PLACEMENT RULE
| Niche | Placement | Brands |
|-------|-----------|--------|
| Supplements / wellness / luxury / tech | ABOVE ATC | AG1, Ritual, Allbirds |
| Apparel / beauty / CPG / home | BELOW ATC (default) | Gymshark, Glossier |

### STRUCTURE (trio order)
1. Free shipping indicator (truck icon + "Free shipping over $X")
2. Returns policy (return icon + "Free returns / 30-day return policy")
3. Reviews count (star icon + "4.8 ★ · 12,400 reviews")

**For skeptical niches, expand trust trio to trust block:**
- Free shipping + easy returns + money-back guarantee
- Third-party certifications (B Corp, NSF, USDA Organic, Leaping Bunny)
- Ingredient transparency card link

### ANTI-PATTERNS
- Fake certifications or generic "secure checkout" without actual SSL indication
- Trust trio text so small it can't be read on mobile
- Trust trio using generic stock icons instead of brand-consistent icons

---

## 8. Reviews Module

### WHEN
Every PDP below hero zone. Default sort: most helpful.

### WHY
Reviews are the #1 offline trust substitute for online ecom. UGC photos: 12-18% trust lift in apparel/beauty.

### STRUCTURE

```
[Star average — large, bold]  [Count — muted]
[Rating breakdown bars — 5★ to 1★]
[Filter tabs: All | Photo Only]
[Sort: Most Helpful ▾ (dropdown)]
[Review cards]
  - Verified purchase badge
  - Star rating
  - Title
  - Body (truncated at 3 lines, "Read more")
  - Reviewer name + date
  - Photos/videos (if any)
[Load more reviews button]
```

**Sort options (max 3):**
1. Most Helpful (default — Amazon-proven, highest social proof signal)
2. Most Recent (freshness validation)
3. Most Critical (transparency signal, builds trust)

**Filter options (max 2):**
1. Photo Only (UGC images — 12-18% trust lift)
2. Verified Purchase Only

### Integration note
Shopify native reviews (Product Reviews app) vs third-party (Yotpo, Okendo, Stamped).
- Metafield source: `product.metafield(namespace: "reviews", key: "rating")`
- For star display: always surface metafield-driven average, not static

### ANTI-PATTERNS
- Default sort by "Most Recent" (recency bias, misses highest-quality reviews)
- No photo filter (hides most convincing UGC)
- Reviews module below fold but not accessible via anchor link from trust trio

---

## 9. Body Content Zones (merch-owned)

### WHEN
PDP scroll below hero. merch writes copy; elio specs layout + order.

### WHY
Body zone order affects objection resolution sequence. Benefits-first, specs-later order outperforms spec-first by 15-25% in decoder bank.

### STRUCTURE (required order)

1. **Benefits paragraphs** (2-3 paragraphs, ≤60 words each)
   - Outcome-led, not feature-led
   - Bold the key outcome word per paragraph
   - merch writes, elio reserves: min-height for 2-3 paragraphs

2. **Benefit bullets** (3-5 bullets)
   - Bold benefit → plain explanation format
   - **Machine washable** → Toss in the wash on cold, hang dry.
   - **Recycled materials** → Made from 95% recycled plastic bottles.

3. **Objection-handling section** (3-5 Q+A)
   - Expandable accordion (`<details>`/`<summary>`)
   - ARIA: `aria-expanded` on summary
   - Keyboard: Enter/Space toggles

4. **Spec table** (full details)
   - Two-column: label | value
   - Scrollable on mobile if >8 rows

5. **Ingredient / materials section** (supplements/beauty only)
   - Expandable ingredient cards
   - Each: ingredient name + source + why we use it
   - Allbirds: material sourcing stories
   - AG1: ingredient efficacy cards

### Metafield enrichment (Hydrogen)
```tsx
// Size guide from metafield
const sizeGuide = product.metafield({ namespace: 'custom', key: 'size_guide' });
// Ingredients from metafield
const ingredients = product.metafield({ namespace: 'custom', key: 'ingredients' });
// Sustainability info
const sustainability = product.metafield({ namespace: 'custom', key: 'sustainability' });
```

Always spec these as conditional: render zone only if metafield exists.

### ANTI-PATTERNS
- Spec table as the first content block (leads with technical specs, not benefits)
- Body paragraphs >100 words (wall of text kills mobile read-through)
- No accordion for Q+A (full list on screen breaks mobile flow)

---

## 10. Subscription Toggle (conditional)

### WHEN
Only when product has subscription option. Default state: One-time.

### WHY
Subscription default is a dark pattern unless specific conditions are met. Forces customers into recurring billing they didn't intend. ELI-010 rule.

### SPEC

**Default state:** One-time selected. Subscription is the 2nd option with savings % visible.

```
[○ One-time  $29]
[● Subscribe & save 20%  $23.20 / delivery]
  [Frequency: Every month ▾]
  [Skip or cancel anytime]
```

**Default-subscribe override:** ONLY when ALL THREE:
1. LTV-sub > 3× LTV-one-time
2. Cancel flow has ≥3-step save (pause / skip / discount / swap)
3. Pause option is self-serve in account portal

**Frequency selector:**
- Dropdown or radio buttons
- Options: Every 2 weeks / Monthly / Every 6 weeks / Every 3 months
- Default: Monthly (highest retention rate, decoder bank)

**Savings display:**
```
Save 20%  →  "Save 20% / $6 per order"  (show both % and $)
```

### ANTI-PATTERNS
- Default-subscribe without meeting the 3 conditions above
- Hiding cancel path ("Cancel anytime" must be visible on the toggle)
- Frequency selector with >5 options (analysis paralysis)

---

## 11. Cross-Sell Rail

### WHEN
Position depends on AOV tier.

### WHY
Cross-sell drives AOV lift. Position affects interrupt-to-consideration balance.

### PLACEMENT BY AOV
| Cart AOV | Position |
|----------|----------|
| <$50 | Bottom of PDP (after reviews) |
| $50-100 | Bottom (default) |
| >$100 | Mid-scroll: between body zone and reviews |

### STRUCTURE
```
["You might also like" header — merch writes]
[Horizontal scroll rail on mobile]
[4-column grid on desktop]
[ProductCard × 4-8]
```

**ProductCard in cross-sell:**
- Image (4:5 ratio)
- Product name (truncate at 1 line)
- Price (current / compare-at)
- Quick-add button (+ icon or "Add" text)

### Shopify cross-sell query
```graphql
# Use product.recommendations(intent: RELATED) for AI-driven cross-sell
# Or ecom-cro's custom eligibility query (AOV-based filtering)
```

### ANTI-PATTERNS
- Cross-sell rail with >8 products (scroll fatigue)
- Cross-sell products that are more expensive than the PDP product (kills purchase confidence)
- No quick-add on cross-sell (forces full PDP visit for every recommendation)

---

## 12. UGC Gallery

### WHEN
PDPs for apparel, beauty, lifestyle brands. Below body content, above cross-sell.

### WHY
UGC = social proof + aspirational context. Decoder bank: Instagram/TikTok UGC gallery increases conversion 10-18% for social brands.

### STRUCTURE
- 3-column grid on mobile, 4-6 on desktop
- 6-12 images
- Tap/click → lightbox with product tag (links to PDP variant)
- "See all on Instagram" / "Follow @brand" CTA

### Platform note
Real UGC integration: Shopify app (Foursixty, Bazaarvoice, Curalate) or Instagram Basic Display API (deprecated — use embed approach).

### ANTI-PATTERNS
- UGC gallery with brand-produced content only (defeats the authenticity purpose)
- No lightbox (makes UGC feel like an ad grid)
- UGC grid that doesn't load on slow connections (lazy load + skeleton)

---

## 13. FAQ / Expandable Sections

### WHEN
Every PDP for supplements, tech, home goods, any product with questions. Optional for commodity apparel.

### WHY
FAQ reduces customer service volume + resolves purchase objections inline.

### STRUCTURE
```html
<details>
  <summary class="flex justify-between items-center py-3 cursor-pointer">
    How long does shipping take?
    <ChevronDown class="transform transition" />
  </summary>
  <div class="pb-3 text-sm text-muted">
    Standard shipping 3-5 business days...
  </div>
</details>
```

**Accessibility:**
- `<details>`/`<summary>` = native keyboard support
- Add `aria-expanded` mirroring for screen readers
- Do NOT use custom JS accordion that breaks keyboard nav

**Order of FAQs:**
1. Shipping & delivery
2. Returns & exchanges
3. Product-specific (ingredients, materials, sizing)
4. Subscription / reorder
5. Gifting

### ANTI-PATTERNS
- All FAQs expanded by default (defeats the space-saving purpose)
- FAQ section >10 questions (use search instead)
- FAQ copy not written by merch (generic copy here hurts brand voice)

---

## 14. Sticky Mobile ATC Bar

### WHEN
All PDPs on mobile. Appears after main ATC scrolls out of viewport.

### WHY
Mobile users scroll away from the ATC. Sticky bar re-surfaces the primary action. Decoder bank: 10-20% mobile conversion lift.

### SPEC
```
[Product name truncated] [Size: M | Color: Black] [Add to Cart →]
```

- `position: fixed; bottom: 0; left: 0; right: 0;`
- `padding-bottom: env(safe-area-inset-bottom)` (iPhone notch safety)
- `z-index: 40` (below cart drawer z-50)
- Height: 56-64px
- Trigger: IntersectionObserver on main ATC button

```tsx
const mainAtcRef = useRef(null);
useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => setStickyVisible(!entry.isIntersecting),
    { threshold: 0 }
  );
  if (mainAtcRef.current) observer.observe(mainAtcRef.current);
  return () => observer.disconnect();
}, []);
```

### ANTI-PATTERNS
- Sticky bar that covers content permanently (should appear on scroll only)
- Missing safe-area padding (ATC hidden behind iPhone home indicator)
- Sticky bar that doesn't close/update when variant is changed

---

## 15. PDP Performance Checklist

- [ ] Hero image: `loading="eager"`, `fetchpriority="high"`, dimensions reserved (CLS prevention)
- [ ] Subsequent images: `loading="lazy"`
- [ ] LCP target: ≤2.0s on Oxygen (Hydrogen), ≤2.5s on custom hosting
- [ ] CLS ≤0.1: all image containers have explicit `aspectRatio`, ATC button has reserved height
- [ ] Bundle ≤200KB JS for PDP route (code-split heavy components)
- [ ] Variant URL updates: `preventScrollReset` on variant links (no scroll jump)
- [ ] Metafield queries: included in `PRODUCT_QUERY` fragment (not separate waterfall queries)
- [ ] Reviews: paginated (load first 6, load more on demand)
- [ ] Font: preloaded in `<head>` with `rel="preload" as="font"`
- [ ] AVIF/WebP: Shopify CDN auto-serves, verify via `?format=webp` param
