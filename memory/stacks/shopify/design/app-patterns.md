# Shopify App Design Patterns — Admin UI & Merchant Experience

> Source: shopify.dev/docs/apps/design, polaris-react.shopify.com/patterns, Shopify App Store top apps analysis
> Stack B: Polaris React (Remix) / Polaris Web Components (React Router)
> Last updated: 2026-04-04

---

## Built for Shopify Design Requirements (2025+)

Apps MUST meet these requirements for "Built for Shopify" badge:

1. **Polaris mandatory** — Every admin page uses Polaris components (React or Web Components)
2. **Layout patterns** — Use official Polaris layout patterns (resource index, resource detail, app settings)
3. **Performance gates** — CLS ≤ 0.1, INP ≤ 200ms (measured over 28 days, minimum 100 calls)
4. **Feels like admin** — App should feel like a native extension of Shopify admin, not a separate product
5. **No confusion/stress** — Design should be familiar, helpful, and user-friendly
6. **Skeleton states** — Every page loads with skeleton placeholders that match final layout

---

## 5 Official Polaris Layout Patterns

### Pattern 1: Resource Index Layout

**Purpose:** Merchants organize and act on lists of resource objects (products, orders, campaigns, etc.)

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ Page (full-width, title + primaryAction)              │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Card (padding="0")                                │ │
│ │ ┌──────────────────────────────────────────────┐ │ │
│ │ │ IndexFilters (search + sort + filters + tabs) │ │ │
│ │ ├──────────────────────────────────────────────┤ │ │
│ │ │ IndexTable                                    │ │ │
│ │ │  ☐ │ Name          │ Status  │ Date    │ ••• │ │ │
│ │ │  ☐ │ Resource A    │ Active  │ Mar 28  │ ••• │ │ │
│ │ │  ☐ │ Resource B    │ Draft   │ Mar 27  │ ••• │ │ │
│ │ │  ☐ │ Resource C    │ Active  │ Mar 26  │ ••• │ │ │
│ │ ├──────────────────────────────────────────────┤ │ │
│ │ │ Pagination (centered)                         │ │ │
│ │ └──────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Rules:**
- Full-width page (no `narrowWidth`). Merchants need horizontal space for data columns
- Card wraps IndexTable with `padding="0"` (table handles its own padding)
- IndexFilters sits above the table (search + sort + saved views as tabs)
- Bulk actions appear when rows are selected (top bar transforms)
- Pagination centered below table
- Empty state: Polaris `EmptyState` with illustration + "Create your first [resource]" CTA
- Loading state: `SkeletonPage` → `SkeletonBodyText` matching table row heights

**React Polaris:**
```tsx
<Page title="Campaigns" primaryAction={{ content: "Create campaign" }}>
  <Card padding="0">
    <IndexFilters
      tabs={tabs}
      selected={selected}
      queryValue={queryValue}
      onQueryChange={handleQueryChange}
      filters={filters}
      sortOptions={sortOptions}
      sortSelected={sortSelected}
      onSort={handleSort}
      mode={mode}
      setMode={setMode}
    />
    <IndexTable
      resourceName={{ singular: "campaign", plural: "campaigns" }}
      itemCount={campaigns.length}
      selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
      onSelectionChange={handleSelectionChange}
      headings={[
        { title: "Campaign" },
        { title: "Status" },
        { title: "Sent" },
        { title: "Open rate" },
      ]}
      bulkActions={bulkActions}
      promotedBulkActions={promotedBulkActions}
    >
      {rowMarkup}
    </IndexTable>
  </Card>
</Page>
```

**Web Components:**
```tsx
<s-page title="Campaigns">
  <s-card padding="0">
    <s-index-table resourceName="campaign" pluralName="campaigns">
      <s-index-table-row>
        {/* row content */}
      </s-index-table-row>
    </s-index-table>
  </s-card>
</s-page>
```

---

### Pattern 2: Resource Detail Layout (Two-Column)

