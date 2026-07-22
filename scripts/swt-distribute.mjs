#!/usr/bin/env node
// SWT rule distributor — turns the FAQ brain into IMPLEMENTED training.
// For every gap-FAQ it: (1) derives a concrete rule + its owning agent(s) + gate,
// (2) writes the rule into the owning agent's .md (managed section — the agent now
// does it by default), (3) maintains the team-wide enforced-rules digest grouped by
// concern, (4) queues rules whose cited gate doesn't actually exist (mechanization
// gaps). Idempotent + deduped + frontmatter-validated + auto-rollback on corruption.
//
// Run standalone to backfill:  node scripts/swt-distribute.mjs
// Imported by swt-train-loop.mjs to run each cycle.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HOME = process.env.HOME
const BRAIN = path.join(HOME, '.claude/memory/patterns/good/shopify-website-faq-brain.md')
const DIGEST = path.join(HOME, '.claude/memory/patterns/good/shopify-website-trained-rules.md')
const PACKS_DIR = path.join(HOME, '.claude/memory/patterns/good/swt-rules') // deep per-agent rule packs (surface→concern)
// SWT_AGENTS_DIR lets the regression test drive updateAgent against a temp dir
const AGENTS_DIR = process.env.SWT_AGENTS_DIR || path.join(HOME, '.claude/agents')
const HERE = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath: repo path has a space
const REPO = path.join(HERE, '..')
const GATE_GAPS = path.join(HERE, 'swt-train/gate-gaps.md')
const TODAY = () => new Date().toISOString().slice(0, 10)

// The ~9 granular, hardcoded gates whose checks actually BLOCK a specific pattern (audited 2026-06-27):
// a rule citing one of these is mechanically ENFORCED. Every other gate is broad/heuristic/proxy, so
// its rules are prompt+retrieval GUIDELINES (best-effort), not hard guarantees. Honest labelling.
const ENFORCING_GATES = new Set(['#2', '#6', '#13', '#16', '#20', '#22', '#28', '#36', '#37', '#38'])
const isEnforced = (gate) => !!gate && ENFORCING_GATES.has(gate)

const KNOWN_AGENTS = [
  'atrium', 'compass', 'drape', 'ink', 'beacon', 'stitch', 'loom', 'conduit',
  'lattice', 'keystone', 'porter', 'mantle', 'lumen', 'onyx',
]
// 39 gates (loved names, stable numbers; +8: 0.6/20/37/38/39/40/41/42; retired 4/15/17/21/26/32/33/34).
// #20 class-d-visual — the Class-D micro-change Lens evidence gate (2026-07-18 visual-QA-gap audit).
const KNOWN_GATES = new Set([
  '#0.4', '#0.5', '#0.6', '#1', '#2', '#3', '#5', '#6', '#7', '#8', '#9', '#10',
  '#11', '#12', '#13', '#14', '#16', '#18', '#19', '#20', '#22', '#23', '#24',
  '#25', '#27', '#28', '#29', '#30', '#35', '#36', '#37', '#38', '#39', '#40', '#41', '#42', '#44',
])

// ---- parse the FAQ brain into structured entries ----
export function parseFaqs() {
  if (!fs.existsSync(BRAIN)) return []
  const txt = fs.readFileSync(BRAIN, 'utf8')
  const out = []
  const re = /^### FAQ-(\d{4}) · ([^·]+?) · (.+)$/gm
  let m
  const idx = []
  while ((m = re.exec(txt))) idx.push({ at: m.index, id: m[1], concern: m[2].trim(), surface: m[3].trim() })
  for (let i = 0; i < idx.length; i++) {
    const block = txt.slice(idx[i].at, i + 1 < idx.length ? idx[i + 1].at : undefined)
    const g = (label) => {
      const mm = block.match(new RegExp(`\\*\\*${label}:\\*\\* ([\\s\\S]*?)(?=\\n\\*\\*|\\n### |\\n## |$)`))
      return mm ? mm[1].replace(/\s+/g, ' ').trim() : ''
    }
    out.push({
      id: idx[i].id, concern: idx[i].concern, surface: idx[i].surface,
      gap: g('Gap'), solution: g('Solution'), autofix: g('Auto-fix'),
    })
  }
  return out
}

