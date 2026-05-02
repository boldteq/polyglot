# SaaS Growth, Onboarding & Retention Patterns

> **Scope:** Global SaaS patterns — applies to Stack A, all B2B/B2C subscription products
> **Priority:** HIGH — tested patterns that measurably impact revenue and user retention
> **Last Updated:** 2026-04-05
> **Usage Metric:** 0 (initial entry)
> **Knowledge Version:** v1

---

## Quick Reference: Impact of Each Pattern

| Pattern | Metric | Business Impact |
|---------|--------|-----------------|
| Time-to-value < 2 min | Activation rate +25% | Revenue +34% |
| 3-5 item checklist | Completion rate +20-30% | Sustained engagement |
| 3-tier pricing | Conversion rate +1.4x vs 2-tier | Revenue per customer |
| Smart cancellation | Churn reduction | 20-40% of churners saved |
| In-app messages | Retention | +300% vs email-only |
| Segmented email | Revenue per user | +760% vs non-segmented |
| Feature adoption (5+) | Churn rate | 3x lower than 1-feature users |
| DAU > 40% | Churn vs 10% DAU | 67% lower churn |

---

## 1. ONBOARDING FRAMEWORK

### The Time-to-First-Value (TTV) Mandatory Pattern

**Context:** Stack A SaaS products with self-serve signup
**Pattern:** Users must perceive core value in < 2 minutes
**Why:** Users decide to stay/leave in first 2 min session; delayed value = abandonment

**Implementation:**
1. **Simplify signup** — 1-3 fields only (email, name, optional company)
   - Every additional field = -7% completion rate
   - Charm pricing: gather intention after signup, not before

2. **Instant core value** — First screen after login must show meaningful output
   - Example: Resume ranker (example project) shows sample analysis immediately
   - Example: Grammarly analyzes sample text on signup
   - Example: Linear lets user create first task in <30 seconds
   - **Not acceptable:** Blank canvas, settings wizards, tutorial screens

3. **Remove configuration gates** — Never require setup before first use
   - Configuration available in sidebar/settings, not blocking progress
   - Users build value first, then optimize

**Measurement:**
- **Aha moment timing:** Median time from signup to "first win" = target < 2 minutes
- **Activation rate:** % of signups who achieve aha moment by day 7 = target 30-36%
- **Day 1 retention:** % of signups still active day 1 = target 50%+

**Real-world examples:**
- **Slack:** Create first channel + post message = 1-2 minutes
- **Calendly:** Create shareable booking link = 1-3 minutes
- **Linear:** Create first task = <1 minute
- **Notion:** Create first page = 2-5 minutes
- **Figma:** Start designing on blank canvas = 1-2 minutes

**Anti-pattern:** Onboarding checklist appears before user creates anything; multi-screen setup wizard; demo video required to proceed.

---

### Progressive Disclosure Over Front-Loaded Wizards

**Context:** New SaaS users overwhelmed by features
**Pattern:** Start with essential tools only; reveal secondary features contextually as users gain comfort
**Why:** Cognitive overload causes abandonment; feature discovery happens naturally over time

**Implementation:**
1. **Week 0 (Hours 0-24): Activation Phase**
   - Show ONLY the core workflow needed for aha moment
   - Hide advanced/secondary features from navigation
   - Use contextual tooltips at moment of use ("Pro tip: you can also...")

2. **Week 1 (Days 2-7): Feature Adoption Phase**
   - Progressive disclosure: "You've mastered X. Try Y next"
   - Feature announcement modals when new capability is relevant
   - Interactive walkthroughs triggered by user action, not shown upfront

3. **Week 2-4 (Days 8-30): Scaling Phase**
   - Show advanced features as usage patterns emerge
   - Conditional suggestions: "Teams using X report Y benefit; upgrade?"
   - Integrations, bulk actions, custom workflows

**Example Navigation Reveal (Project Management Tool):**
```
Week 0: [Create Task] [My Tasks] [Settings]
Week 1: [Create Task] [My Tasks] [Team Board] [Settings]
Week 2: [Create Task] [My Tasks] [Team Board] [Automations] [Integrations] [Settings]
```

**Metrics:**
- Feature adoption breadth: % of users using 5+ features by day 30 = target 40%+
- Persistent engagement: Day 30 retention = target 50%+

**Anti-pattern:** Overwhelming navigation with 20 sidebar items; mandatory tour of all features; features scattered randomly.

---

### 3-5 Item Onboarding Checklist Pattern

**Context:** Guiding new users through initial setup
**Pattern:** Persistent checklist with 3-5 tasks max; first item = quick win (20-30 sec); skippable items
**Why:** Longer checklists = drop-off; quick wins trigger dopamine; persistence shows progress

**Structure:**
```
□ Create your first [object]  ← Quick win (20-30s, mandatory first)
  Help text: "Takes 30 seconds"

□ [Core feature 1]            ← Essential workflow
  Help text: "Users save X with this"

□ [Core feature 2]            ← Essential workflow
  Help text: "Pairs with first feature"

□ Invite teammates             ← Secondary but high-impact
  Help text: "Unlock team collaboration"
  (Skip option)

□ Customize preferences        ← Non-blocking
  Help text: "Optional; refine anytime"
  (Skip option)
```

**Metric Impacts:**
- 3-item list: 60% completion
- 4-item list: 50% completion
- 5-item list: 40% completion
- 6+ item list: <30% completion (avoid)

**Key Rules:**
1. First item MUST be completable in <30 seconds
2. Items 2-3 are mandatory features; provide skip buttons
3. Items 4-5 are optional; clearly labeled "Skip for now"
4. Progress bar shows % complete (psychological momentum)
5. Persist across sessions (users see progress on return)

**Example First Items (by product type):**
| Product Type | Quick Win | Timing |
|---|---|---|
| Resume ranker | "Analyze a sample resume" | <30s |
| Project mgmt | "Create your first task" | <30s |
| Note-taking | "Create your first note" | <30s |
| Video editing | "Upload your first clip" | <30s |
| Calendar | "Create your first event" | <30s |
| Email tool | "Send your first email" | <30s |

**Anti-pattern:** First item is complex setup; 10+ item list; mandatory all items; no skip buttons.

---

### Persona-Based / Intent Capture Routing

**Context:** Users have different needs (solopreneur vs. team; designer vs. engineer)
**Pattern:** Ask 1-2 high-signal questions at signup; adjust entire onboarding path based on answers
**Why:** Personalized paths improve completion by 38% vs. generic flows

**Implementation:**

**Question Set (2 questions max):**
```
Question 1: "What's your role?"
├─ Designer
├─ Engineer
├─ Product Manager
├─ Solopreneur
└─ Team Lead

Question 2: "How many people will use this?"
├─ Just me (1)
├─ Small team (2-5)
├─ Growing team (6-20)
└─ Enterprise (20+)
```

**Path Customization Examples (Resume Ranker):**
```
[Solopreneur] onboarding:
- Focus: "Save time on resume screening"
- First feature: Single job ranking
- Secondary: Analytics dashboard
- Upgrade trigger: X resumes/month

[Team Lead] onboarding:
- Focus: "Collaborate with hiring team"
- First feature: Shared job workspace
- Secondary: Team invitations
- Upgrade trigger: Team size > 3

[HR Manager] onboarding:
- Focus: "GDPR compliance + audit trails"
- First feature: Candidate data retention
- Secondary: User activity logs
- Upgrade trigger: Regulatory features
```

