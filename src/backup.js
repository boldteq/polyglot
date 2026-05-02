/**
 * Backup System — GitHub-as-database
 *
 * Backs up ~/.claude/ (agents, memory, rules, commands, CLAUDE.md, config,
 * history, logs) to a private GitHub repo with:
 *   - Chokidar file watcher + 5-sec debounced commit
 *   - 15-minute safety-net commit
 *   - Local commit queue for offline resilience
 *   - PAT-based auth (token stored encrypted in config.json)
 *   - Preview-diff restore flow
 *
 * State and settings are persisted in config.json under `backup` key.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const simpleGit = require('simple-git');
const chokidar = require('chokidar');
const db = require('./db');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const BACKUP_REPO_DIR = path.join(CLAUDE_DIR, '.backups', 'repo');
const SNAPSHOTS_DIR = path.join(CLAUDE_DIR, '.backups', 'snapshots');
const BACKUP_STATE_PATH = path.join(CLAUDE_DIR, '.backups', 'state.json');
const QUEUE_PATH = path.join(CLAUDE_DIR, '.backups', 'queue.json');
const LOCK_PATH = path.join(CLAUDE_DIR, '.backups', 'backup.lock');
const LOG_PATH = path.join(CLAUDE_DIR, '.backups', 'backup.log');
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 min — any lock older is abandoned

// Core paths to back up (relative to ~/.claude/)
const INCLUDE_PATHS = [
  'agents',
  'memory',
  'rules',
  'commands',
  'templates',
  'projects',
  'CLAUDE.md',
  'settings.json',
  'history',
  'logs',
];

// Paths to always exclude (written to .gitignore inside backup repo)
const EXCLUDE_PATTERNS = [
  '.backups/',         // never back up the backup itself
  'node_modules/',
  '.DS_Store',
  '*.log.tmp',
  'caches/',
  '.git/',
];

// Debounce timings
const COMMIT_DEBOUNCE_MS = 5000;      // 5 sec after last change
const SAFETY_NET_INTERVAL_MS = 15 * 60 * 1000; // 15 min catchall

// Token encryption — derived from a stable machine-local key
function getMachineKey() {
  // Uses hostname + home dir as a weak-but-stable key derivation
  // For production: store a real secret in env var or OS keychain
  const seed = `${os.hostname()}-${os.homedir()}-claude-hub-backup-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptToken(plaintext) {
  if (!plaintext) return '';
  const key = getMachineKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptToken(ciphertext) {
  if (!ciphertext) return '';
  try {
    const [ivB64, tagB64, encB64] = ciphertext.split(':');
    const key = getMachineKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (err) {
    log('error', 'token_decrypt_failed', { message: err.message });
    return '';
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ──────────────────────────────────────────────────────────────────────────
//  Structured logging — rotated at 1 MB
// ──────────────────────────────────────────────────────────────────────────

const LOG_MAX_BYTES = 1024 * 1024;

function log(level, event, meta = {}) {
  try {
    ensureDir(path.dirname(LOG_PATH));
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_PATH, LOG_PATH + '.1');
    }
    const line = JSON.stringify({
      t: new Date().toISOString(),
      level,
      event,
      ...meta,
    }) + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // logging must never throw
  }
}

function tailLog(lines = 200) {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const content = fs.readFileSync(LOG_PATH, 'utf-8');
    const all = content.trim().split('\n').filter(Boolean);
    return all.slice(-lines).map((l) => {
      try { return JSON.parse(l); } catch { return { t: '', level: 'raw', event: l }; }
    });
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  Concurrency lock — prevents overlapping backups across restarts
// ──────────────────────────────────────────────────────────────────────────

function acquireLock() {
  ensureDir(path.dirname(LOCK_PATH));
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const stat = fs.statSync(LOCK_PATH);
      if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) {
        return false; // active lock
      }
      // stale — reclaim
      log('warn', 'stale_lock_reclaimed', { ageMs: Date.now() - stat.mtimeMs });
    } catch {}
  }
  try {
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'w' });
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {}
}

// ──────────────────────────────────────────────────────────────────────────
//  Push error classifier — turns raw git stderr into actionable diagnostics
// ──────────────────────────────────────────────────────────────────────────

/**
 * Classify a git push / clone / auth failure into a stable error code.
 * Codes: REPO_NOT_FOUND | AUTH_INVALID | PERMISSION_DENIED | NETWORK |
 *        NON_FAST_FORWARD | LFS_REQUIRED | UNKNOWN
 */
