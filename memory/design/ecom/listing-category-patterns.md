# Ecom Listing / Category Page Patterns

**Owner:** elio
**Source intel:** decoder teardowns + Baymard Institute 2025 + Shopify Search & Discovery docs
**Stack scope:** Stack B (Hydrogen + RR7) + Stack C
**Last updated:** 2026-04-27 — Curriculum v2 deep training

---

## 1. Collection Page Architecture

### WHEN
Every product listing page (PLP): /collections/:handle, /search, curated landing pages.

### WHY
Listing pages are discovery surfaces. Poor filter/sort UX = shoppers can't find products they'd buy = zero conversion from a potentially willing customer.

### STRUCTURE

**Desktop layout:**
```
[Breadcrumb]
[Category hero — optional, above-the-fold]
[Active filters / chips bar]
[Sort dropdown — right-aligned]     [Results count]
[Filter sidebar — left, sticky]  |  [Product grid — right]
                                     [Pagination / Load More]
[Collection SEO copy — below fold]
```

**Mobile layout (separate spec — mobile is primary):**
```
[Breadcrumb]
[Filter button + Sort button — inline bar]
[Active filter chips — horizontal scroll]
[Results count]
[Product grid — 2-column]
[Load More button]
```

---

## 2. Product Card

### WHEN
Every product in the listing grid.

### WHY
Product card is the listing page's core conversion unit. Card anatomy drives click-through to PDP.

### STRUCTURE

```
[Image — 4:5 ratio, swipeable on mobile for alternate views]
[Badges — top left: NEW / BESTSELLER / SALE / LOW STOCK]
[Quick-add button — bottom right, appears on hover/tap]
[Product name — 1-2 lines, truncated]
[Variant swatches — up to 6, then "+N more"]
[Price — current | compare-at strikethrough]
```

**Badge rules:**
| Badge | Trigger | Display rule | Char limit |
|-------|---------|--------------|------------|
| NEW | Product live <30 days | Show until day 30 then remove | 3 chars |
| BESTSELLER | Top 20% units sold in collection | Calculated weekly, not manual | 10 chars |
| SALE | Active price markdown | Show "SALE" or "X% OFF" | 8 chars |
| LOW STOCK | ≤5 units total available | Only real count, never fake | 9 chars |
| SOLD OUT | All variants unavailable | Always show (keeps catalog discoverable) | 8 chars |

**Do NOT stack multiple badges** — pick the most important one. Priority: SALE > NEW > BESTSELLER > LOW STOCK.

**Variant swatches on card:**
- Color swatches only (not size)
- Max 6 visible, "+3 more" label after 6
- Tap/click swatch = change card image to that variant (no PDP navigation)
- On hover (desktop): animate to alternate product image (lifestyle/back)

**Quick-add button:**
- Appears on hover (desktop) or tap (mobile)
- If one variant: "Add to Cart" → direct add, no PDP needed
- If multiple variants: opens bottom sheet / mini-variant-selector

### Hydrogen product card query
```graphql
fragment ProductCard on Product {
  id
  handle
  title
  featuredImage { url altText width height }
  priceRange { minVariantPrice { amount currencyCode } }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  options { name values }
  variants(first: 1) {
    nodes { id availableForSale selectedOptions { name value } }
  }
  tags
  publishedAt
}
```

### ANTI-PATTERNS
- Card image with no reserved dimensions (CLS on load)
- Card with no quick-add (forces PDP visit for impulse purchases)
- Stacking 3+ badges on one card
- Swatches that navigate to PDP instead of updating card image

---

## 3. Faceted Filter — Desktop Sidebar

### WHEN
Collections with >20 products and meaningful filter axes.

### WHY
Filters help shoppers self-select. Baymard 2025: faceted filters reduce selection time 40% for large catalogs.

### STRUCTURE

**Filter hierarchy (order matters):**
1. Availability ("In Stock" toggle — always first)
2. Price range (slider or price brackets)
3. Primary product axis (Size for apparel, Skin Type for beauty, Flavor for CPG)
4. Secondary axis (Color, Material, etc.)
5. Rating (4★ and above filter)
6. Collections / Categories (if cross-collection listing)

