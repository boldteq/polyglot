// ── SQLite Database Module for Polyglot ──────────────────────────────────────
// Replaces JSON file storage with a local SQLite database.
// Uses better-sqlite3 (synchronous, fast, no async overhead).
// Database file: data/polyglot.db (created automatically on first access).

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
// Default to data/polyglot.db; POLYGLOT_DB_PATH overrides (isolated tests, alt envs).
const DB_PATH = process.env.POLYGLOT_DB_PATH || path.join(DB_DIR, 'polyglot.db');
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const ORG_DIR = path.join(HOME, '.claude', 'org');

let _db = null;

// Org-cache invalidation hook. org.js registers a callback here so every
// registry/department write clears its in-process caches. db.js must not require
// org.js (cycle), hence the callback indirection — same pattern as atomicIo.
let _orgInvalidator = null;
function setOrgInvalidator(fn) { _orgInvalidator = typeof fn === 'function' ? fn : null; }
function _invalidateOrg() { if (_orgInvalidator) { try { _orgInvalidator(); } catch { /* never let invalidation break a write */ } } }

// ── Database Lifecycle ──────────────────────────────────────────────────────

// Slow-query threshold (ms). Queries that take longer emit a warn log.
// Skip logging for error_log queries themselves to avoid recursion.
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS, 10) || 250;
let _loggingSlowQuery = false;

function instrumentDb(rawDb) {
  const origPrepare = rawDb.prepare.bind(rawDb);
  rawDb.prepare = function instrumentedPrepare(sql) {
    const stmt = origPrepare(sql);
    const skip = /error_log/i.test(sql);
    const wrap = (method) => {
      const orig = stmt[method].bind(stmt);
      stmt[method] = function (...args) {
        if (skip || _loggingSlowQuery) return orig(...args);
        const t = Date.now();
        const out = orig(...args);
        const ms = Date.now() - t;
        if (ms >= SLOW_QUERY_MS) {
          _loggingSlowQuery = true;
          try {
            require('./lib/logger').warn(`slow query ${ms}ms`, {
              category: 'db', durationMs: ms, meta: { sql: sql.slice(0, 240), method },
            });
          } catch { /* logger may not be initialized yet */ }
          _loggingSlowQuery = false;
        }
        return out;
      };
    };
    if (typeof stmt.run === 'function') wrap('run');
    if (typeof stmt.get === 'function') wrap('get');
    if (typeof stmt.all === 'function') wrap('all');
    return stmt;
  };
  return rawDb;
}

function getDb() {
  if (_db) return _db;
  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('auto_vacuum = INCREMENTAL'); // Q12: reclaim space incrementally
  _db.pragma('cache_size = -64000');       // 64MB page cache (default is 2MB)
  _db.pragma('temp_store = MEMORY');       // temp tables in RAM, not disk

  // Integrity check — catch corruption early. Default to quick_check (fast); the
  // full integrity_check scans every page and blocks boot on a large DB (Bug 2),
  // so only run it when DB_INTEGRITY_CHECK=full.
  try {
    const pragma = process.env.DB_INTEGRITY_CHECK === 'full' ? 'integrity_check' : 'quick_check';
    const check = _db.pragma(pragma);
    if (check[0]?.[pragma] !== 'ok') {
      console.error(`[db] ${pragma.toUpperCase()} FAILED:`, check);
      // Defer logger require — module may not be loaded yet during boot
      try { require('./lib/logger').error('SQLite integrity check failed', { category: 'db', meta: { pragma, check } }); } catch {}
    }
  } catch (err) {
    console.error('[db] Integrity check error:', err.message);
    try { require('./lib/logger').error(err, { category: 'db' }); } catch {}
  }

  runMigrations(_db);
  instrumentDb(_db);
  return _db;
}

function close() {
  if (_db) { _db.close(); _db = null; }
}

// ── Prepared Statement Cache ────────────────────────────────────────────────

const _stmts = {};
function stmt(sql) {
  if (!_stmts[sql]) _stmts[sql] = getDb().prepare(sql);
  return _stmts[sql];
}

// ── Schema Migrations ───────────────────────────────────────────────────────

function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));

  const migrations = [
    { version: 1, name: 'create_all_tables', fn: createAllTables },
    { version: 2, name: 'import_json_data', fn: importJsonData },
    { version: 3, name: 'create_change_log', fn: createChangeLog },
    { version: 4, name: 'org_structure_v2', fn: orgStructureV2Migration },
    { version: 5, name: 'tags_squad_history', fn: tagsSquadHistoryMigration },
    { version: 6, name: 'tasks_table', fn: tasksTableMigration },
    { version: 7, name: 'agent_capacity_columns', fn: agentCapacityMigration },
    { version: 8, name: 'orchestration_runtime', fn: orchestrationRuntimeMigration },
    { version: 9, name: 'node_positions', fn: nodePositionsMigration },
    { version: 10, name: 'node_positions_locked', fn: nodePositionsLockedMigration },
    { version: 11, name: 'agent_avatar', fn: agentAvatarMigration },
    { version: 12, name: 'agent_gender', fn: agentGenderMigration },
    { version: 13, name: 'performance_indexes', fn: performanceIndexesMigration },
    { version: 14, name: 'agent_status_defaults', fn: agentStatusDefaultsMigration },
    { version: 15, name: 'error_log', fn: errorLogMigration },
    { version: 16, name: 'system_schedule_overrides', fn: systemScheduleOverridesMigration },
    { version: 17, name: 'agent_runs_extended_status', fn: agentRunsExtendedStatusMigration },
    { version: 18, name: 'error_log_observability', fn: errorLogObservabilityMigration },
    { version: 19, name: 'app_config_foundation', fn: appConfigFoundationMigration },
    { version: 20, name: 'drop_duplicate_indexes', fn: dropDuplicateIndexesMigration },
    { version: 21, name: 'error_log_dedup_key', fn: errorLogDedupKeyMigration },
    { version: 22, name: 'run_observability', fn: runObservabilityMigration },
    { version: 23, name: 'policy_audit', fn: policyAuditMigration },
    { version: 24, name: 'learning_loop', fn: learningLoopMigration },
  ];

  for (const mig of migrations) {
    if (applied.has(mig.version)) continue;
    console.log(`[db] Running migration ${mig.version}: ${mig.name}`);
    db.transaction(() => {
      mig.fn(db);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(mig.version, mig.name);
    })();
  }
}

// ── Migration v4: Org Structure v2 (2026-04-27) ────────────────────────────
// Adds subDepartment + pod + secondaryReportsTo columns to agents.
// Adds sub_departments + replaced_by + deprecated_at columns to departments.
// Reimports departments.json + registry.json so existing rows pick up the new
// hierarchical fields.
function orgStructureV2Migration(db) {
  const hasCol = (table, col) => {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  };

  // agents — add 3 new columns idempotently
  if (!hasCol('agents', 'subDepartment')) db.exec("ALTER TABLE agents ADD COLUMN subDepartment TEXT");
  if (!hasCol('agents', 'pod')) db.exec("ALTER TABLE agents ADD COLUMN pod TEXT");
  if (!hasCol('agents', 'secondaryReportsTo')) db.exec("ALTER TABLE agents ADD COLUMN secondaryReportsTo TEXT");

  // departments — add subDepartments JSON + deprecation tracking
  if (!hasCol('departments', 'sub_departments')) db.exec("ALTER TABLE departments ADD COLUMN sub_departments TEXT DEFAULT '{}'");
  if (!hasCol('departments', 'replaced_by')) db.exec("ALTER TABLE departments ADD COLUMN replaced_by TEXT");
  if (!hasCol('departments', 'deprecated_at')) db.exec("ALTER TABLE departments ADD COLUMN deprecated_at TEXT");

  // Indexes for new columns
  db.exec("CREATE INDEX IF NOT EXISTS idx_agents_subDepartment ON agents(subDepartment)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_agents_pod ON agents(pod)");

  // Reimport departments.json (now contains design + content-seo + subDepartments)
  const fs = require('fs');
  const path = require('path');
  const HOME = require('os').homedir();
  const ORG_DIR = path.join(HOME, '.claude', 'org');

  const deptsFile = path.join(ORG_DIR, 'departments.json');
  if (fs.existsSync(deptsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deptsFile, 'utf-8'));
      if (data.departments) {
        const ds = db.prepare(`INSERT OR REPLACE INTO departments
          (id,label,description,head,color,icon,sort_order,active,sub_departments,replaced_by,deprecated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        for (const d of Object.values(data.departments)) {
          ds.run(
            d.id, d.label, d.description, d.head, d.color, d.icon,
            d.order || 0,
            d.active !== false ? 1 : 0,
            JSON.stringify(d.subDepartments || {}),
            d.replacedBy ? JSON.stringify(d.replacedBy) : null,
            d.deprecatedAt || null,
          );
        }
      }
    } catch (err) {
      console.error('[migration v4] departments.json reimport failed:', err.message);
    }
  }

  // Reimport registry.json (now contains subDepartment + pod + secondaryReportsTo per agent)
  const regFile = path.join(ORG_DIR, 'registry.json');
  if (fs.existsSync(regFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(regFile, 'utf-8'));
      if (data.agents) {
        const updateStmt = db.prepare(`UPDATE agents SET subDepartment=?, pod=?, secondaryReportsTo=? WHERE id=?`);
        for (const [id, a] of Object.entries(data.agents)) {
          updateStmt.run(a.subDepartment || null, a.pod || null, a.secondaryReportsTo || null, id);
        }
        // Also update departments for agents whose dept changed (creative → design / content-seo)
        const deptStmt = db.prepare(`UPDATE agents SET department=? WHERE id=?`);
        for (const [id, a] of Object.entries(data.agents)) {
          if (a.department) deptStmt.run(a.department, id);
        }
      }
    } catch (err) {
      console.error('[migration v4] registry.json reimport failed:', err.message);
    }
  }

  console.log('[migration v4] Org Structure v2 migration complete');
}

// ── Migration v5: Tags + Squad columns + Registry History (2026-04-28) ─────
// Adds `tags` (JSON) and `squad` columns to agents — was previously stored only
// in registry.json with no SQLite path → squad/tag UI returned null.
// Adds `registry_history` table for undo/audit support on registry edits.
function tagsSquadHistoryMigration(db) {
  const hasCol = (table, col) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

  if (!hasCol('agents', 'tags'))  db.exec("ALTER TABLE agents ADD COLUMN tags TEXT DEFAULT '{}'");
  if (!hasCol('agents', 'squad')) db.exec("ALTER TABLE agents ADD COLUMN squad TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_agents_squad ON agents(squad)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id    TEXT NOT NULL,
      action      TEXT NOT NULL,
      prior_state TEXT,
      new_state   TEXT,
      patch       TEXT,
      actor       TEXT DEFAULT 'admin',
      batch_id    TEXT,
      undone      INTEGER DEFAULT 0,
      undone_at   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_history_agent  ON registry_history(agent_id);
    CREATE INDEX IF NOT EXISTS idx_history_batch  ON registry_history(batch_id);
    CREATE INDEX IF NOT EXISTS idx_history_recent ON registry_history(created_at DESC);
  `);

  // Reimport tags + squad from registry.json
  const fs = require('fs');
  const path = require('path');
  const HOME = require('os').homedir();
  const regFile = path.join(HOME, '.claude', 'org', 'registry.json');
  if (fs.existsSync(regFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(regFile, 'utf-8'));
      if (data.agents) {
        const u = db.prepare('UPDATE agents SET tags=?, squad=? WHERE id=?');
        for (const [id, a] of Object.entries(data.agents)) {
          u.run(JSON.stringify(a.tags || {}), a.squad || null, id);
        }
      }
    } catch (err) {
      console.error('[migration v5] registry.json reimport failed:', err.message);
    }
  }
  console.log('[migration v5] Tags + Squad + Registry History migration complete');
}

// ── Migration v11: agent.avatar column (2026-04-29) ────────────────────────
// Per-agent custom avatar URL. Null falls back to a generated face from the
// agent id + gender. Stored on agents table directly so it flows through the
// existing PATCH/SSE pipe.
function agentAvatarMigration(db) {
  const hasCol = db.prepare(`PRAGMA table_info(agents)`).all().some((c) => c.name === 'avatar');
  if (!hasCol) db.exec("ALTER TABLE agents ADD COLUMN avatar TEXT");
  console.log('[migration v11] agent.avatar column added');
}

// ── Migration v12: agent.gender column (2026-04-29) ────────────────────────
// Used to drive default avatar generation: 'male' | 'female' | 'neutral'.
// Combined with agent id for stable, deterministic photo selection.
function agentGenderMigration(db) {
  const hasCol = db.prepare(`PRAGMA table_info(agents)`).all().some((c) => c.name === 'gender');
  if (!hasCol) db.exec("ALTER TABLE agents ADD COLUMN gender TEXT");
  console.log('[migration v12] agent.gender column added');
}

// ── Migration v13: performance indexes on hot query paths (2026-05-01) ───────
function performanceIndexesMigration(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agents_status          ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_department      ON agents(department);
    CREATE INDEX IF NOT EXISTS idx_tasks_agent_status     ON tasks(agentId, status);
    CREATE INDEX IF NOT EXISTS idx_runs_orchestration     ON orchestration_runs(orchestrationId);
    CREATE INDEX IF NOT EXISTS idx_runs_status            ON orchestration_runs(status);
    CREATE INDEX IF NOT EXISTS idx_witness_agent          ON witness_log(agent);
    CREATE INDEX IF NOT EXISTS idx_witness_t              ON witness_log(t);
  `);
  console.log('[migration v13] performance indexes created');
}

// ── Migration v20: drop duplicate indexes (C-db audit) ──────────────────────
// v13 created indexes that already existed under earlier names, doubling write
// cost for zero read benefit. Drop the v13 duplicates; keep the originals
// (idx_orch_runs_orchId/status, idx_witness_log_agent/t). idx_tasks_agentId is a
// strict prefix of the composite idx_tasks_agent_status, so it is redundant too.
function dropDuplicateIndexesMigration(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_runs_orchestration;
    DROP INDEX IF EXISTS idx_runs_status;
    DROP INDEX IF EXISTS idx_witness_agent;
    DROP INDEX IF EXISTS idx_witness_t;
    DROP INDEX IF EXISTS idx_tasks_agentId;
  `);
  console.log('[migration v20] dropped duplicate indexes');
}

// ── Migration v21: error_log dedup_key (noise collapse) ─────────────────────
// Adds a normalized dedup key so repeating messages whose only difference is an
// embedded timestamp/number (node-cron ticks, "slow query 356ms", selftest)
// collapse to ONE row instead of accumulating forever.
function errorLogDedupKeyMigration(db) {
  const hasCol = db.prepare("PRAGMA table_info(error_log)").all().some(c => c.name === 'dedup_key');
  if (!hasCol) db.exec('ALTER TABLE error_log ADD COLUMN dedup_key TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_error_log_dedup ON error_log(dedup_key, ts)');
  console.log('[migration v21] error_log.dedup_key added');
}

// ── Migration v22: run observability (Pillar 1, 2026-06-14) ──────────────────
// The audit gap: cost was ESTIMATED (chars/4), no fine-grained event trace, no
// delegation edges, no independent eval scores. These 4 additive tables make the
// system answer "which agent failed, why, REAL token cost, who delegated, judge
// score" — the data the durability/governance/consolidation pillars build on.
// Purely additive (no existing table/data touched).
function runObservabilityMigration(db) {
  db.exec(`
    -- one row per LLM call. estimated=0 when real usage came back from the CLI.
    CREATE TABLE IF NOT EXISTS cost_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      runId        TEXT,
      agentName    TEXT,
      ts           TEXT NOT NULL,
      model        TEXT,
      inputTokens  INTEGER DEFAULT 0,
      outputTokens INTEGER DEFAULT 0,
      totalTokens  INTEGER DEFAULT 0,
      costUsd      REAL DEFAULT 0,
      estimated    INTEGER DEFAULT 1,
      source       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cost_logs_run   ON cost_logs(runId);
    CREATE INDEX IF NOT EXISTS idx_cost_logs_agent ON cost_logs(agentName, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_logs_ts    ON cost_logs(ts DESC);

    -- fine-grained event trace within a run: gate, retry, file, tool, delegation, judge, note.
    CREATE TABLE IF NOT EXISTS agent_events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      runId   TEXT NOT NULL,
      ts      TEXT NOT NULL,
      type    TEXT NOT NULL,
      data    TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_agent_events_run  ON agent_events(runId, ts);
    CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(type, ts DESC);

    -- who delegated to whom (the orchestration graph, observed not just declared).
    CREATE TABLE IF NOT EXISTS delegations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      parentRunId TEXT,
      parentAgent TEXT,
      childAgent  TEXT NOT NULL,
      childRunId  TEXT,
      task        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_delegations_parent ON delegations(parentRunId);
    CREATE INDEX IF NOT EXISTS idx_delegations_child  ON delegations(childAgent, ts DESC);

    -- independent LLM-as-judge scores (Pillar 3 → Witness loop). Replaces self-report.
    CREATE TABLE IF NOT EXISTS eval_scores (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        TEXT NOT NULL,
      runId     TEXT,
      caseId    TEXT,
      agent     TEXT,
      taskType  TEXT,
      overall   REAL,
      pass      INTEGER,
      scores    TEXT DEFAULT '{}',
      reasoning TEXT,
      dedupKey  TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_eval_scores_agent ON eval_scores(agent, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_eval_scores_case  ON eval_scores(caseId, ts DESC);
  `);
  console.log('[migration v22] cost_logs + agent_events + delegations + eval_scores tables created');
}

