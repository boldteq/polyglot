export const meta = {
  name: 'gempages-library-batch',
  description: 'Ingest the new GemPages landing-page batch (19 pages) into ~/.claude/memory/design/ecom/component-library-premium/: parallel fetch+extract → map-to-catalog → reconcile/dedup barrier → author template records + new cards + variant appends (single writer per shared file) → single map-author pass on _concept-section-map.json → verify. Full template record per page; new niches flagged not authored; no agent retrain patch.',
  phases: [
    { title: 'Extract', detail: 'one agent per page: fetch live GemPages page → ordered section list (structure + HTML/CSS/JS sketch + guessed concept)' },
    { title: 'Map', detail: 'each section labelled REUSE/VARIANT/NEW/SKIP against the 89-card catalog + concept match_tokens' },
    { title: 'Reconcile', detail: 'single barrier agent: collapse cross-page duplicate new-card proposals, demote false-NEW to VARIANT, emit authoritative work order' },
    { title: 'Author', detail: 'write 19 template records + canonical new cards + variant appends; single index sub-writer for all _index.md + ingest log' },
    { title: 'MapAuthor', detail: 'single agent updates _concept-section-map.json with new concepts (only writer, runs last)' },
    { title: 'Verify', detail: 'no dup cards, every path resolves, JSON valid, indexes + log updated, honesty notes present, niches flagged' },
  ],
}

const LIB = '~/.claude/memory/design/ecom/component-library-premium'

// Format-reference files every authoring agent must read before writing, so output matches existing exactly.
const FORMAT_REFS = `
FORMAT REFERENCES (read these BEFORE writing — match them exactly):
- Template-record format: ${LIB}/templates/seal-gem-road-bike-landing.md
  (sections: "# Template — <Name>" / "**Slug:** **URL:** **Niche:** **Page type:**" / 1-para brief /
   "## Ordered section list → component mapping" table | # | Section | Component path | Concept | Rung | NEW/VARIANT | /
   "## New cards written" / "## New category _index.md introduced" / "## Proposed new concepts (kebab)" /
   "## Variant appends made (target + delta)" / "## Niche note" / "## pageType")
- Component-card format: ${LIB}/components/bnpl-financing/bnpl-financing-tabs.md
  (H1 title / "**Category:** · **Concept:** · **Rung:**" / "**Conversion job:**" / "**Source:**" /
   "## Layout" / "## HTML" / "## CSS" / "## JS" / "## Responsive notes" /
   "## Variants" ending "_Append future templates' versions here._")
- Category index format: ${LIB}/components/before-after/_index.md
  (H1 category / 1-para description / table | Component | Concept | Rung | Source | Conversion job |)
- Ingest log format: ${LIB}/components/_templates-ingested.md
  (table | Date | Template | Builder | Page | Niche | Sections | Record | + DEDUP/SKIP notes block at bottom)
- Concept map shape: ${LIB}/_concept-section-map.json
  ("concept-key": { minimog_sections, dawn_sections, rung (REUSE|CONFIGURE|EXTEND|LIBRARY|CUSTOM), match_tokens, notes })
- CURRENT CATALOG SNAPSHOT (every existing card + every concept's match_tokens):
  ${LIB}/.catalog-snapshot.tmp.txt  ← READ THIS to know what already exists; never duplicate.

DISCIPLINE:
- Section-reuse ladder REUSE → CONFIGURE → EXTEND → LIBRARY → BUILD-CUSTOM.
- Matching section, identical structure → REUSE (cite existing path, NO write).
- Matching concept, structural delta → VARIANT APPEND (Delta HTML + Delta CSS only, rung unchanged) under the existing card's "## Variants".
- Genuinely new structure → NEW card (semantic accessible HTML, ARIA, no inline styles; mobile-first CSS custom props; optional JS as custom element).
- HONEST-BY-CONSTRUCTION: any countdown / scarcity / price / BNPL / test-cert / OOS section must bind REAL store/provider data + real ISO deadline, never invented numbers — state this in the card's "## Responsive notes".
- Template files only PROPOSE new concepts — they NEVER edit _concept-section-map.json (the MapAuthor stage owns it).
- New niches are FLAGGED ("Structure banked · no DNA pack yet") — do NOT author niche-dna-packs.
`

