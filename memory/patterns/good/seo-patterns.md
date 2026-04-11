---
name: SEO Patterns & Rankings Intelligence
description: Proven SEO patterns from top-ranking SaaS products — technical SEO, content strategy, keyword mapping, and structured data that drive page-1 rankings
type: reference
priority: high
---

## How Top SaaS Products Win at SEO

### Linear (Project Management)
- Clean URL structure: `/features`, `/method`, `/customers`, `/changelog`
- Every feature page targets a specific keyword cluster
- Changelog doubles as SEO content (fresh, indexed, keyword-rich)
- Minimal JS — fast SSR, excellent Core Web Vitals
- FAQ schema on pricing page drives rich results

### Notion (Productivity)
- Template gallery = massive SEO surface area (thousands of indexed pages)
- User-generated templates rank for long-tail keywords
- `/templates/[category]/[template]` structure targets specific searches
- Strong internal linking from templates → features → pricing
- Blog targets informational intent, templates target transactional

### Dodo Payments (Payments)
- Documentation as SEO engine — developer docs rank for thousands of technical queries
- `/docs/[topic]` generates enormous organic traffic
- API reference pages structured with schema markup
- Guides target mid-funnel keywords ("how to accept payments online")
- Status page and changelog indexed for brand queries

### Vercel (Deployment)
- Framework-specific landing pages: `/solutions/nextjs`, `/solutions/remix`
- Use case pages target commercial intent: "deploy react app", "serverless hosting"
- Open source project pages (Next.js docs) drive massive organic traffic
- Conference/event pages rank for developer event queries
- Showcase/customer pages rank for "[framework] examples"

### Superhuman (Email)
- Strong homepage SEO with clear H1 targeting "fastest email experience"
- Waitlist/referral pages generated social signals that boosted domain authority
- Blog targets pain-point keywords: "email overload", "inbox zero method"
- Limited page count but very high quality per page = strong per-page authority

---

## SEO Architecture Patterns

### URL Strategy for SaaS
```
/ → Homepage (brand + primary keyword)
/features → Feature overview (secondary keywords)
/features/[feature] → Individual feature (long-tail keywords)
/pricing → Pricing page (transactional intent)
/customers → Social proof (commercial intent)
/blog → Content hub (informational intent)
/blog/[slug] → Individual posts (long-tail informational)
/docs → Documentation (developer/technical queries)
/changelog → Updates (freshness signal, brand queries)
/templates or /examples → User resources (massive long-tail surface)
/compare/[competitor] → Comparison pages (bottom-funnel commercial intent)
```

### Internal Linking Rules
1. Every page links to 3-5 related internal pages
2. Footer links to all major sections (pricing, features, blog, docs)
3. Blog posts link to feature pages (informational → commercial)
4. Feature pages link to pricing (commercial → transactional)
5. No orphan pages — every page reachable within 3 clicks from homepage
6. Use descriptive anchor text (not "click here" or "learn more")

### Content Clusters (Hub & Spoke Model)
```
Hub Page: /features/analytics (pillar content, 2000+ words)
├── Spoke: /blog/how-to-track-user-engagement
├── Spoke: /blog/analytics-dashboard-best-practices
├── Spoke: /blog/what-metrics-matter-for-saas
├── Spoke: /docs/analytics-api-reference
└── Spoke: /templates/analytics-dashboard-template

All spokes link back to hub. Hub links to all spokes.
This builds topical authority for "analytics" keyword cluster.
```

---

## Technical SEO Quick-Reference

### Next.js SEO Setup (Copy-Paste Ready)

**Metadata Pattern:**
```typescript
// Per-page metadata (app/[page]/page.tsx)
export async function generateMetadata({ params }): Promise<Metadata> {
  const page = await getPage(params.slug)
  return {
    title: `${page.title} | Brand`,
    description: page.seoDescription,
    alternates: { canonical: `https://domain.com/${params.slug}` },
    openGraph: {
      title: page.title,
      description: page.seoDescription,
      images: [{ url: page.ogImage, width: 1200, height: 630 }],
    },
  }
}
```

**JSON-LD Pattern:**
```typescript
// components/structured-data.tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// Usage in page:
<JsonLd data={{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Product Name",
  "applicationCategory": "BusinessApplication",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}} />
```

---

## Keyword Mapping Template

| Page | Primary Keyword | Secondary Keywords | Intent | Target Volume |
|------|----------------|-------------------|--------|--------------|
| / | [product category] | [brand], [core function] | Navigational | High |
| /features | [product type] features | [feature 1], [feature 2] | Commercial | Medium |
| /pricing | [product type] pricing | free, plans, cost | Transactional | Medium |
| /blog/[post] | [topic keyword] | [related terms] | Informational | Varies |
| /compare/[competitor] | [product] vs [competitor] | alternative to [competitor] | Commercial | Medium |

---

## SEO Antipatterns (Never Do These)

- **Client-side only rendering** — Google may not execute JS, content invisible
- **Same title tag on every page** — Google sees these as duplicates
- **Keyword stuffing** — unnatural repetition gets penalized
- **Hidden text or links** — Google penalizes cloaking
- **Thin doorway pages** — low-quality pages targeting many keywords
- **Ignoring Search Console errors** — crawl errors compound over time
- **No canonical URLs** — duplicate content dilutes rankings
- **Blocking CSS/JS in robots.txt** — Google needs to render the page
- **Changing URLs without redirects** — lose all accumulated ranking authority
- **Publishing AI-generated content without editing** — Google's Helpful Content Update devalues it

---

## Monthly SEO Review Template

```
1. Rankings: top 10 keywords — position changes vs last month
2. Traffic: organic sessions — trend (up/down/flat)
3. Technical: crawl errors, indexing issues (from Search Console)
4. Speed: Core Web Vitals regressions (from PageSpeed Insights)
5. Content: new pages published, thin pages to improve
6. Competitors: any ranking changes for shared keywords
7. Actions: prioritized list of SEO improvements for next sprint
```

---

*(Updated by Zeph — SEO patterns evolve with each shipped product)*
