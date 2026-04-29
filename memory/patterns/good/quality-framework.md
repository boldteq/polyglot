---
name: Quality Framework & Release Management
description: Definition of Done, acceptance criteria standards, release process, versioning, and hotfix protocol — the quality bar every Boldteq product must clear
type: reference
priority: high
---

## 1. Definition of Done (DoD)

A feature is DONE only when ALL of these are true:

### Code Quality
- [ ] TypeScript strict mode — zero `any` types in production code
- [ ] All functions have explicit return types
- [ ] No ESLint warnings (errors are blocked at commit via husky)
- [ ] No `console.log` in production code (use structured logger)
- [ ] Code reviewed by Sage with PASS verdict
- [ ] No TODO comments without linked issue/ticket

### Testing
- [ ] Unit tests for all business logic (≥ 80% coverage)
- [ ] Integration tests for API routes (happy path + error cases)
- [ ] E2E tests for critical user flows (auth, billing, main value prop)
- [ ] RLS tests for every database policy (Stack A/C)
- [ ] Accessibility tests pass (axe-core, no critical violations)

### Functionality
- [ ] All acceptance criteria met and verified
- [ ] Error states handled (network error, validation error, server error)
- [ ] Loading states present (skeleton, spinner, or progress indicator)
- [ ] Empty states designed (first-time user, no data, search no results)
- [ ] Edge cases handled (long text, special characters, concurrent edits)
- [ ] Mobile responsive (if web) or adaptive layout (if desktop)

### UI/UX
- [ ] Passes Sage's AI-Generated UI Detection Checklist (all 20 points)
- [ ] Follows `patterns/good/saas-brand-patterns.md` standards
- [ ] Follows `patterns/good/ui-ux-production-standards.md` rules
- [ ] shadcn/ui components composed into app-specific components (never raw)
- [ ] Consistent icon usage (Lucide React, strokeWidth 1.75, branded wrapper)
- [ ] Animations are purposeful (Framer Motion, not random CSS transitions)
- [ ] Typography hierarchy clear (one font, 4-5 sizes max)
- [ ] Color system consistent (semantic tokens, not hardcoded hex)

### Security
- [ ] Auth enforced server-side on all protected routes
- [ ] Input validated with Zod on all API endpoints
- [ ] No secrets in client code or git history
- [ ] RLS policies active on all tables (Stack A/C)
- [ ] Rate limiting on public and auth endpoints
- [ ] CSRF protection on state-changing operations

### SEO (Public Pages Only — Validated by Zeph)
- [ ] Every public page has unique title tag (50-60 chars, primary keyword first)
- [ ] Every public page has unique meta description (150-160 chars, with CTA)
- [ ] Exactly one H1 per page containing primary keyword
- [ ] Heading hierarchy correct (no skipped levels)
- [ ] Canonical URLs set on every page
- [ ] XML sitemap generated and accurate (`app/sitemap.ts`)
- [ ] robots.txt configured (blocks dashboard/api/auth, allows public pages)
- [ ] Structured data (JSON-LD) on key pages — validates at schema.org
- [ ] Open Graph + Twitter meta on all public pages with 1200x630 images
- [ ] Images use `next/image` with alt text, WebP format, lazy loading
- [ ] No `noindex` on pages that should be indexed
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] Internal links: every page reachable within 3 clicks from homepage

### Documentation
- [ ] CLAUDE.md updated with project decisions and gotchas
- [ ] API endpoints documented (method, params, response shape)
- [ ] Environment variables documented with descriptions
- [ ] Migration files have up and down migrations

---

## 2. Acceptance Criteria Standards

### How to Write Acceptance Criteria
Use the Given/When/Then format for behavioral criteria:
```
GIVEN a logged-in user on the Pro plan
WHEN they click "Export to CSV"
THEN a CSV file downloads containing all their filtered data
AND the file name includes the current date
AND a success toast appears for 3 seconds
```

### Required Criteria for Every Feature
1. **Happy path** — the expected user flow works
2. **Error handling** — what happens when things go wrong
3. **Edge cases** — boundary conditions, empty states, limits
4. **Permissions** — who can and cannot access this
5. **Performance** — acceptable load time, response time

### Anti-Criteria (Never Write These)
- "Should work correctly" — too vague, untestable
- "Nice UI" — define what "nice" means specifically
- "Fast" — define the metric (< 200ms API response, < 2s page load)
- "Handle errors" — specify which errors and how

---

## 3. Release Management

### Versioning (Semantic Versioning)
```
MAJOR.MINOR.PATCH

MAJOR (1.0.0 → 2.0.0): Breaking changes, major redesign
MINOR (1.0.0 → 1.1.0): New features, backward compatible
PATCH (1.0.0 → 1.0.1): Bug fixes, performance improvements
```

### Release Cadence
| Release Type | Frequency | Examples |
|-------------|-----------|---------|
| v1.0.0 (Initial) | End of build phase | First production deployment |
| Feature release | Per sprint (every 3 days) | New features, improvements |
| Patch release | As needed | Bug fixes, security patches |
| Hotfix | Immediate | P0 production issues |

### Release Process
```
1. Feature branch → main (via PR)
2. Sage review PASS required
3. Luna tests all green
4. Zeph SEO audit PASS required (no P0/P1 SEO bugs on public pages)
5. Changelog updated (what changed, why)
6. Version bumped (semantic)
7. Bolt deploys to staging
8. Smoke test on staging (5-10 min manual or automated)
9. Bolt promotes to production
10. Hawk verifies health metrics
11. Mira logs release in project memory
```

