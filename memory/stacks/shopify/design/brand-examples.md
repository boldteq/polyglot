# Real Brand UI/UX Analysis — Top Shopify Apps

> Source: Shopify App Store top-rated apps (4.7-4.9 stars), 2025 Build Awards, Built for Shopify program
> Purpose: Train Vega design agent on real production-quality Shopify app patterns
> Last updated: 2026-04-04

---

## Design DNA of Award-Winning Shopify Apps

Top-rated Shopify apps (4.8+ stars, Built for Shopify badge) share these 10 traits:

1. **Polaris consistency** — No custom design systems; pure Polaris for admin UI
2. **Merchant-first UX** — Assume non-technical users; templates over blank canvas
3. **Performance obsession** — Lighthouse >90 across all categories, CLS <0.1, INP <200ms
4. **Storefront extensions** — Theme blocks, checkout extensions, customer account extensions drive value
5. **Deep Shopify integration** — Order, customer, and inventory data surfaced in-context (no tab-switching)
6. **Progressive complexity** — Basic defaults first, advanced customization opt-in
7. **Real-time sync** — Data updates instantly (inventory, pricing, subscriptions)
8. **Responsive everywhere** — Desktop, tablet, mobile all work seamlessly
9. **Built-in help** — Tooltips, presets, and contextual guidance embedded in UI (no external docs)
10. **Clear success states** — Users always know what happened after an action (toasts, banners, page refresh)

---

## App #1: Klaviyo (Email Marketing + SMS)

**Rating:** 4.8/5 | 10K+ reviews
**Category:** Marketing & Communication
**Design Philosophy:** Enterprise-grade simplicity with drag-and-drop accessibility

### Admin UI Patterns

**Dashboard:**
- Campaign management cards with status indicators
- Data tables for managing campaigns, flows, lists, and segments
- Activity feed showing real-time synced data
- Consistent table structures across all list views

**Email Builder (Builder Canvas Pattern):**
```
┌───────────┬────────────────────────┬──────────────┐
│ Block     │                        │ Properties   │
│ Library   │   Email Canvas         │              │
│           │                        │ [Font]       │
│ [Header]  │   ┌──────────────┐     │ [Color]      │
│ [Text]    │   │ Header Block │     │ [Spacing]    │
│ [Image]   │   ├──────────────┤     │ [Link]       │
│ [Button]  │   │ Content Block│     │              │
│ [Divider] │   ├──────────────┤     │ Preview:     │
│ [Social]  │   │ CTA Block    │     │ [Desktop]    │
│ [Footer]  │   └──────────────┘     │ [Mobile]     │
│           │                        │              │
└───────────┴────────────────────────┴──────────────┘
```

- Left sidebar: Block library organized by type
- Center canvas: Live drag-and-drop editor (WYSIWYG)
- Right panel: Property inspector for selected block
- Top toolbar: Save, preview, test send, undo/redo

**Polaris Components Used:**
- `Page` container for all views
- `Card` for dashboard sections
- `DataTable` for list views (campaigns, segments, flows)
- `Modal` for configuration dialogs
- Custom drag-and-drop framework for email builder

**What Makes Klaviyo Stand Out:**
- Described as "stable, intuitive, and easy to work with"
- Pre-built template library reduces blank-canvas anxiety
- Fine-grained controls for advanced users without overwhelming beginners
- Unified management: campaigns, flows, lists, segments all accessible without leaving Shopify admin

---

## App #2: Judge.me (Product Reviews)

**Rating:** 4.9/5 | 5K+ reviews | **2025 Build Award Winner**
**Category:** Customer Reviews & Ratings
**Design Philosophy:** Flexibility + simplicity with minimal setup required

### Admin UI Patterns

