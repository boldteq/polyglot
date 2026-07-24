import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Hermetic: the deterministic hash embedder (no Ollama) + an isolated data dir (ledgers + store).
process.env.INTEL_EMBED_PROVIDER = 'hash';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reembed-'));
process.env.INTEL_DATA_DIR = TMP;

// three lessons in the ledger, NONE embedded yet — the "deferred backlog" the drain must clear
const lessons = [
  { id: 'lesson:a1', type: 'lesson', domain: 'x', problem: 'p1', root_cause: 'r1', solution: 's1', created_at: '2026-07-24T00:00:00Z' },
  { id: 'lesson:b2', type: 'lesson', domain: 'x', problem: 'p2', root_cause: 'r2', solution: 's2', created_at: '2026-07-24T00:00:00Z' },
  { id: 'lesson:c3', type: 'lesson', domain: 'x', problem: 'p3', root_cause: 'r3', solution: 's3', created_at: '2026-07-24T00:00:00Z' },
];
fs.writeFileSync(path.join(TMP, 'lessons.jsonl'), lessons.map((l) => JSON.stringify(l)).join('\n') + '\n');

const { reembedCaptures } = await import('./intelligence/capture.mjs');
const { getStore } = await import('./intelligence/store.mjs');

test('reembedCaptures embeds every un-indexed ledger item (drains the deferred backlog)', async () => {
  const r = await reembedCaptures();
  assert.equal(r.embedded, 3, 'all 3 deferred lessons embedded');
  assert.equal(r.already, 0);
  assert.equal(getStore().ids().size, 3, 'store now holds all 3');
});

test('a second run is idempotent — skips already-indexed items (no re-embed noise)', async () => {
  const r = await reembedCaptures();
  assert.equal(r.embedded, 0, 'nothing re-embedded');
  assert.equal(r.already, 3, 'all 3 recognized as already indexed');
});

test('a newly-appended ledger item is picked up on the next drain (the lag can never re-accumulate silently)', async () => {
  fs.appendFileSync(path.join(TMP, 'lessons.jsonl'), JSON.stringify({ id: 'lesson:d4', type: 'lesson', domain: 'x', problem: 'p4', root_cause: 'r4', solution: 's4', created_at: '2026-07-24T00:00:00Z' }) + '\n');
  const r = await reembedCaptures();
  assert.equal(r.embedded, 1, 'the new lesson is drained');
  assert.equal(r.already, 3);
  assert.equal(getStore().ids().size, 4);
});
