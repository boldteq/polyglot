'use strict';

// Agent sync: keep SQLite `agents` table in lockstep with ~/.claude/agents/*.md.
// - Chokidar watches the agents dir. add/change/unlink → upsert/remove in registry.
// - On every mutation, emits on the shared EventEmitter so SSE clients push live.
// - reseedFromDisk() is called on server boot to close any gap from downtime.
//
// SQLite writes go through org.upsertAgent (which calls db.saveRegistry),
// so we inherit the existing transactional semantics and don't duplicate SQL.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');

const { parseAgent } = require('./cache');
const org = require('../org');
const configService = require('./configService');

const HOME = os.homedir();
const AGENTS_DIR = path.join(HOME, '.claude', 'agents');

const events = new EventEmitter();
events.setMaxListeners(100);

let watcher = null;

function deriveAgentRecord(parsed) {
  if (!parsed) return null;
  const { filename, name, description, model, tools } = parsed;
  return {
    name: name || filename,
    description: description || '',
    model: model || configService.getConfig('defaults.model'),
    role: typeof tools === 'string' ? tools : Array.isArray(tools) ? tools.join(',') : '',
  };
}

function isAgentFile(p) {
  if (!p) return false;
  if (!p.endsWith('.md')) return false;
  const dir = path.dirname(p);
  return path.resolve(dir) === path.resolve(AGENTS_DIR);
}

function agentIdFromPath(p) {
  return path.basename(p, '.md');
}

// Detect pod membership from agent id prefix. Files named `shopify-tester`,
// `saas-frontend`, `storefront-backend`, etc. auto-route to their pod's lead
// so a freshly-dropped specialist file lands in the right column on first
// sync. Returns { pod, podLead, department } or null when the id has no
// recognizable pod prefix.
//
// `<pod>-lead` files themselves are NOT routed under another lead — they
// report up to the engineering VP (arya).
// Order matters: longer prefixes first so 'shopify-app-foo' matches the
// shopify-app pod, not the 'shopify-' prefix of a shorter pod.
function detectPodFromId(agentId) {
  if (!agentId) return null;
  const lower = agentId.toLowerCase();
  // Read prefixes from `pods` SQLite table (configService). Sort longest
  // prefix first so 'shopify-app-foo' matches `shopify-app-` before the
  // shorter 'shopify-' prefix of a different pod.
  const pods = configService.listPods()
    .slice()
    .sort((a, b) => (b.prefix?.length || 0) - (a.prefix?.length || 0));
  for (const { id: pod, prefix, department } of pods) {
    if (!prefix || !lower.startsWith(prefix)) continue;
    const role = lower.slice(prefix.length);
    if (!role) return null;
    if (role === 'lead') {
      return { pod, podLead: 'arya', department: department || 'engineering' };
    }
    return { pod, podLead: `${pod}-lead`, department: department || 'engineering' };
  }
  return null;
}

function upsertFromDisk(agentId) {
  const filePath = path.join(AGENTS_DIR, `${agentId}.md`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: 'missing' };
  }
  const parsed = parseAgent(filePath);
  if (!parsed) return { ok: false, reason: 'parse_failed' };

  const derived = deriveAgentRecord(parsed);
  const existing = org.findAgent(agentId);

  // Pod-prefix routing: when a brand-new disk-only file matches `pod-{x}-*`,
  // auto-pick department + reportsTo + pod from the prefix so the specialist
  // lands in their pod column immediately. Only applies when there's no
  // existing record (don't overwrite an explicit registry assignment).
  const podHint = !existing ? detectPodFromId(agentId) : null;

  // Merge: live metadata from disk overrides; org structure (department/phase/
  // reportsTo/level/etc.) is preserved from the existing registry record.
  // New agents get sensible defaults so they still render in the org chart.
  // Status defaults to 'pending' (not 'probation') so HR sees the new arrival
  // needs triage — department/reportsTo/tier MUST be assigned before the agent
  // is promoted to active. The org chart layout treats `pending` agents with
  // no `reportsTo` as "Unassigned" (NOT as a top leader), so a missing field
  // can no longer pollute the leadership row.
  const patch = {
    ...derived,
    status: existing?.status || configService.getConfig('defaults.status') || 'pending',
    department: existing?.department ?? podHint?.department ?? 'unassigned',
    reportsTo: existing?.reportsTo ?? podHint?.podLead ?? null,
    pod: existing?.pod ?? podHint?.pod ?? null,
    title: existing?.title ?? (parsed.description?.slice(0, 80) || 'Agent'),
    tier: existing?.tier ?? (configService.getConfig('defaults.tier') || 'engineer'), // allowed: chained fallback
    level: existing?.level ?? 1,
    hiredAt: existing?.hiredAt || new Date().toISOString(),
  };

  const saved = org.upsertAgent(agentId, patch);
  events.emit('agent:upsert', { agentId, agent: saved });
  if (!existing) {
    if (podHint) {
      console.log(
        `[agentSync] New pod-prefixed agent "${agentId}" auto-routed: pod=${podHint.pod}, reportsTo=${podHint.podLead}, department=${podHint.department}`
      );
    } else {
      console.warn(
        `[agentSync] New disk-only agent "${agentId}" seeded with defaults — assign department/reportsTo/tier in registry.json`
      );
    }
  }
  return { ok: true, agent: saved, isNew: !existing };
}

