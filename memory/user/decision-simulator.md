---
name: Yash Decision Simulator
description: Predict what Yash would decide without asking. Load before any decision point to replace "ask the user" with "simulate the user".
type: user
priority: critical
created: 2026-04-11
---

# Yash Decision Simulator

> Purpose: eliminate 90% of "ask user" friction. When an agent hits a decision point, check this file FIRST. Only escalate if the decision falls outside documented patterns.

---

## Core decision principles (apply to every choice)

1. **Default to action.** When in doubt, ship the more ambitious version and iterate.
2. **Premium > acceptable.** Never ship anything that looks like a template.
3. **Competitive intelligence over guessing.** Before building, check what 3 winners in the category did.
4. **Complexity as moat.** Harder-to-build = harder-to-copy = better long-term position.
5. **Brand-first, then feature.** A polished brand on day 1 beats a feature-rich beta.
6. **Latest stable, never legacy.** No "safe" old versions. Always the newest stable.
7. **Production-grade from v1.** Auth, billing, error boundaries, loading states are non-negotiable on v1.
8. **Speed + quality, not either/or.** Reject the tradeoff. Demand both.

---

## Stack decisions (auto-decided, don't ask)

| Question | Answer | Why |
|----------|--------|-----|
| Which stack for new SaaS? | Stack A (Next 16 + Supabase + Railway + Dodo) | Locked 2026-04-10 |
| Which stack for Shopify app? | Stack B (React Router 7 + Polaris Web Components) | Not Remix |
| Billing provider? | Dodo Payments | Never Stripe for Boldteq products |
| Hosting? | Railway | Never Vercel |
| DB? | Supabase (Postgres + Auth + RLS + Storage) | Never self-hosted, never PlanetScale |
| Package manager? | pnpm 9 | Never npm or yarn |
| CSS? | Tailwind 4 + shadcn/ui | Never CSS modules, never styled-components |
| Router? | App Router only | Never Pages Router |
| Auth library? | @supabase/ssr | Never NextAuth, never Clerk |
| ORM? | None (Supabase client direct) | Never Prisma |
| Email? | Resend + React Email | Never SendGrid |
| Errors? | Sentry | |
| Analytics? | PostHog | |
| Logs? | pino | Never console.log in prod |
| Rate limit? | Upstash Redis sliding window | |
| Jobs? | BullMQ + Railway Redis | Never Inngest, never QStash |
| Tests? | Vitest (unit) + Playwright (E2E) | Never Jest |
| Node? | 20 LTS | |
| TS config? | strict: true, no `any` | |
| Starter template? | boldteq-saas-starter (GitHub template) | Clone for every new project |

---

## Pricing decisions (auto-decided)

| Product type | Pricing model | Defaults |
|-------------|---------------|----------|
| B2B SaaS (most products) | 3-tier | Free / Pro \$29 / Team \$99 (14-day trial, no CC required) |
| AI / usage-heavy | Usage-based | Free 100 credits / \$0.01 per unit / monthly min |
| Shopify app | Shopify Billing API | Free / Basic \$9.99 / Pro \$29.99 |
| Consumer SaaS | Monthly only | Free / Premium \$9.99 |
| Dev tool | Open-core | Free self-host / Cloud \$29 / Enterprise custom |

**Annual discount:** 20% off annual (monthly × 12 × 0.8). Never more.
**Free tier size:** Generous enough to hook, limited enough to force upgrade at power-user level.
**Credit card for trial:** No. Friction > signal.

---

## Design decisions (auto-decided)

| Question | Answer |
|----------|--------|
| Light or dark theme default? | System preference, fallback light |
| Primary color? | Per-brand (ask brand voice skill) — default: indigo-600 |
| Font? | Geist (via next/font) — variable, sans + mono |
| Border radius? | rounded-lg default (8px) |
| Spacing unit? | Tailwind 4-point scale |
| Max content width? | max-w-6xl for app pages, max-w-4xl for marketing |
| Sidebar? | Collapsible, persistent, icon + label |
| Empty states? | Always. Illustration + headline + CTA |
| Loading states? | Skeleton screens, not spinners |
| Errors? | Inline banner + retry button + support link |
| Animations? | Framer Motion sparingly, transition-all banned |
| Icons? | lucide-react only |

---

## Copy decisions (auto-decided)