// 19 pages to process. sport-road-bike = exact dup → pure DEDUP skip (handled in Reconcile, no extract agent).
// Pre-fetched pages carry a cache hint so the extractor reuses known structure (WebFetch is 15-min cached anyway).
const PAGES = [
  { slug: 'click-through-page-apparel-shoes-1', store: 'seal-commerce-asia', niche: 'apparel / running shoes', prefetched: true },
  { slug: 'click-through-page-food-drink-kombucha', store: 'seal-commerce-asia', niche: 'CPG beverage / kombucha' },
  { slug: 'click-through-page-pet-animals-cat-food', store: 'seal-commerce-asia', niche: 'pet / cat food' },
  { slug: 'click-through-page-health-nutritional-supplements', store: 'seal-commerce-asia', niche: 'supplements', prefetched: true },
  { slug: 'click-through-page-gem-vitamin-created-by-fiction-studio', store: 'seal-commerce-asia', niche: 'vitamins / supplements', altPaths: ['gem-vitamin-created-by-fiction-studio'] },
  { slug: 'click-through-page-health-beauty-sleep-supplement', store: 'seal-commerce-asia', niche: 'sleep supplement' },
  { slug: 'click-through-page-jan-22-13-34-36', store: 'seal-commerce-asia', niche: 'unknown (generic click-through)' },
  { slug: 'landing-page-blank-apr-22-09-21-56', store: 'gemcommerce-template', niche: 'weight-loss supplement (Flux Burn)', prefetched: true },
  { slug: 'landing-page-jun-17-09-21-53', store: 'seal-commerce-asia', niche: 'unknown (generic landing)' },
  { slug: 'click-through-page-health-and-beauty-powder-collagen', store: 'gemcommerce-template', niche: 'beauty supplement / collagen powder' },
  { slug: 'beauty-skincare-1', store: 'seal-commerce-asia', niche: 'beauty / skincare', prefetched: true },
  { slug: 'landing-page-gem-kitchen', store: 'seal-commerce-asia', niche: 'home / kitchen goods' },
  { slug: 'gemcosmetic', store: 'seal-commerce-asia', niche: 'beauty / cosmetics' },
  { slug: 'pitch-landing-page-air-purifier-1', store: 'seal-commerce-asia', niche: 'home appliance / air purifier', prefetched: true },
  { slug: 'organic-gemtea-1', store: 'seal-commerce-asia', niche: 'CPG beverage / tea', altPaths: ['organic-gemtea'] },
  { slug: 'fitness-protein-drink-1', store: 'seal-commerce-asia', niche: 'fitness / protein drink' },
  { slug: 'gem-wine', store: 'seal-commerce-asia', niche: 'alcohol / wine (multi-SKU deal grid)' },
  { slug: 'landing-page-gem-coffee', store: 'seal-commerce-asia', niche: 'CPG beverage / coffee' },
  { slug: 'fathers-day', store: 'seal-commerce-asia', niche: 'gift-seasonal (near-dup of Mother\'s Day massage-gun)', nearDup: true },
]

const url = (p) => `https://${p.store}.myshopify.com/pages/${p.slug}`

// ---------- SCHEMAS ----------
const EXTRACT_SCHEMA = {
  type: 'object',
  required: ['slug', 'accessible', 'pageType', 'niche', 'brief', 'sections'],
  properties: {
    slug: { type: 'string' },
    url: { type: 'string' },
    sourceUrl: { type: 'string', description: 'the exact URL you actually fetched — must be the assigned URL or a same-store alternate, never another site' },
    accessible: { type: 'boolean', description: 'false if password/404/empty/JS-shell/rate-limited — return empty sections, NEVER substitute another site' },
    note: { type: 'string', description: 'if inaccessible or near-dup, explain' },
    pageType: { type: 'string', description: 'PDP | LANDING | FUNNEL | SUBSCRIPTION | HOMEPAGE | MULTI-SKU-DEAL-GRID' },
    niche: { type: 'string' },
    brief: { type: 'string', description: '1-2 sentence conversion-spine summary' },
    newNiche: { type: 'boolean', description: 'true if niche not in {supplements, supplements-playful, cpg-food, beauty/skincare, pet, apparel}' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'name', 'structure', 'guessedConcept'],
        properties: {
          order: { type: 'number' },
          name: { type: 'string' },
          structure: { type: 'string', description: 'structural description: layout, columns, blocks, interactivity — NOT the copy' },
          guessedConcept: { type: 'string', description: 'kebab concept key guess' },
          htmlSketch: { type: 'string', description: 'representative semantic HTML skeleton (no copy specifics)' },
          honestyFlag: { type: 'boolean', description: 'true if countdown/scarcity/price/BNPL/test-cert/OOS' },
        },
      },
    },
  },
}

