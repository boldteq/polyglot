'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateName, validateProjectId } = require('../lib/validators');
const { atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');
const { listMdFiles } = require('../lib/discovery');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');

const router = Router();

const HOME = os.homedir();

// GET /api/projects/:id/commands
router.get('/projects/:id/commands', validateProjectId, (req, res) => {
  res.json(listMdFiles(path.join(req.projectPath, '.claude', 'commands')));
});

// GET /api/projects/:id/commands/:name
router.get('/projects/:id/commands/:name', validateProjectId, validateName, (req, res) => {
  const filePath = path.join(req.projectPath, '.claude', 'commands', req.params.name + '.md');
  const content = readFileSafe(filePath);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  let updatedAt = new Date().toISOString();
  try { updatedAt = fs.statSync(filePath).mtime.toISOString(); } catch {}
  res.json({ name: req.params.name, content, path: filePath, updatedAt });
});

// PUT /api/projects/:id/commands/:name
router.put('/projects/:id/commands/:name', validateProjectId, validateName, (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const dir = path.join(req.projectPath, '.claude', 'commands');
  ensureDir(dir);
  const filePath = path.join(dir, req.params.name + '.md');
  atomicWriteText(filePath, req.body.content);
  const stats = fs.statSync(filePath);
  res.json({ ok: true, command: { name: req.params.name, content: req.body.content, path: filePath, updatedAt: stats.mtime.toISOString() } });
});

// DELETE /api/projects/:id/commands/:name
router.delete('/projects/:id/commands/:name', validateProjectId, validateName, (req, res) => {
  const filePath = path.join(req.projectPath, '.claude', 'commands', req.params.name + '.md');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// GET /api/unified/commands
router.get('/unified/commands', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const results = [];

  for (const project of projects) {
    const cmds = listMdFiles(path.join(project.path, '.claude', 'commands'));
    for (const cmd of cmds) {
      results.push({ ...cmd, projectId: project.id, projectName: project.name });
    }
  }

  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(results);
});

module.exports = router;
