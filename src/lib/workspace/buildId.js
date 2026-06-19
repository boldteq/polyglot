'use strict';

// Stable UI/route identity for a build dir. buildId = sha1(dir) — used ONLY in
// URLs and as a frontend key. It is NEVER a database key (plan §C7): always
// resolve buildId → dir → project before touching SQLite.

const crypto = require('crypto');
const path = require('path');

const dirById = new Map(); // buildId → absolute dir, populated as builds are discovered

function buildIdFor(dir) {
  const abs = path.resolve(dir);
  const id = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12);
  dirById.set(id, abs);
  return id;
}

function dirFor(buildId) {
  return dirById.get(buildId) || null;
}

// Register a batch (called after discovery) so dirFor() resolves even on a cold
// request that didn't itself run discovery first.
function registerDirs(dirs) {
  for (const d of dirs) buildIdFor(d);
}

module.exports = { buildIdFor, dirFor, registerDirs };
