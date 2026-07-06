'use strict';

// Datasets & Experiments (LangSmith). Datasets = the golden eval cases (read from
// src/intelligence/eval/golden via loadCases). An experiment runs a dataset's
// cases through an agent — spawning a real model run per case + judging it — and
// stores each scored result so two runs can be compared. Heavy + costs money at
// run time, so the UI gates it behind a cost-confirm; runs are async + cancellable.

const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const { buildAgentPrompt, validateAgentExists } = require('../lib/runClaude');

const MAX_CASES = 30;            // cost guard — never run more than this in one experiment
const PER_CASE_TIMEOUT = 180000; // 3 min per agent spawn

const wrap = (res, fn) => Promise.resolve().then(fn).then(v => res.json(v)).catch(err => res.status(err.status || 500).json({ error: err.message }));

// ── Datasets (golden cases, read-only) ───────────────────────────────────────
async function loadCasesSafe() {
  const { loadCases } = await import('../intelligence/eval/run-eval.mjs');
  return loadCases();
}

router.get('/datasets', rateLimit('read'), (req, res) => wrap(res, async () => {
  const cases = await loadCasesSafe();
  return {
    items: cases.map(c => ({
      id: c.id, agent: c.agent || null, task_type: c.task_type || null,
      task: (c.task || '').slice(0, 240), hasFixtures: !!(c.fixtures && c.fixtures.good),
      niche: c.niche || null,
    })),
  };
}));

router.get('/datasets/:id', rateLimit('read'), (req, res) => wrap(res, async () => {
  const c = (await loadCasesSafe()).find(x => x.id === req.params.id);
  if (!c) { const e = new Error('Dataset case not found'); e.status = 404; throw e; }
  return { id: c.id, agent: c.agent, task_type: c.task_type, niche: c.niche || null, task: c.task, reference: c.reference || '', rubric: c.rubric || [], fixtures: c.fixtures ? Object.keys(c.fixtures) : [] };
}));

// ── Experiments ──────────────────────────────────────────────────────────────
router.get('/experiments', rateLimit('read'), (req, res) =>
  wrap(res, () => ({ items: db.listExperiments({ datasetId: req.query.datasetId, limit: 100 }) })));

router.get('/experiments/compare', rateLimit('read'), (req, res) => wrap(res, () => {
  const a = db.getExperiment(req.query.a);
  const b = db.getExperiment(req.query.b);
  if (!a || !b) { const e = new Error('Both experiment ids (a, b) are required'); e.status = 400; throw e; }
  const byCase = new Map();
  for (const r of a.results) byCase.set(r.caseId, { caseId: r.caseId, aOverall: r.overall, aPass: r.pass });
  for (const r of b.results) {
    const row = byCase.get(r.caseId) || { caseId: r.caseId, aOverall: null, aPass: null };
    row.bOverall = r.overall; row.bPass = r.pass;
    byCase.set(r.caseId, row);
  }
  const rows = [...byCase.values()].map(r => ({ ...r, delta: (r.aOverall != null && r.bOverall != null) ? +(r.bOverall - r.aOverall).toFixed(3) : null }));
  return { a: { id: a.id, agent: a.agent, summary: a.summary }, b: { id: b.id, agent: b.agent, summary: b.summary }, rows };
}));

router.get('/experiments/:id', rateLimit('read'), (req, res) => wrap(res, () => {
  const exp = db.getExperiment(req.params.id);
  if (!exp) { const e = new Error('Experiment not found'); e.status = 404; throw e; }
  return exp;
}));

router.post('/experiments/:id/cancel', rateLimit('write'), (req, res) => wrap(res, () => {
  const exp = db.getExperimentRow(req.params.id);
  if (!exp) { const e = new Error('Experiment not found'); e.status = 404; throw e; }
  if (exp.status === 'running' || exp.status === 'pending') db.setExperimentStatus(req.params.id, 'cancelled');
  return { ok: true };
}));

