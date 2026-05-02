# Polyglot SDK Specification — Agent Dispatch & Observability System

> **Status:** Production Design Spec (Ready for Implementation)
> **Scope:** Boldteq agents ONLY (internal agent-to-agent calls, not external APIs)
> **Component of:** Boldteq Software Factory v2 (2026-04)
> **Dashboard Host:** Polyglot Hub (Next.js 16 on Railway)
> **Database:** Supabase `agent-ops` (separate from app databases)
> **Last Updated:** 2026-04-14

---

## Overview

**Polyglot SDK** enables all 22+ Boldteq agents to:
1. **Dispatch tasks to each other** — call another agent programmatically
2. **Emit observability events** — full audit trail of every action
3. **Track execution metrics** — performance, cost, gates, retries
4. **Self-manage lifecycle** — promotions, PIPs, training integration
5. **Provide dashboards** — leaderboards, run history, pattern reviews, cost tracking

The SDK is a **TypeScript module** (`@boldteq/polyglot`) that every agent imports and uses at initialization. It reads/writes to a dedicated Supabase project (`agent-ops`) which is independent from application databases.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              Polyglot Hub Dashboard                          │
│        (Next.js 16.2.3 on Railway, public UI)               │
│  - Agent leaderboard (composite scores, levels, xp)        │
│  - Run history (timeline, filters, search)                  │
│  - Event stream (real-time, all observability)             │
│  - Training logs (patches applied, impact scores)          │
│  - Pattern review queue (awaiting Yash approval)           │
│  - Cost dashboard (per-agent, per-model, trends)           │
│  - HR decisions (promotions, PIPs, retirements)            │
│  - Incident reports (traced to specific agent runs)        │
└─────────────────────┬─────────────────────────────────────┘
                      │ reads from
                      ▼
┌─────────────────────────────────────────────────────────────┐
│             Supabase agent-ops (private)                     │
│  Separate from app databases. 15 tables:                    │
│  - agents                                                   │
│  - agent_runs                                               │
│  - agent_events                                             │
│  - agent_gates                                              │
│  - agent_delegations                                        │
│  - agent_costs                                              │
│  - agent_patterns                                           │
│  - agent_files                                              │
│  - agent_reviews (HR)                                       │
│  - training_applied                                         │
│  - training_logs                                            │
│  - incident_reports                                         │
│  - [+ support tables: orgs, api_keys, activity_logs]        │
└─────────────────────┬─────────────────────────────────────┘
                      │ written by
                      ▼
┌─────────────────────────────────────────────────────────────┐
│        @boldteq/polyglot SDK (TypeScript 5.x)               │
│    Installed at ~/.claude/sdk/polyglot/ (Git submodule)     │
│                                                              │
│  Modules:                                                    │
│  - client.ts      → PolyglotClient class                    │
│  - dispatch.ts    → Agent-to-agent RPC                      │
│  - events.ts      → Event emission & schema validation      │
│  - tracking.ts    → RunTracker class                        │
│  - costs.ts       → Cost logging (token accounting)         │
│  - patterns.ts    → Pattern usage tracking                  │
│  - types.ts       → Full TypeScript interfaces              │
│  - index.ts       → Public exports                          │
└─────────────────────┬─────────────────────────────────────┘
                      │ imported by
                      ▼
┌─────────────────────────────────────────────────────────────┐
│          All 22+ Boldteq Agents                              │
│                                                              │
│  Required integration per agent:                            │
│  1. Import @boldteq/polyglot at start of every run          │
│  2. Call initPolyglot(config) with agentId                  │
│  3. Create RunTracker for every task                        │
│  4. Emit task_started, gate results, file changes           │
│  5. Log cost at end (model, tokens, USD)                    │
│  6. Call run.end() which inserts agent_run + computes score │
│                                                              │
│  Agents (22):                                               │
│  Scout, Vex, Sage | Atlas, Arya, Riko, Ledger |            │
│  Yash, Nova, Koda, Dato, Luna, Quill, Vega, Zeph |          │
│  Echo, Mira, Bolt, Hawk | Orbit, Pulse, Verdict |          │
│  Cadence, Roster, Witness, Forge, Tutor                    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Example: Koda Builds a Feature

```
Koda starts a feature build task:

1. Koda imports @boldteq/polyglot
2. Koda calls initPolyglot({ agentId: KODA_UUID, agentName: 'koda' })
3. Koda creates RunTracker('feature_build')
4. run.start() → emits task_started event
5. Koda builds the feature
6. Koda needs schema → calls poly.dispatch({ targetAgent: 'dato', taskType: 'create_table', ... })
7. Dato returns table name, Koda logs logDelegation('dato', 'create_table', true)
8. Koda runs tsc, lint, build → run.addGateResult('tsc_no_emit', true), etc.
9. Koda modifies 5 files → run.addFileChange('src/app/dashboard/page.tsx') × 5
10. Koda runs tests → run.addGateResult('test', true)
11. Koda logs costs → poly.logCost({ model: 'claude-opus-4-6', inputTokens: 45000, ... })
12. Koda calls run.end() which:
    - Inserts to agent_runs table
    - Inserts all collected events
    - Computes composite_score (gates, retries, cost)
    - Returns AgentRun with metrics
13. Polyglot Hub dashboard updates in real-time
14. Mira loads the run, extracts lessons, updates memory brain
```

