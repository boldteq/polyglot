'use strict';

const db = require('../db');

function loadConfig() {
  const raw = db.loadConfig();
  if (!raw || typeof raw !== 'object') return { projectDirs: [] };
  if (!Array.isArray(raw.projectDirs)) raw.projectDirs = [];
  raw.projectDirs = raw.projectDirs.filter(d => typeof d === 'string');
  return raw;
}

function saveConfig(config) { db.saveConfig(config); }

module.exports = { loadConfig, saveConfig };
