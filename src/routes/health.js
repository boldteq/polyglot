'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const router = Router();

const DOCS_PATH = path.join(__dirname, '..', '..', 'docs');

// GET /api/health — Q29: deep health (DB ping + disk + memory + uptime)
router.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const result = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      rssM: Math.round(memUsage.rss / 1024 / 1024),
      heapM: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalM: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    alerts: [],
  };

  // DB ping + size check
  try {
    const db = require('../db');
    const ping = db.getDb().prepare('SELECT 1 AS ok').get();
    result.db = { status: ping?.ok === 1 ? 'ok' : 'error' };
    const dbPath = path.join(__dirname, '..', '..', 'data', 'polyglot.db');
    if (fs.existsSync(dbPath)) {
      const dbSizeMB = Math.round(fs.statSync(dbPath).size / 1024 / 1024);
      result.db.sizeMB = dbSizeMB;
      if (dbSizeMB > 500) result.alerts.push('DB size >500MB — consider cleanup');
    }
  } catch (err) {
    result.db = { status: 'error', error: 'DB unavailable' };
    result.status = 'degraded';
  }

  // Disk space (Q59: alert at <10% free)
  try {
    const { execSync } = require('child_process');
    const dfOut = execSync('df -k / | tail -1', { timeout: 2000 }).toString().trim().split(/\s+/);
    if (dfOut.length >= 5) {
      const total = parseInt(dfOut[1], 10);
      const avail = parseInt(dfOut[3], 10);
      const usePct = parseInt(dfOut[4], 10);
      result.disk = {
        totalGB: Math.round(total / 1024 / 1024),
        freeGB: Math.round(avail / 1024 / 1024),
        usedPct: usePct,
      };
      if (usePct >= 90) {
        result.alerts.push('Disk >90% full — immediate action needed');
        result.status = 'degraded';
      } else if (usePct >= 80) {
        result.alerts.push('Disk >80% full — plan cleanup');
      }
    }
  } catch { result.disk = { status: 'unknown' }; }

  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

// GET /api/docs
router.get('/docs', (req, res) => {
  if (!fs.existsSync(DOCS_PATH)) return res.json([]);
  const files = fs.readdirSync(DOCS_PATH).filter(f => f.endsWith('.md')).sort();
  const docs = files.map(f => {
    const raw = fs.readFileSync(path.join(DOCS_PATH, f), 'utf-8');
    const firstHeading = raw.split('\n').find(l => l.startsWith('# ')) || '';
    const title = firstHeading.replace(/^# /, '') || f.replace('.md', '');
    // Pull first non-blank, non-heading line as description
    const desc = raw.split('\n').find(l => l.trim() && !l.startsWith('#')) || '';
    return { slug: f.replace('.md', ''), filename: f, title, description: desc.trim() };
  });
  res.json(docs);
});

// GET /api/docs/:slug
router.get('/docs/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-zA-Z0-9-_]/g, '');
  const filePath = path.join(DOCS_PATH, `${slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json({ slug, content: fs.readFileSync(filePath, 'utf-8') });
});

module.exports = router;
