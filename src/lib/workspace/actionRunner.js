'use strict';

// P4 — bounded, allowlisted action runner for the Workspace dashboard. The ONLY
// mutation P4 allows is "re-run static gates" against a known build dir, which
// writes only to <build>/gate-reports/ (never theme code, never the store). Every
// invocation is:
//   • ALLOWLISTED — only `theme-gates.mjs --static-only` can be spawned; no
//     arbitrary command, no shell, args are fixed (spawn with an argv array).
//   • SCOPED — the build dir must be a dir we discovered (caller resolves it via
//     dirFor(buildId)); this module never takes a raw path from the client.
//   • OBSERVABLE — runs in the background, status tracked in-memory, streamed.
//
// Confirm-gating happens in the UI (confirmDialog before POST). Store-writing
// actions (porter) and Lens capture (needs a live preview URL) are intentionally
// out of P4 scope.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TOOLKIT = path.resolve(process.cwd(), 'theme-toolkit', 'scripts', 'theme-gates.mjs');

// runId → { buildId, dir, action, status, startedMs, endedMs, exitCode, log[] }
const runs = new Map();
let seq = 0;

function newRunId() { seq += 1; return `wsact-${seq}-${process.pid}`; }

// Start a static-gate re-run. `dir` MUST be a validated build dir (resolved by
// the caller from a known buildId). Returns the run record (without the live proc).
function runStaticGates({ buildId, dir }) {
  if (!dir || !fs.existsSync(dir)) throw new Error('build dir not found');
  if (!fs.existsSync(TOOLKIT)) throw new Error('theme-gates toolkit not found');

  const id = newRunId();
  const rec = { runId: id, buildId, dir, action: 'gates:static', status: 'running', startedMs: Date.now(), endedMs: null, exitCode: null, log: [] };
  runs.set(id, rec);

  // FIXED argv — node <toolkit> --static-only, CWD = the build dir (gates scan CWD,
  // write to <cwd>/gate-reports/). No shell, no interpolation.
  const proc = spawn(process.execPath, [TOOLKIT, '--static-only'], {
    cwd: dir,
    env: { ...process.env },
  });
  rec._proc = proc;

  const push = (chunk) => {
    const s = String(chunk);
    rec.log.push(s);
    if (rec.log.length > 400) rec.log.splice(0, rec.log.length - 400); // cap memory
  };
  proc.stdout.on('data', push);
  proc.stderr.on('data', push);
  proc.on('error', (err) => { rec.status = 'error'; rec.endedMs = Date.now(); push(`[spawn error] ${err.message}`); });
  proc.on('close', (code) => {
    rec.status = code === 0 ? 'done' : 'failed';
    rec.exitCode = code;
    rec.endedMs = Date.now();
    delete rec._proc;
  });

  return publicRec(rec);
}

function publicRec(rec) {
  if (!rec) return null;
  const { _proc, ...rest } = rec; // never serialize the child proc
  void _proc;
  return { ...rest, log: rec.log.join('') };
}

function getRun(id) { return publicRec(runs.get(id)); }

// Cancel a running action (best-effort SIGTERM).
function cancelRun(id) {
  const rec = runs.get(id);
  if (rec && rec._proc) { try { rec._proc.kill('SIGTERM'); } catch { /* */ } rec.status = 'cancelled'; rec.endedMs = Date.now(); return true; }
  return false;
}

module.exports = { runStaticGates, getRun, cancelRun };