// ── Migration v23: policy_audit (Pillar 5, 2026-06-14) ───────────────────────
// Every dispatch-time policy decision (allow/block + violations) gets an audit
// row. Makes governance enforced + inspectable instead of social-contract.
function policyAuditMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         TEXT NOT NULL,
      decision   TEXT NOT NULL,           -- 'allow' | 'block'
      agentId    TEXT,
      taskType   TEXT,
      priority   TEXT,
      source     TEXT,                     -- e.g. 'dispatch/assign'
      violations TEXT DEFAULT '[]',        -- JSON [{code,severity,detail}]
      context    TEXT DEFAULT '{}'         -- JSON {skillScore,burnPct,model,tier,mode}
    );
    CREATE INDEX IF NOT EXISTS idx_policy_audit_ts       ON policy_audit(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_policy_audit_decision ON policy_audit(decision, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_policy_audit_agent    ON policy_audit(agentId, ts DESC);
  `);
  console.log('[migration v23] policy_audit table created');
}

// ── Migration v14: agent status defaults + backfill NULLs (2026-05-01) ───────
function agentStatusDefaultsMigration(db) {
  // Backfill NULL critical fields so all rows have valid values
  db.exec(`UPDATE agents SET status = 'active'   WHERE status IS NULL`);
  db.exec(`UPDATE agents SET title  = 'Agent'    WHERE title  IS NULL OR title = ''`);
  db.exec(`UPDATE agents SET tier   = 'engineer' WHERE tier   IS NULL OR tier  = ''`);
  db.exec(`UPDATE agents SET name   = id         WHERE name   IS NULL OR name  = ''`);
  console.log('[migration v14] agent status/title/tier/name defaults backfilled');
}

// ── Migration v15: error_log table (2026-05-01) ───────────────────────────────
function errorLogMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS error_log (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       TEXT NOT NULL DEFAULT (datetime('now')),
      level    TEXT NOT NULL DEFAULT 'error',
      source   TEXT NOT NULL DEFAULT 'server',
      message  TEXT NOT NULL,
      stack    TEXT,
      context  TEXT,
      resolved INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_error_log_ts       ON error_log(ts);
    CREATE INDEX IF NOT EXISTS idx_error_log_resolved ON error_log(resolved);
    CREATE INDEX IF NOT EXISTS idx_error_log_source   ON error_log(source);
  `);
  console.log('[migration v15] error_log table created');
}

// ── Migration v18: error_log observability (2026-05-19) ───────────────────
// Whole-app observability: extend error_log with category, agent_id,
// request_id, route, method, status, duration_ms, user_agent. All additive
// + nullable so existing rows + callers keep working.
function errorLogObservabilityMigration(db) {
  const hasCol = (table, col) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!hasCol('error_log', 'category'))    db.exec("ALTER TABLE error_log ADD COLUMN category TEXT");
  if (!hasCol('error_log', 'agent_id'))    db.exec("ALTER TABLE error_log ADD COLUMN agent_id TEXT");
  if (!hasCol('error_log', 'request_id'))  db.exec("ALTER TABLE error_log ADD COLUMN request_id TEXT");
  if (!hasCol('error_log', 'route'))       db.exec("ALTER TABLE error_log ADD COLUMN route TEXT");
  if (!hasCol('error_log', 'method'))      db.exec("ALTER TABLE error_log ADD COLUMN method TEXT");
  if (!hasCol('error_log', 'status'))      db.exec("ALTER TABLE error_log ADD COLUMN status INTEGER");
  if (!hasCol('error_log', 'duration_ms')) db.exec("ALTER TABLE error_log ADD COLUMN duration_ms INTEGER");
  if (!hasCol('error_log', 'user_agent'))  db.exec("ALTER TABLE error_log ADD COLUMN user_agent TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_error_log_category   ON error_log(category);
    CREATE INDEX IF NOT EXISTS idx_error_log_request_id ON error_log(request_id);
    CREATE INDEX IF NOT EXISTS idx_error_log_agent_id   ON error_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_error_log_level      ON error_log(level);
  `);
  console.log('[migration v18] error_log observability columns added');
}

// ── Migration v19: app_config foundation (2026-05-19) ──────────────────────
// Static→Dynamic refactor — moves all hardcoded thresholds, time windows,
// API limits, UI caps, model defaults, dispatch weights, pod prefixes, and
// per-agent budgets out of source code and into SQLite-backed config tables.
function appConfigFoundationMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      category    TEXT NOT NULL,
      description TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_app_config_category ON app_config(category);

    CREATE TABLE IF NOT EXISTS config_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT NOT NULL,
      before     TEXT,
      after      TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      source     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_config_audit_key ON config_audit(key);
    CREATE INDEX IF NOT EXISTS idx_config_audit_changed_at ON config_audit(changed_at DESC);

    CREATE TABLE IF NOT EXISTS pods (
      id          TEXT PRIMARY KEY,
      prefix      TEXT NOT NULL,
      department  TEXT,
      description TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pods_prefix ON pods(prefix);

    CREATE TABLE IF NOT EXISTS models (
      id            TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      tier          TEXT NOT NULL,
      cost_penalty  REAL NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dispatch_policy (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL DEFAULT '{}'
    );
    INSERT OR IGNORE INTO dispatch_policy (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS model_policy (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern     TEXT NOT NULL,
      model       TEXT NOT NULL,
      tier        TEXT NOT NULL,
      agents_json TEXT,
      priority    INTEGER NOT NULL DEFAULT 0,
      enabled     INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model_policy_priority ON model_policy(priority DESC);
  `);

  const hasCol = (table, col) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!hasCol('agents', 'budget_lines')) db.exec(`ALTER TABLE agents ADD COLUMN budget_lines INTEGER`);
  if (!hasCol('agents', 'budget_chars')) db.exec(`ALTER TABLE agents ADD COLUMN budget_chars INTEGER`);
  if (!hasCol('agents', 'level_cap'))    db.exec(`ALTER TABLE agents ADD COLUMN level_cap INTEGER`);

  console.log('[migration v19] app_config foundation tables + agents budget/level_cap columns added');
}

// ── Migration v16: system_schedule_overrides (2026-05-18) ──────────────────
// User can disable built-in HR/automation cycles (Roster, Witness, Cadence,
// Tutor, Mira, Forge) via the Schedules UI without code change.
function systemScheduleOverridesMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_schedule_overrides (
      id        TEXT PRIMARY KEY,
      enabled   INTEGER DEFAULT 1,
      updatedAt TEXT
    );
  `);
  console.log('[migration v16] system_schedule_overrides table created');
}

// ── Migration v17: agent_runs extended status (2026-05-18) ─────────────────
// agent_runs.status was previously {success, error}. We now support:
//   'running'   — stub row inserted at handler start, before resolution
//   'cancelled' — operator killed handler via /cancel endpoint
//   'crashed'   — process died mid-handler; row reconciled at next boot
// status is already TEXT, no schema change needed. Migration just marks
// any stale 'running' rows from the prior process as 'crashed' since the
// server (which was tracking them in inflight state) is restarting.
function agentRunsExtendedStatusMigration(db) {
  const reconciled = db.prepare(`
    UPDATE agent_runs
       SET status = 'crashed',
           error  = COALESCE(error, 'Server restarted during run')
     WHERE status = 'running'
  `).run();
  console.log(`[migration v17] reconciled ${reconciled.changes} orphan 'running' run(s) as 'crashed'`);
}

// ── Migration v6: tasks table (Phase A — Routing Engine) (2026-04-28) ──────
// Higher-level work units. Distinct from agent_runs (which logs every LLM
// call). One task can spawn many runs. Created by /api/dispatch/assign or
// the orchestration runtime. Owned by exactly one agent (single-owner rule).
function tasksTableMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                TEXT PRIMARY KEY,
      agentId           TEXT NOT NULL,
      source            TEXT,
      taskType          TEXT,
      title             TEXT,
      prompt            TEXT,
      status            TEXT DEFAULT 'assigned',
      priority          TEXT DEFAULT 'p2',
      estimatedTokens   INTEGER DEFAULT 0,
      actualTokens      INTEGER DEFAULT 0,
      estimatedCostUsd  REAL DEFAULT 0,
      actualCostUsd     REAL DEFAULT 0,
      assignedAt        TEXT,
      startedAt         TEXT,
      completedAt       TEXT,
      output            TEXT,
      error             TEXT,
      metadata          TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_agentId  ON tasks(agentId);
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignedAt ON tasks(assignedAt DESC);
  `);
  console.log('[migration v6] tasks table created');
}

// ── Migration v7: agent capacity columns (Phase A) ─────────────────────────
// Tracks per-agent live load so the routing engine can pick a free agent
// instead of always the highest-skill match. Defaults: lead/leadership=5
// concurrent, others=3. busy_until_at is set when an agent is mid-run with
// a known ETA so we can avoid double-booking.
function agentCapacityMigration(db) {
  const hasCol = (table, col) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);

  if (!hasCol('agents', 'active_task_count'))     db.exec('ALTER TABLE agents ADD COLUMN active_task_count INTEGER DEFAULT 0');
  if (!hasCol('agents', 'max_concurrent_tasks'))  db.exec('ALTER TABLE agents ADD COLUMN max_concurrent_tasks INTEGER DEFAULT 3');
  if (!hasCol('agents', 'busy_until_at'))         db.exec('ALTER TABLE agents ADD COLUMN busy_until_at TEXT');
  if (!hasCol('agents', 'last_dispatch_at'))      db.exec('ALTER TABLE agents ADD COLUMN last_dispatch_at TEXT');

  // Per-tier capacity defaults — leadership + lead-level agents handle more
  // parallel work than mid/junior specialists.
  db.exec(`UPDATE agents SET max_concurrent_tasks = 5 WHERE tier = 'leadership'`);
  db.exec(`UPDATE agents SET max_concurrent_tasks = 5 WHERE level >= 4`);
  db.exec(`UPDATE agents SET max_concurrent_tasks = 3 WHERE max_concurrent_tasks IS NULL OR max_concurrent_tasks = 0`);

  console.log('[migration v7] agent capacity columns added + per-tier defaults applied');
}

