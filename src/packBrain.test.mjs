// Hermetic test for pack-brain (roadmap Phase 4.1). The pure core (sha256/buildManifest/diffManifest)
// is proven here without touching the real 192MB brain; a pack→verify→corrupt round-trip runs the CLI
// against a tiny synthetic brain via the BRAIN_* env overrides.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, buildManifest, diffManifest } from '../scripts/pack-brain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'scripts', 'pack-brain.mjs');

test('sha256 is stable + content-sensitive', () => {
  assert.equal(sha256(Buffer.from('a')), sha256(Buffer.from('a')));
  assert.notEqual(sha256(Buffer.from('a')), sha256(Buffer.from('b')));
});

test('buildManifest is deterministic + sorted by path', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-'));
  fs.writeFileSync(path.join(d, 'b.md'), 'B');
  fs.writeFileSync(path.join(d, 'a.md'), 'A');
  fs.mkdirSync(path.join(d, 'sub'));
  fs.writeFileSync(path.join(d, 'sub', 'c.md'), 'C');
  fs.writeFileSync(path.join(d, 'skip.txt'), 'x');
  const m = buildManifest(d, (n) => n.endsWith('.md'));
  assert.deepEqual(m.map((e) => e.path), ['a.md', 'b.md', 'sub/c.md']); // sorted, filtered, recursive
  assert.equal(buildManifest(d, (n) => n.endsWith('.md')).map((e) => e.sha256).join(), m.map((e) => e.sha256).join()); // deterministic
  fs.rmSync(d, { recursive: true, force: true });
});

test('diffManifest flags missing + changed, ok when identical', () => {
  const expected = [{ path: 'a', sha256: 'x' }, { path: 'b', sha256: 'y' }];
  assert.deepEqual(diffManifest(expected, { a: { sha256: 'x' }, b: { sha256: 'y' } }), { ok: true, missing: [], changed: [] });
  const d = diffManifest(expected, { a: { sha256: 'DIFFERENT' } });
  assert.equal(d.ok, false);
  assert.deepEqual(d.missing, ['b']);
  assert.deepEqual(d.changed, ['a']);
});

test('pack → verify round-trip: clean passes, a tampered file FAILS the health-check', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-'));
  const agents = path.join(root, 'agents'); const packs = path.join(root, 'packs'); const evals = path.join(root, 'evals');
  fs.mkdirSync(agents); fs.mkdirSync(packs); fs.mkdirSync(evals);
  fs.writeFileSync(path.join(agents, 'loom.md'), '# loom\nrule');
  fs.writeFileSync(path.join(agents, 'drape.md'), '# drape\nrule');
  fs.writeFileSync(path.join(packs, 'loom.md'), '[ENFORCED] x');
  fs.writeFileSync(path.join(evals, 'brief-001.json'), '{"id":"brief-001"}');
  const out = path.join(root, 'dist');
  const env = { ...process.env, BRAIN_AGENTS_DIR: agents, BRAIN_PACKS_DIR: packs, BRAIN_EVALS_DIR: evals, BRAIN_EMBEDDINGS: '/no/such/file', BRAIN_EMBEDDINGS_MANIFEST: '/no/such' };

  const packed = spawnSync('node', [SCRIPT, 'pack', '--out', out, '--version', 'test-1'], { env, encoding: 'utf-8' });
  assert.equal(packed.status, 0, packed.stderr);
  assert.ok(fs.existsSync(path.join(out, '.claude-plugin', 'plugin.json')), 'plugin.json written');
  const plugin = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf-8'));
  assert.equal(plugin.components.agents, 2);
  assert.equal(plugin.components.rulePacks, 1);

  const clean = spawnSync('node', [SCRIPT, 'verify', out], { env, encoding: 'utf-8' });
  assert.equal(clean.status, 0, 'clean artifact verifies: ' + clean.stdout);

  fs.writeFileSync(path.join(out, 'agents', 'loom.md'), '# loom\nTAMPERED'); // corrupt a pulled file
  const tampered = spawnSync('node', [SCRIPT, 'verify', out], { env, encoding: 'utf-8' });
  assert.equal(tampered.status, 1, 'a tampered artifact must FAIL verify (delivery health-check)');
  assert.match(tampered.stdout, /changed 1|FAILED/);

  fs.rmSync(root, { recursive: true, force: true });
});
