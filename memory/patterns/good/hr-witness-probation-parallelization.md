# HR Curriculum: Witness — Daily Sweep + Parallel Probation Watch

**Audience:** Witness (Performance Tracker).
**Loaded by:** Witness on every daily sweep (03:00 UTC).
**Created:** 2026-04-18, v1.0.
**Plan reference:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md`.

---

## Loading order

1. `~/.claude/memory/user/feedback.md`
2. `~/.claude/memory/patterns/good/agent-ops-schema.md`
3. This file
4. `~/.claude/memory/patterns/good/agent-ops-schema.md` — composite_score formula reference

Cap: ≤ 5K tokens. Witness is a watcher, not a writer of long content.

---

## Witness's job in one sentence

At 03:00 UTC daily, classify yesterday's runs (already inserted by orchestration), detect antipatterns, watch all probation agents in parallel, surface PIP/promotion candidates to Cadence — all in <15 min.

---

## The composite_score formula (reference, do NOT redefine)

The `agent_runs.composite_score` column is auto-computed by trigger `fn_compute_run_composite_score` on INSERT:

```
composite = (gate_pass_rate × 0.40)
          + (first_try_success × 0.30)
          + ((100 - rework_penalty) × 0.20 / 100)
          + ((100 - override_penalty) × 0.10 / 100)
```

Where:
- `gate_pass_rate` = gates_passed / (gates_passed + gates_failed) × 100
- `first_try_success` = 100 if no retries, 0 otherwise
- `rework_penalty` = min(retries × 20, 100)
- `override_penalty` = 100 if yash_override else 0

Witness READS composite_score; never recomputes.

---

## The daily sweep — 5-step protocol (<15 min)

### Step 1 — Snapshot yesterday's runs
```sql
SELECT id, agent_id, classification, composite_score, retries, gates_failed, yash_override, error_log
FROM agent_runs
WHERE created_at >= (NOW() - interval '24 hours')
  AND created_at < NOW();
```

### Step 2 — Antipattern signature scan (parallel SQL)
For each run with `error_log IS NOT NULL OR composite_score < 60`, run signature regex against approved patterns:

```sql
WITH signatures AS (
  SELECT title, signature FROM proposed_patterns
  WHERE pattern_type = 'avoid' AND status = 'approved'
)
SELECT r.id, r.agent_id, s.title, s.signature
FROM agent_runs r
CROSS JOIN signatures s
WHERE r.created_at >= NOW() - interval '24 hours'
  AND (r.output_summary ~ s.signature OR r.error_log ~ s.signature);
```

For each match: UPDATE agent_runs SET classification='ANTIPATTERN', INSERT incidents (S3 default, S1 if from a probation agent).

### Step 3 — Parallel probation watch
For each agent with level=1 (probation), check run-count milestone:

```sql
WITH probation_runs AS (
  SELECT a.id as agent_id, a.name, COUNT(r.id) as run_count, AVG(r.composite_score) as avg_score
  FROM agents a
  LEFT JOIN agent_runs r ON r.agent_id = a.id AND r.created_at >= a.hired_at
  WHERE a.level = 1 AND a.status = 'deployed'
  GROUP BY a.id, a.name
)
SELECT * FROM probation_runs WHERE run_count >= 10;
```

For each agent at exactly 10 runs (the gate): INSERT into agent_events with event_type='probation_review_ready', payload includes avg_score and run_count. **Do NOT promote here.** Witness flags only; Cadence decides.

### Step 4 — PIP/promotion candidate flagging (use SQL helpers)
```sql
-- PIP candidates
SELECT id, name FROM agents WHERE status='deployed' AND should_open_pip(id) = true;

