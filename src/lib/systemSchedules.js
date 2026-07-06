'use strict';

// System schedules — built-in HR / automation cycles that run on cron or
// event triggers. Single source of truth for:
//   - Roster nightly recompute (02:00 UTC)
//   - Witness daily sweep (03:00 UTC)
//   - Cadence weekly review (Mon 09:00 UTC)
//   - Tutor weekly training (Sun 02:00 UTC)
//   - Forge monthly capability-gap scan (1st of month 04:00 UTC)
//   - Mira post-build lesson extraction (event-driven, debounced 60s)
//
// All system handlers persist their runs via the stub-then-complete pattern:
//   1. db.insertAgentRunStub(...) creates a 'running' row visible immediately
//      in the drawer + crash-safe (orphan rows reconciled on next boot)
//   2. handler executes
//   3. db.completeAgentRun(runId, {...}) updates the same row to terminal
//      status (success / error / cancelled)
// SSE events fire via agentSync.emitScheduleEvent at start + terminal state.

const { randomUUID } = require('crypto');
const cron = require('node-cron');

const db = require('../db');
const agentSync = require('./agentSync');
const configService = require('./configService');
const { runClaudeSync, buildAgentPrompt, validateAgentExists } = require('./runClaude');
const { computeNextRunAt } = require('./cronUtil');

// ── Definitions ────────────────────────────────────────────────────────────

const DEFINITIONS = [
  {
    id: 'sys-roster',
    name: 'Roster nightly recompute',
    description: 'Refresh per-agent experience profiles + skill vectors.',
    cron: '0 2 * * *',
    agentName: 'roster',
    handler: 'rosterRecompute',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-witness',
    name: 'Witness daily sweep',
    description: 'Classify last 24h agent runs, flag PIP/promotion candidates.',
    cron: '0 3 * * *',
    agentName: 'witness',
    handler: 'witnessSweep',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-brain-aggregate',
    name: 'Brain signal aggregator (daily)',
    description: 'Mine agent_runs + corrections + learning inbox across ALL projects; emit cross-project training_signals for recurring weaknesses (Phase B — generalize + learn from consequences). Local, no token cost.',
    cron: '0 6 * * *',
    agentName: 'witness',
    handler: 'brainAggregate',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-cadence',
    name: 'Cadence weekly review',
    description: 'Apply promotions, open PIPs, run weekly org health review.',
    cron: '0 9 * * 1',
    agentName: 'cadence',
    handler: 'cadenceReview',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-tutor',
    name: 'Tutor daily training (deterministic)',
    description: 'Phase C (now DAILY, after brain-aggregate emits the day’s signals) — consume open training_signals → synthesize rollback-armed patches → governor routes auto/review/reject → surgically patch agent .md for autos → measure impact + auto-rollback regressions. Safe daily: the 48h per-target cooldown prevents over-patching and the 24h observe window means regressions roll back a day sooner than the old weekly cadence. Holds all autos when the eval judge is miscalibrated. Local, no token cost; feedback.md never auto-written.',
    cron: '30 6 * * *',
    agentName: 'tutor',
    handler: 'tutorTraining',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-forge',
    name: 'Forge monthly gap scan',
    description: 'Detect capability gaps, draft new agent templates.',
    cron: '0 4 1 * *',
    agentName: 'forge',
    handler: 'forgeGapScan',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.50 },
  },
  {
    id: 'sys-mira',
    name: 'Mira lesson extraction',
    description: 'Extract lessons after successful build runs (event-driven, 60s debounce).',
    cron: null,
    trigger: 'event:agent_run.build.success',
    agentName: 'mira',
    handler: 'miraExtract',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.02, highUsd: 0.20 },
  },
  {
    id: 'sys-build-schedules',
    name: 'Post-publish build checkpoints (hourly)',
    description: 'Run every DUE post-publish checkpoint (lumen 48h watch t+2h/24h/48h + orbit/catalyst results baseline/30d/90d) for published builds. Catch-up tick — an asleep non-24/7 Mac fires overdue checkpoints on the next run. Local, no token cost.',
    cron: '0 * * * *',
    agentName: 'lumen',
    handler: 'buildSchedulesTick',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-intel-reindex',
    name: 'Intelligence reindex (nightly)',
    description: 'Incrementally re-embed the memory brain into the vector store (Pillar 2 — keeps RAG fresh). Local Ollama, no token cost.',
    cron: '30 2 * * *',
    agentName: 'mira',
    handler: 'intelReindex',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-reindex-drain',
    name: 'Reindex change-queue drain (event-driven)',
    description: 'Phase D.1 — ~60s after the last agent/memory edit, drain ~/.claude/memory/.brain/reindex-queue.jsonl and run a SCOPED incremental reindex of just the changed files (edit → searchable in ~1 min, not 12.5 h). Local Ollama, no token cost. The 02:30 full reindex is the backstop.',
    cron: null,
    trigger: 'event:memory.changed',
    agentName: 'mira',
    handler: 'reindexDrain',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-intel-eval',
    name: 'Intelligence eval self-test (weekly)',
    description: 'Run the LLM-as-judge golden self-test (Pillar 3), catch judge drift, ingest scores into eval_scores for Witness. Runs Sun 01:00 — BEFORE sys-tutor (02:00) so the trainer reads a fresh calibration, not last week\'s.',
    cron: '0 1 * * 0',
    agentName: 'luna',
    handler: 'intelEval',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.40 },
  },
  {
    id: 'sys-learning-digest',
    name: 'Learning digest (daily)',
    description: "Extract candidate lessons/bugs/decisions/feedback from the day's VS Code sessions; auto-capture high-confidence ones, stage the rest for review.",
    cron: '0 4 * * *',
    agentName: 'mira',
    handler: 'learningDigest',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.02, highUsd: 0.25 },
  },
  {
    id: 'sys-memory-hygiene',
    name: 'Memory hygiene + forgetting curve (monthly)',
    description: 'Phase E — flag orphaned (retired-agent) chunks, surface stale unverified captures, stamp index freshness. Reversibly down-weights retired agents in the decay sidecar (never deletes); everything else is recommended to Training Review. Local, no token cost.',
    cron: '0 3 1 * *',
    agentName: 'mira',
    handler: 'memoryHygiene',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-behavioral-drift',
    name: 'Behavioral drift detector (weekly)',
    description: 'Review-only — compare each agent\'s recent-5-run success rate against its 7-day rate; a sharp decline emits a low-severity behavior_drift training_signal for human review (never auto-patched). Local, no token cost.',
    cron: '0 10 * * 1',
    agentName: 'witness',
    handler: 'behavioralDriftDetector',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-decision-rescore',
    name: 'Decision-journal re-score (weekly)',
    description: 'Review-only — surface aged-unresolved decisions (kind=decision, ≥14d, no outcome) as open loops to nudge resolution, and log the rolling decision-accuracy from resolved ones. Writes no memory/identity. Local, no token cost.',
    cron: '0 11 * * 1',
    agentName: 'mira',
    handler: 'decisionJournalRescore',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-lens-calibrate',
    name: 'Lens calibration (weekly)',
    description: 'Sample the Lens calibration corpus → calibration items in the Learning Inbox for Yash to grade (approve=agree / reject=judge-was-wrong), and turn last week’s grades into per-check rubric SUGGESTIONS (open-loop candidates). Suggestions only — never auto-edits a rubric. Local, no token cost.',
    cron: '0 23 * * 0',
    agentName: 'mira',
    handler: 'lensCalibrateSample',
    needsLlm: false,
    cancellable: true,
  },
  // ── Operational self-enhancement (Bucket 1 — no token cost) ────────────────
  {
    id: 'sys-db-retention',
    name: 'Database retention (daily)',
    description: 'Prune the insert-only tables that otherwise grow forever — cost_logs (90d), agent_runs (180d, never deletes a running row), agent_events (30d), delegations (90d). Keeps observability queries fast. Windows are config-overridable. Local, no token cost.',
    cron: '45 3 * * *',
    agentName: 'system',
    handler: 'dbRetention',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-stale-run-reconcile',
    name: 'Stale run reconcile (daily)',
    description: 'Mark any run stuck in "running" for more than 30 min as crashed (age-bounded — never touches a legitimately long-running job). Self-heals hung runs without waiting for a restart. Local, no token cost.',
    cron: '30 4 * * *',
    agentName: 'system',
    handler: 'staleRunReconcile',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-org-drift',
    name: 'Org registry drift check (weekly)',
    description: 'Compare the agent registry against the on-disk .md files; stage a Learning-Inbox candidate when they diverge (agent on disk but not in registry, or vice-versa). Enforces the single-source-of-truth. Local, no token cost.',
    cron: '0 5 * * 2',
    agentName: 'roster',
    handler: 'orgDriftCheck',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-cost-digest',
    name: 'Cost digest + anomaly (daily)',
    description: 'Roll up yesterday’s LLM spend + top-5 agents; flag a spike (≥ multiplier × the trailing 30-day daily average) as a Learning-Inbox candidate. Pillar-1 spend visibility. Local, no token cost.',
    cron: '0 8 * * *',
    agentName: 'system',
    handler: 'costDigest',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-metrics-rollup',
    name: 'Metrics rollup (daily)',
    description: 'Aggregate yesterday’s runs/success-rate/cost/latency-percentiles/eval-avg into the metrics_daily table that powers the Monitoring time-series charts. Idempotent (INSERT OR REPLACE), so a catch-up re-run is safe. Local, no token cost.',
    cron: '15 5 * * *',
    agentName: 'system',
    handler: 'metricsRollup',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-app-audit',
    name: 'App UX/a11y audit (daily)',
    description: 'Headless sweep of the Polyglot app’s key routes — console errors, critical/serious axe a11y violations (color-contrast tracked separately as a known backlog), and blank-render checks. Files a Learning-Inbox candidate only when findings RISE vs the last run. The automated version of a manual UX/a11y audit. Local, no token cost.',
    cron: '0 7 * * *',
    agentName: 'vigil',
    handler: 'appAudit',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-suite-health',
    name: 'Suite health check (daily)',
    description: 'Daily regression sweep against the COMMITTED HEAD (throwaway git worktree — not the WIP tree, so in-progress edits + env-coupled tests never false-alarm): client tsc -b + the backend test suite (Node 20). Files a Learning-Inbox candidate only when tsc errors or test failures RISE vs the last run. Local, no token cost.',
    cron: '30 5 * * *',
    agentName: 'sage',
    handler: 'suiteHealth',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-memory-snapshot',
    name: 'Memory brain snapshot (every 2h)',
    description: 'git-commit ~/.claude/memory (the agent brain — FAQ packs, decisions, lessons) so it has real version history + rollback. Replaces the ad-hoc 30-min file-copy backup loop, which died silently mid-session and nobody noticed (2026-07-02 SWT infra audit). No-ops cleanly when nothing changed. Local, no token cost.',
    cron: '0 */2 * * *',
    agentName: 'system',
    handler: 'memorySnapshot',
    needsLlm: false,
    cancellable: false,
  },
];

const DEFAULT_ENABLED = true;
const HANDLER_TIMEOUT_MS = 5 * 60 * 1000;
const MIRA_DEBOUNCE_MS = 60 * 1000;
const REINDEX_DEBOUNCE_MS = 60 * 1000; // Phase D.1 — drain the change-queue ~60s after the last edit

