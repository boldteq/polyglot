# Shopify Storefront Widget & Extension Design Patterns

> Source: shopify.dev/docs/apps/build/online-store, shopify.dev/docs/api/checkout-ui-extensions, top Shopify app analysis
> Stack B: Theme App Extensions + Checkout UI Extensions + Customer Account Extensions
> Last updated: 2026-04-04

---

## Extension Types Overview

Shopify storefront design spans 4 extension surfaces. Each has different constraints, components, and design rules.

| Extension Type | Where It Renders | Bundle Limit | Components | Merchant Control |
|---------------|-----------------|-------------|------------|-----------------|
| **App Blocks** | Product, collection, blog, cart pages (inline) | 50 KB CSS, 16 KB JS | Liquid + HTML/CSS/JS | Theme editor drag-and-drop |
| **App Embeds** | Global (floating/overlay) | <30 KB recommended | Liquid + HTML/CSS/JS | Theme editor toggle on/off |
| **Checkout UI Extensions** | Checkout flow (pre/post purchase) | **64 KB strict** | React/Preact + Checkout components | Checkout editor placement |
| **Customer Account Extensions** | Customer account pages | **64 KB strict** | React/Preact + Customer Account components | Account page editor |

### Decision Tree: Which Extension Type?

```
Is it visible on every page?
  YES → App Embed (floating badge, chat widget, announcement bar)
  NO ↓

Is it on a specific page section?
  YES → App Block (reviews widget, size guide, delivery checker, trust badges)
  NO ↓

Is it in the checkout flow?
  YES → Checkout UI Extension (upsells, custom fields, delivery options, payment badges)
  NO ↓

Is it in customer account area?
  YES → Customer Account Extension (order tracking, wishlists, loyalty points)
```

---

## App Blocks (Theme App Extensions)

### What They Are
App blocks are **merchant-customizable content blocks** that render inline on storefront pages. Merchants drag-and-drop them in the theme editor. They use Liquid + HTML/CSS/JS.

### Architecture

```
extensions/
  my-widget/
    blocks/
      delivery-checker.liquid    # Block template (Liquid + HTML + CSS + JS)
      trust-badges.liquid        # Another block
    snippets/
      shared-styles.liquid       # Shared CSS snippet
    locales/
      en.default.json            # Translations
    assets/
      widget.js                  # External JS (loaded async)
      widget.css                 # External CSS
```

### Block Schema (settings merchants can configure)

```json
{% schema %}
{
  "name": "Delivery Checker",
  "target": "section",
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Widget Title",
      "default": "Check Delivery Availability"
    },
    {
      "type": "color",
      "id": "accent_color",
      "label": "Accent Color",
      "default": "#008060"
    },
    {
      "type": "select",
      "id": "style",
      "label": "Display Style",
      "options": [
        { "value": "compact", "label": "Compact" },
        { "value": "expanded", "label": "Expanded" }
      ],
      "default": "compact"
    },
    {
      "type": "range",
      "id": "border_radius",
      "label": "Corner Radius",
      "min": 0,
      "max": 20,
      "step": 2,
      "default": 8,
      "unit": "px"
    },
    {
      "type": "checkbox",
      "id": "show_cod_badge",
      "label": "Show COD Badge",
      "default": true
    }
  ],
  "presets": [
    {
      "name": "Delivery Checker",
      "category": "Shipping"
    }
  ]
}
{% endschema %}
```

### 7 Golden Rules for App Block Design

1. **Inherit merchant theme** — NEVER hardcode colors/fonts. Use CSS custom properties from the theme.
2. **Container-responsive** — Use `@container` queries, NOT viewport media queries. Blocks can be in sidebars, main content, or full-width.
3. **Merchant configurable** — Expose colors, text, toggles, and layout options via schema settings.
4. **Minimal footprint** — Target <50 KB CSS + <16 KB JS. Lazy-load heavy assets.
5. **Loading states** — Show skeleton/placeholder while data loads. Never flash empty then populated.
6. **Accessible** — ARIA labels, keyboard navigable, 4.5:1 contrast ratio minimum.
7. **Theme-safe** — Never use `!important`. Namespace all CSS classes. Don't modify DOM outside your block.

