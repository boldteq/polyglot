'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');
const { validateName, validateProjectId } = require('../lib/validators');
const { atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');
const { listMdFiles, walkFiles } = require('../lib/discovery');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');

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

// GET /api/unified/commands — global + every discovered project's commands.
// Global commands from `~/.claude/commands/*.md` used to be silently missing
// from this endpoint, so AllCommands showed 0 globals even with dozens on disk.
router.get('/unified/commands', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const results = [];

  const globalDir = path.join(HOME, '.claude', 'commands');
  for (const cmd of listMdFiles(globalDir)) {
    results.push({ ...cmd, scope: 'global', projectId: null, projectName: 'Global' });
  }

  for (const project of projects) {
    const cmds = listMdFiles(path.join(project.path, '.claude', 'commands'));
    for (const cmd of cmds) {
      results.push({ ...cmd, scope: 'project', projectId: project.id, projectName: project.name });
    }
  }

  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(results);
});

// ── /api/library — every on-disk command + skill the user has ─────────────────
//
// Aggregates global commands (~/.claude/commands), project commands (per
// discovered .claude/commands), plugin commands + skills (marketplaces + cache),
// and any real global skills (~/.claude/skills/**/SKILL.md). Frontmatter is
// parsed with gray-matter; caveman-style .toml commands get a 10-line parser.
// Full scan cached 60s in-process; ?fresh=1 bypasses.

const _libraryCache = { at: 0, payload: null };
const LIBRARY_TTL_MS = 60 * 1000;

// Minimal TOML key=value parser — enough for Claude command .toml files, which
// only carry top-level `description` + `prompt` string keys. Not a full TOML
// implementation on purpose.
function parseSimpleToml(src) {
  const out = {};
  const re = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|"""([\s\S]*?)""")/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    out[key] = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  return out;
}

// Take the first non-empty, non-heading line as a description when no
// frontmatter description is present. Matches how Claude Code itself surfaces
// slash-command descriptions in the palette.
function firstMeaningfulLine(body) {
  if (!body) return '';
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('---')) continue;
    return line.slice(0, 240);
  }
  return '';
}

// Read + parse one item. Returns null if the file can't be read.
function parseItem(filePath, { kind, scope, scopeLabel, plugin, pluginDisplay, pluginVersion }) {
  const raw = readFileSafe(filePath);
  if (raw === null || raw === undefined) return null;
  let stats;
  try { stats = fs.statSync(filePath); } catch { return null; }
  const format = filePath.endsWith('.toml') ? 'toml' : 'md';
  let description = '';
  let fm = {};
  let body = raw;
  if (format === 'toml') {
    const parsed = parseSimpleToml(raw);
    description = (parsed.description || '').trim();
    body = parsed.prompt || '';
    fm = parsed;
  } else {
    try {
      const parsed = matter(raw);
      fm = parsed.data || {};
      body = parsed.content || raw;
      description = (fm.description || '').toString().trim();
    } catch {
      body = raw;
    }
    if (!description) description = firstMeaningfulLine(body);
  }
  const base = path.basename(filePath).replace(/\.(md|toml)$/, '');
  // SKILL.md files live in a folder that names the skill; use the folder name.
  const name = base === 'SKILL' ? path.basename(path.dirname(filePath)) : base;
  const prefix = name.includes('-') ? name.split('-')[0] : name;
  return {
    id: `${scope}:${plugin ? plugin + ':' : ''}${name}`,
    name,
    kind,
    scope,
    scopeLabel,
    plugin: plugin || null,
    pluginDisplay: pluginDisplay || plugin || null,
    pluginVersion: pluginVersion || null,
    description,
    path: filePath,
    format,
    updatedAt: stats.mtime.getTime(),
    prefix,
    // Keep the raw body for the detail drawer — capped for payload sanity.
    body: body.length > 32000 ? body.slice(0, 32000) + '\n\n[…truncated…]' : body,
  };
}

