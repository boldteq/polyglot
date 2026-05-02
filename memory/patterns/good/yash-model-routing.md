# Yash — Model & Cost Routing Decision Table

**Owner:** Yash (commander)
**Purpose:** Deterministic table for which model each agent runs on, per task class. Removes the "which model?" question from every dispatch.
**Locked:** 2026-04-11

---

## Model tiers (Anthropic as of 2026-04-11)

| Tier | Model string | Use for | Cost/1M in/out |
|---|---|---|---|
| **DEEP** | `claude-opus-4-6` | Architecture, verdicts, ambiguous research, multi-file refactors | $$$ |
| **FAST** | `claude-sonnet-4-6` | Implementation, tests, copy, UI, most scaffolding | $$ |
| **CHEAP** | `claude-haiku-4-5-20251001` | Lint fixes, renames, file moves, simple lookups, status reports | $ |

---

## Per-agent routing table

| Agent | Default | Upgrade to DEEP when | Downgrade to CHEAP when |
|---|---|---|---|
| **Scout** | FAST | Ambiguous ICP, new industry | Never |
| **Atlas** | FAST | TAM across >3 geographies, unclear category | Single-number lookup |
| **Nova** | FAST | >10 competitors, positioning conflict | Single competitor summary |
| **Ledger** | FAST | Multi-currency, enterprise contract modeling | Fixed 3-tier output |
| **Arya** | **DEEP** | Always deep — architecture is high-leverage | Never |
| **Riko** | CHEAP | Scaffold hits a template edge case → FAST | Default: CHEAP (it's mostly file copying) |
| **Yash** | **DEEP** | Always — Yash orchestrates | Never |
| **Koda** | FAST | Distributed systems, complex state machines, auth flows → DEEP | Pure CRUD generation → CHEAP |
| **Vega** | FAST | First-time brand design, accessibility audit needing tradeoffs → DEEP | Spacing/color nits → CHEAP |
| **Quill** | FAST | Landing page hero + pricing copy → DEEP | Button labels, empty states → CHEAP |
| **Luna** | FAST | Integration test strategy design → DEEP | Unit test generation → CHEAP |
| **Sage** | **DEEP** | Always deep — security/GDPR/a11y can't miss | Never |
| **Zeph** | FAST | Technical SEO audit → DEEP | Meta tag fixes → CHEAP |
| **Bolt** | CHEAP | Multi-env rollback, custom CI → FAST | Default: CHEAP (it's scripted deploys) |
| **Hawk** | FAST | Incident triage, root cause → DEEP | Dashboard pings → CHEAP |
| **Vex** | **DEEP** | Always — bug diagnosis is high-leverage | Known regression pattern → FAST |
| **Echo** | FAST | First launch for a new product → DEEP | Repeat Tuesday launches → CHEAP |
| **Orbit** | FAST | Defining north-star from scratch → DEEP | Adding one event → CHEAP |
| **Pulse** | FAST | Synthesis across >20 interviews → DEEP | Single interview notes → CHEAP |
| **Verdict** | **DEEP** | Always — D30/D90 gate is binding | Never |
| **Mira** | CHEAP | Pattern extraction across full project → FAST | Default: CHEAP (log parsing + file updates) |
| **Witness** | **CHEAP** | Cross-agent regression cluster >3 agents → FAST | Always CHEAP — classification + aggregation, rule-based |
| **Roster** | **CHEAP** | Capability-gap investigation for new hire → FAST | Always CHEAP — SQL aggregation, nightly recompute |

---

## 2026-04-22 Hardening — Haiku rollout, Phase 1

**Changed (frontmatter `model: haiku` shipped):**
- Witness — daily sweep, rule-based classification
- Roster — nightly experience recompute, SQL-based

**Deferred to Phase 2 (requires per-task dispatch logic in Polyglot SDK):**
- Quill downgrades (button labels, empty states) — default stays FAST
- Vex downgrades (known regressions) — default stays DEEP
- Orbit downgrades (adding one event) — default stays FAST
- Echo downgrades (repeat launches) — default stays FAST
- Mira, Riko, Bolt — doc says CHEAP but agent frontmatter may need audit in Phase 2

**Why phased:** Claude Code subagent `model:` frontmatter is fixed per invocation. Task-conditional downgrades from this routing table require programmatic dispatch — that's Polyglot SDK's job. SDK is spec-only today. Phase 2 ships when SDK does.

**Enforcement for Phase 1:** Sage MUST run full audit (Mode A, 21 items) on any PR produced by a Haiku agent. See `sage.md` → "Mandatory Review Triggers". Auto-escalation on double self-validation failure already handled by `executable-auto-fix-loop.md`.

---

## Upgrade triggers (auto-escalate model)

An agent auto-upgrades to the next tier if any of these are true during execution:

1. **Self-validation failed twice** — upgrade once, retry.
2. **Input spec has unresolved TODO/TBD** — one tier up until resolved.
3. **Downstream agent rejected output** (Sage/Luna failed the gate) — one tier up on retry.
4. **Estimated output >5000 tokens** — FAST minimum, never CHEAP.
5. **User-facing copy or UI** — FAST minimum, never CHEAP.

---

## Downgrade triggers (auto-downgrade to save cost)

1. **Task is file copy/move/rename only** — CHEAP.
2. **Task is single regex substitution** — CHEAP.
3. **Task is status report / summary of existing artifacts** — CHEAP.
4. **Task is "run this command and tell me the output"** — CHEAP.

---

## Budget guardrails

- **Per-build budget:** $15 in model spend for a full Mode A (new product) pass. Alert Yash if exceeded.
- **Per-agent budget:** $3 per dispatch. If an agent burns $3, Yash pauses and reassesses.
- **Monthly cap:** $500 across all agents combined. Hawk monitors actual spend; if >80% by day 20, Yash switches all defaults one tier down.

---

## Prompt caching

- **ALWAYS** cache the first-load manifest block (it's identical across calls).
- **ALWAYS** cache the stack file (saas-nextjs-supabase-railway.md is ~40k tokens — huge savings).
- Cache breakpoint: after the stack file, before the task-specific prompt.
- Expected cache hit rate: 85%+ on multi-agent pipelines. 90% cost reduction on cached reads.

---

## How Yash uses this table

```pseudo
function dispatch(agent_name, task):
  tier = ROUTING_TABLE[agent_name].default
  if any(upgrade_trigger(task)):
    tier = upgrade(tier)
  if any(downgrade_trigger(task)):
    tier = downgrade(tier)
  model = TIER_TO_MODEL[tier]
  cost_estimate = estimate(task, model)
  if cost_estimate > PER_AGENT_BUDGET:
    escalate_to_yash("budget overrun estimate")
  call_agent(agent_name, task, model, cache=[manifest, stack_file])
```

---

## Delta

- **Before:** every agent ran on Opus by default, burning $30-60 per build.
- **After:** weighted mix lands at ~$8-12 per Mode A build, with DEEP only for Arya/Yash/Sage/Verdict/Vex.
- **Quality guard:** upgrade triggers ensure the cheap-tier fallback never ships broken work.
