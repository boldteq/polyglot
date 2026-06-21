'use strict';

const { Router } = require('express');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const configService = require('../lib/configService');
const agentSync = require('../lib/agentSync');

const router = Router();

// ── Learning Inbox event bus (drives the sidebar badge over SSE) ─────────────
const inboxEvents = new EventEmitter();
inboxEvents.setMaxListeners(50);
// The nightly digest stages candidates directly in the DB then emits this on the
// global bus — bridge it to inbox SSE clients so the badge updates live.
try {
  agentSync.events.on('learning.candidate', (p) => {
    try { inboxEvents.emit('candidate', p || {}); } catch { /* best-effort */ }
  });
} catch { /* agentSync optional */ }

function loadAgentLearning() {
  const d = db.loadAgentLearning();
  return d.agents ? d : { agents: {}, taskTypes: {}, routing: {}, updatedAt: null };
}
function saveAgentLearning(data) {
  data.updatedAt = new Date().toISOString();
  db.saveAgentLearning(data);
}

function loadClaims() { return db.loadClaims(); }
function saveClaims(data) { db.saveClaims(data); }

const DEFAULT_COSTS = {
  haiku: { input: 0.25, output: 1.25, label: 'Fast & cheap' },
  sonnet: { input: 3, output: 15, label: 'Balanced' },
  opus: { input: 15, output: 75, label: 'Deep reasoning' },
};

// Rules now come from the `model_policy` SQLite table (Phase 2). Costs +
// downgrade rules + totalMonthlyBudgetUsd still live in the existing
// `model_routing` singleton blob. Merge them here so the API surface stays
// stable for callers.
function loadModelRouting() {
  const d = db.loadModelRouting() || {};
  const policyRows = configService.listModelPolicy() || [];
  const rules = policyRows.length > 0
    ? policyRows.map((r) => ({
        pattern: r.pattern,
        model: r.model,
        tier: r.tier,
        agents: r.agents || [],
      }))
    : Array.isArray(d.rules) ? d.rules : [];
  return {
    ...d,
    rules,
    costs: d.costs || DEFAULT_COSTS,
    updatedAt: d.updatedAt || new Date().toISOString(),
  };
}
function saveModelRouting(data) {
  data.updatedAt = new Date().toISOString();
  db.saveModelRouting(data);
}

function recordLearning(agentName, taskType, outcome) {
  const learningDb = loadAgentLearning();

  if (!learningDb.agents[agentName]) {
    learningDb.agents[agentName] = {
      totalRuns: 0, successRuns: 0, failedRuns: 0,
      avgDuration: 0, avgTokens: 0, avgCost: 0,
      taskTypes: {},
      streak: 0, bestStreak: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: null,
    };
  }
  const agent = learningDb.agents[agentName];
  agent.totalRuns++;
  agent.lastSeen = new Date().toISOString();

  if (outcome.success) {
    agent.successRuns++;
    agent.streak = Math.max(0, agent.streak) + 1;
    agent.bestStreak = Math.max(agent.bestStreak, agent.streak);
  } else {
    agent.failedRuns++;
    agent.streak = 0;
  }

  const alpha = 0.1;
  agent.avgDuration = agent.avgDuration === 0 ? (outcome.duration || 0) :
    agent.avgDuration * (1 - alpha) + (outcome.duration || 0) * alpha;
  agent.avgTokens = agent.avgTokens === 0 ? (outcome.tokens || 0) :
    agent.avgTokens * (1 - alpha) + (outcome.tokens || 0) * alpha;
  agent.avgCost = agent.avgCost === 0 ? (outcome.cost || 0) :
    agent.avgCost * (1 - alpha) + (outcome.cost || 0) * alpha;

  const tt = taskType || 'general';
  if (!agent.taskTypes[tt]) {
    agent.taskTypes[tt] = { runs: 0, successes: 0, avgDuration: 0 };
  }
  const tts = agent.taskTypes[tt];
  tts.runs++;
  if (outcome.success) tts.successes++;
  tts.avgDuration = tts.avgDuration * (1 - alpha) + (outcome.duration || 0) * alpha;

  if (!learningDb.taskTypes[tt]) {
    learningDb.taskTypes[tt] = { bestAgent: null, bestRate: 0, agents: {} };
  }
  learningDb.taskTypes[tt].agents[agentName] = {
    successRate: Math.round((tts.successes / tts.runs) * 100),
    avgDuration: Math.round(tts.avgDuration),
    runs: tts.runs,
  };

  let bestAgent = null, bestRate = 0;
  for (const [name, stats] of Object.entries(learningDb.taskTypes[tt].agents)) {
    if (stats.runs >= 3 && stats.successRate > bestRate) {
      bestRate = stats.successRate;
      bestAgent = name;
    }
  }
  learningDb.taskTypes[tt].bestAgent = bestAgent;
  learningDb.taskTypes[tt].bestRate = bestRate;

  saveAgentLearning(learningDb);
  return { agent: agentName, taskType: tt, successRate: Math.round((agent.successRuns / agent.totalRuns) * 100) };
}