**Dashboard (Metric Dashboard Pattern):**
```
┌─────────────────────────────────────────────────────┐
│ Reviews Dashboard                    [Export] [Sync] │
├─────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│ │ 1,247     │ │ 4.8 ★     │ │ 89%       │          │
│ │ Total     │ │ Average   │ │ Response  │          │
│ │ Reviews   │ │ Rating    │ │ Rate      │          │
│ └───────────┘ └───────────┘ └───────────┘          │
├─────────────────────────────────────────────────────┤
│ [Search reviews...] [Status ▾] [Rating ▾] [Date ▾] │
├─────────────────────────────────────────────────────┤
│ ★★★★★ Sarah M. | "Love this product!"   | Published│
│ ★★★★☆ John D.  | "Good but shipping..." | Pending  │
│ ★★★★★ Lisa K.  | "Perfect gift"         | Published│
│                                    [1] [2] [3] →    │
└─────────────────────────────────────────────────────┘
```

**Widget Gallery:**
- Carousel showing available widget types (review widget, star rating badge, reviews carousel, all reviews page, review snippets)
- Per-widget configuration panels
- No-code color, theme, and text customization

### Storefront Extensions (6 Widget Types)

1. **Review Widget** — Full product page reviews display (star rating, text, photos)
2. **Star Rating Badge** — Floating badge on collection/product pages
3. **Reviews Carousel** — Rotating top reviews (animated slider)
4. **All Reviews Page** — Dedicated review archive page
5. **Review Snippets** — Key highlights below Add to Cart button
6. **Customer Account Widget** — Self-service review submission via Shopify Customer Accounts

### What Makes Judge.me Stand Out:

- **Smart defaults** — Widgets work immediately after install with sensible presets
- **Theme-safe** — Widgets adapt to any theme without breaking design (CSS inherits theme)
- **No theme modification required** — Works as app block (Online Store 2.0)
- **Progressive disclosure** — Basic config visible, advanced settings hidden until needed
- **2025 Build Award** — Recognized for pushing design quality standards

---

## App #3: PageFly (Page Builder)

**Rating:** 4.9/5 | 5,900+ reviews
**Category:** Store Design & Page Building
**Design Philosophy:** No-code power with pro customization options

### Admin UI Patterns

**Builder Interface (Builder Canvas Pattern):**
```
┌───────────┬──────────────────────────┬──────────────┐
│ Sections  │                          │ Inspector    │
│ Library   │   Page Canvas            │              │
│           │   (Live WYSIWYG)         │ [Styles]     │
│ [Hero]    │                          │ padding: 20  │
│ [Gallery] │   ┌──────────────────┐   │ margin: 0    │
│ [Text]    │   │ Hero Section     │   │ bg: #fff     │
│ [Product] │   │ [Drag handles]   │   │              │
│ [CTA]     │   ├──────────────────┤   │ [Advanced]   │
│ [Video]   │   │ Feature Grid     │   │ CSS: ▾       │
│ [FAQ]     │   │ [Edit inline]    │   │ .my-class {  │
│ [Footer]  │   └──────────────────┘   │   color: red │
│           │                          │ }            │
│ Templates │   [Save] [Preview] [Pub] │              │
│ (120+)    │                          │              │
└───────────┴──────────────────────────┴──────────────┘
```

**Key Design Decisions:**
- 130+ pre-built sections organized by type
- 120+ full page templates (landing, product, FAQ, homepage)
- Click-to-edit and drag-to-reorder (inline editing)
- CSS code toggle for advanced users who want custom styling
- Reusable section templates (create once, use across pages)

### What Makes PageFly Stand Out:

- **Progressive complexity** — Visual editor for 95% of merchants, CSS code for 5% power users
- **Template system** — Reduces blank-canvas anxiety by providing proven starting points
- **130+ integrations** — Analytics, recommendation engines, etc. embedded in builder
- **24/7 live chat support** — Even on free tier (frictionless onboarding)
- **Section reusability** — Build once, reuse across pages (reduces effort)

---

## App #4: Recharge (Subscriptions)

**Rating:** 4.7/5 | 2K+ reviews
**Category:** Subscription Management
**Design Philosophy:** Simplicity with merchant control AND customer self-service

### Admin UI Patterns (Dual Interface — Admin + Customer Portal)

