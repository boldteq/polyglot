# Hydrogen + React Router 7 — Shopify Storefront Stack

**Owner:** elio (UI) + pod-b-frontend (implementation)
**Scope:** Customer-facing storefront on top of Shopify (Stack B storefront mode)
**NOT for:** Admin embed (use Polaris), SaaS dashboard (use Stack A)
**Last updated:** 2026-04-27 — Curriculum v2 deep training
**Current Hydrogen version:** 2025.x (Shopify 2025-10 API)

---

## Architecture Overview

```
Browser ←→ Oxygen CDN (Cloudflare Workers) ←→ Hydrogen app (Vite + RR7)
                                                      ↕
                                              Shopify Storefront API
                                              Shopify Customer Account API
                                              Shopify Cart API
```

**Key distinction:** Hydrogen runs on Oxygen (Shopify's edge hosting via Cloudflare Workers). All routes are server-rendered by default with client hydration. NOT the same as Next.js SSR — no Node.js, no filesystem, Worker runtime only.

---

## Project Structure

```
app/
  root.tsx                   ← Root layout, providers, cart, analytics
  entry.server.tsx           ← Server entry (Worker)
  entry.client.tsx           ← Client hydration
  routes/
    _index.tsx               ← / homepage
    products.$handle.tsx     ← /products/:handle PDP
    collections.$handle.tsx  ← /collections/:handle listing
    cart.tsx                 ← /cart page (if using cart page, not drawer)
    account.tsx              ← /account
    account_.login.tsx       ← /account/login
    account_.orders.$id.tsx  ← /account/orders/:id
    search.tsx               ← /search
  components/
    Layout.tsx
    Header.tsx
    Footer.tsx
    ProductCard.tsx
    CartDrawer.tsx
    CartLineItem.tsx
    VariantSelector.tsx (legacy) or custom options UI
  lib/
    storefront.server.ts     ← createStorefrontClient
    cart.server.ts           ← createCartHandler
    session.ts               ← cookie session
  graphql/
    products/
      ProductQuery.ts
      ProductCardFragment.ts
    collections/
      CollectionQuery.ts
    cart/
      CartFragment.ts
```

---

## Storefront API — Core Queries

### Product query (PDP)
```tsx
const PRODUCT_QUERY = `#graphql
  query Product($handle: String!, $selectedOptions: [SelectedOptionInput!]!) {
    product(handle: $handle) {
      id title handle vendor
      description descriptionHtml
      featuredImage { url altText width height }
      images(first: 15) {
        nodes { url altText width height }
      }
      priceRange {
        minVariantPrice { amount currencyCode }
      }
      compareAtPriceRange {
        minVariantPrice { amount currencyCode }
      }
      options { name optionValues { name } }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        id availableForSale quantityAvailable
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        selectedOptions { name value }
        image { url altText }
      }
      variants(first: 250) {
        nodes {
          id availableForSale quantityAvailable
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          selectedOptions { name value }
        }
      }
      # Metafields for PDP enrichment
      sizeGuide: metafield(namespace: "custom", key: "size_guide") { value }
      ingredients: metafield(namespace: "custom", key: "ingredients") { value }
      sustainability: metafield(namespace: "custom", key: "sustainability") { value }
      reviewRating: metafield(namespace: "reviews", key: "rating") { value }
      reviewCount: metafield(namespace: "reviews", key: "rating_count") { value }
    }
  }
`
```

### Product card fragment (for listing pages)
```tsx
const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCard on Product {
    id handle title
    featuredImage { url altText width height }
    priceRange { minVariantPrice { amount currencyCode } }
    compareAtPriceRange { minVariantPrice { amount currencyCode } }
    options { name optionValues { name } }
    tags
    publishedAt
    variants(first: 1) {
      nodes {
        id availableForSale
        selectedOptions { name value }
      }
    }
  }
`
```

### Collection query (listing page)
```tsx
const COLLECTION_QUERY = `#graphql
  query Collection(
    $handle: String!
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) {
    collection(handle: $handle) {
      id handle title description
      image { url altText }
      products(
        first: $first, last: $last
        before: $startCursor, after: $endCursor
        filters: $filters
        sortKey: $sortKey
        reverse: $reverse
      ) {
        filters {
          id label type
          values { id label count input }
        }
        nodes { ...ProductCard }
        pageInfo {
          hasPreviousPage hasNextPage
          startCursor endCursor
        }
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
`
```

---

## Cart API

### Setup (root.tsx)
```tsx
import { createCartHandler, cartGetIdDefault, cartSetIdDefault } from '@shopify/hydrogen';

