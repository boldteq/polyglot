import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertsUncitedMechanism } from '../scripts/lib/shopify-mechanism.mjs';
import { deriveRule } from '../scripts/swt-distribute.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const faq = (solution) => ({ id: '9999', concern: 'platform-authoring', surface: 'section-schema', gap: 'how to do X on a section', solution, autofix: '' });

test('assertsUncitedMechanism: cited → false, uncited mechanism → true, pure taste → false', () => {
  assert.equal(assertsUncitedMechanism('use visible_if [doc: shopify.dev/...]'), false, 'a cited mechanism is fine');
  assert.equal(assertsUncitedMechanism('wrap it in content_for blocks'), true, 'an uncited mechanism is flagged');
  assert.equal(assertsUncitedMechanism('use generous whitespace and clear hierarchy'), false, 'pure taste is exempt');
});

test('deriveRule KEEPS a citeable-mechanism rule (citeShopify sources it)', () => {
  const r = deriveRule(faq('loom · use visible_if to conditionally show a section setting'));
  assert.ok(r, 'not rejected');
  assert.match(r.body, /\[doc: shopify\.dev/, 'the mechanism was cited');
});

test('deriveRule REJECTS a new rule that asserts an uncited Shopify mechanism (D1 gate)', () => {
  const r = deriveRule(faq('loom · wrap the section body in content_for blocks'));
  assert.equal(r, null, 'an uncited mechanism claim is dropped, not distributed');
});

test('deriveRule KEEPS a pure design/taste rule (no mechanism → no citation expected)', () => {
  const r = deriveRule(faq('drape · use generous whitespace and a clear visual hierarchy'));
  assert.ok(r, 'a taste rule is kept');
});

test('SWT_ALLOW_UNCITED=1 opts down the D1 reject (transition escape)', () => {
  const prev = process.env.SWT_ALLOW_UNCITED;
  process.env.SWT_ALLOW_UNCITED = '1';
  try {
    const r = deriveRule(faq('loom · wrap the section body in content_for blocks'));
    assert.ok(r, 'kept when opted down');
  } finally { process.env.SWT_ALLOW_UNCITED = prev; }
});

test('check-rule-provenance --enforce exits non-zero when the ENFORCED-uncited backlog exceeds --max', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-packs-'));
  // one ENFORCED rule that asserts a mechanism with NO citation → an uncited claim the gate must catch
  fs.writeFileSync(path.join(dir, 'loom.md'), '# loom\n- [ENFORCED] wrap the section in content_for blocks\n- [ENFORCED] use 16px body copy\n');
  const script = path.join(REPO, 'scripts', 'check-rule-provenance.mjs');
  const run = (args) => spawnSync('node', [script, '--packs', dir, ...args], { encoding: 'utf-8' });

  const report = run([]);                       // report mode → always exit 0
  assert.equal(report.status, 0, 'report mode never blocks');

  const enforce = run(['--enforce']);           // --max default 0 → 1 uncited > 0 → BLOCK
  assert.equal(enforce.status, 1, 'enforce blocks on an uncited ENFORCED mechanism rule');

  const lenient = run(['--enforce', '--max', '5']); // 1 uncited ≤ 5 → OK
  assert.equal(lenient.status, 0, 'enforce passes under the allowed max');
  fs.rmSync(dir, { recursive: true, force: true });
});
