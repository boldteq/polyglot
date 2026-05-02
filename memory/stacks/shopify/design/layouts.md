# Page Layouts — Structure & Composition Patterns

> Source: shopify.dev/docs/apps/design/app-structure | shopify.dev/docs/apps/design/layout
> Last extracted: 2026-04-04

## Key Rules

1. **Page > Layout > Layout.Section > Card** — strict hierarchy; never skip levels
2. **Polaris Page component wraps every route** — provides title, actions, back nav, responsiveness
3. **Layout.Section has two variants:** full-width (default) or oneThird (sidebar)
4. **Choose layout type based on task:** single-column (forms), full-width (tables), two-column (editors), settings (AnnotatedSection), immersive (full-screen)
5. **Mobile-first responsive** — Layout component handles mobile/tablet/desktop automatically

---

## Layout Types

### 1. Single-Column Layout (Linear Workflow)

**When to use:**
- Onboarding flows
- Setup wizards
- Forms with clear top-to-bottom progression
- Content-focused pages (articles, help pages)

**Benefits:**
- Encourages focus and linear thinking
- Works great on all screen sizes
- Clear visual hierarchy

```typescript
<Page title="Create Widget" primaryAction={{content: "Create", onAction: handleCreate}}>
  <Layout>
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <TextField label="Widget Name" value={name} onChange={setName} />
          <TextField label="Description" value={desc} onChange={setDesc} multiline />
          <Select label="Category" value={cat} onChange={setCat} options={categoryOptions} />
          <Button submit variant="primary">Create Widget</Button>
        </BlockStack>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 2. Full-Width Layout (Data Tables & Lists)

**When to use:**
- Resource index pages (lists, tables)
- Data-heavy pages with many columns
- Dashboards showing multiple metrics
- Any page needing maximum horizontal space

**Benefits:**
- Accommodates many data columns
- Suitable for merchant workflows with lots of information
- Scales well to large screens

```typescript
<Page title="Products" primaryAction={{content: "Add Product"}}>
  <Layout>
    <Layout.Section>
      <Card padding="0">
        <IndexTable
          resourceName={{singular: "product", plural: "products"}}
          itemCount={products.length}
          headings={[{title: "Name"}, {title: "Inventory"}, {title: "Price"}, {title: "Status"}]}
          selectedItemsCount={selectedResources.length}
          onSelectionChange={handleSelectionChange}
        >
          {productRows}
        </IndexTable>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 3. Two-Column Layout (Editor + Preview)

**When to use:**
- Visual editors with live preview
- Comparison views (side-by-side editing)
- Settings with preview pane
- Form with reference content

**Benefits:**
- Merchants see real-time changes
- Contextual information visible while editing
- Professional editor experience

```typescript
<Page title="Edit Email Template">
  <Layout>
    {/* Main editor — 2/3 width */}
    <Layout.Section>
      <Card>
        <BlockStack gap="400">
          <TextField label="Subject" value={subject} onChange={setSubject} />
          <TextField label="Body" value={body} onChange={setBody} multiline />
          <Button variant="primary">Save</Button>
        </BlockStack>
      </Card>
    </Layout.Section>

    {/* Preview panel — 1/3 width sidebar */}
    <Layout.Section variant="oneThird">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd">Preview</Text>
          <Box background="subdued" padding="200">
            <pre>{previewContent}</pre>
          </Box>
        </BlockStack>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 4. Settings Layout (AnnotatedSection)

**When to use:**
- Application settings/configuration
- Preferences pages
- Grouped related settings
- Settings with descriptions

**Benefits:**
- Each setting group has title + description
- Logical organization for many settings
- Professional, organized appearance

```typescript
<Page title="Settings">
  <Layout>
    <Layout.AnnotatedSection
      title="General"
      description="Basic app configuration"
    >
      <Card>
        <BlockStack gap="400">
          <TextField label="Store Name" value={storeName} onChange={setStoreName} />
          <Select label="Currency" value={currency} onChange={setCurrency} options={currencyOptions} />
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>

    <Layout.AnnotatedSection
      title="Notifications"
      description="Choose how you want to be notified"
    >
      <Card>
        <ChoiceList
          title="Email Notifications"
          choices={notificationChoices}
          selected={notifications}
          onChange={setNotifications}
          allowMultiple
        />
      </Card>
    </Layout.AnnotatedSection>

    <Layout.AnnotatedSection
      title="Advanced"
      description="Advanced configuration"
    >
      <Card>
        <BlockStack gap="400">
          <Checkbox label="Enable experimental features" checked={experimentalEnabled} onChange={setExperimentalEnabled} />
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>
  </Layout>
</Page>
```

### 5. Immersive Layout (Full-Screen Editor)

**When to use:**
- Full-screen focused experiences
- Complex visual editors
- Wizards requiring merchant attention
- Distraction-free editing

**Benefits:**
- Maximum space for primary task
- Removes adjacent admin UI distractions
- Professional, focused UX

```typescript
<Box>
  {/* Top bar element */}
  <div style={{borderBottom: "1px solid #e5e7eb", padding: "16px"}}>
    <InlineStack>
      <Button onClick={handleBack}>Back</Button>
      <Text variant="headingMd">Full-Screen Editor</Text>
      <Button variant="primary" onClick={handleSave}>Save</Button>
    </InlineStack>
  </div>

  {/* App body — full height minus top bar */}
  <Box padding="400">
    {/* Editor content here */}
  </Box>
</Box>
```

---

## Responsive Behavior

### Automatic Responsiveness
- `Layout.Section variant="oneThird"` (sidebar) **automatically becomes full-width on mobile**
- Grid components adapt based on viewport size
- Polaris components are mobile-first by design
- No custom media queries needed for basic layouts

### Manual Grid Layouts
```typescript
<Grid columns={{xs: 1, sm: 2, md: 3, lg: 4}}>
  <Grid.Cell>{item1}</Grid.Cell>
  <Grid.Cell>{item2}</Grid.Cell>
  <Grid.Cell>{item3}</Grid.Cell>
</Grid>
```

---

## Common Composition Patterns

### Empty State (New Resource)
```typescript
<Page title="Products">
  <EmptyState
    heading="Create your first product"
    image="https://..."
    action={{content: "Create product", onAction: handleCreate}}
    secondaryAction={{content: "Learn more", url: "https://help.example.com"}}
  >
    <p>Products help your customers find what they're looking for.</p>
  </EmptyState>
</Page>
```

### Loading State
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
    </Layout>
  </SkeletonPage>
) : (
  <Page title="Products">
    {/* Content here */}
  </Page>
)}
```

---

## Pitfalls

- **Skipping Layout > Section** — using Card directly inside Page breaks responsive behavior
- **Using full-width for forms** — single-column layouts are better for linear workflows
- **Too many Layout.Sections** — group related content into single Section when possible
- **No empty/loading states** — blank screens feel broken; always show skeleton or empty state
- **Hardcoding widths** — let Polaris Grid/Layout handle responsiveness
- **Mobile-last design** — test mobile first; add breakpoints only when needed
- **variant="oneThird" on desktop only** — Polaris handles mobile collapse automatically; don't override
