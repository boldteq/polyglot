'use strict';

const { Router } = require('express');
const path = require('path');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const configService = require('../lib/configService');

const router = Router();

// Whitelist guard for table names sourced from req.params. Sanitization alone
// (`replace(/[^a-zA-Z0-9_]/g, '')`) is necessary but not sufficient — a stripped
// string could still match an unintended table. Verify against sqlite_master.
function assertValidTable(d, tableName) {
  const exists = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
  if (!exists) {
    const err = new Error('Invalid or unknown table');
    err.statusCode = 404;
    throw err;
  }
  return tableName;
}

// GET /api/db/tables
router.get('/db/tables', rateLimit('read'), (req, res) => {
  try {
    const d = db.getDb();
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const result = tables.map(t => {
      const count = d.prepare(`SELECT COUNT(*) as n FROM "${t.name}"`).get();
      const info = d.prepare(`PRAGMA table_info("${t.name}")`).all();
      return {
        name: t.name,
        rowCount: count.n,
        columns: info.map(c => ({ name: c.name, type: c.type, notnull: !!c.notnull, pk: !!c.pk })),
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/db/table/:name
router.get('/db/table/:name', rateLimit('read'), (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const d = db.getDb();
    const exists = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    if (!exists) return res.status(404).json({ error: 'Table not found' });
    const cap = configService.getConfig('api_limits.db_explorer') ?? 500;
    const limit = Math.min(parseInt(req.query.limit) || cap, cap);
    const offset = parseInt(req.query.offset) || 0;
    const total = d.prepare(`SELECT COUNT(*) as n FROM "${tableName}"`).get().n;
    const rows = d.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(limit, offset);
    const info = d.prepare(`PRAGMA table_info("${tableName}")`).all();
    res.json({ table: tableName, total, limit, offset, columns: info.map(c => c.name), rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/db/query
router.post('/db/query', rateLimit('read'), (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'sql required' });
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA') && !trimmed.startsWith('EXPLAIN')) {
      return res.status(403).json({ error: 'Only SELECT, PRAGMA, and EXPLAIN queries allowed' });
    }
    const d = db.getDb();
    const start = Date.now();
    const rows = d.prepare(sql).all();
    const duration = Date.now() - start;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ columns, rows: rows.slice(0, 500), total: rows.length, duration });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/db/stats
router.get('/db/stats', rateLimit('read'), (req, res) => {
  try {
    const d = db.getDb();
    const size = d.prepare("SELECT page_count * page_size as bytes FROM pragma_page_count(), pragma_page_size()").get();
    const tables = d.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
    const walMode = d.prepare("PRAGMA journal_mode").get();
    res.json({
      sizeBytes: size.bytes,
      sizeKb: Math.round(size.bytes / 1024),
      sizeMb: (size.bytes / 1024 / 1024).toFixed(2),
      tableCount: tables.n,
      journalMode: walMode.journal_mode,
      path: path.join(__dirname, '..', '..', 'data', 'polyglot.db'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/db/export
router.get('/db/export', rateLimit('read'), (req, res) => {
  try {
    const dump = db.exportAllTables();
    res.setHeader('Content-Disposition', `attachment; filename=polyglot-db-${new Date().toISOString().slice(0, 10)}.json`);
    res.json(dump);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/db/table/:name/:pk
router.put('/db/table/:name/:pk', rateLimit('write'), (req, res) => {
  try {
    const d = db.getDb();
    const tableName = assertValidTable(d, req.params.name.replace(/[^a-zA-Z0-9_]/g, ''));
    const pkValue = req.params.pk;
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const row = db.updateRow(tableName, pkValue, updates);
    res.json({ ok: true, row });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// DELETE /api/db/table/:name/:pk
router.delete('/db/table/:name/:pk', rateLimit('write'), (req, res) => {
  try {
    const d = db.getDb();
    const tableName = assertValidTable(d, req.params.name.replace(/[^a-zA-Z0-9_]/g, ''));
    res.json(db.deleteRow(tableName, req.params.pk));
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// GET /api/db/changes
router.get('/db/changes', rateLimit('read'), (req, res) => {
  try {
    const { table, limit } = req.query;
    res.json(db.getChanges(table, parseInt(limit) || 100));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/db/revert/:id
router.post('/db/revert/:id', rateLimit('write'), (req, res) => {
  try {
    res.json(db.revertChange(parseInt(req.params.id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