function classifyGitError(rawMessage) {
  const msg = (rawMessage || '').toLowerCase();

  if (/\b404\b|repository not found|not found\.?\s*$/.test(msg)) {
    return {
      code: 'REPO_NOT_FOUND',
      title: 'Repository does not exist',
      detail: 'The backup repo URL points to a repository that has not been created yet.',
      fix: 'Create the repo on GitHub, or click "Create Repo" to have us create it for you.',
      actions: ['create_remote', 'change_repo'],
    };
  }
  if (/\b401\b|bad credentials|authentication failed|could not read username/.test(msg)) {
    return {
      code: 'AUTH_INVALID',
      title: 'GitHub token is invalid or expired',
      detail: 'The stored Personal Access Token was rejected by GitHub.',
      fix: 'Generate a new fine-grained PAT with "Contents: Read and Write" scope and reconnect.',
      actions: ['reconnect'],
    };
  }
  if (/\b403\b|permission denied|forbidden|write access.*not granted|requested url returned error: 403/.test(msg)) {
    return {
      code: 'PERMISSION_DENIED',
      title: 'Token lacks write permission',
      detail: 'The token is valid but does not have write access to this repository.',
      fix: 'Regenerate the PAT with "Contents: Read and Write" scope for this repo, then reconnect.',
      actions: ['reconnect', 'verify_remote'],
    };
  }
  if (/non-fast-forward|fetch first|rejected.*fetch|updates were rejected/.test(msg)) {
    return {
      code: 'NON_FAST_FORWARD',
      title: 'Remote has diverged',
      detail: 'The remote branch has commits that are not in your local backup.',
      fix: 'Resolve manually — this usually means the remote was edited outside the backup system.',
      actions: ['retry_push'],
    };
  }
  if (/lfs|large file/.test(msg)) {
    return {
      code: 'LFS_REQUIRED',
      title: 'Large file detected',
      detail: 'A file exceeds GitHub\'s 100 MB limit and requires Git LFS.',
      fix: 'Exclude large files or enable Git LFS on the backup repo.',
      actions: [],
    };
  }
  if (/could not resolve host|network|timeout|getaddrinfo|econnrefused|econnreset/.test(msg)) {
    return {
      code: 'NETWORK',
      title: 'Network unreachable',
      detail: 'Could not reach GitHub. Your commits are safe locally and will push when connectivity returns.',
      fix: 'Check your internet connection, then retry.',
      actions: ['retry_push'],
    };
  }
  return {
    code: 'UNKNOWN',
    title: 'Push failed',
    detail: rawMessage ? rawMessage.split('\n')[0].slice(0, 200) : 'Unknown error',
    fix: 'Review the error detail and check the backup logs.',
    actions: ['retry_push', 'verify_remote'],
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  GitHub REST API — verify token, check repo existence, create repo
// ──────────────────────────────────────────────────────────────────────────

function parseRepoUrl(repoUrl) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== 'github.com') return null;
    const parts = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) return null;
    return { owner: parts[0], name: parts[1] };
  } catch {
    return null;
  }
}

function githubRequest({ method, pathname, token, body }) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: pathname,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Polyglot-Backup/1.0',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 10000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = chunks ? JSON.parse(chunks) : null; } catch {}
        resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
      });
    });
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null, error: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

async function verifyRemote() {
  const cfg = getBackupConfig();
  if (!cfg || !cfg.repoUrl) {
    return { ok: false, code: 'NOT_CONFIGURED', detail: 'No backup configured' };
  }
  const token = decryptToken(cfg.tokenEnc || '');
  if (!token) {
    return { ok: false, code: 'NO_TOKEN', detail: 'Token missing or undecryptable' };
  }
  const parsed = parseRepoUrl(cfg.repoUrl);
  if (!parsed) {
    return { ok: false, code: 'BAD_URL', detail: 'Repo URL must be https://github.com/OWNER/NAME(.git)' };
  }

  // 1. Token identity — /user
  const whoami = await githubRequest({ method: 'GET', pathname: '/user', token });
  if (whoami.status === 401) {
    return { ok: false, code: 'AUTH_INVALID', detail: 'Token rejected by GitHub', repo: parsed };
  }
  if (whoami.status !== 200) {
    return { ok: false, code: 'NETWORK', detail: whoami.error || `GitHub API ${whoami.status}`, repo: parsed };
  }
  const user = whoami.body?.login;

  // 2. Token scopes — classic PATs expose them via header; fine-grained return null
  const scopes = (whoami.headers?.['x-oauth-scopes'] || '').split(',').map((s) => s.trim()).filter(Boolean);

  // 3. Repo existence — /repos/:owner/:name
  const repo = await githubRequest({
    method: 'GET',
    pathname: `/repos/${parsed.owner}/${parsed.name}`,
    token,
  });

  if (repo.status === 404) {
    return {
      ok: false,
      code: 'REPO_NOT_FOUND',
      detail: `Repository ${parsed.owner}/${parsed.name} does not exist (or token can't see it)`,
      repo: parsed,
      user,
      scopes,
      canCreate: parsed.owner === user || scopes.includes('repo'),
    };
  }
  if (repo.status === 403) {
    return { ok: false, code: 'PERMISSION_DENIED', detail: 'Token lacks access to this repo', repo: parsed, user, scopes };
  }
  if (repo.status !== 200) {
    return { ok: false, code: 'NETWORK', detail: repo.error || `GitHub API ${repo.status}`, repo: parsed };
  }

  // 4. Write permission
  const canWrite = !!repo.body?.permissions?.push;
  if (!canWrite) {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      detail: 'Token has read access but not write access',
      repo: parsed,
      user,
      scopes,
    };
  }

  return {
    ok: true,
    code: 'OK',
    detail: 'Token valid, repo exists, write access confirmed',
    repo: parsed,
    user,
    scopes,
    isPrivate: !!repo.body?.private,
    defaultBranch: repo.body?.default_branch || 'main',
  };
}

