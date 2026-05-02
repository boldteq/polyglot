'use strict';

const fs = require('fs');

// Optional invalidation callback — set by cache.js to avoid circular imports.
let _cacheInvalidator = null;
function setCacheInvalidator(fn) { _cacheInvalidator = fn; }

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function atomicWriteText(filePath, text) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, text, 'utf-8');
  fs.renameSync(tmp, filePath);
  // Invalidate agent cache on any write whose path is inside an agents dir.
  // Cheap test — resolves the worst bug (stale cache after edit) for free.
  if (_cacheInvalidator && /\/agents\/[^/]+\.md$/.test(filePath)) {
    _cacheInvalidator(filePath);
  }
}

const MAX_READ_BYTES = 5 * 1024 * 1024 // 5 MB guard — prevents OOM on unexpectedly large files

function readFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_READ_BYTES) {
      console.error(`[readFileSafe] file too large (${stat.size} bytes), skipping: ${filePath}`);
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { atomicWriteJson, atomicWriteText, readFileSafe, ensureDir, setCacheInvalidator };