export async function loader({ context }: LoaderFunctionArgs) {
  const cartId = await context.session.get('cartId');
  return {
    cart: context.cart.get(),  // deferred — non-blocking
  };
}

// In server.ts:
const cart = createCartHandler({
  storefront,
  getCartId: () => session.get('cartId'),
  setCartId: (cartId) => session.set('cartId', cartId),
  cartQueryFragment: CART_QUERY_FRAGMENT,  // MUST be named CartApiQuery
});
```

### Cart actions (CartForm)
```tsx
import { CartForm } from '@shopify/hydrogen';

// Add to cart
<CartForm route="/cart" action={CartForm.ACTIONS.LinesAdd}
  inputs={{ lines: [{ merchandiseId: variantId, quantity: 1 }] }}>
  {(fetcher) => (
    <button type="submit" disabled={fetcher.state !== 'idle'}>
      {fetcher.state !== 'idle' ? 'Adding...' : 'Add to Cart'}
    </button>
  )}
</CartForm>

// Update quantity
<CartForm route="/cart" action={CartForm.ACTIONS.LinesUpdate}
  inputs={{ lines: [{ id: lineId, quantity: newQty }] }}>
  ...
</CartForm>

// Remove
<CartForm route="/cart" action={CartForm.ACTIONS.LinesRemove}
  inputs={{ lineIds: [lineId] }}>
  ...
</CartForm>

// Apply discount
<CartForm route="/cart" action={CartForm.ACTIONS.DiscountCodesUpdate}
  inputs={{ discountCodes: [code] }}>
  ...
</CartForm>
```

### Optimistic cart
```tsx
import { useOptimisticCart } from '@shopify/hydrogen';

// In CartDrawer or header cart count:
const optimisticCart = useOptimisticCart(cart);
// Shows immediate UI before server round-trip
const itemCount = optimisticCart?.totalQuantity ?? 0;
```

---

## Variant Selection — 2025 Pattern

`VariantSelector` component deprecated in 2025-10 API. Use new utilities:

```tsx
import { getProductOptions, getSelectedProductOptions } from '@shopify/hydrogen';

// In loader:
const selectedOptions = getSelectedProductOptions(request);
const product = await getProduct(handle, selectedOptions);

// In component:
const productOptions = getProductOptions({ product, selectedOptions });

// Render:
{productOptions.map((option) => (
  <div key={option.name}>
    <label>{option.name}</label>
    {option.values.map(({ value, isAvailable, isActive, to, search }) => (
      <Link
        key={value}
        to={to}
        preventScrollReset
        replace
        className={cn(
          'variant-option',
          isActive && 'variant-option--selected',
          !isAvailable && 'variant-option--unavailable'
        )}
      >
        {value}
      </Link>
    ))}
  </div>
))}
```

**Key:** `to` is a URL with the variant's selectedOptions encoded as search params. `preventScrollReset` keeps scroll position on variant switch.

---

## Image Optimization

Shopify CDN serves AVIF/WebP automatically. Use `<Image>` from Hydrogen:

```tsx
import { Image } from '@shopify/hydrogen';

// Hero image (LCP — always eager)
<Image
  data={product.featuredImage}
  loading="eager"
  fetchpriority="high"
  sizes="(min-width: 1024px) 800px, 100vw"
  aspectRatio="4/5"
  className="w-full object-cover"
/>

// Gallery images (lazy)
<Image
  data={image}
  loading="lazy"
  sizes="(min-width: 768px) 50vw, 100vw"
  aspectRatio="4/5"
/>

// Product card thumbnail
<Image
  data={product.featuredImage}
  loading="lazy"
  sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
  aspectRatio="4/5"
/>
```

**Shopify CDN URL params:**
- `?width=800` — resize
- `?format=webp` — format (CDN auto-detects Accept header)
- `?crop=center` — crop mode

---

## Customer Account API

```tsx
import { createCustomerAccountClient } from '@shopify/hydrogen';

