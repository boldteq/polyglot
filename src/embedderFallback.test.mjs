// Ollama-SPOF degradation proof (roadmap Phase 5.1). embedder/retrieve/capture read env at import time
// (singletons), so each case runs in a CHILD process pointed at a DEAD Ollama endpoint — hermetic, and
// still inside `node --test src/`. Proves: a down embedder DEGRADES (empty retrieve / durable-log
// capture), never crashes, and NEVER substitutes a different-dim embedder (which would corrupt the store).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INTEL = path.join(HERE, 'intelligence');
// dead endpoint → fetch fails fast with ECONNREFUSED, i.e. "Ollama is down".
const DOWN_ENV = { INTEL_EMBED_PROVIDER: 'ollama', OLLAMA_URL: 'http://127.0.0.1:1' };

function child(code, extraEnv = {}) {
  // run from a temp .mjs FILE (not `node -e`) so modules with a `pathToFileURL(process.argv[1])` CLI
  // guard don't crash on load — argv[1] is a real path here.
  const f = path.join(os.tmpdir(), `efb-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(f, code);
  try {
    const r = spawnSync(process.execPath, [f], { env: { ...process.env, ...DOWN_ENV, ...extraEnv }, encoding: 'utf-8', timeout: 30000 });
    return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } finally { fs.rmSync(f, { force: true }); }
}

test('embedSafe returns {ok:false, unavailable} when Ollama is down — never throws', () => {
  const r = child(`import { embedSafe } from ${JSON.stringify(path.join(INTEL, 'embedder.mjs'))};
    const x = await embedSafe(['hello']);
    console.log(JSON.stringify({ ok: x.ok, unavailable: x.unavailable, hasReason: !!x.reason }));`);
  assert.equal(r.status, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, false);
  assert.equal(j.unavailable, true);
  assert.equal(j.hasReason, true);
});

test('retrieve degrades to EMPTY (no throw, no fabricated ranking) when Ollama is down', () => {
  const r = child(`import { retrieve } from ${JSON.stringify(path.join(INTEL, 'retrieve.mjs'))};
    const hits = await retrieve('anything');
    console.log('LEN=' + hits.length);`);
  assert.equal(r.status, 0, 'retrieve must not throw: ' + r.err);
  assert.match(r.out, /LEN=0/);
  assert.match(r.err, /UNAVAILABLE|unavailable/i); // it SAYS it degraded (honest, not silent)
});

test('captureItem keeps the durable log + defers the vector (no throw, store not touched)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-'));
  const r = child(`import { captureItem } from ${JSON.stringify(path.join(INTEL, 'capture.mjs'))};
    const res = await captureItem('lesson', { domain: 'x', problem: 'p', solution: 's' });
    console.log(JSON.stringify({ deferred: res.deferred, id: !!res.id }));`, { INTEL_DATA_DIR: dir });
  assert.equal(r.status, 0, 'capture must not throw when the embedder is down: ' + r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.deferred, true, 'capture reports the vector was deferred');
  assert.equal(j.id, true, 'capture still returns an id');
  // the DURABLE log was written (the data is safe; reindex recovers the vector)
  const log = path.join(dir, 'lessons.jsonl');
  assert.ok(fs.existsSync(log) && fs.readFileSync(log, 'utf-8').includes('"solution":"s"'), 'lesson persisted to the durable log');
  // the vector store was NOT written with a mismatched/null vector
  assert.ok(!fs.existsSync(path.join(dir, 'kb_chunks.jsonl')), 'no corrupt vector row written on embedder-down');
  fs.rmSync(dir, { recursive: true, force: true });
});