**Results:**
- Personalized paths: 38% higher completion than generic
- Feature adoption: Earlier discovery of role-specific features
- Upgrade rate: Users find relevant paid tiers faster

**Metrics to Track:**
- Path completion rate by persona
- Feature adoption by persona
- Time-to-upgrade by persona

**Anti-pattern:** Generic onboarding for all users; too many intent questions (3+); questions don't map to actual product paths.

---

### Interactive Walkthroughs > Static Tours

**Context:** Teaching users how to use features
**Pattern:** Step-by-step guides where users PERFORM actions, not just watch; combine tooltips + modals + embedded tutorials
**Why:** Interactive = 8x more effective than passive; users learn by doing

**Implementation:**

**Structure: Interactive Walkthrough (Example: First Ranking Job)**
```
Step 1: Tooltip on "Enter job description" field
        "Paste the job posting here (or describe the role)"
        [User types/pastes]
        → Auto-advance to Step 2

Step 2: Modal on "Upload resumes" section
        "Drop resumes here or click to browse"
        [User uploads file]
        → Auto-advance to Step 3

Step 3: Highlight "Rank resumes" button
        "Click here to start analysis"
        [User clicks]
        → Show loading state + next guide

Step 4: Results appear; spotlight on top candidate
        "Here's your #1 match. Click to see detailed scoring"
        [User clicks to expand]
        → Congratulations modal "You ranked your first job!"
```

**Do's:**
- Combine tooltip + user action + modal confirmation
- Auto-advance when user completes action (no "next" button)
- Show contextual help AT moment of use (not generic)
- Keep each step to single action
- Always include skip option

**Don'ts:**
- Static video tours (users tune out)
- Mandatory walkthroughs (always offer skip)
- Tooltips alone (combine with modals)
- Long multi-step modals (break into guided sequence)

**Effectiveness Metrics:**
- Feature adoption: Guided users adopt feature 8x faster
- Retention: In-app guidance → +300% retention vs. email-only
- Time-to-use: From first login to feature use: target <5 minutes

**Tools/Patterns:**
- Tooltip libraries: Tooltip.js, PopperJS
- Modal libraries: shadcn Dialog, Radix Dialog
- Sequence libraries: Shepherd.js, Driverjs, TourGuide
- **Pattern:** "Stepped sequence" component that orchestrates all three

**Anti-pattern:** Standalone tutorial pages; YouTube video mandatory; passive observation model.

---

## 2. ACTIVATION PATTERNS

### Activation Rate Benchmark: 30-36%

**Context:** SaaS products measuring product-market fit
**Pattern:** Target 30-36% of signups achieving activation (using product to derive ongoing value) by day 7
**Why:** Activation is lagging indicator of viability; impacts revenue by 34% per 25% improvement

**Definition of "Activation" (product-dependent):**
- Resume ranker: User ranked at least 1 job with 2+ resumes
- Project management: User created task + assigned to team member
- Writing tool: User wrote 200+ words in real document
- Calendar tool: User scheduled 1st event + shared booking link
- Figma: User created shape + collaborated with teammate

**Measurement:**
- **Day 1 activation:** % of signups achieving aha moment by day 1 = target 20-30%
- **Day 7 activation:** % of signups achieving full activation by day 7 = target 30-36%
- **Cohort tracking:** Segment by signup source, persona, industry

**By Product Category:**

| Product Type | Activation Event | Benchmark |
|---|---|---|
| Async video (Loom) | Record + share 1st video | 35-40% |
| Scheduling (Calendly) | Create + share booking link | 40-45% |
| Writing (Grammarly) | Analyze 200+ words | 30-35% |
| Collaboration (Figma) | Create 1st design + share | 35-40% |
| Project mgmt (Linear) | Create task + assign | 25-30% |
| Note-taking (Notion) | Create 1st page + share | 30-35% |
| Team chat (Slack) | Post 1st message + @ mention | 20-25% |
| AI tools (GPT wrappers) | Make 1st meaningful query | 15-20% |

**Business Impact:**
- 25% increase in activation = 34% increase in revenue
- 1% improvement in activation = 4-5% improvement in annual revenue (compound)

**Improvement Actions (if below benchmark):**
- Shorten time-to-value (see TTV pattern above)
- Simplify first workflow (remove decision points)
- Add persona-based onboarding (see Persona pattern)
- Introduce first-use incentive (bonus credits, extended trial)

**Anti-pattern:** "Signup" counted as activation; feature adoption without ongoing value.

---

### Week 1 Engagement = 4x Retention at Week 10

**Context:** Predicting long-term retention from early behavior
**Pattern:** Users engaged in week 1 are 4x more likely to remain active at week 10
**Why:** Early engagement is strongest retention signal; habit formation requires momentum

**What Counts as "Week 1 Engagement":**
- ✅ Performed activation event (see above)
- ✅ Used core feature 3+ times
- ✅ Invited teammate / collaborated
- ✅ Completed first meaningful content creation
- ✅ Customized settings / profile

**Measurement:**
Track by cohort week 1 and correlate to week 10:
```
Week 1 Activation: 100 users
├─ Engaged: 35 users
│  └─ Week 10 active: 27 (77% retention)
└─ Not engaged: 65 users
   └─ Week 10 active: 7 (11% retention)
```

**Implication:** Focus all energy on week 1 engagement. Week 2 initiatives have 4x lower ROI.

**Week 1 Engagement Strategy:**
1. **Day 0:** Welcome email + in-app modal (show aha moment)
2. **Day 1-2:** First feature adoption email + in-app walkthrough
3. **Day 3-4:** Success email ("You've accomplished X")
4. **Day 5:** Advanced feature introduction (if applicable)
5. **Day 6-7:** Re-engagement email + usage summary

**Churn Prevention:** Users with zero engagement by day 7 have <10% probability of retention. Consider:
- Win-back email campaign day 7
- Phone outreach for high-value signups
- Churn prediction flag (no engagement = red flag)

**Metrics:**
- Week 1 engagement rate (target: 60-70% of signups)
- Correlation to week 10 retention (target: 4x+ multiple)

**Anti-pattern:** Assuming week 2-4 engagement can recover disengaged week 1 users.

---

## 3. PRICING STRATEGY

### The 3-Tier Structure (1.4x Conversion vs 2-Tier)

**Context:** Pricing page optimization
**Pattern:** 3-tier structure (Starter / Pro / Team) converts 1.4x better than 2-tier; 1.8x better than 4+ tiers
**Why:** Humans default to middle option (center-stage effect); 3 tiers maximize revenue per tier

**Structure Formula:**

```
┌──────────────────────────────────────┐
│ STARTER (Anchor)                     │ ← Sets perception of value
│ $29/mo                               │
│ • 3 seats/users                      │
│ • 10 GB storage                      │
│ • Email support                      │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ PRO (Hero — MOST POPULAR)            │ ← Gets 50-60% of conversions
│ $79/mo                               │
│ ★ RECOMMENDED                        │
│ • Unlimited seats                    │
│ • Unlimited storage                  │
│ • Priority support                   │
│ • Advanced analytics                 │
│ • API access                         │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ TEAM (Decoy)                         │ ← Makes Pro look like best deal
│ $249/mo                              │
│ • Everything in Pro                  │
│ • Dedicated account manager          │
│ • Custom integrations                │
│ • SLA guarantee                      │
│ • Training & onboarding              │
└──────────────────────────────────────┘
```

**Key Design Elements:**

1. **"Most Popular" Badge on Pro tier**
   - Lifts Pro selection by 12-15%
   - Psychological anchor (safe choice)
   - Reduces decision paralysis

