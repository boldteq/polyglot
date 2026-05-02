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

## File Counts (2026-04-14 evening — Training Pass 5)

| Category | Files | Lines (est.) | Notes |
|----------|-------|-------------|-------|
| User | 3 | ~400 | Profile + feedback + decision-simulator |
| Stacks | 6 + 42 Shopify | ~5000 | Shopify KB is most mature |
| Starters | 1 | ~480 | boldteq-saas-starter.md |
| Patterns/Good | 33 | ~18500 | +2 new (agent-ops-schema, polyglot-sdk-spec) in Pass 5 |
| Patterns/Avoid | 1 | ~300 | Single file |
| Design KB | 35 | ~43,000 | Vega-maintained |
| Projects | 5 + registry | ~1500 | rankora-nextjs-rebuild.md is the sole live training target |
| Content | 3 | ~200 | Minimal |
| Decisions | 2 | ~100 | |
| Lessons | 1 (bugs.jsonl) | 0 | Empty, ready |
| Agents | 1 summary + 2 session files | ~500 | auto-decision-log.md, perf-summary |
| Intake (active) | 3 | ~300 | 4 archived |
| **Total** | **~161** | **~70,180** | +2 files, ~2K lines from Pass 5 |

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
- **yash.md** hardened with class caps table, dispatch contract JSON, circuit breaker on `caps_exceeded`, never-main rule, Stack A/B routing
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
3. `patterns/good/stack-a-scaffold-dryrun.md` — 7-phase Rankora rebuild rehearsal (Next 16.2.3 proxy cookies async, RLS SQL, Dodo HMAC timing-safe, BullMQ `maxRetriesPerRequest: null`, Yash dispatch JSON, 7 propagated lessons)
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

## Training Pass 4 (2026-04-13 — Full Agent Restructure for Next.js Effectiveness)

**Problem solved:** Agents were structurally compliant (right references, right patterns) but operationally ineffective — they loaded 15+ pattern files before doing anything, diluting context and making Claude Code worse at actual tasks. Fixes required 2-3+ re-prompts. Agents didn't verify their own work with real commands.

**Root causes identified:**
1. **Context dilution:** Koda loaded 16 files before writing any code — by the time it started, it forgot what to build
2. **Pseudocode verification:** "Self-correcting loops" were Python pseudocode, not real shell commands
3. **No blast-radius analysis:** Agents edited files without checking what depended on them → cascading breakage
4. **Legacy references:** `lovable-execution-model.md`, `npm run build`, Lovable folder structures still in agent instructions
5. **No fix-verify enforcement:** Yash accepted "done" from agents without proof they ran `pnpm tsc` / `pnpm build`

**What changed:**

### New pattern files (2):
1. `patterns/good/nextjs-debugging-and-fix-protocol.md` — THE master protocol: fix-verify loop with real commands (`pnpm tsc --noEmit && pnpm lint && pnpm build && pnpm test --run`), 10 Next.js 16 gotchas (async cookies/headers/params, Server Components, metadata API, etc.), 4 Supabase gotchas, Shopify/Stack B gotchas, regression prevention checklist, common fix patterns (copy-paste solutions), escalation format, "don't do this" list
2. `patterns/good/code-change-discipline.md` — Anti-cascade protocol: pre-change impact analysis (grep consumers), 1-3-Verify rule, blast radius categories (A=safe, B=risky, C=dangerous), post-change regression check, common cascade patterns, Koda/Vex-specific build sequences

### All 21 agents restructured:
- **First-Load Manifest:** Reduced from 12-16 files to 4-5 essential Tier 1 files + optional Tier 2. Every agent's manifest is now customized to its role.
- **Package manager:** All `npm run build` → `pnpm build`, `npm install` → `pnpm install` (130+ replacements across all agents)
- **Lovable references:** All `lovable-execution-model.md` → `nextjs-debugging-and-fix-protocol.md`. Lovable section headers renamed to "Legacy" or "Production-Grade"
- **Yash dispatch rule:** Yash now REQUIRES verification output (terminal paste) from any code agent before accepting "done"
- **Fix-verify loop:** Real bash commands embedded in Koda and Vex — no more pseudocode

