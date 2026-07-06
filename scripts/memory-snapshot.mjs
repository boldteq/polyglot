#!/usr/bin/env node
// Memory snapshot — git-commit ~/.claude/memory on a schedule so the agent brain has real
// version history + rollback, instead of the ad-hoc 30-min file-copy loop (which died silently
// and nobody noticed — see gap audit 2026-07-02). Idempotent: no-ops cleanly when nothing changed.
// Usage: node scripts/memory-snapshot.mjs
// Emits ONE final JSON line: { ok, changed, filesChanged, sha } — the caller (systemSchedules.js)
// parses the last stdout line, matching the appAudit/suiteHealth convention.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const MEMORY_DIR = path.join(os.homedir(), '.claude', 'memory');

function git(args) {
  return execFileSync('git', args, { cwd: MEMORY_DIR, encoding: 'utf8' }).trim();
}

function main() {
  if (!fs.existsSync(path.join(MEMORY_DIR, '.git'))) {
    console.log(JSON.stringify({ ok: false, error: `${MEMORY_DIR} is not a git repo — run: git init` }));
    process.exit(1);
  }
  git(['add', '-A']);
  const staged = git(['diff', '--cached', '--name-only']);
  if (!staged) {
    console.log(JSON.stringify({ ok: true, changed: false, filesChanged: 0 }));
    return;
  }
  const filesChanged = staged.split('\n').filter(Boolean).length;
  const ts = new Date().toISOString();
  git(['commit', '-m', `snapshot ${ts} — ${filesChanged} file(s)`, '--quiet']);
  const sha = git(['rev-parse', '--short', 'HEAD']);
  console.log(JSON.stringify({ ok: true, changed: true, filesChanged, sha }));
}

main();