// In-memory state
const activeJobs = new Map();      // id → cron job
// inflight: Map<scheduleId, { runId, startedAt, child? }>
const inflight = new Map();
let injectedDeps = null;            // { org, experience, hr, loadRecentAgentRuns }
let miraDebounceTimer = null;
let miraQueuedBuildIds = [];
let reindexDebounceTimer = null;    // Phase D.1 — event-debounced reindex drain

// ── Public lookup ──────────────────────────────────────────────────────────

function getDefinitions() {
  return DEFINITIONS.slice();
}

function findDefinition(id) {
  return DEFINITIONS.find(d => d.id === id) || null;
}

function isEnabled(id) {
  const override = db.getSystemOverride(id);
  if (override) return !!override.enabled;
  return DEFAULT_ENABLED;
}

// Same shape as user `Schedule` rows so the frontend can render them in the
// same list. `kind:'system'`, plus `nextRunAt` computed via cron-parser, plus
// `builtin:true` flag so UI hides edit/delete affordances.
function getAllForApi() {
  return DEFINITIONS.map(def => {
    const override = db.getSystemOverride(def.id);
    const enabled = override ? !!override.enabled : DEFAULT_ENABLED;
    // Last run is the most recent agent_runs row with this systemId.
    const recent = db.getScheduleRunsFor(def.id, { limit: 1 });
    const last = recent[0] || null;
    return {
      id: def.id,
      kind: 'system',
      builtin: true,
      name: def.name,
      description: def.description,
      agentName: def.agentName,
      prompt: def.description,
      cron: def.cron,
      trigger: def.trigger || null,
      enabled,
      lastRunAt: last?.timestamp || null,
      lastRunStatus: last?.status || null,
      nextRunAt: enabled ? computeNextRunAt(def.cron) : null,
      createdAt: null,
      updatedAt: override?.updatedAt || null,
      needsLlm: !!def.needsLlm,
      cancellable: !!def.cancellable,
      costEstimate: def.costEstimate || null,
    };
  });
}

function setEnabled(id, enabled) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);
  const result = db.upsertSystemOverride(id, !!enabled);
  // Restart job in place — start or stop based on new state.
  startJob(def);
  agentSync.emitScheduleEvent('upsert', { id, kind: 'system' });
  return result;
}

// F3: how many of the most-recent runs failed CONSECUTIVELY (newest-first; stops
// at the first success). Used to auto-pause a chronically-broken schedule.
const FAILURE_PAUSE_THRESHOLD = 5;
function consecutiveFailures(id) {
  const runs = db.getScheduleRunsFor(id, { limit: FAILURE_PAUSE_THRESHOLD });
  let n = 0;
  for (const r of runs) {
    if (r.status === 'error' || r.status === 'crashed') n += 1; else break;
  }
  return n;
}
// Auto-pause a system schedule after N consecutive failures so a chronically broken
// job (e.g. a daily 300s timeout) stops burning compute/tokens instead of failing
// forever, and stages a Learning-Inbox candidate so the operator knows + can fix it.
function maybeAutoPauseOnFailures(id) {
  try {
    if (!isEnabled(id) || consecutiveFailures(id) < FAILURE_PAUSE_THRESHOLD) return;
    console.warn(`[systemSchedule] ${id} failed ${FAILURE_PAUSE_THRESHOLD}× in a row — auto-pausing`);
    setEnabled(id, false);
    try {
      db.insertLearningCandidate({
        type: 'schedule-autopaused',
        title: `Auto-paused "${id}": failed ${FAILURE_PAUSE_THRESHOLD}× in a row`,
        payload: { id, threshold: FAILURE_PAUSE_THRESHOLD },
        source: 'sys-failure-autopause', confidence: 1, status: 'pending',
      });
    } catch { /* inbox best-effort */ }
  } catch (e) { console.warn('[systemSchedule] auto-pause check failed:', e.message); }
}


// ── Inflight introspection ─────────────────────────────────────────────────

function getInflight() {
  const out = [];
  for (const [id, state] of inflight.entries()) {
    const def = findDefinition(id);
    out.push({
      id,
      kind: 'system',
      runId: state.runId,
      startedAt: state.startedAt,
      agentName: def?.agentName || null,
    });
  }
  return out;
}

function cancelInflight(id) {
  const state = inflight.get(id);
  if (!state) return { ok: false, reason: 'not_running' };
  const def = findDefinition(id);
  if (def && !def.cancellable) return { ok: false, reason: 'not_cancellable' };
  if (state.child && typeof state.child._polyglotCancel === 'function') {
    state.child._polyglotCancel();
    return { ok: true, runId: state.runId };
  }
  return { ok: false, reason: 'no_subprocess' };
}

// ── Handlers ───────────────────────────────────────────────────────────────

// Surface a handler-internal failure instead of swallowing it: log to the
// error_log AND collect it into the run's metadata.faults[] (visible in the
// Schedule history drawer), and for loop-breaking faults stage a 'system-fault'
// Learning-Inbox candidate. Replaces the silent console.warn-only catches that
// used to hide self-improvement-loop breakages. Never throws.
function recordFault(faults, scheduleId, where, err, { critical = false } = {}) {
  const message = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack : undefined;
  console.warn(`[systemSchedule] ${scheduleId}/${where}: ${message}`);
  try {
    db.insertErrorLog({ source: 'system-schedule', message: `${scheduleId}/${where}: ${message}`, stack, context: { scheduleId, where } });
  } catch { /* error log must never break the handler */ }
  if (critical) {
    try {
      db.insertLearningCandidate({
        type: 'system-fault',
        title: `${scheduleId}: ${where} failed — ${message}`.slice(0, 200),
        payload: { scheduleId, where, message },
        source: scheduleId, confidence: 1, status: 'pending',
      });
    } catch { /* best-effort */ }
  }
  if (Array.isArray(faults)) faults.push({ where, message });
}

