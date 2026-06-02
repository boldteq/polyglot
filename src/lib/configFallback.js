'use strict';

// Phase 2 — Static→Dynamic refactor
// Hard-coded fallback values used when the SQLite app_config read fails.
// Mirrors the seed-app-config.js initial values. Frontend surfaces a banner
// when these are active (see useAppConfig hook).
//
// IMPORTANT: keep this file in lockstep with src/scripts/seed-app-config.js.
// Update both together if a default changes.

module.exports = {
  health: {
    threshold_healthy: 90,
    threshold_degraded: 70,
  },
  time: {
    pip_window_days: 14,
    sweep_hours: 24,
    cadence_review_days: 7,
    drift_retention_days: 30,
    claim_expiry_minutes: 30,
    playground_wall_timeout_ms: 120000,
    playground_idle_timeout_ms: 90000,
    playground_heartbeat_ms: 15000,
  },
  api_limits: {
    runs_dashboard: 200,
    runs_analytics: 500,
    governance: 50,
    bulk_ops: 100,
    db_explorer: 50,
    logs_stream: 500,
    top_agents: 10,
    playground_run_per_minute: 10,
  },
  ui_caps: {
    top_agents: 10,
    stack_trace_lines: 15,
    memory_preview_lines: 20,
    playground_history: 50,
    recent_runs: 8,
    memory_history_items: 14,
    schedules_dashboard: 6,
  },
  defaults: {
    model: 'claude-sonnet-4-6',
    tier: 'engineer',
    status: 'pending',
    budget_lines: 400,
    budget_chars: 16000,
    claude_path: '',
  },
  dispatch_policy: {
    skill_weight: 0.5,
    load_weight: 0.2,
    success_weight: 0.2,
    cost_weight_normal: 0.1,
    cost_weight_downgrade: 0.45,
    priority_boost: { p0: 0.3, p1: 0.15, p2: 0, p3: -0.05 },
  },
};