**Merchant Dashboard:**
```
┌─────────────────────────────────────────────────────┐
│ Subscriptions Dashboard            [Create Plan]     │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ $42.5K   │ │ 1,247    │ │ 94%      │ │ $34.06   ││
│ │ MRR      │ │ Active   │ │ Retention│ │ AOV      ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
├─────────────────────────────────────────────────────┤
│ Subscription Plans                                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Monthly Box │ Active │ 892 subscribers │ $29/mo │ │
│ │ Quarterly   │ Active │ 355 subscribers │ $79/qt │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Cross-sell / Upsell Configuration                    │
│ [In-cart upsell] [Post-checkout] [Email]            │
└─────────────────────────────────────────────────────┘
```

**Customer Storefront Portal:**
```
┌─────────────────────────────────────────────────────┐
│ My Subscriptions                                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Monthly Coffee Box         Active                │ │
│ │ Next delivery: Apr 15     $29.00/month           │ │
│ │                                                  │ │
│ │ [Skip Next] [Swap Product] [Change Frequency]    │ │
│ │ [Update Payment] [Update Address] [Cancel]       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Order History                                        │
│ ┌──────────┬──────────┬──────────┬────────────┐     │
│ │ Mar 15   │ Delivered│ $29.00   │ [View]     │     │
│ │ Feb 15   │ Delivered│ $29.00   │ [View]     │     │
│ └──────────┴──────────┴──────────┴────────────┘     │
└─────────────────────────────────────────────────────┘
```

### Storefront Extensions:
- **Cart upsell blocks** — App blocks in cart for cross-sell
- **Post-checkout upsell** — Checkout extension for post-purchase offers
- **Customer account portal** — Full subscription management via Shopify Customer Accounts (no separate login)

### What Makes Recharge Stand Out:

- **Dual interface** — Merchant admin AND customer self-service portal
- **Customer autonomy** — Pause, skip, swap, cancel without contacting support (reduces support burden)
- **Integrated cross-sell/upsell** — Multiple touchpoints (cart, checkout, post-checkout, email)
- **Shopify Customer Accounts integration** — Seamless login, no separate credentials
- **Analytics-first** — Built-in analytics for subscription trends, churn, LTV

---

## App #5: Gorgias (Helpdesk)

**Rating:** 4.8/5 | 3K+ reviews
**Category:** Customer Support & Live Chat
**Design Philosophy:** Context-aware support with deep Shopify integration

### Admin UI Patterns (Unified Inbox — 3-Column Layout)

```
┌──────────────┬───────────────────────┬───────────────┐
│ Conversations│ Ticket Thread         │ Customer      │
│              │                       │ Context       │
│ [Filter ▾]  │ From: sarah@...       │               │
│ [Search]     │ Subject: Where's my   │ Sarah Miller  │
│              │ order?                │ 4 orders      │
│ ● sarah@... │                       │ LTV: $800     │
│   "Where's  │ > Hi, I ordered 3     │ VIP Customer  │
│    my..."   │ > days ago and haven't │               │
│              │ > received shipping   │ ┌───────────┐ │
│ ○ john@...  │ > info yet.           │ │ Order #123│ │
│   "Refund   │                       │ │ $129.00   │ │
│    request" │ [Reply box]           │ │ Shipped ✓ │ │
│              │                       │ │ [Refund]  │ │
│ ○ lisa@...  │ Quick Actions:        │ │ [Cancel]  │ │
│   "Size      │ [Refund] [Cancel]    │ │ [Track]   │ │
│    issue"   │ [Duplicate] [Macro ▾] │ └───────────┘ │
└──────────────┴───────────────────────┴───────────────┘
```

**Key Design Decisions:**
- **Unified inbox** — Email, chat, phone, SMS, social (Facebook, Instagram, TikTok) in one view
- **Right context panel** — Customer profile, order history, LTV, subscription status always visible
- **In-ticket order actions** — Refund, cancel, duplicate order WITHOUT leaving the ticket view
- **Macro shortcuts** — Pre-written responses accessible inline

