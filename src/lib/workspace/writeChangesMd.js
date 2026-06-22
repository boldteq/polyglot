'use strict';

// Bounded, surgical writes to a build's CHANGES.md — the project's acceptance
// checklist. The panel EDITS this management artifact directly (it's git-tracked
// + reversible); build code stays agent-authored. Every mutation rewrites the
// ONE file in place, preserving all other lines exactly, then the disk watcher +
// indexer auto-refresh the build's score.
//
// Item indices match parseChangesMd.js: items are checkbox lines (`- [ ]`/`- [x]`)
// in document order, EXCLUDING the `## Waivers` section.

const fs = require('fs');
const { parseChangesMd } = require('./parseChangesMd');

const CHECKBOX = /^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/;
const WAIVERS_HEAD = /^##\s+Waivers/i;
const SECTION_HEAD = /^##\s+/;

function readLines(p) { return fs.readFileSync(p, 'utf-8').split('\n'); }
function writeLines(p, lines) { fs.writeFileSync(p, lines.join('\n')); }

// Flip the Nth non-waiver checkbox to checked/unchecked. Returns updated parse.
function toggleItem(changesPath, index, checked) {
  const lines = readLines(changesPath);
  let itemIdx = -1, inWaivers = false, done = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (WAIVERS_HEAD.test(line)) { inWaivers = true; continue; }
    if (SECTION_HEAD.test(line)) inWaivers = false;
    if (inWaivers) continue;
    const m = line.match(CHECKBOX);
    if (!m) continue;
    itemIdx += 1;
    if (itemIdx === index) {
      lines[i] = `${m[1]}${checked ? 'x' : ' '}${m[3]}`;
      done = true;
      break;
    }
  }
  if (!done) throw new Error(`CHANGES item #${index} not found`);
  writeLines(changesPath, lines);
  return parseChangesMd(changesPath);
}

// Append a new unchecked item. Inserted just before the `## Waivers` section if
// present (so waivers stay last), else at end of file.
function addItem(changesPath, text) {
  const clean = String(text).replace(/\r?\n/g, ' ').trim();
  if (!clean) throw new Error('item text required');
  const lines = readLines(changesPath);
  const waiverIdx = lines.findIndex((l) => WAIVERS_HEAD.test(l));
  const newLine = `- [ ] ${clean}`;
  if (waiverIdx >= 0) {
    lines.splice(waiverIdx, 0, newLine, ''); // item + blank, before Waivers head
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(newLine);
  }
  writeLines(changesPath, lines);
  return parseChangesMd(changesPath);
}

// Add a waiver entry, creating the `## Waivers` section if missing.
function addWaiver(changesPath, text) {
  const clean = String(text).replace(/\r?\n/g, ' ').trim();
  if (!clean) throw new Error('waiver text required');
  const lines = readLines(changesPath);
  const waiverIdx = lines.findIndex((l) => WAIVERS_HEAD.test(l));
  if (waiverIdx >= 0) {
    // insert right after the heading (and an existing "_(none)_" placeholder → replace)
    let insertAt = waiverIdx + 1;
    while (insertAt < lines.length && /^_\(none\)_\s*$/i.test(lines[insertAt].trim())) {
      lines.splice(insertAt, 1); // drop the placeholder
    }
    lines.splice(insertAt, 0, `- ${clean}`);
  } else {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push('## Waivers', `- ${clean}`);
  }
  writeLines(changesPath, lines);
  return parseChangesMd(changesPath);
}

module.exports = { toggleItem, addItem, addWaiver };