**Purpose:** Merchants create, view, and edit a single resource object

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ Page (title + actions + breadcrumb back to index)     │
│ ┌────────────────────────┐ ┌──────────────────────┐ │
│ │ PRIMARY (2/3 width)    │ │ SECONDARY (1/3 width)│ │
│ │                        │ │                      │ │
│ │ ┌────────────────────┐ │ │ ┌──────────────────┐ │ │
│ │ │ Card: Core content │ │ │ │ Card: Status     │ │ │
│ │ │ - Title field      │ │ │ │ - Active/Draft   │ │ │
│ │ │ - Description      │ │ │ │ - Published date │ │ │
│ │ │ - Rich text editor │ │ │ └──────────────────┘ │ │
│ │ └────────────────────┘ │ │                      │ │
│ │                        │ │ ┌──────────────────┐ │ │
│ │ ┌────────────────────┐ │ │ │ Card: Summary    │ │ │
│ │ │ Card: Media        │ │ │ │ - Created by     │ │ │
│ │ │ - Image upload     │ │ │ │ - Last modified  │ │ │
│ │ │ - Gallery          │ │ │ │ - Tags           │ │ │
│ │ └────────────────────┘ │ │ └──────────────────┘ │ │
│ └────────────────────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Rules:**
- Two-column: `InlineGrid columns={{ xs: 1, md: "2fr 1fr" }}`
- Primary column (left): Content that defines the resource (title, body, media, settings)
- Secondary column (right): Supporting info (status, metadata, tags, summary)
- Cards group similar content. Don't put unrelated fields in the same card
- Order by importance: Most important cards at top of each column
- Page actions: Save (primary), Delete (destructive), secondary actions in overflow menu
- Breadcrumb: Back to index page (`backAction` on Page component)
- On mobile (xs): Columns stack to single column (secondary below primary)

**React Polaris:**
```tsx
<Page
  title="Campaign: Summer Sale"
  backAction={{ content: "Campaigns", url: "/app/campaigns" }}
  primaryAction={{ content: "Save", onAction: handleSave }}
  secondaryActions={[{ content: "Duplicate" }, { content: "Archive" }]}
>
  <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <TextField label="Title" value={title} onChange={setTitle} />
          <TextField label="Description" value={desc} onChange={setDesc} multiline={4} />
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="400">
          <Text variant="headingSm">Media</Text>
          <DropZone onDrop={handleDrop} />
        </BlockStack>
      </Card>
    </BlockStack>

    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text variant="headingSm">Status</Text>
          <Select label="" options={statusOptions} value={status} onChange={setStatus} />
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="200">
          <Text variant="headingSm">Summary</Text>
          <DescriptionList items={summaryItems} />
        </BlockStack>
      </Card>
    </BlockStack>
  </InlineGrid>
</Page>
```

---

### Pattern 3: App Settings Layout (Annotated Sections)

**Purpose:** Merchants scan, find, and configure groups of settings

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ Page (title: "Settings", narrowWidth)                 │
│                                                       │
│ ┌────────────────────┐ ┌──────────────────────────┐ │
│ │ Label: General     │ │ Card                      │ │
│ │ Description:       │ │ ┌──────────────────────┐ │ │
│ │ Basic configuration│ │ │ TextField: Store name │ │ │
│ │                    │ │ │ Select: Timezone      │ │ │
│ │                    │ │ │ Select: Language       │ │ │
│ │                    │ │ └──────────────────────┘ │ │
│ └────────────────────┘ └──────────────────────────┘ │
│ ─────────────── Divider ──────────────────────────── │
│ ┌────────────────────┐ ┌──────────────────────────┐ │
│ │ Label: Notifications│ │ Card                     │ │
│ │ Description:       │ │ ┌──────────────────────┐ │ │
│ │ How you get alerted│ │ │ ChoiceList: Channels  │ │ │
│ │                    │ │ │ TextField: Email      │ │ │
│ │                    │ │ └──────────────────────┘ │ │
│ └────────────────────┘ └──────────────────────────┘ │
│ ─────────────── Divider ──────────────────────────── │
│ ┌────────────────────┐ ┌──────────────────────────┐ │
│ │ Label: Danger Zone │ │ Card                      │ │
│ │ Description:       │ │ ┌──────────────────────┐ │ │
│ │ Irreversible actions│ │ │ Button: Uninstall    │ │ │
│ │                    │ │ └──────────────────────┘ │ │
│ └────────────────────┘ └──────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Rules:**
- Left column: Glanceable labels and descriptions for scanning
- Right column: Settings grouped in cards
- Use `Layout.AnnotatedSection` (React) or annotated `<s-section>` (Web Components)
- Group related settings in the same card
- Save behavior: Auto-save with toast OR explicit "Save" button at top (contextual save bar)
- Danger zone: Destructive actions at bottom, red destructive button with confirmation modal
- Narrow width: Settings pages use `narrowWidth` on Page for focused reading