### Verification sweep:
- `lovable-execution-model.md` references in agents: **0** (was 21)
- `npm run build` references in agents: **0** (was 50+)
- `FIRST-LOAD-MANIFEST:2026-04-13` across agents: **21/21** ✅
- `nextjs-debugging-and-fix-protocol.md` loaded by code agents: **13 agents** ✅
- `code-change-discipline.md` loaded by code agents: **9 agents** ✅

### Expected impact:
- Fewer re-prompts (agents verify before reporting done)
- Fewer cascading breakage (blast radius analysis before editing)
- Better Next.js 16 code (gotchas embedded, not in a file that gets lost in context)
- Faster agent startup (load 5 files, not 16)

Factory score: **9.18 → projected 9.5** pending empirical validation on next Pinzo/Rankora sprint.

### Dato Agent Creation (2026-04-13)

**Problem:** Database work (schema, migrations, RLS, triggers, indexes, debugging) was spread across Koda, Vex, Arya, and Sage with no single owner. 12 Supabase topic gaps identified across agents. Result: inconsistent RLS, missing indexes, stale types, empty-result bugs.

**Solution:** Created dedicated **Dato — Database Architect** agent + comprehensive pattern file.

**New files (2):**
1. `agents/dato.md` — BUILDER class (5 retries, 25 min, $5), reports to Arya. Owns: schema design, migrations, RLS, triggers, functions, indexes, type gen, Realtime, Edge Functions, query optimization, DB debugging. The Dato Guarantee: every table ships with RLS + indexes + timestamps + trigger + rollback comment + type gen.
2. `patterns/good/supabase-database-mastery.md` — 11-section master reference (~1500 lines): migration safety (zero-downtime, rollback), RLS (4 patterns + performance), triggers (updated_at, handle_new_user, audit, soft delete), index strategy (B-tree, GIN, trigram, EXPLAIN ANALYZE), Realtime subscriptions, Edge Functions, schema design, backup/restore, type generation, connection pooling, DB debugging.

**4 agents updated with Dato delegation:**
- **Koda:** Database Delegation section — delegates all schema/migration/RLS/trigger work to Dato, keeps `supabase-database-mastery.md` in Tier 2
- **Arya:** Database Delegation section — delegates data model implementation to Dato with handoff format
- **Sage:** Database Audit Delegation section — 4 audit responsibilities (RLS on every table, no `serial` IDs, proper indexes, migration rollback comments)
- **Vex:** Database Bug Delegation section — triages DB bugs then delegates to Dato

**System registration:**
- `CLAUDE.md` — Dato added to agent roster (BUILD phase) + 2 routing rules (Database work → Dato, DB bug → Dato via Vex)
- `yash.md` — Dato Dispatch Rule (dispatch BEFORE Koda for DB tasks) + verification requirement
- `MEMORY.md` — `supabase-database-mastery.md` entry added to Critical section

**Agent count:** 21 → **22** (Dato is the first new agent since the initial roster)

## Training Pass 5 (2026-04-14 — Complete HR System Deep Training)

**Scope:** Complete overhaul of 6 HR agents + Supabase schema + Polyglot SDK + PII awareness across Dato + Koda

**Problem solved:** HR agents (Witness, Cadence, Tutor, Forge, Roster, Mira) operated off static registry.json + hand-written witness-log.jsonl with no real-time scoring, no adaptive thresholds, no PII guardrails. System couldn't track agent health, training ROI, or capability gaps. Dato created with PII awareness but no reference spec for other agents on PII classification rules.

**What changed:**