**Polaris Components Used:**
- `Page` for main layout
- `Card` for customer info panel
- `ResourceList` for conversation list (left sidebar)
- Custom message threading component (center)
- Shopify GraphQL API for real-time order data

### What Makes Gorgias Stand Out:

- **40% efficiency gain** — Full order context visible without tab-switching
- **80% reduction in resolution time** — Integrated order access
- **95% faster first response** — Pre-populated customer context
- **Multi-channel unified** — Single inbox for all support channels (reduces cognitive load)
- **Deep Shopify data** — Not just order status, but full transaction history, tags, notes

---

## App #6: Shopify Flow (Automation)

**Rating:** 4.8/5 | 1.5K+ reviews
**Category:** Business Automation (First-party)
**Design Philosophy:** Visual automation without code

### Admin UI Patterns (Workflow Builder Canvas)

```
┌──────────────┬──────────────────────────────────────┐
│ Triggers     │                                      │
│              │   ┌─────────────────┐                │
│ [Order       │   │  TRIGGER        │                │
│  created]    │   │  Order Created  │                │
│ [Customer    │   └────────┬────────┘                │
│  tagged]     │            │                         │
│ [Inventory   │   ┌────────▼────────┐                │
│  low]        │   │  CONDITION      │                │
│              │   │  Total > $100?  │                │
│ Conditions   │   └───┬────────┬───┘                │
│              │       │YES     │NO                   │
│ [IF/THEN]    │  ┌────▼────┐  ┌▼────────┐           │
│ [Compare]    │  │ ACTION  │  │ ACTION   │           │
│              │  │ Add VIP │  │ Send     │           │
│ Actions      │  │ Tag     │  │ Welcome  │           │
│              │  └─────────┘  │ Email    │           │
│ [Send email] │               └──────────┘           │
│ [Add tag]    │                                      │
│ [Create task]│   [Save] [Test] [Activate]           │
└──────────────┴──────────────────────────────────────┘
```

**Key Design Decisions:**
- Three-step visual metaphor: Trigger → Condition → Action (clear, learnable)
- Template library with pre-built workflows for common use cases
- AI Sidekick can auto-generate workflows from text description
- Branching logic (if/else) and delay blocks (wait X hours)
- Connected blocks with visual flow lines

### What Makes Shopify Flow Stand Out:

- **No-code accessibility** — Complex automation without technical knowledge
- **Template system** — Out-of-box workflows ready to activate (not build from scratch)
- **AI co-creation** — Text-to-workflow generation (describe what you want, get a workflow)
- **Visual clarity** — Connected blocks make workflows easy to follow, debug, and modify
- **First-party integration** — Deep access to ALL Shopify data (no API limits)

---

## App #7: Dropshipping Apps (DSers / Zendrop / AutoDS)

**Category:** Product Sourcing & Fulfillment

### DSers (4.7★ — AliExpress Official Partner)

**UI Pattern: Bulk Operations Dashboard**
```
┌─────────────────────────────────────────────────────┐
│ Product Import                    [Bulk Import]      │
├─────────────────────────────────────────────────────┤
│ [Search AliExpress products...]                      │
├─────────────────────────────────────────────────────┤
│ ☑ Product 1  │ $4.99 → $19.99 │ ★4.8 │ [Import]   │
│ ☑ Product 2  │ $2.50 → $12.99 │ ★4.7 │ [Import]   │
│ ☑ Product 3  │ $8.00 → $29.99 │ ★4.9 │ [Import]   │
│                                                      │
│ [Import Selected (3)]  [Set Pricing Rules]           │
└─────────────────────────────────────────────────────┘
```

- One-click bulk import from AliExpress
- Smart pricing rules (auto-markup per product)
- Real-time inventory sync
- Supplier mapping (auto-match when products update)

### Zendrop (4.6★ — Beginner-Friendly)

**UI Pattern: Curated Product Discovery**
- Product cards with rich metadata (shipping time, profit potential, reviews)
- Category organization and trending products
- One-click import (less overwhelming than DSers)
- Visual branded packaging selector

### AutoDS (4.8★ — Most Comprehensive)

