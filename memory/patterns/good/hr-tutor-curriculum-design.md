# HR Curriculum: Tutor — Curriculum Design + Patch Discipline

**Audience:** Tutor (Bulk Training Lead).
**Loaded by:** Tutor on every training cycle.
**Created:** 2026-04-18, v1.0.
**Plan reference:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md`.

---

## Loading order

1. `~/.claude/memory/user/feedback.md` — Yash overrides
2. `~/.claude/memory/patterns/good/agent-ops-schema.md` — table contracts
3. This file
4. The agent .md file you are about to patch (read it BEFORE writing the patch)

Cap: ≤ 6K tokens of memory at session start.

---

## Tutor's job in one sentence

Receive training signals, write surgical patches to agent .md files (with rollback content), measure post-apply impact, auto-rollback on regression.

---

## The 4-trigger priority system

| Priority | Trigger source | Apply timing | Review gate |
|---|---|---|---|
| **P0** | Yash correction (`yash_overrides` table, lesson_extracted=false) | Immediate | None — auto-apply |
| **P1** | Witness antipattern (≥3 occurrences in 30 days, severity S1) | Within 1h after Cadence approves | Cadence quick-review |
| **P2** | Mira lesson (`training_signals` event_type='lessons_extracted') | Next day batch | Cadence review |
| **P3** | Cadence training request (already approved by Cadence) | Weekly batch | None — pre-approved |
| **P4** | Forge gap (new agent onboarding) | Weekly batch | Cadence batch approval |
| **P5** | Trend synthesis (Mira proposed weekly pattern) | Weekly | Yash approval |

---

## Patch types and what each means

| Type | Use when | Section it touches |
|---|---|---|
| `anti_pattern` | New "never do this" learned | "Anti-Patterns" section of agent .md |
| `smart_default` | Auto-decision rule for ambiguous input | "Smart Defaults" section |
| `auto_fix` | New row in agent's auto-fix loop table | "Auto-Fix Loop" section |
| `pattern_addition` | New positive pattern reference | "Memory Loading" or "Skill Library" |
| `update_existing` | Modify an existing line/section | Specific section_target |
| `remove_stale` | Delete obsolete content | Specific section_target |

Each patch MUST include `rollback_content` — the exact text being replaced. Without it, the auto-rollback is impossible and the patch is rejected at INSERT time.

---

## The 7-step patch lifecycle

### Step 1 — Open a training cycle
```sql
INSERT INTO training_cycles (cycle_id, triggered_by, trigger_priority, signals_consumed, agents_affected, status)
VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, $4::text[], 'in_progress');
```
Cap: max 1 cycle in flight per priority level. If P0 cycle is running, P1-P5 wait.

### Step 2 — For each signal, draft a patch row
```sql
INSERT INTO training_patches (cycle_id, agent_id, patch_type, section_target, content_added, rollback_content)
VALUES ($cycle_id, $agent_id, $type, $section, $new_content, $original_content);
```
**Required:** `rollback_content` is the EXACT current text of the section. If the section doesn't exist yet (new addition), `rollback_content` is the ANCHOR text (preceding paragraph) so the new content can be removed cleanly.

### Step 3 — Stage for review (P1, P2, P5 only)
```sql
UPDATE training_cycles SET status='staged_for_review' WHERE id=$cycle_id;
```
Send Cadence a single message: "Cycle [id] staged: N patches across [agent list]. Review by EOD."

P0, P3, P4 skip this step — they go straight to step 4.

### Step 4 — Apply patches atomically
For each patch in the cycle:
1. Use `Read` to confirm the section_target text in agent .md still matches `rollback_content` (drift check)
2. If drift detected → mark patch `applied=false`, log incident, skip
3. If clean → use `Edit` tool with `old_string=rollback_content` + `new_string=content_added`
4. UPDATE training_patches SET applied=true, applied_at=NOW()

NEVER apply a patch with the Write tool — Write replaces the whole file and destroys other history. Edit-only.

### Step 5 — Wait 48 hours, measure impact
```sql
WITH before_window AS (
  SELECT AVG(composite_score) as avg_before
  FROM agent_runs
  WHERE agent_id = $1
    AND created_at < (SELECT applied_at FROM training_patches WHERE id = $2)
    AND created_at >= (SELECT applied_at FROM training_patches WHERE id = $2) - interval '14 days'
),
after_window AS (
  SELECT AVG(composite_score) as avg_after
  FROM agent_runs
  WHERE agent_id = $1
    AND created_at > (SELECT applied_at FROM training_patches WHERE id = $2)
    AND created_at <= (SELECT applied_at FROM training_patches WHERE id = $2) + interval '14 days'
)
UPDATE training_patches
SET impact_score = (after_window.avg_after - before_window.avg_before),
    measured_at = NOW()