async function createRemote({ private: isPrivate = true } = {}) {
  const cfg = getBackupConfig();
  if (!cfg || !cfg.repoUrl) return { ok: false, error: 'No backup configured' };
  const token = decryptToken(cfg.tokenEnc || '');
  if (!token) return { ok: false, error: 'Token missing' };
  const parsed = parseRepoUrl(cfg.repoUrl);
  if (!parsed) return { ok: false, error: 'Invalid repo URL' };

  // Determine owner type — user vs org
  const whoami = await githubRequest({ method: 'GET', pathname: '/user', token });
  if (whoami.status !== 200) {
    return { ok: false, error: `Cannot verify token identity: ${whoami.status}` };
  }
  const user = whoami.body?.login;

  const isUserRepo = parsed.owner === user;
  const createPath = isUserRepo ? '/user/repos' : `/orgs/${parsed.owner}/repos`;

  const result = await githubRequest({
    method: 'POST',
    pathname: createPath,
    token,
    body: {
      name: parsed.name,
      private: isPrivate,
      description: 'Polyglot — encrypted backup of ~/.claude/',
      auto_init: false,
    },
  });

  if (result.status === 201) {
    log('info', 'remote_created', { owner: parsed.owner, name: parsed.name });
    return { ok: true, repo: parsed, url: result.body?.html_url };
  }
  if (result.status === 422) {
    // Already exists — that's fine, treat as success
    return { ok: true, repo: parsed, alreadyExists: true };
  }
  return {
    ok: false,
    error: result.body?.message || `GitHub API ${result.status}`,
    status: result.status,
  };
}

async function retryPush() {
  const cfg = getBackupConfig();
  if (!cfg || !cfg.repoUrl) return { ok: false, error: 'Not configured' };
  if (!fs.existsSync(path.join(BACKUP_REPO_DIR, '.git'))) {
    return { ok: false, error: 'No local backup repo — run a backup first' };
  }
  const token = decryptToken(cfg.tokenEnc || '');
  const git = await initRepo(cfg.repoUrl, token);
  try {
    const result = await pushWithAutoRebase(git);
    const queue = loadQueue();
    queue.pending = 0;
    queue.lastFailedPush = null;
    saveQueue(queue);
    const state = loadState();
    state.lastBackupStatus = 'pushed';
    state.lastBackupError = null;
    saveState(state);
    log('info', 'retry_push_ok', { strategy: result.strategy });
    return { ok: true, strategy: result.strategy };
  } catch (err) {
    const diagnosis = classifyGitError(err.message);
    const queue = loadQueue();
    queue.lastFailedPush = { at: new Date().toISOString(), error: err.message, diagnosis };
    saveQueue(queue);
    log('error', 'retry_push_failed', { code: diagnosis.code });
    return { ok: false, error: err.message, diagnosis };
  }
}

function loadState() {
  try {
    if (fs.existsSync(BACKUP_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(BACKUP_STATE_PATH, 'utf-8'));
    }
  } catch {}
  return {
    lastBackupAt: null,
    lastBackupStatus: null,
    lastBackupError: null,
    commitCount: 0,
    lastCommitSha: null,
    nextSafetyNetAt: null,
  };
}

function saveState(state) {
  try {
    ensureDir(path.dirname(BACKUP_STATE_PATH));
    const tmp = BACKUP_STATE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, BACKUP_STATE_PATH);
  } catch (err) {
    log('error', 'save_state_failed', { error: err.message });
  }
}

function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
    }
  } catch {}
  return { pending: 0, lastFailedPush: null };
}

function saveQueue(queue) {
  ensureDir(path.dirname(QUEUE_PATH));
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

// Build a .gitignore for the backup repo
function writeGitignore() {
  const content = EXCLUDE_PATTERNS.join('\n') + '\n';
  fs.writeFileSync(path.join(BACKUP_REPO_DIR, '.gitignore'), content);
}

// Sync ~/.claude/* (included paths only) into the backup repo.
// This mirrors files; we don't rsync metadata because git tracks them anyway.
function syncToRepo() {
  ensureDir(BACKUP_REPO_DIR);

  for (const rel of INCLUDE_PATHS) {
    const src = path.join(CLAUDE_DIR, rel);
    const dest = path.join(BACKUP_REPO_DIR, rel);

    if (!fs.existsSync(src)) {
      // Remove from repo if previously backed up
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      continue;
    }

    const stat = fs.statSync(src);
    if (stat.isFile()) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    } else if (stat.isDirectory()) {
      copyDirMirror(src, dest);
    }
  }

  writeGitignore();
}

// Mirror src → dest, removing files in dest that no longer exist in src
function copyDirMirror(src, dest) {
  ensureDir(dest);

  const srcEntries = new Set(fs.readdirSync(src));
  // Remove stale files in dest
  if (fs.existsSync(dest)) {
    for (const entry of fs.readdirSync(dest)) {
      if (!srcEntries.has(entry)) {
        fs.rmSync(path.join(dest, entry), { recursive: true, force: true });
      }
    }
  }

  for (const entry of srcEntries) {
    if (entry === '.git') continue; // never copy git dirs
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const st = fs.statSync(s);
    if (st.isFile()) {
      fs.copyFileSync(s, d);
    } else if (st.isDirectory()) {
      copyDirMirror(s, d);
    }
  }
}

// ── Commit message generation ──────────────────────────────────────────────

// Granular category labels — memory split by subdirectory so curriculum,
// patterns, stacks etc. appear as distinct bullet points in the commit body.
function categoryFor(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p === 'CLAUDE.md') return 'CLAUDE.md';
  if (p === 'settings.json') return 'settings';
  if (p.startsWith('agents/')) return 'agents';
  if (p.startsWith('memory/')) {
    const sub = p.slice(7).split('/')[0]; // first segment after memory/
    const known = ['curriculum', 'patterns', 'stacks', 'design', 'content',
                   'skills', 'user', 'projects', 'training'];
    return known.includes(sub) ? `memory/${sub}` : 'memory';
  }
  if (p.startsWith('rules/')) return 'rules';
  if (p.startsWith('commands/')) return 'commands';
  if (p.startsWith('templates/')) return 'templates';
  if (p.startsWith('projects/')) return 'projects';
  if (p.startsWith('history/')) return 'history';
  if (p.startsWith('logs/')) return 'logs';
  return 'other';
}