---

## CSS Styling for Storefront Widgets

### The #1 Rule: Inherit From the Merchant Theme

Merchants choose their theme's fonts, colors, and spacing. Your widget MUST respect them.

```css
/* CORRECT — Inherits from merchant theme */
.delivery-checker {
  font-family: var(--font-body-family);
  font-size: var(--font-body-size, 1.4rem);
  color: var(--color-foreground);
  background: var(--color-background);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  border-radius: var(--border-radius, 8px);
  padding: var(--spacing-4, 1rem);
}

/* WRONG — Hardcoded values break merchant themes */
.delivery-checker {
  font-family: 'Inter', sans-serif;  /* NEVER */
  color: #333333;                     /* NEVER */
  background: #ffffff;                /* NEVER */
}
```

### Theme CSS Custom Properties (Available in ALL Shopify Themes)

```css
/* Typography */
--font-heading-family        /* Heading font family */
--font-heading-weight        /* Heading font weight */
--font-body-family           /* Body font family */
--font-body-weight           /* Body font weight */
--font-body-size             /* Base body font size */

/* Colors */
--color-foreground           /* Primary text color */
--color-background           /* Page background */
--color-border               /* Border color */
--color-shadow               /* Box shadow color */
--color-button               /* Primary button background */
--color-button-text          /* Primary button text */
--color-link                 /* Link color */
--color-badge-foreground     /* Badge text */
--color-badge-background     /* Badge background */

/* Spacing (Dawn theme and modern themes) */
--spacing-1 through --spacing-12

/* Borders */
--border-radius              /* Global corner radius */
--border-width               /* Global border width */
```

### CSS Namespacing (BEM Convention)

ALWAYS namespace your CSS to prevent conflicts with the merchant theme:

```css
/* Namespace: app name prefix */
.rankora-delivery {}
.rankora-delivery__header {}
.rankora-delivery__input {}
.rankora-delivery__input--error {}
.rankora-delivery__badge {}
.rankora-delivery__badge--success {}
.rankora-delivery__badge--warning {}
.rankora-delivery__step {}
.rankora-delivery__step--active {}
.rankora-delivery__step--completed {}
```

### Container Queries (NOT Media Queries)

App blocks can render in different column widths. Use container queries:

```css
.rankora-delivery {
  container-type: inline-size;
  container-name: delivery-widget;
}

/* Default: compact layout (sidebar/narrow column) */
.rankora-delivery__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Wide layout (main content area) */
@container delivery-widget (min-width: 500px) {
  .rankora-delivery__content {
    flex-direction: row;
    align-items: center;
    gap: 1.5rem;
  }
}

/* Full-width layout */
@container delivery-widget (min-width: 768px) {
  .rankora-delivery__badges {
    display: flex;
    gap: 1rem;
  }
}
```

### Dark Mode Support

Modern Shopify themes support dark color schemes. Your widget must handle both:

```css
/* Light mode (default) */
.rankora-delivery {
  --widget-bg: var(--color-background);
  --widget-text: var(--color-foreground);
  --widget-accent: var(--color-button);
  --widget-border: var(--color-border, rgba(0, 0, 0, 0.1));
}

/* Dark mode — theme applies these automatically via CSS variables */
/* If theme uses color-scheme, your widget inherits automatically */
/* Only add explicit dark mode if using hardcoded fallbacks: */
@media (prefers-color-scheme: dark) {
  .rankora-delivery {
    --widget-border: rgba(255, 255, 255, 0.15);
  }
}
```

---

## Product Page Widget Patterns

### Pattern 1: Delivery Availability Checker

The widget shown in the user's screenshot. Common in Indian e-commerce (Shiprocket, Delhivery integration).