const MAP_SCHEMA = {
  type: 'object',
  required: ['slug', 'sourceUrl', 'pageType', 'niche', 'newNiche', 'mappedSections', 'proposedNewCards', 'proposedNewConcepts'],
  properties: {
    slug: { type: 'string' },
    sourceUrl: { type: 'string', description: 'the exact assigned URL this page came from (carry verbatim from extract)' },
    pageType: { type: 'string' },
    niche: { type: 'string' },
    newNiche: { type: 'boolean' },
    brief: { type: 'string' },
    mappedSections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['order', 'name', 'decision', 'componentPath', 'concept', 'rung'],
        properties: {
          order: { type: 'number' },
          name: { type: 'string' },
          decision: { type: 'string', description: 'REUSE | VARIANT | NEW | SKIP' },
          componentPath: { type: 'string', description: 'components/<cat>/<card>.md — existing for REUSE/VARIANT, proposed for NEW' },
          concept: { type: 'string' },
          rung: { type: 'string' },
          variantDelta: { type: 'string', description: 'for VARIANT: what differs from base (delta only)' },
        },
      },
    },
    proposedNewCards: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'concept', 'rung', 'conversionJob', 'why'],
        properties: {
          path: { type: 'string' },
          concept: { type: 'string' },
          rung: { type: 'string' },
          conversionJob: { type: 'string' },
          why: { type: 'string', description: 'why no existing card covers this (closest candidate + blocking gap)' },
          honesty: { type: 'boolean' },
        },
      },
    },
    proposedNewConcepts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'rung', 'matchTokens', 'notes'],
        properties: {
          key: { type: 'string' },
          rung: { type: 'string' },
          matchTokens: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
  },
}

const RECONCILE_SCHEMA = {
  type: 'object',
  required: ['templates', 'canonicalNewCards', 'newConcepts', 'newNiches', 'dedupNotes'],
  properties: {
    templates: {
      type: 'array',
      description: 'one per page to write a full record for (all except pure dedup skip)',
      items: {
        type: 'object',
        required: ['slug', 'sourceUrl', 'owner', 'newCardPaths', 'variantAppends'],
        properties: {
          slug: { type: 'string' },
          sourceUrl: { type: 'string', description: 'exact assigned URL for this page (carry verbatim from the map)' },
          owner: { type: 'boolean', description: 'true if this page is the canonical owner of one or more new cards' },
          newCardPaths: { type: 'array', items: { type: 'string' }, description: 'cards THIS page owns (writes)' },
          variantAppends: { type: 'array', items: { type: 'string' }, description: 'card paths this page appends a variant to' },
        },
      },
    },
    canonicalNewCards: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'ownerSlug', 'concept', 'rung', 'conversionJob'],
        properties: {
          path: { type: 'string' }, ownerSlug: { type: 'string' }, concept: { type: 'string' },
          rung: { type: 'string' }, conversionJob: { type: 'string' }, newCategory: { type: 'boolean' }, honesty: { type: 'boolean' },
        },
      },
    },
    newConcepts: { type: 'array', items: { type: 'object', required: ['key', 'rung', 'matchTokens', 'notes'], properties: {
      key: { type: 'string' }, rung: { type: 'string' }, matchTokens: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } } },
    newNiches: { type: 'array', items: { type: 'string' }, description: 'niches with no DNA pack — flag for Yash' },
    dedupNotes: { type: 'array', items: { type: 'string' }, description: 'SKIP / near-dup / collapse notes for the log block' },
  },
}

// ================= STAGE A+B: Extract + Map (fan-out, one chain per page) =================
// Split into 2 smaller batches to avoid the server-side rate-limiting that throttled the first run.
phase('Extract')
log(`Ingesting ${PAGES.length} GemPages pages into ${LIB} (full record per page) in 2 batches.`)

const HALF = Math.ceil(PAGES.length / 2)
const BATCHES = [PAGES.slice(0, HALF), PAGES.slice(HALF)]

