# Agent-Ops Schema — Boldteq HR & Performance Tracking Database

> **Purpose:** System of record for agent lifecycle management, performance scoring, HR decisions, training, and incident tracking in the Boldteq multi-agent software factory.
> **Stack:** Supabase Postgres (local + production), full RLS, audit logging, real-time events.
> **Source of truth:** This file. All migrations derive from here.
> **Last updated:** 2026-04-14

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Table Reference](#table-reference)
4. [Complete Migration SQL](#complete-migration-sql)
5. [RLS Policies](#rls-policies)
6. [Functions, Triggers, Views](#functions-triggers-views)
7. [Usage Patterns by Agent](#usage-patterns-by-agent)
8. [Initialization & Seeding](#initialization--seeding)

---

## Architecture Overview

### System Design

The agent-ops database replaces the current `registry.json` and introduces structured observability for the 22-agent workforce:

```
┌─ AGENTS (core identity + status)
│  └─ AGENT_RUNS (every execution: task, classification, cost, gates, score)
│  └─ AGENT_REVIEWS (periodic HR review: classification, promotion decision)
│  └─ PIP_RECORDS (performance improvement plans)
│  └─ CAPABILITY_GAPS (skill gaps detected by Roster)
│
├─ ANALYTICS
│  ├─ COST_LOGS (per-run token usage, LLM cost)
│  ├─ PATTERN_USAGE (which patterns agents apply)
│  └─ DELEGATION_GRAPH (inter-agent task handoff tracking)
│
├─ TRAINING
│  ├─ TRAINING_CYCLES (weekly training runs + rollback safety)
│  └─ TRAINING_PATCHES (per-agent patch per cycle + rollback)
│
├─ AUDIT & COMPLIANCE
│  ├─ INCIDENTS (production bugs traced to agent work)
│  ├─ MEMORY_UPDATES (every change to ~/.claude/memory/)
│  ├─ YASH_OVERRIDES (every time Yash corrects an agent)
│  └─ PROPOSED_PATTERNS (Mira's semi-auto detected patterns awaiting approval)
│
└─ REAL-TIME EVENTS
   └─ AGENT_EVENTS (event bus: task_started, task_completed, gate_passed, etc.)
```

### Key Features

- **Composite scoring:** Weighted (gate_pass_rate 40%, first_try_success 30%, rework_cycles 20%, yash_override_rate 10%)
- **Adaptive promotion:** Cadence compares agent to peer average (same level, same 14-day window) — promotes if consistently above
- **Training patches:** Tutor applies pattern patches per agent after every build, with rollback hash for safety
- **Full observability:** Event stream captures every task state change, gate result, cost spike, retry
- **Audit trail:** Every memory change, Yash override, and incident is logged with context
- **Cost tracking:** Per-run token count, model, and USD cost for ROI analysis
- **RLS-enabled:** Service role (internal) can do everything; all tables RLS-protected for Boldteq standards

---

## Core Concepts

### Agent Levels

**4-tier system:**
1. **Probation** (level=1) — New agents, 10-run observation period (Witness)
2. **Active** (level=2) — Promoted by Cadence, can receive delegations
3. **Expert** (level=3) — High-performing, mentors juniors, complex tasks
4. **Architect** (level=4) — System-level work, strategy, rare

### Agent Status

- `provisioned` — Agent definition exists, not yet deployed
- `deployed` — Actively taking work
- `training` — In Training cycle (temp)
- `pip` — Performance Improvement Plan active
- `retired` — Removed from rotation

### Run Classification

- `SUCCESS` — Task completed, all gates passed
- `FAILURE` — Task failed, critical error
- `TIMEOUT` — Execution exceeded time budget
- `REGRESSION` — New failure in previously-working code
- `ANTIPATTERN` — Agent used pattern from `patterns/avoid/`
- `ESCALATED` — Agent escalated to Yash or higher agent

### Review Classification

- `PROMOTE` — Advance to next level
- `SCALE` — Keep at current level, increase task complexity
- `STEADY` — Continue current pace
- `TRAIN` — Enroll in training cycle with specific patches
- `PIP` — Open Performance Improvement Plan
- `RETIRE` — Remove from roster

---

## Table Reference

### 1. agents
Agent profiles — replaces `registry.json`.

```sql
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  title text NOT NULL,
  department text NOT NULL,
  phase text NOT NULL,
  level int NOT NULL DEFAULT 2,
  level_title text GENERATED ALWAYS AS (
    CASE level
      WHEN 1 THEN 'Probation'
      WHEN 2 THEN 'Active'
      WHEN 3 THEN 'Expert'
      WHEN 4 THEN 'Architect'
      ELSE 'Unknown'
    END
  ) STORED,
  status text NOT NULL DEFAULT 'deployed',
  reports_to uuid REFERENCES agents(id) ON DELETE SET NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{
    "run_count": 0,
    "success_rate": 0.0,
    "avg_composite_score": 0.0,
    "total_cost_usd": 0.0,
    "last_run_at": null
  }'::jsonb,
  hired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agents IS 'Agent identity, role, level, and running stats. Replaces registry.json.';
COMMENT ON COLUMN agents.skills IS 'Array of skill tags: ["DB", "API", "UI", "Testing", "DevOps", "Security"]';
COMMENT ON COLUMN agents.stats IS 'Running aggregate: run_count, success_rate, avg_composite_score, total_cost_usd, last_run_at';
```

### 2. agent_runs
Every agent execution — the core event for performance analysis.

```sql
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id text NOT NULL UNIQUE,
  task_type text NOT NULL,
  classification text NOT NULL,
  duration_ms int NOT NULL,
  token_count int,
  cost_usd numeric(10, 6),
  retries int NOT NULL DEFAULT 0,
  files_changed int NOT NULL DEFAULT 0,
  gates_passed int NOT NULL DEFAULT 0,
  gates_failed int NOT NULL DEFAULT 0,
  first_try_success bool NOT NULL DEFAULT false,
  yash_override bool NOT NULL DEFAULT false,
  composite_score numeric(5, 2),
  output_summary text,
  error_log text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_runs IS 'Every agent task execution. Central table for performance analysis.';
COMMENT ON COLUMN agent_runs.run_id IS 'Unique run identifier from orchestration system (e.g., "yash-2026-04-14-001")';
COMMENT ON COLUMN agent_runs.classification IS 'SUCCESS | FAILURE | TIMEOUT | REGRESSION | ANTIPATTERN | ESCALATED';
COMMENT ON COLUMN agent_runs.composite_score IS 'Computed on INSERT via trigger, 0–100';
```

### 3. agent_reviews
Periodic HR reviews by Cadence agent — promotion/PIP decisions.

```sql
CREATE TABLE agent_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  classification text NOT NULL,
  rationale text NOT NULL,
  peer_avg_score numeric(5, 2),
  agent_avg_score numeric(5, 2),
  decision_approved bool NOT NULL DEFAULT false,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_reviews IS 'Cadence''s weekly review: promotion, scale, train, PIP, retire. One per agent per review period.';
COMMENT ON COLUMN agent_reviews.classification IS 'PROMOTE | SCALE | STEADY | TRAIN | PIP | RETIRE';
COMMENT ON COLUMN agent_reviews.peer_avg_score IS 'Average composite score of agents at same level in same period';
COMMENT ON COLUMN agent_reviews.approved_by IS 'Yash approval: null=pending, "yash"=approved, "cadence"=auto-approved under policy';
```

### 4. pip_records
Performance Improvement Plans — track remediation.

```sql
CREATE TABLE pip_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  reason text NOT NULL,
  metrics_at_open jsonb NOT NULL,
  metrics_at_close jsonb,
  outcome text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pip_records IS 'Performance Improvement Plan: opened by Cadence after TRAIN or PIP review.';
COMMENT ON COLUMN pip_records.outcome IS 'resolved | extended | retired (when closed)';
```

### 5. training_cycles
Tutor's training runs — patches + rollback safety.

```sql
CREATE TABLE training_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id text NOT NULL UNIQUE,
  triggered_by text NOT NULL,
  signals_consumed jsonb NOT NULL DEFAULT '{}'::jsonb,
  deltas_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  agents_affected text[] NOT NULL,
  changelog text,
  rollback_hash text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE training_cycles IS 'Weekly training runs by Tutor. Patches applied per agent. Rollback-safe.';
COMMENT ON COLUMN training_cycles.triggered_by IS 'post_build | weekly | manual | pattern_detected';
COMMENT ON COLUMN training_cycles.agents_affected IS 'Array of agent names patched in this cycle';
COMMENT ON COLUMN training_cycles.rollback_hash IS 'Git commit hash of memory state before this training cycle, for safety rollback';
```

### 6. training_patches
Individual patches per agent per cycle — granular tracking & rollback.

```sql
CREATE TABLE training_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES training_cycles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  patch_type text NOT NULL,
  content text NOT NULL,
  section_target text NOT NULL,
  applied bool NOT NULL DEFAULT false,
  applied_at timestamptz,
  rollback_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE training_patches IS 'Individual patch: one per agent per cycle. Supports granular rollback.';
COMMENT ON COLUMN training_patches.patch_type IS 'anti_pattern | smart_default | auto_fix | new_pattern';
COMMENT ON COLUMN training_patches.section_target IS 'Path in agent memory file, e.g. "decision-simulator.defaults.pricing"';
COMMENT ON COLUMN training_patches.rollback_content IS 'Previous content before patch, for rollback';
```

### 7. cost_logs
Token-level cost tracking per run.

```sql
CREATE TABLE cost_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens int NOT NULL,
  output_tokens int NOT NULL,
  cost_usd numeric(10, 6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cost_logs IS 'Per-run token cost. Enables LLM ROI analysis and cost trending.';
COMMENT ON COLUMN cost_logs.model IS 'Model ID (e.g., "claude-opus-4-20250514", "claude-haiku-4-5-20251001")';
```

### 8. pattern_usage
Track which patterns agents apply — learning & best-practice adoption.

```sql
CREATE TABLE pattern_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pattern_file text NOT NULL,
  pattern_name text NOT NULL,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  outcome text,
  used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pattern_usage IS 'Tracks when agents apply patterns from memory. Outcome: helped | neutral | hurt.';
```

### 9. delegation_graph
Inter-agent task handoff network.

```sql
CREATE TABLE delegation_graph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  success bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE delegation_graph IS 'Agent-to-agent task delegation. Used to detect bottlenecks and poor routing.';
```

### 10. incidents
Production bugs traced to agent work.

```sql
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  severity text NOT NULL,
  description text NOT NULL,
  root_cause text,
  resolved bool NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE incidents IS 'Production incidents traced to agent task. Severity: S1 | S2 | S3 | S4.';
```

### 11. memory_updates
Audit trail of all changes to `~/.claude/memory/`.

```sql
CREATE TABLE memory_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_by text NOT NULL,
  file_path text NOT NULL,
  change_type text NOT NULL,
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE memory_updates IS 'Immutable audit log. Tracks every change to memory files by agent or human.';
COMMENT ON COLUMN memory_updates.updated_by IS 'Agent name (e.g., "mira", "koda") or "yash"';
COMMENT ON COLUMN memory_updates.change_type IS 'create | update | delete';
```

### 12. yash_overrides
Every time Yash corrects an agent — for learning extraction.

```sql
CREATE TABLE yash_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  override_type text NOT NULL,
  original_output text NOT NULL,
  corrected_output text NOT NULL,
  lesson_extracted bool NOT NULL DEFAULT false,
  lesson_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE yash_overrides IS 'High-signal feedback: Yash corrections. Used by Mira to extract lessons.';
```

### 13. capability_gaps
Missing capabilities detected by Roster — roadmap for new agents.

```sql
CREATE TABLE capability_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_by text NOT NULL,
  description text NOT NULL,
  required_skills text[] NOT NULL,
  proposed_agent text,
  status text NOT NULL DEFAULT 'detected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE capability_gaps IS 'Gaps detected by Roster. Status: detected | approved | building | deployed | rejected.';
```

### 14. proposed_patterns
Mira''s semi-auto detected patterns awaiting Yash review.

```sql
CREATE TABLE proposed_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_by text NOT NULL,
  pattern_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE proposed_patterns IS 'Semi-auto pattern extraction by Mira. Status: proposed | approved | rejected.';
COMMENT ON COLUMN proposed_patterns.pattern_type IS 'good | avoid | optimization | security | performance';
COMMENT ON COLUMN proposed_patterns.evidence IS 'run_ids, frequency, impact metrics proving the pattern works/fails';
```

### 15. agent_events
Real-time event bus — full observability of agent lifecycle.

```sql
CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agent_events IS 'Event stream for real-time observability. Immutable append-only log.';
COMMENT ON COLUMN agent_events.event_type IS 'task_started | task_completed | task_failed | file_changed | memory_loaded | retry_triggered | gate_passed | gate_failed | cost_logged | delegation_sent | pattern_applied | yash_override';
```

---

## Complete Migration SQL

Save this as `supabase/migrations/20260414000000_agent_ops_initial.sql`:

```sql
-- Migration: 20260414000000_agent_ops_initial.sql
-- Purpose: Full agent-ops database for Boldteq HR & performance tracking
-- Rollback: Requires manual cleanup of all tables, functions, triggers, views

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- agents: Agent identity, role, level, stats
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  title text NOT NULL,
  department text NOT NULL,
  phase text NOT NULL,
  level int NOT NULL DEFAULT 2 CHECK (level BETWEEN 1 AND 4),
  level_title text GENERATED ALWAYS AS (
    CASE level
      WHEN 1 THEN 'Probation'
      WHEN 2 THEN 'Active'
      WHEN 3 THEN 'Expert'
      WHEN 4 THEN 'Architect'
      ELSE 'Unknown'
    END
  ) STORED,
  status text NOT NULL DEFAULT 'deployed' CHECK (status IN ('provisioned', 'deployed', 'training', 'pip', 'retired')),
  reports_to uuid REFERENCES agents(id) ON DELETE SET NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{
    "run_count": 0,
    "success_rate": 0.0,
    "avg_composite_score": 0.0,
    "total_cost_usd": 0.0,
    "last_run_at": null
  }'::jsonb,
  hired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_level ON agents(level);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_department ON agents(department);
CREATE INDEX idx_agents_reports_to ON agents(reports_to);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select_all" ON agents
  FOR SELECT USING (true);

CREATE POLICY "agents_service_role" ON agents
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE agents IS 'Agent identity, role, level, and running stats. Replaces registry.json.';
COMMENT ON COLUMN agents.skills IS 'Array of skill tags: ["DB", "API", "UI", "Testing", "DevOps", "Security"]';
COMMENT ON COLUMN agents.stats IS 'Running aggregate: run_count, success_rate, avg_composite_score, total_cost_usd, last_run_at';

-- agent_runs: Every execution
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id text NOT NULL UNIQUE,
  task_type text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('SUCCESS', 'FAILURE', 'TIMEOUT', 'REGRESSION', 'ANTIPATTERN', 'ESCALATED')),
  duration_ms int NOT NULL,
  token_count int,
  cost_usd numeric(10, 6),
  retries int NOT NULL DEFAULT 0 CHECK (retries >= 0),
  files_changed int NOT NULL DEFAULT 0,
  gates_passed int NOT NULL DEFAULT 0,
  gates_failed int NOT NULL DEFAULT 0,
  first_try_success bool NOT NULL DEFAULT false,
  yash_override bool NOT NULL DEFAULT false,
  composite_score numeric(5, 2),
  output_summary text,
  error_log text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_agent_id ON agent_runs(agent_id);
CREATE INDEX idx_agent_runs_classification ON agent_runs(classification);
CREATE INDEX idx_agent_runs_created_at ON agent_runs(created_at DESC);
CREATE INDEX idx_agent_runs_composite_score ON agent_runs(composite_score DESC);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_select_all" ON agent_runs
  FOR SELECT USING (true);

CREATE POLICY "agent_runs_service_role" ON agent_runs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE agent_runs IS 'Every agent task execution. Central table for performance analysis.';
COMMENT ON COLUMN agent_runs.run_id IS 'Unique run identifier from orchestration system (e.g., "yash-2026-04-14-001")';
COMMENT ON COLUMN agent_runs.classification IS 'SUCCESS | FAILURE | TIMEOUT | REGRESSION | ANTIPATTERN | ESCALATED';
COMMENT ON COLUMN agent_runs.composite_score IS 'Computed on INSERT via trigger, 0–100';

-- agent_reviews: Periodic HR reviews
CREATE TABLE agent_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  classification text NOT NULL CHECK (classification IN ('PROMOTE', 'SCALE', 'STEADY', 'TRAIN', 'PIP', 'RETIRE')),
  rationale text NOT NULL,
  peer_avg_score numeric(5, 2),
  agent_avg_score numeric(5, 2),
  decision_approved bool NOT NULL DEFAULT false,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_reviews_agent_id ON agent_reviews(agent_id);
CREATE INDEX idx_agent_reviews_review_date ON agent_reviews(review_date DESC);
CREATE INDEX idx_agent_reviews_period ON agent_reviews(period_start, period_end);

ALTER TABLE agent_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_reviews_select_all" ON agent_reviews
  FOR SELECT USING (true);

CREATE POLICY "agent_reviews_service_role" ON agent_reviews
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE agent_reviews IS 'Cadence''s weekly review: promotion, scale, train, PIP, retire.';
COMMENT ON COLUMN agent_reviews.classification IS 'PROMOTE | SCALE | STEADY | TRAIN | PIP | RETIRE';

-- pip_records: Performance Improvement Plans
CREATE TABLE pip_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  reason text NOT NULL,
  metrics_at_open jsonb NOT NULL,
  metrics_at_close jsonb,
  outcome text CHECK (outcome IS NULL OR outcome IN ('resolved', 'extended', 'retired')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pip_records_agent_id ON pip_records(agent_id);
CREATE INDEX idx_pip_records_deadline ON pip_records(deadline);

ALTER TABLE pip_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pip_records_select_all" ON pip_records
  FOR SELECT USING (true);

CREATE POLICY "pip_records_service_role" ON pip_records
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE pip_records IS 'Performance Improvement Plan: opened by Cadence after TRAIN or PIP review.';

-- ============================================================================
-- TRAINING TABLES
-- ============================================================================

-- training_cycles: Tutor''s training runs
CREATE TABLE training_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id text NOT NULL UNIQUE,
  triggered_by text NOT NULL CHECK (triggered_by IN ('post_build', 'weekly', 'manual', 'pattern_detected')),
  signals_consumed jsonb NOT NULL DEFAULT '{}'::jsonb,
  deltas_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  agents_affected text[] NOT NULL,
  changelog text,
  rollback_hash text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_cycles_applied_at ON training_cycles(applied_at DESC);
CREATE INDEX idx_training_cycles_agents_affected ON training_cycles USING GIN(agents_affected);

ALTER TABLE training_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_cycles_select_all" ON training_cycles
  FOR SELECT USING (true);

CREATE POLICY "training_cycles_service_role" ON training_cycles
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE training_cycles IS 'Weekly training runs by Tutor. Patches applied per agent. Rollback-safe.';

-- training_patches: Individual patches per agent per cycle
CREATE TABLE training_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES training_cycles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  patch_type text NOT NULL CHECK (patch_type IN ('anti_pattern', 'smart_default', 'auto_fix', 'new_pattern')),
  content text NOT NULL,
  section_target text NOT NULL,
  applied bool NOT NULL DEFAULT false,
  applied_at timestamptz,
  rollback_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_patches_cycle_id ON training_patches(cycle_id);
CREATE INDEX idx_training_patches_agent_id ON training_patches(agent_id);
CREATE INDEX idx_training_patches_applied ON training_patches(applied);

ALTER TABLE training_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_patches_select_all" ON training_patches
  FOR SELECT USING (true);

CREATE POLICY "training_patches_service_role" ON training_patches
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE training_patches IS 'Individual patch: one per agent per cycle. Supports granular rollback.';

-- ============================================================================
-- ANALYTICS TABLES
-- ============================================================================

-- cost_logs: Token-level cost tracking
CREATE TABLE cost_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens int NOT NULL CHECK (input_tokens >= 0),
  output_tokens int NOT NULL CHECK (output_tokens >= 0),
  cost_usd numeric(10, 6) NOT NULL CHECK (cost_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_logs_run_id ON cost_logs(run_id);
CREATE INDEX idx_cost_logs_agent_id ON cost_logs(agent_id);
CREATE INDEX idx_cost_logs_model ON cost_logs(model);

ALTER TABLE cost_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_logs_select_all" ON cost_logs
  FOR SELECT USING (true);

CREATE POLICY "cost_logs_service_role" ON cost_logs
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE cost_logs IS 'Per-run token cost. Enables LLM ROI analysis and cost trending.';

-- pattern_usage: Which patterns agents apply
CREATE TABLE pattern_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pattern_file text NOT NULL,
  pattern_name text NOT NULL,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('helped', 'neutral', 'hurt')),
  used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pattern_usage_agent_id ON pattern_usage(agent_id);
CREATE INDEX idx_pattern_usage_pattern_file ON pattern_usage(pattern_file);
CREATE INDEX idx_pattern_usage_used_at ON pattern_usage(used_at DESC);

ALTER TABLE pattern_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pattern_usage_select_all" ON pattern_usage
  FOR SELECT USING (true);

CREATE POLICY "pattern_usage_service_role" ON pattern_usage
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE pattern_usage IS 'Tracks when agents apply patterns from memory. Outcome: helped | neutral | hurt.';

-- delegation_graph: Inter-agent task handoff network
CREATE TABLE delegation_graph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  to_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  success bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_delegation_graph_from ON delegation_graph(from_agent_id);
CREATE INDEX idx_delegation_graph_to ON delegation_graph(to_agent_id);
CREATE INDEX idx_delegation_graph_success ON delegation_graph(success);

ALTER TABLE delegation_graph ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delegation_graph_select_all" ON delegation_graph
  FOR SELECT USING (true);

CREATE POLICY "delegation_graph_service_role" ON delegation_graph
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE delegation_graph IS 'Agent-to-agent task delegation. Used to detect bottlenecks and poor routing.';

-- ============================================================================
-- AUDIT & COMPLIANCE TABLES
-- ============================================================================

-- incidents: Production bugs traced to agent work
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  description text NOT NULL,
  root_cause text,
  resolved bool NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_agent_id ON incidents(agent_id);
CREATE INDEX idx_incidents_severity ON incidents(severity);
CREATE INDEX idx_incidents_resolved ON incidents(resolved);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents_select_all" ON incidents
  FOR SELECT USING (true);

CREATE POLICY "incidents_service_role" ON incidents
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE incidents IS 'Production incidents traced to agent task. Severity: S1 | S2 | S3 | S4.';

-- memory_updates: Audit trail of all memory changes
CREATE TABLE memory_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_by text NOT NULL,
  file_path text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_updates_updated_by ON memory_updates(updated_by);
CREATE INDEX idx_memory_updates_file_path ON memory_updates(file_path);
CREATE INDEX idx_memory_updates_created_at ON memory_updates(created_at DESC);

ALTER TABLE memory_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_updates_select_all" ON memory_updates
  FOR SELECT USING (true);

CREATE POLICY "memory_updates_service_role" ON memory_updates
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE memory_updates IS 'Immutable audit log. Tracks every change to memory files by agent or human.';

-- yash_overrides: Corrections by Yash
CREATE TABLE yash_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  override_type text NOT NULL,
  original_output text NOT NULL,
  corrected_output text NOT NULL,
  lesson_extracted bool NOT NULL DEFAULT false,
  lesson_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_yash_overrides_agent_id ON yash_overrides(agent_id);
CREATE INDEX idx_yash_overrides_lesson_extracted ON yash_overrides(lesson_extracted);
CREATE INDEX idx_yash_overrides_created_at ON yash_overrides(created_at DESC);

ALTER TABLE yash_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yash_overrides_select_all" ON yash_overrides
  FOR SELECT USING (true);

CREATE POLICY "yash_overrides_service_role" ON yash_overrides
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE yash_overrides IS 'High-signal feedback: Yash corrections. Used by Mira to extract lessons.';

-- capability_gaps: Missing capabilities
CREATE TABLE capability_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_by text NOT NULL,
  description text NOT NULL,
  required_skills text[] NOT NULL,
  proposed_agent text,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'approved', 'building', 'deployed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_capability_gaps_status ON capability_gaps(status);

ALTER TABLE capability_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capability_gaps_select_all" ON capability_gaps
  FOR SELECT USING (true);

CREATE POLICY "capability_gaps_service_role" ON capability_gaps
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE capability_gaps IS 'Gaps detected by Roster. Status: detected | approved | building | deployed | rejected.';

-- proposed_patterns: Semi-auto detected patterns awaiting Yash review
CREATE TABLE proposed_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_by text NOT NULL,
  pattern_type text NOT NULL CHECK (pattern_type IN ('good', 'avoid', 'optimization', 'security', 'performance')),
  title text NOT NULL,
  content text NOT NULL,
  evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposed_patterns_status ON proposed_patterns(status);
CREATE INDEX idx_proposed_patterns_pattern_type ON proposed_patterns(pattern_type);

ALTER TABLE proposed_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposed_patterns_select_all" ON proposed_patterns
  FOR SELECT USING (true);

CREATE POLICY "proposed_patterns_service_role" ON proposed_patterns
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE proposed_patterns IS 'Semi-auto pattern extraction by Mira. Status: proposed | approved | rejected.';

-- ============================================================================
-- EVENT BUS TABLE
-- ============================================================================

-- agent_events: Real-time event stream
CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_events_agent_id ON agent_events(agent_id);
CREATE INDEX idx_agent_events_run_id ON agent_events(run_id);
CREATE INDEX idx_agent_events_event_type ON agent_events(event_type);
CREATE INDEX idx_agent_events_created_at ON agent_events(created_at DESC);

ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_events_select_all" ON agent_events
  FOR SELECT USING (true);

CREATE POLICY "agent_events_service_role" ON agent_events
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE agent_events IS 'Event stream for real-time observability. Immutable append-only log.';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- compute_composite_score: Calculate weighted score from run metrics
CREATE OR REPLACE FUNCTION compute_composite_score(
  p_gate_pass_rate numeric,
  p_first_try_success numeric,
  p_rework_cycles numeric,
  p_yash_override_rate numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    (COALESCE(p_gate_pass_rate, 0) * 0.40) +
    (COALESCE(p_first_try_success, 0) * 0.30) +
    ((100 - COALESCE(p_rework_cycles, 0)) * 0.20 / 100) +
    ((100 - COALESCE(p_yash_override_rate, 0)) * 0.10 / 100)
  )::numeric(5, 2);
$$ COMMENT ON FUNCTION compute_composite_score IS 'Weighted composite score: gate 40%, first_try 30%, rework 20%, yash_override 10%';

-- get_agent_peer_avg: Average composite score of peers (same level) in a date range
CREATE OR REPLACE FUNCTION get_agent_peer_avg(
  p_agent_id uuid,
  p_days int DEFAULT 14
) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(AVG(ar.composite_score), 0)::numeric(5, 2)
  FROM agent_runs ar
  JOIN agents a ON ar.agent_id = a.id
  WHERE a.level = (SELECT level FROM agents WHERE id = p_agent_id)
    AND ar.created_at >= NOW() - (p_days || ' days')::interval
    AND ar.agent_id != p_agent_id
    AND ar.classification = 'SUCCESS';
$$ COMMENT ON FUNCTION get_agent_peer_avg IS 'Average composite score of agents at same level in past N days (default 14).';

-- should_promote: Check if agent qualifies for promotion
CREATE OR REPLACE FUNCTION should_promote(
  p_agent_id uuid
) RETURNS bool LANGUAGE sql STABLE AS $$
  SELECT (
    SELECT AVG(composite_score)
    FROM agent_runs
    WHERE agent_id = p_agent_id
      AND created_at >= NOW() - interval '14 days'
      AND classification = 'SUCCESS'
  ) > get_agent_peer_avg(p_agent_id, 14)
  AND (
    SELECT COUNT(*)
    FROM agent_runs
    WHERE agent_id = p_agent_id
      AND created_at >= NOW() - interval '14 days'
  ) >= 5;
$$ COMMENT ON FUNCTION should_promote IS 'Returns true if agent avg > peer avg AND >= 5 runs in 14 days.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-compute composite_score on agent_runs INSERT
CREATE OR REPLACE FUNCTION fn_compute_run_composite_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  gate_rate numeric;
  first_try numeric;
  rework numeric;
  override_rate numeric;
BEGIN
  -- Calculate gate pass rate
  gate_rate := CASE
    WHEN (NEW.gates_passed + NEW.gates_failed) = 0 THEN 100
    ELSE (NEW.gates_passed::numeric / (NEW.gates_passed + NEW.gates_failed)::numeric) * 100
  END;

  -- Calculate first try success (0 or 100)
  first_try := CASE WHEN NEW.first_try_success THEN 100 ELSE 0 END;

  -- Calculate rework cycles (inverse of retries, capped at 100)
  rework := LEAST(NEW.retries * 20, 100);

  -- Calculate yash override rate (0 or 100)
  override_rate := CASE WHEN NEW.yash_override THEN 100 ELSE 0 END;

  -- Compute composite score
  NEW.composite_score := compute_composite_score(gate_rate, first_try, rework, override_rate);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_agent_runs_compute_score
BEFORE INSERT ON agent_runs
FOR EACH ROW
EXECUTE FUNCTION fn_compute_run_composite_score();

-- Trigger: Auto-update agent.stats jsonb on agent_runs INSERT
CREATE OR REPLACE FUNCTION fn_update_agent_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total_runs int;
  success_count int;
  avg_score numeric;
  total_cost numeric;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE classification = 'SUCCESS'),
    AVG(composite_score),
    SUM(cost_usd)
  INTO total_runs, success_count, avg_score, total_cost
  FROM agent_runs
  WHERE agent_id = NEW.agent_id;

  UPDATE agents
  SET stats = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          stats,
          '{run_count}',
          to_jsonb(total_runs)
        ),
        '{success_rate}',
        to_jsonb(ROUND(success_count::numeric / NULLIF(total_runs, 0), 2))
      ),
      '{avg_composite_score}',
      to_jsonb(ROUND(COALESCE(avg_score, 0), 2))
    ),
    '{last_run_at}',
    to_jsonb(NEW.created_at)
  ),
  updated_at = NOW()
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_agent_runs_update_stats
AFTER INSERT ON agent_runs
FOR EACH ROW
EXECUTE FUNCTION fn_update_agent_stats();

-- Trigger: Auto-update updated_at timestamp on all tables
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_agent_runs_updated_at BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_agent_reviews_updated_at BEFORE UPDATE ON agent_reviews FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_pip_records_updated_at BEFORE UPDATE ON pip_records FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_training_cycles_updated_at BEFORE UPDATE ON training_cycles FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_training_patches_updated_at BEFORE UPDATE ON training_patches FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_delegation_graph_updated_at BEFORE UPDATE ON delegation_graph FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_yash_overrides_updated_at BEFORE UPDATE ON yash_overrides FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trig_proposed_patterns_updated_at BEFORE UPDATE ON proposed_patterns FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Agent leaderboard
CREATE OR REPLACE VIEW agent_leaderboard AS
SELECT
  a.id,
  a.name,
  a.title,
  a.level_title,
  a.department,
  a.status,
  COALESCE((a.stats ->> 'run_count')::int, 0) as run_count,
  COALESCE((a.stats ->> 'success_rate')::numeric, 0) as success_rate,
  COALESCE((a.stats ->> 'avg_composite_score')::numeric, 0) as composite_score,
  COALESCE((a.stats ->> 'total_cost_usd')::numeric, 0) as total_cost_usd,
  (a.stats ->> 'last_run_at')::timestamptz as last_run_at,
  RANK() OVER (ORDER BY COALESCE((a.stats ->> 'avg_composite_score')::numeric, 0) DESC) as rank
FROM agents a
WHERE a.status IN ('deployed', 'training')
ORDER BY composite_score DESC;

COMMENT ON VIEW agent_leaderboard IS 'Agents ranked by composite score, with stats and rank.';

-- View: Recent activity
CREATE OR REPLACE VIEW recent_activity AS
SELECT
  ae.id,
  ae.agent_id,
  a.name as agent_name,
  ae.event_type,
  ae.payload,
  ar.run_id,
  ar.classification,
  ar.composite_score,
  ae.created_at
FROM agent_events ae
LEFT JOIN agents a ON ae.agent_id = a.id
LEFT JOIN agent_runs ar ON ae.run_id = ar.id
ORDER BY ae.created_at DESC
LIMIT 50;

COMMENT ON VIEW recent_activity IS 'Last 50 events across all agents with agent/run context.';

-- View: Agent probation watch (new agents, first 10 runs)
CREATE OR REPLACE VIEW probation_watch AS
SELECT
  a.id,
  a.name,
  a.hired_at,
  COUNT(ar.id) as run_count,
  COALESCE(AVG(ar.composite_score), 0)::numeric(5, 2) as avg_score,
  COUNT(ar.id) FILTER (WHERE ar.classification = 'SUCCESS')::float / NULLIF(COUNT(ar.id), 0) as success_rate,
  MAX(ar.created_at) as last_run
FROM agents a
LEFT JOIN agent_runs ar ON a.id = ar.agent_id AND ar.created_at >= a.hired_at
WHERE a.level = 1
GROUP BY a.id, a.name, a.hired_at
ORDER BY a.hired_at DESC;

COMMENT ON VIEW probation_watch IS 'Probation agents with run progress toward promotion (target: 10 runs, avg > peer).';

-- View: Training impact (which patches help/hurt)
CREATE OR REPLACE VIEW training_impact AS
SELECT
  tc.cycle_id,
  tc.triggered_by,
  tp.agent_id,
  a.name as agent_name,
  tp.patch_type,
  COUNT(pu.id) as times_applied,
  COUNT(pu.id) FILTER (WHERE pu.outcome = 'helped') as helped_count,
  COUNT(pu.id) FILTER (WHERE pu.outcome = 'hurt') as hurt_count,
  ROUND(COUNT(pu.id) FILTER (WHERE pu.outcome = 'helped')::numeric / NULLIF(COUNT(pu.id), 0), 2) as efficacy
FROM training_cycles tc
JOIN training_patches tp ON tc.id = tp.cycle_id
JOIN agents a ON tp.agent_id = a.id
LEFT JOIN pattern_usage pu ON a.id = pu.agent_id
  AND tc.applied_at::date <= pu.used_at::date
  AND pu.used_at::date <= (tc.applied_at + interval '14 days')::date
WHERE tp.applied = true
GROUP BY tc.cycle_id, tc.triggered_by, tp.agent_id, a.name, tp.patch_type
ORDER BY tc.applied_at DESC;

COMMENT ON VIEW training_impact IS 'Training cycle effectiveness: how many patches helped vs hurt agents.';
```

---

## RLS Policies

All tables follow this pattern:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Public read (all authenticated users see all rows)
CREATE POLICY "<table>_select_all" ON <table>
  FOR SELECT USING (true);

-- Service role can do anything (internal-only, no user auth)
CREATE POLICY "<table>_service_role" ON <table>
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**Rationale:** This is an internal HR system accessed only via service role (agents calling via API + Mira using Supabase CLI). No user auth required. RLS is enabled per Boldteq standards but all public policies grant access (no row filtering). Service role has full write access.

---

## Functions, Triggers, Views

### Functions

1. **`compute_composite_score(gate_pass_rate, first_try_success, rework_cycles, yash_override_rate)`**
   - Calculates 0–100 score
   - Formula: `gate * 0.40 + first_try * 0.30 + (100 - rework) * 0.20 / 100 + (100 - override) * 0.10 / 100`
   - Used in trigger when agent_runs INSERT

2. **`get_agent_peer_avg(agent_id, days=14)`**
   - Returns average composite_score of agents at same level in the past N days
   - Excludes the agent itself
   - Used in promotion logic

3. **`should_promote(agent_id)`**
   - Returns bool
   - True if: (1) agent's avg score > peer avg AND (2) agent has >= 5 runs in last 14 days
   - Called by Cadence to determine promotion eligibility

### Triggers

1. **`trig_agent_runs_compute_score`** (BEFORE INSERT)
   - Auto-computes composite_score from gate_pass_rate, first_try_success, rework_cycles, yash_override_rate
   - Prevents manual score entry errors

2. **`trig_agent_runs_update_stats`** (AFTER INSERT)
   - Auto-updates agents.stats jsonb (run_count, success_rate, avg_composite_score, last_run_at)
   - Keeps agents table metrics current without manual updates

3. **`trig_*_updated_at`** (BEFORE UPDATE on all tables)
   - Auto-updates updated_at timestamp
   - Standard pattern for all Supabase tables

### Views

1. **`agent_leaderboard`**
   - All agents ranked by composite_score
   - Includes: name, level, department, run_count, success_rate, total_cost, rank
   - Filtered to deployed/training status only

2. **`recent_activity`**
   - Last 50 events across all agents
   - Joins agent_events → agents + agent_runs for context
   - Used by Hawk (monitoring) and Mira (pattern detection)

3. **`probation_watch`**
   - Probation agents only (level=1)
   - Shows run_count, avg_score, success_rate, last_run
   - Witness uses this to decide promotion vs. retirement

4. **`training_impact`**
   - Per training cycle, per agent, shows patch efficacy
   - Counts times patches were applied, helped vs. hurt
   - Tutor uses this to iterate training strategy

---

## Usage Patterns by Agent

### Cadence (Head of People)
```sql
-- Monday 09:00 UTC: Weekly review sweep
SELECT agent_id, name, level, status, run_count, avg_composite_score
FROM agent_leaderboard
WHERE status IN ('deployed', 'training')
ORDER BY level, composite_score DESC;

-- Get peer avg for promotion decision
SELECT get_agent_peer_avg(agent_id, 14) as peer_avg;

-- Insert review
INSERT INTO agent_reviews (agent_id, review_date, period_start, period_end, classification, rationale)
VALUES (...);

-- Promote agent
UPDATE agents SET level = level + 1 WHERE id = ... AND level < 4;
```

### Witness (Performance Tracker)
```sql
-- Daily sweep: classify yesterday's runs
SELECT ar.id, ar.agent_id, ar.classification, ar.duration_ms, ar.retries
FROM agent_runs ar
WHERE ar.created_at >= CURRENT_DATE - interval '1 day'
  AND ar.created_at < CURRENT_DATE
ORDER BY ar.agent_id;

-- Check probation agents
SELECT * FROM probation_watch WHERE run_count < 10;

-- Log incident
INSERT INTO incidents (agent_id, run_id, severity, description)
VALUES (...);
```

### Tutor (Bulk Trainer)
```sql
-- Weekly training cycle (Sundays 02:00 UTC)
INSERT INTO training_cycles (cycle_id, triggered_by, agents_affected, changelog, rollback_hash)
VALUES ('sunday-2026-w15', 'weekly', ARRAY['koda', 'vex', 'arya'], '...', 'abc123def456');

-- Per-agent patch
INSERT INTO training_patches (cycle_id, agent_id, patch_type, content, section_target)
VALUES (...);

-- Post-apply, check efficacy
SELECT * FROM training_impact WHERE cycle_id = ...;
```

### Mira (Memory Keeper)
```sql
-- Log memory change
INSERT INTO memory_updates (updated_by, file_path, change_type, diff_summary)
VALUES ('mira', 'patterns/good/antipatterns.md', 'update', 'Added Shopify-specific GDPR rules');

-- Detect patterns from incidents
SELECT agent_id, COUNT(*) as incident_count, severity
FROM incidents
WHERE created_at >= NOW() - interval '7 days'
GROUP BY agent_id, severity
HAVING COUNT(*) >= 3;

-- Extract Yash override lessons
SELECT COUNT(*) FILTER (WHERE lesson_extracted = false) as unprocessed_lessons
FROM yash_overrides;

-- Propose pattern
INSERT INTO proposed_patterns (detected_by, pattern_type, title, content, evidence)
VALUES (...);
```

### Roster (Registry Keeper)
```sql
-- Detect capability gaps
INSERT INTO capability_gaps (detected_by, description, required_skills, status)
VALUES ('roster', 'No agent specializes in AI agent architecture', ARRAY['AI', 'Prompt Engineering', 'LLM APIs'], 'detected');

-- Check proposed agents
SELECT * FROM proposed_patterns WHERE status = 'proposed' ORDER BY created_at DESC;
```

### Forge (Agent Architect)
```sql
-- When capability gap approved, draft new agent
-- (Forge doesn't write to DB directly; outputs agent template to memory)
```

### Hawk (Monitoring)
```sql
-- Post-deployment: monitor for regressions
SELECT ar.agent_id, a.name, COUNT(*) as recent_failures
FROM agent_runs ar
JOIN agents a ON ar.agent_id = a.id
WHERE ar.classification IN ('FAILURE', 'REGRESSION')
  AND ar.created_at >= NOW() - interval '24 hours'
GROUP BY ar.agent_id, a.name
HAVING COUNT(*) >= 2;

-- Check recent activity
SELECT * FROM recent_activity LIMIT 20;
```

---

## Initialization & Seeding

### From Current registry.json

To migrate existing agents from `~/.claude/org/registry.json`:

```sql
-- Example seed (adapt column mapping as needed):
INSERT INTO agents (name, title, department, phase, level, status, skills, hired_at)
VALUES
  ('scout', 'Idea Validator', 'SHAPE', 'SHAPE', 2, 'deployed', '["SaaS", "Market Research"]'::jsonb, NOW()),
  ('vex', 'Bug Fixer', 'BUILD', 'BUILD', 3, 'deployed', '["Debugging", "Triage"]'::jsonb, NOW()),
  ('arya', 'Architecture', 'VALIDATE', 'VALIDATE', 3, 'deployed', '["System Design", "Data Modeling"]'::jsonb, NOW()),
  ...;
```

### First Run Setup

1. **Apply migration** via Supabase CLI:
   ```bash
   supabase migration up --skip-seed
   ```

2. **Seed initial agents** (use the INSERT example above)

3. **Enable Realtime** for agent_events:
   ```bash
   supabase realtime on agent_events
   ```

4. **Verify RLS:**
   ```bash
   supabase test rls --policy-file=supabase/migrations/20260414000000_agent_ops_initial.sql
   ```

---

## Connection Pooling & Performance

### For Railway Production

Use **Supabase connection pooling** in Session Mode:

```env
DATABASE_URL=postgresql://[user]:[pass]@[host]:6543/[db]?schema=public
```

- Port `6543` = pooler (Session mode recommended for variable load)
- Port `5432` = direct Postgres (use only for long-running jobs)

### For Local Development

```bash
supabase start
# Automatically creates local Postgres with RLS + all migrations applied
```

---

## Deployment Checklist

- [ ] Migration applied to production Supabase
- [ ] RLS policies tested with `supabase test rls`
- [ ] Realtime enabled for agent_events (if using Realtime for dashboards)
- [ ] Initial agents seeded
- [ ] Indexes verified (all FK + frequently-queried columns have indexes)
- [ ] Functions tested (composite_score, peer_avg, should_promote)
- [ ] Views accessible (leaderboard, recent_activity, probation_watch)
- [ ] Cost logging integration verified (Koda/Hawk log to cost_logs on every run)
- [ ] Training cycle workflow end-to-end tested

---

## What This Database Enables

✅ **HR Workflow:** Cadence reviews agents weekly, auto-calculates peer avg, promotes based on data  
✅ **Training Loop:** Tutor proposes patches, applies per agent, Mira tracks efficacy  
✅ **Incident Root Cause:** Link production bugs back to agent run + override history  
✅ **Cost Visibility:** Full token spend per agent per run per model  
✅ **Probation Enforcement:** Witness watches new agents, auto-grades first 10 runs  
✅ **Pattern Learning:** Mira detects repeating good/bad patterns, proposes to Yash  
✅ **Audit Trail:** Every memory change, override, and incident is logged immutably  
✅ **Real-Time Dashboards:** Event stream enables live agent status monitoring

---

**Ready to deploy.** This schema replaces registry.json with a production-grade system of record.

---

# HR Constitution v1 — Schema Additions (2026-04-27)

The 50 ratified Q-decisions in `~/.claude/memory/patterns/good/hr-constitution-v1.md` require the following additions. All follow standard project conventions: RLS on, indexes on FKs + frequently queried columns, `updated_at` trigger, soft-delete via `deleted_at` only when needed.

## New Tables

### `hr_arbitration` (Q1 — Witness↔Cadence tribunal)
```sql
CREATE TABLE hr_arbitration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  opened_at timestamptz NOT NULL DEFAULT NOW(),
  closing_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  witness_payload jsonb NOT NULL,
  cadence_payload jsonb NOT NULL,
  tribunal_score numeric(4,3),
  resolution text CHECK (resolution IN ('witness_wins','cadence_wins','escalated_to_yash','timed_out')),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_hr_arbitration_agent ON hr_arbitration(agent_id);
CREATE INDEX idx_hr_arbitration_open ON hr_arbitration(closing_at) WHERE resolved_at IS NULL;
ALTER TABLE hr_arbitration ENABLE ROW LEVEL SECURITY;
```

### `training_locks` (Q2 — Tutor↔Witness interlock)
```sql
CREATE TABLE training_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  cycle_id uuid REFERENCES training_cycles(id),
  locked_at timestamptz NOT NULL DEFAULT NOW(),
  locked_until timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  released_at timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_training_locks_active ON training_locks(agent_id) WHERE released_at IS NULL;
CREATE INDEX idx_training_locks_until ON training_locks(locked_until) WHERE released_at IS NULL;
ALTER TABLE training_locks ENABLE ROW LEVEL SECURITY;
```

### `pending_flags` (Q2 — Witness flags queued during training_lock)
```sql
CREATE TABLE pending_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  flag_type text NOT NULL,
  payload jsonb NOT NULL,
  apply_after timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution text CHECK (resolution IN ('fired','dropped_resolved_by_patch','dropped_pattern_change','expired')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pending_flags_apply ON pending_flags(apply_after) WHERE resolved_at IS NULL;
ALTER TABLE pending_flags ENABLE ROW LEVEL SECURITY;
```

### `dispatch_vetoes` (Q3 — Roster veto log)
```sql
CREATE TABLE dispatch_vetoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  task_id text NOT NULL,
  task_priority text NOT NULL CHECK (task_priority IN ('P0','P1','P2','P3','P4','P5')),
  severity text NOT NULL CHECK (severity IN ('WARNING','BLOCK')),
  reason text NOT NULL,
  proceeded boolean NOT NULL DEFAULT false,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dispatch_vetoes_agent_created ON dispatch_vetoes(agent_id, created_at DESC);
ALTER TABLE dispatch_vetoes ENABLE ROW LEVEL SECURITY;
```

### `forge_proposals` (Q4 — pre-deploy similarity hold)
```sql
CREATE TABLE forge_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_name text NOT NULL,
  proposed_spec jsonb NOT NULL,
  similarity_scores jsonb NOT NULL, -- {axis_skills, axis_tools, axis_model_tier, axis_mandate, composite}
  highest_overlap_agent_id uuid REFERENCES agents(id),
  status text NOT NULL CHECK (status IN ('pending_cadence_signoff','approved','rejected','auto_deployed')),
  cadence_decision text,
  cadence_decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_forge_proposals_status ON forge_proposals(status);
ALTER TABLE forge_proposals ENABLE ROW LEVEL SECURITY;
```

### `pattern_conflicts` (Q5 — Mira contested patterns)
```sql
CREATE TABLE pattern_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_a_id uuid NOT NULL REFERENCES proposed_patterns(id),
  pattern_b_id uuid NOT NULL REFERENCES proposed_patterns(id),
  domain_tag text,
  opened_at timestamptz NOT NULL DEFAULT NOW(),
  sla_due timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status text NOT NULL DEFAULT 'contested' CHECK (status IN ('contested','resolved','consolidated')),
  resolution text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pattern_conflicts_open ON pattern_conflicts(sla_due) WHERE status='contested';
CREATE INDEX idx_pattern_conflicts_domain_30d ON pattern_conflicts(domain_tag, opened_at DESC);
ALTER TABLE pattern_conflicts ENABLE ROW LEVEL SECURITY;
```

### `yash_queue` (Q6 — escalation queue)
```sql
CREATE TABLE yash_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent text NOT NULL,
  decision_type text NOT NULL,
  payload jsonb NOT NULL,
  sla_due timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','decided','expired_default')),
  decision text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_yash_queue_pending ON yash_queue(sla_due) WHERE status='pending';
ALTER TABLE yash_queue ENABLE ROW LEVEL SECURITY;
```

### `promotion_proposals` (Q7)
```sql
CREATE TABLE promotion_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  current_level int NOT NULL,
  proposed_level int NOT NULL,
  evidence jsonb NOT NULL,
  recommended_at timestamptz NOT NULL DEFAULT NOW(),
  yash_ratified_at timestamptz,
  witness_vetoed boolean NOT NULL DEFAULT false,
  veto_reason text,
  deferral_reason text, -- Q13: stale data, low stability
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ratified','vetoed','deferred','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_promotion_proposals_agent ON promotion_proposals(agent_id);
ALTER TABLE promotion_proposals ENABLE ROW LEVEL SECURITY;
```

### `pip_blocked_stale_data` (Q11 — audit trail for blocked PIPs)
```sql
CREATE TABLE pip_blocked_stale_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  attempted_at timestamptz NOT NULL DEFAULT NOW(),
  failed_axis text NOT NULL CHECK (failed_axis IN ('window','sample','recency')),
  axis_values jsonb NOT NULL,
  cadence_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pip_blocked_agent ON pip_blocked_stale_data(agent_id, attempted_at DESC);
ALTER TABLE pip_blocked_stale_data ENABLE ROW LEVEL SECURITY;
```

### `pip_appeals` (Q17)
```sql
CREATE TABLE pip_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pip_id uuid NOT NULL REFERENCES agent_pips_active(id),
  evidence jsonb NOT NULL,
  data_freshness_score numeric(4,3),
  peer_comparison_score numeric(4,3),
  mitigating_context_score numeric(4,3),
  composite_score numeric(4,3) NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT NOW(),
  yash_ratified_at timestamptz,
  outcome text CHECK (outcome IN ('suspended','denied','expired')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_pip_appeals_one_per_pip ON pip_appeals(pip_id);
ALTER TABLE pip_appeals ENABLE ROW LEVEL SECURITY;
```

### `post_mortems` (Q18, Q29 — blameless RCA records)
```sql
CREATE TABLE post_mortems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL,
  agent_ids uuid[] NOT NULL,
  root_cause text,
  root_cause_bucket text CHECK (root_cause_bucket IN ('template_defect','dispatch_routing','success_criteria','agent_individual','duplicate_hire','other')),
  signal_for_forge jsonb,
  signal_for_roster jsonb,
  signal_for_cadence jsonb,
  blameless boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_post_mortems_type ON post_mortems(incident_type);
ALTER TABLE post_mortems ENABLE ROW LEVEL SECURITY;
```

### `cost_warnings` (Q20 — soft warnings before breaker fires)
```sql
CREATE TABLE cost_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  task_id text NOT NULL,
  budget_multiple numeric(4,2) NOT NULL, -- 1.5, 2.0, 3.0
  budget_at_warn numeric(10,4) NOT NULL,
  spent_at_warn numeric(10,4) NOT NULL,
  action text NOT NULL CHECK (action IN ('warn_logged','graceful_stop','hard_kill')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cost_warnings_agent_created ON cost_warnings(agent_id, created_at DESC);
ALTER TABLE cost_warnings ENABLE ROW LEVEL SECURITY;
```

### `realtime_outages` (Q25 — channel uptime tracking)
```sql
CREATE TABLE realtime_outages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  outage_start timestamptz NOT NULL,
  outage_end timestamptz,
  duration_seconds int GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (outage_end - outage_start))::int) STORED,
  detected_by text NOT NULL,
  events_resynced int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_realtime_outages_channel ON realtime_outages(channel_name, outage_start DESC);
ALTER TABLE realtime_outages ENABLE ROW LEVEL SECURITY;
```

### `probation_trackers` (Q26 — parallel cohort tracking)
```sql
CREATE TABLE probation_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  cohort_id uuid,
  forge_template_id uuid,
  runs_seen int NOT NULL DEFAULT 0,
  composite_avg numeric(5,2),
  antipattern_count int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  status text NOT NULL DEFAULT 'watching' CHECK (status IN ('watching','graduated','extended','retired')),
  graduated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_probation_trackers_active ON probation_trackers(agent_id) WHERE status='watching';
CREATE INDEX idx_probation_trackers_cohort ON probation_trackers(cohort_id);
ALTER TABLE probation_trackers ENABLE ROW LEVEL SECURITY;
```

### `lineage_watch` and `lineage_attributions` (Q31 — sibling regression tracking)
```sql
CREATE TABLE lineage_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_patch_id uuid NOT NULL REFERENCES training_patches(id),
  source_agent_id uuid NOT NULL REFERENCES agents(id),
  sibling_agent_id uuid NOT NULL REFERENCES agents(id),
  similarity numeric(4,3) NOT NULL,
  watch_started timestamptz NOT NULL DEFAULT NOW(),
  watch_ends timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lineage_watch_active ON lineage_watch(watch_ends) WHERE triggered=false;

CREATE TABLE lineage_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sibling_agent_id uuid NOT NULL REFERENCES agents(id),
  source_patch_id uuid NOT NULL REFERENCES training_patches(id),
  regression_type text NOT NULL,
  regression_severity text NOT NULL,
  re_evaluation_outcome text CHECK (re_evaluation_outcome IN ('strengthen','revise','rollback','no_action')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lineage_attr_source ON lineage_attributions(source_patch_id);
ALTER TABLE lineage_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineage_attributions ENABLE ROW LEVEL SECURITY;
```

### `rollback_signals` (Q32 — patch rollback learning loop)
```sql
CREATE TABLE rollback_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_id uuid NOT NULL REFERENCES training_patches(id),
  contributing_pattern_ids uuid[] NOT NULL,
  rationale text NOT NULL,
  reviewed_by_mira boolean NOT NULL DEFAULT false,
  pattern_marked_contested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rollback_signals_patch ON rollback_signals(patch_id);
ALTER TABLE rollback_signals ENABLE ROW LEVEL SECURITY;
```

### `pattern_interactions` (Q34 — chain attribution analysis)
```sql
CREATE TABLE pattern_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_x_id uuid NOT NULL REFERENCES training_patches(id),
  patch_y_id uuid NOT NULL REFERENCES training_patches(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  regression_observed_at timestamptz NOT NULL,
  bisection_outcome text NOT NULL CHECK (bisection_outcome IN ('y_at_fault','x_at_fault','both_at_fault','interaction_only')),
  pattern_combination jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE pattern_interactions ENABLE ROW LEVEL SECURITY;
```

### `dormancy_reviews` (Q36 — pattern decay queue)
```sql
CREATE TABLE dormancy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES proposed_patterns(id),
  tagged_at timestamptz NOT NULL DEFAULT NOW(),
  decision_due timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  decision text CHECK (decision IN ('evergreen','archive','delete','default_archive')),
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dormancy_reviews_pending ON dormancy_reviews(decision_due) WHERE decision IS NULL;
ALTER TABLE dormancy_reviews ENABLE ROW LEVEL SECURITY;
```

### `brain_audit_reports` (Q40 — decisions vs doctrine reconciliation)
```sql
CREATE TABLE brain_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date date NOT NULL,
  decisions_audited int NOT NULL,
  flagged_count int NOT NULL,
  flagged_pattern_ids uuid[] NOT NULL,
  cadence_review_status text DEFAULT 'pending' CHECK (cadence_review_status IN ('pending','reviewed','patterns_updated')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_brain_audit_date ON brain_audit_reports(audit_date);
ALTER TABLE brain_audit_reports ENABLE ROW LEVEL SECURITY;
```

### `wall_clock_breaches` (Q44 — per-tier SLO violations)
```sql
CREATE TABLE wall_clock_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  run_id uuid REFERENCES agent_runs(id),
  tier text NOT NULL CHECK (tier IN ('CHEAP','FAST','DEEP')),
  slo_seconds int NOT NULL,
  actual_seconds int NOT NULL,
  hard_timeout_hit boolean NOT NULL DEFAULT false,
  state_saved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wall_clock_breaches_agent_7d ON wall_clock_breaches(agent_id, created_at DESC);
ALTER TABLE wall_clock_breaches ENABLE ROW LEVEL SECURITY;
```

### `hr_weekly_reports` (Q47)
```sql
CREATE TABLE hr_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_starting date NOT NULL,
  north_star_score numeric(4,3) NOT NULL,
  north_star_delta numeric(4,3),
  decisions_summary jsonb NOT NULL, -- {pip_count, promo_count, hire_count, rollback_count}
  sla_attainment jsonb NOT NULL,
  top_escalations jsonb,
  cost_of_hr_pct numeric(5,2),
  open_arbitrations jsonb,
  posted_at timestamptz NOT NULL DEFAULT NOW(),
  archived_to_path text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_hr_weekly_week ON hr_weekly_reports(week_starting);
ALTER TABLE hr_weekly_reports ENABLE ROW LEVEL SECURITY;
```

### `hr_360_reviews` (Q48 — quarterly HR-of-HR cross-evaluation)
```sql
CREATE TABLE hr_360_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter text NOT NULL, -- e.g. '2026-Q2'
  reviewer_agent_id uuid NOT NULL REFERENCES agents(id),
  reviewee_agent_id uuid NOT NULL REFERENCES agents(id),
  timeliness_score int NOT NULL CHECK (timeliness_score BETWEEN 1 AND 5),
  accuracy_score int NOT NULL CHECK (accuracy_score BETWEEN 1 AND 5),
  handoff_quality_score int NOT NULL CHECK (handoff_quality_score BETWEEN 1 AND 5),
  conflict_handling_score int NOT NULL CHECK (conflict_handling_score BETWEEN 1 AND 5),
  signal_dedup_score int NOT NULL CHECK (signal_dedup_score BETWEEN 1 AND 5),
  free_text_anonymous text,
  composite numeric(4,2) GENERATED ALWAYS AS ((timeliness_score + accuracy_score + handoff_quality_score + conflict_handling_score + signal_dedup_score)::numeric / 5) STORED,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_hr_360_unique ON hr_360_reviews(quarter, reviewer_agent_id, reviewee_agent_id);
ALTER TABLE hr_360_reviews ENABLE ROW LEVEL SECURITY;
```

### `agent_pattern_links` (Q30 — onboarding-to-pattern linkage)
```sql
CREATE TABLE agent_pattern_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  pattern_id uuid NOT NULL REFERENCES proposed_patterns(id),
  link_reason text,
  linked_by text NOT NULL DEFAULT 'mira',
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_agent_pattern_links ON agent_pattern_links(agent_id, pattern_id);
ALTER TABLE agent_pattern_links ENABLE ROW LEVEL SECURITY;
```

## New Columns on Existing Tables

```sql
-- Q6: ratification gate flag per-agent
ALTER TABLE agents ADD COLUMN flags text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Q28: cohort-baseline scoring during runs 1-5
ALTER TABLE agents ADD COLUMN forge_template_id uuid;
CREATE INDEX idx_agents_forge_template ON agents(forge_template_id);

-- Q41: per-agent budget override
ALTER TABLE cost_tracking ADD COLUMN budget_override numeric(10,2);
ALTER TABLE cost_tracking ADD COLUMN budget_override_approved_by text;
ALTER TABLE cost_tracking ADD COLUMN budget_override_approved_at timestamptz;

-- Q33: full provenance per training_patch
ALTER TABLE training_patches ADD COLUMN signal_id uuid;
ALTER TABLE training_patches ADD COLUMN pattern_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
ALTER TABLE training_patches ADD COLUMN prompt_diff_sha text;
ALTER TABLE training_patches ADD COLUMN predicted_delta numeric(5,3);
ALTER TABLE training_patches ADD COLUMN actual_delta numeric(5,3);

-- Q22: cross-patch attribution flags
ALTER TABLE training_patches ADD COLUMN attribution_unclear boolean NOT NULL DEFAULT false;
ALTER TABLE training_patches ADD COLUMN attribution_conflict boolean NOT NULL DEFAULT false;

-- Q19: regression history per author/source
ALTER TABLE training_patches ADD COLUMN author_regression_history boolean NOT NULL DEFAULT false;
```

## Realtime Channel Set (Q21)

5 named channels. All HR agents subscribe; per-agent filtering done client-side.

| Channel | Source events | Subscribers |
|---|---|---|
| `hr.runs` | `agent_runs` INSERT | Witness, Roster, Tutor |
| `hr.flags` | Witness antipattern + `incidents` INSERT | Cadence, Tutor, Mira |
| `hr.lifecycle` | `agents.status` UPDATE + lifecycle `agent_events` (promote/PIP/retire) | All HR + Yash digest |
| `hr.patches` | `training_patches` + `training_cycles` INSERT/UPDATE | Mira, Cadence, Witness |
| `hr.escalations` | rows matching Q10 paging criteria | Yash device + Cadence backup |

Enable with:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE training_patches;
ALTER PUBLICATION supabase_realtime ADD TABLE training_cycles;
```

Polling fallback per Q25: each HR agent maintains a 30s heartbeat. >2min missed → fall back to 60s polling on the source table; on channel restoration, re-sync via `created_at > last_seen_at`.

## Migration order

1. Create new tables (no FK conflicts with existing tables).
2. ALTER existing tables to add columns.
3. Add RLS policies (default: service_role full access; all other roles deny by default).
4. Enable Realtime publications.
5. Backfill `agents.forge_template_id` from existing Forge metadata if available; NULL is acceptable for legacy agents.
6. Verify with `~/.claude/memory/patterns/good/hr-constitution-v1.md` §"Verification protocol".

---

# Pod D — Shopify Website Department Schema (2026-04-30)

Pod D introduces client-work tracking. Distinct from internal Boldteq products (which use existing tables).

## New Table: `client_projects`

Tracks each client engagement run by Pod D from intake → live publish → retired.

```sql
CREATE TABLE client_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_handle text NOT NULL,  -- short-code for namespace use, e.g. 'acme'
  shopify_store_domain text NOT NULL,  -- e.g. acme.myshopify.com
  github_repo_url text,
  project_type text NOT NULL CHECK (project_type IN ('new_theme','theme_refresh','section_addition','migration')),
  budget_tier text NOT NULL CHECK (budget_tier IN ('under_5k','5k_to_15k','over_15k')),
  status text NOT NULL DEFAULT 'intake' CHECK (status IN ('intake','figma_loop','figma_loop_silent','converting','qa','uat','uat_silent','live','retired','retired_duplicate')),
  designer_assignment text CHECK (designer_assignment IN ('elio','pixel','both')),
  stack_decision text NOT NULL DEFAULT 'liquid' CHECK (stack_decision IN ('liquid','hydrogen_escalated_to_pod_c')),
  pod_d_lead_agent_id uuid REFERENCES agents(id),
  client_uat_contact text,
  publish_authorization_protocol text NOT NULL DEFAULT 'written_signoff_required',
  scope_summary text NOT NULL,
  deadline timestamptz NOT NULL,
  figma_signoff_proof text,
  client_publish_signoff_proof text,
  rollback_snapshot_path text,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  figma_loop_completed_at timestamptz,
  qa_passed_at timestamptz,
  uat_started_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  total_figma_revisions int NOT NULL DEFAULT 0,
  total_lumen_blockers_first_qa int,
  total_onyx_review_cycles int NOT NULL DEFAULT 0,
  total_mantle_rollbacks int NOT NULL DEFAULT 0,
  duration_days int GENERATED ALWAYS AS (EXTRACT(DAY FROM (COALESCE(retired_at, published_at, NOW()) - started_at))::int) STORED,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_client_projects_active_per_store ON client_projects(shopify_store_domain) WHERE status NOT IN ('retired','retired_duplicate');
CREATE INDEX idx_client_projects_status ON client_projects(status);
CREATE INDEX idx_client_projects_lead ON client_projects(pod_d_lead_agent_id);
CREATE INDEX idx_client_projects_deadline ON client_projects(deadline) WHERE status NOT IN ('live','retired','retired_duplicate');
ALTER TABLE client_projects ENABLE ROW LEVEL SECURITY;
```

## New Table: `theme_publishes`

Audit trail of every Pod D theme publish for rollback + post-mortem visibility (separate from `agent_events` for query speed).

```sql
CREATE TABLE theme_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES client_projects(id),
  published_by_agent_id uuid REFERENCES agents(id),  -- mantle
  authorized_by_agent_id uuid REFERENCES agents(id),  -- atrium
  prior_theme_id text NOT NULL,
  new_theme_id text NOT NULL,
  rollback_snapshot_path text NOT NULL,
  publish_started_at timestamptz NOT NULL DEFAULT NOW(),
  publish_completed_at timestamptz,
  smoke_test_passed boolean,
  rollback_executed boolean NOT NULL DEFAULT false,
  rollback_reason text,
  rollback_executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_theme_publishes_project ON theme_publishes(client_project_id, publish_started_at DESC);
CREATE INDEX idx_theme_publishes_rollback_chain ON theme_publishes(client_project_id, publish_started_at) WHERE rollback_executed = true;
ALTER TABLE theme_publishes ENABLE ROW LEVEL SECURITY;
```

The rollback-chain index supports HR Constitution Q9 query: rollbacks_in_7d > 2 → page Yash.

## New Table: `code_connect_mappings`

Tracks Figma↔Liquid component mappings stitch maintains per client repo.

```sql
CREATE TABLE code_connect_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES client_projects(id),
  figma_component_url text NOT NULL,
  figma_node_id text NOT NULL,
  liquid_template_path text NOT NULL,  -- e.g. 'blocks/testimonial-card.liquid'
  prop_mapping jsonb NOT NULL,  -- { figma_prop: liquid_setting_id }
  authored_by_agent_id uuid REFERENCES agents(id),  -- stitch
  last_used_at timestamptz,
  use_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_code_connect_project ON code_connect_mappings(client_project_id);
ALTER TABLE code_connect_mappings ENABLE ROW LEVEL SECURITY;
```

## New Realtime Channel

Add `pod-d.client-projects` to existing 5 HR Realtime channels (Q21):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE client_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE theme_publishes;
```

Subscribers: atrium (all events), Yash digest (rollback chains, deadline-at-risk events).

## Seed Data — 8 Pod D Agents

```sql
INSERT INTO agents (name, title, model, level, status, department, sub_department, pod, reports_to, secondary_reports_to, hired_at, forge_template_id, flags)
VALUES
  ('atrium','Storefront Engineering Director','opus',1,'deployed','engineering','shopify-website-team','pod-d','arya',NULL,NOW(),NULL,ARRAY[]::text[]),
  ('stitch','Design-to-Theme Converter','opus',1,'deployed','engineering','shopify-website-team','pod-d','atrium','elio',NOW(),NULL,ARRAY[]::text[]),
  ('loom','Liquid Theme Developer','sonnet',1,'deployed','engineering','shopify-website-team','pod-d','atrium',NULL,NOW(),NULL,ARRAY[]::text[]),
  ('conduit','Storefront Data Integration Engineer','sonnet',1,'deployed','engineering','shopify-website-team','pod-d','atrium',NULL,NOW(),NULL,ARRAY[]::text[]),
  ('lattice','Content Modeling Architect','sonnet',1,'deployed','engineering','shopify-website-team','pod-d','atrium','dato',NOW(),NULL,ARRAY[]::text[]),
  ('mantle','Theme Release Engineer','sonnet',1,'deployed','engineering','shopify-website-team','pod-d','atrium','bolt',NOW(),NULL,ARRAY[]::text[]),
  ('lumen','Theme Quality Engineer','sonnet',1,'deployed','engineering','shopify-website-team','pod-d','atrium','luna',NOW(),NULL,ARRAY[]::text[]),
  ('onyx','Theme Code Reviewer','opus',1,'deployed','engineering','shopify-website-team','pod-d','atrium','sage',NOW(),NULL,ARRAY[]::text[]);
```

All 8 enter probation per HR Constitution Q26 + Q27. Witness spawns parallel `probation_trackers` upon first run from each.

## Migration order (Pod D additions)

1. Run schema additions in order: `client_projects` → `theme_publishes` → `code_connect_mappings`
2. Add Realtime publications.
3. Insert 8 agents into `agents` table.
4. Witness creates 8 `probation_trackers` rows (status='watching') automatically on first run from each agent.
