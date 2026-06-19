'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const backup = require('./backup');
const db = require('./db');
const agentSync = require('./lib/agentSync');
const log = require('./lib/logger');
const { loadConfig, saveConfig } = require('./lib/config');

// Capture every stray console.error / console.warn into error_log too.
// Recursion-safe — logger.emitStdout uses originals.
log.captureConsole();

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
const morgan = require('morgan');
const corsMiddleware = require('./middleware/cors');
const localOnly = require('./middleware/localOnly');
const securityHeaders = require('./middleware/security');

app.use(corsMiddleware);
app.use(localOnly);
app.use(securityHeaders);
// Inject x-request-id per request for log tracing
app.use((req, _res, next) => { req.id = randomUUID(); next(); });
// Response-timing + status-aware error log emitter. Logs every non-2xx as
// warn (4xx) or error (5xx) into error_log so the Logs page sees every
// failed request. 2xx routes still flow through Morgan stdout.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health' || req.path === '/api/logs/stream' || req.path === '/api/logs/count') return;
    const duration = Date.now() - start;
    const status = res.statusCode;
    if (status >= 500) {
      log.error(`${req.method} ${req.url} → ${status}`, {
        category: 'http', route: req.route?.path || req.url, method: req.method,
        status, durationMs: duration, requestId: req.id,
      });
    } else if (status >= 400) {
      log.warn(`${req.method} ${req.url} → ${status}`, {
        category: 'http', route: req.route?.path || req.url, method: req.method,
        status, durationMs: duration, requestId: req.id,
      });
    } else if (duration > (parseInt(process.env.SLOW_REQ_MS, 10) || 2000)) {
      log.warn(`slow request ${req.method} ${req.url} ${duration}ms`, {
        category: 'http', route: req.route?.path || req.url, method: req.method,
        status, durationMs: duration, requestId: req.id,
      });
    }
  });
  next();
});
// Q24: Structured JSON request logging (skip /api/health to keep logs clean)
app.use(morgan('combined', {
  skip: (req) => req.path === '/api/health' || req.path === '/api/logs/stream',
  stream: { write: (msg) => console.log(JSON.stringify({ type: 'http', msg: msg.trim() })) },
}));
app.use(express.json({ limit: '5mb' })); // Q4/Q50: bumped from 2mb to 5mb

// Serve built React frontend, fallback to legacy public/
const distPath = path.join(__dirname, '..', 'public-dist');
const legacyPath = path.join(__dirname, '..', 'public');
const staticPath = fs.existsSync(distPath) ? distPath : legacyPath;

