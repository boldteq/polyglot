'use strict';

const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const os = require('os');
const { rateLimit } = require('../middleware/rateLimit');
const { listAgents } = require('../lib/cache');
const db = require('../db');
const org = require('../org');
const experience = require('../experience');
const hr = require('../hr');
const agentSync = require('../lib/agentSync');
const taxonomy = require('../taxonomy');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

function loadRecentAgentRuns(hours = 24) {
  try {
    return db.getRecentAgentRuns(hours);
  } catch {
    return [];
  }
}

// GET /api/org-chart
router.get('/org-chart', rateLimit('read'), (req, res) => {
  try {
    const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
    const agentMap = {};
    for (const a of globalAgents) {
      agentMap[a.filename] = a;
    }
    const chart = org.buildOrgChart(agentMap);
    res.json(chart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/org-chart/stream — Server-Sent Events. Pushes agent upsert/remove
// events so the org chart stays in sync with ~/.claude/agents/ in real time.
// No rateLimit: this is a long-lived connection.
router.get('/org-chart/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send('ready', { ts: Date.now() });

  const onUpsert = (p) => send('agent:upsert', p);
  const onRemove = (p) => send('agent:remove', p);
  const onTaxonomy = (p) => send('taxonomy:update', p);

  // Phase A — task lifecycle events. Frontend uses these to flip the load
  // dot 🟢→🟡→🔴 in real time without polling /api/org-chart.
  // Payload shape: { id, agentId, status, ... } (see src/lib/tasks.js).
  const onTask = (eventName) => (p) => send(eventName, p);
  const onTaskCreated   = onTask('task:created');
  const onTaskStarted   = onTask('task:started');
  const onTaskCompleted = onTask('task:completed');
  const onTaskFailed    = onTask('task:failed');
  const onTaskCancelled = onTask('task:cancelled');

  agentSync.events.on('agent:upsert', onUpsert);
  agentSync.events.on('agent:remove', onRemove);
  agentSync.events.on('taxonomy:update', onTaxonomy);
  agentSync.events.on('task:created',   onTaskCreated);
  agentSync.events.on('task:started',   onTaskStarted);
  agentSync.events.on('task:completed', onTaskCompleted);
  agentSync.events.on('task:failed',    onTaskFailed);
  agentSync.events.on('task:cancelled', onTaskCancelled);

  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch {}
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    agentSync.events.off('agent:upsert', onUpsert);
    agentSync.events.off('agent:remove', onRemove);
    agentSync.events.off('taxonomy:update', onTaxonomy);
    agentSync.events.off('task:created',   onTaskCreated);
    agentSync.events.off('task:started',   onTaskStarted);
    agentSync.events.off('task:completed', onTaskCompleted);
    agentSync.events.off('task:failed',    onTaskFailed);
    agentSync.events.off('task:cancelled', onTaskCancelled);
  };
  req.on('close', cleanup);
  req.on('end', cleanup);
});

// ── Org chart node-position overrides (drag-and-drop persistence) ────────

// GET /api/org-chart/positions — { positions: { [nodeId]: { x, y, updatedAt } } }
router.get('/org-chart/positions', rateLimit('read'), (_req, res) => {
  try {
    res.json({ positions: db.loadNodePositions() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org-chart/positions — body: { positions: [{ nodeId, x, y }, ...] }
// Persists drag positions. Idempotent upsert per nodeId.
router.post('/org-chart/positions', rateLimit('write'), (req, res) => {
  try {
    const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    if (positions.length === 0) {
      return res.status(400).json({ error: 'positions array required' });
    }
    if (positions.length > 200) {
      return res.status(400).json({ error: 'max 200 positions per request' });
    }
    const saved = db.saveNodePositions(positions);
    // Broadcast a taxonomy:update so other tabs reload — reuses the existing
    // org-chart SSE pipe instead of adding a new event type.
    try { agentSync.events.emit('taxonomy:update', { ts: Date.now(), reason: 'positions' }); } catch {}
    res.json({ ok: true, saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/org-chart/positions — clears UNLOCKED positions by default
// (auto-adjust path). Pass ?includeLocked=1 to wipe everything.
router.delete('/org-chart/positions', rateLimit('write'), (req, res) => {
  try {
    const includeLocked = req.query.includeLocked === '1' || req.query.includeLocked === 'true';
    const cleared = db.clearNodePositions({ includeLocked });
    try { agentSync.events.emit('taxonomy:update', { ts: Date.now(), reason: 'positions:cleared' }); } catch {}
    res.json({ ok: true, cleared });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org-chart/positions/:nodeId/lock — body: { locked: boolean }
// Locked nodes survive the auto-adjust reset and are non-draggable in the UI.
router.post('/org-chart/positions/:nodeId/lock', rateLimit('write'), (req, res) => {
  try {
    const { nodeId } = req.params;
    const { locked } = req.body || {};
    if (typeof locked !== 'boolean') {
      return res.status(400).json({ error: 'body.locked must be boolean' });
    }
    const result = db.setNodeLock(nodeId, locked);
    try { agentSync.events.emit('taxonomy:update', { ts: Date.now(), reason: 'positions:lock' }); } catch {}
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/departments
router.get('/departments', rateLimit('read'), (req, res) => {
  try {
    res.json({
      departments: org.listDepartments(),
      phases: org.listPhases(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/departments/:deptId/subdepartment/:subId
// Body: { label?, description?, cardLabel?, cardEmoji?, color?, icon?, order?, displayMode?, status?, lead?, memberCount? }
// Mutates ~/.claude/org/departments.json sub-dept entry, bumps version,
// emits taxonomy:update so all open clients refetch.
router.patch('/departments/:deptId/subdepartment/:subId', rateLimit('write'), (req, res) => {
  try {
    const { deptId, subId } = req.params;
    const patch = req.body || {};
    const result = org.updateSubDepartment(deptId, subId, patch);
    try {
      agentSync.events.emit('taxonomy:update', {
        ts: Date.now(),
        reason: 'subdepartment:update',
        deptId, subId,
      });
    } catch {}
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404
      : /no valid fields/i.test(err.message) ? 400
      : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/org/drift
router.get('/org/drift', rateLimit('read'), (req, res) => {
  try {
    const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
    const agentMap = Object.fromEntries(globalAgents.map((a) => [a.filename, a]));
    res.json(org.detectDrift(agentMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_PATCH_FIELDS = ['department', 'subDepartment', 'pod', 'reportsTo', 'secondaryReportsTo', 'title', 'tier', 'status', 'tags', 'squad', 'avatar', 'gender'];

// PATCH /api/org/agent/:id
router.patch('/org/agent/:id', rateLimit('write'), (req, res) => {
  try {
    const patch = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => ALLOWED_PATCH_FIELDS.includes(k))
    );
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    // String length guards
    if (patch.title && typeof patch.title === 'string' && patch.title.length > 200)
      return res.status(400).json({ error: 'title must be ≤200 chars' });
    if (patch.name && typeof patch.name === 'string' && patch.name.length > 200)
      return res.status(400).json({ error: 'name must be ≤200 chars' });
    if (patch.description && typeof patch.description === 'string' && patch.description.length > 2000)
      return res.status(400).json({ error: 'description must be ≤2000 chars' });
    const saved = org.upsertAgent(req.params.id, patch, { action: 'patch' });
    // Return the latest history row so the UI can show "Undo"
    const latest = db.listHistory({ limit: 1, agentId: req.params.id })[0] || null;
    res.json({ ok: true, agent: saved, historyId: latest?.id ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/agents/bulk — apply same patch to many agents (single batch)
router.post('/org/agents/bulk', rateLimit('write'), (req, res) => {
  try {
    const { agentIds, patch } = req.body || {};
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ error: 'agentIds must be a non-empty array' });
    }
    if (agentIds.length > 100) {
      return res.status(400).json({ error: 'Bulk ops limited to 100 agents per request' });
    }
    const cleanPatch = Object.fromEntries(
      Object.entries(patch || {}).filter(([k]) => ALLOWED_PATCH_FIELDS.includes(k))
    );
    if (Object.keys(cleanPatch).length === 0) {
      return res.status(400).json({ error: 'No valid fields in patch' });
    }
    const batchId = `b_${randomUUID()}`;
    const updated = [];
    for (const id of agentIds) {
      try {
        const saved = org.upsertAgent(id, cleanPatch, { action: 'bulk-patch', batchId });
        updated.push({ id, ok: true, agent: saved });
      } catch (err) {
        updated.push({ id, ok: false, error: err.message });
      }
    }
    res.json({ ok: true, batchId, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/undo/:historyId — reverse a single registry change
router.post('/org/undo/:historyId', rateLimit('write'), (req, res) => {
  try {
    const h = db.getHistory(parseInt(req.params.historyId, 10));
    if (!h) return res.status(404).json({ error: 'History entry not found' });
    if (h.undone) return res.status(409).json({ error: 'Already undone' });
    if (!h.prior_state) return res.status(400).json({ error: 'No prior state to restore' });

    // Compute reverse patch: only fields that changed in the original patch
    const reversePatch = {};
    if (h.patch) {
      for (const k of Object.keys(h.patch)) {
        reversePatch[k] = h.prior_state[k] ?? null;
      }
    }
    // Apply reverse without writing a new history row; mark original as undone
    org.upsertAgent(h.agent_id, reversePatch, { action: 'undo', skipHistory: true });
    db.markHistoryUndone(h.id);
    res.json({ ok: true, restored: reversePatch, agentId: h.agent_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/undo-batch/:batchId — reverse every change in a bulk batch
router.post('/org/undo-batch/:batchId', rateLimit('write'), (req, res) => {
  try {
    const rows = db.listBatchHistory(req.params.batchId);
    if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
    const reversed = [];
    for (const h of rows) {
      if (h.undone || !h.prior_state) continue;
      const reversePatch = {};
      if (h.patch) {
        for (const k of Object.keys(h.patch)) {
          reversePatch[k] = h.prior_state[k] ?? null;
        }
      }
      org.upsertAgent(h.agent_id, reversePatch, { action: 'undo-batch', skipHistory: true });
      db.markHistoryUndone(h.id);
      reversed.push(h.agent_id);
    }
    res.json({ ok: true, reversed, count: reversed.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/org/history?limit=50&agentId=koda — recent registry changes
router.get('/org/history', rateLimit('read'), (req, res) => {
  try {
    const { limit, agentId, batchId } = req.query;
    const rows = db.listHistory({
      limit: parseInt(limit, 10) || 50,
      agentId: agentId || null,
      batchId: batchId || null,
    });
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/experience/levels
router.get('/experience/levels', rateLimit('read'), (req, res) => {
  try {
    res.json({ levels: experience.LEVEL_THRESHOLDS, weights: experience.loadWeights() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/experience/recompute
router.post('/experience/recompute', rateLimit('write'), (req, res) => {
  try {
    const summary = experience.recomputeAllExperience(org);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/experience/:agent
router.get('/experience/:agent', rateLimit('read'), (req, res) => {
  try {
    const record = org.findAgent(req.params.agent);
    if (!record) return res.status(404).json({ error: 'Agent not found in registry' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/registry
router.get('/hr/registry', rateLimit('read'), (req, res) => {
  try {
    const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
    const agentMap = {};
    for (const a of globalAgents) agentMap[a.filename] = a;

    const result = hr.getRegistry(org);
    // Merge live disk name/description — same logic as buildOrgChart line 280
    result.agents = result.agents.map(agent => {
      const disk = agentMap[agent.id] || null;
      return {
        ...agent,
        name: disk?.name || agent.name || agent.id,
        description: disk?.description || agent.description || '',
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/agent/:id
router.get('/hr/agent/:id', rateLimit('read'), (req, res) => {
  try {
    const profile = hr.getAgentProfile(org, req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/reviews/latest
router.get('/hr/reviews/latest', rateLimit('read'), (req, res) => {
  try {
    res.json(hr.getLatestReview() || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/recommendations
router.get('/hr/recommendations', rateLimit('read'), (req, res) => {
  try {
    res.json(hr.getRecommendations());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/training-queue
router.get('/hr/training-queue', rateLimit('read'), (req, res) => {
  try {
    res.json(hr.getTrainingQueue());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/training-queue
router.post('/hr/training-queue', rateLimit('write'), (req, res) => {
  try {
    const { agent, skill, reason, priority } = req.body;
    if (!agent || !skill) return res.status(400).json({ error: 'agent and skill required' });
    res.json(hr.queueTraining({ agent, skill, reason, priority }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hr/witness-log
router.get('/hr/witness-log', rateLimit('read'), (req, res) => {
  try {
    const { agent, days, limit } = req.query;
    res.json(hr.getWitnessLog({
      agent,
      days: parseInt(days, 10) || 30,
      limit: parseInt(limit, 10) || 500,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/witness-sweep
router.post('/hr/witness-sweep', rateLimit('write'), (req, res) => {
  try {
    const recent = loadRecentAgentRuns(24);
    const result = hr.runWitnessSweep(org, experience, recent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/cadence-review
router.post('/hr/cadence-review', rateLimit('write'), (req, res) => {
  try {
    const recent = loadRecentAgentRuns(24 * 7);
    const review = hr.runCadenceReview(org, experience, recent);
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/promote/:agent
router.post('/hr/promote/:agent', rateLimit('write'), (req, res) => {
  try {
    const result = hr.promoteAgent(org, experience, req.params.agent);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/pip/:agent
router.post('/hr/pip/:agent', rateLimit('write'), (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = hr.openPip(org, req.params.agent, reason);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/pip/:agent/close
router.post('/hr/pip/:agent/close', rateLimit('write'), (req, res) => {
  try {
    const { outcome } = req.body || {};
    const result = hr.closePip(org, req.params.agent, outcome || 'pass');
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/retire/:agent
router.post('/hr/retire/:agent', rateLimit('write'), (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = hr.retireAgent(org, req.params.agent, reason);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/unretire/:agent
router.post('/hr/unretire/:agent', rateLimit('write'), (req, res) => {
  try {
    const result = hr.unretireAgent(org, req.params.agent);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/hire
router.post('/hr/hire', rateLimit('write'), (req, res) => {
  try {
    const result = hr.hireAgent(org, req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/detect-gap
router.post('/hr/detect-gap', rateLimit('write'), (req, res) => {
  try {
    const { brief, requiredSkills } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief is required' });
    res.json(hr.detectCapabilityGap(org, brief, requiredSkills || []));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hr/preflight
router.post('/hr/preflight', rateLimit('write'), (req, res) => {
  try {
    const { brief, targetAgent, taskType } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief is required' });

    const blockers = [];
    const gap = hr.detectCapabilityGap(org, brief);

    let agent = null;
    if (targetAgent) {
      agent = org.findAgent(targetAgent);
      if (!agent) {
        blockers.push({ code: 'NOT_FOUND', message: `Agent ${targetAgent} does not exist` });
      } else {
        if (agent.status === 'retired') {
          blockers.push({ code: 'RETIRED', message: `${targetAgent} is retired` });
        }
        if (agent.status === 'probation' && taskType === 'production') {
          blockers.push({ code: 'PROBATION', message: `${targetAgent} is on probation, cannot ship production` });
        }
        if (agent.status === 'pip') {
          blockers.push({ code: 'PIP', message: `${targetAgent} is on PIP — use an alternative agent` });
        }
      }
    }

    const suggestedAgent = gap.bestMatches?.[0]?.agent || null;

    res.json({
      canDispatch: blockers.length === 0 && (gap.canHandle || !!agent),
      blockers,
      suggestedAgent,
      gap,
      targetAgentProfile: agent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/directory
// Filter params: ?tech=shopify,figma&domain=ecommerce&work-type=coding&department=engineering&q=search
// AND across categories, OR within category
router.get('/agents/directory', rateLimit('read'), (req, res) => {
  try {
    const { tech, domain, q, department, tier, status, page, limit: limitParam } = req.query;
    const workType = req.query['work-type'];

    const tagQuery = {};
    if (tech) tagQuery.tech = tech.split(',').map((s) => s.trim()).filter(Boolean);
    if (domain) tagQuery.domain = domain.split(',').map((s) => s.trim()).filter(Boolean);
    if (workType) tagQuery['work-type'] = workType.split(',').map((s) => s.trim()).filter(Boolean);

    const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
    const agentMap = Object.fromEntries(globalAgents.map((a) => [a.filename, a]));

    let records = org.findAgentsByTags(tagQuery);

    if (department) records = records.filter((a) => a.department === department);
    if (tier) records = records.filter((a) => a.tier === tier);
    if (status) records = records.filter((a) => a.status === status);
    if (q) {
      const query = q.toLowerCase();
      records = records.filter((a) => {
        const disk = agentMap[a.id];
        return (
          a.id.toLowerCase().includes(query) ||
          (a.title || '').toLowerCase().includes(query) ||
          (disk?.name || '').toLowerCase().includes(query) ||
          (disk?.description || '').toLowerCase().includes(query)
        );
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limitParam, 10) || 100));
    const total = records.length;
    const sliced = records.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    const agents = sliced.map((record) => {
      const disk = agentMap[record.id] || null;
      return {
        id: record.id,
        name: disk?.name || record.name || record.id,
        title: record.title || 'Agent',
        description: disk?.description || record.description || '',
        model: disk?.model || record.model || 'sonnet',
        department: record.department || null,
        subDepartment: record.subDepartment || null,
        pod: record.pod || null,
        tier: record.tier || 'engineer',
        status: record.status || 'active',
        level: record.level ?? null,
        levelTitle: record.levelTitle ?? null,
        reportsTo: record.reportsTo || null,
        secondaryReportsTo: record.secondaryReportsTo || null,
        tags: record.tags || { tech: [], domain: [], 'work-type': [] },
        skills: record.skills || {},
        hiredAt: record.hiredAt || null,
      };
    });

    res.json({ agents, total, page: pageNum, pageSize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Taxonomy: dynamic squads + tags ─────────────────────────────────────────

function broadcastTaxonomy() {
  try {
    agentSync.events.emit('taxonomy:update', { ts: Date.now() });
  } catch {}
}

// GET /api/taxonomy
router.get('/taxonomy', rateLimit('read'), (req, res) => {
  try {
    res.json(taxonomy.getTaxonomy());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/taxonomy/squad — create new squad
router.post('/taxonomy/squad', rateLimit('write'), (req, res) => {
  try {
    const created = taxonomy.addSquad(req.body || {});
    broadcastTaxonomy();
    res.json({ ok: true, squad: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/taxonomy/squad/:id — update squad meta
router.patch('/taxonomy/squad/:id', rateLimit('write'), (req, res) => {
  try {
    const updated = taxonomy.updateSquad(req.params.id, req.body || {});
    broadcastTaxonomy();
    res.json({ ok: true, squad: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/taxonomy/squad/:id — delete a squad.
//   Default: refuses if any agent still uses it. Returns 409 with
//     `{ error, agentCount, agentIds }` so the UI can surface the conflict.
//   ?cascade=1: clears squad from every agent first, then deletes.
router.delete('/taxonomy/squad/:id', rateLimit('write'), (req, res) => {
  try {
    const cascade = req.query.cascade === '1' || req.query.cascade === 'true';
    if (cascade) {
      const result = taxonomy.cascadeDeleteSquad(req.params.id, org);
      broadcastTaxonomy();
      return res.json(result);
    }
    const agents = org.listAgentRecords();
    const inUse = agents.filter(a => a.squad === req.params.id);
    if (inUse.length > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${inUse.length} agent(s) still in this squad`,
        agentCount: inUse.length,
        agentIds: inUse.slice(0, 20).map(a => a.id),
      });
    }
    const result = taxonomy.deleteSquad(req.params.id, agents);
    broadcastTaxonomy();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/taxonomy/tag/:category/:tag — update tag label/description.
router.patch('/taxonomy/tag/:category/:tag', rateLimit('write'), (req, res) => {
  try {
    const updated = taxonomy.updateTag(req.params.category, req.params.tag, req.body || {});
    broadcastTaxonomy();
    res.json({ ok: true, ...updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/taxonomy/tag — add tag
router.post('/taxonomy/tag', rateLimit('write'), (req, res) => {
  try {
    const { category, tag, label, description } = req.body || {};
    const created = taxonomy.addTag(category, tag, { label, description });
    broadcastTaxonomy();
    res.json({ ok: true, ...created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/taxonomy/tag/:category/:tag — delete a tag.
//   Default: refuses if any agent uses it. Returns 409 with agent count.
//   ?cascade=1: strips tag from every agent first, then deletes.
router.delete('/taxonomy/tag/:category/:tag', rateLimit('write'), (req, res) => {
  try {
    const cascade = req.query.cascade === '1' || req.query.cascade === 'true';
    const { category, tag } = req.params;
    if (cascade) {
      const result = taxonomy.cascadeDeleteTag(category, tag, org);
      broadcastTaxonomy();
      return res.json(result);
    }
    const agents = org.listAgentRecords();
    const inUse = agents.filter(a => (a.tags?.[category] || []).includes(tag));
    if (inUse.length > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${inUse.length} agent(s) still tagged`,
        agentCount: inUse.length,
        agentIds: inUse.slice(0, 20).map(a => a.id),
      });
    }
    const result = taxonomy.deleteTag(category, tag, agents);
    broadcastTaxonomy();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Governance: cost / model-routing dashboard ──────────────────────────────
//
// GET /api/governance/cost — burn vs budget per tier + recent policy violations.
// Sprint 9 dashboard endpoint. Reads model_routing config + last-30d agent_runs
// to surface where Opus/Sonnet/Haiku spend is going and which agents are out
// of policy.
router.get('/governance/cost', rateLimit('read'), (_req, res) => {
  try {
    const policy = db.loadModelRouting() || {};
    const tiers = policy.tiers || {};
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const runs = db.getRecentAgentRuns(30 * 24);

    // Build per-tier cost rollup
    const summary = {};
    const violations = [];
    for (const [tierKey, def] of Object.entries(tiers)) {
      summary[tierKey] = {
        model: def.shortName,
        agents: def.agents || [],
        runs: 0,
        estTokens: 0,
        estCostUsd: 0,
        budgetUsd: def.monthlyBudgetUsd || 0,
      };
    }

    for (const r of runs) {
      const md = r.metadata || {};
      // Find which tier this agent belongs to
      const tierKey = Object.entries(tiers)
        .find(([, def]) => Array.isArray(def.agents) && def.agents.includes(r.agentName))?.[0];
      if (tierKey && summary[tierKey]) {
        summary[tierKey].runs += 1;
        summary[tierKey].estTokens += r.estimatedTokens || 0;
        summary[tierKey].estCostUsd += r.estimatedCost || 0;
      }
      if (md.policyViolation) {
        violations.push({
          runId: r.id,
          agentName: r.agentName,
          timestamp: r.timestamp,
          ...md.policyViolation,
        });
      }
    }

    // Compute burn-pct per tier
    for (const t of Object.values(summary)) {
      t.estCostUsd = Math.round(t.estCostUsd * 100) / 100;
      t.burnPct = t.budgetUsd > 0 ? Math.round((t.estCostUsd / t.budgetUsd) * 100) : null;
    }

    const totalEstCost = Object.values(summary).reduce((acc, t) => acc + t.estCostUsd, 0);
    const totalBudget = policy.totalMonthlyBudgetUsd || 0;

    res.json({
      windowHours: 30 * 24,
      cutoff,
      enforcementMode: policy.enforcementMode || 'advisory',
      tiers: summary,
      total: {
        estCostUsd: Math.round(totalEstCost * 100) / 100,
        budgetUsd: totalBudget,
        burnPct: totalBudget > 0 ? Math.round((totalEstCost / totalBudget) * 100) : null,
      },
      violations: violations.slice(-50),
      violationCount: violations.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/governance/escalations — recent escalations (in-memory ring buffer).
router.get('/governance/escalations', rateLimit('read'), (req, res) => {
  try {
    const escalation = require('../lib/escalation');
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const onlyOpen = req.query.open === '1' || req.query.open === 'true';
    res.json({ items: escalation.recent(limit, { onlyOpen }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/governance/sla-sweep — manually fire the SLA sweep that promotes
// stale escalations one tier up. Same logic the daily 03:00 UTC cron runs.
// Useful for testing + admin override during incidents.
router.post('/governance/sla-sweep', rateLimit('write'), (_req, res) => {
  try {
    const escalation = require('../lib/escalation');
    const advanced = escalation.autoAdvanceExpired();
    res.json({ ok: true, advanced: advanced.length, items: advanced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/governance/reconcile-load — manually re-derive active_task_count
// from the tasks table. Cheap, idempotent.
router.post('/governance/reconcile-load', rateLimit('write'), (_req, res) => {
  try {
    const tasks = require('../lib/tasks');
    tasks.reconcileLoad();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/governance/enforcement-mode — flip model-routing enforcement
// between advisory (annotate only) / warn (annotate + log) / block (refuse
// dispatch on tier mismatch). Persists to model_routing.json singleton so
// it survives restart.
const VALID_ENFORCEMENT_MODES = new Set(['advisory', 'warn', 'block']);
router.post('/governance/enforcement-mode', rateLimit('write'), (req, res) => {
  try {
    const { mode } = req.body || {};
    if (!VALID_ENFORCEMENT_MODES.has(mode)) {
      return res.status(400).json({
        error: `mode must be one of: ${Array.from(VALID_ENFORCEMENT_MODES).join(', ')}`,
      });
    }
    const policy = db.loadModelRouting() || {};
    policy.enforcementMode = mode;
    policy.updatedAt = new Date().toISOString();
    db.saveModelRouting(policy);
    res.json({ ok: true, enforcementMode: mode, updatedAt: policy.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tier endpoints ──────────────────────────────────────────────────────────

// POST /api/taxonomy/tier — create new tier
router.post('/taxonomy/tier', rateLimit('write'), (req, res) => {
  try {
    const created = taxonomy.addTier(req.body || {});
    broadcastTaxonomy();
    res.json({ ok: true, tier: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/taxonomy/tier/:id — update tier meta
router.patch('/taxonomy/tier/:id', rateLimit('write'), (req, res) => {
  try {
    const updated = taxonomy.updateTier(req.params.id, req.body || {});
    broadcastTaxonomy();
    res.json({ ok: true, tier: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/taxonomy/tier/:id — delete tier (blocked if any agent uses it)
router.delete('/taxonomy/tier/:id', rateLimit('write'), (req, res) => {
  try {
    const agents = org.listAgentRecords();
    const result = taxonomy.deleteTier(req.params.id, agents);
    broadcastTaxonomy();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = { router, org, experience, hr, loadRecentAgentRuns };
