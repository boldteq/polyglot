'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig, saveConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');
const { listAgents } = require('../lib/cache');
const { atomicWriteText } = require('../lib/atomicIo');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

function getAllAgentsFlat() {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  return [
    ...listAgents(path.join(CLAUDE_DIR, 'agents')),
    ...projects.flatMap(p => p.agents || []),
  ];
}

function getCustomCategories() {
  const config = loadConfig();
  return Array.isArray(config.customCategories) ? config.customCategories : [];
}

function saveCustomCategories(cats) {
  const config = loadConfig();
  config.customCategories = cats;
  saveConfig(config);
}

function getCategoryOrder() {
  const config = loadConfig();
  return Array.isArray(config.categoryOrder) ? config.categoryOrder : [];
}

function saveCategoryOrder(order) {
  const config = loadConfig();
  config.categoryOrder = order;
  saveConfig(config);
}

// GET /api/categories
router.get('/categories', (req, res) => {
  const allAgents = getAllAgentsFlat();
  const custom = getCustomCategories();
  const savedOrder = getCategoryOrder();

  const counts = {};
  for (const c of custom) counts[c] = 0;
  for (const agent of allAgents) {
    const cat = agent.frontmatter?.category || 'uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const entries = Object.entries(counts).map(([name, count]) => ({ name, count }));

  const seen = new Set();
  const ordered = [];
  for (const name of savedOrder) {
    const entry = entries.find(e => e.name === name);
    if (entry) {
      ordered.push(entry);
      seen.add(name);
    }
  }
  const remainder = entries.filter(e => !seen.has(e.name)).sort((a, b) => b.count - a.count);
  ordered.push(...remainder);

  res.json(ordered);
});

// POST /api/categories/reorder
router.post('/categories/reorder', rateLimit('write'), (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order) || !order.every(v => typeof v === 'string')) {
    return res.status(400).json({ error: 'order must be a string[]' });
  }
  saveCategoryOrder(order);
  res.json({ ok: true, order });
});

// POST /api/categories
router.post('/categories', rateLimit('write'), (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!slug) return res.status(400).json({ error: 'Invalid category name' });

  const custom = getCustomCategories();
  if (!custom.includes(slug)) {
    custom.push(slug);
    saveCustomCategories(custom);
  }

  res.json({ ok: true, name: slug });
});

// POST /api/categories/rename
router.post('/categories/rename', rateLimit('write'), (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
    return res.status(400).json({ error: 'oldName and newName are required strings' });
  }
  const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!slug) return res.status(400).json({ error: 'Invalid category name' });

  const custom = getCustomCategories();
  const idx = custom.indexOf(oldName);
  if (idx >= 0) custom[idx] = slug;
  else if (!custom.includes(slug)) custom.push(slug);
  saveCustomCategories(custom);

  const allAgents = getAllAgentsFlat();
  let updated = 0;
  for (const agent of allAgents) {
    const cat = agent.frontmatter?.category || 'uncategorized';
    if (cat !== oldName) continue;
    try {
      const raw = fs.readFileSync(agent.path, 'utf-8');
      const { data, content: body } = matter(raw);
      data.category = slug;
      atomicWriteText(agent.path, matter.stringify(body, data));
      updated++;
    } catch { /* skip unreadable files */ }
  }

  res.json({ ok: true, updated, newName: slug });
});

// POST /api/categories/delete
router.post('/categories/delete', rateLimit('write'), (req, res) => {
  const { category, reassignTo } = req.body;
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'category is required' });
  }
  const target = (reassignTo && typeof reassignTo === 'string') ? reassignTo.trim() : 'uncategorized';

  const custom = getCustomCategories();
  const filtered = custom.filter(c => c !== category);
  saveCustomCategories(filtered);

  const allAgents = getAllAgentsFlat();
  let updated = 0;
  for (const agent of allAgents) {
    const cat = agent.frontmatter?.category || 'uncategorized';
    if (cat !== category) continue;
    try {
      const raw = fs.readFileSync(agent.path, 'utf-8');
      const { data, content: body } = matter(raw);
      data.category = target === 'uncategorized' ? undefined : target;
      atomicWriteText(agent.path, matter.stringify(body, data));
      updated++;
    } catch { /* skip unreadable files */ }
  }

  res.json({ ok: true, updated, reassignedTo: target });
});

module.exports = router;