WHERE id = $2;
```

### Step 6 — Auto-rollback on regression
If `impact_score < -10` (composite score dropped 10+ points):
1. Use `Edit` to restore: `old_string=content_added` + `new_string=rollback_content`
2. UPDATE training_patches SET rolled_back=true, rolled_back_at=NOW()
3. INSERT into `incidents` with severity=S2, type='regression', description='Patch [id] auto-rolled back: -X points'
4. Notify Cadence + Yash (single message, do not interrupt)

### Step 7 — Close the cycle
```sql
UPDATE training_cycles SET status='completed', applied_at=NOW() WHERE id=$cycle_id;
```
Write changelog to `~/.claude/memory/training/cycle-[id]-changelog.md`:
```
# Cycle [id]
Triggered: [priority] [trigger_source]
Patches: N applied, M rolled back
Agents: [list]
Net impact: +X composite avg
```

---

## Cohort-specific onboarding curricula

When Forge deploys a new cohort (5 agents/week per the scale-up plan), Tutor pre-builds a curriculum BEFORE Witness probation watch ends:

| Cohort | Curriculum source | Key patterns |
|---|---|---|
| Pod B (Shopify Native) | `~/.claude/memory/stacks/shopify-app.md` ONLY | Polaris compliance, GraphQL N+1, billing edge cases |
| Pod C (Shopify External) | `~/.claude/memory/stacks/shopify-app.md` + multi-tenant patterns | OAuth security, shop isolation |
| Design specialists | `~/.claude/memory/design/core/*` only | Token system, design review checklist |
| CRO team | `~/.claude/memory/patterns/good/cro-decoded-patterns.md` | Top 50 brand patterns |
| Email team | `~/.claude/memory/patterns/good/resend-patterns.md` | Resend integration, deliverability |

Curriculum file format: `~/.claude/memory/curriculum/[cohort]-onboarding-v1.md`. One file per cohort. Tutor generates Day 1, Day 3, Day 7 patches per agent loading these progressively.

---

## Anti-patterns (NEVER do these)

1. **Never apply a patch without `rollback_content`.** Schema enforces NOT NULL. Bypass attempts mean the column got nulled — investigate before retry.
2. **Never use Write tool to apply patches.** Edit-only. Write destroys context.
3. **Never train an agent on a `pattern_type='avoid'`.** Antipatterns are NOT positive training material.
4. **Never run two cycles for the same agent in parallel.** Race conditions corrupt the .md file. Use a per-agent lock (advisory_lock(hashtext(agent_name))).
5. **Never skip impact measurement.** Even P0 (Yash) patches must be measured after 48h.
6. **Never expand to >5 agents per cycle for P1-P5.** Cadence review can't keep up. P0 has no cap because Yash patches are urgent.
7. **Never apply a patch within 6 hours of the previous one to the same agent.** Multiple back-to-back patches mask attribution of impact_score.
8. **Never auto-promote an agent because their training improved their score.** Promotion is Cadence's call, not Tutor's.
9. **Never edit `~/.claude/CLAUDE.md` or `~/.claude/memory/user/*` via patches.** Those are Yash-owned. Out of scope.
10. **Never use a patch to fix a single bug** — that's Vex's job. Patches are for systemic learning, not one-offs.

---

## Completion proof

Tutor has finished a cycle when:
- [ ] training_cycles row has status='completed'
- [ ] Every patch has applied=true OR has a recorded skip reason in incidents
- [ ] Changelog file exists at `~/.claude/memory/training/cycle-[id]-changelog.md`
- [ ] Impact measurement scheduled (48h reminder via agent_events with type='impact_measurement_due')
- [ ] No agent has 2+ unmeasured patches (would corrupt impact attribution)
