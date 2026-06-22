'use strict';

// Read-only repo introspection for the Workspace "repo connection" panel. SAFETY:
//   • Only an ALLOWLIST of read-only git subcommands runs (rev-parse, status
//     --porcelain, rev-list --count, log -1). Never fetch/pull/push/checkout/
//     commit/add/reset.
//   • execFileSync with an argv ARRAY → no shell → injection-proof even if a path
//     contains shell metacharacters.
//   • `dir` is always a server-resolved project.build_dir, never a request param.
//   • timeout 1500ms + try/catch everywhere → a non-git or hung dir degrades to
//     { isRepo:false }, never hangs the request.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
}
function safe(fn) { try { return fn(); } catch { return null; } }

function readGitStatus(dir) {
  try {
    if (git(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return { isRepo: false };
    const branch = safe(() => git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']));
    const porcelain = safe(() => git(dir, ['status', '--porcelain'])) || '';
    const dirty = porcelain.split('\n').filter(Boolean).length;
    let ahead = null, behind = null;
    try {
      const c = git(dir, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
      const [b, a] = c.split(/\s+/).map(Number);
      behind = Number.isFinite(b) ? b : null;
      ahead = Number.isFinite(a) ? a : null;
    } catch { /* no upstream configured — leave ahead/behind null */ }
    const raw = safe(() => git(dir, ['log', '-1', '--format=%h%s%cI']));
    let lastCommit = null;
    if (raw) { const [hash, subject, iso] = raw.split(''); lastCommit = { hash, subject, ts: iso }; }
    return { isRepo: true, branch, dirty, clean: dirty === 0, ahead, behind, lastCommit };
  } catch {
    return { isRepo: false };
  }
}

// The store/theme this repo is locked to (.boldteq-theme-lock.json) — same file
// src/lib/buildRuns.js reads. Best-effort; null when absent.
function readThemeLock(dir) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(dir, '.boldteq-theme-lock.json'), 'utf-8'));
    return {
      store: lock && lock.store ? String(lock.store) : null,
      themeName: lock && lock.themeName ? String(lock.themeName) : null,
      themeId: lock && lock.themeId ? String(lock.themeId) : null,
    };
  } catch { return null; }
}

module.exports = { readGitStatus, readThemeLock };
