# Shopify App Bridge — Complete Reference

**Source:** [shopify.dev/docs/api/app-bridge](https://shopify.dev/docs/api/app-bridge)
**Library:** @shopify/app-bridge-react
**Version:** 4.x (current, recommended)
**Updated:** 2026-04-04

---

## Overview

App Bridge is a JavaScript library that connects Shopify admin apps to the Shopify admin. It provides:

1. **React components** for native UI elements (modals, navigation, breadcrumbs)
2. **Actions** for triggering behaviors (navigation, notifications, toasts)
3. **APIs** for accessing admin context (shop, user, theme, locale)
4. **Embedded app experience** — your app runs inside the admin iframe

**Key facts:**
- React 16.8+ required (hooks support)
- Works with Remix, Next.js, Vite + React
- Replaces legacy App Bridge v3.x
- TypeScript support included
- Must be inside `<PolarisProvider>` (App Bridge provides context)

---

## Installation & Setup

### Package Installation

```bash
npm install @shopify/app-bridge-react @shopify/polaris
npm install --save-dev @shopify/app-bridge-types
```

### App Initialization

Create `App.tsx`:

```tsx
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { PolarisProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";

export default function App() {
  return (
    <AppProvider>
      <PolarisProvider>
        <YourAppRoutes />
      </PolarisProvider>
    </AppProvider>
  );
}
```

**Note:** `@shopify/shopify-app-remix` wraps App Bridge. If not using Remix, use `@shopify/app-bridge-react` directly:

```tsx
import { Provider as AppBridgeProvider } from "@shopify/app-bridge-react";

export default function App() {
  return (
    <AppBridgeProvider>
      <PolarisProvider>
        <YourAppRoutes />
      </PolarisProvider>
    </AppBridgeProvider>
  );
}
```

---

## Navigation

### NavMenu Component (New in v4.x)

Use the `<s-app-nav>` web component for sidebar navigation:

```tsx
import { Page } from "@shopify/polaris";

export default function Dashboard() {
  return (
    <Page title="Dashboard">
      <s-app-nav>
        <s-app-nav-link
          href="/app/dashboard"
          label="Dashboard"
          rel="prefetch"
        />
        <s-app-nav-link
          href="/app/products"
          label="Products"
          rel="prefetch"
        />
        <s-app-nav-link
          href="/app/settings"
          label="Settings"
          rel="prefetch"
        />
      </s-app-nav>

      {/* Your page content */}
    </Page>
  );
}
```

**Key points:**
- Active link auto-matched based on current URL
- Web component (not React component)
- Set `rel="prefetch"` for faster navigation
- Renders as left sidebar on desktop, dropdown on mobile

### Legacy Navigation (v3.x — deprecated)

Old pattern (do NOT use in new code):
```tsx
// DEPRECATED — don't use
<NavigationMenu
  navigationLinks={[
    { label: "Dashboard", destination: "/app/dashboard" }
  ]}
  matcher={window.location.pathname}
/>
```

---

## Modals

### Modal Component

Display overlay content:

```tsx
import { useCallback, useState } from "react";
import { Modal, Button, TextField, Form } from "@shopify/polaris";

export default function ProductForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <Button onClick={handleOpen}>Add Product</Button>

      <Modal
        open={isOpen}
        onClose={handleClose}
        title="Add Product"
        primaryAction={{
          content: "Add",
          onAction: () => {
            // Handle submit
            console.log("Product title:", title);
            handleClose();
          }
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleClose
          }
        ]}
      >
        <Modal.Section>
          <Form onSubmit={() => {}}>
            <TextField
              label="Product Title"
              value={title}
              onChange={setTitle}
              autoFocus
            />
          </Form>
        </Modal.Section>
      </Modal>
    </>
  );
}
```

**Modal.Section** divides modal content into logical sections.

### Full-Page Modal

For large forms or multi-step workflows:

```tsx
<Modal fullScreen open={isOpen} onClose={handleClose} title="Bulk Import">
  <Modal.Section>
    {/* Large form */}
  </Modal.Section>
</Modal>
```

---

## Context Access

### useAppBridge Hook

Access shop, user, and app context:

```tsx
import { useAppBridge } from "@shopify/app-bridge-react";
import { useMemo } from "react";

export default function MyComponent() {
  const app = useAppBridge();

  const shopData = useMemo(() => {
    // Access context via app object
    return {
      apiKey: app.apiKey,
      host: app.host, // Base64-encoded host
      locale: app.localeCode // e.g., "en-US"
    };
  }, [app]);

  return <div>{shopData.locale}</div>;
}
```

**Available properties:**
- `apiKey` — App's API key
- `host` — Encoded shop hostname
- `localeCode` — Shop locale (e.g., "en-US", "fr-FR")
- `forceReload()` — Force page refresh

---

## Toasts & Notifications

### Toast Component (Polaris)

Quick feedback messages:

```tsx
import { Toast } from "@shopify/polaris";
import { useCallback, useState } from "react";

export default function MyComponent() {
  const [active, setActive] = useState(false);

  const handleClose = useCallback(() => setActive(false), []);

  return (
    <>
      <button onClick={() => setActive(true)}>
        Show Success Message
      </button>

      {active && (
        <Toast
          content="Product saved successfully"
          onClose={handleClose}
          duration={3000}
        />
      )}
    </>
  );
}
```

### Toast with Action

```tsx
<Toast
  content="5 products saved"
  onClose={handleClose}
  action={{
    content: "Undo",
    onAction: handleUndo
  }}
  error={false}
/>
```

### Error Toast

```tsx
{isError && (
  <Toast
    content="Failed to save product"
    onClose={handleClose}
    error={true}
    duration={5000}
  />
)}
```

---

## Common UI Patterns

### Page with Top Breadcrumb

```tsx
import { Page, Breadcrumbs } from "@shopify/polaris";

export default function ProductDetail() {
  return (
    <Page
      title="Summer Sale"
      breadcrumbs={[
        { content: "Products", url: "/app/products" },
        { content: "Collections", url: "/app/products/collections" }
      ]}
      primaryAction={{
        content: "Edit",
        onAction: () => console.log("Edit clicked")
      }}
    >
      {/* Page content */}
    </Page>
  );
}
```

### Tabs Navigation

```tsx
import { Tabs } from "@shopify/polaris";
import { useState } from "react";

export default function Settings() {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    {
      id: "general",
      content: "General Settings",
      panelID: "general-content"
    },
    {
      id: "advanced",
      content: "Advanced",
      panelID: "advanced-content"
    }
  ];

  return (
    <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab}>
      {activeTab === 0 && <div id="general-content">{/* ... */}</div>}
      {activeTab === 1 && <div id="advanced-content">{/* ... */}</div>}
    </Tabs>
  );
}
```

### Resource List with Search

```tsx
import { ResourceList, ResourceItem, TextField, EmptyState } from "@shopify/polaris";
import { useState } from "react";

export default function ProductList({ products }) {
  const [searchValue, setSearchValue] = useState("");

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <>
      <TextField
        label="Search products"
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Search..."
        clearButton
        onClearButtonClick={() => setSearchValue("")}
      />

      {filtered.length === 0 ? (
        <EmptyState
          heading="No products found"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/empty-state.gif"
        >
          <p>Try a different search term</p>
        </EmptyState>
      ) : (
        <ResourceList
          resourceName={{ singular: "product", plural: "products" }}
          items={filtered}
          renderItem={(product) => (
            <ResourceItem
              id={product.id}
              url={`/app/products/${product.id}`}
            >
              <h3>{product.title}</h3>
              <div>${product.price}</div>
            </ResourceItem>
          )}
        />
      )}
    </>
  );
}
```

---

## Form Management

### useForm Hook (Polaris + React Hook Form)

```tsx
import { Form, TextField, Button } from "@shopify/polaris";
import { useForm } from "react-hook-form";
import { useState } from "react";

export default function ProductForm() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      title: "",
      price: "",
      vendor: ""
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        body: JSON.stringify(data)
      });
      if (res.ok) {
        // Show success
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <TextField
        label="Product Title"
        {...register("title", { required: "Title required" })}
        error={errors.title?.message}
      />
      <TextField
        label="Price"
        type="number"
        {...register("price", { required: "Price required" })}
        error={errors.price?.message}
      />
      <Button submit loading={isLoading}>
        Save Product
      </Button>
    </Form>
  );
}
```

---

## API Patterns

### useAppBridge for Admin GraphQL

Fetch from Shopify Admin API inside your app:

```tsx
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";

export default function AdminDataComponent() {
  const app = useAppBridge();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      try {
        // Your backend calls Admin API and returns data
        const res = await fetch("/api/admin/products");
        const data = await res.json();
        setProducts(data);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [app]);

  return loading ? <div>Loading...</div> : <div>{products.length} products</div>;
}
```

---

## Error Handling

### Error Boundary Pattern

```tsx
import { Page, Banner } from "@shopify/polaris";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Page title="Error">
          <Banner tone="critical" title="Something went wrong">
            <p>{this.state.error?.message}</p>
          </Banner>
        </Page>
      );
    }

    return this.props.children;
  }
}
```

---

## Styling

App Bridge components work with **Polaris CSS**. All components are already styled.

### Custom CSS with Polaris

```tsx
import { Box, Text } from "@shopify/polaris";
import styles from "./MyComponent.module.css";

export default function MyComponent() {
  return (
    <Box className={styles.container}>
      <Text as="p" variant="bodyMd">
        Styled with Polaris + CSS Modules
      </Text>
    </Box>
  );
}
```

CSS Module:
```css
/* MyComponent.module.css */
.container {
  padding: 1rem;
  background-color: var(--p-background);
  border-radius: var(--p-border-radius);
}
```

---

## Migration from v3.x to v4.x

### Key Changes

1. **NavigationMenu → `<s-app-nav>`** web component
2. **Modal API different** — now React component with props
3. **Actions removed** — use hooks instead
4. **Context accessed via useAppBridge** hook

### Before (v3.x)
```tsx
import { NavigationMenu, Modal } from "@shopify/app-bridge-react";

<NavigationMenu navigationLinks={[...]} />
<Modal open={isOpen} onClose={handleClose} />
```

### After (v4.x)
```tsx
<s-app-nav>
  <s-app-nav-link href="/app/dashboard" label="Dashboard" />
</s-app-nav>

<Modal open={isOpen} onClose={handleClose} title="...">
  <Modal.Section>{/* content */}</Modal.Section>
</Modal>
```

---

## Common Pitfalls

1. **Rendering outside AppProvider** — App Bridge context unavailable
2. **Not wrapping with PolarisProvider** — Polaris components won't style correctly
3. **Using old Navigation component** — Migrated to web component `<s-app-nav>`
4. **Forgetting Modal.Section** — Modal content must be wrapped in sections
5. **Not handling loading states** — Users don't know app is working
6. **Hardcoding shop domain** — Always get from app context
7. **Missing error boundaries** — App crashes silently for users

---

## Sources

- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge)
- [App Bridge React Components](https://shopify.dev/docs/api/app-bridge-library/react-components)
- [Using Modals in Your App](https://shopify.dev/docs/api/app-bridge/using-modals-in-your-app)
- [Modal Component](https://shopify.dev/docs/api/app-bridge-library/react-components/modal-component)
- [NavMenu Component](https://shopify.dev/docs/api/app-bridge-library/react-components/navmenu-component)
- [Migrate to App Bridge React 4.x](https://shopify.dev/docs/api/app-bridge/migration-guide-react)
- [Getting Started with App Bridge React](https://shopify.dev/docs/api/app-bridge/previous-versions/app-bridge-from-npm/using-react)
