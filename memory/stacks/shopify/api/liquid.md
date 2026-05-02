# Shopify Liquid API Reference

**Source**: https://shopify.dev/docs/api/liquid
**Last Updated**: 2026-04-04
**Type**: Template Language for Shopify Themes & Extensions

---

## Overview

Liquid is Shopify's template language used to build dynamic themes, sections, blocks, and app extensions. It provides access to Shopify data through objects, filters for transforming output, and tags for control flow and logic.

**Key Characteristics**:
- Simple, readable syntax (not a full programming language)
- Server-side rendering (runs on Shopify servers)
- Safe by design (no arbitrary code execution)
- Access to Shopify data through standardized objects
- Filters for string, number, and array manipulation
- Tags for conditionals, loops, and variable assignment

---

## Core Liquid Objects

### Shop Object

Represents the store and its global configuration.

**Common Properties**:
- `shop.name` — Store name
- `shop.url` — Store URL
- `shop.currency` — Store currency code (e.g., 'USD')
- `shop.money_format` — Currency format string
- `shop.email` — Store contact email
- `shop.phone` — Store phone number
- `shop.address` — Store address object
- `shop.collections_count` — Number of collections
- `shop.products_count` — Total number of products
- `shop.vendors` — Array of all product vendors
- `shop.type` — Store type
- `shop.customer_accounts_enabled` — Boolean

**Example**:
```liquid
<p>Welcome to {{ shop.name }}</p>
<p>We accept {{ shop.currency }}</p>
```

