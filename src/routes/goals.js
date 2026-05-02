'use strict';

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const router = Router();

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function loadGoals() {
  const g = db.loadGoals();
  return g.mission !== undefined ? g : { mission: '', missionDescription: '', projectGoals: [], agentGoals: [] };
}
function saveGoals(data) { db.saveGoals(data); }

// GET /api/goals
router.get('/goals', rateLimit('read'), (req, res) => {
  res.json(loadGoals());
});

// PUT /api/goals/mission
router.put('/goals/mission', rateLimit('write'), (req, res) => {
  const { mission, description } = req.body;
  if (!mission) return res.status(400).json({ error: 'mission is required' });
  const goals = loadGoals();
  goals.mission = mission;
  goals.missionDescription = description || '';
  goals.updatedAt = new Date().toISOString();
  saveGoals(goals);
  res.json(goals);
});

// POST /api/goals/project
router.post('/goals/project', rateLimit('write'), (req, res) => {
  const { projectId, projectName, goal, description, priority } = req.body;
  if (!projectId || !goal) return res.status(400).json({ error: 'projectId and goal required' });
  const goals = loadGoals();
  const existing = goals.projectGoals.findIndex(g => g.projectId === projectId);
  const entry = {
    id: existing >= 0 ? goals.projectGoals[existing].id : genId(),
    projectId,
    projectName: projectName || projectId,
    goal,
    description: description || '',
    priority: priority || 'medium',
    status: 'active',
    createdAt: existing >= 0 ? goals.projectGoals[existing].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing >= 0) goals.projectGoals[existing] = entry;
  else goals.projectGoals.push(entry);
  saveGoals(goals);
  res.json(entry);
});

// DELETE /api/goals/project/:id
router.delete('/goals/project/:id', rateLimit('write'), (req, res) => {
  const goals = loadGoals();
  goals.projectGoals = goals.projectGoals.filter(g => g.id !== req.params.id);
  goals.agentGoals = goals.agentGoals.filter(g => g.projectGoalId !== req.params.id);
  saveGoals(goals);
  res.json({ ok: true });
});

// POST /api/goals/agent
router.post('/goals/agent', rateLimit('write'), (req, res) => {
  const { agentName, projectGoalId, goal, description, status } = req.body;
  if (!agentName || !goal) return res.status(400).json({ error: 'agentName and goal required' });
  const goals = loadGoals();
  const existing = goals.agentGoals.findIndex(g => g.agentName === agentName && g.projectGoalId === (projectGoalId || null));
  const entry = {
    id: existing >= 0 ? goals.agentGoals[existing].id : genId(),
    agentName,
    projectGoalId: projectGoalId || null,
    goal,
    description: description || '',
    status: status || 'active',
    createdAt: existing >= 0 ? goals.agentGoals[existing].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing >= 0) goals.agentGoals[existing] = entry;
  else goals.agentGoals.push(entry);
  saveGoals(goals);
  res.json(entry);
});

// PUT /api/goals/agent/:id
router.put('/goals/agent/:id', rateLimit('write'), (req, res) => {
  const goals = loadGoals();
  const idx = goals.agentGoals.findIndex(g => g.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Agent goal not found' });
  const { goal, description, status } = req.body;
  if (goal !== undefined) goals.agentGoals[idx].goal = goal;
  if (description !== undefined) goals.agentGoals[idx].description = description;
  if (status !== undefined) goals.agentGoals[idx].status = status;
  goals.agentGoals[idx].updatedAt = new Date().toISOString();
  saveGoals(goals);
  res.json(goals.agentGoals[idx]);
});

// DELETE /api/goals/agent/:id
router.delete('/goals/agent/:id', rateLimit('write'), (req, res) => {
  const goals = loadGoals();
  goals.agentGoals = goals.agentGoals.filter(g => g.id !== req.params.id);
  saveGoals(goals);
  res.json({ ok: true });
});

module.exports = router;
