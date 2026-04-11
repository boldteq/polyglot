---
name: Memory System Health
description: Quick diagnostics — file counts, staleness, coverage gaps, action items
type: reference
last_updated: 2026-04-11
---

# Memory System Health

> Scan this to understand memory freshness and coverage gaps.
> Updated by Mira after every `/train` run.

---

## File Counts (2026-04-11 evening — 9+ push)

| Category | Files | Lines (est.) | Notes |
|----------|-------|-------------|-------|
| User | 3 | ~400 | Profile + feedback + decision-simulator |
| Stacks | 6 + 42 Shopify | ~5000 | Shopify KB is most mature |
| Starters | 1 | ~480 | boldteq-saas-starter.md |
| Patterns/Good | 28 | ~13000 | **+executable-auto-fix-loop, +executable-validation-gates** (the 9+ push) |
| Patterns/Avoid | 1 | ~300 | Single file |
| Design KB | 35 | ~43,000 | Vega-maintained |
| Projects | 5 + registry | ~1500 | rankora-nextjs-rebuild.md is the sole live training target |
| Content | 3 | ~200 | Minimal |
| Decisions | 2 | ~100 | |
| Lessons | 1 (bugs.jsonl) | 0 | Empty, ready |
| Agents | 1 summary + 2 session files | ~500 | auto-decision-log.md, perf-summary |
| Intake (active) | 3 | ~300 | 4 archived |
| **Total** | **~156** | **~64,700** | |

## Training Pass 2 (2026-04-11 evening) — The 9+ Push

Agents hardened with executable protocols (not prose):
- **Arya** (5.0 → projected 9.0): multi-file spec output + JSON input contract + executable done-gate + ADR template + 90-min cap
- **Koda** (7.6 → projected 9.2): parallel 3-branch execution + file locks + 5-gate done-gate shell script
- **Vega** (6.7 → projected 9.0): pixelmatch baseline diff + axe-core a11y scan + token enforcement
- **Sage** (8.9 → projected 9.6): auto-dispatch to Koda on Critical, finding JSON schema, severity matrix
- **Nova** (7.0 → projected 9.0): 45-min cap + 6-tier source fallback chain + handoff JSON
- **Echo** (6.7 → projected 9.0): 4 canonical channel tracks + contingency matrix + dual T-0 timelines (Stack A/B)
- **Mira** (7.7 → projected 9.3): weekly Sunday auto-sweep + full git push autonomy + stale-check
- **Quill** (7.9 → projected 9.1): executable copy QA (forbidden words + readability + passive + CTA length)

Factory protocols added:
- `patterns/good/executable-auto-fix-loop.md` — class-based retry caps, cost breaker, escalation JSON, git autonomy
- `patterns/good/executable-validation-gates.md` — 7 runnable bash scripts for every gate

Live training target locked:
- `projects/rankora-nextjs-rebuild.md` — Stack A full rebuild, cutover 2026-05-19

## Sync Pass 2026-04-11 (post-Training-Pass-2)

Goal: propagate Pass 2 executable protocols to memory, global CLAUDE.md, and the 13 agents that weren't directly hardened — so all 21 agents load identical rails.

Completed:
- **21/21 agents** now explicitly reference `patterns/good/executable-auto-fix-loop.md` at dispatch (verified via grep sweep — zero misses)
- **rex.md** hardened with class caps table, dispatch contract JSON, circuit breaker on `caps_exceeded`, never-main rule, Stack A/B routing
- **12 untouched agents** (atlas, bolt, hawk, ledger, luna, orbit, pulse, riko, scout, verdict, vex, zeph) patched with uniform "(b) Executable Loop Integration" block — class-tagged (Riko=builder, Bolt/Hawk/Luna=gate, rest=insight) with mandatory loads, cap enforcement, git autonomy
- **7 Pass-2 agents** (arya, vega, sage, nova, echo, mira, quill) patched with "(c) Uniform Executable Loop Loader" block to name-reference the pattern file (koda already referenced both)
- **global CLAUDE.md** — Memory Brain section updated: mandatory loads for `executable-auto-fix-loop.md` + `executable-validation-gates.md` + `user/feedback.md` before any task
- **user/feedback.md** — 4 new invariants appended: never-fabricate-projects, class caps non-negotiable, feature-branch-only git autonomy, Stack A locked
- **QuizSnap fully erased** — zero hits across memory, agents, CLAUDE.md, claude-hub HTML, chat-history.json, memory-audit-log.json. Fabricated "live training ground" from prior session removed on user directive.
- **Project count reconciled** — HEALTH.md updated from `4 + registry` → `5 + registry` (actual: clientloop, crobot, pinzo, rankora, rankora-nextjs-rebuild + REGISTRY.md)
- **Stack A archived refs cleaned** — MEMORY.md, CLAUDE.md, mira.md all point to `stacks/saas-nextjs-supabase-railway.md` (legacy `saas-nextjs-supabase.md` now under `_archive/`)

