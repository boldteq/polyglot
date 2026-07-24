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

// ── THE REUSE FLOOR IS THEME-BASE-CONDITIONAL (GI-1, 2026-07-23) ────────────────────────────
// `section-reuse-first-protocol.md` §Targets: "Minimog = reuse-first → ≥70% REUSE+CONFIGURE.
// Dawn = custom-first → 70–80% CUSTOM expected (the ≥70%-reuse row is MINIMOG-ONLY; on Dawn it
// does not apply)", and its table says the gate "flips by `theme_base`". The gate applied the
// Minimog quota to every base, so a CORRECT Dawn build (custom-first by doctrine) tripped
// reuse-below-target — the gate would have blocked exactly the builds doctrine asks for.
function writeDs(dir, themeBase) {
  fs.mkdirSync(path.join(dir, 'docs', 'design'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'design', 'design-system.json'), JSON.stringify({ theme_base: themeBase }));
}
// custom-first counts: reuse+configure = 20% — well under the Minimog floor
const CUSTOM_FIRST = 'Counts: {reused: 2, configured: 0, extended: 0, custom: 8}\nCustom split: {library: 0, scratch: 8}\n'
  + Array.from({ length: 8 }, (_, i) => `s${i}: blueprint: none (checked: a, b; gap: none fits)`).join('\n') + '\n';

{ // 11. Dawn + custom-first ratio → NO reuse-floor block (the regression this fixes)
  const d = tmp(); writeDs(d, 'dawn'); writeMap(d, CUSTOM_FIRST);
  expect('dawn custom-first → no reuse-below-target', { code: 0, mustContain: 'reuse-share-informational' }, run(d, E));
  const got = run(d, E);
  got.out.includes('reuse-below-target')
    ? bad('dawn still emitted reuse-below-target')
    : ok('dawn emits NO reuse-below-target');
  fs.rmSync(d, { recursive: true, force: true });
}
{ // 12. same counts on Minimog → STILL blocks (the flip must not disarm the Minimog quota)
  const d = tmp(); writeDs(d, 'minimog'); writeMap(d, CUSTOM_FIRST);
  expect('minimog custom-first → reuse-below-target BLOCK', { code: 1, mustContain: 'reuse-below-target' }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}
{ // 13. no design-system.json → default to the reuse-first floor (safe default, and say so)
  const d = tmp(); writeMap(d, CUSTOM_FIRST);
  expect('unknown base → floor still applies', { code: 1, mustContain: 'reuse-below-target' }, run(d, E));
  expect('unknown base → names the missing theme_base', { code: 1, mustContain: 'theme_base unrecorded' }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}
{ // 14. explicit REUSE_TARGET overrides on ANY base, including Dawn (operator escape hatch)
  const d = tmp(); writeDs(d, 'dawn'); writeMap(d, CUSTOM_FIRST);
  expect('dawn + explicit REUSE_TARGET → blocks again', { code: 1, mustContain: 'reuse-below-target' }, run(d, { ...E, REUSE_TARGET: '0.70' }));
  fs.rmSync(d, { recursive: true, force: true });
}
{ // 15. a Dawn build that IS reuse-heavy is not falsely flagged either — informational only
  const d = tmp(); writeDs(d, 'dawn');
  writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 0}\n');
  expect('dawn reuse-heavy → PASS', { code: 0 }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}

// Flagged by audit-unproven-guards: these BLOCK a client build but no fixture had ever proven they
// fire. `custom-split-missing` is exactly what the GI-2 generator relies on to keep a half-authored
// map from passing — it was verified by hand then, never pinned.
{ // custom>0 with no `Custom split:` line at all
  const d = tmp(); writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 2}\n');
  expect('no Custom split line → custom-split-missing', { code: 1, mustContain: 'custom-split-missing' }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}
{ // library + scratch that do not add up to custom
  const d = tmp(); writeMap(d, 'Counts: {reused: 8, configured: 1, extended: 0, custom: 5}\nCustom split: {library: 1, scratch: 1}\n');
  expect('split does not sum to custom → custom-split-mismatch', { code: 1, mustContain: 'custom-split-mismatch' }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}
{ // a rung outside the vocabulary
  const d = tmp();
  writeMap(d, 'Counts: {reused: 9, configured: 0, extended: 0, custom: 0}\n\n| Zone | Section | Rung |\n|---|---|---|\n| hero | image-banner | RECYCLE |\n');
  expect('unknown rung → bad-rung', { code: 1, mustContain: 'bad-rung' }, run(d, E));
  fs.rmSync(d, { recursive: true, force: true });
}

// ── missing-map blocks even in Phase A (2026-07-23) ──────────────────────────────────────────
// A missing map is not a ratio judgement — it means no section was ever CLASSIFIED, and classification
// is what makes an agent open the blueprint library where the authoring conventions live. On a real
// 10-day client build that warning was ignored and 16 sections shipped with 0 translation keys.
// The ratio checks must stay Phase-A: ≥70% reuse is right on Minimog and wrong on Dawn.
{
  const d = tmp(); gitBase(d); addSections(d, ['a.liquid']);
  expect('missing-map BLOCKS with no REUSE_MAP_ENFORCE', { code: 1, mustContain: 'reuse-map.missing' }, run(d, {}));
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = tmp(); writeMap(d, 'Counts: {reused: 1, configured: 0, extended: 2, custom: 0}\n');
  expect('ratio findings stay warn-only in Phase A', { code: 0, mustContain: 'reuse-map.warn-only' }, run(d, {}));
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