const HANDLERS = {
  // Post-publish results loop — run every DUE build checkpoint (the workspace.js:477 fix).
  // No-op when no build has due checkpoints, so it's safe to tick hourly.
  async buildSchedulesTick() {
    const buildSchedules = require('./buildSchedules');
    const res = await buildSchedules.runDueBuildSchedules({ log: (m) => console.log(`[build-sched] ${m}`) });
    // Close the learning loop: a results checkpoint (d30/d90) that produced a verdict → fire mira.
    const verdicts = (res.ran || []).filter((r) => r.kind === 'results' && r.label !== 'baseline');
    if (verdicts.length) { try { agentSync.events.emit('results.verdict_emitted', { count: verdicts.length }); } catch { /* SSE best-effort */ } }
    return { output: `build-schedules: ran ${res.ran.length}, failed ${res.failed.length} (due ${res.due})`, metadata: res };
  },

  async rosterRecompute() {
    const { org, experience } = requireDeps();
    const summary = experience.recomputeAllExperience(org);
    return {
      output: `Roster recompute: ${summary.updated}/${summary.total} agents refreshed`,
      metadata: { summary },
    };
  },

  // ── Bucket 1: operational self-enhancement (deterministic, no token cost) ───
  async dbRetention() {
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const cost = db.pruneCostLogs({ daysOld: cfgN('retention.costLogsDays', 90) });
    const runs = db.pruneAgentRuns({ daysOld: cfgN('retention.agentRunsDays', 180) });
    const events = db.pruneAgentEvents({ daysOld: cfgN('retention.agentEventsDays', 30) });
    const delegs = db.pruneDelegations({ daysOld: cfgN('retention.delegationsDays', 90) });
    const removed = cost.removed + runs.removed + events.removed + delegs.removed;
    // Anomaly guard: an abnormally large prune (mis-set retention window, runaway
    // writer, or a clock jump) should be visible, not a silent mass-delete.
    const anomalyThreshold = cfgN('retention.anomalyRows', 50000);
    const anomaly = removed > anomalyThreshold;
    if (anomaly) {
      try {
        db.insertLearningCandidate({
          type: 'retention-anomaly',
          title: `DB retention pruned ${removed} rows in one run (> ${anomalyThreshold})`,
          payload: { removed, cost, runs, events, delegs, anomalyThreshold },
          source: 'sys-db-retention', confidence: 1, status: 'pending',
        });
      } catch { /* best-effort */ }
    }
    return {
      output: `DB retention: pruned ${removed} rows (cost_logs ${cost.removed}, agent_runs ${runs.removed}, agent_events ${events.removed}, delegations ${delegs.removed})${anomaly ? ' — ⚠ ANOMALY' : ''}`,
      metadata: { removed, cost, runs, events, delegs, anomaly },
    };
  },

  async staleRunReconcile() {
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const r = db.reconcileStaleRuns({ maxAgeMin: cfgN('retention.staleRunMaxAgeMin', 30) });
    return {
      output: r.reconciled ? `Reconciled ${r.reconciled} stale run(s) → crashed` : 'No stale runs to reconcile',
      metadata: r,
    };
  },

  async orgDriftCheck() {
    const { org } = requireDeps();
    const { listAgents } = require('./cache');
    const path = require('path');
    const os = require('os');
    const globalAgents = listAgents(path.join(os.homedir(), '.claude', 'agents'));
    const agentMap = Object.fromEntries(globalAgents.map((a) => [a.filename, a]));
    const drift = org.detectDrift(agentMap);
    const onDisk = drift.onlyOnDisk || [];
    const inReg = drift.onlyInRegistry || [];
    const total = onDisk.length + inReg.length;
    if (total > 0) {
      try {
        db.insertLearningCandidate({
          type: 'org-drift',
          title: `Org drift: ${onDisk.length} on-disk-only, ${inReg.length} registry-only`,
          payload: drift,
          source: 'sys-org-drift',
          confidence: 1,
          status: 'pending',
        });
      } catch (e) { console.warn('[orgDriftCheck] inbox insert failed:', e.message); }
    }
    return {
      output: total ? `Org drift: ${onDisk.length} disk-only, ${inReg.length} registry-only` : 'Org registry ↔ disk in sync',
      metadata: { onlyOnDisk: onDisk, onlyInRegistry: inReg, total },
    };
  },

  async costDigest() {
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const dayMs = 86_400_000;
    const now = Date.now();
    const since1d = new Date(now - dayMs).toISOString();
    const since30d = new Date(now - 30 * dayMs).toISOString();
    const yesterday = db.getSpend({ since: since1d }) || {};
    const last30 = db.getSpend({ since: since30d }) || {};
    const topAgents = db.getSpendByAgent({ since: since1d, limit: 5 });
    const yCost = Number(yesterday.costUsd) || 0;
    const dailyAvg30 = (Number(last30.costUsd) || 0) / 30;
    const multiplier = cfgN('cost.anomalyMultiplier', 2.5);
    const floor = cfgN('cost.anomalyFloorUsd', 1);
    const anomaly = yCost >= floor && dailyAvg30 > 0 && yCost > dailyAvg30 * multiplier;
    if (anomaly) {
      try {
        db.insertLearningCandidate({
          type: 'cost-anomaly',
          title: `Cost spike: $${yCost.toFixed(2)} yesterday vs $${dailyAvg30.toFixed(2)}/day avg`,
          payload: { yesterdayUsd: yCost, dailyAvg30Usd: dailyAvg30, multiplier, topAgents },
          source: 'sys-cost-digest',
          confidence: 1,
          status: 'pending',
        });
      } catch (e) { console.warn('[costDigest] inbox insert failed:', e.message); }
    }
    try { agentSync.events.emit('observability.cost-digest', { yesterdayUsd: yCost, dailyAvg30Usd: dailyAvg30, anomaly, topAgents }); } catch { /* best-effort */ }
    return {
      output: `Cost digest: $${yCost.toFixed(2)} yesterday (${yesterday.calls || 0} calls) · 30d avg $${dailyAvg30.toFixed(2)}/day${anomaly ? ' — ⚠ SPIKE' : ''}`,
      metadata: { yesterday, dailyAvg30Usd: dailyAvg30, anomaly, topAgents },
    };
  },

  // Roll yesterday's raw runs/cost/eval into the metrics_daily time-series the
  // Monitoring charts read. Idempotent (INSERT OR REPLACE) so a catch-up is safe.
  async metricsRollup() {
    const yd = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const m = db.computeDayMetrics(yd);
    db.upsertMetricsDaily(yd, '__all__', m);
    // Per-agent rows so the Trends agent selector has data.
    let agents = 0;
    for (const agent of db.getAgentsWithRunsOnDay(yd)) {
      const am = db.computeDayMetrics(yd, agent);
      if (am.runs > 0) { db.upsertMetricsDaily(yd, agent, am); agents++; }
    }
    return {
      output: `Metrics rollup ${yd}: ${m.runs} runs · ${Math.round(m.successRate * 100)}% ok · $${m.costUsd.toFixed(4)} · p95 ${m.p95LatencyMs}ms · ${agents} agents`,
      metadata: { date: yd, agents, ...m },
    };
  },

  // Bucket 4: daily headless UX/a11y audit of the Polyglot app itself.
  async appAudit(def, ctx) {
    const path = require('path');
    const { spawn } = require('child_process');
    const base = configService.getConfig('audit.baseUrl') || `http://localhost:${process.env.PORT || 3847}`;
    const script = path.join(__dirname, '..', '..', 'scripts', 'app-audit.mjs');
    const raw = await new Promise((resolve) => {
      let buf = '';
      const proc = spawn(process.execPath, [script, base], { env: { ...process.env } });
      if (ctx && typeof ctx.registerProc === 'function') ctx.registerProc(proc);
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5 * 60 * 1000);
      proc.stdout.on('data', (d) => { buf += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', () => { clearTimeout(timer); resolve(buf); });
      proc.on('error', () => { clearTimeout(timer); resolve(''); });
    });
    let report;
    try { report = JSON.parse(raw.trim().split('\n').pop()); } catch { report = { error: 'app-audit produced no parseable output' }; }
    if (report.error) return { output: `App audit error: ${report.error}`, metadata: report };

    const t = report.totals || {};
    const actionableOf = (x) => (x.axeCritical || 0) + (x.axeSerious || 0) + (x.consoleErrors || 0) + (x.blankPages || 0) + (x.errored || 0);
    const actionable = actionableOf(t);
    // Delta-based: file a candidate only when actionable findings RISE vs the last
    // successful run — steady-state known issues (font-CSP console error, the
    // color-contrast backlog) don't re-alarm every day. First run reports baseline.
    let prevActionable = -1;
    try {
      const prev = db.getScheduleRunsFor('sys-app-audit', { limit: 8 }).find((r) => r.status === 'success' && r.metadata && r.metadata.totals);
      if (prev) prevActionable = actionableOf(prev.metadata.totals);
    } catch { /* first run / no history */ }
    if (actionable > 0 && actionable > prevActionable) {
      try {
        db.insertLearningCandidate({
          type: 'app-audit',
          title: `App audit: ${t.axeCritical || 0} critical a11y · ${t.consoleErrors || 0} console errors · ${t.blankPages || 0} blank · ${t.errored || 0} errored (prev ${prevActionable < 0 ? 'baseline' : prevActionable})`,
          payload: report,
          source: 'sys-app-audit', confidence: 1, status: 'pending',
        });
      } catch (e) { console.warn('[appAudit] inbox insert failed:', e.message); }
    }
    try { agentSync.events.emit('app.audit', { totals: t, actionable }); } catch { /* best-effort */ }
    return {
      output: `App audit: ${t.pages || 0} pages · ${t.axeCritical || 0} critical a11y · ${t.consoleErrors || 0} console errors · ${t.colorContrast || 0} contrast nodes (tracked) · ${t.errored || 0} errored${actionable > prevActionable && prevActionable >= 0 ? ' — ⚠ rose' : ''}`,
      metadata: report,
    };
  },

  // Bucket 2: daily tsc + test-suite sweep against committed HEAD (delta-alerted).
  async suiteHealth(def, ctx) {
    const path = require('path');
    const { spawn } = require('child_process');
    const script = path.join(__dirname, '..', '..', 'scripts', 'suite-health.mjs');
    const raw = await new Promise((resolve) => {
      let buf = '';
      const proc = spawn(process.execPath, [script], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env } });
      if (ctx && typeof ctx.registerProc === 'function') ctx.registerProc(proc);
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 20 * 60 * 1000);
      proc.stdout.on('data', (d) => { buf += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', () => { clearTimeout(timer); resolve(buf); });
      proc.on('error', () => { clearTimeout(timer); resolve(''); });
    });
    let rep;
    try { rep = JSON.parse(raw.trim().split('\n').pop()); } catch { rep = { error: 'suite-health produced no parseable output' }; }
    if (rep.error) return { output: `Suite health error: ${rep.error}`, metadata: rep };

    const tscErr = (rep.tsc && rep.tsc.errors) || 0;
    const testFail = (rep.tests && rep.tests.fail) || 0;
    const actionable = tscErr + testFail;
    let prev = -1;
    try {
      const p = db.getScheduleRunsFor('sys-suite-health', { limit: 8 }).find((r) => r.status === 'success' && r.metadata && r.metadata.tsc);
      if (p) prev = ((p.metadata.tsc && p.metadata.tsc.errors) || 0) + ((p.metadata.tests && p.metadata.tests.fail) || 0);
    } catch { /* first run */ }
    if (actionable > 0 && actionable > prev) {
      try {
        db.insertLearningCandidate({
          type: 'suite-health',
          title: `Suite health regression: ${tscErr} tsc errors, ${testFail} test failures at ${rep.head || 'HEAD'} (prev ${prev < 0 ? 'baseline' : prev})`,
          payload: rep,
          source: 'sys-suite-health', confidence: 1, status: 'pending',
        });
      } catch (e) { console.warn('[suiteHealth] inbox insert failed:', e.message); }
    }
    return {
      output: `Suite health @${rep.head || 'HEAD'}: tsc ${tscErr} errors · tests ${(rep.tests && rep.tests.pass) || 0}/${(rep.tests && rep.tests.total) || 0} (${testFail} fail)${actionable > prev && prev >= 0 ? ' — ⚠ rose' : ''}`,
      metadata: rep,
    };
  },

  // git-commit ~/.claude/memory on a schedule — real version history for the agent brain,
  // replacing the ad-hoc backup loop that died silently (2026-07-02 SWT infra audit).
  async memorySnapshot(def, ctx) {
    const path = require('path');
    const { spawn } = require('child_process');
    const script = path.join(__dirname, '..', '..', 'scripts', 'memory-snapshot.mjs');
    const raw = await new Promise((resolve) => {
      let buf = '';
      const proc = spawn(process.execPath, [script], { env: { ...process.env } });
      if (ctx && typeof ctx.registerProc === 'function') ctx.registerProc(proc);
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 60 * 1000);
      proc.stdout.on('data', (d) => { buf += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', () => { clearTimeout(timer); resolve(buf); });
      proc.on('error', () => { clearTimeout(timer); resolve(''); });
    });
    let rep;
    try { rep = JSON.parse(raw.trim().split('\n').pop()); } catch { rep = { error: 'memory-snapshot produced no parseable output' }; }
    if (rep.error) return { output: `Memory snapshot error: ${rep.error}`, metadata: rep };
    return {
      output: rep.changed ? `Memory snapshot: committed ${rep.filesChanged} file(s) → ${rep.sha}` : 'Memory snapshot: no changes',
      metadata: rep,
    };
  },

  async witnessSweep() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24);
    const faults = [];

    // Pillar 3 → Witness: pull any new LLM-judge scores from eval-runs.jsonl into
    // eval_scores BEFORE the sweep reads them — otherwise runWitnessSweep classifies
    // on yesterday's eval_scores and today's judged outputs never raise an eval_drop
    // (the learn-from-consequences loop was dead until this ran first). Idempotent.
    // CRITICAL: a silent ingest failure neutered the PIP eval gate with no trace.
    let evalIngested = 0;
    try { evalIngested = (db.ingestEvalRuns() || {}).ingested || 0; }
    catch (err) { recordFault(faults, 'sys-witness', 'eval-ingest', err, { critical: true }); }

    // FIX #11 — read the judge calibration ONCE and hand it to the sweep so eval_drop /
    // PIP decisions agree with the rest of the brain (no double-read, no drift).
    let evalCalibration;
    try { evalCalibration = (await import('../intelligence/governor.mjs')).getEvalCalibration(); }
    catch (err) { recordFault(faults, 'sys-witness', 'calibration-read', err); evalCalibration = undefined; }

    const result = hr.runWitnessSweep(org, experience, recent, { evalCalibration });

    let escalationsAdvanced = 0;
    try {
      const escalation = require('./escalation');
      escalationsAdvanced = escalation.autoAdvanceExpired().length;
    } catch (err) { recordFault(faults, 'sys-witness', 'escalation-sweep', err); }

    try {
      require('./tasks').reconcileLoad();
    } catch (err) { recordFault(faults, 'sys-witness', 'task-reconcile', err); }

    return {
      output: `Witness sweep: ${result.runsClassified} runs, ${result.pipCandidates.length} PIP, ${result.promotionCandidates.length} promo, ${escalationsAdvanced} escalations advanced, ${evalIngested} eval scores ingested${faults.length ? ` · ${faults.length} fault(s)` : ''}`,
      metadata: { sweep: result, escalationsAdvanced, evalIngested, faults },
    };
  },

  // Phase B — cross-project signal aggregator. Runs after Witness (03:00) and the
  // learning digest (04:00) so it sees the day's freshly-classified runs + ingested
  // lessons. Idempotent: re-scans the whole window with set-semantics (no daily
  // double-counting). Emits training_signals the Tutor/trainer (Phase C) acts on.
  async brainAggregate() {
    const brainSignals = require('./brainSignals');
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const result = brainSignals.detectCrossProjectSignals({
      windowDays: cfgN('brain.aggregator.windowDays', 30),
      minOccurrences: cfgN('brain.aggregator.minOccurrences', 3),
      minProjects: cfgN('brain.aggregator.minProjects', 2),
    });
    return {
      output: `Brain aggregate: ${result.emitted} signal(s) [${result.byKind.failure_cluster} fail · ${result.byKind.yash_correction} correction · ${result.byKind.antipattern} antipattern], ${result.new} new, ${result.atAutoBar} at auto-bar (scanned ${result.scanned.runs} runs / ${result.scanned.corrections} corrections / ${result.scanned.inbox} inbox)`,
      metadata: { aggregate: { scanned: result.scanned, emitted: result.emitted, new: result.new, atAutoBar: result.atAutoBar, byKind: result.byKind }, sampleSignals: result.signals.slice(0, 10) },
    };
  },

  async cadenceReview() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24 * 7);
    const review = hr.runCadenceReview(org, experience, recent);
    return {
      output: `Cadence weekly review ${review.week}: ${review.promotions.length} promotions, ${review.pipsOpened.length} PIPs`,
      metadata: { review },
    };
  },

  // Phase C — the Trainer. Deterministic (no LLM, no token cost): consume open
  // training_signals → synthesize concrete rollback-armed patches → governor decides
  // auto/review/reject → surgically edit ~/.claude/agents/<agent>.md for autos (inside
  // the managed AUTOLEARN block only) → record patch + changelog + enqueue reindex →
  // measure impact and auto-rollback any regression. feedback.md/constitution are never
  // touched (the governor forces those to review). Runs weekly after sys-brain-aggregate.
  async tutorTraining() {
    const { runTrainerPass, reconcileAutoPatches } = await import('../intelligence/trainer.mjs');
    const { getEvalCalibration } = await import('../intelligence/governor.mjs');
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const cfg = {
      observeWindowHours: cfgN('trainer.observeWindowHours', 504),
      minRunsForImpact: cfgN('trainer.minRunsForImpact', 5),
      regressionThreshold: cfgN('trainer.regressionThreshold', 0.10),
      cooldownHours: cfgN('trainer.cooldownHours', 48),
      minObserveHours: cfgN('trainer.minObserveHours', 24),
    };
    // FIX #9 — read the judge calibration ONCE, here, with explicit error logging, and
    // pass the boolean into the trainer so the whole cycle agrees on one reading. A
    // swallowed SQLITE_BUSY used to silently hold every auto with no trace; getEvalCalibration
    // already logs + fails safe (calibrated:false, reason:'error').
    const calib = getEvalCalibration();
    const { cycle, impact } = runTrainerPass({ apply: true, cfg, evalCalibrated: calib.calibrated });
    // Reconcile orphaned auto-approved patches (decided 'auto' but left 'proposed' — e.g. from the era
    // the weekly trainer cron never ran). Applies them via the same surgical path, eval-gated — clears
    // the backlog the dead ACT layer left behind, and self-heals any future orphan the cycle skips.
    const reconciled = reconcileAutoPatches({ evalCalibrated: calib.calibrated, by: 'tutor-reconcile' });
    // Phase D.1 — if the trainer changed any agent .md, wake the reindex drain so the
    // new guardrail is searchable in ~60s (the trainer already queued the changed refs).
    if (cycle.applied.length || impact.reverted.length || reconciled.applied.length) {
      try { agentSync.events.emit('memory.changed', { reason: 'trainer' }); } catch { /* nightly reindex backstop */ }
    }
    // FIX #6 — when the judge is miscalibrated the trainer HOLDS every auto. Make that
    // blocker VISIBLE (a kind='alert' Brain-timeline row + /api/health), not a buried
    // inline note: a silently-stuck self-improvement loop looks identical to "nothing to do".
    const BLOCKER_WHY = {
      missing: 'eval selftest never recorded — run sys-intel-eval to calibrate the judge',
      stale: `eval selftest ${calib.ageDays}d old (> ${calib.maxAgeDays}d) — re-run sys-intel-eval`,
      'weak-ratio': 'eval selftest pass-ratio below 0.8 — judge not separating good from bad',
      'low-separation': 'eval selftest good–bad separation below 0.3 — judge drift',
      invalid: 'eval selftest record malformed — re-run sys-intel-eval',
      error: `eval calibration read errored: ${calib.error || 'unknown'}`,
    };
    if (!calib.calibrated) {
      const why = BLOCKER_WHY[calib.reason] || `eval miscalibrated (${calib.reason})`;
      try {
        db.logSelfImprovement({ kind: 'alert', agent: 'tutor', decision: calib.reason,
          summary: `Self-improvement autos HELD — ${why}`,
          data: { blocker: 'eval-miscalibrated', ...calib } });
      } catch (e) { console.warn('[tutorTraining] alert log failed:', e.message); }
    }
    // FIX #10 — name the calibration state in the run output: age when healthy, reason when blocked.
    const calibNote = calib.calibrated
      ? (calib.ageDays != null ? ` [calibration: ${calib.ageDays}d old]` : '')
      : ` [eval miscalibrated (${calib.reason}) → autos held for review]`;
    return {
      output: `Trainer: ${cycle.applied.length} auto-applied · ${cycle.proposed.length} to review · ${cycle.rejected.length} rejected · ${cycle.skipped.length} skipped (of ${cycle.scanned} open signals)${calibNote}. Impact: ${impact.measured.length} measured, ${impact.reverted.length} rolled back, ${impact.waiting.length} settling.`,
      metadata: { trainer: true, cycle, impact, calibration: calib },
    };
  },

  async forgeGapScan(def, ctx) {
    const faults = [];
    let gapsCount = 0;
    try {
      const recent = db.getRecentGaps?.(30) || [];
      gapsCount = Array.isArray(recent) ? recent.length : 0;
    } catch (err) { recordFault(faults, 'sys-forge', 'getRecentGaps', err); }

    // Don't spend tokens on an empty prompt — with no logged gaps there is nothing
    // for forge to analyze (it used to run the LLM blind every month).
    if (gapsCount === 0) {
      return { output: 'NO_GAPS — 0 capability gaps logged in the last 30d; skipped the LLM scan.', metadata: { llm: false, gapsCount, skipped: true, faults } };
    }

    if (!validateAgentExists('forge')) {
      throw new Error('forge agent .md not found in ~/.claude/agents/');
    }

    const task = [
      'Run the monthly capability-gap scan.',
      '1. Survey the last 30 days of dispatch failures + escalations from agent_runs.',
      '2. Identify any role / skill cluster with no qualified agent.',
      '3. For each gap: name the role, skills required, and propose a new agent template (1-paragraph spec).',
      'If no gaps detected, output exactly: "NO_GAPS_DETECTED"',
      `Recent gap-log size: ${gapsCount} entries.`,
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const { output, usage } = await runLLMWithUsage(prompt, ctx);

    // Make the proposal ACTIONABLE: stage it in the Learning Inbox so Yash sees it
    // (it used to land in agent_runs.metadata and was never read by anything).
    const found = !!output && !/NO_GAPS_DETECTED/i.test(output);
    if (found) {
      try {
        db.insertLearningCandidate({
          type: 'capability-proposal',
          title: `Forge: ${gapsCount} capability gap(s) — proposed agent template(s)`,
          payload: { proposal: String(output).slice(0, 8000), gapsCount },
          source: 'sys-forge', confidence: 0.7, status: 'pending',
        });
      } catch (err) { recordFault(faults, 'sys-forge', 'stage-proposal', err); }
    }
    return { output, usage, metadata: { llm: true, gapsCount, staged: found, faults } };
  },

  async miraExtract(def, ctx) {
    const buildIds = ctx?.buildIds || [];
    if (!validateAgentExists('mira')) {
      throw new Error('mira agent .md not found in ~/.claude/agents/');
    }
    const task = [
      'Extract lessons from the recent successful builds.',
      `Build run IDs (last 60s window): ${buildIds.slice(0, 25).join(', ') || '(none — full sweep)'}`,
      '1. For each build, identify reusable patterns + antipatterns + project decisions.',
      '2. Append concise entries (≤6 lines each) to ~/.claude/memory/patterns/good/ and ~/.claude/memory/patterns/avoid/ as appropriate.',
      '3. Update MEMORY.md index entries if new files were added.',
      'Output: short summary of what was extracted (≤30 lines).',
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const { output, usage } = await runLLMWithUsage(prompt, ctx);
    return { output, usage, metadata: { llm: true, buildIds } };
  },

  // Learning loop: once a day, read the day's VS Code sessions, extract candidate
  // lessons/bugs/decisions/feedback, auto-capture the high-confidence ones and
  // stage the rest in the Learning Inbox for one-click review. Cheap by design:
  // zero sessions → no LLM run; bounded transcript summaries; cheap model tier.
  async learningDigest(def, ctx) {
    const cfg = (k, d) => { const v = configService.getConfig(k); return v === undefined || v === null ? d : v; };
    const mode = cfg('learning.vscode.mode', 'auto'); // auto | review | off
    if (mode === 'off') return { output: 'learning digest: mode=off — skipped', metadata: { skipped: true } };

    const maxSessions = cfg('learning.vscode.maxSessions', 20);
    const maxItems = cfg('learning.vscode.maxItems', 12);
    const maxTranscriptChars = cfg('learning.vscode.maxTranscriptChars', 8000);
    const autoConfidence = cfg('learning.vscode.autoConfidence', 0.8);
    const dedupThreshold = cfg('learning.vscode.dedupThreshold', 0.85);
    const model = cfg('learning.vscode.model', 'claude-haiku-4-5-20251001');

    // Discover sessions DIRECTLY from transcripts on disk (hook-independent — the
    // SessionEnd hook rarely fires because VS Code stays open). Upserts pending
    // vscode_session rows from ~/.claude/projects/**/*.jsonl changed recently.
    let scan = { scanned: 0, upserted: 0, repended: 0, errors: [] };
    try {
      const { scanTranscripts } = require('./transcriptScan');
      scan = scanTranscripts({
        lookbackHours: cfg('learning.vscode.scanLookbackHours', 26),
        maxFiles: cfg('learning.vscode.scanMaxFiles', 200),
        maxBytesPerFile: cfg('learning.vscode.scanMaxBytes', 3_000_000),
        minNewTurns: cfg('learning.vscode.scanMinTurns', 2),
        excludeProjects: cfg('learning.vscode.excludeProjects', []),
        projectsDir: cfg('learning.vscode.projectsDir', undefined),
      });
    } catch (err) {
      // CRITICAL: a silent scan failure means NO sessions get discovered → the whole
      // day's lessons/bugs/decisions are lost with no trace. Surface it.
      recordFault(null, 'sys-learning-digest', 'transcript-scan', err, { critical: true });
    }

    const sessions = db.getPendingVscodeSessions(24, maxSessions);
    if (!sessions.length) return { output: `learning digest: no pending sessions (scanned ${scan.scanned})`, metadata: { sessions: 0, scan } };

    const blocks = sessions.map((s, i) => buildSessionBlock(s, maxTranscriptChars, i));
    const prompt = buildDigestPrompt(blocks, maxItems);

    const res = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
      onProc: (child) => ctx?.registerProc?.(child),
      captureUsage: true,
      model,
    });
    const { text, usage } = typeof res === 'string' ? { text: res, usage: null } : { text: res.text, usage: res.usage };

    const candidates = parseCandidates(text).slice(0, maxItems);
    const ids = sessions.map((s) => s.sessionId);

    let captured = 0, staged = 0, deduped = 0, loops = 0, reflections = 0;
    const { captureItem } = await import('../intelligence/capture.mjs');
    const { retrieve } = await import('../intelligence/retrieve.mjs');

    for (const c of candidates) {
      if (!c || !c.type || !c.title) continue;

      // L6 GOAL/INTENT + L2/L7 EPISODIC — continuity rows the SessionStart brief reads
      // back. These are episodic/operational (NOT identity or preferences), so they are
      // safe to auto-write directly to the continuity tables. The (title,project) unique
      // index dedups a loop re-detected across digests.
      if (c.type === 'open_loop') {
        const f = c.fields || {};
        try {
          const r = db.insertOpenLoop({
            title: c.title, detail: f.detail || null,
            owner: f.owner === 'yash' ? 'yash' : 'claude',
            project: c.project || null, sessionId: c.sourceSessionId || null,
            dueAt: f.dueAt || null, source: 'digest',
          });
          if (r.inserted) loops++;
        } catch { /* best-effort */ }
        continue;
      }
      if (c.type === 'reflection') {
        const f = c.fields || {};
        try {
          const r = db.insertReflection({
            kind: f.kind === 'uncertainty' ? 'uncertainty' : 'reflection',
            summary: c.title, detail: f.detail || null,
            project: c.project || null, sessionId: c.sourceSessionId || null,
            confidence: c.confidence,
          });
          if (r) reflections++;
        } catch { /* best-effort */ }
        continue;
      }

      // L1/L5 IDENTITY + PREFERENCE — who-Yash-is facts, durable preferences, and
      // explicit reversals. IDENTITY-LOCK: these are NEVER auto-written — always staged
      // for human sign-off (the inbox approve IS the sign-off). Dedup against existing
      // active facts; resolve a contradiction's superseded fact id so approve can
      // supersede the old belief (belief revision).
      if (c.type === 'identity' || c.type === 'preference' || c.type === 'contradiction') {
        const f = { ...(c.fields || {}) };
        const statement = String(f.statement || c.title || '').trim();
        if (!statement) continue;
        const scope = f.scope || 'global';
        const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
        let existing = [];
        try { existing = db.getIdentityFacts({ scope, status: 'active', limit: 500 }) || []; } catch { existing = []; }
        const nStmt = norm(statement);
        if (existing.some((e) => norm(e.statement) === nStmt)) { deduped++; continue; }
        if (c.type === 'contradiction' && !f.oldId) {
          const prior = norm(f.priorStatement);
          if (prior) {
            const overlap = (a, b) => { const A = new Set(a.split(' ')); const B = b.split(' ').filter((w) => w.length > 3); const hit = B.filter((w) => A.has(w)).length; return B.length ? hit / B.length : 0; };
            let best = null, bestScore = 0;
            for (const e of existing) { const s = overlap(norm(e.statement), prior); if (s > bestScore) { bestScore = s; best = e; } }
            if (best && bestScore >= 0.5) f.oldId = best.id;
          }
        }
        const ins = db.insertLearningCandidate(toCandidateRow({ ...c, fields: f }));
        if (ins.inserted) staged++;
        continue;
      }

      if (!VALID_CANDIDATE_TYPES.has(c.type)) continue;
      // Dedup against the brain (local Ollama embeddings → no token cost).
      try {
        const hits = await retrieve(candidateQuery(c), { topK: 3 });
        if (hits[0] && hits[0].score >= dedupThreshold) { deduped++; continue; }
      } catch { /* dedup best-effort — fall through to stage */ }

      const isCaptureType = c.type === 'lesson' || c.type === 'bug' || c.type === 'decision';
      if (mode === 'auto' && isCaptureType && (c.confidence ?? 0) >= autoConfidence) {
        try {
          const r = await captureItem(c.type, c.fields || {}, 'vscode-digest');
          db.insertLearningCandidate({ ...toCandidateRow(c), status: 'auto', capturedRef: r.id, reviewedAt: new Date().toISOString() });
          captured++;
          continue;
        } catch { /* capture failed (e.g. Ollama down) → stage for manual approve */ }
      }
      const ins = db.insertLearningCandidate(toCandidateRow(c));
      if (ins.inserted) staged++;
    }

    db.markVscodeSessionsDigested(ids);
    if (staged > 0) { try { agentSync.events.emit('learning.candidate', { staged }); } catch { /* SSE best-effort */ } }
    // A new open loop / reflection changes the next SessionStart brief — nudge the Brain tab.
    if (loops > 0 || reflections > 0) { try { agentSync.events.emit('memory.changed', { reason: 'continuity', loops, reflections }); } catch { /* SSE best-effort */ } }

    return {
      output: `learning digest: ${sessions.length} session(s) → ${captured} auto-captured, ${staged} staged, ${deduped} deduped, ${loops} open-loop(s), ${reflections} reflection(s) (scanned ${scan.scanned}, +${scan.upserted}/~${scan.repended})`,
      usage,
      metadata: { llm: true, mode, sessions: sessions.length, captured, staged, deduped, loops, reflections, scan },
    };
  },

  // Pillar 2: incrementally re-embed the brain. Spawns the ESM reindex CLI in its
  // own process (isolation) — local Ollama, no token cost. Self-bounded timeout.
  async intelReindex(def, ctx) {
    const res = await runIntelScript('reindex.mjs', [], { ctx, timeoutMs: 10 * 60 * 1000, label: 'reindex' });
    // Silent-loss guard: after a reindex, every enumerable source should be represented in the index.
    // A gap means a prune dropped it without re-adding (the failure that wiped the FAQ brain) — surface
    // it as a CRITICAL fault so it alerts here, not weeks later when memory_search silently misses.
    const faults = [];
    try {
      const { brainCoverage } = await import('../../scripts/brain-coverage.mjs');
      const cov = await brainCoverage();
      if (cov.missing.length) {
        const sample = cov.missing.slice(0, 3).map((m) => m.source_ref.split('/').pop()).join(', ');
        recordFault(faults, 'sys-intel-reindex', 'coverage-gap', new Error(`${cov.missing.length}/${cov.total} enumerated sources MISSING from index (e.g. ${sample}) — run reindex`), { critical: true });
      }
      return {
        output: `${res.output}; coverage ${cov.indexed}/${cov.total}${cov.missing.length ? ` — ${cov.missing.length} MISSING` : ' (complete)'}${faults.length ? ` · ${faults.length} fault(s)` : ''}`,
        metadata: { ...res.metadata, coverage: { total: cov.total, indexed: cov.indexed, missing: cov.missing.length }, faults },
      };
    } catch (err) {
      recordFault(faults, 'sys-intel-reindex', 'coverage-check', err);
      return { output: `${res.output}; coverage-check failed: ${err.message}`, metadata: { ...res.metadata, faults } };
    }
  },

  // Pillar 3: weekly judge self-test (catches judge drift) then push scores into
  // eval_scores for the Witness loop.
  async intelEval(def, ctx) {
    const res = await runIntelScript('eval/run-eval.mjs', ['--selftest'], { ctx, timeoutMs: 12 * 60 * 1000, label: 'eval' });
    const faults = [];
    // CRITICAL: a silent ingest failure leaves the judge calibration stale → the
    // trainer holds every auto-patch with no obvious cause. Surface it.
    let ingested = 0;
    try { ingested = (db.ingestEvalRuns() || {}).ingested || 0; }
    catch (err) { recordFault(faults, 'sys-intel-eval', 'eval-ingest', err, { critical: true }); }
    // FIX #10 — surface the selftest that was just written: it IS the calibration the
    // trainer reads next (now at 06:30, after this 01:00 run). Name pass-ratio + separation
    // so judge drift is visible here, not only later when the trainer holds autos.
    let selftest = null, calibration = null;
    try {
      const { getEvalCalibration } = await import('../intelligence/governor.mjs');
      selftest = db.getLatestSelftest?.() || null;
      calibration = getEvalCalibration();
    } catch (err) { recordFault(faults, 'sys-intel-eval', 'selftest-read', err); }
    const stPart = selftest
      ? `; selftest ${selftest.calibrated}/${selftest.total} calibrated, sep ${Number(selftest.meanSeparation ?? 0).toFixed(3)} → ${calibration?.calibrated ? 'CALIBRATED' : `miscalibrated (${calibration?.reason})`}`
      : '; no selftest record written';
    return {
      output: `${res.output}; ingested ${ingested} eval score(s) into Witness${stPart}${faults.length ? ` · ${faults.length} fault(s)` : ''}`,
      metadata: { ...res.metadata, ingested, selftest, calibration, faults },
    };
  },

  // Phase D.1: drain the reindex change-queue and SCOPED-incrementally re-embed
  // just the files that changed. Runs IN-PROCESS (local Ollama — capture.mjs already
  // proves in-process embedding works), so there is no child to register/cancel.
  async reindexDrain() {
    const refs = drainReindexQueue(); // reads then clears the queue file
    if (refs.length === 0) return { output: 'reindex-drain: queue empty', metadata: { drained: 0, embedded: 0 } };
    try {
      const { reindex } = await import('../intelligence/reindex.mjs');
      const res = await reindex({ only: refs });
      try { agentSync.events.emit('memory.reindexed', { embedded: res.embedded, drained: refs.length }); } catch { /* SSE best-effort */ }
      return {
        output: `reindex-drain: ${refs.length} queued → embedded ${res.embedded}, skipped ${res.skipped} unchanged in ${(res.ms / 1000).toFixed(1)}s`,
        metadata: { drained: refs.length, embedded: res.embedded, skipped: res.skipped, chunks: res.chunks, ms: res.ms },
      };
    } catch (err) {
      // Don't lose the changes — re-enqueue so the next event (or the 02:30 full
      // reindex) still picks them up.
      for (const r of refs) appendReindexQueue(r, 're-drain');
      throw err;
    }
  },

  // Phase E: monthly forgetting-curve + hygiene. Reversibly down-weights retired-agent
  // chunks via the store decay sidecar (never deletes); reports orphans/stale/freshness.
  async memoryHygiene() {
    const { buildMemoryHygieneReport } = require('./memoryHygiene');
    const r = await buildMemoryHygieneReport({ apply: true });
    try { agentSync.events.emit('memory.hygiene', { generatedAt: r.generatedAt, decayFlaggedRefs: r.decayFlaggedRefs }); } catch { /* SSE best-effort */ }

    // Item 1 producer — stage a `decay_review` inbox candidate for every recommendation
    // that needs a human verdict (retire/keep). Down-weighting retired-agent chunks is
    // already auto + reversible (severity 'auto'); only 'review' items become candidates.
    // Deterministic id per recommendation kind → INSERT OR IGNORE dedups across months
    // so a recurring condition never re-nags once triaged.
    let staged = 0;
    for (const rec of (r.recommendations || [])) {
      if (rec.severity !== 'review') continue;
      const ins = db.insertLearningCandidate({
        id: `decay:${rec.kind}`,
        type: 'decay_review',
        title: rec.detail,
        payload: { kind: rec.kind, detail: rec.detail, agents: rec.agents || [], generatedAt: r.generatedAt },
        source: 'memory-hygiene',
        confidence: 0.6,
      });
      if (ins.inserted) staged++;
    }
    if (staged > 0) { try { agentSync.events.emit('learning.candidate', { staged }); } catch { /* SSE best-effort */ } }

    const f = r.freshness || {};
    return {
      output: `hygiene: ${r.totalChunks} chunks · ${r.recommendations.length} recommendation(s) · ${staged} decay-review staged · ${r.decayFlaggedRefs} decay-flagged · ${r.superseded} superseded · avg age ${f.avgAgeDays}d, oldest ${f.oldestAgeDays}d · ${r.staleCapturedTotal} stale`,
      metadata: { totalChunks: r.totalChunks, recommendations: r.recommendations.length, decayReviewStaged: staged, decayFlaggedRefs: r.decayFlaggedRefs, superseded: r.superseded, staleCaptured: r.staleCapturedTotal, avgAgeDays: f.avgAgeDays, oldestAgeDays: f.oldestAgeDays },
    };
  },

  // Item 4 — behavioral drift detector (weekly, REVIEW-ONLY). Compares each agent's
  // most-recent-N success rate against its full 7-day rate; a sharp decline emits a
  // low-severity `behavior_drift` training_signal. The trainer's ruleLineFor returns
  // null for this kind → planPatch skips it → the signal stays open for human review
  // in the Brain tab and is NEVER auto-patched. Local (no LLM, no token cost).
  async behavioralDriftDetector() {
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const windowHours = cfgN('drift.windowHours', 24 * 7);
    const minTotal    = cfgN('drift.minTotalRuns', 8);
    const recentN     = cfgN('drift.recentWindow', 5);
    const dropThresh  = cfgN('drift.dropThreshold', 0.25);

    const { decodeProject } = require('./brainSignals');
    let runs = [];
    try { runs = db.getRecentAgentRuns(windowHours) || []; } catch { runs = []; }

    // runs come back timestamp-DESC, so the first N per agent are the most recent.
    const byAgent = new Map();
    for (const r of runs) {
      const agent = r.agentName;
      if (!agent || agent === 'unknown') continue;
      let g = byAgent.get(agent);
      if (!g) { g = { runs: [], projects: new Set() }; byAgent.set(agent, g); }
      g.runs.push(r);
      const proj = decodeProject(r.metadata && r.metadata.projectId);
      if (proj) g.projects.add(proj);
    }

    const isOk = (r) => r.status === 'success';
    const rate = (arr) => (arr.length ? arr.filter(isOk).length / arr.length : 0);
    let flagged = 0; const samples = [];
    for (const [agent, g] of byAgent) {
      const n = g.runs.length;
      if (n < minTotal) continue;
      const recent = g.runs.slice(0, recentN);
      if (recent.length < recentN) continue;
      const recentRate = rate(recent);
      const fullRate = rate(g.runs);
      const drop = fullRate - recentRate;
      if (drop < dropThresh) continue; // only a genuine, sharp decline

      const evidence = {
        source: 'agent_runs',
        recentRate: Number(recentRate.toFixed(3)),
        fullRate: Number(fullRate.toFixed(3)),
        drop: Number(drop.toFixed(3)),
        recentWindow: recentN,
        totalRuns: n,
        note: 'review-only — recent success rate fell sharply vs the 7-day baseline',
      };
      db.upsertTrainingSignal({
        agent, kind: 'behavior_drift', signature: 'recent-success-rate-decline',
        severity: 'low', occurrences: 1, mode: 'set',
        projects: [...g.projects], evidence,
      });
      flagged++;
      if (samples.length < 10) samples.push({ agent, ...evidence });
    }
    if (flagged > 0) { try { agentSync.events.emit('memory.changed', { reason: 'behavior-drift', flagged }); } catch { /* SSE best-effort */ } }

    return {
      output: `behavioral drift: ${byAgent.size} agent(s) scanned (${runs.length} runs / ${windowHours}h), ${flagged} flagged for review (recent-${recentN} success rate down ≥${Math.round(dropThresh * 100)}%) — review-only, never auto-patched`,
      metadata: { scannedAgents: byAgent.size, scannedRuns: runs.length, flagged, samples },
    };
  },

  // Item 3 — decision-journal weekly re-score (REVIEW-ONLY). Surfaces aged-unresolved
  // decisions (kind='decision', ≥14d old, outcome still 'pending') as open loops so
  // they get a confirmed/wrong verdict, and logs the rolling decision accuracy from
  // already-resolved ones. Writes NO memory/identity/feedback. Local (no token cost).
  async decisionJournalRescore() {
    const cfgN = (k, d) => { const v = configService.getConfig(k); return Number.isFinite(v) ? v : d; };
    const daysOld   = cfgN('decisions.rescoreDaysOld', 14);
    const surfaceN  = cfgN('decisions.rescoreSurface', 10);
    const accuracyWindow = cfgN('decisions.accuracyDays', 90);

    let aged = [];
    try { aged = db.getUnresolvedDecisions({ daysOld, limit: 50 }) || []; } catch { aged = []; }

    // Dedup against open loops already surfaced (don't re-nag the same decision weekly).
    const existing = new Set();
    try {
      for (const l of db.getOpenLoops({ status: 'open', limit: 500 }) || []) {
        existing.add(`${l.title}||${l.project || ''}`);
      }
    } catch { /* best-effort dedup */ }

    let surfaced = 0;
    for (const d of aged.slice(0, surfaceN)) {
      const title = `Resolve decision: ${String(d.summary || d.id).slice(0, 200)}`;
      const key = `${title.slice(0, 300)}||${d.project || ''}`;
      if (existing.has(key)) continue;
      const ins = db.insertOpenLoop({
        title, detail: d.detail || null, owner: 'claude', project: d.project || null,
        source: 'decision-rescore',
      });
      if (ins.inserted) { surfaced++; existing.add(key); }
    }

    let accuracy = { resolved: 0, accuracy: null };
    try { accuracy = db.getDecisionAccuracy({ sinceDays: accuracyWindow }); } catch { /* telemetry best-effort */ }
    if (surfaced > 0) { try { agentSync.events.emit('memory.changed', { reason: 'decision-rescore', surfaced }); } catch { /* SSE best-effort */ } }

    const accStr = accuracy.accuracy == null ? 'n/a' : `${Math.round(accuracy.accuracy * 100)}%`;
    return {
      output: `decision re-score: ${aged.length} aged-unresolved (≥${daysOld}d), ${surfaced} surfaced as open loop(s); rolling accuracy ${accStr} over ${accuracy.resolved} resolved (${accuracyWindow}d) — review-only`,
      metadata: { agedUnresolved: aged.length, surfaced, accuracy },
    };
  },

  // Lens calibration (WS-G): sample the corpus → inbox items for Yash to grade; apply last week's grades
  // → per-check rubric suggestions (open-loop candidates). Suggestions only — never auto-edits a rubric.
  async lensCalibrateSample(def, ctx) {
    const path = require('path'); const fs = require('fs'); const os = require('os');
    const memDir = path.join(os.homedir(), '.claude', 'memory');
    const out = [];
    // 1) SAMPLE: write a fresh calibration-queue.json from the central corpus (no-ops if corpus empty)
    const s = await runToolkitScript('lens-calibrate.mjs', ['--sample', '20'], { ctx, env: { LENS_CALIBRATE_OUT: memDir }, timeoutMs: 3 * 60 * 1000, label: 'lens-calibrate' });
    out.push(`sample: ${s.output}`.slice(0, 120));
    // 2) INSERT calibration candidates into the Learning Inbox (dedup-safe weekly title)
    let inserted = 0;
    try {
      const q = JSON.parse(fs.readFileSync(path.join(memDir, 'calibration-queue.json'), 'utf-8'));
      const week = new Date().toISOString().slice(0, 10);
      for (const row of (q.queue || [])) {
        const r = db.insertLearningCandidate({
          type: 'calibration',
          title: `Lens calibration · ${week} · ${row.surface || ''} ${row.check} (judge: ${row.verdict})`.slice(0, 200),
          payload: { frameKey: row.key, check: row.check, surface: row.surface, lensVerdict: row.verdict, confidence: row.confidence, hint: 'Approve if you AGREE with the judge; Reject if the judge was WRONG.' },
          source: 'lens-calibration', confidence: Number(row.confidence) || 0, status: 'pending',
        });
        if (r.inserted) inserted += 1;
      }
    } catch (e) { out.push(`inbox: ${e.message}`.slice(0, 80)); }
    out.push(`inbox:+${inserted}`);
    // 3) APPLY: last week's grades → per-check suggestions, surfaced as open-loop candidates (ratify-then-edit)
    let suggestions = 0;
    try {
      const since = new Date(Date.now() - 8 * 86400_000).toISOString();
      const grades = db.listCalibrationGrades({ since });
      if (grades.length) {
        const { pathToFileURL } = require('url');
        const mod = await import(pathToFileURL(path.join(__dirname, '..', '..', 'theme-toolkit', 'scripts', 'lens-calibrate.mjs')).href);
        for (const sg of (mod.computeCalibration(grades).suggestions || [])) {
          const r = db.insertLearningCandidate({
            type: 'open_loop',
            title: `Calibration: review rubric rule for "${sg.check}" (${Math.round(sg.disagreeRate * 100)}% disagree, ${sg.graded} graded)`.slice(0, 200),
            payload: { title: `Review/clarify the Lens rubric rule for "${sg.check}"`, detail: sg.detail, owner: 'yash' },
            source: 'lens-calibration', confidence: sg.disagreeRate, status: 'pending',
          });
          if (r.inserted) suggestions += 1;
        }
      }
    } catch (e) { out.push(`apply: ${e.message}`.slice(0, 80)); }
    out.push(`apply:${suggestions}`);
    return { output: out.join(' · '), metadata: { inserted, suggestions } };
  },
};