// Short human-readable label for a single file — used in the body bullet list.
// Strips hashes, long path prefixes, and known extensions so only the
// meaningful name remains.
function shortName(relPath) {
  const p = relPath.replace(/\\/g, '/');
  const base = path.basename(p).replace(/\.(md|json|yaml|yml|txt)$/, '');

  if (p === 'CLAUDE.md' || p === 'settings.json') return base;
  if (p.startsWith('agents/')) return base;
  if (p.startsWith('memory/') || p.startsWith('rules/') ||
      p.startsWith('commands/') || p.startsWith('templates/')) return base;

  if (p.startsWith('projects/')) {
    const parts = p.split('/');
    const dirName = parts[1] || '';
    // dir is encoded fs path: -Users-yashbaldha-Desktop-Boldteq-App-<Name>
    const skipWords = new Set(['users', 'yashbaldha', 'desktop', 'boldteq',
                               'app', 'home', 'code', 'repos']);
    const words = dirName.split('-').filter(w => w && !skipWords.has(w.toLowerCase()));
    const projectName = words.slice(0, 3).join('-') || dirName.slice(-15);
    const filename = parts[2] || '';
    if (!filename) return projectName;
    if (filename.endsWith('.jsonl')) return `${projectName} history`;
    if (filename === 'CLAUDE.md') return `${projectName} CLAUDE.md`;
    if (filename === 'agents' && parts[3]) {
      return `${projectName} agent/${parts[3].replace(/\.md$/, '')}`;
    }
    return `${projectName}/${path.basename(filename)}`;
  }

  return base;
}

// Friendly name for the single-file commit title.
function friendlyName(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.startsWith('agents/')) return `agent ${path.basename(p, '.md')}`;
  if (p.startsWith('rules/')) return `rule ${path.basename(p, '.md')}`;
  if (p.startsWith('commands/')) return `command ${path.basename(p, '.md')}`;
  if (p.startsWith('templates/')) return `template ${path.basename(p, '.md')}`;
  return shortName(relPath);
}

// Build the ≤72-char title in conventional-commits style:
//   chore: agents(3), memory/curriculum(1), projects(4)
function buildTitle(all, categories) {
  if (all.length === 1) {
    const item = all[0];
    const verb = item.op === '+' ? 'add' : item.op === '-' ? 'remove' : 'update';
    return `chore: ${verb} ${friendlyName(item.path)}`.slice(0, 72);
  }

  const ranked = Object.entries(categories)
    .map(([name, files]) => ({ name, count: files.length }))
    .sort((a, b) => b.count - a.count);

  // Build "cat(n), cat(n), ..." fitting within 72 chars
  const prefix = 'chore: ';
  const budget = 72 - prefix.length;
  const parts = [];
  let used = 0;
  for (const { name, count } of ranked) {
    const token = `${name}(${count})`;
    const extra = parts.length === 0 ? token.length : token.length + 2; // ", "
    if (used + extra > budget) {
      const rem = ranked.length - parts.length;
      if (rem > 0) parts.push(`+${rem} more`);
      break;
    }
    parts.push(token);
    used += extra;
  }
  return `${prefix}${parts.join(', ')}`.slice(0, 72);
}

// Build the body as one bullet per category:
//   - agents (3): decoder, spark (~), elio (new)
//   - projects (4): Marketing-Site history (×2), Polyglot history, Ecom-testing history
function buildBody(categories) {
  const MAX_PER_BULLET = 6;
  const opRank = { '~': 0, '+': 1, '-': 2 };
  const ordered = Object.entries(categories).sort((a, b) => b[1].length - a[1].length);
  const lines = [];

  for (const [cat, files] of ordered) {
    const sorted = [...files].sort((a, b) => opRank[a.op] - opRank[b.op]);

    // Build short label for each file, annotate op only when it adds signal
    const hasAdd = sorted.some(f => f.op === '+');
    const hasDel = sorted.some(f => f.op === '-');
    const mixedOps = hasAdd || hasDel;

    const rawNames = sorted.map(f => {
      const sn = shortName(f.path);
      const tag = mixedOps ? (f.op === '+' ? ' (new)' : f.op === '-' ? ' (del)' : '') : '';
      return `${sn}${tag}`;
    });

    // Deduplicate with ×N suffix (common for project history JSONL)
    const counts = {};
    for (const n of rawNames) counts[n] = (counts[n] || 0) + 1;
    const deduped = [];
    const seen = new Set();
    for (const n of rawNames) {
      if (seen.has(n)) continue;
      seen.add(n);
      deduped.push(counts[n] > 1 ? `${n} (×${counts[n]})` : n);
    }

    const shown = deduped.slice(0, MAX_PER_BULLET);
    const extra = deduped.length - shown.length;
    const nameList = shown.join(', ') + (extra > 0 ? `, +${extra} more` : '');
    lines.push(`- ${cat} (${files.length}): ${nameList}`);
  }

  return lines.join('\n');
}

