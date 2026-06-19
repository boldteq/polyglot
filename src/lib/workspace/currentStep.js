'use strict';

// Derive the current pipeline step (1–18) for a build — disk-based, since there
// is no per-build agent-run correlation (see projectFilter.js header).
//
// Strategy: walk the pipelineSpec steps in order; a step counts as "reached" if
// its required artifact exists on disk. The current step = the furthest reached
// (or the first not-yet-reached, whichever the caller wants). Gate-reports and
// Lens presence advance steps 13–14; CHANGES.md presence covers intake.
//
// This is intentionally conservative: it reflects what's actually on disk, not
// what an agent claims. Absent the full docs/ tree (plan §C5), most current
// builds resolve to an early step — which is honest.

const fs = require('fs');
const path = require('path');
const pipelineSpec = require('./pipelineSpec.json');

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

// Map a step's `artifact` (relative) to an existence check in the build dir.
function stepReached(buildDir, artifact) {
  if (!artifact) return false;
  const abs = path.join(buildDir, artifact);
  if (artifact.endsWith('/')) return exists(abs); // directory artifact
  if (exists(abs)) return true;
  // directory-style artifacts named without trailing slash (gate-reports/, sections/)
  if (/(gate-reports|sections|docs)$/.test(artifact)) return exists(abs);
  return false;
}

function deriveCurrentStep(buildDir, { gateReportCount = 0, lensPresent = false } = {}) {
  let reached = 0;
  for (const s of pipelineSpec.steps) {
    let ok = stepReached(buildDir, s.artifact);
    // step 13 (qa-gates) is reached if ANY gate report exists
    if (s.key === 'qa-gates' && gateReportCount > 0) ok = true;
    // step 14 (lens) is reached if the Lens visual-truth artifact exists
    if (s.key === 'lens' && lensPresent) ok = true;
    if (ok) reached = s.step;
  }
  // current = next step after the last reached (capped at 18), min 1
  const current = Math.min(18, Math.max(1, reached === 0 ? 1 : reached));
  return { current, reached, total: pipelineSpec.steps.length };
}

module.exports = { deriveCurrentStep };
