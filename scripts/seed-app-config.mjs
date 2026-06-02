#!/usr/bin/env node

// Phase 2 — Static→Dynamic refactor
// Seed initial app_config + pods + models + model_policy + dispatch_policy
// values. Idempotent — running twice does not change behaviour. Values match
// the current hardcoded literals exactly so cutover is behaviour-preserving.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const db = require('../src/db');
const fallback = require('../src/lib/configFallback');

function seedAppConfig() {
  let inserted = 0;
  let skipped = 0;
  for (const [category, group] of Object.entries(fallback)) {
    if (category === 'dispatch_policy') continue; // singleton table handles this
    for (const [key, value] of Object.entries(group)) {
      const fullKey = `${category}.${key}`;
      const existing = db.getConfigValue(fullKey);
      if (existing !== undefined) { skipped++; continue; }
      db.upsertConfig({
        key: fullKey,
        value,
        category,
        description: describeKey(fullKey),
      });
      inserted++;
    }
  }
  console.log(`[seed] app_config: inserted=${inserted} skipped=${skipped}`);
}

function describeKey(key) {
  const DESC = {
    'health.threshold_healthy': 'Success rate (%) at or above which an agent is "Healthy" (green).',
    'health.threshold_degraded': 'Success rate (%) at or above which an agent is "Degraded" (yellow). Below this = Critical.',
    'time.pip_window_days': 'Length of a Performance Improvement Plan window in days.',
    'time.sweep_hours': 'Witness daily sweep look-back window in hours.',
    'time.cadence_review_days': 'Cadence weekly review look-back window in days.',
    'time.drift_retention_days': 'Drift report retention window in days.',
    'time.claim_expiry_minutes': 'Learning claim auto-expiry timeout in minutes.',
    'api_limits.runs_dashboard': 'Max agent_runs rows returned to Dashboard.',
    'api_limits.runs_analytics': 'Max agent_runs rows returned to Analytics.',
    'api_limits.governance': 'Max escalation rows returned to Governance.',
    'api_limits.bulk_ops': 'Max agents allowed in a single bulk-op request.',
    'api_limits.db_explorer': 'Max rows returned in DatabaseExplorer table queries.',
    'api_limits.logs_stream': 'Max log rows streamed/retained in Logs page.',
    'api_limits.top_agents': 'Default limit for top-agents endpoints.',
    'ui_caps.top_agents': 'Default number of top agents shown in Dashboard/Analytics widgets.',
    'ui_caps.stack_trace_lines': 'Max stack trace lines rendered in Logs.',
    'ui_caps.memory_preview_lines': 'Max lines of memory preview rendered in MemoryHistory.',
    'ui_caps.playground_history': 'Max items kept in Playground history.',
    'ui_caps.recent_runs': 'Max recent runs in Dashboard side panel.',
    'ui_caps.memory_history_items': 'Max items in MemoryHistory list.',
    'ui_caps.schedules_dashboard': 'Max schedule rows in Dashboard widget.',
    'defaults.model': 'Default model assigned to a new/imported agent when neither disk nor DB specify one.',
    'defaults.tier': 'Default tier (engineer/leadership/intel) for a new agent.',
    'defaults.status': 'Default lifecycle status for a new agent.',
    'defaults.budget_lines': 'Default compactor line budget for an agent.',
    'defaults.budget_chars': 'Default compactor character budget for an agent.',
  };
  return DESC[key] ?? null;
}

function seedDispatchPolicy() {
  const current = db.loadDispatchPolicy();
  if (current && Object.keys(current).length > 0) {
    console.log('[seed] dispatch_policy: already populated, skipping');
    return;
  }
  db.saveDispatchPolicy(fallback.dispatch_policy);
  console.log('[seed] dispatch_policy: inserted defaults');
}

function seedPods() {
  const initial = [
    { id: 'shopify-app',    prefix: 'shopify-app-',    department: 'engineering', description: 'Shopify Native (embedded admin) pod' },
    { id: 'shopify-web',    prefix: 'shopify-web-',    department: 'engineering', description: 'Shopify Storefront (external/Hydrogen) pod' },
    { id: 'saas',           prefix: 'saas-',           department: 'engineering', description: 'Stack A (Next.js + Supabase + Railway) pod' },
  ];
  const existing = new Set(db.listPods().map((p) => p.id));
  let inserted = 0;
  for (const p of initial) {
    if (existing.has(p.id)) continue;
    db.upsertPod(p);
    inserted++;
  }
  console.log(`[seed] pods: inserted=${inserted} skipped=${initial.length - inserted}`);
}

function seedModels() {
  const initial = [
    { id: 'claude-opus-4-6',          displayName: 'Opus 4.6',    tier: 'leadership', costPenalty: 1.0,  enabled: 1 },
    { id: 'claude-opus-4-7',          displayName: 'Opus 4.7',    tier: 'leadership', costPenalty: 1.0,  enabled: 1 },
    { id: 'claude-sonnet-4-6',        displayName: 'Sonnet 4.6',  tier: 'engineer',   costPenalty: 0.3,  enabled: 1 },
    { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5',   tier: 'intel',      costPenalty: 0.05, enabled: 1 },
  ];
  const existing = new Set(db.listModels().map((m) => m.id));
  let inserted = 0;
  for (const m of initial) {
    if (existing.has(m.id)) continue;
    db.upsertModel(m);
    inserted++;
  }
  console.log(`[seed] models: inserted=${inserted} skipped=${initial.length - inserted}`);
}

function seedModelPolicy() {
  // Mirrors src/routes/learning.js:25-46 HARDCODED_RULES. Phase 3 will delete
  // the literal from learning.js and route reads through configService.
  const initial = [
    { pattern: 'copy|content|seo|brand', model: 'claude-haiku-4-5-20251001', tier: 'intel',      agents: ['quill', 'spark', 'merch', 'docsmith', 'serif', 'sequence', 'zeph'], priority: 50 },
    { pattern: 'architecture|design|plan|review',                 model: 'claude-opus-4-7',     tier: 'leadership', agents: ['arya', 'vega', 'sage', 'verdict', 'yash', 'cadence', 'pixel', 'token', 'elio'], priority: 90 },
    { pattern: 'bug|fix|refactor|test|build|migration',           model: 'claude-sonnet-4-6',   tier: 'engineer',   agents: ['koda', 'dato', 'luna', 'vex', 'bolt', 'hawk', 'riko'], priority: 70 },
    { pattern: 'research|intel|market|teardown|harvest',          model: 'claude-sonnet-4-6',   tier: 'engineer',   agents: ['nova', 'scout', 'atlas', 'harvest', 'decoder', 'pulse', 'ledger', 'orbit'], priority: 60 },
  ];
  const existing = db.listModelPolicy();
  if (existing.length > 0) {
    console.log(`[seed] model_policy: ${existing.length} rows already exist, skipping`);
    return;
  }
  for (const r of initial) db.insertModelPolicy(r);
  console.log(`[seed] model_policy: inserted=${initial.length}`);
}

try {
  seedAppConfig();
  seedDispatchPolicy();
  seedPods();
  seedModels();
  seedModelPolicy();
  console.log('[seed] done.');
  db.close();
} catch (err) {
  console.error('[seed] failed:', err);
  db.close();
  process.exit(1);
}