Factory score: **9.18** (projected, held stable post-sync)

Outstanding: none for this pass. Next sweep = Mira's Sunday auto-sweep 2026-04-12 22:00 PT.

## Sync Pass 3 (2026-04-11 late — Production-Readiness Training)

Goal: close the gap from "agents can build" to "agents can ship production-grade Pinzo + Rankora". Anchored to real files only (no fabricated projects — QuizSnap lesson enforced).

User-approved scope: **Pinzo (Shopify) + Rankora (Next.js rebuild)** · **scaffold-only** Stack A dry run · **all four** Tier 2/3 parallel items.

### Artifacts delivered (10 new files)

**Tier 1 — Pre-build essentials:**
1. `projects/pinzo-brand-kit.md` — positioning, voice DNA, #1F3A2B/#E4B343 palette, 4 pillars, Sage brand gate
2. `projects/rankora-brand-kit.md` — evidence-first voice, #0B1220/#3B82F6/#FACC15 yellow reserved for resume quotes, §8 EU AI Act hard rules (never "bias-free"/"unbiased"/"fair")
3. `patterns/good/stack-a-scaffold-dryrun.md` — 7-phase Rankora rebuild rehearsal (Next 16.2.3 proxy cookies async, RLS SQL, Dodo HMAC timing-safe, BullMQ `maxRetriesPerRequest: null`, Rex dispatch JSON, 7 propagated lessons)
4. `patterns/good/shopify-app-store-submission-runbook.md` — 18 checklist items (GDPR webhooks, Polaris-only, CSP, Lighthouse delta, etc.) with runnable verify bash + `submit-gate.sh`

**Tier 2 — Business rails (parallel, 2×2):**
5. `projects/pinzo-pricing-ltv.md` — 4 tiers Free/$9/$19/$49, 75% margin, LTV $238 net, max CAC $79, kill criteria D30/D90
6. `projects/rankora-pricing-ltv.md` — 3 tiers Free/$29/$99, 88% margin (model-risk-tagged), LTV $796 net, max CAC $265, 5-risk register
7. `projects/pinzo-metrics.md` — NSM "Weekly Covered Checks" + 4-criteria activation + 8-panel PostHog dashboard + SQL
8. `projects/rankora-metrics.md` — NSM "Weekly Evidence-Backed Ranks" + 4-criteria activation (includes evidence expansion = brand promise test) + 10-panel dashboard + post-cutover calibration plan
9. `projects/pinzo-competitive-teardown.md` — 8 competitors verified live on Shopify App Store (Zapiet leader, Zipprover cheapest, Ship Sketch map-overkill, etc.), positioning map, Zapiet battlecard, confidence 8/10
10. `projects/rankora-competitive-teardown.md` — 7 direct + 4 ATS-embedded + adjacent tools, Eightfold battlecard, EU AI Act + NYC LL 144 as moat, confidence 7/10

**Tier 3 — Legal baseline:**
11. `patterns/good/legal-baseline-templates.md` — Stack A ToS/Privacy/DPA templates, Stack B Shopify deltas, Rankora EU AI Act high-risk rider, Sage `legal-check.sh` gate, 8 escalation triggers

### Sync Pass 3 enforcement rules

