# Rankora — North-Star + Activation Metrics v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 2 #5b)
**Owner agent:** Orbit
**Anchored to:** `rankora-pricing-ltv.md` kill criteria, `rankora-brand-kit.md` messaging pillars (evidence-first), `rankora-nextjs-rebuild.md` Stack A tiers
**Loaded by:** Orbit (dashboard), Hawk (alerting), Verdict (portfolio decisions), Mira (lesson capture)

---

## 1. North-Star Metric

**Weekly Evidence-Backed Ranks** — the number of resume ranks completed in a rolling 7-day window where the user (a) viewed the ranked results AND (b) expanded at least one "evidence" disclosure to see the quoted text from a resume.

Why this metric:
- It's the moment Rankora's core brand promise ("see the evidence, not the score") actually delivers
- Ranks that nobody opens are wasted compute — they generate cost but zero value
- Ranks where users don't engage with evidence mean users don't trust the product, which leads to churn
- It captures real engaged use, not just API hits

**NOT the north-star (common mistakes):**
- Ranks processed: inflates when users run batches and walk away, doesn't prove value
- MRR: too downstream for a product still building trust
- Users logged in: too upstream, doesn't capture engagement depth
- Resumes uploaded: inputs, not outcomes
- "Time saved" estimates: made up, not measurable without LTV-level longitudinal data

**Definition (precise SQL, runs against Supabase):**
```sql
-- rankings table: one row per resume-vs-JD ranking completed
-- evidence_views table: event fired when user expands the evidence disclosure on a ranked row
with weekly_ranks as (
  select r.id, r.profile_id, r.completed_at
  from rankings r
  where r.completed_at >= now() - interval '7 days'
    and r.status = 'completed'
),
viewed_ranks as (
  select distinct wr.id
  from weekly_ranks wr
  where exists (
    select 1 from resume_score_views v
    where v.ranking_id = wr.id
      and v.viewed_at > wr.completed_at
  )
),
evidence_engaged as (
  select distinct vr.id
  from viewed_ranks vr
  where exists (
    select 1 from evidence_expansions e
    where e.ranking_id = vr.id
  )
)
select count(*) as weekly_evidence_backed_ranks
from evidence_engaged;
```