---

## SDK File Structure

```
~/.claude/sdk/polyglot/
├── package.json                    # @boldteq/polyglot v1.0.0
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── client.ts                   # PolyglotClient class
│   ├── dispatch.ts                 # Agent dispatch logic
│   ├── events.ts                   # Event emission
│   ├── tracking.ts                 # RunTracker class
│   ├── costs.ts                    # Token accounting
│   ├── patterns.ts                 # Pattern usage tracking
│   ├── types.ts                    # All TypeScript interfaces
│   ├── schema.ts                   # Zod validation schemas
│   └── utils.ts                    # Helpers (uuid, timestamps, etc.)
├── dist/
│   └── [compiled JavaScript]
├── README.md                       # SDK usage guide
└── CHANGELOG.md
```

### Key Files Explained

**`types.ts`** — All TypeScript interfaces (68 exports):
- `PolyglotConfig`, `PolyglotClient`
- `DispatchOptions`, `DispatchResult`
- `RunTracker`, `AgentRun`, `AgentRunInsert`
- `EventType`, `EventPayload` (16 types)
- `CostEntry`, `PatternUsageEntry`
- `Pagination`, `QueryOptions`
- Supabase table types (auto-generated)

**`client.ts`** — PolyglotClient class (main entry point):
- `constructor(config)`
- `dispatch(options)`
- `emit(eventType, payload)`
- `createRunTracker(taskType)`
- `logCost(entry)`
- `trackPatternUsage(pattern, outcome)`

**`dispatch.ts`** — Agent-to-agent RPC:
- `dispatch()` sends task to another agent via Supabase queue
- Timeout handling (default 25 min for builders, 5 min for scouts)
- Error handling & retries (max 3)
- Cost tracking per dispatch

**`tracking.ts`** — RunTracker class:
- `start()` → marks start, emits task_started
- `addGateResult(gate, passed)` → tracks validation gates
- `addRetry(reason)` → tracks retry attempts
- `addFileChange(path)` → file mutation tracking
- `markOverride()` → Yash override flag
- `end(classification?)` → inserts to DB, computes metrics

**`events.ts`** — Event system:
- `emit(eventType, payload)` → validates & writes to agent_events
- Schema validation (Zod)
- Timestamp normalization
- Duplicate deduplication (same event within 100ms = skip)

**`costs.ts`** — Token accounting:
- `logCost({ model, inputTokens, outputTokens, costUsd })`
- Validates against token pricing tables
- Aggregates cost per run

---

## SDK API Reference

### 1. Initialization

```typescript
import { initPolyglot, PolyglotConfig } from '@boldteq/polyglot'

interface PolyglotConfig {
  agentId: string              // UUID from agents table
  agentName: string            // e.g., 'koda', 'vega', 'witness'
  supabaseUrl: string          // from env: AGENT_OPS_SUPABASE_URL
  supabaseKey: string          // from env: AGENT_OPS_SERVICE_ROLE_KEY
  sessionId?: string           // current task session UUID (optional)
}

function initPolyglot(config: PolyglotConfig): PolyglotClient

// Usage in every agent
const poly = initPolyglot({
  agentId: process.env.AGENT_ID || 'KODA_UUID',
  agentName: 'koda',
  supabaseUrl: process.env.AGENT_OPS_SUPABASE_URL!,
  supabaseKey: process.env.AGENT_OPS_SERVICE_ROLE_KEY!,
})
```

### 2. Agent Dispatch (Call Other Agents)

```typescript
interface DispatchOptions {
  targetAgent: string              // agent name: 'koda', 'dato', 'vega', etc.
  taskType: string                 // 'feature_build', 'create_table', 'design_spec'
  payload: Record<string, unknown> // input data for task
  priority?: 'P0' | 'P1' | 'P2' | 'P3'  // default: P2
  timeout?: number                 // milliseconds, default: 1500000 (25 min)
}

interface DispatchResult {
  success: boolean                 // true if completed within timeout
  runId: string                    // UUID of agent_run created
  output: Record<string, unknown>  // task result (agent-specific schema)
  duration_ms: number              // execution time
  cost_usd: number                 // total cost of that agent's run
  classification?: string          // from Witness: 'excellence' | 'met_spec' | 'needs_work'
}

async function dispatch(options: DispatchOptions): Promise<DispatchResult>

// Usage: Koda needs a database table
const tableResult = await poly.dispatch({
  targetAgent: 'dato',
  taskType: 'create_table',
  payload: {
    tableName: 'user_analytics',
    columns: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'user_id', type: 'uuid', foreignKey: 'profiles.id' },
      { name: 'event', type: 'text' },
      { name: 'created_at', type: 'timestamp', default: 'now()' },
    ],
    rls: true,
    indices: ['user_id', 'event'],
  },
})

if (tableResult.success) {
  console.log(`Table created: ${tableResult.output.tableId}`)
  poly.logDelegation('dato', 'create_table', true)
} else {
  poly.logDelegation('dato', 'create_table', false)
  throw new Error(`Dato failed: ${tableResult.output.error}`)
}
```

### 3. Event Emission (Full Observability)