- **Brand kits are Sage-enforced.** Rankora never ships "bias-free"/"fair"/"replaces recruiter". Pinzo never ships "seamless". Sage hard-blocks.
- **Legal gate hard-blocks Bolt.** Bolt runs `legal-check.sh` immediately before every submission/cutover. Non-200 on `/terms`, `/privacy`, `/dpa` or any `{{placeholder}}` remnant = abort.
- **Pricing models are model-risk-tagged.** Rankora's 88% margin assumes gpt-4o-mini holds; Ledger re-runs if OpenAI pricing or model mix changes.
- **North-star metrics are the ONLY Verdict inputs.** Anti-metrics (installs, time spent, ranks processed without evidence expansion) explicitly rejected for SCALE/PIVOT/KILL.
- **Competitive teardowns re-audit Q2 2026** — AI space moves fast; Nova owns re-verification.

### QuizSnap regression check

Grep sweep across `~/.claude/memory/`, `~/.claude/agents/`, `~/.claude/CLAUDE.md`, `claude-hub/` — confirmed **zero hits**. Sync Pass 2 eradication held. No fabricated projects reintroduced in Sync Pass 3.

### Factory score impact

Sync Pass 3 does not change agent internals (no agent file edits). It closes the **product-readiness knowledge gap**. Score projection: **9.18 → 9.45** once Rankora cutover validates the scaffold dry run against reality (2026-05-19). Held at 9.18 until empirical validation.

Outstanding: none for this pass. Next gate = Rankora cutover rehearsal week of 2026-05-12.

## Staleness Report

| File | Last Updated | Days Stale | Risk |
|------|-------------|-----------|------|
| stacks/shopify-app.md (legacy) | ~2026-03 | 30+ | **HIGH** — 2306 lines, being replaced by shopify/ folder |
| stacks/_archive/saas-nextjs-16-pre-railway.md | archived 2026-04-10 | n/a | Archived — superseded by saas-nextjs-supabase-railway.md |
| content/*.md | ~2026-03 | 30+ | Low — placeholder until first ship |
| projects/pinzo.md | 2026-04-03 | 3 | Low |
| projects/crobot.md | 2026-04-06 | 0 | Fresh |
| user/feedback.md | 2026-04-06 | 0 | Fresh |
| agents/performance-summary.md | 2026-04-06 | 0 | Fresh |

## Coverage Gaps

| Gap | Impact | Action |
|-----|--------|--------|
| Size Chart — no project memory | Can't track decisions | Create after scaffolding |
| Store Locator — no project memory | Can't track decisions | Create after scaffolding |
| Rankora — no project memory | Decisions untracked since Mar | **Create now** — active project |
| CROBOT CLAUDE.md empty | Agents can't load project rules | **Populate from projects/crobot.md** |
| claude-hub — no git, no docs | Can't version control hub | **`git init` + write CLAUDE.md** |
| Legacy shopify-app.md | 2306-line monolith, partially stale | Deprecate after verifying shopify/ folder covers all |

## Action Items (Priority Order)

1. **Create `projects/rankora.md`** — active project with no memory tracking
2. **Populate CROBOT's `CLAUDE.md`** — extract key rules from `projects/crobot.md`
3. **`git init` claude-hub** — infrastructure project with no version control
4. **Deprecate `stacks/shopify-app.md`** — verify shopify/ folder is complete, then archive
5. **Confirm `stacks/saas-nextjs-supabase-railway.md` is canonical** (Stack A MASTER, locked 2026-04-10)
6. **Split `patterns/avoid/antipatterns.md`** by category if it grows past 500 lines

---

## Memory System Rules

1. **MEMORY.md stays under 100 lines** — if approaching limit, compress or archive
2. **Intake keeps max 3 recent** — older sessions move to `intake/archive/`
3. **Performance summary stays under 80 lines** — session detail lives in `agents/sessions/`
4. **Project files updated every session** — Mira updates after `/train`
5. **Registry updated on project status change** — new project, deploy, pause, ship
6. **Health check runs weekly** — Mira scans for staleness, gaps, bloat
7. **Legacy files get archived, not deleted** — move to `archive/` subfolder with date

---

*(Updated by Mira — 2026-04-06)*