```
┌─────────────────────────────────────────────┐
│  Check Delivery Availability                │
│                                             │
│  ┌──────────────────────┐ ┌──────────┐     │
│  │ Enter Pincode        │ │  Check   │     │
│  └──────────────────────┘ └──────────┘     │
│                                             │
│  ● Ordered ───── ● Ships ───── ● Delivers  │
│    Today          Tomorrow      Apr 6       │
│                                             │
│  ┌──────────┐  ┌───────────────┐            │
│  │ 🏷 COD   │  │ 🚚 Free Ship │            │
│  │Available │  │  Above ₹499  │            │
│  └──────────┘  └───────────────┘            │
└─────────────────────────────────────────────┘
```

**Design Rules:**
- Input + button on same row (inline layout)
- Stepper/timeline uses 3 dots connected by line
- Active step uses accent color (green = success)
- Badges use pill shape with icon + text
- Compact by default, expandable on result
- Validate pincode format before API call (India: 6 digits)
- Show loading spinner in button during API call
- Error state: red border on input + inline error message

**Liquid Template Structure:**
```liquid
<div class="rankora-delivery" data-product-id="{{ product.id }}">
  <h3 class="rankora-delivery__title">
    {{ block.settings.heading }}
  </h3>

  <div class="rankora-delivery__form">
    <input
      type="text"
      class="rankora-delivery__input"
      placeholder="Enter Pincode"
      maxlength="6"
      pattern="[0-9]{6}"
      aria-label="Enter delivery pincode"
    />
    <button
      class="rankora-delivery__button"
      type="button"
      aria-label="Check delivery availability"
    >
      Check
    </button>
  </div>

  <div class="rankora-delivery__result" hidden>
    <!-- Timeline stepper -->
    <div class="rankora-delivery__timeline" role="list">
      <div class="rankora-delivery__step" role="listitem">
        <span class="rankora-delivery__dot"></span>
        <span class="rankora-delivery__label">Ordered</span>
        <span class="rankora-delivery__date">Today</span>
      </div>
      <!-- ... more steps -->
    </div>

    <!-- Badges -->
    <div class="rankora-delivery__badges">
      {% if block.settings.show_cod_badge %}
        <span class="rankora-delivery__badge rankora-delivery__badge--success">
          Cash on Delivery
        </span>
      {% endif %}
    </div>
  </div>
</div>
```

### Pattern 2: Product Reviews Widget

Based on Judge.me, Loox, Stamped patterns (~30 KB total).

```
┌─────────────────────────────────────────────┐
│  Customer Reviews                           │
│                                             │
│  ★★★★☆ 4.2  (128 reviews)                  │
│                                             │
│  5★ ████████████████████  72%               │
│  4★ ██████████           18%                │
│  3★ ████                  6%                │
│  2★ █                     2%                │
│  1★ █                     2%                │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ Sort: Most Recent ▾  │ Filter ▾    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★★  Sarah M. · Verified Buyer   │    │
│  │ "Love this product! Fast shipping." │    │
│  │ 📷 [photo] [photo]                 │    │
│  │ 👍 12  · Reply · Mar 28, 2026      │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Load More Reviews                          │
└─────────────────────────────────────────────┘
```

**Design Rules:**
- Star rating uses SVG icons (not Unicode) for consistent rendering
- Rating bar chart uses CSS width percentage (no JS charting library)
- Reviews paginate (load 5-10 at a time, "Load More" button)
- Photo thumbnails are lazy-loaded, open in lightbox on click
- Verified buyer badge builds trust
- Sort/filter uses native `<select>` styled to match theme
- Mobile: stack rating summary above reviews, full-width cards

### Pattern 3: Size Guide / Fit Finder

Based on ESC Size Charts, Kiwi Sizing (~22 KB total).

```
┌─────────────────────────────────────────────┐
│  📏 Size Guide                    [✕ Close] │
│                                             │
│  ┌────────┬────────┬────────┬────────┐      │
│  │  Tab   │  Tab   │  Tab   │  Tab   │      │
│  │  CM    │ Inches │ US     │ UK     │      │
│  └────────┴────────┴────────┴────────┘      │
│                                             │
│  Size │ Chest │ Waist │ Hip  │ Length       │
│  ─────┼───────┼───────┼──────┼──────        │
│   S   │  36   │  30   │  38  │  27          │
│   M   │  38   │  32   │  40  │  28          │
│   L   │  40   │  34   │  42  │  29          │
│  XL   │  42   │  36   │  44  │  30          │
│                                             │
│  💡 Model is 5'10", wearing size M          │
└─────────────────────────────────────────────┘
```

