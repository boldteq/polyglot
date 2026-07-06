'use strict';

// Read-only API surfacing the Pillar 1/3/5/6 data: real spend, run-event traces,
// the delegation graph, the policy-audit trail, independent eval scores, and the
// consolidation report. The UI (and you) query "which agent, why, real cost, who
// delegated, what got blocked, how is quality trending" — answers that did not
// exist before the hardening.

const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const { buildConsolidationReport } = require('../lib/consolidation');

const wrap = (res, fn) => {
  try { res.json(fn()); }
  catch (err) { res.status(500).json({ error: err.message }); }
};
const intArg = (v, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// Real token spend, split real-vs-estimated. ?since=ISO &agentName=
router.get('/observability/spend', rateLimit('read'), (req, res) =>
  wrap(res, () => db.getSpend({ since: req.query.since, agentName: req.query.agentName })));

// One row per LLM call. ?runId= &agentName= &since= &limit=
router.get('/observability/cost', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getCostLogs({ runId: req.query.runId, agentName: req.query.agentName, since: req.query.since, limit: intArg(req.query.limit, 200) }) })));

// Fine-grained event trace for one run (gate/retry/file/tool/delegation/judge).
router.get('/observability/events/:runId', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getAgentEvents(req.params.runId, { limit: intArg(req.query.limit, 500) }) })));

// Delegation graph edges. ?parentRunId= &childAgent= &limit=
router.get('/observability/delegations', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getDelegations({ parentRunId: req.query.parentRunId, childAgent: req.query.childAgent, limit: intArg(req.query.limit, 200) }) })));

// Full trace tree for one run (Tracing): the run + its nested delegations
// (parent→child agent calls) + per-node events + real token cost, with summed
// totals. All data already exists — this just assembles it server-side.
router.get('/observability/trace/:runId', rateLimit('read'), (req, res) =>
  wrap(res, () => buildTrace(req.params.runId)));

function buildTrace(rootRunId) {
  const totals = { costUsd: 0, tokens: 0, spanMs: 0, nodeCount: 0 };
  let minTs = Infinity, maxTs = -Infinity;
  const visited = new Set();

  // Build one node for a runId; `task` is the label from the delegation edge that
  // created it (null for the root). Recurses over child delegations.
  const buildNode = (runId, task, agentHint, depth) => {
    if (!runId || visited.has(runId) || depth > 8) return null;
    visited.add(runId);

    const run = db.getAgentRun(runId);
    const events = db.getAgentEvents(runId, { limit: 500 });
    const costs = db.getCostLogs({ runId, limit: 200 });

    const costUsd = costs.reduce((s, c) => s + (c.costUsd || 0), 0);
    const tokens = costs.reduce((s, c) => s + (c.totalTokens || 0), 0);
    const estimated = costs.length > 0 ? costs.every(c => c.estimated) : true;

    // Timing: prefer the run row; else derive span from event timestamps.
    const tsList = events.map(e => Date.parse(e.ts)).filter(Number.isFinite);
    const startTs = run?.timestamp || (tsList.length ? new Date(Math.min(...tsList)).toISOString() : null);
    const durationMs = run?.duration
      || (tsList.length >= 2 ? Math.max(...tsList) - Math.min(...tsList) : 0);

    if (startTs) {
      const t = Date.parse(startTs);
      if (Number.isFinite(t)) { minTs = Math.min(minTs, t); maxTs = Math.max(maxTs, t + (durationMs || 0)); }
    }
    totals.costUsd += costUsd;
    totals.tokens += tokens;
    totals.nodeCount += 1;

    const children = [];
    for (const d of db.getDelegations({ parentRunId: runId, limit: 200 })) {
      // A delegation may point to a child run (recurse) or only name a child
      // agent (leaf — no recorded sub-run id).
      if (d.childRunId && !visited.has(d.childRunId)) {
        const child = buildNode(d.childRunId, d.task, d.childAgent, depth + 1);
        if (child) children.push(child);
      } else if (!d.childRunId) {
        // A true leaf delegation — names a child agent but recorded no sub-run.
        // (When d.childRunId IS set but already visited, the node is counted
        // elsewhere in the tree — skip it so totals.nodeCount isn't inflated.)
        totals.nodeCount += 1;
        children.push({
          runId: null,
          agentName: d.childAgent,
          status: 'delegated',
          startTs: d.ts || null,
          durationMs: 0,
          costUsd: 0, tokens: 0, estimated: true,
          events: [], task: d.task || null, children: [],
        });
      }
    }

    return {
      runId,
      agentName: run?.agentName || agentHint || 'unknown',
      status: run?.status || 'unknown',
      startTs,
      durationMs,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      tokens,
      estimated,
      events: events.map(e => ({ ts: e.ts, type: e.type, data: e.data })),
      task: task || null,
      children,
    };
  };

  // An unknown root with no run row, no events, and no delegations has nothing
  // to show — return a null tree so the UI renders a clean empty state.
  const hasAnything = db.getAgentRun(rootRunId)
    || db.getAgentEvents(rootRunId, { limit: 1 }).length
    || db.getDelegations({ parentRunId: rootRunId, limit: 1 }).length;
  if (!hasAnything) return { tree: null, totals: { costUsd: 0, tokens: 0, spanMs: 0, nodeCount: 0 } };

  const tree = buildNode(rootRunId, null, null, 0);
  totals.spanMs = (Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > minTs) ? maxTs - minTs : 0;
  totals.costUsd = Math.round(totals.costUsd * 1e6) / 1e6;
  return { tree, totals };
}

// Dispatch policy decisions. ?decision=allow|block &agentId= &since= &limit=
router.get('/observability/policy-audit', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getPolicyAudit({ decision: req.query.decision, agentId: req.query.agentId, since: req.query.since, limit: intArg(req.query.limit, 200) }) })));

// Pre-aggregated daily metrics for the Monitoring charts. ?since=YYYY-MM-DD &agent=
router.get('/observability/metrics', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getMetricsDaily({ since: req.query.since, agent: req.query.agent || '__all__', limit: intArg(req.query.limit, 90) }) })));

// Independent LLM-judge scores. ?agent= &caseId= &limit=
router.get('/observability/eval-scores', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getEvalScores({ agent: req.query.agent, caseId: req.query.caseId, limit: intArg(req.query.limit, 200) }) })));

// One-call dashboard payload: spend + recent blocks + recent judge scores + recent delegations.
router.get('/observability/summary', rateLimit('read'), (req, res) =>
  wrap(res, () => ({
    spend: db.getSpend({ since: req.query.since }),
    recentBlocks: db.getPolicyAudit({ decision: 'block', limit: 20 }),
    recentEvalScores: db.getEvalScores({ limit: 20 }),
    recentDelegations: db.getDelegations({ limit: 20 }),
  })));

// Consolidation report (Pillar 6) — recommends-only. ?windowDays=30
router.get('/consolidation/report', rateLimit('read'), (req, res) =>
  wrap(res, () => buildConsolidationReport({ windowDays: intArg(req.query.windowDays, 30) })));

module.exports = router;
