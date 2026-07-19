'use strict';

// In-memory registry of in-flight autonomous BUILDS (maestro:build).
//
// WHY (same decoupling rationale as playgroundRuns.js): the maestro child process
// must be decoupled from the HTTP request that started it, so a build KEEPS RUNNING
// when the browser refreshes / navigates away, and a returning client RE-ATTACHES to
// the live log. The HTTP response(s) are just subscribers to a build; the process
// drives it independently. A finished build lingers for a grace window so a client
// that reloads right at the end still gets the verdict.
//
// Builds are deliberately a SEPARATE registry from playground runs (distinct
// metadata — store/repo/verdict — and so the two never collide in listActive /
// eviction). This module owns the maestro spawn so the route stays thin + the spawn
// is unit-testable in isolation (inject `spawnImpl`).

const { spawn: defaultSpawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const builds = new Map(); // buildId -> Build
const RESULT_GRACE_MS = 300_000; // keep a finished build 5 min for late reattach
const LOG_CAP = 200_000;         // bound accumulated log to ~200KB

// Resolve the maestro entrypoint for a theme repo. Prefer the repo's VENDORED copy
// (toolkit/scripts/maestro-build.mjs — what `pnpm maestro:build` runs inside a client
// repo); fall back to Polyglot's master copy so a not-yet-vendored repo still builds.
function resolveMaestro(repoPath) {
  const vendored = path.join(repoPath, 'toolkit', 'scripts', 'maestro-build.mjs');
  if (fs.existsSync(vendored)) return vendored;
  return path.resolve(process.cwd(), 'theme-toolkit', 'scripts', 'maestro-build.mjs');
}

// The store this repo is locked to (also the theme-lock SAFETY guard: a repo with no
// lock is not a linked store and must not be built against).
function readStore(repoPath) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(repoPath, '.boldteq-theme-lock.json'), 'utf-8'));
    return lock && lock.store ? String(lock.store) : null;
  } catch { return null; }
}

function getBuild(id) { return builds.get(id) || null; }

function listActive() {
  return [...builds.values()]
    .filter(b => b.status === 'running')
    .map(b => ({ id: b.id, store: b.store, brief: b.brief, previewUrl: b.previewUrl, startedAt: b.startedAt }));
}

function subscribe(b, res) { if (b) b.subscribers.add(res); }
function unsubscribe(b, res) { if (b) b.subscribers.delete(res); }

// Broadcast an SSE event to every attached client. Chunk events also accumulate into
// build.output (capped) so a reattaching client replays the log generated so far. A
// subscriber whose socket is dead is dropped silently (never throws).
function broadcast(b, event) {
  if (!b) return;
  if (event && event.type === 'chunk' && typeof event.content === 'string') {
    b.output += event.content;
    if (b.output.length > LOG_CAP) b.output = b.output.slice(-LOG_CAP);
  }
  if (event && (event.type === 'done' || event.type === 'error')) b.finalEvent = event;
  const raw = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of b.subscribers) { try { res.write(raw); } catch { b.subscribers.delete(res); } }
}

// Parse a completed maestro stdout line into a structured `heal` signal → the UI renders a live
// self-heal board (stage/round/owner-fix/converged/stalled/escalate) instead of only raw log text
// (2026-07-19 done-means-done clarity). Best-effort: an unmatched line emits nothing.
const HEAL_RE = [
  [/maestro:build — heal round (\d+)\/(\d+): (\d+) visual \+ (\d+) code\/content/i, (m) => ({ kind: 'round', round: +m[1], max: +m[2], visual: +m[3], code: +m[4] })],
  [/(gate-autofix|lens-autofix): ✅ CONVERGED in (\d+)/i, (m) => ({ kind: 'converged', layer: m[1], rounds: +m[2] })],
  [/(gate-autofix|lens-autofix): ESCALATION .*\((\d+) unresolved\)/i, (m) => ({ kind: 'escalate', layer: m[1], count: +m[2] })],
  [/(gate-autofix|lens-autofix): .*→ (\d+) blocker/i, (m) => ({ kind: 'scan', layer: m[1], blockers: +m[2] })],
  [/→ ([a-z]+): fixing (\d+)/i, (m) => ({ kind: 'fix', owner: m[1], count: +m[2] })],
  [/maestro:build — heal stalled at (\d+)/i, (m) => ({ kind: 'stalled', blockers: +m[1] })],
  [/stage (\d)\/4 — (.+)/i, (m) => ({ kind: 'stage', n: +m[1], label: m[2].trim() })],
];
function emitHeal(b, line) {
  for (const [re, fn] of HEAL_RE) { const m = line.match(re); if (m) { broadcast(b, { type: 'heal', ...fn(m) }); return; } }
}

function broadcastComment(b, text) {
  if (!b) return;
  const raw = `: ${text}\n\n`;
  for (const res of b.subscribers) { try { res.write(raw); } catch { b.subscribers.delete(res); } }
}

