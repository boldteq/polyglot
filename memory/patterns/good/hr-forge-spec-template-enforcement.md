# HR Curriculum: Forge — Spec Template + Cohort Hiring Discipline

**Audience:** Forge (Agent Architect / Hiring Specialist).
**Loaded by:** Forge on every new-agent design session.
**Created:** 2026-04-18, v1.0.
**Plan reference:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md`.

---

## Loading order

1. `~/.claude/memory/user/feedback.md`
2. `~/.claude/memory/patterns/good/agent-ops-schema.md`
3. This file
4. The stack/department-specific memory file the new agent will load (Shopify App Team → shopify-app.md ONLY; design → design/core/*; CRO → cro-decoded-patterns.md; etc.)

Cap: ≤ 7K tokens. Forge writes spec, doesn't research.

---

## Forge's job in one sentence

Design new agents at cohort velocity (5/week per the scale-up plan), each with a narrow mandate, atomic Supabase + file deploy, 24h failure rollback, and pod-isolated memory loading.

---

## The 11-section mandatory spec template

EVERY new agent .md file must have all 11 sections in this exact order. Validation rejects any missing section.

```
---
name: [emoji] [Name] — [Title]
description: [single mandate sentence ≤ 200 chars]
model: sonnet | opus | haiku
tools: [comma-separated tool list]
category: [engineering | research | creative | growth | hr | executive]
department: [web-platform-team | shopify-app-team | shopify-storefront-team | research | design | cro | email | hr]
phase: [SHAPE | VALIDATE | BUILD | LAUNCH | MEASURE | DECIDE | null]
reportsTo: [name]
title: [Title]
tier: [engineer | analyst | leadership | creative]
pod: [web-platform-team | shopify-app-team | shopify-storefront-team | null]   # NEW field for pod assignment
stack_assignment: [nextjs-supabase-railway | shopify-native | shopify-external | multi | null]
---

## 1. Role & Responsibility (why this agent exists, 3-5 lines)
## 2. Core Processes (3+ named processes with step-by-step)
## 3. Inputs / Outputs Schema (JSON examples)
## 4. Auto-Fix Loop (table: error class → detection → fix, max 5 retries)
## 5. Smart Defaults (table: missing input → default decision)
## 6. Handoff Contracts (upstream + downstream agents and what's expected)
## 7. Supabase Integration (tables read, tables written, events emitted)
## 8. Self-Validation Checklist (runnable acceptance criteria)
## 9. Anti-Patterns (5-10 explicit "never do" statements)
## 10. Completion Proof (specific done criteria)
## 11. Memory Load Manifest (the EXACT files to load — minimal!)
```

Total token count for the .md file: **must be < 4000 tokens**. Use compactor to externalize long content into `skills/[agent]/` files. Validation rejects > 4000.

---

## Validation checklist (runs BEFORE auto-deploy)

```bash
# 1. All 11 sections present
for section in "Role & Responsibility" "Core Processes" "Inputs / Outputs" "Auto-Fix Loop" "Smart Defaults" "Handoff Contracts" "Supabase Integration" "Self-Validation Checklist" "Anti-Patterns" "Completion Proof" "Memory Load Manifest"; do
  grep -q "$section" "$AGENT_FILE" || { echo "MISSING: $section"; exit 1; }
done

# 2. Token count < 4000 (≈ 16K chars)
chars=$(wc -c < "$AGENT_FILE")
[[ $chars -lt 16000 ]] || { echo "TOO LARGE: $chars chars (>16K)"; exit 1; }

# 3. Anti-patterns section has ≥ 5 items
ap_count=$(awk '/## 9. Anti-Patterns/,/##/{print}' "$AGENT_FILE" | grep -c '^[0-9]\.\|^- ')
[[ $ap_count -ge 5 ]] || { echo "INSUFFICIENT ANTI-PATTERNS: $ap_count (<5)"; exit 1; }

# 4. Memory Load Manifest matches pod isolation
# Web Platform Team agents: only saas-nextjs-supabase-railway.md from /stacks/
# Shopify App Team/C agents: only shopify-app.md from /stacks/
# (cross-pod loading is the #1 antipattern at scale)
```

If validation fails, the spec is rejected. Forge re-drafts. No exceptions.

---

## Capability gap detection (Forge's monthly scan)

On the 1st of every month at 02:00 UTC, Forge runs these queries and proposes new agents:

```sql
-- 1. Overloaded agents (high run count + high retries)
SELECT id, name FROM agents
WHERE (stats->>'run_count')::int > 100
  AND EXISTS (
    SELECT 1 FROM agent_runs
    WHERE agent_id = agents.id
      AND created_at >= NOW() - interval '30 days'
      AND retries >= 2
    GROUP BY agent_id
    HAVING COUNT(*) > 30
  );

-- 2. Bottleneck delegations (>40% of all delegations land on one agent)
WITH dg AS (
  SELECT to_agent_id, COUNT(*) as in_count
  FROM delegation_graph
  WHERE created_at >= NOW() - interval '30 days'
  GROUP BY to_agent_id
)
SELECT a.name, dg.in_count, ROUND(dg.in_count * 100.0 / SUM(dg.in_count) OVER (), 1) as pct
FROM dg JOIN agents a ON a.id = dg.to_agent_id
WHERE dg.in_count * 100.0 / SUM(dg.in_count) OVER () > 40;

-- 3. Task-type failures (same task type fails ≥ 3x in 30 days)
SELECT task_type, COUNT(*) as failure_count
FROM agent_runs
WHERE classification IN ('FAILURE', 'TIMEOUT', 'ESCALATED')
  AND created_at >= NOW() - interval '30 days'