const extractStage = (p) => agent(
    `You are a structural extractor for the Boldteq ecom component library. Fetch the EXACT page below and decompose it into an ORDERED list of sections — STRUCTURE ONLY (layout, columns, blocks, interactivity), not the marketing copy.

═══ HARD RULE — NO SITE SUBSTITUTION ═══
You may ONLY fetch this exact assigned URL (or, if it 404s, the listed alternate slugs on the SAME store). You must NEVER fetch, substitute, invent, or "use a similar example from" ANY other website, brand, or page builder (no Replo demos, no EComposer, no amika/Therabody/Away/Ceremonia/etc.). If WebFetch returns a password page, 404, empty skeleton, JS-only shell, or rate-limit error, set accessible=false, put the reason in "note", and return EMPTY sections. A truthful accessible=false is correct; a fabricated page from another source is a CRITICAL FAILURE. Every extracted section MUST come from THIS exact URL. Set sourceUrl to the exact URL you actually fetched.

ASSIGNED PAGE: ${url(p)}
sourceStore: ${p.store}   ·   sourceUrl to record: ${url(p)}
Known niche hint: ${p.niche}. Page slug: ${p.slug}.
${p.prefetched ? 'NOTE: this exact page was already fetched this session and returned real rich content — fetch THIS url again (15-min cache) and extract fully.' : ''}
${p.nearDup ? 'NOTE: suspected NEAR-DUPLICATE of the already-banked Mother\'s Day massage-gun gift-seasonal landing. Extract THIS url anyway; if every section structurally matches that recipe, say so in "note" (still accessible=true, sections listed). Reconcile decides dedup.' : ''}
${p.altPaths ? `If the assigned URL 404s, try these alternate slugs on the SAME ${p.store} store: ${p.altPaths.map((s) => `https://${p.store}.myshopify.com/pages/${s}`).join(', ')}. No other sites.` : ''}

Use WebFetch. For EACH section: order, name, a structural description, a guessed kebab concept key, a representative semantic HTML skeleton (generic — no real copy), and honestyFlag=true if it is a countdown/scarcity/price/BNPL/test-cert/OOS block. Set slug=${p.slug} and sourceUrl to the exact URL fetched.
Return ONLY the structured object.`,
    { label: `extract:${p.slug}`, phase: 'Extract', schema: EXTRACT_SCHEMA },
  )

// Stage B — map each section to the existing catalog
const mapStage = (extract, p) => {
    if (!extract || extract.accessible === false) {
      log(`SKIP (inaccessible): ${p.slug} — ${extract?.note || 'no result'}`)
      return null
    }
    // Thread the canonical source URL/store through so downstream stages never need PAGES.find
    extract.sourceUrl = extract.sourceUrl || url(p)
    extract.sourceStore = p.store
    extract.canonicalSlug = p.slug
    return agent(
      `You are the catalog-mapper for the Boldteq ecom component library. For each extracted section of this page, decide REUSE / VARIANT / NEW / SKIP against the EXISTING catalog.

READ FIRST:
- ${LIB}/.catalog-snapshot.tmp.txt  (every existing card + every concept's match_tokens — this is your matcher)
- ${LIB}/_concept-section-map.json  (concept rungs + tokens)

PAGE: ${p.slug}  (${extract.pageType}, niche: ${extract.niche})
sourceUrl (carry verbatim into your output): ${extract.sourceUrl}
EXTRACTED SECTIONS (JSON):
${JSON.stringify(extract.sections, null, 1)}

For each section:
- If an existing card covers it identically → decision REUSE, componentPath = the existing card.
- If an existing concept matches but structure differs → decision VARIANT, componentPath = existing card, variantDelta = what's new.
- If genuinely new (no existing card/concept) → decision NEW, componentPath = proposed components/<category>/<kebab>.md, and add it to proposedNewCards with a "why no existing card fits" (name the closest existing card + its blocking gap).
- Trivial/navigational/footer dups already banked → SKIP.
Be biased toward VARIANT over NEW — most sections should map to existing cards. Collect proposedNewConcepts only for true NEW structures (propose, do NOT edit the JSON).
${FORMAT_REFS}
Return ONLY the structured object.`,
      { label: `map:${p.slug}`, phase: 'Map', schema: MAP_SCHEMA },
    )
}

