# App Store Requirements — BLOCKING Criteria

> Source: shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
> Last extracted: 2026-04-04

## BLOCKING Requirements (All Must Pass)

**BLOCKING:** If any of these 11 requirements fail, app submission will be rejected. Fix all issues before resubmitting.

---

### 1. BLOCKING — Partner Program Agreement Compliance

**Requirement:** App must comply with the Shopify Partner Program Agreement

**What This Means:**
- You've agreed to Partner Program terms
- App cannot violate Partner Agreement (legal contract)
- Non-negotiable legal requirement
- Shopify can reject for any Agreement violation

**Implementation:**
- Review current Partner Program Agreement
- Ensure app doesn't violate any terms
- Document compliance in submission
- Keep Agreement current (review annually)

---

### 2. BLOCKING — Functional Requirements (Web-Accessible)

**Requirement:** App must be fully functional via web (no desktop app required)

**What This Means:**
- App cannot require separate desktop application
- App must be 100% web-based
- Merchants access via browser only
- No native mobile app requirement (optional, not required)

**Implementation:**
- App runs on web (browser or responsive web app)
- All functionality accessible via web interface
- No desktop app required for core features
- Test on multiple browsers (Chrome, Safari, Firefox)

---

### 3. BLOCKING — Privacy Policy Required

**Requirement:** Privacy policy is mandatory and must be linked from App Store listing

