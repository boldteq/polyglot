'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cron = require('node-cron');
const { randomUUID } = require('crypto');
const backup = require('./backup');
const db = require('./db');
const agentSync = require('./lib/agentSync');
const { loadConfig, saveConfig } = require('./lib/config');

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
// Q24: Structured JSON request logging (skip /api/health to keep logs clean)
app.use(morgan('combined', {
  skip: (req) => req.path === '/api/health',
  stream: { write: (msg) => console.log(JSON.stringify({ type: 'http', msg: msg.trim() })) },
}));
app.use(express.json({ limit: '5mb' })); // Q4/Q50: bumped from 2mb to 5mb

// Serve built React frontend, fallback to legacy public/
const distPath = path.join(__dirname, '..', 'public-dist');
const legacyPath = path.join(__dirname, '..', 'public');
const staticPath = fs.existsSync(distPath) ? distPath : legacyPath;
app.use(express.static(staticPath));

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
const { router: schedulesRouter, bootSchedules } = require('./routes/schedules');
const webhooksRouter = require('./routes/webhooks');
const { router: learningRouter } = require('./routes/learning');
const { router: orgHrRouter, org, experience, hr, loadRecentAgentRuns } = require('./routes/orgHr');
const dbExplorerRouter = require('./routes/dbExplorer');
const healthRouter = require('./routes/health');
const dispatchRouter = require('./routes/dispatch');
const logsRouter = require('./routes/logs');

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
app.use('/api', orgHrRouter);
app.use('/api', dbExplorerRouter);
app.use('/api', healthRouter);
app.use('/api', dispatchRouter);
app.use('/api', logsRouter);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  try { db.insertErrorLog({ source: 'server', message: err.message, stack: err.stack, context: { route: req.url, method: req.method, requestId: req.id } }); } catch {}
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
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
  try { db.insertErrorLog({ level, source: 'server', message, stack: err.stack, context: { type: 'uncaughtException', code: err.code } }); } catch {}
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  try { db.insertErrorLog({ source: 'server', message: msg, stack, context: { type: 'unhandledRejection' } }); } catch {}
  console.error('[UNHANDLED REJECTION]', reason);
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

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║          Polyglot is running          ║');
  console.log(`  ║     http://localhost:${PORT}            ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  Claude dir: ${CLAUDE_DIR}`);
  console.log(`  Config: ${CONFIG_PATH}`);

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

  // Auto-backup SQLite data on startup + every 6 hours
  try { db.autoBackupToFile(); } catch (err) { console.error('[backup] initial backup failed:', err.message); }
  setInterval(() => {
    try { db.autoBackupToFile(); } catch (err) { console.error('[backup] scheduled backup failed:', err.message); }
  }, 6 * 60 * 60 * 1000);

  // ── HR cron jobs ──────────────────────────────────────────────────────────
  // Roster nightly recompute (02:00 UTC) — refreshes experience profiles
  // Witness daily sweep (03:00 UTC) — classifies yesterday's runs
  // Cadence weekly review (Monday 09:00 UTC) — applies promotions + PIPs
  try {
    cron.schedule('0 2 * * *', () => {
      try {
        const summary = experience.recomputeAllExperience(org);
        console.log(`[HR] Roster nightly recompute: ${summary.updated}/${summary.total}`);
      } catch (err) {
        console.warn(`[HR] Roster recompute failed: ${err.message}`);
      }
    }, { timezone: 'Etc/UTC' });

    cron.schedule('0 3 * * *', () => {
      try {
        const recent = loadRecentAgentRuns(24);
        const result = hr.runWitnessSweep(org, experience, recent);
        console.log(`[HR] Witness sweep: ${result.runsClassified} runs, ${result.pipCandidates.length} PIP, ${result.promotionCandidates.length} promo`);
      } catch (err) {
        console.warn(`[HR] Witness sweep failed: ${err.message}`);
      }

      // Sprint 5 — auto-advance any open escalation past its tier SLA
      // (24h specialist → pod-lead → vp → yash). Runs alongside Witness so
      // SLA breaches surface in the same daily ops digest.
      try {
        const escalation = require('./lib/escalation');
        const advanced = escalation.autoAdvanceExpired();
        if (advanced.length > 0) {
          console.log(`[HR] Escalation SLA sweep: advanced ${advanced.length} stale escalation(s)`);
        }
      } catch (err) {
        console.warn(`[HR] Escalation SLA sweep failed: ${err.message}`);
      }

      // Phase B — reconcile per-agent active_task_count against the tasks
      // table in case any state got dropped (crashed mid-transaction etc.).
      // Cheap UPDATE — runs in a single statement.
      try {
        const tasks = require('./lib/tasks');
        tasks.reconcileLoad();
      } catch (err) {
        console.warn(`[HR] Task load reconcile failed: ${err.message}`);
      }
    }, { timezone: 'Etc/UTC' });

    cron.schedule('0 9 * * 1', () => {
      try {
        const recent = loadRecentAgentRuns(24 * 7);
        const review = hr.runCadenceReview(org, experience, recent);
        console.log(`[HR] Cadence weekly review ${review.week}: ${review.promotions.length} promotions, ${review.pipsOpened.length} PIPs`);
      } catch (err) {
        console.warn(`[HR] Cadence review failed: ${err.message}`);
      }
    }, { timezone: 'Etc/UTC' });

    console.log('  HR: cron jobs scheduled (Roster 02:00, Witness 03:00, Cadence Mon 09:00 UTC)');
  } catch (err) {
    console.warn(`  HR: cron scheduling failed — ${err.message}`);
  }

  console.log('');
});