**Sidebar spec:**
- Sticky on desktop (scrolls with page, doesn't disappear)
- Each filter group: accordion (expanded by default for top 2, collapsed for others)
- Show 5 options max per group; "Show more" reveals all
- Applied filters highlighted (checked, bg-accent/10)
- "Clear all" link at top when any filters active
- Real-time results update without "Apply" button (URL params update on each selection)

### Shopify Search & Discovery integration
```tsx
// Shopify S&D app populates filters on collection query
const { collection } = await storefront.query(COLLECTION_QUERY, {
  variables: {
    handle,
    filters: activeFilters,  // built from URL searchParams
    sortKey,
    reverse,
  }
});

// collection.products.filters — use these to render filter UI
// Filter type: LIST (checkboxes), RANGE (price slider), BOOLEAN (toggle)
```

### ANTI-PATTERNS
- "Apply" button (unnecessary friction — real-time is better)
- Filters that show 0-result options without disabling them
- Filter sidebar that isn't sticky (forces scroll back to top to change filters)
- Hiding availability filter (most important filter for shoppers)

---

## 4. Mobile Filter Drawer

### WHEN
All filter interactions on mobile. Bottom sheet pattern (not sidebar).

### WHY
Sidebar takes too much horizontal space on mobile. Bottom sheet follows thumb-zone interaction patterns.

### STRUCTURE

**Filter + Sort bar (always visible):**
```
[≡ Filter (3)] [Sort: Featured ▾]
```
- Filter badge shows active filter count
- Both buttons open separate bottom sheets

**Bottom sheet spec:**
```
[Drag handle — 40px wide, centered, top]
[Sheet header: "Filter" + "Done" button]
[Filter list — vertical scroll]
[Footer: "View X results" CTA — sticky]
```

**Bottom sheet behavior:**
- Slide up from bottom (translateY 0% ← translateY 100%)
- Drag handle: allow dismiss via downward drag + velocity
- Backdrop: 50% black, tap to dismiss
- Snap points: 90% height (filters), 50% height (simple sort)
- `overscroll-behavior: contain` on sheet (prevents background scroll)
- `position: fixed` bottom-0 (above sticky ATC if present)

### CSS animation
```css
.filter-sheet {
  transform: translateY(100%);
  transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}
.filter-sheet.open {
  transform: translateY(0);
}
```

### ANTI-PATTERNS
- Filter modal (center-screen) on mobile — violates thumb zone
- No drag-to-dismiss (feels broken)
- "View results" button not sticky (hidden when filter list is long)

---

## 5. Sort Dropdown

### WHEN
All collection pages with meaningful sorting.

### SPEC

**Sort options (max 5):**
1. Featured (Shopify default — curated merchandising order)
2. Best Selling (units moved, most trust signal)
3. Newest (recency signal)
4. Price: Low to High
5. Price: High to Low

**Optional (brand-specific):**
- Customer Rating (4.5★ → 3.0★)
- Recommended (AI-personalized — Shopify Recommendations API)

**Default:** "Featured" — reflects merchant merchandising intent.

**Desktop:** Dropdown top-right of grid.
**Mobile:** Bottom sheet sort selector (separate from filter sheet).

### ANTI-PATTERNS
- Default sort = "Price: Low to High" (tells customer "we're cheap")
- More than 6 sort options (analysis paralysis)
- Sort that changes URL without `preventScrollReset` (page jumps to top)

---

## 6. Pagination — Load More Pattern

### WHEN
All collection pages. Default pattern: "Load More" button.

### WHY
- Infinite auto-scroll: kills back button, loses position, hides footer
- Traditional pagination: page reload, loses scroll position
- Load More: URL cursor preserved, back button works, no surprise loading

### SPEC

**First render:** 24 products (grid sweet spot: 6×4 desktop, 12×2 mobile).

**Load More button:**
```
[Load More — X remaining]   →   loading spinner   →   new products append
```

- URL updates with cursor (`?cursor=abc123&direction=next`) — back button preserves position
- "X of Y products" count above or below button
- Disable button while loading (prevent double-fetch)
- Show "All products loaded" when `hasNextPage === false`

### Hydrogen implementation
```tsx
import { getPaginationVariables, Pagination } from '@shopify/hydrogen';

const paginationVariables = getPaginationVariables(request, { pageBy: 24 });

<Pagination connection={collection.products}>
  {({ nodes, isLoading, PreviousLink, NextLink }) => (
    <>
      <ProductGrid products={nodes} />
      <NextLink>
        {isLoading ? <Spinner /> : 'Load More'}
      </NextLink>
    </>
  )}
</Pagination>
```

### ANTI-PATTERNS
- Auto-scroll infinite load (breaks back button)
- Standard page numbers (forces full page reload)
- Load more that jumps to top on load (use `preventScrollReset`)

---

## 7. Search Results Page

### WHEN
/search route — triggered from search input.

### STRUCTURE
Same as collection listing but with:
- Search query displayed: "Results for 'white sneakers'"
- Spell-check / did-you-mean above results
- Result count: "42 products"
- No category hero (results only)
- Same filter + sort bar

**Zero results state:**
```
[Search icon — large, muted]
[No results for "{query}"]
[Try: shorter search terms, check spelling]
[Popular searches — 4-6 links]
[Featured collection — "You might like"]
```

### Shopify Search & Discovery
```graphql
query Search($query: String!, $filters: [ProductFilter!]) {
  search(query: $query, types: PRODUCT, first: 24, productFilters: $filters) {
    nodes { ... on Product { ...ProductCard } }
    filters { id label type values { id label count input } }
    totalCount
  }
}
```

### ANTI-PATTERNS
- No zero-results state (blank page feels broken)
- Search results with no filter options (impossible to refine a broad search)
- Search that searches only product titles (missing tags, description, vendor, type)

---

## 8. Category Hero

### WHEN
Only for top-level curated collections (Men's, Women's, New Arrivals). Skip for filtered sub-collections.

### WHY
Category hero sets context and reinforces brand. Skip for filtered pages — it pushes products below fold.

### SPEC

**Height:** 200px desktop, 160px mobile — constrained so products appear above fold.

**Content:**
- Collection name (H1 for SEO)
- 1-line description (optional — 50-70 chars)
- Background: lifestyle image (tinted overlay for text contrast) OR solid brand color

**Not a full-page hero** — this is a compact context setter, not the homepage hero.

### ANTI-PATTERNS
- Full-height (100vh) category hero — products pushed below fold = 0 product impressions on first scroll
- Category hero on every collection including sale/filtered pages (dilutes PDP product focus)

---

## 9. Breadcrumbs

### WHEN
Collection pages and PDPs. Not homepage.

### WHY
Breadcrumbs: navigation aid + SEO (breadcrumb structured data for Google rich results).

### SPEC
```
Home > Men's > Tops > T-Shirts
```

**Requirements:**
- `<nav aria-label="Breadcrumb">` wrapper
- `<ol>` list (ordered list for correct semantics)
- Final item non-linked (current page)
- JSON-LD structured data (`@type: BreadcrumbList`)
- `text-sm text-muted-foreground` — understated, doesn't compete with H1
- Truncate on mobile: show only last 2 items + "..."

### ANTI-PATTERNS
- Missing breadcrumbs on collection pages (lost navigation + SEO opportunity)
- Breadcrumbs that don't match URL structure (confuses users + hurts SEO)

---

## 10. In-Grid Promo Cards

### WHEN
Seasonal campaigns, featured collections, brand story moments. Optional.

### WHY
Promo cards break the product grid monotony and drive category exploration. Used by Gymshark, Allbirds, Glossier.

### SPEC
- Same size as product card (consistent grid)
- bg-accent or brand campaign color
- Short headline (≤40 chars) + CTA button
- Position: every 6-8 products (one per "row" on desktop)
- A/B test: some brands see lower CVR with promo interruption — test before deploying

### ANTI-PATTERNS
- More than 1 promo card per page (product catalog dilution)
- Promo card in position 1-3 (first products must be visible, not promo)

---

## 11. Empty + Loading States

### Loading (skeleton)
Every product card gets a skeleton while loading:
```tsx
<div className="animate-pulse">
  <div className="bg-muted aspect-[4/5] rounded-lg" />
  <div className="h-4 bg-muted rounded mt-2 w-3/4" />
  <div className="h-4 bg-muted rounded mt-1 w-1/2" />
</div>
```

### Zero results (filters)
```
[X icon — large]
No products match your filters.
[Clear all filters] — CTA link
Or browse [Collection name].
```

### Zero results (search)
```
[Search icon — large]
No results for "{query}"
Try: different spelling · shorter search terms
Popular right now: [4 product links]
```

### ANTI-PATTERNS
- Blank white screen while products load (use skeleton)
- "No products found" with no next step (always offer a path forward)
