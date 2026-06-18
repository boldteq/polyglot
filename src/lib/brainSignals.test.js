'use strict';

// Coverage for FIX #7 — cross-project signal attribution. Before this, a run whose
// project was only recoverable from its VS Code / Playground session was bucketed as
// 'unknown', so the same antipattern across two real projects could never clear the
// governor's ≥2-projects auto bar. resolveProject() + loadSessionProjectMap() recover
// the real project so generalization works.
//
// A throwaway DB is used (POLYGLOT_DB_PATH set BEFORE requiring db.js) so the suite
// never touches data/polyglot.db. node --test runs each file in its own process, so
// this env override is isolated.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brainsignals-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'probe.db');

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { resolveProject, loadSessionProjectMap } = require('./brainSignals');

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// ── resolveProject: pure attribution precedence ──────────────────────────────
test('resolveProject: explicit project wins over projectId + session', () => {
  const map = new Map([['sessA', 'FromSession']]);
  const got = resolveProject({ project: 'Alpha', projectId: b64('/x/Beta'), sessionId: 'sessA' }, map);
  assert.equal(got, 'Alpha');
});

test('resolveProject: decodes a base64 abs-path projectId to its leaf folder', () => {
  const got = resolveProject({ projectId: b64('/Users/y/Desktop/Rankora') }, new Map());
  assert.equal(got, 'Rankora');
});

test('resolveProject: recovers project from the session map when nothing direct', () => {
  const map = new Map([['sessA', 'Polyglot']]);
  assert.equal(resolveProject({ sessionId: 'sessA' }, map), 'Polyglot');
});

test('resolveProject: falls back to "unknown" when no source resolves', () => {
  const map = new Map([['sessA', 'Polyglot']]);
  assert.equal(resolveProject({}, map), 'unknown');
  assert.equal(resolveProject({ sessionId: 'missing' }, map), 'unknown');
  assert.equal(resolveProject({ project: 'unknown', sessionId: 'missing' }, map), 'unknown');
});

test('resolveProject: tolerates a missing session map (no throw)', () => {
  assert.equal(resolveProject({ sessionId: 'sessA' }), 'unknown');
  assert.equal(resolveProject({ project: 'Direct' }), 'Direct');
});

// ── loadSessionProjectMap: reads vscode_session, skips blank projects ─────────
test('loadSessionProjectMap: maps sessions with a project, skips null/empty', () => {
  const now = new Date().toISOString();
  const ins = db.getDb().prepare(
    'INSERT OR REPLACE INTO vscode_session (sessionId, project, createdAt) VALUES (?, ?, ?)'
  );
  ins.run('s-named', 'Rankora', now);
  ins.run('s-null', null, now);
  ins.run('s-empty', '', now);

  const map = loadSessionProjectMap();
  assert.equal(map.get('s-named'), 'Rankora');
  assert.equal(map.has('s-null'), false);
  assert.equal(map.has('s-empty'), false);
});

test('loadSessionProjectMap result wires back through resolveProject', () => {
  db.getDb().prepare(
    'INSERT OR REPLACE INTO vscode_session (sessionId, project, createdAt) VALUES (?, ?, ?)'
  ).run('s-wire', 'CROBOT', new Date().toISOString());
  const map = loadSessionProjectMap();
  assert.equal(resolveProject({ sessionId: 's-wire' }, map), 'CROBOT');
});

test.after(() => {
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});
