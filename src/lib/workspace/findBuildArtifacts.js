'use strict';

// Given a build dir, returns the set of artifact paths the dashboard reads.
// Each path is returned with an `exists` flag — most docs/* artifacts are ABSENT
// on current builds (plan §C5), so callers must tolerate exists:false.

const fs = require('fs');
const path = require('path');

function entry(p) { return { path: p, exists: fs.existsSync(p) }; }

function findBuildArtifacts(buildDir) {
  const j = (...parts) => path.join(buildDir, ...parts);
  return {
    changes:        entry(j('CHANGES.md')),
    goals:          entry(j('docs', 'discovery', 'goals.json')),
    sitemap:        entry(j('docs', 'discovery', 'sitemap.md')),
    brandBible:     entry(j('docs', 'brand', 'brand-bible.md')),
    brandDirection: entry(j('docs', 'brand', 'brand-direction.md')),
    designSystem:   entry(j('docs', 'design', 'design-system.json')),
    status:         entry(j('docs', 'status.md')),
    baseline:       entry(j('docs', 'results', 'baseline.md')),
    gateReportsDir: entry(j('gate-reports')),
    lensDir:        entry(j('gate-reports', 'lens')),
    sectionsDir:    entry(j('sections')),
    docsDir:        entry(j('docs')),
  };
}

module.exports = { findBuildArtifacts };
