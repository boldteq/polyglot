export const meta = {
  name: 'pagepilot-library-ingest',
  description: 'Ingest the decoded PagePilot DTC product-landing-page batch (.research/pagepilot/raw/*.json + shots/*.png, produced by scripts/pagepilot/fetch-all.mjs) into a DEDICATED ~/.claude/memory/design/ecom/pagepilot-library/ + author the cross-page Landing-Page CRO Structure & Placement Playbook. Stages: Analyze each page (intent + placement zone + CRO role per ordered section, blank-intent inference w/ confidence, honesty flags) → Synthesis barrier (section-ordering archetypes + placement rules + 3+/8 promoted patterns + block heatmap + native concept map) → Author (per-page records + palette catalog + playbook in parallel, then a single serialized writer for shared index/cro-decoded integration) → MapAuthor (PagePilot-native _concept-section-map.json) → Verify (adversarial read-only: counts match raw, every rule cites a real page, JSON valid, HONESTY = zero fabricated CVR, scope banners present, premium library untouched). STRUCTURE-ONLY: no conversion-rate data exists in source; "high-converting" is the builder marketing claim, never measured. Scope = DTC dropshipping PDP/advertorial, NOT SaaS/B2B. Re-run after adding IDs to scripts/pagepilot/pages.mjs + re-running fetch-all.',
  phases: [
    { title: 'Analyze', detail: 'one agent per page: read decoded JSON + screenshots → ordered sections w/ intent, placement zone, CRO role, blank-intent confidence, honesty flags; infer product + niche' },
    { title: 'Synthesis', detail: 'single barrier agent: section-ordering archetypes + placement rules (w/ page evidence + confidence) + 3+/8 promoted PP-PAT patterns + block-frequency heatmap + deduped native concepts' },
    { title: 'Author', detail: 'parallel disjoint writers: 8 page records + palette catalog + the placement playbook + concept-map; then one serialized writer for _index.md + cro-decoded-patterns.md integration + cross-refs' },
    { title: 'MapAuthor', detail: 'single writer of pagepilot-library/_concept-section-map.json (PagePilot-native, placement_zone first-class); validate JSON parses' },
    { title: 'Verify', detail: 'adversarial read-only: section counts == raw order.length, every placement rule cites a real page, JSON valid, honesty grep clean, scope banners present, premium _concept-section-map.json untouched' },
  ],
}

// ---- paths (absolute; agents Read/Write these directly) ----
const REPO = '/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot'
const RAW = `${REPO}/.research/pagepilot/raw`
const SHOTS = `${REPO}/.research/pagepilot/shots`
const LIB = '/Users/yashbaldha/.claude/memory/design/ecom/pagepilot-library'
const PLAYBOOK = '/Users/yashbaldha/.claude/memory/patterns/good/landing-page-cro-structure-playbook.md'
const CRO_DECODED = '/Users/yashbaldha/.claude/memory/patterns/good/cro-decoded-patterns.md'
const TEARDOWNS = '/Users/yashbaldha/.claude/memory/patterns/good/ecom-brand-teardowns.md'
const TODAY = '2026-06-15'

const PAGES = [
  { slug: 'pagepilot-greens', name: 'Greens' },
  { slug: 'pagepilot-bloom', name: 'Bloom' },
  { slug: 'pagepilot-honey', name: 'Honey' },
  { slug: 'pagepilot-clarity', name: 'Clarity' },
  { slug: 'pagepilot-aura', name: 'Aura' },
  { slug: 'pagepilot-legacy', name: 'Legacy' },
  { slug: 'pagepilot-stone', name: 'Stone' },
  { slug: 'pagepilot-cotton', name: 'Cotton' },
]

