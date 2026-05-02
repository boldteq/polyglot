'use strict';

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const backup = require('../backup');
const { loadConfig, saveConfig } = require('../lib/config');

const router = Router();

// Inject config accessors
backup.setConfigFns(loadConfig, saveConfig);

// GET /api/backup/status
router.get('/backup/status', rateLimit('read'), (req, res) => {
  try {
    res.json(backup.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/connect
router.post('/backup/connect', rateLimit('write'), async (req, res) => {
  try {
    const { repoUrl, token } = req.body;
    const result = await backup.connect({ repoUrl, token });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/disconnect
router.post('/backup/disconnect', rateLimit('write'), (req, res) => {
  try {
    res.json(backup.disconnect());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/now
router.post('/backup/now', rateLimit('write'), async (req, res) => {
  try {
    const result = await backup.doBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/commits
router.get('/backup/commits', rateLimit('read'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const commits = await backup.listCommits(limit);
    res.json(commits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore/preview
router.post('/backup/restore/preview', rateLimit('write'), async (req, res) => {
  try {
    const { commitSha } = req.body;
    if (!commitSha) return res.status(400).json({ error: 'commitSha is required' });
    const result = await backup.previewRestore(commitSha);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore/apply
router.post('/backup/restore/apply', rateLimit('write'), async (req, res) => {
  try {
    const { commitSha } = req.body;
    if (!commitSha) return res.status(400).json({ error: 'commitSha is required' });
    const result = await backup.applyRestore(commitSha);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/snapshots
router.get('/backup/snapshots', rateLimit('read'), (req, res) => {
  try {
    res.json(backup.listSnapshots());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/snapshots/restore
router.post('/backup/snapshots/restore', rateLimit('write'), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = backup.restoreSnapshot(name);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/verify-remote
router.get('/backup/verify-remote', rateLimit('read'), async (req, res) => {
  try {
    const result = await backup.verifyRemote();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/backup/create-remote
router.post('/backup/create-remote', rateLimit('write'), async (req, res) => {
  try {
    const { private: isPrivate = true } = req.body || {};
    const result = await backup.createRemote({ private: isPrivate });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/backup/retry-push
router.post('/backup/retry-push', rateLimit('write'), async (req, res) => {
  try {
    const result = await backup.retryPush();
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/backup/logs
router.get('/backup/logs', rateLimit('read'), (req, res) => {
  try {
    const lines = Math.min(parseInt(req.query.lines, 10) || 200, 1000);
    res.json(backup.tailLog(lines));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
