'use strict';

// Shopify client-project API — P1 (upfront intake wizard, captured ONCE so brand/direction questions
// are never re-asked) + P5 (per-page preview + revision requests). The intake row is the durable
// record atrium dispatches the 18-step pipeline from; project_pages drives the StorePreview page.
//
// DEPRECATED (2026-06-21) for the cockpit: project intake/lifecycle is now owned by the Workspace
// routes (`GET/POST/PATCH/DELETE /api/workspace/projects`) — same `client_projects` table. Prefer
// those for new UI. This route stays mounted for the legacy /shopify pages + pages/revisions
// (which Workspace doesn't use). Don't add new intake features here; extend the Workspace routes.

const { Router } = require('express');
const db = require('../db');

const router = Router();

// the default page set (theme-page-recipes); the wizard pre-checks these, intake can override
const DEFAULT_PAGES = [
  { slug: 'home', title: 'Home' }, { slug: 'product', title: 'Product (PDP)' },
  { slug: 'collection', title: 'Collection' }, { slug: 'cart', title: 'Cart' },
  { slug: 'about', title: 'About' }, { slug: 'contact', title: 'Contact' },
];

// POST /api/shopify/intake — create a project from the wizard + seed its page set.
router.post('/shopify/intake', (req, res) => {
  const b = req.body || {};
  const name = (b.name || b.brand || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name (brand) is required' });
  try {
    const id = db.createClientProject({ name, niche: b.niche || null, domain: b.domain || null, intake: b });
    const pages = Array.isArray(b.pages) && b.pages.length
      ? b.pages.map((p) => (typeof p === 'string' ? { slug: p, title: p } : p))
      : DEFAULT_PAGES;
    db.seedProjectPages(id, pages);
    res.status(201).json({ id, name, status: 'intake', pages: pages.length });
  } catch (err) {
    console.error('[shopify] intake failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/shopify/projects — list all client projects.
router.get('/shopify/projects', (_req, res) => {
  try { res.json({ projects: db.listClientProjects() }); }
  catch (err) { console.error('[shopify] list failed:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/shopify/projects/:id — one project + its intake + pages + revisions.
router.get('/shopify/projects/:id', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    res.json({ project, pages: db.listProjectPages(req.params.id), revisions: db.listRevisions(req.params.id) });
  } catch (err) { console.error('[shopify] get failed:', err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/shopify/projects/:id/pages — page set + per-page gate/Lens status (drives StorePreview).
router.get('/shopify/projects/:id/pages', (req, res) => {
  try {
    if (!db.getClientProject(req.params.id)) return res.status(404).json({ error: 'project not found' });
    res.json({ pages: db.listProjectPages(req.params.id) });
  } catch (err) { console.error('[shopify] pages failed:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/shopify/projects/:id/pages/:slug/revision — request a change on ONE page (scoped rebuild).
router.post('/shopify/projects/:id/pages/:slug/revision', (req, res) => {
  const { feedback, severity } = req.body || {};
  if (!feedback || !String(feedback).trim()) return res.status(400).json({ error: 'feedback is required' });
  try {
    if (!db.getClientProject(req.params.id)) return res.status(404).json({ error: 'project not found' });
    const id = db.createRevision({ projectId: req.params.id, pageSlug: req.params.slug, feedback: String(feedback).trim(), severity: severity || 'normal' });
    res.status(201).json({ id, page: req.params.slug, status: 'requested' });
  } catch (err) { console.error('[shopify] revision failed:', err.message); res.status(500).json({ error: err.message }); }
});

module.exports = { router };