```typescript
type EventType =
  // Task lifecycle
  | 'task_started'          // Agent task begins
  | 'task_completed'        // Agent task finishes successfully
  | 'task_failed'           // Agent task errors

  // Validation gates
  | 'gate_passed'           // Code gate (lint, tsc, test) passed
  | 'gate_failed'           // Code gate failed

  // Code & infrastructure
  | 'file_changed'          // Source file added/edited/deleted
  | 'memory_loaded'         // Memory file loaded at start of task
  | 'pattern_applied'       // Pattern from memory/ used in this run

  // Execution flow
  | 'retry_triggered'       // Retry attempted (e.g., API timeout)
  | 'delegation_sent'       // Task delegated to another agent
  | 'delegation_received'   // This agent received a delegation
  | 'cost_logged'           // Token costs recorded

  // Overrides & decisions
  | 'yash_override'         // Yash manually corrected output

  // HR & lifecycle
  | 'agent_created'         // New agent instantiated
  | 'agent_retired'         // Agent deprovisioned
  | 'promotion'             // Agent promoted to next level
  | 'pip_opened'            // Agent put on PIP
  | 'pip_closed'            // Agent graduated from PIP
  | 'training_applied'      // Training cycle results applied

  // System events
  | 'witness_daily_sweep'   // Witness completed daily classification
  | 'cadence_weekly_review' // Cadence completed weekly HR review
  | 'lessons_extracted'     // Mira extracted lessons to memory

async function emit(
  eventType: EventType,
  payload: Record<string, unknown>
): Promise<void>

// Usage examples
await poly.emit('task_started', {
  task_type: 'feature_build',
  input_summary: 'Build sidebar component with responsive nav',
  triggered_by: 'yash',
})

await poly.emit('gate_passed', {
  gate_name: 'tsc_no_emit',
  duration_ms: 2340,
})

await poly.emit('file_changed', {
  path: 'src/components/Sidebar.tsx',
  change_type: 'create',
  lines_changed: 147,
})

await poly.emit('pattern_applied', {
  pattern_file: 'patterns/good/ui-ux-production-standards.md',
  pattern_name: 'responsive_layout_grid',
  section: 'Mobile-first breakpoints',
})

await poly.emit('delegation_sent', {
  to_agent: 'vega',
  task_type: 'design_spec',
  payload_size: 4521,
})

await poly.emit('cost_logged', {
  model: 'claude-opus-4-6',
  input_tokens: 45000,
  output_tokens: 12300,
  cost_usd: 0.87,
})

await poly.emit('retry_triggered', {
  attempt: 2,
  max_retries: 3,
  reason: 'Supabase timeout (500ms)',
})
```

### 4. Run Tracking (Lifecycle Management)

```typescript
interface RunTracker {
  // Initialization
  start(): void
    // Marks run start time, emits task_started event automatically

  // Gates (validation)
  addGateResult(gateName: string, passed: boolean): void
    // Track validation gates (lint, tsc, test, build, etc.)
    // Automatically emits gate_passed or gate_failed

  // Retries
  addRetry(reason: string): void
    // Track a retry attempt (e.g., API timeout, transient error)
    // Automatically emits retry_triggered
    // Increments internal retry counter (for retry cap logic)

  // Code changes
  addFileChange(filePath: string, changeType?: 'create' | 'edit' | 'delete'): void
    // Track file modifications
    // Automatically emits file_changed

  // Special flags
  markOverride(): void
    // Signal that Yash manually corrected this output
    // Automatically emits yash_override

  // Completion
  async end(classification?: string): Promise<AgentRun>
    // Marks run end time
    // Validates completeness
    // Inserts to agent_runs table
    // Returns full AgentRun record with computed metrics
    // classification: 'excellence' | 'met_spec' | 'needs_work' (default: auto)
}

function createRunTracker(taskType: string): RunTracker

// Complete example: Koda builds a feature
const run = poly.createRunTracker('feature_build')

run.start()  // emits task_started automatically

try {
  // Build implementation
  run.addFileChange('src/app/dashboard/page.tsx', 'create')
  run.addFileChange('src/components/DashboardCard.tsx', 'create')
  run.addFileChange('src/hooks/useDashboard.ts', 'create')

  // Validation gates
  run.addGateResult('tsc_no_emit', true)      // TypeScript check
  run.addGateResult('lint', true)             // ESLint
  run.addGateResult('build', true)            // Next.js build
  run.addGateResult('test', true)             // Unit tests
  run.addGateResult('e2e_critical', true)     // E2E tests

  // Delegation
  const specResult = await poly.dispatch({
    targetAgent: 'vega',
    taskType: 'design_spec',
    payload: { component: 'DashboardCard' },
  })
  poly.logDelegation('vega', 'design_spec', specResult.success)

  // Cost tracking
  poly.logCost({
    model: 'claude-opus-4-6',
    inputTokens: 45000,
    outputTokens: 12300,
    costUsd: 0.87,
  })

  // Complete the run
  const agentRun = await run.end('excellence')

  console.log(`Run completed:`)
  console.log(`  ID: ${agentRun.id}`)
  console.log(`  Score: ${agentRun.composite_score}`)
  console.log(`  Duration: ${agentRun.duration_ms}ms`)
  console.log(`  Cost: $${agentRun.total_cost_usd}`)

} catch (error) {
  console.error('Task failed:', error)
  // run.end() will still be called in finally block
  await run.end('needs_work')
  throw error
}
```

