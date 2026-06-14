'use strict';

// Consolidation report (Pillar 6) — "fewer elite agents" analysis. RECOMMENDS,
// never executes (retiring/merging agents is a human governance decision).
//
// Two independent signals:
//   1. STRUCTURAL overlap — clusters of active agents in the same dept/sub-dept.
//      Registry-derived, data-independent → actionable immediately.
//   2. FREQUENCY — runs/week per agent from agent_runs (Pillar 1). Only meaningful
//      once enough real run data has accumulated; the report self-flags when it's
//      too sparse so nobody retires an agent on missing telemetry.

const db = require('../db');
const org = require('../org');

// Departments whose agents are infrastructure/governance — never retire on idleness.
const SYSTEM_DEPTS = new Set(['HR', 'Executive']);

function buildConsolidationReport({ windowDays = 30 } = {}) {
  const runs = db.getRecentAgentRuns(windowDays * 24) || [];
  const runCount = {};
  for (const r of runs) runCount[r.agentName] = (runCount[r.agentName] || 0) + 1;

  const registry = org.loadRegistry() || {};
  const entries = Object.entries(registry.agents || {});
  const active = entries.filter(([, a]) => (a.status || 'active') === 'active');
  const weeks = windowDays / 7;

  const perAgent = active.map(([id, a]) => {
    const n = runCount[id] || 0;
    return {
      id,
      title: a.title || null,
      department: a.department || '—',
      subDepartment: a.subDepartment || null,
      squad: a.squad || null,
      runs: n,
      runsPerWeek: Math.round((n / weeks) * 100) / 100,
      system: SYSTEM_DEPTS.has(a.department),
    };
  });

  const agentsWithRuns = perAgent.filter((x) => x.runs > 0).length;
  // Heuristic: need at least ~1 logged run per active agent before frequency means
  // anything. Far below that ⇒ telemetry is too thin to retire on.
  const dataSufficient = runs.length >= active.length;

  // STRUCTURAL overlap — dept / sub-dept clusters of 3+ active agents.
  const buckets = {};
  for (const x of perAgent) {
    const key = `${x.department} / ${x.subDepartment || '—'}`;
    (buckets[key] = buckets[key] || []).push(x);
  }
  const overlapClusters = Object.entries(buckets)
    .filter(([, v]) => v.length >= 3)
    .map(([cluster, v]) => ({
      cluster,
      size: v.length,
      agents: v.map((a) => a.id),
      withRuns: v.filter((a) => a.runs > 0).length,
      idle: v.filter((a) => a.runs === 0).map((a) => a.id),
    }))
    .sort((a, b) => b.size - a.size);

  // FREQUENCY retire candidates — non-system active agents under 1 run/week.
  // Confidence is gated on dataSufficient.
  const retireCandidates = perAgent
    .filter((x) => !x.system && x.runsPerWeek < 1)
    .sort((a, b) => a.runs - b.runs)
    .map((x) => ({ id: x.id, department: x.department, runs: x.runs, runsPerWeek: x.runsPerWeek }));

  return {
    windowDays,
    activeAgents: active.length,
    agentsWithRuns,
    totalRuns: runs.length,
    dataSufficient,
    note: dataSufficient
      ? null
      : `Only ${runs.length} runs logged across ${agentsWithRuns} agents in ${windowDays}d — too sparse for frequency-based retirement (Pillar 1 observability now records real runs; let it accumulate). The structural-overlap clusters below are registry-derived and actionable now.`,
    overlapClusters,
    retireCandidates: dataSufficient ? retireCandidates : [],
    retireCandidatesLowConfidence: dataSufficient ? [] : retireCandidates,
    perAgent,
  };
}

module.exports = { buildConsolidationReport };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const windowDays = Number.parseInt(process.argv[2], 10) || 30;
  const r = buildConsolidationReport({ windowDays });
  console.log(`\nConsolidation report — last ${r.windowDays}d`);
  console.log('─'.repeat(64));
  console.log(`Active agents: ${r.activeAgents}  |  with logged runs: ${r.agentsWithRuns}  |  total runs: ${r.totalRuns}`);
  console.log(`Frequency data sufficient for retirement decisions: ${r.dataSufficient ? 'YES' : 'NO'}`);
  if (r.note) console.log(`\n⚠ ${r.note}`);
  console.log(`\nStructural overlap clusters (3+ active agents, same dept/sub-dept):`);
  if (!r.overlapClusters.length) console.log('  (none)');
  for (const c of r.overlapClusters) {
    console.log(`  • ${c.cluster}  — ${c.size} agents (${c.withRuns} with runs, ${c.idle.length} idle)`);
    console.log(`      ${c.agents.join(', ')}`);
    if (c.idle.length) console.log(`      idle: ${c.idle.join(', ')}`);
  }
  const rc = r.dataSufficient ? r.retireCandidates : r.retireCandidatesLowConfidence;
  console.log(`\nLow-frequency agents (<1 run/wk, non-system)${r.dataSufficient ? '' : ' — LOW CONFIDENCE (sparse data)'}: ${rc.length}`);
  for (const x of rc.slice(0, 20)) console.log(`  ${x.id.padEnd(22)} ${String(x.runs).padStart(3)} runs  (${x.runsPerWeek}/wk)  ${x.department}`);
  if (rc.length > 20) console.log(`  … +${rc.length - 20} more`);
  console.log('\nNOTE: recommendations only — merge/retire is a human decision.');
}
