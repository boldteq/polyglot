# Shopify Build Phase — Technical Extraction
## Customer Accounts, POS, Marketing, B2B, Markets, Blockchain, Flow, Integration, Dashboard

**Extracted:** 2026-04-04
**Source:** shopify.dev official developer documentation
**Scope:** Build phase patterns, constraints, code patterns, and pitfalls

---

## 1. Customer Accounts (shopify.dev/docs/apps/build/customer-accounts)

### 1.1 Overview & Security Model

- **Sandbox isolation**: Customer account UI extensions run in an isolated sandbox, separate from the customer account page and other extensions
- **No sensitive data access**: Extensions cannot access payment information, customer account HTML, or other assets
- **Safe customization**: Provides secure way to customize Order Index, Order Status, and Profile pages without compromising security
- **Use case**: Primary opportunity for adding functionality to customer journey, especially order status tracking

**Source**: [Building apps for customer accounts](https://shopify.dev/docs/apps/build/customer-accounts)

### 1.2 Extension Placement & Targets

#### Full-Page Extensions
- **Targets**:
  - `customer-account.page.render` — renders new page not tied to specific order
  - `customer-account.order.page.render` — renders page tied to specific order
- **Constraint**: Full-page extensions cannot use direct linking
- **Workaround**: Create order action extension or inline extension on Order status page to provide navigation

**Source**: [Add pages to customer accounts - Full-page extensions](https://shopify.dev/docs/apps/build/customer-accounts/full-page-extensions)

#### Order Action Extensions
- **Targets**:
  - `customer-account.order.action.menu-item.render` — renders as 1 order action on Order Index and Order Status pages
  - `customer-account.order.action.render` — static target that renders inside modal when customer clicks order action button
- **Behavior**: Order action modal only renders if order action button (`menu-item.render`) is also implemented
- **Use case**: Quick actions from order context (e.g., request return, track shipment, download invoice)

**Source**: [customer-account.order.action.render](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/targets/order-action-menu/customer-account-order-action-render), [customer-account.order.action.menu-item.render](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/targets/customer-account-order-action-menu-item-render)

#### Inline Extensions
- **Placement**: Render UI at specific locations on Order status page
- **Targets**: Multiple `customer-account.order-status.*` targets for rendering before/after specific sections
- **Use case**: Add context-specific information inline (e.g., return tracking, shipping updates)

**Source**: [Build an inline order status UI extension](https://shopify.dev/docs/apps/build/customer-accounts/inline-extensions/build-order-status)

### 1.3 Metafields in Customer Accounts

#### Writing Metafields
- **Supported objects**: Customer, Order, Company, and CompanyLocation (as of 2024-07 API version)
- **Namespace requirement**: Custom namespace must be 2–20 characters, distinguishes from other apps
- **Update mechanism**: Metafields requested in `shopify.ui.extension.toml` are updated when merchandise items change
- **Read access**: Available via Order Status API in extension context

#### Metafield Access Pattern
```
1. Define metafield namespace in TOML config
2. Request metafields via extension API
3. On order state change, metafields auto-update
4. Extensions read via Order Status API context
```

**Source**: [Building metafield writes into extensions](https://shopify.dev/docs/apps/build/customer-accounts/metafields), [Metafields API](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/apis/order-status-api/metafields)

### 1.4 Pitfalls & Constraints

- **No direct linking** — full-page extensions require action/inline extensions as navigation entry points
- **Metafield mutation timing** — changes only trigger on merchandise updates, not arbitrary state changes
- **Sandbox limitations** — cannot manipulate customer account HTML or CSS
- **Pre-auth limitations** — pre-auth order status extensions have restricted data access

---

## 2. POS (Point of Sale) Extensions

**Source**: [Extending Shopify POS with UI extensions](https://shopify.dev/docs/apps/build/pos)

### 2.1 Overview & Architecture

- **Cross-platform native**: POS extensions render as native UI on iOS and Android with identical experience
- **Components basis**: Built with remote-dom, Shopify's library for cross-platform UIs
- **Design system alignment**: Native components automatically match Shopify's design system and receive updates
- **Performance**: Faster load times than web-based alternatives

### 2.2 Extension Targets & Components

#### Target Types

1. **Tiles** — display tiles on smart grid (POS home screen)
   - First screen merchants see when opening POS
   - Entry point for essential functions
   - Use case: Quick-access tools like inventory, discounts, reports

2. **Actions** — launch modals or full-screen views from menu item buttons
   - Menu-based triggers
   - Full-screen workflows
   - Use case: Complex operations like return processing, custom order creation

3. **Blocks** — display custom sections within existing screens
   - Product Details screen (inventory, pricing, specs)
   - Post-Purchase screen (transaction summary, follow-ups)
   - Use case: Contextual tools and information

#### Target Areas

- **Smart Grid/Home Screen**: Quick access to core functions
- **Product Details Screen**: Merchant access to pricing, inventory, product-specific tools
- **Post-Purchase Screen**: Transaction summary, follow-up actions, revenue opportunities

**Source**: [Getting started with POS UI extensions](https://shopify.dev/docs/apps/build/pos/getting-started), [Extension targets](https://shopify.dev/docs/api/pos-ui-extensions/latest/targets)

### 2.3 Web Components & APIs

#### Component Categories
- **Actions**: Touch-based interactions (apply discounts, confirm payments, initiate workflows)
- **Forms**: Data capture during transactions with mobile-optimized validation
- **Input fields**: Date, email, numeric, and text inputs with native formatting

#### API Access
- Target APIs provide access to data and functionality based on chosen target
- APIs vary by target (smart grid has different capabilities than product details)
- Remote-dom handles cross-platform rendering

**Source**: [Web components](https://shopify.dev/docs/api/pos-ui-extensions/latest/web-components), [POS UI extensions](https://shopify.dev/docs/api/pos-ui-extensions/latest)

### 2.4 Code Pattern: Getting Started

```toml
# shopify.ui.extension.toml
type = "pos_ui"
targets = ["pos.home.tile.render"]

[settings]
title = "My App"
description = "Quick access tool"
```

- Scaffold with `shopify app scaffold pos-ui`
- Build basic tile on POS home showing store name in modal
- Test in Shopify POS emulator

**Source**: [Getting started with POS UI extensions](https://shopify.dev/docs/apps/build/pos/getting-started)

### 2.5 Pitfalls & Constraints

- **Target-specific capabilities** — each target has different API and component availability
- **Mobile-first design required** — layouts must work on touch interfaces
- **No web component libraries** — use Shopify's component set only
- **Cross-platform testing mandatory** — iOS and Android behavior must be verified separately

---

## 3. Marketing & Analytics

**Source**: [Apps for marketing and analytics](https://shopify.dev/docs/apps/build/marketing-analytics)

### 3.1 Web Pixels

#### Overview
- **Purpose**: JavaScript code snippets running on online store to collect behavioral data (customer events)
- **Data layer**: Events published to Shopify data layer/event bus for marketing optimization
- **Sandbox loading**: Web pixel app extensions load pixels in secure sandbox with APIs for event subscription
- **Data types**: Behavioral data for campaign optimization and analytics

#### Standard Events
- `page_viewed` — user views a page
- `product_viewed` — user views a product
- `product_added_to_cart` — item added to cart
- `checkout_*` — checkout progression events
- `search_submitted` — user searches storefront

#### Custom Events
- Beyond standard events, apps can create and publish custom events
- Subscribe to custom events within pixel sandbox
- Emit custom events from storefront or checkout

#### API Components
```javascript
// Core API structure
api = {
  analytics: {
    subscribe(event, callback)  // Subscribe to Shopify events
  },
  browser: {
    fetch(),                    // Async browser API calls
    // Other browser method access
  },
  init: {
    // JSON snapshot of page at render time
  }
}
```

#### Web Pixel Extension Setup
```javascript
// Import for strong typing
import { register } from '@shopify/web-pixels-extension'

// Register pixel
register(({ analytics, browser }) => {
  analytics.subscribe('page_viewed', (event) => {
    // Event handling
  })
})
```

**Source**: [About web pixels](https://shopify.dev/docs/apps/build/marketing-analytics/pixels), [Build web pixels](https://shopify.dev/docs/apps/build/marketing-analytics/build-web-pixels), [Web Pixels API](https://shopify.dev/docs/api/web-pixels-api)

### 3.2 Customer Segments

#### Concept
- **Definition**: Group of members (customers) meeting specific criteria
- **Purpose**: Conduct marketing activities, inform business decisions, learn about behaviors
- **Query filters**: Precise segment definition via query arguments (conditions data must satisfy)
- **Example**: Customers who abandoned checkout in last 30 days

#### Integration with Web Pixels
- **Data collection**: Web pixels collect behavioral data needed for segment identification
- **Workflow**: Pixels → events → segments → marketing activities
- **Targeting**: Segments enable targeted campaigns based on collected behavior

**Source**: [About customer segments](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments), [Manage customer segments](https://shopify.dev/docs/apps/build/marketing-analytics/customer-segments/manage)

### 3.3 Marketing Activities

- **Purpose**: Actions merchants execute based on customer segments
- **Integration**: Work with segments to conduct targeted campaigns
- **Data**: Require customer event data collected by web pixels

**Source**: [Apps for marketing and analytics](https://shopify.dev/docs/apps/build/marketing-analytics)

### 3.4 Pitfalls & Constraints

- **Sandbox restrictions** — browser API access is limited and asynchronous
- **Event timing** — custom events only available after merchant setup
- **Segment latency** — segment recalculation may have delay
- **Data privacy** — cannot capture sensitive customer data in pixels

---

## 4. B2B (Business-to-Business)

**Source**: [Apps and B2B](https://shopify.dev/docs/apps/build/b2b)

### 4.1 Prerequisites & Requirements

- **Plan requirement**: Only Shopify Plus stores support B2B features
- **Company structure**: B2B features organize customers as companies with locations
- **API version**: Use 2024-07+ for metafield write support on Company/CompanyLocation

### 4.2 Company & Location Management

#### Company Structure
```
Company
├── CompanyLocation 1
│   ├── Catalog
│   ├── Price List
│   ├── Payment Terms
│   └── Contacts
├── CompanyLocation 2
│   ├── Catalog
│   ├── Price List
│   └── Payment Terms
```

#### Catalog Management Rules
- **Catalog assignment**: Catalogs assigned only at company location level
- **Multiple catalogs**: One location can have multiple catalog assignments for flexible product/pricing
- **Price list association**: Price list determines displayed prices; without one, uses base variant prices
- **Currency handling**: Prices convert to market currency without price list association

#### Contact & Purchasing Entity
- **Purchasing entity** = Company + Contact + Location combination
- Required for draft order creation
- Determines which catalogs/prices apply to order

**Source**: [Manage client company locations](https://shopify.dev/docs/apps/build/b2b/manage-client-company-locations), [Manage B2B catalogs](https://shopify.dev/docs/apps/build/b2b/manage-catalogs)

### 4.3 Draft Orders for B2B

#### Purpose
- Merchants need draft orders for company approval workflows
- Pre-transaction creation and negotiation
- Created for specific purchasing entity (company + location + contact)

#### Draft Order Calculation
```
draftOrderCalculate mutation:
├── Input: customer, mailing address, line items
├── Returns:
│   ├── Calculated line totals
│   ├── Shipping charges
│   ├── Applicable discounts
│   └── Tax calculations
└── No order created (calculation only)
```

#### Custom Pricing (2025-01+)
- Item prices auto-reflect current product prices at checkout
- Can set custom prices on line items
- Custom prices lock and become basis for tax/discount/total calculations
- Price customization supports B2B negotiated pricing workflows

**Source**: [Use draft orders](https://shopify.dev/docs/apps/build/b2b/draft-orders)

### 4.4 Payment Terms

#### Concept
- **Configuration**: Set via BuyerExperienceConfiguration on company location
- **Template-based**: Use PaymentTermsTemplate ID for configuration
- **Behavior control**: Determines checkout payment flow and requirements
- **Order review**: Payment terms can require merchant review before order completion

#### Use Cases
- Net 30 / Net 60 payment terms for larger orders
- Require merchant approval before payment
- Deferred payment arrangements

**Source**: [Set payment terms](https://shopify.dev/docs/apps/build/checkout/payments/payment-terms)

### 4.5 Quantity Rules

#### Purpose
- Control minimum, maximum, and increment quantities for product variants
- B2B-specific: Applied per company context via quantityRules field

#### Implementation
- Delete mutations manage product variant min/max/increments
- `ProductVariantContextualPricing.quantityRules` field shows applied rules for company
- Rules enforce B2B bulk order policies

**Source**: [Manage quantity rules for B2B customers](https://shopify.dev/changelog/manage-quantity-rules-for-b2b-customers)

### 4.6 Pitfalls & Constraints

- **Shopify Plus only** — cannot use B2B features on standard plans
- **Catalog scoping** — must carefully manage catalog assignments per location
- **Price list complexity** — without price list, base prices auto-convert (may not match negotiated rates)
- **Draft order approval** — must handle multi-step approval workflows in custom logic

---

## 5. Markets & Internationalization

**Source**: [About Shopify Markets](https://shopify.dev/docs/apps/build/markets)

### 5.1 Multi-Market Support Overview

#### Purpose
- Enable merchants to sell in multiple countries and languages
- Support multiple currencies and localized experiences
- Expand to global audience with appropriate localization

#### Market Structure
- **Locales**: Language/region combinations (e.g., en-US, fr-CA, de-DE)
- **Domains**: Top-level domains or subdomains per market
- **URL paths**: Automatic URL paths for locales (shop.com/fr, shop.com/de)
- **Currencies**: Present prices in local currencies when payment gateway supports

**Source**: [About Shopify Markets](https://shopify.dev/docs/apps/build/markets)

### 5.2 App Localization Benefits

- **Lower churn**: Localized apps demonstrate 5-7% lower user churn in non-English markets
- **Store visibility**: Well-localized apps featured prominently in App Store and admin
- **Market opportunity**: Only 5-7% of public apps available in priority European markets (significant gap)
- **Priority regions**: Focus on Europe, Asia-Pacific, Latin America for highest ROI

### 5.3 Multi-Language & Multi-Currency Implementation

#### Language Support
- **Dynamic URLs**: Shopify auto-creates URL paths for published locales (shop.com/{locale})
- **Storefront API**: GraphQL Storefront API supports localized experience configuration
- **Content localization**: Query product data, metadata in customer's language
- **Translation management**: Externalize strings, format, and translate per locale

#### Currency Handling
- **Presentment currencies**: Deal with money values in various currencies (not single base currency)
- **Local payment**: When gateway supports local currency, present prices in customer's currency
- **GraphQL queries**: Storefront API returns prices in selected market's currency

#### Product Localization
- **Market restrictions**: Exclude specific products from specific markets
- **Search & cart**: Hidden from storefront, omitted from search, blocked from cart in restricted markets
- **Catalog management**: Use catalogs feature to manage market-specific product selections

**Source**: [Internationalization with Shopify Markets](https://shopify.dev/docs/storefronts/headless/hydrogen/markets), [Building localized experiences with the Storefront API and Shopify Markets](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets)

### 5.4 App Internationalization Pattern

```
1. Externalize strings (separate from code)
2. Format values (dates, numbers, currency per locale)
3. Translate strings per locale
4. Load translations at runtime based on market context
```

**Source**: [Localize your app](https://shopify.dev/docs/apps/build/localize-your-app)

### 5.5 Pitfalls & Constraints

- **Currency conversion** — do not assume single base currency; handle presentment currencies
- **URL structure** — automatically handled by Shopify but affects app navigation
- **Catalog complexity** — market-specific product exclusions can create maintenance burden
- **Translation maintenance** — localized apps require ongoing translation management

---

## 6. Blockchain Applications

**Source**: [Apps in blockchain](https://shopify.dev/docs/apps/build/blockchain)

### 6.1 Blockchain App Definition

- **Scope**: Any application exposing merchants to blockchain assets or functionality
- **Examples**: Cryptocurrency, minting, tokengating, gifting, NFT distribution
- **Requirement**: Approval from Shopify required for merchants selling NFTs via Shopify Payments

### 6.2 Tokengating

#### Concept
- **Definition**: Merchants offer exclusive access to products, discounts, or content based on NFT ownership
- **Implementation**: Gate access based on customer's Web3 wallet contents
- **Use cases**:
  - Exclusive product access
  - Discount offerings
  - Content gating
  - Collaborative partnerships between brands

#### Partnership Opportunities
- Brands can partner through collaborative products/collections
- Tokens distributed by partner brands unlock benefits
- Expands potential audience beyond typical customer base
- Joint marketing through token distribution

**Source**: [About tokengating](https://shopify.dev/docs/apps/build/blockchain/tokengating), [Tokengating UX guidelines](https://shopify.dev/docs/apps/blockchain/tokengating/tokengating-app-ux-guidelines)

### 6.3 NFT Distribution & Sales

#### Approval Requirement
- **Merchants selling NFTs**: Require Shopify approval before NFT sales via Shopify Payments
- **Developer responsibility**: Gate minting/gifting/listing functionality to approved merchants only
- **Restriction**: Prevent non-approved merchants from accessing NFT functionality

#### UX Guidelines for NFT Distribution
- Customer-facing experience design required
- Follow Shopify guidelines for NFT distribution flows
- Clear communication of NFT benefits and blockchain requirements

**Source**: [About NFT distribution](https://shopify.dev/docs/apps/build/blockchain/nft-distribution), [UX for NFT distribution apps](https://shopify.dev/docs/apps/build/blockchain/nft-distribution/ux-for-nft-distribution)

### 6.4 Pitfalls & Constraints

- **Approval gating mandatory** — no NFT sales without Shopify approval; must prevent unauthorized merchants
- **Wallet validation required** — validate customer Web3 wallet ownership
- **UX complexity** — blockchain features require careful UX design for merchant and customer clarity
- **Regulatory uncertainty** — monitor jurisdiction-specific regulations on NFTs and tokens

---

## 7. Flow Extensions

**Source**: [About Flow](https://shopify.dev/docs/apps/build/flow)

### 7.1 Overview

- **Purpose**: Shopify Flow is an app for merchant automation; developers extend it with custom tasks
- **Components**: Triggers and Actions (developers cannot build conditions—only Shopify can)
- **Extensibility**: Events in your app can trigger workflows; workflows can execute your app actions
- **Use case**: Automate store operations, integrations, and multi-step business logic

### 7.2 Triggers

#### Concept
- **Definition**: Task that starts workflow execution
- **Represents**: An event happening in store or app
- **Developer role**: Create trigger extensions to publish app events to Flow

#### Trigger Fields
- **Settings section**: Specify trigger fields in TOML file
- **Field types**:
  - **Reference fields**: Send identifier of Shopify resource; Flow can access all related data
  - **Custom fields**: Define custom data sent with trigger request
- **Event data**: Triggers include data describing the event

#### Trigger Implementation
```toml
# shopify.flow.extension.toml (trigger)
[[triggers]]
name = "my_event"
description = "Event triggered by my app"

[triggers.settings]
my_field = { type = "string" }
resource_field = { type = "reference", resource = "Product" }
```

Emit trigger: POST to Flow API with event data

**Source**: [About Flow triggers](https://shopify.dev/docs/apps/build/flow/triggers), [Create a Flow trigger](https://shopify.dev/docs/apps/build/flow/triggers/create), [Flow trigger reference](https://shopify.dev/docs/apps/build/flow/triggers/reference)

### 7.3 Actions

#### Concept
- **Definition**: Workflow component representing task executed when conditions met
- **Execution**: Runs in store or app when workflow conditions are true
- **Developer role**: Build actions so merchants can use your app in Flow workflows

#### Action Fields
- **Settings section**: Define action endpoint requirements in TOML
- **Field types**: Same as triggers (reference and custom fields)
- **Merchant input**: Merchants provide field values in Flow UI when building workflow

#### Action Implementation
```toml
# shopify.flow.extension.toml (action)
[[actions]]
name = "my_action"
description = "Action executed by Flow"
endpoint = "https://myapp.com/flow/actions/my_action"

[actions.settings]
target_field = { type = "string" }
product_ref = { type = "reference", resource = "Product" }
```

Action endpoint receives POST with merchant-configured values

**Source**: [About Flow actions](https://shopify.dev/docs/apps/build/flow/actions), [Create a Flow action](https://shopify.dev/docs/apps/build/flow/actions/create), [Flow action reference](https://shopify.dev/docs/apps/build/flow/actions/reference)

### 7.4 Conditions (Developer Constraints)

- **Only Shopify builds conditions** — developers cannot create custom conditions
- **Available conditions**: Shopify-maintained set of condition builders
- **Limitation**: Triggers and actions must work with Shopify's condition set

### 7.5 Common Patterns

```
Pattern 1: Trigger → [Shopify conditions] → Action
- App event fires trigger
- Merchant builds workflow with Shopify conditions
- Workflow executes app action

Pattern 2: Multiple triggers in one workflow
- Chain multiple app/Shopify triggers
- Share same action

Pattern 3: Reference field usage
- Send Product/Order/Customer reference
- Merchant can access all data for that resource in conditions/subsequent actions
```

### 7.6 Pitfalls & Constraints

- **Endpoint availability required** — action endpoints must be publicly accessible
- **No custom conditions** — cannot limit workflow logic to custom conditions; use Shopify conditions only
- **Rate limiting** — Flow actions should handle concurrent merchant workflows
- **Error handling** — action failures may halt workflow; return appropriate error codes

---

## 8. Integrating with Shopify Admin

**Source**: [Integrating with the Shopify admin](https://shopify.dev/docs/apps/build/integrating-with-shopify)

### 8.1 App Home & Embedded Apps

#### App Home Overview
- **Purpose**: Dedicated area in Shopify admin for app landing page and UI
- **Iframe-based**: Renders inside iframe within admin
- **Components**: Navigation menu, data displays, modals, workflows
- **Default page**: Specified in Dev Dashboard app URL

#### App Bridge Communication
- **Technology**: JavaScript SDK called App Bridge
- **Purpose**: Communicate with Shopify admin components outside iframe
- **UI rendering**: Web components from Polaris design system
- **Performance**: Built with modern web technologies for fast interactions

**Source**: [Embedded app home - Shopify.dev](https://shopify.dev/docs/apps/admin/embedded-app-home), [About Shopify App Bridge](https://shopify.dev/docs/api/app-bridge)

### 8.2 Navigation

#### App Nav Component
- **Desktop**: Renders in left-side navigation panel
- **Mobile**: Renders in dropdown from title bar
- **Home route**: Designate route with `rel="home"` to set default landing page
- **Integration**: Use App Bridge nav component for consistent UX

#### Navigation Best Practices
```html
<s-app-nav rel="home">
  <s-app-nav-item label="Home" to="/" />
  <s-app-nav-item label="Settings" to="/settings" />
  <s-app-nav-item label="Reports" to="/reports" />
</s-app-nav>
```

- Consistent hierarchy across desktop/mobile
- Home route as default entry point
- Clear labeling for merchant understanding

**Source**: [Navigation](https://shopify.dev/docs/apps/design/navigation), [App nav](https://shopify.dev/docs/api/app-home/app-bridge-web-components/app-nav)

### 8.3 App Setup & Configuration

#### Dev Dashboard Setup
- App URL: Points to app homepage, becomes default view
- App Bridge integration: Communicates iframe ↔ admin
- Scope configuration: Define data/feature access
- Extension targets: Register extension entry points

#### Best Practice
- **Latest App Bridge version**: Use current version for best compatibility
- **Responsive design**: Support desktop and mobile views
- **Error boundaries**: Handle iframe communication failures
- **Session management**: Validate merchant session before operations

### 8.4 Pitfalls & Constraints

- **Iframe limitations** — cross-origin requests require CORS; some browser features unavailable
- **App Bridge availability** — must wait for App Bridge initialization before communication
- **Session validation** — always verify merchant session before accessing store data
- **Mobile responsiveness** — test on both desktop and Shopify mobile admin

---

## 9. Dev Dashboard (App Management)

**Source**: [Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard)

### 9.1 Overview

- **Purpose**: Central hub for all app development activities
- **Users**: Merchants (custom apps) and partners (public apps)
- **Access**: dev.shopify.com/dashboard
- **Features**: App creation, management, monitoring, credentials, team access

### 9.2 Creating Apps

#### Dev Dashboard Method
```
1. Navigate to Dev Dashboard → Apps
2. Select "Create app" (top right)
3. Name app
4. Select Create
5. Configure app settings
6. Install on store
```

#### Advantage vs. CLI
- Simplified interface for quick integrations
- Best for connecting existing systems to Shopify
- No CLI dependency
- Immediate access to app configuration

#### Installation Flow
```
Dev Dashboard Home
→ Scroll to "Install app"
→ Select or create store
→ Select Install
→ Complete OAuth flow
```

**Source**: [Create apps using the Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard)

### 9.3 App Management

#### Key Capabilities
- **App visibility**: See all apps tied to organization
- **Status monitoring**: Check app status and health
- **Configuration**: Modify app settings and scopes
- **Credentials**: API keys, webhooks, extensions
- **Logs**: Access built-in logs and health metrics
- **Permissions**: Manage team access and user roles
- **Versions**: Track changes over time, rollback to previous configs

#### Versions Feature
- **Purpose**: Track configuration changes
- **Rollback**: Revert to previous version if needed
- **Audit trail**: See what changed and when

#### Monitoring & Diagnostics
- **Built-in logs**: Real-time app activity logs
- **Health metrics**: Monitor app performance
- **Error tracking**: Identify and diagnose problems
- **Performance insights**: Understand app usage patterns

**Source**: [Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard)

### 9.4 Scopes & Permissions

#### Scope Configuration
- **Purpose**: Define data and features app can access
- **Granularity**: Request only necessary scopes (over-requesting = rejection)
- **Protected data**: Sensitive data requires Shopify approval
- **Update on install**: Scope changes require merchant re-authorization

#### Scope Categories
- **Standard scopes**: Common data like products, orders, customers
- **Protected scopes**: Payment info, customer data require approval
- **Write scopes**: Dangerous operations (delete, modify) require careful justification

**Source**: [Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard)

### 9.5 Migration from Partner Dashboard

- **Support**: Migrate existing apps from Partner Dashboard to Dev Dashboard
- **Process**: Documented migration path available
- **Deprecation**: Partner Dashboard being replaced by Dev Dashboard

**Source**: [Migrate from the Partner Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard/migrate-from-partners)

### 9.6 Pitfalls & Constraints

- **Scope approval required** — protected data requires explicit approval; over-scoping causes rejection
- **Credential security** — API keys visible in dashboard; rotate regularly
- **Version management** — rollback works for configuration but not data migrations
- **Team permissions** — carefully manage who has access to production apps

---

## Cross-Cutting Patterns & Constraints

### 1. Extension TOML Files
All extensions (Customer Accounts, POS, Flow) require `shopify.ui.extension.toml` or `shopify.flow.extension.toml` configuration:
- Define extension type and targets
- Specify required fields in `[settings]` section
- Reference field types for Shopify resource linking
- Custom field types for app-specific data

### 2. Sandbox & Security
- **Customer Accounts**: Isolated sandbox, no sensitive data access
- **Web Pixels**: Limited browser API, asynchronous execution
- **Flow Actions**: Public HTTPS endpoints required
- **POS**: Native platform security, no web access

### 3. API Versioning
- Use stable API versions (not deprecated within 90 days)
- Metafield write support: 2024-07+
- Draft order pricing: 2025-01+
- Always pin specific versions in code

### 4. Merchant Workflows
- **B2B**: Company → Location → Purchasing Entity → Draft Order
- **POS**: Smart Grid → Tile/Action → Modal/Screen
- **Customer Accounts**: Order Status → Inline/Action Extension
- **Flow**: Trigger → [Condition] → Action

### 5. Testing & Validation
- **Extension targets**: Each target requires separate testing
- **Cross-platform**: POS extensions need iOS + Android validation
- **Merchant approval**: B2B workflows, NFT sales require approval
- **Rate limiting**: Flow actions and webhooks need load testing

---

## Summary: Build Phase Readiness

| Feature | Key Rule | Constraint | Pitfall |
|---------|----------|-----------|---------|
| **Customer Accounts** | Sandbox isolated | No direct linking for full-page | Complex navigation required |
| **POS** | Cross-platform native | Mobile-first only | Target-specific APIs vary |
| **Web Pixels** | Behavioral data collection | Sandbox restricted | Event timing varies |
| **B2B** | Shopify Plus only | Location-based catalogs | Price list complexity |
| **Markets** | Multi-currency/language | Presentment currency handling | Catalog maintenance burden |
| **Blockchain** | Approval required | Merchant gating enforced | Regulatory uncertainty |
| **Flow** | Triggers + Actions | No custom conditions | Public endpoints required |
| **App Home** | Iframe-based | App Bridge communication | Session validation needed |
| **Dev Dashboard** | Simplified management | Scope approval required | API key security critical |

---

**End of Extraction**