**Design Rules:**
- Opens as modal/drawer (not inline — too tall for product page)
- Tab navigation for measurement units
- Table is horizontally scrollable on mobile
- Highlight the recommended size row if fit finder is active
- Close button clearly visible (top-right X)
- Use merchant's font for the table — not a different typeface

### Pattern 4: Trust Badges / Guarantees

Based on Trust Badges Bear, Avada Trust Badges (~5 KB total).

```
┌───────────────────────────────────────────┐
│  ✓ Free Shipping    🔒 Secure     ↩ Easy  │
│    Over $50          Checkout      Returns │
└───────────────────────────────────────────┘
```

**Design Rules:**
- Horizontal row of 3-5 badges (wrap on mobile)
- Each badge: icon + short label (2-3 words max)
- Icons: SVG inline (not image files) for crisp rendering
- Subtle styling — don't compete with Add to Cart button
- Background slightly different from page (light gray or card style)
- Merchant configurable: choose which badges, edit text, pick icons

### Pattern 5: Sticky Add-to-Cart Bar

Appears when the main ATC button scrolls out of view.

```
┌─────────────────────────────────────────────────────────┐
│ [Product Image] Product Name · $29.99  [-][1][+] [Add] │
└─────────────────────────────────────────────────────────┘
```

**Design Rules:**
- Fixed to bottom of viewport (`position: sticky` or `fixed`)
- Only visible after scrolling past the main Add to Cart
- Uses IntersectionObserver to toggle visibility
- Height: 56-64px (not too tall, not too short)
- Z-index: high but below modals/drawers
- Mobile: full-width, quantity selector optional (just ATC button)
- Background matches theme card color with subtle top shadow
- Animate in with `translateY` transition (200ms ease-out)

### Pattern 6: Recently Viewed / Recommendations

```
┌─────────────────────────────────────────────┐
│  You May Also Like                   →      │
│                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───     │
│  │ [img]  │ │ [img]  │ │ [img]  │ │ [i     │
│  │ Title  │ │ Title  │ │ Title  │ │ Ti     │
│  │ $29.99 │ │ $34.99 │ │ $19.99 │ │ $2     │
│  │ ★★★★☆  │ │ ★★★★★  │ │ ★★★☆☆  │ │ ★★     │
│  └────────┘ └────────┘ └────────┘ └───     │
└─────────────────────────────────────────────┘
```

**Design Rules:**
- Horizontal scroll carousel (swipeable on mobile)
- 4 items on desktop, 2.5 visible on mobile (half-card peek for scroll hint)
- Product cards match the theme's product card style
- Lazy-load images, use `loading="lazy"` + `srcset` for responsive images
- Arrow navigation on desktop, swipe on mobile
- Store recently viewed in `localStorage` (no server round-trip needed)

---

## Checkout UI Extensions

### Available Components (Strict Subset)

Checkout extensions use a **sandboxed component library** — you CANNOT use HTML/CSS directly. Only these components are available:

**Layout:**
- `BlockStack` — Vertical stack with spacing
- `InlineStack` — Horizontal stack with spacing
- `Grid` — CSS grid layout
- `View` — Generic container (like div)
- `Divider` — Horizontal line separator
- `ScrollView` — Scrollable container

**Content:**
- `Text` — Text with size/emphasis/appearance
- `TextBlock` — Block-level text (paragraph)
- `Heading` — Section heading
- `Image` — Optimized image display
- `Icon` — Checkout icon set
- `Badge` — Status badge
- `Tag` — Removable tag
- `List` / `ListItem` — Ordered/unordered lists

**Form:**
- `TextField` — Text input
- `Select` — Dropdown select
- `Checkbox` — Checkbox input
- `DatePicker` — Date selection
- `ChoiceList` — Radio/checkbox group
- `Stepper` — Numeric stepper (+/-)
- `PhoneField` — Phone number input

