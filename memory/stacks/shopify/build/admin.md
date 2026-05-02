# Build: Admin UI Extensions

> Source: shopify.dev/docs/apps/build/admin
> Last extracted: 2026-04-04

## Admin Blocks (Inline Cards)

**What:** Inline cards embedded on resource detail pages. Merchants manually add/pin them.

**Key rules:**
- Component: `AdminBlock` (auto height management)
- Appears on resource pages (product, order, customer, draft order, inventory)
- Merchants control placement via page editor
- Optional — merchants must enable them
- Can display info, modify data inline
- Supports expansion controls

**Use cases:**
- Custom product data, recommendations on product pages
- Shipping tracking, fulfillment status on order pages
- Customer analytics, loyalty info on customer pages
- Inventory details, custom attributes on inventory pages

**Extension targets:**
```
admin.product-details.block.render
admin.order-details.block.render
admin.customer-details.block.render
admin.draft-order-details.block.render
admin.abandoned-checkout-details.block.render
admin.inventory.block.render
```

**Common pitfalls:**
- Assuming blocks always visible (they're optional)
- Using for transactional workflows (use actions instead)
- Expecting persistent state changes without saving
- Exceeding merchant's custom block limit

## Admin Actions (Modal Workflows)

**What:** Modal dialogs triggered from More actions menu or bulk action menu.

**Key rules:**
- Component: `AdminAction` (modal configuration)
- Triggers: More actions menu OR bulk action menu
- No persistent UI — modal-only workflows
- Direct GraphQL access included (no backend proxy required)
- Can launch nested modals (admin action → admin action)
- Ephemeral state (doesn't persist across modal closes)

**Use cases:**
- Bulk product updates
- Order fulfillment actions
- Customer data exports
- One-time transactional operations

**Extension targets:**
```
admin.product-details.action.render
admin.order-details.action.render
admin.customer-details.action.render
admin.draft-order-details.action.render
admin.abandoned-checkout-details.action.render
admin.bulk-actions.action.render  # Bulk action menu
```

**Common pitfalls:**
- Assuming persistent state across modal closes
- Using for non-transactional UI (use blocks instead)
- Forgetting to handle API errors
- Long-running operations without progress indication

## Admin Print Actions

**What:** Print documents (HTML, PDFs, images) directly from resource pages.

**Key rules:**
- Component: `AdminPrintAction`
- Targets: Order, product, and selection pages
- Serve printable content from app backend
- Return valid HTML, PDF, or image URL
- Must complete < 30 seconds

**Use cases:**
- Packing slips (orders)
- Invoices (orders)
- Product information sheets
- Custom labels, barcodes

**Extension targets:**
```
admin.order-details.print-action.render
admin.product-details.print-action.render
admin.orders-selection.print-action.render
admin.products-selection.print-action.render
```

**Common pitfalls:**
- Returning invalid MIME types
- Backend rendering timeout (> 30s)
- Not handling document generation failures
- Assuming same endpoint serves all merchants

## Conditional Visibility (shouldRender)

**What:** Use a `shouldRender` script to hide/show admin action menu items based on page context.

**Key rules:**
- Companion targets: `{target}.should-render`
- Script evaluates per-page context
- Returns boolean to show/hide
- Runs per page load (not stateful)
- Cannot block page rendering

**Implementation:**
```toml
# shopify.extension.toml
type = "admin_action"
target = "admin.product-details.action.render"
should_render = "./src/extensions/should-render.js"
```

**Example logic:**
```javascript
// Show action only if product has multiple variants
export function shouldRender(input) {
  const variantCount = input.admin.product.variants.length;
  return variantCount > 1;
}
```

**Companion naming pattern:**
```
admin.{resource}.action.render
admin.{resource}.action.should-render
```

**Common pitfalls:**
- Referencing unavailable fields (check schema first)
- Complex logic that timeouts (keep simple)
- Assuming state persistence (re-runs on load)

## Connecting to Backend

**What:** Admin extensions can call your app's backend via `fetch()`. Extension manages auth headers automatically.

**Key rules:**
- Use `fetch()` in extension code
- Session tokens expire every minute (fetch fresh per request)
- Extension automatically adds `Authorization` header
- Relative paths resolve against `app_url`
- Form component provides state management

**Session token flow:**
1. Call session token API from extension
2. Receive token (1-min expiry)
3. Include in `Authorization` header for backend request
4. Backend validates token with Shopify API

**Direct API access:**
- Admin actions get direct GraphQL access
- No backend proxy required
- Session tokens automatically included
- Faster than proxying through backend

**Example (fetch from admin block):**
```typescript
import { AdminBlock } from '@shopify/app-bridge-react';

export default function MyBlock() {
  const handleSave = async () => {
    // Fetch fresh session token
    const token = await admin.sessionToken.getToken();

    // Call backend API
    const response = await fetch('/api/update-product', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: '123', newValue: 'value' }),
    });

    const data = await response.json();
  };

  return <AdminBlock onAction={handleSave}>...</AdminBlock>;
}
```

**Common pitfalls:**
- Reusing expired tokens (always fetch fresh)
- Hardcoding auth logic (use session token API)
- Missing CORS headers on backend
- Assuming token persists across modal closes

## Code Pattern: Admin Block Component

### Remix + Polaris React

```typescript
import { AdminBlock, useApi } from '@shopify/app-bridge-react';
import { Card, BlockStack, TextField, Button } from '@shopify/polaris';

export function MyAdminBlock() {
  const { resourceId } = useApi().variables;  // Product/Order/Customer ID
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const token = await admin.sessionToken.getToken();
      const response = await fetch(`/api/resource/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      setData(result);
      setLoading(false);
    };
    fetchData();
  }, [resourceId]);

  if (loading) return <AdminBlock>Loading...</AdminBlock>;

  return (
    <AdminBlock
      title="Custom Data"
      summary={`Showing custom field: ${data?.customField}`}
    >
      <Card>
        <BlockStack gap="400">
          <TextField
            label="Custom field"
            value={data?.customField}
            onChange={(newValue) => setData({ ...data, customField: newValue })}
          />
          <Button onClick={handleSave}>Save</Button>
        </BlockStack>
      </Card>
    </AdminBlock>
  );
}
```

### React Router + Polaris Web Components

```typescript
import { useEffect, useState } from 'react';

export function MyAdminBlock() {
  const resourceId = new URLSearchParams(location.search).get('resourceId');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const token = await shopify.sessionToken.getToken();
      const response = await fetch(`/api/resource/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      setData(result);
      setLoading(false);
    };
    fetchData();
  }, [resourceId]);

  if (loading) {
    return (
      <shopify-admin-block>
        <p>Loading...</p>
      </shopify-admin-block>
    );
  }

  return (
    <shopify-admin-block
      title="Custom Data"
      summary={`Showing custom field: ${data?.customField}`}
    >
      <shopify-card>
        <shopify-text-field
          label="Custom field"
          value={data?.customField}
          onChange={(e: any) => setData({ ...data, customField: e.target.value })}
        />
        <shopify-button onClick={handleSave}>Save</shopify-button>
      </shopify-card>
    </shopify-admin-block>
  );
}
```
