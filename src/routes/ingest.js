'use strict';

// Ingest agent runs that happened OUTSIDE Polyglot — e.g. a Claude Code
// `SubagentStop` hook firing in VS Code. Records them into `agent_runs` (the same
// table the orchestrated paths use) so the HR learning loop (Witness/Cadence/
// Tutor/Roster) finally SEES your real day-to-day work, not just Polyglot runs.
//
// Gated by the global `localOnly` middleware (127.0.0.1 only) + write rate limit.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const VALID_STATUS = new Set(['success', 'error', 'cancelled', 'timeout', 'crashed']);
const clampStr = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// POST /api/ingest/agent-run
//   { agentName, status?, durationMs?, summary?, prompt?, error?, source?, metadata? }
router.post('/ingest/agent-run', rateLimit('write'), (req, res) => {
  const b = req.body || {};
  if (!b.agentName || typeof b.agentName !== 'string' || b.agentName.length > 100) {
    return res.status(400).json({ error: 'agentName required (string, ≤100 chars)' });
  }
  const status = VALID_STATUS.has(b.status) ? b.status : 'success';
  const duration = Number.isFinite(b.durationMs) ? Math.max(0, Math.round(b.durationMs)) : 0;
  const prompt = clampStr(b.prompt, 500);
  const summary = clampStr(b.summary, 500);
  const isFail = status === 'error' || status === 'crashed' || status === 'timeout';

  try {
    db.insertAgentRun({
      id: `vscode-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      agentName: b.agentName,
      prompt,
      source: clampStr(b.source, 40) || 'vscode',
      timestamp: new Date().toISOString(),
      duration,
      status,
      promptChars: prompt.length,
      outputChars: summary.length,
      estimatedTokens: Math.ceil((prompt.length + summary.length) / 4),
      estimatedCost: 0,
      error: isFail ? clampStr(b.error, 1000) || 'unknown' : null,
      metadata: { ...(b.metadata && typeof b.metadata === 'object' ? b.metadata : {}), summary, ingested: true },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
