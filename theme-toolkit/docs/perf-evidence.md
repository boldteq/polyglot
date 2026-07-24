# Perf evidence — where our thresholds come from, and what would make them better

`lighthouse-budget.json` now carries a `source` + `checked` on every band (see its `_provenance`).
Those are **universal** boundaries: the same LCP/CLS/INP numbers Google publishes for the whole web.
They are not Shopify-specific, and they are not percentile-aware.

## What we cannot do today

HTTP Archive / CrUX on BigQuery is the usual way to get real Shopify-origin distributions.
**Blocked: neither `bq` nor `gcloud` is installed**, and this toolkit takes no new deps.

## The viable alternative: the CrUX API

- Needs a Google API key (Chrome UX Report API, free tier, per-key quota). Store as `CRUX_API_KEY`; never commit.
- `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=$CRUX_API_KEY`
  with `{ "origin": "https://<store>.myshopify.com", "formFactor": "PHONE" }`.
- Returns, per metric (`largest_contentful_paint`, `cumulative_layout_shift`,
  `interaction_to_next_paint`, `experimental_time_to_first_byte`): the good/needs-improvement/poor
  histogram plus `percentiles.p75` — i.e. the real field number at the percentile CWV is defined at.
- Origin-level only for most stores; `url` queries need enough traffic on that exact page.
- Plain HTTPS POST — `fetch` is enough, no SDK, no new dep.

## The Shopify-percentile shape we actually want

Repeat the call across a basket of Shopify origins (our live client stores + a sampled set of
comparable stores in the niche), keep `p75` per metric per form factor, then take the distribution
**of those p75s**. The useful cut is the 25th percentile of that set: "the LCP you need to beat 75%
of comparable Shopify stores."

## What it would buy us

Thresholds stop being universal and start being competitive. Today a 2.4s desktop LCP passes because
Google says 2.4s is the lab boundary — even if every comparable store in the niche sits at 1.4s.
A percentile-backed band turns the perf gate from "not disqualifying" into "actually competitive",
and it gives INP a real number from the field instead of the `measured:false` placeholder the lab
run can never fill.

**Not attempted here** — this file is the spec for whoever picks it up, not a shipped integration.
