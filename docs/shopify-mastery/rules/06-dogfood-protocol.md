# 06 — The dogfood protocol

Every other file in this pack teaches the agents something. This one is the only file that
**proves** anything.

The capability audit scored six layers. Five of them are knowledge problems, and knowledge can be
installed. One of them is not:

> Proven on a real store, full-green publish — **unproven, ~15%**.

No source closes that row. No amount of reading closes it. It closes exactly once, when a store
is built end to end, every gate runs against a live rendered storefront, and the evidence is on
disk. This file is that run, written so it can be executed on **any** brand, by anyone, with no
edits.

Nothing here is store-specific. Every path, name and handle is derived at run time from the brief.

---

## §0 What "proven" means here

Three claims, each of which must be separately evidenced:

1. **It builds.** The pipeline produces a complete theme from a brief with no manual repair.
2. **It survives contact with real data.** The theme does not break on the ugly cases —
   100 variants, no image, 3000 characters, three-level menus, five pickup locations.
3. **It passes its own gates on rendered output**, not on source inspection.

A run that satisfies 1 and 2 but not 3 is a **build**, not a proof. Say so plainly.

---

## §1 The proving store

A **dev store**, created fresh per run and disposed of after. Never a client's live store, never
a shared sandbox that accumulates state between runs — accumulated state is how a green run
becomes unreproducible.

**Create** (Dev Dashboard → `dev.shopify.com/dashboard` → **Dev Stores** → **Add dev store**):

- Name: derived from the brief's brand slug plus the run id. Never a hand-typed name.
- **Tick "Generate test data for store".** Shopify populates the store with its own test data.
  This is the baseline; §2 adds the adversarial cases on top.
- Optionally tick "Test a feature preview" — but a store with a feature preview enabled has no
  access to domains, so never use one for a run that includes a domain step.

