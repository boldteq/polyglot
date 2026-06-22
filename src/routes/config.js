'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig, saveConfig } = require('../lib/config');
const { atomicWriteJson, atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');
const configService = require('../lib/configService');
const configSchemas = require('../lib/configSchemas');

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

// Documented Claude Code settings.json top-level keys. Writing the global
// settings.json is a privilege surface (hooks/permissions are harness-executed),
// so reject unknown top-level keys instead of accepting any object (C4 audit).
// hooks/permissions ARE allowed (legit) but no longer co-mingle with junk/injected keys.
const ALLOWED_SETTINGS_KEYS = new Set([
  '$schema', 'apiKeyHelper', 'cleanupPeriodDays', 'env', 'includeCoAuthoredBy',
  'permissions', 'hooks', 'model', 'statusLine', 'outputStyle', 'forceLoginMethod',
  'enableAllProjectMcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers',
  'mcpServers', 'awsAuthRefresh', 'awsCredentialExport', 'otelHeadersHelper',
  'autoUpdates', 'verbose', 'spinnerTipsEnabled', 'alwaysThinkingEnabled',
  'theme', 'sandbox', 'disableAllHooks', 'feedbackSurveyState',
]);

// PUT /api/global/settings
router.put('/global/settings', rateLimit('write'), (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'settings must be an object' });
  }
  const serialized = JSON.stringify(settings);
  if (serialized.length > 256 * 1024) {
    return res.status(400).json({ error: 'settings payload too large (>256KB)' });
  }
  // Merge — NOT replace. The settings.json is owned by the Claude Code CLI and
  // legitimately contains keys outside our whitelist (e.g. enabledPlugins,
  // extraKnownMarketplaces). A reject-unknown replace bricked every save once the
  // real file held any such key, because the UI round-trips the whole object.
  // So: preserve the existing file, apply ONLY whitelisted keys from the payload,
  // and ignore (never write) non-whitelisted NEW keys. This keeps the write path a
  // privilege boundary (C4 — the UI still can't inject arbitrary keys) without
  // corrupting a real config.
  let existing = {};
  try {
    const cur = readFileSafe(path.join(CLAUDE_DIR, 'settings.json'));
    if (cur) existing = JSON.parse(cur);
  } catch { existing = {}; }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) existing = {};

  const next = { ...existing };
  const ignored = [];
  for (const [k, v] of Object.entries(settings)) {
    if (ALLOWED_SETTINGS_KEYS.has(k)) next[k] = v;        // settable by the UI → apply
    else if (!(k in existing)) ignored.push(k);           // new + non-whitelisted → drop
    // non-whitelisted key already in the file → left untouched (preserved)
  }
  try {
    ensureDir(CLAUDE_DIR);
    atomicWriteJson(path.join(CLAUDE_DIR, 'settings.json'), next);
    res.json({ success: true, ignored });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// App Config — Phase 2 Static→Dynamic refactor
// ─────────────────────────────────────────────────────────────────────────

// GET /api/app-config — all keyed config grouped by category + dispatch policy + pods + models + model_policy
router.get('/app-config', (req, res) => {
  try {
    const rows = configService.getAll();
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.category]) grouped[r.category] = {};
      const leafKey = r.key.slice(r.category.length + 1); // strip "category." prefix
      grouped[r.category][leafKey] = r.value;
    }
    res.json({
      config: grouped,
      dispatchPolicy: configService.getDispatchPolicy(),
      pods: configService.listPods(),
      models: configService.listModels(),
      modelPolicy: configService.listModelPolicy(),
      fallbackActive: configService.isFallbackActive(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/app-config/:key — update a single keyed config (Zod-validated)
router.put('/app-config/:key', rateLimit('write'), (req, res) => {
  try {
    const { key } = req.params;
    const { value, category, description } = req.body || {};
    if (value === undefined) return res.status(400).json({ error: 'value is required' });
    const validation = configSchemas.validate(key, value);
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    const resolvedCategory = category || key.split('.')[0];
    configService.setConfig(key, validation.value, {
      category: resolvedCategory,
      description: description ?? null,
      source: req.body?.source || 'admin-ui',
    });
    res.json({ ok: true, key, value: validation.value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/app-config/schemas — schema metadata used by admin UI to render inputs
router.get('/app-config/schemas', (req, res) => {
  res.json({ keys: configSchemas.describe() });
});

// GET /api/app-config/audit?key=...&limit=50
router.get('/app-config/audit', (req, res) => {
  try {
    const key = req.query.key || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    res.json({ items: configService.getAudit({ key, limit }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/app-config/dispatch-policy — replace full dispatch policy
router.put('/app-config/dispatch-policy', rateLimit('write'), (req, res) => {
  try {
    const validation = configSchemas.validateDispatchPolicy(req.body || {});
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    configService.setDispatchPolicy(validation.value, { source: 'admin-ui' });
    res.json({ ok: true, policy: validation.value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pods CRUD
router.put('/app-config/pods/:id', rateLimit('write'), (req, res) => {
  try {
    const pod = { id: req.params.id, ...(req.body || {}) };
    if (!pod.prefix) return res.status(400).json({ error: 'prefix is required' });
    configService.upsertPod(pod, { source: 'admin-ui' });
    res.json({ ok: true, pod });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/app-config/pods/:id', rateLimit('write'), (req, res) => {
  try {
    configService.deletePod(req.params.id, { source: 'admin-ui' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Models CRUD
router.put('/app-config/models/:id', rateLimit('write'), (req, res) => {
  try {
    const { displayName, tier, costPenalty, enabled = 1 } = req.body || {};
    if (!displayName || !tier || typeof costPenalty !== 'number') {
      return res.status(400).json({ error: 'displayName, tier, costPenalty are required' });
    }
    const model = { id: req.params.id, displayName, tier, costPenalty, enabled: enabled ? 1 : 0 };
    configService.upsertModel(model, { source: 'admin-ui' });
    res.json({ ok: true, model });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Model policy — replace all rows (atomic)
router.put('/app-config/model-policy', rateLimit('write'), (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: 'rows array is required' });
    configService.replaceModelPolicy(rows, { source: 'admin-ui' });
    res.json({ ok: true, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE stream — pushes `config:update` events to subscribed clients.
router.get('/app-config/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const unsubscribe = configService.subscribe((event, payload) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client disconnected; ignore
    }
  });

  // Heartbeat every 25s so reverse proxies don't drop the connection
  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
