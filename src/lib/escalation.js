'use strict';

// Polyglot Escalation Bus
//
// Wraps the shared agentSync.events EventEmitter to provide structured
// escalation lifecycle helpers. Sprint 5 of the multi-agent OS blueprint.
//
// Escalation tiers (per CLAUDE.md routing):
//   1. specialist  — owner of the failing task (Pod B Frontend, Vex, etc.)
//   2. pod-lead    — promoted at >24h SLA breach
//   3. vp          — promoted at >48h
//   4. yash         — promoted at >72h, irreversible
//
// Every transition emits a typed event on the same bus the SSE clients are
// already subscribed to (see src/routes/orgHr.js), so the org-chart UI and
// any future ops console will pick up escalations live with no extra wiring.
//
// Persistence is intentionally minimal: full audit lives in agent-ops Supabase
// (Witness writes there). Locally we only keep an in-memory ring buffer so the
// /api/escalations endpoint can serve recent items without a round-trip.

const { events } = require('./agentSync');

const TIERS = ['specialist', 'pod-lead', 'vp', 'yash'];

const SLA_PROMOTE_AFTER_MS = {
  specialist: 24 * 60 * 60 * 1000, // 24h
  'pod-lead': 24 * 60 * 60 * 1000, // +24h (=48h total)
  vp: 24 * 60 * 60 * 1000, // +24h (=72h total)
  yash: Infinity, // terminal
};

const RING_SIZE = 200;
const ring = [];

let nextId = 1;
function newId() {
  return `esc-${Date.now()}-${nextId++}`;
}

function record(escalation) {
  ring.push(escalation);
  if (ring.length > RING_SIZE) ring.shift();
}

// Open a new escalation. Caller passes the failing context.
//   open({
//     issueId, title, taskId, agentId, summary, ownerId,
//     severity, tier  // optional, defaults to 'specialist'
//   })
//
// Dedup: if an OPEN escalation already exists with the same issueId, this
// is a no-op (returns the existing record). Lets callers like the daily
// Witness sweep re-fire safely without duplicate noise.
function open(input) {
  if (!input || !input.issueId || !input.agentId) {
    throw new Error('escalation.open requires { issueId, agentId, ... }');
  }
  const existing = ring.find((e) => e.status === 'open' && e.issueId === input.issueId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const tier = input.tier || 'specialist';
  if (!TIERS.includes(tier)) {
    throw new Error(`escalation.open: invalid tier "${tier}"`);
  }
  const esc = {
    id: newId(),
    issueId: input.issueId,
    title: input.title || `Escalation on ${input.agentId}`,
    taskId: input.taskId || null,
    agentId: input.agentId,
    ownerId: input.ownerId || input.agentId,
    summary: input.summary || '',
    severity: input.severity || 'p2',
    tier,
    status: 'open',
    openedAt: now,
    updatedAt: now,
    resolvedAt: null,
    history: [
      { tier, at: now, by: input.ownerId || input.agentId, action: 'opened' },
    ],
  };
  record(esc);
  events.emit('escalation:opened', esc);
  return esc;
}

// Promote an open escalation one tier up. Triggered by SLA breach or human
// override. Throws if already at top tier or already resolved.
function advance(escalationId, byAgent = 'system') {
  const esc = ring.find((e) => e.id === escalationId);
  if (!esc) throw new Error(`escalation ${escalationId} not found in recent buffer`);
  if (esc.status !== 'open') throw new Error(`escalation ${escalationId} is ${esc.status}, cannot advance`);
  const idx = TIERS.indexOf(esc.tier);
  if (idx === TIERS.length - 1) throw new Error(`escalation ${escalationId} already at top tier`);
  const nextTier = TIERS[idx + 1];
  const now = new Date().toISOString();
  esc.tier = nextTier;
  esc.updatedAt = now;
  esc.history.push({ tier: nextTier, at: now, by: byAgent, action: 'advanced' });
  events.emit('escalation:advanced', esc);
  return esc;
}

// Resolve an escalation. `outcome` is free-text or one of:
// 'fixed', 'wont-fix', 'duplicate', 'cancelled'.
function resolve(escalationId, outcome = 'fixed', byAgent = 'system') {
  const esc = ring.find((e) => e.id === escalationId);
  if (!esc) throw new Error(`escalation ${escalationId} not found`);
  if (esc.status !== 'open') return esc;
  const now = new Date().toISOString();
  esc.status = 'resolved';
  esc.resolvedAt = now;
  esc.updatedAt = now;
  esc.outcome = outcome;
  esc.history.push({ tier: esc.tier, at: now, by: byAgent, action: 'resolved', outcome });
  events.emit('escalation:resolved', esc);
  return esc;
}

// Auto-advance any escalation whose tier-SLA has expired. Called by Witness's
// daily sweep. Idempotent — only advances open ones past their SLA.
function autoAdvanceExpired(now = Date.now()) {
  const advanced = [];
  for (const esc of ring) {
    if (esc.status !== 'open') continue;
    const ms = SLA_PROMOTE_AFTER_MS[esc.tier];
    if (!Number.isFinite(ms)) continue; // 'yash' tier — terminal
    const lastTransition = new Date(esc.updatedAt).getTime();
    if (now - lastTransition > ms) {
      try {
        advanced.push(advance(esc.id, 'witness:sla-sweep'));
      } catch (e) {
        // Already at top tier, ignore
      }
    }
  }
  return advanced;
}

// Read recent escalations (for the /api/escalations endpoint).
function recent(limit = 50, { onlyOpen = false } = {}) {
  const out = [];
  for (let i = ring.length - 1; i >= 0 && out.length < limit; i -= 1) {
    if (onlyOpen && ring[i].status !== 'open') continue;
    out.push(ring[i]);
  }
  return out;
}

// Quality-gate convenience: when sage / luna / hawk block a PR or detect
// a regression, they can fire this directly without composing the open()
// payload by hand.
function blockedByGate(input) {
  return open({
    ...input,
    severity: input.severity || 'p1',
    title: input.title || `Quality gate blocked by ${input.byGate || 'reviewer'}`,
  });
}

module.exports = {
  TIERS,
  SLA_PROMOTE_AFTER_MS,
  open,
  advance,
  resolve,
  autoAdvanceExpired,
  recent,
  blockedByGate,
};
