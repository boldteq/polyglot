'use strict';

// Build↔agent correlation — the HONEST version (plan §C1/§C6, re-corrected after
// disk audit 2026-06-19).
//
// GROUND TRUTH: there is NO reliable per-build correlation key in SQLite today.
//   • `correlationId` does not exist anywhere.
//   • `agent_runs` has NO `project`/`cwd`/`dir` column; its metadata carries
//     reqId/exitCode/sessionId/summary — nothing tying a run to a build dir.
//   • `witness_log` DOES have a `project` column, but it's a classification log,
//     not the cost/event source.
//
// THEREFORE the only correlation that actually works is PLATFORM-LEVEL: filter
// cost_logs by agentName ∈ the platform's agent roster (exactly what the existing
// workspace.js already does). Per-BUILD agent attribution is not available yet —
// this module exposes it as an explicit, low-confidence/empty result rather than
// fabricating a join. When a real correlation key lands (e.g. metadata.project),
// wire it here in ONE place.

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

// Per-build agent activity (NOT YET RELIABLE). Returns the platform activity but
// flags low confidence, because we cannot currently scope cost_logs to one build
// dir. Callers should render the `correlation` note so the number isn't mistaken
// for build-specific truth.
// eslint-disable-next-line no-unused-vars -- dir reserved for future per-build correlation
function buildAgentActivity(platform, dir, days = 7) {
  const activity = platformAgentActivity(platform, days);
  return {
    ...activity,
    correlation: 'platform', // not 'build' — see module header
    note: 'Shown at platform level — per-build agent attribution is not tracked yet (no build key on agent runs).',
  };
}

module.exports = { rosterFor, platformAgentActivity, buildAgentActivity, ROSTERS };
