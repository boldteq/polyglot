'use strict';

// Build↔agent correlation — the HONEST version (plan §C1/§C6, re-corrected after
// disk audit 2026-06-19; per-build attribution landed 2026-06-22).
//
// PER-BUILD (now RELIABLE for cockpit dispatches): every workspace dispatch runs
// on a stable `wsd-<buildId>` playground thread, and the cost path now STAMPS
// `cost_logs.buildId` at log time (db v37). So `getCostLogs({buildId})` returns
// the genuine spend for THIS build's dispatches — no fabricated join. Builds with
// no cockpit dispatches yet simply return an empty build-scoped result.
//
// PLATFORM-LEVEL (fallback, still useful): agents also run outside the cockpit
// (cron sweeps, HR cycles) with no buildId — those can only be attributed at
// platform level via the agent roster. `buildAgentActivity` returns build-scoped
// truth when stamped dispatches exist, else falls back to the platform aggregate
// with an explicit `correlation` flag so the number is never mistaken for truth.

const db = require('../../db');

// platform → agent roster (kept in sync with workspace.js PLATFORMS).
const ROSTERS = {
  shopify: ['atrium', 'compass', 'stitch', 'loom', 'conduit', 'lattice',
    'keystone', 'porter', 'drape', 'ink', 'beacon', 'mantle', 'lumen', 'onyx'],
  wordpress: ['grove', 'seed', 'weave', 'craft', 'wire', 'root', 'trunk', 'canopy', 'bark'],
};

function rosterFor(platform) { return ROSTERS[platform] || []; }

// Platform-level agent activity (RELIABLE). Aggregates cost_logs over `days`.
function platformAgentActivity(platform, days = 7) {
  const agents = rosterFor(platform);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const byAgent = [];
  let runs = 0, costUsd = 0;
  for (const name of agents) {
    const rows = db.getCostLogs({ agentName: name, since, limit: 2000 });
    if (!rows.length) continue;
    const c = rows.reduce((s, r) => s + (r.costUsd || 0), 0);
    byAgent.push({ agentName: name, runs: rows.length, costUsd: Math.round(c * 10000) / 10000 });
    runs += rows.length; costUsd += c;
  }
  byAgent.sort((a, b) => b.runs - a.runs);
  return { runs, costUsd: Math.round(costUsd * 10000) / 10000, sinceDays: days, byAgent };
}

// Build-scoped agent activity (RELIABLE). Aggregates cost_logs stamped with this
// buildId — the genuine spend for cockpit dispatches against this build.
function buildScopedAgentActivity(buildId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db.getCostLogs({ buildId, since, limit: 5000 });
  const byMap = new Map();
  let runs = 0, costUsd = 0;
  for (const r of rows) {
    const c = r.costUsd || 0;
    const name = r.agentName || 'agent';
    const cur = byMap.get(name) || { agentName: name, runs: 0, costUsd: 0 };
    cur.runs += 1; cur.costUsd += c;
    byMap.set(name, cur);
    runs += 1; costUsd += c;
  }
  const byAgent = [...byMap.values()]
    .map((a) => ({ ...a, costUsd: Math.round(a.costUsd * 10000) / 10000 }))
    .sort((a, b) => b.runs - a.runs);
  return { runs, costUsd: Math.round(costUsd * 10000) / 10000, sinceDays: days, byAgent };
}

// Per-build agent activity. Prefers the build-scoped truth (stamped cost_logs);
// falls back to the platform aggregate ONLY when this build has no stamped
// dispatches yet, flagging `correlation` so the UI never mislabels the number.
function buildAgentActivity(platform, dir, days = 7, buildId = null) {
  if (buildId) {
    const scoped = buildScopedAgentActivity(buildId, days);
    if (scoped.runs > 0) {
      return { ...scoped, correlation: 'build', note: null };
    }
  }
  const activity = platformAgentActivity(platform, days);
  return {
    ...activity,
    correlation: 'platform', // no cockpit dispatches stamped to this build yet
    note: 'No cockpit dispatches recorded for this build yet — showing platform-level agent activity. Dispatch an agent from this project to get build-scoped attribution.',
  };
}

module.exports = { rosterFor, platformAgentActivity, buildScopedAgentActivity, buildAgentActivity, ROSTERS };