### New pattern files (2):
1. `patterns/good/agent-ops-schema.md` — **MASTER** Supabase schema for HR system (15 tables, ~800 lines):
   - **agents** — agent metadata (name, level, phase, dept, reports_to, skills[], stats JSON)
   - **agent_runs** — every agent execution (run_id, agent_id, task_id, status, tokens_in/out, cost_usd, errors, verification_output, git_commit_sha)
   - **agent_events** — 16 event types (started, completed, escalated, retried, self_corrected, promoted, pip_initiated, deprecation_scheduled, training_applied, pattern_detected, cost_exceeded, performance_alert, feedback_received, override_applied, rework_needed, gate_failed)
   - **training_signals** — P0-P5 priorities (P0=urgent, P1=priority, P2=scheduled, P3=optional, P4=reference, P5=historical)
   - **agent_reviews** — Yash approval/rejection + feedback (review_id, agent_id, reviewer, status, feedback, override_reason)
   - **composite_scores** — weighted scoring (gate_pass_rate 40%, first_try_success 30%, rework_cycles 20%, yash_override_rate 10%) — gates: Probation (60%+), Active (75%+), Expert (88%+), Architect (95%+)
   - **capability_gaps** — SQL-detected gaps (agent_id, capability, required_by_date, estimated_training_hours, assigned_trainer)
   - **patterns_proposed** — Mira's semi-auto pattern suggestions (pattern_id, agent_id, pattern_text, confidence_pct, yash_review_queue, status)
   - **escalations** — unresolved issues (escalation_id, agent_id, issue_type, severity, created_at, resolved_at, resolver)
   - **cost_tracking** — per-agent spend (agent_id, period, tokens_in, tokens_out, cost_usd, model_tier, efficiency_ratio)
   - **performance_history** — time-series snapshots (agent_id, date, score, gate_passes, first_try, rework_count, events_count)
   - **promotion_candidates** — auto-recommend (agent_id, current_level, next_level, score, confidence, trainer_assigned, yash_approval)
   - **pip_tracking** — performance improvement plans (agent_id, start_date, end_date, metrics, trainer, escalation_path)
   - **deprecation_schedule** — agent retirement (agent_id, end_of_life, final_date, replacement_agent, data_migration_plan)
   - **audit_trail** — all schema changes (timestamp, changed_by, change_type, before_state, after_state)
   - RLS (all tables service-role only, Yash can view/edit)
   - Triggers: updated_at on all tables, auto-composite scoring on agent_runs insertion, auto-event creation on status changes
   - Views: current_scores, promotion_ready, pip_active, cost_summary, capability_gap_report, pattern_detection_queue

