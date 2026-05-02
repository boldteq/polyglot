# Pinzo — Pricing, LTV & Unit Economics v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 2 #4a)
**Owner agent:** Ledger
**Anchored to:** `/Users/yashbaldha/Desktop/Boldteq App/Pinzo/app/plans.ts` (4 tiers already codified)
**Loaded by:** Ledger, Quill (pricing page copy), Bolt (billing API wiring), Orbit (conversion targets), Verdict (30-day decision)

---

## 1. The Four Tiers (anchored to `app/plans.ts`)

Pinzo already has Free / Starter / Pro / Ultimate in the codebase. This file grounds them in real numbers — prices, feature gates, target margins, expected conversion.

| Plan | Price | ZIPs | Delivery rules | Radius rules | Analytics | Waitlist capture | Support | Target % of paid users |
|---|---|---|---|---|---|---|---|---|
| **Free** | $0 | 20 | 1 | 0 | 7 days | — | Community docs | — (funnel) |
| **Starter** | $9/mo | 500 | 3 | 1 | 30 days | 1 list | Email, 48h | ~60% |
| **Pro** | $19/mo | Unlimited | 10 | 3 | 90 days | 3 lists, CSV export | Email, 24h | ~30% |
| **Ultimate** | $49/mo | Unlimited | Unlimited | Unlimited | 365 days | Unlimited, webhooks, Klaviyo integration | Priority, 12h | ~10% |

**Billing model:** Flat monthly via Shopify Billing API (`AppSubscription` mutation). Annual plans (20% discount) added in v1.1, not v1.

**Trial strategy:** Zero trial. Free plan IS the trial. Starter activates on first Shopify billing approval. Removes the "trial expired, now convert" drop-off — merchants either stay on Free (and never cost us money) or upgrade when they hit the 20-ZIP cap (self-triggered conversion event).

**Currency:** USD. Shopify Billing handles merchant-currency display automatically.

---

## 2. Cost Structure (per merchant, per month)

What Pinzo actually costs Boldteq to run for one merchant at each tier.

| Line item | Free | Starter | Pro | Ultimate |
|---|---|---|---|---|
| Railway compute (shared Next.js app, amortized) | $0.08 | $0.15 | $0.25 | $0.40 |
| Railway Postgres (shared) | $0.02 | $0.04 | $0.08 | $0.15 |
| Prisma query volume (~1K/mo per merchant on Free, scales ~5x per tier) | $0.00 | $0.00 | $0.00 | $0.00 |
| Resend (transactional emails only) | $0.01 | $0.03 | $0.05 | $0.10 |
| Sentry error volume (shared quota) | $0.01 | $0.02 | $0.04 | $0.08 |
| Shopify revenue share (20% on apps <$1M ARR, 15% after) | $0.00 | $1.80 | $3.80 | $9.80 |
| Support cost (estimated human time × $40/hr) | $0.00 | $0.20 | $0.50 | $1.20 |
| **Total monthly cost** | **$0.12** | **$2.24** | **$4.72** | **$11.73** |
| **Gross margin** | — (loss leader) | **$6.76 / 75%** | **$14.28 / 75%** | **$37.27 / 76%** |

**Critical number:** Free plan costs ~$0.12/mo per merchant. At 10,000 Free users that's $1,200/mo drag. Break-even requires ~180 paid merchants to fund 10K free slots. This is the scaling constraint to watch — if Free-to-Paid conversion drops below 1.8%, Pinzo burns money at Free-tier scale.

**Blended gross margin at target mix** (60% Starter / 30% Pro / 10% Ultimate): **~75%** — healthy SaaS territory.

---

## 3. LTV Model

**Assumptions** (Ledger calibrates these after the first 90 days of real data; these are reasonable Shopify-app-market priors):

| Metric | Free | Starter | Pro | Ultimate |
|---|---|---|---|---|
| Monthly churn | N/A (no revenue) | 6% | 4% | 3% |
| Average lifetime (months) | N/A | 16.7 | 25.0 | 33.3 |
| Gross profit / month | ($0.12) | $6.76 | $14.28 | $37.27 |
| **LTV (gross)** | ($2.00 drag over 16mo avg) | **$113** | **$357** | **$1,241** |
| **LTV (blended across paid mix 60/30/10)** | — | — | — | **$298 blended paid-user LTV** |

**Blended LTV including Free drag:**
- Blended paid LTV: $298
- Free drag: $0.12 × 16 months avg = ~$2 per Free user
- Ratio of Free to Paid at mature state: ~30:1 (Shopify-app-market typical)
- Free drag per paid user: $2 × 30 = $60
- **Net blended LTV per paid user:** $298 − $60 = **$238**

