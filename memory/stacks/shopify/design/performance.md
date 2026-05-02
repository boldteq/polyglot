# Performance — Web Vitals & Budget Rules

> Source: shopify.dev/docs/apps/launch/built-for-shopify | shopify.dev/docs/apps/build/performance
> Last extracted: 2026-04-04

## Key Rules

1. **Max -10 Lighthouse point regression** — app cannot reduce storefront Lighthouse score by >10 points
2. **JS budget: <10KB per extension** — keep bundle size minimal
3. **CSS budget: <50KB per page** — inline critical styles, defer non-critical
4. **Checkout extensions: 64KB hard limit** — enforced at deployment
5. **Network response <1s** — API responses must be fast
6. **Core Web Vitals passing** — LCP <2.5s, FID <100ms, CLS <0.1

---

## Lighthouse Performance Targets

### Score Targets (Out of 100)
- **Performance:** >90
- **Accessibility:** >90
- **Best Practices:** >90
- **SEO:** >90

### Core Web Vitals
| Metric | Target | Status |
|--------|--------|--------|
| LCP (Largest Contentful Paint) | <2.5s | Good ✓ |
| FID (First Input Delay) | <100ms | Good ✓ |
| CLS (Cumulative Layout Shift) | <0.1 | Good ✓ |

### Checkout Extension Requirements
- **p95 response time:** ≤500ms
- **Failure rate:** <0.1% (minimum 1000 requests over 28 days)

---

## Bundle Size Budgets

### Admin App Budgets
- **JavaScript:** <10KB per route entry point (gzipped)
- **CSS:** <50KB per page (gzipped)
- **Total:** <150KB per page (all assets combined)

### Checkout Extension Budget
- **Hard limit: 64KB gzipped** — exceeding this blocks deployment
- **Includes all code + dependencies**
- **No way to exceed — enforced at build time**

### Theme App Extension (Storefront Widget)
- **Widget JS:** <64KB gzipped (same as checkout)
- **No external dependencies** — pure JS only
- **Async load** — never block storefront rendering

---

## Performance Optimization Patterns

### Code Splitting
```typescript
// ✅ CORRECT — lazy load heavy components
import { lazy, Suspense } from "react";

const ReportsTab = lazy(() => import("./ReportsTab"));

export function Dashboard() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <ReportsTab />
    </Suspense>
  );
}
```

### Image Optimization
```typescript
// ✅ CORRECT — optimized, responsive images
<img
  src="image.jpg"
  srcSet="image-sm.jpg 480w, image-md.jpg 1024w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Product"
  loading="lazy"
/>

// ❌ AVOID — unoptimized, oversized images
<img src="huge-4mb-image.jpg" width="200px" />
```

### Caching Strategy
```typescript
// ✅ CORRECT — cache API responses with React Query
const { data } = useQuery({
  queryKey: ["products"],
  queryFn: () => fetchProducts(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// ❌ AVOID — fresh API call on every render
const [products, setProducts] = useState([]);
useEffect(() => {
  fetchProducts(); // Called on every dependency change
}, []);
```

### Minification & Compression
```typescript
// ✅ CORRECT — build tools auto-minify and gzip
npm run build

// ✅ CORRECT — enable gzip compression on server
// In hosting config (Vercel, Netlify, etc.)
```

---

## Monitoring & Metrics

### Build-Time Checking
```bash
# ✅ Check bundle size before deployment
npm run build
# Output: 42KB (JS) + 12KB (CSS) = 54KB total

# ❌ If exceeds budget, tree-shake unused code
```

### Chrome DevTools Lighthouse
1. Open DevTools
2. Click Lighthouse tab
3. Select "Mobile" (stricter test)
4. Run audit
5. Review "Opportunities" section for fixes

### Real User Monitoring
```typescript
// ✅ CORRECT — measure real-world performance
if ("PerformanceObserver" in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log("LCP:", entry.renderTime || entry.loadTime);
    }
  });
  observer.observe({type: "largest-contentful-paint"});
}
```

---

## Polaris Performance

### Polaris is Optimized
- Polaris components are pre-optimized
- Web components load efficiently
- Design tokens reduce CSS duplication
- Built-in lazy loading for heavy components

### Use Polaris Skeleton Components
```typescript
// ✅ CORRECT — skeleton prevents CLS
{isLoading ? (
  <SkeletonPage primaryAction>
    <SkeletonBodyText lines={3} />
  </SkeletonPage>
) : (
  <Page title="Products">{/* Content */}</Page>
)}

// Skeleton matches final layout → no layout shift
```

---

## Asset Delivery

### Critical Path Optimization
```
1. HTML (downloaded first)
2. CSS (blocks rendering)
3. Critical above-the-fold JS (blocks interaction)
4. Below-the-fold JS (deferred, async)
5. Images (lazy-loaded)
```

### Network Request Strategy
```typescript
// ✅ CORRECT — parallel, prioritized requests
Promise.all([
  fetch("/api/products"), // Critical
  fetch("/api/analytics"), // Non-critical
]);

// ❌ AVOID — sequential requests
const products = await fetch("/api/products");
const analytics = await fetch("/api/analytics");
```

---

## Storefront Impact (If Using Theme Extensions)

### Checkout Extensions Performance
- Must meet p95 ≤500ms response time
- Cannot degrade Lighthouse score by >10 points
- Test with realistic Shopify checkout

### Monitoring Checkout Performance
1. Deploy to test store
2. Run Lighthouse on checkout page
3. Measure response time (admin API calls)
4. Compare before/after app installation
5. Optimize if regression >10 points

---

## Common Performance Pitfalls

- **Oversized images** — compress and use modern formats (WebP)
- **Synchronous JS parsing** — blocks rendering; defer non-critical
- **Too many API calls** — batch requests, use caching
- **Large dependencies** — audit npm modules; remove unused
- **Render-blocking CSS** — inline critical styles, defer rest
- **Layout shifts (CLS)** — skeleton states, fixed dimensions
- **Unoptimized fonts** — use system fonts when possible
- **Excessive re-renders** — memoize expensive components
- **No code splitting** — lazy-load routes and modals
- **Huge checkout extensions** — keep under 64KB; simplify