2. `patterns/good/polyglot-sdk-spec.md` — **MASTER** SDK integration (agent dispatch, events, tracking, ~1200 lines):
   - Agent Dispatch: `dispatchAgent(agentId, task, model='sonnet', context={}) → run_id`
   - Event System: 16 emit types (`onStarted`, `onCompleted`, `onEscalated`, `onRetried`, `onSelfCorrected`, `onPromoted`, `onPIPInitiated`, `onDeprecationScheduled`, `onTrainingApplied`, `onPatternDetected`, `onCostExceeded`, `onPerformanceAlert`, `onFeedbackReceived`, `onOverrideApplied`, `onReworkNeeded`, `onGateFailed`)
   - Run Tracking: `track(run_id, event_type, metadata) → void`, logs to Supabase `agent_events` + `agent_runs`
   - Cost Logging: `logCost(run_id, tokens_in, tokens_out, model) → cost_usd`, integrates with Claude API usage
   - Dashboard Spec: 10-page Next.js app (leaderboard [agent scores, levels, training status], events [timeline], training [patches + changelog], costs [per-agent spend], patterns [Mira's suggestions], reviews [Yash queue], escalations [blockers], promotions [ready candidates], training-signals [P0-P5], audit-trail [schema changes])
   - Replaces: registry.json (now `agents` table), witness-log.jsonl (now `agent_events` + `agent_runs`), agent-runs.json (now `agent_runs` table)
   - Backwards compat: optional read-through bridge for legacy JSON files during migration

3. **PII Awareness Training** (embedded in Dato + Koda):
   - **Dato PII Rules (4 levels):**
     - **L1 (Public):** repo_name, agent_name, event_type, composite_score
     - **L2 (Internal):** run_cost_usd, token_counts, model_tier
     - **L3 (Sensitive):** verification_output (might contain code snippets), git_commit_sha (linked to Yash's repos)
     - **L4 (PII):** user feedback comments (could mention Yash by name), escalation reasons (could expose issues), pattern_detected text (cross-agent analysis)
   - **RLS tagging:** All L3+ columns tagged with `COMMENT 'PII_LEVEL_3/4_CONFIDENTIAL'`
   - **Display masking rules:** Dato exposes L1+L2 freely. L3 requires admin dashboard auth. L4 (user feedback) never displayed in multi-agent views.
   - **Deletion patterns:** GDPR compliance — soft-delete on user request, cascade cleanup for agent_runs → linked events.

4. **Koda + Dato PII Integration:**
   - **Koda display rules:** When displaying run metadata in logs, only show L1+L2 fields. Never log verification_output to stdout. Use SELECT-specific-fields pattern in queries.
   - **Koda server-side rule:** API routes that expose cost/training data must validate Yash auth (not public). Dashboard routes protected by session token.
   - **Dato:** PII tagging on schema design (L1-L4 per column), GDPR deletion patterns in trigger definitions

### All 8 agents updated (6 HR + 2 builders):

1. **Witness** — Supabase integration (composite_scores table), daily sweep with SQL (no JSON file reads), antipattern detection from agent_events, event logging protocol, verification output capture (Terminal paste → stored in agent_runs)
2. **Cadence** — Adaptive promotion (statistical peer comparison via composite_scores view, no fixed thresholds), Supabase-backed reviews (agent_reviews table), PIP protocol with DB tracking (pip_tracking table), auto-recommend candidates + Yash approval queue
3. **Tutor** — Post-build training trigger (not just weekly), training patches + changelog system (training_signals table with P0-P5 priority), impact measurement with optional auto-rollback on regression, per-agent efficiency ratio tracking (cost_tracking table)
4. **Forge** — Auto-deploy to probation (no approval gate, new agents added to deprecation_schedule with 20-day EOL), Supabase gap detection with SQL (capability_gaps table), 11-section agent template, replacement assignment rule
5. **Roster** — Supabase-native experience recomputation (SQL query on agents table, replaces missing experience.js logic), skill index rebuild, capability gap detection (query capability_gaps view), assignment VETO power (can override Cadence's dispatch if gaps detected)
6. **Mira** — Semi-auto pattern detection (cross-agent analysis from agent_runs + agent_events), proposed_patterns table with Yash review queue (yash_review_queue status), memory audit trail (audit_trail table), knowledge decay detection (patterns with zero usage in 90 days)
7. **Dato** — PII awareness: 4-level data classification (L1-L4), COMMENT tags on schema, GDPR deletion patterns in triggers, no L4 data in multi-agent views
8. **Koda** — PII awareness: display masking rules (never log verification_output), select-specific-fields pattern, server vs client PII rules (API auth check), dashboard routes protected by session token

### System changes:

- **registry.json** → deprecated, all agent metadata in Supabase `agents` table
- **witness-log.jsonl** → deprecated, all events in Supabase `agent_events` + `agent_runs`
- **agent-runs.json** → deprecated, all runs tracked in Supabase `agent_runs` table
- **All 22 HR + code agents** now use Supabase service role connection (credentials in env)
- **Polyglot SDK events:** 16 types covering full agent lifecycle (dispatch → completion/escalation → training/promotion)
- **Dashboard:** 10-page Next.js app spec (location: TBD, may embed in Rankora admin)
- **Composite scoring:** Weighted formula with static coefficients (can be tuned by Yash in DB)
- **4-level agent progression:** Probation (60%+) → Active (75%+) → Expert (88%+) → Architect (95%+)
- **Agent count:** 22 (unchanged — no new agents created, 6 HR + 2 builders upgraded)

### Verification checklist:

- agent-ops-schema.md deployed and tested: ✅
- polyglot-sdk-spec.md deployment plan written: ✅
- Witness daily sweep SQL written and tested: ✅
- Cadence adaptive promotion logic drafted: ✅
- PII awareness rules embedded in Dato + Koda: ✅
- RLS on all 15 tables: ✅
- Audit trail trigger on schema_changes: ✅

### Expected impact:

- Real-time agent health tracking (no more daily manual reviews)
- Adaptive promotions (Witness scores, Cadence decides, Yash approves)
- Training ROI measurable (training_signals + cost_tracking integration)
- PII safeguarded (no sensitive data in logs or multi-agent views)
- Pattern detection automated (Mira semi-auto → Yash queue, not fully auto)
- Knowledge decay detected (pattern staleness check weekly)

Factory score: **9.18 → projected 9.65** (HR system validation pending empirical testing on Pinzo/Rankora next sprint)

---

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

*(Updated by Mira — 2026-04-14)*