**CAC target** (maximum allowable customer acquisition cost):
- Industry rule: CAC ≤ LTV / 3 for healthy SaaS
- Max CAC: $238 / 3 = **$79 per paid merchant**
- Payback target: ≤ 6 months → CAC ≤ 6 × ~$15 avg monthly profit = **$90 max** (consistent with the $79 rule)

**Pinzo distribution strategy** (Echo's constraint):
- Shopify App Store organic = $0 CAC (primary channel — listing + search + category ranking do the work)
- Paid ads only if organic installs <50/month after the first 60 days, capped at $79/install max bid
- Content SEO (blog posts targeting "shopify delivery zones", "zip code checker shopify") = ~$15 CAC amortized
- Partnership/affiliate = 30% first-year revenue share, ~$40 CAC at scale

---

## 4. Break-Even Math

**Fixed costs for Pinzo (Boldteq share):**
- Yash's time: treated as zero for factory math (~1 day/week maintenance at mature state)
- Railway baseline (shared across all Boldteq apps, amortized to Pinzo): ~$20/mo
- Domain, SSL, misc: ~$5/mo
- Sentry + PostHog + Resend baseline: ~$15/mo
- **Total fixed monthly overhead: ~$40**

**Break-even paid merchants:** 40 / (blended monthly profit of ~$15/paid) = **~3 paid merchants/month ongoing** to cover overhead. Anything above that is profit.

**90-day goal (post-launch):** 25 paid merchants → $375/mo gross profit → ~$335/mo net → training signal for Orbit's north-star dashboard.

**365-day goal:** 250 paid merchants → $3,750/mo → ~$45K ARR → Pinzo proves Stack B playbook, Boldteq reinvests the proceeds into #2 Shopify app.

---

## 5. Pricing Page Rules (for Quill)

1. **Show Free first, prominently.** Free is the acquisition engine. Don't bury it.
2. **Show all four tiers side-by-side** on desktop; stacked on mobile with Starter pre-expanded.
3. **Every feature is binary (✓ / —) except numeric caps.** No "full access*" with footnotes.
4. **Match `app/plans.ts` bit-for-bit.** Ledger + Sage verify this with a diff script (see shopify-app-store-submission-runbook.md item #13).
5. **No "Most Popular" badge on Starter or Pro in v1.** Data-driven badge decisions only — once real conversion data exists (90 days post-launch), highlight the actually-most-popular tier.
6. **No "save 20% with annual" in v1.** Annual plans ship v1.1.
7. **FAQ:** Answer exactly three questions: "Can I cancel anytime?" (yes, prorated by Shopify), "What happens to my ZIPs if I downgrade?" (kept, but extras become read-only), "Do I need a paid Shopify plan?" (yes — Shopify requirement, not Pinzo's).

---

## 6. Kill Criteria (feed Verdict at Day 30 and Day 90)

**Day 30 (2026-06-XX):** SCALE / PIVOT / KILL decision for Pinzo inputs:
- KILL if: <10 paid merchants AND Free-to-Paid conversion <0.5% AND no listing-traffic growth trend
- PIVOT if: 10–25 paid merchants AND conversion <1.5% AND feature requests all cluster on a different product (e.g., "I want radius, not ZIPs")
- SCALE if: 25+ paid merchants AND conversion ≥1.5% AND organic install rate growing week-over-week

**Day 90 (2026-08-XX):** Re-evaluate:
- KILL if: <50 paid merchants AND LTV:CAC <1.5
- SCALE if: 100+ paid merchants AND LTV:CAC >3 AND gross margin >70%

Verdict agent loads these exact thresholds when making portfolio decisions. No fuzzy "how does it feel" — hard numbers.

---

## 7. Open Questions (fill in after first 30 days)

- Real Free-to-Paid conversion rate (prior: 2% Shopify App Store average — Pinzo benchmark TBD)
- Real monthly churn at Starter tier (prior: 6% — Pinzo's "stickiness" depends on whether merchants integrate with their delivery workflow)
- Whether Ultimate's Klaviyo integration actually drives Ultimate upgrades or is just a feature-check-box (evaluate feature usage data in PostHog)
- Whether to add a $99 "Agency" tier for merchants running 5+ stores under one partner account

---

## 8. Version Log

- **v1 — 2026-04-11** — First pricing + LTV model, anchored to real `app/plans.ts`. All assumptions flagged as priors until 90 days of real Shopify App Store data recalibrates them. Ledger owns the recalibration.
