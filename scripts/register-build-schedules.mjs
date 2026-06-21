#!/usr/bin/env node
// register-build-schedules — the explicit post-publish seam. mantle's cutover Step 17 (or the
// autonomous orchestrator at publish) runs this ONCE after a theme goes live; it registers the
// six post-publish checkpoints (lumen 48h watch + orbit/catalyst 30/90d results) into the
// build_schedules registry. The hourly `sys-build-schedules` tick (+ boot catch-up) then fires
// each as it comes due — surviving a non-24/7 Mac. Idempotent (re-running is safe).
//
// Run: node scripts/register-build-schedules.mjs --build <id> --repo <abs-theme-repo> [--store <handle>] [--published-at <ms>]
//   ·  pnpm results:register --build <id> --repo <dir> --store <store>

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const buildSchedules = require('../src/lib/buildSchedules');
let agentSync = null;
try { agentSync = require('../src/lib/agentSync'); } catch { /* events optional */ }

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const buildId = arg('build');
const repoDir = arg('repo');
const store = arg('store');
const publishedAt = Number(arg('published-at')) || Date.now();

if (!buildId || !repoDir) {
  console.error('register-build-schedules: --build <id> and --repo <abs-theme-repo> are required.');
  process.exit(2);
}

try {
  const ids = buildSchedules.registerBuildSchedules(buildId, { publishedAt, repoDir, store });
  if (agentSync?.events) { try { agentSync.events.emit('build.published', { buildId, repoDir, store, publishedAt }); } catch { /* SSE best-effort */ } }
  console.log(`register-build-schedules: ${ids.length} checkpoints registered for ${buildId} (published ${new Date(publishedAt).toISOString()})`);
  for (const id of ids) console.log(`  · ${id}`);
  process.exit(0);
} catch (err) {
  console.error(`register-build-schedules: ${err.message}`);
  process.exit(1);
}