// Spawn a theme-toolkit script as a child process (parallel to runIntelScript). Returns { code, output }.
function runToolkitScript(scriptName, args, { ctx, cwd, env = {}, timeoutMs = 10 * 60 * 1000, label = 'toolkit' } = {}) {
  const { spawn } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', '..', 'theme-toolkit', 'scripts', scriptName);
  return new Promise((resolve) => {
    let out = '', err = '', done = false;
    const proc = spawn(process.execPath, [script, ...args], { cwd: cwd || process.cwd(), env: { ...process.env, ...env } });
    try { ctx?.registerProc?.(proc); } catch { /* best-effort */ }
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000); }, timeoutMs);
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    const finish = (code) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, output: (out.trim().split('\n').slice(-2).join(' | ')) || err.trim().slice(0, 160) || `exit ${code}` }); };
    proc.on('close', finish);
    proc.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ code: -1, output: `spawn failed — ${e.message}` }); });
  });
}

// Spawn an ESM intelligence script as a child process, capture a short output
// tail, kill on timeout. Returns { output, metadata } like any handler.
function runIntelScript(relPath, args, { ctx, timeoutMs = 10 * 60 * 1000, label = 'intel' } = {}) {
  const { spawn } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', 'intelligence', relPath);
  return new Promise((resolve) => {
    let out = '', err = '', done = false;
    const proc = spawn(process.execPath, [script, ...args], { env: { ...process.env } });
    try { ctx?.registerProc?.(proc); } catch { /* best-effort */ }
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000); }, timeoutMs);
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    const finish = (code) => {
      if (done) return; done = true; clearTimeout(timer);
      const tail = (out.trim().split('\n').slice(-3).join(' | ')) || err.trim().slice(0, 200) || `(no output)`;
      resolve({ output: `${label}: exit ${code} — ${tail}`, metadata: { code, label } });
    };
    proc.on('close', finish);
    proc.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ output: `${label}: spawn failed — ${e.message}`, metadata: { error: e.message } }); });
  });
}