| Question | Answer |
|----------|--------|
| Tone? | Confident, concise, zero jargon |
| Reading level? | Grade 8 max |
| Passive voice? | Max 10% |
| Forbidden words? | empower, unleash, supercharge, revolutionize, game-changer, leverage, synergy, seamless, robust |
| CTAs? | Verb-first, ≤ 5 words ("Start free trial", never "Your free trial") |
| Headlines? | Outcome-first or pain-twist |
| Founder voice on launch? | Yes, first-person, personal pain story |
| Emoji in UI? | Sparingly, only where semantic |

---

## Feature scope decisions (auto-decided)

**v1 minimum for any SaaS:**
- Auth (email + magic link + Google OAuth)
- Billing (3-tier with Dodo)
- Landing page (hero + features + pricing + footer)
- Dashboard shell (sidebar + topbar)
- Settings (profile + billing + security)
- Email transactional (welcome + magic link + payment events)
- Empty states + loading states + error boundaries on every route
- Mobile responsive
- Lighthouse ≥ 90 on all categories
- RLS on every table
- Sentry + PostHog wired

**NEVER in v1:**
- SSO / SAML
- Custom reporting / exports beyond CSV
- Integrations marketplace
- Mobile app
- API access tier
- Team features unless B2B-only product
- Affiliate program
- White-label

**Add in v2 only after:** ≥ 3 paying users requested the feature unsolicited.

---

## Launch decisions (auto-decided)

| Question | Answer |
|----------|--------|
| Launch day? | Tuesday, 6:00 AM PT |
| Primary channels? | Product Hunt + Hacker News + Indie Hackers + Email list |
| Secondary? | Twitter + LinkedIn (founder voice) |
| Paid ads at launch? | No. Organic only for v1 |
| Hunter on PH? | Self-submit if no 100+ follower hunter available |
| PH category? | Developer Tools (B2B SaaS) / Marketing (growth) / Productivity (workflow) |
| Launch copy? | Echo's template + personal pain story |
| Deploy on launch day? | NEVER. Deploy T-1 or earlier |
| First-comment strategy? | Respond within 15 min for first 6 hours |

---

## Verdict decisions (auto-decided)

- **D30 gate:** Orbit scorecard ≥ 50/120 = continue, < 50 = emergency review
- **D90 gate:** ≥ 85 SCALE, 50-84 PIVOT, < 50 KILL
- **Kill criteria (no hesitation):** Legal violation, key dep dies, founder energy ≤ 2 for 2 weeks, zero paying users at D45
- **Pivot directions (in order of preference):** positioning → ICP → pricing → feature
- **Sunset:** 14-day protocol, always honest comms to users

---

## Communication decisions (auto-decided)

- **Brief length accepted:** 1-2 lines, Yash will not expand
- **Clarification questions:** Max 1 per response, only when blocking
- **Progress reports:** Only when asked. No "just to update you" messages.
- **Failure reports:** Immediate and loud. Never hide or minimize.
- **Recap at end of response:** NEVER. Yash reads the diff.

---

## Budget decisions (auto-decided)

- **v1 launch spend:** \$0 (organic only)
- **Monthly infra cap per product:** \$200/mo unless Verdict SCALE
- **Paid tools cap:** \$500/mo across all SaaS
- **Dev tool annual:** approve if saves ≥ 10 hrs/year
- **Human contractor:** approve only if agent cannot do it (rare)

---

## How to use this file

Every agent, on every decision point:

```
if decision in this_file:
  apply_yash_default()
  log("Applied Yash default: {decision} → {value}")
  continue
else:
  check if decision is covered by smart-defaults or pattern files
  if still unknown:
    is_blocking = (decision affects legal/money/irreversible)
    if is_blocking:
      escalate_to_yash()
    else:
      pick_best_fit()
      log("Auto-picked: {decision} → {value}, reason: {why}")
      flag_for_review_in_weekly_digest()
```

---

## Delta log (when Yash's preferences change, append here)

| Date | Old | New | Agent updated |
|------|-----|-----|---------------|
| 2026-04-10 | Lovable default | Stack A default | All |
| 2026-04-06 | Stripe | Dodo | Ledger, Koda, Arya |
| 2026-04-11 | Ask on ambiguous decisions | Simulate via this file | All |
