// Content-loss verifier.
//
// Compares an "original" body with a "new" distribution (core + skill files)
// and reports any non-empty, non-stub line from the original that does not
// appear anywhere in the new distribution.
//
// The compactor calls this before every --write to fail atomically on loss.
// The verify CLI calls this across all agents to audit existing state.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();

const STUB_RES = [
  /<!--\s*skill:.*-->/,
  /<!--\s*example:.*-->/,
  /<!--\s*tool-guide:.*-->/,
  /<!--\s*Full content moved to.*-->/,
  /<!--\s*Full protocol moved to.*-->/,
  /<!--\s*\d+\s*patterns? moved to.*-->/,
  /<!--\s*\d+\s*rules? moved to.*-->/,
];

const SKILL_LIB_HEADER_RE = /^##\s+Skill Library\b/;
const SKILL_LIB_LINE_RE = /^- \*\*[^*]+\*\*.*→\s*`~\/\.claude\/skills\//;

function stripFrontmatter(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? text.slice(m[0].length) : text;
}

// Return the set of normalized "content-bearing" lines from a body.
// Excluded:
//   - empty lines / whitespace-only
//   - code fence markers (```...)
//   - compactor stub/pointer comments
//   - Skill Library section (always regenerated)
//   - first-load-manifest injected headers (harmless to compare but noisy)
export function contentLines(text) {
  const out = [];
  let inSkillLib = false;
  for (const line of text.split('\n')) {
    if (SKILL_LIB_HEADER_RE.test(line)) { inSkillLib = true; continue; }
    if (inSkillLib) {
      // Exit skill-lib section at the next H2 heading that isn't the lib header
      if (/^##\s+/.test(line) && !SKILL_LIB_HEADER_RE.test(line)) inSkillLib = false;
      else continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('```')) continue;
    if (STUB_RES.some(r => r.test(trimmed))) continue;
    if (SKILL_LIB_LINE_RE.test(trimmed)) continue;
    // Normalize internal whitespace so trivial reformatting doesn't flag loss
    out.push(trimmed.replace(/\s+/g, ' '));
  }
  return out;
}

export function diffContent(originalBody, newCoreBody, skillBodies) {
  const orig = contentLines(originalBody);
  const newSet = new Set(contentLines(newCoreBody));
  for (const t of skillBodies) {
    for (const l of contentLines(t)) newSet.add(l);
  }
  const missing = orig.filter(l => !newSet.has(l));
  return {
    originalLines: orig.length,
    missingLines: missing.length,
    missing,
    pct: orig.length > 0 ? (100 * missing.length) / orig.length : 0,
  };
}

// Public: given an agent and its file paths, run the diff.
export function verifyAgent({ originalBody, coreBodyAfter, skillFiles }) {
  const skillBodies = skillFiles.map(sf => {
    if (sf.content) return sf.content;
    if (sf.path && fs.existsSync(sf.path)) return fs.readFileSync(sf.path, 'utf-8');
    return '';
  });
  return diffContent(originalBody, coreBodyAfter, skillBodies);
}

// CLI: audit every agent in ~/.claude/agents/ against its backup in
// ~/.claude/agents/.pre-compact-<date>/ and its skill folder.
async function main() {
  const args = process.argv.slice(2);
  const tolerancePct = args.find(a => a.startsWith('--tolerance='))
    ? Number(args.find(a => a.startsWith('--tolerance=')).split('=')[1])
    : 1.0;
  const agentsDir = path.join(HOME, '.claude', 'agents');
  const skillsRoot = path.join(HOME, '.claude', 'skills');

  // Find the newest backup dir
  const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('.pre-compact-'))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (entries.length === 0) {
    console.error('No .pre-compact-* backup directory found in ~/.claude/agents/');
    process.exit(2);
  }
  const backupDir = path.join(agentsDir, entries[0].name);
  console.log(`Backup: ${backupDir.replace(HOME, '~')}`);
  console.log(`Tolerance: ${tolerancePct}%`);
  console.log('');

  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.md'));
  const results = [];
  for (const f of files) {
    const id = f.replace(/\.md$/, '');
    const backup = fs.readFileSync(path.join(backupDir, f), 'utf-8');
    const livePath = path.join(agentsDir, f);
    if (!fs.existsSync(livePath)) { continue; }
    const live = fs.readFileSync(livePath, 'utf-8');

    const skillFolder = path.join(skillsRoot, id);
    const skillTexts = [];
    if (fs.existsSync(skillFolder)) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name));
          else if (e.name.endsWith('.md')) skillTexts.push(fs.readFileSync(path.join(d, e.name), 'utf-8'));
        }
      };
      walk(skillFolder);
    }

    const diff = diffContent(
      stripFrontmatter(backup),
      stripFrontmatter(live),
      skillTexts,
    );
    results.push({ id, ...diff });
  }

  results.sort((a, b) => b.pct - a.pct);
  console.log(`${'agent'.padEnd(14)} ${'orig'.padStart(6)} ${'miss'.padStart(6)} ${'loss%'.padStart(7)}`);
  console.log('-'.repeat(40));
  let totalOrig = 0, totalMiss = 0, fails = 0;
  for (const r of results) {
    totalOrig += r.originalLines;
    totalMiss += r.missingLines;
    const flag = r.pct > tolerancePct ? ' ✗' : '';
    if (r.pct > tolerancePct) fails++;
    console.log(`${r.id.padEnd(14)} ${String(r.originalLines).padStart(6)} ${String(r.missingLines).padStart(6)} ${(r.pct.toFixed(1)+'%').padStart(7)}${flag}`);
  }
  console.log('');
  const pct = totalOrig > 0 ? (100 * totalMiss / totalOrig) : 0;
  console.log(`TOTAL: ${totalOrig} orig, ${totalMiss} missing (${pct.toFixed(2)}%)`);
  console.log(`Agents over tolerance: ${fails} / ${results.length}`);

  if (fails > 0) {
    console.log('');
    console.log('Top 3 worst offenders (first 5 missing lines each):');
    for (const r of results.slice(0, 3)) {
      if (r.missing.length === 0) continue;
      console.log(`\n[${r.id}]`);
      for (const l of r.missing.slice(0, 5)) console.log('  - ' + l.slice(0, 140));
    }
    process.exit(1);
  }
}

// Only run CLI if invoked directly (not imported as a module). Both fs path
// formats are tried to be resilient on different OSes.
const invokedPath = process.argv[1] || '';
const thisPath = new URL(import.meta.url).pathname;
if (invokedPath === thisPath || invokedPath.endsWith('verify.mjs')) {
  main().catch(err => { console.error(err); process.exit(2); });
}
