'use strict';

// One-button autonomous build — the "Lovable front door" for the Shopify Website
// dept. POST a brief + a linked theme repo → maestro:build runs hands-off in that
// repo (publish-grade gates + Lens + auto-heal, the LINCHPIN env is set by maestro
// itself), streamed to the browser over SSE and resilient to refresh/navigation via
// the buildRuns registry (the same proven decoupling as Playground background runs).
//
// Routes:
//   POST /api/build/start        → { buildId } (202); kicks off the build
//   GET  /api/build/active       → { builds[] } in-flight (for reattach on load)
//   GET  /api/build/:id/stream   → SSE: replay log so far → live updates / terminal
//   POST /api/build/:id/cancel   → SIGTERM the running build

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const buildRegistry = require('../lib/buildRuns');

const router = Router();

router.post('/build/start', rateLimit('heavy'), (req, res) => {
  const { repoPath, previewUrl, brief, renderMode, surfaces, budgetMin, buildId } = req.body || {};
  if (!repoPath || typeof repoPath !== 'string' || !repoPath.trim()) {
    return res.status(400).json({ error: 'repoPath required (absolute path to a linked theme repo)' });
  }
  const id = (typeof buildId === 'string' && buildId.trim())
    ? buildId.trim()
    : `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const existing = buildRegistry.getBuild(id);
  if (existing && existing.status === 'running') {
    return res.status(409).json({ error: 'a build with this id is already running', buildId: id });
  }

  try {
    const build = buildRegistry.startBuild({
      id,
      repoPath: repoPath.trim(),
      previewUrl: typeof previewUrl === 'string' ? previewUrl.trim() : '',
      brief: typeof brief === 'string' ? brief : '',
      renderMode: renderMode === 'push' ? 'push' : 'dev',
      surfaces: Array.isArray(surfaces) ? surfaces.filter(s => typeof s === 'string') : null,
      budgetMin: Number.isFinite(budgetMin) ? Math.max(0, budgetMin) : 0,
      log: (m) => console.log(`[build] ${m}`),
    });
    return res.status(202).json({ buildId: build.id, store: build.store, status: build.status });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/build/active', rateLimit('read'), (req, res) => {
  res.json({ builds: buildRegistry.listActive() });
});

router.get('/build/:id/stream', rateLimit('read'), (req, res) => {
  const build = buildRegistry.getBuild(req.params.id);

  res.setTimeout(0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!build) {
    res.write(`data: ${JSON.stringify({ type: 'error', code: 'build_not_found', error: 'Build not found — it may have finished.' })}\n\n`);
    try { res.end(); } catch { /* */ }
    return;
  }

  // Announce + replay everything generated so far (one code path for initial-watch + reattach).
  res.write(`data: ${JSON.stringify({ type: 'start', buildId: build.id, store: build.store, brief: build.brief, previewUrl: build.previewUrl, reattach: true })}\n\n`);
  if (build.output) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: build.output })}\n\n`);
    // Re-derive heal events from the accumulated log so the self-heal board rebuilds after a
    // refresh/reattach instead of starting blank (live heal events only reach live subscribers).
    for (const ev of buildRegistry.healEventsFrom(build.output)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  if (build.status === 'running') {
    buildRegistry.subscribe(build, res);
    // Per-connection heartbeat so idle proxies don't drop the stream.
    const hb = setInterval(() => { try { res.write(`: hb ${Date.now()}\n\n`); } catch { /* */ } }, 25_000);
    if (hb.unref) hb.unref();
    res.on('close', () => { clearInterval(hb); buildRegistry.unsubscribe(build, res); });
  } else {
    // Finished while we were away — send the terminal event + close.
    if (build.finalEvent) res.write(`data: ${JSON.stringify(build.finalEvent)}\n\n`);
    else res.write(`data: ${JSON.stringify({ type: 'done', exitCode: build.exitCode, durationMs: (build.endedAt || Date.now()) - build.startedAt })}\n\n`);
    try { res.end(); } catch { /* */ }
  }
});

router.post('/build/:id/cancel', rateLimit('write'), (req, res) => {
  const build = buildRegistry.getBuild(req.params.id);
  if (!build || build.status !== 'running') return res.json({ ok: true, alreadyDone: true });
  if (typeof build.kill === 'function') build.kill('user_cancel');
  res.json({ ok: true });
});

module.exports = { router };