// ── Reindex change-queue (Phase D.1) ─────────────────────────────────────────
// The trainer (ESM) and any CJS write-path append {ts,ref,reason} lines here; a
// `memory.changed` event wakes the debounced drain. The FILE is the durable source
// of refs (survives restarts); the event is just the "wake up and drain" signal.
const REINDEX_QUEUE_FILE = require('path').join(require('os').homedir(), '.claude', 'memory', '.brain', 'reindex-queue.jsonl');

function appendReindexQueue(ref, reason = 'change') {
  const fs = require('fs'); const path = require('path');
  try {
    fs.mkdirSync(path.dirname(REINDEX_QUEUE_FILE), { recursive: true });
    fs.appendFileSync(REINDEX_QUEUE_FILE, JSON.stringify({ ts: new Date().toISOString(), ref, reason }) + '\n', 'utf8');
  } catch (err) { console.warn('[systemSchedules] appendReindexQueue failed:', err.message); }
}

// Read every queued ref, dedupe, and clear the file. Returns unique source_refs.
// NOTE: a write that lands between the read and the truncate is rare (60s debounce)
// and is caught by the 02:30 full reindex — the queue is an optimization, not the
// source of truth for what's indexed.
function drainReindexQueue() {
  const fs = require('fs');
  let raw = '';
  try { raw = fs.readFileSync(REINDEX_QUEUE_FILE, 'utf8'); } catch { return []; }
  const refs = new Set();
  for (const line of raw.split('\n')) {
    const t = line.trim(); if (!t) continue;
    try { const o = JSON.parse(t); if (o && o.ref) refs.add(o.ref); } catch { /* skip malformed */ }
  }
  try { fs.writeFileSync(REINDEX_QUEUE_FILE, '', 'utf8'); } catch (err) { console.warn('[systemSchedules] queue truncate failed:', err.message); }
  return [...refs];
}

