'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rateLimit } = require('../middleware/rateLimit');
const { atomicWriteText, ensureDir } = require('../lib/atomicIo');
const { computeLineDiff } = require('../lib/diff');
const db = require('../db');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const MEMORY_DIR = path.join(CLAUDE_DIR, 'memory');

function loadAuditLog() { return db.loadAuditLog(); }
function saveAuditLog(entries) { try { db.saveAuditLog(entries); } catch (err) { console.error('[saveAuditLog] DB write failed:', err.message); } }

function logMemoryAction(action, filePath, { before, after, fromPath, toPath } = {}) {
  const entries = loadAuditLog();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    action,
    path: filePath,
    linesAdded: 0,
    linesRemoved: 0,
  };
  if (action === 'update' && before !== undefined && after !== undefined) {
    const diff = computeLineDiff(before, after);
    entry.diff = diff;
    entry.linesAdded = diff.reduce((s, h) => s + h.added.length, 0);
    entry.linesRemoved = diff.reduce((s, h) => s + h.removed.length, 0);
    entry.sizeBefore = (before || '').length;
    entry.sizeAfter = (after || '').length;
  }
  if (action === 'create' && after !== undefined) {
    const lines = after.split('\n').length;
    entry.linesAdded = lines;
    entry.sizeAfter = after.length;
  }
  if (action === 'delete' && before !== undefined) {
    const lines = before.split('\n').length;
    entry.linesRemoved = lines;
    entry.sizeBefore = before.length;
    entry.contentSnapshot = before.length <= 50_000 ? before : before.slice(0, 50_000) + '\n\n[... truncated at 50KB ...]';
  }
  if (action === 'move') {
    entry.fromPath = fromPath;
    entry.toPath = toPath;
  }
  const content = after || before || '';
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fm = {};
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) fm[kv[1]] = kv[2].trim();
    }
    entry.frontmatter = fm;
  }
  entries.push(entry);
  saveAuditLog(entries);
}

function resolveMemoryPath(relPath) {
  if (!relPath || typeof relPath !== 'string') return null;
  const resolved = path.resolve(MEMORY_DIR, relPath);
  if (!resolved.startsWith(MEMORY_DIR + path.sep) && resolved !== MEMORY_DIR) return null;
  return resolved;
}

