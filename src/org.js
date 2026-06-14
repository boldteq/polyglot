/**
 * Organization Module — single source of truth for departments, phases, and
 * the agent registry. Replaces the hardcoded AGENT_PIPELINE / AGENT_ROLES
 * constants previously in server.js.
 *
 * Data lives in ~/.claude/org/:
 *   - departments.json — department + phase definitions
 *   - registry.json    — per-agent record (department, phase, reportsTo,
 *                        experience, level, skills, status, hire date)
 *
 * This module is pure — it reads/writes JSON. Experience computation lives
 * in src/experience.js and reads from here.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');
// Lazy-load configService to avoid a circular require — org.js is required
// by db.js' migration importers. configService requires db.js → cycle.
function cfg() { return require('./lib/configService'); }

const HOME = os.homedir();
const ORG_DIR = path.join(HOME, '.claude', 'org');
const DEPARTMENTS_PATH = path.join(ORG_DIR, 'departments.json');
const REGISTRY_PATH = path.join(ORG_DIR, 'registry.json');

// ── In-process cache (single-process server, mirrors taxonomy.js) ────────────
// loadRegistry/loadDepartments hit SQLite + JSON.parse ~55 blobs per call;
// buildOrgChart assembles ~55 nodes + dept buckets + stats. Both are pure given
// (registry, departments) and change ONLY on write. We cache them and invalidate
// from the db.saveRegistry / db.saveDepartments chokepoint (see below).
let _registryCache = null;
let _departmentsCache = null;
let _orgSkeletonCache = null; // { diskSig, skeleton } — static chart, load overlaid per request
let _orgVersion = 0;          // bumped on every invalidation (reserved for future ETag)

function invalidateOrgCache() {
  _registryCache = null;
  _departmentsCache = null;
  _orgSkeletonCache = null;
  _orgVersion++;
}

// Register with db so EVERY registry/department write clears these caches.
// db.js must not hard-require org.js (cycle), so it calls a registered callback.
// This is the PRIMARY invalidation path — all writes funnel through db.save*.
try {
  if (typeof db.setOrgInvalidator === 'function') db.setOrgInvalidator(invalidateOrgCache);
} catch { /* db shape older — db-hook unavailable, event listener below covers it */ }

// Belt-and-suspenders: also drop caches on any agent/taxonomy SSE event, so a
// future write path that emits an event but skips db.save* still stays correct.
// Wired lazily on first cache use — requiring agentSync at module load races the
// org↔agentSync circular dependency (its exports aren't ready yet).
let _eventsWired = false;
function ensureEventInvalidation() {
  if (_eventsWired) return;
  _eventsWired = true;
  try {
    const { events } = require('./lib/agentSync');
    if (events && typeof events.on === 'function') {
      for (const e of ['agent:upsert', 'agent:remove', 'taxonomy:update']) {
        events.on(e, invalidateOrgCache);
      }
    }
  } catch { /* agentSync not ready — db hook is the primary path */ }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`[org] failed to read ${filePath}: ${err.message}`);
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  // Atomic write: write to .tmp then rename
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// ──────────────────────────────────────────────────────────────────────────
//  Departments & Phases
// ──────────────────────────────────────────────────────────────────────────

function loadDepartments() {
  if (_departmentsCache) return _departmentsCache;
  _departmentsCache = db.loadDepartments();
  return _departmentsCache;
}

function saveDepartments(data) {
  data.updatedAt = new Date().toISOString();
  db.saveDepartments(data);
}

