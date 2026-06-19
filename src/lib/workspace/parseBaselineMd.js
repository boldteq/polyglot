'use strict';

// Parses a build's docs/results/baseline.md (orbit's 30/90d results loop) into a
// light structure. Tolerant of absence (plan §C5) — returns { present:false }
// when the file isn't there (true for every current build).
//
// Reads YAML-ish frontmatter (key: value between --- fences) + any markdown
// tables (header row + rows) so the Results tab can render per-surface lift.

const fs = require('fs');

function parseBaselineMd(baselinePath) {
  let raw;
  try { raw = fs.readFileSync(baselinePath, 'utf-8'); }
  catch { return { present: false, meta: {}, tables: [] }; }

  const meta = {};
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^([\w.-]+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
  }

  // crude markdown table extraction: a header row, a |---| separator, then rows
  const tables = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const header = lines[i].split('|').map((c) => c.trim()).filter(Boolean);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        rows.push(lines[j].split('|').map((c) => c.trim()).filter(Boolean));
        j += 1;
      }
      tables.push({ header, rows });
      i = j;
    }
  }
  return { present: true, meta, tables };
}

module.exports = { parseBaselineMd };
