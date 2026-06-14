'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const atomicIo = require('./atomicIo');

// ── Agent cache ─────────────────────────────────────────────────────────────
// Disk reads are the largest per-request cost for agent endpoints. We keep two
// in-process maps keyed by absolute path, invalidated by mtime. The PUT handler
// clears the corresponding entry after an atomic write. This is a single-process
// cache — if the server goes multi-process in future, move to Redis or similar.
const _agentCacheFull = new Map();
const _agentCacheMeta = new Map();

// Directory-listing cache. The per-file caches above avoid re-parsing unchanged
// files, but listAgents() still did readdirSync + ~55 statSync on EVERY request.
// Keyed by absolute dir → { dirMtimeMs, names, full, meta }. Validated by ONE
// statSync on the dir (its mtime bumps when a file is added/removed/renamed, and
// atomic-rename writes of existing files touch the dir entry too). Defensively
// dropped on any agent write via _invalidateAgentCache.
const _dirCache = new Map();

function _invalidateAgentCache(filePath) {
  _agentCacheFull.delete(filePath);
  _agentCacheMeta.delete(filePath);
  // Force the assembled arrays for this file's dir to reassemble, and drop the
  // dir snapshot so readdir re-runs even on a same-second edit of an existing
  // file (where dir mtime may not have advanced).
  _dirCache.delete(path.dirname(filePath));
}

// One statSync on the dir replaces ~55 on files when nothing changed.
function _dirSnapshot(dir) {
  const stat = fs.statSync(dir); // throws if missing → caller's try/catch handles
  const hit = _dirCache.get(dir);
  if (hit && hit.dirMtimeMs === stat.mtimeMs) return hit;
  const names = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const snap = { dirMtimeMs: stat.mtimeMs, names, full: null, meta: null };
  _dirCache.set(dir, snap);
  return snap;
}

// Register with atomicIo so that atomicWriteText auto-invalidates on agent writes.
atomicIo.setCacheInvalidator(_invalidateAgentCache);

function parseAgent(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const hit = _agentCacheFull.get(filePath);
    if (hit && hit.mtimeMs === stats.mtimeMs) return hit.parsed;

    const content = fs.readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    const parsed = {
      filename: path.basename(filePath, '.md'),
      path: filePath,
      frontmatter: data,
      name: data.name || path.basename(filePath, '.md'),
      description: data.description || '',
      model: data.model || '',
      tools: data.tools || '',
      body: body.trim(),
      raw: content,
      updatedAt: stats.mtime.toISOString(),
    };
    _agentCacheFull.set(filePath, { mtimeMs: stats.mtimeMs, parsed });
    return parsed;
  } catch (e) {
    return null;
  }
}

// Meta-only parse: reads just enough to extract frontmatter + body line count.
// Used by list endpoints so we never ship full bodies for a 30-item list.
function parseAgentMeta(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const hit = _agentCacheMeta.get(filePath);
    if (hit && hit.mtimeMs === stats.mtimeMs) return hit.meta;

    // Read until we've consumed the second '---' line; cheaper than reading the
    // whole body only to throw it away. For files without frontmatter, fall
    // back to a full read via parseAgent (rare).
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    let collected = '';
    let bytesRead = 0;
    let pos = 0;
    let frontmatterEnd = -1;
    const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    try {
      while (frontmatterEnd < 0) {
        const n = fs.readSync(fd, buf, 0, buf.length, pos);
        if (n === 0) break;
        collected += buf.slice(0, n).toString('utf-8');
        bytesRead += n;
        pos += n;
        const m = collected.match(FM_RE);
        if (m) frontmatterEnd = m[0].length;
        if (bytesRead > 256 * 1024 && frontmatterEnd < 0) break; // safety cap
      }
    } finally {
      fs.closeSync(fd);
    }

    let data = {};
    if (frontmatterEnd > 0) {
      const parsed = matter(collected.slice(0, frontmatterEnd + 1024)); // buffer margin
      data = parsed.data || {};
    } else {
      // Fallback: full parse, rare case
      const full = parseAgent(filePath);
      if (!full) return null;
      return {
        filename: full.filename,
        path: full.path,
        frontmatter: full.frontmatter,
        name: full.name,
        description: full.description,
        model: full.model,
        tools: full.tools,
        bodyLines: full.body.split('\n').length,
        bodyChars: full.body.length,
        updatedAt: full.updatedAt,
      };
    }

    // Compute body size cheaply from disk via stat + frontmatter length
    const totalSize = stats.size;
    const bodyChars = Math.max(0, totalSize - frontmatterEnd);

    const meta = {
      filename: path.basename(filePath, '.md'),
      path: filePath,
      frontmatter: data,
      name: data.name || path.basename(filePath, '.md'),
      description: data.description || '',
      model: data.model || '',
      tools: data.tools || '',
      bodyLines: null, // deferred — callers that need line count use parseAgent
      bodyChars,
      updatedAt: stats.mtime.toISOString(),
    };
    _agentCacheMeta.set(filePath, { mtimeMs: stats.mtimeMs, meta });
    return meta;
  } catch (e) {
    return null;
  }
}

function listAgents(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    const snap = _dirSnapshot(dir);
    if (snap.full) return snap.full; // warm: zero per-file stat when dir unchanged
    snap.full = snap.names
      .map(f => parseAgent(path.join(dir, f))) // still mtime-checks per file internally
      .filter(Boolean);
    return snap.full;
  } catch {
    return [];
  }
}

// Meta-only variant — same ordering, same filter, just no body.
function listAgentsMeta(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    const snap = _dirSnapshot(dir);
    if (snap.meta) return snap.meta;
    snap.meta = snap.names
      .map(f => parseAgentMeta(path.join(dir, f)))
      .filter(Boolean);
    return snap.meta;
  } catch {
    return [];
  }
}

module.exports = {
  _agentCacheFull,
  _agentCacheMeta,
  _dirCache,
  _invalidateAgentCache,
  parseAgent,
  parseAgentMeta,
  listAgents,
  listAgentsMeta,
};
