'use strict';

// Boldteq Intelligence — the cross-project signal aggregator (Phase B).
//
// Two brain functions the factory was missing: "generalize across contexts" and
// "learn from consequences." This module mines the factory's REAL run / correction
// / learning history, normalizes each weakness into a stable signature, and emits
// `training_signals` that the trainer (Phase C) acts on through the governor.
//
// Three agent-attributed sources (all verified present in the live db):
//   1. agent_runs (status error/failed)        → kind 'failure_cluster'
//   2. training_corrections (Yash/Sage issues) → kind 'yash_correction' (P0-strong)
//   3. learning_inbox (VS Code digest bugs)    → kind 'antipattern'
// (eval_scores feeds Witness separately — see hr.runWitnessSweep.)
//
// IDEMPOTENT BY DESIGN. The daily handler re-scans the WHOLE window and writes
// with mode:'set' — occurrences/projects reflect the current truth, never a daily
// accumulation. A weakness that stops recurring decays out of the window; a
// signature already patched/dismissed is never auto-reopened (see db.upsertTrainingSignal).
//
// The governor decides auto-vs-review later; here we only surface a signal once a
// weakness is REAL (a genuine repeat, or any human correction). One-offs are noise.

const db = require('../db');

// These two MUST stay in lock-step with governor.AUTO_POLICY (minOccurrences/minProjects)
// — the aggregator emits the evidence, the governor reads it back to decide auto-vs-review.
// If you change the bar, change it in BOTH places (governor.mjs AUTO_POLICY ↔ here).
const DEFAULTS = {
  windowDays: 30,
  minOccurrences: 3, // ↔ governor.AUTO_POLICY.minOccurrences
  minProjects: 2,    // ↔ governor.AUTO_POLICY.minProjects
};

// Runs whose agent we can't attribute to a specific specialist — skip (a signal
// on "custom"/"system" can't be turned into an agent .md patch).
const UNATTRIBUTABLE = new Set(['custom', 'system', 'unknown', '', null, undefined]);

// ── Normalization ────────────────────────────────────────────────────────────

