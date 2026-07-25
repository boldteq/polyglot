# Liquid and CSS standard

This exists because of one reported symptom: *"code also not that level clean, css also
pattern not good."* Everything below is a rule an agent can follow and a gate can check.

Distilled from Shopify's published theme best practices and the 2026 platform changes.
Sources are listed per section. Shopify's `liquid-theme-standards` skill is the machine-readable
companion — install it (see `../README.md`) rather than trying to restate it here.

---

## A. CSS ownership — the rule that fixes most of it

Since 2026-04-23 Shopify subsets CSS per rendered file. A file's `{% stylesheet %}` only ships
on pages where that file renders.

**Rule A1.** A file styles only its own markup, plus markup it renders itself via `{% render %}`.
Never style another file's classes.

**Rule A2.** One `{% stylesheet %}` per file. More than one is a syntax error, not a warning.

**Rule A3.** No Liquid inside `{% stylesheet %}` or `{% javascript %}`. It is not rendered there.
Liquid-driven values go on the element as an inline `style` attribute or a `data-` attribute.

**Rule A4.** Anything genuinely global — resets, tokens, typography scale — belongs in a real
asset file loaded from the layout, not in a section's `{% stylesheet %}`. If two sections need
the same class, that class is global by definition and must move.

Source: https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags
and https://shopify.dev/changelog/automatic-css-subsetting-for-stylesheet-tags — verified 2026-07-24

**Gate-able.** Parse each section/block/snippet, collect the class selectors its `{% stylesheet %}`
defines, collect the classes its own markup uses, and fail on any selector defined here but used
only elsewhere. That is a mechanical check with no false-positive class of consequence.

---

## B. Naming

**Rule B1.** One naming system per theme, declared once, derived from the brand — never a
per-store literal baked into a template. Generated names come from the brief.

**Rule B2.** BEM for component classes: `block__element--modifier`. It is boring, it is
greppable, and it makes rule A1 self-evident on inspection.

**Rule B3.** Prefix nothing with a client name in shared code. A section that only works for one
store is a bug in the generator, not a feature.

**Rule B4.** CSS custom properties carry the design tokens. Emit them in DTCG shape so the
design-system layer stays portable: https://tr.designtokens.org/format/

---

## C. Liquid

**Rule C1.** No Liquid pattern without a post-2026-01 source. Parsing got stricter on
2026-01-13 and Shopify silently rewrites non-conforming files.

**Rule C2.** Assets are referenced through `asset_url`. Never a hand-rolled `?v=` cache-buster —
bare query strings stopped busting cache on 2026-03-24.

**Rule C3.** Prefer theme blocks over hard-coded section internals. A merchant who cannot
reorder it will ask us to.

**Rule C4.** Every `{% schema %}` setting needs a label, a sane default and, where it changes
layout, a `info` string. Settings without defaults produce broken first renders in the editor.

**Rule C5.** Guard every object access that can be nil in an empty store. The theme must render
correctly on a store with zero products — that is the state every client store starts in.

**Rule C6.** `metaobjects.<type>.<handle>`, not `shop.metaobjects.<type>`.

**Rule C7.** No `checkout.liquid` customisation, ever. See `01-platform-truth-2026.md` §2.

---

## D. JavaScript

**Rule D1.** One `{% javascript %}` per file. Shopify wraps it in a closure and concatenates
per file type — sections into `scripts.js`, blocks into `block-scripts.js`, snippets into
`snippet-scripts.js`.

**Rule D2.** Bundled JS injects once per file regardless of how many instances render.
Per-instance state comes from `data-` attributes on the element, never from module scope.

**Rule D3.** Progressive enhancement is not optional. The section renders and is usable with
JS disabled or still loading, then enhances.

**Rule D4.** No framework on a storefront section. If the interaction genuinely needs one,
that is a signal to re-scope, and `{% partial %}` (dev preview, 2026-07-21) is the coming
first-party answer.

Source: https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags — verified 2026-07-24

---

## E. Markup and accessibility

**Rule E1.** Semantic elements first. A `div` with a click handler is a defect; use a `button`.

**Rule E2.** Interaction patterns come from the WAI-ARIA Authoring Practices Guide verbatim —
menus, dialogs, tabs, accordions, carousels. Do not invent a keyboard model.
https://www.w3.org/WAI/ARIA/apg/

**Rule E3.** WCAG 2.2 AA is the floor, not the target: contrast, visible focus, target size,
no keyboard trap. https://www.w3.org/TR/WCAG22/

**Rule E4.** Every image gets meaningful alt text or an explicit empty alt for decoration.
Merchant-supplied alt wins when present.

**Rule E5.** Reserve layout space for every image and embed. CLS is a ranking input and a
conversion input, and it is entirely preventable at generation time.

---

## F. What "clean" means, concretely

A section passes when all of these hold:

1. Its stylesheet defines no selector used outside itself.
2. It has exactly one `{% stylesheet %}` and at most one `{% javascript %}`, neither containing Liquid.
3. It renders correctly on an empty store.
4. Every schema setting has a label and a default.
5. It is keyboard-operable end to end, and focus is visible throughout.
6. No class, ID, string or URL is specific to one merchant.
7. Every image and embed has reserved dimensions.
8. `validate_theme` on the Shopify Dev MCP returns clean.

Items 1, 2, 4, 6, 7 and 8 are mechanically checkable today. Items 3 and 5 need a rendered
page, which is what the existing Lens and gate stack is already for.