// Load installed_plugins.json once per mtime. Maps installPath → { id, version }.
const _pluginRegistry = { mtime: 0, byPath: new Map() };
function loadPluginRegistry() {
  const file = path.join(PLUGINS_DIR, 'installed_plugins.json');
  let stat;
  try { stat = fs.statSync(file); } catch { return _pluginRegistry.byPath; }
  if (stat.mtimeMs === _pluginRegistry.mtime) return _pluginRegistry.byPath;
  _pluginRegistry.mtime = stat.mtimeMs;
  _pluginRegistry.byPath = new Map();
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
    // Shape observed: { "pluginId@marketplace": { version, installPath, ... }, ... }
    for (const [key, info] of Object.entries(json || {})) {
      if (!info || typeof info !== 'object') continue;
      const installPath = info.installPath;
      if (!installPath) continue;
      _pluginRegistry.byPath.set(installPath, {
        id: key,
        version: info.version || null,
      });
    }
  } catch { /* malformed — leave empty */ }
  return _pluginRegistry.byPath;
}

// Given an absolute file path inside a plugin, resolve which plugin it belongs
// to. Returns { id, displayName, version }. `id` is a unique key for dedupe;
// `displayName` is the short human name for pill/dropdown UI.
function resolvePluginFor(filePath, registry) {
  let dir = path.dirname(filePath);
  const root = PLUGINS_DIR;
  while (dir.startsWith(root) && dir !== root) {
    if (registry.has(dir)) {
      const hit = registry.get(dir);
      const shortName = hit.id.split('@')[0];
      return { id: hit.id, displayName: shortName, version: hit.version };
    }
    dir = path.dirname(dir);
  }
  // Registry miss — best-effort id from path segments. `.claude/plugins/{...}`.
  const rel = path.relative(PLUGINS_DIR, filePath);
  const parts = rel.split(path.sep);

  if (parts[0] === 'marketplaces' && parts[1]) {
    const marketplace = parts[1];
    // Two folder shapes: `plugins/<plugin>/...` and `external_plugins/<plugin>/...`
    if ((parts[2] === 'plugins' || parts[2] === 'external_plugins') && parts[3]) {
      return {
        id: `${parts[3]}@${marketplace}`,
        displayName: parts[3],
        version: null,
      };
    }
    // Marketplace with skills/commands at its own root (e.g. upstash/skills/…).
    return { id: marketplace, displayName: marketplace, version: null };
  }
  if (parts[0] === 'cache' && parts[1]) {
    // Anonymous git-cache staging dirs (temp_git_<ts>_<rand>) shadow real
    // plugin installs. Skip caller-side (isTempCachePath), but if we got
    // here, at least give a friendly label.
    if (/^temp_git_/.test(parts[1])) {
      return { id: `cache:${parts[1]}`, displayName: 'Local cache', version: null };
    }
    return { id: parts[1], displayName: parts[1], version: null };
  }
  return { id: 'unknown-plugin', displayName: 'Unknown', version: null };
}

// Transient git-cache staging dirs under .claude/plugins/cache/temp_git_*
// duplicate content that's already surfaced via the real install path. Skip
// them so the library doesn't double-count.
function isTempCachePath(filePath) {
  return filePath.includes(`${path.sep}cache${path.sep}temp_git_`);
}

