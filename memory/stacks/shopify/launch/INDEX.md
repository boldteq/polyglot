# Launch Phase — Complete Index

This index covers all launch requirements and processes for taking a Shopify app from development to production and achieving success on the Shopify App Store.

---

## Files & Topics

### 1. **requirements.md** — BLOCKING App Store Requirements
11 BLOCKING requirements that must be met before submission. Covers Partner Program compliance, functional web-accessible app, privacy policy, unique app name, API deprecation window, demo store, support, product licensing, theme modifications, compliance webhooks, and stored APIs only.
- **Reference:** [App Store Requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- **Key Rule:** All 11 requirements MUST pass or app is rejected

### 2. **listing.md** — App Store Listing & Optimization
Complete guide to app store listing components (icon, title, description, screenshots, video), pricing display, category/keywords, support links, and listing optimization for search ranking. Includes SEO best practices and trust-building strategies.
- **Reference:** [Best Practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- **Key Rule:** Benefit-focused copy; keywords naturally integrated; icon/screenshots high-quality

### 3. **billing.md** — Monetization Models & Implementation
Five pricing models: time-based subscriptions (recurring), usage-based (pay-per-use), hybrid (base+overage), one-time purchases, and managed pricing. Includes free trial strategy, Shopify's 30% commission, GraphQL mutations, and testing requirements.
- **Reference:** [Billing Overview](https://shopify.dev/docs/apps/launch/billing)
- **Key Rule:** Must test billing before submission; pricing clearly disclosed; no hidden fees

### 4. **privacy.md** — GDPR/CPRA & Data Protection
Privacy policy requirements, GDPR mandatory webhooks (data_request, redact, shop_redact), CPRA compliance, data minimization, encryption, lawful basis for processing. Includes webhook implementation examples and compliance checklist.
- **Reference:** [Privacy Requirements](https://shopify.dev/docs/apps/launch/privacy-requirements)
- **Key Rule:** Privacy policy mandatory; all 3 GDPR webhooks required (even if no customer data stored)

### 5. **security.md** — OWASP Top 10 & Security Standards
10 BLOCKING security requirements: OWASP Top 10 protection, token encryption, HTTPS/TLS, Shopify OAuth only, access control, rate limiting, PII protection, dependency security, input validation, error handling. Includes secure coding practices and incident response.
- **Reference:** [Security Guide](https://shopify.dev/docs/apps/build/security)
- **Key Rule:** No custom auth; use Shopify OAuth; encrypt tokens at rest; HTTPS everywhere

### 6. **review.md** — App Store Review Process
Submission status progression (Draft → Submitted → Reviewed → Published), timeline (2-5 days typical), 10 common rejection reasons, best practices for passing review, and re-submission protocol. Includes testing checklist and response strategies.
- **Reference:** [Review Process](https://shopify.dev/docs/apps/launch/app-store-review/review-process)
- **Key Rule:** Test thoroughly before submission; provide working demo store; fix all issues before resubmitting

### 7. **distribution.md** — Public vs Custom App Distribution
Three distribution options: Public (App Store), Custom/Unlisted (private link), Plus Organization (enterprise). Includes decision matrix, installation methods, revenue sharing comparison, and upgrade pathways.
- **Reference:** [Distribution Methods](https://shopify.dev/docs/apps/launch/distribution)
- **Key Rule:** Public = maximum reach; Custom = faster to market

### 8. **built-for-shopify.md** — Premium Quality Badge
Built for Shopify badge requirements: design standards (Polaris), performance benchmarks (Lighthouse >90), security (OWASP), merchant experience, functionality, privacy compliance, and onboarding. Includes application process and strategy.
- **Reference:** [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)
- **Key Rule:** Higher bar than public app; shows excellence; boosts visibility and conversion

---

## Quick Reference: Pre-Launch Checklist

### BLOCKING Requirements (All Must Pass)
- [ ] Partner Program Agreement compliant
- [ ] App fully web-accessible (no desktop requirement)
- [ ] Privacy policy written, public, linked in listing
- [ ] App name unique, starts with brand
- [ ] Using only APIs in current reference (no deprecated)
- [ ] Demo store created, app installed, accessible
- [ ] Support documentation provided
- [ ] Only process merchant-authorized product data
- [ ] Theme modifications use extensions only
- [ ] All 3 GDPR webhooks implemented (data_request, redact, shop_redact)
- [ ] Using only stored, supported APIs

### Security (All Must Pass)
- [ ] No OWASP Top 10 vulnerabilities
- [ ] Access tokens encrypted in database
- [ ] All communication HTTPS/TLS
- [ ] Shopify OAuth only (no custom auth)
- [ ] Access control verified (RLS, shop filtering)
- [ ] API rate limiting implemented
- [ ] PII minimal collection, secure storage, transparent
- [ ] No hardcoded secrets or test data
- [ ] Dependencies audited (`npm audit` clean)
- [ ] Inputs validated (frontend + backend)
- [ ] Error messages don't expose sensitive data

### Privacy & Compliance
- [ ] Privacy policy covers all data types and purposes
- [ ] Retention periods documented
- [ ] Third-party data sharing disclosed
- [ ] GDPR data request webhook functional
- [ ] GDPR customer redact webhook functional
- [ ] GDPR shop redact webhook functional
- [ ] Data deletion tested (app uninstall removes data)
- [ ] Data encryption at rest enabled
- [ ] Data transmission encrypted (HTTPS)

### Performance & Quality
- [ ] Lighthouse score >90 (mobile)
- [ ] Core Web Vitals passing (LCP <2.5s, FID <100ms, CLS <0.1)
- [ ] JS <10KB per route, CSS <50KB per page
- [ ] No console.log or debugging code
- [ ] TypeScript strict mode
- [ ] Code linting clean (eslint passes)
- [ ] Tested thoroughly on dev store
- [ ] Mobile responsive and functional
- [ ] Billing tested (if applicable)

### Listing & Documentation
- [ ] App icon: 1200×1200px PNG/JPEG
- [ ] Title: <30 chars, starts with brand, consistent
- [ ] Short description: 30-50 chars, single benefit
- [ ] Long description: benefit-focused prose, not feature list
- [ ] Category: single, accurate choice
- [ ] Keywords: up to 5 complete words
- [ ] Screenshots: 3-5 high-quality, 1600×900px
- [ ] Pricing clearly disclosed (free/trial/subscription/one-time)
- [ ] Privacy policy link working
- [ ] Support links working (FAQ, support, changelog)

---

## Launch Timeline (Public App)

```
Week 1:
  - Final testing on dev store
  - Complete app listing
  - Verify all links
  - Security audit

Week 2:
  - Submit for review
  - Shopify begins review

Weeks 2-4:
  - Review in progress (typically 2-5 days)
  - May receive feedback (fix issues, resubmit)
  - Keep demo store active

Week 4+:
  - Approved → published automatically
  - Appears on Shopify App Store
  - Merchants can install
```

---

## Decision Trees

### Should I Use Public or Custom Distribution?

```
Are you building a general product that solves a broad merchant problem?
├─ YES → Public Distribution (App Store)
└─ NO → Is this for a specific client or internal use?
        ├─ YES → Custom Distribution
        └─ NO → Public Distribution (wider market)

Public Distribution:
  - Higher visibility
  - Passive discovery
  - 30% commission
  - Strict review (2-5 weeks)

Custom Distribution:
  - Direct relationships
  - Faster launch
  - No commission (negotiate)
  - Limited review
```

### Should I Target Built for Shopify Badge?

```
Do I have 3-6 months to optimize after launch?
├─ YES → Build for badge from start (incorporate all standards)
└─ NO → Launch public app first, apply for badge later

Badge Requirements:
  - Polaris-only design
  - >90 Lighthouse scores
  - Complete onboarding flow
  - Comprehensive help docs
  - Regular updates
```

---

## Success Factors

### Why Apps Get Approved
1. **All requirements met** — no shortcuts; thorough preparation
2. **Polished presentation** — professional listing, screenshots, copy
3. **Clear value** — merchants understand what problem is solved
4. **Working demo** — reviewers can test live functionality
5. **Responsive support** — can answer questions during review

### Why Apps Get Rejected
1. **BLOCKING requirement missing** — even one failure = rejection
2. **Security vulnerability** — OWASP issues = automatic rejection
3. **Broken demo store** — can't test = can't review
4. **Incomplete listing** — missing icon, description, or pricing
5. **No privacy policy** — mandatory; missing it = rejection
6. **Missing compliance webhooks** — all 3 required
7. **Poor quality** — bugs, crashes, incomplete features
8. **Misleading description** — app doesn't match what's advertised

---

## Post-Launch: Maintenance & Growth

### After Approval
1. **Monitor support emails** — respond to merchant questions
2. **Collect feedback** — use for roadmap and improvements
3. **Release updates** — regular updates show active maintenance
4. **Monitor performance** — ensure app stays fast and reliable
5. **Track metrics** — installs, revenue, churn, support tickets

### Building to Built for Shopify
1. **Optimize design** — Polaris-only, responsive, accessible
2. **Improve performance** — hit Lighthouse >90 targets
3. **Enhance onboarding** — create intuitive setup flow
4. **Add documentation** — help guides, tutorials, FAQs
5. **Record demo video** — show onboarding in action
6. **Apply for badge** — submit application after app is mature

---

## Resources

**Official Shopify Docs:**
- [App Store Requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Launch Overview](https://shopify.dev/docs/apps/launch)
- [Review Process](https://shopify.dev/docs/apps/launch/app-store-review)
- [Billing](https://shopify.dev/docs/apps/launch/billing)
- [Privacy](https://shopify.dev/docs/apps/launch/privacy-requirements)
- [Security](https://shopify.dev/docs/apps/build/security)
- [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)

**Key Tools:**
- Partner Dashboard: https://partners.shopify.com
- GraphQL API Explorer: https://shopify.dev/api/admin-graphql
- Shopify CLI: `shopify app dev`
- Lighthouse: Chrome DevTools > Lighthouse tab
- npm audit: `npm audit`
