# Frontend Performance Standards

**Last updated: 2026-04-04**

## Core Web Vitals Targets

Google's Core Web Vitals are ranking factors and UX metrics. Hit these targets:

| Metric | Good | Needs Work | Poor |
|--------|------|-----------|------|
| **LCP** | < 2.5s | 2.5s - 4s | > 4s |
| **INP** | < 200ms | 200ms - 500ms | > 500ms |
| **CLS** | < 0.1 | 0.1 - 0.25 | > 0.25 |

- **LCP (Largest Contentful Paint):** How long until main content is visible
- **INP (Interaction to Next Paint):** How quickly the page responds to user input
- **CLS (Cumulative Layout Shift):** How much unexpected layout shift occurs (bad UX)

---

## Largest Contentful Paint (LCP) < 2.5s

LCP measures when the largest visible element (hero image, heading, paragraph block) finishes rendering.

### Root Causes of Slow LCP

1. **Large images:** Hero image not optimized
2. **Render-blocking CSS/JS:** Resources block page from rendering
3. **Server response time:** Backend slow to respond
4. **CSS is not render-blocking by default**, but unoptimized CSS can delay LCP

### Optimization Techniques

#### 1. Optimize Hero Images

**Problem:** Large hero images delay LCP
**Solution:**
```tsx
// Use next/image (if Next.js) for automatic optimization
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1920}
  height={1080}
  priority // ← Tells Next.js to preload this image
  sizes="100vw"
  quality={75} // Reduce quality slightly
/>

// Without Next.js: use responsive images with srcset
<img
  src="/hero-1024.jpg"
  alt="Hero"
  srcSet="/hero-512.jpg 512w, /hero-1024.jpg 1024w, /hero-2048.jpg 2048w"
  sizes="100vw"
  loading="eager" // Load immediately
/>
```

#### 2. Preload Critical Resources

```html
<!-- In <head> -->
<!-- Preload hero image -->
<link rel="preload" as="image" href="/hero.jpg" />

<!-- Preload critical font -->
<link rel="preload" as="font" href="/fonts/inter.woff2" type="font/woff2" crossorigin />

<!-- Preload critical CSS (if splitting) -->
<link rel="preload" as="style" href="/critical.css" />
```

#### 3. Defer Non-Critical JavaScript

```tsx
// ✓ GOOD: Defer third-party scripts
<script src="/analytics.js" defer></script>
<script src="/ads.js" async></script>

// ✓ GOOD: Code split heavy components
const Dashboard = lazy(() => import('./Dashboard'));

<Suspense fallback={<Skeleton />}>
  <Dashboard />
</Suspense>
```

#### 4. Server Response Time (TTFB)

Reduce server response time:
- Use a CDN (Vercel, Cloudflare, AWS CloudFront)
- Cache responses (HTTP caching headers)
- Optimize database queries (indexes, query planning)
- Move to edge functions if possible (Vercel Edge Functions)

#### 5. Avoid Layout Shifts Before LCP

```css
/* ✓ Set dimensions to prevent layout shift from loading state */
.hero-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #f0f0f0; /* Placeholder while loading */
}
```

---

## Interaction to Next Paint (INP) < 200ms

INP measures the total delay from user interaction to visual feedback. Replaced FID in 2024.

**INP = Input Delay + Processing Delay + Presentational Delay**

### Root Causes of Slow INP

1. **Long JavaScript execution:** Main thread blocked
2. **Unoptimized event handlers:** Heavy computations on input
3. **Large DOM:** Too many elements cause rendering lag

### Optimization Techniques

#### 1. Break Up Long Tasks

Use React 18's `startTransition` to mark non-urgent updates:

```tsx
// ✗ BAD: Blocks interaction while processing
const [results, setResults] = useState([]);

const handleSearch = (query) => {
  // Expensive computation happens immediately
  const filtered = items.filter(item =>
    item.name.includes(query) // ← If items.length is 100k, this blocks
  );
  setResults(filtered); // ← Render waits for computation
};

// ✓ GOOD: Use startTransition for non-urgent updates
import { startTransition } from 'react';

const handleSearch = (query) => {
  // Urgent: show input immediately
  setQuery(query);

  // Non-urgent: search happens in background
  startTransition(() => {
    const filtered = items.filter(item =>
      item.name.includes(query)
    );
    setResults(filtered);
  });
};
```

#### 2. Debounce Input Handlers

```tsx
// ✗ BAD: Event handler fires on every keystroke
const handleInput = (e) => {
  setQuery(e.target.value);
  // API call on every keystroke = poor INP
  api.search(e.target.value);
};

// ✓ GOOD: Debounce to reduce work
import { useMemo } from 'react';

const handleInput = useMemo(
  () => debounce((query) => {
    setQuery(query);
    api.search(query);
  }, 300),
  []
);

// Or use use-callback with debounce library
import { useDebouncedCallback } from 'use-debounce';

const debouncedSearch = useDebouncedCallback(
  (query) => api.search(query),
  300
);
```

#### 3. Avoid Rendering Large Lists