**UI Pattern: Multi-Platform Dashboard**
- Centralized monitoring across Shopify, WooCommerce, Wix, eBay, TikTok Shop
- Automation-first: auto price sync, inventory updates, fulfillment
- Advanced analytics: profitability by product, supplier performance
- Bulk operations for 1000s of products

### Common Design Patterns Across All Three:
- **Task-focused simplicity** — Merchants don't need to understand app architecture
- **Bulk operations** — Recognize that dropshippers work with hundreds of products
- **Real-time sync** — Automatic inventory and pricing updates
- **Profit visibility** — Cost, markup, and margin visible at product level

---

## Built for Shopify Badge Winners — Design Traits

### Award Criteria Impact on Design

Apps that earn "Built for Shopify" badge share these traits:

1. **Performance gates met** — Cannot reduce storefront Lighthouse by >10 points
2. **Polaris mandatory** — All admin UI uses Polaris (React or Web Components)
3. **Mobile-first** — Responsive design tested on tablet and mobile
4. **WCAG 2.1 AA accessible** — Keyboard nav, focus indicators, contrast ratios
5. **<5 minute onboarding** — Merchant understands app within 5 minutes of install
6. **Built-in help** — Tooltips, contextual help, no external documentation required
7. **Latest Shopify APIs** — Uses current, non-deprecated API versions
8. **Skeleton states** — Every page loads with skeleton placeholders matching final layout

### Notable Winner: Locksmith (Access Control)

**Design Recognition:** Model for focused, powerful apps
- Merchant-first UX (understand merchant needs first)
- Deep Shopify integration (native auth, permissions)
- Minimal, purposeful UI (no feature bloat)
- Refined components (every element serves a function)

---

## 6 Reusable Layout Patterns Extracted from Top Apps

### Pattern A: Metric Dashboard
**Used by:** Klaviyo, Recharge, Gorgias, Judge.me

```
Page Title + Action Button(s)
→ Filters (search, date, status)
→ Metric Cards (4-card grid: number + label + trend)
→ DataTable or ResourceList (sortable, filterable, bulk actions, pagination)
```

**Polaris Components:** `Page` → `Layout` → `Card` (metrics) → `DataTable`/`ResourceList`

### Pattern B: Builder Canvas
**Used by:** PageFly, Shopify Flow, Klaviyo (email builder)

```
Left Sidebar (170px)     Center Canvas          Right Panel (280px)
Component Library        Drag-and-Drop Editor   Property Inspector
```

**Note:** Builder canvas uses custom React components (React Flow, etc.), NOT Polaris

### Pattern C: Unified Inbox (3-Column)
**Used by:** Gorgias

```
Left (260px)             Center (main)           Right (320px)
Conversation List        Ticket Thread           Customer Context
```

**Polaris Components:** `ResourceList` (left) → Custom threading (center) → `Card` (right)

### Pattern D: Settings Cards
**Used by:** All apps with settings

```
2-column responsive grid of Card components
Each card: section title + FormLayout + TextField/Select/Checkbox + Save button
```

**Polaris Components:** `Layout` (2-column) → `Card` → `FormLayout` → form fields

### Pattern E: Dual Interface (Admin + Customer)
**Used by:** Recharge, Judge.me

- **Admin view:** Dashboard with KPIs, management tools, configuration
- **Customer view:** Storefront blocks + Customer Account extensions (self-service)
- **Key:** Customer portal uses Shopify Customer Accounts (no separate login)

### Pattern F: Data-Rich Context Sidebar
**Used by:** Gorgias, Locksmith

```
Left: List of items → Center: Detail view → Right: Related context data
```

---

## Component Usage Frequency (Across Top 7 Apps)