// Public entry point: record a memory/agent file change and wake the debounced
// drain. Call this from agent/memory write paths (routes/agents.js, editors).
function enqueueMemoryChange(ref, reason = 'change') {
  if (!ref) return;
  appendReindexQueue(ref, reason);
  try { agentSync.events.emit('memory.changed', { ref, reason }); } catch { /* drained on next event / nightly */ }
}

function requireDeps() {
  if (!injectedDeps) {
    throw new Error('systemSchedules.bootAll(deps) must run before handler dispatch');
  }
  return injectedDeps;
}

// ── Learning digest helpers ──────────────────────────────────────────────────

const VALID_CANDIDATE_TYPES = new Set(['lesson', 'bug', 'decision', 'feedback']);
const CORRECTION_RE = /\b(no,|nope|actually|don'?t|stop|that'?s wrong|not what|incorrect|i told you|use .* instead|never|always|still (broken|failing|wrong)|not done|doesn'?t work)\b/i;

// Read ONLY the new byte-range of a transcript ([digestFromByte, transcriptBytes])
// so the LLM summary is token-flat even for a long, still-open session. Falls
// back to the whole file for hook-discovered rows (no digestFromByte). Returns
// parsed JSONL line objects.
function readTranscriptDelta(s) {
  const fs = require('fs');
  if (!s.transcriptPath || !fs.existsSync(s.transcriptPath)) return [];
  const from = (s.metadata && Number.isFinite(s.metadata.digestFromByte)) ? s.metadata.digestFromByte : 0;
  const to = Number.isFinite(s.transcriptBytes) && s.transcriptBytes > from ? s.transcriptBytes : null;
  let text = '';
  try {
    if (to) {
      const len = to - from;
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(s.transcriptPath, 'r');
      try { fs.readSync(fd, buf, 0, len, from); } finally { fs.closeSync(fd); }
      text = buf.toString('utf-8');
    } else {
      text = fs.readFileSync(s.transcriptPath, 'utf-8');
    }
  } catch { return []; }
  const out = [];
  for (const ln of text.split('\n')) { if (!ln) continue; try { out.push(JSON.parse(ln)); } catch { /* skip */ } }
  return out;
}

const editPath = (b) => (b && b.input && (b.input.file_path || b.input.path)) ? String(b.input.file_path || b.input.path) : null;

// Walk the transcript IN ORDER and emit a compact "rework loop" trace: each user
// rejection paired with what the failed attempt edited and what the retry edited.
// This is the high-value training signal (the ask → not-done → retry → done cycle).
function extractReworkTrace(lines, maxLoops = 4) {
  const loops = [];
  let ask = '', attemptEdits = [], correction = '', retryEdits = [], inRetry = false;
  const finalize = () => {
    if (inRetry && (ask || correction)) {
      loops.push({ ask: ask.slice(0, 200), rejectedEdits: attemptEdits.slice(0, 6), correction: correction.slice(0, 240), retryEdits: retryEdits.slice(0, 6) });
    }
    correction = ''; retryEdits = []; inRetry = false;
  };
  for (const ev of lines) {
    if (loops.length >= maxLoops) break;
    const msg = ev.message || ev;
    const role = msg.role || ev.type;
    const content = msg.content;
    const userText = role === 'user'
      ? (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '')
      : '';
    if (role === 'user' && userText.trim()) {
      if (CORRECTION_RE.test(userText) && (ask || attemptEdits.length)) {
        if (inRetry) finalize(); // a new rejection ends the prior loop
        correction = userText.trim(); inRetry = true; retryEdits = [];
      } else {
        if (inRetry) finalize();
        ask = userText.trim(); attemptEdits = [];
      }
    } else if (role === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b && b.type === 'tool_use' && (b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit')) {
          const fp = editPath(b); if (!fp) continue;
          if (inRetry) retryEdits.push(fp); else attemptEdits.push(fp);
        }
      }
    }
  }
  finalize();
  return loops;
}

