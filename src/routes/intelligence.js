'use strict';

// Web surface for the Pillar 2 vector memory (src/intelligence/*). The existing
// /memory/search (routes/memory.js) is plain substring matching over files; THIS
// is true semantic retrieval over the embedded brain. The intelligence layer is
// ESM (.mjs) and this router is CJS, so we reach it via dynamic import().

const express = require('express');
const router = express.Router();
const { rateLimit } = require('../middleware/rateLimit');

// GET /api/intelligence/search?q=&k=&type=  → ranked, cited chunks (semantic).
router.get('/intelligence/search', rateLimit('read'), async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ query: '', results: [] });
  try {
    const { retrieve } = await import('../intelligence/retrieve.mjs');
    const topK = Math.min(Math.max(Number.parseInt(req.query.k, 10) || 8, 1), 50);
    const filter = req.query.type ? { source_type: req.query.type.toString() } : {};
    const results = await retrieve(q, { topK, filter });
    res.json({ query: q, count: results.length, results });
  } catch (err) {
    // Ollama down / index missing — surface a clear, actionable message.
    res.status(500).json({ error: err.message, hint: 'is Ollama running + the index built? run the sys-intel-reindex schedule.' });
  }
});

// GET /api/intelligence/stats  → index size (chunk count, by source type).
router.get('/intelligence/stats', rateLimit('read'), async (req, res) => {
  try {
    const { getStore, storeKind } = await import('../intelligence/store.mjs');
    const stats = await getStore().stats();
    res.json({ store: storeKind(), ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