// ── Migration v8: Orchestration Runtime (Phase B) (2026-04-28) ─────────────
// Per-step persistence so workflow runs survive server restart and become
// resumable. The existing in-memory `executeNode` keeps working — we wrap
// it with these tables so each node transition is durable.
//
// orchestration_runs  = top-level execution session (status, currentNodeId)
// orchestration_steps = per-node trace (status, taskId from Phase A, output)
function orchestrationRuntimeMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestration_runs (
      id                TEXT PRIMARY KEY,
      orchestrationId   TEXT NOT NULL,
      orchestrationName TEXT,
      task              TEXT NOT NULL,
      status            TEXT DEFAULT 'pending',
      currentNodeId     TEXT,
      startedAt         TEXT,
      completedAt       TEXT,
      duration          INTEGER DEFAULT 0,
      createdBy         TEXT,
      finalOutput       TEXT,
      error             TEXT,
      metadata          TEXT DEFAULT '{}',
      FOREIGN KEY (orchestrationId) REFERENCES orchestrations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orch_runs_orchId   ON orchestration_runs(orchestrationId);
    CREATE INDEX IF NOT EXISTS idx_orch_runs_status   ON orchestration_runs(status);
    CREATE INDEX IF NOT EXISTS idx_orch_runs_started  ON orchestration_runs(startedAt DESC);

    CREATE TABLE IF NOT EXISTS orchestration_steps (
      id           TEXT PRIMARY KEY,
      runId        TEXT NOT NULL,
      nodeId       TEXT NOT NULL,
      stepIndex    INTEGER NOT NULL,
      agentName    TEXT,
      taskId       TEXT,
      status       TEXT DEFAULT 'pending',
      output       TEXT,
      error        TEXT,
      retryCount   INTEGER DEFAULT 0,
      startedAt    TEXT,
      completedAt  TEXT,
      duration     INTEGER DEFAULT 0,
      metadata     TEXT DEFAULT '{}',
      FOREIGN KEY (runId) REFERENCES orchestration_runs(id),
      UNIQUE(runId, nodeId)
    );
    CREATE INDEX IF NOT EXISTS idx_orch_steps_runId ON orchestration_steps(runId);
    CREATE INDEX IF NOT EXISTS idx_orch_steps_status ON orchestration_steps(status);
  `);
  console.log('[migration v8] orchestration_runs + orchestration_steps tables created');
}

// ── Migration v9: Org-chart node position overrides ────────────────────────
// Persists drag-and-drop placements so the chart remembers user-arranged
// layouts across refreshes. Each entry maps a React Flow node id (agent id
// for leader cards, "dept-<id>" or "dept-<deptId>-<subDeptId>" for columns)
// to an absolute (x, y). Layout compute reads this table and overrides the
// computed positions. Empty/missing rows fall back to the auto-layout.
function nodePositionsMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS node_positions (
      nodeId    TEXT PRIMARY KEY,
      x         REAL NOT NULL,
      y         REAL NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log('[migration v9] node_positions table created');
}

// ── Migration v10: Locked positions ────────────────────────────────────────
// Adds `locked` flag so users can pin a card. Locked cards are skipped by
// the "Auto-adjust layout" reset and become non-draggable in the UI.
function nodePositionsLockedMigration(db) {
  const hasCol = db.prepare(`PRAGMA table_info(node_positions)`).all().some((c) => c.name === 'locked');
  if (!hasCol) {
    db.exec('ALTER TABLE node_positions ADD COLUMN locked INTEGER DEFAULT 0');
  }
  console.log('[migration v10] node_positions.locked column added');
}

function createAllTables(db) {
  db.exec(`
    -- ═══════════════════════════════════════════════════════════════
    -- HIGH-VOLUME TABLES
    -- ═══════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS agent_runs (
      id              TEXT PRIMARY KEY,
      agentName       TEXT NOT NULL,
      prompt          TEXT,
      source          TEXT,
      timestamp       TEXT NOT NULL,
      duration        INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'success',
      promptChars     INTEGER DEFAULT 0,
      outputChars     INTEGER DEFAULT 0,
      estimatedTokens INTEGER DEFAULT 0,
      estimatedCost   REAL DEFAULT 0,
      error           TEXT,
      metadata        TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agentName);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_timestamp ON agent_runs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_source ON agent_runs(source);

    CREATE TABLE IF NOT EXISTS run_history (
      id                TEXT PRIMARY KEY,
      orchestrationName TEXT,
      orchestrationId   TEXT,
      task              TEXT,
      status            TEXT,
      nodeCount         INTEGER DEFAULT 0,
      nodes             TEXT DEFAULT '[]',
      edges             TEXT DEFAULT '[]',
      logs              TEXT DEFAULT '[]',
      nodeOutputs       TEXT DEFAULT '{}',
      finalOutput       TEXT,
      startedAt         TEXT,
      completedAt       TEXT,
      duration          INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_run_history_startedAt ON run_history(startedAt DESC);

    CREATE TABLE IF NOT EXISTS witness_log (
      rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
      t           TEXT NOT NULL,
      agent       TEXT,
      runId       TEXT,
      class       TEXT,
      durationMs  INTEGER,
      taskType    TEXT,
      project     TEXT,
      extra       TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_witness_log_agent ON witness_log(agent);
    CREATE INDEX IF NOT EXISTS idx_witness_log_t ON witness_log(t DESC);
    CREATE INDEX IF NOT EXISTS idx_witness_log_class ON witness_log(class);

    CREATE TABLE IF NOT EXISTS daily_scores (
      rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
      agent       TEXT NOT NULL,
      date        TEXT NOT NULL,
      success     INTEGER DEFAULT 0,
      failure     INTEGER DEFAULT 0,
      antipattern INTEGER DEFAULT 0,
      regression  INTEGER DEFAULT 0,
      score       INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_scores_agent_date ON daily_scores(agent, date);

    CREATE TABLE IF NOT EXISTS capability_gaps (
      rowid          INTEGER PRIMARY KEY AUTOINCREMENT,
      t              TEXT NOT NULL,
      brief          TEXT,
      inferredSkills TEXT DEFAULT '[]',
      gaps           TEXT DEFAULT '[]',
      bestAgent      TEXT,
      topScore       REAL DEFAULT 0,
      canHandle      INTEGER DEFAULT 0,
      recommendation TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_capability_gaps_t ON capability_gaps(t DESC);

    CREATE TABLE IF NOT EXISTS memory_audit_log (
      id              TEXT PRIMARY KEY,
      timestamp       TEXT NOT NULL,
      action          TEXT NOT NULL,
      path            TEXT,
      linesAdded      INTEGER DEFAULT 0,
      linesRemoved    INTEGER DEFAULT 0,
      sizeBefore      INTEGER,
      sizeAfter       INTEGER,
      diff            TEXT,
      contentSnapshot TEXT,
      fromPath        TEXT,
      toPath          TEXT,
      frontmatter     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memory_audit_timestamp ON memory_audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_audit_path ON memory_audit_log(path);

    -- ═══════════════════════════════════════════════════════════════
    -- ENTITY TABLES
    -- ═══════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS agents (
      id                  TEXT PRIMARY KEY,
      name                TEXT,
      description         TEXT,
      department          TEXT,
      subDepartment       TEXT,
      pod                 TEXT,
      phase               TEXT,
      reportsTo           TEXT,
      secondaryReportsTo  TEXT,
      title               TEXT DEFAULT 'Agent',
      tier                TEXT DEFAULT 'engineer',
      role                TEXT,
      model               TEXT,
      hiredAt             TEXT,
      status              TEXT DEFAULT 'active',
      level               INTEGER DEFAULT 0,
      levelTitle          TEXT,
      yearsOfExperience   REAL DEFAULT 0,
      experiencePoints    REAL DEFAULT 0,
      progressToNext      REAL DEFAULT 0,
      nextLevelTitle      TEXT,
      lastPromoted        TEXT,
      lastReview          TEXT,
      retiredAt           TEXT,
      retiredReason       TEXT,
      breakdown           TEXT DEFAULT '{}',
      stats               TEXT DEFAULT '{}',
      skills              TEXT DEFAULT '{}',
      pip                 TEXT,
      extra               TEXT DEFAULT '{}',
      updatedAt           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department);
    CREATE INDEX IF NOT EXISTS idx_agents_subDepartment ON agents(subDepartment);
    CREATE INDEX IF NOT EXISTS idx_agents_pod ON agents(pod);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_reportsTo ON agents(reportsTo);

    CREATE TABLE IF NOT EXISTS departments (
      id              TEXT PRIMARY KEY,
      label           TEXT NOT NULL,
      description     TEXT,
      head            TEXT,
      color           TEXT,
      icon            TEXT,
      sort_order      INTEGER DEFAULT 0,
      active          INTEGER DEFAULT 1,
      sub_departments TEXT DEFAULT '{}',
      replaced_by     TEXT,
      deprecated_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS phases (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      description TEXT,
      color       TEXT,
      sort_order  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orchestrations (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      nodes     TEXT DEFAULT '[]',
      edges     TEXT DEFAULT '[]',
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      agentName     TEXT,
      prompt        TEXT,
      cron          TEXT,
      enabled       INTEGER DEFAULT 1,
      lastRunAt     TEXT,
      lastRunStatus TEXT,
      createdAt     TEXT,
      updatedAt     TEXT
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      agentName   TEXT,
      prompt      TEXT,
      secret      TEXT,
      enabled     INTEGER DEFAULT 1,
      lastUsedAt  TEXT,
      createdAt   TEXT
    );

    -- System schedule overrides: user can disable a built-in HR/automation
    -- cycle (Roster, Witness, Cadence, Tutor, Mira, Forge) via the Schedules
    -- UI without code change. Row absent = use systemSchedules default
    -- (enabled). Row present = explicit override.
    CREATE TABLE IF NOT EXISTS system_schedule_overrides (
      id        TEXT PRIMARY KEY,
      enabled   INTEGER DEFAULT 1,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS training_corrections (
      id          TEXT PRIMARY KEY,
      agentName   TEXT NOT NULL,
      timestamp   TEXT,
      issue       TEXT,
      correction  TEXT,
      status      TEXT DEFAULT 'active',
      extra       TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_training_agent ON training_corrections(agentName);

    CREATE TABLE IF NOT EXISTS training_queue (
      id        TEXT PRIMARY KEY,
      agent     TEXT NOT NULL,
      skill     TEXT,
      reason    TEXT,
      priority  TEXT DEFAULT 'medium',
      status    TEXT DEFAULT 'pending',
      queuedAt  TEXT,
      completedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS reviews (
      week        TEXT PRIMARY KEY,
      reviewedAt  TEXT,
      director    TEXT,
      data        TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS onboarding (
      agent       TEXT PRIMARY KEY,
      hiredAt     TEXT,
      stage       TEXT DEFAULT 'probation',
      runsRequired INTEGER DEFAULT 10,
      runsCompleted INTEGER DEFAULT 0,
      steps       TEXT DEFAULT '[]',
      createdAt   TEXT
    );

    CREATE TABLE IF NOT EXISTS pending_approvals (
      key         TEXT PRIMARY KEY,
      runId       TEXT NOT NULL,
      nodeId      TEXT NOT NULL,
      nodeLabel   TEXT,
      createdAt   TEXT,
      timeoutMinutes INTEGER DEFAULT 60
    );

    -- ═══════════════════════════════════════════════════════════════
    -- CHAT TABLES (normalized)
    -- ═══════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id        TEXT PRIMARY KEY,
      title     TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      rowid     INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT NOT NULL,
      role      TEXT NOT NULL,
      content   TEXT,
      timestamp TEXT,
      FOREIGN KEY (sessionId) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(sessionId);

    CREATE TABLE IF NOT EXISTS project_conversations (
      id        TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      title     TEXT,
      agentName TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_project_convos_project ON project_conversations(projectId);

    CREATE TABLE IF NOT EXISTS project_conversation_messages (
      rowid          INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId TEXT NOT NULL,
      role           TEXT NOT NULL,
      content        TEXT,
      timestamp      TEXT,
      FOREIGN KEY (conversationId) REFERENCES project_conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_convo_msgs ON project_conversation_messages(conversationId);

    CREATE TABLE IF NOT EXISTS playground_history (
      id          TEXT PRIMARY KEY,
      agentName   TEXT,
      prompt      TEXT,
      output      TEXT,
      duration    INTEGER DEFAULT 0,
      status      TEXT DEFAULT 'success',
      error       TEXT,
      rating      INTEGER,
      feedback    TEXT,
      timestamp   TEXT,
      metadata    TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_playground_timestamp ON playground_history(timestamp DESC);

    -- ═══════════════════════════════════════════════════════════════
    -- SINGLETON TABLES
    -- ═══════════════════════════════════════════════════════════════

    CREATE TABLE IF NOT EXISTS config (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO config (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS goals (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO goals (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS recommendations (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO recommendations (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS model_routing (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO model_routing (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS agent_learning (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO agent_learning (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS claims_store (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO claims_store (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS antipattern_sigs (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '[]'
    );
    INSERT OR IGNORE INTO antipattern_sigs (id, data) VALUES (1, '[]');

    CREATE TABLE IF NOT EXISTS skill_index_store (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO skill_index_store (id, data) VALUES (1, '{}');

    CREATE TABLE IF NOT EXISTS experience_weights (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT DEFAULT '{}'
    );
    INSERT OR IGNORE INTO experience_weights (id, data) VALUES (1, '{}');

    -- ═══════════════════════════════════════════════════════════════
    -- APP CONFIG (Phase 2 — Static→Dynamic refactor)
    -- ═══════════════════════════════════════════════════════════════

    -- Keyed config table. Replaces magic numbers scattered across
    -- src/routes/*.js, src/lib/agentSync.js, client thresholds, etc.
    CREATE TABLE IF NOT EXISTS app_config (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      category    TEXT NOT NULL,
      description TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_app_config_category ON app_config(category);

    -- Audit log for every config write. Single-admin tool so no user column.
    CREATE TABLE IF NOT EXISTS config_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT NOT NULL,
      before     TEXT,
      after      TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      source     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_config_audit_key ON config_audit(key);
    CREATE INDEX IF NOT EXISTS idx_config_audit_changed_at ON config_audit(changed_at DESC);

    -- Pod prefix routing. Replaces hardcoded POD_PREFIXES in lib/agentSync.js.
    CREATE TABLE IF NOT EXISTS pods (
      id          TEXT PRIMARY KEY,
      prefix      TEXT NOT NULL,
      department  TEXT,
      description TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pods_prefix ON pods(prefix);

    -- Model catalog. Replaces hardcoded cost penalties in routes/dispatch.js.
    CREATE TABLE IF NOT EXISTS models (
      id            TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      tier          TEXT NOT NULL,
      cost_penalty  REAL NOT NULL,
      enabled       INTEGER NOT NULL DEFAULT 1,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Dispatch scoring policy (singleton JSON). Replaces hardcoded
    -- weights + priority boosts in routes/dispatch.js.
    CREATE TABLE IF NOT EXISTS dispatch_policy (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL DEFAULT '{}'
    );
    INSERT OR IGNORE INTO dispatch_policy (id, data) VALUES (1, '{}');

    -- Model routing policy rows. Replaces HARDCODED_RULES in routes/learning.js.
    CREATE TABLE IF NOT EXISTS model_policy (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern     TEXT NOT NULL,
      model       TEXT NOT NULL,
      tier        TEXT NOT NULL,
      agents_json TEXT,
      priority    INTEGER NOT NULL DEFAULT 0,
      enabled     INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model_policy_priority ON model_policy(priority DESC);
  `);

  // ── Idempotent ALTERs for new columns on existing tables ──────────────
  // SQLite throws if column exists; wrap each in try/catch.
  const safeAlter = (sql) => {
    try { db.exec(sql); }
    catch (err) {
      if (!/duplicate column/i.test(err.message)) throw err;
    }
  };
  safeAlter(`ALTER TABLE agents ADD COLUMN budget_lines INTEGER`);
  safeAlter(`ALTER TABLE agents ADD COLUMN budget_chars INTEGER`);
  safeAlter(`ALTER TABLE agents ADD COLUMN level_cap INTEGER`);
}

// ── JSON Data Import (migration v2) ─────────────────────────────────────────

function importJsonData(db) {
  const ROOT = path.join(__dirname, '..');

  function tryImport(label, fn) {
    try { fn(); console.log(`[db:migrate] Imported ${label}`); }
    catch (err) { console.warn(`[db:migrate] Skipped ${label}: ${err.message}`); }
  }

  // Read JSON file — also checks .migrated fallback for DB recovery scenarios
  function readJsonFile(filePath) {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (fs.existsSync(filePath + '.migrated')) {
      console.warn(`[db:migrate] Recovering from ${filePath}.migrated (DB was recreated)`);
      return JSON.parse(fs.readFileSync(filePath + '.migrated', 'utf-8'));
    }
    return null;
  }

  function readJsonlFile(filePath) {
    const actual = fs.existsSync(filePath) ? filePath : fs.existsSync(filePath + '.migrated') ? filePath + '.migrated' : null;
    if (!actual) return [];
    if (actual.endsWith('.migrated')) console.warn(`[db:migrate] Recovering from ${actual} (DB was recreated)`);
    return fs.readFileSync(actual, 'utf-8').split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  }

  function markMigrated(filePath) {
    if (fs.existsSync(filePath)) {
      try { fs.renameSync(filePath, filePath + '.migrated'); } catch {}
    }
  }

  // ── agent-runs.json ──
  tryImport('agent-runs.json', () => {
    const data = readJsonFile(path.join(ROOT, 'agent-runs.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO agent_runs (id,agentName,prompt,source,timestamp,duration,status,promptChars,outputChars,estimatedTokens,estimatedCost,error,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const r of data) s.run(r.id, r.agentName, r.prompt, r.source, r.timestamp, r.duration, r.status, r.promptChars, r.outputChars, r.estimatedTokens, r.estimatedCost, r.error, JSON.stringify(r.metadata || {}));
    })();
    markMigrated(path.join(ROOT, 'agent-runs.json'));
  });

  // ── run-history.json ──
  tryImport('run-history.json', () => {
    const data = readJsonFile(path.join(ROOT, 'run-history.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO run_history (id,orchestrationName,orchestrationId,task,status,nodeCount,nodes,edges,logs,nodeOutputs,finalOutput,startedAt,completedAt,duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const r of data) s.run(r.id, r.orchestrationName, r.orchestrationId, r.task, r.status, r.nodeCount, JSON.stringify(r.nodes || []), JSON.stringify(r.edges || []), JSON.stringify(r.logs || []), JSON.stringify(r.nodeOutputs || {}), r.finalOutput, r.startedAt, r.completedAt, r.duration);
    })();
    markMigrated(path.join(ROOT, 'run-history.json'));
  });

  // ── orchestrations.json ──
  tryImport('orchestrations.json', () => {
    const data = readJsonFile(path.join(ROOT, 'orchestrations.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO orchestrations (id,name,nodes,edges,createdAt,updatedAt) VALUES (?,?,?,?,?,?)');
    db.transaction(() => {
      for (const o of data) s.run(o.id, o.name, JSON.stringify(o.nodes || []), JSON.stringify(o.edges || []), o.createdAt, o.updatedAt);
    })();
    markMigrated(path.join(ROOT, 'orchestrations.json'));
  });

  // ── schedules.json ──
  tryImport('schedules.json', () => {
    const data = readJsonFile(path.join(ROOT, 'schedules.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO schedules (id,name,agentName,prompt,cron,enabled,lastRunAt,lastRunStatus,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const r of data) s.run(r.id, r.name, r.agentName, r.prompt, r.cron || r.cronExpression, r.enabled ? 1 : 0, r.lastRunAt || r.lastRun, r.lastRunStatus, r.createdAt, r.updatedAt);
    })();
    markMigrated(path.join(ROOT, 'schedules.json'));
  });

  // ── webhooks.json ──
  tryImport('webhooks.json', () => {
    const data = readJsonFile(path.join(ROOT, 'webhooks.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO webhooks (id,name,agentName,prompt,secret,enabled,lastUsedAt,createdAt) VALUES (?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const r of data) s.run(r.id, r.name, r.agentName, r.prompt, r.secret, r.enabled ? 1 : 0, r.lastUsedAt, r.createdAt);
    })();
    markMigrated(path.join(ROOT, 'webhooks.json'));
  });

  // ── config.json ──
  tryImport('config.json', () => {
    const data = readJsonFile(path.join(ROOT, 'config.json'));
    if (!data) return;
    db.prepare('UPDATE config SET data = ? WHERE id = 1').run(JSON.stringify(data));
  });

  // ── goals.json ──
  tryImport('goals.json', () => {
    const data = readJsonFile(path.join(ROOT, 'goals.json'));
    if (!data) return;
    db.prepare('UPDATE goals SET data = ? WHERE id = 1').run(JSON.stringify(data));
    markMigrated(path.join(ROOT, 'goals.json'));
  });

  // ── chat-history.json ──
  tryImport('chat-history.json', () => {
    const data = readJsonFile(path.join(ROOT, 'chat-history.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const ss = db.prepare('INSERT OR IGNORE INTO chat_sessions (id,title,createdAt,updatedAt) VALUES (?,?,?,?)');
    const ms = db.prepare('INSERT INTO chat_messages (sessionId,role,content,timestamp) VALUES (?,?,?,?)');
    db.transaction(() => {
      for (const s of data) {
        ss.run(s.id, s.title, s.createdAt, s.updatedAt);
        for (const m of (s.messages || [])) ms.run(s.id, m.role, m.content, m.timestamp || s.updatedAt);
      }
    })();
    markMigrated(path.join(ROOT, 'chat-history.json'));
  });

  // ── pending-approvals.json ──
  tryImport('pending-approvals.json', () => {
    const data = readJsonFile(path.join(ROOT, 'pending-approvals.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO pending_approvals (key,runId,nodeId,nodeLabel,createdAt,timeoutMinutes) VALUES (?,?,?,?,?,?)');
    db.transaction(() => {
      for (const a of data) s.run(a.key, a.runId, a.nodeId, a.nodeLabel, a.createdAt, a.timeoutMinutes || 60);
    })();
    markMigrated(path.join(ROOT, 'pending-approvals.json'));
  });

  // ── playground-history.json ──
  tryImport('playground-history.json', () => {
    const data = readJsonFile(path.join(ROOT, 'playground-history.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO playground_history (id,agentName,prompt,output,duration,status,error,rating,feedback,timestamp,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const r of data) s.run(r.id, r.agentName, r.prompt, r.output, r.duration, r.status, r.error, r.rating, r.feedback, r.timestamp, JSON.stringify(r.metadata || {}));
    })();
    markMigrated(path.join(ROOT, 'playground-history.json'));
  });

  // ── memory-audit-log.json ──
  tryImport('memory-audit-log.json', () => {
    const data = readJsonFile(path.join(ROOT, 'memory-audit-log.json'));
    if (!Array.isArray(data) || data.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO memory_audit_log (id,timestamp,action,path,linesAdded,linesRemoved,sizeBefore,sizeAfter,diff,contentSnapshot,fromPath,toPath,frontmatter) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const e of data) s.run(e.id, e.timestamp, e.action, e.path, e.linesAdded, e.linesRemoved, e.sizeBefore, e.sizeAfter, JSON.stringify(e.diff || null), e.contentSnapshot, e.fromPath, e.toPath, JSON.stringify(e.frontmatter || null));
    })();
    markMigrated(path.join(ROOT, 'memory-audit-log.json'));
  });

  // ── Singleton JSON files ──
  const singletons = [
    { file: path.join(ROOT, 'agent-learning.json'), table: 'agent_learning' },
    { file: path.join(ROOT, 'claims.json'), table: 'claims_store' },
    { file: path.join(ROOT, 'model-routing.json'), table: 'model_routing' },
  ];
  for (const { file, table } of singletons) {
    tryImport(path.basename(file), () => {
      const data = readJsonFile(file);
      if (!data) return;
      db.prepare(`UPDATE ${table} SET data = ? WHERE id = 1`).run(JSON.stringify(data));
      markMigrated(file);
    });
  }

  // ── Org dir files ──
  tryImport('registry.json', () => {
    const data = readJsonFile(path.join(ORG_DIR, 'registry.json'));
    if (!data || !data.agents) return;
    const s = db.prepare(`INSERT OR REPLACE INTO agents
      (id,name,description,department,subDepartment,pod,phase,reportsTo,secondaryReportsTo,title,tier,role,model,hiredAt,status,level,levelTitle,yearsOfExperience,experiencePoints,progressToNext,nextLevelTitle,lastPromoted,lastReview,retiredAt,retiredReason,breakdown,stats,skills,pip,extra,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const [id, a] of Object.entries(data.agents)) {
        s.run(
          id, a.name, a.description,
          a.department, a.subDepartment || null, a.pod || null,
          a.phase, a.reportsTo, a.secondaryReportsTo || null,
          a.title, a.tier, a.role, a.model, a.hiredAt, a.status,
          a.level, a.levelTitle, a.yearsOfExperience, a.experiencePoints, a.progressToNext, a.nextLevelTitle,
          a.lastPromoted, a.lastReview, a.retiredAt, a.retiredReason,
          JSON.stringify(a.breakdown || {}), JSON.stringify(a.stats || {}), JSON.stringify(a.skills || {}),
          a.pip ? JSON.stringify(a.pip) : null,
          JSON.stringify({ canMentor: a.canMentor, canShipProd: a.canShipProd, levelColor: a.levelColor, weaknesses: a.weaknesses, computedAt: a.computedAt }),
          a.updatedAt,
        );
      }
    })();
  });

  tryImport('departments.json', () => {
    const data = readJsonFile(path.join(ORG_DIR, 'departments.json'));
    if (!data) return;
    if (data.departments) {
      const s = db.prepare(`INSERT OR REPLACE INTO departments
        (id,label,description,head,color,icon,sort_order,active,sub_departments,replaced_by,deprecated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => {
        for (const d of Object.values(data.departments)) {
          s.run(
            d.id, d.label, d.description, d.head, d.color, d.icon,
            d.order || 0,
            d.active !== false ? 1 : 0,
            JSON.stringify(d.subDepartments || {}),
            d.replacedBy ? JSON.stringify(d.replacedBy) : null,
            d.deprecatedAt || null,
          );
        }
      })();
    }
    if (data.phases) {
      const s = db.prepare('INSERT OR REPLACE INTO phases (id,label,description,color,sort_order) VALUES (?,?,?,?,?)');
      db.transaction(() => {
        for (const p of Object.values(data.phases)) s.run(p.id, p.label, p.description, p.color, p.order || 0);
      })();
    }
  });

  // ── JSONL files from org dir ──
  tryImport('witness-log.jsonl', () => {
    const entries = readJsonlFile(path.join(ORG_DIR, 'witness-log.jsonl'));
    if (entries.length === 0) return;
    const s = db.prepare('INSERT INTO witness_log (t,agent,runId,class,durationMs,taskType,project,extra) VALUES (?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const e of entries) {
        const { t, agent, runId, class: cls, durationMs, taskType, project, ...rest } = e;
        s.run(t, agent, runId, cls, durationMs, taskType, project, JSON.stringify(rest));
      }
    })();
  });

  tryImport('daily-scores.jsonl', () => {
    const entries = readJsonlFile(path.join(ORG_DIR, 'daily-scores.jsonl'));
    if (entries.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO daily_scores (agent,date,success,failure,antipattern,regression,score) VALUES (?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const e of entries) s.run(e.agent, e.date, e.success, e.failure, e.antipattern, e.regression, e.score);
    })();
  });

  tryImport('capability-gaps.jsonl', () => {
    const entries = readJsonlFile(path.join(ORG_DIR, 'capability-gaps.jsonl'));
    if (entries.length === 0) return;
    const s = db.prepare('INSERT INTO capability_gaps (t,brief,inferredSkills,gaps,bestAgent,topScore,canHandle,recommendation) VALUES (?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const e of entries) s.run(e.t, e.brief, JSON.stringify(e.inferredSkills || []), JSON.stringify(e.gaps || []), e.bestAgent, e.topScore, e.canHandle ? 1 : 0, e.recommendation);
    })();
  });

  // ── Org singleton files ──
  const orgSingletons = [
    { file: path.join(ORG_DIR, 'recommendations.json'), table: 'recommendations' },
    { file: path.join(ORG_DIR, 'antipattern-signatures.json'), table: 'antipattern_sigs' },
    { file: path.join(ORG_DIR, 'skill-index.json'), table: 'skill_index_store' },
    { file: path.join(ORG_DIR, 'experience-weights.json'), table: 'experience_weights' },
  ];
  for (const { file, table } of orgSingletons) {
    tryImport(path.basename(file), () => {
      const data = readJsonFile(file);
      if (!data) return;
      db.prepare(`UPDATE ${table} SET data = ? WHERE id = 1`).run(JSON.stringify(data));
    });
  }

  tryImport('training-queue.json', () => {
    const data = readJsonFile(path.join(ORG_DIR, 'training-queue.json'));
    if (!data || !data.items) return;
    const s = db.prepare('INSERT OR IGNORE INTO training_queue (id,agent,skill,reason,priority,status,queuedAt,completedAt) VALUES (?,?,?,?,?,?,?,?)');
    db.transaction(() => {
      for (const i of data.items) s.run(i.id, i.agent, i.skill, i.reason, i.priority, i.status, i.queuedAt, i.completedAt);
    })();
  });

  // ── Reviews ──
  tryImport('reviews', () => {
    const reviewsDir = path.join(ORG_DIR, 'reviews');
    if (!fs.existsSync(reviewsDir)) return;
    const files = fs.readdirSync(reviewsDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return;
    const s = db.prepare('INSERT OR IGNORE INTO reviews (week,reviewedAt,director,data) VALUES (?,?,?,?)');
    db.transaction(() => {
      for (const f of files) {
        const week = f.replace('.json', '');
        const data = readJsonFile(path.join(reviewsDir, f));
        if (!data) continue;
        s.run(week, data.reviewedAt, data.director, JSON.stringify(data));
      }
    })();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD FUNCTIONS — matching current loadX/saveX patterns
// ═══════════════════════════════════════════════════════════════════════════

// ── Agent Runs ──────────────────────────────────────────────────────────────

// ── Node position overrides (drag-and-drop persistence) ───────────────────

function loadNodePositions() {
  const rows = stmt('SELECT nodeId, x, y, locked, updatedAt FROM node_positions').all();
  const out = {};
  for (const r of rows) {
    out[r.nodeId] = {
      x: r.x,
      y: r.y,
      locked: !!r.locked,
      updatedAt: r.updatedAt,
    };
  }
  return out;
}

// Saves a batch of positions. Updates x/y but PRESERVES the existing `locked`
// flag — lock state is mutated only via setNodeLock().
function saveNodePositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0) return 0;
  const db = getDb();
  const s = db.prepare(`
    INSERT INTO node_positions (nodeId, x, y, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(nodeId) DO UPDATE SET x = excluded.x, y = excluded.y, updatedAt = excluded.updatedAt
  `);
  const now = new Date().toISOString();
  let count = 0;
  db.transaction(() => {
    for (const p of positions) {
      if (!p || typeof p.nodeId !== 'string' || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      s.run(p.nodeId, p.x, p.y, now);
      count += 1;
    }
  })();
  return count;
}

// Toggle the lock on a single node. Inserts a placeholder row if the node has
// no saved position yet (caller should set a position first; otherwise lock
// applies to a row with x=0, y=0 which is harmless until the user drags).
function setNodeLock(nodeId, locked) {
  if (!nodeId || typeof nodeId !== 'string') throw new Error('nodeId required');
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT x, y FROM node_positions WHERE nodeId = ?').get(nodeId);
  if (existing) {
    db.prepare('UPDATE node_positions SET locked = ?, updatedAt = ? WHERE nodeId = ?')
      .run(locked ? 1 : 0, now, nodeId);
  } else {
    // Row didn't exist; create one with default position 0,0. Caller usually
    // sets a real position before locking but this avoids losing the lock if
    // they hit the lock button without dragging first.
    db.prepare(`
      INSERT INTO node_positions (nodeId, x, y, locked, updatedAt)
      VALUES (?, 0, 0, ?, ?)
    `).run(nodeId, locked ? 1 : 0, now);
  }
  return { nodeId, locked: !!locked };
}

// Clears UNLOCKED rows only. Locked rows persist so "Auto-adjust" doesn't
// blow away pinned cards.
function clearNodePositions(opts = {}) {
  const db = getDb();
  if (opts.includeLocked === true) {
    const r = db.prepare('DELETE FROM node_positions').run();
    return r.changes;
  }
  const r = db.prepare('DELETE FROM node_positions WHERE locked = 0').run();
  return r.changes;
}

function loadAgentRuns(limit = 1000) {
  return stmt('SELECT * FROM agent_runs ORDER BY timestamp DESC LIMIT ?').all(limit).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

// Cost-aware model-routing enforcement. Reads the singleton `model_routing`
// policy on every dispatch. Compares the run's model (from metadata or the
// agent's default) against the policy's expected tier for that agent.
// On mismatch:
//   - mode 'advisory' → annotate metadata.policyViolation, allow run
//   - mode 'warn'     → annotate + console.warn
//   - mode 'block'    → throw (caller decides what to do)
//
// This is the cheap path. Heavy stuff (budget tracking, monthly burn, auto-
// downgrade) lives in Hawk's daily sweep — that has access to historical
// agent_runs to compute aggregate spend.
function enforceModelPolicy(run) {
  let policy;
  try {
    policy = loadModelRouting();
  } catch {
    return run;
  }
  if (!policy || !policy.tiers) return run;

  const expectedAgentTier = (() => {
    for (const [tierKey, tierDef] of Object.entries(policy.tiers)) {
      if (Array.isArray(tierDef.agents) && tierDef.agents.includes(run.agentName)) {
        return { tierKey, expectedShort: tierDef.shortName, expectedFull: tierDef.model };
      }
    }
    return null;
  })();

  if (!expectedAgentTier) return run;

  const md = run.metadata || {};
  const actualModel = (md.model || '').toLowerCase();
  if (!actualModel) return run;

  // Match on either short name (opus/sonnet/haiku) or full model id
  const normalized = actualModel.includes('opus') ? 'opus'
    : actualModel.includes('haiku') ? 'haiku'
    : actualModel.includes('sonnet') ? 'sonnet'
    : actualModel;

  if (normalized === expectedAgentTier.expectedShort) return run;

  // Violation
  const violation = {
    expected: expectedAgentTier.expectedShort,
    actual: normalized,
    tier: expectedAgentTier.tierKey,
    detectedAt: new Date().toISOString(),
  };
  const mode = policy.enforcementMode || 'advisory';

  if (mode === 'warn' || mode === 'block') {
    console.warn(`[modelRouting] ${run.agentName} ran on '${normalized}' but expected '${expectedAgentTier.expectedShort}' (tier=${expectedAgentTier.tierKey})`);
  }
  if (mode === 'block') {
    const err = new Error(`Model-routing violation: agent "${run.agentName}" must use "${expectedAgentTier.expectedShort}", got "${normalized}"`);
    err.code = 'MODEL_ROUTING_BLOCKED';
    err.violation = violation;
    throw err;
  }
  return { ...run, metadata: { ...md, policyViolation: violation } };
}

function insertAgentRun(run) {
  const checked = enforceModelPolicy(run);
  stmt('INSERT OR IGNORE INTO agent_runs (id,agentName,prompt,source,timestamp,duration,status,promptChars,outputChars,estimatedTokens,estimatedCost,error,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(checked.id, checked.agentName, checked.prompt, checked.source, checked.timestamp, checked.duration, checked.status, checked.promptChars, checked.outputChars, checked.estimatedTokens, checked.estimatedCost, checked.error, JSON.stringify(checked.metadata || {}));

  // Broadcast a lightweight event so subscribers (e.g. systemSchedules Mira
  // trigger) can react to build successes. Deferred via setImmediate to
  // break the db ↔ agentSync require cycle and avoid blocking writes.
  setImmediate(() => {
    try {
      const agentSync = require('./lib/agentSync');
      agentSync.events.emit('agent_run.recorded', {
        runId: checked.id,
        agentName: checked.agentName,
        source: checked.source,
        status: checked.status,
        timestamp: checked.timestamp,
      });
    } catch (err) {
      // Silent: event emission failure should never break run insert.
      if (process.env.DEBUG_DB) console.warn('[db] agent_run event emit failed:', err.message);
    }
  });
}

// Insert a stub run with status='running' BEFORE the handler executes.
// Returns the row's id. Caller must call completeAgentRun() later (in finally)
// to mark final status. If the process crashes between the two calls, the
// next-boot reconcileOrphanRuns() will mark the row as 'crashed'.
function insertAgentRunStub(stub) {
  const ts = new Date().toISOString();
  const row = {
    id: stub.id,
    agentName: stub.agentName || 'unknown',
    prompt: (stub.prompt || '').slice(0, 200),
    source: stub.source || 'unknown',
    timestamp: ts,
    duration: 0,
    status: 'running',
    promptChars: (stub.prompt || '').length,
    outputChars: 0,
    estimatedTokens: 0,
    estimatedCost: 0,
    error: null,
    metadata: stub.metadata || {},
  };
  stmt('INSERT INTO agent_runs (id,agentName,prompt,source,timestamp,duration,status,promptChars,outputChars,estimatedTokens,estimatedCost,error,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.agentName, row.prompt, row.source, row.timestamp, row.duration, row.status, row.promptChars, row.outputChars, row.estimatedTokens, row.estimatedCost, row.error, JSON.stringify(row.metadata));
  return row;
}

// Update a stub run to its final state. Merges metadata (does NOT replace).
// Recomputes token + cost estimates from final output length.
function completeAgentRun(runId, patch = {}) {
  const existing = stmt('SELECT * FROM agent_runs WHERE id = ?').get(runId);
  if (!existing) return null;

  const estimateTokens = (text) => Math.ceil((text || '').length / 4);
  const estimateCost = (i, o) => (i * 3 + o * 15) / 1_000_000;
  const inputTokens = estimateTokens(existing.prompt || '');
  const outputTokens = estimateTokens(patch.output || '');

  const oldMeta = JSON.parse(existing.metadata || '{}');
  const mergedMeta = { ...oldMeta, ...(patch.metadataPatch || {}) };
  // Pillar 1: when the CLI returned real usage, record it on the row itself.
  if (patch.usage && (patch.usage.inputTokens != null || patch.usage.outputTokens != null)) {
    mergedMeta.realTokens = (patch.usage.inputTokens || 0) + (patch.usage.outputTokens || 0);
    if (patch.usage.costUsd != null) mergedMeta.realCostUsd = patch.usage.costUsd;
    if (patch.usage.model) mergedMeta.model = patch.usage.model;
  }

  const next = {
    duration: patch.duration ?? 0,
    status: patch.status || 'success',
    outputChars: (patch.output || '').length,
    estimatedTokens: inputTokens + outputTokens,
    estimatedCost: estimateCost(inputTokens, outputTokens),
    error: patch.error || null,
    metadata: JSON.stringify(mergedMeta),
  };

  stmt(`UPDATE agent_runs
           SET duration = ?, status = ?, outputChars = ?,
               estimatedTokens = ?, estimatedCost = ?, error = ?, metadata = ?
         WHERE id = ?`)
    .run(next.duration, next.status, next.outputChars, next.estimatedTokens,
         next.estimatedCost, next.error, next.metadata, runId);

  // Pillar 1 observability: one cost_logs row per run. REAL tokens when the CLI
  // returned usage (patch.usage), else the chars/4 estimate (estimated=1).
  try {
    const u = patch.usage;
    if (u && (u.inputTokens != null || u.outputTokens != null)) {
      logCost({ runId, agentName: existing.agentName, model: u.model || mergedMeta.model,
        inputTokens: u.inputTokens || 0, outputTokens: u.outputTokens || 0,
        costUsd: u.costUsd, estimated: false, source: existing.source });
    } else {
      logCost({ runId, agentName: existing.agentName, model: mergedMeta.model,
        inputTokens, outputTokens, costUsd: next.estimatedCost, estimated: true, source: existing.source });
    }
  } catch { /* never throw from finalizer */ }

  // Mirror agent-run failures into error_log so they show in the Logs page.
  if (next.status === 'error' || next.status === 'crashed' || (next.status === 'cancelled' && next.error)) {
    try {
      insertErrorLog({
        level: next.status === 'cancelled' ? 'warn' : 'error',
        source: 'server',
        category: 'agent-run',
        agent_id: existing.agentName,
        message: `agent_run ${next.status}: ${next.error || 'no detail'}`,
        stack: mergedMeta?.trace || null,
        duration_ms: next.duration,
        context: { runId, source: existing.source, status: next.status },
      });
    } catch { /* never throw from finalizer */ }
  }

  // Fire the same setImmediate event as insertAgentRun so listeners
  // (e.g. Mira post-build trigger) react on terminal completion.
  setImmediate(() => {
    try {
      const agentSync = require('./lib/agentSync');
      agentSync.events.emit('agent_run.recorded', {
        runId,
        agentName: existing.agentName,
        source: existing.source,
        status: next.status,
        timestamp: existing.timestamp,
      });
    } catch (err) {
      if (process.env.DEBUG_DB) console.warn('[db] completeAgentRun event emit failed:', err.message);
    }
  });

  return { ...existing, ...next, metadata: mergedMeta };
}

// Reconcile any 'running' rows left over from a crashed process. Safe to
// call multiple times — idempotent. Called from migration v17 on boot AND
// can be called manually for crash recovery testing.
function reconcileOrphanRuns() {
  const r = stmt(`
    UPDATE agent_runs
       SET status = 'crashed',
           error  = COALESCE(error, 'Server restarted during run')
     WHERE status = 'running'
  `).run();
  return { reconciled: r.changes };
}

function getRecentAgentRuns(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  return stmt('SELECT * FROM agent_runs WHERE timestamp >= ? ORDER BY timestamp DESC').all(cutoff).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

// ── Learning Loop: VS Code sessions + review inbox (migration v24) ───────────
// Two tables behind the "auto-learn from every VS Code project" feature:
//   vscode_session   — one row per closed VS Code session (SessionEnd hook),
//                      consumed nightly by the sys-learning-digest cron.
//   learning_inbox   — staged candidate lessons/bugs/decisions/feedback awaiting
//                      one-click Approve/Reject in the Polyglot "Learning" page.
function learningLoopMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vscode_session (
      sessionId       TEXT PRIMARY KEY,
      project         TEXT,
      projectPath     TEXT,
      transcriptPath  TEXT,
      turnCount       INTEGER DEFAULT 0,
      toolUseCount    INTEGER DEFAULT 0,
      editCount       INTEGER DEFAULT 0,
      bashCount       INTEGER DEFAULT 0,
      transcriptBytes INTEGER DEFAULT 0,
      endReason       TEXT,
      endedAt         TEXT,
      status          TEXT NOT NULL DEFAULT 'pending_digest',
      createdAt       TEXT NOT NULL,
      metadata        TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_vscode_session_status ON vscode_session(status, createdAt DESC);

    CREATE TABLE IF NOT EXISTS learning_inbox (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      title        TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      source       TEXT,
      sessionId    TEXT,
      project      TEXT,
      confidence   REAL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'pending',
      createdAt    TEXT NOT NULL,
      reviewedAt   TEXT,
      capturedRef  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_learning_inbox_status  ON learning_inbox(status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_learning_inbox_session ON learning_inbox(sessionId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_inbox_dedup ON learning_inbox(sessionId, type, title);
  `);
  console.log('[migration v24] learning_loop: vscode_session + learning_inbox tables created');
}

// ── VS Code sessions ────────────────────────────────────────────────────────

function insertVscodeSession(s) {
  stmt(`INSERT OR REPLACE INTO vscode_session
    (sessionId,project,projectPath,transcriptPath,turnCount,toolUseCount,editCount,bashCount,transcriptBytes,endReason,endedAt,status,createdAt,metadata)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(s.sessionId, s.project || null, s.projectPath || null, s.transcriptPath || null,
      s.turnCount || 0, s.toolUseCount || 0, s.editCount || 0, s.bashCount || 0, s.transcriptBytes || 0,
      s.endReason || null, s.endedAt || null, s.status || 'pending_digest',
      s.createdAt || new Date().toISOString(), JSON.stringify(s.metadata || {}));
}

function getPendingVscodeSessions(hours = 24, limit = 50) {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  return stmt(`SELECT * FROM vscode_session WHERE status = 'pending_digest' AND createdAt >= ?
    ORDER BY createdAt DESC LIMIT ?`).all(cutoff, limit)
    .map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

function markVscodeSessionsDigested(ids = []) {
  if (!ids.length) return 0;
  const q = stmt(`UPDATE vscode_session SET status = 'digested' WHERE sessionId = ?`);
  const tx = getDb().transaction((list) => { let n = 0; for (const id of list) n += q.run(id).changes; return n; });
  return tx(ids);
}

// Agent runs belonging to one VS Code session — joined via metadata.sessionId
// (the SubagentStop hook stamps it) with a time-window fallback handled by callers.
function getAgentRunsBySession(sessionId) {
  return stmt(`SELECT * FROM agent_runs WHERE json_extract(metadata,'$.sessionId') = ? ORDER BY timestamp ASC`)
    .all(sessionId).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

// ── Learning inbox (review queue) ───────────────────────────────────────────

// INSERT OR IGNORE so a re-digested session can't create duplicate candidates
// (UNIQUE(sessionId,type,title)). Returns { id, inserted }.
function insertLearningCandidate(c) {
  const id = c.id || `cand-${Date.now()}-${require('crypto').randomUUID().slice(0, 8)}`;
  const info = stmt(`INSERT OR IGNORE INTO learning_inbox
    (id,type,title,payload,source,sessionId,project,confidence,status,createdAt,reviewedAt,capturedRef)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, c.type, (c.title || '').slice(0, 200), JSON.stringify(c.payload || {}),
      c.source || 'vscode-session', c.sessionId || null, c.project || null,
      Number.isFinite(c.confidence) ? c.confidence : 0,
      c.status || 'pending', c.createdAt || new Date().toISOString(),
      c.reviewedAt || null, c.capturedRef || null);
  return { id, inserted: info.changes > 0 };
}

function listLearningInbox({ status, sessionId, project, limit = 200 } = {}) {
  const where = [];
  const args = [];
  if (status) { const parts = String(status).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) { where.push(`status IN (${parts.map(() => '?').join(',')})`); args.push(...parts); } }
  if (sessionId) { where.push('sessionId = ?'); args.push(sessionId); }
  if (project) { where.push('project = ?'); args.push(project); }
  const sql = `SELECT * FROM learning_inbox ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY createdAt DESC LIMIT ?`;
  args.push(limit);
  return getDb().prepare(sql).all(...args).map(r => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
}

function getLearningCandidate(id) {
  const r = stmt('SELECT * FROM learning_inbox WHERE id = ?').get(id);
  return r ? { ...r, payload: JSON.parse(r.payload || '{}') } : null;
}

// Guarded so a double-approve / double-reject is a no-op (returns changed:0).
function updateLearningStatus(id, { status, capturedRef = null, reviewedAt } = {}) {
  const info = stmt(`UPDATE learning_inbox SET status = ?, capturedRef = COALESCE(?, capturedRef), reviewedAt = ?
    WHERE id = ? AND status NOT IN ('approved','rejected')`)
    .run(status, capturedRef, reviewedAt || new Date().toISOString(), id);
  return { changed: info.changes };
}

// Edit a candidate's title/payload while still pending.
function updateLearningPayload(id, { title, payload } = {}) {
  const cur = getLearningCandidate(id);
  if (!cur || cur.status !== 'pending') return { changed: 0 };
  const info = stmt('UPDATE learning_inbox SET title = ?, payload = ? WHERE id = ? AND status = ?')
    .run((title ?? cur.title).slice(0, 200), JSON.stringify(payload ?? cur.payload), id, 'pending');
  return { changed: info.changes };
}

function getInboxCounts() {
  const rows = stmt(`SELECT status, COUNT(*) AS n FROM learning_inbox GROUP BY status`).all();
  const out = { pending: 0, approved: 0, rejected: 0, auto: 0 };
  for (const r of rows) if (r.status in out) out[r.status] = r.n;
  return out;
}

function pruneLearningInbox({ rejectedDays = 14, autoDays = 30 } = {}) {
  const db = getDb();
  const rejectedPruned = db.prepare(
    `DELETE FROM learning_inbox WHERE status = 'rejected' AND createdAt < datetime('now', '-' || ? || ' days')`
  ).run(rejectedDays).changes;
  const autoPruned = db.prepare(
    `DELETE FROM learning_inbox WHERE status = 'auto' AND createdAt < datetime('now', '-' || ? || ' days')`
  ).run(autoDays).changes;
  return { rejectedPruned, autoPruned };
}

// ── Run History ─────────────────────────────────────────────────────────────

function loadRunHistory(limit = 500) {
  return stmt('SELECT * FROM run_history ORDER BY startedAt DESC LIMIT ?').all(limit).map(parseRunHistory);
}

function insertRunHistory(run) {
  stmt('INSERT OR REPLACE INTO run_history (id,orchestrationName,orchestrationId,task,status,nodeCount,nodes,edges,logs,nodeOutputs,finalOutput,startedAt,completedAt,duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(run.id, run.orchestrationName, run.orchestrationId, run.task, run.status, run.nodeCount, JSON.stringify(run.nodes || []), JSON.stringify(run.edges || []), JSON.stringify(run.logs || []), JSON.stringify(run.nodeOutputs || {}), run.finalOutput, run.startedAt, run.completedAt, run.duration);
}

function deleteRunHistory(id) {
  stmt('DELETE FROM run_history WHERE id = ?').run(id);
}

function clearRunHistory() {
  getDb().exec('DELETE FROM run_history');
}

function parseRunHistory(r) {
  return { ...r, nodes: JSON.parse(r.nodes || '[]'), edges: JSON.parse(r.edges || '[]'), logs: JSON.parse(r.logs || '[]'), nodeOutputs: JSON.parse(r.nodeOutputs || '{}') };
}

// ── Orchestrations ──────────────────────────────────────────────────────────

function loadOrchestrations() {
  return stmt('SELECT * FROM orchestrations ORDER BY updatedAt DESC').all().map(o => ({ ...o, nodes: JSON.parse(o.nodes || '[]'), edges: JSON.parse(o.edges || '[]') }));
}

function saveOrchestration(orc) {
  stmt('INSERT OR REPLACE INTO orchestrations (id,name,nodes,edges,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .run(orc.id, orc.name, JSON.stringify(orc.nodes || []), JSON.stringify(orc.edges || []), orc.createdAt, orc.updatedAt || new Date().toISOString());
}

function deleteOrchestration(id) {
  // Transactional cascade (C-db audit): orchestration FKs use ON DELETE NO ACTION,
  // so with foreign_keys=ON a bare delete throws if any run/step references the
  // orchestration. Delete children first, then the parent, atomically.
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM orchestration_steps WHERE runId IN (SELECT id FROM orchestration_runs WHERE orchestrationId = ?)').run(id);
    db.prepare('DELETE FROM orchestration_runs WHERE orchestrationId = ?').run(id);
    db.prepare('DELETE FROM orchestrations WHERE id = ?').run(id);
  })();
}

// ── Schedules ───────────────────────────────────────────────────────────────

function loadSchedules() {
  return stmt('SELECT * FROM schedules ORDER BY createdAt DESC').all().map(s => ({ ...s, enabled: !!s.enabled, cronExpression: s.cron }));
}

function saveSchedules(list) {
  const db = getDb();
  const s = db.prepare('INSERT INTO schedules (id,name,agentName,prompt,cron,enabled,lastRunAt,lastRunStatus,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM schedules');
    for (const r of list) s.run(r.id, r.name, r.agentName, r.prompt, r.cron || r.cronExpression, r.enabled ? 1 : 0, r.lastRunAt || r.lastRun, r.lastRunStatus, r.createdAt, r.updatedAt);
  })();
}

function insertSchedule(r) {
  stmt('INSERT INTO schedules (id,name,agentName,prompt,cron,enabled,lastRunAt,lastRunStatus,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(r.id, r.name, r.agentName, r.prompt, r.cron || r.cronExpression, r.enabled ? 1 : 0, r.lastRunAt || null, r.lastRunStatus || null, r.createdAt, r.updatedAt);
}

function updateScheduleFields(id, fields) {
  const allowed = ['name', 'agentName', 'prompt', 'cron', 'enabled', 'updatedAt'];
  const sets = [];
  const args = [];
  for (const k of allowed) {
    if (fields[k] === undefined) continue;
    sets.push(`${k} = ?`);
    args.push(k === 'enabled' ? (fields[k] ? 1 : 0) : fields[k]);
  }
  if (!sets.length) return null;
  args.push(id);
  stmt(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return stmt('SELECT * FROM schedules WHERE id = ?').get(id);
}

function updateScheduleRunStatus(id, lastRunAt, lastRunStatus) {
  stmt('UPDATE schedules SET lastRunAt = ?, lastRunStatus = ? WHERE id = ?').run(lastRunAt, lastRunStatus, id);
}

function deleteScheduleById(id) {
  stmt('DELETE FROM schedules WHERE id = ?').run(id);
}

function getScheduleById(id) {
  const row = stmt('SELECT * FROM schedules WHERE id = ?').get(id);
  return row ? { ...row, enabled: !!row.enabled, cronExpression: row.cron } : null;
}

// ── System schedule overrides ──────────────────────────────────────────────

function loadSystemOverrides() {
  const rows = stmt('SELECT * FROM system_schedule_overrides').all();
  const out = {};
  for (const r of rows) out[r.id] = { enabled: !!r.enabled, updatedAt: r.updatedAt };
  return out;
}

function getSystemOverride(id) {
  const r = stmt('SELECT * FROM system_schedule_overrides WHERE id = ?').get(id);
  return r ? { id: r.id, enabled: !!r.enabled, updatedAt: r.updatedAt } : null;
}

function upsertSystemOverride(id, enabled) {
  const ts = new Date().toISOString();
  stmt(`INSERT INTO system_schedule_overrides (id, enabled, updatedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updatedAt = excluded.updatedAt`)
    .run(id, enabled ? 1 : 0, ts);
  return { id, enabled: !!enabled, updatedAt: ts };
}

// Last N runs for a given schedule id (works for both user schedules — via
// metadata.scheduleId — and system schedules — via metadata.systemId).
// JSON1 extension ships with better-sqlite3 by default; json_extract is safe.
function getScheduleRunsFor(scheduleId, { limit = 50 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  return stmt(`
    SELECT * FROM agent_runs
    WHERE json_extract(metadata, '$.scheduleId') = ?
       OR json_extract(metadata, '$.systemId')   = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(scheduleId, scheduleId, lim).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

// ── Webhooks ────────────────────────────────────────────────────────────────

function loadWebhooks() {
  return stmt('SELECT * FROM webhooks ORDER BY createdAt DESC').all().map(w => ({ ...w, enabled: !!w.enabled }));
}

function saveWebhooks(list) {
  const db = getDb();
  const s = db.prepare('INSERT INTO webhooks (id,name,agentName,prompt,secret,enabled,lastUsedAt,createdAt) VALUES (?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM webhooks');
    for (const w of list) s.run(w.id, w.name, w.agentName, w.prompt, w.secret, w.enabled ? 1 : 0, w.lastUsedAt, w.createdAt);
  })();
}

// ── Chat History ────────────────────────────────────────────────────────────

function loadChatHistory() {
  const sessions = stmt('SELECT cs.*, COUNT(cm.rowid) as messageCount FROM chat_sessions cs LEFT JOIN chat_messages cm ON cm.sessionId = cs.id GROUP BY cs.id ORDER BY cs.updatedAt DESC').all();
  return sessions.map(s => {
    const messages = stmt('SELECT role, content, timestamp FROM chat_messages WHERE sessionId = ? ORDER BY rowid').all(s.id);
    return { id: s.id, title: s.title, createdAt: s.createdAt, updatedAt: s.updatedAt, messages };
  });
}

function saveChatHistory(history) {
  const db = getDb();
  const ss = db.prepare('INSERT INTO chat_sessions (id,title,createdAt,updatedAt) VALUES (?,?,?,?)');
  const ms = db.prepare('INSERT INTO chat_messages (sessionId,role,content,timestamp) VALUES (?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM chat_messages; DELETE FROM chat_sessions;');
    for (const s of history) {
      ss.run(s.id, s.title, s.createdAt, s.updatedAt);
      for (const m of (s.messages || [])) ms.run(s.id, m.role, m.content, m.timestamp);
    }
  })();
}

// ── Playground History ──────────────────────────────────────────────────────

function loadPlaygroundHistory(limit = 100) {
  return stmt('SELECT * FROM playground_history ORDER BY timestamp DESC LIMIT ?').all(limit).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

function savePlaygroundHistory(list) {
  const db = getDb();
  const s = db.prepare('INSERT INTO playground_history (id,agentName,prompt,output,duration,status,error,rating,feedback,timestamp,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM playground_history');
    for (const r of list) s.run(r.id, r.agentName, r.prompt, r.output, r.duration, r.status, r.error, r.rating, r.feedback, r.timestamp, JSON.stringify(r.metadata || {}));
  })();
}

// ── Pending Approvals ───────────────────────────────────────────────────────

function loadApprovals() {
  return stmt('SELECT * FROM pending_approvals').all();
}

function saveApprovals(list) {
  const db = getDb();
  const s = db.prepare('INSERT INTO pending_approvals (key,runId,nodeId,nodeLabel,createdAt,timeoutMinutes) VALUES (?,?,?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM pending_approvals');
    for (const a of list) s.run(a.key, a.runId, a.nodeId, a.nodeLabel, a.createdAt, a.timeoutMinutes || 60);
  })();
}

// ── Memory Audit Log ────────────────────────────────────────────────────────

function loadAuditLog(limit = 5000) {
  return stmt('SELECT * FROM memory_audit_log ORDER BY timestamp DESC LIMIT ?').all(limit).map(e => ({
    ...e,
    diff: e.diff ? JSON.parse(e.diff) : null,
    frontmatter: e.frontmatter ? JSON.parse(e.frontmatter) : null,
  }));
}

function saveAuditLog(entries) {
  const db = getDb();
  const s = db.prepare('INSERT OR IGNORE INTO memory_audit_log (id,timestamp,action,path,linesAdded,linesRemoved,sizeBefore,sizeAfter,diff,contentSnapshot,fromPath,toPath,frontmatter) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    db.exec('DELETE FROM memory_audit_log');
    for (const e of entries) s.run(e.id, e.timestamp, e.action, e.path, e.linesAdded, e.linesRemoved, e.sizeBefore, e.sizeAfter, e.diff ? JSON.stringify(e.diff) : null, e.contentSnapshot, e.fromPath, e.toPath, e.frontmatter ? JSON.stringify(e.frontmatter) : null);
  })();
}

// ── Training Corrections ────────────────────────────────────────────────────

function loadTraining(agentName) {
  const key = agentName.replace(/\s.*$/, '').toLowerCase();
  return stmt('SELECT * FROM training_corrections WHERE agentName = ? OR agentName = ? ORDER BY timestamp DESC').all(agentName, key).map(r => ({ ...r, ...JSON.parse(r.extra || '{}') }));
}

function saveTraining(agentName, data) {
  const db = getDb();
  const key = agentName.replace(/\s.*$/, '').toLowerCase();
  db.prepare('DELETE FROM training_corrections WHERE agentName = ? OR agentName = ?').run(agentName, key);
  const s = db.prepare('INSERT INTO training_corrections (id,agentName,timestamp,issue,correction,status,extra) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (const d of data) {
      const { id, timestamp, issue, correction, status, ...rest } = d;
      s.run(id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), agentName, timestamp, issue, correction, status, JSON.stringify(rest));
    }
  })();
}

// ── Singleton Config Tables ─────────────────────────────────────────────────

function loadSingleton(table) {
  const row = getDb().prepare(`SELECT data FROM ${table} WHERE id = 1`).get();
  return row ? JSON.parse(row.data) : {};
}

function saveSingleton(table, data) {
  getDb().prepare(`UPDATE ${table} SET data = ? WHERE id = 1`).run(JSON.stringify(data));
}

function loadConfig() { return loadSingleton('config'); }
function saveConfig(data) { saveSingleton('config', data); }
function loadGoals() { return loadSingleton('goals'); }
function saveGoals(data) { saveSingleton('goals', data); }
function loadRecommendations() { return loadSingleton('recommendations'); }
function saveRecommendations(data) { saveSingleton('recommendations', data); }
function loadModelRouting() { return loadSingleton('model_routing'); }
function saveModelRouting(data) { saveSingleton('model_routing', data); }
function loadAgentLearning() { return loadSingleton('agent_learning'); }
function saveAgentLearning(data) { saveSingleton('agent_learning', data); }
function loadClaims() { return loadSingleton('claims_store'); }
function saveClaims(data) { saveSingleton('claims_store', data); }
function loadAntipatternSigs() { return loadSingleton('antipattern_sigs'); }
function saveAntipatternSigs(data) { saveSingleton('antipattern_sigs', data); }
function loadSkillIndex() { return loadSingleton('skill_index_store'); }
function saveSkillIndex(data) { saveSingleton('skill_index_store', data); }
function loadExperienceWeights() { return loadSingleton('experience_weights'); }
function saveExperienceWeights(data) { saveSingleton('experience_weights', data); }
function loadDispatchPolicy() { return loadSingleton('dispatch_policy'); }
function saveDispatchPolicy(data) { saveSingleton('dispatch_policy', data); }

// ── app_config CRUD ───────────────────────────────────────────────────────
// Values are stored as TEXT (JSON-serialized) so number/object/array all work.
function getConfigValue(key) {
  const row = getDb().prepare(`SELECT value FROM app_config WHERE key = ?`).get(key);
  if (!row) return undefined;
  try { return JSON.parse(row.value); }
  catch { return row.value; }
}

function getConfigRow(key) {
  return getDb().prepare(`SELECT key, value, category, description, updated_at FROM app_config WHERE key = ?`).get(key);
}

function getAllConfig(category = null) {
  const stmt = category
    ? getDb().prepare(`SELECT key, value, category, description, updated_at FROM app_config WHERE category = ? ORDER BY key`)
    : getDb().prepare(`SELECT key, value, category, description, updated_at FROM app_config ORDER BY category, key`);
  const rows = category ? stmt.all(category) : stmt.all();
  return rows.map((r) => ({
    key: r.key,
    value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(),
    category: r.category,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

function upsertConfig({ key, value, category, description = null }) {
  const serialized = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO app_config (key, value, category, description, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      category = excluded.category,
      description = COALESCE(excluded.description, app_config.description),
      updated_at = excluded.updated_at
  `).run(key, serialized, category, description, now);
}

function appendConfigAudit({ key, before, after, source = 'api' }) {
  const now = new Date().toISOString();
  const beforeJson = before === undefined ? null : JSON.stringify(before);
  const afterJson = after === undefined ? null : JSON.stringify(after);
  getDb().prepare(`
    INSERT INTO config_audit (key, before, after, changed_at, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, beforeJson, afterJson, now, source);
}

function getConfigAudit({ key = null, limit = 50 } = {}) {
  const stmt = key
    ? getDb().prepare(`SELECT id, key, before, after, changed_at, source FROM config_audit WHERE key = ? ORDER BY changed_at DESC LIMIT ?`)
    : getDb().prepare(`SELECT id, key, before, after, changed_at, source FROM config_audit ORDER BY changed_at DESC LIMIT ?`);
  const rows = key ? stmt.all(key, limit) : stmt.all(limit);
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    before: r.before === null ? null : (() => { try { return JSON.parse(r.before); } catch { return r.before; } })(),
    after: r.after === null ? null : (() => { try { return JSON.parse(r.after); } catch { return r.after; } })(),
    changedAt: r.changed_at,
    source: r.source,
  }));
}

// ── pods CRUD ─────────────────────────────────────────────────────────────
function listPods() {
  return getDb().prepare(`SELECT id, prefix, department, description FROM pods ORDER BY id`).all();
}

function upsertPod({ id, prefix, department = null, description = null }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO pods (id, prefix, department, description, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      prefix = excluded.prefix,
      department = excluded.department,
      description = excluded.description,
      updated_at = excluded.updated_at
  `).run(id, prefix, department, description, now);
}

function deletePod(id) {
  getDb().prepare(`DELETE FROM pods WHERE id = ?`).run(id);
}

// ── models CRUD ───────────────────────────────────────────────────────────
function listModels() {
  return getDb().prepare(`SELECT id, display_name, tier, cost_penalty, enabled FROM models ORDER BY tier, id`).all();
}

function getModel(id) {
  return getDb().prepare(`SELECT id, display_name, tier, cost_penalty, enabled FROM models WHERE id = ?`).get(id);
}

function upsertModel({ id, displayName, tier, costPenalty, enabled = 1 }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO models (id, display_name, tier, cost_penalty, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      tier = excluded.tier,
      cost_penalty = excluded.cost_penalty,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(id, displayName, tier, costPenalty, enabled, now);
}

// ── model_policy CRUD ─────────────────────────────────────────────────────
function listModelPolicy() {
  const rows = getDb().prepare(`
    SELECT id, pattern, model, tier, agents_json, priority, enabled
    FROM model_policy WHERE enabled = 1 ORDER BY priority DESC, id
  `).all();
  return rows.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    model: r.model,
    tier: r.tier,
    agents: r.agents_json ? (() => { try { return JSON.parse(r.agents_json); } catch { return []; } })() : [],
    priority: r.priority,
    enabled: !!r.enabled,
  }));
}

function insertModelPolicy({ pattern, model, tier, agents = [], priority = 0, enabled = 1 }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT INTO model_policy (pattern, model, tier, agents_json, priority, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pattern, model, tier, JSON.stringify(agents), priority, enabled, now);
}

function clearModelPolicy() {
  getDb().prepare(`DELETE FROM model_policy`).run();
}

// ── Org: Registry (agents table) ────────────────────────────────────────────

function loadRegistry() {
  const agents = {};
  for (const row of stmt('SELECT * FROM agents').all()) {
    const extra = JSON.parse(row.extra || '{}');
    let tags = {};
    try { tags = row.tags ? JSON.parse(row.tags) : {}; } catch {}
    agents[row.id] = {
      ...row,
      breakdown: JSON.parse(row.breakdown || '{}'),
      stats: JSON.parse(row.stats || '{}'),
      skills: JSON.parse(row.skills || '{}'),
      pip: row.pip ? JSON.parse(row.pip) : null,
      tags,
      squad: row.squad || null,
      avatar: row.avatar || null,
      gender: row.gender || null,
      canMentor: extra.canMentor,
      canShipProd: extra.canShipProd,
      levelColor: extra.levelColor,
      weaknesses: extra.weaknesses,
      computedAt: extra.computedAt,
    };
    delete agents[row.id].extra;
  }
  return { version: 2, orgStructureVersion: 2, agents, updatedAt: new Date().toISOString() };
}

function saveRegistry(data) {
  if (!data || !data.agents) return;
  const db = getDb();
  const s = db.prepare(`INSERT OR REPLACE INTO agents
    (id,name,description,department,subDepartment,pod,phase,reportsTo,secondaryReportsTo,title,tier,role,model,hiredAt,status,level,levelTitle,yearsOfExperience,experiencePoints,progressToNext,nextLevelTitle,lastPromoted,lastReview,retiredAt,retiredReason,breakdown,stats,skills,pip,tags,squad,avatar,gender,extra,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (const [id, a] of Object.entries(data.agents)) {
      s.run(
        id, a.name, a.description,
        a.department, a.subDepartment || null, a.pod || null,
        a.phase, a.reportsTo, a.secondaryReportsTo || null,
        a.title, a.tier, a.role, a.model, a.hiredAt, a.status,
        a.level, a.levelTitle, a.yearsOfExperience, a.experiencePoints, a.progressToNext, a.nextLevelTitle,
        a.lastPromoted, a.lastReview, a.retiredAt, a.retiredReason,
        JSON.stringify(a.breakdown || {}), JSON.stringify(a.stats || {}), JSON.stringify(a.skills || {}),
        a.pip ? JSON.stringify(a.pip) : null,
        JSON.stringify(a.tags || {}),
        a.squad || null,
        a.avatar || null,
        a.gender || null,
        JSON.stringify({ canMentor: a.canMentor, canShipProd: a.canShipProd, levelColor: a.levelColor, weaknesses: a.weaknesses, computedAt: a.computedAt }),
        a.updatedAt || new Date().toISOString(),
      );
    }
  })();
  _invalidateOrg();
}

// ── Registry History (undo + audit) ─────────────────────────────────────────

function logHistory({ agent_id, action, prior_state, new_state, patch, actor, batch_id }) {
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO registry_history (agent_id, action, prior_state, new_state, patch, actor, batch_id)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    agent_id, action,
    prior_state ? JSON.stringify(prior_state) : null,
    new_state ? JSON.stringify(new_state) : null,
    patch ? JSON.stringify(patch) : null,
    actor || 'admin',
    batch_id || null,
  );
  return r.lastInsertRowid;
}

function getHistory(id) {
  const r = getDb().prepare('SELECT * FROM registry_history WHERE id = ?').get(id);
  if (!r) return null;
  return {
    ...r,
    prior_state: r.prior_state ? JSON.parse(r.prior_state) : null,
    new_state: r.new_state ? JSON.parse(r.new_state) : null,
    patch: r.patch ? JSON.parse(r.patch) : null,
    undone: !!r.undone,
  };
}

function listHistory({ limit = 50, agentId = null, batchId = null } = {}) {
  let sql = 'SELECT id, agent_id, action, patch, actor, batch_id, undone, created_at FROM registry_history';
  const params = [];
  const where = [];
  if (agentId)  { where.push('agent_id = ?'); params.push(agentId); }
  if (batchId)  { where.push('batch_id = ?'); params.push(batchId); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(r => ({
    ...r,
    patch: r.patch ? JSON.parse(r.patch) : null,
    undone: !!r.undone,
  }));
}

function markHistoryUndone(id) {
  getDb().prepare("UPDATE registry_history SET undone = 1, undone_at = datetime('now') WHERE id = ?").run(id);
}

function listBatchHistory(batchId) {
  return getDb().prepare(`
    SELECT * FROM registry_history WHERE batch_id = ? ORDER BY id ASC
  `).all(batchId).map(r => ({
    ...r,
    prior_state: r.prior_state ? JSON.parse(r.prior_state) : null,
    new_state: r.new_state ? JSON.parse(r.new_state) : null,
    patch: r.patch ? JSON.parse(r.patch) : null,
    undone: !!r.undone,
  }));
}

// ── Org: Departments ────────────────────────────────────────────────────────

function loadDepartments() {
  const departments = {};
  for (const d of stmt('SELECT * FROM departments').all()) {
    let subDepartments = {};
    try { subDepartments = d.sub_departments ? JSON.parse(d.sub_departments) : {}; } catch {}
    let replacedBy = null;
    try { replacedBy = d.replaced_by ? JSON.parse(d.replaced_by) : null; } catch {}
    departments[d.id] = {
      ...d,
      order: d.sort_order,
      active: !!d.active,
      subDepartments,
      replacedBy,
      deprecatedAt: d.deprecated_at || null,
    };
    delete departments[d.id].sort_order;
    delete departments[d.id].sub_departments;
    delete departments[d.id].replaced_by;
    delete departments[d.id].deprecated_at;
  }
  const phases = {};
  for (const p of stmt('SELECT * FROM phases').all()) {
    phases[p.id] = { ...p, order: p.sort_order };
    delete phases[p.id].sort_order;
  }
  return { departments, phases };
}

function saveDepartments(data) {
  const db = getDb();
  if (data.departments) {
    db.exec('DELETE FROM departments');
    const s = db.prepare(`INSERT INTO departments
      (id,label,description,head,color,icon,sort_order,active,sub_departments,replaced_by,deprecated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => {
      for (const d of Object.values(data.departments)) {
        s.run(
          d.id, d.label, d.description, d.head, d.color, d.icon,
          d.order || 0,
          d.active !== false ? 1 : 0,
          JSON.stringify(d.subDepartments || {}),
          d.replacedBy ? JSON.stringify(d.replacedBy) : null,
          d.deprecatedAt || null,
        );
      }
    })();
  }
  if (data.phases) {
    db.exec('DELETE FROM phases');
    const s = db.prepare('INSERT INTO phases (id,label,description,color,sort_order) VALUES (?,?,?,?,?)');
    db.transaction(() => {
      for (const p of Object.values(data.phases)) s.run(p.id, p.label, p.description, p.color, p.order || 0);
    })();
  }
  _invalidateOrg();
}

// ── Witness Log (HR) ────────────────────────────────────────────────────────

function appendWitnessEvent(entry) {
  const { t, agent, runId, class: cls, durationMs, taskType, project, ...rest } = entry;
  stmt('INSERT INTO witness_log (t,agent,runId,class,durationMs,taskType,project,extra) VALUES (?,?,?,?,?,?,?,?)')
    .run(t, agent, runId, cls, durationMs, taskType, project, JSON.stringify(rest));
}

function getWitnessLog({ agent, days = 30, limit = 500 } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  if (agent) {
    return stmt('SELECT * FROM witness_log WHERE agent = ? AND t >= ? ORDER BY t DESC LIMIT ?').all(agent, cutoff, limit).map(parseWitnessRow);
  }
  return stmt('SELECT * FROM witness_log WHERE t >= ? ORDER BY t DESC LIMIT ?').all(cutoff, limit).map(parseWitnessRow);
}

function parseWitnessRow(r) {
  const extra = JSON.parse(r.extra || '{}');
  return { t: r.t, agent: r.agent, runId: r.runId, class: r.class, durationMs: r.durationMs, taskType: r.taskType, project: r.project, ...extra };
}

// ── Daily Scores (HR) ───────────────────────────────────────────────────────

function appendDailyScore(score) {
  stmt('INSERT OR REPLACE INTO daily_scores (agent,date,success,failure,antipattern,regression,score) VALUES (?,?,?,?,?,?,?)')
    .run(score.agent, score.date, score.success, score.failure, score.antipattern, score.regression, score.score);
}

function getDailyScores({ agent, days = 30 } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  if (agent) {
    return stmt('SELECT * FROM daily_scores WHERE agent = ? AND date >= ? ORDER BY date DESC').all(agent, cutoff);
  }
  return stmt('SELECT * FROM daily_scores WHERE date >= ? ORDER BY date DESC').all(cutoff);
}

// ── Capability Gaps (HR) ────────────────────────────────────────────────────

function appendCapabilityGap(gap) {
  stmt('INSERT INTO capability_gaps (t,brief,inferredSkills,gaps,bestAgent,topScore,canHandle,recommendation) VALUES (?,?,?,?,?,?,?,?)')
    .run(gap.t, gap.brief, JSON.stringify(gap.inferredSkills || []), JSON.stringify(gap.gaps || []), gap.bestAgent, gap.topScore, gap.canHandle ? 1 : 0, gap.recommendation);
}

function getRecentGaps(limit = 100) {
  return stmt('SELECT * FROM capability_gaps ORDER BY t DESC LIMIT ?').all(limit).map(g => ({
    ...g, inferredSkills: JSON.parse(g.inferredSkills || '[]'), gaps: JSON.parse(g.gaps || '[]'), canHandle: !!g.canHandle,
  }));
}

// ── Training Queue (HR) ─────────────────────────────────────────────────────

function getTrainingQueue() {
  const items = stmt('SELECT * FROM training_queue ORDER BY queuedAt DESC').all();
  return { version: 1, updatedAt: new Date().toISOString(), items };
}

function saveTrainingQueue(data) {
  const db = getDb();
  db.exec('DELETE FROM training_queue');
  if (!data || !data.items) return;
  const s = db.prepare('INSERT INTO training_queue (id,agent,skill,reason,priority,status,queuedAt,completedAt) VALUES (?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (const i of data.items) s.run(i.id, i.agent, i.skill, i.reason, i.priority, i.status, i.queuedAt, i.completedAt);
  })();
}

// ── Reviews (HR) ────────────────────────────────────────────────────────────

function getLatestReview() {
  const row = stmt('SELECT * FROM reviews ORDER BY reviewedAt DESC LIMIT 1').get();
  return row ? { ...JSON.parse(row.data || '{}'), week: row.week } : null;
}

function saveReview(week, data) {
  stmt('INSERT OR REPLACE INTO reviews (week,reviewedAt,director,data) VALUES (?,?,?,?)')
    .run(week, data.reviewedAt, data.director, JSON.stringify(data));
}

// ── Project Conversations ───────────────────────────────────────────────────

function loadProjectConversations(projectId) {
  return stmt('SELECT pc.*, COUNT(pcm.rowid) as messageCount FROM project_conversations pc LEFT JOIN project_conversation_messages pcm ON pcm.conversationId = pc.id WHERE pc.projectId = ? GROUP BY pc.id ORDER BY pc.updatedAt DESC').all(projectId);
}

function saveProjectConversations(projectId, list) {
  const db = getDb();
  // Delete existing conversations + messages for this project
  const existing = db.prepare('SELECT id FROM project_conversations WHERE projectId = ?').all(projectId);
  for (const e of existing) {
    db.prepare('DELETE FROM project_conversation_messages WHERE conversationId = ?').run(e.id);
  }
  db.prepare('DELETE FROM project_conversations WHERE projectId = ?').run(projectId);
  // Insert new
  const cs = db.prepare('INSERT INTO project_conversations (id,projectId,title,agentName,createdAt,updatedAt) VALUES (?,?,?,?,?,?)');
  const ms = db.prepare('INSERT INTO project_conversation_messages (conversationId,role,content,timestamp) VALUES (?,?,?,?)');
  db.transaction(() => {
    for (const c of list) {
      cs.run(c.id, projectId, c.title, c.agentName, c.createdAt, c.updatedAt);
      for (const m of (c.messages || [])) ms.run(c.id, m.role, m.content, m.timestamp);
    }
  })();
}

function getProjectConversation(projectId, conversationId) {
  const convo = stmt('SELECT * FROM project_conversations WHERE id = ? AND projectId = ?').get(conversationId, projectId);
  if (!convo) return null;
  convo.messages = stmt('SELECT role, content, timestamp FROM project_conversation_messages WHERE conversationId = ? ORDER BY rowid').all(conversationId);
  return convo;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE LOG — auto-snapshot before every write for revert capability
// ═══════════════════════════════════════════════════════════════════════════

function createChangeLog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_change_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tableName  TEXT NOT NULL,
      rowKey     TEXT NOT NULL,
      action     TEXT NOT NULL,
      oldData    TEXT,
      newData    TEXT,
      changedAt  TEXT NOT NULL DEFAULT (datetime('now')),
      reverted   INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_change_log_table ON db_change_log(tableName);
    CREATE INDEX IF NOT EXISTS idx_change_log_time ON db_change_log(changedAt DESC);
  `);
}

function logChange(tableName, rowKey, action, oldData, newData) {
  stmt('INSERT INTO db_change_log (tableName, rowKey, action, oldData, newData, changedAt) VALUES (?,?,?,?,?,?)')
    .run(tableName, String(rowKey), action, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null, new Date().toISOString());
}

function getChanges(tableName, limit = 100) {
  if (tableName) {
    return stmt('SELECT * FROM db_change_log WHERE tableName = ? ORDER BY changedAt DESC LIMIT ?').all(tableName, limit).map(parseChange);
  }
  return stmt('SELECT * FROM db_change_log ORDER BY changedAt DESC LIMIT ?').all(limit).map(parseChange);
}

function parseChange(r) {
  return {
    ...r,
    oldData: r.oldData ? JSON.parse(r.oldData) : null,
    newData: r.newData ? JSON.parse(r.newData) : null,
    reverted: !!r.reverted,
  };
}

function getPrimaryKeyColumn(tableName) {
  const info = getDb().prepare(`PRAGMA table_info("${tableName}")`).all();
  const pk = info.find(c => c.pk === 1);
  return pk ? pk.name : null;
}

// Real column names for a table. Used to whitelist update keys so a crafted
// req.body key cannot break out of the quoted-identifier in a SET clause
// (C5 audit — SQL identifier injection).
function getColumnSet(tableName) {
  return new Set(getDb().prepare(`PRAGMA table_info("${tableName}")`).all().map(c => c.name));
}

function updateRow(tableName, pkValue, updates) {
  const d = getDb();
  const pkCol = getPrimaryKeyColumn(tableName);
  if (!pkCol) throw new Error(`No primary key found for table ${tableName}`);

  // Snapshot old data
  const oldRow = d.prepare(`SELECT * FROM "${tableName}" WHERE "${pkCol}" = ?`).get(pkValue);
  if (!oldRow) throw new Error(`Row not found: ${pkCol}=${pkValue}`);

  // Build UPDATE — whitelist every column against the real schema first.
  const validCols = getColumnSet(tableName);
  const setClauses = [];
  const values = [];
  for (const [col, val] of Object.entries(updates)) {
    if (col === pkCol) continue; // Don't update PK
    if (!validCols.has(col)) {
      const err = new Error(`Unknown column: ${col}`);
      err.statusCode = 400;
      throw err;
    }
    setClauses.push(`"${col}" = ?`);
    values.push(val === undefined ? null : val);
  }
  if (setClauses.length === 0) throw new Error('No fields to update');

  values.push(pkValue);
  d.prepare(`UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${pkCol}" = ?`).run(...values);

  // Get new data
  const newRow = d.prepare(`SELECT * FROM "${tableName}" WHERE "${pkCol}" = ?`).get(pkValue);

  // Log the change
  logChange(tableName, pkValue, 'update', oldRow, newRow);

  return newRow;
}

function revertChange(changeId) {
  const d = getDb();
  const change = d.prepare('SELECT * FROM db_change_log WHERE id = ?').get(changeId);
  if (!change) throw new Error('Change not found');
  if (change.reverted) throw new Error('Already reverted');
  if (!change.oldData) throw new Error('No old data to revert to');

  const oldData = JSON.parse(change.oldData);
  const pkCol = getPrimaryKeyColumn(change.tableName);
  if (!pkCol) throw new Error(`No primary key for table ${change.tableName}`);

  // Get current row for forward-log
  const currentRow = d.prepare(`SELECT * FROM "${change.tableName}" WHERE "${pkCol}" = ?`).get(change.rowKey);

  // Restore all columns from old data — whitelist against the real schema so a
  // tampered change-log row cannot inject identifiers (C5 audit).
  const validCols = getColumnSet(change.tableName);
  const setClauses = [];
  const values = [];
  for (const [col, val] of Object.entries(oldData)) {
    if (col === pkCol) continue;
    if (!validCols.has(col)) continue; // skip stale/unknown columns silently on revert
    setClauses.push(`"${col}" = ?`);
    values.push(val === undefined ? null : val);
  }
  if (setClauses.length === 0) throw new Error('No valid columns to restore');
  values.push(change.rowKey);
  d.prepare(`UPDATE "${change.tableName}" SET ${setClauses.join(', ')} WHERE "${pkCol}" = ?`).run(...values);

  // Mark original change as reverted
  d.prepare('UPDATE db_change_log SET reverted = 1 WHERE id = ?').run(changeId);

  // Log the revert as its own change
  logChange(change.tableName, change.rowKey, 'revert', currentRow, oldData);

  return { ok: true, restoredData: oldData };
}

function deleteRow(tableName, pkValue) {
  const d = getDb();
  const pkCol = getPrimaryKeyColumn(tableName);
  if (!pkCol) throw new Error(`No primary key found for table ${tableName}`);

  const oldRow = d.prepare(`SELECT * FROM "${tableName}" WHERE "${pkCol}" = ?`).get(pkValue);
  if (!oldRow) throw new Error(`Row not found: ${pkCol}=${pkValue}`);

  d.prepare(`DELETE FROM "${tableName}" WHERE "${pkCol}" = ?`).run(pkValue);
  logChange(tableName, pkValue, 'delete', oldRow, null);

  return { ok: true };
}

// ── DB Export — full JSON dump for backup/recovery ──────────────────────────

function exportAllTables() {
  const d = getDb();
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const dump = {};
  for (const t of tables) {
    dump[t.name] = d.prepare(`SELECT * FROM "${t.name}"`).all();
  }
  dump._meta = {
    exportedAt: new Date().toISOString(),
    tableCount: tables.length,
    totalRows: Object.values(dump).reduce((s, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0),
  };
  return dump;
}

async function autoBackupToFile() {
  try {
    const backupDir = path.join(HOME, '.claude', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const finalPath = path.join(backupDir, 'polyglot-db-backup.db');
    const tmpPath = finalPath + '.tmp';
    try { fs.unlinkSync(tmpPath); } catch { /* no stale tmp */ }
    // Online binary backup (better-sqlite3): runs in steps and does NOT scan
    // every row into JS / JSON.stringify them, so it no longer blocks the event
    // loop like the old `SELECT * FROM <table>` dump (Bug 1 — that dump caused
    // the recurring "slow query registry_history" + node-cron "missed execution").
    await getDb().backup(tmpPath);
    fs.renameSync(tmpPath, finalPath);
    // Drop the obsolete unbounded JSON dump if a prior version left one.
    try { fs.unlinkSync(path.join(backupDir, 'polyglot-db-backup.json')); } catch { /* none */ }
    console.log(`[db] Auto-backup (online) saved to ${finalPath}`);
  } catch (err) {
    console.error('[db] Auto-backup failed:', err.message);
  }
}

// ── Error Log ────────────────────────────────────────────────────────────────

const ERROR_LOG_CAP = parseInt(process.env.LOG_CAP, 10) || 50000;
const DEDUP_WINDOW_SECS = 60; // skip duplicate message+source within 60s
const FALLBACK_LOG = path.join(DB_DIR, 'logger-fallback.log');

function insertErrorLog(opts = {}) {
  const {
    level = 'error',
    source = 'server',
    message,
    stack,
    context,
    category = null,
    agent_id = null,
    request_id = null,
    route = null,
    method = null,
    status = null,
    duration_ms = null,
    user_agent = null,
  } = opts;
  try {
    const db = getDb();
    const msg = String(message || 'Unknown error');

    // Suppress operational non-bugs: node-cron "missed execution" is a library
    // warning (laptop sleep / transient load), not an app error — never persist.
    if (/missed execution/i.test(msg)) return null;

    // Normalized dedup key: strip embedded ISO timestamps + digit runs so
    // messages that differ only by a number/time ("slow query 356ms" vs "432ms",
    // per-tick cron, repeated selftest) collapse to one row instead of piling up.
    const dedupKey = msg
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z?/g, '#TS')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim();
    // Wider window for warn (mostly repeating/operational); tighter for errors.
    const windowSecs = level === 'error' ? DEDUP_WINDOW_SECS : 600;
    const dup = db.prepare(
      `SELECT 1 FROM error_log WHERE source = ? AND dedup_key = ? AND COALESCE(category,'') = COALESCE(?, '')
       AND ts >= datetime('now', '-' || ? || ' seconds') LIMIT 1`
    ).get(source, dedupKey, category, windowSecs);
    if (dup) return null;

    const info = db.prepare(
      `INSERT INTO error_log (level, source, message, stack, context,
         category, agent_id, request_id, route, method, status, duration_ms, user_agent, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      level, source, msg,
      stack || null,
      context ? JSON.stringify(context) : null,
      category, agent_id, request_id, route, method,
      status === null ? null : Number(status),
      duration_ms === null ? null : Number(duration_ms),
      user_agent,
      dedupKey,
    );

    // Cap at ERROR_LOG_CAP rows — prune oldest
    const count = db.prepare('SELECT COUNT(*) as n FROM error_log').get().n;
    if (count > ERROR_LOG_CAP) {
      db.prepare('DELETE FROM error_log WHERE id IN (SELECT id FROM error_log ORDER BY ts ASC LIMIT ?)').run(count - ERROR_LOG_CAP);
    }
    return info.lastInsertRowid;
  } catch (e) {
    // Never throw from error logger — would cause infinite loop. Fall back
    // to flat-file so nothing is ever silently lost.
    try {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        level, source, message, stack: stack?.toString?.() || stack,
        category, agent_id, request_id, route, method, status, duration_ms, user_agent,
        _fallbackReason: e.message,
      }) + '\n';
      fs.appendFileSync(FALLBACK_LOG, line);
    } catch { /* truly nothing else to do */ }
    console.error('[error_log] failed to persist:', e.message);
    return null;
  }
}

function getErrorLog({
  limit = 200, source, resolved, level, category, agentId,
  q: searchQuery, since, until, beforeId, includeTest = false,
} = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM error_log';
  const conds = [];
  const args = [];
  // Hide synthetic self-test entries (Setup "Run Self-Test" pipeline check) from
  // the default error feed — they verify logging works, they aren't real errors (Bug 5a).
  if (!includeTest) conds.push("message NOT LIKE 'selftest%'");
  if (source)   { conds.push('source = ?');   args.push(source); }
  if (level)    { conds.push('level = ?');    args.push(level); }
  if (category) { conds.push('category = ?'); args.push(category); }
  if (agentId)  { conds.push('agent_id = ?'); args.push(agentId); }
  if (resolved !== undefined) { conds.push('resolved = ?'); args.push(resolved ? 1 : 0); }
  if (since)    { conds.push('ts >= ?'); args.push(since); }
  if (until)    { conds.push('ts <= ?'); args.push(until); }
  if (beforeId) { conds.push('id < ?');  args.push(Number(beforeId)); }
  if (searchQuery) {
    conds.push('(message LIKE ? OR stack LIKE ? OR route LIKE ?)');
    const like = `%${searchQuery}%`;
    args.push(like, like, like);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT ?';
  args.push(Math.min(Number(limit) || 200, 1000));
  return db.prepare(sql).all(...args);
}

function markErrorResolved(id) {
  getDb().prepare('UPDATE error_log SET resolved = 1 WHERE id = ?').run(id);
}

function clearErrorLog({ all = false } = {}) {
  if (all) return getDb().prepare('DELETE FROM error_log').run();
  return getDb().prepare('DELETE FROM error_log WHERE resolved = 1').run();
}

function getUnresolvedErrorCount() {
  return getDb().prepare('SELECT COUNT(*) as n FROM error_log WHERE resolved = 0').get().n;
}

// Nightly retention: prune resolved older than 7d and any row older than 30d.
// Returns counts so the caller (systemSchedules) can log the run.
function pruneErrorLog({ resolvedDays = 7, allDays = 30 } = {}) {
  const db = getDb();
  const resolvedPruned = db.prepare(
    `DELETE FROM error_log WHERE resolved = 1 AND ts < datetime('now', '-' || ? || ' days')`
  ).run(resolvedDays).changes;
  const oldPruned = db.prepare(
    `DELETE FROM error_log WHERE ts < datetime('now', '-' || ? || ' days')`
  ).run(allDays).changes;
  // Hard-cap fallback
  const count = db.prepare('SELECT COUNT(*) as n FROM error_log').get().n;
  let capPruned = 0;
  if (count > ERROR_LOG_CAP) {
    capPruned = db.prepare(
      'DELETE FROM error_log WHERE id IN (SELECT id FROM error_log ORDER BY ts ASC LIMIT ?)'
    ).run(count - ERROR_LOG_CAP).changes;
  }
  return { resolvedPruned, oldPruned, capPruned, remaining: db.prepare('SELECT COUNT(*) as n FROM error_log').get().n };
}

// Dashboard sparkline: hourly counts for last N hours, split by level.
function getErrorLogHistogram({ hours = 24 } = {}) {
  const db = getDb();
  return db.prepare(`
    SELECT strftime('%Y-%m-%d %H:00', ts) AS bucket, level, COUNT(*) AS n
      FROM error_log
     WHERE ts >= datetime('now', '-' || ? || ' hours')
     GROUP BY bucket, level
     ORDER BY bucket ASC
  `).all(hours);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// RUN OBSERVABILITY (Pillar 1) — cost_logs · agent_events · delegations · eval_scores
// ═══════════════════════════════════════════════════════════════════════════

// Claude pricing per 1M tokens (opus 4.x default). Used only when the CLI gives
// us real token counts but no cost (so we can still attribute spend).
function costFromTokens(model, inTok, outTok) {
  const RATES = {
    opus:   { in: 15, out: 75 },
    sonnet: { in: 3,  out: 15 },
    haiku:  { in: 0.8, out: 4 },
  };
  const key = /haiku/i.test(model || '') ? 'haiku' : /sonnet/i.test(model || '') ? 'sonnet' : 'opus';
  const r = RATES[key];
  return (Number(inTok || 0) * r.in + Number(outTok || 0) * r.out) / 1_000_000;
}

// One row per LLM call. estimated=false => REAL tokens from the CLI usage envelope.
function logCost({ runId, agentName, model, inputTokens = 0, outputTokens = 0, costUsd, estimated = true, source } = {}) {
  const total = Number(inputTokens || 0) + Number(outputTokens || 0);
  const cost = costUsd != null ? Number(costUsd) : costFromTokens(model, inputTokens, outputTokens);
  stmt('INSERT INTO cost_logs (runId,agentName,ts,model,inputTokens,outputTokens,totalTokens,costUsd,estimated,source) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(runId || null, agentName || null, new Date().toISOString(), model || null,
         Number(inputTokens || 0), Number(outputTokens || 0), total, cost, estimated ? 1 : 0, source || null);
  return { total, cost, estimated: !!estimated };
}

// Real-vs-estimated spend roll-up (the question the audit said we couldn't answer).
function getSpend({ since, agentName } = {}) {
  const conds = [], args = [];
  if (since)     { conds.push('ts >= ?'); args.push(since); }
  if (agentName) { conds.push('agentName = ?'); args.push(agentName); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  return stmt(`SELECT
      COUNT(*) AS calls,
      SUM(totalTokens) AS tokens,
      ROUND(SUM(costUsd), 4) AS costUsd,
      SUM(CASE WHEN estimated = 0 THEN 1 ELSE 0 END) AS realCalls,
      ROUND(SUM(CASE WHEN estimated = 0 THEN costUsd ELSE 0 END), 4) AS realCostUsd
    FROM cost_logs${where}`).get(...args);
}

function getCostLogs({ runId, agentName, since, limit = 200 } = {}) {
  const conds = [], args = [];
  if (runId)     { conds.push('runId = ?'); args.push(runId); }
  if (agentName) { conds.push('agentName = ?'); args.push(agentName); }
  if (since)     { conds.push('ts >= ?'); args.push(since); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  return stmt(`SELECT * FROM cost_logs${where} ORDER BY ts DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 2000));
}

// Fine-grained event trace within a run (gate, retry, file, tool, delegation, judge, note).
function logAgentEvent(runId, type, data = {}) {
  if (!runId || !type) return;
  stmt('INSERT INTO agent_events (runId,ts,type,data) VALUES (?,?,?,?)')
    .run(runId, new Date().toISOString(), type, JSON.stringify(data || {}));
}

function getAgentEvents(runId, { limit = 500 } = {}) {
  return stmt('SELECT * FROM agent_events WHERE runId = ? ORDER BY ts ASC, id ASC LIMIT ?')
    .all(runId, Math.min(Number(limit) || 500, 5000))
    .map(r => ({ ...r, data: JSON.parse(r.data || '{}') }));
}

// Observed delegation edge (parent agent/run → child agent/run).
function trackDelegation({ parentRunId, parentAgent, childAgent, childRunId, task } = {}) {
  if (!childAgent) return;
  stmt('INSERT INTO delegations (ts,parentRunId,parentAgent,childAgent,childRunId,task) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), parentRunId || null, parentAgent || null, childAgent, childRunId || null, (task || '').slice(0, 500));
  if (parentRunId) logAgentEvent(parentRunId, 'delegation', { childAgent, childRunId });
}

function getDelegations({ parentRunId, childAgent, limit = 200 } = {}) {
  const conds = [], args = [];
  if (parentRunId) { conds.push('parentRunId = ?'); args.push(parentRunId); }
  if (childAgent)  { conds.push('childAgent = ?'); args.push(childAgent); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  return stmt(`SELECT * FROM delegations${where} ORDER BY ts DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 2000));
}

// Independent eval-judge score (Pillar 3 → Witness). dedupKey makes JSONL ingest idempotent.
function recordEvalScore({ runId, caseId, agent, taskType, overall, pass, scores, reasoning, ts, dedupKey } = {}) {
  const when = ts || new Date().toISOString();
  const key = dedupKey || `${caseId || 'adhoc'}:${when}`;
  const res = stmt('INSERT OR IGNORE INTO eval_scores (ts,runId,caseId,agent,taskType,overall,pass,scores,reasoning,dedupKey) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(when, runId || null, caseId || null, agent || null, taskType || null,
         overall != null ? Number(overall) : null, pass ? 1 : 0, JSON.stringify(scores || {}), reasoning || null, key);
  if (res.changes && runId) logAgentEvent(runId, 'judge', { caseId, overall, pass: !!pass });
  return res.changes > 0;
}

function getEvalScores({ agent, caseId, limit = 200 } = {}) {
  const conds = [], args = [];
  if (agent)  { conds.push('agent = ?'); args.push(agent); }
  if (caseId) { conds.push('caseId = ?'); args.push(caseId); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  return stmt(`SELECT * FROM eval_scores${where} ORDER BY ts DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 2000))
    .map(r => ({ ...r, pass: !!r.pass, scores: JSON.parse(r.scores || '{}') }));
}

// Ingest data/intel/eval-runs.jsonl 'score' records into eval_scores (idempotent).
// Keeps the JSONL the durable interface; gives the DB/Witness queryable rows.
function ingestEvalRuns(jsonlPath) {
  const fp = jsonlPath || path.join(HOME, 'Desktop', 'Boldteq App', 'Operation', 'Polyglot', 'data', 'intel', 'eval-runs.jsonl');
  let ingested = 0;
  try {
    for (const line of fs.readFileSync(fp, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.kind !== 'score') continue;
      const ok = recordEvalScore({
        runId: r.runId, caseId: r.case, agent: r.agent, taskType: r.task_type,
        overall: r.overall, pass: r.pass, scores: r.scores, reasoning: r.reasoning,
        ts: r.at, dedupKey: `${r.case}:${r.at}`,
      });
      if (ok) ingested++;
    }
  } catch (e) { if (process.env.DEBUG_DB) console.warn('[db] ingestEvalRuns:', e.message); }
  return { ingested };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH POLICY (Pillar 5) — policy_audit + non-throwing model-routing check
// ═══════════════════════════════════════════════════════════════════════════

// Non-throwing twin of enforceModelPolicy: returns the violation (or null) so the
// dispatch gate can decide, without throwing. Mirrors the same tier-match logic.
function getModelRoutingViolation(agentName, model) {
  let policy;
  try { policy = loadModelRouting(); } catch { return null; }
  if (!policy || !policy.tiers) return null;
  let expected = null, tierKey = null;
  for (const [tk, td] of Object.entries(policy.tiers)) {
    if (Array.isArray(td.agents) && td.agents.includes(agentName)) { expected = td.shortName; tierKey = tk; break; }
  }
  if (!expected) return null;
  const actualModel = String(model || '').toLowerCase();
  if (!actualModel) return null;
  const normalized = actualModel.includes('opus') ? 'opus'
    : actualModel.includes('haiku') ? 'haiku'
    : actualModel.includes('sonnet') ? 'sonnet'
    : actualModel;
  if (normalized === expected) return null;
  return { expected, actual: normalized, tier: tierKey, mode: policy.enforcementMode || 'advisory' };
}

// Append a dispatch-policy decision (allow|block) to the audit trail.
function logPolicyAudit({ decision, agentId, taskType, priority, source, violations, context } = {}) {
  stmt('INSERT INTO policy_audit (ts,decision,agentId,taskType,priority,source,violations,context) VALUES (?,?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), decision || 'allow', agentId || null, taskType || null,
         priority || null, source || null, JSON.stringify(violations || []), JSON.stringify(context || {}));
}

function getPolicyAudit({ decision, agentId, since, limit = 200 } = {}) {
  const conds = [], args = [];
  if (decision) { conds.push('decision = ?'); args.push(decision); }
  if (agentId)  { conds.push('agentId = ?'); args.push(agentId); }
  if (since)    { conds.push('ts >= ?'); args.push(since); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  return stmt(`SELECT * FROM policy_audit${where} ORDER BY ts DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 2000))
    .map((r) => ({ ...r, violations: JSON.parse(r.violations || '[]'), context: JSON.parse(r.context || '{}') }));
}

module.exports = {
  getDb, close,
  // Agent Runs
  loadAgentRuns, insertAgentRun, getRecentAgentRuns,
  insertAgentRunStub, completeAgentRun, reconcileOrphanRuns,
  // Learning Loop (VS Code sessions → review inbox)
  insertVscodeSession, getPendingVscodeSessions, markVscodeSessionsDigested, getAgentRunsBySession,
  insertLearningCandidate, listLearningInbox, getLearningCandidate,
  updateLearningStatus, updateLearningPayload, getInboxCounts, pruneLearningInbox,
  // Run observability (Pillar 1)
  logCost, getSpend, getCostLogs,
  logAgentEvent, getAgentEvents,
  trackDelegation, getDelegations,
  recordEvalScore, getEvalScores, ingestEvalRuns,
  // Dispatch policy (Pillar 5)
  getModelRoutingViolation, logPolicyAudit, getPolicyAudit,
  // Node position overrides (drag-and-drop persistence)
  loadNodePositions, saveNodePositions, clearNodePositions, setNodeLock,
  // Run History
  loadRunHistory, insertRunHistory, deleteRunHistory, clearRunHistory,
  // Orchestrations
  loadOrchestrations, saveOrchestration, deleteOrchestration,
  // Schedules
  loadSchedules, saveSchedules, insertSchedule, updateScheduleFields, updateScheduleRunStatus, deleteScheduleById, getScheduleById,
  // System schedule overrides + run history
  loadSystemOverrides, getSystemOverride, upsertSystemOverride, getScheduleRunsFor,
  // Error Log
  insertErrorLog, getErrorLog, markErrorResolved, clearErrorLog, getUnresolvedErrorCount,
  pruneErrorLog, getErrorLogHistogram,
  // Webhooks
  loadWebhooks, saveWebhooks,
  // Chat
  loadChatHistory, saveChatHistory,
  // Playground
  loadPlaygroundHistory, savePlaygroundHistory,
  // Approvals
  loadApprovals, saveApprovals,
  // Audit Log
  loadAuditLog, saveAuditLog,
  // Training
  loadTraining, saveTraining,
  // Config singletons
  loadConfig, saveConfig,
  loadGoals, saveGoals,
  loadRecommendations, saveRecommendations,
  loadModelRouting, saveModelRouting,
  loadAgentLearning, saveAgentLearning,
  loadClaims, saveClaims,
  loadAntipatternSigs, saveAntipatternSigs,
  loadSkillIndex, saveSkillIndex,
  loadExperienceWeights, saveExperienceWeights,
  loadDispatchPolicy, saveDispatchPolicy,
  // App config
  getConfigValue, getConfigRow, getAllConfig, upsertConfig,
  appendConfigAudit, getConfigAudit,
  // Pods
  listPods, upsertPod, deletePod,
  // Models
  listModels, getModel, upsertModel,
  // Model policy
  listModelPolicy, insertModelPolicy, clearModelPolicy,
  // Org
  loadRegistry, saveRegistry,
  logHistory, getHistory, listHistory, listBatchHistory, markHistoryUndone,
  loadDepartments, saveDepartments,
  setOrgInvalidator,
  // HR
  appendWitnessEvent, getWitnessLog,
  appendDailyScore, getDailyScores,
  appendCapabilityGap, getRecentGaps,
  getTrainingQueue, saveTrainingQueue,
  getLatestReview, saveReview,
  // Project Conversations
  loadProjectConversations, saveProjectConversations, getProjectConversation,
  // Change Log & Row Operations
  logChange, getChanges, updateRow, revertChange, deleteRow, getPrimaryKeyColumn,
  // Export & Backup
  exportAllTables, autoBackupToFile,
};