### 5. Cost Logging (Token Accounting)

```typescript
interface CostEntry {
  model: string              // 'claude-opus-4-6' | 'claude-sonnet-4-6'
  inputTokens: number        // raw input token count
  outputTokens: number       // raw output token count
  costUsd: number            // computed or provided cost (validated)
}

async function logCost(entry: CostEntry): Promise<void>
  // Validates model against known pricing
  // Stores in agent_costs table
  // Aggregates to current run's cost total

// Usage
poly.logCost({
  model: 'claude-opus-4-6',
  inputTokens: 45000,
  outputTokens: 12300,
  costUsd: 0.87,
})

// Multiple cost entries for one task are summed automatically
poly.logCost({ model: 'claude-opus-4-6', inputTokens: 10000, outputTokens: 2000, costUsd: 0.15 })
poly.logCost({ model: 'claude-sonnet-4-6', inputTokens: 5000, outputTokens: 1000, costUsd: 0.03 })
// Total cost for run = 0.18 USD
```

### 6. Pattern Tracking (Memory Integration)

```typescript
async function trackPatternUsage(
  patternFile: string,              // e.g., 'patterns/good/ui-ux-production-standards.md'
  patternName: string,              // e.g., 'responsive_layout_grid'
  outcome: 'helped' | 'neutral' | 'hurt'
): Promise<void>
  // Tracks usage of patterns from memory
  // Outcome: 'helped' = improved output, 'neutral' = no impact, 'hurt' = made it worse
  // Used for pattern effectiveness scoring in Polyglot Hub

// Usage
await poly.trackPatternUsage(
  'patterns/good/ui-ux-production-standards.md',
  'responsive_layout_grid',
  'helped'
)

// This feeds into pattern recommendation engine:
// Patterns with high 'helped' rate get promoted
// Patterns with high 'hurt' rate get flagged for review
```

### 7. Delegation Logging (Manual)

```typescript
async function logDelegation(
  toAgent: string,              // agent name ('koda', 'vega', etc.)
  taskType: string,             // task type identifier
  success: boolean              // did the delegation succeed?
): Promise<void>
  // Manual delegation logging (if not using dispatch() RPC)
  // dispatch() calls this automatically
  // Use when delegating via message/async channels

// Usage: Koda delegates to Vega via manual process
poly.logDelegation('vega', 'design_spec', true)
```

---

## Event Payload Schemas

All events have consistent structure:

```typescript
interface EventBase {
  event_id: string              // UUID, auto-generated
  agent_id: string              // UUID of emitting agent
  agent_name: string            // 'koda', 'vega', etc.
  run_id: string                // current agent_run UUID
  event_type: EventType         // the event type
  created_at: Date              // ISO 8601 timestamp
  payload: Record<string, unknown>  // event-specific data
}
```

### Payload Schemas by Event Type

**`task_started`**
```typescript
{
  task_type: string             // 'feature_build', 'design_spec', etc.
  input_summary: string         // 1-2 sentence summary of the task
  triggered_by: string          // agent name that triggered this ('yash', 'arya', etc.)
}
```

**`task_completed`**
```typescript
{
  task_type: string
  duration_ms: number           // wall clock time
  composite_score: number       // 0-100 (from gates + cost)
  classification: string        // 'excellence' | 'met_spec' | 'needs_work'
  output_summary: string        // brief description of output
}
```

**`task_failed`**
```typescript
{
  task_type: string
  duration_ms: number
  error_type: string            // 'timeout' | 'validation' | 'runtime' | 'gate_failure'
  error_message: string
  retry_count: number           // how many times was this attempted?
}
```

**`gate_passed` / `gate_failed`**
```typescript
{
  gate_name: string             // 'tsc_no_emit', 'lint', 'test', 'build', 'e2e', etc.
  duration_ms: number           // how long did this gate take?
  output?: string               // any stderr/stdout (for debugging gate failures)
  severity?: 'critical' | 'warning'  // only for gate_failed
}
```

**`file_changed`**
```typescript
{
  path: string                  // absolute path: '/src/app/dashboard/page.tsx'
  change_type: 'create' | 'edit' | 'delete'
  lines_changed?: number        // for edits, how many lines differ?
  lang?: string                 // 'typescript' | 'tsx' | 'sql' | etc.
}
```

**`memory_loaded`**
```typescript
{
  file_path: string             // 'stacks/saas-nextjs-supabase-railway.md'
  tier: 1 | 2                   // 1 = critical (memory, patterns, stack), 2 = optional (project, design)
  size_bytes: number            // for tracking memory overhead
}
```

**`pattern_applied`**
```typescript
{
  pattern_file: string          // 'patterns/good/production-agent-mindset.md'
  pattern_name: string          // human-readable name
  section: string               // which section of the pattern
  outcome?: 'helped' | 'neutral' | 'hurt'
}
```

**`retry_triggered`**
```typescript
{
  attempt: number               // which attempt (2, 3, etc.)
  max_retries: number           // cap (usually 3 or 5)
  reason: string                // 'API timeout', 'rate limit', 'validation error'
  wait_ms?: number              // milliseconds before retry
}
```

