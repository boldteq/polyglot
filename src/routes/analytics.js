'use strict';

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const router = Router();

function loadAgentRuns() { return db.loadAgentRuns(); }

// GET /api/analytics/runs
router.get('/analytics/runs', rateLimit('read'), (req, res) => {
  let runs = loadAgentRuns();
  const { agent, status, source, from, to, limit, offset } = req.query;
  if (agent) runs = runs.filter(r => r.agentName === agent);
  if (status) runs = runs.filter(r => r.status === status);
  if (source) runs = runs.filter(r => r.source === source);
  if (from) runs = runs.filter(r => r.timestamp >= from);
  if (to) runs = runs.filter(r => r.timestamp <= to);
  const total = runs.length;
  const off = parseInt(offset) || 0;
  const lim = Math.min(parseInt(limit) || 50, 200);
  res.json({ total, runs: runs.slice(off, off + lim) });
});

// GET /api/analytics/summary
router.get('/analytics/summary', rateLimit('read'), (req, res) => {
  const runs = loadAgentRuns();
  const summary = {};
  for (const run of runs) {
    if (!summary[run.agentName]) {
      summary[run.agentName] = { runCount: 0, totalDuration: 0, successCount: 0, totalEstimatedCost: 0, totalTokens: 0 };
    }
    const s = summary[run.agentName];
    s.runCount++;
    s.totalDuration += run.duration || 0;
    if (run.status === 'success') s.successCount++;
    s.totalEstimatedCost += run.estimatedCost || 0;
    s.totalTokens += run.estimatedTokens || 0;
  }
  const result = {};
  for (const [name, s] of Object.entries(summary)) {
    result[name] = {
      runCount: s.runCount,
      avgDuration: Math.round(s.totalDuration / s.runCount),
      successRate: Math.round((s.successCount / s.runCount) * 100),
      totalEstimatedCost: Math.round(s.totalEstimatedCost * 10000) / 10000,
      totalTokens: s.totalTokens,
    };
  }
  res.json(result);
});

module.exports = router;