// Generate a descriptive commit message from the git status
async function generateCommitMessage(git) {
  const status = await git.status();
  const all = [
    ...status.modified.map(f => ({ path: f, op: '~' })),
    ...status.not_added.map(f => ({ path: f, op: '+' })),
    ...status.created.map(f => ({ path: f, op: '+' })),
    ...status.deleted.map(f => ({ path: f, op: '-' })),
  ];
  if (all.length === 0) return null;

  // Categorize every file
  const categories = {};
  for (const item of all) {
    const cat = categoryFor(item.path);
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(item);
  }

  const title = buildTitle(all, categories);
  if (all.length === 1) return title;
  return `${title}\n\n${buildBody(categories)}`;
}

// Get the loadConfig/saveConfig functions from server.js via injection
let _loadConfig = null;
let _saveConfig = null;

function setConfigFns(loadFn, saveFn) {
  _loadConfig = loadFn;
  _saveConfig = saveFn;
}

function getBackupConfig() {
  if (!_loadConfig) return null;
  const config = _loadConfig();
  return config.backup || null;
}

function setBackupConfig(backupConfig) {
  if (!_loadConfig || !_saveConfig) return;
  const config = _loadConfig();
  config.backup = backupConfig;
  _saveConfig(config);
}

// ──────────────────────────────────────────────────────────────────────────
//  Core backup operations
// ──────────────────────────────────────────────────────────────────────────

async function initRepo(repoUrl, token) {
  ensureDir(BACKUP_REPO_DIR);

  const git = simpleGit(BACKUP_REPO_DIR);

  // Check if already a git repo
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
  }

  // Set identity (required for commits)
  await git.addConfig('user.name', 'Polyglot Backup');
  await git.addConfig('user.email', 'backup@polyglot.local');

  // Set or update remote with authenticated URL
  const authUrl = buildAuthenticatedUrl(repoUrl, token);
  const remotes = await git.getRemotes(true);
  const existing = remotes.find((r) => r.name === 'origin');
  if (existing) {
    await git.remote(['set-url', 'origin', authUrl]);
  } else {
    await git.addRemote('origin', authUrl);
  }

  // Ensure we're on 'main' branch
  try {
    await git.checkoutLocalBranch('main');
  } catch {
    // Branch already exists, just check it out
    try {
      await git.checkout('main');
    } catch {}
  }

  return git;
}

function buildAuthenticatedUrl(repoUrl, token) {
  if (!token) return repoUrl;
  // Convert https://github.com/user/repo(.git) → https://<token>@github.com/user/repo.git
  try {
    const url = new URL(repoUrl);
    url.username = token;
    if (!url.pathname.endsWith('.git')) url.pathname += '.git';
    return url.toString();
  } catch {
    return repoUrl;
  }
}

async function doBackup({ skipPush = false } = {}) {
  const cfg = getBackupConfig();
  if (!cfg || !cfg.enabled) {
    return { ok: false, error: 'Backup not configured or disabled' };
  }
  if (!cfg.repoUrl) {
    return { ok: false, error: 'No repo URL configured' };
  }

  if (!acquireLock()) {
    return { ok: false, error: 'Another backup is already running' };
  }

  const startedAt = Date.now();
  const state = loadState();
  const queue = loadQueue();
  const token = decryptToken(cfg.tokenEnc || '');

  try {
    log('info', 'backup_start', { skipPush });

    syncToRepo();
    const git = await initRepo(cfg.repoUrl, token);

    await git.add('./*');
    await git.add('.gitignore');

    const message = await generateCommitMessage(git);
    if (!message) {
      if (!skipPush && queue.pending > 0) {
        await pushQueued(git, cfg);
      }
      state.lastBackupAt = new Date().toISOString();
      state.lastBackupStatus = 'noop';
      state.lastBackupError = null;
      state.lastBackupDiagnosis = null;
      saveState(state);
      log('info', 'backup_noop', { durationMs: Date.now() - startedAt });
      return { ok: true, committed: false, pushed: queue.pending === 0 };
    }

    await git.commit(message);
    state.commitCount = (state.commitCount || 0) + 1;
    const gitLog = await git.log(['-1']).catch(() => null);
    if (gitLog?.latest?.hash) state.lastCommitSha = gitLog.latest.hash;

    let pushed = false;
    let diagnosis = null;
    if (!skipPush) {
      try {
        await pushWithAutoRebase(git);
        pushed = true;
        queue.pending = 0;
        queue.lastFailedPush = null;
      } catch (pushErr) {
        diagnosis = classifyGitError(pushErr.message);
        queue.pending = (queue.pending || 0) + 1;
        queue.lastFailedPush = {
          at: new Date().toISOString(),
          error: pushErr.message,
          diagnosis,
        };
        log('warn', 'push_failed', { code: diagnosis.code });
      }
      saveQueue(queue);
    }

    state.lastBackupAt = new Date().toISOString();
    state.lastBackupStatus = pushed ? 'pushed' : (skipPush ? 'committed' : 'queued');
    state.lastBackupError = diagnosis ? diagnosis.detail : null;
    state.lastBackupDiagnosis = diagnosis;
    saveState(state);

    log('info', 'backup_done', {
      pushed,
      committed: true,
      durationMs: Date.now() - startedAt,
      code: diagnosis?.code || 'OK',
    });

    return { ok: true, committed: true, pushed, message, diagnosis };
  } catch (err) {
    const diagnosis = classifyGitError(err.message);
    state.lastBackupAt = new Date().toISOString();
    state.lastBackupStatus = 'error';
    state.lastBackupError = diagnosis.detail;
    state.lastBackupDiagnosis = diagnosis;
    saveState(state);
    log('error', 'backup_error', { code: diagnosis.code, raw: err.message });
    try { db.insertErrorLog({ source: 'server', level: 'error', message: `Backup failed: ${err.message}`, stack: err.stack, context: { code: diagnosis?.code, detail: diagnosis?.detail } }); } catch {}
    return { ok: false, error: err.message, diagnosis };
  } finally {
    releaseLock();
  }
}

