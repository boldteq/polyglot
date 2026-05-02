---
name: Pre-Deployment Validation Gates
description: Quality gates every Boldteq SaaS app must pass before deployment. Used by Sage (audit) and Bolt (deploy) agents. 10 gates + severity classification + automation checklist.
type: reference
priority: critical
---

# Pre-Deployment Validation Gates

Every Boldteq SaaS application must pass ALL 10 validation gates before shipping to production. These gates are enforced by **Sage** (pre-deploy audit agent) and **Bolt** (deploy agent). Failures block deployment with severity classification (BLOCKER, CRITICAL, MAJOR, MINOR).

This document is **not** an executable script — it defines the validation pipeline and criteria that Sage/Bolt follow during code review and pre-deploy verification.

---

## Gate 1: Build Validation

**Owner:** Sage (code quality audit) / Bolt (at deploy time)
**Trigger:** Every PR, mandatory before merge to `main`
**Block Deployment:** YES — any failure is a BLOCKER

### Automated Checks

```bash
# TypeScript strict mode compilation
npm run build

# Explicit type checking
npx tsc --noEmit --strict

# Linting with zero warnings allowed
npx eslint . --max-warnings 0

# Unused dependency detection
npx depcheck
```

### Manual Inspection by Sage

1. **Zero `any` types**
   - Search codebase: `grep -r "any" src/ --include="*.ts" --include="*.tsx"`
   - Exception: Only in vendored code or types.ts (auto-generated)
   - Severity: BLOCKER if found in production code

2. **No unused imports or variables**
   - TypeScript strict mode catches these
   - Severity: CRITICAL

3. **No console.log in production code**
   - Allowed: `console.error()` in try-catch blocks (logged to error tracking)
   - Search: `grep -r "console\.log" src/ --include="*.ts" --include="*.tsx"`
   - Severity: MAJOR (if shipped) or BLOCKER (in code review)

4. **All imports resolve correctly**
   - No broken relative paths (use `@/` alias instead)
   - Example BAD: `import { Thing } from '../../../lib/thing'`
   - Example GOOD: `import { Thing } from '@/lib/thing'`
   - Severity: BLOCKER

5. **No circular dependencies**
   - Tools: `npx depcheck` or manual inspection of import graphs
   - Severity: CRITICAL

6. **Environment variables properly typed**
   - All `process.env.*` accesses wrapped in runtime validation (Zod)
   - No hardcoded API keys, secrets, or URLs with credentials
   - Search: `process.env` should only appear in config files, not components
   - Severity: BLOCKER (security)

### Success Criteria

```
✓ npm run build succeeds with zero errors
✓ npx tsc --noEmit --strict exits with code 0
✓ npx eslint . --max-warnings 0 passes (zero warnings)
✓ No `any` types in production code
✓ No console.log in production code
✓ All imports resolve (no broken paths)
✓ No hardcoded secrets
```

---

## Gate 2: Test Validation

**Owner:** Luna (testing agent) / Sage (audit)
**Trigger:** Every PR
**Block Deployment:** YES — missing tests are BLOCKER

### Coverage Requirements

```bash
npm run test -- --coverage
```

**Minimum Thresholds:**
- **Statements:** 80%
- **Branches:** 70%
- **Functions:** 75%
- **Lines:** 80%

If coverage falls below thresholds, deployment is BLOCKED until tests are added.

### Critical Path Tests (Mandatory)

These flows MUST have integration tests (not unit tests):

1. **Authentication Flow**
   - Signup with email → verify email → login → access protected route
   - Forgot password flow
   - Session expiry and refresh token rotation
   - Logout clears session
   - Severity: BLOCKER if missing

2. **Billing Flow (if applicable)**
   - Create subscription → redirect to payment processor → webhook verification → credits applied
   - One-time purchase (credit pack) → verify credits added
   - Subscription cancellation → downgrade plan
   - Expired subscription detection and auto-downgrade
   - Severity: BLOCKER if missing

3. **Core Feature (Application Specific)**
   - Examples:
     - the project: Job creation → resume upload → ranking completion → view results
     - Email ingestion feature: inbound email → resume extraction → ranking queue
   - Severity: BLOCKER if missing

4. **Error Cases for All Above**
   - Network timeout → user sees error message
   - Invalid input → validation errors displayed
   - API 500 error → error boundary catches, logs to Sentry, user sees fallback UI
   - Severity: CRITICAL if missing

### Test Quality Requirements

1. **No skipped tests in CI**
   - Search: `grep -r "\.skip\|xit\|xdescribe" test/ spec/`
   - If found in CI, deployment BLOCKED (severity: BLOCKER)
   - Skipped tests are allowed locally for development but must be unskipped before PR

2. **All async tests have cleanup**
   - Every async test must have `await cleanup()` or equivalent
   - Mock timers: `vi.useFakeTimers()` → `vi.runAllTimers()` → `vi.useRealTimers()`
   - Event listeners: add → remove in cleanup
   - Severity: CRITICAL (flaky tests block team)

3. **Tests are deterministic**
   - No random delays, no timing-dependent assertions
   - No global state that bleeds between tests
   - Use test isolation (beforeEach/afterEach)
   - Severity: CRITICAL

4. **Mock external services**
   - Never hit real APIs in tests (OpenAI, Supabase, Dodo Payments, etc.)
   - Use `vi.mock()` or MSW (Mock Service Worker)
   - Severity: CRITICAL (prevents test flakiness)

5. **E2E Tests for Critical Flows (Optional but Recommended)**
   - Tools: Playwright or Cypress
   - Cover: homepage → signup → dashboard → core feature
   - Severity: MAJOR (if API contracts are unstable)

### Success Criteria

```
✓ npm run test -- --coverage passes with required thresholds
✓ No skipped tests (no .skip, xit, xdescribe)
✓ Critical path tests exist: auth, billing (if applicable), core feature
✓ All async tests have cleanup
✓ No flaky tests (deterministic, properly mocked)
✓ Coverage report shows ≥80% statements, ≥70% branches
```

---

## Gate 3: Accessibility Validation

**Owner:** Sage (a11y audit) / Luna (testing)
**Trigger:** Every feature + pre-deploy
**Block Deployment:** CRITICAL violations = BLOCKER

### Automated Checks

```bash
# Axe-core accessibility audit
npx axe-core --tags wcag2a,wcag2aa --exit-code 2

# Or via Lighthouse
npx lighthouse --only-categories=accessibility --output=json
```

### Manual Checklist (Sage Audits Every Component)

1. **Images**
   - [ ] Every `<img>` has `alt` text (not empty, descriptive of content)
   - [ ] Decorative images: `alt=""` (hidden from screen readers)
   - [ ] Complex images (charts, graphs): longer description or data table fallback
   - [ ] SVG icons: `aria-hidden="true"` or labeled
   - Severity: CRITICAL if missing

