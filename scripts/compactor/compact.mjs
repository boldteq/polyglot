#!/usr/bin/env node
// Agent Context Compactor — deterministic core+skills splitter.
//
// Usage:
//   node scripts/compactor/compact.mjs <agent.md>             # dry-run (default)
//   node scripts/compactor/compact.mjs <agent.md> --dry-run   # explicit dry-run
//   node scripts/compactor/compact.mjs <agent.md> --staging   # write to ./.compactor-staging/
//   node scripts/compactor/compact.mjs <agent.md> --write     # write to real paths
//   node scripts/compactor/compact.mjs --all                  # dry-run over every ~/.claude/agents/*.md
//   node scripts/compactor/compact.mjs --all --write          # apply compaction to every agent
//
// Flags:
//   --budget-lines <n>     override line budget (default 400; Rex/Arya: 700; Vex/Zeph: 300)
//   --budget-chars <n>     override char budget (default 16000)
//   --only <H1,H3>         only run specific heuristics (comma-separated)
//   --force                ignore existing compactor.last_compacted and re-run
//
// Rules:
//   - Idempotent: re-running on an already-compacted agent reports OK and skips unless --force.
//   - Never touches files if final core > budget AND no progress was made.
//   - MANDATORY blocks and `## Your Role` are preserved by heuristics (never extracted).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { pickPlan } from './heuristics.mjs';
import { renderArtifacts, writeArtifacts } from './render.mjs';
import { diffContent } from './verify.mjs';

const HOME = os.homedir();
const GLOBAL_AGENTS_DIR = path.join(HOME, '.claude', 'agents');

const DEFAULT_BUDGETS = {
  _default: { lines: 400, chars: 16000 },
  rex: { lines: 700, chars: 28000 },
  arya: { lines: 700, chars: 28000 },
  vex: { lines: 300, chars: 12000 },
  zeph: { lines: 300, chars: 12000 },
};

// Rex is special-cased: only H1 + H5 + H2b run, to avoid breaking dispatch flow.
// H2/H3/H4 can split or summarize dispatch logic in ways that break orchestration.
const AGENT_HEURISTIC_LIMITS = {
  rex: ['H1', 'H5', 'H2b'],
};

function parseArgs(argv) {
  const args = { files: [], mode: 'dry-run', all: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.mode = 'dry-run';
    else if (a === '--staging') args.mode = 'staging';
    else if (a === '--write') args.mode = 'write';
    else if (a === '--all') args.all = true;
    else if (a === '--force') args.force = true;
    else if (a === '--reconcile') args.reconcile = true;
    else if (a === '--budget-lines') args.budgetLines = Number(argv[++i]);
    else if (a === '--budget-chars') args.budgetChars = Number(argv[++i]);
    else if (a === '--tolerance') args.tolerance = Number(argv[++i]);
    else if (a === '--only') args.only = argv[++i].split(',').map(s => s.trim());
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else args.files.push(a);
  }
  return args;
}

// Walk ~/.claude/skills/<agent>/ and synthesize manifest entries for every
// .md found. If `existing` has metadata for the same id, keep it. Used to
// recover from a past run that orphaned skill files.
function reconcileManifestFromDisk(agentId, existing) {
  const root = path.join(HOME, '.claude', 'skills', agentId);
  if (!fs.existsSync(root)) return existing;
  const existingById = new Map((existing || []).map(s => [s.id, s]));

  function walk(dir, prefix = '') {
    const entries = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        entries.push(...walk(path.join(dir, entry.name), path.join(prefix, entry.name)));
      } else if (entry.name.endsWith('.md')) {
        const rel = path.join(prefix, entry.name).replace(/\\/g, '/');
        entries.push(rel);
      }
    }
    return entries;
  }

  const files = walk(root);
  const out = [];
  for (const rel of files) {
    const id = rel.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || rel;
    const absPath = path.join(root, rel);
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n').length;
    const prior = existingById.get(id);
    if (prior) {
      out.push({ ...prior, lines });
    } else {
      out.push({
        id,
        path: `skills/${agentId}/${rel}`,
        lines,
      });
    }
  }
  return out;
}

