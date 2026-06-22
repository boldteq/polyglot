'use strict';

// Unified, newest-first activity timeline for a project — merges every existing
// history source into one normalized event list. All reads; no new storage.
//   event = { ts, kind, actor, summary, detail?, link? }
//   kind ∈ dispatch | action | gate | score | cost | changes
//
// HONESTY (mirrors projectFilter.js): cost_logs are platform-roster-scoped (no
// build key), and score reflections key on `client` (the dir basename == the
// project). We label cost events by agent and let the UI footnote scope.

const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { readGateReports } = require('./readGateReports');
const { rosterFor } = require('./projectFilter');
const actionRunner = require('./actionRunner');

const firstLine = (s) => String(s || '').split('\n').find((l) => l.trim()) || '';
const clip = (s, n = 140) => { const t = String(s || ''); return t.length > n ? t.slice(0, n) + '…' : t; };

// inputs: { project, build, dir, buildId, limit=50, since=null }
function buildProjectActivity({ build, dir, buildId, limit = 50, since = null } = {}) {
  const events = [];
  const push = (ts, kind, actor, summary, extra = {}) => { if (ts) events.push({ ts: new Date(ts).toISOString(), kind, actor, summary, ...extra }); };

  if (buildId && dir) {
    // 1) cockpit dispatch turns (wsd-<buildId> thread)
    try {
      const thread = db.getPlaygroundThread(`wsd-${buildId}`.slice(0, 64));
      for (const m of (thread && thread.messages) || []) {
        const who = m.role === 'user' ? 'human' : (thread.agentName || 'agent');
        push(m.timestamp, 'dispatch', who, `${m.role === 'user' ? 'Task' : (thread.agentName || 'agent')}: ${clip(firstLine(m.content), 90)}`, { detail: clip(m.content, 400), link: `/workspace/p` });
      }
    } catch { /* no thread */ }

    // 2) cockpit action runs (in-memory)
    try {
      for (const r of actionRunner.listRuns({ buildId })) {
        push(r.startedMs, 'action', 'system', `${r.action} · ${r.status}${r.exitCode != null ? ` (exit ${r.exitCode})` : ''}`, { link: r.runId });
      }
    } catch { /* */ }

    // 3) gate reports (each carries its own ts)
    try {
      for (const g of readGateReports(dir)) {
        if (!g.ts) continue;
        push(g.ts, 'gate', 'system', `gate ${g.id} · ${g.pass ? 'pass' : 'fail'}`, g.findings && g.findings.length ? { detail: clip(g.findings.map((f) => f.text || f).join(' · '), 200) } : {});
      }
    } catch { /* */ }

    // 4) CHANGES.md last-updated (file mtime — no per-line timestamps)
    try {
      const cp = path.join(dir, 'CHANGES.md');
      const st = fs.statSync(cp);
      push(st.mtime, 'changes', 'human', 'CHANGES.md updated');
    } catch { /* no CHANGES.md */ }
  }

  // 5) score-delta reflections (keyed by client == project)
  try {
    const proj = build && build.client;
    if (proj) {
      for (const r of db.getRecentReflections({ kind: 'workspace.score', project: proj, limit: 20 })) {
        push(r.ts || r.created_at, 'score', 'system', r.summary || 'score changed', r.data ? { detail: clip(JSON.stringify(r.data), 120) } : {});
      }
    }
  } catch { /* */ }

  // 6) roster cost logs (platform-scoped; last 14d). Skip $0 rows — they're
  // health/eval noise and drown the meaningful events (dispatches/gates/scores).
  try {
    const sinceCost = new Date(Date.now() - 14 * 86400000).toISOString();
    for (const agent of rosterFor('shopify')) {
      for (const row of db.getCostLogs({ agentName: agent, since: sinceCost, limit: 50 })) {
        if (Number(row.costUsd) < 0.005) continue; // rounds to $0.00 — health/eval noise
        push(row.ts, 'cost', agent, `${agent} · $${Number(row.costUsd).toFixed(2)} · ${row.model || 'model'}`, { detail: `${row.totalTokens || 0} tok`, link: row.runId });
      }
    }
  } catch { /* */ }

  // merge: filter ≥ since, sort desc, cap
  let merged = events;
  if (since) { const s = new Date(since).getTime(); merged = merged.filter((e) => new Date(e.ts).getTime() >= s); }
  merged.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const capped = merged.slice(0, Math.min(Number(limit) || 50, 200));
  return { events: capped, nextSince: capped.length ? capped[capped.length - 1].ts : null, total: capped.length };
}

module.exports = { buildProjectActivity };