**What This Means:**
- Every app must have a privacy policy
- Policy must be publicly accessible (website or https://yourapp.com/privacy)
- Must be linked in App Store listing
- Shopify reviewers will check the link works

**Implementation:**
- Write comprehensive privacy policy
- Cover all data collection (what, why, how long)
- Include GDPR/CPRA compliance statements
- Post publicly accessible URL
- Link URL in App Store submission form
- Keep policy up-to-date

**What to Include in Privacy Policy:**
- Personal data collected (emails, names, usage data)
- Why data is collected (order processing, analytics)
- How long data is retained
- Third parties with access (payment processors, analytics)
- Data subject rights (access, deletion, correction)
- Geographic data transfers (if outside customer's country)
- Cookie policy (if using cookies)
- Contact for privacy questions

---

### 4. BLOCKING — Unique App Name

**Requirement:** App name must be unique and start with your brand name

**What This Means:**
- Name must not conflict with existing apps
- Should start with your company/brand name
- Cannot use generic descriptors only
- Name in Developer Dashboard must match submission form

**Implementation:**
- Check existing app names in Shopify App Store
- Start with your brand: "MyBrand Widget Manager" (good) vs "Widget Manager" (bad)
- Confirm name match between:
  - Developer Dashboard (App Settings)
  - App Store Submission form
- Max 30 characters recommended

---

### 5. BLOCKING — API Deprecation Window

**Requirement:** Apps using APIs deprecated within 90 days cannot be submitted

**What This Means:**
- Cannot use APIs within 90 days of deprecation
- Must use currently supported API versions
- Shopify deprecates APIs slowly (90 day notice)
- Using deprecated APIs = automatic rejection

**Implementation:**
- Check Shopify API changelog regularly
- Use latest stable API version (currently 2025-10)
- Update app before APIs reach 90-day window
- Test on dev store with latest API version
- Document API versions in shopify.app.toml

---

### 6. BLOCKING — Demo Store Required

**Requirement:** Must provide working development store link that best showcases app

**What This Means:**
- Submit link to dev store where app is installed
- Link should go to page that best demonstrates functionality
- Reviewers need hands-on access to test app
- Store must be active and accessible

**Implementation:**
- Create dev store (free, provided by Shopify)
- Install app on dev store
- Create sample data (products, orders, etc.)
- Note best page to view app functionality
- Provide URL: "https://[yourstore].myshopify.com/admin/apps/[app-id]"
- Ensure store remains active during review (2-5 days)

---

### 7. BLOCKING — Support & Documentation

**Requirement:** Must provide clear, Shopify-specific help documentation

**What This Means:**
- In-app help for context-sensitive guidance
- Support contact available for merchants
- Help documentation addressing common issues
- Emergency developer contact in Partner Dashboard

**Implementation:**
- Create help documentation (FAQ, guides, tutorials)
- Link in App Store listing: FAQ, Changelog, Support Portal
- In-app help: tooltips, contextual guidance, setup guide
- Contact form or email for merchant support
- Keep emergency contact updated in Partner Dashboard
- Respond to support requests (required for App Store)

---

### 8. BLOCKING — Product Information Licensing

**Requirement:** Apps connecting merchants to agencies/freelancers or using unlicensed product info cannot be on App Store

**What This Means:**
- Can only use product info merchant has permission to use
- Allowed: merchant's own products, licensed products, dropshipped products
- Not allowed: connecting to freelance marketplaces or unauthorized product databases
- Apps duplicating product info need license

**Implementation:**
- Only process merchant's own data
- Don't connect to external freelancer/agency services without explicit merchant consent
- Don't duplicate product catalogs without authorization
- Document data source in privacy policy

---

### 9. BLOCKING — Theme Modifications (Use App Extensions Only)

**Requirement:** If app modifies theme, must use theme app extensions only

**What This Means:**
- Cannot directly edit merchant's theme code
- Must use theme app extensions (blocks, app embed points)
- Merchants and developers cannot manually edit theme
- App blocks are isolated and removable

**Implementation:**
- Use theme app extensions for storefront changes
- No custom Liquid injection into theme.liquid
- No direct filesystem access to theme files
- Theme changes via admin API → app blocks only
- Blocks are self-contained and removable

---

### 10. BLOCKING — Compliance Webhooks Required

**Requirement:** Must be subscribed to and verify all mandatory GDPR/compliance webhooks before submission

**What This Means:**
- Must handle 3 mandatory webhooks (even if app stores no personal data)
- Webhooks: customers/data_request, customers/redact, shop/redact
- Must actually respond to these webhooks within 30 days
- Not implementing = automatic rejection

**Implementation:**
```toml
# shopify.app.toml — mandatory webhooks
[webhooks.subscriptions.compliance]
topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "/webhooks"
```

**Handler Required:**
```typescript
// app/routes/webhooks.tsx
case "CUSTOMERS_DATA_REQUEST":
  // Compile and return customer data
  break;

case "CUSTOMERS_REDACT":
  // Delete all customer personal data
  break;

case "SHOP_REDACT":
  // Delete all shop data (triggered on uninstall)
  break;
```

---

### 11. BLOCKING — Stored APIs Only

**Requirement:** App must only use APIs listed in current API reference (no deprecated)

**What This Means:**
- Every API endpoint must be in Shopify's current API documentation
- Cannot use internal/undocumented APIs
- All APIs must be supported (no deprecation warnings)
- REST deprecated; use GraphQL for new apps

**Implementation:**
- Check all API endpoints are in official docs
- Use GraphQL Admin API (REST deprecated)
- API version: 2025-10 (latest stable)
- Run `npm audit` to check for library deprecations
- Test on dev store; verify no 404 errors
- Document all API calls used

---

## Non-Blocking Best Practices

These don't block submission but improve approval chances:

- **Category Selection:** Choose accurate primary category
- **Keywords:** Up to 25 features, 5 search keywords (complete words only)
- **Support Links:** FAQ, Changelog, Support Portal, Tutorial, Developer Docs
- **Listing Optimization:** Clear title, effective description, high-quality screenshots
- **Language Support:** Specify primary language; all app store listings translated consistently
- **Account Security:** Use Shopify OAuth only (no custom auth)
- **Data Minimization:** Only collect necessary data
- **Token Storage:** Encrypt access tokens in database

---

## Pre-Submission Checklist

- [ ] Privacy policy written, publicly accessible, linked
- [ ] App name unique, starts with brand, matches across dashboards
- [ ] Using only APIs in current reference (no deprecated, no custom)
- [ ] API version supported (2025-10 or later)
- [ ] Demo store created, app installed, accessible
- [ ] Help documentation written (FAQ, guides)
- [ ] Support contact available (email, form, portal)
- [ ] All 3 compliance webhooks implemented (data_request, redact, shop_redact)
- [ ] App fully functional via web (no desktop requirement)
- [ ] Partner Program Agreement reviewed and compliant
- [ ] Scopes minimized (only request what needed)
- [ ] No deprecated APIs used
- [ ] No hardcoded secrets or test data
- [ ] All links in submission tested (work correctly)

---

## Rejection Reasons (These Will Cause Rejection)

- ❌ Missing or broken privacy policy link
- ❌ App name not unique or doesn't start with brand
- ❌ Using APIs deprecated within 90 days
- ❌ No working demo store provided
- ❌ Compliance webhooks not implemented
- ❌ Requires separate desktop app
- ❌ Security vulnerabilities found
- ❌ Over-requesting scopes
- ❌ No support documentation
- ❌ App doesn't function as described
- ❌ Partner Program Agreement violated
- ❌ Duplicate product info without authorization
- ❌ Custom auth instead of Shopify OAuth

---

## References

- **App Requirements:** https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- **Checklist:** https://shopify.dev/docs/apps/launch/app-requirements-checklist
- **API Reference:** https://shopify.dev/api/admin-rest/2025-01
- **GraphQL Reference:** https://shopify.dev/api/admin-graphql/2025-01