2. **Feature Comparison (Visual, Scannable)**
   - Rows: One feature per row
   - Columns: One tier per column
   - Checkmarks obvious; missing features grayed out
   - Avoid heavy tables; use icons where possible

3. **Charm Pricing**
   - $29 (not $30)
   - $79 (not $80)
   - $249 (not $250)
   - Left-digit effect: users perceive as next lower tier

**Conversion Metrics:**
- 2-tier structure: baseline 100%
- 3-tier structure: 140% (40% uplift)
- 4+ tier structure: 55% (45% downlift)

**Pro Tier Targeting:**
- 50-60% of conversions should hit Pro
- Pro MRR > Starter + Team MRR combined
- If not: reprice tiers (middle tier too expensive or under-featured)

**Monthly vs Annual Toggle:**
- Annual discount: 20-30% off monthly
- Show savings: "Save $158/year (17%)"
- Target: 25-35% of customers choose annual (depends on product type)

**Relationships:**
- Builds on: "Charm pricing" pattern below
- Related: "Free trial strategy" (section below)
- Related: "AppSumo lifetime deal strategy" (section 8)

**Anti-pattern:** 2 tiers (leaves money on table); 5+ tiers (decision paralysis); no "Most Popular" badge.

---

### Charm Pricing ($29 Not $30)

**Context:** Price perception psychology
**Pattern:** Use .99 or .95 endings; avoid round numbers
**Why:** Left-digit effect — users categorize $29 as "twenties" not "thirties"

**Science:**
- Price ends in 9: Triggers "deal" perception, even if arbitrary
- Round numbers: Felt as premium/expensive
- Psychological difference: $29 vs $30 = 5-8% perception change

**Implementation:**
- Starter: $29/mo (not $30)
- Pro: $79/mo (not $80)
- Team: $249/mo (not $250)
- Annual: $790/year (not $800)

**Edge cases:**
- Premium tier ($999/year): Can use round if positioning as "enterprise"
- Budget tier ($9/mo): $9.95 not $10

**Avoid:**
- Inconsistent endings (mix $29, $49, $100)
- Misleading decimals ($29.99 when annual is $358 not $359.88)

**Metrics:** Conversion lift from charm pricing alone: 2-5% (small but compounds)

**Anti-pattern:** Round numbers; multiple price points ending differently.

---

### Free Trial: 7-Day + Strong Onboarding > 30-Day Lazy

**Context:** Converting free trial users to paid
**Pattern:** 7-day trial with excellent onboarding converts 4-5x better than 30-day trial with no support
**Why:** Urgency drives action; longer trials allow procrastination

**Comparison:**

| Metric | 7-Day Trial | 30-Day Trial |
|---|---|---|
| Time-to-value focus | Intensive | Optional |
| User urgency | High | Low |
| Onboarding quality | Must be excellent | Often neglected |
| Support availability | Required | Often missing |
| Conversion rate | 10-15% | 2-5% |
| Onboarding completion | 70-80% | 30-40% |

**7-Day Trial Strategy:**

**Day 0 (Signup):**
- Quick win checklist (first item)
- Welcome email with success story
- In-app modal: "You have 7 days to explore"

**Day 1-2:**
- Success email: "Here's how others are using this"
- In-app: Feature adoption walkthrough
- Proactive support (chat offer)

**Day 3-4:**
- Feature discovery email (second feature)
- "You've completed X; try Y next" in-app message

**Day 5:**
- Mid-trial check-in email
- Usage summary + comparison to similar users
- Special offer: "Add X more days or upgrade early"

**Day 6-7:**
- Final email: "Your trial ends tomorrow"
- In-app modal: "See what you've achieved"
- Strong CTA: "Upgrade to keep access" (not "Continue")
- Payment form pre-loaded (reduce friction)

**Upgrade Offer:**
- At day 5-6: "Extend trial 3 more days" vs "Upgrade today"
- First month discount: 20-25% off (lower friction)
- "Money-back guarantee" (removes risk)

**Conversion Benchmarks:**
- 7-day onboarding-focused trial: 10-15% conversion
- 30-day minimal support trial: 2-5% conversion
- With money-back guarantee: +15-25% lift

**Payment Handling:**
- Store payment method upfront (no surprise charge)
- Clear messaging: "We'll charge $X on [date]"
- Easy downgrade after trial (prevent refund requests)

**Metrics:**
- Trial signup to paid conversion: target 10-15%
- Trial completion rate: target 60%+
- Days until upgrade (median): target day 4-5

**Anti-pattern:** 30-day trial with no onboarding support; charging without notice; no discount for upgrade.

---

### Free Trial Converts 4-5x Better Than Freemium

**Context:** Comparing monetization models
**Pattern:** Free trial (7-day paid trial) = 10-15% conversion; freemium (unlimited free tier) = 2-5% conversion
**Why:** Trial creates urgency; freemium lacks upgrade driver; free users feel entitled

**Comparison:**

| Metric | Free Trial | Freemium |
|---|---|---|
| % signup who try | 100% (paywall before access) | 100% |
| % who reach aha moment | 70-80% | 30-40% |
| Urgency to upgrade | High (expiring) | Low (can use forever) |
| Support during onboarding | Intensive | Minimal |
| Conversion rate | 10-15% | 2-5% |
| Avg time-to-upgrade | 4-5 days | 60-90 days (if at all) |
| Revenue per signup | $10-20 (faster) | $1-3 (delayed) |

**When Free Trial Works:**
- Complex product requiring onboarding (SaaS tools, project mgmt)
- High-touch features (analytics, collaboration)
- Products where aha moment requires real use (not passive)

**When Freemium Works:**
- Simple, viral products (Slack, Figma)
- Multi-player products (collaboration built-in)
- Products with low support needs
- High volume + low price per user

**Free Trial Structure (see above for detail):**
- 7 days (not 30) with strong onboarding
- Money-back guarantee to remove risk
- Upgrade discount (first month 20-25% off)
- Daily engagement emails (urgency)

**Freemium (if forced to use):**
- Free tier hits natural limits (storage, users, features)
- Upgrade feels like obvious next step, not forced
- Free tier NOT crippled (users should reach aha moment)
- Premium features solve real pain points

**Hybrid Approach (Modern SaaS):**
- 7-day full feature trial (build trust)
- Freemium tier after trial (learning content tier)
- Users who didn't upgrade get downgraded freemium access
- Freemium serves as re-engagement vehicle
- Paid tier unlock only advanced features

**Metrics:**
- Trial conversion: 10-15%
- Freemium conversion: 2-5%
- If using hybrid: measure trial → freemium → paid funnel

**Relationships:**
- Builds on: "Time-to-value" pattern
- Related: "Activation patterns"
- Related: "Smart cancellation" (handles freemium churn)

