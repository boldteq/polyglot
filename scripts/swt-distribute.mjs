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
import { blocksAreIsolated } from '../src/lib/agentBlocks.mjs'
import { assertsUncitedMechanism } from './lib/shopify-mechanism.mjs'

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

// The granular, hardcoded gates whose checks actually BLOCK a specific pattern (audited 2026-06-27):
// a rule citing one of these is mechanically ENFORCED. Every other gate is broad/heuristic/proxy, so
// its rules are prompt+retrieval GUIDELINES (best-effort), not hard guarantees. Honest labelling.
//
// 2026-07-23 — the set was INVERTED against reality. It omitted every gate that was actually failing on
// the real client build (#3 editability 67 blockers, #8 design-tokens 437, #9 consistency 3) while
// including #28 translations, whose check-locale-completeness.mjs:6 explicitly EXCLUDES *.schema.json —
// so the one trained rule about schema `t:` keys cited a gate that structurally cannot see them and
// reported pass:true. 145 rules citing #3 were distributed to 14 agents labelled [guideline]. Added:
// #3/#8/#9 (granular blocking greps), #43 rule-pack (a JSON rule IS a hardcoded block), and the two
// new authoring gates #47 schema-authoring / #48 repo-hygiene.
const ENFORCING_GATES = new Set([
  '#2', '#3', '#6', '#8', '#9', '#13', '#16', '#20', '#22', '#28',
  '#36', '#37', '#38', '#43', '#47', '#48', '#49',
])
const isEnforced = (gate) => !!gate && ENFORCING_GATES.has(gate)