Use virtualization (react-window, TanStack Virtual) to render only visible items:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function LargeList({ items }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${totalSize}px` }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {items[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 4. React.memo for Expensive Renders

```tsx
// ✓ Prevent re-renders of expensive components
const ExpensiveChart = React.memo(({ data }) => {
  return <div>{/* complex chart rendering */}</div>;
});

// Use useMemo for computed values
const expensiveValue = useMemo(
  () => computeExpensiveValue(prop1, prop2),
  [prop1, prop2]
);

// Use useCallback for stable function references
const handleClick = useCallback(
  () => { /* handler */ },
  [dependency]
);
```

---

## Cumulative Layout Shift (CLS) < 0.1

CLS measures unexpected layout shifts during page load and interaction. Ruins UX.

### Root Causes

1. **Images without dimensions:** Image loads, pushes content down
2. **Font loading delays:** Web fonts cause text reflow
3. **Ads/banners injected late:** Ad loads, shifts layout
4. **Dynamic content insertion:** Content added without reserving space

### Optimization Techniques

#### 1. Reserve Space for Images

```tsx
// ✓ GOOD: Set aspect-ratio to reserve space
<div className="aspect-video">
  <img src="video.jpg" alt="desc" className="w-full h-full" />
</div>

// Without aspect-ratio: use padding-bottom trick
<div className="relative pb-[56.25%]">
  {/* 56.25% = 16:9 aspect ratio */}
  <img src="video.jpg" alt="desc" className="absolute inset-0" />
</div>

// ✗ BAD: Image loads, pushes content
<img src="video.jpg" alt="desc" />
```

#### 2. font-display: swap

Swap web fonts to system fonts while loading:

```css
@font-face {
  font-family: 'Inter';
  font-display: swap; /* ← Show system font until custom font loads */
  src: url('/inter.woff2') format('woff2');
}

/* Options:
   - auto: default behavior (invisible until loaded)
   - swap: ← RECOMMENDED for web fonts
   - fallback: brief invisible period, then swap
   - optional: only load if time permits (risky)
*/
```

#### 3. Preload Critical Fonts

```html
<link
  rel="preload"
  as="font"
  href="/fonts/inter.woff2"
  type="font/woff2"
  crossorigin
/>
```

#### 4. Set Image Dimensions

```tsx
// ✓ Tell browser image dimensions
<img
  src="image.jpg"
  alt="desc"
  width={1200}
  height={800}
  style={{ width: '100%', height: 'auto' }} // Responsive
/>

// For background images, use aspect-ratio
<div className="bg-cover aspect-video" style={{ backgroundImage: 'url(...)' }}>
</div>
```

#### 5. Reserve Space for Dynamic Content

```tsx
// ✓ Reserve space for content that loads later
<div className="min-h-64">
  {data ? <Content data={data} /> : <Skeleton />}
</div>

// ✗ BAD: Content loads, shifts layout
<div>
  {data && <Content data={data} />}
</div>
```

---

## Bundle Size Optimization

Target: **Initial JS < 200KB** (gzipped)

### 1. Code Splitting

```tsx
// ✓ Split heavy components
import { lazy, Suspense } from 'react';

const Admin = lazy(() => import('./pages/Admin'));

<Suspense fallback={<Loading />}>
  <Admin />
</Suspense>

// ✓ Dynamic imports for third-party libraries
const Chart = dynamic(() => import('recharts'), {
  ssr: false, // Don't server-render
  loading: () => <Skeleton />,
});
```

### 2. Tree Shaking

```tsx
// ✓ Import only what you use
import { Button } from '@/components/ui/button';

// ✗ AVOID: Importing entire library
import * as Components from '@/components/ui';
```

### 3. Analyze Bundle Size

```bash
# Using webpack-bundle-analyzer or next/bundle-analyzer
npm run build

# Or use source-map-explorer
npm install --save-dev source-map-explorer
npx source-map-explorer 'dist/main.js'
```

---

## React-Specific Optimizations

### 1. Server Components (Next.js)

Move component logic to server to reduce client JS:

```typescript
// ✓ Server Component (runs on server, sends HTML to browser)
export default function PostList() {
  const posts = await fetchPosts(); // ← Server-side fetch

  return (
    <div>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

// ✓ Client Component (only when needed)
'use client';

export function InteractiveWidget() {
  const [count, setCount] = useState(0);
  // ← Client interactivity only
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

### 2. Suspense for Code Splitting

```tsx
<Suspense fallback={<LoadingSkeleton />}>
  <HeavyComponent />
</Suspense>

// Shows LoadingSkeleton until HeavyComponent code loads + renders
```

### 3. Avoid Client-Side Rendering

```typescript
// ✗ BAD: Render on client (slow first paint)
export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);

  return data ? <div>{data}</div> : <Loading />;
}

// ✓ GOOD: Render on server
export default async function Page() {
  const data = await fetch('/api/data').then(r => r.json());

  return <div>{data}</div>;
}
```

---

## Image Optimization

Images are typically the largest assets. Optimize aggressively.

### 1. Modern Formats (WebP, AVIF)

```tsx
// ✓ Use <picture> element for format fallback
<picture>
  <source srcSet="/image.avif" type="image/avif" />
  <source srcSet="/image.webp" type="image/webp" />
  <img src="/image.jpg" alt="desc" />
</picture>

// ✓ Next.js Image handles this automatically
import Image from 'next/image';

<Image
  src="/image.jpg"
  alt="desc"
  width={800}
  height={600}
  // Automatically serves WebP/AVIF with JPG fallback
/>
```

### 2. Responsive Images

```html
<!-- ✓ Browser loads correct size based on viewport -->
<img
  src="/image-1024.jpg"
  alt="desc"
  srcset="/image-512.jpg 512w, /image-1024.jpg 1024w, /image-2048.jpg 2048w"
  sizes="(max-width: 640px) 512px, (max-width: 1024px) 1024px, 2048px"
/>
```

### 3. Lazy Loading Below the Fold

```tsx
// ✓ Lazy load images that aren't immediately visible
<img
  src="/image.jpg"
  alt="desc"
  loading="lazy"
  decoding="async" // Don't block rendering
/>

// ✓ React hook for intersection observer
import { useIntersectionObserver } from 'react-intersection-observer';

function LazyImage({ src, alt }) {
  const { ref, inView } = useIntersectionObserver();

  return (
    <img
      ref={ref}
      src={inView ? src : undefined}
      alt={alt}
      loading="lazy"
    />
  );
}
```

---

## HTTP Caching Strategy

```tsx
// Next.js: Set cache headers for static assets
export const revalidate = 3600; // Revalidate every hour

// Vercel Functions: Cache long-lived responses
response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
```

---

## Lighthouse Audit Process

### Running Lighthouse

1. Open Chrome DevTools (F12)
2. Go to **Lighthouse** tab (or ⋮ → More tools → Lighthouse)
3. Select **Performance**
4. **Enable throttling:** Slow 4G, 4x CPU slowdown (mobile simulation)
5. Run audit in **Incognito mode** (avoids extensions/cache interference)

### Interpreting Results

- **Green (90-100):** Good
- **Orange (50-89):** Needs improvement
- **Red (0-49):** Poor

**Focus areas:**
- LCP (should be < 2.5s)
- INP (should be < 200ms)
- CLS (should be < 0.1)

### Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Large main JS | Code split, lazy load, tree shake |
| Slow LCP | Optimize hero image, preload critical CSS/fonts |
| High INP | Reduce main thread work (debounce, virtualize) |
| High CLS | Reserve space for images/ads, use font-display |
| Unused CSS | Purge unused Tailwind classes |
| Render-blocking resources | Defer non-critical JS, async CSS if possible |

---

## Performance Budget

Set targets and monitor continuously:

```json
// budgets.json
[
  {
    "type": "bundle",
    "name": "main",
    "baseline": "200kb",
    "maxSize": "220kb"
  },
  {
    "type": "resource",
    "resourceType": "image",
    "maxSize": "100kb"
  },
  {
    "type": "resource",
    "resourceType": "font",
    "maxSize": "100kb"
  }
]
```

Use tools like:
- **Lighthouse CI:** Automated performance testing
- **Bundle Analyzer:** Visual bundle composition
- **Web Vitals library:** Real user monitoring

---

## Monitoring Real User Metrics

Use `web-vitals` npm library to track metrics from real users:

```tsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log); // Log CLS
getFID(console.log); // Log FID (or INP)
getFCP(console.log); // Log FCP
getLCP(console.log); // Log LCP
getTTFB(console.log); // Log TTFB (Time to First Byte)
```

---

## Quick Checklist

- [ ] LCP < 2.5s (test with Lighthouse in mobile simulation)
- [ ] INP < 200ms (test interaction response with DevTools)
- [ ] CLS < 0.1 (check for layout shifts in DevTools)
- [ ] Hero image optimized (WebP/AVIF, <100KB)
- [ ] Critical fonts preloaded
- [ ] JavaScript bundle < 200KB gzipped
- [ ] Code split heavy components
- [ ] Images have dimensions or aspect-ratio set
- [ ] font-display: swap for web fonts
- [ ] Lazy load below-fold content
- [ ] No render-blocking resources in <head>
- [ ] Cache headers set correctly
- [ ] Lighthouse score > 90 (all categories)
- [ ] Tested on real 3G/4G connection (DevTools throttling)
- [ ] No hardcoded large assets

---

## References

- [Web Vitals (Google)](https://web.dev/articles/vitals)
- [Core Web Vitals Optimization 2024 (Vercel)](https://vercel.com/kb/guide/optimizing-core-web-vitals-in-2024)
- [Lighthouse Performance Scoring](https://web.dev/performance-scoring/)
- [React Performance Optimization](https://react.dev/reference/react/useMemo)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [Tailwind CSS Performance](https://tailwindcss.com/docs/optimizing-for-production)
- [Core Web Vitals Tools](https://web.dev/vitals-tools/)