// Auth routes (file naming is exact — these are magic routes)
// app/routes/account_.login.tsx → handles login redirect
// app/routes/account_.authorize.tsx → OAuth callback
// app/routes/account_.logout.tsx → logout
// app/routes/account.tsx → authenticated account area

// In loader:
const customerAccessToken = await context.customerAccount.getAccessToken();
if (!customerAccessToken) throw redirect('/account/login');

// Customer orders query
const { data } = await context.customerAccount.query(`
  query CustomerOrders {
    customer {
      orders(first: 10) {
        nodes {
          id name processedAt
          financialStatus fulfillmentStatus
          totalPrice { amount currencyCode }
          lineItems(first: 5) {
            nodes {
              title quantity
              image { url altText }
            }
          }
        }
      }
    }
  }
`);
```

---

## Analytics + Performance

### Built-in analytics
```tsx
// In root.tsx loader:
import { Analytics } from '@shopify/hydrogen';

<Analytics.Provider cart={cart} shop={shop} consent={consent}>
  <Outlet />
</Analytics.Provider>

// Events emitted automatically:
// page_viewed, product_viewed, collection_viewed
// add_to_cart, remove_from_cart
// checkout_started, purchase
```

### shouldRevalidate (prevent unnecessary reloads)
```tsx
// In any route:
export function shouldRevalidate({ formAction, defaultShouldRevalidate }) {
  // Don't reload product data when cart mutations happen
  if (formAction === '/cart') return false;
  return defaultShouldRevalidate;
}
```

### Performance targets on Oxygen
- LCP ≤2.0s (edge rendering + Shopify CDN)
- TTFB ≤200ms (Cloudflare Workers global edge)
- Bundle: route-level code splitting (Vite default)
- Fonts: preload in `links()` export, `<link rel="preload" as="font">`

---

## Checkout

Hydrogen storefront submits to Shopify-hosted checkout. No custom checkout unless Shopify Plus with Checkout Extensibility.

```tsx
// Checkout URL from cart
const checkoutUrl = cart.checkoutUrl;
// Navigate to: <a href={checkoutUrl}>Checkout</a>

// Shop Pay button (highest-converting checkout entry)
import { ShopPayButton } from '@shopify/hydrogen';
<ShopPayButton
  variantIds={[selectedVariant.id]}
  storeDomain={shop.primaryDomain.url}
/>
```

**Checkout Extensibility (Shopify Plus only):**
- UI Extensions in React, deployed to Shopify's checkout
- Extension targets: `purchase.checkout.*`, `purchase.post-purchase`
- ecom-cro owns implementation; elio specs the visual slot in design

---

## Localization (Shopify Markets)

```tsx
// In root.tsx: ShopifyProvider handles locale routing
// URL pattern: /en-us/products/handle or /fr-fr/products/handle

// Price localization: Money component auto-formats to storefront currency
<Money data={price} />  // renders "$29.99" or "€27.90" based on market
```

---

## SEO

```tsx
// In each route, export a meta function:
export function meta({ data }: MetaArgs) {
  return [
    { title: `${data.product.title} — ${data.shop.name}` },
    { name: 'description', content: data.product.seo?.description },
  ];
}

// Product structured data (JSON-LD) in route component:
<script type="application/ld+json">
  {JSON.stringify({
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.title,
    "image": product.featuredImage?.url,
    "offers": {
      "@type": "Offer",
      "price": selectedVariant.price.amount,
      "priceCurrency": selectedVariant.price.currencyCode,
      "availability": selectedVariant.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    }
  })}
</script>
```

---

## Common Gotchas

1. **Worker runtime — no Node.js APIs:** no `fs`, no `path`, no `process.env` (use `context.env`).
2. **Cart is async/deferred:** always check `cart` is not null/undefined before rendering cart count.
3. **Session storage:** Hydrogen uses encrypted cookies for session, not localStorage.
4. **`preventScrollReset` on variant links:** without this, page scrolls to top on every variant click.
5. **`shouldRevalidate`:** without this, every cart action reloads ALL route loaders (kills performance on PDPs).
6. **Checkout URL changes:** cart.checkoutUrl changes on every cart mutation — don't cache it client-side.
7. **Oxygen deployment:** changes go live on deploy, not immediately. Cache headers matter.
8. **Multi-language:** if using Shopify Markets, every query needs the `language` + `country` context from the session.
