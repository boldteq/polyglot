# Built for Shopify Badge — Premium Quality Designation

> Source: shopify.dev/docs/apps/launch/built-for-shopify
> Last extracted: 2026-04-04

## What is the Badge?

**Built for Shopify** is a premium designation appearing on:
- App card in Shopify App Store
- Search results
- Category pages
- Top merchant recommendation section

Indicates the app meets Shopify's highest standards for:
- Design quality (Polaris compliance)
- Security (OWASP compliant)
- Performance (Core Web Vitals passing)
- User experience (intuitive, reliable)
- Merchant trust

---

## Benefits of Built for Shopify Badge

### 1. Increased Visibility
- Searchable filter: "Built for Shopify" apps only
- Higher ranking in App Store search results
- Featured in "Built for Shopify" collections
- Premium placement on category pages

### 2. Credibility & Trust
- "Built for Shopify" badge signals quality to merchants
- Meets Shopify's highest standards
- Trust boost from Shopify endorsement
- Higher conversion rates for badge apps

### 3. Faster Review
- Future app submissions reviewed in priority queue
- Faster approval for updates and new versions
- Dedicated support from Shopify

### 4. Additional Support
- Priority support from Shopify team
- Co-marketing opportunities
- Featured case study consideration
- Direct relationship with Shopify

---

## Eligibility Requirements (All Must Be Met)

### 1. Design Standards

**Requirement:** App UI must match Shopify admin appearance

**Criteria:**
- ✅ Uses Polaris components (not custom design system)
- ✅ Consistent merchant workflows (app behavior like native admin)
- ✅ Follow Shopify design patterns and conventions
- ✅ Responsive design (works on mobile, tablet, desktop)
- ✅ Accessible (WCAG AA compliance)

**What to Do:**
- Only use Polaris components for admin UI
- No Tailwind, shadcn, or custom CSS frameworks
- Follow layout patterns (Page > Layout > Section > Card)
- Test on multiple screen sizes
- Run accessibility audit

---

### 2. Performance Benchmarks

#### Checkout Extensions (If Applicable)
- **p95 response time:** ≤500ms
- **Failure rate:** <0.1% (minimum 1000 requests over 28 days)
- **Metrics tracked** via Shopify monitoring

#### Storefront Impact (Theme Extensions)
- **Lighthouse impact:** Cannot reduce score by >10 points
- **Checkout impact:** Must not slow checkout
- **Network:** <1s API response time

#### General Admin Apps
- **JS budget:** <10KB per route entry point
- **CSS budget:** <50KB per page
- **Lighthouse scores:** >90 (all categories)
- **Core Web Vitals:** LCP <2.5s, FID <100ms, CLS <0.1

---

### 3. Security Standards

**Requirement:** Protected against OWASP Top 10 vulnerabilities

**Criteria:**
- ✅ No OWASP Top 10 vulnerabilities present
- ✅ Tokens encrypted at rest
- ✅ Secure OAuth implementation (Shopify only)
- ✅ HTTPS/TLS for all communication
- ✅ Proper data handling for protected customer data
- ✅ Security audit passed

**What to Do:**
- Security code review
- Run `npm audit` (clean results)
- Penetration testing
- Document security measures

---

### 4. Merchant Experience

**Requirement:** Intuitive interface with clear workflows

**Criteria:**
- ✅ Intuitive interface (no confusing menus)
- ✅ Minimal required setup (quick onboarding)
- ✅ Reliable and stable performance
- ✅ Responsive customer support
- ✅ Clear help documentation
- ✅ Regular updates and maintenance

**What to Do:**
- User testing with real merchants
- Comprehensive onboarding flow
- Clear error messages
- Responsive support team
- Active maintenance (regular updates)

---

### 5. Functionality & Features

**Requirement:** Clear, differentiated value; features complete

**Criteria:**
- ✅ App provides clear, distinct value to merchants
- ✅ Features are complete and working
- ✅ Does what's advertised
- ✅ No bugs or incomplete features
- ✅ Differentiates from competitor apps

**What to Do:**
- Clear value proposition
- Complete feature set (no "beta" features)
- Extensive testing
- Clear competitive positioning

---

### 6. Data Privacy & Compliance

**Requirement:** Full GDPR/CPRA compliance + transparent data handling