function listDepartments() {
  const { departments } = loadDepartments();
  return Object.values(departments || {})
    .filter((d) => d.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getDepartment(id) {
  const { departments } = loadDepartments();
  return departments?.[id] || null;
}

function listPhases() {
  const { phases } = loadDepartments();
  return Object.values(phases || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function getPhase(id) {
  const { phases } = loadDepartments();
  return phases?.[id] || null;
}

// Allowed fields when patching a sub-department record (departments.json mutation).
// Keep this list narrow — schema integrity matters at this layer.
const ALLOWED_SUBDEPT_FIELDS = [
  'label', 'description', 'order',
  'lead', 'memberCount', 'status',
  'cardLabel', 'cardEmoji', 'color', 'icon', 'displayMode',
];

/**
 * updateSubDepartment(deptId, subId, patch)
 * Patches a sub-department's editable fields, atomically rewrites
 * departments.json, bumps version, returns the updated sub-dept.
 * Throws if the dept or sub-dept doesn't exist or all patch fields invalid.
 */
function updateSubDepartment(deptId, subId, patch = {}) {
  const data = loadDepartments();
  const dept = data.departments?.[deptId];
  if (!dept) {
    throw new Error(`Department '${deptId}' not found`);
  }
  if (!dept.subDepartments?.[subId]) {
    throw new Error(`Sub-department '${subId}' not found in department '${deptId}'`);
  }
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_SUBDEPT_FIELDS.includes(k))
  );
  if (Object.keys(cleanPatch).length === 0) {
    throw new Error('No valid fields in patch');
  }
  const before = { ...dept.subDepartments[subId] };
  const after = { ...before, ...cleanPatch };
  dept.subDepartments[subId] = after;
  data.version = (data.version || 1) + 1;
  saveDepartments(data);
  return { before, after, version: data.version };
}

// ──────────────────────────────────────────────────────────────────────────
//  Registry
// ──────────────────────────────────────────────────────────────────────────

function loadRegistry() {
  ensureEventInvalidation();
  if (_registryCache) return _registryCache;
  _registryCache = db.loadRegistry();
  return _registryCache;
}

function saveRegistry(data) {
  data.updatedAt = new Date().toISOString();
  db.saveRegistry(data);
}

function listAgentRecords() {
  const { agents } = loadRegistry();
  return Object.values(agents || {});
}

function findAgent(id) {
  const { agents } = loadRegistry();
  return agents?.[id] || null;
}

// upsertOpts: { skipHistory?: boolean, action?: string, batchId?: string, actor?: string, skipBroadcast?: boolean }
function upsertAgent(id, patch, opts = {}) {
  const registry = loadRegistry();
  registry.agents = registry.agents || {};
  const existing = registry.agents[id] || { id };
  const next = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  registry.agents[id] = next;
  saveRegistry(registry);

  // Audit + undo history (write before broadcast so undo always has prior state)
  if (!opts.skipHistory) {
    try {
      db.logHistory({
        agent_id: id,
        action: opts.action || 'upsert',
        prior_state: existing,
        new_state: next,
        patch,
        actor: opts.actor || 'admin',
        batch_id: opts.batchId || null,
      });
    } catch (err) {
      console.warn('[org] history log failed:', err.message);
    }
  }

  // Broadcast via SSE so all connected pages refresh in real time
  if (!opts.skipBroadcast) {
    try {
      const { events } = require('./lib/agentSync');
      events.emit('agent:upsert', { agentId: id, agent: next });
    } catch (err) {
      // agentSync may not be initialised in some contexts (tests, scripts)
    }
  }

  return next;
}

function removeAgent(id) {
  const registry = loadRegistry();
  if (registry.agents?.[id]) {
    delete registry.agents[id];
    saveRegistry(registry);
    return true;
  }
  return false;
}

function findAgentsByDepartment(departmentId) {
  return listAgentRecords().filter((a) => a.department === departmentId);
}

function findDirectReports(managerId) {
  return listAgentRecords().filter((a) => a.reportsTo === managerId);
}

/**
 * Filter agents by tag query.
 * Logic: AND across categories, OR within each category.
 * tagQuery: { tech?: string[], domain?: string[], 'work-type'?: string[] }
 */
function findAgentsByTags(tagQuery = {}) {
  return listAgentRecords().filter((a) => {
    const tags = a.tags || { tech: [], domain: [], 'work-type': [] };
    for (const [cat, values] of Object.entries(tagQuery)) {
      if (!values || values.length === 0) continue;
      const agentCatTags = tags[cat] || [];
      if (!values.some((v) => agentCatTags.includes(v))) return false;
    }
    return true;
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  Org chart composition — combines registry records with disk-parsed agents
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build a complete org-chart response combining:
 *   - Department metadata from departments.json
 *   - Per-agent records from registry.json
 *   - Live agent metadata (name, description, model, tools) from the
 *     caller-supplied `agentMap` keyed by filename
 *
 * `agentMap` is injected so this module stays decoupled from server.js's
 * agent parser. Typical caller:
 *
 *   const agentMap = Object.fromEntries(
 *     listAgents(path.join(CLAUDE_DIR, 'agents')).map((a) => [a.filename, a])
 *   );
 *   const chart = org.buildOrgChart(agentMap);
 */
// Live task-load overlay. Built fresh per request (cheap indexed query) and
// applied onto the cached static skeleton so 🟢🟡🔴 dots stay real-time even
// though the expensive node/dept/stats assembly is cached. Task writes
// (tasks.js raw UPDATE agents) bypass db.saveRegistry, so load MUST NOT be cached.
function _getLoadMap() {
  try {
    return require('./lib/tasks').getAllAgentLoad();
  } catch {
    return {};
  }
}

function _withLoad(skeleton, loadMap) {
  // Overlay live load onto a shallow copy of each node, then rebuild the
  // department/sub-department member references by id so cards show live load too.
  const nodes = skeleton.nodes.map((n) => ({
    ...n,
    activeTaskCount: loadMap[n.id]?.activeTaskCount ?? 0,
    maxConcurrentTasks: loadMap[n.id]?.maxConcurrentTasks ?? 3,
    loadStatus: loadMap[n.id]?.loadStatus ?? 'free',
    busyUntilAt: loadMap[n.id]?.busyUntilAt ?? null,
    lastDispatchAt: loadMap[n.id]?.lastDispatchAt ?? null,
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const remap = (arr) => arr.map((m) => byId[m.id] || m);
  const departments = skeleton.departments.map((d) => ({
    ...d,
    members: remap(d.members),
    orphanMembers: remap(d.orphanMembers),
    subDepartments: d.subDepartments.map((sd) => ({ ...sd, members: remap(sd.members) })),
  }));
  return { ...skeleton, nodes, departments };
}

function buildOrgChart(agentMap = {}) {
  const loadMap = _getLoadMap();
  // Cache key: the set of disk filenames present feeds node overrides
  // (disk?.name / model / tools). Stable across requests when nothing changed.
  const diskSig = Object.keys(agentMap).sort().join(',');
  if (_orgSkeletonCache && _orgSkeletonCache.diskSig === diskSig) {
    return _withLoad(_orgSkeletonCache.skeleton, loadMap);
  }
  const skeleton = _buildOrgSkeleton(agentMap);
  _orgSkeletonCache = { diskSig, skeleton };
  return _withLoad(skeleton, loadMap);
}

// Static (load-neutral) chart assembly. Pure given (registry, departments,
// agentMap). Cached by buildOrgChart; load is overlaid afterwards via _withLoad.
function _buildOrgSkeleton(agentMap = {}) {
  const { departments, phases } = loadDepartments();
  const { agents: registry } = loadRegistry();

  // Load fields are set to neutral defaults here (empty loadMap) and overlaid
  // live per-request in _withLoad — never cache live task load.
  const loadMap = {};

  const nodes = [];
  const agentIds = Object.keys(registry || {});

  for (const id of agentIds) {
    const record = registry[id];
    const disk = agentMap[id] || null;

    // Skip if registry references an agent that has no .md file on disk
    // (we still keep it if status === 'probation' for new hires in flight)
    if (!disk && record.status !== 'probation' && record.status !== 'pending') {
      continue;
    }

    const deptInfo = departments?.[record.department] || null;

    // Org Structure v2: sub-department + pod resolution
    const subDeptInfo = (record.subDepartment && deptInfo?.subDepartments)
      ? deptInfo.subDepartments[record.subDepartment] || null
      : null;

    const deptColor = deptInfo?.color || '#6b7280';

    nodes.push({
      id,
      name: disk?.name || record.name || id,
      title: record.title || 'Agent',
      tier: record.tier || cfg().getConfig('defaults.tier'),
      model: disk?.model || record.model || cfg().getConfig('defaults.model'),
      tools: disk?.tools || '',
      description: disk?.description || record.description || '',
      department: record.department || null,
      departmentLabel: deptInfo?.label || null,
      departmentColor: deptColor,
      // Org v2 fields
      subDepartment: record.subDepartment || null,
      subDepartmentLabel: subDeptInfo?.label || null,
      subDepartmentDescription: subDeptInfo?.description || null,
      subDepartmentOrder: subDeptInfo?.order ?? 999,
      // Visual fields (Phase 1 schema extension — for dynamic card rendering)
      subDepartmentCardLabel: subDeptInfo?.cardLabel || null,
      subDepartmentCardEmoji: subDeptInfo?.cardEmoji || null,
      subDepartmentColor: subDeptInfo?.color || null,
      subDepartmentIcon: subDeptInfo?.icon || null,
      subDepartmentDisplayMode: subDeptInfo?.displayMode || 'expanded',
      subDepartmentStatus: subDeptInfo?.status || 'active',
      pod: record.pod || null,
      secondaryReportsTo: record.secondaryReportsTo || null,
      // phase removed 2026-04-28; phaseColor kept (= deptColor) for legacy tinting refs
      phase: null,
      phaseLabel: null,
      phaseColor: deptColor,
      reportsTo: record.reportsTo || null,
      status: record.status || 'active',
      level: record.level ?? null,
      levelTitle: record.levelTitle ?? null,
      yearsOfExperience: record.yearsOfExperience ?? null,
      experiencePoints: record.experiencePoints ?? null,
      tags: record.tags || { tech: [], domain: [], 'work-type': [] },
      squad: record.squad || null,
      avatar: record.avatar || null,
      gender: record.gender || null,
      // Phase A — live capacity + perf signals for the org-chart UI
      activeTaskCount: loadMap[id]?.activeTaskCount ?? 0,
      maxConcurrentTasks: loadMap[id]?.maxConcurrentTasks ?? 3,
      loadStatus: loadMap[id]?.loadStatus ?? 'free',
      busyUntilAt: loadMap[id]?.busyUntilAt ?? null,
      lastDispatchAt: loadMap[id]?.lastDispatchAt ?? null,
      successRate: typeof record.stats?.successRate === 'number' ? record.stats.successRate : null,
      avgDurationMs: record.stats?.avgDurationMs ?? null,
    });
  }

  // Edges: reporting lines
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const node of nodes) {
    if (node.reportsTo && nodeById[node.reportsTo]) {
      edges.push({ from: node.reportsTo, to: node.id });
    }
  }

  // Departments in org view (Org Structure v2 — includes subDepartments map)
  const departmentList = Object.values(departments || {})
    .filter((d) => d.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((d) => {
      const members = nodes.filter((n) => n.department === d.id);
      // Sub-department buckets (sorted by subDepartmentOrder, then alphabetical)
      const subDepartments = Object.values(d.subDepartments || {})
        .filter((sd) => sd.displayMode !== 'hidden')
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .map((sd) => ({
          id: sd.id,
          label: sd.label,
          description: sd.description,
          order: sd.order ?? 999,
          pod: sd.pod || null,
          // Visual fields for dynamic card rendering
          cardLabel: sd.cardLabel || null,
          cardEmoji: sd.cardEmoji || null,
          color: sd.color || null,
          icon: sd.icon || null,
          displayMode: sd.displayMode || 'expanded',
          status: sd.status || 'active',
          lead: sd.lead || null,
          memberCount: sd.memberCount ?? null,
          members: members
            .filter((n) => n.subDepartment === sd.id)
            .sort((a, b) => {
              // Leadership tier first inside a sub-dept, then by id
              if (a.tier === 'leadership' && b.tier !== 'leadership') return -1;
              if (a.tier !== 'leadership' && b.tier === 'leadership') return 1;
              return a.id.localeCompare(b.id);
            }),
        }));
      // Orphans: members in this department but with no/unknown subDepartment
      const knownSubIds = new Set(subDepartments.map((s) => s.id));
      const orphanMembers = members.filter((n) => !n.subDepartment || !knownSubIds.has(n.subDepartment));

      return {
        id: d.id,
        label: d.label,
        description: d.description,
        color: d.color,
        icon: d.icon,
        head: d.head,
        members,
        subDepartments,
        orphanMembers,
      };
    });

  // Stats
  const stats = {
    totalAgents: nodes.length,
    byModel: {},
    byTier: {},
    byDepartment: {},
    byStatus: {},
    byLevel: {},
  };
  for (const n of nodes) {
    stats.byModel[n.model] = (stats.byModel[n.model] || 0) + 1;
    stats.byTier[n.tier] = (stats.byTier[n.tier] || 0) + 1;
    if (n.department) stats.byDepartment[n.department] = (stats.byDepartment[n.department] || 0) + 1;
    stats.byStatus[n.status] = (stats.byStatus[n.status] || 0) + 1;
    if (n.level != null) stats.byLevel[n.level] = (stats.byLevel[n.level] || 0) + 1;
  }

  return {
    nodes,
    edges,
    phases: [],
    departments: departmentList,
    stats,
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  Self-heal: detect drift between registry and disk
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compare registry.json against the actual agent .md files on disk.
 * Returns { onlyOnDisk: [], onlyInRegistry: [] } — agents present in one
 * but not the other. HR uses this to auto-heal the registry.
 */
function detectDrift(agentMap) {
  const { agents: registry } = loadRegistry();
  const registryIds = new Set(Object.keys(registry || {}));
  const diskIds = new Set(Object.keys(agentMap));

  const onlyOnDisk = [...diskIds].filter((id) => !registryIds.has(id));
  const onlyInRegistry = [...registryIds].filter(
    (id) => !diskIds.has(id) && registry[id].status !== 'probation'
  );

  return { onlyOnDisk, onlyInRegistry };
}

module.exports = {
  // paths (exposed for HR module)
  ORG_DIR,
  DEPARTMENTS_PATH,
  REGISTRY_PATH,

  // departments
  loadDepartments,
  saveDepartments,
  listDepartments,
  getDepartment,
  listPhases,
  getPhase,
  updateSubDepartment,
  ALLOWED_SUBDEPT_FIELDS,

  // registry
  loadRegistry,
  saveRegistry,
  listAgentRecords,
  findAgent,
  upsertAgent,
  removeAgent,
  findAgentsByDepartment,
  findAgentsByTags,
  findDirectReports,

  // compose
  buildOrgChart,
  detectDrift,
};