2. **Form Inputs**
   - [ ] Every `<input>`, `<select>`, `<textarea>` has associated `<label>`
   - [ ] Labels use `htmlFor` pointing to input `id`
   - [ ] Error messages linked with `aria-describedby`
   - [ ] Required fields marked: `required` attribute or `aria-required="true"`
   - Example:
     ```tsx
     <label htmlFor="email">Email *</label>
     <input id="email" type="email" required aria-describedby="email-error" />
     {error && <span id="email-error" className="text-red-600">{error}</span>}
     ```
   - Severity: CRITICAL if missing

3. **Color Contrast**
   - [ ] Text: 4.5:1 contrast ratio (normal text, WCAG AA)
   - [ ] Large text (18pt+): 3:1 contrast ratio
   - [ ] UI components (buttons, borders): 3:1 contrast ratio
   - Test with: WebAIM Contrast Checker, Chrome DevTools
   - Severity: CRITICAL

4. **Keyboard Navigation**
   - [ ] All interactive elements reachable via Tab key
   - [ ] Tab order logical (left-to-right, top-to-bottom)
   - [ ] No keyboard traps (user can tab out of any element)
   - [ ] Enter/Space activates buttons
   - [ ] Escape closes modals, dropdowns
   - [ ] Focus visible on all interactive elements (outline or highlight)
   - Test: Use keyboard only to navigate (no mouse)
   - Severity: CRITICAL

5. **Focus Management**
   - [ ] Focus visible on all interactive elements (never `outline: none` without replacement)
   - [ ] Modal: focus trapped inside, returns to trigger on close
   - [ ] Dropdown: focus moves into dropdown on open, returns to trigger on close
   - [ ] Skip link present on every page (skip to main content)
   - Example:
     ```tsx
     <a href="#main" className="sr-only focus:not-sr-only">
       Skip to main content
     </a>
     ```
   - Severity: CRITICAL

6. **Semantic HTML**
   - [ ] Use `<button>` for buttons (not `<div onclick>`)
   - [ ] Use `<a>` for links (not `<button>` with onClick navigation)
   - [ ] Use `<nav>`, `<main>`, `<section>`, `<article>` for structure
   - [ ] Use `<h1>-<h6>` for headings (correct hierarchy, no skipped levels)
   - Severity: MAJOR

7. **ARIA Labels (Only When Semantic HTML Insufficient)**
   - [ ] `aria-label` on icons without text: `<button aria-label="Close menu">`
   - [ ] `aria-hidden="true"` on decorative icons in shadcn components
   - [ ] `role="dialog"` + `aria-modal="true"` on modals
   - [ ] `role="tablist"`, `role="tab"`, `role="tabpanel"` on tab components
   - [ ] Never use ARIA to fix bad HTML (semantic HTML first)
   - Severity: MAJOR if missing

8. **Text Sizing**
   - [ ] Font size ≥ 14px (readable without magnification)
   - [ ] Line height ≥ 1.5 (spacing between lines)
   - [ ] Paragraph width ≤ 80 characters (line length)
   - [ ] User can zoom to 200% without horizontal scroll
   - Severity: MAJOR

9. **Motion & Animation**
   - [ ] Respects `prefers-reduced-motion` CSS media query
   - [ ] No auto-playing videos with sound
   - [ ] No flashing/strobing content (prevents seizures)
   - Example:
     ```css
     @media (prefers-reduced-motion: reduce) {
       * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
     }
     ```
   - Severity: CRITICAL

10. **Page Structure**
    - [ ] One `<h1>` per page (main page title)
    - [ ] Heading hierarchy correct (no skipping: h1 → h2 → h3)
    - [ ] `<main>` landmark identifies primary content
    - [ ] `<nav>` landmarks for navigation regions
    - [ ] `<header>` and `<footer>` present for page structure
    - Severity: MAJOR

### Success Criteria

```
✓ Lighthouse accessibility score ≥ 90
✓ npx axe-core reports zero CRITICAL violations
✓ All images have alt text
✓ All form inputs have labels
✓ Color contrast ≥ 4.5:1 (normal text)
✓ Keyboard navigation works (Tab, Enter, Escape)
✓ Focus visible on all interactive elements
✓ Respects prefers-reduced-motion
✓ One H1 per page, correct heading hierarchy
✓ Semantic HTML (button, a, nav, main, article)
```

---

## Gate 4: Performance Validation

**Owner:** Sage (performance audit) / Luna (monitoring)
**Trigger:** Every PR + daily monitoring in production
**Block Deployment:** LCP/CLS regression > 10% = BLOCKER

### Automated Checks

```bash
# Lighthouse performance audit
npx lighthouse --only-categories=performance --output=json --output-path=./lighthouse-report.json

# Bundle size analysis
npx webpack-bundle-analyzer dist/bundle.js

# Lighthouse via CLI (all metrics)
npx lighthouse https://[staging-url] --view
```

### Core Web Vitals (Required)

These are Google-tracked metrics. Production must stay green.

1. **LCP (Largest Contentful Paint)**
   - Target: < 2.5s (Good)
   - Threshold: < 4.0s (Acceptable)
   - Failure: > 4.0s = BLOCKER
   - Common causes:
     - Large unoptimized images
     - Render-blocking JavaScript
     - Slow API responses
   - Fixes:
     - Use `next/image` with `priority` for above-fold images
     - Code-split heavy components with dynamic import
     - Preload critical fonts with `<link rel="preload">`
   - Severity: BLOCKER if > 4.0s

2. **CLS (Cumulative Layout Shift)**
   - Target: < 0.1 (Good)
   - Threshold: < 0.25 (Acceptable)
   - Failure: > 0.25 = BLOCKER
   - Common causes:
     - Images without width/height
     - Ads or embeds without reserved space
     - Injected DOM elements
     - Fonts loading and causing text reflow
   - Fixes:
     - Set `width` and `height` on all images
     - Reserve space for dynamic content with skeleton loaders
     - Use `font-display: swap` for custom fonts
   - Severity: BLOCKER if > 0.25

3. **INP (Interaction to Next Paint)** *(formerly FID)*
   - Target: < 200ms (Good)
   - Threshold: < 500ms (Acceptable)
   - Failure: > 500ms = BLOCKER
   - Common causes:
     - Long JavaScript execution on main thread
     - Heavy rendering (large DOM trees)
     - Unoptimized event handlers
   - Fixes:
     - Break up long tasks with `setTimeout(..., 0)`
     - Virtualize long lists (windowing)
     - Debounce expensive handlers
   - Severity: BLOCKER if > 500ms in production

### Lighthouse Score

```bash
npx lighthouse [URL] --only-categories=performance --output=json | jq '.lighthouseResult.categories.performance.score'
```

- Target: ≥ 90
- Threshold: ≥ 80
- Failure: < 80 = BLOCKER

### Bundle Size

- Target: < 250KB (gzipped total)
- Threshold: < 300KB
- Failure: > 300KB = CRITICAL

Analyze with:
```bash
npm run build
npm ls -la dist/
gzip -l dist/*.js
```

### Additional Performance Checks

1. **Images**
   - [ ] All images optimized (WebP/AVIF formats)
   - [ ] Responsive images with `srcset` for different screen sizes
   - [ ] Lazy loading: `loading="lazy"` on below-fold images
   - [ ] SVGs minified
   - Severity: MAJOR

