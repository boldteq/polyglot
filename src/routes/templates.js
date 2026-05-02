'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');
const { rateLimit } = require('../middleware/rateLimit');
const { validateName } = require('../lib/validators');
const { atomicWriteText, ensureDir } = require('../lib/atomicIo');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const TEMPLATES_DIR = path.join(CLAUDE_DIR, 'templates');

function parseTemplate(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    const stats = fs.statSync(filePath);
    return {
      filename: path.basename(filePath, '.md'),
      path: filePath,
      name: data.name || path.basename(filePath, '.md'),
      description: data.description || '',
      sections: data.sections || [],
      body: body.trim(),
      raw: content,
      updatedAt: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

// GET /api/templates
router.get('/templates', (req, res) => {
  ensureDir(TEMPLATES_DIR);
  try {
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md'));
    const templates = files.map(f => parseTemplate(path.join(TEMPLATES_DIR, f))).filter(Boolean);
    templates.sort((a, b) => a.name.localeCompare(b.name));
    res.json(templates);
  } catch {
    res.json([]);
  }
});

// GET /api/templates/:name
router.get('/templates/:name', validateName, (req, res) => {
  const template = parseTemplate(path.join(TEMPLATES_DIR, req.params.name + '.md'));
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

// PUT /api/templates/:name
router.put('/templates/:name', validateName, rateLimit('write'), (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  ensureDir(TEMPLATES_DIR);
  atomicWriteText(path.join(TEMPLATES_DIR, req.params.name + '.md'), content);
  const template = parseTemplate(path.join(TEMPLATES_DIR, req.params.name + '.md'));
  res.json(template);
});

// DELETE /api/templates/:name
router.delete('/templates/:name', validateName, rateLimit('write'), (req, res) => {
  const filePath = path.join(TEMPLATES_DIR, req.params.name + '.md');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Template not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