// Cleanup stale claims every 5 minutes — window from app_config.time.claim_expiry_minutes
setInterval(() => {
  try {
    const claims = loadClaims();
    const claimMinutes = configService.getConfig('time.claim_expiry_minutes') ?? 30;
    const cutoff = Date.now() - claimMinutes * 60 * 1000;
    let cleaned = 0;
    for (const [taskId, claim] of Object.entries(claims)) {
      if (new Date(claim.claimedAt).getTime() < cutoff && claim.status === 'active') {
        claim.status = 'expired';
        cleaned++;
      }
    }
    if (cleaned > 0) saveClaims(claims);
  } catch {}
  // Prune old reviewed/auto learning-inbox rows (cheap DELETEs; keep pending+approved).
  try { db.pruneLearningInbox(); } catch (err) { console.error('[learning] prune inbox failed:', err.message); }
}, 5 * 60 * 1000);

// ── Learning Inbox: review queue for auto-extracted VS Code learnings ────────

// GET /api/learning/inbox?status=pending&sessionId=&project=
router.get('/learning/inbox', rateLimit('read'), (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const items = db.listLearningInbox({
      status,
      sessionId: req.query.sessionId || undefined,
      project: req.query.project || undefined,
    });
    res.json({ items, counts: db.getInboxCounts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/learning/inbox/counts — badge + initial load (and SSE-disconnect fallback)
router.get('/learning/inbox/counts', rateLimit('read'), (req, res) => {
  try {
    res.json(db.getInboxCounts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared digest-status builder (used by /learning/status + /learning/overview).
// Built from the run's METADATA (agent_runs stores no output text), so the
// learningDigest handler must keep returning { sessions, captured, staged, deduped, scan }.
function buildStatus() {
  const runs = db.getScheduleRunsFor('sys-learning-digest', { limit: 1 });
  const last = runs[0] || null;
  const m = (last && last.metadata) || {};
  const summary = last
    ? `${m.sessions || 0} session(s) → ${m.captured || 0} captured, ${m.staged || 0} staged, ${m.deduped || 0} deduped`
    : null;
  let nextRunAt = null;
  try { nextRunAt = require('../lib/systemSchedules').computeNextRunAt('0 4 * * *'); } catch { /* ignore */ }
  return {
    lastRunAt: last ? last.timestamp : null,
    lastRunStatus: last ? last.status : null,
    lastRunSummary: summary,
    sessionsScanned: m.scan ? (m.scan.scanned ?? null) : null,
    captured: m.captured ?? null,
    staged: m.staged ?? null,
    deduped: m.deduped ?? null,
    scan: m.scan ? { upserted: m.scan.upserted ?? 0, repended: m.scan.repended ?? 0 } : null,
    nextRunAt,
  };
}

// GET /api/learning/status — last digest run summary for the Learning page header.
router.get('/learning/status', rateLimit('read'), (req, res) => {
  try { res.json(buildStatus()); } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/learning/overview — everything the Learning "Overview" tab needs in one
// fetch: inbox counts, last-digest status, sessions-digested stats, recent digest
// runs (for the mini chart), and the most recent captured learnings.
router.get('/learning/overview', rateLimit('read'), async (req, res) => {
  try {
    const counts = db.getInboxCounts();
    const status = buildStatus();
    const sessions = db.getDigestedSessionStats();

    const runRows = db.getScheduleRunsFor('sys-learning-digest', { limit: 12 });
    const runs = runRows.map((r) => {
      const m = r.metadata || {};
      return {
        id: r.id, timestamp: r.timestamp, status: r.status, durationMs: r.duration || 0,
        sessions: m.sessions || 0, captured: m.captured || 0, staged: m.staged || 0, deduped: m.deduped || 0,
      };
    });
    const deduped7d = runs.reduce((a, r) => a + (r.deduped || 0), 0);

    // Captured ledger (the single source of truth — counts data/intel/*.jsonl) +
    // recent items. captureStats is no-double-count: jsonl is written once per capture.
    let captured = { total: 0, byType: {}, byOrigin: {}, last7d: 0, prev7d: 0, weekly: [] };
    let recent = [];
    try {
      const { captureStats, recentItems } = await import('../intelligence/capture.mjs');
      captured = captureStats();
      const titleOf = (it) => it.problem || it.symptom || it.decision || it.title || it.directive || '(untitled)';
      const pick = (type, n) => (recentItems(type, n) || []).map((it) => ({
        id: it.id, type, title: String(titleOf(it)).slice(0, 120),
        project: it.project || it.domain || it.scope || null, created_at: it.created_at || null,
      }));
      recent = [...pick('lesson', 8), ...pick('bug', 5), ...pick('decision', 5), ...pick('golden', 3)]
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 15);
    } catch (err) {
      console.error('[learning/overview] capture ledger unavailable:', err.message);
    }

    // By-source breakdown (sums to captured.total — direct absorbs legacy/agent/other).
    const o = captured.byOrigin || {};
    const autoSaved = o['vscode-digest'] || 0;
    const reviewed = o['review'] || 0;
    const bySource = { autoSaved, reviewed, direct: Math.max(0, captured.total - autoSaved - reviewed) };

    // Memory-brain context — counts the broader stores so the 131 Mira patterns +
    // feedback directives are VISIBLE (kept distinct from the structured ledger).
    const fs = require('fs'), os = require('os'), path = require('path');
    const memory = { patterns: 0, feedbackDirectives: 0 };
    try {
      const base = path.join(os.homedir(), '.claude', 'memory', 'patterns');
      for (const sub of ['good', 'avoid']) {
        try { memory.patterns += fs.readdirSync(path.join(base, sub)).filter((f) => f.endsWith('.md')).length; } catch { /* dir absent */ }
      }
    } catch { /* ignore */ }
    try {
      const fb = fs.readFileSync(path.join(os.homedir(), '.claude', 'memory', 'user', 'feedback.md'), 'utf-8');
      memory.feedbackDirectives = (fb.match(/^## ★ /gm) || []).length;
    } catch { /* ignore */ }

    // Improvement — honest, real-data, with a "building baseline" guard on thin data.
    const rr = db.getRealRunStats();
    const rate = (w) => (w.total > 0 ? Math.round((w.success / w.total) * 100) : null);
    const sample = rr.thisWeek.total + rr.prevWeek.total;
    const enough = sample >= 8;
    const improvement = {
      enough, sample,
      thisWeekPct: rate(rr.thisWeek), prevWeekPct: rate(rr.prevWeek),
      deltaPct: (enough && rate(rr.thisWeek) !== null && rate(rr.prevWeek) !== null) ? rate(rr.thisWeek) - rate(rr.prevWeek) : null,
      qualityMean: null, qualitySample: 0,
    };
    try {
      const scores = (db.getEvalScores ? db.getEvalScores({ limit: 200 }) : []) || [];
      const sc = scores.filter((s) => typeof s.overall === 'number');
      if (sc.length) { improvement.qualityMean = +(sc.reduce((a, s) => a + s.overall, 0) / sc.length).toFixed(2); improvement.qualitySample = sc.length; }
    } catch { /* eval optional */ }

    res.json({ counts, status, sessions, deduped7d, runs, recent, captured, bySource, memory, improvement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/learning/inbox/stream — SSE: ready / candidate / reviewed
router.get('/learning/inbox/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  try { send('ready', { pending: db.getInboxCounts().pending }); } catch { /* ignore */ }

  const onCandidate = (p) => send('candidate', p);
  const onReviewed = (p) => send('reviewed', p);
  inboxEvents.on('candidate', onCandidate);
  inboxEvents.on('reviewed', onReviewed);

  const heartbeat = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { /* closed */ } }, 25_000);
  const cleanup = () => {
    clearInterval(heartbeat);
    inboxEvents.off('candidate', onCandidate);
    inboxEvents.off('reviewed', onReviewed);
  };
  req.on('close', cleanup);
  req.on('end', cleanup);
});

// PATCH /api/learning/inbox/:id — edit title/payload while pending
router.patch('/learning/inbox/:id', rateLimit('write'), (req, res) => {
  try {
    const { title, payload } = req.body || {};
    const r = db.updateLearningPayload(req.params.id, { title, payload });
    if (!r.changed) return res.status(409).json({ error: 'Candidate not found or no longer pending' });
    res.json({ ok: true, candidate: db.getLearningCandidate(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Append-only IDENTITY-LOCK ledger. Every L1/L5 identity change (added/superseded)
// that a human signs off in the inbox is recorded here, never rewritten — the audit
// trail for "the constitution is never silently self-modified" (Yash, 2026-06-18).
const IDENTITY_CHANGELOG = path.join(os.homedir(), '.claude', 'org', 'identity-changelog.md');
function appendIdentityChangelog({ action, kind, statement, scope, candidateId, oldId, newId }) {
  try {
    fs.mkdirSync(path.dirname(IDENTITY_CHANGELOG), { recursive: true });
    if (!fs.existsSync(IDENTITY_CHANGELOG)) {
      fs.writeFileSync(IDENTITY_CHANGELOG,
        '# Identity Changelog (append-only)\n\n' +
        'Every identity/preference fact change signed off by Yash via the Learning Inbox.\n' +
        'IDENTITY-LOCK: nothing here is auto-written — each entry corresponds to a human approve.\n\n');
    }
    const ts = new Date().toISOString();
    const refs = [
      `signoff=inbox:${candidateId}`,
      oldId ? `old=${oldId}` : null,
      newId ? `new=${newId}` : null,
      scope ? `scope=${scope}` : null,
    ].filter(Boolean).join(' ');
    const line = `- ${ts} **${action}** [${kind}] ${String(statement || '').replace(/\n/g, ' ').slice(0, 240)} — ${refs}\n`;
    fs.appendFileSync(IDENTITY_CHANGELOG, line);
    return IDENTITY_CHANGELOG;
  } catch (err) {
    // Never let a changelog write failure undo an already-committed identity write.
    console.error('[identity-changelog] append failed:', err.message);
    return null;
  }
}

// POST /api/learning/inbox/:id/approve — write to memory (lesson/bug/decision/golden)
// or append to feedback.md (feedback), or — for the continuity-brain candidate types
// — commit a human-signed-off identity/preference change, supersede a contradiction,
// open a loop, or acknowledge a decay review. Keeps the row 'pending' on capture
// failure so it can be retried (e.g. Ollama was down).
// Shared approve path for one candidate. Returns a result object instead of
// touching res, so both the single and bulk endpoints reuse identical capture
// logic + race/status guards. Throws only on capture failure (keeps it pending).
async function approveOne(id) {
  const cand = db.getLearningCandidate(id);
  if (!cand) return { id, ok: false, status: 404, error: 'Candidate not found' };
  if (cand.status !== 'pending') return { id, ok: false, status: 409, error: `Already ${cand.status}` };

  let capturedRef = null;
  let skipped = false;
  if (cand.type === 'feedback') {
    const f = cand.payload || {};
    const { appendFeedback } = await import('../intelligence/feedbackWriter.mjs');
    const r = await appendFeedback({ title: cand.title, directive: f.directive || cand.title, context: f.context || '' });
    capturedRef = r.anchor;
    skipped = !!r.skipped; // directive already existed — counted as approved, no duplicate written
    // The approve IS the human write to feedback.md → flip the structured event.
    if (!skipped && f.feedbackEventId) {
      try { db.setFeedbackEventApplied(f.feedbackEventId); } catch (e) { console.error('[feedback-event] flip failed:', e.message); }
    }
  } else if (cand.type === 'lesson' || cand.type === 'bug' || cand.type === 'decision' || cand.type === 'golden') {
    const { captureItem } = await import('../intelligence/capture.mjs');
    const r = await captureItem(cand.type, cand.payload || {}, 'review');
    capturedRef = r.id;
  } else if (cand.type === 'identity' || cand.type === 'preference') {
    // The inbox approve IS the Yash sign-off → bySignoff:true is justified here and
    // ONLY here. identity carries its own kind (value|voice|non_negotiable|opinion);
    // preference candidates write the 'preference' kind.
    const p = cand.payload || {};
    const kind = cand.type === 'preference' ? 'preference' : (p.kind || 'opinion');
    const r = db.insertIdentityFact({
      kind,
      statement: p.statement || cand.title,
      detail: p.detail || null,
      scope: p.scope || 'global',
      confidence: p.confidence != null ? Number(p.confidence) : 1.0,
      source: `inbox:${id}`,
      bySignoff: true,
    });
    capturedRef = r.id;
    appendIdentityChangelog({ action: 'added', kind, statement: p.statement || cand.title, scope: p.scope || 'global', candidateId: id, newId: r.id });
  } else if (cand.type === 'contradiction') {
    // Belief revision: write the new fact (signed off) then mark the old one superseded.
    const p = cand.payload || {};
    const kind = p.kind || 'opinion';
    const r = db.insertIdentityFact({
      kind,
      statement: p.statement || cand.title,
      detail: p.detail || null,
      scope: p.scope || 'global',
      confidence: p.confidence != null ? Number(p.confidence) : 1.0,
      source: `inbox:${id}`,
      bySignoff: true,
    });
    if (p.oldId) { try { db.supersedeIdentityFact(p.oldId, r.id); } catch (e) { console.error('[contradiction] supersede failed:', e.message); } }
    capturedRef = r.id;
    appendIdentityChangelog({ action: 'superseded', kind, statement: p.statement || cand.title, scope: p.scope || 'global', candidateId: id, oldId: p.oldId || null, newId: r.id });
  } else if (cand.type === 'open_loop') {
    const p = cand.payload || {};
    const r = db.insertOpenLoop({
      title: p.title || cand.title,
      detail: p.detail || null,
      owner: p.owner || 'claude',
      project: p.project || null,
      sessionId: p.sessionId || null,
      dueAt: p.dueAt || null,
      source: 'inbox',
    });
    capturedRef = r.id;
  } else if (cand.type === 'decay_review') {
    // Review-only acknowledgement — no memory write. Record that a human triaged it.
    capturedRef = null;
    try {
      db.logSelfImprovement({ kind: 'hygiene', summary: `decay review acknowledged: ${cand.title}`, data: cand.payload || {} });
    } catch { /* logging is best-effort; the status flip below is the real record */ }
  } else if (cand.type === 'calibration') {
    // Lens calibration (WS-G): approve = Yash AGREES with the judge's verdict on this frame/check.
    const p = cand.payload || {};
    db.insertCalibrationGrade({ frameKey: p.frameKey || p.key, check: p.check, surface: p.surface, lensVerdict: p.lensVerdict || p.verdict, grade: 'agree', candidateId: id });
    capturedRef = id;
  } else {
    return { id, ok: false, status: 400, error: `Unsupported candidate type: ${cand.type}` };
  }

  const upd = db.updateLearningStatus(id, { status: 'approved', capturedRef });
  if (!upd.changed) return { id, ok: false, status: 409, error: 'Lost the race — already reviewed' };
  try { inboxEvents.emit('reviewed', { id, status: 'approved' }); } catch { /* ignore */ }
  // Live memory (Phase D.1): a human-approved memory write must wake the 60s reindex
  // drain so the new/superseded belief is searchable in ~1min — not at the 02:30 cron.
  // feedback (feedback.md, human-only path) + decay_review (no write) are intentionally
  // excluded. Best-effort: a miss is caught by the nightly full reindex.
  const REINDEX_ON_APPROVE = new Set(['lesson', 'bug', 'decision', 'golden', 'identity', 'preference', 'contradiction']);
  if (capturedRef && REINDEX_ON_APPROVE.has(cand.type)) {
    try { require('../lib/systemSchedules').enqueueMemoryChange(capturedRef, `approve:${cand.type}`); }
    catch (e) { console.error('[learning-approve] reindex enqueue failed:', e.message); }
  }
  return { id, ok: true, capturedRef, skipped };
}

// Shared reject path for one candidate. Pure status flip, no capture — EXCEPT calibration items,
// where a reject means "the Lens judge was WRONG" → record the disagree grade before discarding (WS-G).
function rejectOne(id) {
  try {
    const cand = db.getLearningCandidate(id);
    if (cand && cand.type === 'calibration' && cand.status === 'pending') {
      const p = cand.payload || {};
      db.insertCalibrationGrade({ frameKey: p.frameKey || p.key, check: p.check, surface: p.surface, lensVerdict: p.lensVerdict || p.verdict, grade: 'disagree', candidateId: id });
    }
  } catch (e) { console.error('[learning-reject] calibration grade failed:', e.message); }
  const upd = db.updateLearningStatus(id, { status: 'rejected' });
  if (!upd.changed) return { id, ok: false, status: 409, error: 'Not found or already reviewed' };
  try { inboxEvents.emit('reviewed', { id, status: 'rejected' }); } catch { /* ignore */ }
  return { id, ok: true };
}

router.post('/learning/inbox/:id/approve', rateLimit('write'), async (req, res) => {
  try {
    const r = await approveOne(req.params.id);
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    res.json({ ok: true, capturedRef: r.capturedRef, skipped: r.skipped });
  } catch (err) {
    // Capture/append failed (e.g. Ollama unreachable) — leave it pending, retryable.
    res.status(500).json({ error: err.message, hint: 'Is Ollama running? The candidate stays pending — retry after fixing.' });
  }
});

// POST /api/learning/inbox/:id/reject
router.post('/learning/inbox/:id/reject', rateLimit('write'), (req, res) => {
  try {
    const r = rejectOne(req.params.id);
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/learning/inbox/bulk-approve  { ids: string[] }
// Processes each id independently (capture can fail per-item, e.g. Ollama down).
// Returns per-id results so the client knows which stayed pending. 200 even on
// partial failure — the body carries the breakdown.
router.post('/learning/inbox/bulk-approve', rateLimit('write'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string') : [];
  if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array of strings' });
  if (ids.length > 200) return res.status(400).json({ error: 'Too many ids (max 200 per batch)' });

  const results = [];
  for (const id of ids) {
    try {
      results.push(await approveOne(id));
    } catch (err) {
      // Capture failed — candidate stays pending, retryable.
      results.push({ id, ok: false, status: 500, error: err.message });
    }
  }
  const approved = results.filter((r) => r.ok).map((r) => r.id);
  const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error }));
  res.json({ ok: failed.length === 0, approved, failed, total: ids.length });
});

// POST /api/learning/inbox/bulk-reject  { ids: string[] }
router.post('/learning/inbox/bulk-reject', rateLimit('write'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string') : [];
  if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array of strings' });
  if (ids.length > 200) return res.status(400).json({ error: 'Too many ids (max 200 per batch)' });

  const results = ids.map((id) => {
    try { return rejectOne(id); }
    catch (err) { return { id, ok: false, status: 500, error: err.message }; }
  });
  const rejected = results.filter((r) => r.ok).map((r) => r.id);
  const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error }));
  res.json({ ok: failed.length === 0, rejected, failed, total: ids.length });
});

// POST /api/feedback — the one-keystroke "/feedback" capture path. Records the
// correction as a STRUCTURED feedback_event immediately, then STAGES a feedback
// candidate into the Learning Inbox. CRITICAL (Yash, 2026-06-18): feedback.md stays
// human-only — this never writes the file. Only a human approve of the staged
// candidate runs appendFeedback (and flips appliedToFeedbackMd via feedbackEventId).
router.post('/feedback', rateLimit('write'), (req, res) => {
  try {
    const { directive, context = null, severity = 'normal', project = null, sessionId = null, source = 'manual' } = req.body || {};
    if (!directive || !String(directive).trim()) {
      return res.status(400).json({ error: 'directive is required' });
    }
    const sev = severity === 'p0' ? 'p0' : 'normal';
    const ev = db.insertFeedbackEvent({ directive, context, severity: sev, project, sessionId, source: source === 'manual' ? '/feedback' : source });
    if (!ev) return res.status(400).json({ error: 'directive is required' });

    const title = String(directive).trim().slice(0, 120);
    const cand = db.insertLearningCandidate({
      type: 'feedback',
      title,
      source: 'feedback-command',
      confidence: sev === 'p0' ? 0.95 : 0.7,
      payload: { directive: String(directive).trim(), context: context || '', severity: sev, feedbackEventId: ev.id },
    });
    try { inboxEvents.emit('candidate', { id: cand?.id, type: 'feedback', title }); } catch { /* best-effort */ }
    res.json({ ok: true, feedbackEventId: ev.id, candidateId: cand?.id || null, staged: !!cand?.id, note: 'Staged for review — feedback.md is written only on your approve.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/learning
router.get('/learning', rateLimit('read'), (req, res) => {
  res.json(loadAgentLearning());
});

// GET /api/learning/route/:taskType
router.get('/learning/route/:taskType', rateLimit('read'), (req, res) => {
  const learningDb = loadAgentLearning();
  const tt = req.params.taskType;
  const taskData = learningDb.taskTypes[tt];
  if (!taskData || !taskData.bestAgent) {
    return res.json({ taskType: tt, recommendation: null, message: 'Not enough data yet' });
  }
  res.json({
    taskType: tt,
    recommendation: taskData.bestAgent,
    successRate: taskData.bestRate,
    alternatives: Object.entries(taskData.agents)
      .sort((a, b) => b[1].successRate - a[1].successRate)
      .map(([name, stats]) => ({ name, ...stats })),
  });
});

// GET /api/learning/agent/:name
router.get('/learning/agent/:name', rateLimit('read'), (req, res) => {
  const learningDb = loadAgentLearning();
  const agent = learningDb.agents[req.params.name];
  if (!agent) return res.status(404).json({ error: 'Agent not found in learning data' });
  res.json({ name: req.params.name, ...agent, successRate: Math.round((agent.successRuns / agent.totalRuns) * 100) });
});

// POST /api/learning/record
router.post('/learning/record', rateLimit('write'), (req, res) => {
  const { agentName, taskType, success, duration, tokens, cost, feedback } = req.body;
  if (!agentName) return res.status(400).json({ error: 'agentName required' });
  const result = recordLearning(agentName, taskType, { success: !!success, duration, tokens, cost, feedback });
  res.json(result);
});

// DELETE /api/learning/agent/:name
router.delete('/learning/agent/:name', rateLimit('write'), (req, res) => {
  const learningDb = loadAgentLearning();
  delete learningDb.agents[req.params.name];
  for (const tt of Object.values(learningDb.taskTypes)) {
    delete tt.agents[req.params.name];
  }
  saveAgentLearning(learningDb);
  res.json({ ok: true });
});

// POST /api/routing/recommend
router.post('/routing/recommend', rateLimit('read'), (req, res) => {
  const { agentName, taskDescription } = req.body;
  const routing = loadModelRouting();

  for (const rule of routing.rules) {
    if (rule.agents && rule.agents.includes(agentName)) {
      return res.json({
        model: rule.model,
        tier: rule.tier,
        reason: `Agent ${agentName} defaults to ${rule.model}`,
        cost: routing.costs[rule.model],
      });
    }
  }

  if (taskDescription) {
    const desc = taskDescription.toLowerCase();
    for (const rule of routing.rules) {
      const patterns = rule.pattern.split('|');
      if (patterns.some(p => desc.includes(p.trim().toLowerCase()))) {
        return res.json({
          model: rule.model,
          tier: rule.tier,
          reason: `Task matched pattern: ${rule.pattern}`,
          cost: routing.costs[rule.model],
        });
      }
    }
  }

  const defaultModel = configService.getConfig('defaults.model') || 'sonnet'; // allowed: chained fallback
  res.json({
    model: defaultModel,
    tier: 'medium',
    reason: 'Default (no specific rule matched)',
    cost: routing.costs[defaultModel] || routing.costs.sonnet,
  });
});

// GET /api/routing
router.get('/routing', rateLimit('read'), (req, res) => {
  res.json(loadModelRouting());
});

// PUT /api/routing
router.put('/routing', rateLimit('write'), (req, res) => {
  const routing = loadModelRouting();
  if (req.body.rules) routing.rules = req.body.rules;
  if (req.body.costs) routing.costs = req.body.costs;
  saveModelRouting(routing);
  res.json({ ok: true });
});

// GET /api/routing/savings
router.get('/routing/savings', rateLimit('read'), (req, res) => {
  const runs = db.loadAgentRuns();
  const routing = loadModelRouting();

  let allOpusCost = 0, routedCost = 0;
  for (const run of runs) {
    const tokens = run.estimatedTokens || 0;
    const inputTokens = Math.ceil(tokens * 0.7);
    const outputTokens = tokens - inputTokens;

    allOpusCost += (inputTokens * 15 + outputTokens * 75) / 1_000_000;

    let model = configService.getConfig('defaults.model') || 'sonnet'; // allowed: chained fallback
    for (const rule of routing.rules) {
      if (rule.agents && rule.agents.includes(run.agentName)) { model = rule.model; break; }
    }
    const costs = routing.costs[model] || routing.costs.sonnet; // allowed: cost lookup fallback
    routedCost += (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  }

  res.json({
    totalRuns: runs.length,
    allOpusCost: Math.round(allOpusCost * 10000) / 10000,
    routedCost: Math.round(routedCost * 10000) / 10000,
    savings: Math.round((1 - routedCost / (allOpusCost || 1)) * 100),
    message: `Estimated ${Math.round((1 - routedCost / (allOpusCost || 1)) * 100)}% savings with model routing`,
  });
});

// POST /api/claims
router.post('/claims', rateLimit('write'), (req, res) => {
  const { taskId, agentName, description } = req.body;
  if (!taskId || !agentName) return res.status(400).json({ error: 'taskId and agentName required' });

  const claims = loadClaims();
  const existing = claims[taskId];

  if (existing && existing.status === 'active') {
    const age = Date.now() - new Date(existing.claimedAt).getTime();
    const claimMinutes = configService.getConfig('time.claim_expiry_minutes') ?? 30;
    if (age < claimMinutes * 60 * 1000) {
      return res.status(409).json({
        error: 'Task already claimed',
        claimedBy: existing.agentName,
        claimedAt: existing.claimedAt,
        age: Math.round(age / 1000) + 's',
      });
    }
  }

  claims[taskId] = {
    agentName,
    description: description || '',
    status: 'active',
    claimedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
  };
  saveClaims(claims);
  res.json({ ok: true, taskId, claimedBy: agentName });
});

// PUT /api/claims/:taskId
router.put('/claims/:taskId', rateLimit('write'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const { status, result } = req.body;
  claim.status = status || 'completed';
  claim.completedAt = new Date().toISOString();
  claim.result = result || null;
  saveClaims(claims);
  res.json({ ok: true, claim });
});

// POST /api/claims/:taskId/handoff
router.post('/claims/:taskId/handoff', rateLimit('write'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const { toAgent, reason } = req.body;
  if (!toAgent) return res.status(400).json({ error: 'toAgent required' });

  const previousAgent = claim.agentName;
  claim.agentName = toAgent;
  claim.claimedAt = new Date().toISOString();
  claim.handoffHistory = claim.handoffHistory || [];
  claim.handoffHistory.push({ from: previousAgent, to: toAgent, reason, at: new Date().toISOString() });
  saveClaims(claims);
  res.json({ ok: true, handoff: { from: previousAgent, to: toAgent } });
});

// GET /api/claims
router.get('/claims', rateLimit('read'), (req, res) => {
  const claims = loadClaims();
  const { status, agent } = req.query;
  let entries = Object.entries(claims).map(([taskId, c]) => ({ taskId, ...c }));
  if (status) entries = entries.filter(c => c.status === status);
  if (agent) entries = entries.filter(c => c.agentName === agent);
  res.json(entries);
});

// GET /api/claims/:taskId
router.get('/claims/:taskId', rateLimit('read'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim || claim.status !== 'active') {
    return res.json({ claimed: false });
  }
  res.json({ claimed: true, ...claim });
});

module.exports = { router, recordLearning };
