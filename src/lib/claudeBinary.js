'use strict';

// Phase 8 — Production-grade Run-Agent hardening
// Resolves the `claude` CLI binary at boot, caches its absolute path + version,
// and exposes a preflight check used by /api/playground/preflight, the Setup
// self-test, and the playground spawn path. Replaces the previous brittle
// `process.env.CLAUDE_PATH || 'claude'` shell-lookup which silently fell back
// to PATH and surfaced ENOENT as a generic "Failed to start agent process".
//
// Order of resolution:
//   1. configService → defaults.claude_path  (admin-tunable override)
//   2. process.env.CLAUDE_PATH               (env override)
//   3. `which claude` / `where claude`       (PATH lookup)
//   4. Hardcoded fallback candidates         (common install locations)
//
// Cache lives for the process lifetime. Restart server after install/upgrade.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const FALLBACK_CANDIDATES = [
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
  path.join(os.homedir(), '.npm-global/bin/claude'),
  path.join(os.homedir(), '.local/bin/claude'),
  path.join(os.homedir(), '.bun/bin/claude'),
  path.join(os.homedir(), '.volta/bin/claude'),
];

let _resolved = null; // { path, version, source, error }

function isExecutable(p) {
  if (!p) return false;
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function whichBinary(binaryName) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = execSync(`${cmd} ${binaryName}`, { encoding: 'utf-8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] });
    const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function probeVersion(claudePath) {
  try {
    const result = spawnSync(claudePath, ['--version'], { encoding: 'utf-8', timeout: 1500 });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim().split('\n')[0];
    }
  } catch {
    /* fall through */
  }
  return null;
}

function resolveClaudePath() {
  if (_resolved) return _resolved;

  const tried = [];
  const consider = (candidate, source) => {
    if (!candidate) return null;
    tried.push({ candidate, source });
    if (isExecutable(candidate)) return { candidate, source };
    return null;
  };

  // 1. configService override (lazy require to avoid circular deps at boot)
  let configOverride = null;
  try {
    const cfg = require('./configService');
    configOverride = cfg.getConfig('defaults.claude_path') || null;
  } catch {
    /* configService not ready yet during early boot */
  }

  const checks = [
    consider(configOverride, 'app_config.defaults.claude_path'),
    consider(process.env.CLAUDE_PATH, 'env.CLAUDE_PATH'),
    consider(whichBinary('claude'), `${process.platform === 'win32' ? 'where' : 'which'}`),
    ...FALLBACK_CANDIDATES.map((c) => consider(c, 'fallback-candidate')),
  ];

  const hit = checks.find(Boolean);
  if (!hit) {
    _resolved = {
      path: null,
      version: null,
      source: null,
      error: `claude binary not found. Tried ${tried.length} locations.`,
      tried,
    };
    return _resolved;
  }

  _resolved = {
    path: hit.candidate,
    version: probeVersion(hit.candidate),
    source: hit.source,
    error: null,
    tried,
  };
  return _resolved;
}

function getClaudePath() {
  return resolveClaudePath().path;
}

function getClaudeVersion() {
  return resolveClaudePath().version;
}

function isAvailable() {
  return !!resolveClaudePath().path;
}

function invalidate() {
  _resolved = null;
}

// Auth check is intentionally lightweight — we DO NOT call `claude login --status`
// or read credentials files (those locations differ across claude CLI versions).
// Instead we surface ANTHROPIC_API_KEY presence + a hint. The actual auth
// failure path is detected at run time via stderr inspection in the spawn flow.
function runPreflight() {
  const r = resolveClaudePath();
  return {
    binary: {
      ok: !!r.path,
      path: r.path,
      version: r.version,
      source: r.source,
      error: r.error,
    },
    auth: {
      ok: !!process.env.ANTHROPIC_API_KEY || !!r.path, // optimistic — claude CLI may have a logged-in session
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      hint: process.env.ANTHROPIC_API_KEY
        ? null
        : 'No ANTHROPIC_API_KEY env detected. If claude CLI is logged in via `claude login`, this is fine. Otherwise authenticate before running agents.',
    },
    env: {
      home: os.homedir(),
      platform: process.platform,
    },
  };
}

// Minimal end-to-end spawn used by /api/setup/self-test. Returns a promise that
// resolves with the run outcome. NEVER throws — always resolves with a structured
// result object so the caller can record a stage success/failure cleanly.
function runMinimalAgentTest({ claudePath, agentInstructions, prompt, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    if (!claudePath) {
      resolve({ ok: false, exitCode: null, output: '', stderr: '', durationMs: 0, error: 'no claude binary' });
      return;
    }
    const { spawn } = require('child_process');
    const childEnv = { ...process.env, HOME: os.homedir() };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
    delete childEnv.CLAUDE_AGENT_SDK_VERSION;

    const startedAt = Date.now();
    let proc;
    try {
      proc = spawn(claudePath, ['-p'], { env: childEnv });
    } catch (err) {
      resolve({ ok: false, exitCode: null, output: '', stderr: String(err.message || err), durationMs: 0, error: 'spawn_failed' });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        exitCode: null,
        output: stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        error: 'timeout',
      });
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      finish({
        ok: false,
        exitCode: null,
        output: stdout,
        stderr: stderr + '\n' + String(err.message || err),
        durationMs: Date.now() - startedAt,
        error: err.code || 'spawn_error',
      });
    });
    proc.on('close', (code) => {
      finish({
        ok: code === 0 && !!stdout.trim(),
        exitCode: code,
        output: stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        error: code === 0 ? (stdout.trim() ? null : 'empty_output') : `exit_${code}`,
      });
    });

    const fullPrompt = agentInstructions
      ? `${agentInstructions}\n\n---\n\n## Task:\n${prompt}`
      : prompt;
    try {
      proc.stdin.write(fullPrompt, 'utf-8');
      proc.stdin.end();
    } catch (err) {
      finish({
        ok: false,
        exitCode: null,
        output: stdout,
        stderr: stderr + '\n' + String(err.message || err),
        durationMs: Date.now() - startedAt,
        error: 'stdin_error',
      });
    }
  });
}

function logBootStatus() {
  const r = resolveClaudePath();
  if (r.path) {
    console.log(`[boot] claude binary: ${r.path}${r.version ? ` (${r.version})` : ''} [source=${r.source}]`);
  } else {
    console.warn(`[boot] WARN: claude binary not found. Run Self-Test on /setup for diagnostics. ${r.error}`);
  }
  return r;
}

module.exports = {
  getClaudePath,
  getClaudeVersion,
  isAvailable,
  runPreflight,
  runMinimalAgentTest,
  invalidate,
  logBootStatus,
};
