'use strict';

// Deterministic build health score (plan §4). Disk-first; absent artifacts
// contribute 0 to their weight and NEVER crash. Returns:
//   { score, grade, breakdown:[{key,weight,earned,detail}], pending:[], maxRealistic }
//
// Because goals/brand/results are absent on all current builds (plan §C5), the
// realistic ceiling today is < 100. We surface that via `pending` so the number
// reads as "15 pts of artifacts not produced yet", not a defect.

const gatesSpec = require('./gatesSpec.json');

const WEIGHTS = {
  gates_pass_rate: 30,
  lens_verdict: 20,
  changes_completion: 15,
  pipeline_progress: 10,
  schedule_health: 5,
  agent_health: 5,
  brand_bible_present: 5,
  goals_present: 5,
  results_present: 5,
  // blockers are a penalty (negative), applied after the positive sum
  blockers_penalty: -15,
};

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'BLOCK-RISK';
}

// inputs (all optional; sensible defaults so partial data still scores):
//   gates: [{ pass }]              normalized gate reports (readGateReports)
//   lensVerdict: 'pass'|'block'|null
//   changes: { present, rate }     parseChangesMd output
//   step: { current, total }       deriveCurrentStep output
//   schedulesOpen: number          non-stale scheduled watches
//   agentRosterUnhealthy: number   roster agents in pip/probation
//   blockersOpen: number           count of open blocker findings
//   artifacts: { brandBible, goals, baseline } booleans (presence)
function computeBuildScore(inputs = {}) {
  const {
    gates = [], lensVerdict = null, changes = { present: false, rate: 0 },
    step = { current: 1, total: 18 }, schedulesOpen = 0, agentRosterUnhealthy = 0,
    blockersOpen = 0, artifacts = {},
  } = inputs;

  const breakdown = [];
  const pending = [];
  const add = (key, earned, detail) => breakdown.push({ key, weight: WEIGHTS[key], earned: Math.round(earned * 10) / 10, detail });

  // gates_pass_rate — over the canonical gate set; "required" = gates that have a report
  const reported = gates.length;
  const passed = gates.filter((g) => g.pass).length;
  const gatesEarned = reported ? (passed / reported) * WEIGHTS.gates_pass_rate : 0;
  add('gates_pass_rate', gatesEarned, `${passed}/${reported} reported (of ${gatesSpec.count} gates)`);
  if (!reported) pending.push('no gate reports yet');

  // lens_verdict
  const lensEarned = lensVerdict === 'pass' ? WEIGHTS.lens_verdict : lensVerdict === 'block' ? 0 : WEIGHTS.lens_verdict / 2;
  add('lens_verdict', lensEarned, lensVerdict || 'not run');
  if (!lensVerdict) pending.push('Lens not run');

  // changes_completion
  const changesEarned = changes.present ? (changes.rate / 100) * WEIGHTS.changes_completion : 0;
  add('changes_completion', changesEarned, changes.present ? `${changes.rate}% checked` : 'no CHANGES.md');

  // pipeline_progress
  const progEarned = (Math.min(step.current, step.total) / step.total) * WEIGHTS.pipeline_progress;
  add('pipeline_progress', progEarned, `step ${step.current}/${step.total}`);

  // schedule_health — full credit if any open watch, else 0 (no schedules ≠ unhealthy, but unscored)
  const schedEarned = schedulesOpen > 0 ? WEIGHTS.schedule_health : 0;
  add('schedule_health', schedEarned, `${schedulesOpen} open watch(es)`);

  // agent_health — lose proportional credit per unhealthy roster agent (cap at 0)
  const agentEarned = Math.max(0, WEIGHTS.agent_health - agentRosterUnhealthy * 2);
  add('agent_health', agentEarned, agentRosterUnhealthy ? `${agentRosterUnhealthy} roster agent(s) pip/probation` : 'roster healthy');

  // presence weights (0 when absent — EXPECTED today)
  const brandEarned = artifacts.brandBible ? WEIGHTS.brand_bible_present : 0;
  add('brand_bible_present', brandEarned, artifacts.brandBible ? 'present' : 'absent');
  if (!artifacts.brandBible) pending.push('brand bible');

  const goalsEarned = artifacts.goals ? WEIGHTS.goals_present : 0;
  add('goals_present', goalsEarned, artifacts.goals ? 'present' : 'absent');
  if (!artifacts.goals) pending.push('goals.json');

  const resultsEarned = artifacts.baseline ? WEIGHTS.results_present : 0;
  add('results_present', resultsEarned, artifacts.baseline ? 'present' : 'absent');
  if (!artifacts.baseline) pending.push('results baseline');

  // positive sum
  let score = breakdown.reduce((s, b) => s + b.earned, 0);

  // blockers penalty (negative), -3 each capped at -15
  const penalty = Math.max(WEIGHTS.blockers_penalty, -3 * blockersOpen);
  if (blockersOpen > 0) add('blockers_penalty', penalty, `${blockersOpen} open blocker(s)`);
  score += penalty;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // maxRealistic = 100 minus the weights of any absent presence-artifacts
  const maxRealistic = 100
    - (artifacts.brandBible ? 0 : WEIGHTS.brand_bible_present)
    - (artifacts.goals ? 0 : WEIGHTS.goals_present)
    - (artifacts.baseline ? 0 : WEIGHTS.results_present);

  return { score, grade: grade(score), breakdown, pending, maxRealistic };
}

module.exports = { computeBuildScore, WEIGHTS };
