'use strict';

// Reads every gate-reports/*.json in a build dir and NORMALIZES the ≥2 on-disk
// shapes (plan §C4) into one canonical record:
//   { id, gateNumber|null, pass, findings:[{ text, severity }], reportFile, ts }
//
// Observed shapes:
//   A (render-verify.json, visual-quality.json): { ts, checks?:[{name,pass,detail}], findings?:[], pass }
//   B (keystone-clone.json):                      { gate, gateNumber, ts, pass, blockers:[], warnings:[] }
// id := explicit `gate` field, else the filename stem (which matches the gate
// `name` in the manifest in practice).

const fs = require('fs');
const path = require('path');

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

function normalizeFindings(raw) {
  const out = [];
  // Shape B — blockers + warnings arrays of strings/objects
  for (const b of (Array.isArray(raw.blockers) ? raw.blockers : [])) {
    out.push({ text: typeof b === 'string' ? b : (b.detail || b.text || b.id || JSON.stringify(b)), severity: 'blocker' });
  }
  for (const w of (Array.isArray(raw.warnings) ? raw.warnings : [])) {
    out.push({ text: typeof w === 'string' ? w : (w.detail || w.text || w.id || JSON.stringify(w)), severity: 'warning' });
  }
  // Shape A — explicit findings array
  for (const f of (Array.isArray(raw.findings) ? raw.findings : [])) {
    out.push({ text: typeof f === 'string' ? f : (f.detail || f.text || f.evidence || f.check || JSON.stringify(f)), severity: f.severity || 'warning' });
  }
  // Shape A — failed sub-checks become findings
  for (const c of (Array.isArray(raw.checks) ? raw.checks : [])) {
    if (c && c.pass === false) out.push({ text: `${c.name || 'check'}: ${c.detail || 'failed'}`, severity: 'blocker' });
  }
  return out;
}

// Read all gate reports in <dir>/gate-reports. Returns array of canonical records.
function readGateReports(buildDir) {
  const grDir = path.join(buildDir, 'gate-reports');
  let files;
  try { files = fs.readdirSync(grDir).filter((f) => f.endsWith('.json')); }
  catch { return []; }
  const out = [];
  for (const file of files) {
    // skip the lens sub-result + any summary aggregate — those have dedicated readers
    if (file === 'visual-truth.json') continue;
    const raw = readJson(path.join(grDir, file));
    if (!raw || typeof raw !== 'object') continue;
    const stem = file.replace(/\.json$/, '');
    out.push({
      id: raw.gate || stem,
      gateNumber: Number.isFinite(raw.gateNumber) ? raw.gateNumber : null,
      pass: raw.pass === true,
      findings: normalizeFindings(raw),
      reportFile: file,
      ts: raw.ts || null,
    });
  }
  return out;
}

module.exports = { readGateReports };
