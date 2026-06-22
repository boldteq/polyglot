'use strict';

// Auto-detect / adopt client projects from disk so the Workspace shows ONE
// unified project list (no "projects vs unlinked builds" split). Two passes:
//   1. AUTO-LINK — match an existing unlinked project row to a discovered build
//      dir by domain/name (the original behaviour, moved here).
//   2. AUTO-ADOPT — for every discovered build dir with NO project, create a
//      lightweight project row and link it.
//
// Idempotent on `build_dir` (getProjectByBuildDir guard — which sees archived
// rows too, so a re-scan never resurrects an archived project). Non-destructive:
// only ever CREATES rows for new dirs; never updates an existing/human-edited row.
//
// `listBuilds` is injected (not required) to avoid a circular dependency with the
// workspace route module.

const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { readThemeLock } = require('./gitStatus');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Derive lightweight intake (name/niche/domain + theme meta) from a build dir.
// Best-effort, tolerant of absence — the real signal is .boldteq-theme-lock.json;
// goals.json is usually absent, so niche stays null unless present.
function deriveIntakeFromDir(dir) {
  const name = path.basename(dir);
  const lock = readThemeLock(dir) || {};
  let niche = null;
  try {
    const goals = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'discovery', 'goals.json'), 'utf-8'));
    if (goals && goals.niche) niche = String(goals.niche);
  } catch { /* no goals.json — niche stays null */ }
  return {
    name,
    niche,
    domain: lock.store || null,
    intake: { source: 'auto-adopt', store: lock.store || null, themeName: lock.themeName || null, themeId: lock.themeId || null },
  };
}

// Run both passes. Returns { projects, unlinkedBuilds, adopted } — after adoption
// unlinkedBuilds is normally empty (every build owns a project).
function syncProjectsFromDisk(listBuilds) {
  const builds = listBuilds();
  const byDir = new Map(builds.map((b) => [b.dir, b]));
  let projects = db.listClientProjects();

  // PASS 1 — auto-link existing unlinked projects to a build dir.
  for (const p of projects) {
    if (!p.build_dir) {
      const key = norm(p.domain) || norm(p.name);
      const match = key && builds.find((b) => norm(b.client) === key || norm(b.store).includes(key) || norm(b.dir).includes(key));
      if (match) { db.linkProjectBuildDir(p.id, match.dir); p.build_dir = match.dir; }
    }
  }

  // PASS 2 — auto-adopt: create a project for any discovered build with none.
  const linkedDirs = new Set(projects.map((p) => p.build_dir).filter(Boolean));
  let adopted = 0;
  for (const b of builds) {
    if (linkedDirs.has(b.dir)) continue;
    if (db.getProjectByBuildDir(b.dir)) continue; // idempotency (incl. archived)
    const intake = deriveIntakeFromDir(b.dir);
    const id = db.createClientProject({ name: intake.name, niche: intake.niche, domain: intake.domain, intake: intake.intake });
    db.linkProjectBuildDir(id, b.dir);
    linkedDirs.add(b.dir);
    adopted += 1;
  }

  // Re-read so freshly-adopted rows are included, then attach live build state.
  projects = db.listClientProjects();
  for (const p of projects) p.build = p.build_dir ? (byDir.get(p.build_dir) || null) : null;
  const linked = new Set(projects.map((p) => p.build_dir).filter(Boolean));
  const unlinkedBuilds = builds.filter((b) => !linked.has(b.dir));
  return { projects, unlinkedBuilds, adopted };
}

module.exports = { syncProjectsFromDisk, deriveIntakeFromDir };
