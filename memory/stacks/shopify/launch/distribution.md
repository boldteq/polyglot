# Distribution Methods — Public vs Custom

> Source: shopify.dev/docs/apps/launch/distribution
> Last extracted: 2026-04-04

## Distribution Options

### 1. Public Distribution (Shopify App Store)

**Best For:** Selling to many merchants, maximizing reach

#### Characteristics
- App listed on Shopify App Store
- Available globally to all Shopify merchants
- Subject to App Store review and approval
- High visibility and potential reach
- 30% revenue share (Shopify commission)

#### Requirements
- Pass App Store review (see review.md)
- Meet all 11 BLOCKING requirements
- Comprehensive listing with screenshots
- Support documentation
- Privacy policy linked
- Working demo store

#### Benefits
- Maximum reach (1M+ potential merchants)
- Passive discovery (App Store search, browsing)
- Credibility boost (reviewed by Shopify)
- Payment processing handled
- Access to Shopify ecosystem

#### Drawbacks
- Strict review process
- 2-5 week review timeline
- 30% Shopify commission
- Ongoing support requirements
- Must maintain and update

#### Release Timeline
1. Submit for review
2. Shopify reviews (2-5 days)
3. Approved or rejected
4. If approved: auto-released to all merchants
5. If rejected: fix issues, resubmit

---

### 2. Custom Distribution (Unlisted/Private)

**Best For:** Single merchant apps, Plus organizations, client-specific builds

#### Types

**2A. Unlisted Public App**
- Not searchable on App Store
- Has App Store listing (not visible in search)
- Shared via direct installation link
- Limited App Store review
- Flexible release process

**2B. Private/Custom App**
- Built exclusively for single store
- Not on App Store at all
- Internal app for specific merchant
- No public listing
- No review required

**2C. Plus Organization Apps**
- Available to multiple stores on same Plus organization
- Shared via custom installation link
- Ideal for enterprise customers
- Direct control over distribution

#### Characteristics
- App not discoverable on App Store
- Shared via custom installation link
- No public listing required
- May have reduced review requirements
- Direct merchant relationships

#### Requirements
- Privacy policy required (even if custom)
- Security review may still apply
- Some compliance still needed
- Documentation for merchants

#### Benefits
- Faster to market (no review or limited review)
- Direct merchant relationships
- Customization per client
- Control over who installs
- Potentially higher margins (no 30% cut)

#### Drawbacks
- No passive discovery
- Must directly distribute to merchants
- Manual merchant onboarding
- Limited audience (known clients only)
- Scaling difficult (custom per client)

#### Installation Process
1. Create app in Partner Dashboard
2. Generate custom installation link
3. Share link directly with merchant
4. Merchant clicks link and installs
5. Only merchants with link can install

---

### 3. Selection Matrix

| Factor | Public | Custom |
|--------|--------|--------|
| **Reach** | Global (all merchants) | Specific merchants |
| **Time to Market** | 2-5 weeks (review) | Days (minimal review) |
| **Revenue Potential** | High (1000s of merchants) | Limited (known clients) |
| **Effort** | Build product, marketing, support | Client-specific customization |
| **Commission** | 30% Shopify take | Varies (negotiate) |
| **Support Burden** | Many merchants, varied use cases | Few merchants, known needs |
| **Scaling** | Reuse same product for all | Customize per client |

---

## Decision Framework

### Choose **Public Distribution** If:
1. **Selling a SaaS product** — building for many merchants, not specific clients
2. **General problem solved** — app solves broad merchant need
3. **Ready to scale** — willing to support many merchants
4. **Passive revenue goal** — want merchants to find and install independently
5. **Examples:** Email marketing, inventory management, SEO tools

### Choose **Custom Distribution** If:
1. **Building for specific client** — agency building for one merchant
2. **Highly customized** — app tailored to client's exact workflow
3. **Client relationship** — ongoing engagement with merchant
4. **Limited audience** — not interested in broader market
5. **Examples:** Custom reports for Plus account, integration for agency partner

---

## Installation Methods

### Public App Installation
```
1. Merchant browses Shopify App Store
2. Finds your app
3. Clicks "Add app"
4. Authorizes OAuth scopes
5. App installed on their store
6. Merchant pays subscription (if applicable)
```

### Custom App Installation
```
1. You provide installation link: https://admin.shopify.com/oauth/authorize?client_id=...
2. Merchant clicks link
3. Redirected to Shopify OAuth flow
4. Merchant authorizes scopes
5. App installed on their store
6. Billing handled directly (custom integration)
```

---

## Revenue Share Comparison

### Public Distribution (30% Shopify Commission)
```
Merchant pays: $10/month
Shopify takes: $3 (30%)
Developer receives: $7
100 merchants: $700/month

Shopify handles: payment processing, customer support, hosting
```

### Custom Distribution (Variable)
```
Client pays: $10/month
No Shopify commission (may negotiate)
Developer receives: $10
Billing: handled by you (custom integration)
100 clients: $1,000/month

You handle: billing, customer support, hosting
```

### Economic Analysis
```
Scenario: 100 merchants at $10/month

Public Distribution:
- Revenue: $1,000/month
- Shopify takes: $300 (30%)
- You keep: $700
- Effort: Build once, support many

Custom Distribution:
- Revenue: $1,000/month (no commission)
- You keep: $1,000
- Effort: Build custom, support each client
- Cost: Billing system, custom integration per client
```

---

## Unlisted Public App

### Use Case
- Public app that should be discoverable via direct link
- Not searchable on App Store (no search results)
- Has Shopify App Store listing (not visible in search)
- Direct URLs work, but organic discovery disabled

### Benefits
- Flexible release (less strict review than public)
- Still on Shopify platform
- Custom distribution links work
- Can upgrade to public later

### Limitations
- Not discoverable in App Store search
- Still may require App Store review
- Limited passive discovery

---

## Switching Distribution Methods

### Public → Custom
- Cannot downgrade public app to custom
- Must create new custom app
- Public app remains published

### Custom → Public
- Can upgrade custom app to public
- Must submit for App Store review
- Review process starts from scratch

---

## Best Practices

### Public Distribution Strategy
- **Launch:** Start with solid product, comprehensive support
- **Iterate:** Listen to merchant feedback, release updates
- **Market:** Drive external traffic to boost App Store ranking
- **Support:** Maintain support team for merchant questions
- **Updates:** Regular changelog updates show active maintenance

### Custom Distribution Strategy
- **Discovery:** Direct outreach to target clients
- **Customization:** Build for client's specific needs
- **Relationship:** Maintain strong client relationships
- **Integration:** Custom billing/integration per client
- **Documentation:** Clear setup documentation for each client

---

## Checklist

### For Public Distribution
- [ ] App solves broad merchant problem
- [ ] Ready for large audience
- [ ] Support infrastructure in place
- [ ] Willing to meet strict review standards
- [ ] Product stable and production-ready
- [ ] 30% commission acceptable

### For Custom Distribution
- [ ] Building for specific client(s)
- [ ] Client relationship established
- [ ] Custom integration/billing handled
- [ ] Limited audience acceptable
- [ ] Prefer higher margins
- [ ] Minimal support expectations

---

## References

- **Distribution Overview:** https://shopify.dev/docs/apps/launch/distribution
- **Select Distribution Method:** https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
- **App Listing Visibility:** https://shopify.dev/docs/apps/launch/distribution/visibility
