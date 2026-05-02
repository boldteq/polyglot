# Universal Smart Defaults & Autonomous Decision Framework

**Loaded by:** ALL 21 agents
**Purpose:** When specs are incomplete, agents fill sensible defaults from SaaS best practices, document assumptions, and keep building — never block on missing details.

---

## Core Rule

**Fill defaults, note assumptions, continue building. NEVER stop to ask Yash for missing details unless it's a billing/payment decision with real money impact.**

---

## Decision Authority Matrix

| Decision Type | Agent Decides Autonomously | Example |
|---|---|---|
| **Tech choices** (cache TTL, log retention, retry count) | YES — use industry defaults | Cache: 5min user data, 1hr static. Logs: 30 days. Retries: 3 with exponential backoff |
| **UI/UX patterns** (layout, spacing, component choice) | YES — follow design system | Use Card for content blocks, Sheet for forms, Dialog only for confirmations |
| **Auth flow** (session duration, refresh strategy) | YES — use Supabase defaults | Session: 1hr, refresh: 7 days, redirect to /auth on 401 |
| **Error handling** (toast vs inline, retry vs fail) | YES — toast for async, inline for forms | Toast for API errors, inline for validation, retry for network |
| **Database** (indexes, RLS policies, column types) | YES — follow stack patterns | Index all foreign keys, RLS on every table, UUID primary keys |
| **Pricing model** (tier structure, limits) | NOTE ASSUMPTION but proceed | Default: Free/Pro/Enterprise 3-tier. Note: "Assumed 3-tier SaaS pricing — Yash to confirm" |
| **Payment integration** (which provider, flow) | YES for Stack A (Dodo), YES for Stack B (Shopify Billing) | Stack determines provider — no decision needed |
| **Brand/copy tone** | YES — use Boldteq voice | Confident, clear, conversion-focused. Outcomes not features. Plain language. No hype. |

---

## Smart Defaults by Domain

### Architecture (Arya defaults)
- **Auth:** Supabase Auth (JWT, email+password, magic link)
- **Database:** PostgreSQL via Supabase, RLS enabled, UUID PKs
- **Cache:** React Query (staleTime: 5min), no Redis unless real-time needed
- **File storage:** Supabase Storage, 10MB max per file
- **Background jobs:** Supabase Edge Functions (cron via pg_cron)
- **Email:** Resend for transactional, no marketing email by default
- **Analytics:** Vercel Analytics + PostHog (if feature flags needed)
- **Error tracking:** Sentry with source maps

### Design (Vega defaults)
- **Spacing scale:** 4px base (4, 8, 12, 16, 24, 32, 48, 64)
- **Font:** System font stack (Inter for headings if custom needed)
- **Colors:** shadcn/ui default theme, extend with brand colors
- **Breakpoints:** sm:640, md:768, lg:1024, xl:1280 (Tailwind defaults)
- **Dark mode:** Support by default, use CSS variables
- **Animations:** 150ms for micro, 300ms for transitions, prefers-reduced-motion respected
- **Component library:** shadcn/ui exclusively, no mixing with other UI libs

### Copy (Quill defaults — Boldteq Voice)
- **Tone:** Confident, clear, conversion-focused
- **Pattern:** Outcomes not features. "Save 10 hours/week" not "Automated workflow engine"
- **Headlines:** Max 8 words, active voice, specific numbers
- **CTAs:** Direct action verbs: "Start ranking", "Get started free", "See pricing"
- **Avoid:** Hype words (revolutionary, game-changing), passive voice, vague claims
- **Reading level:** Grade 8 or below (Flesch-Kincaid)

### Deployment (Bolt defaults)
- **Platform:** Vercel for Next.js, Railway for backend services
- **CI/CD:** GitHub Actions, auto-deploy on merge to main
- **Env vars:** .env.local for dev, Vercel/Railway dashboard for prod
- **SSL:** Automatic via platform (never self-managed)
- **Domain:** Vercel handles DNS, custom domain from day 1

---

## Assumption Documentation Format

When an agent fills a default, it MUST document it:

```markdown
<!-- ASSUMPTION: [Agent] assumed [X] because [Y]. Yash to confirm if needed. -->
```

In handoff documents:
```markdown
### Assumptions Made
| Decision | Default Chosen | Reasoning | Confirm? |
|---|---|---|---|
| Auth provider | Supabase Auth | Stack A default, proven pattern | No |
| Pricing tiers | 3-tier (Free/Pro/Enterprise) | SaaS best practice, not specified in brief | Yes |
| Cache strategy | React Query 5min stale | Standard for dashboard apps | No |
```

---

## Conflict Resolution: Upstream Agent Wins

When two agents disagree, the agent earlier in the pipeline has authority:

```
Yash (Commander) > Arya (Architecture) > Riko (Setup) > Vega (Design) > Koda (Build) > Luna (Test) > Sage (Review) > Bolt (Deploy) > Hawk (Monitor)
```

**Rules:**
1. If Arya specifies Redis → Riko MUST scaffold Redis, even if Riko thinks it's overkill
2. If Vega specifies Sheet component → Koda MUST use Sheet, not Dialog
3. If Sage flags a security issue → Koda MUST fix it before Bolt deploys
4. If upstream agent's spec is ambiguous → downstream agent fills default AND documents it
5. NEVER silently override an upstream agent's decision — document why if you deviate

**Exception:** Specialist override — if Sage finds a P0 security vulnerability that Arya's architecture introduced, Sage can escalate directly to Yash to override Arya. This is the only case where downstream overrides upstream.
