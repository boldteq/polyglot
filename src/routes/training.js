'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');
const { rateLimit } = require('../middleware/rateLimit');
const { validateName } = require('../lib/validators');
const { atomicWriteText, atomicWriteJson, ensureDir } = require('../lib/atomicIo');
const db = require('../db');
const agentSync = require('../lib/agentSync');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const TRAINING_DIR = path.join(CLAUDE_DIR, 'training');

function loadTraining(agentName) { return db.loadTraining(agentName); }
function saveTraining(agentName, data) { db.saveTraining(agentName, data); }

// GET /api/training/:name
router.get('/training/:name', validateName, (req, res) => {
  res.json(loadTraining(req.params.name));
});

// POST /api/training/:name
router.post('/training/:name', validateName, rateLimit('write'), (req, res) => {
  const { issue, correction } = req.body;
  if (!issue || !correction) return res.status(400).json({ error: 'issue and correction are required' });
  const data = loadTraining(req.params.name);
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    issue,
    correction,
    status: 'active',
  };
  data.push(entry);
  saveTraining(req.params.name, data);

  // Also stage a learning_inbox candidate so this correction surfaces in the
  // Learning Inbox for human review/approval (not just the separate training
  // store). Best-effort: a staging failure must NOT fail the primary training
  // save. The dedup index is UNIQUE(sessionId,type,title) — with a null
  // sessionId two distinct corrections that happen to share an issue text would
  // collapse (INSERT OR IGNORE). Use a synthetic per-correction sessionId so
  // every correction stages as its own candidate.
  try {
    const cand = db.insertLearningCandidate({
      type: 'feedback',
      title: `Correction for ${req.params.name}: ${issue}`.slice(0, 200),
      payload: { directive: correction, context: issue, agent: req.params.name },
      source: `playground:${req.params.name}`,
      sessionId: `playground-${entry.id}`,
      status: 'pending',
      confidence: 1,
    });
    // Push the inbox badge live (learning.js bridges this onto inbox SSE).
    if (cand.inserted) {
      try { agentSync.events.emit('learning.candidate', { id: cand.id, source: `playground:${req.params.name}` }); } catch { /* best-effort */ }
    }
  } catch (err) {
    console.warn('[training] failed to stage learning candidate:', err.message);
  }

  res.json(entry);
});

// PUT /api/training/:name/:id
router.put('/training/:name/:id', validateName, rateLimit('write'), (req, res) => {
  const data = loadTraining(req.params.name);
  const idx = data.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Correction not found' });
  const { issue, correction, status } = req.body;
  if (issue) data[idx].issue = issue;
  if (correction) data[idx].correction = correction;
  if (status) data[idx].status = status;
  saveTraining(req.params.name, data);
  res.json(data[idx]);
});

// DELETE /api/training/:name/:id
router.delete('/training/:name/:id', validateName, rateLimit('write'), (req, res) => {
  let data = loadTraining(req.params.name);
  const before = data.length;
  data = data.filter(e => e.id !== req.params.id);
  if (data.length === before) return res.status(404).json({ error: 'Correction not found' });
  saveTraining(req.params.name, data);
  res.json({ ok: true });
});

// POST /api/training/:name/bake
router.post('/training/:name/bake', validateName, rateLimit('write'), (req, res) => {
  const agentName = req.params.name;
  const corrections = loadTraining(agentName);
  const active = corrections.filter(c => c.status === 'active');
  if (active.length === 0) return res.status(400).json({ error: 'No active corrections to bake' });

  const agentPath = path.join(CLAUDE_DIR, 'agents', agentName + '.md');
  if (!fs.existsSync(agentPath)) return res.status(404).json({ error: 'Agent not found' });

  const content = fs.readFileSync(agentPath, 'utf-8');
  const { data, content: body } = matter(content);

  const trainingSection = '\n\n## Baked Training Corrections\n\n' +
    active.map((c, i) => `${i + 1}. **${c.issue}** → ${c.correction}`).join('\n') + '\n';

  const newBody = body.trimEnd() + trainingSection;
  const newContent = matter.stringify(newBody, data);
  atomicWriteText(agentPath, newContent);

  const archivePath = path.join(TRAINING_DIR, agentName + '.archived.json');
  let archive = [];
  try { if (fs.existsSync(archivePath)) archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8')); } catch {}
  archive.push(...active.map(c => ({ ...c, bakedAt: new Date().toISOString() })));
  ensureDir(TRAINING_DIR);
  atomicWriteJson(archivePath, archive);

  saveTraining(agentName, corrections.filter(c => c.status !== 'active'));

  res.json({ ok: true, baked: active.length });
});

module.exports = router;
