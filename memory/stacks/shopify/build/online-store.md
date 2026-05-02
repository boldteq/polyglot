# Build: Online Store (Theme App Extensions)

> Source: shopify.dev/docs/apps/build/online-store/theme-app-extensions
> Last extracted: 2026-04-04

## Overview

Theme app extensions allow merchants to integrate app functionality directly into themes without touching Liquid code. Two integration methods: **app blocks** (section-specific) and **app embed blocks** (page-level global).

## App Blocks vs App Embed Blocks

| Aspect | App Blocks | App Embed Blocks |
|--------|-----------|-----------------|
| **Placement** | Within sections/theme blocks (via `@app` type in schema) | Global page-level (floating, overlaid, or metadata) |
| **Theme Support** | Online Store 2.0 themes only | Vintage + Online Store 2.0 themes |
| **Parent Access** | Access to parent section Liquid object | Only global Liquid scope (no dynamic sources) |
| **Dynamic Sources** | Supported via ancestor resources | Not supported |
| **Activation** | Active by default after install | Deactivated by default; merchants activate via Theme Settings |
| **Use Cases** | Positioned content blocks (reviews, price plugins, 3D models) | Chat widgets, image badges, analytics pixels, tracking tags |
| **Rendering** | `{% content_for 'blocks' %}` Liquid tag | Global script injection |

## Key Rules & Constraints

1. **App Store Requirement:** Every new app must use theme app extensions (ScriptTag API deprecated)
2. **Auto Theme Editor Integration:** Extensions automatically expose in theme editor
3. **Checkout Exclusion:** Cannot render on checkout pages
4. **Limited Parent Access:** Cannot access parent section properties except `section.id`
5. **Stricter Liquid Parsing (Jan 2026):** Invalid Liquid syntax causes deployment failures

## Block Structure & Schema

### Liquid Template (Block File)

```liquid
<div class="my-app-block">
  {%- for product in collection.products limit: block.settings.max_items -%}
    <div>{{ product.title }}</div>
  {%- endfor -%}
</div>

{% schema %}
{
  "name": "My App Block",
  "target": "section",
  "settings": [
    {
      "type": "range",
      "id": "max_items",
      "min": 1,
      "max": 20,
      "default": 5,
      "label": "Max Items"
    },
    {
      "type": "product",
      "id": "product",
      "label": "Select Product"
    }
  ]
}
{% endschema %}
```

### Dynamic Sources in Block Settings

Use `@app` block type in parent section schema to support app blocks:

```json
{
  "name": "Collection Showcase",
  "blocks": [
    {
      "type": "@app"
    }
  ]
}
```

Nested blocks access ancestor resources using the `closest` pattern:

```liquid
{%- for product in collection.products -%}
  {% content_for 'blocks' %}
{%- endfor -%}
```

Nested blocks access via: `{{ closest.product }}`

## Data Model Patterns

1. **Block Settings:** Exposed via `block.settings.<key>` in Liquid
2. **Section Context:** Access parent via `section.id` only
3. **Resource Resolution:** Use `closest.<resource_type>` to find nearest ancestor (product, collection, blog, page)
4. **Dynamic Source Data:** Merchants connect via theme editor; accessible in block settings

## Configuration Requirements (TOML)

```toml
[[extension]]
name = "my-app-block"
type = "theme"
handle = "my_app_block"

[[extension.blocks]]
handle = "my_block"
name = "My Block"
target = "section"
```

## Common Pitfalls

1. **Section Property Access:** Cannot access parent properties beyond `id` — use dynamic sources
2. **Checkout Integration:** App blocks won't render on checkout — use Checkout UI Extensions
3. **Schema `type: @app` Required:** Parent sections must explicitly include `{ "type": "@app" }` in blocks array
4. **Liquid Syntax Strictness:** Invalid Liquid (unclosed tags, unknown tags) causes deployment failures
5. **App Embed Default State:** App embed blocks are inactive by default; merchants must opt-in
6. **Ghost Code Risk:** Removing app blocks leaves ghost code unless merchants manually delete instances