**Actions:**
- `Button` — Primary/secondary actions
- `Link` — Navigation link
- `Pressable` — Clickable container

**Feedback:**
- `Banner` — Info/warning/critical/success messages
- `Modal` — Overlay modal (since 2024)
- `Sheet` — Bottom sheet (mobile-friendly modal)
- `SkeletonText` / `SkeletonImage` — Loading placeholders
- `Spinner` — Loading indicator
- `Tooltip` — Hover information

**Data Display:**
- `ProductThumbnail` — Product image (standardized)
- `Money` — Formatted currency
- `Disclosure` — Expandable content

### Checkout Extension Design Rules

1. **64 KB hard limit** — Total bundle (JS + dependencies) must be under 64 KB. No exceptions.
2. **No custom CSS** — You CANNOT write CSS. All styling is through component props (size, appearance, padding).
3. **Sandboxed rendering** — Extensions render in an iframe. No DOM access outside your extension.
4. **Limited colors** — Use semantic colors only: `subdued`, `info`, `success`, `warning`, `critical`, `accent`. No hex values.
5. **Responsive by default** — Checkout components handle responsive behavior. Don't add your own breakpoint logic.
6. **Performance critical** — Checkout must be FAST. Minimize API calls, pre-compute data where possible.
7. **Merchant theming** — Extensions automatically inherit the merchant's checkout branding (fonts, colors, corner radius).

### Checkout Extension Targets (Where Your Code Renders)

```
┌──────────────────────────────────────────────┐
│  CHECKOUT PAGE                               │
│                                              │
│  ┌─ purchase.checkout.header.render-after ─┐ │
│  │  (Below header, above contact info)     │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Contact Information                         │
│  ┌─ purchase.checkout.contact.render-after ┐ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Shipping Address                            │
│  ┌─ purchase.checkout.shipping...render-after│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Shipping Method                             │
│  ┌─ purchase.checkout.shipping...render-after│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Payment                                     │
│  ┌─ purchase.checkout.payment.render-before ┐│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Order Summary (sidebar on desktop)          │
│  ┌─ purchase.checkout.cart-line-item...     ┐│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ purchase.checkout.footer.render-after ──┐│ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─ THANK YOU PAGE ────────────────────────┐ │
│  │  purchase.thank-you.block.render        │ │
│  │  (Post-purchase upsell, surveys, etc.)  │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Common Checkout Extension Patterns

**Upsell Widget (post-purchase or in-checkout):**
```tsx
// Checkout UI Extension — Upsell
import {
  BlockStack, InlineStack, Image, Text, Button,
  Heading, Badge, Divider, Money
} from '@shopify/ui-extensions-react/checkout';

