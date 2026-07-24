'use strict';

// Self-test for scripts/check-agent-refs.mjs (the dead-knowledge-reference gate). Hermetic: a throwaway
// HOME holding a fake ~/.claude tree, so the real agent brain is never touched and the numbers are exact.
// Proves: tier-1 vs body classification, template skipping, both exit-code policies (default = only a dead
// Tier-1 ref blocks; AGENT_REFS_STRICT=1 = any dead ref blocks), --agents, --json, and the env-error path.
// Run: node --test src/checkAgentRefs.test.js   (covered by `npm test`).

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assert = require('node:assert');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-agent-refs.mjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrefs-'));
const HOME = path.join(TMP, 'home');
const AGENTS = path.join(HOME, '.claude', 'agents');
const GOOD = path.join(HOME, '.claude', 'memory', 'patterns', 'good');
fs.mkdirSync(AGENTS, { recursive: true });
fs.mkdirSync(GOOD, { recursive: true });
fs.writeFileSync(path.join(GOOD, 'real-standard.md'), '# exists\n');

// alpha: 1 live Tier-1 ref, 1 dead Tier-1 ref, 1 template Tier-1 ref, 1 dead body ref.
fs.writeFileSync(path.join(AGENTS, 'alpha.md'), [
  '## Tier 1 — Always Load First',
  '1. `~/.claude/memory/patterns/good/real-standard.md`',
  '2. `~/.claude/memory/patterns/good/missing-standard.md`',
  '3. `~/.claude/memory/runs/YYYY-MM-DD.md`',
  '',
  '## Workflow',
  'Afterwards read `~/.claude/memory/patterns/good/absent-body-note.md` if relevant.',
  '',
].join('\n'));

// beta: the Tier-1 block must CLOSE at the next heading/tier marker — these dead refs are body, not tier-1.
fs.writeFileSync(path.join(AGENTS, 'beta.md'), [
  '### Tier 1:',
  '- `~/.claude/memory/patterns/good/real-standard.md`',
  '',
  'Tier 2 (as needed):',
  '- `~/.claude/memory/patterns/good/gone-tier2.md`',
  '',
  '## Notes',
  '- `~/.claude/memory/patterns/good/gone-notes.md`',
  '- see `~/.claude/memory/patterns/good/` for the rest', // directory, not a ref — must not be counted
  '- `~/.claude/skills/{agent}/playbook.md` and `~/.claude/memory/design/<niche>/pack.md`',
  '',
].join('\n'));

function run(args = [], env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME, USERPROFILE: HOME, AGENT_REFS_STRICT: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('classifies refs and blocks on a dead Tier-1 reference', () => {
  const r = run(['--json']);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);

  assert.equal(j.agents, 2);
  // alpha 4 + beta 5 (the bare directory pointer is not extension-anchored, so it is not a ref)
  assert.equal(j.total, 9);
  assert.equal(j.skippedTemplate, 3, 'YYYY-MM-DD, {agent}, <niche>');

  assert.deepEqual(j.deadTier1.map((d) => d.ref), ['~/.claude/memory/patterns/good/missing-standard.md']);
  assert.equal(j.deadTier1[0].agent, 'alpha');
  assert.equal(j.deadTier1[0].line, 3);

  assert.deepEqual(j.deadBody.map((d) => `${d.agent}:${path.basename(d.ref)}`).sort(), [
    'alpha:absent-body-note.md', 'beta:gone-notes.md', 'beta:gone-tier2.md',
  ]);
  assert.equal(j.pass, false);
});

test('dead body refs alone warn but do not block — and AGENT_REFS_STRICT=1 makes them block', () => {
  fs.writeFileSync(path.join(GOOD, 'missing-standard.md'), '# now exists\n');
  try {
    const lenient = run([]);
    assert.equal(lenient.code, 0, lenient.stdout);
    assert.match(lenient.stdout, /no dead Tier-1 refs/);
    assert.match(lenient.stdout, /WARN {2}body/);

    const strict = run(['--json'], { AGENT_REFS_STRICT: '1' });
    assert.equal(strict.code, 1);
    assert.equal(JSON.parse(strict.stdout).pass, false);
  } finally {
    fs.rmSync(path.join(GOOD, 'missing-standard.md'));
  }
});

test('exits 0 when every referenced file resolves', () => {
  const clean = path.join(TMP, 'clean-agents');
  fs.mkdirSync(clean, { recursive: true });
  fs.writeFileSync(path.join(clean, 'gamma.md'), '## Tier 1\n1. `~/.claude/memory/patterns/good/real-standard.md`\n');
  const r = run(['--agents', clean]);
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /every referenced knowledge file resolves/);
});

test('unreadable agents dir is an env error, not a pass', () => {
  const r = run(['--agents', path.join(TMP, 'does-not-exist')]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /ENV-ERROR/);
});

// Smoke-test against the REAL brain. It reports rather than asserts zero: the 4 pre-existing dead Tier-1
// refs are a known backlog, and `npm test` going red on them would just get the suite ignored. The
// blocking verdict lives in `npm run check:agent-refs` (exit 1), which is what CI/the gate runs.
test('runs against the real agent brain and returns a usable verdict', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf8' });
  assert.notEqual(r.status, 2, `env error: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.ok(j.agents > 0 && j.total > 0);
  if (j.deadTier1.length) {
    console.log(`  [known backlog] ${j.deadTier1.length} dead Tier-1 ref(s): ${j.deadTier1.map((d) => `${d.agent}.md:${d.line}`).join(', ')}`);
  }
});
