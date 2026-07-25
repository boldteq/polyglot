# Platform truth, verified 2026-07-24

Every line here was re-fetched from source on the date shown. Where a rule already in
memory disagrees with this file, **this file wins and the older rule is quarantined**.

Most model training data and most existing rule packs predate these changes. That is the
single largest cause of "the code is not fully Shopify-friendly" output.

---

## 1. Skeleton is the only approved Theme Store codebase

> "Shopify's Skeleton Theme is the only approved codebase for Theme Store development."
> "New theme submissions built on or derived from Dawn or Horizon are not eligible for the Shopify Theme Store."

Source: https://shopify.dev/docs/storefronts/themes/store/requirements — verified 2026-07-24

**What this changes for us.** Dawn's own README still recommends Dawn as a starting point.
That guidance is stale for Theme Store submission. For bespoke client stores — which is what
Boldteq actually builds — Dawn and Horizon remain legitimate *references*, and Horizon is the
better one because it shows current theme-block architecture. Any agent that tells a client
"this is Theme-Store-ready" about a Dawn derivative is wrong.

---

## 2. checkout.liquid: the remaining deadline is 2026-08-26, and it is close

- Information, Shipping and Payment steps: already unsupported.
- Thank you and Order status pages, **Shopify Plus**: sunset **2025-08-28**. Passed.
- Thank you and Order status pages, **non-Plus**: > "If you don't upgrade your pages again before August 26, 2026, then your Thank you and Order status pages will be auto-upgraded to the new pages."

Sources:
- https://shopify.dev/docs/storefronts/themes/architecture/layouts/checkout-liquid — verified 2026-07-24
- https://help.shopify.com/en/manual/checkout-settings/customize-checkout-configurations/upgrade-thank-you-order-status/upgrade-guide — verified 2026-07-24

**What this changes for us.** Roughly one month out. Any client on a non-Plus plan with
customised Thank you / Order status pages will have them auto-replaced. The replacement is
Checkout Extensibility, not Liquid. Agents must never propose a checkout.liquid customisation,
and the audit path for existing client stores should flag this before the date passes.

Related: Shopify Scripts continue until **2026-06-30** per the same page — already passed.

---

## 3. Stricter Liquid parsing since 2026-01-13

Shopify enforces stricter Liquid parsing for all themes and theme app extensions.
Non-conforming files are automatically rewritten by Shopify to be compatible.

Source: https://shopify.dev/changelog/liquid-is-getting-faster-and-ready-to-evolve — verified 2026-07-24

**What this changes for us.** Liquid that "worked" in a snippet from 2023 may now be rewritten
underneath us, which silently changes generated output. Never trust a Liquid pattern that lacks
a post-2026-01 source. Validate through `validate_theme` / `validate_theme_codeblocks` on the
Shopify Dev MCP rather than assuming.

---

## 4. Automatic CSS subsetting since 2026-04-23

Shopify now performs "CSS content subsetting for `{% stylesheet %}` tags" and only delivers
the CSS relevant to the sections, blocks and snippets rendered on that page.

> "if a file's `{% stylesheet %}` defines CSS classes that are used by HTML elements in other,
> unrelated files, those styles may not be included on pages where the defining file isn't rendered."

Source: https://shopify.dev/changelog/automatic-css-subsetting-for-stylesheet-tags — verified 2026-07-24

**What this changes for us.** This turns "CSS must be scoped to its own file" from a style
preference into a **correctness requirement**. Cross-file class dependencies now produce
missing styles on real pages, not just messy code. This is the mechanical reason the generated
CSS has been coming out wrong, and it is enforceable as a gate.

---

## 5. Bare query strings stopped busting asset cache on 2026-03-24

> "Bare query strings (a `?` followed by a value with no key) will not refresh cached assets."

Use `{{ 'file.css' | asset_url }}` and let Shopify version it. Announced 2026-03-02, effective 2026-03-24.

Source: https://shopify.dev/changelog/bare-query-strings-no-longer-bust-the-cache-for-assets — verified 2026-07-24

**What this changes for us.** Any hand-rolled `?v=123` cache-buster is now a stale-asset bug.

---

## 6. agents.md, llms.txt and llms-full.txt are theme templates since 2026-05-28

Three new templates control what agentic shoppers and crawlers read:

- `templates/agents.md.liquid` — serves `/agents.md`, and is the fallback for the other two
- `templates/llms.txt.liquid` — serves `/llms.txt`
- `templates/llms-full.txt.liquid` — serves `/llms-full.txt`

> "If no template is present for a given path, it falls back to your agents.md template, then to the Shopify-generated default."

Source: https://shopify.dev/changelog/customize-llmstxt-llms-fulltxt-and-agentsmd — verified 2026-07-24

**What this changes for us.** This is a new, unclaimed deliverable. Every store we build should
ship a considered `agents.md.liquid`. Nobody's existing rule pack knows this template exists,
because it is eight weeks old.

---

## 7. `{% block %}` and `{% partial %}` tags — developer preview, 2026-07-21

- `{% block %}` renders a reusable theme block directly from a template, taking a name, inputs and body content, similar to `{% render %}`.
- `{% partial %}` defines a named region of server-rendered HTML that JavaScript can refresh without a full page reload.

Status: Liquid July '26 developer preview. **Not GA.**

Source: https://shopify.dev/changelog/developer-preview-liquid-block-and-partial-tags — verified 2026-07-24

**What this changes for us.** Three days old at time of writing. Do not ship to clients yet.
Do prototype, because `{% partial %}` removes the main reason teams reach for a client-side
framework on a Shopify storefront.

---

## 8. Smaller corrections worth carrying

| Stale belief | Current truth |
|---|---|
| FID is a Core Web Vital | INP replaced FID |
| Theme Check is a standalone repo | Theme Check is 3.x inside `Shopify/theme-tools` |
| `shop.metaobjects.<type>` | `metaobjects.<type>.<handle>` |
| Polaris React is the admin UI path | Polaris React was archived 2026-01-06 |
| Sass is fine in themes | Sass in themes is deprecated |
| 48% of shoppers abandon over shipping cost | Unverifiable. The verified figure is **39%**. Never cite 48%. |

---

## Re-verification

This file has a 30-day shelf life. The cheapest way to keep it true is to diff
https://shopify.dev/changelog?filter=dev_themes against it on that cadence and append,
never rewrite history — each entry keeps its own verified-on date.