// Run the two batches sequentially (each batch is internally parallel) to stay under the rate limit.
const liveMaps = []
for (let b = 0; b < BATCHES.length; b++) {
  log(`Batch ${b + 1}/${BATCHES.length}: ${BATCHES[b].length} pages — extract + map.`)
  const batchMapped = await pipeline(BATCHES[b], extractStage, mapStage)
  liveMaps.push(...batchMapped.filter(Boolean))
}
log(`Mapped ${liveMaps.length}/${PAGES.length} pages. Proposed new cards (pre-dedup): ${liveMaps.reduce((n, m) => n + (m.proposedNewCards?.length || 0), 0)}.`)

// ================= STAGE C: Reconcile + Dedup (single barrier) =================
phase('Reconcile')
const work = await agent(
  `You are the reconciliation authority for a batch ingest into the Boldteq ecom component library. You receive per-page mapping proposals. Produce ONE authoritative, de-duplicated work order.

READ FIRST: ${LIB}/.catalog-snapshot.tmp.txt (existing cards) and ${LIB}/_concept-section-map.json (existing concepts/tokens).

PER-PAGE MAPS (JSON array):
${JSON.stringify(liveMaps, null, 1)}

RULES:
1. CROSS-PAGE COLLAPSE: if two+ pages propose the same/equivalent new card, keep ONE canonical card; assign owner = the first page (by PAGES order) that proposed it. Other pages reference that path as VARIANT/REUSE, never re-create it.
2. CATALOG RE-CHECK: any proposedNewCard that actually matches an existing card's concept/match_tokens → DEMOTE to a variant append on the existing card (remove from canonicalNewCards). Minimize true new cards.
3. NEW CATEGORY: mark newCategory=true when a canonical new card needs a category folder that doesn't exist yet.
4. Every page (except pure exact-dup skips) gets a template record — set its slug, its sourceUrl (carry verbatim from the page's map), newCardPaths (cards it owns) and variantAppends (existing cards it appends to).
5. Collect newConcepts (deduped) for the MapAuthor stage and newNiches (no DNA pack) for Yash. Add dedupNotes for the ${'`'}sport-road-bike${'`'} exact dup (already ingested as seal-gem-road-bike-landing.md) and any near-dups (e.g. fathers-day if it collapses to gift-seasonal).
Return ONLY the structured object.`,
  { label: 'reconcile', phase: 'Reconcile', schema: RECONCILE_SCHEMA },
)

log(`Work order: ${work.templates.length} template records · ${work.canonicalNewCards.length} new cards · ${work.newConcepts.length} new concepts · ${work.newNiches.length} new niches flagged.`)

// ================= STAGE D: Author Writes =================
// D1: canonical new cards (disjoint files → parallel). D2: template records (disjoint → parallel).
// D3: variant appends + all index/log writes → SINGLE serialized index writer (after D1/D2).
phase('Author')

// Robust slug→sourceUrl/map lookup built from the live maps (NEVER use PAGES.find — slugs can diverge via altPaths)
const mapBySlug = {}
for (const m of liveMaps) if (m && m.slug) mapBySlug[m.slug] = m
const urlForSlug = (slug) => (mapBySlug[slug] && mapBySlug[slug].sourceUrl) || ''
// owner card → its owning template's sourceUrl (for D1 re-fetch), falling back to the reconcile-provided url
const tmplBySlug = {}
for (const t of work.templates) if (t && t.slug) tmplBySlug[t.slug] = t