**React Polaris:**
```tsx
<Page title="Settings" narrowWidth>
  <Layout>
    <Layout.AnnotatedSection
      title="General"
      description="Basic configuration for your app."
    >
      <Card>
        <BlockStack gap="400">
          <TextField label="Store name" value={storeName} onChange={setStoreName} />
          <Select label="Timezone" options={timezones} value={tz} onChange={setTz} />
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>

    <Layout.AnnotatedSection
      title="Notifications"
      description="Configure how you receive alerts."
    >
      <Card>
        <ChoiceList
          title="Notify me via"
          choices={[
            { label: "Email", value: "email" },
            { label: "SMS", value: "sms" },
          ]}
          selected={channels}
          onChange={setChannels}
          allowMultiple
        />
      </Card>
    </Layout.AnnotatedSection>

    <Layout.AnnotatedSection
      title="Danger zone"
      description="These actions are irreversible."
    >
      <Card>
        <Button variant="primary" tone="critical" onClick={handleUninstall}>
          Uninstall app
        </Button>
      </Card>
    </Layout.AnnotatedSection>
  </Layout>
</Page>
```

---

### Pattern 4: App Home / Dashboard

**Purpose:** First page merchants see when opening the app. Surfaces metrics, setup progress, and quick actions.

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ Page (title: app name, no back button)                │
│                                                       │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Banner: Score/Health (optional — e.g., "SEO 85") │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ Metric   │ │ Metric   │ │ Metric   │ │ Metric   ││
│ │ Card     │ │ Card     │ │ Card     │ │ Card     ││
│ │ Revenue  │ │ Orders   │ │ Sessions │ │ Conv %   ││
│ │ $12,450  │ │ 342      │ │ 8,921    │ │ 3.8%     ││
│ │ +12% ▲   │ │ +5% ▲    │ │ -2% ▼    │ │ +0.3% ▲  ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                       │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Setup Guide (if onboarding incomplete)            │ │
│ │ ■■■■■░░░░░ 50% complete (2/4 steps)              │ │
│ │                                                    │ │
│ │ ✅ Step 1: Connect your store   [Completed]       │ │
│ │ ✅ Step 2: Set up tracking      [Completed]       │ │
│ │ ▶  Step 3: Create first campaign [Start →]        │ │
│ │ ○  Step 4: Launch                [Locked]          │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Common Issues / Attention Required                 │ │
│ │ ⚠ 3 products missing meta descriptions            │ │
│ │ ⚠ 1 broken link detected                          │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Rules:**
- App Home uses Web Components ONLY (Polaris React not supported)
- No back button on home (it's the root)
- Metric cards in 4-column grid at desktop, 2-column at tablet, 1-column at mobile
- Setup guide only shown if onboarding is incomplete. Dismiss after completion.
- Maximum 5 setup steps (more causes merchant drop-off)
- Each step: heading + description + illustration + action button
- Progress bar shows overall completion
- Mark steps complete with ✅ only after actual product event fires (not on button click)
- Issues section: Show actionable items only (not informational). Each item links to fix page.
- Banner at top: For score, health status, or urgent alerts

---

### Pattern 5: Visual Editor (Two-Column Preview)

**Purpose:** Merchants edit content and see a live preview side by side

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ Page (title + save action)                            │
│ ┌─────────────────────────┐ ┌──────────────────────┐│
│ │ CONTROLS (left, 1/3)    │ │ PREVIEW (right, 2/3) ││
│ │                         │ │                      ││
│ │ Card: Typography        │ │ ┌──────────────────┐ ││
│ │ - Font family           │ │ │                  │ ││
│ │ - Font size             │ │ │   Live Preview   │ ││
│ │ - Color                 │ │ │   of widget      │ ││
│ │                         │ │ │   as merchant    │ ││
│ │ Card: Layout            │ │ │   configures it  │ ││
│ │ - Position              │ │ │                  │ ││
│ │ - Spacing               │ │ │                  │ ││
│ │ - Background            │ │ └──────────────────┘ ││
│ └─────────────────────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Rules:**
- Two-column: `InlineGrid columns={{ xs: 1, md: "1fr 2fr" }}`
- Controls on left (narrow), preview on right (wide)
- Preview updates in real-time as merchant changes settings
- Mobile: Columns stack (controls on top, preview below)
- Preview should be wrapped in an iframe or isolated container matching the merchant's storefront theme
- Contextual save bar at top when changes are unsaved

---

## Merchant Onboarding Patterns

### Setup Guide Composition

The official Shopify setup guide pattern for onboarding:

```tsx
// React Polaris approach
<Card>
  <BlockStack gap="400">
    <InlineStack align="space-between">
      <Text variant="headingMd">Setup guide</Text>
      <Text variant="bodySm" tone="subdued">
        {completedSteps} of {totalSteps} completed
      </Text>
    </InlineStack>

    <ProgressBar progress={(completedSteps / totalSteps) * 100} size="small" />

    <BlockStack gap="200">
      {steps.map((step, i) => (
        <SetupStep
          key={i}
          title={step.title}
          description={step.description}
          completed={step.completed}
          active={step.active}
          action={step.action}
        />
      ))}
    </BlockStack>
  </BlockStack>
</Card>
```

### Onboarding Rules (from Shopify)

1. **Maximum 5 steps.** More causes merchant drop-off
2. **80/20 rule.** Teach the 20% of features merchants use 80% of the time
3. **Brief and direct.** Clear instructions, no walls of text
4. **Mark complete on product event.** Not on button click — verify the action actually happened
5. **Progress indicator.** Show completion percentage with ProgressBar
6. **Expandable steps.** Only current step is expanded; completed steps collapsed with ✅
7. **Locked steps.** Future steps show as locked until dependencies are met
8. **Dismiss after completion.** Once all steps done, show success banner, then hide setup guide
9. **Re-accessible.** Merchant can find setup guide again from settings or help

### Empty State (First-Time Merchant)

Before a merchant has created any resources:

```tsx
<Card>
  <EmptyState
    heading="Create your first campaign"
    action={{ content: "Create campaign", url: "/app/campaigns/new" }}
    secondaryAction={{ content: "Learn more", url: "https://help.example.com" }}
    image="https://cdn.shopify.com/illustrations/empty-state.svg"
  >
    <Text>
      Campaigns let you reach customers with targeted messages.
      Create your first one to get started.
    </Text>
  </EmptyState>
</Card>
```

**Rules:**
- Illustration (not icon) — use Shopify's illustration style or a consistent custom set
- Heading: "Create your first [resource]" format
- Primary action: Button to create the resource
- Secondary action: Link to help/docs
- Description: 1-2 sentences explaining what the resource does

---

## Billing & Plan Selection Patterns

### Plan Selection Page

```
┌──────────────────────────────────────────────────────┐
│ Page (title: "Choose a plan")                         │
│                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │ Card     │ │ Card     │ │ Card     │              │
│ │          │ │ (Popular)│ │          │              │
│ │ Free     │ │ Pro      │ │ Business │              │
│ │          │ │          │ │          │              │
│ │ $0/mo    │ │ $29/mo   │ │ $99/mo   │              │
│ │          │ │          │ │          │              │
│ │ ✓ 10 wdg │ │ ✓ 100 wdg│ │ ✓ Unlmtd │              │
│ │ ✓ Basic  │ │ ✓ Adv    │ │ ✓ Premium│              │
│ │ ✗ API    │ │ ✓ API    │ │ ✓ API    │              │
│ │          │ │          │ │ ✓ Priority│              │
│ │ [Current]│ │[Upgrade] │ │[Upgrade] │              │
│ └──────────┘ └──────────┘ └──────────┘              │
└──────────────────────────────────────────────────────┘
```

**Rules:**
- Use Shopify Billing API (never external payment providers)
- Show current plan clearly (different button state: "Current plan" disabled)
- Highlight recommended plan with Badge ("Most popular")
- Feature comparison: ✓ for included, ✗ for excluded
- Upgrade redirects to Shopify's billing approval screen (App Bridge)
- Trial: Show trial days remaining in Banner at top
- Usage-based: Show usage meter with current/limit

### Active Subscription Display

```tsx
<Card>
  <BlockStack gap="400">
    <InlineStack align="space-between">
      <Text variant="headingSm">Current plan</Text>
      <Badge tone="success">Pro</Badge>
    </InlineStack>
    <Text variant="bodySm" tone="subdued">
      $29/month · Renews on April 15, 2026
    </Text>
    <ProgressBar
      progress={usage.current / usage.limit * 100}
      size="small"
      tone={usage.current > usage.limit * 0.8 ? "critical" : "highlight"}
    />
    <Text variant="bodySm" tone="subdued">
      {usage.current} / {usage.limit} widgets used this month
    </Text>
    <InlineStack gap="200">
      <Button>Change plan</Button>
      <Button tone="critical" variant="plain">Cancel subscription</Button>
    </InlineStack>
  </BlockStack>
</Card>
```

---

## Navigation Patterns

### NavMenu (App Bridge — Mandatory)

Every Shopify app uses NavMenu for top-level navigation. Defined in the app root:

```tsx
// app.tsx (Remix) or root layout
import { NavMenu } from "@shopify/app-bridge-react";

<NavMenu>
  <a href="/app" rel="home">Home</a>
  <a href="/app/campaigns">Campaigns</a>
  <a href="/app/analytics">Analytics</a>
  <a href="/app/settings">Settings</a>
</NavMenu>
```

**Rules:**
- Maximum 7 top-level items (cognitive load limit)
- "Home" always first with `rel="home"`
- Use clear, short labels (1-2 words)
- Active state handled automatically by App Bridge
- No custom sidebars in admin — NavMenu only
- Sub-navigation via Tabs within pages (not nested menus)

### In-Page Tab Navigation

For pages with multiple sections (e.g., Analytics with different report types):

```tsx
<Page title="Analytics">
  <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
    {selectedTab === 0 && <OverviewTab />}
    {selectedTab === 1 && <CampaignsTab />}
    {selectedTab === 2 && <RevenueTab />}
  </Tabs>
</Page>
```

---

## Toast & Feedback Patterns

### When to Use What

| Feedback Type | Component | Duration | Use Case |
|--------------|-----------|----------|----------|
| **Success confirmation** | Toast (App Bridge) | 3-5 seconds | "Campaign saved", "Settings updated" |
| **Persistent warning** | Banner (warning) | Until dismissed | "Trial expires in 3 days" |
| **Error — recoverable** | Banner (critical) | Until dismissed | "Failed to save. Try again." |
| **Error — field-level** | TextField error prop | Persistent | "Name is required" |
| **Info — contextual** | Banner (info) | Until dismissed | "New feature available" |
| **Loading confirmation** | Spinner + Text | While loading | "Saving..." |
| **Destructive confirmation** | Modal | Until user acts | "Delete this campaign? This can't be undone." |

### Toast via App Bridge

```tsx
import { useAppBridge } from "@shopify/app-bridge-react";

const shopify = useAppBridge();

// Success toast
shopify.toast.show("Campaign saved successfully");

// Error toast
shopify.toast.show("Failed to save campaign", { isError: true });
```

**Rules:**
- Never use custom toast implementations. Always App Bridge.
- Toast for transient feedback only (success confirmations, quick actions)
- Banner for persistent messages (errors that need attention, trial warnings, feature announcements)
- Modal for destructive confirmations (delete, uninstall, irreversible actions)

---

## Contextual Save Bar

When a merchant has unsaved changes, show the contextual save bar:

```tsx
// React Polaris approach
<Page title="Settings">
  {isDirty && (
    <ContextualSaveBar
      message="Unsaved changes"
      saveAction={{
        onAction: handleSave,
        loading: isSaving,
        disabled: !isDirty,
      }}
      discardAction={{
        onAction: handleDiscard,
      }}
    />
  )}
  {/* ... settings form */}
</Page>
```

**Rules:**
- Show only when form state differs from saved state
- "Save" (primary) + "Discard" (secondary)
- Save button shows loading spinner while saving
- Discard resets form to last saved state
- Bar sticks to top of viewport (above page content)
- Warn before navigation if unsaved changes exist

---

## Loading & Skeleton Patterns

### Page-Level Loading

```tsx
// Show skeleton that matches the real page layout
function CampaignsPageSkeleton() {
  return (
    <SkeletonPage title primaryAction>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={3} />
              <SkeletonBodyText lines={3} />
              <SkeletonBodyText lines={3} />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}
```

**Rules:**
- Skeleton MUST match the final layout to prevent CLS (layout shift)
- Use `SkeletonPage` for full pages, `SkeletonBodyText` for content areas
- Never use full-page spinners. Always structured skeletons.
- Show skeleton immediately (no blank screen, not even for 100ms)
- For tables: Show skeleton rows matching expected row count (or 5 default)

---

## Error Handling Patterns

### Page-Level Error

```tsx
<Page title="Campaigns">
  <Banner
    title="Something went wrong"
    tone="critical"
    action={{ content: "Try again", onAction: handleRetry }}
  >
    <Text>We couldn't load your campaigns. Please try again.</Text>
  </Banner>
</Page>
```

### Form Validation Errors

```tsx
<TextField
  label="Campaign name"
  value={name}
  onChange={setName}
  error={errors.name ? "Campaign name is required" : undefined}
  helpText="Give your campaign a descriptive name"
/>
```

### Rules

- Field-level errors: Use `error` prop on input components. Shows red text below field.
- Form-level errors: Banner at top of form with list of all errors
- API errors: Banner with retry action
- Permission errors: Banner explaining what access is needed + link to Shopify admin
- Rate limit errors: Banner with "Please wait and try again"
- Never silently swallow errors. Always show feedback.

---

## Accessibility Requirements (Polaris Built-In)

Polaris components are accessible by default, but Vega must ensure:

1. **Don't override Polaris styles** — Overriding removes built-in accessibility
2. **Visible labels on all inputs** — Never use placeholder as the only label
3. **Action labels descriptive** — "Delete campaign" not just "Delete"
4. **Badge text explains status** — `<Badge tone="success">Active</Badge>` not just a green dot
5. **Modal focus trap** — Polaris Modal handles this, but custom modals must too
6. **Skip nav** — App Bridge handles skip navigation for embedded apps
7. **Color contrast** — Polaris tokens are accessible by default. Don't override colors.
8. **Keyboard navigation** — All Polaris components support keyboard. Test Tab/Enter/Escape.

---

## Anti-Patterns (Instant App Store Rejection)

1. **Custom sidebar navigation in admin** — Use NavMenu only
2. **Tailwind/CSS classes in admin routes** — Polaris only, zero custom styling
3. **Custom toast/notification library** — App Bridge toast only
4. **Custom modal implementation** — App Bridge modal only
5. **Hardcoded colors/spacing** — Polaris design tokens only
6. **Full-page spinner** — Use skeleton states matching final layout
7. **External payment checkout** — Shopify Billing API only
8. **No empty state** — Every list must have an EmptyState for first-time experience
9. **Placeholder text in production** — No "Lorem ipsum", "Coming soon", "TBD"
10. **Breaking Polaris hierarchy** — `Page > Layout > Section > Card` is mandatory