function resolveAgentPath(input) {
  // Accept: absolute path, ~-path, bare agent id ("koda")
  if (input.startsWith('~')) input = input.replace(/^~/, HOME);
  if (input.endsWith('.md') && fs.existsSync(input)) return path.resolve(input);
  const id = input.replace(/\.md$/, '');
  const candidate = path.join(GLOBAL_AGENTS_DIR, `${id}.md`);
  if (fs.existsSync(candidate)) return candidate;
  throw new Error(`Agent not found: ${input}`);
}

function getBudgets(agent, overrides) {
  const base = DEFAULT_BUDGETS[agent] || DEFAULT_BUDGETS._default;
  return {
    lines: overrides.budgetLines ?? base.lines,
    chars: overrides.budgetChars ?? base.chars,
  };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function processAgent(agentPath, args) {
  const agent = path.basename(agentPath, '.md').toLowerCase();
  const raw = fs.readFileSync(agentPath, 'utf-8');
  const parsed = matter(raw);
  const body = parsed.content;
  const originalLines = body.split('\n').length;
  const originalChars = body.length;

  const budgets = getBudgets(agent, args);
  const enabledHeuristics = args.only || AGENT_HEURISTIC_LIMITS[agent] || null;

  // Idempotency guard. Skip if already compacted AND under budget AND the
  // on-disk skill count matches the manifest count (no orphaned skills).
  const already = parsed.data?.compactor?.last_compacted;
  const manifest = Array.isArray(parsed.data?.skills) ? parsed.data.skills : [];
  const skillsDir = path.join(HOME, '.claude', 'skills', agent);
  let onDiskCount = 0;
  if (fs.existsSync(skillsDir)) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) =>
      n + (e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.md') ? 1 : 0)), 0);
    onDiskCount = walk(skillsDir);
  }
  const manifestMatchesDisk = manifest.length === onDiskCount;
  const isUnderBudget = originalLines <= budgets.lines && originalChars <= budgets.chars;

  if (already && !args.force && !args.reconcile && isUnderBudget && manifestMatchesDisk) {
    return {
      agent,
      path: agentPath,
      status: 'OK',
      note: `already compacted at ${already}, under budget, manifest matches disk (${onDiskCount} skills)`,
      originalLines,
      finalLines: originalLines,
      originalChars,
      finalChars: originalChars,
      skills: [],
      preservedCount: 0,
    };
  }

  if (isUnderBudget && manifestMatchesDisk && !args.reconcile) {
    return {
      agent,
      path: agentPath,
      status: 'OK',
      note: 'already within budget, manifest matches disk',
      originalLines,
      finalLines: originalLines,
      originalChars,
      finalChars: originalChars,
      skills: [],
      preservedCount: 0,
    };
  }

  // Under budget but manifest out-of-sync with disk → reconcile only.
  if (isUnderBudget && !manifestMatchesDisk) {
    const reconciledManifest = reconcileManifestFromDisk(agent, manifest);
    const artifacts = renderArtifacts({
      originalFrontmatter: parsed.data,
      finalRemaining: body,
      skills: [],
      agent,
      budgetLines: budgets.lines,
      budgetChars: budgets.chars,
      originalBody: body,
      existingSkillManifest: reconciledManifest,
      forceRehydrate: args.reconcile,
    });
    let writeResult = null;
    if (args.mode === 'write' || args.mode === 'staging') {
      writeResult = writeArtifacts({
        agentPath,
        newFrontmatter: artifacts.newFrontmatter,
        coreBody: artifacts.coreBody,
        skillFiles: [],
        mode: args.mode,
      });
    }
    return {
      agent,
      path: agentPath,
      status: 'RECONCILE',
      note: `rebuilt manifest from ${onDiskCount} skills on disk (was ${manifest.length} in frontmatter)`,
      originalLines,
      finalLines: body.split('\n').length,
      originalChars,
      finalChars: body.length,
      skills: [],
      mergedSkills: artifacts.mergedSkills,
      preservedCount: reconciledManifest.length,
      budgets,
      writeResult,
    };
  }

  const result = pickPlan(body, {
    agent,
    budgetLines: budgets.lines,
    budgetChars: budgets.chars,
    enabledHeuristics,
  });

  const { skills, finalRemaining, finalLines, finalChars, plan } = result;
  const underBudget = finalLines <= budgets.lines && finalChars <= budgets.chars;
  const madeProgress = finalLines < originalLines;

  // Preserve prior manifest. If the frontmatter's skills list is out-of-sync
  // with what's on disk, reconcile from disk — scan ~/.claude/skills/<agent>/
  // and synthesize entries for every file. This is always safe: a healthy
  // agent produces an identical manifest.
  let existingSkillManifest = Array.isArray(parsed.data?.skills) ? parsed.data.skills : [];
  const manifestOutOfSync = existingSkillManifest.length !== onDiskCount;
  if (manifestOutOfSync || args.reconcile || args.force) {
    existingSkillManifest = reconcileManifestFromDisk(agent, existingSkillManifest);
  }

  // Also detect body-level drift: multiple '## Skill Library' blocks, or one
  // whose link count doesn't match the manifest. If so, the body needs a
  // rewrite even when no heuristic made progress.
  const skillLibCount = (body.match(/^##\s+Skill Library\b/gm) || []).length;
  const bodyLinkCount = (body.match(/→ `~\/\.claude\/skills\//g) || []).length;
  const bodyOutOfSync = skillLibCount > 1
    || (skillLibCount === 1 && bodyLinkCount !== onDiskCount)
    || (skillLibCount === 0 && onDiskCount > 0);

  const artifacts = renderArtifacts({
    originalFrontmatter: parsed.data,
    finalRemaining,
    skills,
    agent,
    budgetLines: budgets.lines,
    budgetChars: budgets.chars,
    originalBody: body,
    existingSkillManifest,
    forceRehydrate: args.reconcile,
  });

  // If the manifest or body drifted, even a no-progress run must write the
  // corrected frontmatter + Skill Library block.
  const manifestNeedsFix = existingSkillManifest.length !== manifest.length
    || existingSkillManifest.length !== onDiskCount;
  const needsRewrite = manifestNeedsFix || bodyOutOfSync || args.reconcile || args.force;

  // Pre-write content-loss gate. Compare the original body against the
  // merged destination (new core + fresh skills + already-on-disk skills for
  // merged entries). If more than tolerance% of content is missing, abort
  // this agent's write and return an ABORT status.
  const tolerancePct = Number.isFinite(args.tolerance) ? args.tolerance : 1.0;
  const freshSkillBodies = artifacts.skillFiles.map(sf => sf.content || '');
  const existingSkillBodies = [];
  if (Array.isArray(artifacts.mergedSkills)) {
    for (const s of artifacts.mergedSkills) {
      const abs = path.join(HOME, '.claude', s.path.replace(/^skills\//, 'skills/'));
      if (fs.existsSync(abs)) existingSkillBodies.push(fs.readFileSync(abs, 'utf-8'));
    }
  }
  const allSkillBodies = [...freshSkillBodies, ...existingSkillBodies];
  const lossReport = diffContent(body, artifacts.coreBody, allSkillBodies);

  if (lossReport.pct > tolerancePct) {
    return {
      agent,
      path: agentPath,
      status: 'ABORT',
      note: `content-loss ${lossReport.pct.toFixed(1)}% > tolerance ${tolerancePct}% (${lossReport.missingLines}/${lossReport.originalLines} lines would disappear)`,
      originalLines,
      finalLines,
      originalChars,
      finalChars,
      plan,
      skills,
      lossReport,
      budgets,
    };
  }

  let writeResult = null;
  if (args.mode === 'write' || args.mode === 'staging') {
    if (!madeProgress && !needsRewrite && args.mode === 'write') {
      return {
        agent,
        path: agentPath,
        status: 'SKIP',
        note: 'no heuristic matched — nothing to extract',
        originalLines,
        finalLines,
        originalChars,
        finalChars,
        plan,
        skills: [],
        budgets,
      };
    }
    writeResult = writeArtifacts({
      agentPath,
      newFrontmatter: artifacts.newFrontmatter,
      coreBody: artifacts.coreBody,
      skillFiles: artifacts.skillFiles,
      mode: args.mode,
    });
  }

  const mergedCount = artifacts.mergedSkills?.length ?? skills.length;
  const preservedCount = Math.max(0, mergedCount - skills.length);

  return {
    agent,
    path: agentPath,
    status: underBudget ? (args.mode === 'dry-run' ? 'PLAN' : 'OK') : 'PARTIAL',
    originalLines,
    finalLines,
    originalChars,
    finalChars,
    plan,
    skills,
    mergedSkills: artifacts.mergedSkills,
    preservedCount,
    budgets,
    writeResult,
  };
}

function printReport(r, args) {
  const shrinkL = r.originalLines > 0 ? Math.round(100 * (1 - r.finalLines / r.originalLines)) : 0;
  const shrinkC = r.originalChars > 0 ? Math.round(100 * (1 - r.finalChars / r.originalChars)) : 0;
  console.log('');
  console.log(`=== ${r.agent} (${r.status}) ===`);
  console.log(`   budget:        ${fmt(r.budgets?.lines ?? '—')} lines / ${fmt(r.budgets?.chars ?? '—')} chars`);
  console.log(`   before:        ${fmt(r.originalLines)} lines / ${fmt(r.originalChars)} chars`);
  console.log(`   after:         ${fmt(r.finalLines)} lines / ${fmt(r.finalChars)} chars   (-${shrinkL}% lines, -${shrinkC}% chars)`);
  if (r.note) console.log(`   note:          ${r.note}`);
  if (r.lossReport) {
    const lp = r.lossReport;
    console.log(`   content:       ${lp.originalLines} lines → ${lp.missingLines} would be lost (${lp.pct.toFixed(1)}%)`);
    if (lp.missing && lp.missing.length > 0 && r.status === 'ABORT') {
      console.log('   sample missing:');
      for (const l of lp.missing.slice(0, 5)) console.log(`     - ${l.slice(0, 110)}`);
    }
  }
  if (r.skills && r.skills.length > 0) {
    console.log(`   extracted:     ${r.skills.length} new skill file${r.skills.length === 1 ? '' : 's'}`);
    for (const s of r.skills) {
      console.log(`     [${s.source}] ${s.path}  (${s.lines} lines) — triggers: ${s.triggers.slice(0, 5).join(', ')}${s.triggers.length > 5 ? '…' : ''}`);
    }
  }
  if (r.preservedCount > 0) {
    console.log(`   preserved:     ${r.preservedCount} skill${r.preservedCount === 1 ? '' : 's'} from previous compaction (merged into manifest)`);
  }
  if (r.writeResult) {
    console.log(`   ${r.writeResult.mode.toUpperCase()} wrote ${r.writeResult.written.length} file${r.writeResult.written.length === 1 ? '' : 's'}:`);
    for (const p of r.writeResult.written.slice(0, 8)) {
      console.log(`     ${p.replace(HOME, '~')}`);
    }
    if (r.writeResult.written.length > 8) console.log(`     … and ${r.writeResult.written.length - 8} more`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = args.all
    ? fs.readdirSync(GLOBAL_AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => path.join(GLOBAL_AGENTS_DIR, f))
    : args.files.map(resolveAgentPath);

  if (paths.length === 0) {
    console.error('Usage: node scripts/compactor/compact.mjs <agent> [--dry-run|--staging|--write]');
    console.error('       node scripts/compactor/compact.mjs --all [--write]');
    process.exit(1);
  }

  console.log(`[${args.mode.toUpperCase()}] Processing ${paths.length} agent${paths.length === 1 ? '' : 's'}`);
  const results = [];
  for (const p of paths) {
    try {
      const r = processAgent(p, args);
      results.push(r);
      printReport(r, args);
    } catch (err) {
      console.log(`\n=== ${path.basename(p, '.md')} (ERROR) ===`);
      console.log(`   ${err.message}`);
      if (process.env.DEBUG) console.log(err.stack);
    }
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  const byStatus = {};
  let totalBefore = 0, totalAfter = 0;
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    totalBefore += r.originalLines || 0;
    totalAfter += r.finalLines || 0;
  }
  console.log(`  Status: ${Object.entries(byStatus).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  const pct = totalBefore > 0 ? Math.round(100 * (1 - totalAfter / totalBefore)) : 0;
  console.log(`  Total lines: ${fmt(totalBefore)} → ${fmt(totalAfter)}  (-${pct}%)`);
  if (args.mode === 'dry-run') {
    console.log('  (dry-run — no files written. Run again with --staging or --write to apply.)');
  }
}

try {
  main();
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(2);
}
