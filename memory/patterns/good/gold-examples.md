# Gold Examples — First-Output Quality Anchors

**Purpose:** One concrete "this is what excellent looks like" example per agent. Every agent reads its own gold example in the first-load manifest. First output on any new task must meet or exceed this quality bar.
**Locked:** 2026-04-11

---

## Scout — Gold example (idea validation card)

```markdown
## Idea: Size Chart & Fit Recommender for Shopify

**Pain score: 8/10** — Shopify apparel merchants lose 20-30% of revenue to returns, 70% of which are sizing-related. Evidence: Shopify Help Community has 847 threads tagged "sizing returns" in last 12 months; top return reason in 2024 Shopify merchant survey.

**ICP:** Shopify apparel merchants, $500k-$10M GMV, 100-5000 SKUs, primarily DTC fashion brands. Size: ~42,000 stores in Shopify ecosystem matching this profile (BuiltWith).

**Distribution fit: 8/10** — Shopify App Store organic (high-intent search "size chart"), Shopify partner directory, Reddit r/shopify, niche apparel founder communities, SEO on "shopify size chart app".

**Differentiation: 7/10** — Existing apps (Kiwi, Prime AI, Fit Quiz) are either dumb tables or gated behind $199/mo AI tiers. Gap: AI recommender at $29/mo with 1-click brand import.

**Stack fit: 10/10** — Stack B (React Router 7 + Polaris Web Components), known territory.

**Weighted total: 67/80** → GREEN → proceed to Atlas.

DECISION: Advance to Atlas market sizing | REASON: full-autonomy-rules.md §GREEN threshold | REVERSIBLE: yes
```

**Why it's gold:** Specific numbers, cited evidence, scored against rubric, ends with decision log.

---

## Atlas — Gold example (market size output)

```markdown
## Market: Shopify Size Chart Apps

**TAM:** $168M/yr — 42k target merchants × $333/yr average app spend × 12% sizing app adoption ceiling.
Source chain: BuiltWith Shopify filter → Shopify Plus 2024 app spend report → category penetration from Shopify App Store top-100 data.

**SAM:** $48M/yr — English-speaking merchants, apparel category, Shopify plan ≥ Basic.

**SOM (year 1):** $420k ARR — 1,200 paying customers @ $29/mo, 0.3% SAM capture.

**Growth:** Category growing 18% YoY (Shopify ecosystem report 2025).

**Verdict:** Feature-or-product? → **Product**. Standalone value prop, recurring revenue, differentiated moat (AI model trained on merchant-specific returns data).

**Confidence:** Medium-high. Source reliability: 2× Shopify first-party, 1× BuiltWith, 1× bottom-up. No single-source dependency.

DECISION: Product-grade opportunity, Y1 target $420k ARR | REASON: atlas source-chain rubric | REVERSIBLE: yes
```

**Why it's gold:** Triangulated sources, explicit math, confidence label, answers the feature-or-product question explicitly.

---

## Koda — Gold example (API route implementation)

```typescript
// app/api/subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { dodo } from '@/lib/dodo/client';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { rateLimit } from '@/lib/rate-limit';

const CreateSubscriptionSchema = z.object({
  plan: z.enum(['pro', 'team']),
  billing_cycle: z.enum(['monthly', 'yearly']),
});

export async function POST(req: NextRequest) {
  const log = logger.child({ route: 'POST /api/subscriptions' });
  try {
    // 1. Rate limit
    const { success } = await rateLimit.check(req, 'create_subscription', 10);
    if (!success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    // 2. Auth
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 3. Validate
    const body = await req.json();
    const parsed = CreateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 });
    }

    // 4. Business logic
    const { plan, billing_cycle } = parsed.data;
    const checkout = await dodo.checkouts.create({
      customer_email: user.email!,
      product_id: PLAN_TO_DODO_ID[plan][billing_cycle],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?sub=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?sub=cancelled`,
      metadata: { user_id: user.id, plan, billing_cycle },
    });

    // 5. Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'checkout.created',
      metadata: { plan, billing_cycle, checkout_id: checkout.id },
    });

    log.info({ user_id: user.id, checkout_id: checkout.id }, 'checkout created');
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    captureException(err);
    log.error({ err }, 'checkout creation failed');
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
```

**Why it's gold:** Zod validation, auth check, rate limit, structured logging, Sentry capture, audit log, error boundary, no `any`, no magic strings, reversible failure path.

---

## Vega — Gold example (component spec handoff)

```markdown
## Component: PricingCard

**Purpose:** Display one tier on /pricing page. Three instances rendered side-by-side.

**Props**
| name | type | required | default | notes |
|---|---|---|---|---|
| tier | 'free'\|'pro'\|'team' | yes | — | |
| price | number | yes | — | monthly USD |
| features | string[] | yes | — | 5-8 items |
| cta_label | string | yes | — | verb-first, ≤3 words |
| is_featured | boolean | no | false | highlights 'pro' tier |
| on_cta_click | () => void | yes | — | |

**Layout** (Tailwind)
- Container: `rounded-lg border border-neutral-200 bg-white p-8 shadow-sm`
- Featured variant: `border-2 border-black shadow-lg scale-105`
- Spacing: 32px gap between tiers on desktop, stack vertically <768px
- Max width per card: 360px

**Typography**
- Tier name: `text-sm font-medium uppercase tracking-wide text-neutral-500`
- Price: `text-5xl font-bold tabular-nums` with `/mo` suffix at `text-base text-neutral-500`
- Features: `text-sm text-neutral-700` with `Check` lucide icon 16px

