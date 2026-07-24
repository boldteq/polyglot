// Canonical registry of the MANAGED BODY BLOCKS inside an agent's ~/.claude/agents/<name>.md.
//
// A4 (2026-07-24, "one governed loop"): the verification report worried that six subsystems write the
// same agent files and could clobber each other (the HYG-1 file-splice class). The real architecture is
// a clean funnel with exactly TWO writers of an agent's BODY, each owning ONE marker-delimited block:
//
//   • SWT-TRAINED       — scripts/swt-distribute.mjs   (the corpus / gap-fill path)
//   • BOLDTEQ-AUTOLEARN — src/intelligence/trainer.mjs (the defect-grounded governed path; gateFindings
//                                                       signals, the learning-inbox, and Yash corrections
//                                                       ALL funnel through here — one governed writer)
//
// Every other "writer" touches a DIFFERENT file, never these blocks (so they cannot collide):
//   • src/lib/gateFindings.js   → emits training_signals (DB) → applied by the trainer inside AUTOLEARN
//   • scripts/quality-loop.mjs  → writes theme-toolkit/toolkit-rules/{proposed,team-default}.json (rule pack)
//   • src/lib/agentSync.js      → syncs frontmatter (name/description/model/tools) only, never the body
//   • scripts/pack-brain.mjs    → reads agents to package them; no write
//
// This module + agentBlocks.test.mjs make the invariant enforceable: (1) the live writers must use these
// exact markers (drift-guarded), (2) the markers are mutually non-substring (a regex for one can never
// match another's), (3) two present blocks can never overlap/nest. A THIRD body writer MUST register here
// and pass the same checks — that is what turns "six loops" into one auditable, collision-proof funnel.

export const MANAGED_BLOCKS = [
  { channel: 'SWT-TRAINED', owner: 'scripts/swt-distribute.mjs', start: '<!-- SWT-TRAINED:START -->', end: '<!-- SWT-TRAINED:END -->' },
  { channel: 'BOLDTEQ-AUTOLEARN', owner: 'src/intelligence/trainer.mjs', start: '<!-- BOLDTEQ-AUTOLEARN:START -->', end: '<!-- BOLDTEQ-AUTOLEARN:END -->' },
];

// True iff no marker is a substring of another — so one block's start/end can never appear inside
// another block's region and confuse a non-anchored regex. The core mutual-exclusion guarantee.
export function markersAreDisjoint(blocks = MANAGED_BLOCKS) {
  const markers = blocks.flatMap((b) => [b.start, b.end]);
  for (let i = 0; i < markers.length; i += 1) {
    for (let j = 0; j < markers.length; j += 1) {
      if (i !== j && markers[i].includes(markers[j])) return false;
    }
  }
  return true;
}

// The [startIdx, endIdxExclusive] char range of a block in `md`, or null if the block is absent.
// Throws on a malformed block: an unbalanced marker (one without the other), a duplicated marker,
// or an end that precedes its start — every shape that a corrupt write leaves behind.
export function blockRange(md, b) {
  const s = md.indexOf(b.start);
  const e = md.indexOf(b.end);
  if (s === -1 && e === -1) return null; // block simply not present — fine
  if (s === -1 || e === -1) throw new Error(`${b.channel}: unbalanced markers (start@${s}, end@${e})`);
  if (md.indexOf(b.start) !== md.lastIndexOf(b.start) || md.indexOf(b.end) !== md.lastIndexOf(b.end)) {
    throw new Error(`${b.channel}: duplicated marker (must appear exactly once)`);
  }
  if (e < s) throw new Error(`${b.channel}: end marker precedes start marker`);
  return [s, e + b.end.length];
}

// Throw if any two present managed blocks overlap or nest. Absent blocks are ignored. This is the check
// a body writer runs on its result BEFORE writing — a splice (HYG-1) manifests as one block's range
// swallowing another, which this catches even when both marker pairs stay balanced.
export function assertBlockIsolation(md, blocks = MANAGED_BLOCKS) {
  if (!markersAreDisjoint(blocks)) throw new Error('managed-block markers are not mutually disjoint');
  const ranges = [];
  for (const b of blocks) {
    const r = blockRange(md, b);
    if (r) ranges.push({ channel: b.channel, r });
  }
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const [a0, a1] = ranges[i].r;
      const [b0, b1] = ranges[j].r;
      if (a0 < b1 && b0 < a1) throw new Error(`managed blocks overlap: ${ranges[i].channel} ∩ ${ranges[j].channel}`);
    }
  }
  return true;
}

// Non-throwing form for writers that roll back gracefully instead of crashing a batch run.
export function blocksAreIsolated(md, blocks = MANAGED_BLOCKS) {
  try { return assertBlockIsolation(md, blocks); } catch { return false; }
}
