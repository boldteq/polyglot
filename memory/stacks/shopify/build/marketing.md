# Build: Marketing & Analytics

> Source: shopify.dev/docs/apps/build/marketing-analytics
> Last extracted: 2026-04-04

## Web Pixels

**Purpose:** JavaScript code snippets on online store to collect behavioral data.

**Data layer:** Events published to Shopify data layer for marketing optimization.

**Sandbox loading:** Web pixel app extensions load pixels in secure sandbox with APIs for event subscription.

### Standard Events

- `page_viewed` — user views a page
- `product_viewed` — user views a product
- `product_added_to_cart` — item added to cart
- `checkout_*` — checkout progression events
- `search_submitted` — user searches storefront

### Custom Events

Beyond standard events, apps can create and publish custom events. Subscribe to custom events within pixel sandbox.

### API Components

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

### Web Pixel Extension Setup

```javascript
import { register } from '@shopify/web-pixels-extension'

// Register pixel
register(({ analytics, browser }) => {
  analytics.subscribe('page_viewed', (event) => {
    // Event handling
    console.log('Page viewed', event);
  })

  // Custom event
  analytics.subscribe('custom_event', (event) => {
    // Custom event handling
  })
})
```

## Customer Segments

**Definition:** Group of members (customers) meeting specific criteria.

**Purpose:**
- Conduct marketing activities
- Inform business decisions
- Learn about behaviors

**Query filters:** Precise segment definition via query arguments.

**Example:** Customers who abandoned checkout in last 30 days.

### Integration with Web Pixels

- Pixels collect behavioral data needed for segment identification
- Workflow: Pixels → events → segments → marketing activities
- Segments enable targeted campaigns

## Marketing Activities

**Purpose:** Actions merchants execute based on customer segments.

**Integration:** Work with segments to conduct targeted campaigns.

**Data:** Require customer event data collected by web pixels.

## Pitfalls

- **Sandbox restrictions** — Browser API access is limited and asynchronous
- **Event timing** — Custom events only available after merchant setup
- **Segment latency** — Segment recalculation may have delay
- **Data privacy** — Cannot capture sensitive customer data in pixels
