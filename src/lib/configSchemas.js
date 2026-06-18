'use strict';

// Phase 2 — Static→Dynamic refactor
// Schema definitions + validators for every `app_config` key. Keeps an
// admin-UI write from blowing up the dispatcher with a string in place of a
// number, or pushing 9999 days as a sweep window. Mirrors the Zod schema
// approach without adding a new dependency.
//
// Each schema returns { ok: true, value } on success or { ok: false, error }
// on failure. Frontend uses these definitions (via /api/app-config/schemas)
// to render the admin UI input controls.

const KEY_SCHEMAS = {
  // health
  'health.threshold_healthy':  { type: 'number', min: 0,   max: 100, step: 1,    label: 'Healthy threshold (%)' },
  'health.threshold_degraded': { type: 'number', min: 0,   max: 100, step: 1,    label: 'Degraded threshold (%)' },
  // time windows
  'time.pip_window_days':       { type: 'number', min: 1,   max: 90,  step: 1,    label: 'PIP window (days)' },
  'time.sweep_hours':           { type: 'number', min: 1,   max: 168, step: 1,    label: 'Witness sweep window (hours)' },
  'time.cadence_review_days':   { type: 'number', min: 1,   max: 30,  step: 1,    label: 'Cadence review window (days)' },
  'time.drift_retention_days':  { type: 'number', min: 7,   max: 365, step: 1,    label: 'Drift retention (days)' },
  'time.claim_expiry_minutes':  { type: 'number', min: 1,   max: 240, step: 1,    label: 'Claim expiry (minutes)' },
  'time.playground_wall_timeout_ms': { type: 'number', min: 5000,  max: 600000, step: 1000, label: 'Playground wall timeout (ms)' },
  'time.playground_idle_timeout_ms': { type: 'number', min: 5000,  max: 600000, step: 1000, label: 'Playground idle timeout (ms)' },
  'time.playground_heartbeat_ms':    { type: 'number', min: 1000,  max: 60000,  step: 500,  label: 'Playground SSE heartbeat (ms)' },
  // api limits
  'api_limits.runs_dashboard':  { type: 'number', min: 1,   max: 10000, step: 1,  label: 'Dashboard runs limit' },
  'api_limits.runs_analytics':  { type: 'number', min: 1,   max: 10000, step: 1,  label: 'Analytics runs limit' },
  'api_limits.governance':      { type: 'number', min: 1,   max: 1000,  step: 1,  label: 'Governance limit' },
  'api_limits.bulk_ops':        { type: 'number', min: 1,   max: 1000,  step: 1,  label: 'Bulk-ops max agents' },
  'api_limits.db_explorer':     { type: 'number', min: 1,   max: 1000,  step: 1,  label: 'DB explorer row limit' },
  'api_limits.logs_stream':     { type: 'number', min: 1,   max: 5000,  step: 1,  label: 'Logs stream limit' },
  'api_limits.top_agents':      { type: 'number', min: 1,   max: 100,   step: 1,  label: 'Top-agents default' },
  'api_limits.playground_run_per_minute': { type: 'number', min: 1, max: 120, step: 1, label: 'Playground runs per minute' },
  // ui caps
  'ui_caps.top_agents':           { type: 'number', min: 1, max: 50,  step: 1, label: 'Top agents in widgets' },
  'ui_caps.stack_trace_lines':    { type: 'number', min: 1, max: 200, step: 1, label: 'Stack trace lines' },
  'ui_caps.memory_preview_lines': { type: 'number', min: 1, max: 200, step: 1, label: 'Memory preview lines' },
  'ui_caps.playground_history':   { type: 'number', min: 1, max: 500, step: 1, label: 'Playground history' },
  'ui_caps.recent_runs':          { type: 'number', min: 1, max: 50,  step: 1, label: 'Dashboard recent runs' },
  'ui_caps.memory_history_items': { type: 'number', min: 1, max: 100, step: 1, label: 'Memory history items' },
  'ui_caps.schedules_dashboard':  { type: 'number', min: 1, max: 30,  step: 1, label: 'Schedules dashboard widget' },
  // defaults
  'defaults.model':         { type: 'string', minLength: 1, maxLength: 100, label: 'Default model' },
  'defaults.tier':          { type: 'enum',   options: ['leadership', 'engineer', 'intel'], label: 'Default tier' }, // allowed: enum list
  'defaults.status':        { type: 'enum',   options: ['active', 'probation', 'pip', 'pending', 'retired'], label: 'Default lifecycle status' },
  'defaults.budget_lines':  { type: 'number', min: 50, max: 5000,   step: 50,  label: 'Default agent budget (lines)' },
  'defaults.budget_chars':  { type: 'number', min: 1000, max: 200000, step: 500, label: 'Default agent budget (chars)' },
  'defaults.claude_path':   { type: 'string', minLength: 0, maxLength: 500, label: 'claude binary path (empty = auto-detect)' },
  // database governance
  'database.allow_edits':   { type: 'boolean', label: 'Allow Database edits', description: 'Enables direct row edit/delete/revert in the Database Explorer. Off by default to prevent accidental writes.' },
};

function validate(key, value) {
  const schema = KEY_SCHEMAS[key];
  if (!schema) return { ok: false, error: `Unknown config key "${key}"` };
  if (schema.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };
    if (schema.min !== undefined && n < schema.min) return { ok: false, error: `${key} must be ≥ ${schema.min}` };
    if (schema.max !== undefined && n > schema.max) return { ok: false, error: `${key} must be ≤ ${schema.max}` };
    return { ok: true, value: n };
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return { ok: false, error: `${key} must be a string` };
    if (schema.minLength !== undefined && value.length < schema.minLength) return { ok: false, error: `${key} must be ≥ ${schema.minLength} chars` };
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return { ok: false, error: `${key} must be ≤ ${schema.maxLength} chars` };
    return { ok: true, value };
  }
  if (schema.type === 'enum') {
    if (!schema.options.includes(value)) return { ok: false, error: `${key} must be one of: ${schema.options.join(', ')}` };
    return { ok: true, value };
  }
  if (schema.type === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, value };
    if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
    return { ok: false, error: `${key} must be a boolean` };
  }
  return { ok: false, error: `Unhandled schema type for ${key}` };
}

const DISPATCH_POLICY_KEYS = ['skill_weight', 'load_weight', 'success_weight', 'cost_weight_normal', 'cost_weight_downgrade'];

function validateDispatchPolicy(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'dispatch policy must be an object' };
  const out = {};
  for (const k of DISPATCH_POLICY_KEYS) {
    if (typeof input[k] !== 'number' || !Number.isFinite(input[k]) || input[k] < 0 || input[k] > 5) {
      return { ok: false, error: `dispatch policy.${k} must be a finite number in [0, 5]` };
    }
    out[k] = input[k];
  }
  const pb = input.priority_boost;
  if (!pb || typeof pb !== 'object') return { ok: false, error: 'priority_boost must be an object' };
  out.priority_boost = {};
  for (const p of ['p0', 'p1', 'p2', 'p3']) {
    if (typeof pb[p] !== 'number' || !Number.isFinite(pb[p]) || pb[p] < -1 || pb[p] > 1) {
      return { ok: false, error: `priority_boost.${p} must be a number in [-1, 1]` };
    }
    out.priority_boost[p] = pb[p];
  }
  return { ok: true, value: out };
}

function describe() {
  return KEY_SCHEMAS;
}

module.exports = {
  validate,
  validateDispatchPolicy,
  describe,
  KEY_SCHEMAS,
};