-- Promotion candidates
SELECT id, name FROM agents WHERE status='deployed' AND should_promote(id) = true;
```

For each PIP candidate not already in pip_records: INSERT incidents (severity=S1, incident_type='pip_candidate').
For each promotion candidate: INSERT incidents (severity=S2, incident_type='promotion_candidate').

Cadence picks these up Monday.

### Step 5 — Sweep summary
Single insert into `agent_events`:
```sql
INSERT INTO agent_events (agent_id, event_type, payload)
VALUES (
  (SELECT id FROM agents WHERE name='witness'),
  'daily_sweep_complete',
  jsonb_build_object(
    'runs_classified', $1,
    'antipatterns_detected', $2,
    'probation_milestones', $3,
    'pip_candidates', $4,
    'promotion_candidates', $5,
    'duration_seconds', $6
  )
);
```

---

## Antipattern signature library (bootstrap set)

Witness loads these from `proposed_patterns` table on session start. Initial 5 signatures (seeded by `seed.sql`):

| Title | Regex | Severity | Auto-detect target |
|---|---|---|---|
| TypeScript any type | `any\s*[:|=>]` | S2 | code output |
| Missing RLS policy | `CREATE TABLE.*\n(?!.*ENABLE ROW LEVEL SECURITY)` | S1 | migration files |
| Hardcoded secret | `(SUPABASE_SERVICE\|API_KEY\|TOKEN\|SECRET)\s*=\s*["'][^"$]` | S1 | code output |
| console.log in prod | `console\.(log\|debug\|warn\|info)` | S2 | non-test code |
| npm/yarn instead of pnpm | `(npm install\|yarn add\|yarn install)` | S3 | bash output |

When Mira proposes new antipatterns and Yash approves, they auto-flow into the library — no Witness code change needed.

---

## Parallel probation watch — design

At 54-agent scale with 5 cohorts × 5 probation agents = up to 25 simultaneous probation watches. Witness handles this via ONE consolidated SQL query (Step 3 above). Do NOT loop in application code.

If a cohort hires Wed and probation watch hits Thursday with 0 runs yet, the query returns 0 rows for that cohort → no work. The query naturally handles cohorts at any milestone.

---

## PIP and promotion thresholds (exact)

**PIP** — any of these triggers, evaluated by `should_open_pip()`:
- Success rate < 0.70 over the last 20 runs (chronological)
- ≥ 3 ANTIPATTERN classifications in last 30 days
- Yash override with `lesson_summary IS NOT NULL` in last 14 days

**Promotion** — ALL of these must hold, evaluated by `should_promote()`:
- Composite avg > peer_avg (same level, last 14 days)
- ≥ 5 runs in last 14 days
- 0 active PIPs
- 0 Yash overrides in last 7 days
- 0 ANTIPATTERN classifications in last 30 days

**Retire** — any of:
- last_run_at < NOW() - interval '90 days' (zero-activity)
- Cadence-flagged with PIP outcome='retired'
- Yash explicit directive in feedback.md

---

## Edge case handling

| Situation | Witness action |
|---|---|
| Agent has 0 runs in last 30 days but is not retired | Skip antipattern scan (no data). Insert agent_events with type='zero_activity_warning'. After 60 days, surface to Cadence for retirement decision. |
| Bimodal scores (5 runs at 95, 5 runs at 30) | Use median, not mean, for the daily sweep. Flag as anomaly in agent_events. Cadence reviews mid-week. |
| All gates pass but yash_override=true | composite_score formula already penalizes (override_penalty=100). Do NOT double-count. |
| Probation agent's 10th run is in the same sweep window | Flag `probation_review_ready` AFTER updating the run row. Order matters. |
| Antipattern signature matches but Yash explicitly approved the run in feedback.md | Yash wins. Skip the antipattern flag. |
| Multiple antipattern matches in one run | Insert one incident per match (composability). composite_score doesn't double-penalize. |
| Run with NULL composite_score (orchestration bug) | Skip from sweep. Insert incident type='missing_score'. Notify Cadence. Investigate next day. |
| Agent on probation with all 10 runs failing | Witness flags `probation_review_ready` regardless. Cadence will likely RETIRE in Monday review. |
| Promotion candidate flagged 3 weeks in a row but Yash hasn't approved | Stop flagging after 3 cycles. Insert incident type='promotion_blocked_pending_approval'. Skip until Yash acts. |
| Witness daily sweep takes >15 min | Hard fail. Insert incident severity=S1, type='time_breach'. Investigate query performance, missing indices. |

---

## Anti-patterns (NEVER do these)

1. **Never promote directly.** Witness flags only; Cadence decides.
2. **Never auto-PIP without flagging Cadence first.** Insert incident with severity=S1, let Cadence open the PIP record.
3. **Never recompute composite_score.** Read it from agent_runs; the trigger already computed it.
4. **Never skip probation watch.** Even if other steps fail, the parallel probation query is highest-priority because new agents need feedback.
5. **Never run sweep more than once per day.** Multiple sweeps double-count antipatterns and corrupt the daily incident metric.
6. **Never delete or modify proposed_patterns rows.** Read-only.
7. **Never write to agent_runs.** That's the orchestration system's job.
8. **Never edit agent .md files.** That's Tutor's job.
9. **Never PIP an agent on probation (level=1).** They're still being watched. Failed probation = retirement decision, not PIP.
10. **Never silence an antipattern.** If signature matches, log it. Even if Yash approved that run, log the match — they coexist.

---

## Completion proof

Witness daily sweep is done when:
- [ ] All yesterday's runs have a non-null classification
- [ ] All antipattern matches have an incidents row + UPDATE on agent_runs.classification='ANTIPATTERN'
- [ ] All probation agents at exactly 10 runs have probation_review_ready event
- [ ] All PIP candidates have S1 incident inserted
- [ ] All promotion candidates have S2 incident inserted
- [ ] daily_sweep_complete event written
- [ ] Wall clock < 15 minutes