function scanLibrary() {
  const items = [];
  const seen = new Set();
  const push = (it) => {
    if (!it) return;
    if (seen.has(it.id)) return;
    seen.add(it.id);
    items.push(it);
  };

  // 1) Global commands — ~/.claude/commands/*.md (skip nested/plugin subdirs).
  const globalCmdDir = path.join(CLAUDE_DIR, 'commands');
  if (fs.existsSync(globalCmdDir)) {
    for (const entry of fs.readdirSync(globalCmdDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(md|toml)$/.test(entry.name)) continue;
      push(parseItem(path.join(globalCmdDir, entry.name), {
        kind: 'command', scope: 'global', scopeLabel: 'Global',
        plugin: null, pluginDisplay: null, pluginVersion: null,
      }));
    }
  }

  // 2) Project commands — every discovered project's .claude/commands.
  try {
    const config = loadConfig();
    const projects = discoverProjects(config.projectDirs || []);
    for (const project of projects) {
      const dir = path.join(project.path, '.claude', 'commands');
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!/\.(md|toml)$/.test(entry.name)) continue;
        push(parseItem(path.join(dir, entry.name), {
          kind: 'command', scope: 'project', scopeLabel: project.name,
          plugin: null, pluginDisplay: null, pluginVersion: null,
        }));
      }
    }
  } catch { /* project discovery may fail — non-fatal */ }

  // 3+4+5) Plugin commands & skills + global skills.
  const registry = loadPluginRegistry();

  // Plugin commands live under any `/commands/` segment inside PLUGINS_DIR.
  // Skip transient git-cache staging dirs that shadow real installs.
  const pluginCmdFiles = walkFiles(
    PLUGINS_DIR,
    (name, full) => /\.(md|toml)$/.test(name)
      && full.includes(`${path.sep}commands${path.sep}`)
      && !isTempCachePath(full),
    14
  );
  for (const fp of pluginCmdFiles) {
    const info = resolvePluginFor(fp, registry);
    push(parseItem(fp, {
      kind: 'command',
      scope: 'plugin',
      scopeLabel: info.displayName,
      plugin: info.id,
      pluginDisplay: info.displayName,
      pluginVersion: info.version,
    }));
  }

  // Plugin skills — SKILL.md whose parent's parent segment is `skills/`.
  const pluginSkillFiles = walkFiles(
    PLUGINS_DIR,
    (name, full) => name === 'SKILL.md'
      && full.includes(`${path.sep}skills${path.sep}`)
      && !isTempCachePath(full),
    14
  );
  for (const fp of pluginSkillFiles) {
    const info = resolvePluginFor(fp, registry);
    push(parseItem(fp, {
      kind: 'skill',
      scope: 'plugin',
      scopeLabel: info.displayName,
      plugin: info.id,
      pluginDisplay: info.displayName,
      pluginVersion: info.version,
    }));
  }

  // Global skills — ~/.claude/skills/**/SKILL.md (rare today; symlinks + forward-compat).
  const globalSkillsDir = path.join(CLAUDE_DIR, 'skills');
  if (fs.existsSync(globalSkillsDir)) {
    const files = walkFiles(globalSkillsDir, (name) => name === 'SKILL.md', 6);
    for (const fp of files) {
      push(parseItem(fp, {
        kind: 'skill', scope: 'global', scopeLabel: 'Global',
        plugin: null, pluginDisplay: null, pluginVersion: null,
      }));
    }
  }

  items.sort((a, b) => b.updatedAt - a.updatedAt);

  const counts = { total: items.length, command: 0, skill: 0, global: 0, project: 0, plugin: 0 };
  for (const it of items) {
    counts[it.kind]++;
    counts[it.scope]++;
  }

  return {
    items,
    meta: {
      count: items.length,
      scannedAt: Date.now(),
      counts,
    },
  };
}

// GET /api/library
router.get('/library', (req, res) => {
  const fresh = req.query.fresh === '1';
  const now = Date.now();
  if (!fresh && _libraryCache.payload && (now - _libraryCache.at) < LIBRARY_TTL_MS) {
    return res.json({ ..._libraryCache.payload, meta: { ..._libraryCache.payload.meta, cached: true } });
  }
  try {
    const payload = scanLibrary();
    _libraryCache.at = now;
    _libraryCache.payload = payload;
    res.json(payload);
  } catch (err) {
    console.error('[library] scan failed:', err.message);
    res.status(500).json({ error: err.message || 'library scan failed' });
  }
});

module.exports = router;
