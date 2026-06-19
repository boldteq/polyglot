'use strict';

// Lens — Visual Truth Layer · Polyglot read API. The Lens machinery (capture → judge → enforce →
// autofix) runs in the theme-toolkit and writes gate-reports/lens/ per build. This route makes that
// VISIBLE in the dashboard (atrium gap #4 — "the machinery runs, you can't watch it"): it reads a
// configured reports dir and serves the manifest + judge verdicts + gate-#18 result + the frame PNGs.
// Read-only; no Lens execution happens here.

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const configService = require('../lib/configService');

const router = Router();

function resolveReportDir(override) {
  let cand = (override && String(override)) || configService.getConfig('lens.reports_dir') || process.env.LENS_REPORTS_DIR || '';
  // fall back to the bundled sample run so the page renders real Lens data out-of-box
  if (!cand) { const sample = path.resolve(process.cwd(), 'data', 'lens-sample'); if (fs.existsSync(sample)) cand = sample; }
  return cand ? path.resolve(cand) : null;
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }
function vpKey(vp) { const s = String(vp || ''); return s.includes('375') ? 'mobile' : s.includes('768') ? 'tablet' : s.includes('1440') ? 'desktop' : s; }

// GET /api/lens/latest[?dir=<reports dir>] — the assembled Lens view for the configured/last run.
router.get('/lens/latest', (req, res) => {
  const dir = resolveReportDir(typeof req.query.dir === 'string' ? req.query.dir : null);
  if (!dir || !fs.existsSync(dir)) {
    return res.json({ configured: !!dir, present: false, dir,
      message: dir ? `Lens reports dir not found: ${dir}` : 'No Lens reports dir configured — set app_config "lens.reports_dir" or the LENS_REPORTS_DIR env to a build\'s gate-reports directory.' });
  }
  const lensDir = path.join(dir, 'lens');
  const manifest = readJson(path.join(lensDir, 'lens-manifest.json'));
  const gate18 = readJson(path.join(dir, 'visual-truth.json')) || readJson(path.join(lensDir, 'visual-truth.json'));

  // judge verdicts keyed by surface-viewport(name)
  const verdicts = {};
  try {
    for (const f of fs.readdirSync(path.join(lensDir, 'judge'))) {
      if (!f.endsWith('.json')) continue;
      const v = readJson(path.join(lensDir, 'judge', f));
      if (v && v.surface) verdicts[`${v.surface}-${vpKey(v.viewport)}`] = v;
    }
  } catch { /* no judge dir yet */ }

  const frameUrl = (rel) => rel ? `/api/lens/frame?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent(rel)}` : null;
  const frames = (manifest && Array.isArray(manifest.frames) ? manifest.frames : []).map((fr) => {
    const v = verdicts[`${fr.surface}-${fr.viewport}`] || verdicts[`${fr.surface}-${vpKey(`${fr.width}x${fr.height}`)}`] || null;
    return {
      surface: fr.surface, viewport: fr.viewport, dims: `${fr.width}x${fr.height}`,
      rest: frameUrl(fr.frames && fr.frames.rest), scrollEnd: frameUrl(fr.frames && fr.frames.scrollEnd),
      facts: {
        nav: fr.nav, renderError: fr.renderError || null, liquidError: fr.liquidError || null,
        overflowPx: fr.overflowPx || 0, brokenImages: (fr.brokenImages || []).length,
        emptyShells: (fr.emptyShells || []).length, cls: fr.cls ?? null, consoleErrors: (fr.consoleErrors || []).length,
      },
      verdict: v ? { verdict: v.verdict, confidence: v.confidence, findings: Array.isArray(v.findings) ? v.findings : [] } : null,
    };
  });

  const findingsByOwner = {};
  for (const fr of frames) {
    for (const f of (fr.verdict ? fr.verdict.findings : [])) {
      const owner = f.fix_owner || 'loom';
      (findingsByOwner[owner] = findingsByOwner[owner] || []).push({ ...f, surface: fr.surface, viewport: fr.viewport });
    }
  }

  res.json({
    configured: true, present: !!manifest, dir,
    store: (manifest && manifest.previewUrl) || null,
    capturedAt: (manifest && manifest.capturedAt_ms) || null,
    gate18: gate18 ? { pass: !!gate18.pass, blockers: gate18.blockers || [], warnings: gate18.warnings || [] } : null,
    summary: {
      frames: frames.length,
      fail: frames.filter((f) => f.verdict && f.verdict.verdict === 'FAIL').length,
      pass: frames.filter((f) => f.verdict && f.verdict.verdict === 'PASS').length,
      unjudged: frames.filter((f) => !f.verdict).length,
    },
    frames, findingsByOwner,
  });
});

// GET /api/lens/frame?dir=<>&file=<rel> — serve a captured PNG (path-traversal-guarded to <dir>/lens).
router.get('/lens/frame', (req, res) => {
  const dir = resolveReportDir(typeof req.query.dir === 'string' ? req.query.dir : null);
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  if (!dir || !file) return res.status(400).end();
  const lensDir = path.join(dir, 'lens');
  const abs = path.resolve(lensDir, file);
  if (!(abs === lensDir || abs.startsWith(lensDir + path.sep)) || !/\.(png|jpe?g|webp)$/i.test(abs)) return res.status(403).end();
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.type(path.extname(abs).slice(1));
  fs.createReadStream(abs).pipe(res);
});

module.exports = { router };