// Out-of-team strategists that FAQ solutions reference → the TEAM agent(s) that actually execute
// their rules. Without this, a `sequence`/`ecom-cro`/`orbit` rule falls through and gets laundered
// onto whoever is named next (audit 2026-06-27: 77 FAQs mis-filed this way).
const STRATEGIST_MAP = {
  sequence: ['conduit', 'ink'], 'ecom-cro': ['porter', 'loom'], catalyst: ['atrium'],
  orbit: ['conduit'], decoder: ['drape'], merch: ['ink'], spark: ['ink'],
}

// ---- derive owners + gate + a one-line rule from a FAQ ----
export function deriveRule(faq) {
  const sol = faq.solution.toLowerCase()
  const head = sol.slice(0, 60)
  const tagged = `${faq.solution} ${faq.autofix || ''}`
  // PRIMARY = team agents named in the head; CO-OWNERS = any team agent named anywhere in the
  // solution (recovers lattice/stitch credit lost to the first-named builder). Head-first ordering
  // so the cap keeps the primary owner.
  const headAgents = KNOWN_AGENTS.filter((a) => new RegExp(`\\b${a}\\b`).test(head))
  const allAgents = KNOWN_AGENTS.filter((a) => new RegExp(`\\b${a}\\b`).test(sol))
  let owners = [...new Set([...headAgents, ...allAgents])]
  // section-reuse / section-consistency is stitch's mandate regardless of who is named first
  if (/#23\b|#19\b|section[- ]reuse|section[- ]consistency/i.test(tagged) && !owners.includes('stitch')) owners.push('stitch')
  // no team agent in the head → map an out-of-team strategist to its executing team agent(s)
  if (headAgents.length === 0) {
    for (const [strat, team] of Object.entries(STRATEGIST_MAP)) {
      if (new RegExp(`\\b${strat}\\b`).test(head)) { owners = [...new Set([...owners, ...team])]; break }
    }
  }
  if (owners.length === 0) owners = ['atrium']
  owners = owners.slice(0, 3) // cap multi-owner spread; head-first ordering keeps the primary
  const gateM = tagged.match(/#\d+(?:\.\d+)?/)
  const gate = gateM ? gateM[0] : ''
  // rule body = the directive — strip a leading "owner · " then a leading "#gate name —/·/: " preamble
  let body = faq.solution.replace(/\s+/g, ' ').trim()
  body = body.replace(/^([a-z]+(?:[/+,&\s]+[a-z]+)*)\s*·\s*/i, (mm, names) => {
    const toks = names.split(/[/+,&\s]+/).filter(Boolean)
    return toks.every((t) => KNOWN_AGENTS.includes(t.toLowerCase())) ? '' : mm
  })
  body = body.replace(/^#\d[\w.\-/+ ]*?\s*[—·:]\s*/, '').trim()
  if (body.length > 200) body = body.slice(0, 197) + '…'
  return { owners, gate, concern: faq.concern, surface: faq.surface, gap: faq.gap, body, id: faq.id }
}

function dedupeKey(r) {
  return `${r.concern}|${r.surface}|${r.gap.slice(0, 50).toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

// ---- digest: full enforced rule set grouped by concern → owner ----
function writeDigest(rules) {
  const byConcern = {}
  const seen = new Set()
  for (const r of rules) {
    const k = dedupeKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    byConcern[r.concern] ||= {}
    for (const o of r.owners) {
      byConcern[r.concern][o] ||= []
      byConcern[r.concern][o].push(r)
    }
  }
  const L = [
    '# Shopify Website Team — Trained Rules (enforced defaults)',
    '',
    '> Auto-distributed from [[shopify-website-faq-brain]] by `swt-train-loop`. The IMPLEMENTATION of every',
    '> gap learning: grouped by design concern → owning agent, deduped. Load it; the cited gate enforces it.',
    `> **${seen.size} rules across ${Object.keys(byConcern).length} concerns.** Updated: ${new Date().toISOString().slice(0, 10)}.`,
    '',
  ]
  for (const concern of Object.keys(byConcern).sort()) {
    L.push(`## ${concern}`, '')
    for (const owner of Object.keys(byConcern[concern]).sort()) {
      L.push(`### owner: ${owner}`)
      for (const r of byConcern[concern][owner]) {
        L.push(`- (${r.surface}) ${r.body}${r.gate ? `  \`${r.gate}\`` : ''}`)
      }
      L.push('')
    }
  }
  fs.writeFileSync(DIGEST, L.join('\n'))
  return seen.size
}

// deduped rules this agent owns
function ownedRules(agentId, rules) {
  const seen = new Set(); const owned = []
  for (const r of rules) {
    if (!r.owners.includes(agentId)) continue
    const k = dedupeKey(r)
    if (seen.has(k)) continue
    seen.add(k); owned.push(r)
  }
  return owned
}

// ---- agent files: managed section = LOAD PROTOCOL (point at the surface-scoped pack + memory_search),
// not a raw rule dump. The full owned rule set lives in the per-agent pack (writeAgentPacks). ----
export function updateAgent(agentId, rules) {
  const file = path.join(AGENTS_DIR, `${agentId}.md`)
  if (!fs.existsSync(file)) return false
  const original = fs.readFileSync(file, 'utf8')
  if (!original.startsWith('---')) return false // not a valid agent file — skip

  const owned = ownedRules(agentId, rules)
  if (owned.length === 0) return false
  const surfaces = [...new Set(owned.map((r) => r.surface))].sort()
  const enf = owned.filter((r) => isEnforced(r.gate))
  // teaser: up to 5 gate-ENFORCED rules spanning distinct concerns (the always-on highest-leverage set)
  const tSeen = new Set(); const teasers = []
  for (const r of enf) { if (tSeen.has(r.concern)) continue; tSeen.add(r.concern); teasers.push(r); if (teasers.length >= 5) break }

  const lines = [
    '## 🎓 SWT Trained Defaults (auto-maintained by swt-train-loop — do not hand-edit between markers)',
    '<!-- SWT-TRAINED:START -->',
    `You own **${owned.length} trained rules** (${enf.length} gate-ENFORCED) across ${surfaces.length} surfaces, distilled from the [[shopify-website-faq-brain]] — the team's accumulated gap→fix learnings.`,
    '',
    `**Before building any surface:** (1) open your rule pack \`~/.claude/memory/patterns/good/swt-rules/${agentId}.md\` and read the \`## surface: <the surface you're building>\` section; (2) run \`memory_search("<your task>")\`. Treat \`[ENFORCED]\` rules as HARD requirements (a gate blocks them) and \`[guideline]\` rules as strong defaults. Do NOT bulk-load the 12k-line faq-brain — use the pack (scoped) + memory_search (semantic) instead.`,
    `Surfaces you have rules for: ${surfaces.join(', ')}.`,
    '',
    '**Always-on (highest-leverage, gate-enforced):**',
  ]
  if (teasers.length) for (const r of teasers) lines.push(`- **${r.concern}** (${r.surface}): ${r.body}${r.gate ? ` \`${r.gate}\`` : ''}`)
  else lines.push('_(your rules are guideline-level — load the pack for the full set)_')
  lines.push('<!-- SWT-TRAINED:END -->')
  const section = lines.join('\n')

  let updated
  if (/<!-- SWT-TRAINED:START -->[\s\S]*?<!-- SWT-TRAINED:END -->/.test(original)) {
    // replace the whole managed block (heading line + markers).
    // MUST use a replacer FUNCTION: a string replacement makes JS interpret `$&`, `$\``, `$'`
    // and `$1` inside `section` as replacement patterns. A rule body containing "never hardcode
    // `$`" (mantle #28) hit `$\`` and spliced the ENTIRE preceding file into the managed block —
    // silently, since markers stayed balanced and the file only GREW. See HYG-1.
    updated = original.replace(
      /## 🎓 SWT Trained Defaults[\s\S]*?<!-- SWT-TRAINED:END -->/,
      () => section,
    )
  } else {
    updated = original.replace(/\s*$/, '') + '\n\n' + section + '\n'
  }
  // validate: frontmatter intact + non-empty + markers balanced → else rollback (don't write)
  if (
    !updated.startsWith('---') ||
    updated.length < original.length * 0.8 ||
    (updated.match(/SWT-TRAINED:START/g) || []).length !== 1 ||
    (updated.match(/SWT-TRAINED:END/g) || []).length !== 1
  ) {
    return false
  }
  // validate: the managed block we wrote is EXACTLY the section we built. Catches any
  // replacement-pattern mangling (the HYG-1 class) that the checks above cannot see, because
  // corruption there splices content IN rather than removing it.
  const writtenBlock = updated.match(/## 🎓 SWT Trained Defaults[\s\S]*?<!-- SWT-TRAINED:END -->/)
  if (!writtenBlock || writtenBlock[0] !== section) return false
  if (updated !== original) fs.writeFileSync(file, updated)
  return true
}

// ---- gate-gap queue: rules claiming a gate that isn't in the registry ----
function writeGateGaps(rules) {
  const gaps = []
  const seen = new Set()
  for (const r of rules) {
    if (!r.gate) continue
    if (KNOWN_GATES.has(r.gate)) continue
    const k = r.gate + r.concern
    if (seen.has(k)) continue
    seen.add(k)
    gaps.push(`- \`${r.gate}\` (cited by FAQ-${r.id}, ${r.concern}/${r.surface}) — gate not in registry; mechanize or correct the citation.`)
  }
  const L = [
    '# SWT gate-gap queue',
    '> Rules that cite an enforcing gate which does NOT exist in the toolkit registry — either build it or fix the citation.',
    `> ${gaps.length} open. Updated ${new Date().toISOString().slice(0, 10)}.`,
    '',
    ...(gaps.length ? gaps : ['_None — every cited gate exists in the registry._']),
    '',
  ]
  fs.writeFileSync(GATE_GAPS, L.join('\n'))
  return gaps.length
}

// ---- per-agent rule packs: EVERY rule the agent owns, grouped surface → concern, gate-tagged.
// This is the deep training the agent loads (scoped to the surface it's building). ----
function writeAgentPacks(rules) {
  fs.mkdirSync(PACKS_DIR, { recursive: true })
  const counts = {}
  for (const agentId of KNOWN_AGENTS) {
    const owned = ownedRules(agentId, rules)
    counts[agentId] = owned.length
    if (owned.length === 0) continue
    const bySurface = {}
    for (const r of owned) { (bySurface[r.surface] ||= {})[r.concern] ||= []; bySurface[r.surface][r.concern].push(r) }
    const enf = owned.filter((r) => isEnforced(r.gate)).length
    const L = [
      `# SWT Rule Pack — ${agentId}`,
      '',
      `> Auto-distributed from [[shopify-website-faq-brain]] by \`swt-distribute\`. EVERY rule **${agentId}** owns,`,
      '> grouped **surface → concern**. Load the `## surface: <X>` section for the surface you are building.',
      '> `[ENFORCED]` = a gate mechanically blocks it · `[guideline]` = apply as a strong default.',
      `> **${owned.length} rules** (${enf} enforced · ${owned.length - enf} guideline) across ${Object.keys(bySurface).length} surfaces. Updated: ${TODAY()}.`,
      '',
    ]
    for (const surface of Object.keys(bySurface).sort()) {
      L.push(`## surface: ${surface}`, '')
      for (const concern of Object.keys(bySurface[surface]).sort()) {
        L.push(`### ${concern}`)
        for (const r of bySurface[surface][concern]) {
          L.push(`- ${isEnforced(r.gate) ? '[ENFORCED]' : '[guideline]'} ${r.body}${r.gate ? ` \`${r.gate}\`` : ''}`)
        }
        L.push('')
      }
    }
    fs.writeFileSync(path.join(PACKS_DIR, `${agentId}.md`), L.join('\n'))
  }
  return counts
}

// ---- gate-coverage map: of all unique rules, which are gate-ENFORCED vs guideline. Honesty layer. ----
function writeGateCoverage(rules) {
  const seen = new Set(); const uniq = []
  for (const r of rules) { const k = dedupeKey(r); if (seen.has(k)) continue; seen.add(k); uniq.push(r) }
  const byGate = {}; let enf = 0, gl = 0, nogate = 0
  for (const r of uniq) {
    const key = r.gate || '(none)'
    byGate[key] = (byGate[key] || 0) + 1
    if (!r.gate) { nogate++; gl++ } else if (isEnforced(r.gate)) enf++; else gl++
  }
  const L = [
    '# SWT Rule → Gate Coverage Map',
    '',
    '> Of the trained rules, which are MECHANICALLY ENFORCED by a hardcoded gate vs prompt/retrieval-only.',
    `> Enforcing gates (granular hardcoded checks): ${[...ENFORCING_GATES].sort().join(' ')}.`,
    `> **${uniq.length} unique rules — ${enf} \`[ENFORCED]\` · ${gl} \`[guideline]\`** (${nogate} cite no gate). Updated: ${TODAY()}.`,
    '',
    '## by gate (rule count · status)',
    '',
    ...Object.keys(byGate).sort((a, b) => byGate[b] - byGate[a]).map((g) =>
      `- \`${g}\` — ${byGate[g]} rules · ${g === '(none)' ? 'no gate (guideline)' : isEnforced(g) ? 'ENFORCED' : 'guideline'}`),
    '',
  ]
  fs.writeFileSync(path.join(PACKS_DIR, '_gate-coverage.md'), L.join('\n'))
  return { unique: uniq.length, enforced: enf, guideline: gl }
}

// ---- semantic re-index so memory_search retrieves the new rules at runtime (the depth channel).
// Guarded: Ollama/MCP may be down — log + continue (agents fall back to the static pack). ----
function reindexSemantic(full = false) {
  try {
    const args = [path.join(REPO, 'src/intelligence/reindex.mjs')]
    if (full) args.push('--full')
    const r = spawnSync('node', args, { encoding: 'utf8', timeout: 180000, cwd: REPO })
    if (r.status === 0) return { ok: true, out: (r.stdout || '').trim().split('\n').filter(Boolean).pop() || 'reindexed' }
    return { ok: false, out: (r.stderr || r.stdout || 'reindex failed').toString().slice(0, 160) }
  } catch (e) { return { ok: false, out: e.message } }
}

export function distribute() {
  const faqs = parseFaqs()
  const rules = faqs.map(deriveRule)
  const ruleCount = writeDigest(rules)
  const packCounts = writeAgentPacks(rules)
  let agentsUpdated = 0
  for (const a of KNOWN_AGENTS) if (updateAgent(a, rules)) agentsUpdated++
  const gateGaps = writeGateGaps(rules)
  const coverage = writeGateCoverage(rules)
  // keep the semantic index fresh so the new rules are retrievable (skip with SWT_REINDEX=0).
  const reindex = process.env.SWT_REINDEX === '0' ? { ok: null, out: 'skipped' } : reindexSemantic(false)
  return { faqs: faqs.length, rules: ruleCount, agentsUpdated, gateGaps, packCounts, coverage, reindex }
}

// run standalone
if (process.argv[1] && process.argv[1].endsWith('swt-distribute.mjs')) {
  const r = distribute()
  console.log(`distributed: ${r.faqs} FAQs → ${r.rules} deduped rules · ${r.agentsUpdated}/14 agents trained · ${r.gateGaps} gate-gaps`)
  console.log(`coverage: ${r.coverage.enforced} ENFORCED · ${r.coverage.guideline} guideline (of ${r.coverage.unique} unique)`)
  const packs = Object.entries(r.packCounts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}:${n}`).join(' ')
  console.log(`packs: ${packs}`)
  console.log(`reindex: ${r.reindex.ok === null ? 'skipped' : r.reindex.ok ? 'OK — ' + r.reindex.out : 'FAILED (Ollama down?) — ' + r.reindex.out}`)
}