**Limitations that shape the protocol** (verbatim from Shopify's dev-store docs):

> * You can only install free apps and Partner-friendly apps.
> * You can only test orders using the Bogus Test gateway or by enabling test mode for your
>   payment provider. You can't test orders using real transactions through active payment
>   providers.
> * You can't remove the password page, or show a custom password page.

Consequences, and they are not small:

- **The store is always password protected.** Every automated gate that fetches a URL must carry
  the storefront password. A gate that silently gets the password page instead of the storefront
  will report a beautiful, entirely fictional score. **Assert on page content before scoring.**
- **Checkout cannot be proven with real money.** Bogus Gateway proves the flow, not the payment.
  Record that limit in the evidence bundle rather than implying full coverage.
- Paid apps are untestable here. If the brief needs one, the run is partial by definition.

---

## §2 The fixture set

Shopify's own theme-testing checklist is the adversarial data set. It is not optional garnish —
it is the difference between "works on the happy path" and "works". Load it before any gate runs.

Two CSVs ship with the docs and should be imported rather than hand-built:

- `https://shopify.dev/csv/theme-store-testing-shop-product-data.csv`
- `https://shopify.dev/csv/theme-performance-shop-product-data.csv`

Then add, verbatim from the checklist:

| Fixture | Requirement |
|---|---|
| Home page | "Add additional sections until the homepage has 25 sections" |
| Slideshows | "Three slideshows"; "Add the maximum number of slides. If there's no limit, then add 10 slides." |
| Product, max variants | "Product with 100 variants" |
| Product, no media | "Product with no image" |
| Long description | "Add multiple paragraphs (minimum 1000 characters)" |
| Long page | "Add multiple paragraphs (minimum 3000 characters)" |
| Navigation | Single-level, two-level and three-level nested; "Long level one/two/three menu item titles (30-60 characters)"; "Long navigation menu (10+ menu items)" |
| Tags | "Add a long list of tags (20+ tags)" on a collection; "Filter by a long list of tags (20+ tags)" on the blog |
| Pagination | "Pagination truncates on a collection with five or more pages"; same for search results; blog shows five pages on initial load |
| Local pickup | "Add five or more locations"; a variant available for pickup at five locations, and variants at one, two and zero |
| Unit pricing | Must render on the product page, collection product cards, cart drawer/page/popup, and the customer order page — and "unit prices change dynamically on variant change". Requires an EU or Switzerland store address. |
| Logos | Tested at 16:9, 4:3, 3:2 and 1:1, "using 72ppi, portrait, and landscape", for the header logo, password page logo and gift card logo |
| Text extremes | Store name 30-40 chars no spaces; announcement/plain text 60-100 chars; subheading 60 chars; paragraph 40-50 words; button label 30 chars no spacing; password message 500+ chars |
| Images | "2048px for retina displays" and "1024px for standard widescreen displays" |
| Rich media | Two 3D objects, one YouTube video, one Vimeo video, one MP4 video |
| Gift card | QR code minimum 120px × 120px |

**Rule.** A fixture that cannot be loaded is a **blocked run**, not a passed one. Record which
fixtures loaded. A green score on a store missing the 100-variant product proves nothing about
the 100-variant product.

---

## §3 The run

```
shopify theme check --path <theme-root> --fail-level error      # local lint, no --store flag
shopify theme dev --store <shop>                                # http://127.0.0.1:9292
shopify theme push --store <shop>                               # returns a preview link
shopify theme share --store <shop>                              # unpublished copy, random name
```

`--store` accepts the prefix or the full `myshopify.com` URL, and is also read from
`SHOPIFY_FLAG_STORE`. Note that **`theme check` has no `--store` flag** — it is purely local, so
passing it proves nothing about rendered output. That is the entire reason this protocol exists.

Theme Check is bundled into the CLI and into the Shopify Liquid VS Code extension. There is no
separate install and **no version number is published** — resolve it at run time with
`shopify theme check --version` and record what you got. Never hardcode a version.

---

## §4 The gates, in order

Run cheapest-first. Stop at the first hard failure; a run that limps past a red gate produces
evidence nobody can trust.

| # | Gate | Threshold | Where the number comes from |
|---|---|---|---|
| 1 | Theme Check | zero errors at `--fail-level error` | tooling default |
| 2 | Rendered-page assertion | every gate URL returns storefront markup, not the password page | dev-store constraint, §1 |
| 3 | Lighthouse performance | **≥ 60** average across product, collection and home, desktop and mobile | Theme Store requirements §6 |
| 4 | Lighthouse accessibility | **≥ 90** average, same pages, both form factors | Theme Store requirements §6 |
| 5 | Contrast | 4.5:1 body text; 3:1 for >18pt text and non-text elements including borders and icons | Theme Store requirements §12 |
| 6 | Touch targets | ≥ 24 × 24 CSS px (Theme Store). Build to 44 × 44 to also satisfy WCAG 2.2 AAA. | Theme Store requirements §12 |
| 7 | Colour system | ≥ 4 colours; every background setting has a paired foreground setting; settings use `type: color` | Theme Store requirements §16 |
| 8 | Fonts | `font_picker` only; a default is loaded; bold/italic/bold-italic via `font_modify`; **custom fonts are not accepted** | Theme Store requirements §15 |
| 9 | Browser + webview matrix | see §4.1 | Theme Store requirements §9 |
| 10 | Core Web Vitals, field-style | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, **all three at the 75th percentile** | web.dev Core Web Vitals |
| 11 | Taste rubric | `taste-rubric.json` — every `[E]` check at its stated action | rules 04 and 05 |
| 12 | No-JS render | primary content and navigation legible with JavaScript disabled | §4.2 |
| 13 | Structured data | valid, no errors | §4.3 |

**Important honesty note on three numbers you will see quoted as acceptance criteria.** The speed
formula `[(p × 31) + (c × 33) + (h × 13)] / 77`, the **16 KB** minified JS budget, and the limit
of **two resource hints per template** live on Shopify's *performance best practices* page, not on
the Theme Store requirements page, and are worded as "should". Treat them as **house targets that
we choose to enforce**, not as platform acceptance thresholds. Saying otherwise to a client is a
misrepresentation, and this pack does not do that. The only hard numeric acceptance gates Shopify
states are Lighthouse 60 and 90.

### §4.1 Browsers and webviews

Shopify's matrix is *rolling* — resolve "latest N releases" at test time, never hardcode versions.

- Safari: latest two, Mac · Chrome: latest three, Mac and PC · Firefox: latest three, Mac and PC ·
  Edge: latest two, PC
- Mobile Safari: latest two, iOS · Chrome Mobile: latest three, Android and iOS ·
  Samsung Internet: latest two, Android
- **Webviews — the row everyone forgets, and it is mandatory:** Instagram, Facebook and Pinterest,
  latest release, Android and iOS. Browsing *and purchasing* must work inside them.

### §4.2 The no-JS test

Chrome DevTools → Command Menu (`Ctrl/Cmd+Shift+P`) → **Disable JavaScript** → **reload**.

Two behaviours are load-bearing and routinely missed: JavaScript stays disabled **only while
DevTools is open**, and you must reload to see load-time dependence. A tester who forgets the
reload will pass a page that renders nothing on a cold load.

### §4.3 Validators — current status, so nobody wastes an afternoon

| Tool | Status 2026-07 | Use |
|---|---|---|
| Google Rich Results Test | live, no login | yes — note Google has narrowed eligible types (FAQ dropped) |
| Schema Markup Validator | live, no login | yes — the general-purpose check |
| Facebook Sharing Debugger | live but **requires a Facebook login** | needs a designated account or the step blocks |
| X / Twitter Card Validator | **unusable anonymously** — `cards-dev.twitter.com/validator` returns 307 → `x.com/login` | do not use in CI. Assert on `twitter:card`, `twitter:title`, `twitter:image` directly. |
| LinkedIn Post Inspector | page renders logged-out, but **inspection requires a login** | needs a designated account, same as Facebook, or the step blocks |

**The two social validators, stated precisely — because the sloppy version of this claim is wrong.**
The X validator is *not* verifiably retired. Its 307-to-login is not new: archived crawls of that
exact URL return 307-to-login continuously from 2015 through 2026-07-20, so an anonymous probe
cannot tell "retired" from "still working, login-gated". The only dated official statement is
`XDevelopers`, 2022-08-02: preview functionality was removed, the validator "remains accessible
for other debugging purposes". No retirement date could be verified from any primary source, and
X's own troubleshooting docs now 302 to a page that does not mention the tool. Either way the
operational conclusion is unchanged — it cannot run unattended, so assert on the tags.

LinkedIn is confirmed the same shape: `linkedin.com/post-inspector/` returns HTTP 200 with no
redirect, which makes it *look* usable logged-out, but the underlying
`/post-inspector-api/postInspector/<url>?action=inspect` call returns `{"status":401}` for an
anonymous session carrying a valid CSRF token. Checking only the shell page is how this gets
recorded wrong.

**FID is fully retired** (replaced by INP on 2024-03-12). Any FID row in an older checklist is dead.

---

## §5 Continuous gate, once the manual run is green

`Shopify/lighthouse-ci-action` (MIT, `Copyright 2020-present, Shopify Inc.`). Newest release is
**`v1.4.0`, published 2026-04-13** — verified against the tag's own `action.yml`, which is
byte-identical to `main`. Pinned:

```yaml
- uses: shopify/lighthouse-ci-action@v1.4.0
  with:
    store: ${{ secrets.SHOP_STORE }}
    client_id: ${{ secrets.SHOP_CLIENT_ID }}
    client_secret: ${{ secrets.SHOP_CLIENT_SECRET }}
    password: ${{ secrets.SHOP_STOREFRONT_PASSWORD }}
    lhci_min_score_performance: 0.6
    lhci_min_score_accessibility: 0.9
```

Four things to get right:

- **Pin the exact tag, not `@v1`.** The README pins the floating major; the CHANGELOG is stale
  past v1.2.1, so `@v1` can move underneath you without a documented diff.
- **Only two score inputs exist.** `action.yml` at `v1.4.0` declares thirteen inputs —
  `access_token`, `client_id`, `client_secret`, `store`, `password`, `product_handle`,
  `collection_handle`, `theme_root`, `pull_theme`, `lhci_github_app_token`, `lhci_github_token`,
  `lhci_min_score_performance` (default `0.6`), `lhci_min_score_accessibility` (default `0.9`).
  `store` is the only required one. There is no `lhci_min_score_best_practices` and no
  `lhci_min_score_seo`. Enforce those through a custom `lighthouserc` assertion or not at all —
  do not invent inputs.
- **`password` is mandatory here**, because the dev store cannot drop its password page.
- **Auth changed.** Shopify no longer allows creating new custom apps as of 2026-01-01. New setups
  use `client_id` / `client_secret` from a Dev Dashboard app with `read_products` and
  `write_themes`. The action's own `access_token` input is now labelled "Legacy custom app access
  token (for apps created before Jan 2026)" — existing tokens still work, but do not build new
  pipelines on that input.

---

## §6 The evidence bundle

A run is not proven by a claim in a chat window. It is proven by a directory. Written to a
run-scoped path derived from the brand slug and run id — never a fixed folder name.

```
<runs-root>/<brand-slug>/<run-id>/
  brief.json              the input, verbatim, hashed
  fixtures.json           every fixture from §2 with loaded true|false
  versions.json           CLI, Theme Check, browsers, action tag — resolved, not assumed
  theme-check.json
  lighthouse/             raw JSON per page per form factor, not just the numbers
  screenshots/            product, collection, home, cart, search, 404 — desktop and mobile
  no-js/                  the same pages with JavaScript disabled
  webviews/               Instagram, Facebook, Pinterest
  taste-rubric.json       every check with its actual measured value
  vitals.json
  validators.json
  RESULT.md               verdict, and every gate that was skipped and why
```

**`RESULT.md` must list skipped gates.** A bundle that shows twelve greens and hides the
thirteenth is worse than a bundle showing twelve greens and one honest "not run: paid app
required". The second is evidence. The first is marketing.

---

## §7 Exit criteria

The run is **green** when, and only when:

1. Every fixture in §2 is `loaded: true`.
2. Gates 1–13 pass at their stated thresholds.
3. Every `[E]` check in `taste-rubric.json` passes at its permitted action.
4. Screenshots exist for every listed surface, on both form factors.
5. `RESULT.md` lists zero skipped gates, or names each skip with a reason.
6. A second operator can re-run from `brief.json` and reach the same verdict.

Criterion 6 is the one that actually matters. A green that only reproduces on the machine that
produced it is not a proof, it is an anecdote.

---

## §8 What a failed run is worth

More than a passed one, if it is captured.

- Every failure becomes a **golden corpus case**: the brief, the failing output, the expected
  output, the gate that caught it — or the gate that *should* have caught it and didn't.
- A failure no gate caught is a **gate gap**, and it outranks new features. Write the gate before
  the next run.
- A failure the gate caught but nobody could act on is a **message-quality bug**. The gate names
  what is wrong, where, and what to change.
- Only failures that recur across two independent brands become rules. One brand's problem is a
  brand problem. Two brands' problem is a system problem.

---

## §9 Cadence

- Every brand build, before handover. No exceptions, including "small" ones.
- Every change to rules 01–05, on a fresh store, before the change is considered landed.
- Monthly on a control brief, so the number is a trend and not a snapshot.

---

## §10 What this protocol does not prove

Stated so no one over-claims from a green bundle.

1. **Not real revenue.** Bogus Gateway proves the flow, not that anyone buys.
2. **Not real traffic.** Lighthouse is lab data. The 75th-percentile Core Web Vitals thresholds
   are a *field* standard; until the store has real users, we are approximating them.
3. **Not paid-app behaviour**, which a dev store cannot install.
4. **Not aesthetic success.** Rules 04 and 05 score measurable proxies. Roughly half the variance
   in first-impression appeal is unexplained by the best published model. A green taste rubric
   means "no known failure mode detected", never "this is beautiful".
5. **Not longevity.** A theme that passes today can be broken by a platform change tomorrow.
   That is what the 30-day re-verification on `sources.json` is for.
