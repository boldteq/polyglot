'use strict';

// Proves the build plumbing end-to-end WITHOUT a live store: a temp dir stands in for
// a linked theme repo (.boldteq-theme-lock.json + a fake vendored maestro that emits
// log lines, writes the readiness verdict, and exits). Covers: spawn → stream → verdict
// parse → terminal event, the theme-lock safety guard, vendored-script resolution, and
// cancel. The real-store run is the dogfood, not this test.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const buildRuns = require('./buildRuns');

// A fake res that collects SSE writes + resolves a promise when a terminal arrives.
function fakeSubscriber() {
  const events = [];
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const res = {
    ended: false,
    write(raw) {
      const line = String(raw).trim();
      if (!line.startsWith('data:')) return; // skip heartbeats / comments
      try {
        const e = JSON.parse(line.slice(5).trim());
        events.push(e);
        if (e.type === 'done' || e.type === 'error') resolveDone(e);
      } catch { /* partial */ }
    },
    end() { this.ended = true; },
  };
  return { res, events, done };
}

// Build a temp "theme repo": lock file + a fake vendored maestro with the given body.
function makeRepo(maestroBody, { withLock = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildruns-'));
  if (withLock) {
    fs.writeFileSync(path.join(dir, '.boldteq-theme-lock.json'),
      JSON.stringify({ version: 1, store: 'fixture.myshopify.com', themeId: '123', role: 'unpublished' }));
  }
  const scriptDir = path.join(dir, 'toolkit', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(scriptDir, 'maestro-build.mjs'), maestroBody);
  return dir;
}

const READY_MAESTRO = `
import fs from 'node:fs';
import path from 'node:path';
process.stdout.write('maestro:build — stage 1/4\\n');
process.stdout.write('maestro:build — stage 4/4\\n');
fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'docs', 'publish-readiness.json'),
  JSON.stringify({ publishReady: true, stage: 'ready', reason: 'all gates pass', gates: { pass: true, blockers: 0 } }));
process.exit(0);
`;

const BLOCKED_MAESTRO = `
import fs from 'node:fs';
import path from 'node:path';
process.stdout.write('maestro:build — gate #18 BLOCK\\n');
fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'docs', 'publish-readiness.json'),
  JSON.stringify({ publishReady: false, stage: 'gates', reason: 'lens visual-truth blocked', gates: { pass: false, blockers: 3 } }));
process.exit(1);
`;

const HANGING_MAESTRO = `
process.stdout.write('maestro:build — working...\\n');
setInterval(() => {}, 1000); // never exits on its own
`;

test('startBuild: ready maestro → streams log + parses PUBLISH-READY verdict', async () => {
  const dir = makeRepo(READY_MAESTRO);
  const build = buildRuns.startBuild({ id: 'b-ready', repoPath: dir, previewUrl: 'http://127.0.0.1:9292', autoPreview: false });
  assert.equal(build.store, 'fixture.myshopify.com', 'store read from lock');
  assert.equal(build.status, 'running');

  const sub = fakeSubscriber();
  buildRuns.subscribe(build, sub.res);
  const doneEvent = await sub.done;

  assert.equal(doneEvent.type, 'done');
  assert.equal(doneEvent.publishReady, true, 'verdict reflects publish-readiness.json');
  assert.equal(doneEvent.stage, 'ready');
  assert.equal(doneEvent.exitCode, 0);
  assert.match(build.output, /stage 4\/4/, 'log accumulated for reattach replay');
  assert.equal(build.status, 'done');
  assert.ok(sub.res.ended, 'subscriber ended on markDone');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('startBuild: blocked maestro → done event carries publishReady=false + reason', async () => {
  const dir = makeRepo(BLOCKED_MAESTRO);
  const build = buildRuns.startBuild({ id: 'b-blocked', repoPath: dir, autoPreview: false });
  const sub = fakeSubscriber();
  buildRuns.subscribe(build, sub.res);
  const doneEvent = await sub.done;

  assert.equal(doneEvent.publishReady, false);
  assert.equal(doneEvent.exitCode, 1);
  assert.match(String(doneEvent.reason), /lens/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reattach: a late subscriber replays buffered log via getBuild', async () => {
  const dir = makeRepo(READY_MAESTRO);
  const build = buildRuns.startBuild({ id: 'b-reattach', repoPath: dir, autoPreview: false });
  await new Promise((r) => build._proc ? build._proc.on('close', r) : r());
  // Build is finished but lingers in the grace window — still fetchable for reattach.
  const fetched = buildRuns.getBuild('b-reattach');
  assert.ok(fetched, 'finished build still retrievable in grace window');
  assert.ok(fetched.finalEvent && fetched.finalEvent.type === 'done', 'finalEvent kept for late reattach');
  assert.match(fetched.output, /stage 1\/4/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('theme-lock guard: repo without .boldteq-theme-lock.json is refused', () => {
  const dir = makeRepo(READY_MAESTRO, { withLock: false });
  assert.throws(
    () => buildRuns.startBuild({ id: 'b-nolock', repoPath: dir }),
    /not a linked theme repo/i,
    'must refuse an unlinked repo (theme-lock safety)',
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validation: missing/!dir repoPath is refused', () => {
  assert.throws(() => buildRuns.startBuild({ id: 'b-x', repoPath: '/definitely/not/here' }), /not found or not a directory/i);
  assert.throws(() => buildRuns.startBuild({ id: 'b-y', repoPath: '' }), /not found or not a directory/i);
});

test('resolveMaestro: prefers the repo VENDORED copy over the master', () => {
  const dir = makeRepo(READY_MAESTRO);
  const resolved = buildRuns.resolveMaestro(dir);
  assert.equal(resolved, path.join(dir, 'toolkit', 'scripts', 'maestro-build.mjs'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cancel: kill() SIGTERMs a running build and it transitions to done', async () => {
  const dir = makeRepo(HANGING_MAESTRO);
  const build = buildRuns.startBuild({ id: 'b-cancel', repoPath: dir, autoPreview: false });
  const sub = fakeSubscriber();
  buildRuns.subscribe(build, sub.res);
  assert.equal(typeof build.kill, 'function');
  build.kill('test');
  await sub.done; // close fires after SIGTERM → done broadcast
  assert.equal(build.status, 'done');
  fs.rmSync(dir, { recursive: true, force: true });
});