| Component | Usage | Common Context |
|-----------|-------|---------------|
| `Page` | Every app | Top-level wrapper for every route |
| `Layout` | Every app | Content grid organization |
| `Card` | Every app | Metric card, settings group, content container |
| `DataTable` / `IndexTable` | 6/7 apps | Orders, customers, products, reviews, campaigns |
| `ResourceList` | 5/7 apps | Compact card-style lists |
| `TextField` | Every app | Search, filters, form fields |
| `Select` | 6/7 apps | Status, category, plan dropdowns |
| `Button` | Every app | Save, cancel, delete, create actions |
| `Modal` | Every app | Confirmation, configuration, preview dialogs |
| `Banner` | 6/7 apps | Info, success, warning, critical notices |
| `Toast` | Every app | Transient success/error notifications |
| `Tabs` | 5/7 apps | Settings tabs, dashboard sections |
| `SkeletonPage` | 5/7 apps | Initial page load placeholder |
| `Tooltip` | 4/7 apps | Explain metrics, field guidance on hover |
| `Badge` | 5/7 apps | Status indicators (Active, Pending, VIP) |

---

## Polaris Code Examples from Real Apps

### Metric Card (Recharge, Judge.me, Gorgias Style)

```jsx
import { Card, Text, Box, Icon, InlineStack } from '@shopify/polaris';
import { ArrowUpIcon, ArrowDownIcon } from '@shopify/polaris-icons';

function MetricCard({ label, value, trend, trendLabel }) {
  const isPositive = trend > 0;
  const trendIcon = isPositive ? ArrowUpIcon : ArrowDownIcon;
  const trendTone = isPositive ? 'success' : 'critical';

  return (
    <Card>
      <Box padding="400">
        <Text as="h3" variant="headingSm" tone="subdued">{label}</Text>
        <Box paddingBlockStart="200">
          <Text as="p" variant="headingXl">{value}</Text>
        </Box>
        <Box paddingBlockStart="100">
          <InlineStack gap="100" blockAlign="center">
            <Icon source={trendIcon} tone={trendTone} />
            <Text variant="bodySm" tone="subdued">{trendLabel}</Text>
          </InlineStack>
        </Box>
      </Box>
    </Card>
  );
}

// Usage in Dashboard:
<Layout>
  <Layout.Section variant="oneThird">
    <MetricCard label="Revenue" value="$42,500" trend={15} trendLabel="+15% from last month" />
  </Layout.Section>
  <Layout.Section variant="oneThird">
    <MetricCard label="Active Subscribers" value="1,247" trend={8} trendLabel="+8% from last month" />
  </Layout.Section>
  <Layout.Section variant="oneThird">
    <MetricCard label="Churn Rate" value="3.2%" trend={-1.5} trendLabel="-1.5% from last month" />
  </Layout.Section>
</Layout>
```

### Resource Index with Filters (Judge.me, Klaviyo Style)

```jsx
import {
  Page, Layout, Card, IndexTable, IndexFilters,
  useSetIndexFiltersMode, Badge, Text
} from '@shopify/polaris';

function ReviewsPage() {
  const { mode, setMode } = useSetIndexFiltersMode();

  return (
    <Page title="Reviews" primaryAction={{ content: 'Export', onAction: handleExport }}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexFilters
              mode={mode}
              setMode={setMode}
              tabs={[
                { id: 'all', content: 'All', badge: '1,247' },
                { id: 'published', content: 'Published', badge: '1,089' },
                { id: 'pending', content: 'Pending', badge: '158' },
              ]}
              filters={[
                { key: 'rating', label: 'Rating', filter: ratingFilter },
                { key: 'date', label: 'Date', filter: dateFilter },
              ]}
              queryValue={queryValue}
              onQueryChange={setQueryValue}
              onQueryClear={() => setQueryValue('')}
            />
            <IndexTable
              resourceName={{ singular: 'review', plural: 'reviews' }}
              itemCount={reviews.length}
              headings={[
                { title: 'Customer' },
                { title: 'Rating' },
                { title: 'Review' },
                { title: 'Status' },
                { title: 'Date' },
              ]}
              selectable
              bulkActions={[
                { content: 'Publish', onAction: handleBulkPublish },
                { content: 'Delete', onAction: handleBulkDelete, destructive: true },
              ]}
            >
              {reviews.map((review) => (
                <IndexTable.Row key={review.id} id={review.id}>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold">{review.customer}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{'★'.repeat(review.rating)}</IndexTable.Cell>
                  <IndexTable.Cell>{review.text.slice(0, 80)}...</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={review.status === 'published' ? 'success' : 'attention'}>
                      {review.status}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{review.date}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### Settings Page (Recharge, Judge.me Style)

```jsx
import {
  Page, Layout, Card, FormLayout, TextField, Select,
  Checkbox, Button, Banner, BlockStack, Text
} from '@shopify/polaris';