**`delegation_sent` / `delegation_received`**
```typescript
{
  to_agent: string              // target agent ('koda', 'vega', etc.)
  from_agent?: string           // source agent (set on _received)
  task_type: string             // 'feature_build', 'design_spec'
  payload_size: number          // bytes of input
  expected_timeout_ms?: number  // when will this timeout?
}
```

**`cost_logged`**
```typescript
{
  model: string                 // 'claude-opus-4-6', 'claude-sonnet-4-6'
  input_tokens: number
  output_tokens: number
  cost_usd: number
  cumulative_run_cost?: number  // total cost so far in this run
}
```

**`yash_override`**
```typescript
{
  original_classification: string  // what was the auto-classification?
  override_to?: string             // what did Yash change it to?
  override_reason: string          // why? ('quality', 'incomplete', 'different_spec')
}
```

**`agent_created` / `agent_retired`**
```typescript
{
  agent_id: string
  agent_name: string
  level?: string                // 'intern' | 'junior' | 'senior' | 'staff'
  skills?: string[]
}
```

**`promotion` / `pip_opened` / `pip_closed`**
```typescript
{
  agent_id: string
  agent_name: string
  from_level?: string           // prior level
  to_level?: string             // new level
  reason: string                // justification
}
```

**`witness_daily_sweep`**
```typescript
{
  run_ids_classified: number    // how many runs classified today?
  classifications: {
    excellence: number
    met_spec: number
    needs_work: number
  }
  regressions_detected: number  // runs with lower scores
}
```

**`cadence_weekly_review`**
```typescript
{
  agents_reviewed: number
  promotions: number
  pips_opened: number
  pips_closed: number
  total_xp_awarded: number
}
```

**`lessons_extracted`**
```typescript
{
  run_id: string
  lessons_count: number         // how many lessons extracted?
  files_updated: number         // how many memory files updated?
  memory_files: string[]        // which files changed
}
```

---

## Supabase Database Schema (agent-ops)

All tables live in a separate Supabase project (`agent-ops`) with RLS disabled (internal only).

### Core Tables

**`agents` (master register)**
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,              -- 'koda', 'vega', 'witness'
  full_name TEXT,                         -- 'Koda — Feature Builder'
  department TEXT,                        -- 'build' | 'launch' | 'measure' | 'hr'
  reports_to UUID REFERENCES agents(id),  -- hierarchy
  level TEXT,                             -- 'intern' | 'junior' | 'senior' | 'staff'
  version_tag TEXT,                       -- 'v1.2.3'
  capabilities TEXT[] DEFAULT '{}',       -- ['api_design', 'database', 'testing']
  max_concurrent_runs INT DEFAULT 3,
  priority 'P0' | 'P1' | 'P2' | 'P3' DEFAULT 'P1',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  retired_at TIMESTAMP NULL,              -- null = active, set = retired
);
```

**`agent_runs` (every execution)**
```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  task_type TEXT NOT NULL,                -- 'feature_build', 'design_spec'
  status 'running' | 'completed' | 'failed' DEFAULT 'running',
  classification TEXT NULL,               -- 'excellence' | 'met_spec' | 'needs_work'
  
  -- Timing
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NULL,
  duration_ms INT NULL,
  
  -- Gates & validation
  gates_passed INT DEFAULT 0,
  gates_failed INT DEFAULT 0,
  gates_total INT DEFAULT 0,
  
  -- Retries
  retry_count INT DEFAULT 0,
  retry_cap INT DEFAULT 3,
  
  -- Delegations
  delegated_to TEXT[] DEFAULT '{}',       -- names of agents delegated to
  delegation_count INT DEFAULT 0,
  
  -- Files
  files_changed INT DEFAULT 0,
  
  -- Cost
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  
  -- Metrics (computed by trigger)
  composite_score INT DEFAULT NULL,       -- 0-100 (gates + cost penalty)
  overridden BOOLEAN DEFAULT false,       -- Yash manually changed classification?
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
);
```

**`agent_events` (audit trail)**
```sql
CREATE TABLE agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  run_id UUID NOT NULL REFERENCES agent_runs(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,                 -- event-specific data
  created_at TIMESTAMP DEFAULT now(),
  
  -- Deduplication
  dedup_key TEXT NULL,                    -- hash of (run_id + event_type + payload)
);