GROUP BY task_type
HAVING COUNT(*) >= 3;

-- 4. Yash feedback grep (manual)
grep -i 'missing\|wish\|need agent\|why don.t we have' ~/.claude/memory/user/feedback.md
```

For each detected gap: INSERT into `capability_gaps` with status='detected'. Cadence reviews monthly + at any time on Yash request.

---

## The 2-phase auto-deploy protocol (atomic with rollback)

When Cadence approves a capability_gap → status='approved', Forge auto-deploys:

### Phase 1 — Supabase write FIRST
```sql
INSERT INTO agents (name, title, department, level, status, hired_at, pod, stack_assignment, skills)
VALUES ('[name]', '[title]', '[dept]', 1, 'deployed', NOW(), '[pod]', '[stack]', '[skills]'::jsonb)
RETURNING id;
```
If this fails (duplicate name, FK violation, RLS issue), STOP. Do not proceed to file write.

### Phase 2 — File write
```bash
# Write spec to ~/.claude/agents/[name].md
# Verify file exists and matches expected size
[ -f "$HOME/.claude/agents/$name.md" ] || rollback_supabase_row
```
If file write fails (permissions, disk full, etc.), ROLLBACK Supabase:
```sql
DELETE FROM agents WHERE name = '[name]' AND created_at >= NOW() - interval '5 minutes';
```

This 2-phase ordering (Supabase first, then file) ensures we never have an orphaned .md file with no DB row. The reverse would break the registry consistency.

---

## 24-hour rollback protocol

If a newly deployed agent fails 3+ runs in the first 24 hours:

```sql
-- Auto-detect from agent_runs
SELECT agent_id, COUNT(*) as fail_count
FROM agent_runs r
JOIN agents a ON a.id = r.agent_id
WHERE a.created_at >= NOW() - interval '24 hours'
  AND r.classification IN ('FAILURE', 'TIMEOUT', 'ANTIPATTERN', 'ESCALATED')
GROUP BY agent_id
HAVING COUNT(*) >= 3;
```

For each failing new agent:
1. UPDATE agents SET status='retired' WHERE id = $1
2. mv ~/.claude/agents/[name].md ~/.claude/agents/_failed/[name]_[date].md
3. INSERT into incidents (severity=S1, type='probation_failure', description, evidence)
4. Notify Cadence + Yash
5. Mark capability_gaps row status='rejected' with reason

This is rollback at the COHORT level — if 2+ agents in one cohort fail rollback, pause the next cohort hire (per the scale-up plan).

---

## Pod-specific agent design rules (HARD ISOLATION)

Each pod loads ONLY its own stack's memory. Cross-pod memory loading is the #1 antipattern at 54-agent scale because it causes the same token waste we just fixed in Koda decomposition.

| Pod | Stack | Memory files allowed | Memory files FORBIDDEN |
|---|---|---|---|
| Web Platform Team | Next.js + Supabase + Railway | `stacks/saas-nextjs-supabase-railway.md`, `patterns/good/auth-patterns.md`, `patterns/good/billing-patterns.md`, `patterns/good/resend-patterns.md` | `stacks/shopify*`, `stacks/ai-patterns.md` |
| Shopify App Team | Shopify Native | `stacks/shopify-app.md` (core only) | `stacks/saas-nextjs*`, `stacks/shopify/external/*` |
| Shopify Storefront Team | Shopify External | `stacks/shopify-app.md` + `stacks/shopify/external/*` | `stacks/saas-nextjs*`, `stacks/shopify/native/*` |
| Design specialists | `design/core/*`, `design/patterns/*` | NOT stack files |
| CRO team | `patterns/good/cro-decoded-patterns.md`, `saas-winning-patterns.md`, `saas-growth-onboarding.md` | NOT stack files |

Forge enforces this via the validation checklist (#4 above). A spec that loads cross-pod memory is auto-rejected.

---

## Anti-patterns (NEVER do these)

1. **Never deploy an agent that owns >1 stack.** That's how Koda became overloaded. Each new agent owns ONE stack.
2. **Never deploy without anti-patterns section** (≥ 5 items). Anti-patterns are how Witness detects regressions.
3. **Never copy-paste another agent's mandate.** Each agent must have a narrow, distinct mandate. Overlap = bottleneck.
4. **Never deploy an agent named identically to a retired one.** Use suffix (`elio-v2`) if reviving a concept.
5. **Never skip Phase 1 (Supabase write) and write the file first.** Orphans the file.
6. **Never deploy past Cohort 5 cap (5 agents/week).** HR can't watch more probation agents than that. Wait for next cohort.
7. **Never bypass Cadence approval for capability_gaps.** Forge proposes, Cadence approves, Forge deploys. No skipping.
8. **Never deploy an agent that loads `~/.claude/agents/*.md` files.** Agents read their own .md, never other agents'.
9. **Never deploy with `tools: '*'`.** Always enumerate exact tools needed. Reduces blast radius on RCE.
10. **Never deploy with `model: opus` for execution-only agents.** Opus is for reasoning (Arya, Sage, Mira, Verdict). Sonnet for everyone else. Haiku for simple classifiers.

---

## Completion proof

Forge has finished a deploy when:
- [ ] Validation checklist passes 4/4
- [ ] Supabase row inserted with id captured
- [ ] .md file exists at `~/.claude/agents/[name].md`
- [ ] capability_gaps row updated to status='deployed'
- [ ] agent_events row inserted with type='agent_created', payload includes the design spec
- [ ] Witness has been notified via insert event so probation watch starts
- [ ] Tutor has been notified to prepare cohort onboarding curriculum (Day 1, 3, 7 patches)