// D1 — new cards (one agent per card; disjoint files)
await parallel(work.canonicalNewCards.map((c) => () => {
  const parts = c.path.split('/')
  const cardFile = parts[parts.length - 1]
  const catIndexPath = parts.slice(0, -1).join('/') + '/_index.md'
  const ownerUrl = (tmplBySlug[c.ownerSlug] && tmplBySlug[c.ownerSlug].sourceUrl) || urlForSlug(c.ownerSlug) || '(owner URL unavailable — use the section structure provided; do NOT fetch any other site)'
  const catLine = c.newCategory
    ? 'This needs a NEW category folder — also create ' + LIB + '/' + catIndexPath + ' (H1 category + 1-para description + table header + this card row).'
    : 'Append this card row to the existing category _index.md.'
  const honestyLine = c.honesty
    ? 'HONESTY: this card binds real data (countdown/scarcity/price/BNPL/test-cert/OOS) — placeholder figures must be clearly bound to real store/provider data + real ISO deadline, never invented. State this in "## Responsive notes".'
    : ''
  return agent(
    'Write ONE new component card for the Boldteq ecom library at ' + LIB + '/' + c.path + '.\n\n' +
    'Card spec: concept "' + c.concept + '", rung ' + c.rung + ', conversion job: ' + c.conversionJob + '. Owner page (the ONLY page you may re-fetch): ' + ownerUrl + '.\n' +
    'HARD RULE: if you re-fetch, fetch ONLY that exact owner URL. Never fetch or borrow from any other site/brand/builder. If it is unreachable, build the card from the section structure already provided.\n' +
    catLine + '\n' +
    'Match the card format EXACTLY (read the reference). Semantic accessible HTML (ARIA, no inline styles), mobile-first CSS custom props, optional JS as a custom element.\n' +
    honestyLine + '\n' + FORMAT_REFS + '\n' +
    'Write the file(s). Return a one-line confirmation of the path(s) written.',
    { label: 'card:' + cardFile, phase: 'Author' },
  )
}))

// D2 — template records (one agent per page; disjoint files). Uses sourceUrl from data — no PAGES.find.
await parallel(work.templates.map((t) => () => {
  const m = mapBySlug[t.slug] || {}
  const srcUrl = t.sourceUrl || m.sourceUrl || urlForSlug(t.slug) || '(unknown — record the slug only)'
  return agent(
    'Write the full template record at ' + LIB + '/templates/' + t.slug + '.md for this ingested page.\n\n' +
    'PAGE URL (record verbatim, do NOT alter): ' + srcUrl + '   ·   niche: ' + (m.niche || '') + '   ·   pageType: ' + (m.pageType || '') + '\n' +
    'This page OWNS new cards: ' + JSON.stringify(t.newCardPaths) + ' and appends variants to: ' + JSON.stringify(t.variantAppends) + '.\n' +
    'Its mapped sections (authoritative):\n' + JSON.stringify(m.mappedSections || [], null, 1) + '\n\n' +
    'Match the template-record format EXACTLY (read ' + LIB + '/templates/seal-gem-road-bike-landing.md): H1, Slug/URL/Niche/Page type, 1-para brief, the "## Ordered section list → component mapping" table, "## New cards written", "## New category _index.md introduced", "## Proposed new concepts (kebab)" (propose only — do NOT edit the JSON), "## Variant appends made (target + delta)", "## Niche note" (if new niche: "Structure banked · no DNA pack yet — escalate taste to Yash"), "## pageType". The URL field MUST be exactly the PAGE URL above — never substitute another site.\n' +
    FORMAT_REFS + '\n' +
    'Write the file. Return a one-line confirmation.',
    { label: 'tmpl:' + t.slug, phase: 'Author' },
  )
}))

// D3 — variant appends + ALL shared index/log writes (SINGLE writer, serialized, runs after D1/D2)
phase('Author')
const allVariantAppends = []
for (const m of liveMaps) for (const s of (m.mappedSections || [])) if (s.decision === 'VARIANT') allVariantAppends.push({ slug: m.slug, card: s.componentPath, delta: s.variantDelta, section: s.name })

await agent(
  `You are the SINGLE index/variant writer for this batch ingest — you own every shared file so there are no write races. Do these in order:

1. VARIANT APPENDS — for each entry below, append a new variant block under the target card's "## Variants" section (Delta HTML + Delta CSS only, rung unchanged, cite the source page §section). Replace the "_Append future templates' versions here._" placeholder only if present; never duplicate an existing variant.
${JSON.stringify(allVariantAppends, null, 1)}

2. CATEGORY _index.md — for any card written this batch (new cards in ${JSON.stringify(work.canonicalNewCards.map((c) => c.path))}), ensure its category _index.md table has a row. The new-card authors created new-category indexes; you reconcile EXISTING category indexes additively (add missing rows only).

3. MASTER INDEX — update ${LIB}/components/_index.md: add any new categories and add rows to the "New niches surfaced" table for: ${JSON.stringify(work.newNiches)} (each "Structure banked · no DNA pack yet").

4. INGEST LOG — append to ${LIB}/components/_templates-ingested.md one table row per written template (${JSON.stringify(work.templates.map((t) => t.slug))}) with Date 2026-06-15, Builder GemPages, correct Page type + niche + section count + Record link. Then in the DEDUP/SKIP block at the bottom add the notes: ${JSON.stringify(work.dedupNotes)}.

Read the format references first. ${FORMAT_REFS}
Do NOT touch _concept-section-map.json (the MapAuthor stage owns it). Return a summary of files written.`,
  { label: 'index-writer', phase: 'Author' },
)

