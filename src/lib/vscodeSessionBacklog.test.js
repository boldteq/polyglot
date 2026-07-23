'use strict';

// A pending VS Code session must never become permanently undigestable (BRAIN-1, 2026-07-23).
//
// getPendingVscodeSessions() only ever looks back `hours`. A session still pending once it ages past
// that window could never be selected again, and nothing reported the loss. That is exactly what
// happened while the digest was disabled 2026-06-30 → 07-22: re-enabling it recovered only the last
// 24h and left 65 real sessions (back to 06-19) stranded — their lessons silently gone.
//
// These pin the two halves of the fix: the backlog is COUNTABLE (so the job can report it) and
// DRAINABLE oldest-first (so it clears deterministically instead of starving behind newer work).

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
const TAG = `backlog-test-${process.pid}`;

function seed(id, hoursAgo) {
  db.insertVscodeSession({
    sessionId: `${TAG}-${id}`,
    project: TAG,
    projectPath: `/tmp/${TAG}`,
    transcriptPath: `/tmp/${TAG}/${id}.jsonl`,
    turnCount: 3, toolUseCount: 1, editCount: 1, bashCount: 0, transcriptBytes: 100,
    endReason: 'test', endedAt: iso(hoursAgo), status: 'pending_digest', createdAt: iso(hoursAgo),
  });
}

function cleanup() {
  const raw = db.getDb ? db.getDb() : null;
  if (raw) raw.prepare('DELETE FROM vscode_session WHERE project = ?').run(TAG);
}

test('stranded sessions are counted separately from in-window ones', () => {
  cleanup();
  seed('fresh-1', 2);     // inside a 24h window
  seed('old-1', 100);     // outside
  seed('old-2', 500);     // further outside
  try {
    const before = db.countPendingVscodeSessions(24);
    assert.ok(before.inWindow >= 1, 'the fresh session should count as in-window');
    assert.ok(before.stranded >= 2, 'both aged sessions should count as stranded');
    assert.ok(before.oldest, 'the oldest pending timestamp is reported so a backlog is visible');
  } finally { cleanup(); }
});

test('stranded sessions are retrievable OLDEST-first so a backlog drains', () => {
  cleanup();
  seed('old-newer', 100);
  seed('old-oldest', 900);
  try {
    // a high limit on purpose: the real DB carries a genuine backlog, so a small limit would
    // truncate before reaching the seeded rows and fail for the wrong reason.
    const got = db.getStrandedVscodeSessions(24, 5000).filter((s) => s.project === TAG);
    assert.equal(got.length, 2, 'both aged sessions are retrievable — they are NOT lost');
    assert.ok(
      got[0].createdAt <= got[1].createdAt,
      'oldest first, so the backlog drains deterministically instead of starving behind newer work',
    );
  } finally { cleanup(); }
});

test('the in-window query still excludes stranded sessions (windowing is intact)', () => {
  cleanup();
  seed('fresh-2', 1);
  seed('old-3', 400);
  try {
    const fresh = db.getPendingVscodeSessions(24, 5000).filter((s) => s.project === TAG);
    assert.equal(fresh.length, 1, 'only the in-window session comes back from the pending query');
    assert.match(fresh[0].sessionId, /fresh-2$/);

    // and the two queries partition the pending set — no session is in both, none is dropped
    const stranded = db.getStrandedVscodeSessions(24, 5000).filter((s) => s.project === TAG);
    const ids = new Set([...fresh, ...stranded].map((s) => s.sessionId));
    assert.equal(ids.size, 2, 'fresh + stranded together cover every pending session exactly once');
  } finally { cleanup(); }
});
