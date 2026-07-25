# The quality bar

What "production grade" means as numbers and checks, so it stops being an opinion.
Everything here is either measurable on a rendered page or checkable in source.

---

## Performance

Field thresholds, 75th percentile, mobile:

| Metric | Good | Needs work | Poor |
|---|---|---|---|
| LCP | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| INP | ≤ 200ms | ≤ 500ms | > 500ms |

Source: https://web.dev/articles/vitals (CC BY 4.0) — verified 2026-07-24

**INP replaced FID.** Any rule targeting FID is dead and should be quarantined.

Theme-side levers that actually move these, in order of effect:

1. The LCP element is almost always the hero image. It must not be lazy-loaded, must have
   explicit width and height, must be served through Shopify's image CDN at the right size,
   and should be the only above-fold image with `fetchpriority="high"`.
2. Reserve dimensions on every image and embed. CLS is preventable at generation time; there
   is no excuse for shipping it.
3. Ship less JS. INP is dominated by long tasks on the main thread. Rule D4 in the code
   standard exists for this reason.
4. Rely on Shopify's automatic CSS subsetting rather than fighting it — which only works if
   rule A1 holds.

**Baseline, not spec status.** Before using a CSS feature, check its Baseline status at
https://web.dev/baseline. W3C REC status tells you the spec is done; it does not tell you the
feature is safe to ship. This distinction is a common source of quietly-broken output.

---

## Accessibility

WCAG 2.2 level AA is the floor. https://www.w3.org/TR/WCAG22/ — verified 2026-07-24

The checks worth automating first, because they catch the majority of real defects:

- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries
- Visible focus indicator on every interactive element, never `outline: none` without a replacement
- Full keyboard operability with no trap
- Target size ≥ 24×24 CSS px (2.2 addition, commonly missed)
- Every form control has a programmatically associated label
- Heading order is sequential with exactly one `h1`
- Landmarks present: `header`, `nav`, `main`, `footer`
- `prefers-reduced-motion` honoured by every animation

Interaction patterns come from the ARIA APG rather than being invented:
https://www.w3.org/WAI/ARIA/apg/

---

## SEO and structured data

- One `h1`, descriptive `title`, meaningful `meta description` — all driven by the brief, never
  a placeholder that ships.
- Canonical URL on every template.
- JSON-LD for the types that actually earn rich results. Product, BreadcrumbList and
  Organization are the ones that pay on a storefront. Required fields matter; a partial Product
  block earns nothing. https://developers.google.com/search/docs/appearance/structured-data/search-gallery
- `agents.md.liquid` shipped and considered — see `01-platform-truth-2026.md` §6. This is new
  surface area and currently unclaimed.
- Markets and locale: no hardcoded currency symbol, no hardcoded locale string, all customer-facing
  copy through locale files.

---

## Commerce correctness

These are the defects that survive a visual review and then cost the client money:

- Renders correctly on an empty store, and on a store with one product
- Sold-out, pre-order and unavailable variant states all render
- Variant selection updates price, image, availability and the add-to-cart state together
- Cart handles quantity 0, quantity above stock, and rapid repeated clicks
- Discount and shipping copy makes no claim the store cannot honour
- Every price goes through `money` filters, never string-concatenated

On abandonment drivers, use verified numbers only. The verified figure for shipping-cost-driven
abandonment is **39%**. The widely-repeated 48% could not be verified against any live source and
must not be cited in client-facing material.

---

## Definition of done for a build

A build is done when the following all hold on a real store, not a fixture:

1. `validate_theme` clean via the Shopify Dev MCP
2. Theme Check clean (`@shopify/theme-check-node`)
3. Core Web Vitals in the Good band on mobile for home, collection, product and cart
4. Zero WCAG 2.2 AA violations from an automated pass, plus a manual keyboard walkthrough
5. Empty-store render verified
6. No merchant-specific literal anywhere in shared code
7. Structured data validates for every type emitted
8. Every generated file traceable to a cited rule, with no uncited rule in the path

Item 8 is the one that closes the loop between this pack and the memory system.