// Build a compact, bounded summary of one VS Code session for the extractor.
// No LLM here. Surfaces touched files, corrections, and — most importantly —
// rework loops, so the extractor can mine the ask→reject→retry→done cycles.
function buildSessionBlock(s, maxChars, idx) {
  const parts = [];
  parts.push(`### Session ${idx + 1} — project: ${s.project || '(unknown)'} [id: ${s.sessionId}]`);
  parts.push(`facts: ${s.turnCount || 0} new turns, ${s.editCount || 0} edits, ${s.bashCount || 0} shell cmds`);

  try {
    const runs = db.getAgentRunsBySession(s.sessionId).slice(0, 12);
    if (runs.length) parts.push('agent runs: ' + runs.map((r) => `${r.agentName}:${r.status}`).join(', '));
  } catch { /* ignore */ }

  try {
    const lines = readTranscriptDelta(s);
    if (lines.length) {
      const files = new Set();
      const corrections = [];
      let lastAssistant = '';
      for (const ev of lines) {
        const msg = ev.message || ev;
        const role = msg.role || ev.type;
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const b of content) {
            if (b.type === 'text' && typeof b.text === 'string') {
              if (role === 'user' && CORRECTION_RE.test(b.text)) corrections.push(b.text.trim().slice(0, 240));
              if (role === 'assistant') lastAssistant = b.text.trim().slice(0, 400);
            } else if (b.type === 'tool_use' && (b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit')) {
              const fp = editPath(b); if (fp) files.add(fp);
            }
          }
        } else if (typeof content === 'string' && role === 'user' && CORRECTION_RE.test(content)) {
          corrections.push(content.trim().slice(0, 240));
        }
      }
      if (files.size) parts.push('files touched: ' + [...files].slice(0, 15).join(', '));

      const trace = extractReworkTrace(lines);
      if (trace.length) {
        parts.push('rework loops (ask → first attempt → user rejected → retry):');
        for (const L of trace) {
          parts.push(`- ask: ${L.ask || '(unknown)'}\n  first attempt edited: ${L.rejectedEdits.join(', ') || '(none)'}\n  user rejected: "${L.correction}"\n  retry edited: ${L.retryEdits.join(', ') || '(none)'}`);
        }
      } else if (corrections.length) {
        parts.push('user corrections:\n- ' + corrections.slice(0, 6).join('\n- '));
      }
      if (lastAssistant) parts.push('last assistant summary: ' + lastAssistant);
    }
  } catch { /* transcript unreadable — facts above are enough */ }

  return parts.join('\n').slice(0, maxChars);
}

