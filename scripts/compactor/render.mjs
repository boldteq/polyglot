// Render module — takes the compactor plan and produces the final artifacts:
//   - a compacted core body (with skill-library block appended)
//   - one file per skill under ~/.claude/skills/<agent>/
//   - updated frontmatter with the skills[] manifest + compactor metadata

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import matter from 'gray-matter';

const HOME = os.homedir();
const SKILLS_ROOT = path.join(HOME, '.claude', 'skills');

function atomicWriteText(filePath, text) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, text, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

function renderSkillLibraryBlock(skills, agent) {
  if (skills.length === 0) return '';
  const lines = [
    '',
    '## Skill Library (load on demand)',
    '',
    '**When the user\'s task mentions any of the keywords below, FIRST call `Read` on the matching skill file, THEN proceed.** Do not guess the content — load it.',
    '',
  ];
  for (const s of skills) {
    const triggers = Array.isArray(s.triggers) ? s.triggers.slice(0, 8).join(', ') : '';
    const absPath = `~/.claude/${s.path}`;
    const heading = s.heading || s.id;
    if (triggers) {
      lines.push(`- **${heading}** — triggers: _${triggers}_ → \`${absPath}\``);
    } else {
      lines.push(`- **${heading}** → \`${absPath}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// Merge two skill manifests. New entries override matching ids.
// Missing-on-disk entries are dropped from the result.
function mergeManifests(existing, fresh, skillsRoot) {
  const byId = new Map();
  // Seed with existing, filtered by disk presence
  for (const s of (existing || [])) {
    if (!s || !s.id || !s.path) continue;
    const absPath = path.join(skillsRoot, s.path.replace(/^skills\//, ''));
    if (!fs.existsSync(absPath)) continue;
    byId.set(s.id, { ...s, _origin: 'existing' });
  }
  // Overlay fresh
  for (const s of (fresh || [])) {
    byId.set(s.id, { ...s, _origin: 'fresh' });
  }
  // Strip internal markers, sort for stability: existing-first, then fresh
  return [...byId.values()].map(({ _origin, ...rest }) => rest);
}

// Emit: returns { coreBody, skillFiles, newFrontmatter, mergedSkills }
// `existingSkillManifest` (optional) preserves prior extractions when a file
// has been compacted before — prevents orphaning skills across re-runs.
export function renderArtifacts({ originalFrontmatter, finalRemaining, skills, agent, budgetLines, budgetChars, originalBody, existingSkillManifest, forceRehydrate }) {
  // Reconstitute triggers + heading for existing manifest entries by reading
  // disk. Without these, the Skill Library block can't route correctly.
  //
  // Keyword extraction strategy:
  //   1. Title = the skill file's FIRST H1; if no H1 then strip wrapper and
  //      use the filename as a fallback ("advanced patterns" from the slug).
  //   2. Triggers = title words + domain keywords found in first 2000 chars of
  //      content (stripped of stop-words). This catches real routing words
  //      like billing/stripe/supabase/migration that aren't in the title.
  const STOP_GENERIC = new Set([
    'claude','memory','patterns','load','check','reference','never','must',
    'before','create','every','always','ensure','verify','these','this','that',
    'which','when','where','with','without','from','into','onto','upon','about',
    'using','used','make','made','does','doing','done','more','most','less',
    'also','only','some','such','than','then','there','their','they','them',
    'will','would','could','should','might','okay','file','files','code',
    'line','lines','page','pages','step','steps','part','type','types',
    'koda','rex','dato','vex','luna','sage','riko','bolt','hawk','arya',
    'scout','nova','atlas','pulse','ledger','orbit','verdict','echo','harvest',
    'quill','vega','zeph','mira','cadence','roster','witness','forge','tutor',
  ]);
  const DOMAIN_KW = [
    'billing','subscription','stripe','dodo','checkout','pricing','payment','invoice',
    'auth','login','session','jwt','oauth','cookie','rls','password',
    'migration','schema','trigger','index','rls','postgres','supabase','realtime','edge-function',
    'testing','e2e','unit','integration','vitest','playwright','jest',
    'deploy','railway','vercel','docker','ci','cd','github-actions',
    'seo','sitemap','robots','og','metadata','structured-data',
    'accessibility','wcag','aria','a11y','semantic',
    'error','catch','throw','retry','rate-limit','timeout',
    'form','validation','zod','yup','input','upload',
    'react','nextjs','remix','react-router','shopify','polaris','flutter','ios','android',
    'query','mutation','react-query','tanstack','swr',
    'security','csrf','xss','sanitize','sql-injection',
    'typescript','tsc','type-safety','generics',
    'performance','lighthouse','bundle','lazy-load','suspense','streaming',
    'ui','ux','design','figma','tailwind','shadcn','motion','animation',
  ];

  const hydratedExisting = (existingSkillManifest || []).map(s => {
    if (!forceRehydrate && s.heading && Array.isArray(s.triggers) && s.triggers.length > 0) return s;
    const abs = path.join(SKILLS_ROOT, s.path.replace(/^skills\//, ''));
    let heading = forceRehydrate ? '' : (s.heading || '');
    let triggers = new Set(forceRehydrate ? [] : (s.triggers || []));
    try {
      const body = fs.readFileSync(abs, 'utf-8');
      // Find the first Markdown heading OUTSIDE code fences. Prefer the first
      // # or ## encountered. Bash/shell comments inside code blocks like
      // "# Check for …" are NOT headings and must be ignored.
      if (!heading) {
        const lines = body.split('\n');
        let inFence = false;
        for (const ln of lines) {
          if (/^```/.test(ln)) { inFence = !inFence; continue; }
          if (inFence) continue;
          const m = ln.match(/^(#{1,3})\s+(.+)$/);
          if (m) { heading = m[2].trim(); break; }
        }
        if (!heading) heading = s.id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
      // Seed triggers from title
      for (const w of heading.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []) {
        if (!STOP_GENERIC.has(w)) triggers.add(w);
      }
      // Scan first 2000 chars for domain keywords
      const snippet = body.slice(0, 2000).toLowerCase();
      for (const kw of DOMAIN_KW) {
        if (snippet.includes(kw)) triggers.add(kw);
        if (triggers.size >= 12) break;
      }
      // Also add filename-derived words (e.g. "stack-a-nextjs-supabase-saas" → stack,a,nextjs,supabase,saas)
      for (const w of s.id.split(/[-_]/)) {
        if (w.length >= 3 && !STOP_GENERIC.has(w)) triggers.add(w);
        if (triggers.size >= 14) break;
      }
    } catch {
      if (!heading) heading = s.id;
    }
    return { ...s, heading, triggers: [...triggers].slice(0, 12) };
  });

  const mergedSkills = mergeManifests(hydratedExisting, skills, SKILLS_ROOT);

  // Strip pre-existing Skill Library block(s). A previously-compacted body
  // may have multiple blocks from past runs. Find the FIRST occurrence and
  // truncate from there — everything after is regenerated.
  const firstSkillLib = finalRemaining.search(/(^|\n)##\s+Skill Library\b/);
  const cleanBody = firstSkillLib >= 0 ? finalRemaining.slice(0, firstSkillLib) : finalRemaining;

  const coreBody = cleanBody.trimEnd() + '\n' + renderSkillLibraryBlock(mergedSkills, agent);

  // Only write skill files for freshly-extracted skills (existing ones are
  // already on disk from prior runs).
  const skillFiles = skills.map(s => ({
    path: path.join(SKILLS_ROOT, s.path.replace(/^skills\//, '')),
    content: s.body.endsWith('\n') ? s.body : s.body + '\n',
  }));

  // Compact manifest covers the UNION of existing + fresh; the LLM reads
  // triggers from the Skill Library block in the body, not from frontmatter.
  const skillManifest = mergedSkills.map(s => ({
    id: s.id,
    path: s.path,
    lines: s.lines,
  }));

  const newFrontmatter = {
    ...originalFrontmatter,
    skills: skillManifest,
    compactor: {
      version: 1,
      budget_lines: budgetLines,
      budget_chars: budgetChars,
      last_compacted: new Date().toISOString(),
      original_sha: sha256(originalBody).slice(0, 16),
      original_lines: originalBody.split('\n').length,
      original_chars: originalBody.length,
    },
  };

  return { coreBody, skillFiles, newFrontmatter, mergedSkills };
}

// Write artifacts to disk — used for --write and --staging
export function writeArtifacts({ agentPath, newFrontmatter, coreBody, skillFiles, mode }) {
  const isStaging = mode === 'staging';
  const fullText = matter.stringify(coreBody, newFrontmatter);

  if (isStaging) {
    const stagingDir = path.resolve(process.cwd(), '.compactor-staging');
    if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });
    const agentBasename = path.basename(agentPath);
    const coreStagePath = path.join(stagingDir, agentBasename);
    atomicWriteText(coreStagePath, fullText);
    const written = [coreStagePath];
    for (const sf of skillFiles) {
      const rel = path.relative(SKILLS_ROOT, sf.path);
      const stagePath = path.join(stagingDir, 'skills', rel);
      atomicWriteText(stagePath, sf.content);
      written.push(stagePath);
    }
    return { mode: 'staging', written };
  }

  // Real write: skills first, then core (so a core-only read sees valid references)
  const written = [];
  for (const sf of skillFiles) {
    atomicWriteText(sf.path, sf.content);
    written.push(sf.path);
  }
  atomicWriteText(agentPath, fullText);
  written.push(agentPath);
  return { mode: 'write', written };
}
