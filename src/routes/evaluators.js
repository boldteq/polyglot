'use strict';

// Evaluators (LangSmith "Evaluators") — CRUD over the editable evaluator library
// (LLM-as-judge rubrics + heuristic templates) plus the live judge calibration
// status. Builtins are read-only (the live judge reads judge.mjs, not this table —
// editing a builtin here would be misleading, so we block it).

const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

// List all evaluators.
router.get('/evaluators', rateLimit('read'), (req, res) => {
  try { res.json({ items: db.listEvaluators() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Live judge calibration (must precede /:id so 'calibration' isn't read as an id).
router.get('/evaluators/calibration', rateLimit('read'), (req, res) => {
  try { res.json({ calibration: db.getLatestSelftest() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/evaluators/:id', rateLimit('read'), (req, res) => {
  try {
    const e = db.getEvaluator(req.params.id);
    if (!e) return res.status(404).json({ error: 'Evaluator not found' });
    res.json(e);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create a new (custom) evaluator.
router.post('/evaluators', rateLimit('write'), (req, res) => {
  try {
    const { name, kind, description, rubric } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
    if (!Array.isArray(rubric)) return res.status(400).json({ error: 'rubric must be an array' });
    let id = slug(name);
    if (!id) return res.status(400).json({ error: 'name must contain letters or numbers' });
    if (db.getEvaluator(id)) id = `${id}-${Date.now().toString(36)}`;
    res.json(db.upsertEvaluator({ id, name: name.trim(), kind: kind === 'heuristic' ? 'heuristic' : 'llm-judge', description, rubric, builtin: 0 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a custom evaluator (builtins are read-only).
router.put('/evaluators/:id', rateLimit('write'), (req, res) => {
  try {
    const existing = db.getEvaluator(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Evaluator not found' });
    if (existing.builtin) return res.status(403).json({ error: 'Builtin evaluators are read-only' });
    const { name, kind, description, rubric } = req.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'name must be a non-empty string' });
    if (rubric !== undefined && !Array.isArray(rubric)) return res.status(400).json({ error: 'rubric must be an array' });
    res.json(db.upsertEvaluator({
      id: existing.id,
      name: (name || existing.name).trim(),
      kind: kind || existing.kind,
      description: description !== undefined ? description : existing.description,
      rubric: rubric !== undefined ? rubric : existing.rubric,
      builtin: 0,
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Run an evaluator's rubric against a sample (task + output) via the LLM judge.
// This is what makes an evaluator real — author a rubric, then score with it.
router.post('/evaluators/:id/run', rateLimit('write'), (req, res) => {
  Promise.resolve().then(async () => {
    const ev = db.getEvaluator(req.params.id);
    if (!ev) { res.status(404).json({ error: 'Evaluator not found' }); return; }
    const { task, output, reference } = req.body || {};
    if (typeof output !== 'string' || !output.trim()) { res.status(400).json({ error: 'output (the text to score) is required' }); return; }
    if (!Array.isArray(ev.rubric) || ev.rubric.length === 0) { res.status(400).json({ error: 'This evaluator has no rubric dimensions' }); return; }
    const { judge } = await import('../intelligence/eval/judge.mjs');
    const v = await judge({ task: task || 'Evaluate the output below.', output, reference: reference || '', rubric: ev.rubric });
    res.json({ evaluator: ev.id, scores: v.scores, overall: v.overall, pass: v.pass, reasoning: v.reasoning, failures: v.failures });
  }).catch(err => res.status(500).json({ error: err.message }));
});

router.delete('/evaluators/:id', rateLimit('write'), (req, res) => {
  try {
    const r = db.deleteEvaluator(req.params.id);
    if (!r.ok && r.reason === 'not_found') return res.status(404).json({ error: 'Evaluator not found' });
    if (!r.ok && r.reason === 'builtin') return res.status(403).json({ error: 'Builtin evaluators cannot be deleted' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
