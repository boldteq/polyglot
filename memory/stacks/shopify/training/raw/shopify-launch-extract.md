# Shopify App Launch: Complete Technical Requirements Extract

**Last Updated:** 2026-04-04
**Source:** shopify.dev/docs/apps/launch (all sub-pages)
**Status:** Production-ready Shopify App Store deployment guide

---

## Table of Contents
1. [Launch Overview & Distribution](#launch-overview--distribution)
2. [App Store Requirements](#app-store-requirements)
3. [Built for Shopify Badge](#built-for-shopify-badge)
4. [App Store Listing](#app-store-listing)
5. [App Review Process](#app-review-process)
6. [Billing & Monetization](#billing--monetization)
7. [Protected Customer Data](#protected-customer-data)
8. [Privacy Requirements (GDPR/CPRA)](#privacy-requirements-gdprcpra)
9. [Security Requirements](#security-requirements)
10. [Distribution Methods](#distribution-methods)
11. [App Marketing](#app-marketing)
12. [Performance Requirements](#performance-requirements)
13. [Deployment & Version Management](#deployment--version-management)
14. [Updates & Maintenance](#updates--maintenance)
15. [Pre-Launch Testing](#pre-launch-testing)
16. [Merchant Trust & Transparency](#merchant-trust--transparency)
17. [App Store SEO & Discovery](#app-store-seo--discovery)

---

## Launch Overview & Distribution

### What is App Launch?
App launch is the process of moving your app from development to production and making it available to merchants through the Shopify App Store or via custom distribution.

### Key Stages
1. **Development** → Local testing on dev store
2. **Deployment** → Code deployed to hosting service, connected to Shopify via CLI or Dev Dashboard
3. **Versioning** → App version snapshot created (app config + extensions)
4. **Publishing** → App version released to merchants (or kept as draft)

### Distribution Options
- **Public Distribution:** App available to many merchants via Shopify App Store; goes through review process
- **Custom Distribution:** App for one store or multiple stores on same Plus organization; shared via link; bypasses App Store review

**Reference:** [About deployment](https://shopify.dev/docs/apps/launch/deployment), [About app distribution](https://shopify.dev/docs/apps/launch/distribution)

---

## App Store Requirements

### BLOCKING REQUIREMENTS (App Store Approval Will Fail Without These)

#### 1. Partner Program Agreement Compliance
- **BLOCKING:** Your app must comply with the Partner Program Agreement
- Non-negotiable legal requirement

#### 2. Functional Requirements
- **BLOCKING:** App must not require a desktop app to function
- App must be fully web-accessible

#### 3. Privacy Policy
- **BLOCKING:** Privacy policy is mandatory
- Must be linked from App Store listing
- Must disclose all data collection practices

#### 4. Unique App Name
- **BLOCKING:** App name must be unique and start with your brand name
- Cannot use generic descriptors
- Name must match between Developer Dashboard and App Submission form

#### 5. API Deprecation Window
- **BLOCKING:** Apps using APIs deprecated within 90 days cannot be submitted
- You must use only supported API versions

#### 6. Demo Store
- **BLOCKING:** Must provide a development store link
- Should link directly to page that best demonstrates app functionality
- Allows reviewers to test the app

#### 7. Support & Documentation
- **BLOCKING:** Must provide clear, Shopify-specific help documentation
- In-app context must help merchants resolve issues
- Keep emergency developer contact info updated in Partner Dashboard

#### 8. Product Information Licensing
- Apps must only duplicate product information that merchant has permission to use
- Limited to: merchant's own products, officially licensed products, dropshipped products
- **BLOCKING:** Apps connecting merchants to agencies/freelancers cannot be distributed through App Store

#### 9. Theme Modifications
- **BLOCKING:** If app modifies theme, must use theme app extensions only
- Merchants and app developers must not make code changes to theme directly

#### 10. Compliance Webhooks
- **BLOCKING:** Must be subscribed to and verify all mandatory compliance webhooks before submission
- Regardless of whether app collects personal data (required for all apps)

#### 11. Stored APIs Only
- **BLOCKING:** App must only use APIs listed in current API reference
- No deprecation warnings allowed

### Non-Blocking Best Practices

#### Listing Optimization
- Choose accurate categories and tags
- Select up to 25 structured features per category
- Include helpful links: FAQ, changelog, support portal, tutorial, developer documentation
- Use clear title tag and effective meta description

#### Language Support
- Every app submission must specify a primary language
- Create at least one Shopify App Store listing

#### Account & Permissions
- Only use Shopify sessions and OAuth for authentication
- Do not use custom authentication schemes that bypass Shopify

#### Data Handling
- Only collect necessary merchant/customer data
- Store encrypted access tokens to prevent unauthorized access if database compromised

**Reference:** [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements), [Checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)

---

## Built for Shopify Badge

### What is the Badge?
Premium designation appearing on app card in Shopify App Store, search results, and category pages. Indicates high-quality, secure, performant, and user-friendly app.

### Benefits
- Search filter on App Store for "Built for Shopify" apps only
- Higher visibility in App Store search results
- Priority review queue for future app submissions by the developer
- Increased merchant trust and conversion

### Eligibility Requirements (All Must Be Met)

#### Design Standards
- App UI must match Shopify admin appearance and behaviors
- Consistent merchant workflows between app and native admin pages
- Follow Shopify design patterns and conventions
- Must use Polaris components (for embedded apps) or equivalent design system

#### Performance Benchmarks
- **Checkout Apps:** p95 response time ≤ 500ms, 0.1% failure rate max (minimum 1000 requests over 28 days)
- **Storefront Impact:** Must not reduce Lighthouse score by more than 10 points
- **General:** App entry point < 10KB JavaScript, < 50KB CSS per page

#### Security Standards
- Protected against OWASP Top 10 vulnerabilities
- Data encryption for stored access tokens
- Secure OAuth implementation
- Proper data handling for protected customer data

#### Merchant Experience
- Intuitive interface with clear workflows
- Minimal required setup
- Reliable and stable performance
- Responsive customer support

#### Functionality & Features
- App must provide clear, differentiated value to merchants
- Features must be complete and working
- Documentation must be comprehensive

#### Data Privacy & Compliance
- Full GDPR/CPRA compliance
- Transparent data processing disclosure
- Proper webhook implementations for data requests/deletion
- Privacy policy clearly linked

**Reference:** [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements), [About Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)

---

## App Store Listing

### Listing Components

#### App Icon
- **Format:** JPEG or PNG
- **Dimensions:** 1200px × 1200px
- **Design:** Bold colors, simple recognizable patterns
- **Avoid:** Text, screenshots, Shopify trademarks
- **Style:** Square corners (auto-rounded in store), include padding so logo doesn't touch edges

#### App Title
- Must match or be similar between Developer Dashboard and App Submission form
- Should start with brand name (not generic descriptor)
- Maximum 30 characters recommended

#### Short Description
- 30-50 character hook explaining core benefit
- Appears in search results

#### Long Description
- Detailed explanation of app features and benefits
- What problems app solves for merchants
- How to use the app
- Screenshots and feature highlights

#### Pricing Information
- **BLOCKING:** Pricing must be clearly displayed
- Specify billing model (one-time, subscription, usage-based)
- Show trial availability if applicable
- Include any setup fees

#### Category & Tags
- Select primary category (single most relevant category)
- Choose up to 25 structured features per category
- Use up to 5 search keywords (complete words, one idea per term)
- Examples: "email marketing" (good), "email marketing for leads" (avoid)

#### Video Asset
- 2-3 minutes optimal length
- Promotional (not instructional) focus
- Limit screencasts to 25% of video
- Shows app impact and value

#### Support & Documentation
- Link to FAQ page
- Link to changelog
- Link to support portal
- Link to tutorial/onboarding guide
- In-app help documentation with context-specific guidance

#### Privacy & Trust
- Privacy policy link (mandatory)
- Developer contact information
- Company background (optional)
- Merchant testimonials or case studies (optional)

### Listing Best Practices

#### Content Optimization
- Accurate category and tag selection improves discoverability
- Clear, benefit-focused language helps merchants understand value
- Visual assets (icon, screenshots, video) are critical first impression
- Include specific use cases and benefits, not feature lists

#### Keyword Strategy
- Use complete words, avoid partial matches
- One idea per keyword term
- Support multiple spellings (popup/pop-up)
- Don't overuse keywords (decreases discoverability)
- Research common merchant search terms

#### Trust Building
- Professional branding and design
- Complete and detailed documentation
- Responsive, accessible customer support
- Clear pricing with no hidden fees
- Regular updates and maintenance

#### SEO for Listing
- Title tag must follow Google best practices
- Meta description should be effective and compelling
- Keywords naturally integrated into description
- Clear value proposition in first 100 characters

**Reference:** [Best practices for apps in the Shopify App Store](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices), [App listing categories](https://shopify.dev/docs/apps/launch/app-store-review/app-listing-categories)

---

## App Review Process

### Review Timeline & Statuses

#### Status Progression
1. **Draft** → App created, not yet submitted
2. **Submitted** → Developer clicks "Submit for Review"; confirmation email sent
3. **Reviewed** → App reviewed; if needs discussion, moved to this status; developer receives email with next steps
4. **Published** → App approved; appears on Shopify App Store; confirmation email sent

#### Review Duration
- Typical review takes several business days
- Can extend if app requires additional fixes or clarification
- Shopify may request resubmission after fixes

### What Triggers Review

#### Automatic Review on Submission
- All public app submissions go through Shopify App Review team
- Review team assesses against app requirements checklist
- Security, privacy, and functionality are primary focus areas

#### Grounds for Rejection
- **BLOCKING ISSUES:**
  - Missing or incomplete required fields
  - Privacy policy not linked or inadequate
  - App doesn't function as described
  - Vulnerabilities or security issues present
  - Violates Partner Program Agreement
  - Uses deprecated APIs
  - Fails to implement mandatory compliance webhooks
  - No working demo store provided
  - Duplicate product information without permission

- **DISCRETIONARY REJECTION:**
  - Shopify App Review team can reject any app that doesn't meet set standards
  - Beta apps or incomplete submissions rejected
  - Apps not in production-ready state rejected
  - Apps that reduce merchant experience rejected

### Common Submission Failures

#### Why Apps Get Rejected or Delayed
1. **Incomplete Submissions** → Missing required fields, inadequate descriptions
2. **Testing Inadequacy** → App has bugs or errors, not tested on dev store
3. **API Issues** → Using deprecated APIs or unsupported endpoints
4. **Security Vulnerabilities** → OWASP Top 10 issues found during review
5. **Privacy/Compliance** → Missing privacy policy, non-functioning webhooks, data handling issues
6. **Functionality** → App doesn't work as described, features incomplete or broken
7. **Performance** → App significantly impacts storefront Lighthouse scores
8. **Documentation** → Missing support docs, unclear instructions, no help links

### Response to Review Outcome

#### If Approved
- Receive confirmation email with "Published" status
- App immediately displays on Shopify App Store
- App automatically released to all merchants

#### If Rejected/Requires Changes
- Receive detailed email outlining issues and required fixes
- App moves to "Reviewed" status
- Must reply to email and discuss fixes with reviewer
- Can submit fixes and resubmit after addressing issues
- Some rejections may be discretionary with limited explanation

#### During Review (Reviewed Status)
- If additional fixes needed for discussion, app moves to Reviewed status
- Receive email with next steps
- Must respond to continue process
- Clarify requirements with review team before resubmitting

### Best Practices for Passing Review

1. **Test thoroughly** on development store before submission
2. **Verify all URLs and redirects** work correctly
3. **Test billing system** with test charges before submission
4. **Ensure app is production-ready** (no beta features, incomplete sections)
5. **Implement all mandatory compliance webhooks**
6. **Provide complete, working demo store**
7. **Clear, comprehensive documentation**
8. **Current emergency contact information**
9. **Review all requirements checklist items** before submission
10. **No hardcoded test data** in production environment

**Reference:** [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review), [About the app review process](https://shopify.dev/docs/apps/launch/app-store-review/review-process), [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)

---

## Billing & Monetization

### Available Pricing Models

#### 1. Time-Based Subscriptions (Recurring)
**Use Case:** Fixed monthly/annual recurring charge

- **Billing Intervals:** 30 days or 365 days
- **Characteristics:** Consistent, predictable recurring amount
- **Implementation:** `appSubscriptionCreate` GraphQL mutation
- **Best For:** Monthly SaaS model, fixed-price plans
- **Merchant Experience:** Clear, predictable monthly/yearly costs

**Example:** $10/month, $100/year

#### 2. Usage-Based Subscriptions (Pay-per-Use)
**Use Case:** Variable charges based on app usage

- **Billing Cycle:** Shopify's 30-day billing cycle
- **Characteristics:** Charge based on usage during billing period
- **Implementation:** `appSubscriptionCreate` mutation with usage lines
- **Best For:** Variable usage patterns, overages
- **Merchant Experience:** Unpredictable cost (varies with usage)

**Example:** $0.10 per email sent, overage charges

#### 3. Combined Pricing (Hybrid)
**Use Case:** Base subscription + usage-based charges

- **Billing Interval:** 30-day cycles (only option for hybrid)
- **Characteristics:** Recurring base fee + variable overage charges
- **Implementation:** Combine time-based + usage-based subscription
- **Best For:** Tiered models with base + overage
- **Merchant Example:** $50/month base + $0.50 per transaction over 1000

#### 4. One-Time Charges
**Use Case:** One-time purchase (not recurring)

- **Implementation:** `appPurchaseOneTimeCreate` GraphQL mutation
- **Best For:** Feature packs, credits, add-ons
- **Merchant Experience:** Single charge, no recurring

**Example:** Buy 1000 credits for $50

#### 5. Managed App Pricing
**Use Case:** Pricing without implementing Billing API

- **Characteristics:** Define pricing directly in Partner Dashboard
- **Shopify Automation:** Shopify handles recurring charges, free trials, proration, test charges, price updates
- **Best For:** Simple, fixed pricing plans
- **Implementation:** No need to use Billing API mutations
- **Flexibility:** Lower than Billing API but simpler to manage

### Pricing Best Practices

#### Price Setting
- **Define clear pricing tiers** with increasing value
- **Include free trial** (encourages adoption)
- **Transparent pricing** in app listing (mandatory)
- **No hidden fees** or surprise charges
- **Consider merchant store size** (usage-based may be fairer for variable patterns)

#### Trial Strategy
- Offer 7-14 day free trial (industry standard)
- Can be used with Managed Pricing for automation
- Trial period builds trust with merchants

#### Testing Billing
- **BLOCKING:** Must test billing system before App Store submission
- Use test charges before installing on dev store
- Verify charge creation, charge confirmation, charge declines
- Test refund flows
- Test subscription cancellation

#### Payment Processing
- Shopify processes all payments through Shopify Payments
- Developer receives revenue minus Shopify fee (typically 30% for apps)
- Funds deposited to Partner account
- Payment terms vary based on agreement

### Billing Requirements

#### BLOCKING Billing Requirements
- **Test charges must work** before submission
- **Billing system must function** on dev store
- **Pricing must be clearly displayed** in App Store listing
- **No charges without explicit merchant consent**
- **Refund mechanism** must be available for disputed charges

#### Billing Compliance
- Must handle failed payment attempts gracefully
- Provide merchants ability to view/download invoices
- Clear billing history in app
- Transparent overage notifications
- Ability to cancel subscription at any time

**Reference:** [About billing for your app](https://shopify.dev/docs/apps/launch/billing), [About subscription billing](https://shopify.dev/docs/apps/launch/billing/subscription-billing), [Create usage-based subscriptions](https://shopify.dev/docs/apps/launch/billing/subscription-billing/create-usage-based-subscriptions), [Managed App Pricing](https://shopify.dev/docs/apps/launch/billing/managed-pricing)

---

## Protected Customer Data

### What is Protected Customer Data?

Protected customer data refers to personal information about merchants' customers, including but not limited to:
- Customer email addresses and names
- Customer purchase history
- Customer phone numbers
- Customer order data
- Any PII linked to customer accounts

### Prerequisites for Access

#### Required Steps (In Order)
1. **Select distribution method** for your app (Custom or Public)
2. **Complete Data Protection Details** (in Partner Dashboard)
3. **Ensure app meets protected customer data requirements** (listed below)
4. **Request access via API Access section** of Partner Dashboard (Protected customer data access)
5. **For testing:** Can access customer data on dev store after Step 4 (no review needed)
6. **For production:** Must submit app for review; review team validates requirements met

### Data Protection Requirements (BLOCKING)

#### 1. Data Minimization
- **BLOCKING:** Process only minimum personal data required to provide app functionality
- Do not collect more data than needed
- Example: Don't request customer phone if email is sufficient

#### 2. Transparency
- **BLOCKING:** Inform merchants what personal data app processes
- **BLOCKING:** State reason for processing (use case)
- Publish comprehensive privacy policy
- Link privacy policy from App Store listing
- In-app disclosure of data usage

#### 3. Limited Processing
- **BLOCKING:** Limit data processing to stated purposes only
- Do not repurpose customer data
- Example: If collecting emails for order notifications, cannot use for marketing
- Ensure merchants and customers correctly informed

#### 4. Data Security
- **BLOCKING:** Encrypt access tokens in storage (prevent unauthorized access if DB compromised)
- Use secure transmission (TLS/HTTPS)
- Limit data exposure to minimal required systems
- Regular security audits

#### 5. Retention Policy
- **BLOCKING:** Do not retain customer data longer than necessary
- Implement data deletion when app is uninstalled
- Provide merchants ability to request data deletion
- Document retention periods in privacy policy

#### 6. Webhook Compliance
- **BLOCKING:** Must implement and respond to GDPR webhooks:
  - `customers/data_request` (customer data export request)
  - `customers/redact` (customer deletion request)
  - `shop/redact` (shop deletion request)
- Respond within 30 days of webhook receipt
- Properly delete or anonymize customer data

### Access Scopes & Limitations

#### Scope Requirements
- Request only scopes needed for app functionality
- Over-requesting scopes = rejection risk
- Document why each scope is necessary
- Use most restrictive scopes possible

#### Access Control
- Cannot share access with third parties without explicit merchant consent
- Cannot sell or lease customer data
- Cannot share for marketing purposes without merchant agreement
- Cannot use for competitive analysis or benchmarking

### Legal Basis

Partners bound by:
- Shopify Partner Program Agreement
- Shopify API License and Terms of Use
- GDPR (for EU/UK data)
- CPRA (for California data)
- Other applicable privacy laws by jurisdiction

**Important:** Protected customer data requirements do not replace Partner Program Agreement terms. Both apply.

**Reference:** [Work with protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)

---

## Privacy Requirements (GDPR/CPRA)

### Privacy Policy (BLOCKING)

#### Mandatory Requirements
- **BLOCKING:** Every app must provide a privacy policy
- **BLOCKING:** Privacy policy must be linked from Shopify App Store listing
- **BLOCKING:** Must be publicly accessible (e.g., at company website or https://yourapp.com/privacy)
- Policy must be in language(s) of app users

#### Privacy Policy Content
- **Personal Data Collected:** List all data types collected (emails, names, IP addresses, usage data, etc.)
- **Processing Purposes:** State WHY each data type is collected (order processing, notifications, analytics)
- **Data Retention:** How long data is stored before deletion
- **Third Parties:** Who has access to customer/merchant data (payment processors, analytics, etc.)
- **Data Subject Rights:** How customers/merchants can request access, deletion, correction (GDPR rights)
- **Geographic Data Transfers:** If data leaves customer's country/region, explain safeguards
- **Cookie Policy:** If using cookies, disclose purpose and how to opt-out
- **Contact Information:** How to contact regarding privacy questions

### GDPR Compliance (EU/UK Merchants & Customers)

#### Data Transfer Restrictions
- **BLOCKING:** Cannot transfer personal data outside EEA/UK unless:
  - Adequate safeguards in place (Standard Contractual Clauses, Binding Corporate Rules)
  - Customer/merchant consent obtained
  - Legal basis for transfer exists

#### Mandatory Compliance Webhooks (BLOCKING)
Apps must listen to and properly handle:

##### 1. customers/data_request (Data Export Request)
- **Trigger:** Merchant or customer requests data export (GDPR Article 15 right to access)
- **Deadline:** 30 days to comply
- **Required Response:**
  - Compile all personal data about the requesting customer
  - Provide in portable, human-readable format (JSON, CSV, PDF)
  - Return customer name, email, order history, and any app-specific data
  - Deliver to merchant via email or app interface

##### 2. customers/redact (Data Deletion Request)
- **Trigger:** Customer requests deletion (GDPR Article 17 right to be forgotten)
- **Deadline:** 30 days to comply
- **Required Response:**
  - Permanently delete all personal data about customer from your systems
  - Include: name, email, profile, order history, communication logs
  - Anonymize remaining records (cannot re-identify)
  - Confirm deletion in logs

##### 3. shop/redact (Shop Deletion Request)
- **Trigger:** Merchant closes store or uninstalls app
- **Deadline:** 30 days to comply
- **Required Response:**
  - Delete all data for that shop
  - Include: merchant contact info, shop data, all customer records
  - Clean up databases and backups
  - Confirm deletion

#### Processing Transparency
- **BLOCKING:** Must inform merchants how personal data is processed
- **BLOCKING:** Limit processing to stated purposes only
- Cannot use customer data beyond what disclosed in privacy policy
- Example: Cannot collect customer email for order notifications, then use for marketing emails

#### Lawful Basis for Processing
- Must establish lawful basis for data processing:
  - **Consent:** Explicit customer/merchant agreement
  - **Contract:** Necessary to deliver service
  - **Legal Obligation:** Required by law
  - **Legitimate Interests:** Necessary for business purpose, doesn't override customer rights
- Document basis in privacy policy

### CPRA Compliance (California Merchants & Customers)

#### Rights to Respect
- Right to know what personal data is collected
- Right to delete personal data
- Right to correct inaccurate personal data
- Right to opt-out of sale/sharing of personal data
- Right to non-discrimination for exercising rights

#### Compliance Actions
- Provide privacy policy clearly disclosing data collection
- Implement data deletion webhooks (same as GDPR)
- Enable opt-out mechanisms
- Respond to customer requests within 45 days
- Document processing activities

### Other Privacy Law Jurisdictions

#### Laws Affecting Shopify Apps
- **Canada (PIPEDA):** Similar to GDPR; consent + access rights
- **Australia (Privacy Act):** Australian Consumer Law compliance required
- **Singapore (PDPA):** Explicit consent for sensitive data
- **Others:** Varies by jurisdiction; consult legal counsel

### Privacy Best Practices

#### Implementation
1. **Minimal Data Collection:** Only collect what's necessary
2. **Secure Storage:** Encrypt sensitive data, limit access
3. **Transparent Processing:** Clear disclosure of all processing
4. **Secure Deletion:** Permanently delete data on request
5. **Regular Audits:** Review data handling practices quarterly
6. **Staff Training:** Ensure team understands data protection obligations

#### Documentation
- Privacy policy accessible and clear
- Data processing register (what data, why, how long)
- Data handling procedures documented
- Incident response plan for breaches

**Reference:** [Privacy requirements](https://shopify.dev/docs/apps/launch/privacy-requirements), [Customer Privacy API](https://shopify.dev/docs/api/customer-privacy), [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)

---

## Security Requirements

### BLOCKING Security Requirements

#### 1. OWASP Top 10 Protection
- **BLOCKING:** App must be protected against common web security vulnerabilities
- Shopify enforces OWASP Top 10 compliance
- If vulnerabilities found during review, app rejected; must fix before resubmission

**Top Vulnerabilities to Prevent:**
1. Injection (SQL, command injection)
2. Authentication flaws
3. Sensitive data exposure
4. XML external entities
5. Broken access control
6. Security misconfiguration
7. XSS (Cross-site scripting)
8. Insecure deserialization
9. Using components with known vulnerabilities
10. Insufficient logging/monitoring

#### 2. Access Token Encryption
- **BLOCKING:** Encrypt access tokens in database storage
- Prevents unauthorized access if database is compromised
- Use encryption at rest (AES-256 standard)
- Manage encryption keys securely

#### 3. Secure Transmission
- **BLOCKING:** All data transmission must use TLS/HTTPS
- No unencrypted HTTP for any API calls
- Enforce HTTPS redirects
- Use secure headers (HSTS, CSP, X-Frame-Options)

#### 4. Authentication & Authorization
- **BLOCKING:** Use Shopify OAuth only (do not implement custom auth)
- Validate OAuth state parameter to prevent CSRF attacks
- Implement session token verification
- Use secure session management (httpOnly cookies or secure storage)

#### 5. Access Control
- **BLOCKING:** Verify user permissions before data access
- Row-level security (RLS) for multi-tenant data
- Validate shop ID on every request
- Prevent accessing other shops' data

#### 6. API Rate Limiting
- **BLOCKING:** Implement rate limiting to prevent abuse
- Respect Shopify API rate limits
- Gracefully handle 429 (Too Many Requests) responses
- Implement exponential backoff for retries

#### 7. Data Protection for PII
- **BLOCKING:** Additional protections for protected customer data (see Protected Customer Data section)
- Minimal data collection
- Secure storage and deletion
- Transparent disclosure

#### 8. Third-Party Dependencies
- **BLOCKING:** Do not use libraries with known security vulnerabilities
- Keep dependencies updated
- Run security audits (npm audit, SNYK, etc.)
- Remove unused dependencies

#### 9. Input Validation
- **BLOCKING:** Validate all user input (frontend and backend)
- Sanitize database queries to prevent injection
- Escape output to prevent XSS
- Validate file uploads (type, size, content)

#### 10. Error Handling
- **BLOCKING:** Do not expose sensitive information in error messages
- Log errors securely (no PII in logs)
- Return generic error messages to users
- Log detailed errors securely for debugging

### Security Testing Requirements

#### Before Submission
- **BLOCKING:** Conduct security review before App Store submission
- Perform penetration testing or vulnerability assessment
- Fix all discovered vulnerabilities
- Document security measures in submission

#### During Review
- Shopify security team may conduct security testing
- Vulnerabilities found = rejection + required fixes
- May request security documentation or audit results

### Security Compliance

#### Secure Coding Practices
- Use parameterized queries for database access
- Implement CSRF tokens for state-changing operations
- Use Content Security Policy (CSP) headers
- Implement X-Frame-Options header (allow Shopify embedding)
- Regular security training for developers

#### Incident Response
- Plan for security incident response
- Process for reporting vulnerabilities to Shopify
- Process for notifying merchants of security issues
- Regular security updates and patches

#### Third-Party Services
- Audit security of any third-party APIs/services
- Ensure third parties handle data securely
- Have data processing agreements (DPA) in place
- Responsible disclosure policy

**Reference:** [Protect your app against common web security vulnerabilities](https://shopify.dev/docs/apps/build/security/protect-against-common-vulnerabilities), [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)

---

## Distribution Methods

### 1. Public Distribution (Shopify App Store)

**Best For:** Selling to many merchants, maximizing reach

#### Characteristics
- App listed on Shopify App Store
- Available to all Shopify merchants globally
- Subject to App Store review and approval
- Potential for significant revenue and user base

#### Requirements
- Must pass App Store review (see App Review Process)
- Must meet all App Store requirements (see App Store Requirements)
- Privacy policy required
- Support documentation required
- Pricing must be clearly specified

#### Revenue Share
- Shopify takes 30% of app revenue (standard model)
- Varies based on partnership agreement
- Payment monthly to Partner account

#### Release Process
1. Submit app for review via Dev Dashboard
2. Pass Shopify review team assessment
3. Approve or request changes
4. Once approved, app released to all merchants
5. App automatically available on App Store

### 2. Custom Distribution (Unlisted/Private)

**Best For:** Single merchant apps, Plus organizations, limited merchant groups

#### Characteristics
- App not listed on Shopify App Store
- Shared via custom installation link
- No App Store review required (or limited review)
- Direct merchant relationship

#### Installation Methods
- **Unlisted Public App:** Public distribution method, but limited visibility; has App Store page but not searchable
- **Custom App:** Built exclusively for single store; not on App Store
- **Plus Organization:** Available to multiple stores on same Plus organization via link

#### Requirements (Unlisted/Custom)
- May have reduced review requirements vs. App Store apps
- Privacy policy still required
- Security still evaluated
- Some compliance requirements still apply

#### Merchant Management
- Send installation link directly to merchant
- Merchant clicks link and installs app
- Only merchants with link can install
- Ideal for consultants/agencies building for specific clients

#### Billing
- Revenue share varies (may negotiate different terms for custom apps)
- Depends on distribution agreement

### 3. Selection Process

#### Factors to Consider
- **Reach:** Public = broader audience; Custom = single/specific merchants
- **Revenue Potential:** Public = higher potential; Custom = defined customer base
- **Support Burden:** Public = more support required; Custom = fewer merchants
- **Time to Market:** Custom = faster (no review); Public = slower (review required)
- **Marketplace Visibility:** Public = searchable; Custom = hidden, direct link only

#### Making the Right Choice
1. **Single Merchant Solution:** Custom distribution
2. **Limited Client List:** Unlisted public app or custom distribution
3. **General Product:** Public distribution (Shopify App Store)
4. **Enterprise/Plus Customers:** Custom distribution or unlisted app
5. **SaaS with Multiple Merchant Customers:** Public distribution (App Store)

**Reference:** [About app distribution](https://shopify.dev/docs/apps/launch/distribution), [Select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method), [App listing visibility](https://shopify.dev/docs/apps/launch/distribution/visibility)

---

## App Marketing

### Marketing Channels & Strategy

#### 1. Press Releases & Announcements
- Publish press releases when launching or launching major features
- Helps get product noticed by merchants and industry press
- Submit to developer blogs, tech publications
- Coordinate with product launch timing

#### 2. In-App Promotion
- Use onboarding flow to educate merchants
- Feature announcements and new capabilities
- In-app tip/tutorial system
- Upgrade CTAs for higher-tier plans

#### 3. Content Marketing
- Blog posts about app use cases and best practices
- FAQ documentation
- Tutorial videos (2-3 minutes ideal)
- Changelog updates visible to merchants

#### 4. Community & Partnerships
- Shopify community engagement
- Industry partnerships and integrations
- Affiliate programs (if applicable)
- Integration with complementary apps

#### 5. Paid Advertising
- Cost-per-click (CPC) model on Shopify App Store
- Bidding on keywords in app store search
- Only pay for clicks (not impressions)
- Budget control and daily limits available

#### 6. App Store Optimization (SEO)
- Optimize listing for search discovery (see App Store SEO section)
- Drive external traffic to boost rankings
- Trending apps section based on external traffic

### Shopify App Store Ads

#### How It Works
- **Model:** Pay-per-click (CPC) auction bidding
- **Cost:** Only pay for actual clicks on your ad
- **Placement:** Featured in Shopify App Store search results
- **Reach:** All Shopify merchants searching in App Store

#### Setting Up Ads
1. Access ads section in Partner Dashboard
2. Select keywords to bid on
3. Set bid amount (CPC)
4. Set daily budget cap
5. Create ad creative (usually app card with custom message)
6. Monitor performance and adjust bids

#### Best Practices for Ads
- **Keyword Selection:** Target high-intent keywords relevant to app
- **Bid Strategy:** Start conservative, increase bids for high-converting keywords
- **Messaging:** Focus on unique value proposition and problem solved
- **Budget:** Allocate based on expected customer acquisition cost (CAC)
- **Monitoring:** Track clicks, installs, ROI; adjust regularly

### Shopify Brand Assets & Marketing Guidelines

#### Using Shopify Branding
- Shopify provides approved brand assets and guidelines for marketing
- Use official Shopify logo and colors in marketing materials
- Follow guidelines for proper attribution
- Do not modify or misrepresent Shopify branding

#### Asset Availability
- Logos in various formats (PNG, SVG)
- App Store assets and badges
- Marketing templates
- Brand color palette and guidelines

#### Guidelines
- Proper spacing around logos
- Avoid trademarking Shopify terms
- Respect Shopify intellectual property
- Disclose that app is "for Shopify" or "Shopify app" as appropriate
- Do not use Shopify branding to imply endorsement

### Go-to-Market Success Strategy

#### Pre-Launch Phase
- Develop target merchant persona
- Identify key pain points solved
- Create marketing messaging and assets
- Plan launch announcement and timeline

#### Launch Phase
- Press release and media outreach
- Product hunt or similar launch platforms
- Email outreach to early adopter community
- Social media campaign

#### Post-Launch Phase
- Gather reviews and testimonials
- Iterate on marketing messaging based on feedback
- Optimize app store listing based on performance data
- Plan content marketing calendar

#### Growth Phase
- Paid advertising on App Store
- Content marketing and thought leadership
- Community building and partnerships
- Feature announcements driving updates

### Measuring Marketing Success

#### Key Metrics
- **App Store Impressions:** How many times app appears in search
- **App Store Clicks:** How many times merchants click through
- **Installation Rate:** % of clicks that lead to installation
- **Trial-to-Paid Conversion:** % of free trial users converting to paid
- **Retention:** % of customers still active after X days/months
- **Churn Rate:** % of customers canceling subscription
- **Revenue:** Total revenue generated from app

#### Analytics Tools
- Shopify Partner Dashboard analytics
- Third-party analytics (Google Analytics, Mixpanel, etc.)
- App Store performance data
- Customer feedback platforms

**Reference:** [About marketing your app](https://shopify.dev/docs/apps/launch/marketing), [About Shopify App Store ads](https://shopify.dev/docs/apps/launch/marketing/advertising), [Shopify brand assets for marketing your app](https://shopify.dev/docs/apps/launch/marketing/shopify-brand-assets)

---

## Performance Requirements

### BLOCKING Performance Requirements

#### 1. Storefront Impact (Lighthouse)
- **BLOCKING:** App must not reduce storefront Lighthouse score by more than 10 points
- Applies to apps with storefront components (Web Pixels, Theme Apps, etc.)
- Measured on representative storefront pages
- Lighthouse score calculated as weighted average across pages

#### 2. Admin Performance (Built for Shopify Only)
- **Requirement:** For Built for Shopify apps, additional benchmarks apply
- **Checkout p95 Response Time:** ≤ 500ms (minimum 1000 requests over 28 days, 0.1% failure rate max)
- **Admin Load Time:** App should load quickly without blocking admin UX

#### 3. General Performance Budget
- **JavaScript:** Entry point < 10KB
- **CSS:** Entry point < 50KB per page
- **Load Behavior:** Lazy-load above-the-fold content first, interactive content loads on interaction
- **Rendering:** Use skeleton components during initial load (especially checkout)

### Performance Benchmarks & Testing

#### Core Web Vitals
- **LCP (Largest Contentful Paint):** < 2.5s
- **FID (First Input Delay):** < 100ms
- **CLS (Cumulative Layout Shift):** < 0.1
- Shopify uses these metrics to evaluate app performance

#### Testing Methodology
- Lighthouse test on storefront pages (with app installed vs. without)
- Measure performance regression
- Calculate weighted average across multiple pages
- > 10 point reduction = failure

#### Performance Tools
- Google Lighthouse (built-in to Chrome DevTools)
- Google PageSpeed Insights
- WebPageTest
- Shopify's built-in performance monitoring

### Performance Optimization Strategies

#### Code Optimization
- Minimize JavaScript bundle size
- Code splitting for lazy-loaded features
- Tree-shaking unused code
- Minification and compression

#### Asset Optimization
- Image optimization (format, compression, responsive)
- CSS optimization (remove unused styles, minification)
- Font optimization (preload, subset, WOFF2 format)
- Gzip compression for all assets

#### Rendering Optimization
- Critical rendering path optimization
- Above-the-fold content prioritization
- Skeleton/placeholder loading states
- Defer non-critical JavaScript

#### Caching Strategy
- Browser caching (Cache-Control headers)
- Service worker for offline capability
- CDN distribution for static assets
- API response caching where appropriate

#### Third-Party Services
- Minimize third-party scripts impact
- Async load non-critical third parties
- Monitor third-party performance
- Fallback mechanisms if third parties slow

### Performance Review During App Store Review

#### What Shopify Tests
- Storefront Lighthouse performance impact
- Admin panel responsiveness
- App load time
- Resource consumption
- Rendering performance

#### Failure Points
- > 10 point Lighthouse reduction = potential rejection
- Slow load times = poor user experience
- Excessive resource consumption = unacceptable performance
- Blocking rendering = unacceptable

#### Monitoring Post-Launch
- Shopify continuously monitors app performance
- Performance regression in live app may result in delisting
- Regular performance audits recommended
- Update app to address performance issues if flagged

**Reference:** [About performance optimization](https://shopify.dev/docs/apps/build/performance), [General best practices for app performance](https://shopify.dev/docs/apps/build/performance/general-best-practices), [Built for Shopify requirements](https://shopify.dev/docs/apps/launch/built-for-shopify/requirements)

---

## Deployment & Version Management

### App Versions

#### What is an App Version?
- Snapshot of app configuration and all extensions at a point in time
- Includes app settings, extension configurations, webhooks, scopes
- Created when deploying changes via Shopify CLI or Dev Dashboard
- Released to merchants (or kept as draft)

#### Version Management Features
- **Naming:** Provide version name/message for clarity
- **CI/CD Integration:** Deploy automatically from CI/CD pipeline
- **Source Control Link:** Link version to Git commit URL
- **Draft Versions:** Create without releasing (for staging/testing)
- **Rollback:** Can release previous version if needed

### Deployment Process

#### Using Shopify CLI

##### Basic Deploy Command
```bash
shopify app deploy
```
- Builds app code and extensions
- Creates new app version
- Pushes configuration to Shopify

##### Deploy with Options
```bash
shopify app deploy --version="v1.0.0" --message="Initial release"
shopify app deploy --config=production.toml
shopify app deploy --allow-updates
shopify app deploy --source-control-url=https://github.com/owner/repo/commit/abc123
```

**Flags:**
- `--version`: Name the version
- `--message`: Version message/changelog
- `--config`: Specify config file (alternative config)
- `--allow-updates`: Allow config changes (required for some deployments)
- `--source-control-url`: Link to Git commit

##### Release Process
After deploying (creating version), release it:
```bash
shopify app release
```
- Releases most recent unreleased version
- Makes app available to merchants
- Shops with app auto-updated to new version

#### Dev Dashboard Deployment
Alternative to CLI:
1. Navigate to Dev Dashboard
2. Go to "Versions" section
3. Create new version
4. Review changes
5. Release version when ready

### Continuous Deployment (CI/CD)

#### Integration Steps
1. **Authenticate:** Set up Shopify CLI auth in CI/CD environment
2. **Install Dependencies:** npm install or yarn install
3. **Run Tests:** npm test (pre-deployment validation)
4. **Run Build:** npm run build
5. **Deploy:** shopify app deploy (with --config and --allow-updates flags)
6. **Release:** shopify app release (automatic or manual approval)

#### CI/CD Example (GitHub Actions)
```yaml
name: Deploy to Shopify
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
      - run: npm run build
      - run: shopify app deploy --config=production.toml --allow-updates
      - run: shopify app release
```

### Version Tracking & Rollback

#### Managing Versions
- Each version is immutable once released
- Can view all versions in Dev Dashboard
- Versions have unique IDs for tracking
- Release history visible to all developers

#### Rollback Process
1. Identify previous stable version ID
2. In Dev Dashboard, select previous version
3. Click "Release" to rollback
4. Merchants auto-updated to rollback version

#### Version Release Notes
- Create changelog entries for merchants
- Visible in app admin page
- Help track what changed in each release
- Communicate new features, fixes, improvements

### Deployment Best Practices

#### Pre-Deployment
1. **Run full test suite** before deploying
2. **Build verification** (npm run build succeeds with no errors)
3. **Config validation** (all required settings present)
4. **Security check** (no hardcoded secrets, API keys, credentials)
5. **Performance check** (no regressions, Lighthouse score acceptable)

#### Deployment Strategy
- **Staging First:** Deploy to staging/test app first
- **Monitor Deployment:** Watch for errors, check logs
- **Gradual Rollout:** Release to subset of merchants first (if supported)
- **Monitoring:** Monitor app logs, error rates, performance metrics after release

#### Post-Deployment
1. **Smoke Test:** Verify basic functionality on live app
2. **Monitor Logs:** Check for errors or warnings in Dev Dashboard logs
3. **User Communication:** Notify merchants of updates (if major)
4. **Gather Feedback:** Monitor for user-reported issues

**Reference:** [Deploy app versions](https://shopify.dev/docs/apps/launch/deployment/deploy-app-versions), [About deployment](https://shopify.dev/docs/apps/launch/deployment), [Deploy app components in a CD pipeline](https://shopify.dev/docs/apps/launch/deployment/deploy-in-ci-cd-pipeline)

---

## Updates & Maintenance

### Changelog & Communication

#### Release Notes Best Practices
- **Document all changes** in changelog visible to merchants
- **New Features:** Highlight capability additions
- **Improvements:** Document enhancements to existing features
- **Bug Fixes:** List fixed bugs (can be brief)
- **Breaking Changes:** Clearly communicate any breaking changes
- **Deprecations:** Warn about upcoming deprecations with timeline

#### Changelog Location
- In-app changelog link (from app listing or settings)
- Partner Dashboard version release notes
- Developer website changelog
- Email notification to installed merchants (optional)

#### Frequency & Timing
- Regular updates (monthly recommended minimum)
- Emergency hotfixes as needed for critical bugs
- Backward-compatible updates preferred (avoid breaking changes)
- Deprecation notices 30-90 days before removal

### Staying Current with Platform

#### Shopify API Updates
- Subscribe to Shopify Developer Changelog (shopify.dev/changelog)
- Filter by API version and topics relevant to your app
- Monitor deprecation notices
- Plan updates before 90-day deprecation window

#### Dependency Updates
- Regular npm/package updates (monthly recommended)
- Security patch updates (immediate)
- Monitor for dependency vulnerabilities (npm audit)
- Test thoroughly after dependency updates

#### Feature Deprecation Management
- Plan for API deprecation windows (90 days minimum notice)
- Update app code before deprecation deadline
- Test with new API versions in staging first
- Deploy updated code before deadline

### Long-Term Maintenance

#### Support & Customer Success
- **Response Time:** Address merchant support issues promptly
- **Bug Fixes:** Prioritize critical bugs
- **Documentation:** Keep help docs current
- **Feedback:** Listen to merchant feedback for improvements

#### Feature Roadmap
- Plan new features based on merchant feedback
- Communicate roadmap to users (builds trust)
- Prioritize high-demand features
- Consider feature deprecation if no longer useful

#### Monitoring & Alerting
- Set up error tracking (Sentry, similar)
- Monitor app performance metrics
- Alert on performance degradation
- Review error logs regularly

#### Compliance Updates
- Monitor privacy law changes (GDPR updates, CPRA implementation)
- Update privacy policy when laws change
- Test compliance webhooks periodically
- Ensure data handling complies with latest regulations

**Reference:** [Recent changes to Shopify's platform](https://shopify.dev/changelog), [Getting technical updates](https://shopify.dev/docs/api/usage/versioning/updates)

---

## Pre-Launch Testing

### Testing Requirements (BLOCKING)

#### 1. Functional Testing on Dev Store
- **BLOCKING:** Must test app on a development store before submission
- **BLOCKING:** Test for bugs and errors
- **BLOCKING:** Verify all features work as described in listing
- **BLOCKING:** Test all app functionality end-to-end

#### 2. URL & Redirect Testing
- **BLOCKING:** Test app URLs and redirects
- **BLOCKING:** Verify App URL redirects to OAuth consent screen
- **BLOCKING:** Verify allowed redirection URLs work correctly
- **BLOCKING:** Ensure OAuth flow completes successfully

#### 3. Billing System Testing
- **BLOCKING:** Must test billing before App Store submission
- **BLOCKING:** Test app-charges creation (one-time)
- **BLOCKING:** Test subscription creation and billing cycles
- **BLOCKING:** Test charge confirmations and failures
- **BLOCKING:** Use test charges (no real charges on test app)
- **BLOCKING:** Verify refund flows work

#### 4. Protected Data Testing
- If app uses customer data, test protected data access
- Verify GDPR webhooks respond correctly
- Test data export functionality
- Test data deletion functionality

#### 5. Completeness Test
- **BLOCKING:** App must be production-ready
- **BLOCKING:** No incomplete features or sections
- **BLOCKING:** No debug mode or beta flags in production
- **BLOCKING:** All documentation complete and accurate

#### 6. API Scope Testing
- Verify only necessary API scopes are requested
- Test that app functions with requested scopes only
- Ensure no over-requesting of permissions

### Testing Checklist

#### Core Functionality
- [ ] App installs successfully on dev store
- [ ] All features described in listing work correctly
- [ ] App configuration accessible and functional
- [ ] No runtime errors or warnings
- [ ] All workflows complete successfully

#### OAuth & Authentication
- [ ] OAuth flow works end-to-end
- [ ] Merchant redirected to consent screen
- [ ] Consent granted successfully
- [ ] App receives authorization code
- [ ] Access token stored securely

#### URLs & Redirects
- [ ] App URL points to correct location
- [ ] OAuth redirect URLs match registered URLs
- [ ] HTTPS enforced
- [ ] No mixed content (HTTPS page + HTTP resources)

#### Billing
- [ ] Test charge creation works
- [ ] Charge confirmation email received
- [ ] Charge appears in merchant admin
- [ ] Subscription creation works (if applicable)
- [ ] Billing cycle tracking correct
- [ ] Refund process documented and tested

#### Privacy & Compliance
- [ ] Privacy policy linked and accessible
- [ ] GDPR webhooks implemented
- [ ] Data export webhook responds (if applicable)
- [ ] Data deletion webhook responds (if applicable)
- [ ] Data deletion actually deletes data

#### Performance
- [ ] App loads within acceptable time
- [ ] UI responsive and interactive
- [ ] No performance-blocking operations
- [ ] Lighthouse score acceptable (< 10pt reduction)

#### Documentation
- [ ] Help documentation complete and accurate
- [ ] FAQ covers common questions
- [ ] Support contact information current
- [ ] Changelog up to date
- [ ] Privacy policy in place

#### Security
- [ ] No hardcoded API keys or secrets
- [ ] HTTPS enforced everywhere
- [ ] API keys stored in environment variables
- [ ] Session tokens validated
- [ ] User input sanitized

### Common Testing Failures

#### Why Apps Fail Pre-Submission
1. **Untested on Dev Store:** App not actually installed/tested
2. **Bugs Present:** Errors or crashes during normal use
3. **Billing Broken:** Charges don't work or fail silently
4. **Incomplete Features:** Some features non-functional or missing
5. **No Support Docs:** Help documentation missing or inadequate
6. **Security Issues:** Vulnerabilities discovered during testing
7. **Performance:** App significantly impacts Lighthouse score
8. **Compliance:** Privacy policy missing, webhooks not implemented

### Pre-Submission Verification

Before clicking "Submit for Review":
1. **Install on Fresh Dev Store:** Use a new dev store (isolates testing)
2. **Follow User Journey:** Test as new merchant would
3. **Test Edge Cases:** Error states, edge cases, limits
4. **Verify All Docs:** Docs are complete, accurate, helpful
5. **Review Requirements:** Check against app requirements checklist
6. **Security Audit:** Review code for vulnerabilities
7. **Performance Test:** Run Lighthouse, ensure acceptable score

**Reference:** [Checklist of requirements for apps in the Shopify App Store](https://shopify.dev/docs/apps/launch/app-requirements-checklist), [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review), [Test apps locally](https://shopify.dev/docs/apps/build/cli-for-apps/test-apps-locally)

---

## Merchant Trust & Transparency

### Building and Maintaining Merchant Trust

#### Transparency in Data Handling
- **BLOCKING:** Privacy policy must clearly disclose all data collection
- **BLOCKING:** Merchants must understand what data is collected and why
- **BLOCKING:** Data must only be used for stated purposes
- Transparency is key to earning merchant trust and enabling compliance

#### Consistent User Experience
- App UI should match Shopify admin appearance and behaviors
- Merchant workflows should flow naturally between app and Shopify admin
- Consistency builds trust because merchants' experience is predictable
- Follow Shopify design patterns and guidelines

#### Data Minimization & Security
- Only collect personal data necessary for app functionality
- Don't request more permissions or scopes than needed
- Implement strong data security practices
- Publicly explain security measures taken

#### Privacy-by-Design
- Minimize data collection from the start
- Implement data retention limits
- Provide easy data deletion to merchants
- Default to privacy-protective settings

### Quality & Reliability

#### Consistent Performance
- App should load quickly and responsively
- Avoid performance regressions in updates
- Communicate performance expectations
- Monitor and address performance issues

#### Reliability & Uptime
- Strive for high availability (99.9% uptime target)
- Communicate planned maintenance windows
- Have incident response plan for outages
- Address issues promptly

#### Code Quality
- Regular updates to fix bugs and security issues
- Comprehensive testing before releases
- Monitoring and error tracking
- Graceful error handling (good error messages)

### Support & Documentation

#### Responsive Support
- Provide clear support channels (email, chat, help desk)
- Respond to merchant issues promptly
- Maintain knowledge base of common issues
- Gather feedback from support interactions

#### Help Documentation
- Comprehensive guides for app setup and use
- Screenshots and step-by-step instructions
- FAQ addressing common questions
- Video tutorials for complex features

#### Communication
- Keep changelog updated with improvements
- Announce new features and updates
- Communicate security patches
- Be proactive about issues or limitations

### Honesty & Integrity

#### Accurate Listing Information
- App listing must accurately describe features
- Don't misrepresent capabilities or limitations
- Pricing must be clear and honest
- Update listing if features change

#### No Hidden Fees
- Clearly disclose all costs upfront
- No surprise charges or hidden fees
- Transparent about usage-based billing
- Clear upgrade/downgrade process

#### Ethical Business Practices
- No spam or aggressive marketing
- Respect merchant preferences for communication
- No accessing/using data beyond stated purposes
- No selling or sharing customer data without consent

### Built for Shopify as Trust Signal

#### What It Means to Merchants
- **Quality Assurance:** App meets Shopify's high standards
- **Performance:** App won't degrade their store performance
- **Security:** App properly handles merchant and customer data
- **Design:** App integrates seamlessly with Shopify admin
- **Support:** App developer is committed to ongoing quality

#### How It Builds Trust
- Visible badge on app listing signals quality
- Searchable filter helps merchants find trustworthy apps
- Indicates developer commitment to excellence
- Reduces perceived risk of installing app

**Reference:** [Privacy requirements](https://shopify.dev/docs/apps/launch/privacy-requirements), [About Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)

---

## App Store SEO & Discovery

### Shopify App Store Search Engine

#### How Merchants Find Apps
- Keyword search (primary)
- Category browsing
- Built for Shopify filter
- Trending apps section
- Recommendations based on app usage patterns

#### Search Algorithm Factors
- **Keywords Relevance:** App title, description, search terms
- **Category Fit:** Correct categorization and tags
- **Listing Completeness:** All fields filled in accurately
- **Merchant Traffic:** External traffic to app (from outside App Store)
- **Reviews & Ratings:** App quality signals
- **Built for Shopify Status:** Eligible apps rank higher
- **Recency:** Recent updates and activity

### Keyword Strategy

#### Keyword Research & Selection
- Identify high-intent merchant search terms
- Use 5 relevant keywords (complete words, not partial)
- One idea per keyword term
- Examples: "email marketing" (good), "email marketing for leads" (avoid)

#### Keyword Best Practices
- **Specificity:** Use specific, relevant keywords (avoid generic)
- **Volume:** Balance between common and niche terms
- **Competition:** Consider difficulty (common terms harder to rank for)
- **Variations:** Include multiple spellings (popup/pop-up)
- **Don't Overuse:** Keyword stuffing decreases discoverability

#### Keyword Placement
- **Title:** Primary keyword in app title
- **Description:** Keywords naturally woven into description
- **Search Terms Field:** All 5 keywords listed
- **Category/Tags:** Keywords reflected in categorization

### App Listing Optimization

#### Title Optimization
- Lead with brand name or primary keyword
- Keep to 30 characters (display limit)
- Clear, benefit-focused language
- Avoid filler words or weak language
- Examples:
  - Good: "Email Marketing" or "Email Marketing Pro"
  - Avoid: "The Ultimate Email Solution for Your Store"

#### Description Optimization
- Start with hook (first 2-3 sentences for merchants who skim)
- Explain core benefits and problems solved
- Use merchant language (not technical)
- Include relevant keywords naturally (not forced)
- Break into short paragraphs for readability
- Call-to-action: "Install" or "Start Free Trial"

#### Meta Description (for Store Listing Page)
- 155-160 characters (displays in search results)
- Include primary keyword
- Compelling hook or unique value prop
- Not just a repeat of title
- Call-to-action (e.g., "Install for free")

#### Category & Tags
- **Primary Category:** Most accurate single category
- **Structured Features:** Up to 25 features per category
- **Help merchants compare:** Features enable comparison across similar apps

#### Visual Assets Optimization
- **Icon:** Bold, recognizable, professional (no text)
- **Screenshots:** Show key features, use annotations
- **Video:** Best way to showcase impact (2-3 min, promotional)

### Driving External Traffic

#### Why External Traffic Matters
- **Ranking Boost:** Apps with significant external traffic rank higher
- **Trending Section:** High external traffic apps appear in "Trending" section
- **Merchant Validation:** Traffic signals app is popular outside App Store

#### Traffic Sources
- Press coverage and blog mentions
- Social media promotion
- Direct outreach campaigns
- Affiliate/partner promotions
- Industry publications and reviews
- Content marketing driving to landing page with app link

#### Tracking External Traffic
- Measure install-to-traffic ratio
- Compare organic vs. external installs
- Correlate external campaigns with ranking improvements
- Prioritize high-ROI traffic sources

### Category & Feature Selection

#### Category Selection
- Choose category matching primary use case
- Only one primary category
- Example categories:
  - Sales channels
  - Marketing
  - Shipping
  - Fulfillment
  - Accounting
  - Email & SMS marketing
  - Admin tools

#### Feature Selection (Structured Features)
- Up to 25 features describing functionality
- Helps merchants search and compare
- Examples:
  - "Email campaigns"
  - "Subscriber management"
  - "A/B testing"
  - "Abandoned cart recovery"
- More specific and detailed features aid discoverability

### App Store Ranking Factors

#### Primary Ranking Signals
1. **Keyword Relevance:** Does app match search terms?
2. **Listing Completeness:** All fields filled accurately?
3. **External Traffic:** Does app get installs from outside App Store?
4. **Built for Shopify Status:** Is app Built for Shopify eligible?
5. **Reviews & Ratings:** Do merchants give positive reviews?
6. **Recent Activity:** Is app actively maintained and updated?

#### Secondary Ranking Signals
- App category fit
- Number of installations (popularity)
- Uninstall rate (indicates quality)
- Merchant engagement after install
- Update frequency and recency

### Monitoring & Optimization

#### Tracking Metrics
- **Impressions:** How many times app appears in search results
- **Click-Through Rate (CTR):** % of impressions that click through
- **Conversion Rate:** % of clicks that install app
- **Ranking Position:** Where app ranks for key search terms
- **Reviews & Ratings:** Merchant satisfaction signal

#### Optimization Cycle
1. **Identify Keywords:** Research high-intent, relevant keywords
2. **Optimize Listing:** Update title, description, keywords, categories
3. **Monitor Performance:** Track ranking and traffic
4. **Analyze Competitors:** See how similar apps position themselves
5. **Iterate:** Based on data, make incremental improvements

#### Tools & Resources
- Shopify Partner Dashboard (install data, search impressions)
- Third-party app analytics tools
- Google Analytics (for external traffic)
- App Store ad performance data

**Reference:** [Best practices for apps in the Shopify App Store](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices), [App listing categories](https://shopify.dev/docs/apps/launch/app-store-review/app-listing-categories), [About marketing your app](https://shopify.dev/docs/apps/launch/marketing)

---

## Summary: Critical Path to Launch

### BLOCKING Requirements (Must Have)
1. Privacy policy linked in App Store listing
2. Demo store provided and working
3. Billing system tested (test charges work)
4. App is production-ready (no bugs, complete features)
5. GDPR/compliance webhooks implemented
6. Secure OAuth implementation
7. No APIs deprecated within 90 days
8. Support documentation complete
9. Clear pricing displayed
10. No hardcoded secrets/API keys

### Priority Order for Launch Preparation
1. **Week 1:** Set up dev store, test core functionality
2. **Week 2:** Implement privacy policy, GDPR webhooks
3. **Week 3:** Test billing, security audit, performance testing
4. **Week 4:** Complete App Store listing, prepare marketing assets
5. **Week 5:** Final testing, submit for review

### Common Rejection Reasons (Avoid These)
- Missing or incomplete privacy policy
- Billing doesn't work or not tested
- App has bugs or crashes
- No demo store or demo store broken
- Incomplete features or documentation
- Security vulnerabilities found
- Over-requesting API permissions/scopes
- Using deprecated APIs
- Not production-ready

### Built for Shopify Path (Premium Status)
- Additional requirements beyond App Store
- Focus on design, performance, security
- Higher standards for merchant experience
- Priority review queue for future apps
- Higher ranking in App Store search

---

## Key Resource Links

- [Launch Overview](https://shopify.dev/docs/apps/launch)
- [App Store Requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Requirements Checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
- [Built for Shopify](https://shopify.dev/docs/apps/launch/built-for-shopify)
- [App Review Process](https://shopify.dev/docs/apps/launch/app-store-review/review-process)
- [Billing & Monetization](https://shopify.dev/docs/apps/launch/billing)
- [Protected Customer Data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Privacy Requirements](https://shopify.dev/docs/apps/launch/privacy-requirements)
- [Security](https://shopify.dev/docs/apps/build/security/protect-against-common-vulnerabilities)
- [Distribution](https://shopify.dev/docs/apps/launch/distribution)
- [Marketing](https://shopify.dev/docs/apps/launch/marketing)
- [Performance](https://shopify.dev/docs/apps/build/performance)
- [Deployment](https://shopify.dev/docs/apps/launch/deployment)
- [Changelog & Updates](https://shopify.dev/changelog)

---

**Document Status:** Complete extraction of all LAUNCH phase documentation
**Last Updated:** 2026-04-04
**Usage:** Reference guide for the project Shopify app submission and compliance