**Target trajectory (post-cutover, starting 2026-05-19):**
- Week 1 post-cutover: >100 (soft launch, small cohort)
- Week 4: >500
- Week 12: >2,500 (Verdict's Day-90 SCALE threshold)
- Week 26: >8,000
- Week 52: >25,000 (first-year success state)

---

## 2. Activation Definition

An activated Rankora user has done all four within 7 days of signup:

1. Pasted or uploaded at least one real JD
2. Ingested at least 10 resumes in a single batch
3. Completed at least one rank AND viewed the results
4. Expanded at least one evidence disclosure (the "see why" click)

All four = activated. Anything less = at-risk.

**Why these four specifically:** They map 1:1 to the brand promise "evidence-first ranking". A user who runs a batch but never opens an evidence panel isn't getting the Rankora value — they're using it like a black-box scoring tool, and they WILL churn because every other ranking tool does that cheaper.

**SQL:**
```sql
with recent_signups as (
  select id as profile_id, created_at
  from profiles
  where created_at >= now() - interval '30 days'
),
activation_flags as (
  select
    p.profile_id,
    p.created_at,
    exists(select 1 from job_descriptions jd where jd.profile_id = p.profile_id and jd.word_count > 50 and jd.created_at > p.created_at) as has_real_jd,
    (select count(*) from resumes r where r.profile_id = p.profile_id and r.created_at > p.created_at) >= 10 as has_ten_resumes,
    exists(
      select 1 from rankings r
      join resume_score_views v on v.ranking_id = r.id
      where r.profile_id = p.profile_id and r.created_at > p.created_at
    ) as viewed_a_rank,
    exists(
      select 1 from rankings r
      join evidence_expansions e on e.ranking_id = r.id
      where r.profile_id = p.profile_id and r.created_at > p.created_at
    ) as expanded_evidence
  from recent_signups p
)
select
  count(*) as total_signups,
  count(*) filter (where has_real_jd and has_ten_resumes and viewed_a_rank and expanded_evidence) as activated,
  round(
    100.0 * count(*) filter (where has_real_jd and has_ten_resumes and viewed_a_rank and expanded_evidence) / nullif(count(*), 0),
    2
  ) as activation_rate_pct
from activation_flags
where created_at <= now() - interval '7 days';
```

**Activation rate targets:**
- Month 1 post-cutover: establish baseline
- Month 2: ≥30%
- Month 3: ≥40% (Verdict's SCALE signal input)
- Month 6: ≥50%

Rankora activation will be harder than Pinzo because Rankora asks more of users: they have to bring real JDs and real resumes. Below 20% sustained = brand-kit + onboarding sprint triggered.

---

## 3. The Rankora Metrics Dashboard

One PostHog dashboard, ten panels (two more than Pinzo because Rankora has AI quality metrics).

| # | Panel | Metric | Refresh | Alert threshold |
|---|---|---|---|---|
| 1 | Hero: weekly evidence-backed ranks | North-star | Hourly | Flat or down 2 weeks → Hawk alerts |
| 2 | Weekly active users | Distinct profiles with any rank this week | Hourly | WoW decline >10% |
| 3 | Activation funnel | Signup → JD → 10 resumes → View rank → Expand evidence | Daily | Any step <40% |
| 4 | Free-to-Paid conversion (7d, 30d) | % of signups that upgraded within window | Daily | 30-day <1.5% for two cohorts |
| 5 | Plan mix | Free/Pro/Team counts | Daily | — |
| 6 | Pro churn + Team churn (rolling 30d) | Separately, because they behave differently | Daily | Pro >10%, Team >6% |
| 7 | MRR (Dodo sync) | Sum of active subscriptions | Daily | MoM decline |
| 8 | Rank latency | p50 / p95 / p99 time from rank submit → complete | Hourly | p95 >90s for 200 resumes |
| 9 | Rank cost per rank (actual) | OpenAI spend / ranks completed | Daily | >$0.004 per rank (60% over budget) |
| 10 | AI quality: evidence expansion rate | % of viewed ranks where user expanded ≥1 evidence | Daily | <40% = brand promise broken |

**Instrumentation events:**
- `signup_completed` (profile_id, source=organic|ph|seo|paid)
- `jd_pasted` (word_count, method)
- `resume_uploaded` (count, format=pdf|docx|txt)
- `rank_started` (ranking_id, jd_id, resume_count)
- `rank_completed` (ranking_id, duration_ms, cost_usd)
- `rank_viewed` (ranking_id)
- `evidence_expanded` (ranking_id, resume_rank_position)
- `upgraded` (from_plan, to_plan, mrr_delta)
- `downgraded` (from_plan, to_plan)
- `ai_quality_feedback` (ranking_id, rating=useful|not_useful, note) — **optional in-app thumbs up/down on ranks, feeds Orbit's quality metric**

---

## 4. AI Quality Metric (Rankora-specific, Pinzo doesn't need this)

Because Rankora is an AI product where brand and legal both depend on "the AI is right most of the time", Orbit tracks a **quality signal** independently of usage metrics.

**Primary quality signal: Evidence expansion rate**
- Target: >50% of viewed ranks have ≥1 evidence expansion
- Interpretation: users trust the product enough to drill in
- Below 40% = either the ranks are wrong, the UI hides evidence too well, or the brand promise isn't landing

**Secondary quality signal: In-app thumbs (opt-in)**
- Small thumbs-up/down on each rank
- Tracked but NOT the primary signal (small samples, selection bias — frustrated users down-vote more than satisfied users up-vote)
- Used as a Pulse research trigger: when thumbs-down rate >15%, Pulse runs a qualitative pass

**Tertiary quality signal: Shortlist-accept rate**
- % of Rankora-shortlisted candidates (top 10%) that users mark as "contacted" or "shortlisted-for-interview" in their own ATS
- Requires Greenhouse/Lever integration, so v1.1+ feature
- Gold standard for real-world efficacy

---

## 5. Leading Indicators

Orbit watches these to forecast the north-star 2 weeks out:

1. **Signup → first rank ratio** (7-day rolling): if new users never rank anything, they never will
2. **Avg resumes per rank** (7-day rolling): low numbers (<10) suggest users are evaluating, not working
3. **Evidence expansion rate trend** (7-day rolling): the leading quality signal
4. **Sample-ranking permalink views vs signups** (from landing page): funnel health

---

## 6. Alerting Rules (Hawk)

| Condition | Severity | Channel | Action |
|---|---|---|---|
| Weekly evidence-backed ranks down 2 weeks consecutive | Warning | Email | Orbit + Pulse investigate |
| Activation rate <20% for a full cohort | Warning | Email | Onboarding sprint |
| Rank latency p95 >90s | Warning | Email | Koda investigates worker throughput |
| Rank cost per rank >$0.004 | Warning | Email | Ledger re-runs margin model |
| AI quality (evidence expansion) <40% | Critical | Email | Pulse + Vega investigate |
| Pro churn >12% in a month | Critical | Email | Pulse runs exit interviews |
| Dodo webhook failures >0 in 24h | Critical | Email + SMS | Vex paged |
| OpenAI API error rate >2% | Critical | Email + SMS | Hawk pages + Koda adds Anthropic fallback |

---

## 7. Anti-Metrics

- **Total resumes ingested.** Inputs aren't outcomes. A user uploading 10K resumes and never ranking them is a storage cost, not a customer.
- **Total ranks.** Without the "evidence expanded" qualifier, this is garbage. A batch of 500 ranks nobody opens is anti-value.
- **Session duration.** Unlike Pinzo, Rankora users SHOULD spend time in the app — but time spent doesn't equal value delivered. Depth of engagement (evidence expansion) is the truer signal.
- **"AI calls made."** Internal cost metric only. Not a product metric.

---

## 8. Post-Cutover Calibration Plan

Rankora's north-star and activation rates are priors. Orbit recalibrates them at these specific checkpoints:

- **Cutover + 7 days:** Confirm instrumentation is firing (not a metric recalibration, just QA)
- **Cutover + 14 days:** First real weekly number. If wildly off priors, flag for Ledger to recheck pricing/LTV assumptions.
- **Cutover + 30 days:** Verdict's first portfolio decision window. Numbers here are the inputs.
- **Cutover + 90 days:** Verdict's second portfolio decision window. If Rankora is not in SCALE by here, serious pivot conversation.

---

## 9. Version Log

- **v1 — 2026-04-11** — First metrics definition for Rankora. Evidence-expansion-rate is the distinguishing metric vs every other AI ranking tool. Orbit recalibrates at cutover + 14 days.
