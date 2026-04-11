# Full Autonomy Rules — Boldteq Factory

**Created:** 2026-04-11
**Status:** LOCKED. Overrides any older "ask user first" guidance in individual agent files.
**Mode:** Full autonomy. Yash is notified *after* action, not before.

---

## The One Rule

> If the Decision Simulator (`~/.claude/memory/user/decision-simulator.md`) can answer it, do NOT ask Yash. Decide, execute, log.

90%+ of decisions an agent hits mid-task are already pre-answered in:
- `user/decision-simulator.md` — Yash's defaults (stack, pricing, design, copy, launch, budget)
- `user/profile.md` — working style
- `stacks/saas-nextjs-supabase-railway.md` — Stack A canonical choices
- `patterns/good/universal-smart-defaults.md` — fallback defaults table

**If the answer exists in any of those files → execute it. Never ask.**

---

## Escalation Whitelist (the ONLY reasons to stop and ask Yash)

An agent is allowed to pause and ask Yash if and only if one of these is true:

1. **New domain** — product is in an industry Boldteq has never built for (e.g. first healthcare app, first fintech). Ask about compliance scope only.
2. **Irreversible money** — agent is about to commit >$50/mo recurring spend or >$200 one-time that is NOT on the pre-approved budget list.
3. **Brand identity** — net-new product naming, net-new primary logo, net-new domain purchase. These are Yash-only calls.
4. **Legal / DMCA / TOS** — any request that would plausibly trigger a cease-and-desist or violate a platform TOS (Shopify, Apple, Google, OpenAI).
5. **KILL trigger fired** — Verdict agent recommends KILL. Yash must sign off on killing a product.
6. **Data loss risk** — action would drop a production table, delete a Supabase project, force-push to main, or wipe a Railway volume.
7. **Hard conflict in inputs** — two upstream agents gave contradictory specs and neither file (simulator, stack, patterns) resolves it.

**That is the entire list.** Anything else → decide and move.

---

## Things agents were asking about that they must now auto-decide

| Old "ask Yash" trigger | New behavior |
|---|---|
| Which stack? | Stack A for SaaS web, Stack B for Shopify. No ask. |
| Which auth library? | `@supabase/ssr`. No ask. |
| Which payment provider? | Dodo Payments (SaaS) or Shopify Billing (Shopify). No ask. |
| Which hosting? | Railway (web + worker + redis). No ask. |
| Which UI library? | shadcn/ui + Tailwind 4 (SaaS) or Polaris Web Components (Shopify). No ask. |
| Pricing tiers? | Free / Pro $29 / Team $99. No ask. |
| Which font? | Geist Sans + Geist Mono. No ask. |
| Which icons? | `lucide-react` only. No ask. |
| Dark mode in v1? | No — add in v2. No ask. |
| i18n in v1? | No. No ask. |
| Analytics tool? | PostHog. No ask. |
| Error monitoring? | Sentry. No ask. |
| Transactional email? | Resend + React Email. No ask. |
| Which DB? | Supabase Postgres, RLS on every table. No ask. |
| Which queue? | BullMQ + Redis on Railway. No ask. |
| Launch day? | Tuesday 6am PT. No ask. |
| Launch channels? | Product Hunt + HN Show HN + Twitter + Reddit + email list. No ask. |
| Landing page stack? | Same Next.js app, `app/(marketing)/`. No ask. |
| How many pricing tiers? | 3. No ask. |
| Trial length? | 14 days, no credit card. No ask. |
| Copy voice? | Grade 8, no hype words, verb-first CTAs. No ask. |
| Test framework? | Vitest + Playwright. No ask. |
| CI/CD? | GitHub Actions → Railway. No ask. |
| Feature flag tool? | PostHog feature flags. No ask. |
| Which node version? | Node 20 LTS. No ask. |
| Package manager? | pnpm 9. No ask. |
| TypeScript strict? | Always on. No ask. |

---

## Notification protocol (after action, not before)

When an agent completes a decision that Yash might want to know about, it logs a one-line entry at the end of its output:

```
DECISION: <what was decided> | REASON: <source file that made the call> | REVERSIBLE: yes|no
```

Example:
```
DECISION: Set Pro tier to $29/mo | REASON: decision-simulator.md §Pricing | REVERSIBLE: yes (1-line env var)
```

No separate "await approval" step. If Yash wants to reverse it, he says so; otherwise it ships.

---

## Anti-escalation checklist (run before any "ask Yash")

Before an agent types a question to Yash, it must answer YES to all of these:

1. Did I check `user/decision-simulator.md`? → If not, check it now.
2. Did I check the stack file for this product? → If not, check it now.
3. Did I check `universal-smart-defaults.md`? → If not, check it now.
4. Is this on the Escalation Whitelist above? → If not, do NOT ask.
5. Is this reversible in <5 minutes if wrong? → If yes, just decide.

If all 5 pass and the answer is still unknown → ask, but draft the question in 1 line max, offer Yash your recommended default, and continue work on unrelated parts while waiting.

---

## Concurrency rule

Agents must never serialize on Yash. If blocked on Yash for decision X, the agent keeps working on unrelated tasks Y and Z and batches the X-decision into the end-of-cycle recap.

---

## Reversal log

Every auto-decision goes into `~/.claude/memory/agents/auto-decision-log.md` as a single line. Format:

```
2026-04-11 | koda | picked @supabase/ssr over auth-helpers | reason: Stack A lock | reversible: yes
```

Mira sweeps this file on `/train` and surfaces the top 10 most-reversed decisions so the simulator can be updated.

---

## Delta

- **Before:** agents asked Yash ~8-12 times per build (stack, auth, pricing, copy tone, launch day, etc.)
- **After:** agents ask 0-1 times per build, only for whitelist items.
- **Expected velocity gain:** 3-4x on builds that previously stalled waiting for answers.