CREATE INDEX idx_agent_runs ON agent_events(agent_id, created_at DESC);
CREATE INDEX idx_run_events ON agent_events(run_id);
```

**`agent_gates` (validation tracking)**
```sql
CREATE TABLE agent_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id),
  gate_name TEXT NOT NULL,                -- 'tsc_no_emit', 'lint', 'test'
  passed BOOLEAN NOT NULL,
  duration_ms INT NULL,
  output TEXT NULL,                       -- stderr/stdout
  created_at TIMESTAMP DEFAULT now(),
);
```

**`agent_delegations` (RPC calls)**
```sql
CREATE TABLE agent_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID NOT NULL REFERENCES agents(id),
  to_agent_id UUID NOT NULL REFERENCES agents(id),
  from_run_id UUID NOT NULL REFERENCES agent_runs(id),
  to_run_id UUID NULL REFERENCES agent_runs(id),      -- null until done
  
  task_type TEXT NOT NULL,
  payload_size INT,
  status 'pending' | 'started' | 'completed' | 'failed' DEFAULT 'pending',
  
  request_at TIMESTAMP DEFAULT now(),
  response_at TIMESTAMP NULL,
  timeout_at TIMESTAMP NULL,              -- when should we give up?
  duration_ms INT NULL,
  
  result_success BOOLEAN NULL,
  result_output JSONB NULL,
  result_error TEXT NULL,
  
  created_at TIMESTAMP DEFAULT now(),
);
```

**`agent_costs` (token accounting)**
```sql
CREATE TABLE agent_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id),
  model TEXT NOT NULL,                    -- 'claude-opus-4-6', 'claude-sonnet-4-6'
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
);
```

**`agent_patterns` (pattern usage tracking)**
```sql
CREATE TABLE agent_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id),
  pattern_file TEXT NOT NULL,             -- 'patterns/good/ui-ux-production-standards.md'
  pattern_name TEXT,
  outcome 'helped' | 'neutral' | 'hurt',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT now(),
);
```

**`agent_files` (code changes)**
```sql
CREATE TABLE agent_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id),
  path TEXT NOT NULL,
  change_type 'create' | 'edit' | 'delete',
  lines_changed INT NULL,
  lang TEXT NULL,
  created_at TIMESTAMP DEFAULT now(),
);
```

**`agent_reviews` (HR decisions)**
```sql
CREATE TABLE agent_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  reviewed_by UUID REFERENCES agents(id),            -- usually Cadence
  review_type 'weekly' | 'pip' | 'promotion' | 'retirement',
  
  -- Weekly review
  week_ending DATE NULL,
  total_runs INT DEFAULT 0,
  avg_score DECIMAL(5, 2) DEFAULT 0,
  regressions INT DEFAULT 0,
  
  -- Decision
  decision TEXT,                          -- 'promote' | 'maintain' | 'pip' | 'retire'
  decision_reason TEXT,
  new_level TEXT NULL,                    -- if promoting
  pip_reason TEXT NULL,                   -- if opening PIP
  pip_duration_days INT DEFAULT 14,       -- PIP period
  
  created_at TIMESTAMP DEFAULT now(),
);
```

**`training_applied` (patches from learning)**
```sql
CREATE TABLE training_applied (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID,                       -- reference to training system
  agent_id UUID NOT NULL REFERENCES agents(id),
  memory_file TEXT,                       -- which memory file was updated?
  lesson TEXT,                            -- the lesson content
  
  applied_at TIMESTAMP DEFAULT now(),
  effectiveness 'high' | 'medium' | 'low' DEFAULT NULL,  -- assessed later
);
```

**`incident_reports` (production issues)**
```sql
CREATE TABLE incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES agent_runs(id),
  agent_id UUID REFERENCES agents(id),
  incident_type TEXT,                     -- 'broken_gate', 'regression', 'production_bug'
  
  description TEXT,
  severity 'critical' | 'high' | 'medium' | 'low',
  status 'open' | 'investigating' | 'resolved' | 'wontfix',
  
  opened_at TIMESTAMP DEFAULT now(),
  resolved_at TIMESTAMP NULL,
);
```

---

## Usage Examples

### Example 1: Koda Builds a Feature

```typescript
// koda-agent.ts
import { initPolyglot } from '@boldteq/polyglot'

const poly = initPolyglot({
  agentId: process.env.KODA_AGENT_ID!,
  agentName: 'koda',
  supabaseUrl: process.env.AGENT_OPS_SUPABASE_URL!,
  supabaseKey: process.env.AGENT_OPS_SERVICE_ROLE_KEY!,
})

async function buildFeature(taskInput: {
  projectSlug: string
  featureName: string
}) {
  const run = poly.createRunTracker('feature_build')
  run.start()

  try {
    // Load memory
    await poly.emit('memory_loaded', {
      file_path: 'stacks/saas-nextjs-supabase-railway.md',
      tier: 1,
    })

    // Get database schema from Dato
    const schemaResult = await poly.dispatch({
      targetAgent: 'dato',
      taskType: 'describe_schema',
      payload: { projectSlug: taskInput.projectSlug },
    })

    if (!schemaResult.success) {
      throw new Error(`Dato failed: ${schemaResult.output.error}`)
    }

    poly.logDelegation('dato', 'describe_schema', true)

    // Build feature (pseudocode)
    const featureCode = buildFeatureImplementation(
      schemaResult.output,
      taskInput.featureName
    )

    run.addFileChange('src/app/features/page.tsx', 'create')
    run.addFileChange('src/components/FeatureCard.tsx', 'create')

    // Get design spec from Vega
    const designResult = await poly.dispatch({
      targetAgent: 'vega',
      taskType: 'design_spec',
      payload: { componentName: 'FeatureCard' },
    })

    poly.logDelegation('vega', 'design_spec', designResult.success)

    // Validate gates
    const lintPass = await runLint()
    run.addGateResult('lint', lintPass)

    const typePass = await runTypeCheck()
    run.addGateResult('tsc_no_emit', typePass)

    const buildPass = await runBuild()
    run.addGateResult('build', buildPass)

    const testPass = await runTests()
    run.addGateResult('test', testPass)

    if (!lintPass || !typePass || !buildPass || !testPass) {
      throw new Error('Gates failed')
    }

    // Log cost
    poly.logCost({
      model: 'claude-opus-4-6',
      inputTokens: 45000,
      outputTokens: 12300,
      costUsd: 0.87,
    })

    // Complete
    const agentRun = await run.end('excellence')
    console.log(`Feature built successfully. Score: ${agentRun.composite_score}`)

  } catch (error) {
    console.error('Build failed:', error)
    await run.end('needs_work')
    throw error
  }
}
```

### Example 2: Witness Does Daily Sweep

```typescript
// witness-agent.ts
const poly = initPolyglot({
  agentId: process.env.WITNESS_AGENT_ID!,
  agentName: 'witness',
  ...
})

