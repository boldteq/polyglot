# UI States — Loading, Empty, Error Patterns

> Source: shopify.dev/docs/apps/design/user-experience | shopify.dev/docs/apps/design/alerts
> Last extracted: 2026-04-04

## Key Rules

1. **Never show blank screens** — always show loading state (skeleton, spinner) or empty state
2. **Use SkeletonPage for full-page loading** — never SkeletonBodyText for entire page
3. **Empty state requires: title + description + primary CTA** — guides merchants on next action
4. **Banners are persistent, toasts are transient** — don't confuse them
5. **Error messages explain problem + suggest fix** — avoid technical jargon

---

## Loading States

### Skeleton Page (Full Page Loading)

Use when page content is loading from API:

```typescript
{isLoading ? (
  <SkeletonPage primaryAction>
    <Layout>
      <Layout.Section>
        <Card>
          <SkeletonDisplayText size="small" />
          <SkeletonBodyText lines={3} />
        </Card>
      </Layout.Section>
      <Layout.Section variant="oneThird">
        <Card>
          <SkeletonBodyText lines={2} />
        </Card>
      </Layout.Section>
    </Layout>
  </SkeletonPage>
) : (
  <Page title="Products">
    {/* Actual page content */}
  </Page>
)}
```

### Inline Loading (Table/List Loading)

Use when loading table data without replacing entire page:

```typescript
{isLoading ? (
  <Card padding="0">
    <IndexTable
      resourceName={{singular: "product", plural: "products"}}
      itemCount={0}
      headings={[{title: "Name"}, {title: "Status"}]}
    >
      {/* Skeleton rows */}
      {[...Array(3)].map((_, i) => (
        <IndexTable.Row key={i} id={`skeleton-${i}`} position={i}>
          <IndexTable.Cell><SkeletonBodyText lines={1} /></IndexTable.Cell>
          <IndexTable.Cell><SkeletonBodyText lines={1} /></IndexTable.Cell>
        </IndexTable.Row>
      ))}
    </IndexTable>
  </Card>
) : (
  // Actual table rows
)}
```

### Spinner (Inline Processing)

Use for small inline operations (rare; prefer skeleton):

```typescript
{isSaving ? (
  <Spinner size="small" />
) : (
  <Button onClick={handleSave}>Save</Button>
)}
```

### Best Practices for Skeletons

1. **Match final layout** — skeleton should approximate final content dimensions
2. **Prevents layout shift** — content shouldn't move when skeleton replaced
3. **Smooth transition** — skeleton to actual content should be seamless
4. **Never fully blank** — show something while loading

---

## Empty States

### Empty State Pattern

Use when list/page has no content (first-time user, deleted all items, filter returns nothing):

```typescript
<Page title="Campaigns">
  <EmptyState
    heading="Create your first campaign"
    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-campaign.png"
    action={{
      content: "Create campaign",
      onAction: handleCreateCampaign
    }}
    secondaryAction={{
      content: "Learn more",
      url: "https://help.example.com/campaigns"
    }}
  >
    <p>Campaigns help you reach customers with personalized messages and offers.</p>
  </EmptyState>
</Page>
```

### Requirements for Empty States

1. **Heading** — clear, action-oriented title ("Create your first product")
2. **Description** — explain benefit or what will appear here
3. **Primary action** — main CTA button (usually "Create", "Add", "Get started")
4. **Secondary action** — optional help link
5. **Image** — optional but recommended (Shopify provides assets)
6. **No Lorem Ipsum** — use real, helpful copy

### Empty State Variations

**First-Time User (No Data Yet)**
```
Heading: "Get started with widgets"
Description: "Create your first widget to begin"
Action: "Create widget"
```

**Filtered Results (No Matches)**
```
Heading: "No products found"
Description: "Try adjusting your filters"
Action: "Clear filters"
```

**Deleted All (Intentional Empty)**
```
Heading: "No archived campaigns"
Description: "Campaigns moved to archive appear here"
Action: "View active campaigns"
```

---

## Error States

### Banner (Persistent Error)

Use for blocking or persistent errors requiring attention:

```typescript
{hasError && (
  <Banner tone="critical" title="Failed to save">
    <p>Please check your connection and try again. If the problem persists, contact support.</p>
  </Banner>
)}
```

### Color Semantics for Banners

| Tone | Use Case | Color |
|------|----------|-------|
| `critical` | Error, blocking issue | Red |
| `warning` | Alert, attention needed | Yellow |
| `success` | Confirmation of action | Green |
| `info` | Informational message | Blue |

### Inline Form Validation

Use for form field errors:

```typescript
<TextField
  label="Email"
  value={email}
  onChange={setEmail}
  error={emailError ? "Please enter a valid email" : undefined}
  type="email"
/>
```

### Toast (Transient Success)

Use via App Bridge for temporary feedback (auto-hides):

```typescript
const shopify = useAppBridge();

const handleSave = async () => {
  try {
    await save();
    shopify.toast.show("Saved successfully");
  } catch (error) {
    // Use Banner for errors, not Toast
  }
};
```

### Error Message Guidelines

1. **Explain what went wrong** — not just "Error"
   - ❌ "Error saving"
   - ✅ "Email is required"

2. **Suggest how to fix** — actionable next step
   - ❌ "Invalid data"
   - ✅ "Enter a valid email address"

3. **Avoid technical jargon** — merchant-friendly language
   - ❌ "API returned 422"
   - ✅ "This product is already linked"

4. **No blame language** — don't say "You did X wrong"
   - ❌ "You entered an invalid email"
   - ✅ "Please enter a valid email"

---

## Success States

### Success Banner (Delayed/Persistent)

Use when feedback is delayed or persistent:

```typescript
{saveSuccess && (
  <Banner tone="success" title="Settings saved">
    <p>Your changes have been applied to all active campaigns.</p>
  </Banner>
)}
```

### Success Toast (Immediate/Transient)

Use for immediate feedback (auto-hides after 3s):

```typescript
shopify.toast.show("Product added to campaign");
```

### When NOT to Use Success States

- ✅ Use success message for delayed operations (API call took 2+ seconds)
- ❌ Don't show success for instant UI feedback (checkbox toggle)
- ✅ Use success for important/risky operations (delete, billing)
- ❌ Don't show success for minor actions (page transition)

---

## Pitfalls

- **Blank loading screen** — always show skeleton, spinner, or progress indication
- **Wrong skeleton type** — using SkeletonBodyText for entire page (use SkeletonPage)
- **Toast for errors** — errors need persistent display; use Banner instead
- **No empty state** — empty pages feel broken or lost; show EmptyState with CTA
- **Generic error messages** — "Error occurred" doesn't help merchants (explain what + how to fix)
- **Success toast for slow operations** — use Banner if feedback is delayed
- **Misleading skeleton** — final content doesn't match skeleton size (causes CLS)
- **Modal for errors** — use Banner instead; modals are for user action, not just errors
