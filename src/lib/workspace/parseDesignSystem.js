'use strict';

// Reads docs/design/design-system.json (drape's ratified design contract) for
// the visual Design System viewer. Returns { present, system } — tolerant of
// absence (most builds may not have it yet, per the docs-absent reality). The
// shape is passed through as-is; the frontend renders swatches/scales from the
// known keys (meta, color, color_schemes, typography, spacing, radius, shadows,
// motion, buttons, imagery, voice, css_system).

const fs = require('fs');
const path = require('path');

function parseDesignSystem(buildDir) {
  const p = path.join(buildDir, 'docs', 'design', 'design-system.json');
  try {
    const system = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { present: true, system };
  } catch {
    return { present: false, system: null };
  }
}

module.exports = { parseDesignSystem };