/**
 * Push with automatic rebase on non-fast-forward errors.
 * Strategy:
 *   1. Normal push
 *   2. If NON_FAST_FORWARD → git pull --rebase origin main → retry push
 *   3. If rebase fails (conflict) → abort rebase, push --force-with-lease
 *      (safer than --force: fails if remote changed since our last fetch)
 * Returns { ok: true } or throws the original push error.
 */
async function pushWithAutoRebase(git) {
  try {
    await git.push(['-u', 'origin', 'main']);
    return { ok: true, strategy: 'direct' };
  } catch (pushErr) {
    const diagnosis = classifyGitError(pushErr.message);
    if (diagnosis.code !== 'NON_FAST_FORWARD') throw pushErr;

    log('info', 'push_non_ff_detected_rebasing');
    try {
      await git.fetch(['origin', 'main']);
      await git.pull(['--rebase', 'origin', 'main']);
      await git.push(['-u', 'origin', 'main']);
      log('info', 'push_after_rebase_ok');
      return { ok: true, strategy: 'rebase' };
    } catch (rebaseErr) {
      log('warn', 'rebase_failed_fallback_to_force_with_lease', { err: rebaseErr.message });
      try { await git.raw(['rebase', '--abort']); } catch {}
      await git.push(['--force-with-lease', '-u', 'origin', 'main']);
      log('info', 'push_force_with_lease_ok');
      return { ok: true, strategy: 'force-with-lease' };
    }
  }
}

async function pushQueued(git, _cfg) {
  const queue = loadQueue();
  try {
    await pushWithAutoRebase(git);
    queue.pending = 0;
    queue.lastFailedPush = null;
    saveQueue(queue);
    log('info', 'push_queued_ok');
    return true;
  } catch (err) {
    const diagnosis = classifyGitError(err.message);
    queue.lastFailedPush = {
      at: new Date().toISOString(),
      error: err.message,
      diagnosis,
    };
    saveQueue(queue);
    log('warn', 'push_queued_failed', { code: diagnosis.code });
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  File watcher + debounced commits + safety net
// ──────────────────────────────────────────────────────────────────────────

let watcher = null;
let debounceTimer = null;
let safetyNetTimer = null;
let retryTimer = null;
let backupInProgress = false;

// Exponential backoff for queued push retry: 1m → 2m → 5m → 15m → 30m (capped)
const RETRY_SCHEDULE_MS = [60_000, 120_000, 300_000, 900_000, 1_800_000];

function scheduleRetryPush() {
  if (retryTimer) clearTimeout(retryTimer);
  const queue = loadQueue();
  if (!queue.pending || queue.pending === 0) return;
  const attempt = Math.min(queue.pending - 1, RETRY_SCHEDULE_MS.length - 1);
  const delay = RETRY_SCHEDULE_MS[attempt];
  retryTimer = setTimeout(async () => {
    if (backupInProgress) { scheduleRetryPush(); return; }
    backupInProgress = true;
    try {
      const result = await retryPush();
      if (!result.ok) scheduleRetryPush();
    } finally {
      backupInProgress = false;
    }
  }, delay);
}

function scheduleDebouncedBackup() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (backupInProgress) return;
    backupInProgress = true;
    try {
      await doBackup();
    } finally {
      backupInProgress = false;
    }
  }, COMMIT_DEBOUNCE_MS);
}

function startSafetyNet() {
  stopSafetyNet();
  safetyNetTimer = setInterval(async () => {
    if (backupInProgress) return;
    backupInProgress = true;
    try {
      await doBackup();
    } finally {
      backupInProgress = false;
    }
  }, SAFETY_NET_INTERVAL_MS);
}

function stopSafetyNet() {
  if (safetyNetTimer) {
    clearInterval(safetyNetTimer);
    safetyNetTimer = null;
  }
}