export default function UpsellWidget() {
  return (
    <BlockStack spacing="base">
      <Heading level={3}>Customers Also Bought</Heading>
      <Divider />
      <InlineStack spacing="base" blockAlignment="center">
        <Image source="product.jpg" accessibilityDescription="Product" />
        <BlockStack spacing="extraTight">
          <Text emphasis="bold">Premium Case</Text>
          <Money value={19.99} currencyCode="USD" />
          <Badge tone="info">20% Off Bundle</Badge>
        </BlockStack>
        <Button kind="secondary" onPress={handleAdd}>
          Add
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
```

**Custom Field (delivery notes, gift message):**
```tsx
import { BlockStack, TextField, Checkbox, Text } from '@shopify/ui-extensions-react/checkout';

export default function DeliveryNotes() {
  const [note, setNote] = useState('');
  const [isGift, setIsGift] = useState(false);

  return (
    <BlockStack spacing="base">
      <Checkbox checked={isGift} onChange={setIsGift}>
        This is a gift
      </Checkbox>
      {isGift && (
        <TextField
          label="Gift message"
          value={note}
          onChange={setNote}
          maxLength={200}
          multiline={3}
        />
      )}
      <Text appearance="subdued" size="small">
        {note.length}/200 characters
      </Text>
    </BlockStack>
  );
}
```

---

## Customer Account Extensions

### Extension Targets

```
customer-account.page.render          → Full custom page in account area
customer-account.order.action.render  → Action button on order detail
customer-account.order-status.block.render → Block on order status page
```

### Design Rules for Customer Account

1. **Matches account UI** — Extensions inherit the customer account theme automatically
2. **Authenticated context** — You have access to customer data (orders, addresses, metafields)
3. **Full-page or block** — Can be a full page (loyalty dashboard) or a block (order tracking widget)
4. **Same 64 KB limit** as checkout extensions
5. **Same component library** as checkout (BlockStack, Text, Button, etc.)

### Common Customer Account Patterns

**Order Tracking Widget:**
```
┌─────────────────────────────────────────────┐
│  📦 Order #1234 — Tracking                  │
│                                             │
│  ● Ordered ─── ● Shipped ─── ○ Delivered    │
│    Mar 30       Apr 1          Apr 4 (est)  │
│                                             │
│  Carrier: FedEx                             │
│  Tracking: 1234567890                       │
│  [Track Package →]                          │
└─────────────────────────────────────────────┘
```

**Loyalty Points Dashboard:**
```
┌─────────────────────────────────────────────┐
│  🏆 Your Rewards                            │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   1,250  │  │    Gold   │  │  $12.50  │  │
│  │  Points  │  │   Tier    │  │  Value   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  Progress to Platinum: ██████████░░ 78%     │
│  250 points to next tier                    │
│                                             │
│  [View Rewards Catalog →]                   │
└─────────────────────────────────────────────┘
```

---

## Performance Requirements

### Bundle Size Budgets

| Extension Type | CSS Budget | JS Budget | Total Budget |
|---------------|-----------|----------|-------------|
| App Block | <50 KB | <16 KB | <66 KB |
| App Embed | <30 KB | <20 KB | <50 KB |
| Checkout Extension | N/A (no CSS) | <64 KB | <64 KB |
| Customer Account Extension | N/A (no CSS) | <64 KB | <64 KB |

### Real-World Benchmarks (Top Apps)

| App | Widget Type | JS Size | CSS Size | Total |
|-----|-----------|---------|---------|-------|
| Judge.me | Reviews | 18 KB | 12 KB | 30 KB |
| Klaviyo | Popup/Embed | 8 KB | 5 KB | 13 KB |
| ESC Size Charts | Modal/Block | 14 KB | 8 KB | 22 KB |
| Flare Delivery | Delivery Checker | 28 KB | 12 KB | 40 KB |
| Trust Badge Bear | Trust Badges | 2 KB | 3 KB | 5 KB |

### Performance Optimization Techniques

1. **Lazy-load JS** — Use `defer` or dynamic `import()` for non-critical widget JS
2. **Inline critical CSS** — Put above-fold CSS in `<style>` tag, lazy-load the rest
3. **No external fonts** — Use the merchant's theme font via CSS variables
4. **Minimize API calls** — Cache responses in `sessionStorage`, debounce user input (300ms)
5. **Use IntersectionObserver** — Only initialize widgets when they scroll into view
6. **Compress images** — Use WebP, `srcset` for responsive images, lazy-load below fold
7. **No jQuery** — Use vanilla JS. jQuery adds 87 KB.
8. **Tree-shake imports** — Import only what you use from any library

```javascript
// CORRECT — Lazy initialization
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      initDeliveryChecker(entry.target);
      observer.unobserve(entry.target);
    }
  });
});

document.querySelectorAll('.rankora-delivery').forEach(el => {
  observer.observe(el);
});
```

---

## Responsive Design for Storefront Widgets

### Mobile-First Approach

```css
/* Base: Mobile (< 750px) */
.rankora-widget__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.rankora-widget__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.rankora-widget__badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
}

/* Tablet (750px+) — Shopify's tablet breakpoint */
@container rankora-widget (min-width: 500px) {
  .rankora-widget__content {
    flex-direction: row;
    align-items: center;
  }
}

