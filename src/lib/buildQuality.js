'use strict';

// Build-quality aggregation (roadmap Phase 5.2 / audit gap 9 dashboard). Collapses the build-fleet
// signals this session created — per-builder build_quality_score (P1, in eval_scores), gate-failure
// trend (quality-loop's quality-trend.jsonl), and the golden-corpus benchmark (P2 baseline.json) —
// into one dashboard payload. PURE: given the rows, returns the summary, so it's tested without a DB.

// evalScores: rows from db.getEvalScores (each { agent, taskType, caseId, overall, pass, ts }).
// trendLines: parsed quality-trend.jsonl snapshots (each { byGate: { name: { pass } }, ... }).
// goldenBaseline: evals/golden-builds/baseline.json ({ meanScore, passed, cases }) or null.
function aggregateBuildQuality({ evalScores = [], trendLines = [], goldenBaseline = null } = {}) {
  // a build score is one tagged taskType 'build' (P1) — fall back to the caseId convention for safety.
  const builds = evalScores.filter((e) => e && (e.taskType === 'build' || String(e.caseId || '').startsWith('build:')) && typeof e.overall === 'number');

  // per-builder: latest score + rolling mean + count (worst latest first — that's where attention goes).
  const byAgent = {};
  for (const e of builds) {
    const a = e.agent || 'unknown';
    const b = (byAgent[a] ||= { agent: a, scores: [], latest: null, latestTs: '' });
    b.scores.push(e.overall);
    if (String(e.ts || '') >= b.latestTs) { b.latest = e.overall; b.latestTs = String(e.ts || ''); }
  }
  const builders = Object.values(byAgent).map((b) => ({
    agent: b.agent,
    latest: b.latest,
    n: b.scores.length,
    mean: b.scores.length ? +(b.scores.reduce((s, x) => s + x, 0) / b.scores.length).toFixed(3) : null,
  })).sort((a, b) => (a.latest ?? 1) - (b.latest ?? 1));

  const passRate = builds.length ? +(builds.filter((e) => e.pass).length / builds.length).toFixed(2) : null;

  // top failing gates across the trend — which gates block builds most often (where to invest).
  const fails = {}, seen = {};
  for (const line of trendLines) {
    const bg = (line && line.byGate) || {};
    for (const [g, v] of Object.entries(bg)) { seen[g] = (seen[g] || 0) + 1; if (v && v.pass === false) fails[g] = (fails[g] || 0) + 1; }
  }
  const topFailingGates = Object.keys(fails)
    .map((g) => ({ gate: g, fails: fails[g], builds: seen[g], rate: +(fails[g] / seen[g]).toFixed(2) }))
    .sort((a, b) => b.fails - a.fails || b.rate - a.rate)
    .slice(0, 8);

  return {
    buildCount: builds.length,
    builders,
    passRate,
    topFailingGates,
    goldenScore: goldenBaseline && typeof goldenBaseline.meanScore === 'number' ? goldenBaseline.meanScore : null,
    goldenCases: goldenBaseline && typeof goldenBaseline.cases === 'number' ? goldenBaseline.cases : null,
  };
}

module.exports = { aggregateBuildQuality };
