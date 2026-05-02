'use strict';

const { Router } = require('express');
const { EventEmitter } = require('events');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const router = Router();

// Internal event bus — emits 'new_error' whenever insertErrorLog is called
const logEvents = new EventEmitter();
logEvents.setMaxListeners(50);

// Patch insertErrorLog to also emit SSE events after persisting
const _originalInsert = db.insertErrorLog.bind(db);
db.insertErrorLog = function patchedInsertErrorLog(opts) {
  _originalInsert(opts);
  try {
    // Fetch the exact row we just inserted using lastInsertRowid
    const info = db.getDb().prepare(
      "SELECT * FROM error_log WHERE id = (SELECT MAX(id) FROM error_log)"
    ).get();
    if (info) logEvents.emit('new_error', info);
  } catch {}
};

// GET /api/logs/stream — SSE. Pushes 'new_error' events in real time.
router.get('/logs/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Send current unresolved count on connect
  try {
    send('ready', { unresolved: db.getUnresolvedErrorCount() });
  } catch {}

  const onNewError = (row) => send('new_error', row);
  const onResolved = (p) => send('resolved', p);
  const onCleared  = (p) => send('cleared', p);

  logEvents.on('new_error', onNewError);
  logEvents.on('resolved',  onResolved);
  logEvents.on('cleared',   onCleared);

  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch {}
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    logEvents.off('new_error', onNewError);
    logEvents.off('resolved',  onResolved);
    logEvents.off('cleared',   onCleared);
  };
  req.on('close', cleanup);
  req.on('end', cleanup);
});

// GET /api/logs?limit=200&source=server&resolved=0
router.get('/logs', rateLimit('read'), (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const source = req.query.source || undefined;
    const resolved = req.query.resolved !== undefined
      ? (req.query.resolved === '1' || req.query.resolved === 'true' ? 1 : 0)
      : undefined;
    const entries = db.getErrorLog({ limit, source, resolved });
    const unresolved = db.getUnresolvedErrorCount();
    res.json({ entries, unresolved, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/count — lightweight badge count
router.get('/logs/count', rateLimit('read'), (_req, res) => {
  try {
    res.json({ unresolved: db.getUnresolvedErrorCount() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logs/client-error — frontend JS errors
router.post('/logs/client-error', rateLimit('write'), (req, res) => {
  try {
    const { message, stack, context } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    db.insertErrorLog({ level: 'error', source: 'client', message, stack, context });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/logs/:id/resolve
router.patch('/logs/:id/resolve', rateLimit('write'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    db.markErrorResolved(id);
    logEvents.emit('resolved', { id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/logs — clear resolved (or all if ?all=1)
router.delete('/logs', rateLimit('write'), (req, res) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const result = db.clearErrorLog({ all });
    logEvents.emit('cleared', { all });
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
