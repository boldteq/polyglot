'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const router = Router();

const DOCS_PATH = path.join(__dirname, '..', '..', 'docs');

// Disk stats are cached 60s so a frequently-polled /health doesn't spawn a
// blocking `df` subprocess on the single-threaded event loop every call (C-critic audit).
let _diskCache = { at: 0, data: null };
function getDiskStats() {
  const now = Date.now();
  if (_diskCache.data && now - _diskCache.at < 60_000) return _diskCache.data;
  let data = { status: 'unknown' };
  try {
    const { execSync } = require('child_process');
    const dfOut = execSync('df -k / | tail -1', { timeout: 2000 }).toString().trim().split(/\s+/);
    if (dfOut.length >= 5) {
      data = {
        totalGB: Math.round(parseInt(dfOut[1], 10) / 1024 / 1024),
        freeGB: Math.round(parseInt(dfOut[3], 10) / 1024 / 1024),
        usedPct: parseInt(dfOut[4], 10),
      };
    }
  } catch { /* keep unknown */ }
  _diskCache = { at: now, data };
  return data;
}

// GET /api/health — Q29: deep health (DB ping + disk + memory + uptime + brain calibration)
router.get('/health', async (req, res) => {
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

  // Brain: is the LLM-judge calibrated? When it's missing/stale the self-improvement
  // loop silently HOLDS every auto-patch (governor fail-safe). Surface that here so a
  // paused brain is observable from /health, not only buried in a weekly tutor run.
  try {
    const { getEvalCalibration } = await import('../intelligence/governor.mjs');
    const calib = getEvalCalibration();
    result.brain = { evalCalibrated: calib.calibrated, reason: calib.reason, calibrationAgeDays: calib.ageDays };
    if (!calib.calibrated) {
      result.brain.evalMissing = calib.reason === 'missing';
      result.alerts.push(calib.reason === 'missing'
        ? 'Eval judge never calibrated — self-improvement autos are held (run sys-intel-eval)'
        : `Eval judge ${calib.reason} — self-improvement autos are held`);
    }
  } catch (err) {
    result.brain = { evalCalibrated: false, reason: 'error', error: 'calibration read failed' };
  }

  // Disk space (Q59: alert at <10% free) — cached 60s, see getDiskStats.
  const disk = getDiskStats();
  result.disk = disk;
  if (typeof disk.usedPct === 'number') {
    if (disk.usedPct >= 90) {
      result.alerts.push('Disk >90% full — immediate action needed');
      result.status = 'degraded';
    } else if (disk.usedPct >= 80) {
      result.alerts.push('Disk >80% full — plan cleanup');
    }
  }

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

// GET /api/docs/search?q= — full-text search across docs, with deep-link anchors.
// Mirrors the client renderer's heading-id logic (slugify / step pattern) so a
// result click can scroll straight to the matching section. Defined BEFORE
// /docs/:slug so "search" isn't captured as a slug.
function docSlugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}
function docHeadingId(level, rawText) {
  const stepMatch = rawText.match(/^(?:Step\s+)?(\d+)[.:]\s*(.+)$/i);
  if (level >= 3 && stepMatch) return docSlugify(`step-${parseInt(stepMatch[1], 10)}-${stepMatch[2]}`);
  return docSlugify(rawText);
}
router.get('/docs/search', (req, res) => {
  const q = (req.query.q || '').toString().trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ query: q, results: [] });
  if (!fs.existsSync(DOCS_PATH)) return res.json({ query: q, results: [] });

  const MAX_DOCS = 8, MAX_HITS = 4;
  const files = fs.readdirSync(DOCS_PATH).filter((f) => f.endsWith('.md')).sort();
  const results = [];
  for (const f of files) {
    let raw = '';
    try { raw = fs.readFileSync(path.join(DOCS_PATH, f), 'utf-8'); } catch { continue; }
    const lines = raw.split('\n');
    const docTitle = (lines.find((l) => l.startsWith('# ')) || f).replace(/^#\s*/, '').replace(/\.md$/, '');

    let curHeading = docTitle, curAnchor = '', hitCount = 0;
    const matches = [];
    for (const line of lines) {
      const hm = line.match(/^(#{1,4})\s+(.+)$/);
      if (hm) {
        const text = hm[2].replace(/\s+#+\s*$/, '');
        curHeading = text;
        curAnchor = docHeadingId(hm[1].length, text);
        // count heading-line matches too
        if (line.toLowerCase().includes(q)) {
          hitCount += 1;
          if (matches.length < MAX_HITS) matches.push({ heading: text, anchor: curAnchor, snippet: text });
        }
        continue;
      }
      if (line.toLowerCase().includes(q)) {
        hitCount += 1;
        if (matches.length < MAX_HITS) {
          const snippet = line.trim().replace(/^[#>*\-\s]+/, '').slice(0, 160);
          matches.push({ heading: curHeading, anchor: curAnchor, snippet });
        }
      }
    }
    if (hitCount > 0) results.push({ slug: f.replace(/\.md$/, ''), title: docTitle, hitCount, matches });
  }
  results.sort((a, b) => b.hitCount - a.hitCount);
  res.json({ query: q, results: results.slice(0, MAX_DOCS) });
});

// GET /api/docs/:slug
router.get('/docs/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-zA-Z0-9-_]/g, '');
  const filePath = path.join(DOCS_PATH, `${slug}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json({ slug, content: fs.readFileSync(filePath, 'utf-8') });
});

module.exports = router;