// Free text → a stable signature key, so the SAME weakness across different runs
// and projects collapses to ONE signal. Strip volatile detail (paths, line:col,
// numbers, hex, uuids, punctuation) + ultra-common filler; lowercase; cap length.
function normalizeSignature(text, max = 90) {
  if (!text) return '';
  let s = String(text).toLowerCase();
  s = s.replace(/[a-z]:\\[^\s'"`)]+/g, ' ');          // windows paths
  s = s.replace(/\/[^\s'"`),]+/g, ' ');                // unix paths / file refs
  s = s.replace(/[0-9a-f]{8}-[0-9a-f-]{8,}/g, ' ');    // uuid-ish
  s = s.replace(/0x[0-9a-f]+/g, ' ');                  // hex
  s = s.replace(/\b\d[\d.:]*\b/g, ' ');                // numbers / line:col / versions
  s = s.replace(/[^a-z0-9]+/g, ' ');                   // collapse punctuation
  s = s.replace(/\b(the|a|an|of|in|on|at|to|is|was|for|with|and|or|this|that|it|its)\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, max).trim();
}

// agent_runs.metadata.projectId is base64 of an absolute path (e.g.
// "/Users/.../Rankora" → "Rankora"). Some rows store a plain slug. Treat as base64
// ONLY when the decode is fully printable AND path-shaped; else use the raw value.
function decodeProject(projectId) {
  if (!projectId) return null;
  const raw = String(projectId);
  try {
    const dec = Buffer.from(raw, 'base64').toString('utf8');
    if (/^[\x20-\x7e]+$/.test(dec) && dec.includes('/')) {
      return dec.split('/').filter(Boolean).pop() || raw;
    }
  } catch { /* not base64 — fall through */ }
  return raw;
}

// VS Code / Playground runs carry a sessionId but usually NO projectId (the digest
// captures the SESSION's project; the run/inbox row doesn't echo the path). Those rows
// used to collapse to 'unknown', so a genuine cross-project weakness from VS Code work
// could never reach the 2-distinct-project auto bar — it stayed stuck at review forever.
// We recover the real project from vscode_session.project, keyed by sessionId. Built
// ONCE per scan (one query, not N) and shared across all three scanners.
function loadSessionProjectMap() {
  const map = new Map();
  try {
    const rows = db.getDb().prepare(
      "SELECT sessionId, project FROM vscode_session WHERE project IS NOT NULL AND project != ''"
    ).all();
    for (const r of rows) if (r.sessionId && r.project) map.set(r.sessionId, String(r.project));
  } catch { /* table absent in a minimal probe DB — fall back to 'unknown' */ }
  return map;
}

// Resolve a row to its real project: an explicit project / decoded projectId wins;
// otherwise recover it from the session map; otherwise 'unknown'.
function resolveProject({ project, projectId, sessionId } = {}, sessionMap) {
  const direct = project || decodeProject(projectId);
  if (direct && direct !== 'unknown') return direct;
  if (sessionId && sessionMap && sessionMap.has(sessionId)) return sessionMap.get(sessionId);
  return 'unknown';
}

// Meets the governor's auto bar → 'high' severity hint; weaker repeat → 'medium'.
function severityFor(occurrences, projectCount, cfg) {
  return (occurrences >= cfg.minOccurrences && projectCount >= cfg.minProjects) ? 'high' : 'medium';
}

// ── Emit (idempotent set-mode write + first-detection timeline log) ──────────

function emitSignal(payload) {
  try {
    const res = db.upsertTrainingSignal({ ...payload, mode: 'set' }); // { id, occurrences, projects, isNew }
    if (!res) return null;
    // Timeline event ONLY on first detection — a daily re-scan of an already-known
    // signal must not spam the Brain timeline. (Decisions/patches log their own events.)
    if (res.isNew) {
      try {
        db.logSelfImprovement({
          kind: 'signal',
          agent: payload.agent,
          refId: res.id,
          decision: null,
          summary: `${payload.kind} · ${payload.agent}: "${String(payload.signature).slice(0, 60)}" ×${res.occurrences}/${(res.projects || []).length}proj`,
          data: { kind: payload.kind, occurrences: res.occurrences, projects: res.projects },
        });
      } catch { /* timeline best-effort */ }
    }
    return { id: res.id, agent: payload.agent, kind: payload.kind, signature: payload.signature, occurrences: res.occurrences, projects: res.projects, isNew: res.isNew };
  } catch (e) {
    if (process.env.DEBUG_BRAIN) console.warn('[brainSignals] emit failed:', e.message);
    return null;
  }
}

// ── Source 1 — failure clusters from agent_runs ──────────────────────────────

function scanFailures(cfg, sessionMap) {
  const out = [];
  let runs = [];
  try { runs = db.getRecentAgentRuns(cfg.windowDays * 24) || []; } catch { runs = []; }
  const groups = new Map(); // `${agent}|${sig}` → { agent, sig, count, projects:Set, sample }
  for (const r of runs) {
    if (r.status !== 'error' && r.status !== 'failed') continue;
    const agent = r.agentName || 'unknown';
    if (UNATTRIBUTABLE.has(agent)) continue;
    const sig = normalizeSignature(r.error || r.prompt || '');
    if (!sig || sig.length < 6) continue; // too thin to be a real signature
    const proj = resolveProject({ projectId: r.metadata && r.metadata.projectId, sessionId: r.metadata && r.metadata.sessionId }, sessionMap);
    const key = `${agent}|${sig}`;
    let g = groups.get(key);
    if (!g) { g = { agent, sig, count: 0, projects: new Set(), sample: r.error || r.prompt || '' }; groups.set(key, g); }
    g.count += 1;
    g.projects.add(proj);
  }
  for (const g of groups.values()) {
    if (g.count < 2) continue; // a single failure isn't a pattern
    const projects = [...g.projects];
    const sig = emitSignal({
      agent: g.agent, kind: 'failure_cluster', signature: g.sig,
      occurrences: g.count, projects,
      severity: severityFor(g.count, projects.length, cfg),
      evidence: { source: 'agent_runs', sample: String(g.sample).slice(0, 240) },
    });
    if (sig) out.push(sig);
  }
  return { scanned: runs.length, emitted: out };
}

// ── Source 2 — Yash/Sage corrections from training_corrections ───────────────
// A human correction is the STRONGEST signal (kind 'yash_correction' clears the
// governor's bar on its own). One occurrence is enough to surface it.

function scanCorrections(cfg) {
  const out = [];
  let rows = [];
  try {
    rows = db.getDb().prepare(
      "SELECT * FROM training_corrections WHERE timestamp >= ? AND (status IS NULL OR status NOT IN ('reverted','dismissed')) ORDER BY timestamp DESC LIMIT 500"
    ).all(new Date(Date.now() - cfg.windowDays * 24 * 3600000).toISOString());
  } catch { rows = []; }
  // Group by (agent, normalized issue) so the same correction theme counts once.
  const groups = new Map();
  for (const r of rows) {
    const agent = r.agentName || 'unknown';
    if (UNATTRIBUTABLE.has(agent)) continue;
    const sig = normalizeSignature(r.issue || r.correction || '');
    if (!sig || sig.length < 6) continue;
    const key = `${agent}|${sig}`;
    let g = groups.get(key);
    if (!g) { g = { agent, sig, count: 0, issue: r.issue || '', correction: r.correction || '' }; groups.set(key, g); }
    g.count += 1;
  }
  for (const g of groups.values()) {
    const sig = emitSignal({
      agent: g.agent, kind: 'yash_correction', signature: g.sig,
      occurrences: g.count, projects: [], severity: 'p0',
      evidence: { source: 'training_corrections', issue: String(g.issue).slice(0, 240), correction: String(g.correction).slice(0, 240) },
    });
    if (sig) out.push(sig);
  }
  return { scanned: rows.length, emitted: out };
}

// ── Source 3 — antipatterns from the VS Code learning inbox ──────────────────
// The digest captures bugs/lessons with a root_cause + project. We treat a bug (or
// a lesson whose payload names a clear root_cause) as an antipattern signal,
// grouped by signature across projects. Attribute to an agent when the payload
// names one; otherwise bucket under a domain tag (still useful as a cross-project
// trend, just not auto-patchable — the governor will route it to review).

function scanLearningAntipatterns(cfg, sessionMap) {
  const out = [];
  let rows = [];
  try {
    // Pull recent inbox items; the digest is the rework/antipattern stream.
    rows = db.listLearningInbox({ limit: 500 }) || [];
  } catch { rows = []; }
  const cutoff = new Date(Date.now() - cfg.windowDays * 24 * 3600000).toISOString();
  const groups = new Map();
  let considered = 0;
  for (const r of rows) {
    if (r.createdAt && r.createdAt < cutoff) continue;
    if (r.type !== 'bug' && r.type !== 'lesson') continue;
    let payload = {};
    try { payload = JSON.parse(r.payload || '{}'); } catch { payload = {}; }
    const rootCause = payload.root_cause || payload.rootCause || '';
    // Lessons only qualify when they carry a concrete root cause (else they're
    // positive patterns, not weaknesses).
    if (r.type === 'lesson' && !rootCause) continue;
    considered += 1;
    const agent = (payload.agent || payload.owner || '').toString().toLowerCase().trim();
    const bucket = UNATTRIBUTABLE.has(agent) ? `domain:${(payload.domain || 'general')}` : agent;
    const sig = normalizeSignature(`${r.title} ${rootCause}`);
    if (!sig || sig.length < 6) continue;
    const proj = resolveProject({ project: r.project, sessionId: r.sessionId }, sessionMap);
    const key = `${bucket}|${sig}`;
    let g = groups.get(key);
    if (!g) { g = { agent: bucket, sig, count: 0, projects: new Set(), title: r.title, rootCause }; groups.set(key, g); }
    g.count += 1;
    g.projects.add(proj);
  }
  for (const g of groups.values()) {
    if (g.count < 2) continue; // a one-off digest item isn't a cross-project pattern
    const projects = [...g.projects];
    const sig = emitSignal({
      agent: g.agent, kind: 'antipattern', signature: g.sig,
      occurrences: g.count, projects,
      severity: severityFor(g.count, projects.length, cfg),
      evidence: { source: 'learning_inbox', title: String(g.title).slice(0, 160), root_cause: String(g.rootCause).slice(0, 240) },
    });
    if (sig) out.push(sig);
  }
  return { scanned: considered, emitted: out };
}

// ── Public entry — the daily aggregator ──────────────────────────────────────

function detectCrossProjectSignals(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  // One shared sessionId→project map: recovers the real project for VS Code/Playground
  // rows that carry only a sessionId, so they reach the cross-project auto bar (FIX #7).
  const sessionMap = loadSessionProjectMap();
  const failures = scanFailures(cfg, sessionMap);
  const corrections = scanCorrections(cfg); // corrections carry no project (P0 regardless)
  const antipatterns = scanLearningAntipatterns(cfg, sessionMap);

  const all = [...failures.emitted, ...corrections.emitted, ...antipatterns.emitted];
  const newCount = all.filter((s) => s && s.isNew).length;
  const atBar = all.filter((s) => s && s.occurrences >= cfg.minOccurrences && (s.projects || []).length >= cfg.minProjects).length;

  return {
    scanned: { runs: failures.scanned, corrections: corrections.scanned, inbox: antipatterns.scanned },
    emitted: all.length,
    new: newCount,
    atAutoBar: atBar,
    byKind: {
      failure_cluster: failures.emitted.length,
      yash_correction: corrections.emitted.length,
      antipattern: antipatterns.emitted.length,
    },
    signals: all,
  };
}

module.exports = {
  detectCrossProjectSignals,
  normalizeSignature, // exported for tests + the trainer's signature matching
  decodeProject,
  resolveProject,        // exported for tests (FIX #7 — session→project recovery)
  loadSessionProjectMap,
};