2. **Fonts**
   - [ ] System fonts OR preloaded custom fonts
   - [ ] Font files < 100KB per weight
   - [ ] `font-display: swap` (don't block rendering)
   - [ ] No more than 2 font weights
   - Severity: MAJOR

3. **JavaScript**
   - [ ] No render-blocking scripts
   - [ ] Code-split for routes (React Router)
   - [ ] Code-split heavy components (Suspense, dynamic import)
   - [ ] No unused polyfills
   - Severity: MAJOR

4. **CSS**
   - [ ] No unused CSS (purge with Tailwind)
   - [ ] CSS < 50KB (gzipped)
   - [ ] Critical CSS inlined in `<head>` (if applicable)
   - Severity: MINOR

5. **Third-Party Scripts**
   - [ ] Analytics (Google Analytics, Segment) loaded async
   - [ ] Ads, embeds, iframes below fold
   - [ ] No trackers in critical path
   - Severity: MAJOR

### Success Criteria

```
✓ Lighthouse performance score ≥ 80
✓ LCP < 2.5s (or < 4.0s maximum)
✓ CLS < 0.1 (or < 0.25 maximum)
✓ INP < 200ms (or < 500ms maximum)
✓ Bundle size < 300KB (gzipped)
✓ All images optimized (WebP/AVIF)
✓ Fonts preloaded, font-display: swap
✓ Code-split for routes and heavy components
✓ No render-blocking scripts
✓ No unused CSS or JavaScript
```

---

## Gate 5: Security Validation

**Owner:** Sage (security audit)
**Trigger:** Every PR + pre-deploy
**Block Deployment:** BLOCKER for any critical vulnerability

### Automated Checks

```bash
# Dependency vulnerability scan
npm audit --audit-level=high

# Additional security scanning
npx snyk test
npx secretlint '**/*' --secretlintrc .secretlintrc.json
```

### Manual Inspection by Sage

1. **Secrets Management**
   - [ ] No API keys, passwords, or tokens in code
   - [ ] All secrets in `.env` files (`.env` files in `.gitignore`)
   - [ ] Production secrets in environment variables only (never committed)
   - Search for common patterns:
     ```bash
     grep -r "NEXT_PUBLIC_" src/ # These are public — should contain no secrets
     grep -r "api_key\|apiKey\|password\|token" src/ --include="*.ts" --include="*.tsx"
     ```
   - Severity: BLOCKER

2. **Authentication & Authorization**
   - [ ] Auth checked on server-side (not client-side only)
   - [ ] Protected routes have `ProtectedRoute` wrapper or server-side guard
   - [ ] Session tokens secure: httpOnly, Secure, SameSite flags set
   - [ ] MFA implemented (if high-security app)
   - [ ] Password reset tokens expire after 1 hour
   - [ ] Email verification enforced (before account activation)
   - [ ] Logout clears all session data
   - Severity: BLOCKER if missing

3. **Input Validation**
   - [ ] All API endpoints validate input with Zod or similar schema validator
   - [ ] File uploads: check file type (MIME type + magic bytes), max size enforced
   - [ ] No `eval()`, `new Function()`, or dynamic code execution
   - Example:
     ```tsx
     // BAD
     const result = eval(userInput);

     // GOOD
     const schema = z.object({ email: z.string().email() });
     const data = schema.parse(userInput); // Throws if invalid
     ```
   - Severity: BLOCKER

4. **SQL Injection Prevention**
   - [ ] ORM used (Prisma, Supabase client) — no raw SQL strings with interpolation
   - [ ] Parameterized queries only
   - [ ] RLS (Row-Level Security) policies on every table (Stack A/C)
   - Example (Supabase RLS):
     ```sql
     CREATE POLICY "Users can read own data"
       ON profiles
       FOR SELECT
       USING (auth.uid() = user_id);
     ```
   - Severity: BLOCKER

5. **XSS Prevention (Cross-Site Scripting)**
   - [ ] No `dangerouslySetInnerHTML` in user-editable content
   - [ ] If `dangerouslySetInnerHTML` necessary, HTML sanitized with `sanitize-html` or DOMPurify
   - [ ] React auto-escapes values in templates (safe by default)
   - [ ] No `eval()` or dynamic script injection
   - Example:
     ```tsx
     // BAD
     <div dangerouslySetInnerHTML={{ __html: userContent }} />

     // GOOD
     import sanitizeHtml from 'sanitize-html';
     <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userContent) }} />
     ```
   - Severity: BLOCKER

6. **CSRF Protection (Cross-Site Request Forgery)**
   - [ ] State-changing mutations (POST, PUT, DELETE) verify origin
   - [ ] If using cookies: SameSite=Strict or CSRF tokens
   - [ ] Supabase: session tokens are verified automatically
   - [ ] API endpoints check `Authorization` header (Bearer token)
   - Severity: CRITICAL

7. **Content Security Policy (CSP)**
   - [ ] CSP header set on all responses
   - [ ] Restricts script sources: `script-src 'self'` (no inline scripts)
   - [ ] Restricts frame sources: `frame-ancestors 'none'` (unless embedded)
   - Example header:
     ```
     Content-Security-Policy:
       default-src 'self';
       script-src 'self' https://cdn.example.com;
       style-src 'self' 'unsafe-inline';
       img-src 'self' data: https:;
       font-src 'self';
       frame-ancestors 'none';
     ```
   - Severity: MAJOR

8. **HTTPS/SSL**
   - [ ] All endpoints HTTPS only (no HTTP fallback)
   - [ ] SSL certificate valid and not expired
   - [ ] HSTS header set: `Strict-Transport-Security: max-age=31536000`
   - Severity: BLOCKER

9. **Rate Limiting**
   - [ ] Auth endpoints (login, signup, password reset) rate-limited (e.g., 5 attempts per 15 minutes)
   - [ ] API endpoints rate-limited per user (if applicable)
   - [ ] Public endpoints rate-limited to prevent abuse
   - Severity: CRITICAL

10. **Error Messages**
    - [ ] Error messages don't leak sensitive info (e.g., "User not found" vs "Email or password incorrect")
    - [ ] Stack traces not exposed to clients
    - [ ] 500 errors logged to Sentry but show generic message to user
    - Severity: MAJOR

11. **Database Hardening**
    - [ ] Database password ≥ 32 characters, random
    - [ ] Database accessible only from app (firewall rules)
    - [ ] Backups encrypted at rest
    - [ ] No test/dummy data in production database
    - Severity: BLOCKER

12. **Dependencies**
    - [ ] No high/critical vulnerabilities: `npm audit --audit-level=high`
    - [ ] Dependencies up-to-date (check monthly)
    - [ ] No abandoned packages (check maintenance status)
    - Severity: CRITICAL

### Success Criteria

```
✓ npm audit shows no high/critical vulnerabilities
✓ npx snyk test passes
✓ No API keys, passwords, or tokens in code
✓ Auth checked server-side on protected routes
✓ All API endpoints validate input (Zod)
✓ RLS policies on all tables (Stack A/C)
✓ No XSS vulnerabilities (no unsafe innerHTML)
✓ CSRF protection on mutations
✓ CSP headers configured
✓ HTTPS enforced, HSTS header set
✓ Rate limiting on auth endpoints
✓ Error messages don't leak sensitive info
```

---

## Gate 6: SEO Validation (Public Pages Only)

**Owner:** Zeph (SEO agent)
**Trigger:** Before public launch + pre-deploy
**Block Deployment:** Missing critical tags = CRITICAL (affects search ranking)

### Prerequisites

This gate applies to **public-facing pages only** (landing page, blog, docs, etc.).
Dashboard/app pages (behind auth) are skipped.

### On-Page SEO

1. **Title Tags**
   - [ ] Every public page has unique `<title>` tag
   - [ ] Length: 50-60 characters (fits in Google SERP)
   - [ ] Primary keyword first
   - [ ] Brand name last (optional)
   - Example: `"Resume Ranking Software for Recruiters | [AppName]"`
   - Severity: BLOCKER

2. **Meta Descriptions**
   - [ ] Every public page has unique `<meta name="description">`
   - [ ] Length: 150-160 characters (fits in Google SERP)
   - [ ] Includes primary keyword
   - [ ] Includes CTA (action verb)
   - Example: `"Score resumes against job requirements using AI. Rank top candidates in seconds. Try free."`
   - Severity: BLOCKER

3. **Heading Hierarchy**
   - [ ] Exactly one `<h1>` per page (main topic)
   - [ ] Contains primary keyword
   - [ ] No skipped heading levels (h1 → h2 → h3, not h1 → h3)
   - [ ] Subsequent headings follow logical hierarchy
   - Severity: CRITICAL

4. **Canonical URLs**
   - [ ] Every public page has `<link rel="canonical">` pointing to preferred URL
   - [ ] Prevents duplicate content issues
   - [ ] Especially important for pages with query parameters (e.g., `?utm_source=...`)
   - Example: `<link rel="canonical" href="https://rankora.com/pricing" />`
   - Severity: CRITICAL

5. **Images**
   - [ ] Every image has descriptive `alt` text (includes keyword if relevant)
   - [ ] Images use modern formats (WebP/AVIF with JPEG fallback)
   - [ ] Images optimized and compressed
   - [ ] Lazy loading on below-fold images: `loading="lazy"`
   - Severity: MAJOR

### Technical SEO

6. **XML Sitemap**
   - [ ] Sitemap generated and available at `/sitemap.xml`
   - [ ] Contains all public pages (not auth-required)
   - [ ] Excludes duplicate/canonical variants
   - [ ] Updated automatically (dynamic)
   - [ ] Submitted to Google Search Console
   - Example:
     ```xml
     <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       <url>
         <loc>https://rankora.com/</loc>
         <lastmod>2026-04-04</lastmod>
         <changefreq>weekly</changefreq>
         <priority>1.0</priority>
       </url>
       ...
     </urlset>
     ```
   - Severity: CRITICAL

7. **Robots.txt**
   - [ ] File at `/robots.txt`
   - [ ] Blocks crawling of: `/dashboard`, `/app`, `/api`, `/admin`, `/auth`
   - [ ] Allows crawling of public pages
   - [ ] Includes reference to sitemap
   - Example:
     ```
     User-agent: *
     Disallow: /dashboard
     Disallow: /app
     Disallow: /api
     Disallow: /admin
     Allow: /

     Sitemap: https://rankora.com/sitemap.xml
     ```
   - Severity: CRITICAL

8. **Structured Data (JSON-LD)**
   - [ ] Homepage: Organization schema (name, logo, contact, social)
   - [ ] Pricing page: Product/Offer schema with price
   - [ ] Blog posts: Article schema (headline, image, datePublished, author)
   - [ ] Validates at `schema.org` without errors
   - Example:
     ```json
     {
       "@context": "https://schema.org",
       "@type": "SoftwareApplication",
       "name": "the project",
       "applicationCategory": "BusinessApplication",
       "url": "https://rankora.com",
       "aggregateRating": {
         "@type": "AggregateRating",
         "ratingValue": "4.8",
         "ratingCount": "250"
       }
     }
     ```
   - Severity: MAJOR

9. **Open Graph & Twitter Meta Tags**
   - [ ] `og:title`, `og:description`, `og:image` on all public pages
   - [ ] `og:image` size: 1200x630px (minimum), optimized
   - [ ] `twitter:card` (summary_large_image recommended)
   - [ ] `twitter:creator` (optional)
   - Example:
     ```html
     <meta property="og:title" content="Resume Ranking Software for Recruiters" />
     <meta property="og:description" content="Score and rank resumes using AI. Try free." />
     <meta property="og:image" content="https://rankora.com/og-image.png" />
     <meta property="og:url" content="https://rankora.com" />
     <meta name="twitter:card" content="summary_large_image" />
     ```
   - Severity: MAJOR

10. **Mobile Responsiveness**
    - [ ] All public pages responsive at 375px, 768px, 1024px, 1440px
    - [ ] Viewport meta tag set: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
    - [ ] No horizontal scroll on mobile
    - [ ] Touch targets ≥ 48x48px (mobile accessibility)
    - Severity: CRITICAL (affects rankings)

### Content Quality

11. **Keyword Optimization**
    - [ ] Primary keyword appears in: title, h1, first paragraph, 2-3x in body
    - [ ] LSI keywords (related terms) naturally woven in
    - [ ] Keyword density 0.5-2% (natural reading)
    - [ ] No keyword stuffing
    - Severity: MAJOR

12. **Content Length**
    - [ ] Landing page: ≥ 500 words
    - [ ] Product page: ≥ 800 words
    - [ ] Blog post: ≥ 1500 words
    - [ ] Minimum readability score: Flesch-Kincaid 10th grade
    - Severity: MAJOR

13. **Internal Linking**
    - [ ] Every public page reachable within 3 clicks from homepage
    - [ ] Anchor text descriptive (not "click here")
    - [ ] Related pages linked contextually
    - Example:
      ```html
      <!-- GOOD -->
      <a href="/pricing">View our pricing plans</a>

      <!-- BAD -->
      <a href="/pricing">Click here</a>
      ```
    - Severity: MAJOR

14. **No Broken Links**
    - [ ] Internal links point to valid pages (no 404s)
    - [ ] External links to authoritative sources (no spam)
    - [ ] Tools: `npx broken-link-checker --recursive [url]`
    - Severity: CRITICAL

### Performance (Covered in Gate 4, Reinforced Here)

15. **Core Web Vitals**
    - [ ] LCP < 2.5s
    - [ ] CLS < 0.1
    - [ ] INP < 200ms
    - These directly affect Google ranking
    - Severity: CRITICAL

### Pre-Launch Checklist (Zeph)

- [ ] All public pages have title + meta description
- [ ] H1 hierarchy correct (one H1 per page, no skips)
- [ ] Canonical URLs set
- [ ] Sitemap generated and valid
- [ ] robots.txt configured
- [ ] Structured data validates (JSON-LD)
- [ ] Open Graph tags on key pages
- [ ] Mobile responsive (3 breakpoints tested)
- [ ] Core Web Vitals green
- [ ] No broken internal links
- [ ] Google Search Console property verified
- [ ] Sitemap submitted to GSC
- [ ] Google Analytics configured
- [ ] robots.txt submitted to GSC

### Success Criteria

```
✓ Every public page has unique title + meta description
✓ One H1 per page, correct heading hierarchy
✓ Canonical URLs on all pages
✓ Sitemap valid and submitted to GSC
✓ robots.txt blocks /dashboard, /api, /admin
✓ Structured data validates (schema.org)
✓ Open Graph tags on key pages (og:title, og:image, og:description)
✓ All public pages mobile responsive
✓ Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
✓ No broken internal links
✓ Internal linking: all pages reachable within 3 clicks from homepage
```

---

## Gate 7: UI/UX Validation

**Owner:** Sage (design audit)
**Trigger:** Every component + pre-deploy
**Block Deployment:** Missing loading/empty/error states = CRITICAL

### State Coverage

Every page and component that displays data or performs an action must have these states:

1. **Loading State**
   - [ ] Skeleton loaders OR spinners while data fetches
   - [ ] Respects `prefers-reduced-motion` (no animation if user prefers)
   - [ ] Text message: "Loading..." or equivalent
   - [ ] No layout shift when skeleton hides and real content appears
   - Example:
     ```tsx
     {isLoading ? <Skeleton /> : <DataTable data={data} />}
     ```
   - Severity: CRITICAL

2. **Empty State**
   - [ ] Designed screen when no data exists (not blank page)
   - [ ] Icon + heading + description + CTA
   - [ ] Example: "No resumes yet. Upload your first resume to get started."
   - [ ] CTA directs user to next action
   - Example:
     ```tsx
     {results.length === 0 ? <EmptyState /> : <ResultsList />}
     ```
   - Severity: CRITICAL

3. **Error State**
   - [ ] Network error: "Something went wrong. Please try again." + Retry button
   - [ ] Validation error: Field-level error message under input
   - [ ] 404: "Page not found" with link to homepage
   - [ ] 500: "Server error" with error ID for support
   - [ ] Logged to error tracking (Sentry)
   - Example:
     ```tsx
     {error ? (
       <ErrorBoundary error={error} onRetry={refetch} />
     ) : (
       <ResultsList data={data} />
     )}
     ```
   - Severity: CRITICAL

4. **Success State**
   - [ ] Data displays correctly
   - [ ] Toast notification: "Action successful" (auto-dismiss after 3s)
   - [ ] Optional: Confetti animation or success icon
   - Example:
     ```tsx
     {showSuccess && <Toast type="success">Resume uploaded!</Toast>}
     ```
   - Severity: MAJOR

### Responsiveness

5. **Mobile (375px)**
   - [ ] Readable without zoom
   - [ ] Touch targets ≥ 48x48px
   - [ ] No horizontal scroll
   - [ ] Stacked layout (single column)
   - [ ] Navigation drawer or hamburger menu
   - Severity: CRITICAL

6. **Tablet (768px)**
   - [ ] 2-column layout where appropriate
   - [ ] Touch targets comfortable
   - [ ] Sidebar may collapse
   - Severity: CRITICAL

7. **Desktop (1024px+)**
   - [ ] Full layout with sidebar
   - [ ] Multi-column grids
   - [ ] Mouse interactions (hover states)
   - Severity: CRITICAL

### Dark Mode

8. **Dark Mode Support**
   - [ ] All pages and components tested in dark mode
   - [ ] Colors adapt (use CSS variables or Tailwind dark prefix)
   - [ ] Contrast maintained (4.5:1 minimum)
   - [ ] No hardcoded colors in component styles
   - [ ] Images/logos have light and dark variants if needed
   - Example:
     ```tsx
     <div className="bg-white dark:bg-slate-900 text-black dark:text-white">
     ```
   - Severity: MAJOR

### Interactions & Feedback

9. **Button States**
   - [ ] Default state (normal appearance)
   - [ ] Hover state (visual change)
   - [ ] Active state (pressed appearance)
   - [ ] Disabled state (grayed out, no interaction)
   - [ ] Loading state (spinner or disable with text)
   - Example:
     ```tsx
     <button
       disabled={isLoading || !isFormValid}
       className="hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50"
     >
       {isLoading ? 'Saving...' : 'Save'}
     </button>
     ```
   - Severity: MAJOR

10. **Form Validation**
    - [ ] Real-time validation feedback (as user types or on blur)
    - [ ] Error message below field: "`Email is invalid`"
    - [ ] Field border changes color on error (red)
    - [ ] Success checkmark on valid fields (optional)
    - [ ] Submit button disabled until form valid
    - Example:
      ```tsx
      <input
        onChange={handleChange}
        className={error ? 'border-red-600' : 'border-gray-300'}
      />
      {error && <span className="text-red-600">{error}</span>}
      ```
    - Severity: CRITICAL

11. **Toasts/Notifications**
    - [ ] Success toast on successful action
    - [ ] Error toast on failure
    - [ ] Auto-dismiss after 3-5 seconds
    - [ ] User can dismiss manually
    - [ ] No more than 2 toasts visible at once
    - [ ] Use Sonner library (Stack A standard)
    - Severity: MAJOR

12. **Modal/Dialog Behavior**
    - [ ] Modal appears with animation (fade in, scale)
    - [ ] Backdrop click closes modal (if not destructive)
    - [ ] Escape key closes modal
    - [ ] Focus trapped inside modal (accessibility)
    - [ ] Title + description + actions (OK/Cancel buttons)
    - [ ] Destructive action confirmed (e.g., delete requires "Are you sure?")
    - Severity: MAJOR

13. **Loading Indicators**
    - [ ] Page/route load: skeleton loaders (preferred) or full-page spinner
    - [ ] Async action: inline spinner + disable button
    - [ ] Polling (e.g., ranking status): spinner + status text ("Analyzing resumes...")
    - [ ] Never show spinner without context (what's loading?)
    - Severity: MAJOR

### Typography & Spacing

14. **Typography Hierarchy**
   - [ ] One font family max (system font or 1 custom font)
   - [ ] 4-5 font sizes max: h1, h2, h3, body, small
   - [ ] Font sizes follow semantic scale (18, 16, 14, 12px)
   - [ ] Line height ≥ 1.5 (legibility)
   - [ ] Letter-spacing consistent
   - Severity: MAJOR

15. **Spacing & Layout**
    - [ ] Whitespace consistent (use design tokens: 4px, 8px, 16px, 24px, 32px)
    - [ ] No content crammed together
    - [ ] Margins/padding follow rhythm (multiples of 4px)
    - [ ] Grid-based layout (baseline grid)
    - [ ] No random spacing
    - Severity: MAJOR

### Colors & Contrast

16. **Color System**
    - [ ] Limited palette (5-7 primary colors)
    - [ ] Semantic colors: success (green), error (red), warning (yellow), info (blue)
    - [ ] Brand colors consistent
    - [ ] Use CSS variables or Tailwind tokens (no hardcoded hex)
    - [ ] Color meanings consistent (red = error, green = success)
    - Severity: MAJOR

17. **Contrast**
    - [ ] Text: 4.5:1 contrast (WCAG AA)
    - [ ] UI components: 3:1 contrast
    - [ ] Never rely on color alone (use icons, text, patterns)
    - [ ] Verified with: WebAIM Contrast Checker or Chrome DevTools
    - Severity: CRITICAL

### Animations

18. **Micro-interactions**
    - [ ] Button hover: subtle color change (not jarring)
    - [ ] Menu slide-in: smooth 200-300ms animation
    - [ ] Fade transitions: 150-200ms
    - [ ] Staggered list animations (if many items appear)
    - [ ] Respects `prefers-reduced-motion` (disable on preference)
    - [ ] No auto-play videos or excessive motion
    - Severity: MINOR (polish)

### Consistency

19. **Design System Adherence**
    - [ ] All components use shadcn/ui or app-specific components
    - [ ] No inline styles or utility class chaos
    - [ ] Consistent button, input, card, badge styles
    - [ ] Icons from Lucide React, consistent strokeWidth (1.75)
    - [ ] No one-off custom designs that don't match system
    - Severity: MAJOR

20. **No Layout Shift**
    - [ ] CLS < 0.1 (measured by Lighthouse)
    - [ ] Content doesn't jump when loading state → real data
    - [ ] Images have width/height attributes or aspect-ratio CSS
    - [ ] Fixed header doesn't push content
    - Severity: CRITICAL

### Success Criteria

```
✓ All data-dependent screens have: loading, empty, error states
✓ Responsive at 375px, 768px, 1024px, 1440px
✓ Dark mode works on all pages
✓ Button states: default, hover, active, disabled, loading
✓ Form validation real-time with error messages
✓ Toasts for success/error (auto-dismiss)
✓ Modals: Escape closes, focus trapped, backdrop click works
✓ Typography: 1 font, 4-5 sizes, line-height ≥ 1.5
✓ Spacing consistent (multiples of 4px or 8px)
✓ Color contrast ≥ 4.5:1 (text), ≥ 3:1 (UI)
✓ CLS < 0.1 (no layout shift)
✓ Animations smooth, respect prefers-reduced-motion
✓ Design system consistent (shadcn/ui + app components)
```

---

## Gate 8: Database Validation

**Owner:** Sage (data integrity audit)
**Trigger:** Every schema change + pre-deploy
**Block Deployment:** RLS gaps = BLOCKER, migration issues = BLOCKER

### Migrations

1. **Migration Hygiene**
   - [ ] Every schema change is a migration file (versioned)
   - [ ] Migration files timestamped: `YYYYMMDDHHMMSS_description.sql` (Stack A-Lovable)
   - [ ] Or sequentially numbered: `001_init.sql`, `002_add_users.sql` (Stack B)
   - [ ] Migrations are idempotent (safe to run twice)
   - [ ] Includes both UP and DOWN migrations (rollback capability)
   - Example:
     ```sql
     -- UP: migrations/20260404100000_add_profiles.sql
     CREATE TABLE profiles (
       id UUID PRIMARY KEY,
       user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
       email TEXT NOT NULL UNIQUE,
       created_at TIMESTAMP DEFAULT NOW()
     );

     -- DOWN: migrations/20260404100000_add_profiles.sql
     DROP TABLE profiles;
     ```
   - Severity: CRITICAL

2. **Migration Testing**
   - [ ] Run on fresh database: `supabase db reset` (should complete without error)
   - [ ] Run on production-like database: confirm no data loss
   - [ ] Rollback tested: run DOWN migration and verify success
   - [ ] No manual data fixes needed post-migration
   - Severity: CRITICAL

### Row-Level Security (RLS)

3. **RLS Policies on Every Table** (Stack A/C)
   - [ ] Every table has RLS enabled: `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;`
   - [ ] SELECT policy: users see only their own data
   - [ ] INSERT policy: users can only insert their own rows
   - [ ] UPDATE policy: users can only update their own rows
   - [ ] DELETE policy: users can only delete their own rows
   - [ ] Admin policies allow full access (for admin panel)
   - Example:
     ```sql
     CREATE POLICY "Users can read own profiles"
       ON profiles
       FOR SELECT
       USING (auth.uid() = user_id);

     CREATE POLICY "Users can update own profiles"
       ON profiles
       FOR UPDATE
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);
     ```
   - Severity: BLOCKER (security vulnerability if missing)

4. **RLS Policy Testing**
   - [ ] Test each policy: User A cannot read User B's data
   - [ ] Test: Unauthenticated user cannot access any data
   - [ ] Test: Admin user can read all data
   - [ ] Manual testing in Supabase UI or programmatically
   - Severity: CRITICAL

### Data Integrity

5. **Foreign Keys**
   - [ ] Every relationship has a foreign key constraint
   - [ ] CASCADE delete for owned records (e.g., user owns jobs)
   - [ ] RESTRICT delete for shared records (e.g., can't delete plan if users subscribed)
   - [ ] No orphaned records possible
   - Example:
     ```sql
     CREATE TABLE jobs (
       id UUID PRIMARY KEY,
       user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE
     );
     ```
   - Severity: CRITICAL

6. **Indexes**
   - [ ] Indexes on frequently queried columns: `WHERE`, `JOIN`, `ORDER BY`
   - [ ] Composite indexes for common filters
   - [ ] Don't over-index (slows writes)
   - [ ] Example: Job list filtered by user_id → index on `(user_id, created_at DESC)`
   - Severity: MAJOR (performance impact)

7. **No N+1 Queries**
   - [ ] Each feature query: identify all queries needed
   - [ ] Use joins, not separate queries in loops
   - [ ] Example (bad): fetch job → loop: fetch resumes for each job
   - [ ] Example (good): join jobs + resumes in single query
   - [ ] React Query pagination: `useQuery` fetches all data once, not page-by-page
   - Severity: MAJOR (performance)

8. **Soft Delete Where Needed**
   - [ ] Audit data (users, payments): soft delete with `deleted_at` column
   - [ ] Transient data (job rankings): hard delete is OK
   - [ ] Example:
     ```sql
     ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;

     CREATE POLICY "Show active users"
       ON users
       FOR SELECT
       USING (deleted_at IS NULL);
     ```
   - Severity: MAJOR (data retention)

9. **No Data Loss**
   - [ ] Backups enabled (daily for production)
   - [ ] Point-in-time recovery available
   - [ ] Test backup restore procedure
   - [ ] Retention policy: ≥ 30 days
   - Severity: CRITICAL (business continuity)

### Supabase-Specific (Stack A/C)

10. **Auto-generated Types**
    - [ ] Run: `supabase gen types typescript > src/integrations/supabase/types.ts`
    - [ ] Never manually edit types.ts
    - [ ] Types include all tables, enums, functions
    - [ ] Commit updated types.ts after schema changes
    - Severity: MAJOR (type safety)

### Success Criteria

```
✓ All schema changes are migrations (versioned with timestamps)
✓ Migrations run cleanly on empty database
✓ RLS enabled on every table
✓ RLS policies tested: user isolation verified
✓ Foreign keys on all relationships (CASCADE/RESTRICT appropriate)
✓ Indexes on query hotspots (user_id, created_at, status)
✓ No N+1 queries in critical paths
✓ Soft delete for audit data (deleted_at column)
✓ Backups enabled and tested
✓ Auto-generated types up-to-date
```

---

## Gate 9: Pre-Deploy Checklist

**Owner:** Sage + Bolt (deploy agent)
**Trigger:** Before every production deployment
**Block Deployment:** Unchecked items = BLOCKER

Use this checklist 24 hours before deploy:

### Gates Passed
- [ ] Gate 1: Build validation (npm run build, tsc, eslint)
- [ ] Gate 2: Test validation (coverage, critical paths)
- [ ] Gate 3: Accessibility validation (Lighthouse ≥90, no critical violations)
- [ ] Gate 4: Performance validation (LCP < 2.5s, CLS < 0.1)
- [ ] Gate 5: Security validation (no vulns, auth enforced, RLS policies)
- [ ] Gate 6: SEO validation (if public pages)
- [ ] Gate 7: UI/UX validation (loading, empty, error states)
- [ ] Gate 8: Database validation (migrations, RLS, foreign keys)

### Configuration
- [ ] All environment variables set in production
  - Production variables are different from staging (API keys, URLs, analytics tokens)
  - Secrets are in environment (never in code)
- [ ] Database connection strings verified (production database, not staging)
- [ ] Logging/monitoring configured
  - Sentry project connected (error tracking)
  - Google Analytics or equivalent (usage tracking)
  - Database query logging enabled
- [ ] Email service connected (Resend, SendGrid, etc.)
- [ ] Payment processor connected (Dodo Payments, Stripe, etc.)
- [ ] File storage connected (S3, Supabase Storage, etc.)

### Infrastructure
- [ ] Domain DNS configured (CNAME or A records)
- [ ] SSL certificate valid (not expired, wildcard if needed)
- [ ] CDN configured (Cloudflare, Vercel, etc.)
- [ ] Caching headers set (Cache-Control, ETag)
- [ ] CORS configured (restrict to known origins)
- [ ] Rate limiting configured (API, auth endpoints)

### Database
- [ ] Production database created and backed up
- [ ] All migrations applied to production database
- [ ] RLS policies verified on all tables
- [ ] Indexes verified on hotspot columns
- [ ] Backup retention policy set (≥30 days)
- [ ] Backup restore procedure tested

### Edge Functions / Serverless (if applicable)
- [ ] All edge functions deployed (Supabase Edge Functions, AWS Lambda, etc.)
- [ ] Edge functions have environment variables set
- [ ] Scheduled functions configured (cron jobs)
- [ ] Function logs accessible (CloudWatch, Supabase)

### Secrets & Security
- [ ] No API keys in code (grep check)
- [ ] All secrets in environment variables
- [ ] API keys rotated from staging
- [ ] OAuth redirect URIs updated for production domain
- [ ] CORS headers correct (not `*`)
- [ ] CSP headers configured

### Monitoring & Alerting
- [ ] Sentry project created, token configured
- [ ] Error rate alert threshold set (e.g., > 5% errors in 5 minutes)
- [ ] Uptime monitoring configured (UptimeRobot, Pingdom, etc.)
- [ ] Log aggregation configured (if applicable)
- [ ] Database performance monitoring enabled
- [ ] Alert recipients notified (Slack webhook, email)

### Documentation
- [ ] Rollback plan documented (how to revert if things break)
- [ ] Post-deploy smoke tests documented
- [ ] Known limitations documented (rate limits, quotas)
- [ ] Support/escalation contacts listed

### Communication
- [ ] Deployment scheduled (low-traffic window if possible)
- [ ] Team notified of deployment time
- [ ] Status page updated (if applicable)
- [ ] Support team briefed on changes

### Success Criteria

All checklist items must be checked before proceeding to Gate 10 (smoke test).

---

## Gate 10: Post-Deploy Smoke Test

**Owner:** Bolt (deploy agent) + team
**Trigger:** Within 5 minutes of deployment
**Block Rollback:** Any test failure = evaluate rollback vs hotfix

### Automated Smoke Tests

```bash
# Homepage loads
curl -I https://[production-url]/ && echo "Homepage: OK"

# API health check
curl -s https://[production-url]/api/health | jq . && echo "API: OK"

# Database connected
curl -s https://[production-url]/api/db-check | jq . && echo "Database: OK"
```

### Manual Verification (5-Minute Quick Test)

1. **Homepage**
   - [ ] Loads without error (no 500)
   - [ ] All images load
   - [ ] Navigation links work
   - [ ] No console errors (DevTools)
   - [ ] No Sentry errors triggered
   - Severity: BLOCKER if failed

2. **Auth Flow**
   - [ ] Signup form loads
   - [ ] Signup succeeds (check email or verify in DB)
   - [ ] Login succeeds (session created)
   - [ ] Protected page loads
   - [ ] Logout clears session
   - Severity: BLOCKER if failed

3. **Core Feature**
   - [ ] Main value prop works (e.g., the project: upload resume → ranking completes)
   - [ ] Results display correctly
   - [ ] No API errors (check Sentry)
   - [ ] Performance acceptable (< 3s)
   - Severity: BLOCKER if failed

4. **Billing (if applicable)**
   - [ ] Pricing page loads
   - [ ] Payment flow initiates (redirect to processor)
   - [ ] Webhook received (check logs)
   - [ ] Credits/subscription updated in DB
   - Severity: BLOCKER if failed

5. **API Endpoints**
   - [ ] GET endpoints return correct data
   - [ ] POST endpoints accept data
   - [ ] 401 Unauthorized on protected routes without auth
   - [ ] 400 Bad Request on invalid input
   - [ ] 500 errors logged to Sentry
   - Severity: CRITICAL if failed

6. **Error Tracking**
   - [ ] Sentry connected (test event sent via `Sentry.captureMessage()`)
   - [ ] Error rate in Sentry < 1% of requests
   - [ ] No unexpected errors in Sentry
   - Severity: MAJOR if failed

7. **Performance**
   - [ ] LCP < 3s (Lighthouse Real User Monitoring)
   - [ ] API response time < 500ms (typical request)
   - [ ] Database query time < 100ms
   - [ ] No high CPU or memory usage
   - Severity: MAJOR if regression > 10%

8. **No Console Errors**
   - [ ] Open DevTools (F12)
   - [ ] Navigate through app
   - [ ] No red error messages in Console tab
   - [ ] No `TypeError: Cannot read property...` errors
   - Severity: MAJOR if any errors

### Rollback Decision Matrix

| Failure | Severity | Action |
|---------|----------|--------|
| Homepage doesn't load | BLOCKER | Rollback immediately |
| Auth flow broken | BLOCKER | Rollback immediately |
| Core feature broken | BLOCKER | Rollback immediately |
| API returning 500s | CRITICAL | Rollback OR quick hotfix |
| Performance regression > 20% | CRITICAL | Rollback OR optimize |
| Unexpected Sentry errors | MAJOR | Investigate, hotfix if simple |
| Dark mode broken | MAJOR | Hotfix, monitor |

### Post-Deploy Monitoring (24 Hours)

After smoke tests pass, monitor for 24 hours:

1. **Error Rate**
   - [ ] Target: < 1% of requests error
   - [ ] Alert if > 5% for 5 minutes
   - Check: Sentry dashboard

2. **Performance**
   - [ ] LCP: track via Web Vitals
   - [ ] API response time: track via logs
   - [ ] Alert if degradation > 10%

3. **Database**
   - [ ] Slow queries: monitor query logs
   - [ ] Connection pool exhaustion: check available connections
   - [ ] Storage growth: ensure within limits

4. **User Feedback**
   - [ ] Monitor support channel for complaints
   - [ ] Check tweet mentions / social media
   - [ ] Customer support tickets spike?

5. **Rollback Window**
   - Keep rollback possible for ≥ 24 hours
   - After 24 hours, assume deployed state is stable

### Success Criteria

```
✓ Homepage loads without error
✓ Auth flow works (signup → login → logout)
✓ Core feature works end-to-end
✓ Billing flow works (if applicable)
✓ No 5xx errors in logs
✓ No unexpected errors in Sentry
✓ Performance: LCP < 3s, API response < 500ms
✓ Console clear of errors
✓ Error rate < 1%
✓ All team members notified of successful deploy
```

---

## Severity Classification

Use this classification to prioritize fixes and decide whether to block deployment:

### BLOCKER (Stops Deployment)
Fixes security vulnerabilities, data loss, auth bypass, broken core feature.
- **Examples:**
  - TypeScript compilation fails
  - XSS vulnerability found
  - Auth endpoint not rate-limited
  - RLS policy missing (user can read others' data)
  - Core feature fails end-to-end test
  - Broken database migration
  - Secrets in code
- **Decision:** Do not deploy. Fix in hotfix branch, retest, redeploy.

### CRITICAL (Must Fix Before Next Deploy)
Accessibility violations, broken features, major performance regression, data integrity issues.
- **Examples:**
  - Lighthouse a11y score < 90
  - Form validation broken
  - API 500 on common flow
  - N+1 query detected
  - User data missing after action
  - Missing RLS test coverage
  - Payment webhook not logging
- **Decision:** Deploy with caution. Fix in next sprint or hotfix. Monitor error rate.

### MAJOR (Fix Within Sprint)
Performance issues, missing states, dark mode broken, inconsistent design.
- **Examples:**
  - LCP > 4s (but < 5s)
  - Missing loading state on one component
  - Dark mode colors off
  - Icon inconsistency
  - Slow query (> 500ms)
  - Mobile layout break on one page
- **Decision:** Deploy. Schedule fix for next sprint.

### MINOR (Fix When Convenient)
Copy typos, style inconsistencies, animation smoothness, edge cases.
- **Examples:**
  - Button text needs capitalization
  - Spacing off by 4px
  - Hover animation feels slow
  - Toast message unclear
- **Decision:** Deploy. Fix anytime.

---

## Automation Recommendations

### Pre-Deploy Automation (Sage)

Create a CI/CD pipeline that automatically runs Gates 1-5 before merge:

```yaml
# .github/workflows/pre-deploy.yml
name: Pre-Deploy Quality Gates

on:
  pull_request:
    branches: [main]

jobs:
  gate-1-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npx tsc --noEmit --strict
      - run: npx eslint . --max-warnings 0

  gate-2-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v3

  gate-3-a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npx axe-core --tags wcag2a,wcag2aa

  gate-5-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm audit --audit-level=high
      - run: npx snyk test
```

### Production Monitoring (Bolt + Hawk)

After deployment, continuously monitor Gates 4 & 5:

```yaml
# .github/workflows/production-monitoring.yml
name: Production Monitoring

on:
  schedule:
    - cron: '0 * * * *' # Every hour

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npx lighthouse https://[production-url] --output=json --output-path=report.json
      - run: |
          SCORE=$(jq '.lighthouseResult.categories.performance.score * 100' report.json)
          if (( $(echo "$SCORE < 80" | bc -l) )); then
            echo "Performance score too low: $SCORE"
            exit 1
          fi

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm audit --audit-level=high
```

---

## Handoff Protocol

When Sage completes audit and passes all gates, handoff to Bolt:

**Sage → Bolt (Pre-Deploy Handoff)**

```
## [SAGE] Pre-Deploy Audit Complete

**Date:** 2026-04-04
**Commit:** abc1234
**Gates Passed:**
- [x] Gate 1: Build Validation
- [x] Gate 2: Test Validation
- [x] Gate 3: Accessibility Validation
- [x] Gate 4: Performance Validation
- [x] Gate 5: Security Validation
- [x] Gate 6: SEO Validation (or N/A if no public pages)
- [x] Gate 7: UI/UX Validation
- [x] Gate 8: Database Validation

**Blockers:** None
**Criticals:** None
**Majors:** 2 (schedule for next sprint)

**Ready for Deploy:** YES

**Notes:**
- All RLS policies verified
- Performance within thresholds
- No security vulnerabilities found
```

Then Bolt proceeds with Gate 9 (pre-deploy checklist) → Gate 10 (smoke test) → Deploy.

---

## Integration with Memory System

This document is part of the Boldteq Quality Framework. After every deploy:

1. **Sage** records any gate failures in memory
2. **Mira** (knowledge extraction agent) updates:
   - `patterns/avoid/antipatterns.md` with new failure modes
   - `patterns/good/quality-framework.md` with lessons learned
   - `stacks/[stack].md` with stack-specific insights
3. **Yash** (orchestrator) reviews Mira's updates for next project

---

## Quick Reference: Gate Checklist (Executive Summary)

```
Before Deploying:
☐ Gate 1: Build validates (npm run build, tsc, eslint all pass)
☐ Gate 2: Tests pass with coverage ≥80% statements
☐ Gate 3: Lighthouse a11y ≥90, keyboard nav works
☐ Gate 4: Lighthouse performance ≥90, LCP < 2.5s, CLS < 0.1
☐ Gate 5: npm audit clean, no secrets, auth enforced, RLS on all tables
☐ Gate 6: SEO tags present (if public pages)
☐ Gate 7: Loading/empty/error states on all components
☐ Gate 8: Migrations tested, RLS policies verified, indexes on hotspots
☐ Gate 9: Pre-deploy checklist 100% complete
☐ Gate 10: Post-deploy smoke tests pass (5-minute sanity check)

If any gate fails: FIX → RETEST → REDEPLOY
```

---

**Last Updated:** 2026-04-04
**Owner:** Sage (audit agent) + Bolt (deploy agent)
**Review Frequency:** Every 3 months or after incident
