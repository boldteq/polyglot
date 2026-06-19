'use strict';

// Parses a build's CHANGES.md (the changes-list protocol) into:
//   { present, total, checked, rate, waivers:[], items:[{ checked, text }] }
// Tolerant of absence (plan §C5) — returns { present:false, ... } if no file.

const fs = require('fs');

function parseChangesMd(changesPath) {
  let raw;
  try { raw = fs.readFileSync(changesPath, 'utf-8'); }
  catch { return { present: false, total: 0, checked: 0, rate: 0, waivers: [], items: [] }; }

  const items = [];
  let inWaivers = false;
  const waivers = [];
  for (const line of raw.split('\n')) {
    if (/^##\s+Waivers/i.test(line)) { inWaivers = true; continue; }
    if (/^##\s+/.test(line)) inWaivers = false;
    const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (m) {
      const checked = m[1].toLowerCase() === 'x';
      const text = m[2].trim();
      if (inWaivers) waivers.push(text);
      else items.push({ checked, text });
    } else if (inWaivers && line.trim().startsWith('-')) {
      waivers.push(line.trim().replace(/^-\s*/, ''));
    }
  }
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  return {
    present: true,
    total,
    checked,
    rate: total ? Math.round((checked / total) * 100) : 0,
    waivers,
    items,
  };
}

module.exports = { parseChangesMd };