**Anti-pattern:** 30-day trial without support; freemium users get worse product than paid (they'll never convert).

---

### Transparent Pricing (No Hidden Fees) = +15-25% Conversion

**Context:** Pricing page psychology
**Pattern:** Be fully transparent — no hidden fees, no surprise charges, clear feature comparison
**Why:** Hidden fees create trust deficit; transparency removes objection

**Transparency Checklist:**
- ✅ All costs listed upfront (base price + common add-ons)
- ✅ No "contact sales" for standard features
- ✅ Payment frequency clear (monthly/annual, not both confusing)
- ✅ Free trial start/end date clear
- ✅ Clear card charge communication ("We'll charge $X on Oct 15")
- ✅ Feature comparison searchable/filterable
- ✅ FAQ answers common objections ("Can I downgrade?", "Refund policy?")
- ✅ Security/compliance badges visible ("SOC 2", "GDPR", "HIPAA")
- ✅ Money-back guarantee or easy downgrade
- ✅ Live chat support visible on pricing page

**What Kills Conversions:**
- "Contact us" pricing (opacity = distrust)
- Hidden setup fees
- Per-seat pricing that's unclear
- Features grayed out without explanation
- Annual pricing that's not month-by-month equivalent
- Security badges missing
- Support response time unknown

**Conversion Impact:**
- Transparent pricing: baseline 100%
- Hidden fees revealed later: -20-25%
- Transparency improvements alone: +15-25%

**Example (Resume Ranker):**
```
Pro Plan: $79/month
What's included:
• 10 concurrent job rankings per month
• 100 resumes per job
• Team of up to 5
• Advanced analytics
• Email support (24-48h response)
• Money-back guarantee: 30 days

There are no hidden fees. What you see is what you pay.

Extras (if needed):
• Additional 10 rankings: +$29/month
• Additional storage: +$9/month per 100GB

Need a custom plan?
[Chat with sales]
```

**Payment Integrity:**
- Never charge before 48-hour notice
- Always show charge date in signup
- Offer multiple payment methods
- Support easy refunds (don't make it a game)

**Metrics:**
- Pricing page bounce rate: target <40%
- FAQ click rate: target 15-25%
- Conversion rate: transparent pricing +15-25% vs opaque

**Anti-pattern:** "Contact sales" for standard features; hidden setup/monthly fees; unclear feature tiers; no refund policy.

---

## 4. RETENTION & CHURN PREVENTION

### Churn Rate Benchmarks

**Context:** Evaluating product health
**Pattern:** Excellent SaaS: 3-7% annual; Average: 10-14%; Poor: 20%+
**Why:** Churn compounds negatively; 5% reduction = 25-95% profit increase

**By Market Segment:**

| Segment | Excellent | Average | Poor |
|---|---|---|---|
| Enterprise | 1% annual | 3-5% | 10%+ |
| Mid-market | 3% annual | 8-12% | 20%+ |
| SMB | 5% annual | 12-18% | 25%+ |
| Self-serve | 7% annual | 14-20% | 30%+ |

**Monthly Equivalent (apply monthly churn to 12 months):**
- 5% annual ≈ 0.4% monthly
- 10% annual ≈ 0.8% monthly
- 20% annual ≈ 1.7% monthly

**Business Impact (Assuming $10K MRR, 40% CAC, 24-month payback):**
- 5% monthly churn: $8,900 MRR end of year (50% shrinkage)
- 10% monthly churn: $3,100 MRR end of year (70% shrinkage)
- 15% monthly churn: $900 MRR end of year (91% shrinkage)

**Profit Impact (5% churn reduction):**
- Small SaaS (<$100K MRR): +25-35% profit increase
- Mid-market ($100K-$1M MRR): +50-75% profit increase
- Large SaaS (>$1M MRR): +95% profit increase (compounds)

**Measurement:**
- Track month-by-month cohort retention
- Segment by: acquisition channel, persona, feature adoption, support history
- Calculate LTV from churn: LTV = ARPU / monthly churn rate

**Goals:**
- Reduce churn by 1% = worth 3-5 months of new sales effort
- Every 5% reduction cascades to 25-95% profit improvement

**Relationships:**
- Builds on: "Activation patterns" (week 1 engagement prevents churn)
- Related: "Feature adoption mechanics" (5+ features = 3x lower churn)
- Related: "Smart cancellation flow" (saves 20-40% of churners)

**Anti-pattern:** Accepting 20%+ churn as "normal"; not segmenting churn by cohort; not measuring by month.

---

### Feature Adoption: 5+ Features = 3x Lower Churn

**Context:** Retaining users long-term
**Pattern:** Users who adopt 5+ different features have 1/3 churn rate of single-feature users
**Why:** Switching costs increase with adoption breadth; product becomes integral

**Measurement:**
- Feature breadth: Count # of distinct features user interacted with
- Cohort analysis: Segment users by feature count → measure retention

**Example (Resume Ranker):**
```
Feature breadth tracking:
- 1 feature (job ranking only): 8% monthly churn
- 2 features (ranking + results analysis): 5% monthly churn
- 3 features (+ team collaboration): 3% monthly churn
- 4 features (+ email ingestion): 2% monthly churn
- 5+ features (all tools): 0.7% monthly churn
```

**Adoption Strategy:**

1. **Week 1-2: Activation focus**
   - Guide user to 1st feature thoroughly
   - Celebrate completion

2. **Week 3-4: Secondary feature discovery**
   - In-app suggestion: "You've mastered X; try Y"
   - Feature announcement email
   - Contextual tooltip when user is ready

3. **Month 2-3: Feature expansion**
   - Usage dashboard: "You're using 2 features; try 3 others"
   - Educational content (webinar, blog post)
   - Interactive walkthroughs for new features

4. **Month 3+: Advanced features**
   - Automation, integrations, advanced analytics
   - Personalized recommendations based on usage

**In-App Feature Discovery Tools:**
- **Tooltips:** Context-specific, non-intrusive, automatic
- **Modals:** Major feature announcements, use sparingly
- **Banners:** Feature availability, low urgency
- **Spotlights:** Draw attention to specific UI element
- **Embedded tutorials:** Step-by-step guidance within workflow

**Effectiveness:**
- Tooltip adoption: 8x faster than email
- In-app messaging: +300% retention vs. email-only
- Feature adoption within days vs. months

**Metrics:**
- % users with 5+ features by day 30: target 40%+
- Feature adoption curve: track # of features per user over time
- Churn rate by feature breadth: 3x difference validates pattern

**Relationships:**
- Builds on: "Interactive walkthroughs" pattern
- Related: "In-app messaging for retention"
- Related: "Habit loop design" (feature adoption drives habit)

**Anti-pattern:** Same feature discovery for all users; feature announcements via email-only; no tracking of adoption breadth.

---

### Smart Cancellation Flow (Saves 20-40% of Churners)

**Context:** Last-ditch retention during churn attempt
**Pattern:** Structured exit flow: survey → conditional offer → follow-up sequence
**Why:** 20-40% of cancellations are recoverable; most products skip this entirely

**Step 1: Exit Survey (Single-select, 5-7 options)**

Trigger: User clicks "Cancel subscription"

```
Modal: "We're sorry to see you go. What's the main reason?"

[ ] Too expensive
[ ] Found a better alternative
[ ] Not using enough
[ ] Missing features
[ ] Poor customer support
[ ] Other

[Cancel] [Submit]
```

**Timing:** Before cancellation is processed (recovery window)
**Incentive:** Optional "extend trial 3 days instead" button

---

**Step 2: Conditional Offer (Based on response)**

**If: "Too expensive"**
```
We understand. How about one of these?

[Pause subscription for 2 months (free)]
→ Reactivate anytime; keep all data

[20% discount for next 3 months]
→ Save $48 on your next quarter

[Downgrade to Starter plan] ($29/mo vs $79/mo)
→ Keep your data; upgrade anytime

[I still want to cancel] → Process cancellation
```
Effectiveness: Pauses save 15-20% alone; discounts save additional 5-10%

---

**If: "Found a better alternative"**
```
We'd love to improve. Quick feedback:

[What product are you switching to?]
[Text input: _______________]

→ Share your feedback (anonymous)
→ Special offer: 6-month freeze + 50% off if you return

[I still want to cancel]
```
Effectiveness: Acknowledgment alone saves 2-3%; return offer saves 5-10%

---

**If: "Not using enough"**
```
Let's help you get more value.

[Schedule 30-min success call] (with support team)
→ Custom recommendations

[View feature guide] (for your use case)
→ Top 5 features for [your role]

[Downgrade to free tier]
→ Access basics anytime

[I still want to cancel]
```
Effectiveness: Success call saves 10-15%; feature guide saves 3-5%

---

**If: "Missing features"**
```
What feature would unlock more value?

[Feature request form]
→ Vote on our roadmap
→ Early access to upcoming features
→ 3-month discount ($99 value)

[I still want to cancel]
```
Effectiveness: Early access saves 5-10%; roadmap visibility saves 2-3%

---

**Step 3: Segmented Post-Cancellation (30-90 day window)**

For users who proceed with cancellation:

**Day 30 (Soft check-in):**
```
Subject: "What you're missing without [Product]"

Hi [Name],

It's been 30 days. Here's what your team has missed:

Your peers in [industry] have:
- Saved [X hours/week] with [feature]
- Improved [metric] by [X%]
- Reduced [pain point] by [X%]

If you want to come back, your data is safe.
[Reactivate] [View feature updates]

—[Support team]
```

**Day 60 (Value reminder + offer):**
```
Subject: "[Special offer] Come back to [Product]"

We've shipped [X new features] your competitors are using:
- [Feature 1]: Solves [your stated pain point]
- [Feature 2]: [Popular request]
- [Feature 3]: [Benefit]

Limited offer: 50% off first month to reactivate
Expires [date]

[Claim offer] [View roadmap]
```

**Day 90 (Final offer if high-value customer):**
```
Subject: "[Name], a special offer just for you"

We miss having [Company] in our community.

Custom offer: [Tailored based on churn reason]
- Was it price? Custom billing plan
- Was it features? Early access to roadmap
- Was it support? Dedicated success manager

Let's talk: [Schedule call]
```

**Segmentation Rules:**
- High-value churners ($500+/month): Personal email from CEO/support
- Low-value churners: Automated 3-email sequence only (preserve deliverability)
- Power users: Priority re-engagement + custom offers
- Trial users: Minimal post-campaign (protect email reputation)

**Effectiveness:**
- Exit survey + conditional offer: Saves 15-30% of churners
- Post-cancellation sequence: Recovers 5-15% additional
- Total: 20-40% of cancellation-intent users retained

**Metrics:**
- Cancellation survey response rate: target 40-60%
- Conditional offer acceptance: target 15-25%
- Win-back conversion (day 30-90): target 5-15%

**Relationships:**
- Builds on: "Pricing strategy" (price was common reason)
- Related: "Feature adoption mechanics" (missing features common reason)
- Related: "Win-back campaigns" (post-cancel recovery)

**Anti-pattern:** No exit survey; generic offer for all churn reasons; no post-cancel follow-up; no segmentation by customer value.

---

### Health Score Tracking (Predict Churn Early)

**Context:** Proactive churn prevention
**Pattern:** Composite health score predicting 30-90 day churn; segment customers into risk tiers; intervene automatically
**Why:** Churn is predictable before it happens; early intervention saves 2x more customers

**Health Score Calculation:**

```
Health Score = (Engagement + Adoption + Support + Payment) / 4

Where:
├─ Engagement (0-25 points)
│  ├─ Daily active users this month: +25 if >10, +15 if >5, +5 if >1
│  ├─ Days since last login: -5 per week inactive
│  └─ Session frequency: +10 if daily, +5 if weekly
│
├─ Adoption (0-25 points)
│  ├─ Feature breadth: +5 per feature used (max 25)
│  ├─ Advanced features used: +10 if yes
│  └─ Collaboration features: +5 if team features used
│
├─ Support (0-25 points)
│  ├─ Support tickets: +25 if 0, +15 if 1-2, +5 if 3+, -10 if complaint
│  ├─ Response satisfaction: -10 if low rating
│  └─ Onboarding completion: +10 if 100%
│
└─ Payment (0-25 points)
   ├─ Payment success: +25 if clean, -15 if failed card
   ├─ Downgrades: -10 per downgrade
   └─ Billing inquiries: -5 per inquiry
```

**Risk Tiers:**

| Score | Tier | Risk Level | Action |
|---|---|---|---|
| 80-100 | Green | Low risk | Standard engagement |
| 60-79 | Yellow | Medium risk | Proactive check-in |
| 40-59 | Orange | High risk | Success team outreach |
| <40 | Red | Critical risk | Immediate intervention |

**Automated Interventions:**

**Green (80-100): Low Risk**
- Weekly product tips email
- Feature announcement emails
- Upsell opportunities

**Yellow (60-79): Medium Risk**
- In-app message: "Here's what's possible" (feature discovery)
- Email: "You've adopted X; try Y next"
- Skip if user just downgraded

**Orange (40-59): High Risk**
- Proactive outreach (support team email)
- Subject: "Quick question: How are things going?"
- Offer: "Free 30-min success call"
- Educational content (case study matching their use case)

**Red (<40): Critical Risk**
- **Immediate:** Success team phone call (if available)
- Escalate to account manager (if enterprise)
- Custom offer based on health score drivers
- 48-hour response SLA

**Recalculation:** Weekly (or daily for paid tier 2+)

**Metrics:**
- Accuracy: % of high-risk score customers who actually churn by day 90 = target 70-85%
- Intervention effectiveness: Churn reduction from action = target 20-30%
- False positive rate: High-risk score but high retention = acceptable 15-20%

**Implementation:**
- Dashboard: Real-time health by customer
- Alerts: Trigger when score drops 20+ points
- Actions: Automated workflows per tier
- Reporting: Weekly dashboard showing at-risk cohort

**Relationships:**
- Builds on: "Feature adoption mechanics"
- Related: "Smart cancellation flow" (catchall for failures)
- Related: "Success team playbook"

**Anti-pattern:** Single metric for churn (e.g., login frequency only); no action threshold; no team follow-up.

---

## 5. EMAIL SEQUENCES & CAMPAIGNS

### Welcome Sequence: 5 Emails, Days 0-14

**Context:** Converting new signups into active users
**Pattern:** Structured 5-email sequence over 14 days; optimal spacing 2-3 days
**Why:** Automation + segmentation lift opens 84%, clicks 341%, conversions 2,270%

**Email 1: Instant Welcome (Within 5 minutes)**

```
Subject: "Welcome to [Product], [Name]! 🎉"

Hi [Name],

You're all set. Here's what happens next:

1. Get started in 3 minutes
   → [Quick start video] or [Interactive guide]

2. See results in your first session
   → [Success story: how users got value]

3. Join 10,000+ [role]s using [Product]
   → [Social proof stats]

Get started now:
[Open dashboard]

Any questions? We're here:
support@[company].com

Welcome to the community!
—[CEO Name]
```

**Metrics:**
- Open rate: target 60-70%
- Click rate: target 25-35%
- CTA click: [Open dashboard] = target 30-40% of opens

---

**Email 2: Case Study / Social Proof (Day 1-2)**

Trigger: User opened Email 1 OR 24 hours since signup

```
Subject: "How [Company Name] saved [metric] with [Product]"

Hi [Name],

Check out how [similar company] got [X result]:

[Case Study thumbnail]

"We went from [old process] to [new process].
It took 30 minutes to set up and saved us 10 hours/week."
— [Customer name], [Company]

They used these features:
• [Feature 1]
• [Feature 2]
• [Feature 3]

Start your own success story:
[View case study]

—[Support team]
```

**Metrics:**
- Open rate: target 45-55%
- Click-through: target 15-25%
- Case study reads: target 20-30% of clicks

---

**Email 3: Educational Content (Day 5)**

Trigger: Day 5 since signup

```
Subject: "Your 5-minute guide to [core feature]"

Hi [Name],

You signed up 5 days ago. Here's what the most successful users do:

[Feature guide thumbnail]

Inside:
✓ Setup in 30 seconds (you might already be doing this!)
✓ Pro tips for 2x faster results
✓ Common mistakes to avoid

[Download guide]

Or watch the 3-minute video:
[Play video]

Have questions? Hit reply, we're here.

—[Support team]
```

**Metrics:**
- Open rate: target 40-50%
- Click rate: target 12-20%
- Guide download: target 15-25% of opens

---

**Email 4: Objection Handling (Day 7)**

Trigger: Day 7 since signup

```
Subject: "Quick question: How's [Product] treating you?"

Hi [Name],

You're 1 week in. I wanted to check in:

[Feature I might be missing?]
[Is it doing what you expected?]
[Any blockers?]

Common questions I hear:
• "How do I [task]?" → [Link to FAQ]
• "Can I [capability]?" → [Link to docs]
• "Does it work with [integration]?" → [Link to integrations]

I'm here if you need anything:
[Schedule 15-min call]

—[Support team]
```

**Metrics:**
- Open rate: target 35-45%
- Reply rate: target 3-5% (most valuable metric)
- Call schedule: target 1-2% (high-value leads)

---

**Email 5: Urgency / Upgrade Push (Day 10)**

Trigger: Day 10 since signup

```
Subject: "[Name], special offer inside 🎁"

Hi [Name],

Your trial is wrapping up. Before it does, we want to make sure you
understand what you're unlocking with a paid subscription:

✓ [Feature A] — [Benefit]
✓ [Feature B] — [Benefit]
✓ [Feature C] — [Benefit]

First month: 20% off
That's only $[discounted price] instead of $[full price]

[Upgrade now]

Not ready? [Extend trial 3 days]

—[CEO Name]
```

**Metrics:**
- Open rate: target 50-60% (urgency increases opens)
- Click rate: target 20-30%
- Upgrade conversion: target 5-10% of recipients

**Sequence-Level Metrics:**
- Unsubscribe rate: target <1% per email (<5% total)
- Spam complaint rate: target <0.1%
- Overall conversion (signup → paid): target 10-15% of sequence
- Revenue per email sent: $X calculation shows ROI

**Spacing Rules:**
- Email 1 → Email 2: 24 hours (don't delay first follow-up)
- Email 2 → Email 3: 3 days (allow time for case study reading)
- Email 3 → Email 4: 2 days (day 7 check-in)
- Email 4 → Email 5: 3 days (day 10 urgency push)
- **Rule:** 2-3 day spacing cuts unsubscribes by 20% vs daily

**Personalization Variables:**
- [Name] — first name of user
- [Role] — their signup role
- [Company] — their company name
- [Feature X] — features they viewed/used
- [Use case] — persona-based case study matching

**Segmentation (by persona):**
- Send Email 3 case study matching their role
- Adjust Email 4 objections by use case
- Adjust Email 5 copy by feature adoption

**Relationships:**
- Builds on: "Onboarding framework"
- Related: "Drip campaigns" (ongoing engagement)
- Related: "Re-engagement sequences" (inactive users)

**Anti-pattern:** Emailing every day; missing segment variation; no unsubscribe option; copy is generic.

---

### Segmentation: +760% Revenue Lift

**Context:** Email campaign effectiveness
**Pattern:** Segmented campaigns outperform non-segmented 760% in revenue
**Why:** Personalized messages convert 14.31% higher open rate + higher CTR

**Segmentation Dimensions:**

**1. By User Stage:**
- Trial (days 1-7) → Onboarding focus
- Active free user (week 2-4) → Feature adoption
- Approaching trial end (day 5-6) → Upgrade urgency
- Paid customer (month 2+) → Expansion/features
- At-risk/inactive → Win-back

**2. By Feature Adoption:**
- 0 features → Email 1 walkthroughs (basic)
- 1-2 features → Email 2 adjacent features
- 3-5 features → Email 3 advanced features
- 5+ features → Email 4 expansion/integrations

**3. By Use Case / Persona:**
- By role: Manager vs. individual contributor
- By team size: Solo vs. small team vs. enterprise
- By industry: Tech vs. finance vs. healthcare
- By use case: Time tracking vs. team management vs. reporting

**4. By Engagement Level:**
- High engagement (daily active) → Best practice emails, case studies
- Medium engagement (weekly) → Feature tips, invitations
- Low engagement (inactive) → Re-engagement sequence

**5. By Company Size:**
- Solo: Emphasize individual productivity
- Small team (2-5): Emphasize collaboration
- Growing team (6-20): Team management, admin features
- Enterprise (20+): Advanced controls, integrations, SOC 2 compliance

**Example: Welcome Sequence Segmentation**

**Segment: Developer (Tech company, 3 people)**
```
Email 2 case study: "How [Tech Dev Shop] scaled with [Product]"
Email 3 guide: "API integrations for developers"
Email 4 objection: "Can I automate with Zapier?" → [Link to integration]
Email 5 offer: "20% off developer plans"
```

**Segment: Manager (Finance, 15 people)**
```
Email 2 case study: "How [Finance Team] improved reporting accuracy"
Email 3 guide: "Team reporting and insights"
Email 4 objection: "Can I manage permissions?" → [Link to admin docs]
Email 5 offer: "20% off team plans"
```

**Segment: Solo (Freelance, 1 person)**
```
Email 2 case study: "How [Freelancer] landed bigger clients with [Product]"
Email 3 guide: "Solo productivity hacks"
Email 4 objection: "Does it have [feature] for freelancers?" → [Link to features]
Email 5 offer: "20% off (forever on annual)"
```

**Segmentation Implementation:**

| Tool | Method | Complexity |
|---|---|---|
| Mailchimp | Conditional content | Low |
| Klaviyo | Flow builder + tags | Medium |
| HubSpot | Workflows + properties | Medium |
| Custom (Node.js) | Handlebars templates + DB query | High |

**Metric Impact:**
- Open rate: +14.31% (segmented vs. non-segmented)
- Click rate: +21% (segmented vs. non-segmented)
- Revenue per email: +760% (segmented campaigns)
- Unsubscribe rate: -15% (relevant content reduces churn)

**Timing Optimization:**
- Track open times by segment
- Send time optimization: Send to each user's peak open time
- Day of week: Test Tuesday (industry standard); adjust by segment

**Relationships:**
- Builds on: "Welcome sequence" pattern
- Related: "Drip campaigns" (ongoing segmentation)
- Related: "Automation" (enables at scale)

**Anti-pattern:** Blanket email to all users; no personalization; same message to all personas.

---

## 6. PRODUCT-LED GROWTH (PLG) & VIRAL MECHANICS

### Viral Loop: Collaboration Built Into Product

**Context:** Building exponential growth into product
**Pattern:** Products where multi-user collaboration is required have inherent viral loops
**Why:** Every shared artifact = product exposure; inviter + invitee both using = K > 1

**Viral Coefficient (K-Factor):**
- K < 1: Linear growth (not sustainable)
- K = 1: Steady state
- K > 1: Exponential growth (viral)

**Formula:** K = (# new users acquired per existing user × conversion rate of invites)

**Example:**
```
User creates video
→ Sends to 5 people
→ 2 of 5 sign up (40% conversion)
→ K = 5 × 0.4 = 2.0 (exponential growth)
```

**Products with Inherent Virality (K > 1):**

| Product | Viral Mechanism | K Factor | Growth Rate |
|---|---|---|---|
| Slack | Invite teammates (required) | 1.5-2.0 | Doubling every 3-6 months |
| Calendly | Share booking link | 1.3-1.8 | Doubling every 6-9 months |
| Figma | Collaborate on shared file | 1.2-1.5 | Doubling every 9-12 months |
| Loom | Share recorded video | 1.4-2.0 | Doubling every 3-6 months |
| Notion | Share pages/databases | 1.2-1.4 | Doubling every 9-12 months |

**Design for Virality:**

**1. Make Core Workflow Multi-Player**
- Product must require 2+ users for value
- NOT: Optional team features (add-on)
- YES: Core workflow requires collaboration

**Example (Resume Ranker):**
- ❌ **Not viral:** User analyzes resumes alone
- ✅ **Viral:** User invites hiring team to review results together

**2. Friction-Free Sharing**
- One-click invite (pre-populated email templates)
- Social sharing (Twitter, LinkedIn)
- Referral links (track who invited whom)
- Embedded sharing in core workflow (not extra step)

**3. Incentivized Invites (Optional but Powerful)**
- Referrer: 1 month free per successful referral
- Referee: 2 weeks free upon signup
- Both benefit = faster loop

**4. Clear Invite Timing**
- Ask AFTER aha moment (not immediately)
- Trigger on success event (completed first task)
- Contextual suggestion ("Invite team to see results")

**Example Flow (Figma):**
```
User creates first design
↓
Completion celebration
↓
"Bring your team to collaborate"
↓
One-click invite button → Copy link / Send email
↓
Invitees see custom message: "Jane invited you to collaborate"
↓
Invitees sign up → See shared file immediately
↓
Collaboration starts → Both locked in
```

**Measurement:**

**Viral coefficient by cohort:**
```
Cohort A (Jan): 50 users sign up
├─ 30 invite teammates (60% participation)
├─ Average invites per inviter: 3 people
├─ Signup rate from invites: 35%
└─ K = 3 × 0.35 = 1.05 (weak viral)

Cohort B (Apr): 50 users sign up
├─ 45 invite teammates (90% participation)
├─ Average invites per inviter: 5 people
├─ Signup rate from invites: 40%
└─ K = 5 × 0.4 = 2.0 (strong viral)
```

**Dashboard metrics:**
- Virality rate: # invites sent / # active users
- Invite acceptance rate: # signups from invites / # invites sent
- K-factor: Calculate weekly
- Viral loop payback: Days from signup to receiving referral bonus

**Relationships:**
- Builds on: "Activation patterns" (aha moment before invite)
- Related: "Free tier strategy" (viral needs free to spread)
- Related: "Network effects" (related but different)

**Anti-pattern:** Collaboration is feature, not core; invites require payment; K-factor < 1 (not actually viral).

---

### Free Tier: Sufficient for Aha, Hits Natural Limits

**Context:** Product-led growth monetization
**Pattern:** Free tier must reach aha moment but hit natural ceiling that drives upgrade
**Why:** Users won't upgrade if they haven't seen value; must have clear upgrade path

**Design Principles:**

**1. Free Tier Reaches Aha Moment**
- User completes core workflow to success
- Sees real output/benefit from their input
- Example: Loom records video; Calendly creates booking link; Linear creates task
- NOT: Empty tier where user can't see value

**2. Clear Natural Ceiling**
- Usage ceiling (500 MB storage, 5 projects, 10 API calls/day)
- Feature ceiling (advanced analytics, team features, integrations)
- Collaboration ceiling (view-only, no edit)
- NOT: Arbitrary, unexplained limits

**3. Upgrade Feels Obvious, Not Forced**
- User hits limit during normal workflow (not naggy popup)
- Message at moment of limit: "You've hit 5 projects. Upgrade for unlimited"
- No dark pattern UX (small skip button, large upgrade button)
- YES to: Honest friction that increases value perception

**4. Freemium Conversion Benchmark**
- Free signup → paid conversion: 3-5% baseline (excellent: 6-8%)
- Free usage time before conversion: 30-90 days (median 45)
- Conversion trigger: Usually hitting limit + timely email

**Example Tier Design (Loom):**

```
FREE                        PRO
────────────────────────────────────
Records per month: Unlimited    Unlimited
Video length: Unlimited         Unlimited
Storage: 25 recordings          Unlimited
Resolution: 720p                4K
Team features: None             ✓ Manage team
Sharing: Public only            ✓ Private sharing
Analytics: None                 ✓ View stats
```

**Users hit ceiling:**
- After 25+ videos (hit storage limit)
- Need team collaboration (blocked feature)
- Want private workspace (blocked feature)
- At that moment: upgrade feels obvious

**Freemium Conversion Trigger (Email sequence):**

**Email 1 (At limit):**
```
Subject: "You've recorded 25 videos! 🎬"

Great work. You're using Loom more than 80% of free users.

Upgrade to unlock:
✓ Unlimited recordings
✓ 4K quality
✓ Team features
✓ Analytics

Special offer: First month $10 (normally $25)

[Upgrade]
```

**Email 2 (Day 5 after limit):**
```
Subject: "[Name], see what Pro users are doing"

Your peers are using:
• [Feature 1]: Save X hours weekly
• [Feature 2]: Reduce support tickets by X%
• [Feature 3]: Improve onboarding conversion X%

Ready to unlock these?
[See pricing]
```

**Email 3 (Day 10):**
```
Subject: "Last chance: $10/month offer expires [date]"

This special offer is ending [date].
After that, regular pricing ($25) applies.

[Upgrade now]
```

**Metrics:**
- Free tier users: 80%+ of signups should stay on free for 30+ days
- Limit-hitting rate: 40-60% of free users hit ceiling by day 30
- Conversion on limit: 15-30% of users hitting limit upgrade within 7 days
- Conversion overall: 3-5% free → paid

**Relationships:**
- Builds on: "Viral loops" (free is how they spread)
- Related: "Pricing strategy" (when/how to hit paid
- Related: "Onboarding" (free tier must have aha moment)

**Anti-pattern:** Free tier so limited users can't reach aha moment; no clear ceiling (users downgrade when features appear); no email trigger at limit.

---

## 7. ANTI-PATTERNS (Growth Killers)

### Onboarding Antipatterns

| Pattern | Failure Rate | Why It Fails |
|---|---|---|
| 75% drop week 1 | High | Too much friction in first days |
| 62% dropout from tours | High | Static tours are boring/dismissible |
| Forced configuration | High | Doesn't lead to value |
| 10+ onboarding screens | High | Cognitive overload |
| Mandatory email verification | High | Friction before value |
| Demo video before access | High | Users bounce before watching |

**Prevention Rules:**
- ✅ Aha moment BEFORE configuration
- ✅ Configuration in settings, not blocking
- ✅ Interactive walkthroughs, never static tours
- ✅ <2 min to first value
- ✅ Skip buttons always available
- ✅ Email verification AFTER first win

---

### Pricing Antipatterns

| Pattern | Failure Impact | Prevention |
|---|---|---|
| Charging too little | 70% of SaaS underpriced | Research competitor pricing; 3-tier anchor |
| Hiding fees | -20-25% conversion | Transparent listing of all costs |
| 5+ pricing tiers | Decision paralysis | Max 3 tiers; "Most Popular" badge |
| "Contact sales" for standard | Distrust | Visible pricing for 95% of users |
| No annual discount | -25% annual revenue | 20-30% annual discount always |
| Complex feature comparison | Abandonment | Simple, scannable table |

---

### Performance Antipatterns

| Pattern | Impact | Prevention |
|---|---|---|
| 3s+ page load | -87% conversions | LCP < 2.5s, measure real user metrics |
| Unoptimized images | -60% conversion | WebP, lazy load, responsive images |
| Heavy JavaScript | Slow interaction | Code splitting, defer non-critical JS |
| No skeleton loading | Feels broken | Skeleton matching final layout |

---

### Product Antipatterns

| Pattern | Failure Rate | Prevention |
|---|---|---|
| Feature overload | 50% scope creep | MVP first; features added by user demand |
| Poor onboarding | 75% day-1 churn | Progressive disclosure; quick wins |
| No personalization | 35% higher churn | Capture intent; customize by persona |
| Ignoring user feedback | 40% product-market fit | Exit surveys; feature requests tracked |

---

### Launch Antipatterns

| Pattern | Failure Rate | Why |
|---|---|---|
| Wrong channels | 49% fail | Market validation skipped; wrong audience |
| No onboarding | 62% churn | Users don't see value quickly |
| Unsupported launch | 30% credibility loss | No team ready for launch day |
| Vague messaging | 45% bounce | Users don't understand value prop |

---

## 8. METRICS DASHBOARD

### Weekly Tracking

**Growth Metrics:**
- Signups: Count and trend
- Activation rate: % reaching aha moment by day 7
- Time-to-value: Median minutes to first completion

**Engagement Metrics:**
- Daily active users (DAU)
- Weekly active users (WAU)
- Monthly active users (MAU)
- DAU:MAU ratio (target 0.5+)

**Monetization Metrics:**
- Trial signups: Count
- Free-to-paid conversions: % and $ amount
- MRR: Monthly recurring revenue
- ARPU: Average revenue per user

**Dashboard View:**
```
WEEKLY SNAPSHOT
┌────────────────────────────────┐
│ Signups:        250 (+15%)      │
│ Activation:     32% (target 30%)│
│ DAU:            180 (+8%)       │
│ Conversions:    18 (+22%)       │
│ MRR:            $4,250 (+18%)   │
└────────────────────────────────┘
```

---

### Monthly Tracking

**User Metrics:**
- Total users (cumulative)
- Active users (monthly unique)
- Cohort retention (30-day)
- Feature adoption (avg features per user)

**Revenue Metrics:**
- MRR (recurring) + ARR (annual)
- Churn rate (%)
- Expansion revenue (upgrades + add-ons)
- LTV:CAC ratio

**Quality Metrics:**
- NPS score
- Support response time
- Page speed (LCP, FID, CLS)
- Error rate

**Example Dashboard:**
```
MONTHLY METRICS
┌───────────────────────────────────┐
│ Total Users:            12,500    │
│ Active Users (MAU):      8,200    │
│ 30-Day Retention:        55%      │
│ Monthly Churn:           3.2%     │
│ MRR:                    $18,500   │
│ LTV:CAC:                 3.2:1    │
│ NPS:                      42      │
└───────────────────────────────────┘
```

---

### Quarterly Tracking

**Cohort Analysis:**
- Activation by signup source
- Retention by persona
- LTV by acquisition channel
- Feature adoption trends

**Business Metrics:**
- ARR and growth trajectory
- Payback period (CAC recovery)
- Gross margin
- Customer concentration (top 10 customers % of revenue)

**Trending Insights:**
- Cohort comparison (which months onboard best)
- Churn by reason (exit survey analysis)
- Feature adoption drivers
- Seasonal patterns

---

## 9. RELATIONSHIPS & CROSS-REFERENCES

**Critical Dependencies:**
- Onboarding quality directly impacts: Activation rate, week 1 engagement, churn
- Activation rate directly impacts: Revenue (+34% per 25% lift)
- Feature adoption (5+) directly impacts: Churn rate (3x better)
- Email segmentation directly impacts: Revenue (+760%)
- Free trial (vs freemium) directly impacts: Conversion rate (4-5x)
- Cancellation flow directly impacts: Churn recovery (20-40%)

**Contradiction Resolution:**
- **"Launch with features"** vs **"MVP first"** → Start with MVP, add features post-launch if user-driven
- **"30-day trial"** vs **"7-day trial"** → Use 7-day with strong onboarding (converts 4-5x better)
- **"Personalized onboarding"** vs **"generic onboarding"** → Personalized wins (+38% completion)

**Related Patterns in Memory:**
- See `production-agent-mindset.md` for execution standards
- See `quality-framework.md` for measurement definitions
- See `ui-ux-production-standards.md` for design patterns referenced

---

## 10. IMPLEMENTATION GUIDE FOR AGENTS

### For Quill (Copy)
- Welcome sequence: Use templates from Section 5
- Charm pricing: $X.99 not $X.00
- CTA copy: Action-oriented ("Start free trial" not "Submit")
- Exit survey: 5-7 simple options, empathetic tone

### For Koda (Implementation)
- Checklist component: Persistent, 3-5 items, skip buttons
- Onboarding flows: Progressive disclosure; skip options
- Feature discovery: Tooltips + modals combination
- Health score: Composite calculation; risk tiers
- Email triggers: Automation on signup, day 7, limit-hit

### For Vega (Design)
- Pricing page: 3-tier structure; "Most Popular" badge
- Onboarding: Interactive walkthroughs with highlighting
- Cancellation flow: Modal survey → conditional offers
- Loading states: Skeleton matching final layout

### For Zeph (SEO/Growth)
- Pricing page: Unique meta tags; schema markup
- Sign-up flows: Optimized CTR, form field count
- Landing pages: Social proof, testimonials, trust signals

### For Luna (Testing)
- Onboarding flow tests: Measure time-to-aha
- Activation milestone tests: Day 1, day 7 checks
- Cancellation flow: Exit survey completion
- Feature adoption: Tracking breadth and frequency

---

## Summary

**Golden Rules:**
1. **Time-to-value: < 2 minutes** (or lose 75% at signup)
2. **Activation by day 7: 30-36%** (lagging indicator of fit)
3. **Feature adoption: 5+ features = 3x lower churn**
4. **Email segmentation: +760% revenue per user**
5. **Pricing: 3-tier with "Most Popular" badge** (1.4x conversion)
6. **Cancellation flow: Save 20-40% of churners**
7. **Feature adoption email: 8x > push notifications**
8. **Free trial: 7-day + support > 30-day lazy** (4-5x conversion)

**Measurement Mentality:**
- Track weekly: Signups, activation, DAU, conversions
- Track monthly: Retention cohorts, churn, feature adoption, NPS
- Track quarterly: LTV:CAC, payback period, cohort analysis

**Implementation Order:**
1. Fix time-to-value (foundation)
2. Implement welcome sequence (days 0-14)
3. Build onboarding checklist (3-5 items)
4. Launch pricing optimization (3-tier)
5. Add cancellation flow (saves 20-40%)
6. Enable email segmentation (760% lift)
7. Implement feature adoption mechanics (8x more effective)

---

**Source:** SaaS Growth Patterns Research (2026-04-05)
**Knowledge Version:** v1
**Usage Metric:** 0 (initial entry)
**Last Reviewed:** 2026-04-05
