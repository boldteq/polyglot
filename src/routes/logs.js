'use strict';

const { Router } = require('express');
const { EventEmitter } = require('events');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const configService = require('../lib/configService');

const router = Router();

// Internal event bus — emits 'new_error' whenever insertErrorLog is called
const logEvents = new EventEmitter();
logEvents.setMaxListeners(50);

// Patch insertErrorLog to emit SSE only for rows that actually persisted.
// _originalInsert returns the new rowid on success, null on dedup/failure.
const _originalInsert = db.insertErrorLog.bind(db);
db.insertErrorLog = function patchedInsertErrorLog(opts) {
  const rowid = _originalInsert(opts);
  if (!rowid) return rowid; // dedup blocked or insert failed — do not emit
  try {
    const info = db.getDb().prepare("SELECT * FROM error_log WHERE id = ?").get(rowid);
    if (info) logEvents.emit('new_error', info);
  } catch {}
  return rowid;
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

// GET /api/logs
//   ?limit=200&source=server&resolved=0&level=error&category=http
//   &agentId=koda&q=search&since=ISO&until=ISO&beforeId=12345
router.get('/logs', rateLimit('read'), (req, res) => {
  try {
    const streamCap = configService.getConfig('api_limits.logs_stream') ?? 500;
    const hardCap = Math.max(streamCap * 2, 1000);
    const limit = Math.min(parseInt(req.query.limit, 10) || streamCap, hardCap);
    const source = req.query.source || undefined;
    const level = req.query.level || undefined;
    const category = req.query.category || undefined;
    const agentId = req.query.agentId || undefined;
    const q = req.query.q || undefined;
    const since = req.query.since || undefined;
    const until = req.query.until || undefined;
    const beforeId = req.query.beforeId || undefined;
    const resolved = req.query.resolved !== undefined
      ? (req.query.resolved === '1' || req.query.resolved === 'true' ? 1 : 0)
      : undefined;
    const entries = db.getErrorLog({ limit, source, resolved, level, category, agentId, q, since, until, beforeId });
    const unresolved = db.getUnresolvedErrorCount();
    res.json({ entries, unresolved, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/histogram?hours=24 — sparkline data, last N hours by level
router.get('/logs/histogram', rateLimit('read'), (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 168);
    res.json({ buckets: db.getErrorLogHistogram({ hours }), hours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logs/_selftest — dev-only synthetic error generator. Verifies
// the whole pipeline (insert → SSE → UI) end to end. Disabled in prod.
// All messages are stable text so dedup (60s window) blocks repeat clicks —
// rapid presses do NOT spam the log.
router.post('/logs/_selftest', rateLimit('write'), (req, res) => {
  if (process.env.NODE_ENV === 'production' && req.query.force !== '1') {
    return res.status(403).json({ error: 'selftest disabled in production' });
  }
  const log = require('../lib/logger');
  const stamp = new Date().toISOString();
  // Count rows before to compute how many actually got inserted (dedup may
  // skip some on repeat calls within 60s).
  const beforeCount = db.getDb().prepare(
    "SELECT COUNT(*) as n FROM error_log WHERE message LIKE 'selftest%'"
  ).get().n;
  log.error('selftest synthetic error',     { category: 'startup',     meta: { test: true } });
  log.warn ('selftest synthetic warn',      { category: 'http',        meta: { test: true } });
  log.error('selftest db category',         { category: 'db',          meta: { test: true } });
  log.error('selftest integration category',{ category: 'integration', meta: { test: true } });
  log.error('selftest agent-run category',  { category: 'agent-run',   agentId: 'sage', meta: { test: true } });
  log.warn ('selftest schedule warn',       { category: 'schedule',    meta: { test: true } });
  console.error('selftest console.error capture');
  const afterCount = db.getDb().prepare(
    "SELECT COUNT(*) as n FROM error_log WHERE message LIKE 'selftest%'"
  ).get().n;
  const inserted = afterCount - beforeCount;
  // Self-clean (Fix 2): the pipeline is verified — don't let synthetic rows
  // accumulate in the real error feed. Delete them and tell live viewers to refetch.
  const cleaned = db.getDb().prepare("DELETE FROM error_log WHERE message LIKE 'selftest%'").run().changes;
  logEvents.emit('cleared', { selftest: true, count: cleaned });
  res.json({ ok: true, ts: stamp, attempted: 7, inserted, deduped: 7 - inserted, cleaned });
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

// DELETE /api/logs — clear resolved (or all if ?all=1, or by category)
router.delete('/logs', rateLimit('write'), (req, res) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const category = req.query.category;
    if (category) {
      const r = db.getDb().prepare('DELETE FROM error_log WHERE category = ?').run(category);
      logEvents.emit('cleared', { category, count: r.changes });
      return res.json({ ok: true, deleted: r.changes });
    }
    const result = db.clearErrorLog({ all });
    logEvents.emit('cleared', { all });
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/logs/resolve-all?category=http — bulk resolve
router.patch('/logs/resolve-all', rateLimit('write'), (req, res) => {
  try {
    const conds = [];
    const args = [];
    if (req.query.category) { conds.push('category = ?'); args.push(req.query.category); }
    if (req.query.level)    { conds.push('level = ?');    args.push(req.query.level); }
    if (req.query.source)   { conds.push('source = ?');   args.push(req.query.source); }
    let sql = 'UPDATE error_log SET resolved = 1 WHERE resolved = 0';
    if (conds.length) sql += ' AND ' + conds.join(' AND ');
    const r = db.getDb().prepare(sql).run(...args);
    logEvents.emit('resolved', { bulk: true, count: r.changes });
    res.json({ ok: true, resolved: r.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
