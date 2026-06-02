'use strict';

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const configService = require('../lib/configService');

const router = Router();

function loadAgentRuns() { return db.loadAgentRuns(); }

// ── In-process cache for /analytics/aggregate (30s TTL) ───────────────────
const aggregateCache = new Map();
const AGGREGATE_CACHE_MS = 30_000;

function getCachedAggregate(key, compute) {
  const hit = aggregateCache.get(key);
  if (hit && Date.now() - hit.at < AGGREGATE_CACHE_MS) return hit.value;
  const value = compute();
  aggregateCache.set(key, { value, at: Date.now() });
  return value;
}

function rangeToCutoff(range) {
  const now = Date.now();
  switch (range) {
    case '1d':  return now - 86400000;
    case '7d':  return now - 7 * 86400000;
    case '30d': return now - 30 * 86400000;
    case 'all': return 0;
    default:    return now - 7 * 86400000;
  }
}

function rangeDays(range) {
  switch (range) {
    case '1d':  return 1;
    case '7d':  return 7;
    case '30d': return 30;
    case 'all': return 90;
    default:    return 7;
  }
}

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

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — Server-side aggregations
//
// Dashboard / Analytics / AgentHealth used to each pull /analytics/runs +
// /analytics/summary and recompute totals/avg/success-rate/trend on the
// client. That guaranteed drift between pages (different `limit` params,
// different sort orders, different day-window math). These endpoints centralize
// the math so every page reads the same numbers.
// ─────────────────────────────────────────────────────────────────────────

// GET /api/analytics/aggregate?range=1d|7d|30d|all
router.get('/analytics/aggregate', rateLimit('read'), (req, res) => {
  try {
    const range = String(req.query.range || '7d');
    const cacheKey = `aggregate:${range}`;
    const value = getCachedAggregate(cacheKey, () => {
      const cutoff = rangeToCutoff(range);
      const all = loadAgentRuns();
      const runs = cutoff === 0
        ? all
        : all.filter((r) => new Date(r.timestamp).getTime() >= cutoff);

      const totalRuns = runs.length;
      let totalCost = 0, totalDuration = 0, successCount = 0;
      const byAgent = {};
      for (const r of runs) {
        totalCost     += r.estimatedCost   || 0;
        totalDuration += r.duration         || 0;
        if (r.status === 'success') successCount++;
        const name = r.agentName || 'unknown';
        const a = byAgent[name] || (byAgent[name] = { runCount: 0, totalCost: 0, totalDuration: 0, successCount: 0 });
        a.runCount++;
        a.totalCost     += r.estimatedCost   || 0;
        a.totalDuration += r.duration         || 0;
        if (r.status === 'success') a.successCount++;
      }

      const days = rangeDays(range);
      const now = Date.now();
      const dailyTrend = [];
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = now - i * 86400000;
        const dayEnd = dayStart + 86400000;
        const dayRuns = runs.filter((r) => {
          const t = new Date(r.timestamp).getTime();
          return t >= dayStart && t < dayEnd;
        });
        dailyTrend.push({
          label: new Date(dayStart).toLocaleDateString('en-US', { weekday: 'short' }),
          date: new Date(dayStart).toISOString().slice(0, 10),
          total: dayRuns.length,
          success: dayRuns.filter((r) => r.status === 'success').length,
          error: dayRuns.filter((r) => r.status === 'error').length,
          cost: Math.round(dayRuns.reduce((s, r) => s + (r.estimatedCost || 0), 0) * 10000) / 10000,
        });
      }

      const topAgents = Object.entries(byAgent)
        .map(([name, a]) => ({
          name,
          runCount: a.runCount,
          successRate: a.runCount > 0 ? Math.round((a.successCount / a.runCount) * 100) : 0,
          totalCost: Math.round(a.totalCost * 10000) / 10000,
          avgDuration: a.runCount > 0 ? Math.round(a.totalDuration / a.runCount) : 0,
        }))
        .sort((x, y) => y.runCount - x.runCount);

      return {
        range,
        totalRuns,
        totalCost: Math.round(totalCost * 10000) / 10000,
        avgDuration: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
        successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 100,
        dailyTrend,
        topAgents,
        generatedAt: new Date().toISOString(),
      };
    });
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/top-agents?limit=10&range=7d
router.get('/analytics/top-agents', rateLimit('read'), (req, res) => {
  try {
    const range = String(req.query.range || '7d');
    const defaultLimit = configService.getConfig('api_limits.top_agents') ?? 10;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaultLimit, 1), 100);
    const cacheKey = `top:${range}:${limit}`;
    const value = getCachedAggregate(cacheKey, () => {
      const cutoff = rangeToCutoff(range);
      const all = loadAgentRuns();
      const runs = cutoff === 0 ? all : all.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
      const byAgent = {};
      for (const r of runs) {
        const name = r.agentName || 'unknown';
        const a = byAgent[name] || (byAgent[name] = { runCount: 0, totalCost: 0, totalDuration: 0, successCount: 0 });
        a.runCount++;
        a.totalCost     += r.estimatedCost || 0;
        a.totalDuration += r.duration || 0;
        if (r.status === 'success') a.successCount++;
      }
      return {
        range,
        limit,
        agents: Object.entries(byAgent)
          .map(([name, a]) => ({
            name,
            runCount: a.runCount,
            successRate: a.runCount > 0 ? Math.round((a.successCount / a.runCount) * 100) : 0,
            totalCost: Math.round(a.totalCost * 10000) / 10000,
            avgDuration: a.runCount > 0 ? Math.round(a.totalDuration / a.runCount) : 0,
          }))
          .sort((x, y) => y.runCount - x.runCount)
          .slice(0, limit),
        generatedAt: new Date().toISOString(),
      };
    });
    res.json(value);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
