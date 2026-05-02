# Rankora — Pricing, LTV & Unit Economics v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 2 #4b)
**Owner agent:** Ledger
**Anchored to:** `/Users/yashbaldha/Desktop/Boldteq App/Rankora` (Stack A Next 16 rebuild, cutover 2026-05-19) and `~/.claude/memory/projects/rankora-nextjs-rebuild.md` (canonical tier list)
**Loaded by:** Ledger, Quill (pricing page copy), Koda (Dodo Payments wiring), Orbit (conversion targets), Verdict (30-day decision)

---

## 1. The Three Tiers

Rankora's rebuild plan already declares Free / Pro / Team. This file grounds them in cost and unit economics.

| Plan | Price | Ranks/month | Resume parsing | Evidence quotes | Export formats | Team seats | Support | Target % of paid |
|---|---|---|---|---|---|---|---|---|
| **Free** | $0 | 50 | PDF, DOCX | Top 3 per rank | CSV | 1 | Docs only | — (funnel) |
| **Pro** | $29/mo | 500 | PDF, DOCX, TXT, paste | All quotes, all requirements | CSV, Greenhouse, Lever | 1 | Email 24h | ~70% |
| **Team** | $99/mo | Unlimited | All + batch upload | All + AI-suggested interview questions | CSV, Greenhouse, Lever, API | 5 (add'l at $15/seat) | Priority email 8h | ~30% |

**Billing model:** Dodo Payments (NOT Shopify Billing — Rankora is not a Shopify app). Hosted checkout, subscription. Monthly billing only in v1; annual added v1.1 at 20% off.

**Trial strategy:** Same as Pinzo — Free plan IS the trial. 50 ranks/month is enough to evaluate, not enough to replace Pro for a real recruiter. Self-triggered conversion at month-end cap.

**Currency:** USD primary. EUR + GBP added v1.2 (Dodo supports multi-currency natively; just need pricing-page localization).

---

## 2. Cost Structure (per paid user per month)

Rankora is AI-heavy so cost of goods is materially higher than Pinzo.

### Per-rank cost (the unit cost that drives everything)

A "rank" = one JD-vs-one-resume scoring operation. The real-world cost:

1. **Resume embedding** (OpenAI `text-embedding-3-large`): one call per resume, ~$0.00013 per 1K tokens, avg resume ~800 tokens = **~$0.0001 per resume**
2. **JD embedding** (same model): one call per JD, cached per session, amortized over resumes in the batch = **~$0.00002 per rank**
3. **Scoring + evidence extraction** (GPT-4o-mini for scoring, GPT-4o for evidence quote extraction): ~$0.002 per rank at current 2026 pricing
4. **pgvector query** (Supabase): ~$0.00001 per rank (negligible)
5. **BullMQ worker time** (Railway): ~$0.0003 per rank (worker node amortized)

**Per-rank variable cost: ~$0.0024**

### Per-tier monthly cost

| Line item | Free (50 ranks) | Pro (500 ranks) | Team (avg 2,500 ranks) |
|---|---|---|---|
| AI/ranking variable cost | $0.12 | $1.20 | $6.00 |
| Railway web compute (shared, amortized) | $0.20 | $0.40 | $0.80 |
| Railway Postgres/Redis (shared) | $0.05 | $0.10 | $0.25 |
| Supabase Auth + Storage | $0.03 | $0.06 | $0.12 |
| Resend (transactional) | $0.02 | $0.05 | $0.15 |
| Sentry + PostHog (shared quota) | $0.02 | $0.04 | $0.10 |
| Dodo Payments (2.9% + $0.30 per txn on Pro; waived Team) | $0.00 | $1.14 | $3.17 |
| Support cost (est.) | $0.00 | $0.50 | $1.50 |
| **Total monthly cost** | **$0.44** | **$3.49** | **$12.09** |
| **Gross margin** | — | **$25.51 / 88%** | **$86.91 / 88%** |

**Critical number:** Rankora's gross margins are unusually high for an AI SaaS because the cost model is rank-based, not subscription-based. 88% is industry-leading — but it depends on staying on `gpt-4o-mini` for scoring. If evidence extraction requirements force `gpt-4o` for the primary scoring call, margins drop to ~65%. Ledger must re-run this model if the model mix changes.

**Free tier drag:** $0.44/mo × typical 30:1 free-to-paid ratio = **~$13 drag per paid user** (much higher than Pinzo because AI calls are not free even at 50 ranks/month).

---

## 3. LTV Model

| Metric | Free | Pro | Team |
|---|---|---|---|
| Monthly churn | N/A | 8% (SMB recruiting churn is high — roles come and go) | 4% (team contracts are stickier) |
| Average lifetime (months) | N/A | 12.5 | 25.0 |
| Gross profit / month | ($0.44) | $25.51 | $86.91 |
| **LTV (gross)** | — | **$319** | **$2,173** |
| **Blended paid LTV** (70/30 Pro/Team) | — | — | **$875** |

**Blended LTV after Free drag:**
- Paid LTV: $875
- Free drag: $0.44 × avg ~6 months on Free before conversion-or-departure = ~$2.64 per Free user
- Free:Paid ratio at mature state: ~30:1
- Free drag per paid user: $2.64 × 30 = **$79**
- **Net blended LTV per paid user:** $875 − $79 = **$796**

**CAC target:**
- Max CAC: $796 / 3 = **$265 per paid user**
- Payback ≤ 6 months: 6 × $45 avg profit = **$270 max** (consistent)

**Rankora's wider CAC ceiling** vs Pinzo's ($265 vs $79) reflects:
1. Higher absolute price points ($29 and $99)
2. Stickier Team tier
3. Higher gross margin
4. But: higher free-tier drag per user

---

## 4. Distribution Strategy (Echo's constraint)

Rankora has no Shopify App Store organic channel. Distribution is fully earned.

| Channel | Target CAC | Volume ceiling | Notes |
|---|---|---|---|
| SEO content (recruiter + ATS keywords) | $40 | 100/mo at mature state | Primary bet. "Resume screening AI", "ATS augmentation", "rank candidates". Zeph owns. |
| Product Hunt launch (one-shot) | $0 | ~500 signups / 20 paid | Day 0 only. Echo owns. |
| Recruiter community (Slack groups, LinkedIn) | $50 | 30/mo | Organic posts + founder presence. |
| Direct outreach to hiring managers | $100 | 10/mo | High-touch. Sales-assisted. |
| Paid ads (LinkedIn, Google Ads) | $200 | 50/mo | Only if organic <30/mo after 60 days. Cap bid at $200/install. |
| Partnerships (ATS integrations, recruiter tools) | $120 | 20/mo | v1.2 after Greenhouse/Lever export proves demand. |

**Blended CAC target for v1:** ~$80 (heavily SEO-weighted). Keeps payback under 3 months.

---

## 5. Break-Even Math

**Fixed costs:**
- OpenAI account minimum (negligible at Rankora scale)
- Railway baseline: ~$30/mo (Next app + worker + Redis)
- Supabase paid tier: ~$25/mo at moderate scale
- Dodo account: $0 base
- Sentry + PostHog baseline: ~$20/mo
- Domain + SSL + misc: ~$5/mo
- **Total fixed monthly overhead: ~$80**

**Break-even paid users:** 80 / (~$45 blended profit/paid-user) = **~2 paid users/month ongoing** to cover overhead.

**90-day goal (post-cutover, so Aug 2026):** 30 paid users → ~$1,350/mo gross profit → $1,270 net.
**365-day goal:** 300 paid users → ~$13,500/mo → ~$160K ARR → Rankora becomes a top-3 Boldteq product.

---

## 6. Pricing Page Rules (for Quill)

1. **Evidence is the hero, not the price.** The sample-ranking permalink from the brand kit (§6) is embedded in the pricing page above the tier grid. Merchants see the product before the price.
2. **Anchor to Pro.** Pro is the target plan for ~70% of paid users. Visually emphasize Pro (slightly larger card, accent border). This IS a "most popular" badge but design-led not label-led.
3. **Numeric caps only.** No "unlimited" asterisks. If Team is unlimited, say "unlimited". No caveats.
4. **Show the Free plan, but position it as "try before you commit" not "the product".** Free is funnel, not product.
5. **No "contact sales" tier.** Everything self-serve. Enterprise ping goes to Echo's inbox and becomes a 1:1 conversation.
6. **No "AI credits" language.** Rank count is the only metered thing. "500 ranks/month" not "500 credits".
7. **FAQ:** Exactly four questions — cancellation, refund, data retention, GDPR/PII handling. Legal baseline templates (Tier 3) supply the refund and data retention language verbatim.

---

## 7. Kill Criteria (Verdict inputs)

**Day 30 (post-cutover, so ~2026-06-19):**
- KILL if: <5 paid users AND zero feature request clustering AND sample-ranking page bounce >90%
- PIVOT if: 5–15 paid users AND feature requests cluster on a specific use case (e.g., "I want this but for sales SDRs, not recruiters")
- SCALE if: 15+ paid users AND one working acquisition channel (SEO or PH) proven

**Day 90 (~2026-08-19):**
- KILL if: <40 paid users AND LTV:CAC <2 AND Pro churn >12%
- SCALE if: 100+ paid users AND LTV:CAC >3.5 AND Team tier >20% of paid mix (signals stickiness)

Verdict loads these exact thresholds. Inputs to the decision come from Orbit's north-star dashboard (Tier 2 #5 artifact, next file).

---

## 8. Model Risk Register (the things that break this model)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenAI raises GPT-4o-mini pricing 2x | Medium | Margins drop to ~70% at Pro, still healthy | Add optional Anthropic Haiku path, route half of ranks |
| Free-to-paid conversion <1% | Medium | Free tier becomes a money pit | Tighten Free to 25 ranks/mo, add upgrade prompts at rank 40 |
| Recruiters find Rankora bias-unsafe under EU AI Act | Low | Brand + legal blowup | Brand kit §8 already hard-codes "augment, don't replace" — Sage blocks anything else |
| Supabase pgvector HNSW perf regresses at 100K+ resumes | Medium | Query latency spikes, support load rises | Move embeddings to dedicated pgvector service or Pinecone post 50K users |
| Greenhouse/Lever deprecate their integration API | Low | Lose Team tier moat | Add Workable, SmartRecruiters; build generic CSV-with-metadata format |

Ledger re-runs the model when any of these trigger.

---

## 9. Version Log

- **v1 — 2026-04-11** — First pricing + LTV model for Rankora, anchored to rebuild tier list in `rankora-nextjs-rebuild.md`. Numbers are priors; Ledger recalibrates at Day 30 post-cutover (2026-06-19) with real data.
