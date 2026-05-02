#!/usr/bin/env node
// Golden-harness v1 — diff review + manual approval.
//
// Usage:
//   node scripts/compactor/review.mjs <agent>           # show diff, prompt y/n
//   node scripts/compactor/review.mjs <agent> --apply   # non-interactive apply (CI)
//   node scripts/compactor/review.mjs <agent> --print   # print diff only
//
// Workflow:
//   1. Read the live agent (~/.claude/agents/<id>.md).
//   2. Read the staged replacement (./.compactor-staging/<id>.md and ./.compactor-staging/skills/...).
//   3. Render a unified diff of the core body + list of new skill files.
//   4. Prompt for approval (y/n). If y, atomically move staged → real path.
//   5. If no staged file exists, tell the user to run: compact.mjs <agent> --staging.
//
// Exit codes:
//   0  approved + applied (or --print succeeded)
//   1  rejected / nothing to review
//   2  fatal error

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const HOME = os.homedir();
const AGENTS_DIR = path.join(HOME, '.claude', 'agents');
const SKILLS_DIR = path.join(HOME, '.claude', 'skills');
const STAGING = path.resolve(process.cwd(), '.compactor-staging');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/compactor/review.mjs <agent> [--apply|--print]');
  process.exit(2);
}
const agentId = args[0].replace(/\.md$/, '');
const flags = new Set(args.slice(1));

function fail(msg) { console.error(msg); process.exit(2); }

const livePath = path.join(AGENTS_DIR, `${agentId}.md`);
const stagedCorePath = path.join(STAGING, `${agentId}.md`);
const stagedSkillsDir = path.join(STAGING, 'skills', agentId);

if (!fs.existsSync(stagedCorePath)) {
  console.error(`No staged compaction for "${agentId}".`);
  console.error(`Run:  node scripts/compactor/compact.mjs ${agentId} --staging`);
  process.exit(1);
}
if (!fs.existsSync(livePath)) fail(`Live agent missing: ${livePath}`);

const live = fs.readFileSync(livePath, 'utf-8');
const staged = fs.readFileSync(stagedCorePath, 'utf-8');

// ── Simple unified diff (no dependency) ─────────────────────────────────────
function unifiedDiff(aText, bText, aName, bName, context = 2) {
  const a = aText.split('\n');
  const b = bText.split('\n');
  // Myers-ish LCS is overkill for a review UI. Fall back to a line-by-line
  // streaming diff using a rolling window — good enough to spot-check.
  const n = a.length, m = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  const hunks = [];
  let hunk = null;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      if (hunk) { hunk.lines.push({ t: ' ', v: a[i] }); if (hunk.lines.length > hunk.trailingCap) hunk = null; }
      i++; j++;
    } else {
      if (!hunk) hunk = { aStart: i, bStart: j, lines: [], trailingCap: 50 };
      hunks.push(hunk);
      if (dp[i + 1][j] >= dp[i][j + 1]) { hunk.lines.push({ t: '-', v: a[i] }); i++; }
      else { hunk.lines.push({ t: '+', v: b[j] }); j++; }
    }
  }
  while (i < n) { if (!hunk) { hunk = { aStart: i, bStart: j, lines: [], trailingCap: 50 }; hunks.push(hunk); } hunk.lines.push({ t: '-', v: a[i++] }); }
  while (j < m) { if (!hunk) { hunk = { aStart: i, bStart: j, lines: [], trailingCap: 50 }; hunks.push(hunk); } hunk.lines.push({ t: '+', v: b[j++] }); }

  // Dedupe overlapping hunks (rough)
  const uniq = [];
  for (const h of hunks) {
    const last = uniq[uniq.length - 1];
    if (!last || last !== h) uniq.push(h);
  }

  if (uniq.length === 0) return `${aName} → ${bName}: no changes\n`;

  let s = `--- ${aName}\n+++ ${bName}\n`;
  for (const h of uniq.slice(0, 30)) {
    s += `@@ line ${h.aStart + 1} → ${h.bStart + 1} @@\n`;
    for (const l of h.lines.slice(0, 60)) {
      const color = l.t === '-' ? '\x1b[31m' : l.t === '+' ? '\x1b[32m' : '\x1b[90m';
      s += `${color}${l.t}${l.v}\x1b[0m\n`;
    }
    if (h.lines.length > 60) s += `  … +${h.lines.length - 60} more lines\n`;
  }
  if (uniq.length > 30) s += `  … +${uniq.length - 30} more hunks\n`;
  return s;
}

// ── Skill file listing ───────────────────────────────────────────────────────
function walkSkills(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSkills(full));
    else if (entry.name.endsWith('.md')) {
      const rel = path.relative(dir, full);
      const stat = fs.statSync(full);
      out.push({ rel, lines: fs.readFileSync(full, 'utf-8').split('\n').length, bytes: stat.size });
    }
  }
  return out;
}

const newSkills = walkSkills(stagedSkillsDir);
const existingSkills = walkSkills(path.join(SKILLS_DIR, agentId));

// ── Render report ────────────────────────────────────────────────────────────
console.log('');
console.log(`\x1b[1m=== Compactor Review: ${agentId} ===\x1b[0m`);
console.log('');
console.log(`Live core:    ${live.split('\n').length} lines (${live.length} bytes) — ${livePath.replace(HOME, '~')}`);
console.log(`Staged core:  ${staged.split('\n').length} lines (${staged.length} bytes) — ${stagedCorePath}`);
console.log(`Skills:       ${newSkills.length} new file(s) staged, ${existingSkills.length} currently live`);
console.log('');

if (newSkills.length > 0) {
  console.log('\x1b[1mNew skills (to be written):\x1b[0m');
  for (const s of newSkills.slice(0, 40)) {
    console.log(`  + skills/${agentId}/${s.rel}  (${s.lines} lines)`);
  }
  if (newSkills.length > 40) console.log(`  … +${newSkills.length - 40} more`);
  console.log('');
}

console.log('\x1b[1mCore body diff:\x1b[0m');
const diff = unifiedDiff(live, staged, `a/${agentId}.md`, `b/${agentId}.md`);
console.log(diff);

// ── Decision ─────────────────────────────────────────────────────────────────
if (flags.has('--print')) process.exit(0);

async function confirm() {
  if (flags.has('--apply')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('\x1b[1mApply? [y/N] \x1b[0m', (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

const approved = await confirm();
if (!approved) {
  console.log('Rejected. Staged files remain at .compactor-staging/ for your inspection.');
  process.exit(1);
}

// ── Apply ────────────────────────────────────────────────────────────────────
function atomicWrite(dst, buf) {
  const dir = path.dirname(dst);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = dst + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dst);
}

// Write skills first
for (const s of newSkills) {
  const src = path.join(stagedSkillsDir, s.rel);
  const dst = path.join(SKILLS_DIR, agentId, s.rel);
  atomicWrite(dst, fs.readFileSync(src));
}
// Then core
atomicWrite(livePath, Buffer.from(staged, 'utf-8'));

console.log(`\x1b[32m✓ Applied\x1b[0m — ${livePath.replace(HOME, '~')} + ${newSkills.length} skill file(s)`);
console.log('Rollback: `cd ~/.claude && git diff` then `git restore` if needed.');