const HONESTY = `HONESTY (non-negotiable): the source is page STRUCTURE only — there is ZERO analytics/CVR data. NEVER state or imply a measured conversion rate, "X% lift", or "proven". "High-converting" may ONLY appear as the builder's (PagePilot) marketing framing. Copy strings in the JSON are template placeholder copy — describe structure, never bank copy as validated. Any price / compare-at / stat % / review count / scarcity / "as seen on" logo element must be flagged "bind real data, never invent". Scope = DTC dropshipping single-product PDP/advertorial pages — NOT SaaS/B2B/lead-gen.`

const ZONES = `placement zones (top → bottom): top | upper-mid | mid | lower-mid | bottom | sticky`

// ---------- SCHEMAS ----------
const ANALYZE_SCHEMA = {
  type: 'object',
  required: ['slug', 'name', 'product', 'niche', 'pageType', 'brief', 'sections'],
  properties: {
    slug: { type: 'string' },
    name: { type: 'string' },
    product: { type: 'string', description: 'actual product inferred from copy + gallery images' },
    niche: { type: 'string', description: 'e.g. footwear/mens-dress-shoes, skincare/serum, supplements/greens' },
    pageType: { type: 'string', description: 'PDP-advertorial | PDP | advertorial-listicle etc.' },
    brief: { type: 'string', description: '1-2 sentence conversion-spine summary — STRUCTURE only' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'sectionType', 'name', 'intent', 'placementZone', 'croRole', 'blockTypes', 'confidence'],
        properties: {
          order: { type: 'number' },
          sectionType: { type: 'string', description: 'the pagepilot_* section type' },
          name: { type: 'string', description: 'author-given section name (carries intent)' },
          intent: { type: 'string', description: 'what this section does for the shopper' },
          placementZone: { type: 'string', enum: ['top', 'upper-mid', 'mid', 'lower-mid', 'bottom', 'sticky'] },
          croRole: { type: 'string', description: 'buy-module | borrowed-authority | benefit-framing | social-proof | objection-handling | comparison | guarantee | cross-sell | persistent-conversion | spacer | etc.' },
          blockTypes: { type: 'array', items: { type: 'string' } },
          honestyFlags: { type: 'array', items: { type: 'string' }, description: 'price | stat | review-count | scarcity | as-seen-on | guarantee-claim' },
          confidence: { type: 'string', enum: ['high', 'med', 'low'], description: 'confidence in the intent classification (low for ambiguous blank sections)' },
        },
      },
    },
  },
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['archetypes', 'placementRules', 'promotedPatterns', 'blockHeatmap', 'concepts', 'niches'],
  properties: {
    archetypes: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'title', 'sequence', 'pages', 'logic'],
        properties: {
          id: { type: 'string', description: 'ARCH-PP-NN' }, title: { type: 'string' },
          sequence: { type: 'array', items: { type: 'string' }, description: 'ordered CRO-role/zone sequence top→bottom' },
          pages: { type: 'array', items: { type: 'string' } }, logic: { type: 'string' },
        },
      },
    },
    placementRules: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'element', 'zone', 'rationale', 'pages', 'count', 'confidence'],
        properties: {
          id: { type: 'string', description: 'PP-PLACE-NNN' }, element: { type: 'string' }, zone: { type: 'string' },
          rationale: { type: 'string' }, pages: { type: 'array', items: { type: 'string' } },
          count: { type: 'number', description: 'X of 8 pages' }, confidence: { type: 'string', enum: ['high', 'med', 'low'] },
        },
      },
    },
    promotedPatterns: {
      type: 'array', description: 'ONLY patterns observed in >=3 of 8 pages',
      items: {
        type: 'object', required: ['patId', 'pattern', 'count', 'pages', 'zone', 'rationale'],
        properties: {
          patId: { type: 'string', description: 'PP-PAT-NNN' }, pattern: { type: 'string' },
          count: { type: 'number' }, pages: { type: 'array', items: { type: 'string' } },
          zone: { type: 'string' }, rationale: { type: 'string' },
        },
      },
    },
    blockHeatmap: {
      type: 'array',
      items: { type: 'object', required: ['blockType', 'count', 'zones'], properties: { blockType: { type: 'string' }, count: { type: 'number' }, zones: { type: 'array', items: { type: 'string' } } } },
    },
    concepts: {
      type: 'array', description: 'PagePilot-native concept keys (kebab) for the concept-section map',
      items: {
        type: 'object', required: ['key', 'intent', 'placementZone', 'sectionTypes', 'blockTypes', 'matchTokens'],
        properties: {
          key: { type: 'string' }, intent: { type: 'string' }, placementZone: { type: 'string' },
          sectionTypes: { type: 'array', items: { type: 'string' } }, blockTypes: { type: 'array', items: { type: 'string' } },
          matchTokens: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    niches: { type: 'array', items: { type: 'string' } },
  },
}

// ---------- PROMPTS ----------
const analyzePrompt = (p) => `You are a senior ecom CRO brand-intelligence analyst (decoder). Analyze ONE high-converting DTC product landing page built in PagePilot.ai.

READ (use the Read tool):
- Decoded page JSON: "${RAW}/${p.slug}.json" — authoritative structure: ordered \`sections\` (each has type, name, and nested \`blocks\` with type + settings; text copy lives in block settings.text). \`colorPreset\` = design tokens.
- Screenshots (if present, else skip gracefully): "${SHOTS}/${p.slug}-desktop.png" and "${SHOTS}/${p.slug}-mobile.png" — visual cross-check of the rendered order + product imagery.

PRODUCE a structural CRO teardown:
1. Infer the ACTUAL product + niche from copy + gallery imagery (the page \`name\` "${p.name}" is just a color-theme template label, NOT the product).
2. For EVERY section in \`order\`, classify: intent, placementZone (${ZONES}), croRole, blockTypes (the section's block type inventory), honestyFlags, and confidence. For \`pagepilot_blank\` sections the real intent is in the section \`name\` + block composition + (where readable) copy — infer it and set confidence LOW when ambiguous.
3. Note dividers/spacers as croRole "spacer".

${HONESTY}

Return ONLY the structured object.`

const synthPrompt = (analysesJson) => `You are the Director of Conversion Optimization (catalyst). You have structural CRO teardowns of ${PAGES.length} high-converting DTC PagePilot product landing pages. Synthesize the CROSS-PAGE learning — this is the core deliverable: teach future builds WHERE elements go to convert.

INPUT (the ${PAGES.length} page analyses):
${analysesJson}

PRODUCE:
1. archetypes — canonical top→bottom CRO-role sequences shared across pages (ARCH-PP-NN). Each cites the pages that match + the conversion logic of that ordering.
2. placementRules (PP-PLACE-NNN) — "PLACE <element> in <zone> BECAUSE <rationale>". Each MUST cite the exact pages (by slug) that exhibit it + count (X of 8) + confidence. Cover the strong universals (e.g. buy module + variant picker at top; recommended-products then sticky-ATC terminal) AND the interesting mid-page ordering choices (proof vs benefits vs comparison vs FAQ sequencing).
3. promotedPatterns (PP-PAT-NNN) — ONLY patterns in >=3 of 8 pages. Label by count "/8 templates".
4. blockHeatmap — for each block type that appears: count + the zones it appears in.
5. concepts — PagePilot-native concept keys (kebab) grouping section/block types by intent, each with placementZone + matchTokens, for the concept-section map.
6. niches — distinct product niches observed.

${HONESTY} Patterns are STRUCTURAL archetypes from a small N=8 sample — every rule carries an explicit count + confidence; never imply statistical proof.

Return ONLY the structured object.`

const pagePrompt = (a) => `You are decoder. Write the per-page structural teardown record for the PagePilot page "${a.slug}".

Write the file (use the Write tool) to: "${LIB}/pages/${a.slug}.md"

Use the analysis below as your source of truth (read "${RAW}/${a.slug}.json" only if you need exact block detail):
${JSON.stringify(a)}

EXACT markdown structure:
# PagePilot Page — ${a.name}

**Slug:** ${a.slug}
**Share URL:** https://app.pagepilot.ai/share/<id from raw json>
**Raw:** .research/pagepilot/raw/${a.slug}.json
**Product (inferred):** <product>
**Niche:** <niche>
**Page type:** <pageType>

> One-paragraph conversion-spine brief — STRUCTURE only, what the page does top→bottom to move a cold shopper to add-to-cart.

## Ordered section list (json_schema.order → intent)
| # | Section type | Section name (intent) | Placement zone | Key blocks | CRO role | Honesty |
| one row per section, in order. Honesty column lists flags or "—" |

## Blank-section intent classification
Bullet every \`pagepilot_blank\` section → derived intent + confidence (high/med/low). Flag low-confidence ones explicitly for human review.

## Color preset
The preset name + the color slots→values (design grounding only).

## Honesty notes
List sections with price/stat/review-count/scarcity/as-seen-on/guarantee blocks → "bind real data, never invent".

## Niche note
"Structure + placement banked. No taste/DNA pack (PagePilot is structure-only)."

${HONESTY}`

const palettePrompt = (synthJson, analysesJson) => `You are decoder. Write the PagePilot component-palette catalog.

Write the file to: "${LIB}/_palette-catalog.md"

Sources — the block heatmap + per-page analyses:
HEATMAP+SYNTH: ${synthJson}
ANALYSES: ${analysesJson}

Structure:
# PagePilot Component Palette — Block Catalog
> Builder: PagePilot.ai (AI Shopify PDP/advertorial builder for DTC dropshippers).
> SCOPE: teaches DTC dropshipping PDP/advertorial structure; NOT SaaS/B2B landing pages.
> HONESTY: structures harvested from a builder that *markets* these as high-converting templates. NO conversion-rate data exists in source.

One section per functional family — **PDP / buy-path**, **Social proof**, **Comparison**, **Layout / content**, **Cross-sell** — each a table:
| Block type | Family | Conversion job | Observed zone(s) | Seen on (page slugs) | Honesty flag |

Include EVERY block type present in the heatmap. honesty flag column: PRICE/STAT/REVIEW-COUNT/SCARCITY/AS-SEEN-ON where applicable, else "—".

${HONESTY}`

const playbookPrompt = (synthJson) => `You are the Director of Conversion Optimization (catalyst). Author the cross-page **Landing-Page CRO Structure & Placement Playbook** — the durable learning the whole CRO team will load.

Write the file to: "${PLAYBOOK}"

Source (the cross-page synthesis):
${synthJson}

Structure:
---
name: landing-page-cro-structure-playbook
description: High-converting DTC PDP/advertorial section-ordering archetypes + element-placement rules, learned from 8 PagePilot.ai templates. Teaches WHERE elements go to convert.
metadata:
  node_type: memory
  type: cro-intelligence
  owner: catalyst
  status: ACTIVE
---

# Landing-Page CRO Structure & Placement Playbook

**Source:** 8 PagePilot.ai DTC product-landing templates (structure-only ingest ${TODAY}). Page records: \`~/.claude/memory/design/ecom/pagepilot-library/pages/\`. Palette: \`pagepilot-library/_palette-catalog.md\`.
**Owner:** catalyst (curates) · decoder (authors page evidence).
**SCOPE:** DTC dropshipping single-product PDP/advertorial pages. NOT SaaS/B2B/lead-gen.
**HONESTY:** No CVR/analytics in source. "High-converting" = the builder's marketing claim, not measured. N=8 — every rule carries an explicit count + confidence; structural archetypes, not statistical proof.

## 1. Section-ordering archetypes
For each archetype: the ordered top→bottom CRO-role sequence, the pages that match, and the conversion logic.

## 2. Placement rules (the element-placement learning)
Render each as: **PP-PLACE-NNN** — PLACE <element> in <zone> BECAUSE <rationale>. _Evidence: <page slugs> (X/8). Confidence: <…>._

## 3. Promoted patterns (>=3/8 templates)
Table of PP-PAT-NNN | pattern | count "/8 templates" | zone | rationale.

## 4. Block-frequency heatmap
Table: block type | count | zones.

## 5. How to apply
Concrete build guidance: pick the closest archetype for a DTC PDP/advertorial, apply the placement rules, fill every flagged element with REAL data. Cross-ref \`ecom-funnel-cro-playbook.md\` (surface priority) + \`cro-decoded-patterns.md\` (validated real-brand patterns).

${HONESTY}`

const mapPrompt = (synthJson) => `You are decoder, sole writer of the PagePilot-native concept-section map.

Write the file to: "${LIB}/_concept-section-map.json"

Source (synthesis.concepts):
${synthJson}

Emit valid JSON ONLY (no markdown fence). Shape:
{
  "_meta": { "builder": "PagePilot", "schema_version": "pp-1", "source": ".data turbo-stream", "authored": "${TODAY}", "note": "PagePilot-native concept map. Deliberately NOT keyed to Minimog/Dawn theme sections — do NOT feed this into the component-library-premium mapper. placement_zone is first-class because placement is the learning objective." },
  "<concept-key>": {
    "pagepilot_section_types": [...],
    "pagepilot_block_types": [...],
    "intent": "...",
    "placement_zone": "top|upper-mid|mid|lower-mid|bottom|sticky",
    "match_tokens": [...],
    "notes": "..."
  }
}
After writing, Read it back and confirm it parses as JSON (mention the concept count).`

const integratePrompt = (synthJson) => `You are decoder doing the FINAL serialized integration writes (you are the ONLY writer of these shared files — no other agent touches them).

Source (synthesis):
${synthJson}

Do all of the following:

1) WRITE the library index "${LIB}/_index.md":
# PagePilot Library — DTC Landing-Page Structure Intelligence
A master index. Honesty + scope banner (structure-only, builder marketing claim, DTC-PDP scope). Then: a table of the 8 page records (link each to \`pages/<slug>.md\`: ${PAGES.map((p) => p.slug).join(', ')}), a link to \`_palette-catalog.md\`, a link to the playbook \`~/.claude/memory/patterns/good/landing-page-cro-structure-playbook.md\`, and a link to \`_concept-section-map.json\`. Note the re-run path: "add IDs to Polyglot/scripts/pagepilot/pages.mjs → run fetch-all.mjs → run this workflow."

2) APPEND to "${CRO_DECODED}" (Read it first; append a new clearly-delimited section at the end, do NOT rewrite existing content):
A section titled "## PagePilot DTC PDP/Advertorial Structure (8 templates — ${TODAY})". Intro line: builder-template STRUCTURE, NOT CVR-validated; link to the playbook. Then list ONLY the promotedPatterns as PP-PAT-NNN rows, each labeled "N/8 **templates**" (NEVER "brands" — these are templates, not measured stores). Keep it segregated from the real-brand patterns above.

3) APPEND one pointer line to "${TEARDOWNS}" (Read first; do NOT add these as real-brand teardowns and do NOT touch the top-50 index or any benchmark math). Under a one-line note like "> Builder-template structure sources (not measured brands): see \`landing-page-cro-structure-playbook.md\` for 8 PagePilot DTC PDP/advertorial structures."

4) ADD a single cross-ref line to each of "${'/Users/yashbaldha/.claude/memory/design/ecom/pdp-patterns.md'}" and "${'/Users/yashbaldha/.claude/memory/design/ecom/hero-homepage-patterns.md'}" IF they exist (Read first; if a file does not exist, skip it and report). The line: "> See also: \`~/.claude/memory/patterns/good/landing-page-cro-structure-playbook.md\` — DTC PDP/advertorial section-ordering + element placement (8 PagePilot templates)."

${HONESTY}

Report exactly which files you wrote/appended and what you skipped.`

const verifyPrompt = (synthJson) => `You are an adversarial verifier (sage-style). READ-ONLY — do not edit anything. Verify the PagePilot ingest. Return a clear PASS/FAIL per check with evidence.

Checks:
1. All 8 page records exist: "${LIB}/pages/<slug>.md" for ${PAGES.map((p) => p.slug).join(', ')}.
2. Each page record's ordered-section table row count == the raw JSON's \`order.length\` (Read "${RAW}/<slug>.json" and compare).
3. The playbook exists at "${PLAYBOOK}" and its scope + honesty banner is present.
4. Every placement rule (PP-PLACE) and promoted pattern (PP-PAT) in the playbook cites >=1 page slug that ACTUALLY contains it (spot-check 3 rules against the raw JSONs).
5. "${LIB}/_concept-section-map.json" parses as valid JSON (Read it; report concept count).
6. HONESTY grep: search the playbook + page records + the cro-decoded-patterns.md appended section for fabricated metrics — any unbound "%", "conversion rate", "CVR", "X% lift", "increased sales/conversions" that is NOT explicitly framed as "bind real data" or "builder marketing claim". Report any violation verbatim.
7. PP-PAT promotion math: each promoted pattern count >=3; labeled "/8 templates" not "brands".
8. Scope banner ("DTC … NOT SaaS/B2B") present in: playbook, _index.md, _palette-catalog.md.
9. NON-POLLUTION: confirm "/Users/yashbaldha/.claude/memory/design/ecom/component-library-premium/_concept-section-map.json" was NOT modified (it must NOT mention PagePilot). Grep it for "pagepilot" → must be ZERO hits.

Synthesis reference: ${synthJson}

End with overall VERDICT: PASS or FAIL + the list of any fixes needed.`

// ---------- ORCHESTRATION ----------
phase('Analyze')
const analyses = (await parallel(
  PAGES.map((p) => () => agent(analyzePrompt(p), { label: `analyze:${p.slug}`, phase: 'Analyze', schema: ANALYZE_SCHEMA })),
)).filter(Boolean)
log(`analyzed ${analyses.length}/${PAGES.length} pages`)

phase('Synthesis')
const synthesis = await agent(synthPrompt(JSON.stringify(analyses)), { label: 'synthesize', phase: 'Synthesis', schema: SYNTHESIS_SCHEMA })
const synthJson = JSON.stringify(synthesis)
log(`synthesis: ${synthesis.archetypes?.length || 0} archetypes, ${synthesis.placementRules?.length || 0} placement rules, ${synthesis.promotedPatterns?.length || 0} promoted patterns, ${synthesis.concepts?.length || 0} concepts`)

phase('Author')
await parallel([
  ...analyses.map((a) => () => agent(pagePrompt(a), { label: `page:${a.slug}`, phase: 'Author' })),
  () => agent(palettePrompt(synthJson, JSON.stringify(analyses)), { label: 'palette-catalog', phase: 'Author' }),
  () => agent(playbookPrompt(synthJson), { label: 'playbook', phase: 'Author' }),
])
// shared-file writes serialized after the disjoint writers
await agent(integratePrompt(synthJson), { label: 'integrate-shared', phase: 'Author' })

phase('MapAuthor')
await agent(mapPrompt(synthJson), { label: 'concept-map', phase: 'MapAuthor' })

phase('Verify')
const verdict = await agent(verifyPrompt(synthJson), { label: 'verify', phase: 'Verify' })

return {
  pagesAnalyzed: analyses.map((a) => ({ slug: a.slug, product: a.product, niche: a.niche, sections: a.sections?.length })),
  archetypes: synthesis.archetypes?.length || 0,
  placementRules: synthesis.placementRules?.length || 0,
  promotedPatterns: synthesis.promotedPatterns?.length || 0,
  concepts: synthesis.concepts?.length || 0,
  verdict,
}
