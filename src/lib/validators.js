'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../db');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

function loadConfig() {
  const raw = db.loadConfig();
  if (!raw || typeof raw !== 'object') return { projectDirs: [] };
  if (!Array.isArray(raw.projectDirs)) raw.projectDirs = [];
  raw.projectDirs = raw.projectDirs.filter(d => typeof d === 'string');
  return raw;
}

function isValidName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name) && !name.includes('..');
}

function validateName(req, res, next) {
  if (!isValidName(req.params.name)) {
    return res.status(400).json({ error: 'Invalid name. Only letters, numbers, hyphens and underscores allowed.' });
  }
  next();
}

function resolveProjectPath(id) {
  try {
    const decoded = Buffer.from(id, 'base64url').toString();
    // Prevent path traversal: resolve and check for .. sequences
    const resolved = path.resolve(decoded);
    if (resolved.includes('..') || decoded.includes('\0')) return null;
    return resolved;
  } catch {
    return null;
  }
}

function validateProjectId(req, res, next) {
  const projectPath = resolveProjectPath(req.params.id);
  if (!projectPath) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }
  // Verify it's within allowed project directories
  const config = loadConfig();
  const allowedRoots = [
    CLAUDE_DIR,
    ...config.projectDirs.map(d => path.resolve(d.replace(/^~/, HOME))),
  ];
  const isAllowed = allowedRoots.some(root =>
    projectPath === root || projectPath.startsWith(root + path.sep)
  );
  if (!isAllowed) {
    return res.status(403).json({ error: 'Project outside allowed directories' });
  }
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    return res.status(404).json({ error: 'Project directory not found' });
  }
  req.projectPath = projectPath;
  next();
}

module.exports = { isValidName, validateName, resolveProjectPath, validateProjectId };