// Cache policy:
//  - index.html → no-cache: must revalidate so a new deploy is picked up instantly.
//  - Vite content-hashed assets under /assets/ → immutable, 1yr: filename changes
//    on every build so the body can never go stale.
//  - other top-level unhashed files (favicon.svg, icons.svg) → 1h short cache.
const HASHED_ASSET_RE = /[-.][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|eot|png|jpe?g|svg|gif|webp|avif|map)$/;
app.use(express.static(staticPath, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (HASHED_ASSET_RE.test(filePath) && filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

// ── Routes ────────────────────────────────────────────────────────────────────
const configRouter = require('./routes/config');
const agentsRouter = require('./routes/agents');
const rulesRouter = require('./routes/rules');
const commandsRouter = require('./routes/commands');
const projectsRouter = require('./routes/projects');
const categoriesRouter = require('./routes/categories');
const aiRouter = require('./routes/ai');
const { router: orchestrationsRouter } = require('./routes/orchestrations');
const playgroundRouter = require('./routes/playground');
const memoryRouter = require('./routes/memory');
const backupRouter = require('./routes/backup');
const templatesRouter = require('./routes/templates');
const trainingRouter = require('./routes/training');
const analyticsRouter = require('./routes/analytics');
const goalsRouter = require('./routes/goals');
const { router: schedulesRouter, bootSchedules, stopAllSchedules } = require('./routes/schedules');
const systemSchedules = require('./lib/systemSchedules');
const webhooksRouter = require('./routes/webhooks');
const { router: learningRouter } = require('./routes/learning');
const { router: brainRouter } = require('./routes/brain');
const { router: lensRouter } = require('./routes/lens');
 const { router: shopifyRouter } = require('./routes/shopify');
const { router: workspaceRouter, startWatcher: startWorkspaceWatcher } = require('./routes/workspace');
const { router: orgHrRouter, org, experience, hr, loadRecentAgentRuns } = require('./routes/orgHr');
const dbExplorerRouter = require('./routes/dbExplorer');
const healthRouter = require('./routes/health');
const dispatchRouter = require('./routes/dispatch');
const logsRouter = require('./routes/logs');
const observabilityRouter = require('./routes/observability');
const intelligenceRouter = require('./routes/intelligence');
const ingestRouter = require('./routes/ingest');
const systemRouter = require('./routes/system');

app.use('/api', configRouter);
app.use('/api', agentsRouter);
app.use('/api', rulesRouter);
app.use('/api', commandsRouter);
app.use('/api', projectsRouter);
app.use('/api', categoriesRouter);
app.use('/api', aiRouter);
app.use('/api', orchestrationsRouter);
app.use('/api', playgroundRouter);
app.use('/api', memoryRouter);
app.use('/api', backupRouter);
app.use('/api', templatesRouter);
app.use('/api', trainingRouter);
app.use('/api', analyticsRouter);
app.use('/api', goalsRouter);
app.use('/api', schedulesRouter);
app.use('/api', webhooksRouter);
app.use('/api', learningRouter);
app.use('/api', brainRouter);
app.use('/api', lensRouter);
 app.use('/api', shopifyRouter);
app.use('/api', workspaceRouter);
app.use('/api', orgHrRouter);
app.use('/api', dbExplorerRouter);
app.use('/api', healthRouter);
app.use('/api', dispatchRouter);
app.use('/api', logsRouter);
app.use('/api', observabilityRouter);
app.use('/api', intelligenceRouter);
app.use('/api', ingestRouter);
app.use('/api', systemRouter);

// JSON 404 guard for unmatched API paths — prevents the SPA fallback below
// from returning index.html (HTML) on a missing /api route. Without this,
// `request<T>()` in the client tries to `res.json()` an HTML body and throws
// "Unexpected token '<', '<!doctype'..." which masks the real 404.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// SPA fallback — serve index.html for all non-API routes.
// setHeaders above does NOT run for res.sendFile, so set no-cache explicitly:
// the fallback HTML must always revalidate (same reason as the static index.html).
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  log.error(err, {
    category: err._category || 'http',
    route: err._route || req.route?.path || req.url,
    method: req.method,
    status: err.status || 500,
    requestId: req.id,
  });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Uncaught error safety net ─────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  // Give friendly messages for known error codes
  let message = err.message;
  let level = 'error';
  if (err.code === 'EADDRINUSE') {
    message = `Port ${PORT} already in use — another Polyglot instance is running. Kill it with: lsof -ti :${PORT} | xargs kill -9`;
    level = 'warn';
  } else if (err.code === 'ENOENT') {
    message = `File not found: ${err.message}`;
  }
  log[level](message, { category: 'startup', meta: { type: 'uncaughtException', code: err.code }, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  log.error(msg, { category: 'startup', meta: { type: 'unhandledRejection' }, stack });
  process.exit(1);
});

// ── Graceful shutdown (SIGTERM from Railway/Docker/PM2) ───────────────────────
let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[server] ${signal} received — shutting down gracefully`);
  // Give in-flight SSE streams 5s to finish, then force-quit
  const timeout = setTimeout(() => {
    console.log('[server] Graceful shutdown timeout — forcing exit');
    process.exit(0);
  }, 5000);
  if (timeout.unref) timeout.unref();
  // Stop cron schedulers FIRST so no new ticks fire mid-shutdown.
  try { if (typeof stopAllSchedules === 'function') stopAllSchedules(); } catch {}
  try { systemSchedules.stopAll(); } catch {}
  try {
    const db = require('./db');
    if (typeof db.close === 'function') db.close();
  } catch { /* db may not be init'd */ }
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3847;
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// Bind loopback only — nothing LAN-reachable by default. Set HOST=0.0.0.0 to
// opt into LAN exposure (C6 audit). localOnly still gates non-webhook routes.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║          Polyglot is running          ║');
  console.log(`  ║     http://localhost:${PORT}            ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  Claude dir: ${CLAUDE_DIR}`);
  console.log(`  Config: ${CONFIG_PATH}`);

  // Resolve claude CLI binary at boot + log result. Surfaces missing-binary
  // problems before the first /playground/run instead of hiding them in a
  // generic spawn ENOENT.
  try {
    const claudeBinary = require('./lib/claudeBinary');
    claudeBinary.logBootStatus();
  } catch (err) {
    console.warn('[boot] claudeBinary preflight failed:', err.message);
  }

  // Reconcile any 'running' agent_runs rows left over from a crashed prior
  // process — mark them 'crashed' so the UI doesn't show them as still in
  // progress forever. Idempotent; runs every boot.
  try {
    const r = db.reconcileOrphanRuns();
    if (r.reconciled > 0) {
      console.log(`  Crash recovery: marked ${r.reconciled} orphan 'running' run(s) as 'crashed'`);
    }
  } catch (err) {
    console.warn(`  Crash recovery failed: ${err.message}`);
  }

  // Restore scheduled cron jobs
  try {
    bootSchedules();
  } catch (err) {
    console.error(`  [schedules] bootSchedules failed — cron jobs not running: ${err.message}`);
  }

  // Start backup service (watcher + safety net) if configured
  try {
    backup.startBackupService();
  } catch (err) {
    console.log(`  Backup: failed to start — ${err.message}`);
  }

  // Agent sync: reconcile disk ↔ SQLite registry, then watch for live changes.
  try {
    const summary = agentSync.reseedFromDisk();
    console.log(`  AgentSync: reseeded ${summary.upserted}/${summary.scanned} (${summary.removed} retired, ${summary.errors.length} errors)`);
    agentSync.startWatcher();
  } catch (err) {
    console.log(`  AgentSync: failed to start — ${err.message}`);
  }

  // Workspace dashboard: watch build artifacts (gate-reports/*.json, CHANGES.md)
  // for live SSE updates on /api/workspace/stream.
  try { startWorkspaceWatcher(); } catch (err) { console.log(`  Workspace watcher: failed — ${err.message}`); }

  // Org JSON file-watcher: re-seed registry + departments into SQLite when the
  // source-of-truth files at ~/.claude/org/ change on disk. Lets users edit
  // registry.json or departments.json directly and see the org chart update
  // within a few seconds — no server restart required.
  try {
    const chokidar = require('chokidar');
    const orgLib = require('./org');
    const ORG_DIR = path.dirname(orgLib.REGISTRY_PATH);
    const DEPTS_PATH = path.join(ORG_DIR, 'departments.json');

    // Boot-time load: ensure SQLite departments + agent fields reflect
    // whatever's currently on disk. Without this, edits made while the
    // server was stopped won't propagate (the migration v4/v5 importers
    // only run on schema bumps, not regular startups).
    try {
      if (fs.existsSync(DEPTS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(DEPTS_PATH, 'utf-8'));
        db.saveDepartments(parsed);
        console.log(`  OrgWatch: bootstrapped departments.json into SQLite (version ${parsed.version || '?'})`);
      }
      if (fs.existsSync(orgLib.REGISTRY_PATH)) {
        const reg = JSON.parse(fs.readFileSync(orgLib.REGISTRY_PATH, 'utf-8'));
        if (reg.agents) {
          // Patch agent dept/subDept/pod/secondaryReportsTo + tags/squad
          // for every agent already known to SQLite. This mirrors the v4/v5
          // migration logic but runs every boot for resilience.
          const sqlitedb = db.getDb();
          const updateStmt = sqlitedb.prepare(
            'UPDATE agents SET department=?, subDepartment=?, pod=?, secondaryReportsTo=? WHERE id=?'
          );
          let touched = 0;
          for (const [id, a] of Object.entries(reg.agents)) {
            try {
              updateStmt.run(
                a.department || null,
                a.subDepartment || null,
                a.pod || null,
                a.secondaryReportsTo || null,
                id,
              );
              touched += 1;
            } catch { /* row may not exist yet — agentSync.reseedFromDisk will INSERT */ }
          }
          console.log(`  OrgWatch: bootstrapped registry.json fields into SQLite (${touched} agents touched, version ${reg.version || '?'})`);
        }
      }
    } catch (err) {
      console.warn(`  OrgWatch: bootstrap load failed: ${err.message}`);
    }

    const orgWatcher = chokidar.watch([
      orgLib.REGISTRY_PATH,
      DEPTS_PATH,
    ], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 } });
    let reseedTimer = null;
    const queueReseed = (filePath) => {
      // Debounce — multiple writes in the same atomic-rename burst trigger
      // a single reseed.
      if (reseedTimer) clearTimeout(reseedTimer);
      reseedTimer = setTimeout(() => {
        const baseName = path.basename(filePath);
        try {
          // Bug 9 fix: when departments.json changes, push the new content
          // into SQLite (db.loadDepartments reads from SQLite, not the JSON
          // file). Without this, edits to ~/.claude/org/departments.json are
          // silently ignored by the running server.
          if (baseName === 'departments.json') {
            const fileContent = fs.readFileSync(DEPTS_PATH, 'utf-8');
            const parsed = JSON.parse(fileContent);
            db.saveDepartments(parsed);
            console.log(`[org-watch] departments.json reloaded into SQLite (${Object.keys(parsed.departments || {}).length} depts, version ${parsed.version})`);
          }
          // Reseed agent .md files into SQLite (registry.json edits propagate
          // through this path too, since the registry is rebuilt from .md
          // frontmatter on every reseed).
          const sum = agentSync.reseedFromDisk();
          console.log(`[org-watch] ${baseName} changed → reseeded ${sum.upserted}/${sum.scanned}`);
          agentSync.events.emit('taxonomy:update', { ts: Date.now(), reason: 'org-files-changed', file: baseName });
        } catch (err) {
          console.warn(`[org-watch] reseed failed: ${err.message}`);
        }
      }, 500);
    };
    orgWatcher.on('change', queueReseed);
    orgWatcher.on('add', queueReseed);
    console.log('  OrgWatch: chokidar watching registry.json + departments.json');
  } catch (err) {
    console.log(`  OrgWatch: failed to start — ${err.message}`);
  }

  // Auto-backup SQLite data on startup + every 6 hours (async online backup —
  // non-blocking; handle the promise so a rejection can't become an unhandled rejection).
  db.autoBackupToFile().catch((err) => console.error('[backup] initial backup failed:', err.message));
  setInterval(() => {
    db.autoBackupToFile().catch((err) => console.error('[backup] scheduled backup failed:', err.message));
  }, 6 * 60 * 60 * 1000);

  // ── System schedules ─────────────────────────────────────────────────────
  // All built-in automation (Roster nightly, Witness daily, Cadence weekly,
  // Tutor weekly, Forge monthly, Mira event-driven) lives in
  // src/lib/systemSchedules.js — single source of truth. Schedules page
  // surfaces these alongside user-created schedules.
  try {
    systemSchedules.bootAll({ org, experience, hr, loadRecentAgentRuns });
  } catch (err) {
    console.warn(`  System schedules: boot failed — ${err.message}`);
  }

  // Daily-brain catch-up: node-cron silently skips a scheduled run if the Mac was
  // asleep/off at that minute. On boot (after a settle delay) + hourly, run each
  // overdue daily brain job if its last SUCCESS is older than the catch-up window.
  // Without this, sys-brain-aggregate (Phase B signal producer) emits nothing until
  // the next 06:00 cron — cold-starting the entire Phase B→C learning loop for a day.
  // Each is guarded internally (disabled/inflight/fresh → no-op), so never double-runs.
  // Order matters: witness (classify + ingest evals) → brain-aggregate (cross-project
  // signals) so the aggregator sees the day's freshly-classified runs.
  const catchupHours = (() => { try { return require('./lib/configService').getConfig('learning.vscode.catchupHours') ?? 20; } catch { return 20; } })();
  const BOOT_CATCHUP = ['sys-learning-digest', 'sys-witness', 'sys-brain-aggregate'];
  const runCatchups = (phase) => {
    for (const id of BOOT_CATCHUP) {
      try { systemSchedules.runIfOverdue(id, catchupHours); }
      catch (err) { console.warn(`[catchup] ${phase} check failed for ${id}: ${err.message}`); }
    }
  };
  setTimeout(() => runCatchups('boot'), 30_000);
  setInterval(() => runCatchups('hourly'), 60 * 60 * 1000);

  console.log('');
});