### Branch Strategy
```
main ← always deployable, protected
  └── feature/[slug] ← one branch per feature/story
  └── fix/[slug] ← one branch per bug fix
  └── hotfix/[slug] ← emergency fixes, branched from main
```

- No develop branch — main is always deployable
- Feature branches are short-lived (max 2 days)
- Squash merge to main for clean history
- Branch protection: require PR review (Sage), passing tests (Luna)

---

## 4. Hotfix Protocol

### When to Hotfix (vs. Normal Release)
- P0: Production down, data loss, security breach → HOTFIX IMMEDIATELY
- P1: Major feature broken, billing affected → HOTFIX WITHIN 4 HOURS
- P2: Minor feature broken, workaround exists → NEXT REGULAR RELEASE
- P3: Cosmetic, edge case → BACKLOG

### Hotfix Process
```
1. Vex diagnoses root cause (max 30 min)
2. Vex implements fix on hotfix/[slug] branch
3. Luna runs targeted tests (affected area only)
4. Sage fast-track review (security + correctness only)
5. Bolt deploys directly to production
6. Hawk verifies fix is working
7. Mira logs incident + fix in project memory
8. Backfill: full test suite run, documentation updated
```

### Rollback Protocol
If a hotfix makes things worse:
1. Bolt reverts to previous deployment (Vercel instant rollback)
2. Hawk confirms health restored
3. Vex gets more time for proper diagnosis
4. Never deploy the same broken fix twice

---

## 5. Code Review Standards (Sage)

### Review Tiers
| Tier | Criteria | Verdict |
|------|----------|---------|
| PASS | No issues, ship it | Deploy approved |
| PASS WITH WARNINGS | Minor issues, non-blocking | Deploy approved, fix in next sprint |
| FAIL | Critical issues | Do not deploy, fix required |

### What Gets FAIL
- Security vulnerability (exposed secrets, missing auth, SQL injection)
- Data integrity risk (missing validation, race condition, no transaction)
- Breaking change without migration
- Test coverage below 60% for new code
- P0 bug present in new code
- AI-generated UI detection score > 5/20 (too many AI tells)

### What Gets PASS WITH WARNINGS
- Test coverage 60-80% (should be 80%+)
- Minor performance concern (N+1 query on low-traffic endpoint)
- Missing error handling on non-critical path
- Minor UI inconsistency (spacing off by a few pixels)
- Missing loading state on non-critical feature

---

## 6. Performance Standards

### Web Vitals (Non-Negotiable)
| Metric | Target | Measured By |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse, Vercel Analytics |
| FID (First Input Delay) | < 100ms | Lighthouse |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| TTFB (Time to First Byte) | < 600ms | Vercel Analytics |
| Bundle size (initial JS) | < 200KB gzipped | Build analysis |

### API Performance
| Metric | Target |
|--------|--------|
| API response (p50) | < 200ms |
| API response (p95) | < 1s |
| API response (p99) | < 3s |
| Database query | < 100ms |
| AI streaming (time to first token) | < 2s |

### Performance Review Process
1. Lighthouse audit on every PR (automated in CI)
2. Bundle size check (fail if increased by > 10KB without justification)
3. API response time check (fail if p95 > 1s on critical endpoints)
4. Monthly performance review by Hawk (trending analysis)

---

## 7. Dependency Management

### Update Policy
| Dependency Type | Update Frequency | Process |
|----------------|-----------------|---------|
| Security patches | Immediately | Automated via Dependabot/Renovate |
| Minor versions | Weekly batch | Review changelog, run tests |
| Major versions | Quarterly review | Spike: evaluate breaking changes, plan migration |
| Framework (Next.js, Remix) | Per major release | Evaluate within 2 weeks, migrate within 1 month |

### Dependency Rules
- No dependency without justification (every npm package is an attack surface)
- Prefer well-maintained packages (> 1000 GitHub stars, recent commits)
- Lock files (`package-lock.json`) always committed
- Audit output clean: `npm audit` must show 0 critical/high vulnerabilities
- If a package hasn't been updated in 12+ months, find an alternative

---

## 8. Incident Severity Classification

| Severity | Impact | Response Time | Resolution Time |
|----------|--------|---------------|-----------------|
| P0 — Critical | Production down, data loss, security breach | Immediate | < 1 hour |
| P1 — High | Major feature broken, billing impacted | < 1 hour | < 4 hours |
| P2 — Medium | Feature degraded, workaround available | < 4 hours | Next sprint |
| P3 — Low | Cosmetic issue, edge case | Next business day | Backlog |

### Incident Response Flow
```
Detection (Hawk) → Triage (Yash) → Diagnose (Vex) → Fix → Verify (Hawk) → Postmortem (Mira)
```

---

## 9. Technical Debt Management

### Debt Categories
| Category | Example | Priority |
|----------|---------|----------|
| Security debt | Missing rate limiting, outdated deps | Fix immediately |
| Performance debt | N+1 queries, missing indexes | Fix within 1 sprint |
| Code quality debt | Duplicated logic, missing types | Fix when touching the file |
| Test debt | Missing tests for critical paths | Fix before adding features |
| Architecture debt | Tight coupling, missing abstraction | Plan migration, execute in dedicated sprint |

### Debt Budget
- 20% of each sprint allocated to debt reduction
- Security and performance debt are non-negotiable — fix immediately
- Code quality debt fixed opportunistically (boy scout rule: leave code better than you found it)
- Architecture debt requires a spike first, then a planned sprint

---

*(Updated by Mira — quality standards evolve with each shipped project)*