function startWatcher() {
  stopWatcher();

  const watchTargets = INCLUDE_PATHS
    .map((rel) => path.join(CLAUDE_DIR, rel))
    .filter((p) => fs.existsSync(p));

  if (watchTargets.length === 0) return;

  watcher = chokidar.watch(watchTargets, {
    ignored: [
      /(^|[\/\\])\../, // dotfiles
      /node_modules/,
      /\.backups/,
      /\.git/,
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('all', () => scheduleDebouncedBackup());
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function startBackupService() {
  const cfg = getBackupConfig();
  if (!cfg || !cfg.enabled || !cfg.repoUrl) {
    console.log('  Backup: not configured (see /backup in UI)');
    return;
  }
  // Clean up any stale lock from a crashed previous run
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
      if (age > LOCK_STALE_MS) fs.unlinkSync(LOCK_PATH);
    }
  } catch {}
  startWatcher();
  startSafetyNet();
  scheduleRetryPush();
  log('info', 'service_start', { repo: cfg.repoUrl });
  console.log(`  Backup: enabled → ${cfg.repoUrl}`);
}

function stopBackupService() {
  stopWatcher();
  stopSafetyNet();
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  log('info', 'service_stop');
}

// ──────────────────────────────────────────────────────────────────────────
//  Restore — list history, preview diff, apply
// ──────────────────────────────────────────────────────────────────────────

async function listCommits(limit = 50) {
  if (!fs.existsSync(path.join(BACKUP_REPO_DIR, '.git'))) return [];
  const git = simpleGit(BACKUP_REPO_DIR);
  try {
    const log = await git.log([`--max-count=${limit}`]);
    return log.all.map((c) => ({
      hash: c.hash,
      shortHash: c.hash.slice(0, 7),
      date: c.date,
      message: c.message,
      author: c.author_name,
    }));
  } catch {
    return [];
  }
}

const PREVIEW_FILE_LIMIT = 500; // cap diff to avoid freezing large restores

async function previewRestore(commitSha) {
  if (!fs.existsSync(path.join(BACKUP_REPO_DIR, '.git'))) {
    return { ok: false, error: 'No backup repo found' };
  }
  // Validate commitSha is a plausible git ref (40-char hex or short ref)
  if (!/^[0-9a-f]{4,40}$/i.test(commitSha)) {
    return { ok: false, error: 'Invalid commit SHA' };
  }
  const git = simpleGit(BACKUP_REPO_DIR);
  try {
    // Diff between working copy and the target commit
    const diffSummary = await git.diffSummary([commitSha, 'HEAD']);
    const allChanges = diffSummary.files.map((f) => ({
      file: f.file,
      changes: 'changes' in f ? f.changes : 0,
      insertions: 'insertions' in f ? f.insertions : 0,
      deletions: 'deletions' in f ? f.deletions : 0,
      binary: f.binary,
    }));
    const truncated = allChanges.length > PREVIEW_FILE_LIMIT;
    const changes = truncated ? allChanges.slice(0, PREVIEW_FILE_LIMIT) : allChanges;
    return { ok: true, commitSha, totalFiles: allChanges.length, changes, truncated };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function applyRestore(commitSha) {
  if (!fs.existsSync(path.join(BACKUP_REPO_DIR, '.git'))) {
    return { ok: false, error: 'No backup repo found' };
  }
  const git = simpleGit(BACKUP_REPO_DIR);
  try {
    // 1. Checkout the target commit into the repo dir
    await git.checkout(commitSha);

    // 2. Mirror repo files back into ~/.claude/ (the inverse of syncToRepo)
    for (const rel of INCLUDE_PATHS) {
      const src = path.join(BACKUP_REPO_DIR, rel);
      const dest = path.join(CLAUDE_DIR, rel);
      if (!fs.existsSync(src)) continue;

      const st = fs.statSync(src);
      if (st.isFile()) {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
      } else if (st.isDirectory()) {
        copyDirMirror(src, dest);
      }
    }

    // 3. Return to main branch head so future backups continue
    await git.checkout('main').catch((err) => {
      log('warn', 'restore_checkout_main_failed', { message: err.message });
    });

    return { ok: true, commitSha };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  Snapshot system — pre-edit file copies for automated agents
// ──────────────────────────────────────────────────────────────────────────

const MAX_SNAPSHOTS = 500;

function createSnapshot(targetPath, agentName = 'unknown') {
  try {
    if (!fs.existsSync(targetPath)) return null;
    ensureDir(SNAPSHOTS_DIR);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const rel = path.relative(CLAUDE_DIR, targetPath).replace(/[/\\]/g, '__');
    const snapName = `${ts}__${agentName}__${rel}`;
    const snapPath = path.join(SNAPSHOTS_DIR, snapName);

    fs.copyFileSync(targetPath, snapPath);
    rotateSnapshots();
    return snapPath;
  } catch (err) {
    console.warn('Snapshot failed:', err.message);
    return null;
  }
}

function rotateSnapshots() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) return;
    const entries = fs.readdirSync(SNAPSHOTS_DIR)
      .map((name) => {
        try {
          return { name, mtime: fs.statSync(path.join(SNAPSHOTS_DIR, name)).mtime.getTime() };
        } catch {
          return null; // file deleted between readdir and stat — skip
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime); // newest first

    if (entries.length <= MAX_SNAPSHOTS) return;

    for (const old of entries.slice(MAX_SNAPSHOTS)) {
      try { fs.unlinkSync(path.join(SNAPSHOTS_DIR, old.name)); } catch {}
    }
  } catch {}
}

function listSnapshots() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
    return fs.readdirSync(SNAPSHOTS_DIR)
      .map((name) => {
        const full = path.join(SNAPSHOTS_DIR, name);
        const stat = fs.statSync(full);
        // Format: TS__agent__rel-path
        const parts = name.split('__');
        const ts = parts[0];
        const agent = parts[1];
        const rel = parts.slice(2).join('__').replace(/__/g, '/');
        return {
          name,
          ts,
          agent,
          relPath: rel,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.mtime.localeCompare(a.mtime));
  } catch {
    return [];
  }
}

function restoreSnapshot(snapshotName) {
  try {
    const snapPath = path.join(SNAPSHOTS_DIR, snapshotName);
    if (!fs.existsSync(snapPath)) {
      return { ok: false, error: 'Snapshot not found' };
    }
    const parts = snapshotName.split('__');
    const rel = parts.slice(2).join('__').replace(/__/g, '/');
    const dest = path.join(CLAUDE_DIR, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(snapPath, dest);
    return { ok: true, restoredTo: dest };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  Public API
// ──────────────────────────────────────────────────────────────────────────

// Count files in INCLUDE_PATHS modified after a given timestamp.
// Cheap directory walk + mtime check; capped to avoid runaway scans on huge trees.
function countChangedSince(sinceISO) {
  if (!sinceISO) {
    // No prior backup → don't claim changes; treat as 'unknown' upstream.
    return { count: null, sample: [], scanLimited: false };
  }
  const since = new Date(sinceISO).getTime();
  if (Number.isNaN(since)) return { count: null, sample: [], scanLimited: false };

  const SCAN_FILE_CAP = 20000;        // hard ceiling on files inspected
  const SAMPLE_CAP = 5;               // surface a few example paths in UI
  let count = 0;
  let scanned = 0;
  let scanLimited = false;
  const sample = [];

  const skipNames = new Set(['.git', 'node_modules', '.DS_Store', 'caches', '.backups']);

  function walk(absPath, relRoot) {
    if (scanLimited) return;
    let entries;
    try { entries = fs.readdirSync(absPath, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (scanLimited) return;
      if (skipNames.has(ent.name)) continue;
      const full = path.join(absPath, ent.name);
      const rel = path.join(relRoot, ent.name);
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile()) {
        scanned++;
        if (scanned > SCAN_FILE_CAP) { scanLimited = true; return; }
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat.mtimeMs > since) {
          count++;
          if (sample.length < SAMPLE_CAP) sample.push(rel);
        }
      }
    }
  }

  for (const rel of INCLUDE_PATHS) {
    if (scanLimited) break;
    const abs = path.join(CLAUDE_DIR, rel);
    if (!fs.existsSync(abs)) continue;
    let stat;
    try { stat = fs.statSync(abs); } catch { continue; }
    if (stat.isDirectory()) {
      walk(abs, rel);
    } else if (stat.isFile()) {
      scanned++;
      if (stat.mtimeMs > since) {
        count++;
        if (sample.length < SAMPLE_CAP) sample.push(rel);
      }
    }
  }

  return { count, sample, scanLimited };
}

function getStatus() {
  const cfg = getBackupConfig();
  const state = loadState();
  const queue = loadQueue();

  // Parse a friendly owner/name out of the repo URL for UI display
  let repoParsed = null;
  if (cfg?.repoUrl) {
    repoParsed = parseRepoUrl(cfg.repoUrl);
  }

  // Files modified in CLAUDE_DIR (within INCLUDE_PATHS) since last successful backup.
  // Surfaces "you have uncommitted changes" signal to the UI.
  const pendingChanges = countChangedSince(state.lastBackupAt);

  return {
    configured: !!(cfg && cfg.repoUrl),
    enabled: !!(cfg && cfg.enabled),
    repoUrl: cfg?.repoUrl || null,
    repoOwner: repoParsed?.owner || null,
    repoName: repoParsed?.name || null,
    watchActive: !!watcher,
    lastBackupAt: state.lastBackupAt,
    lastBackupStatus: state.lastBackupStatus,
    lastBackupError: state.lastBackupError,
    lastBackupDiagnosis: state.lastBackupDiagnosis || null,
    commitCount: state.commitCount || 0,
    lastCommitSha: state.lastCommitSha,
    pendingQueue: queue.pending || 0,
    pendingChanges: pendingChanges.count,                // null if unknown (no prior backup)
    pendingChangesSample: pendingChanges.sample,         // up to 5 example paths
    pendingChangesScanLimited: pendingChanges.scanLimited,
    lastFailedPush: queue.lastFailedPush,
    includePaths: INCLUDE_PATHS,
    snapshotCount: listSnapshots().length,
    maxSnapshots: MAX_SNAPSHOTS,
    healthy: !state.lastBackupDiagnosis && !queue.lastFailedPush && (queue.pending || 0) === 0 && state.lastBackupStatus !== 'error',
  };
}

async function connect({ repoUrl, token }) {
  if (!repoUrl || typeof repoUrl !== 'string') {
    return { ok: false, error: 'repoUrl is required' };
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'GitHub PAT is required' };
  }

  const tokenEnc = encryptToken(token);
  setBackupConfig({
    enabled: true,
    repoUrl: repoUrl.trim(),
    tokenEnc,
    connectedAt: new Date().toISOString(),
  });

  // Pre-flight: verify token + repo via GitHub API before attempting git push
  const verify = await verifyRemote();
  if (!verify.ok) {
    // Config was saved; caller can act on diagnosis (e.g. create_remote)
    return { ok: false, error: verify.detail, diagnosis: verify, stage: 'verify' };
  }

  // Try an initial backup to validate end-to-end
  const result = await doBackup();
  if (!result.ok) {
    return {
      ok: false,
      error: `Initial backup failed: ${result.error}`,
      diagnosis: result.diagnosis,
      stage: 'initial_backup',
    };
  }

  // Start watcher + safety net now that we're live
  startBackupService();

  return { ok: true, initialBackup: result, verify };
}

function disconnect() {
  const cfg = getBackupConfig();
  if (cfg) {
    setBackupConfig({ ...cfg, enabled: false });
  }
  stopBackupService();
  return { ok: true };
}

module.exports = {
  setConfigFns,
  startBackupService,
  stopBackupService,
  getStatus,
  connect,
  disconnect,
  doBackup,
  listCommits,
  previewRestore,
  applyRestore,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  verifyRemote,
  createRemote,
  retryPush,
  tailLog,
  classifyGitError,
};
