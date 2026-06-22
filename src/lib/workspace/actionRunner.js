'use strict';

// Bounded, allowlisted action runner for the Workspace cockpit. Every action is:
//   • ALLOWLISTED — the actionId MUST resolve to an entry in actionRegistry.js;
//     the script + args come from THAT entry, never from the client. The script
//     is additionally required to live inside theme-toolkit/scripts/ (dir
//     containment), so a registry typo can't reach an arbitrary binary.
//   • SCOPED — the build dir is resolved by the caller from a known buildId via
//     dirFor(); this module never takes a raw path from the client.
//   • SAFE (P1) — only `tier:'safe'` entries exist today: read-only or writes
//     only to <build>/gate-reports/. Never theme code, never the store.
//   • OBSERVABLE — runs in the background, status tracked in-memory, polled.
//
// Confirm-gating happens in the UI (confirmDialog before POST).

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getAction, TOOLKIT_DIR } = require('./actionRegistry');

// runId → { buildId, dir, action, status, startedMs, endedMs, exitCode, log[] }
const runs = new Map();
let seq = 0;

function newRunId() { seq += 1; return `wsact-${seq}-${process.pid}`; }

// Resolve + harden a script name to an absolute path: must exist AND be inside
// the toolkit scripts dir (defense in depth beyond the allowlist).
function resolveScriptName(name) {
  const abs = path.resolve(TOOLKIT_DIR, name);
  if (abs !== path.join(TOOLKIT_DIR, name) && !abs.startsWith(TOOLKIT_DIR + path.sep)) {
    throw new Error('action script escapes toolkit dir');
  }
  if (!fs.existsSync(abs)) throw new Error(`action script not found: ${name}`);
  return abs;
}
function resolveScript(entry) { return resolveScriptName(entry.script); }

// Run a sequence of toolkit scripts one at a time, appending to rec.log. Stops
// (status='failed') on the first non-zero exit; status='done' only if all pass.
function runChain(rec, steps, dir, i) {
  if (i >= steps.length) {
    if (rec.status === 'running') { rec.status = 'done'; rec.exitCode = 0; rec.endedMs = Date.now(); delete rec._proc; }
    return;
  }
  let scriptAbs;
  try { scriptAbs = resolveScriptName(steps[i].script); }
  catch (err) { rec.status = 'failed'; rec.endedMs = Date.now(); rec.log.push(`[chain error] ${err.message}`); delete rec._proc; return; }
  rec.log.push(`\n— step ${i + 1}/${steps.length}: ${steps[i].script} —\n`);
  const proc = spawn(process.execPath, [scriptAbs, ...(steps[i].args || [])], { cwd: dir, env: { ...process.env } });
  rec._proc = proc;
  const push = (c) => { rec.log.push(String(c)); if (rec.log.length > 400) rec.log.splice(0, rec.log.length - 400); };
  proc.stdout.on('data', push);
  proc.stderr.on('data', push);
  proc.on('error', (err) => { rec.status = 'error'; rec.endedMs = Date.now(); push(`[spawn error] ${err.message}`); delete rec._proc; });
  proc.on('close', (code) => {
    if (rec.status === 'cancelled') { delete rec._proc; return; } // user cancelled — don't advance
    if (code !== 0) { rec.status = 'failed'; rec.exitCode = code; rec.endedMs = Date.now(); delete rec._proc; return; }
    runChain(rec, steps, dir, i + 1); // next step
  });
}

// Start an allowlisted action. `actionId` MUST be a registry id; `dir` MUST be a
// validated build dir. Returns the public run record (or a synthetic blocked
// record when required env is missing — never spawns in that case).
function runAction({ buildId, dir, actionId }) {
  if (!dir || !fs.existsSync(dir)) throw new Error('build dir not found');
  const entry = getAction(actionId);
  if (!entry) { const e = new Error(`unknown action: ${actionId}`); e.code = 'UNKNOWN_ACTION'; throw e; }

  // env gate — block (don't spawn) with a clear reason if a required var is unset
  const missing = (entry.requiresEnv || []).filter((k) => !process.env[k]);
  if (missing.length) {
    const id = newRunId();
    const rec = { runId: id, buildId, dir, action: entry.id, status: 'blocked', startedMs: Date.now(), endedMs: Date.now(), exitCode: null, log: [`[blocked] missing env: ${missing.join(', ')}`] };
    runs.set(id, rec);
    return publicRec(rec);
  }

  const id = newRunId();
  const rec = { runId: id, buildId, dir, action: entry.id, status: 'running', startedMs: Date.now(), endedMs: null, exitCode: null, log: [] };
  runs.set(id, rec);

  // CHAIN entries (e.g. Lens = capture → judge → enforce): run scripts in
  // sequence, one proc at a time. Each script is still resolved from the registry
  // + dir-contained (same allowlist guarantees). Stops on the first non-zero exit.
  if (Array.isArray(entry.chain) && entry.chain.length) {
    runChain(rec, entry.chain, dir, 0);
    return publicRec(rec);
  }

  const scriptAbs = resolveScript(entry);
  // FIXED argv — node <script> <fixed args from registry>, CWD = the build dir.
  // No shell, no interpolation, no client-supplied args.
  const proc = spawn(process.execPath, [scriptAbs, ...entry.args], { cwd: dir, env: { ...process.env } });
  rec._proc = proc;

  const push = (chunk) => {
    rec.log.push(String(chunk));
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

// Back-compat alias for the shipped rerun-gates route/UI.
function runStaticGates({ buildId, dir }) {
  return runAction({ buildId, dir, actionId: 'gates:static' });
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

module.exports = { runAction, runStaticGates, getRun, cancelRun };