function SettingsPage() {
  return (
    <Page title="Settings" narrowWidth>
      <Layout>
        {/* Annotated Section: General */}
        <Layout.AnnotatedSection
          title="General"
          description="Configure basic app settings that apply globally."
        >
          <Card>
            <FormLayout>
              <TextField label="App name" value={name} onChange={setName} />
              <Select
                label="Default language"
                options={languageOptions}
                value={language}
                onChange={setLanguage}
              />
              <Checkbox
                label="Enable email notifications"
                checked={emailEnabled}
                onChange={setEmailEnabled}
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        {/* Annotated Section: Display */}
        <Layout.AnnotatedSection
          title="Display Settings"
          description="Control how the widget appears on your storefront."
        >
          <Card>
            <FormLayout>
              <Select
                label="Widget position"
                options={positionOptions}
                value={position}
                onChange={setPosition}
              />
              <Checkbox
                label="Show star rating on collection pages"
                checked={showOnCollection}
                onChange={setShowOnCollection}
              />
              <Checkbox
                label="Show photo reviews"
                checked={showPhotos}
                onChange={setShowPhotos}
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        {/* Danger Zone */}
        <Layout.AnnotatedSection
          title="Danger Zone"
          description="Irreversible actions. Proceed with caution."
        >
          <Card>
            <BlockStack gap="400">
              <Banner tone="critical">
                Deleting all reviews cannot be undone.
              </Banner>
              <Button tone="critical" onClick={handleDeleteAll}>
                Delete All Reviews
              </Button>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
```

---

## Design Questions Vega Should Ask for Every Shopify App

1. **Will a non-technical merchant understand this in <5 minutes?** — If no, needs templates or simpler defaults
2. **Is all data the merchant needs visible in one screen?** — If no, tab-switching = bad UX
3. **Can the storefront extension inherit theme colors?** — If no, it breaks on dark themes
4. **Is this slower than native Shopify admin?** — If yes, violates Built for Shopify requirements
5. **Can a keyboard-only user complete this task?** — If no, fails accessibility audit
6. **Does the merchant know what happened after they clicked?** — If no, add toast/banner feedback
7. **Will this work on a phone/tablet?** — If no, 50%+ of merchants will have poor experience
8. **Is the layout responsive to container size?** — For extensions, container queries not viewport queries

---

## 11 Anti-Patterns from Real App Reviews (What Merchants Hate)

| Anti-Pattern | Why Merchants Hate It | Fix |
|---|---|---|
| Custom design system in admin | "Doesn't feel like Shopify" | Use Polaris always |
| Blank canvas with no templates | "I don't know where to start" | Show template gallery first |
| Tab-switching to complete task | "Why can't I do this from here?" | Surface all context in one view |
| Hardcoded colors on extensions | "Looks terrible on my dark theme" | Inherit theme CSS variables |
| No loading skeleton | "Is the app broken?" | Skeleton matching final layout |
| No empty state on first use | "What am I supposed to do?" | Helpful "Get started" CTA |
| Slow page loads | "This app makes my store slow" | Optimize (<10 point Lighthouse impact) |
| Desktop-only layout | "Can't use this on my iPad" | Mobile-first responsive design |
| Complex onboarding (>5 min) | "I gave up and uninstalled" | 3-step max onboarding wizard |
| No keyboard navigation | "Failed accessibility check" | Ensure full tab-order and focus |
| Popup overload on install | "Stop asking me to upgrade" | Progressive disclosure, no immediate upsells |

---

*(Real brand UI/UX analysis for Vega design agent. Part of Boldteq Shopify knowledge base.)*
