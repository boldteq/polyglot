'use strict';

function computeLineDiff(before, after) {
  const oldLines = (before || '').split('\n');
  const newLines = (after || '').split('\n');
  const hunks = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  let i = 0;
  while (i < maxLen) {
    // Skip identical lines
    if (i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i]) { i++; continue; }
    // Start of a changed region
    const hunkStart = i;
    const removed = [];
    const added = [];
    // Collect contiguous changed lines (simple sequential diff)
    while (i < maxLen && !(i < oldLines.length && i < newLines.length && oldLines[i] === newLines[i])) {
      if (i < oldLines.length && (i >= newLines.length || oldLines[i] !== newLines[i])) {
        removed.push(oldLines[i]);
      }
      if (i < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[i])) {
        added.push(newLines[i]);
      }
      i++;
    }
    if (removed.length || added.length) {
      hunks.push({ line: hunkStart + 1, removed, added });
    }
  }
  return hunks;
}

module.exports = { computeLineDiff };
