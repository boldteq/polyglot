# v3 Performance Pass Auto-Rules

**Owner:** sage (review-stage gate) + bolt (deploy-stage enforcement) + elio (design-stage gate)
**Source:** v3 Production Design System §6
**Adopted:** 2026-04-30 — Hard-block emit on violation

---

## Performance budget contract (HARD GATE)

```ts
const BUDGET = {
  LCP_p75:      2500,       // ms — largest contentful paint
  INP_p75:      200,        // ms — interaction to next paint
  CLS_p75:      0.1,        // cumulative layout shift
  TTFB:         800,        // ms — time to first byte
  js_initial:   170 * 1024, // bytes — initial JS bundle
  css_initial:  50 * 1024,
  fonts_initial:90 * 1024,
  image_initial:300 * 1024,
};
```

Hydrogen on Oxygen edge: aim LCP ≤2.0s. Custom Stack C: ≤2.5s. Pipeline halts on violation. sage rejects PR. bolt blocks deploy.

---

## Image format chain (Boldteq adopted)

AVIF primary + WebP fallback + dimensions reserved.

```tsx
<picture>
  <source type="image/avif" srcSet={generateSrcSet(src, 'avif')} sizes="..." />
  <source type="image/webp" srcSet={generateSrcSet(src, 'webp')} sizes="..." />
  <img src={src} width={w} height={h} loading={isAboveFold ? 'eager' : 'lazy'}
       decoding="async" fetchpriority={isAboveFold ? 'high' : 'auto'} />
</picture>
```

Hero images: `loading="eager" fetchpriority="high"` + `<link rel="preload" as="image">`. Below-fold: `loading="lazy"`.

CLS prevention: width/height attrs always set. Inferred from intrinsic dimensions if missing.

---

## JS code-split decision matrix

| Component zone | JS strategy | Image strategy | Render |
|---|---|---|---|
| `hero` | static import | `loading=eager` + preload | SSR |
| `kpi_row`, `page_header` | static import | inline SVG | SSR |
| `main` (above fold) | static import | `loading=eager` | SSR |
| `aside`, `tabs_panel` | static import | `loading=lazy` | SSR |
| `cta_band`, `pricing` (mid-page) | dynamic import | `loading=lazy` | SSR |
| `testimonials`, `faq` (below fold) | dynamic import | `loading=lazy` | SSR or client |
| `footer` | dynamic import | `loading=lazy` | client |
| Modals, drawers, command palette | dynamic import on trigger | n/a | client only |

**Threshold rule (Boldteq adopted):** below-fold OR component bundle >30KB → dynamic import. Build analyzer flags violations.

---

## Critical CSS extraction

Extract for `hero` + `topbar` + `page_header` zones only. Inline in `<head>`. Async-load rest:

```html
<style>/* critical inlined */</style>
<link rel="stylesheet" media="print" onload="this.media='all'" href="/full.css" />
<noscript><link rel="stylesheet" href="/full.css" /></noscript>
```

Tools: `critters`, `beasties`. Build step.

---

## Font optimization

```ts
for (const font of project.fonts) {
  font.display = 'swap';                  // FOUT > invisible text
  font.subset  = 'latin';                 // unicode-range subsetting
  if (font.role === 'display') {
    addPreloadLink(project, font.url);    // preload display fonts only
  }
}
```

WOFF2 only. No legacy formats.

---

## Third-party scripts

```ts
const scriptStrategy = {
  analytics:    { defer: true,  consent: false },          // PostHog/GA4/Shopify Analytics
  tag_manager:  { async: true,  consent: false },          // GTM
  chat_widget:  { lazy_after_idle: true, consent: false }, // Intercom/Drift — requestIdleCallback
  pixels:       { defer: true,  consent: true  },          // FB/TikTok pixels — consent-gated
};
```

`requestIdleCallback` for chat widget. Pixels gated behind cookie consent (GDPR).

---

## Auto-optimization pass (full pipeline)

```ts
function performancePass(project: ProjectArtifact): ProjectArtifact {
  // IMAGES
  walkComponents(project, (c) => {
    if (c.type === 'Image') {
      c.props.format     = 'avif';
      c.props.fallback   = 'webp';
      c.props.srcset     = generateSrcSet(c.props.src);
      c.props.loading    = isAboveFold(c) ? 'eager' : 'lazy';
      c.props.decoding   = 'async';
      if (isAboveFold(c) && c.priority === 'high') addPreloadLink(project, c.props.src);
      if (!c.props.width || !c.props.height) inferDimensions(c);
    }
  });

  // FONTS
  for (const font of project.fonts) {
    font.display = 'swap';
    font.subset  = 'latin';
    if (font.role === 'display') addPreloadLink(project, font.url);
  }

  // JS — code split below-fold + non-critical
  for (const page of project.pages) {
    page.imports = page.imports.map(imp => {
      if (imp.component_zone === 'below_fold' || imp.component_size_kb > 30) {
        return { ...imp, mode: 'dynamic', ssr: imp.is_seo_critical };
      }
      return imp;
    });
  }

  // CSS — extract critical
  project.css.critical = extractCriticalCSS(project, ['hero', 'topbar', 'page_header']);
  project.css.async    = project.css.full;

  // 3RD-PARTY
  for (const script of project.scripts) {
    if (script.role === 'analytics') script.defer = true;
    if (script.role === 'tag_manager') script.async = true;
    if (script.role === 'chat_widget') script.lazy_after_idle = true;
  }

  return project;
}
```

---

## Audit on emit

```ts
function auditPerformance(project: ProjectArtifact): PerfAudit {
  return {
    estimated_lcp:    estimateLCP(project),
    estimated_cls:    estimateCLS(project),
    js_initial_kb:    sumInitialJS(project),
    css_initial_kb:   sumInitialCSS(project),
    image_optimized:  pctOfImagesOptimized(project),
    fonts_subset:     pctOfFontsSubset(project),
    violations:       findBudgetViolations(project, BUDGET),
  };
}
```

`violations.length > 0` → halt with fixable error. sage cannot approve PR.

---

## Cross-references

- elio design-stage budget gate: applied at brief intake (rejects designs that violate before build)
- bolt deploy-stage gate: applied at staging+prod deploy
- Existing perf KB: `~/.claude/memory/design/standards/performance.md`
- Hydrogen-specific image patterns: `~/.claude/memory/stacks/shopify/storefront/hydrogen-react-router-7.md`
