# Pinzo — North-Star + Activation Metrics v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 2 #5a)
**Owner agent:** Orbit
**Anchored to:** `app/plans.ts` tiers, `pinzo-pricing-ltv.md` kill criteria, `pinzo-brand-kit.md` messaging pillars
**Loaded by:** Orbit (dashboard), Hawk (alerting), Verdict (portfolio decisions), Mira (lesson capture)

---

## 1. North-Star Metric

**Weekly Covered Checks** — the number of ZIP coverage checks performed across all Pinzo merchant storefronts in a rolling 7-day window where the result was "covered" (the shopper CAN be delivered to).

Why this metric:
- It's the moment the product delivers value to the merchant AND the shopper at the same time
- It's not a vanity metric (installs) or a business metric (MRR) — it's a value metric
- It scales with both adoption (more merchants) and engagement (merchants getting more storefront traffic)
- It's leading, not lagging — if this stalls, churn and kill-criteria triggers follow within 2-4 weeks

**NOT the north-star (common mistakes):**
- Installs: too upstream, many installs never configure the widget
- MRR: too downstream, moves slowly
- Total checks (covered + not covered): inflates when merchants have narrow coverage and fails to capture merchant value
- Waitlist captures: only matters on Pro/Ultimate tiers

**Definition (precise, single SQL):**
```sql
-- Run against Pinzo's Postgres. Pinzo stores a ZipCheckLog table populated by the widget.
select count(*) as weekly_covered_checks
from zip_check_log
where created_at >= now() - interval '7 days'
  and result = 'covered';
```