// Mark a build finished: end all attached responses + schedule eviction. The terminal
// event was already broadcast; build.finalEvent + build.output are kept so a client
// reattaching during the grace window gets the result immediately.
function markDone(b) {
  if (!b || b.status === 'done') return;
  b.status = 'done';
  b.endedAt = Date.now();
  for (const res of b.subscribers) { try { res.end(); } catch { /* already closed */ } }
  b.subscribers.clear();
  b._evictTimer = setTimeout(() => builds.delete(b.id), RESULT_GRACE_MS);
  if (b._evictTimer.unref) b._evictTimer.unref();
}

// Read the verdict maestro wrote (docs/publish-readiness.json), so the terminal event
// carries the real publish decision rather than just an exit code.
function readVerdict(repoPath, buildStateDir) {
  try {
    const p = path.resolve(repoPath, buildStateDir || 'docs', 'publish-readiness.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { publishReady: !!j.publishReady, stage: j.stage || null, reason: j.reason || null, gates: j.gates || null };
  } catch { return null; }
}

// Start an autonomous build. Validates the repo is a real LINKED theme repo, spawns
// maestro in it, and wires its stdout/stderr into the registry. Returns the Build.
// `spawnImpl` is injectable for tests. The publish-grade gate env (DS_REQUIRE_SCOPE /
// LENS_REQUIRE / STRICT_CONVERSION) is NOT set here — maestro-build sets it on its own
// gate subprocess (the LINCHPIN fix), so we only pass THEME_PREVIEW_URL + flags.
function startBuild({
  id, repoPath, previewUrl = '', brief = '', renderMode = 'dev',
  surfaces = null, budgetMin = 0, autoPreview = true, buildStateDir = 'docs',
  spawnImpl = defaultSpawn, log = () => {},
}) {
  if (!id) throw new Error('build id required');
  const prior = builds.get(id);
  if (prior) {
    if (prior.status === 'running') throw new Error('a build with this id is already running');
    if (prior._evictTimer) clearTimeout(prior._evictTimer);
  }
  if (!repoPath || !fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error('repoPath not found or not a directory');
  }
  const store = readStore(repoPath);
  if (!store) throw new Error('not a linked theme repo (.boldteq-theme-lock.json missing) — link the store first');

  const script = resolveMaestro(repoPath);
  if (!fs.existsSync(script)) throw new Error('maestro-build.mjs not found (repo not vendored + no master copy)');

  const args = [script, '--render', renderMode];
  if (autoPreview && renderMode !== 'push') args.push('--auto-preview');
  if (Array.isArray(surfaces) && surfaces.length) args.push('--surfaces', surfaces.join(','));
  if (budgetMin > 0) args.push('--budget', String(budgetMin));

  const env = { ...process.env };
  if (previewUrl) env.THEME_PREVIEW_URL = previewUrl;
  if (buildStateDir) env.BUILD_STATE_DIR = buildStateDir;

  const build = {
    id, repoPath, store, brief: brief || '', previewUrl: previewUrl || null, renderMode,
    status: 'running', output: '', startedAt: Date.now(), endedAt: null,
    exitCode: null, verdict: null, finalEvent: null,
    subscribers: new Set(), kill: null, _proc: null, _evictTimer: null,
  };
  builds.set(id, build);
  log(`build ${id} — maestro ${args.slice(1).join(' ')}  ·  store=${store}  ·  cwd=${repoPath}`);

  let proc;
  try {
    proc = spawnImpl(process.execPath, args, { cwd: repoPath, env });
  } catch (err) {
    broadcast(build, { type: 'error', error: `spawn failed: ${err.message}` });
    build.exitCode = -1;
    markDone(build);
    return build;
  }
  build._proc = proc;

  const onChunk = (chunk) => {
    const s = String(chunk);
    broadcast(build, { type: 'chunk', content: s });
    // line-buffer across chunk boundaries → emit a structured `heal` event per completed line
    build._lineBuf = (build._lineBuf || '') + s;
    const lines = build._lineBuf.split('\n');
    build._lineBuf = lines.pop();
    for (const ln of lines) emitHeal(build, ln);
  };
  if (proc.stdout) proc.stdout.on('data', onChunk);
  if (proc.stderr) proc.stderr.on('data', onChunk);
  proc.on('error', (err) => {
    broadcast(build, { type: 'error', error: `process error: ${err.message}` });
    if (build.exitCode == null) build.exitCode = -1;
    build._proc = null;
    markDone(build);
  });
  proc.on('close', (code) => {
    build.exitCode = code;
    const verdict = readVerdict(repoPath, buildStateDir);
    build.verdict = verdict;
    broadcast(build, {
      type: 'done',
      exitCode: code,
      publishReady: verdict ? verdict.publishReady : code === 0,
      stage: verdict ? verdict.stage : null,
      reason: verdict ? verdict.reason : null,
      durationMs: Date.now() - build.startedAt,
    });
    build._proc = null;
    markDone(build);
  });

  build.kill = (reason) => {
    if (build._proc) {
      try { build._proc.kill('SIGTERM'); } catch { /* already gone */ }
      broadcast(build, { type: 'chunk', content: `\n[build cancelled: ${reason || 'user'}]\n` });
    }
  };

  return build;
}

module.exports = {
  startBuild, getBuild, listActive,
  subscribe, unsubscribe, broadcast, broadcastComment, markDone,
  resolveMaestro, readStore, readVerdict,
};