/* Desktop (990px+) — Shopify's desktop breakpoint */
@container rankora-widget (min-width: 700px) {
  .rankora-widget__badges {
    flex-wrap: nowrap;
  }
}
```

### Touch Targets

- Minimum 44px x 44px for all interactive elements
- Buttons: min-height 44px, adequate padding
- Input fields: min-height 44px
- Badge/tag click areas: at least 44px even if visual is smaller (use padding)

### Shopify Theme Breakpoints

| Breakpoint | Width | Context |
|-----------|-------|---------|
| Mobile | < 750px | Single column, stack everything vertically |
| Tablet | 750px - 989px | Some side-by-side layout possible |
| Desktop | 990px+ | Full multi-column layouts |
| Wide | 1200px+ | Max content width, centered |

---

## Accessibility Requirements

### Mandatory for App Store Approval

1. **Color contrast** — 4.5:1 minimum for normal text, 3:1 for large text (18px+ or 14px+ bold)
2. **Keyboard navigation** — All interactive elements focusable and operable with keyboard
3. **ARIA labels** — All inputs, buttons, and interactive widgets must have accessible names
4. **Focus indicators** — Visible focus ring on keyboard navigation (don't remove `outline`)
5. **Screen reader support** — Use semantic HTML (`<button>`, `<input>`, `<nav>`, not `<div onclick>`)
6. **Alt text** — All images must have descriptive `alt` attributes (or `alt=""` for decorative)
7. **Error identification** — Form errors identified by text, not just color
8. **Reduced motion** — Respect `prefers-reduced-motion` for animations

```css
/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .rankora-widget * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Keyboard Navigation Pattern for Widgets

```javascript
// Keyboard navigation for interactive widget
widget.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      handleActivate(e.target);
      break;
    case 'Escape':
      handleClose();
      break;
    case 'Tab':
      // Let default tab behavior work
      // Ensure focus stays within modal if open
      if (isModalOpen) trapFocus(e);
      break;
  }
});
```

---

## Error Handling Patterns

### Loading State
```html
<!-- Skeleton matching final layout -->
<div class="rankora-delivery rankora-delivery--loading" aria-busy="true">
  <div class="rankora-delivery__skeleton-title"></div>
  <div class="rankora-delivery__skeleton-input"></div>
  <div class="rankora-delivery__skeleton-badges"></div>
</div>
```

### Error State
```html
<div class="rankora-delivery__error" role="alert">
  <span class="rankora-delivery__error-icon">⚠️</span>
  <span class="rankora-delivery__error-text">
    Unable to check delivery. Please try again.
  </span>
  <button class="rankora-delivery__retry" type="button">
    Retry
  </button>
</div>
```

### Empty State
```html
<div class="rankora-delivery__empty">
  <span class="rankora-delivery__empty-text">
    Enter your pincode to check delivery availability
  </span>
</div>
```

### Error Handling Rules

1. **Never show raw API errors** — Always show user-friendly messages
2. **Retry mechanism** — Offer a retry button for transient failures
3. **Graceful degradation** — If widget fails to load, page should still function normally
4. **Timeout handling** — Set reasonable timeouts (5s for API calls), show timeout message
5. **Offline awareness** — Detect `navigator.onLine` and show appropriate message
6. **Loading skeleton** — Skeleton must match the final widget layout dimensions

---

## JavaScript Initialization Pattern

