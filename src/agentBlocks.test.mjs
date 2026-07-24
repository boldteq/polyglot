import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANAGED_BLOCKS, markersAreDisjoint, blockRange, assertBlockIsolation, blocksAreIsolated } from './lib/agentBlocks.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// A realistic agent .md carrying BOTH managed blocks + frontmatter + hand-written prose between them.
const wellFormed = [
  '---', 'name: loom', 'model: sonnet', '---', '',
  '# Loom', 'Hand-written guidance a human owns.', '',
  '## 🎓 SWT Trained Defaults', '<!-- SWT-TRAINED:START -->', '- rule A', '<!-- SWT-TRAINED:END -->', '',
  'More human prose in the middle.', '',
  '<!-- BOLDTEQ-AUTOLEARN:START -->', '- ✅ learned rule <!-- sig-1 -->', '<!-- BOLDTEQ-AUTOLEARN:END -->', '',
].join('\n');

test('markers are mutually disjoint (no marker is a substring of another)', () => {
  assert.equal(markersAreDisjoint(), true);
});

test('the two channels are exactly SWT-TRAINED and BOLDTEQ-AUTOLEARN (registry is complete)', () => {
  assert.deepEqual(MANAGED_BLOCKS.map((b) => b.channel).sort(), ['BOLDTEQ-AUTOLEARN', 'SWT-TRAINED']);
});

// Drift guard (mirrors the gate-owner drift test): if a writer renames its marker without updating the
// registry, the two fall out of sync and the file-splice guard would silently stop covering it.
test('live writers still use the registered markers', () => {
  const dist = read('scripts/swt-distribute.mjs');
  const trainer = read('src/intelligence/trainer.mjs');
  const swt = MANAGED_BLOCKS.find((b) => b.channel === 'SWT-TRAINED');
  const auto = MANAGED_BLOCKS.find((b) => b.channel === 'BOLDTEQ-AUTOLEARN');
  assert.ok(dist.includes(swt.start) && dist.includes(swt.end), 'swt-distribute.mjs must use the SWT-TRAINED markers');
  assert.ok(trainer.includes(auto.start) && trainer.includes(auto.end), 'trainer.mjs must use the BOLDTEQ-AUTOLEARN markers');
  // and neither writer references the OTHER writer's marker (they must stay in separate lanes)
  assert.ok(!dist.includes(auto.start), 'swt-distribute must not touch the AUTOLEARN block');
  assert.ok(!trainer.includes(swt.start), 'trainer must not touch the SWT-TRAINED block');
});

test('both writers call the shared isolation guard before writing', () => {
  assert.ok(read('scripts/swt-distribute.mjs').includes('blocksAreIsolated('), 'swt-distribute must guard its write');
  assert.ok(read('src/intelligence/trainer.mjs').includes('blocksAreIsolated('), 'trainer must guard its write');
});

test('a well-formed file with both blocks passes isolation', () => {
  assert.equal(assertBlockIsolation(wellFormed), true);
  assert.equal(blocksAreIsolated(wellFormed), true);
});

test('a file with neither block passes (both absent is fine)', () => {
  assert.equal(assertBlockIsolation('---\nname: x\n---\n# plain\n'), true);
});

test('overlapping/nested blocks are rejected (the HYG-1 splice class)', () => {
  // AUTOLEARN start lands INSIDE the SWT block, and SWT end lands after AUTOLEARN start → ranges overlap.
  const spliced = [
    '<!-- SWT-TRAINED:START -->', '- rule',
    '<!-- BOLDTEQ-AUTOLEARN:START -->', '- learned',
    '<!-- SWT-TRAINED:END -->', '<!-- BOLDTEQ-AUTOLEARN:END -->',
  ].join('\n');
  assert.throws(() => assertBlockIsolation(spliced), /overlap/);
  assert.equal(blocksAreIsolated(spliced), false); // non-throwing form the writers use
});

test('unbalanced markers throw (start without end)', () => {
  assert.throws(() => blockRange('<!-- SWT-TRAINED:START -->\n- x\n', MANAGED_BLOCKS[0]), /unbalanced/);
});

test('duplicated markers throw', () => {
  const dup = '<!-- SWT-TRAINED:START -->a<!-- SWT-TRAINED:END --><!-- SWT-TRAINED:START -->b<!-- SWT-TRAINED:END -->';
  assert.throws(() => blockRange(dup, MANAGED_BLOCKS[0]), /duplicated/);
});
