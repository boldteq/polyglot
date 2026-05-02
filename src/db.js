// ── SQLite Database Module for Polyglot ──────────────────────────────────────
// Replaces JSON file storage with a local SQLite database.
// Uses better-sqlite3 (synchronous, fast, no async overhead).
// Database file: data/polyglot.db (created automatically on first access).

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'polyglot.db');
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const ORG_DIR = path.join(HOME, '.claude', 'org');

let _db = null;

// ── Database Lifecycle ──────────────────────────────────────────────────────

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

  // Integrity check — catch corruption early
  try {
    const check = _db.pragma('integrity_check');
    if (check[0]?.integrity_check !== 'ok') {
      console.error('[db] INTEGRITY CHECK FAILED:', check);
    }
  } catch (err) {
    console.error('[db] Integrity check error:', err.message);
  }

  runMigrations(_db);
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
  `);
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
}

function getRecentAgentRuns(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
  return stmt('SELECT * FROM agent_runs WHERE timestamp >= ? ORDER BY timestamp DESC').all(cutoff).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
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
  stmt('DELETE FROM orchestrations WHERE id = ?').run(id);
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

function updateRow(tableName, pkValue, updates) {
  const d = getDb();
  const pkCol = getPrimaryKeyColumn(tableName);
  if (!pkCol) throw new Error(`No primary key found for table ${tableName}`);

  // Snapshot old data
  const oldRow = d.prepare(`SELECT * FROM "${tableName}" WHERE "${pkCol}" = ?`).get(pkValue);
  if (!oldRow) throw new Error(`Row not found: ${pkCol}=${pkValue}`);

  // Build UPDATE
  const setClauses = [];
  const values = [];
  for (const [col, val] of Object.entries(updates)) {
    if (col === pkCol) continue; // Don't update PK
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

  // Restore all columns from old data
  const setClauses = [];
  const values = [];
  for (const [col, val] of Object.entries(oldData)) {
    if (col === pkCol) continue;
    setClauses.push(`"${col}" = ?`);
    values.push(val === undefined ? null : val);
  }
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

function autoBackupToFile() {
  try {
    const backupDir = path.join(HOME, '.claude', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, 'polyglot-db-backup.json');
    const dump = exportAllTables();
    fs.writeFileSync(backupPath, JSON.stringify(dump));
    console.log(`[db] Auto-backup saved to ${backupPath} (${Object.keys(dump).length - 1} tables)`);
  } catch (err) {
    console.error('[db] Auto-backup failed:', err.message);
  }
}

// ── Error Log ────────────────────────────────────────────────────────────────

const ERROR_LOG_CAP = 1000;
const DEDUP_WINDOW_SECS = 60; // skip duplicate message+source within 60s

function insertErrorLog({ level = 'error', source = 'server', message, stack, context } = {}) {
  try {
    const db = getDb();
    const msg = String(message || 'Unknown error');
    // Dedup: skip if identical message+source exists within the window
    const dup = db.prepare(
      `SELECT 1 FROM error_log WHERE source = ? AND message = ?
       AND ts >= datetime('now', '-' || ? || ' seconds') LIMIT 1`
    ).get(source, msg, DEDUP_WINDOW_SECS);
    if (dup) return;

    db.prepare(
      `INSERT INTO error_log (level, source, message, stack, context) VALUES (?, ?, ?, ?, ?)`
    ).run(level, source, msg, stack || null, context ? JSON.stringify(context) : null);

    // Cap at ERROR_LOG_CAP rows — prune oldest
    const count = db.prepare('SELECT COUNT(*) as n FROM error_log').get().n;
    if (count > ERROR_LOG_CAP) {
      db.prepare('DELETE FROM error_log WHERE id IN (SELECT id FROM error_log ORDER BY ts ASC LIMIT ?)').run(count - ERROR_LOG_CAP);
    }
  } catch (e) {
    // Never throw from error logger — would cause infinite loop
    console.error('[error_log] failed to persist:', e.message);
  }
}

function getErrorLog({ limit = 200, source, resolved } = {}) {
  const db = getDb();
  let q = 'SELECT * FROM error_log';
  const conds = [];
  const args = [];
  if (source) { conds.push('source = ?'); args.push(source); }
  if (resolved !== undefined) { conds.push('resolved = ?'); args.push(resolved ? 1 : 0); }
  if (conds.length) q += ' WHERE ' + conds.join(' AND ');
  q += ' ORDER BY ts DESC LIMIT ?';
  args.push(limit);
  return db.prepare(q).all(...args);
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

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getDb, close,
  // Agent Runs
  loadAgentRuns, insertAgentRun, getRecentAgentRuns,
  // Node position overrides (drag-and-drop persistence)
  loadNodePositions, saveNodePositions, clearNodePositions, setNodeLock,
  // Run History
  loadRunHistory, insertRunHistory, deleteRunHistory, clearRunHistory,
  // Orchestrations
  loadOrchestrations, saveOrchestration, deleteOrchestration,
  // Schedules
  loadSchedules, saveSchedules, insertSchedule, updateScheduleFields, updateScheduleRunStatus, deleteScheduleById, getScheduleById,
  // Error Log
  insertErrorLog, getErrorLog, markErrorResolved, clearErrorLog, getUnresolvedErrorCount,
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
  // Org
  loadRegistry, saveRegistry,
  logHistory, getHistory, listHistory, listBatchHistory, markHistoryUndone,
  loadDepartments, saveDepartments,
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