// Create + launch an experiment (async, fire-and-forget). Returns immediately.
router.post('/experiments', rateLimit('write'), (req, res) => wrap(res, async () => {
  const { agent, caseIds, evaluatorId } = req.body || {};
  if (typeof agent !== 'string' || !agent.trim()) { const e = new Error('agent required'); e.status = 400; throw e; }
  if (!Array.isArray(caseIds) || caseIds.length === 0) { const e = new Error('caseIds[] required'); e.status = 400; throw e; }
  if (caseIds.length > MAX_CASES) { const e = new Error(`Too many cases (max ${MAX_CASES})`); e.status = 400; throw e; }
  if (!validateAgentExists(agent)) { const e = new Error(`Agent '${agent}' not found`); e.status = 404; throw e; }
  // Optional evaluator override — score with its rubric instead of each case's own.
  let evaluator = null;
  if (evaluatorId) {
    evaluator = db.getEvaluator(evaluatorId);
    if (!evaluator) { const e = new Error(`Evaluator '${evaluatorId}' not found`); e.status = 404; throw e; }
  }

  const cases = await loadCasesSafe();
  const byId = new Map(cases.map(c => [c.id, c]));
  const valid = caseIds.filter(id => byId.has(id));
  if (valid.length === 0) { const e = new Error('No valid dataset cases in caseIds'); e.status = 400; throw e; }

  const id = `exp-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
  db.createExperiment({ id, datasetId: req.body.datasetId || agent, agent, evaluatorId: evaluatorId || null, total: valid.length });

  // Fire-and-forget — do NOT await; the client polls GET /experiments/:id.
  runExperiment(id, agent, valid.map(cid => byId.get(cid)), evaluator).catch(err => {
    try { db.setExperimentStatus(id, 'failed', { error: err.message }); } catch { /* best-effort */ }
  });

  return { id, total: valid.length };
}));

// Bounded async runner: agent spawn → judge → store, per case, max 3 at a time,
// checking the cancel flag between cases. If `evaluator` is set, score with its
// rubric; otherwise use the golden case's own rubric via scoreOutput.
async function runExperiment(expId, agent, cases, evaluator) {
  const { scoreOutput } = await import('../intelligence/eval/run-eval.mjs');
  const { judge } = evaluator ? await import('../intelligence/eval/judge.mjs') : {};
  db.setExperimentStatus(expId, 'running');

  const runOne = async (c) => {
    const cur = db.getExperimentRow(expId);
    if (!cur || cur.status === 'cancelled') return;
    let output = '', usage = null, costUsd = 0, errMsg = null;
    try {
      const r = await buildAndRun(agent, c.task);
      output = r.text; usage = r.usage;
      costUsd = usage && typeof usage.costUsd === 'number' ? usage.costUsd : 0;
      if (usage) {
        try {
          db.logCost({ runId: `${expId}:${c.id}`, agentName: agent, model: usage.model,
            inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd,
            estimated: typeof usage.costUsd === 'number' ? false : true, source: 'experiment' });
        } catch { /* cost logging is best-effort */ }
      }
    } catch (e) { errMsg = e.message; }

    // Re-check cancel before the (also costly) judge call.
    if ((db.getExperimentRow(expId) || {}).status === 'cancelled') return;

    let scored = { overall: null, pass: false, scores: {}, reasoning: errMsg ? `agent run failed: ${errMsg}` : null };
    if (!errMsg && output) {
      try {
        scored = evaluator
          ? await judge({ task: c.task, output, reference: c.reference || '', rubric: evaluator.rubric })
          : await scoreOutput(c.id, output);
      } catch (e) { scored.reasoning = `judge failed: ${e.message}`; }
    }
    // Don't record results/progress for a run cancelled while this case was in flight.
    if ((db.getExperimentRow(expId) || {}).status === 'cancelled') return;
    db.addExperimentResult({
      experimentId: expId, caseId: c.id, agent, output: errMsg ? `[ERROR] ${errMsg}` : output,
      scores: scored.scores, overall: scored.overall, pass: scored.pass, reasoning: scored.reasoning, costUsd,
    });
    db.bumpExperimentProgress(expId);
  };

  await pool(cases, 3, runOne);

  // Only finalize to 'done' if a cancel didn't land during/after the run (avoids a
  // cancelled→done clobber from a cancel that arrives right before this write).
  if ((db.getExperimentRow(expId) || {}).status === 'cancelled') return;
  const results = db.getExperimentResults(expId);
  const scoredResults = results.filter(r => r.overall != null);
  const summary = {
    cases: results.length,
    passed: results.filter(r => r.pass).length,
    avgOverall: scoredResults.length ? +(scoredResults.reduce((s, r) => s + r.overall, 0) / scoredResults.length).toFixed(3) : null,
    costUsd: +results.reduce((s, r) => s + (r.costUsd || 0), 0).toFixed(6),
  };
  db.setExperimentStatus(expId, 'done', { summary });
}

async function buildAndRun(agent, task) {
  const { runClaudeSync } = require('../lib/runClaude');
  const prompt = buildAgentPrompt(agent, task);
  return runClaudeSync(prompt, PER_CASE_TIMEOUT, { captureUsage: true });
}

// Tiny bounded promise pool (run-eval.mjs's pool isn't exported).
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

module.exports = router;