```javascript
// Safe initialization pattern for Shopify theme extensions
(function() {
  'use strict';

  // Namespace to avoid global pollution
  const the projectDelivery = {
    selectors: {
      widget: '.rankora-delivery',
      input: '.rankora-delivery__input',
      button: '.rankora-delivery__button',
      result: '.rankora-delivery__result',
      error: '.rankora-delivery__error',
    },

    init(container) {
      this.container = container;
      this.input = container.querySelector(this.selectors.input);
      this.button = container.querySelector(this.selectors.button);
      this.result = container.querySelector(this.selectors.result);

      if (!this.input || !this.button) return;

      this.bindEvents();
      this.restoreLastPincode();
    },

    bindEvents() {
      this.button.addEventListener('click', () => this.checkDelivery());
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.checkDelivery();
      });
      // Debounce input validation
      this.input.addEventListener('input', this.debounce(() => {
        this.validatePincode();
      }, 300));
    },

    async checkDelivery() {
      const pincode = this.input.value.trim();
      if (!this.isValidPincode(pincode)) {
        this.showError('Please enter a valid 6-digit pincode');
        return;
      }

      this.setLoading(true);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/apps/delivery/check?pincode=${pincode}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error('API error');

        const data = await response.json();
        this.showResult(data);
        this.savePincode(pincode);
      } catch (error) {
        if (error.name === 'AbortError') {
          this.showError('Request timed out. Please try again.');
        } else {
          this.showError('Unable to check delivery. Please try again.');
        }
      } finally {
        this.setLoading(false);
      }
    },

    isValidPincode(pincode) {
      return /^[0-9]{6}$/.test(pincode);
    },

    debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    savePincode(pincode) {
      try { sessionStorage.setItem('rankora_pincode', pincode); } catch {}
    },

    restoreLastPincode() {
      try {
        const saved = sessionStorage.getItem('rankora_pincode');
        if (saved) this.input.value = saved;
      } catch {}
    }
  };

  // Initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  function initAll() {
    document.querySelectorAll('.rankora-delivery').forEach(el => {
      Object.create(the projectDelivery).init(el);
    });
  }
})();
```

---

## Testing Checklist for Storefront Widgets

### Theme Compatibility (Test on 3+ themes minimum)
- [ ] Dawn (default free theme)
- [ ] One paid theme (e.g., Prestige, Impulse, Warehouse)
- [ ] One minimal theme (e.g., Taste, Sense)
- [ ] Widget inherits theme colors correctly
- [ ] Widget inherits theme fonts correctly
- [ ] No CSS conflicts or visual breaks

### Responsive Testing
- [ ] 375px (iPhone SE)
- [ ] 414px (iPhone Pro Max)
- [ ] 768px (iPad)
- [ ] 1024px (iPad landscape / small desktop)
- [ ] 1440px (standard desktop)
- [ ] Touch targets >= 44px on mobile

### Accessibility Testing
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Screen reader announces widget correctly
- [ ] Color contrast passes WCAG AA (4.5:1)
- [ ] Focus indicators visible
- [ ] Reduced motion respected

### Performance Testing
- [ ] Lighthouse score not reduced by more than 10 points
- [ ] JS bundle < budget (16 KB for app blocks)
- [ ] CSS bundle < budget (50 KB for app blocks)
- [ ] No layout shift (CLS contribution < 0.05)
- [ ] Widget loads within 2 seconds on 3G

### Functional Testing
- [ ] Loading state displays correctly
- [ ] Error state displays and retry works
- [ ] Empty state is clear and actionable
- [ ] API timeout handled gracefully
- [ ] Offline state handled
- [ ] Data persists appropriately (sessionStorage)

---

## 10 Anti-Patterns for Storefront Widgets

1. **Hardcoded colors/fonts** — NEVER. Always use theme CSS variables.
2. **Viewport media queries** — Use container queries. Blocks render in variable-width columns.
3. **jQuery dependency** — 87 KB for what vanilla JS does. Never include jQuery.
4. **Global CSS selectors** — `.button {}` will break the entire theme. ALWAYS namespace.
5. **`!important` overrides** — Breaks theme customization. Fix specificity properly.
6. **No loading state** — Widget appears suddenly after data loads. Always show skeleton first.
7. **Raw error messages** — `"TypeError: Cannot read property 'x' of undefined"` shown to merchant's customers. Never.
8. **External font loading** — Adds 200ms+ to page load. Use the theme's font.
9. **Blocking script loading** — `<script>` without `defer` or `async` blocks page render.
10. **No merchant configuration** — Widget has no schema settings. Merchant can't customize anything. Include settings for colors, text, visibility toggles.

---

*(Storefront widget design training for Vega design agent. Part of Boldteq Shopify knowledge base.)*
