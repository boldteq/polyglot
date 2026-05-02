'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig, saveConfig } = require('../lib/config');
const { atomicWriteJson, atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

// GET /api/config
router.get('/config', (req, res) => {
  const config = loadConfig();
  res.json({
    claudeDir: CLAUDE_DIR,
    claudeDirExists: fs.existsSync(CLAUDE_DIR),
    home: HOME,
    ...config,
  });
});

// POST /api/config/project-dirs
router.post('/config/project-dirs', rateLimit('write'), (req, res) => {
  const { dirs } = req.body;
  if (!Array.isArray(dirs)) return res.status(400).json({ error: 'dirs must be an array' });
  const config = loadConfig();
  config.projectDirs = dirs;
  saveConfig(config);
  res.json({ ok: true });
});

// GET /api/global/claude-md
router.get('/global/claude-md', (req, res) => {
  const content = readFileSafe(path.join(CLAUDE_DIR, 'CLAUDE.md'));
  res.json({ content: content || '', exists: content !== null });
});

// PUT /api/global/claude-md
router.put('/global/claude-md', rateLimit('write'), (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  ensureDir(CLAUDE_DIR);
  atomicWriteText(path.join(CLAUDE_DIR, 'CLAUDE.md'), req.body.content);
  res.json({ ok: true });
});

// GET /api/global/settings
router.get('/global/settings', (req, res) => {
  const content = readFileSafe(path.join(CLAUDE_DIR, 'settings.json'));
  try {
    res.json(content ? JSON.parse(content) : {});
  } catch {
    res.json({});
  }
});

// PUT /api/global/settings
router.put('/global/settings', rateLimit('write'), (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings must be an object' });
  }
  try {
    atomicWriteJson(path.join(CLAUDE_DIR, 'settings.json'), settings);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