const KNOWN_AGENTS = [
  'atrium', 'compass', 'drape', 'ink', 'beacon', 'stitch', 'loom', 'conduit',
  'lattice', 'keystone', 'porter', 'mantle', 'lumen', 'onyx',
]
// Every gate number in theme-gates.mjs GATES[] (loved names, stable numbers; retired 4/15/17/21/26/32/33/34).
// A citation outside this set is filed as a mechanization gap, so a MISSING entry manufactures a fake gap:
// #43/#45/#46 shipped without being added here, which is why gate-gaps.md read "0 open" while real
// citations had nowhere to land (2026-07-23 audit). #47/#48 are the new authoring gates.
const KNOWN_GATES = new Set([
  '#0.4', '#0.5', '#0.6', '#1', '#2', '#3', '#5', '#6', '#7', '#8', '#9', '#10',
  '#11', '#12', '#13', '#14', '#16', '#18', '#19', '#20', '#22', '#23', '#24',
  '#25', '#27', '#28', '#29', '#30', '#35', '#36', '#37', '#38', '#39', '#40', '#41', '#42', '#44',
  '#43', '#45', '#46', '#47', '#48', '#49',
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
// ── Shopify doc citation injector (2026-07-24) ───────────────────────────────
// THE GAP: 2,491 pack rules assert a Shopify platform behaviour and 0 cited a doc (0.0%), so no
// reader (and no gate) could tell a doc-true rule from model-recall. Rather than ask the generator
// to emit URLs — which invites a fabricated-but-authoritative-looking link (a real risk: the
// plausible `api/liquid/filters/t` is a 404) — this maps a rule's own Shopify tokens to a doc URL
// **verified live on 2026-07-24**. Deterministic, auditable, and incapable of inventing a page.
//
// DIVISION OF LABOUR vs the Dev MCP (handbook §5): this map = PROVENANCE for STORED pack rules (lets a
// rule name its shopify.dev source). It is NOT the anti-hallucination gate — that is the live
// `@shopify/dev-mcp` validator wired as gates #49 (Liquid `validate_theme`) + #51 (GraphQL
// `validate_graphql_codeblocks`), which judge GENERATED build code against the real schema. Both are
// kept, clearly scoped: cite the rule here, validate the code there. Neither replaces the other.
// Order matters: first match wins, so the most specific token is listed first.
const DOC_CITES = [
  [/visible_if/i, 'shopify.dev/docs/storefronts/themes/architecture/settings#conditional-settings'],
  [/placeholder_svg_tag/i, 'shopify.dev/docs/api/liquid/filters/placeholder_svg_tag'],
  [/image_url|image_tag/i, 'shopify.dev/docs/api/liquid/filters/image_url'],
  [/link\.current|child_active|linklists?\b/i, 'shopify.dev/docs/api/liquid/objects/link'],
  [/enabled_on|disabled_on|max_blocks|\bpresets?\b|\{%-? *schema/i, 'shopify.dev/docs/storefronts/themes/architecture/sections/section-schema'],
  [/color_scheme|text_alignment|image_picker|link_list|inline_richtext|\brichtext\b|range setting|select setting/i, 'shopify.dev/docs/storefronts/themes/architecture/settings/input-settings'],
  [/\.schema\.json|\bt:\s|locale|translat/i, 'shopify.dev/docs/storefronts/themes/architecture/locales'],
  [/settings_schema|section\.settings|block\.settings/i, 'shopify.dev/docs/storefronts/themes/architecture/settings'],
  // Liquid data objects/filters — the dominant uncited signal (metafield/metaobject alone was 898 of
  // the 1,244-rule backlog). All verified live 2026-07-24.
  [/metaobjects?/i, 'shopify.dev/docs/api/liquid/objects/metaobject'], // incl. metaobject_reference
  [/metafields?/i, 'shopify.dev/docs/api/liquid/objects/metafield'],   // incl. metafield_reference
  [/\| *money\b/i, 'shopify.dev/docs/api/liquid/filters/money'],
  [/\| *t\b|\| *translate\b/i, 'shopify.dev/docs/api/liquid/filters/translate'], // the `t` translation filter (NOT filters/t — that 404s)
  [/paginate/i, 'shopify.dev/docs/api/liquid/tags/paginate'],
  // routes / collection / predictive-search / content_for + Liquid tags & AJAX endpoints — the uncited
  // backlog cluster (measured: these mechanisms accounted for the 54 enforced + 99 guideline uncited
  // rules). All URLs verified live on shopify.dev 2026-07-24. Ordered most-specific-first, and BEFORE the
  // broad cart/product matchers, so e.g. `routes.cart_url`→routes and a "recommendations.json for products"
  // rule cites the recommendations endpoint, not the product object. Extending this map (rather than
  // DELETING the rules) is how the backlog drains WITHOUT losing correct-but-uncited knowledge: on the
  // next distribute, deriveRule cites these instead of the D1 gate dropping them as unverifiable recall.
  [/recommendations(\.json|\/products|\b)/i, 'shopify.dev/docs/api/ajax/reference/product-recommendations'],
  [/predictive[_-]?search|\/search\/suggest/i, 'shopify.dev/docs/api/ajax/reference/predictive-search'],
  [/\broutes\.[a-z_]+/i, 'shopify.dev/docs/api/liquid/objects/routes'],
  [/\brequest\.[a-z_]+/i, 'shopify.dev/docs/api/liquid/objects/request'],
  [/\bcollection\.[a-z_]/i, 'shopify.dev/docs/api/liquid/objects/collection'],
  [/content_for_header/i, 'shopify.dev/docs/api/liquid/objects/content_for_header'],
  [/\{%-? *content_for|content_for_layout/i, 'shopify.dev/docs/api/liquid/tags/content_for'],
  [/\{%-? *render\b/i, 'shopify.dev/docs/api/liquid/tags/render'],
  [/\{%-? *sections?\b/i, 'shopify.dev/docs/api/liquid/tags/section'],
  [/\{%-? *style\b|shopify_attributes/i, 'shopify.dev/docs/api/liquid/tags/style'],
  [/\bcart\./i, 'shopify.dev/docs/api/liquid/objects/cart'],
  [/\bproduct\./i, 'shopify.dev/docs/api/liquid/objects/product'],
]
const HAS_CITE = /shopify\.dev|help\.shopify\.com/i
// Append the verified doc for the platform claim this rule makes. No match = no citation: a rule with
// no recognised Shopify token stays honestly uncited rather than getting a vaguely-related link.
export function citeShopify(body) {
  if (!body || HAS_CITE.test(body)) return body
  for (const [re, url] of DOC_CITES) if (re.test(body)) return `${body} [doc: ${url}]`
  return body
}

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
  // cite AFTER the length cap so the doc URL is never the thing that gets truncated away
  body = citeShopify(body)
  // D1 (2026-07-24): provenance is a GATE, not a report. A NEW rule that asserts a Shopify mechanism
  // (schema key / Liquid object / metafield / route) with NO verified citation is model-recall — the
  // measured reason authored themes drifted off spec. citeShopify already appended a [doc:] for every
  // mechanism it recognises, so an uncited one here names a mechanism DOC_CITES can't source → REJECT it
  // (returns null; the caller filters). This stops the uncited backlog from growing. SWT_ALLOW_UNCITED=1
  // opts down for a transition; the rejection is logged so a DOC_CITES gap becomes visible to fill.
  if (assertsUncitedMechanism(body) && process.env.SWT_ALLOW_UNCITED !== '1') {
    if (process.env.SWT_DEBUG === '1') console.warn(`swt-distribute: DROP uncited mechanism rule (FAQ-${faq.id}): ${body.slice(0, 90)}`)
    return null
  }
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
    '**HOUSE BRAIN (read first, every build):** `~/.claude/memory/patterns/good/shopify-website-team-handbook.md` — the ONE source of truth for our workflow, code/CSS standards, gate ownership, and Definition of Done. For any Shopify PLATFORM fact (Liquid/schema/Admin/Storefront field), use the Dev MCP (`learn_shopify_api`→`search_docs_chunks`→`validate_theme`/`validate_graphql_codeblocks`) — never model-recall. If your memory conflicts with the Toolkit, the Toolkit wins.',
    '**PLATFORM TRUTH (dated, outranks recall):** `~/.claude/memory/patterns/good/shopify-platform-truth-2026.md` §A — verified facts (per-component CSS ownership → gate #52, `image_tag` not `img_tag`, `asset_url` self-versions, theme blocks). §B is QUARANTINE — never build on a §B claim without verifying it live first.',
    '**DESIGN TASTE (why "green gates still looks AI"):** `~/.claude/memory/patterns/good/shopify-design-taste-doctrine.md` — the gates verify correctness, not desirability. Fix the 4 real AI-tells (duplication · thinness · missing institutional signals · borrowed assets), NOT "make it more distinctive": prototypicality is REWARDED (Tuch ηp²=.812). Never penalise a plain/conventional ecom layout, and never chase flourish to fix an AI look.',
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
  // Cross-block isolation (A4): our SWT-TRAINED block must not overlap the trainer's AUTOLEARN block.
  // A splice that swallowed the other writer's block would still pass the checks above (they only see
  // OUR block) — this catches it. Roll back (don't write) on any overlap. Shared with the trainer.
  if (!blocksAreIsolated(updated)) return false
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
    // 2026-07-23: was 180s, which is SHORTER than the job. A cycle that appends ~40 FAQs leaves the
    // incremental pass ~10min of embedding to do (1,156 source files via ollama/nomic-embed-text), so
    // every single cycle logged "FAILED (search stale!)" while Ollama was healthy and the same command
    // succeeded standalone. Net effect: the depth channel — memory_search, the thing agents are told to
    // run before every task — never saw anything the training loop produced.
    const r = spawnSync('node', args, { encoding: 'utf8', timeout: Number(process.env.SWT_REINDEX_TIMEOUT_MS || 900000), cwd: REPO })
    if (r.status !== 0) return { ok: false, out: (r.stderr || r.stdout || 'reindex failed').toString().slice(0, 160) }
    // DELIVERY HEALTH-CHECK (2026-07-24): exit 0 is NOT proof the rules landed. A reindex can "succeed"
    // yet embed nothing (dim=0 → embedder returned empty vectors, i.e. Ollama degraded) or see no change
    // (embedded 0 right after we rewrote every pack → the depth channel silently did not update). Parse
    // the summary line and flag those so a stale search can't hide behind a green "reindex: OK".
    const out = (r.stdout || '').trim()
    const line = out.split('\n').filter(Boolean).pop() || 'reindexed'
    const m = out.match(/embedded\s+(\d+)\s+file.*?\((\d+)\s+chunks\).*?dim=(\d+)/s)
    const embedded = m ? Number(m[1]) : null
    const chunks = m ? Number(m[2]) : null
    const dim = m ? Number(m[3]) : null
    // healthy unless we can positively prove degradation: a zero embedding dimension (broken embedder)
    // or nothing embedded when the caller just rewrote the packs. Unparseable output → unknown, not a fail.
    const degraded = dim === 0 || (embedded === 0 && !full)
    return { ok: true, healthy: !degraded, embedded, chunks, dim, out: degraded ? `DELIVERY-DEGRADED (embedded=${embedded} dim=${dim}) — new rules may not be retrievable: ${line}` : line }
  } catch (e) { return { ok: false, out: e.message } }
}

export function distribute() {
  const faqs = parseFaqs()
  // deriveRule returns null for a NEW rule that asserts an uncited Shopify mechanism (D1) — filter them
  // out so an unverifiable platform claim never enters a pack. The count of dropped rules is the visible
  // signal of a DOC_CITES coverage gap to fill.
  const derived = faqs.map(deriveRule)
  const rules = derived.filter(Boolean)
  const droppedUncited = derived.length - rules.length
  if (droppedUncited) console.warn(`swt-distribute: dropped ${droppedUncited} uncited-mechanism rule(s) (D1 provenance gate; SWT_ALLOW_UNCITED=1 to keep, SWT_DEBUG=1 to list)`)
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