**References**:
- [Shop Object](https://shopify.dev/docs/api/liquid/objects/shop)

---

### Product Object

Represents a product with all its variants, pricing, media, and metadata.

**Common Properties**:
- `product.id` — Product ID
- `product.title` — Product title
- `product.description` — Full product description
- `product.price` — Current variant price (in cents)
- `product.compare_at_price` — Strike-through price
- `product.available` — Boolean (is product available)
- `product.selected_variant` — Currently selected variant (or first available)
- `product.variants` — Array of all variants
- `product.images` — Array of product images
- `product.media` — Array of media (images, video, 3D models)
- `product.collections` — Collections containing product
- `product.vendor` — Product vendor/brand
- `product.type` — Product type
- `product.tags` — Array of product tags
- `product.metafields` — Metafield access

**Variant Logic**:
- Returns selected variant if explicitly chosen
- Falls back to first available variant
- If no available variant exists, returns first variant (even if unavailable)

**Example**:
```liquid
<h1>{{ product.title }}</h1>
<p>Price: {{ product.price | money }}</p>
{% for variant in product.variants %}
  <option>{{ variant.title }} - {{ variant.price | money }}</option>
{% endfor %}
```

**References**:
- [Product Object](https://shopify.dev/docs/api/liquid/objects/product)

---

### Collection Object

Represents a product collection with filtering and pagination.

**Common Properties**:
- `collection.id` — Collection ID
- `collection.title` — Collection name
- `collection.description` — Collection description
- `collection.handle` — URL-friendly collection handle
- `collection.products` — Array of products in collection
- `collection.products_count` — Number of products
- `collection.image` — Featured collection image
- `collection.all_products_count` — Total products (unfiltered)
- `collection.filters` — Available filters (for faceted search)
- `collection.url` — Collection page URL

**Pagination**:
- Use `{% paginate %}` tag to limit products per page (max 50)
- Access `paginate.parts` for pagination links

**Example**:
```liquid
<h1>{{ collection.title }}</h1>
<p>{{ collection.description }}</p>

{% paginate collection.products by 12 %}
  {% for product in collection.products %}
    <div>{{ product.title }}</div>
  {% endfor %}

  <div class="pagination">
    {{ paginate.default_prev_link }}
    {{ paginate.parts | join: '' }}
    {{ paginate.default_next_link }}
  </div>
{% endpaginate %}
```

**References**:
- [Collection Object](https://shopify.dev/docs/api/liquid/objects/collection)

---

### Cart Object

Represents the shopping cart with line items and totals.

**Common Properties**:
- `cart.items` — Array of line items in cart
- `cart.item_count` — Total number of items
- `cart.total_price` — Total price before discounts (in cents, presentment currency)
- `cart.cart_level_discount_applications` — Applied discounts
- `cart.empty?` — Boolean (true if no items)
- `cart.token` — Unique cart token
- `cart.note` — Cart note/comment
- `cart.attributes` — Custom cart attributes

**Line Item Properties** (items in cart):
- `item.key` — Unique line item identifier
- `item.product_id` — Product ID
- `item.variant_id` — Variant ID
- `item.quantity` — Quantity in cart
- `item.price` — Line item price (in cents)
- `item.original_price` — Price before discount
- `item.discounted_price` — Price after discount
- `item.title` — Product title
- `item.product_type` — Product type
- `item.vendor` — Vendor name
- `item.image` — Product image
- `item.url` — Link to product page

**Example**:
```liquid
<h1>Your Cart</h1>

{% if cart.empty? %}
  <p>Your cart is empty</p>
{% else %}
  <p>Items: {{ cart.item_count }}</p>
  <p>Total: {{ cart.total_price | money }}</p>

  {% for item in cart.items %}
    <tr>
      <td>{{ item.title }}</td>
      <td>{{ item.quantity }}</td>
      <td>{{ item.price | money }}</td>
    </tr>
  {% endfor %}
{% endif %}
```

**References**:
- [Cart Object](https://shopify.dev/docs/api/liquid/objects/cart)

---

### Customer Object

Represents an authenticated customer.

**Common Properties**:
- `customer.id` — Customer ID
- `customer.email` — Customer email address
- `customer.first_name` — First name
- `customer.last_name` — Last name
- `customer.phone` — Phone number
- `customer.addresses` — Array of saved addresses
- `customer.default_address` — Default address object
- `customer.orders` — Array of customer orders
- `customer.orders_count` — Total orders
- `customer.total_spent` — Total spent (in cents)
- `customer.tags` — Customer tags/segments
- `customer.metafields` — Customer metafields

**Note**: Only available to logged-in customers.

**Example**:
```liquid
{% if customer %}
  <p>Welcome, {{ customer.first_name }}!</p>
  <p>You've placed {{ customer.orders_count }} orders</p>
{% endif %}
```

**References**:
- [Customer Object](https://shopify.dev/docs/api/liquid/objects/customer)

---

### Order Object

Represents a completed order.

**Common Properties**:
- `order.id` — Order number
- `order.order_number` — Human-readable order number
- `order.created_at` — Order timestamp
- `order.status_url` — Order tracking URL
- `order.total_price` — Order total (in cents)
- `order.line_items` — Array of ordered items
- `order.customer` — Customer object
- `order.shipping_address` — Shipping address
- `order.billing_address` — Billing address
- `order.fulfillments` — Fulfillment information
- `order.email` — Order email

**Example**:
```liquid
<h1>Order #{{ order.order_number }}</h1>
<p>Placed: {{ order.created_at | date: "%B %d, %Y" }}</p>
<p>Total: {{ order.total_price | money }}</p>
```

**References**:
- [Order Object](https://shopify.dev/docs/api/liquid/objects/order)

---

### Page & Blog Objects

**Page Object** — Static pages created in admin.
- `page.title` — Page title
- `page.content` — Page body (HTML)
- `page.url` — Page URL
- `page.handle` — URL-friendly handle

**Blog Object** — Blog with articles.
- `blog.title` — Blog title
- `blog.articles` — Array of articles
- `blog.articles_count` — Number of articles
- `blog.url` — Blog URL

**Article Object** — Individual blog post.
- `article.title` — Article title
- `article.content` — Article body (HTML)
- `article.author` — Article author
- `article.published_at` — Publication date
- `article.comments` — Comment array (if enabled)
- `article.tags` — Article tags

**Example**:
```liquid
<h1>{{ blog.title }}</h1>
{% for article in blog.articles %}
  <h2><a href="{{ article.url }}">{{ article.title }}</a></h2>
  <p>By {{ article.author }} on {{ article.published_at | date: '%B %d' }}</p>
{% endfor %}
```

---

## Common Filters

### String Filters

| Filter | Purpose | Example |
|--------|---------|---------|
| `capitalize` | Capitalize first letter | `{{ 'hello' \| capitalize }}` → "Hello" |
| `downcase` | Convert to lowercase | `{{ 'HELLO' \| downcase }}` → "hello" |
| `upcase` | Convert to uppercase | `{{ 'hello' \| upcase }}` → "HELLO" |
| `size` | String length | `{{ 'hello' \| size }}` → 5 |
| `escape` | HTML escape | `{{ text \| escape }}` |
| `strip_html` | Remove HTML tags | `{{ html \| strip_html }}` |
| `truncate` | Truncate with ellipsis | `{{ text \| truncate: 20 }}` |
| `split` | Split into array | `{{ text \| split: ',' }}` |
| `join` | Join array elements | `{{ array \| join: ', ' }}` |
| `replace` | Replace substring | `{{ text \| replace: 'old', 'new' }}` |
| `url_encode` | URL encode | `{{ text \| url_encode }}` |

---

### Money Filters

| Filter | Purpose | Example |
|--------|---------|---------|
| `money` | Format price with currency | `{{ product.price \| money }}` → "$19.99" |
| `money_without_trailing_zeros` | Remove trailing zeros | `{{ 100 \| money }}` → "$1.00" |
| `money_without_currency` | Format without symbol | `{{ 1999 \| money_without_currency }}` → "19.99" |

**Note**: Input is in cents; store currency applies automatically.

**Example**:
```liquid
<p>Price: {{ product.price | money }}</p>
<p>Savings: {{ product.compare_at_price | money }}</p>
```

---

### Image Filters

| Filter | Purpose |
|--------|---------|
| `img_url` | CDN URL for image with dimensions | `{{ product.featured_image \| img_url: '300x300' }}` |
| `image_url` | CDN URL (requires width or height) | `{{ image \| image_url: width: 500 }}` |
| `image_tag` | Generate HTML img tag | `{{ product.featured_image \| image_tag }}` |

**Example**:
```liquid
<!-- Image with fixed size -->
<img src="{{ product.featured_image | img_url: '500x500' }}"
     alt="{{ product.featured_image.alt }}">

<!-- Responsive image -->
{{ product.featured_image | image_tag:
   class: 'product-image',
   sizes: '100vw',
   alt: product.title }}
```

---

### Date Filter

Converts timestamps to custom date formats.

**Syntax**: `{{ timestamp | date: 'format_string' }}`

**Common Formats**:
- `%Y` — 4-digit year (2026)
- `%m` — 2-digit month (01-12)
- `%d` — 2-digit day (01-31)
- `%B` — Full month name (January)
- `%b` — Short month name (Jan)
- `%A` — Full day name (Monday)
- `%a` — Short day name (Mon)

**Example**:
```liquid
<p>Created: {{ product.created_at | date: '%B %d, %Y' }}</p>
<!-- Output: "April 04, 2026" -->
```

---

### Array & Object Filters

| Filter | Purpose | Example |
|--------|---------|---------|
| `size` | Array length | `{{ array \| size }}` |
| `first` | First element | `{{ array \| first }}` |
| `last` | Last element | `{{ array \| last }}` |
| `join` | Join with delimiter | `{{ array \| join: ', ' }}` |
| `map` | Transform array | `{{ products \| map: 'title' \| join: ';' }}` |
| `sort` | Sort array by property | `{{ products \| sort: 'title' }}` |
| `where` | Filter array | `{{ products \| where: 'available', true }}` |
| `reverse` | Reverse array order | `{{ array \| reverse }}` |
| `uniq` | Remove duplicates | `{{ array \| uniq }}` |
| `json` | Convert to JSON | `{{ object \| json }}` |

---

### Metafield Filters

| Filter | Purpose |
|--------|---------|
| `metafield_tag` | Render metafield HTML | `{{ product.metafields.custom.hero_text \| metafield_tag }}` |
| Metafield type filters | Filter-specific rendering | See docs for rich_text_html, etc. |

---

## Control Flow Tags

### If / Elsif / Else

Conditional execution based on truthiness.

**Syntax**:
```liquid
{% if customer.email == 'admin@shop.com' %}
  <p>Welcome, Admin!</p>
{% elsif customer %}
  <p>Welcome back, {{ customer.first_name }}</p>
{% else %}
  <p>Welcome, Guest</p>
{% endif %}
```

**Operators**:
- `==` (equals), `!=` (not equals)
- `>`, `<`, `>=`, `<=`
- `and`, `or`
- `contains` (string contains)

---

### Unless

Inverse of if (renders if condition is false).

```liquid
{% unless product.available %}
  <p>This product is sold out</p>
{% endunless %}
```

---

### Case / When

Match multiple conditions.

```liquid
{% case product.type %}
  {% when 'Shirt' %}
    <p>This is a shirt</p>
  {% when 'Pants', 'Shorts' %}
    <p>This is bottoms</p>
  {% else %}
    <p>Unknown product type</p>
{% endcase %}
```

**Note**: Multiple values separated by comma or `or` operator.

---

### For Loop

Iterate over arrays.

**Basic**:
```liquid
{% for product in collection.products %}
  <h3>{{ product.title }}</h3>
{% endfor %}
```

**With Index**:
```liquid
{% for product in collection.products %}
  <p>{{ forloop.index }}: {{ product.title }}</p>
{% endfor %}
```

**Forloop Object Properties**:
- `forloop.index` — Current iteration (1-based)
- `forloop.index0` — Current iteration (0-based)
- `forloop.first` — Boolean (true if first iteration)
- `forloop.last` — Boolean (true if last iteration)
- `forloop.length` — Total iterations
- `forloop.rindex` — Reverse index
- `forloop.cycle` — Cycle through values: `{% if forloop.cycle == 'odd' %}`

**Limits**:
```liquid
{% for product in collection.products limit: 5 offset: 10 %}
  <!-- Show 5 products, skip first 10 -->
{% endfor %}
```

---

### Assign & Capture

Create variables.

**Assign** — Single expression:
```liquid
{% assign my_variable = "Hello" %}
{% assign product_count = collection.products.size %}
```

**Capture** — Multi-line content:
```liquid
{% capture my_string %}
  I am being captured.
{% endcapture %}
```

---

## Theme App Extensions (TAE)

### Theme App Extension Blocks

Theme app extensions are Liquid files (blocks, snippets) that merchants can add to their theme without editing code.

**Structure**:
- **Blocks**: Liquid files with schema in `{% schema %}` tag
- **Snippets**: Reusable Liquid templates (no schema required)
- **Schema**: JSON defining settings, inputs, and metadata

**Example Block**:
```liquid
<!-- blocks/my-block.liquid -->
<div class="custom-block">
  <h2>{{ block.settings.title }}</h2>
  <p>{{ block.settings.description }}</p>
</div>

{% schema %}
{
  "name": "My Custom Block",
  "settings": [
    {
      "type": "text",
      "id": "title",
      "label": "Title"
    },
    {
      "type": "textarea",
      "id": "description",
      "label": "Description"
    }
  ]
}
{% endschema %}
```

### Block & Section Objects

**Block Object** — Properties of current block:
- `block.id` — Unique block ID
- `block.type` — Block type
- `block.settings` — Block setting values
- `block.shopify_attributes` — Editor attributes

**Section Object** — Parent section:
- `section.id` — Unique section ID
- `section.settings` — Section setting values
- `section.blocks` — Child blocks
- `section.index` — Section index in page

**Example**:
```liquid
<section id="{{ section.id }}">
  {% for block in section.blocks %}
    <div id="{{ block.id }}" {{ block.shopify_attributes }}>
      {{ block.settings.text }}
    </div>
  {% endfor %}
</section>
```

### Content_for Tag

Renders child blocks in a designated area.

```liquid
<!-- renders all blocks in this section -->
{% content_for 'blocks' %}
```

**Limits**:
- Max 25 sections per JSON template
- Max 50 blocks per section

**References**:
- [Content_for Tag](https://shopify.dev/docs/api/liquid/tags/content_for)
- [App Blocks for Themes](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks)

---

## Dynamic Sources

Dynamic sources connect theme settings to live data (products, collections, metafields, metaobjects).

**Supported Sources**:
- Products
- Collections
- Blogs & Articles
- Pages
- Metafields (on various object types)
- Metaobjects (custom data structures)

**Example Block Setting**:
```json
{
  "type": "product",
  "id": "featured_product",
  "label": "Featured Product"
}
```

**Access in Liquid**:
```liquid
{% if section.settings.featured_product %}
  <h2>{{ section.settings.featured_product.title }}</h2>
{% endif %}
```

**Metafield as Dynamic Source**:
- Metaobjects can be referenced if they have storefront visibility
- User selects metaobject and compatible field
- Renders value based on field type

**References**:
- [Dynamic Data Sources](https://shopify.dev/docs/storefronts/themes/architecture/settings/dynamic-sources)

---

## Metafields in Liquid

Access custom data attached to products, customers, orders, etc.

**Syntax**:
```liquid
{{ product.metafields.namespace.key }}
{{ product.metafields.namespace.key.value }}
```

**Example**:
```liquid
<!-- Single line text -->
{{ product.metafields.custom.sku }}

<!-- Rich text (with HTML) -->
{{ product.metafields.custom.description | metafield_tag }}

<!-- JSON -->
{% assign custom_data = product.metafields.custom.data | json %}
{% for item in custom_data %}
  {{ item.name }}
{% endfor %}
```

**Common Metafield Types**:
- `single_line_text` — Plain text
- `rich_text_html` — HTML-enabled (use `| metafield_tag`)
- `json` — JSON object/array (use `| json` to parse)
- `product_reference` — Link to product
- `collection_reference` — Link to collection
- `file_reference` — File link

---

## Performance Best Practices

### Avoid Over-Querying

**Bad** — Requests all product data:
```liquid
{% for product in collection.products %}
  {% for variant in product.variants %}
    <!-- nested loops create N*M queries -->
  {% endfor %}
{% endfor %}
```

**Good** — Limit what you need:
```liquid
{% assign products = collection.products | limit: 12 %}
{% for product in products %}
  <h3>{{ product.title }}</h3>
{% endfor %}
```

### Cache-Friendly Templating

Use Shopify's fragment caching for expensive operations:
```liquid
{% cache %}
  <!-- Expensive loop cached for 24 hours -->
  {% for product in collection.products %}
    {{ product.title }}
  {% endfor %}
{% endcache %}
```

### Lazy Loading Images

```liquid
<img
  src="{{ product.featured_image | img_url: '300x300' }}"
  loading="lazy"
  alt="{{ product.featured_image.alt }}">
```

### Theme Check Performance

Use **Theme Check** to identify:
- Large CSS/JS bundles
- Remote asset references
- Parser-blocking JavaScript
- Unused styles/scripts

```bash
npm install -g @shopify/theme
theme check
```

### Lighthouse Standards

Themes in Shopify Theme Store require:
- Minimum Lighthouse score: 60 across home/product/collection pages
- Dawn theme is reference implementation

**References**:
- [Performance Best Practices](https://shopify.dev/docs/storefronts/themes/best-practices/performance)

---

## Deprecated Features

### Include Tag (Deprecated)

**Old**:
```liquid
{% include 'product-card' %}
```

**Reason for Deprecation**: Variables leak in/out of included snippet; harder to maintain.

**New Approach** — Use `render` instead:
```liquid
{% render 'product-card', product: product %}
```

**Status**: Not removed; still works but not recommended.

**References**:
- [Render Tag](https://shopify.dev/docs/api/liquid/tags/render)
- [Include Tag (Deprecated)](https://shopify.dev/docs/api/liquid/tags/include)

---

### checkout.liquid (Deprecated)

**Deprecated**: checkout.liquid, additional scripts, and `<script>` tags on Thank You and Order Status pages.

**Sunset Date**: August 28, 2025

**Replacement**: Use Shopify Extensions in Checkout UI.

**Shopify Scripts Sunset**: June 30, 2026

**References**:
- [Checkout.liquid](https://shopify.dev/docs/storefronts/themes/architecture/layouts/checkout-liquid)

---

### Currency Form (Deprecated)

**Old**:
```liquid
<form action="/cart" method="post">
  <select name="currency">
    <option value="USD">USD</option>
  </select>
</form>
```

**Replacement**: Use localization form instead.

---

## Key Takeaways

1. **Objects**: shop, product, collection, cart, customer, order, page, blog, article
2. **Filters**: money, img_url, date, escape, capitalize, size, join, map, where, sort
3. **Tags**: if/elsif/else, unless, case/when, for, assign, capture, render
4. **Extensions**: Theme app blocks use schema and `{% content_for 'blocks' %}`
5. **Dynamic Sources**: Connect settings to products, collections, metafields
6. **Metafields**: Access custom data via `product.metafields.namespace.key`
7. **Performance**: Use limits, lazy loading, fragment caching, theme check
8. **Deprecated**: include → render, checkout.liquid → Checkout UI extensions, currency form → localization form

---

## Related Documentation

- [Liquid Reference](https://shopify.dev/docs/api/liquid)
- [Theme Architecture](https://shopify.dev/docs/storefronts/themes/architecture)
- [Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
- [Theme Check](https://shopify.dev/docs/storefronts/themes/tools/theme-check)
- [Performance Best Practices](https://shopify.dev/docs/storefronts/themes/best-practices/performance)