**Target trajectory:**
- Week 1 post-launch: >500 (a few merchants × a few dozen checks each)
- Week 4: >5,000
- Week 12: >25,000
- Week 26: >75,000 (Verdict's SCALE threshold)
- Week 52: >200,000 (first-year success state)

---

## 2. Activation Definition

An activated merchant is a merchant who has completed all four of these within 7 days of install:

1. Imported at least 20 ZIPs (hit the Free-plan ceiling deliberately or not)
2. Enabled the Pinzo App Embed block in at least one published theme
3. Received at least one real storefront ZIP check (covered OR not covered) from a real shopper (not their own dev test)
4. Visited the admin dashboard at least twice (first install + at least one return visit)

All four = activated. Three or fewer = at-risk for churn, prompting Hawk to trigger an "onboarding stall" email via Resend.

**SQL (lives in PostHog or Metabase, loaded from Supabase read replica):**
```sql
with recent_installs as (
  select shop_domain, installed_at
  from sessions
  where installed_at >= now() - interval '30 days'
),
activation_flags as (
  select
    s.shop_domain,
    s.installed_at,
    (select count(*) from zip_codes where shop = s.shop_domain) >= 20 as has_zips,
    (select count(*) from widget_config where shop = s.shop_domain and enabled = true) > 0 as widget_enabled,
    exists(select 1 from zip_check_log where shop = s.shop_domain and created_at > s.installed_at and user_agent not like '%admin%') as got_real_check,
    (select count(distinct date_trunc('day', created_at)) from admin_pageview where shop = s.shop_domain and created_at > s.installed_at) >= 2 as returned_to_admin
  from recent_installs s
)
select
  count(*) as total_installs,
  count(*) filter (where has_zips and widget_enabled and got_real_check and returned_to_admin) as activated,
  round(
    100.0 * count(*) filter (where has_zips and widget_enabled and got_real_check and returned_to_admin) / nullif(count(*), 0),
    2
  ) as activation_rate_pct
from activation_flags
where installed_at <= now() - interval '7 days';  -- only merchants with a full 7-day window
```

**Activation rate targets:**
- Month 1 (small sample): establish baseline
- Month 2: ≥35%
- Month 3: ≥45% (Verdict's SCALE signal)
- Month 6: ≥55% (mature onboarding funnel)

Anything below 25% sustained = Vex + Pulse run a deep investigation into onboarding friction. Every 10-point improvement in activation is worth roughly +30% LTV (rule of thumb, Ledger confirms with real data).

---

## 3. The Pinzo Metrics Dashboard (what Orbit builds)

One PostHog dashboard, eight panels. Nothing more.

| # | Panel | Metric | Refresh | Alert threshold |
|---|---|---|---|---|
| 1 | Hero: weekly covered checks | The north-star | Hourly | Flat or down 2 weeks in a row → Hawk alerts |
| 2 | Active merchants (weekly) | Distinct shops with ≥1 check this week | Hourly | Week-over-week decline >10% |
| 3 | Activation funnel | Install → ZIPs → Embed → Real check → Return visit | Daily | Any step conversion <50% |
| 4 | Free-to-Paid conversion rate (7d, 30d cohorts) | % of installs that upgraded within window | Daily | 30-day <1.5% for two cohorts |
| 5 | Plan mix | Count on each of Free/Starter/Pro/Ultimate | Daily | — |
| 6 | Churn (rolling 30-day) | Paid merchants who cancelled / paid merchants at start | Daily | Starter churn >8% |
| 7 | MRR (Shopify Billing API sync) | Sum of active subscription charges | Daily | Month-over-month decline |
| 8 | Widget performance | Median load time, p95 load time, error rate | Hourly | p95 >200ms or error rate >1% |

**Instrumentation events to fire** (PostHog `$capture`):
- `install_completed` (installed_at, shop, plan='free')
- `zip_imported` (count, method=paste|csv|api)
- `embed_enabled` (theme_id)
- `admin_viewed` (page)
- `upgrade_clicked` (from_plan, to_plan)
- `upgrade_completed` (from_plan, to_plan, mrr_delta)
- `downgraded` (from_plan, to_plan)
- `uninstalled` (days_since_install, was_paid)
- `widget_check_performed` (result='covered'|'not_covered', widget_load_ms)
- `widget_error` (error_type, page_url)

---

## 4. Leading Indicators (predict the north-star 2 weeks out)

Orbit watches these to predict where the north-star is heading before the data shows it:

1. **Install→Embed-enabled ratio** (7-day rolling): if this drops, future covered checks drop
2. **Avg ZIPs per activated merchant** (7-day rolling): proxy for how seriously merchants use the product
3. **App Store listing click-through rate** (from Shopify Partner Dashboard): upstream of installs
4. **Organic install rate vs paid install rate**: if organic stalls, Pinzo needs a new SEO or PH push

---

## 5. Lagging Indicators (feed Verdict at Day 30, 90)

- MRR month-over-month growth
- Paid churn (Starter, Pro, Ultimate separately)
- LTV:CAC ratio (Ledger calculates from real data monthly)
- Gross margin actuals (compare to pricing-ltv.md projections)
- Support ticket volume per merchant (Hawk tracks via Chatwoot)

---

## 6. Alerting Rules (Hawk)

| Condition | Severity | Channel | Action |
|---|---|---|---|
| Weekly covered checks down 2 weeks consecutive | Warning | Email | Orbit runs deep-dive |
| Activation rate <25% for a full cohort | Warning | Email | Pulse + Vex investigate |
| Widget error rate >1% | Critical | Email + SMS | Vex paged |
| Widget p95 load >200ms | Warning | Email | Koda investigates |
| Paid churn spike >12% in any tier | Critical | Email | Pulse runs exit interviews |
| Dodo/Shopify Billing webhook failures >0 in 24h | Critical | Email + SMS | Vex paged |
| MRR day-over-day drop >5% | Warning | Email | Investigate (could be legit refund or real problem) |

---

## 7. Anti-Metrics (the stuff we explicitly DON'T optimize)

- **Total installs.** Vanity. Free installs that never activate are net negative.
- **Time spent in admin.** We want merchants spending LESS time in Pinzo, not more. Configure once, forget.
- **Total ZIPs imported.** A merchant importing 50K ZIPs isn't more valuable than one importing 500 if both see the same weekly covered checks.
- **Dashboard sessions per week.** Same logic. We're a set-and-forget widget for merchants.

Verdict explicitly rejects arguments citing anti-metrics when making SCALE/PIVOT/KILL calls.

---

## 8. Version Log

- **v1 — 2026-04-11** — First metrics definition. No real data yet. Targets are priors, Orbit recalibrates monthly once Pinzo ships.
