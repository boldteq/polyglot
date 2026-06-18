'use strict';

// In-memory registry of in-flight Playground runs.
//
// WHY: the `claude` process must be decoupled from the HTTP request that started
// it, so a generation KEEPS RUNNING when the browser refreshes / navigates away,
// and a returning client can RE-ATTACH to the live stream. The HTTP response(s)
// are just subscribers to a run; the process drives the run independently.
//
// A run lives here from spawn until it finishes; finished runs linger for a grace
// window so a client that reloads right at the end can still fetch the result.

const runs = new Map(); // runId -> Run

const RESULT_GRACE_MS = 180_000; // keep a finished run 3 min for late reattach

function createRun({ id, threadId, agentName, prompt }) {
  // If an id is somehow reused, evict the old one first.
  const existing = runs.get(id);
  if (existing && existing._evictTimer) clearTimeout(existing._evictTimer);
  const run = {
    id,
    threadId: threadId || null,
    agentName: agentName || 'custom',
    prompt: prompt || '',
    status: 'running',          // 'running' | 'done'
    output: '',                 // accumulated assistant text (replayed on reattach)
    startedAt: Date.now(),
    endedAt: null,
    finalEvent: null,           // terminal SSE event ('done'|'error') for late reattach
    subscribers: new Set(),     // Set<express res>
    kill: null,                 // set by the route — force-stop hook for explicit cancel
    _evictTimer: null,
  };
  runs.set(id, run);
  return run;
}

function getRun(id) { return runs.get(id) || null; }

function getActiveByThread(threadId) {
  if (!threadId) return null;
  for (const r of runs.values()) {
    if (r.status === 'running' && r.threadId === threadId) return r;
  }
  return null;
}

function listActive() {
  return [...runs.values()]
    .filter(r => r.status === 'running')
    .map(r => ({ id: r.id, threadId: r.threadId, agentName: r.agentName, startedAt: r.startedAt }));
}

function subscribe(run, res) { if (run) run.subscribers.add(res); }
function unsubscribe(run, res) { if (run) run.subscribers.delete(res); }

// Broadcast an SSE event to every attached client. Chunk events also accumulate
// into run.output so a reattaching client can replay the text generated so far.
// A subscriber whose socket is dead is dropped silently (never throws).
function broadcast(run, event) {
  if (!run) return;
  if (event && event.type === 'chunk' && typeof event.content === 'string') {
    run.output += event.content;
  }
  if (event && (event.type === 'done' || event.type === 'error')) {
    run.finalEvent = event;
  }
  const raw = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.subscribers) {
    try { res.write(raw); } catch { run.subscribers.delete(res); }
  }
}

function broadcastComment(run, text) {
  if (!run) return;
  const raw = `: ${text}\n\n`;
  for (const res of run.subscribers) {
    try { res.write(raw); } catch { run.subscribers.delete(res); }
  }
}

// Mark a run finished: end all attached responses and schedule eviction. The
// terminal event was already broadcast via broadcast(); we keep run.finalEvent
// + run.output so a client that reattaches during the grace window gets the
// result immediately.
function markDone(run) {
  if (!run || run.status === 'done') return;
  run.status = 'done';
  run.endedAt = Date.now();
  for (const res of run.subscribers) { try { res.end(); } catch { /* already closed */ } }
  run.subscribers.clear();
  run._evictTimer = setTimeout(() => runs.delete(run.id), RESULT_GRACE_MS);
  if (run._evictTimer.unref) run._evictTimer.unref();
}

module.exports = {
  createRun, getRun, getActiveByThread, listActive,
  subscribe, unsubscribe, broadcast, broadcastComment, markDone,
};
