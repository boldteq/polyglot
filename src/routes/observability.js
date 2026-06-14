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

// Dispatch policy decisions. ?decision=allow|block &agentId= &since= &limit=
router.get('/observability/policy-audit', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.getPolicyAudit({ decision: req.query.decision, agentId: req.query.agentId, since: req.query.since, limit: intArg(req.query.limit, 200) }) })));

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