// The strict-JSON extraction prompt. We do NOT load Mira's file-writing system
// prompt here — the digest must return data, not write files (we capture).
function buildDigestPrompt(blocks, maxItems) {
  return [
    'You are a senior knowledge analyst reviewing a developer\'s VS Code coding sessions from today.',
    'Extract ONLY genuinely reusable knowledge that would help future work — not routine activity.',
    '',
    'Return STRICT JSON: an array (≤ ' + maxItems + ' items) of candidates. Write NO files. Use NO tools. Output ONLY the JSON array, nothing else.',
    'If nothing is worth saving, return exactly: []',
    '',
    'Each candidate object:',
    '{',
    '  "type": "lesson" | "bug" | "decision" | "feedback" | "open_loop" | "reflection" | "identity" | "preference" | "contradiction",',
    '  "title": "short title (≤100 chars)",',
    '  "confidence": 0.0-1.0,   // how clearly reusable + correct this is',
    '  "sourceSessionId": "the session id it came from",',
    '  "project": "the project name",',
    '  "fields": { ... }        // see per-type fields below',
    '}',
    'Fields by type:',
    '  lesson      → { "domain", "problem", "root_cause", "solution", "prevention" }',
    '  bug         → { "severity" (S1-S4), "symptom", "root_cause", "fix", "prevention" }',
    '  decision    → { "scope", "situation", "decision", "thinking", "alternatives", "outcome" }',
    '  feedback    → { "directive" (the rule/correction to always follow), "context" }  // use for moments where the user CORRECTED the agent',
    '  open_loop   → { "detail" (what is still unfinished/promised), "owner" ("claude"|"yash"), "dueAt" (ISO date or null) }  // an UNFINISHED thread to pick up next time',
    '  reflection  → { "kind" ("reflection"|"uncertainty"), "detail" }  // a felt note about how the work went, or something you are UNSURE about',
    '  identity    → { "kind" ("value"|"voice"|"non_negotiable"|"opinion"), "statement" (the durable fact about who the user is / how they work), "detail", "scope" ("global" or a project name), "confidence" }',
    '  preference  → { "statement" (a durable preference for how work should be done), "detail", "scope", "confidence" }',
    '  contradiction → { "statement" (the NEW belief that now holds), "priorStatement" (the OLD belief it REPLACES, in the user\'s words), "kind" ("value"|"voice"|"non_negotiable"|"opinion"), "detail", "scope", "confidence" }',
    '',
    'Guidance: a "feedback" candidate is for a durable preference/correction the user gave (a rule for next time). A "lesson"/"bug"/"decision" is reusable technical knowledge. An "open_loop" is something explicitly left unfinished or promised ("I\'ll do X next", "still need to Y", a TODO the session ended on) — title = the unfinished thing. A "reflection" captures uncertainty or a notable felt-sense from the session ("unsure whether the cache invalidation is fully correct").',
    'IDENTITY-LOCK — "identity"/"preference"/"contradiction" are HIGH-STAKES who-the-user-is facts. Emit one ONLY when the user STATES a durable truth about themselves or how they want work done ("I am the founder", "I always want premium-first", "stop asking permission for obvious steps"). A "contradiction" is for an EXPLICIT reversal — the user changed a previously-stated belief ("actually, never do X anymore — do Y"); put the new belief in "statement" and the old one in "priorStatement". These are NEVER auto-applied — every one is staged for the user to sign off. Be conservative: a one-off task instruction is NOT identity. Set confidence honestly.',
    'Prefer fewer, higher-quality items. Be honest with confidence. Only emit an open_loop/reflection/identity/preference/contradiction when it is genuinely durable for continuity — not routine activity.',
    '',
    'REWORK LOOPS — IMPORTANT. Some sessions contain a "rework loops" section: the user asked for X, the agent did something, the user REJECTED it ("not done", "still broken", "no", "that\'s wrong"), and the agent retried until accepted. These are the highest-value lessons — they are real mistakes. For each genuine loop, emit ONE compact "lesson":',
    '  domain     = the area (e.g. "react-state", "shopify-liquid", "sqlite")',
    '  problem    = what the user actually asked for',
    '  root_cause = why the FIRST attempt was wrong',
    '  solution   = what finally worked (from the retry edits)',
    '  prevention = how to recognize/avoid this next time (1 line)',
    'Keep each field ≤ 1–2 lines. Skip a loop with no clear root cause. Set confidence ≥0.8 ONLY when the accepted retry is unambiguous.',
    '',
    'The sessions:',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

// Tolerant JSON parse: strip code fences, slice to the outermost array.
function parseCandidates(text) {
  if (!text || typeof text !== 'string') return [];
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function candidateQuery(c) {
  const f = c.fields || {};
  if (c.type === 'lesson') return `${f.problem || c.title} ${f.solution || ''}`.trim();
  if (c.type === 'bug') return `${f.symptom || c.title} ${f.fix || ''}`.trim();
  if (c.type === 'decision') return `${f.decision || c.title} ${f.situation || ''}`.trim();
  if (c.type === 'feedback') return `${f.directive || c.title}`.trim();
  return c.title;
}

function toCandidateRow(c) {
  return {
    type: c.type,
    title: c.title,
    payload: c.fields || {},
    source: 'vscode-session',
    sessionId: c.sourceSessionId || null,
    project: c.project || null,
    confidence: Number.isFinite(c.confidence) ? c.confidence : 0,
  };
}

// Pillar 1: run the LLM capturing REAL token usage; tolerate a string fallback
// if the CLI's JSON envelope ever fails to parse (caller then uses the estimate).
async function runLLMWithUsage(prompt, ctx) {
  const res = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
    onProc: (child) => ctx?.registerProc?.(child),
    captureUsage: true,
  });
  return typeof res === 'string' ? { output: res, usage: null } : { output: res.text, usage: res.usage };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

// Run a system handler. Inserts stub row → emits start → invokes handler →
// completes row → emits terminal SSE. Returns the inflight descriptor
// immediately if caller passes `{ async: true }` — promise resolves to the
// final run record otherwise.
async function runHandler(id, opts = {}) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);

  if (inflight.has(id)) {
    return { skipped: true, reason: 'inflight', runId: inflight.get(id).runId };
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Stub row visible immediately — crash-safe.
  try {
    db.insertAgentRunStub({
      id: runId,
      agentName: def.agentName || 'system',
      prompt: def.description || '',
      source: 'system-schedule',
      metadata: { systemId: def.id, handler: def.handler },
    });
  } catch (err) {
    console.error('[systemSchedules] stub insert failed:', err.message);
    throw err;
  }

  const ctx = {
    runId,
    buildIds: opts.buildIds,
    registerProc: (child) => {
      const state = inflight.get(id);
      if (state) state.child = child;
    },
  };

  inflight.set(id, { runId, startedAt, child: null });
  agentSync.emitScheduleEvent('start', {
    id, kind: 'system', name: def.name, agentName: def.agentName,
    startedAt, runId,
  });

  const finish = (status, result = {}) => {
    const duration = Date.now() - startTime;
    try {
      db.completeAgentRun(runId, {
        status,
        duration,
        output: result.output || '',
        error: result.error || null,
        metadataPatch: result.metadata || {},
        usage: result.usage || null, // Pillar 1: REAL token cost when present
      });
    } catch (err) {
      console.error('[systemSchedules] completeAgentRun failed:', err.message);
    }
    // F3: a failed run might be the Nth in a row — auto-pause if so (runs AFTER
    // completeAgentRun so this run is counted in the streak).
    if (status === 'error') maybeAutoPauseOnFailures(id);
    const evt = status === 'success' ? 'complete' : status === 'cancelled' ? 'cancelled' : 'error';
    agentSync.emitScheduleEvent(evt, {
      id, kind: 'system', status, runId,
      lastRunAt: startedAt, duration, error: result.error,
    });
    inflight.delete(id);
    return { ok: status === 'success', runId, status, duration, output: result.output, error: result.error };
  };

  // Fire-and-forget wrapper used when caller wants async (the run-now route
  // returns 202 immediately while this resolves in background).
  const exec = async () => {
    try {
      const handler = HANDLERS[def.handler];
      if (!handler) throw new Error(`Handler not implemented: ${def.handler}`);
      const result = await handler(def, ctx);
      console.log(`[systemSchedule] ${def.id} ✓ — ${result?.output?.split('\n')[0] || ''}`);
      return finish('success', { output: result?.output, metadata: result?.metadata });
    } catch (err) {
      const status = err.cancelled ? 'cancelled' : 'error';
      console.warn(`[systemSchedule] ${def.id} ${status === 'cancelled' ? '⊘' : '✗'} — ${err.message}`);
      return finish(status, { error: err.message, metadata: { trace: (err.stack || '').slice(0, 500) } });
    }
  };

  if (opts.async) {
    setImmediate(() => { exec().catch(e => console.warn(`[systemSchedule] ${id} unhandled: ${e.message}`)); });
    return { ok: true, runId, status: 'started', kind: 'system' };
  }

  return exec();
}

function startJob(def) {
  if (activeJobs.has(def.id)) {
    try { activeJobs.get(def.id).stop(); } catch {}
    activeJobs.delete(def.id);
  }
  if (!isEnabled(def.id)) return;
  if (!def.cron) return;
  if (!cron.validate(def.cron)) {
    console.warn(`[systemSchedule] invalid cron — skipping: ${def.id} "${def.cron}"`);
    return;
  }
  const job = cron.schedule(def.cron, () => {
    runHandler(def.id, { async: false }).catch(err =>
      console.warn(`[systemSchedule] ${def.id} unhandled: ${err.message}`)
    );
  }, { timezone: 'Etc/UTC' });
  activeJobs.set(def.id, job);
}

// ── Event-driven Mira trigger ──────────────────────────────────────────────

function onBuildSuccessEvent(payload) {
  if (!payload) return;
  if (payload.source !== 'build') return;
  if (payload.status !== 'success') return;
  if (!isEnabled('sys-mira')) return;

  if (payload.runId) miraQueuedBuildIds.push(payload.runId);
  if (miraDebounceTimer) clearTimeout(miraDebounceTimer);
  miraDebounceTimer = setTimeout(() => {
    const ids = miraQueuedBuildIds.slice();
    miraQueuedBuildIds = [];
    miraDebounceTimer = null;
    runHandler('sys-mira', { buildIds: ids, async: true }).catch(err =>
      console.warn(`[systemSchedule] sys-mira unhandled: ${err.message}`)
    );
  }, MIRA_DEBOUNCE_MS);
}

// ── Event-driven reindex-drain trigger (Phase D.1) ──────────────────────────
// Any `memory.changed` resets a 60s timer; when it fires, drain the queue once.
// Coalesces a burst of edits into a single scoped reindex.
function onMemoryChangedEvent() {
  if (!isEnabled('sys-reindex-drain')) return;
  if (reindexDebounceTimer) clearTimeout(reindexDebounceTimer);
  reindexDebounceTimer = setTimeout(() => {
    reindexDebounceTimer = null;
    runHandler('sys-reindex-drain', { async: true }).catch(err =>
      console.warn(`[systemSchedule] sys-reindex-drain unhandled: ${err.message}`)
    );
  }, REINDEX_DEBOUNCE_MS);
}

// ── Boot / shutdown ────────────────────────────────────────────────────────

function bootAll(deps = {}) {
  injectedDeps = deps;
  let active = 0;
  let disabled = 0;
  for (const def of DEFINITIONS) {
    if (def.cron) {
      if (isEnabled(def.id) && cron.validate(def.cron)) {
        startJob(def);
        active += 1;
      } else if (!isEnabled(def.id)) {
        disabled += 1;
      }
    }
  }
  agentSync.events.on('agent_run.recorded', onBuildSuccessEvent);
  agentSync.events.on('memory.changed', onMemoryChangedEvent);

  // Log retention — 03:15 UTC nightly. Plain DB op, no LLM, no agent_runs stub.
  startLogRetentionJob();

  console.log(`  System schedules: ${active} cron-driven active, ${disabled} disabled, sys-mira + sys-reindex-drain event-listeners wired, log-retention nightly`);
}

let _logRetentionJob = null;
function startLogRetentionJob() {
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} }
  _logRetentionJob = cron.schedule('15 3 * * *', () => {
    try {
      const r = db.pruneErrorLog({ resolvedDays: 7, allDays: 30 });
      const log = require('./logger');
      log.info('log retention pruned', { category: 'schedule', meta: r });
    } catch (err) {
      const log = require('./logger');
      log.error(err, { category: 'schedule', meta: { handler: 'logRetention' } });
    }
  }, { timezone: 'Etc/UTC' });
}

function stopAll() {
  for (const [id, job] of activeJobs.entries()) {
    try { job.stop(); } catch {}
    activeJobs.delete(id);
  }
  if (miraDebounceTimer) {
    clearTimeout(miraDebounceTimer);
    miraDebounceTimer = null;
  }
  if (reindexDebounceTimer) {
    clearTimeout(reindexDebounceTimer);
    reindexDebounceTimer = null;
  }
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} _logRetentionJob = null; }
  try { agentSync.events.off('agent_run.recorded', onBuildSuccessEvent); } catch {}
  try { agentSync.events.off('memory.changed', onMemoryChangedEvent); } catch {}
}

// Catch-up for a PC that was asleep/off at the scheduled minute (node-cron
// silently skips missed runs). Runs the schedule now ONLY if it's enabled, not
// inflight, and its last SUCCESS (not last attempt) is older than `hours`.
// Returns { ran, reason } — never throws.
function runIfOverdue(id, hours = 20) {
  try {
    const def = findDefinition(id);
    if (!def) return { ran: false, reason: 'unknown' };
    if (!isEnabled(id)) return { ran: false, reason: 'disabled' };
    if (inflight.has(id)) return { ran: false, reason: 'inflight' };
    const runs = db.getScheduleRunsFor(id, { limit: 10 });
    const lastSuccess = runs.find((r) => r.status === 'success');
    const ageMs = lastSuccess ? (Date.now() - new Date(lastSuccess.timestamp).getTime()) : Infinity;
    if (ageMs < hours * 3600_000) return { ran: false, reason: 'fresh' };
    runHandler(id, { async: true }).catch((err) => console.warn(`[systemSchedule] runIfOverdue ${id}: ${err.message}`));
    return { ran: true, reason: lastSuccess ? `stale ${Math.round(ageMs / 3600_000)}h` : 'never-succeeded' };
  } catch (err) {
    console.warn(`[systemSchedule] runIfOverdue ${id} check failed: ${err.message}`);
    return { ran: false, reason: 'error' };
  }
}

module.exports = {
  bootAll,
  stopAll,
  runHandler,
  runIfOverdue,
  enqueueMemoryChange,
  appendReindexQueue, // exported for tests + write-path callers
  drainReindexQueue,  // exported for tests
  recordFault,        // exported for tests

  setEnabled,
  isEnabled,
  getAllForApi,
  getDefinitions,
  handlerNames: () => Object.keys(HANDLERS), // for the handler-drift test (every def.handler must exist)
  findDefinition,
  computeNextRunAt,
  getInflight,
  cancelInflight,
  _activeJobs: activeJobs,
  _inflight: inflight,
};
