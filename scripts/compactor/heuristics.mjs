// Heuristic splitters for the agent compactor.
// Each heuristic receives the raw body as an array of lines + ctx { agent, budget }
// and returns { skills: [...], remainingLines: [...] } where `skills` is a list
// of candidate extractions and `remainingLines` is what stays in the core.
//
// All heuristics are pure and deterministic — no LLM, no network, no side effects.
// Apply them in order via `pickPlan(body, ctx)`; stop when body <= budget.

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','at','for','with','by',
  'is','are','was','were','be','been','being','this','that','these','those',
  'it','its','as','from','into','over','under','all','any','each','every',
  'you','your','we','our','their','they','them','he','she','him','her',
  'do','does','did','done','will','would','should','can','could','may',
  'not','no','yes','if','else','when','while','then','than','so','such',
  'have','has','had','having','here','there','which','what','who','how',
]);

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

function sha8(text) {
  // Tiny non-crypto hash — deterministic, 8-hex-chars, good enough for filenames
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function extractTriggers(headingText, firstParagraph, rawBody) {
  const triggers = new Set();
  // (a) heading words
  for (const w of headingText.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []) {
    if (!STOP_WORDS.has(w)) triggers.add(w);
  }
  // (b) first-paragraph nouns (approximated: words 4+ chars, not stop-words)
  for (const w of (firstParagraph || '').toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (!STOP_WORDS.has(w)) triggers.add(w);
    if (triggers.size >= 12) break;
  }
  // (c) back-ticked identifiers in the first 10 lines of the raw body
  const topSlice = rawBody.split('\n').slice(0, 10).join('\n');
  for (const m of topSlice.matchAll(/`([A-Za-z_][\w./-]{2,})`/g)) {
    triggers.add(m[1].toLowerCase());
    if (triggers.size >= 16) break;
  }
  return [...triggers].slice(0, 12);
}

// ── Section parser ───────────────────────────────────────────────────────────
// Splits a body into top-level sections. Optionally `depth` controls which
// heading level partitions:
//   depth=2  → partition at H2 only (default). H3/H4 are kept INSIDE their H2.
//   depth=3  → partition at both H2 and H3.
// Fenced code blocks are respected so we don't misparse '```## foo' inside
// examples.
function parseSections(bodyLines, { depth = 2 } = {}) {
  const sections = [];
  let current = { heading: '(preamble)', headingLevel: 0, startLine: 0, lines: [] };
  let inFence = false;
  const maxDepth = depth;
  const headingRe = depth === 3 ? /^(#{2,3})\s+(.+)$/ : /^(#{2})\s+(.+)$/;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const fence = line.match(/^```/);
    if (fence) inFence = !inFence;

    if (!inFence) {
      const h = line.match(headingRe);
      if (h && h[1].length <= maxDepth) {
        current.endLine = i - 1;
        current.text = current.lines.join('\n');
        sections.push(current);
        current = {
          heading: h[2].trim(),
          headingLevel: h[1].length,
          startLine: i,
          lines: [line],
        };
        continue;
      }
    }
    current.lines.push(line);
  }
  current.endLine = bodyLines.length - 1;
  current.text = current.lines.join('\n');
  sections.push(current);
  return sections;
}

function firstParagraph(sectionLines) {
  // Skip the heading line, then gather until a blank line or end
  const out = [];
  for (let i = 1; i < sectionLines.length; i++) {
    const ln = sectionLines[i];
    if (ln.trim() === '' && out.length > 0) break;
    if (ln.trim() === '') continue;
    if (ln.startsWith('#')) break;
    out.push(ln);
    if (out.join(' ').length > 400) break;
  }
  return out.join(' ').slice(0, 500);
}

// ── H1: topic sections (billing/auth/migration/etc) ─────────────────────────
const H1_PATTERN = /^(billing|auth|authentication|authorization|migration|migrations|testing|tests|deployment|deploy|debugging|debug|design|seo|i18n|internationalization|accessibility|a11y|error[- ]handling|rate[- ]limit|cache|caching|realtime|queue|background[- ]job|cron|stack[- ][a-z-]+|shopify|supabase|nextjs|next\.js|stripe|dodo|vercel|flutter|ios|android|polaris)/i;

function h1TopicSections(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const skills = [];

  for (const s of sections) {
    if (s.headingLevel === 2 && H1_PATTERN.test(s.heading) && s.lines.length >= 8) {
      const slug = slugify(s.heading);
      const fp = firstParagraph(s.lines);
      const triggers = extractTriggers(s.heading, fp, s.text);
      skills.push({
        id: slug,
        heading: s.heading,
        path: `skills/${ctx.agent}/${slug}.md`,
        triggers,
        body: s.text,
        lines: s.lines.length,
        source: 'H1',
      });
      // Leave a 1-line pointer
      keptLines.push(`<!-- skill: ${slug} — see skills/${ctx.agent}/${slug}.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H2: protocol bloat / "DEEP X patterns" / long rules/standards/phases ─────
// Catches the biggest offenders in practice: "DEEP PRE-BUILD PROTOCOL",
// "DEEP TYPESCRIPT PATTERNS", "Premium UI/UX Standards", "Build Phases",
// "Error Handling Rules", "Shopify Extension Build Patterns", etc.
const H2_PATTERN = /\b(deep[- ]?[a-z][a-z- ]*|pre[- ]?build)\s*(protocol|patterns?|rules?|standards?)\b|\b(protocol|checklist|runbook|playbook|workflow|standards?|phases?|rules?|patterns?|guidelines?|self[- ]code[- ]review|self[- ]validation)\b/i;

function h2ProtocolBloat(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const skills = [];

  for (const s of sections) {
    if (s.headingLevel === 2
        && H2_PATTERN.test(s.heading)
        && !/^(your role|first[- ]load manifest|first[- ]load)\b/i.test(s.heading.replace(/\s*\(.*\)$/, ''))
        && s.lines.length > 80) {
      const slug = slugify(s.heading);
      const fp = firstParagraph(s.lines);
      const triggers = extractTriggers(s.heading, fp, s.text);
      skills.push({
        id: slug,
        heading: s.heading,
        path: `skills/${ctx.agent}/${slug}.md`,
        triggers,
        body: s.text,
        lines: s.lines.length,
        source: 'H2',
      });
      // Emit a fence-safe stub: heading + pointer + blank line. No prose
      // excerpt — excerpts were the source of the fence-corruption bug where
      // a sliced-in "```typescript" opened a code block that ate later
      // sections during H3. The pointer is sufficient for the LLM contract.
      keptLines.push(s.lines[0]);
      keptLines.push(`<!-- Full content moved to skills/${ctx.agent}/${slug}.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H2b: any remaining H2 over 150 lines (last-resort bulk extractor) ───────
// Runs only if the earlier heuristics leave the body still oversized.
function h2bBulkLargeSections(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const skills = [];

  for (const s of sections) {
    if (s.headingLevel === 2
        && s.lines.length > 150
        && !/^(your role|first[- ]load manifest|first[- ]load|skill library)\b/i.test(s.heading.replace(/\s*\(.*\)$/, ''))) {
      const slug = slugify(s.heading);
      const fp = firstParagraph(s.lines);
      const triggers = extractTriggers(s.heading, fp, s.text);
      skills.push({
        id: slug,
        heading: s.heading,
        path: `skills/${ctx.agent}/${slug}.md`,
        triggers,
        body: s.text,
        lines: s.lines.length,
        source: 'H2b',
      });
      // Fence-safe stub (see h2ProtocolBloat for rationale).
      keptLines.push(s.lines[0]);
      keptLines.push(`<!-- Full content moved to skills/${ctx.agent}/${slug}.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H3: large example blocks ────────────────────────────────────────────────
function h3LargeExamples(body, ctx) {
  const lines = body.split('\n');
  const out = [];
  const skills = [];

  // Safety rails:
  //   1. A fence block is only extracted if BOTH opening and closing fences
  //      are found. An unclosed opening fence is left in place untouched —
  //      never treated as a giant block swallowing later content.
  //   2. If a candidate block spans an H2/H3 heading, the block is skipped
  //      (headings inside code are very rare; an H2 inside a 100-line fence
  //      almost certainly means a prior heuristic corrupted the fence pairing).
  //   3. Blocks are capped at 500 lines to prevent one runaway block from
  //      exceeding budget elsewhere.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceOpen = line.match(/^```([\w.-]*)\s*$/);
    if (!fenceOpen) {
      out.push(line);
      i++;
      continue;
    }

    // Find the close fence
    let j = i + 1;
    let crossedHeading = false;
    while (j < lines.length) {
      if (/^```\s*$/.test(lines[j])) break;
      if (/^#{2,3}\s+/.test(lines[j])) crossedHeading = true;
      j++;
    }
    const closed = j < lines.length;

    if (!closed || crossedHeading) {
      // Unclosed fence or block spans a heading — refuse to touch it. Leave
      // all lines as-is; they'll be preserved in the core body verbatim.
      out.push(line);
      i++;
      continue;
    }

    const block = lines.slice(i, j + 1);
    if (block.length > 40 && block.length <= 500) {
      const lang = fenceOpen[1] || 'text';
      const text = block.join('\n');
      const hash = sha8(text);
      const head = lines.slice(Math.max(0, i - 3), i).join(' ').slice(-120).trim() || lang;
      const triggers = extractTriggers(head + ' ' + lang, '', text);
      skills.push({
        id: `ex-${hash}`,
        heading: `Example: ${lang}`,
        path: `skills/${ctx.agent}/examples/${hash}.md`,
        triggers,
        body: `# Example (${lang})\n\nExtracted from ${ctx.agent}.md.\n\n${text}\n`,
        lines: block.length,
        source: 'H3',
      });
      out.push(`<!-- example: skills/${ctx.agent}/examples/${hash}.md (${lang}, ${block.length} lines) -->`);
      i = j + 1;
    } else {
      out.push(...block);
      i = j + 1;
    }
  }

  return { skills, remaining: out.join('\n') };
}

// ── H4: tool-specific H3 subsections ────────────────────────────────────────
const H4_TOOL_PATTERN = /^(shopify|polaris|supabase|next\.?js|stripe|dodo|flutter|ios|android|vercel|railway|resend|sentry|posthog|redis|postgres|sqlite|prisma|drizzle|tailwind|shadcn)\b/i;

function h4ToolSubsections(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines, { depth: 2 });
  const keptLines = [];
  const skillsByTool = new Map();

  // We process H2 sections and pull out H3-level tool blocks within them
  for (const s of sections) {
    if (s.headingLevel !== 2) {
      keptLines.push(...s.lines);
      continue;
    }
    // Walk this section's lines, extracting H3 tool blocks
    const subLines = s.lines;
    let i = 0;
    let inFence = false;
    const sectionOut = [];
    while (i < subLines.length) {
      const ln = subLines[i];
      if (/^```/.test(ln)) inFence = !inFence;
      const h3 = !inFence && ln.match(/^###\s+(.+)$/);
      if (h3 && H4_TOOL_PATTERN.test(h3[1].trim())) {
        // Scan until next H2/H3 or end
        let j = i + 1;
        let inF = false;
        while (j < subLines.length) {
          if (/^```/.test(subLines[j])) inF = !inF;
          if (!inF && /^#{2,3}\s+/.test(subLines[j])) break;
          j++;
        }
        const blockLines = subLines.slice(i, j);
        if (blockLines.length >= 15) {
          const toolMatch = h3[1].match(H4_TOOL_PATTERN);
          const tool = (toolMatch ? toolMatch[1] : h3[1]).toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, '-');
          const bucket = skillsByTool.get(tool) || { lines: [], sources: [] };
          bucket.lines.push(...blockLines);
          bucket.lines.push('');
          bucket.sources.push(h3[1]);
          skillsByTool.set(tool, bucket);
          sectionOut.push(`<!-- tool-guide: ${tool} → skills/${ctx.agent}/tools/${tool}.md (${h3[1]}) -->`);
          i = j;
          continue;
        }
      }
      sectionOut.push(ln);
      i++;
    }
    keptLines.push(...sectionOut);
  }

  const skills = [];
  for (const [tool, bucket] of skillsByTool) {
    const text = bucket.lines.join('\n');
    const triggers = extractTriggers(tool + ' ' + bucket.sources.join(' '), '', text);
    skills.push({
      id: `tool-${tool}`,
      heading: `Tool: ${tool}`,
      path: `skills/${ctx.agent}/tools/${tool}.md`,
      triggers,
      body: `# ${tool}\n\nTool-specific guidance extracted from ${ctx.agent}.md.\n\n${text}\n`,
      lines: bucket.lines.length,
      source: 'H4',
    });
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H5: large pattern catalogs ──────────────────────────────────────────────
function h5PatternCatalogs(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const skills = [];

  for (const s of sections) {
    const numbered = s.lines.filter(l => /^\s*\d+\.\s/.test(l)).length;
    if (s.headingLevel === 2
        && numbered >= 10
        && s.lines.length >= 30
        && !/^(your role|first[- ]load|skill library)\b/i.test(s.heading.replace(/\s*\(.*\)$/, ''))) {
      const slug = `${slugify(s.heading)}-patterns`;
      const fp = firstParagraph(s.lines);
      const triggers = extractTriggers(s.heading, fp, s.text);
      skills.push({
        id: slug,
        heading: s.heading,
        path: `skills/${ctx.agent}/${slug}.md`,
        triggers,
        body: s.text,
        lines: s.lines.length,
        source: 'H5',
      });
      keptLines.push(s.lines[0]);
      keptLines.push(`<!-- ${numbered} patterns moved to skills/${ctx.agent}/${slug}.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H6: appendix / FAQ / antipatterns ───────────────────────────────────────
const H6_PATTERN = /^(appendix|faq|antipatterns?|anti[- ]patterns?|reference|glossary|notes)\b/i;

function h6AppendixFaq(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const refBuckets = [];

  for (const s of sections) {
    if (s.headingLevel === 2 && H6_PATTERN.test(s.heading) && s.lines.length >= 15) {
      refBuckets.push(s);
      keptLines.push(`<!-- ${s.heading} moved to skills/${ctx.agent}/reference.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  const skills = [];
  if (refBuckets.length > 0) {
    const body = refBuckets.map(s => s.text).join('\n\n');
    const triggers = extractTriggers(
      refBuckets.map(s => s.heading).join(' '),
      '',
      body
    );
    skills.push({
      id: 'reference',
      heading: 'Reference',
      path: `skills/${ctx.agent}/reference.md`,
      triggers,
      body,
      lines: refBuckets.reduce((n, s) => n + s.lines.length, 0),
      source: 'H6',
    });
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H7: dated training-archaeology sections ─────────────────────────────────
// Catches stacked-over-time training sections that re-state the same rules in
// slightly different wording. Pattern examples:
//   ## Training 2026-04-11 — Universal protocol enforcement
//   ## Training 2026-04-11 (b) — Auto-sweep + git autonomy
//   ## ★ DEEP TRAINING 2026-04-14 — Semi-auto pattern detection
//   ## TRAINING UPDATE 2026-04-10: Learning System Integration
//   ## ★ STACK A MIGRATION 2026-04-10
// These are archaeological record. The agent still needs access to them (they
// may contain the most recent protocol), so they go to skills/<agent>/
// training-history.md as a single bundle — searchable, loadable on demand.
const H7_PATTERN = /\b(training|deep training|training update|stack [a-z] migration)\b[^#]*?\b\d{4}-\d{2}-\d{2}\b|\b★\s*(deep training|stack [a-z] migration|training)\b/i;

function h7DatedTraining(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const buckets = [];

  for (const s of sections) {
    if (s.headingLevel === 2
        && H7_PATTERN.test(s.heading)
        && s.lines.length >= 10) {
      buckets.push(s);
      keptLines.push(`<!-- ${s.heading.slice(0, 80)} moved to skills/${ctx.agent}/training-history.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  const skills = [];
  if (buckets.length > 0) {
    const combined = buckets.map(s => s.text).join('\n\n---\n\n');
    const triggers = extractTriggers(
      'training history protocol update migration',
      '',
      combined,
    );
    skills.push({
      id: 'training-history',
      heading: 'Training history (dated archaeology)',
      path: `skills/${ctx.agent}/training-history.md`,
      triggers: [...new Set(['training', 'history', 'protocol', 'migration', 'update', ...triggers])].slice(0, 12),
      body: `# Training history\n\nArchived training updates for ${ctx.agent}. Load this only when a task references a specific dated protocol or migration.\n\n${combined}\n`,
      lines: buckets.reduce((n, s) => n + s.lines.length, 0),
      source: 'H7',
    });
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── H8: reusable templates + rubrics ─────────────────────────────────────────
// Catches sections that are reference material the agent uses occasionally,
// not every run: retrospective frameworks, report output templates, scoring
// rubrics, maintenance schedules, anti-pattern lists, promotion rules.
const H8_PATTERN = /^(retrospective(\s+framework)?|(training|agent training effectiveness|retrospective)\s*(report(\s*output)?|-\s*\[\w+\]))|(pattern\s+(promotion|quality|scoring)(\s+rules?|\s+rubric)?)|(memory\s+maintenance(\s+schedule)?)|(anti[- ]patterns?\s+\(top\s*\d+\))|(conflict\s+resolution(\s+framework)?)|(high[- ]value\s+training\s+categories)|(knowledge\s+graph\s+maintenance)|(bug\s+clustering)/i;

function h8TemplatesRubrics(body, ctx) {
  const lines = body.split('\n');
  const sections = parseSections(lines);
  const keptLines = [];
  const buckets = [];

  for (const s of sections) {
    if (s.headingLevel === 2
        && H8_PATTERN.test(s.heading)
        && s.lines.length >= 10) {
      buckets.push(s);
      keptLines.push(`<!-- ${s.heading.slice(0, 80)} moved to skills/${ctx.agent}/templates-and-rubrics.md -->`);
      keptLines.push('');
      continue;
    }
    keptLines.push(...s.lines);
  }

  const skills = [];
  if (buckets.length > 0) {
    const combined = buckets.map(s => s.text).join('\n\n---\n\n');
    const triggers = extractTriggers(
      'template rubric framework report schedule',
      '',
      combined,
    );
    skills.push({
      id: 'templates-and-rubrics',
      heading: 'Templates and rubrics',
      path: `skills/${ctx.agent}/templates-and-rubrics.md`,
      triggers: [...new Set(['template', 'rubric', 'framework', 'report', 'schedule', 'retrospective', ...triggers])].slice(0, 12),
      body: `# Templates and rubrics\n\nReference material for ${ctx.agent}: frameworks, output templates, scoring rubrics, schedules. Load when you need to produce a formatted report or apply a scoring rubric.\n\n${combined}\n`,
      lines: buckets.reduce((n, s) => n + s.lines.length, 0),
      source: 'H8',
    });
  }

  return { skills, remaining: keptLines.join('\n') };
}

// ── Plan selection ──────────────────────────────────────────────────────────
// Apply heuristics in order, stop as soon as remaining ≤ budget.
// Returns { plan: [{heuristic, skills}], finalRemaining, finalLines, finalChars }.
export function pickPlan(body, ctx) {
  const { budgetLines, budgetChars, enabledHeuristics = null } = ctx;
  const all = [
    ['H1', h1TopicSections],
    ['H2', h2ProtocolBloat],
    ['H7', h7DatedTraining],
    ['H8', h8TemplatesRubrics],
    ['H4', h4ToolSubsections],
    ['H5', h5PatternCatalogs],
    ['H6', h6AppendixFaq],
    ['H3', h3LargeExamples],
    ['H2b', h2bBulkLargeSections],
  ];
  const pipeline = enabledHeuristics
    ? all.filter(([name]) => enabledHeuristics.includes(name))
    : all;

  const plan = [];
  const allSkills = [];
  let current = body;

  const measure = (text) => ({
    lines: text.split('\n').length,
    chars: text.length,
  });

  let stats = measure(current);

  const seenIds = new Set();
  for (const [name, fn] of pipeline) {
    if (stats.lines <= budgetLines && stats.chars <= budgetChars) break;
    const { skills, remaining } = fn(current, ctx);
    // Dedupe by ID (hash for examples, slug for sections). Two skills with
    // the same ID are guaranteed by construction to have identical content
    // (content-hash for examples, unique slug per section). Do NOT dedupe by
    // heading — multiple "Example: yaml" blocks are distinct content.
    const novelSkills = skills.filter(s => {
      if (!s.id) return true;
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });
    if (novelSkills.length === 0) continue;
    plan.push({ heuristic: name, skills: novelSkills });
    allSkills.push(...novelSkills);
    current = remaining;
    stats = measure(current);
  }

  return {
    plan,
    skills: allSkills,
    finalRemaining: current,
    finalLines: stats.lines,
    finalChars: stats.chars,
  };
}

export { slugify, sha8, parseSections };