// ================= STAGE E: Map Author (single writer of _concept-section-map.json) =================
phase('MapAuthor')
await agent(
  `You are the SOLE author of ${LIB}/_concept-section-map.json for this batch. Add the new concepts below as well-formed entries, then verify the file still parses as valid JSON.

NEW CONCEPTS TO RESOLVE:
${JSON.stringify(work.newConcepts, null, 1)}

For each: add "<key>": { "minimog_sections": [...], "dawn_sections": [...], "rung": "<REUSE|CONFIGURE|EXTEND|LIBRARY|CUSTOM>", "match_tokens": [...], "notes": "<placement + CRO + which theme section hosts it, or LIBRARY if custom>" }.
- If neither Minimog nor Dawn ships a native section → rung LIBRARY, list the closest host section(s) (e.g. custom-liquid, multicolumn, collapsible-content) in notes.
- Keep _meta, $schema_version, and all existing entries intact. Do not reorder or remove anything.
- match_tokens must be discriminative (the mapper uses them) and not collide destructively with existing concepts.
After editing, run \`node -e "JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude/memory/design/ecom/component-library-premium/_concept-section-map.json','utf8')); console.log('VALID')"\` and report the result.
Return the list of concept keys added + JSON validity.`,
  { label: 'map-author', phase: 'MapAuthor' },
)

// ================= STAGE G: Verify =================
phase('Verify')
const verdict = await agent(
  `You are the verification gate for this batch ingest into ${LIB}. Run READ-ONLY checks and report PASS/FAIL per item with evidence.

1. NO DUP CARDS — for each new card path ${JSON.stringify(work.canonicalNewCards.map((c) => c.path))}: exactly one file exists, exactly one _index.md row references it, and no two template records both claim it under "## New cards written". (grep)
2. PATHS RESOLVE — every component path referenced in every templates/*.md written this batch (${JSON.stringify(work.templates.map((t) => t.slug))}) exists on disk. List any dangling path.
3. VARIANT APPENDS LANDED — each claimed variant append produced a real new block under the target card's "## Variants".
4. CONCEPTS — every new concept ${JSON.stringify(work.newConcepts.map((c) => c.key))} now appears in _concept-section-map.json; no template file edited the JSON.
5. JSON VALID — _concept-section-map.json parses; _meta + $schema_version intact; not truncated. (run node JSON.parse)
6. INDEXES + LOG — _templates-ingested.md has a row per written template + the DEDUP/SKIP notes; _index.md "New niches surfaced" updated; new categories have _index.md.
7. HONESTY — every countdown/scarcity/price/BNPL/test-cert card written carries the honest-by-construction note in "## Responsive notes".
8. NICHES FLAGGED — new niches ${JSON.stringify(work.newNiches)} appear as "Structure banked · no DNA pack"; nothing was written under niche-dna-packs/. (ls)
9. NO ROGUE SOURCES (CRITICAL) — every file written/edited this batch must cite ONLY seal-commerce-asia.myshopify.com or gemcommerce-template.myshopify.com sources. Run: \`grep -rliE "loveamika|therabody|awaytravel|ceremonia|setu\\.in|junedays|portland ?pet|ribbon kitchen|\\bReplo\\b|everist|ecomposer|lumismooth" ${LIB}/components ${LIB}/templates 2>/dev/null | grep -v _quarantine\` — this MUST return ZERO hits. Any hit = a CRITICAL FAIL (an extractor substituted a forbidden site); name the offending file(s).

Use Bash grep/ls/node + Read. Return a checklist with PASS/FAIL + the specific defect for any FAIL. Item 9 is a hard gate.`,
  { label: 'verify', phase: 'Verify' },
)

log('Batch ingest complete.')
return {
  pagesProcessed: liveMaps.length,
  templateRecords: work.templates.length,
  newCards: work.canonicalNewCards.length,
  newConcepts: work.newConcepts.map((c) => c.key),
  newNichesFlagged: work.newNiches,
  dedupNotes: work.dedupNotes,
  verification: verdict,
}
