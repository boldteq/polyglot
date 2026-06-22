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

// Read one file's content for the in-panel viewer. STRICT path containment: the
// resolved path must be inside `dir` (no traversal). Text-only, size-capped.
const MAX_FILE = 512 * 1024; // 512KB
function readRepoFile(dir, relPath) {
  const abs = path.resolve(dir, relPath || '');
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return { ok: false, error: 'path escapes repo' };
  let st;
  try { st = fs.statSync(abs); } catch { return { ok: false, error: 'not found' }; }
  if (!st.isFile()) return { ok: false, error: 'not a file' };
  if (st.size > MAX_FILE) return { ok: false, error: 'file too large', size: st.size };
  let buf;
  try { buf = fs.readFileSync(abs); } catch (e) { return { ok: false, error: e.message }; }
  if (buf.slice(0, 8000).includes(0)) return { ok: false, error: 'binary file', size: st.size };
  return { ok: true, path: relPath, content: buf.toString('utf-8'), size: st.size, ext: path.extname(abs).slice(1) };
}

// Read-only git diff of the working tree (uncommitted changes). Returns a capped
// unified diff + a per-file name-status summary. Same safety as readGitStatus.
const MAX_DIFF = 200 * 1024;
function gitDiff(dir) {
  try {
    if (git(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return { isRepo: false, files: [], diff: '' };
    const nameStatus = safe(() => git(dir, ['diff', '--name-status'])) || '';
    const files = nameStatus.split('\n').filter(Boolean).map((l) => {
      const [status, ...rest] = l.split('\t');
      return { status, path: rest.join('\t') };
    });
    let diff = safe(() => execFileSync('git', ['diff'], { cwd: dir, timeout: 2500, maxBuffer: MAX_DIFF * 2 }).toString()) || '';
    let truncated = false;
    if (diff.length > MAX_DIFF) { diff = diff.slice(0, MAX_DIFF); truncated = true; }
    return { isRepo: true, files, diff, truncated };
  } catch { return { isRepo: false, files: [], diff: '' }; }
}

module.exports = { readGitStatus, readThemeLock, readRepoFile, gitDiff };