async function dailySweep() {
  const run = poly.createRunTracker('daily_sweep')
  run.start()

  try {
    // Get all runs from yesterday
    const yesterdayRuns = await getRunsFromDate(Date.now() - 86400000)

    let excellent = 0, met = 0, needs = 0

    for (const agentRun of yesterdayRuns) {
      // Classify each run
      const classification = classifyRun(agentRun)
      agentRun.classification = classification

      if (classification === 'excellence') excellent++
      else if (classification === 'met_spec') met++
      else needs++
    }

    // Detect regressions
    const regressions = detectRegressions(yesterdayRuns)

    // Record results
    await poly.emit('witness_daily_sweep', {
      run_ids_classified: yesterdayRuns.length,
      classifications: { excellent, met_spec: met, needs_work: needs },
      regressions_detected: regressions.length,
    })

    const agentRun = await run.end('excellence')
    console.log(`Daily sweep complete. Runs classified: ${yesterdayRuns.length}`)

  } catch (error) {
    console.error('Sweep failed:', error)
    await run.end('needs_work')
    throw error
  }
}
```

### Example 3: Cadence Does Weekly Review

```typescript
// cadence-agent.ts
const poly = initPolyglot({
  agentId: process.env.CADENCE_AGENT_ID!,
  agentName: 'cadence',
  ...
})

async function weeklyReview() {
  const run = poly.createRunTracker('weekly_review')
  run.start()

  try {
    const agents = await getAllAgents()

    let promotions = 0, pipsOpened = 0, xpAwarded = 0

    for (const agent of agents) {
      const weekStats = getAgentWeekStats(agent.id)

      // Promotion logic
      if (weekStats.avgScore >= 92 && weekStats.regressions === 0) {
        await promoteAgent(agent.id, agent.level)
        promotions++
        xpAwarded += 50
      }

      // PIP logic
      if (weekStats.avgScore < 60) {
        await openPIP(agent.id)
        pipsOpened++
      }
    }

    // Record review
    await poly.emit('cadence_weekly_review', {
      agents_reviewed: agents.length,
      promotions,
      pips_opened: pipsOpened,
      pips_closed: 0,
      total_xp_awarded: xpAwarded,
    })

    const agentRun = await run.end('excellence')
    console.log(`Weekly review done. Promotions: ${promotions}`)

  } catch (error) {
    console.error('Review failed:', error)
    await run.end('needs_work')
    throw error
  }
}
```

---

## Polyglot Hub Dashboard

The dashboard is a **Next.js 16 SPA** (Stack A pattern) hosted on Railway. It reads from the `agent-ops` Supabase database in real-time.

### Pages

| Page | Purpose | Data Source |
|------|---------|-------------|
| `/` | Agent leaderboard | agents + agent_runs (aggregated) |
| `/agents/:id` | Individual agent profile | agents + agent_runs + agent_reviews |
| `/runs` | Run history (searchable) | agent_runs + agent_events |
| `/events` | Real-time event stream | agent_events (Realtime subscription) |
| `/training` | Training logs, patch impact | training_applied |
| `/patterns` | Pattern proposals awaiting review | agent_patterns (filtered by quality) |
| `/costs` | Cost tracking per agent/model | agent_costs (daily/weekly/monthly aggregation) |
| `/reviews` | HR decisions (promotions, PIPs) | agent_reviews |
| `/incidents` | Production incidents | incident_reports |
| `/settings` | Configuration & API keys | internal config |

### Key Visualizations

1. **Leaderboard** — Agent name, level, composite score, run count, cost, trend arrow
2. **Run Timeline** — Gantt chart of concurrent runs with gate results
3. **Event Stream** — Real-time JSON with color-coded event types
4. **Cost Trends** — Line chart of cumulative cost per agent per day/week
5. **Pattern Effectiveness** — Bar chart of pattern outcomes (helped/neutral/hurt)
6. **Classification Distribution** — Pie chart of excellence/met/needs for each agent

### Stack

```
Polyglot Hub (Next.js 16 on Railway)
├── src/
│   ├── app/
│   │   ├── page.tsx              # Leaderboard
│   │   ├── agents/[id]/
│   │   ├── runs/
│   │   ├── events/
│   │   ├── training/
│   │   ├── patterns/
│   │   ├── costs/
│   │   ├── reviews/
│   │   └── settings/
│   ├── components/
│   │   ├── LeaderboardTable.tsx
│   │   ├── RunTimeline.tsx
│   │   ├── EventStream.tsx
│   │   ├── CostChart.tsx
│   │   └── PatternEffectiveness.tsx
│   ├── lib/
│   │   ├── supabase.ts           # agent-ops client
│   │   └── queries.ts            # optimized SQL queries
│   └── hooks/
│       └── useRealtimeEvents.ts   # Realtime subscription
├── tailwind.config.ts            # Tailwind 4
├── tsconfig.json                 # TypeScript strict
└── next.config.ts                # Image optimization
```

---

## Implementation Checklist

### Phase 1: SDK Core (Week 1-2)
- [ ] Create `@boldteq/polyglot` package structure
- [ ] Implement PolyglotClient class
- [ ] Implement dispatch() RPC system
- [ ] Implement event emission + Zod validation
- [ ] Implement RunTracker class
- [ ] Write TypeScript interfaces (types.ts)
- [ ] Create agent-ops Supabase project + schema
- [ ] Write SDK README with examples
- [ ] Unit tests for all SDK functions

### Phase 2: Dashboard (Week 2-3)
- [ ] Create Next.js 16 Polyglot Hub project
- [ ] Implement leaderboard page
- [ ] Implement runs page + filters
- [ ] Implement event stream + Realtime
- [ ] Implement cost tracking dashboard
- [ ] Implement pattern review queue
- [ ] Deploy to Railway + configure private networking

### Phase 3: Integration (Week 3-4)
- [ ] Integrate SDK into Koda agent
- [ ] Integrate into Vega (design)
- [ ] Integrate into Dato (database)
- [ ] Integrate into Witness (daily sweep)
- [ ] Integrate into Cadence (weekly review)
- [ ] Integrate into Mira (lesson extraction)
- [ ] Integration tests with all agents

### Phase 4: Validation (Week 4-5)
- [ ] Run 50+ sample tasks through full pipeline
- [ ] Verify event stream accuracy
- [ ] Verify cost accounting
- [ ] Verify gate tracking
- [ ] Verify delegation RPC
- [ ] Load test dashboard
- [ ] Documentation review

---

## Important Notes

### Cost Tracking
- SDK validates all costs against known pricing tables
- Pricing per model (Opus, Sonnet) loaded from environment
- Cost is logged PER DISPATCH and PER DIRECT CALL
- SDK prevents cost logging with invalid models or negative tokens

### Rate Limiting
- Dispatch timeout is PER-AGENT, configurable in agents table
- Builder agents: 25 min default
- Scout/Review agents: 5 min default
- Timeout results in automatic escalation + retry

### Error Handling
- Any agent dispatch error is caught and logged
- Retries capped at 3 for builders, 1 for others (via class)
- On final failure: auto-classify as 'needs_work' + escalate
- No silent failures

### Privacy & Security
- agent-ops is separate Supabase project (not app data)
- No customer data in agent-ops
- RLS disabled (internal system only)
- Service role key required for writes
- All events immutable (no deletes)

### Metrics Calculation
The composite score per run is calculated as:
```
composite_score = (gates_passed / gates_total * 100) - (retry_penalty) - (cost_penalty)