function buildMemoryTree(dir, base) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const dirs = [];
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '.DS_Store') continue;
    const entryPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      dirs.push({
        type: 'dir',
        name: entry.name,
        path: entryPath,
        children: buildMemoryTree(path.join(dir, entry.name), entryPath),
      });
    } else {
      const absPath = path.join(dir, entry.name);
      const stat = fs.statSync(absPath);
      const node = { type: 'file', name: entry.name, path: entryPath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
      if (entry.name.endsWith('.md')) {
        try {
          const raw = fs.readFileSync(absPath, 'utf-8');
          const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (fmMatch) {
            const fm = {};
            for (const line of fmMatch[1].split('\n')) {
              const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
              if (kv) fm[kv[1]] = kv[2].trim();
            }
            node.frontmatter = fm;
          }
        } catch {}
      }
      files.push(node);
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function flattenTree(nodes) {
  const result = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    if (node.type === 'dir' && node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

// GET /api/memory
router.get('/memory', (req, res) => {
  try {
    ensureDir(MEMORY_DIR);
    const tree = buildMemoryTree(MEMORY_DIR, '');
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read memory directory' });
  }
});

// GET /api/memory/file
router.get('/memory/file', (req, res) => {
  const relPath = req.query.path;
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found' });
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    res.json({ path: relPath, content });
  } catch {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// PUT /api/memory/file
router.put('/memory/file', rateLimit('write'), (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || typeof relPath !== 'string') return res.status(400).json({ error: 'Invalid path' });
  if (relPath.includes('\0')) return res.status(400).json({ error: 'Invalid path' });
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  if (content.length > 1_000_000) return res.status(400).json({ error: 'Content too large (max 1MB)' });
  try {
    const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : '';
    ensureDir(path.dirname(absPath));
    atomicWriteText(absPath, content);
    if (before !== content) {
      logMemoryAction('update', relPath, { before, after: content });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// POST /api/memory/file
router.post('/memory/file', rateLimit('write'), (req, res) => {
  const { path: relPath } = req.body;
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (fs.existsSync(absPath)) return res.status(409).json({ error: 'File already exists' });
  try {
    ensureDir(path.dirname(absPath));
    const isMd = absPath.endsWith('.md');
    const defaultContent = isMd
      ? `---\ntype: reference\n---\n\n# ${path.basename(absPath, '.md')}\n\n`
      : '';
    atomicWriteText(absPath, defaultContent);
    logMemoryAction('create', relPath, { after: defaultContent });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to create file' });
  }
});

// DELETE /api/memory/file
router.delete('/memory/file', rateLimit('write'), (req, res) => {
  const relPath = req.query.path;
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found' });
  try {
    const before = fs.readFileSync(absPath, 'utf-8');
    fs.unlinkSync(absPath);
    logMemoryAction('delete', relPath, { before });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /api/memory/search
router.get('/memory/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query) return res.json([]);
  try {
    ensureDir(MEMORY_DIR);
    const tree = buildMemoryTree(MEMORY_DIR, '');
    const allFiles = flattenTree(tree);
    const results = [];
    for (const file of allFiles) {
      const absPath = path.resolve(MEMORY_DIR, file.path);
      let content = '';
      try { content = fs.readFileSync(absPath, 'utf-8'); } catch { continue; }
      const nameMatch = file.name.toLowerCase().includes(query);
      const pathMatch = file.path.toLowerCase().includes(query);
      const fmName = file.frontmatter?.name?.toLowerCase() || '';
      const fmDesc = file.frontmatter?.description?.toLowerCase() || '';
      const fmType = file.frontmatter?.type?.toLowerCase() || '';
      const fmMatch = fmName.includes(query) || fmDesc.includes(query) || fmType.includes(query);
      const contentLower = content.toLowerCase();
      const contentMatch = contentLower.includes(query);
      if (nameMatch || pathMatch || fmMatch || contentMatch) {
        let snippet = '';
        if (contentMatch) {
          const idx = contentLower.indexOf(query);
          const start = Math.max(0, idx - 60);
          const end = Math.min(content.length, idx + query.length + 60);
          snippet = (start > 0 ? '...' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '...' : '');
        }
        results.push({
          path: file.path,
          name: file.name,
          frontmatter: file.frontmatter || {},
          snippet,
          matchType: nameMatch ? 'name' : fmMatch ? 'frontmatter' : pathMatch ? 'path' : 'content',
        });
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/memory/stats
router.get('/memory/stats', (req, res) => {
  try {
    ensureDir(MEMORY_DIR);
    const tree = buildMemoryTree(MEMORY_DIR, '');
    const allFiles = flattenTree(tree);
    const totalFiles = allFiles.length;
    let totalSize = 0;
    const typeCount = {};
    const folderCount = {};
    for (const file of allFiles) {
      totalSize += file.size || 0;
      const fmType = file.frontmatter?.type || 'unknown';
      typeCount[fmType] = (typeCount[fmType] || 0) + 1;
      const folder = file.path.includes('/') ? file.path.split('/')[0] : 'root';
      folderCount[folder] = (folderCount[folder] || 0) + 1;
    }
    function countDirs(nodes) {
      let count = 0;
      for (const n of nodes) {
        if (n.type === 'dir') { count++; if (n.children) count += countDirs(n.children); }
      }
      return count;
    }
    res.json({ totalFiles, totalSize, totalFolders: countDirs(tree), typeCount, folderCount });
  } catch {
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// POST /api/memory/folder
router.post('/memory/folder', rateLimit('write'), (req, res) => {
  const { path: relPath } = req.body;
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (fs.existsSync(absPath)) return res.status(409).json({ error: 'Folder already exists' });
  try {
    fs.mkdirSync(absPath, { recursive: true });
    logMemoryAction('create_folder', relPath);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// DELETE /api/memory/folder
router.delete('/memory/folder', rateLimit('write'), (req, res) => {
  const relPath = req.query.path;
  const absPath = resolveMemoryPath(relPath);
  if (!absPath) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Folder not found' });
  try {
    const entries = fs.readdirSync(absPath).filter(e => e !== '.DS_Store');
    if (entries.length > 0) return res.status(400).json({ error: 'Folder is not empty' });
    fs.rmSync(absPath, { recursive: true });
    logMemoryAction('delete_folder', relPath);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// POST /api/memory/move
router.post('/memory/move', rateLimit('write'), (req, res) => {
  const { from, to } = req.body;
  const absFrom = resolveMemoryPath(from);
  const absTo = resolveMemoryPath(to);
  if (!absFrom || !absTo) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(absFrom)) return res.status(404).json({ error: 'Source not found' });
  if (fs.existsSync(absTo)) return res.status(409).json({ error: 'Destination already exists' });
  try {
    ensureDir(path.dirname(absTo));
    fs.renameSync(absFrom, absTo);
    logMemoryAction('move', to, { fromPath: from, toPath: to });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// GET /api/memory/history
router.get('/memory/history', (req, res) => {
  try {
    const entries = loadAuditLog();
    const { action, path: filterPath, q, limit, offset, from, to } = req.query;
    let filtered = entries;
    if (action) filtered = filtered.filter(e => e.action === action);
    if (filterPath) filtered = filtered.filter(e => e.path && e.path.includes(filterPath));
    if (q) {
      const query = q.toLowerCase();
      filtered = filtered.filter(e =>
        (e.path && e.path.toLowerCase().includes(query)) ||
        (e.action && e.action.toLowerCase().includes(query)) ||
        (e.frontmatter?.name && e.frontmatter.name.toLowerCase().includes(query)) ||
        (e.fromPath && e.fromPath.toLowerCase().includes(query)) ||
        (e.toPath && e.toPath.toLowerCase().includes(query))
      );
    }
    if (from) filtered = filtered.filter(e => e.timestamp >= from);
    if (to) filtered = filtered.filter(e => e.timestamp <= to);
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const total = filtered.length;
    const off = parseInt(offset) || 0;
    const lim = parseInt(limit) || 50;
    const page = filtered.slice(off, off + lim);
    res.json({ total, offset: off, limit: lim, entries: page });
  } catch {
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// GET /api/memory/history/:id
router.get('/memory/history/:id', (req, res) => {
  try {
    const entries = loadAuditLog();
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to load entry' });
  }
});

// GET /api/memory/history/file/:filePath(*)
router.get('/memory/history/file/:filePath(*)', (req, res) => {
  try {
    const entries = loadAuditLog();
    const filePath = req.params.filePath;
    const fileEntries = entries
      .filter(e => e.path === filePath || e.fromPath === filePath || e.toPath === filePath)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    res.json(fileEntries);
  } catch {
    res.status(500).json({ error: 'Failed to load file history' });
  }
});

// GET /api/memory/history-stats
router.get('/memory/history-stats', (req, res) => {
  try {
    const entries = loadAuditLog();
    const actionCounts = {};
    const dailyCounts = {};
    const fileCounts = {};
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const e of entries) {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
      const day = e.timestamp.slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      if (e.path) fileCounts[e.path] = (fileCounts[e.path] || 0) + 1;
      totalAdded += e.linesAdded || 0;
      totalRemoved += e.linesRemoved || 0;
    }
    const hotFiles = Object.entries(fileCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([p, count]) => ({ path: p, changes: count }));
    res.json({
      totalEntries: entries.length,
      actionCounts,
      dailyCounts,
      hotFiles,
      totalAdded,
      totalRemoved,
      firstEntry: entries.length ? entries[0].timestamp : null,
      lastEntry: entries.length ? entries[entries.length - 1].timestamp : null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to compute history stats' });
  }
});

// DELETE /api/memory/history
router.delete('/memory/history', rateLimit('write'), (req, res) => {
  try {
    saveAuditLog([]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

module.exports = router;
