'use strict';

// Memory hygiene + forgetting curve (Phase E) — the brain's "what's stale / orphaned"
// pass. Mirrors consolidation.js: it RECOMMENDS (surfaces to the Brain tab / Training
// Review) and only ever applies the ONE reversible, never-deletes action — down-weighting
// a retired agent's still-indexed instructions via the store decay sidecar.
//
// Three signals:
//   (a) ORPHANS    — agent chunks whose agent is retired (down-weight) or absent from the
//                    registry (review). deleteMissing can't catch these: the .md still exists.
//   (b) STALE      — unverified captured knowledge older than a threshold (review; never auto-delete).
//   (c) FRESHNESS  — index age distribution; a silently-stalled reindex shows as a creeping age.
//
// Never hard-deletes captured wisdom. Retirement/removal stays a human decision in Training Review.

const fs = require('fs');
const path = require('path');
const os = require('os');
const org = require('../org');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'memory', '.brain');
const REPORT_FILE = path.join(BRAIN_DIR, 'hygiene-report.json');
const CAPTURED = new Set(['lesson', 'bug', 'decision', 'golden']);
const DAY = 86400000;

const agentIdFromRef = (ref) => (typeof ref === 'string' ? path.basename(ref).replace(/\.md$/, '') : null);

async function buildMemoryHygieneReport({ staleDays = 180, apply = false } = {}) {
  const { getStore, freshnessStats, setDecayList, getDecayList } = await import('../intelligence/store.mjs');
  const store = getStore();
  const records = await store.allRecords(); // LocalStore sync, SupabaseStore async — await handles both
  const now = Date.now();

  // registry → which agents are retired / known
  const registry = org.loadRegistry() || {};
  const agents = registry.agents || {};
  const retired = new Set();
  const known = new Set();
  for (const [id, a] of Object.entries(agents)) {
    known.add(id);
    if ((a.status || 'active') === 'retired') retired.add(id);
  }

  // (a) orphan agent chunks
  const retiredAgents = {};
  const unregisteredAgents = {};
  const retiredAgentRefs = new Set();
  // (b) stale captured + (c) superseded count, single pass
  const stale = [];
  let supersededCount = 0;
  for (const r of records) {
    const m = r.metadata || {};
    if (m.supersededBy) supersededCount++;
    if (r.source_type === 'agent') {
      const id = agentIdFromRef(r.source_ref);
      if (id && retired.has(id)) { retiredAgents[id] = (retiredAgents[id] || 0) + 1; retiredAgentRefs.add(r.source_ref); }
      else if (id && !known.has(id)) { unregisteredAgents[id] = (unregisteredAgents[id] || 0) + 1; }
    } else if (CAPTURED.has(r.source_type)) {
      const t = Date.parse(r.updated_at);
      const ageDays = Number.isFinite(t) ? Math.round((now - t) / DAY) : null;
      if (ageDays !== null && ageDays > staleDays && m.verified !== true && !m.supersededBy) {
        stale.push({ id: r.id, type: r.source_type, title: m.title || null, ageDays });
      }
    }
  }
  stale.sort((a, b) => b.ageDays - a.ageDays);

  const freshness = freshnessStats(records, now);

  // APPLY (reversible, idempotent): merge retired-agent refs into the decay sidecar so they
  // down-rank at search. Merge with any prior flags so re-runs never clobber earlier hygiene.
  const prior = getDecayList().sourceRefs || [];
  const merged = [...new Set([...prior, ...retiredAgentRefs])];
  if (apply && merged.length !== prior.length) setDecayList(merged, { reason: 'retired-agent', source: 'sys-memory-hygiene' });

  const recommendations = [];
  if (Object.keys(retiredAgents).length) recommendations.push({
    kind: 'retired-agent-chunks', severity: 'auto',
    detail: `${Object.keys(retiredAgents).length} retired agent(s) still indexed → ${apply ? 'down-weighted' : 'will down-weight'} (reversible, not deleted)`,
    agents: Object.keys(retiredAgents),
  });
  if (Object.keys(unregisteredAgents).length) recommendations.push({
    kind: 'unregistered-agent', severity: 'review',
    detail: `${Object.keys(unregisteredAgents).length} indexed agent file(s) not in the registry — confirm intentional`,
    agents: Object.keys(unregisteredAgents),
  });
  if (stale.length) recommendations.push({
    kind: 'stale-captured', severity: 'review',
    detail: `${stale.length} unverified captured item(s) older than ${staleDays}d — verify or retire`,
  });

  const report = {
    generatedAt: new Date(now).toISOString(),
    totalChunks: records.length,
    freshness,
    orphans: { retiredAgents, unregisteredAgents, retiredAgentChunkCount: retiredAgentRefs.size },
    staleCaptured: stale.slice(0, 50),
    staleCapturedTotal: stale.length,
    superseded: supersededCount,
    decayFlaggedRefs: merged.length,
    applied: apply,
    recommendations,
  };
  try { fs.mkdirSync(BRAIN_DIR, { recursive: true }); fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2)); }
  catch (err) { console.warn('[memoryHygiene] report persist failed:', err.message); }
  return report;
}

function getLatestHygieneReport() {
  try { return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8')); } catch { return null; }
}

module.exports = { buildMemoryHygieneReport, getLatestHygieneReport };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const staleArg = process.argv.find((a) => a.startsWith('--stale='));
  const staleDays = staleArg ? Number.parseInt(staleArg.split('=')[1], 10) : 180;
  buildMemoryHygieneReport({ staleDays, apply })
    .then((r) => {
      console.log(`\nMemory hygiene — ${r.generatedAt}  (${apply ? 'APPLIED' : 'dry-run'})`);
      console.log('─'.repeat(64));
      console.log(`Indexed chunks: ${r.totalChunks}  |  superseded: ${r.superseded}  |  decay-flagged refs: ${r.decayFlaggedRefs}`);
      const f = r.freshness;
      console.log(`Freshness: newest ${f.newestAgeDays}d, avg ${f.avgAgeDays}d, oldest ${f.oldestAgeDays}d  |  >180d: ${f.ageBuckets['>180d']}, undated: ${f.ageBuckets.undated}`);
      console.log(`\nRecommendations: ${r.recommendations.length}`);
      for (const rec of r.recommendations) console.log(`  • [${rec.severity}] ${rec.detail}${rec.agents ? `  (${rec.agents.join(', ')})` : ''}`);
      if (r.staleCaptured.length) {
        console.log(`\nStale captured (top ${Math.min(10, r.staleCaptured.length)} of ${r.staleCapturedTotal}):`);
        for (const s of r.staleCaptured.slice(0, 10)) console.log(`  ${String(s.ageDays).padStart(4)}d  ${s.type.padEnd(8)} ${s.title || s.id}`);
      }
      console.log('\nNOTE: recommendations only (except reversible retired-agent down-weight) — retire/delete is a human decision.');
    })
    .catch((err) => { console.error(`memoryHygiene ERROR: ${err.message}`); process.exit(1); });
}
