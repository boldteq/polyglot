'use strict';

// Shallow file tree of the build-relevant directories (docs/, gate-reports/,
// sections/, templates/) + top-level docs files. Used by the Files tab to give
// "open in VS Code" deeplinks. Intentionally shallow (1 level inside each dir)
// to stay fast and avoid dumping node_modules/assets.

const fs = require('fs');
const path = require('path');

const DIRS = ['docs', 'gate-reports', 'sections', 'templates', 'config', 'layout'];
const TOP_FILES = ['CHANGES.md', 'SYNC.md', 'theme.liquid', 'settings_schema.json'];

function listDir(abs) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, dir: e.isDirectory(), path: path.join(abs, e.name) }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
}

function readBuildFiles(buildDir) {
  const tree = [];
  for (const d of DIRS) {
    const abs = path.join(buildDir, d);
    if (!fs.existsSync(abs)) continue;
    tree.push({ name: d, path: abs, children: listDir(abs) });
  }
  const topFiles = [];
  for (const f of TOP_FILES) {
    const abs = path.join(buildDir, f);
    if (fs.existsSync(abs)) topFiles.push({ name: f, path: abs });
  }
  return { buildDir, topFiles, tree };
}

module.exports = { readBuildFiles };