**Criteria:**
- ✅ Privacy policy clearly disclosed
- ✅ GDPR/CPRA compliant
- ✅ All 3 mandatory compliance webhooks implemented
- ✅ Proper data deletion on request
- ✅ Transparent data processing disclosure
- ✅ Minimal data collection (data minimization)

**What to Do:**
- Comprehensive privacy policy
- Implement all compliance webhooks
- Test GDPR data requests
- Minimal data collection
- Clear data disclosure

---

### 7. Merchant Onboarding

**Requirement:** Clear merchant onboarding + app setup guide

**Criteria:**
- ✅ Concise onboarding flow
- ✅ Setup guide pattern (interactive checklist)
- ✅ Clear steps (typically 3-5 steps)
- ✅ Shows progress
- ✅ Guides merchant through essential tasks

**What to Do:**
- Create onboarding flow
- Use Setup Guide pattern
- Logical task ordering
- Show value early
- Progress indication

---

## Application Process

### Step 1: Meet All Requirements
- Ensure app meets all 7 criteria above
- Complete checklist
- Run all tests and audits

### Step 2: Existing App Requirement
- App must be published on Shopify App Store (public distribution only)
- Custom/unlisted apps not eligible
- App must have install history (real merchants using it)

### Step 3: Submit Application
1. Log into Partner Dashboard
2. Go to Apps section
3. Select published app
4. Click "Apply for Built for Shopify"
5. Complete application form
6. Provide supporting documentation

### Step 4: Merchant Onboarding Video
- Record onboarding flow on video (2-3 minutes)
- Show merchant using app for first time
- Show setup completion
- Upload video in application

### Step 5: Shopify Review
- Shopify reviews application
- May request additional documentation
- May test app thoroughly
- Typically 1-2 weeks

### Step 6: Approval or Denial
- If approved: badge added to app
- If denied: feedback provided, can reapply later

---

## Building for the Badge (Strategy)

### Phase 1: MVP Launch
- Build core feature set
- Use only Polaris components
- Basic onboarding
- Privacy policy required
- Get to App Store (public distribution)

### Phase 2: Improve
- User feedback integration
- UX refinement
- Performance optimization
- Comprehensive help docs
- Security audit

### Phase 3: Prepare for Badge
- Implement merchant onboarding flow
- Record onboarding video
- Performance optimization (hit benchmarks)
- Security review
- Gather merchant testimonials

### Phase 4: Apply
- Meet all 7 requirements
- Complete application
- Submit evidence (security audit, performance tests)
- Await review

---

## Badge Requirements Checklist

- [ ] Uses ONLY Polaris components (no custom CSS frameworks)
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] WCAG AA accessibility compliance
- [ ] Lighthouse >90 (Performance, Accessibility, Best Practices, SEO)
- [ ] Core Web Vitals passing (LCP <2.5s, FID <100ms, CLS <0.1)
- [ ] JS <10KB, CSS <50KB per page
- [ ] No OWASP vulnerabilities
- [ ] Tokens encrypted at rest
- [ ] HTTPS/TLS everywhere
- [ ] `npm audit` clean
- [ ] Privacy policy complete and linked
- [ ] All 3 GDPR webhooks implemented and tested
- [ ] Merchant onboarding flow designed (3-5 steps)
- [ ] Setup guide pattern implemented
- [ ] Help documentation comprehensive
- [ ] Support contact responsive
- [ ] App regularly updated and maintained
- [ ] Published on Shopify App Store
- [ ] Installed by real merchants (not just you)
- [ ] Onboarding video recorded (2-3 minutes)

---

## Built for Shopify vs Public App

| Aspect | Public App | Built for Shopify |
|--------|-----------|-------------------|
| **Requirements** | 11 BLOCKING items | 7 comprehensive criteria |
| **Difficulty** | Moderate | Strict (higher bar) |
| **Effort** | Weeks to months | Months to build properly |
| **Benefits** | On App Store, searchable | Visible badge, higher conversion |
| **Discovery** | Search-driven | Dedicated filter, featured |
| **Support** | Standard | Priority queue |
| **Revenue Potential** | High | Higher (trust signal) |

---

## References

- **Built for Shopify:** https://shopify.dev/docs/apps/launch/built-for-shopify
- **Requirements:** https://shopify.dev/docs/apps/launch/built-for-shopify/requirements
- **How to Apply:** https://shopify.dev/docs/apps/launch/built-for-shopify/how-to-apply