where:
  gates_passed / gates_total = 0-100 based on gate results
  retry_penalty = (retry_count - 1) * 5   (0 if no retries)
  cost_penalty = min(cost_usd / 5.0 * 10, 20)  (max 20 points)

Examples:
  All gates passed, 0 retries, $0.50 cost = 100 - 0 - 1 = 99
  All gates passed, 2 retries, $1.00 cost = 100 - 5 - 2 = 93
  1 gate failed, 1 retry, $3.00 cost = 80 - 0 - 6 = 74
```

---

## File Structure Summary

```
~/.claude/memory/patterns/good/polyglot-sdk-spec.md    ← This file (reference spec)
~/.claude/sdk/polyglot/                                ← Implementation directory
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # exports
│   ├── types.ts                  # all TypeScript interfaces
│   ├── schema.ts                 # Zod validation
│   ├── client.ts                 # PolyglotClient class
│   ├── dispatch.ts               # dispatch() function
│   ├── events.ts                 # emit() + event validation
│   ├── tracking.ts               # RunTracker class
│   ├── costs.ts                  # logCost() function
│   ├── patterns.ts               # trackPatternUsage()
│   └── utils.ts                  # helpers
├── dist/                         # compiled output
├── README.md                     # usage guide
└── CHANGELOG.md
```

---

## Next Steps

1. **Review this spec with Koda + Vega** — get implementation feedback
2. **Create agent-ops Supabase project** — apply schema
3. **Implement SDK core** — start with client.ts + types.ts
4. **Create Polyglot Hub scaffold** — Next.js 16 on Railway
5. **Integrate into 3 pilot agents** — Koda, Vega, Dato
6. **Validation run** — 50 sample executions through full system
7. **Extract lessons** — Mira updates memory with usage patterns
8. **Hardening** — error handling, edge cases, performance optimization

---

## Related Documents

- [Full Autonomy Rules](full-autonomy-rules.md) — When agents ask vs. decide
- [Executable Auto-Fix Loop](executable-auto-fix-loop.md) — Retry caps, cost breakers
- [Production Agent Mindset](production-agent-mindset.md) — Agent philosophy
- [Railway Deployment](railway-deployment.md) — Polyglot Hub deployment
- [Next.js Production Infra](nextjs-production-infra.md) — Dashboard infrastructure
