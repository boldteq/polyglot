#!/usr/bin/env node
// Self-test for check-reuse-map.mjs as manifest gate #23. Proves the BLOCK ids (under
// REUSE_MAP_ENFORCE=1), the waiver path, AND the applicability SKIP (no new sections → PASS,
// never a false-BLOCK on refreshes — the anti-false-BLOCK case). Git-backed cases set up a
// temp repo + `base` tag so the custom-count-vs-disk cross-check + applicability run for real.
// Run: node scripts/__fixtures__/reuse-map/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-reuse-map.mjs');
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, stdio: 'ignore' });
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rm-')); }
function gitBase(dir) {
  sh('git', ['init', '-q'], dir); sh('git', ['config', 'user.email', 't@t'], dir); sh('git', ['config', 'user.name', 't'], dir);
  fs.writeFileSync(path.join(dir, '.keep'), 'x'); sh('git', ['add', '-A'], dir); sh('git', ['commit', '-qm', 'base'], dir); sh('git', ['tag', 'base'], dir);
}
function addSections(dir, names) {
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(dir, 'sections', n), '<section></section>{% schema %}{}{% endschema %}');
  sh('git', ['add', '-A'], dir); sh('git', ['commit', '-qm', 'add sections'], dir);
}
function writeMap(dir, body) { fs.writeFileSync(path.join(dir, 'section-reuse-map.md'), body); }
function run(dir, env = {}) {
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: path.join(dir, 'gate-reports'), ...env } });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const CONFORMANT = `# Section reuse map
Counts: {reused: 6, configured: 1, extended: 0, custom: 1}
Custom split: {library: 0, scratch: 1}

| Zone | Section | Rung |
|---|---|---|
| hero | image-banner | REUSE |
| story | custom-story | CUSTOM |

custom-story: blueprint: none (checked: countdown, lookbook; gap: no native long-form story band)
`;

function expect(name, { code, mustContain }, got) {
  const okCode = got.code === code;
  const okText = !mustContain || got.out.includes(mustContain);
  if (okCode && okText) ok(`${name}`);
  else bad(`${name}: got exit ${got.code}${mustContain ? `, expected "${mustContain}" — out: ${got.out.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`);
}

const E = { REUSE_MAP_ENFORCE: '1' }; // Phase-B (block) mode for the BLOCK assertions

console.log('check-reuse-map — gate #23 (ENFORCE=1 for BLOCK cases)');
{ // 1. conformant (git, custom:1 == 1 new section)
  const d = tmp(); gitBase(d); addSections(d, ['custom-story.liquid']); writeMap(d, CONFORMANT);
  expect('conformant → PASS', { code: 0 }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 2. below-70 (custom:0 isolates the reuse-share blocker)
  const d = tmp(); writeMap(d, 'Counts: {reused: 1, configured: 0, extended: 2, custom: 0}\n');
  expect('below-70 → reuse-below-target', { code: 1, mustContain: 'reuse-below-target' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 3. scratch with no justification
  const d = tmp(); writeMap(d, 'Counts: {reused: 7, configured: 2, extended: 0, custom: 1}\nCustom split: {library: 0, scratch: 1}\n');
  expect('scratch-no-justification → BLOCK', { code: 1, mustContain: 'scratch-no-justification' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 4. count mismatch (git: 2 new sections, map says custom:1)
  const d = tmp(); gitBase(d); addSections(d, ['a.liquid', 'b.liquid']);
  writeMap(d, 'Counts: {reused: 6, configured: 1, extended: 0, custom: 1}\nCustom split: {library: 0, scratch: 1}\nx: blueprint: none (checked: y; gap: z)\n');
  expect('count-mismatch → BLOCK', { code: 1, mustContain: 'custom-count-mismatch' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 5. sections added but NO map
  const d = tmp(); gitBase(d); addSections(d, ['a.liquid']);
  expect('missing-map (sections added) → BLOCK', { code: 1, mustContain: 'reuse-map.missing' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 6. waivered below-70 → PASS + warn
  const d = tmp(); writeMap(d, 'Counts: {reused: 1, configured: 0, extended: 2, custom: 0}\n');
  expect('waivered-below-70 → PASS', { code: 0, mustContain: 'reuse-below-target-waived' }, run(d, { ...E, ALLOW_REUSE_WAIVER: '1' })); fs.rmSync(d, { recursive: true, force: true });
}
{ // 7. refresh: base tag, 0 new sections, no map → SKIP/PASS (anti-false-BLOCK, even under ENFORCE=1)
  const d = tmp(); gitBase(d);
  expect('refresh-no-sections → SKIP/PASS', { code: 0, mustContain: 'n-a-no-new-sections' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 8. #6 LIBRARY custom WITH a valid blueprint citation → PASS (non-git: count cross-check warns only)
  const d = tmp();
  writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 1}\nCustom split: {library: 1, scratch: 0}\n\n| Zone | Section | Rung |\n|---|---|---|\n| promo | promo-countdown | CUSTOM |\n\npromo-countdown: blueprint: countdown@v1\n');
  expect('library cites blueprint → PASS', { code: 0 }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 9. #6 LIBRARY custom with NO blueprint citation → BLOCK
  const d = tmp();
  writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 1}\nCustom split: {library: 1, scratch: 0}\n\n| Zone | Section | Rung |\n|---|---|---|\n| promo | promo-band | CUSTOM |\n');
  expect('library no blueprint → BLOCK', { code: 1, mustContain: 'library-no-blueprint' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}
{ // 10. #22 blueprint citation naming a section file that doesn't exist → warning (exit 0)
  const d = tmp();
  writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 1}\nCustom split: {library: 1, scratch: 0}\n\n| Zone | Section | Rung |\n|---|---|---|\n| promo | ghost-section | CUSTOM |\n\nghost-section: blueprint: countdown@v1\n');
  expect('blueprint ref off a missing section → warn', { code: 0, mustContain: 'blueprint-section-missing' }, run(d, E)); fs.rmSync(d, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