**States**
- Default, hover (lift 2px), focus (ring-2 ring-black), loading (skeleton), CTA-disabled (opacity-50)

**Accessibility**
- Card role: `region`, `aria-labelledby` tied to tier name
- CTA: keyboard focusable, min 44×44px tap target
- Contrast: all text ≥4.5:1 against white (verified)

**Motion**
- Hover: `transition-transform duration-150`
- CTA click: no motion, immediate navigation

**Handoff to Koda:** file path `components/marketing/pricing-card.tsx`, use shadcn `Card` primitive as base.
```

**Why it's gold:** Typed props, exact Tailwind classes, explicit states, a11y notes, motion spec, file path for Koda.

---

## Quill — Gold example (landing hero)

```markdown
## Hero (v1)

**H1:** Ship a SaaS every week. Actually.
**Sub:** Boldteq builds production-grade SaaS in days, not months. No templates. No placeholders. Real software you can charge for.
**Primary CTA:** Start building
**Secondary CTA:** See what we've shipped

**Length audit:** H1 7 words / Sub 22 words / CTA 2 words ✓
**Readability:** Grade 6.8 ✓ (target ≤8)
**Forbidden words check:** none present ✓
**Passive voice:** 0% ✓
**Tone:** direct, confident, no hype
```

**Why it's gold:** Hits the voice rubric, verb-first CTAs, no forbidden words, scored against the measurable checklist.

---

## Sage — Gold example (audit finding)

```markdown
## Finding SAGE-2026-04-11-003

**Severity:** Critical
**Category:** Security — RLS bypass risk
**File:** `app/api/workspaces/[id]/members/route.ts`
**Line:** 42

**Issue:**
The GET handler fetches workspace members using the service role client instead of the user-scoped client, bypassing RLS. Any authenticated user could enumerate members of workspaces they don't belong to by guessing workspace IDs.

**Proof:**
\`\`\`typescript
// Line 42 — WRONG: uses service role
const { data } = await supabaseAdmin
  .from('workspace_members')
  .select('*')
  .eq('workspace_id', params.id);
\`\`\`

**Fix:**
\`\`\`typescript
// Use user-scoped client; RLS policy `workspace_members_select` enforces membership
const supabase = await createClient();
const { data, error } = await supabase
  .from('workspace_members')
  .select('*')
  .eq('workspace_id', params.id);
if (error) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
\`\`\`

**Blocker:** YES — cannot ship until fixed.
**Auto-dispatched to Koda:** yes
**Expected fix time:** 10 minutes
```

**Why it's gold:** Severity tagged, file+line exact, proof snippet, fix snippet, blocker flag, auto-dispatch.

---

## Echo — Gold example (launch T-0 timeline)

```markdown
## Launch Day: Tuesday 2026-04-21 — Product Name

**5:30 am PT** — Final smoke test, rollback ready, Sentry dashboard open
**6:00 am PT** — Product Hunt submission goes live (scheduled prior day)
**6:05 am PT** — Tweet thread #1 posted, pinned
**6:10 am PT** — HN Show HN post
**6:15 am PT** — Reddit r/SaaS, r/SideProject posts (staggered)
**6:30 am PT** — Email blast to waitlist (Resend, segment: `launched = false`)
**7:00 am PT** — LinkedIn post (founder account)
**9:00 am PT** — Check PH ranking, reply to first 10 comments personally
**11:00 am PT** — IndieHackers post
**1:00 pm PT** — Twitter update #2 (momentum post with PH ranking)
**4:00 pm PT** — Replies batch, DM outreach to top 20 waitlist
**7:00 pm PT** — Launch recap tweet
**10:00 pm PT** — Stop posting, go to sleep

**Assets needed before T-0:** 60-char tagline, 260-char description, 500-word PH first comment, demo GIF (<8MB), 3 screenshots, founder video (60s, optional).
```

**Why it's gold:** Hour-by-hour, specific assets listed, staggered to avoid spam flags, includes rest.

---

## Verdict — Gold example (D30 scorecard)

```markdown
## Verdict D30: ProductName

| Metric | Weight | Raw | Score/10 | Weighted |
|---|---|---|---|---|
| Revenue ($MRR) | 3 | $412 | 4 | 12 |
| Activation rate | 2 | 38% | 6 | 12 |
| W1 retention | 2.5 | 52% | 7 | 17.5 |
| CAC payback (months) | 2 | 4.2 | 5 | 10 |
| NPS | 1.5 | 22 | 4 | 6 |
| Founder energy (1-10) | 1 | 8 | 8 | 8 |

**Total:** 65.5 / 120
**Threshold:** 50 ≤ score < 85 → **PIVOT**

**Recommendation:** Narrow ICP from "all SaaS founders" to "solo founders building Shopify apps". Three interviews last week all converged on Shopify niche. Drop generic messaging, rewrite landing for Shopify-only.

**Next checkpoint:** D60 with narrowed ICP. Same scorecard. If <50 → KILL. If ≥85 → SCALE.

DECISION: PIVOT to Shopify-only ICP | REASON: verdict rubric + pulse cluster | REVERSIBLE: yes (landing rewrite only)
```

**Why it's gold:** Scored against rubric, clear threshold logic, concrete pivot direction, next checkpoint defined.

---

## How agents use this file

Each agent's first-load manifest references this file. Before producing output, agent re-reads its own section and asks: *"Is my draft as specific, scored, and actionable as the gold example?"* If not, revise before emitting.

Gold examples are updated quarterly by Mira based on the highest-rated actual outputs from the past cycle.