function markRemoved(agentId) {
  const existing = org.findAgent(agentId);
  if (!existing) return { ok: false, reason: 'not_in_registry' };
  // Preserve the record; mark retired so history + reportsTo edges stay intact.
  const saved = org.upsertAgent(agentId, {
    status: 'retired',
    retiredAt: new Date().toISOString(),
    retiredReason: 'file_removed_from_disk',
  });
  events.emit('agent:remove', { agentId, agent: saved });
  return { ok: true, agent: saved };
}

function reseedFromDisk() {
  const summary = { scanned: 0, upserted: 0, removed: 0, errors: [] };
  if (!fs.existsSync(AGENTS_DIR)) {
    return summary;
  }
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  summary.scanned = files.length;

  const diskIds = new Set();
  for (const f of files) {
    const id = f.replace(/\.md$/, '');
    diskIds.add(id);
    try {
      const r = upsertFromDisk(id);
      if (r.ok) summary.upserted += 1;
      else summary.errors.push({ id, reason: r.reason });
    } catch (err) {
      summary.errors.push({ id, reason: err.message });
    }
  }

  // Retire any active agent whose file was deleted while the server was off.
  try {
    for (const record of org.listAgentRecords()) {
      if (record.status === 'retired') continue;
      if (!diskIds.has(record.id)) {
        markRemoved(record.id);
        summary.removed += 1;
      }
    }
  } catch (err) {
    summary.errors.push({ id: '<reconcile>', reason: err.message });
  }

  return summary;
}

function startWatcher() {
  if (watcher) return watcher;
  if (!fs.existsSync(AGENTS_DIR)) {
    console.warn(`[agentSync] agents dir missing: ${AGENTS_DIR} — watcher not started`);
    return null;
  }

  // Gotchas we hit:
  //  1. `awaitWriteFinish` + `depth:0` silently drop all events on macOS.
  //  2. A dotfile regex like `/(^|[\/\\])\../` also matches `.claude` in the
  //     watch path's parent, so chokidar excludes the whole dir. Use a function
  //     that only ignores dotfiles at leaf level.
  watcher = chokidar.watch(AGENTS_DIR, {
    persistent: true,
    ignoreInitial: true,
    ignored: (p) => path.basename(p).startsWith('.'),
  });

  // Per-file debounce — collapses a burst (create → chmod → rename) into one.
  const pending = new Map();
  const schedule = (id, fn) => {
    const existing = pending.get(id);
    if (existing) clearTimeout(existing);
    pending.set(id, setTimeout(() => {
      pending.delete(id);
      try { fn(); } catch (err) { console.warn(`[agentSync] handler ${id}: ${err.message}`); }
    }, 150));
  };

  const handleAddChange = (p) => {
    if (!isAgentFile(p)) return;
    const id = agentIdFromPath(p);
    schedule(id, () => {
      const r = upsertFromDisk(id);
      if (r.ok) console.log(`[agentSync] ${r.isNew ? 'added' : 'updated'}: ${id}`);
    });
  };

  const handleUnlink = (p) => {
    if (!isAgentFile(p)) return;
    const id = agentIdFromPath(p);
    schedule(id, () => {
      const r = markRemoved(id);
      if (r.ok) console.log(`[agentSync] retired: ${id}`);
    });
  };

  watcher.on('add', handleAddChange);
  watcher.on('change', handleAddChange);
  watcher.on('unlink', handleUnlink);
  watcher.on('error', (err) => console.warn(`[agentSync] watcher error: ${err.message}`));
  watcher.on('ready', () => console.log(`[agentSync] watcher ready (${Object.keys(watcher.getWatched()).length} dirs)`));
  if (process.env.AGENT_SYNC_DEBUG) {
    watcher.on('all', (ev, p) => console.log(`[agentSync:raw] ${ev} ${p}`));
  }

  console.log(`[agentSync] watching ${AGENTS_DIR}`);
  return watcher;
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

// Schedule lifecycle events. Both user schedules (src/routes/schedules.js)
// and system schedules (src/lib/systemSchedules.js) emit through this helper
// so the org-chart SSE stream forwards a single, consistent event family:
//   schedule:start    — { id, kind:'user'|'system', name, agentName, startedAt }
//   schedule:complete — { id, kind, status:'success', lastRunAt, duration }
//   schedule:error    — { id, kind, error, lastRunAt, duration }
//   schedule:upsert   — { id, kind } (create/edit/enable-toggle — UI refetches)
function emitScheduleEvent(type, payload) {
  try {
    events.emit(`schedule:${type}`, { ...payload, ts: Date.now() });
  } catch (err) {
    console.warn(`[agentSync] emitScheduleEvent(${type}) failed: ${err.message}`);
  }
}

module.exports = {
  AGENTS_DIR,
  events,
  upsertFromDisk,
  markRemoved,
  reseedFromDisk,
  startWatcher,
  stopWatcher,
  emitScheduleEvent,
};
