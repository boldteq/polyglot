export const meta = {
  name: 'ecomposer-library-ingest',
  description: 'Ingest a per-batch set of EComposer demo pages (PDP/LANDING/HOMEPAGE + non-ecom edge cases) into ~/.claude/memory/design/ecom/component-library-premium/: regenerate catalog snapshot → fetch+extract each /preview render → ordered section list → taxonomy-aware map-to-catalog → reconcile/dedup barrier → author template records + new cards (with section-family match-guidance) + variant appends (single writer per shared file) → single map-author pass on _concept-section-map.json + register new categories in _section-taxonomy.json → verify. Section-family taxonomy keeps matching scalable to 500+ cards. New niches flagged not authored; no agent retrain patch.',
  phases: [
    { title: 'Snapshot', detail: 'rebuild .catalog-snapshot.tmp.txt from components/*/*.md + _concept-section-map.json so the mapper sees the true current catalog' },
    { title: 'Extract', detail: 'one agent per page: fetch the EComposer /preview render → ordered section list (structure + HTML sketch + guessed concept), honesty-flag risky sections' },
    { title: 'Map', detail: 'taxonomy-aware: pick section family (_section-taxonomy.json) → scan family categories → REUSE/VARIANT/NEW/SKIP against the catalog' },
    { title: 'Reconcile', detail: 'single barrier agent: collapse dedup families + cross-page dup cards, demote false-NEW to VARIANT, emit authoritative work order' },
    { title: 'Author', detail: 'write template records + new cards (Section-family/Use-when/Matches enrichment) + variant appends; single index sub-writer for all shared files incl. _section-taxonomy.json' },
    { title: 'MapAuthor', detail: 'single agent updates _concept-section-map.json with new concepts (only writer, runs last)' },
    { title: 'Verify', detail: 'no dup cards, dedup collapsed, every path resolves, JSON valid, indexes + log + taxonomy updated, enrichment present, honesty notes present, niches flagged, claims accurate' },
  ],
}

const LIB = '~/.claude/memory/design/ecom/component-library-premium'
const BUILDER = 'EComposer'
const TODAY = '2026-06-15'

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
- HONEST-BY-CONSTRUCTION: any countdown / scarcity / price / discount / BNPL / test-cert / OOS / live-viewer-count / award-superlative section must bind REAL store/provider data + real ISO deadline, never invented numbers — state this in the card's "## Responsive notes". A live-viewer-count ("N people viewing") must bind a real concurrency feed or be OMITTED — never a random/incrementing fake.
- Template files only PROPOSE new concepts — they NEVER edit _concept-section-map.json (the MapAuthor stage owns it).
- New niches are FLAGGED ("Structure banked · no DNA pack yet") — do NOT author niche-dna-packs.
`

// EComposer demo render route: the /preview suffix returns REAL server-rendered HTML.
// The bare /demo/{id} is a JS shell that returns only <title> — DO NOT use it.
// PAGES is REPLACED per batch (the workflow re-extracts everything in PAGES — it does not skip
// already-ingested pages). Prior batches (LUMISMOOTH + 18-page p2/p3) are already on disk; do not re-list them.
//
// BATCH 4 (pages 5-10 of category 86) — discovery rated 12 GOOD / 2 SKIP (4805 dup, 4588 placeholder).
// Split into 2 chunks of ≤8 to avoid session-limit stalls; related pages kept in the SAME chunk so their
// shared new cards collapse within one Reconcile pass (supplement PDPs together; CPG-food homepages together).
// CHUNK B (this run, 5 pages). Chunk A (4904/4756/4676/4499/2043/5063/4937) already ingested + verified.
// The 3 CPG-food homepages (valentine-choc / electrolyte / coffee) are kept together so their shared
// merchandising cards collapse to canonical within this one Reconcile pass.
const PAGES = [
  // ---- CPG-food storefront HOMEPAGEs (3 — related; shared cards collapse here) ----
  { id: '3697', slug: 'ecomposer-valentine-chocolate-homepage', niche: 'cpg-food / seasonal confectionery storefront homepage (Valentine)', newNiche: false, productName: 'Valentine Chocolate Collection (homepage)',       pageTypeHint: 'HOMEPAGE' },
  { id: '1988', slug: 'ecomposer-electrolyte-water-homepage',   niche: 'cpg-food / flavored electrolyte beverage homepage (subscribe + sample-pack)', newNiche: false, productName: 'Meloni / Hydrant Electrolyte Water (homepage)', pageTypeHint: 'HOMEPAGE' },
  { id: '1835', slug: 'ecomposer-coffee-homepage',              niche: 'cpg-food / coffee brand storefront homepage',                    newNiche: false, productName: 'Strong Coffee (homepage)',                        pageTypeHint: 'HOMEPAGE' },

  // ---- Seasonal apparel HOMEPAGE (1) ----
  { id: '3321', slug: 'ecomposer-christmas-apparel-homepage',   niche: 'apparel / seasonal festive storefront homepage (Christmas)',      newNiche: false, productName: 'Christmas Fashion Collection ("Chic and Merry")', pageTypeHint: 'HOMEPAGE' },

  // ---- Pet product LANDING (1) ----
  { id: '1416', slug: 'ecomposer-calming-dog-bed-landing',      niche: 'pet / pet furniture (calming donut dog bed)',                    newNiche: false, productName: 'Deep Dish Lux Cuddler Calming Dog Bed',          pageTypeHint: 'LANDING' },
]

const url = (p) => `https://ecomposer.app/demo/${p.id}/preview`

// ---------- SCHEMAS (carried over verbatim from the GemPages batch) ----------
const EXTRACT_SCHEMA = {
  type: 'object',
  required: ['slug', 'accessible', 'pageType', 'niche', 'brief', 'sections'],
  properties: {
    slug: { type: 'string' },
    url: { type: 'string' },
    accessible: { type: 'boolean', description: 'false if password/404/empty shell' },
    note: { type: 'string', description: 'if inaccessible, explain' },
    pageType: { type: 'string', description: 'PDP | LANDING | FUNNEL | SUBSCRIPTION | HOMEPAGE | MULTI-SKU-DEAL-GRID' },
    niche: { type: 'string' },
    brief: { type: 'string', description: '1-2 sentence conversion-spine summary' },
    newNiche: { type: 'boolean', description: 'true if niche not in {supplements, supplements-playful, cpg-food, beauty/skincare, pet, apparel, sports/high-ticket, outdoor-gear, gift-seasonal}' },
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
          honestyFlag: { type: 'boolean', description: 'true if countdown/scarcity/price/discount/BNPL/test-cert/OOS/live-viewer-count/award-superlative' },
        },
      },
    },
  },
}

const MAP_SCHEMA = {
  type: 'object',
  required: ['slug', 'pageType', 'niche', 'newNiche', 'mappedSections', 'proposedNewCards', 'proposedNewConcepts'],
  properties: {
    slug: { type: 'string' },
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
        required: ['slug', 'owner', 'newCardPaths', 'variantAppends'],
        properties: {
          slug: { type: 'string' },
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

// ================= STAGE 0: Snapshot — rebuild the catalog snapshot the mapper reads =================
phase('Snapshot')
log(`Rebuilding ${LIB}/.catalog-snapshot.tmp.txt so the mapper sees the true current catalog.`)
await agent(
  `Regenerate the catalog snapshot the mapper reads so it reflects the TRUE current catalog, then report the totals. The snapshot is at ${LIB}/.catalog-snapshot.tmp.txt and has TWO blocks: the per-category card list, then the concept-keys+match_tokens list derived from _concept-section-map.json. Match the existing format exactly (### <category> headers, "  - <card>" rows; then "<concept> [RUNG] tokens: a, b, c" lines).

Run this Node script (it walks the library and rewrites the snapshot deterministically), then report the printed totals line:

node -e '
const fs=require("fs"),path=require("path");
const ROOT=process.env.HOME+"/.claude/memory/design/ecom/component-library-premium";
const C=path.join(ROOT,"components");
let out="=== EXISTING COMPONENT CATALOG (every card, per category) ===\\n\\n";
const cats=fs.readdirSync(C).filter(d=>{try{return fs.statSync(path.join(C,d)).isDirectory()}catch(e){return false}}).sort();
for(const cat of cats){
  const cards=fs.readdirSync(path.join(C,cat)).filter(f=>f.endsWith(".md")&&f!=="_index.md").map(f=>f.replace(/\\.md$/,"")).sort();
  if(!cards.length)continue;
  out+="### "+cat+"\\n"+cards.map(c=>"  - "+c).join("\\n")+"\\n\\n";
}
out+="=== CONCEPT KEYS + match_tokens (from _concept-section-map.json) ===\\n";
const j=JSON.parse(fs.readFileSync(path.join(ROOT,"_concept-section-map.json"),"utf8"));
for(const k of Object.keys(j)){
  if(k.startsWith("_")||k.startsWith("$"))continue;
  const e=j[k]||{}, rung=e.rung||"?", toks=(e.match_tokens||[]).join(", ");
  out+=k+" ["+rung+"] tokens: "+toks+"\\n";
}
fs.writeFileSync(path.join(ROOT,".catalog-snapshot.tmp.txt"),out);
const nc=(out.match(/^  - /gm)||[]).length, ncat=(out.match(/^### /gm)||[]).length, nco=(out.match(/^\\S.*\\] tokens:/gm)||[]).length;
console.log("cards="+nc+" categories="+ncat+" concepts="+nco);
'

Confirm the printed totals look right (~112 cards, ~72 categories, ~90+ concepts as of the 2026-06-15 Sprint 2 build + quarantine reorg — the catalog grew since the first EComposer run, so re-mapping against THIS snapshot is essential to avoid duplicating Sprint-2 cards). Return the totals line and a one-line confirmation the file was written.`,
  { label: 'snapshot', phase: 'Snapshot' },
)

// ================= STAGE A+B: Extract + Map (fan-out, one chain per page) =================
phase('Extract')
log(`Ingesting ${PAGES.length} EComposer page(s) into ${LIB} (full record per page).`)

const mapped = await pipeline(
  PAGES,
  // Stage A — fetch + extract structure
  (p) => agent(
    `You are a structural extractor for the Boldteq ecom component library. Fetch this live EComposer landing-page render and decompose it into an ORDERED list of sections — STRUCTURE ONLY (layout, columns, blocks, interactivity), not the marketing copy.

PAGE: ${url(p)}
CRITICAL: the "/preview" suffix is required — it returns the real server-rendered HTML. The bare https://ecomposer.app/demo/${p.id} returns only a <title> shell with no body; do NOT use it.
Known niche hint: ${p.niche}. Product: ${p.productName}. Page slug: ${p.slug}.

Use WebFetch on ${url(p)}. If it returns a password page, 404, or empty skeleton, set accessible=false and explain in "note".
For EACH section: order, name, a structural description, a guessed kebab concept key, a representative semantic HTML skeleton (generic — no real copy), and honestyFlag=true if it is a countdown/scarcity/price/discount/BNPL/test-cert/OOS/live-viewer-count ("N people viewing")/award-superlative ("Voted #1") block.
Set pageType accurately from what you actually see — do NOT assume LANDING. Expected pageType for this page: ${p.pageTypeHint || 'detect it'}. It may be PDP, LANDING, FUNNEL, or HOMEPAGE (multi-product storefront). Capture EVERY section in true top-to-bottom order, however many there are (these range ~7–16 sections).
${p.nonEcom ? 'NOTE: this page is NON-ECOM (a service business or agency case-study) — it has no add-to-cart. Still extract its structure faithfully; its sections (service cards, booking CTA, doctor/team profiles, client-overview, goal/solution cards) are valuable structural recipes even though they sit outside core ecom. Flag newNiche=true.' : ''}
PAGE-TYPE VOCAB:
- LANDING / PDP / FUNNEL: hero, award/social-proof badge, value-prop, brand-trust logos, feature cards, stat block, tabbed gallery, feature grid, guarantee, limited-edition/scarcity block, testimonials, bundle/deal grid, comparison table, final CTA, footer.
- HOMEPAGE / storefront: hero/promo banner, brand pillars, social-proof stats, "shop by category" grid, "shop by recipient" grid, featured/curated collection grid, new-arrivals grid, multi-SKU product carousel, embedded featured-product (mini-PDP) block, brand-story/credentials, routine/how-to steps, before/after carousel, blog/editorial grid, lookbook/IG gallery, newsletter signup, multi-column footer with link groups. Treat each distinct merchandising block as its own section.
- Partner-recruitment (ambassador/affiliate) LANDING: hero, value-prop, benefit cards, how-it-works steps, commission/earnings block, application/CTA, FAQ — NO product/price/buy-box.
- Service business (clinic/agency): hero + booking CTA, services grid, about/credentials, "why choose us", staff/doctor profile grid, booking form, testimonials, FAQ — sells appointments, not products.
- Agency case-study: client-overview (name/industry/location), goals, solution cards, results, single testimonial, transform-your-business CTA.
Return ONLY the structured object.`,
    { label: `extract:${p.slug}`, phase: 'Extract', schema: EXTRACT_SCHEMA },
  ),
  // Stage B — map each section to the existing catalog
  (extract, p) => {
    if (!extract || extract.accessible === false) {
      log(`SKIP (inaccessible): ${p.slug} — ${extract?.note || 'no result'}`)
      return null
    }
    return agent(
      `You are the catalog-mapper for the Boldteq ecom component library. For each extracted section of this page, decide REUSE / VARIANT / NEW / SKIP against the EXISTING catalog.

READ FIRST:
- ${LIB}/_section-taxonomy.json  (THE TOP-LEVEL MATCHER: 10 section families → categories. For each section, first decide its FAMILY by what it DOES — hero? social-proof? offer? comparison? merchandising? — then scan only that family's member categories. This narrows ~80 categories to ~3-16 candidates fast.)
- ${LIB}/.catalog-snapshot.tmp.txt  (every existing card + every concept's match_tokens — confirm the exact card within the family's categories)
- ${LIB}/_concept-section-map.json  (concept rungs + tokens)

PAGE: ${p.slug}  (${extract.pageType}, niche: ${extract.niche})
EXTRACTED SECTIONS (JSON):
${JSON.stringify(extract.sections, null, 1)}

For each section:
- If an existing card covers it identically → decision REUSE, componentPath = the existing card.
- If an existing concept matches but structure differs → decision VARIANT, componentPath = existing card, variantDelta = what's new.
- If genuinely new (no existing card/concept) → decision NEW, componentPath = proposed components/<category>/<kebab>.md, and add it to proposedNewCards with a "why no existing card fits" (name the closest existing card + its blocking gap).
- Trivial/navigational/footer dups already banked → SKIP.
Be biased toward VARIANT over NEW — most sections should map to existing cards (the catalog is mature, ~90 cards). Collect proposedNewConcepts only for true NEW structures (propose, do NOT edit the JSON).
Likely-new candidates to scrutinize (NEW only if no structural match): a tabbed gallery where each tab shows image+stat+stars+review-count; a "N people viewing" live-viewer-count social-proof element (honesty-critical); an "iconic brands" logo trust row (only NEW if distinct from an existing press/media-logo strip).
${FORMAT_REFS}
Return ONLY the structured object.`,
      { label: `map:${p.slug}`, phase: 'Map', schema: MAP_SCHEMA },
    )
  },
)

const liveMaps = mapped.filter(Boolean)
log(`Mapped ${liveMaps.length}/${PAGES.length} page(s). Proposed new cards (pre-dedup): ${liveMaps.reduce((n, m) => n + (m.proposedNewCards?.length || 0), 0)}.`)

// ================= STAGE C: Reconcile + Dedup (single barrier) =================
phase('Reconcile')
const work = await agent(
  `You are the reconciliation authority for an ingest into the Boldteq ecom component library. You receive per-page mapping proposals. Produce ONE authoritative, de-duplicated work order.

READ FIRST: ${LIB}/.catalog-snapshot.tmp.txt (existing cards) and ${LIB}/_concept-section-map.json (existing concepts/tokens).

PER-PAGE MAPS (JSON array):
${JSON.stringify(liveMaps, null, 1)}

PAGE METADATA (id → slug, niche, pageType hints, dedup family):
${JSON.stringify(PAGES.map((p) => ({ slug: p.slug, niche: p.niche, dedupFamily: p.dedupFamily || null, canonicalOfFamily: !!p.canonicalOfFamily, productName: p.productName })), null, 1)}

CONTEXT: This is a 17-page BATCH. The library ALREADY has one EComposer template (ecomposer-lumismooth-body-shaver-landing) — this is NOT the first EComposer ingest. The batch spans 9 LANDING/PDP conversion templates + 8 multi-product HOMEPAGE/storefront templates (a page type the library has not banked before — bank its merchandising sections: category-nav grids, shop-by-recipient, multi-collection grids, featured-PDP-block, brand-story, routine steps, blog/editorial grid, lookbook/IG gallery).

RULES:
1. DEDUP-FAMILY COLLAPSE (explicit): pages sharing a "dedupFamily" are the SAME template recipe. Keep ONE canonical TEMPLATE RECORD per family = the page with canonicalOfFamily=true (or, if none, the first by PAGES order). The other family members do NOT get their own template record — instead, fold ANY unique section they contribute into the canonical record as variant appends, and add a dedupNote naming the collapsed slugs. Families this batch: "glowly-homepage" (10556 canonical + 10107/10104/10102 → collapse), "power-station-homepage" (7242 + 6877 → collapse to 7242, the Anker one, unless 6877 has materially distinct sections). Result: ~13–14 template records, NOT 17.
2. CROSS-PAGE CARD COLLAPSE: if two+ pages propose the same/equivalent new card, keep ONE canonical card; owner = first page (by PAGES order) that proposed it. Others reference that path as VARIANT/REUSE, never re-create it.
3. CATALOG RE-CHECK: any proposedNewCard that actually matches an existing card's concept/match_tokens → DEMOTE to a variant append on the existing card (remove from canonicalNewCards). Minimize true new cards — bias hard toward VARIANT. The mature catalog (~90 cards) already covers most hero/feature/testimonial/CTA/footer/comparison/FAQ structures.
4. NEW CATEGORY: mark newCategory=true when a canonical new card needs a category folder that doesn't exist yet (likely for genuinely-homepage-only structures: shop-by-recipient grid, category-nav grid, featured-PDP-embed block, lookbook/IG gallery — only if no existing card matches).
5. Every NON-collapsed page gets a template record — set its newCardPaths (cards it owns) and variantAppends (existing cards it appends to). The recruitment landings 7391 (ambassador) + 8733 (affiliate) are near-dups but BOTH get records (Yash's call) — share cards, the second is mostly variant deltas; add a dedupNote that they're a recipe pair.
6. Collect newConcepts (deduped) for MapAuthor and newNiches (no DNA pack) for Yash. New niches likely flagged: electronics-appliance (+ sub-verticals: oral-care device, drone, audio, charging accessory, hair-styling tool, portable-power), home-kitchen, gaming-hardware, personalized-gifts, partner-recruitment-landing, storefront-homepage-as-a-page-type. Add dedupNotes for every collapse/skip.
7. HONESTY: carry honesty=true on any canonical new card covering a badge/stat/scarcity/price/discount/OOS/live-viewer block. Homepage "97% satisfaction / 1M+ community / 2000+ customers / 200K satisfied" stat blocks and "Sold out" pills bind real data; recruitment "earn X commission" figures bind real program terms.
Return ONLY the structured object.`,
  { label: 'reconcile', phase: 'Reconcile', schema: RECONCILE_SCHEMA },
)

log(`Work order: ${work.templates.length} template record(s) · ${work.canonicalNewCards.length} new card(s) · ${work.newConcepts.length} new concept(s) · ${work.newNiches.length} new niche(s) flagged.`)

// ================= STAGE D: Author Writes =================
// D1: canonical new cards (disjoint files → parallel). D2: template records (disjoint → parallel).
// D3: variant appends + all index/log writes → SINGLE serialized index writer (after D1/D2).
phase('Author')

// D1 — new cards (one agent per card; disjoint files)
await parallel(work.canonicalNewCards.map((c) => () => {
  const ownerPage = PAGES.find((x) => x.slug === c.ownerSlug)
  const ownerUrl = ownerPage ? url(ownerPage) : ''
  return agent(
    `Write ONE new component card for the Boldteq ecom library at ${LIB}/${c.path}.

Card spec: concept "${c.concept}", rung ${c.rung}, conversion job: ${c.conversionJob}. Owner page: ${c.ownerSlug}${ownerUrl ? ` (${ownerUrl})` : ''}.
${c.newCategory ? `This needs a NEW category folder — create ${LIB}/${c.path.replace(/\/[^/]+$/, '/_index.md')} too (H1 category + 1-para description + table header + this card's row).` : `Append this card's row to the existing category _index.md.`}
Re-fetch the owner page (its /preview URL) if you need the real structure. Match the card format EXACTLY (read the reference). Semantic accessible HTML (ARIA, no inline styles), mobile-first CSS custom props, optional JS as a custom element.

MATCH-GUIDANCE ENRICHMENT (REQUIRED — this is how agents find the card at 500+ scale): immediately AFTER the "**Category:** · **Concept:** · **Rung:**" header line, add a second metadata line:
**Section family:** <one of the 10 families in ${LIB}/_section-taxonomy.json — read it and pick the family whose member categories include this card's category> · **Use when:** <one concrete sentence: the buyer-funnel moment / page job this section does> · **Matches section names:** <3-6 comma-separated aliases a builder might call this section, e.g. "buy box", "add to cart", "purchase block", "product CTA">
Then keep the existing "**Conversion job:**" paragraph as-is. The family MUST match where this card's category sits in _section-taxonomy.json (if the category is brand-new, pick the best-fit family and note it — the index writer will register it).
${c.honesty ? 'HONESTY: this card carries real-data binding (countdown/scarcity/price/discount/BNPL/test-cert/OOS/live-viewer-count/award). Placeholder figures must be clearly bound to real store/provider data + real ISO deadline, never invented. A "N people viewing" element must bind a real concurrency feed or be OMITTED — never a random/incrementing fake. State this in "## Responsive notes".' : ''}
${FORMAT_REFS}
Write the file(s). Return a one-line confirmation of the path(s) written.`,
    { label: `card:${c.path.split('/').pop()}`, phase: 'Author' },
  )
}))

// D2 — template records (one agent per page; disjoint files)
await parallel(work.templates.map((t) => () => {
  const m = liveMaps.find((x) => x.slug === t.slug)
  const p = PAGES.find((x) => x.slug === t.slug)
  return agent(
    `Write the full template record at ${LIB}/templates/${t.slug}.md for this ingested EComposer page.

PAGE: ${url(p)}  ·  builder: ${BUILDER}  ·  niche: ${m?.niche}  ·  pageType: ${m?.pageType}
This page OWNS new cards: ${JSON.stringify(t.newCardPaths)} and appends variants to: ${JSON.stringify(t.variantAppends)}.
Its mapped sections (authoritative):
${JSON.stringify(m?.mappedSections, null, 1)}

The library already holds many EComposer templates (LANDING/PDP/HOMEPAGE) — do NOT claim any "first EComposer" or "first homepage" milestone.${p?.nonEcom ? ' NOTE: this page is NON-ECOM (service business / agency case-study) — in "## Niche note" mark it clearly as OUT of the core ecom domain (structure banked for reuse, but not an ecom conversion recipe); flag the niche for Yash.' : ''}${p?.dedupFamily ? ` NOTE: this page belongs to dedup-family "${p.dedupFamily}"${p?.canonicalOfFamily ? ' and is the CANONICAL record for it — fold the family\'s collapsed siblings\' unique sections in as variant appends and name the collapsed slugs in the brief.' : ' — if you were asked to write this record it is the canonical owner.'}` : ''}

Match the template-record format EXACTLY (read ${LIB}/templates/seal-gem-road-bike-landing.md): H1 "# Template — <Name>", Slug/URL/Niche/Page type, 1-para brief, the "## Ordered section list → component mapping" table, "## New cards written", "## New category _index.md introduced", "## Proposed new concepts (kebab)" (propose only — do NOT edit the JSON), "## Variant appends made (target + delta)", "## Niche note", "## pageType".
For "## Niche note": if niche "${m?.niche}" is new to the library, write "Structure banked · no DNA pack yet — apply the closest existing DNA pack (name it) and escalate niche-specific taste to Yash." Carry the honesty constraints for any badge/stat/scarcity/price/discount/OOS/viewer-count/award sections this page has.
For "## pageType": state whether this is PDP / LANDING / FUNNEL / HOMEPAGE / service-business / case-study and what distinguishes it. If HOMEPAGE, list the merchandising sections it banks (category-nav, shop-by-recipient, multi-collection grids, featured-PDP-embed, brand-story, routine steps, blog grid, lookbook/IG gallery).
${FORMAT_REFS}
Write the file. Return a one-line confirmation.`,
    { label: `tmpl:${t.slug}`, phase: 'Author' },
  )
}))

// D3 — variant appends + ALL shared index/log writes (SINGLE writer, serialized, runs after D1/D2)
phase('Author')
const allVariantAppends = []
for (const m of liveMaps) for (const s of (m.mappedSections || [])) if (s.decision === 'VARIANT') allVariantAppends.push({ slug: m.slug, card: s.componentPath, delta: s.variantDelta, section: s.name })

await agent(
  `You are the SINGLE index/variant writer for this EComposer ingest — you own every shared file so there are no write races. Do these in order:

1. VARIANT APPENDS — for each entry below, append a new variant block under the target card's "## Variants" section (Delta HTML + Delta CSS only, rung unchanged, cite the source page §section using THAT entry's own slug as "${BUILDER} — <entry.slug> §<entry.section>"). Replace the "_Append future templates' versions here._" placeholder only if present; never duplicate an existing variant. Many entries hit the SAME target card from different pages — append each as a distinct variant block (do not overwrite). Carry the honesty note into any variant touching a badge/stat/scarcity/price/discount/OOS/viewer-count block.
${JSON.stringify(allVariantAppends, null, 1)}

2. CATEGORY _index.md — for any card written this batch (new cards in ${JSON.stringify(work.canonicalNewCards.map((c) => c.path))}), ensure its category _index.md table has a row. The new-card authors created new-category indexes; you reconcile EXISTING category indexes additively (add missing rows only).

3. MASTER INDEX — update ${LIB}/components/_index.md: add any new categories and add rows to the "New niches surfaced" table for: ${JSON.stringify(work.newNiches)} (each "Structure banked · no DNA pack yet").

4. INGEST LOG — append to ${LIB}/components/_templates-ingested.md one table row per written template (${JSON.stringify(work.templates.map((t) => t.slug))}) with Date ${TODAY}, **Builder ${BUILDER}**, correct Page type + niche + section count + Record link. Then in the DEDUP/SKIP block at the bottom add the notes: ${JSON.stringify(work.dedupNotes)}. Add a one-line batch note describing what this batch added (page types + any new niches: ${JSON.stringify(work.newNiches)}).

5. SECTION TAXONOMY — for EVERY new category folder created this batch (any new path in ${JSON.stringify(work.canonicalNewCards.filter((c) => c.newCategory).map((c) => c.path))}), open ${LIB}/_section-taxonomy.json and add the category NAME to the "categories" array of its best-fit family (Hero/Social-Proof/Benefits/Product-Detail/Comparison/Offer-Pricing/Urgency-Conversion/Merchandising/Content/Logistics-Chrome). Bump that family's count and _meta.categories_mapped. Keep every category in exactly ONE family. Validate the JSON still parses (node JSON.parse). This keeps the 500+-scale matcher complete.

Read the format references first. ${FORMAT_REFS}
Do NOT touch _concept-section-map.json (the MapAuthor stage owns it). Return a summary of files written (incl. which categories were added to which taxonomy family).`,
  { label: 'index-writer', phase: 'Author' },
)

// ================= STAGE E: Map Author (single writer of _concept-section-map.json) =================
phase('MapAuthor')
await agent(
  `You are the SOLE author of ${LIB}/_concept-section-map.json for this ingest. Add the new concepts below as well-formed entries, then verify the file still parses as valid JSON.

NEW CONCEPTS TO RESOLVE:
${JSON.stringify(work.newConcepts, null, 1)}

For each: add "<key>": { "minimog_sections": [...], "dawn_sections": [...], "rung": "<REUSE|CONFIGURE|EXTEND|LIBRARY|CUSTOM>", "match_tokens": [...], "notes": "<placement + CRO + which theme section hosts it, or LIBRARY if custom>" }.
- If neither Minimog nor Dawn ships a native section → rung LIBRARY, list the closest host section(s) (e.g. custom-liquid, multicolumn, collapsible-content) in notes.
- A live-viewer-count concept is LIBRARY (no native section) — its notes MUST state it binds a real concurrency feed or is omitted, never faked.
- Keep _meta, $schema_version, and all existing entries intact. Do not reorder or remove anything.
- match_tokens must be discriminative (the mapper uses them) and not collide destructively with existing concepts.
After editing, run \`node -e "JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude/memory/design/ecom/component-library-premium/_concept-section-map.json','utf8')); console.log('VALID')"\` and report the result.
Return the list of concept keys added + JSON validity.`,
  { label: 'map-author', phase: 'MapAuthor' },
)

// ================= STAGE G: Verify =================
phase('Verify')
const verdict = await agent(
  `You are the verification gate for this EComposer ingest into ${LIB}. Run READ-ONLY checks and report PASS/FAIL per item with evidence.

1. NO DUP CARDS — for each new card path ${JSON.stringify(work.canonicalNewCards.map((c) => c.path))}: exactly one file exists, exactly one _index.md row references it, and no two template records both claim it under "## New cards written". (grep)
2. PATHS RESOLVE — every component path referenced in every templates/*.md written this batch (${JSON.stringify(work.templates.map((t) => t.slug))}) exists on disk. List any dangling path.
3. VARIANT APPENDS LANDED — each claimed variant append produced a real new block under the target card's "## Variants". Where multiple pages append to the SAME card, confirm each is a DISTINCT block (none overwrote another).
4. CONCEPTS — every new concept ${JSON.stringify(work.newConcepts.map((c) => c.key))} now appears in _concept-section-map.json; no template file edited the JSON.
5. JSON VALID — _concept-section-map.json parses; _meta + $schema_version intact; not truncated. (run node JSON.parse)
6. INDEXES + LOG — _templates-ingested.md has a row per written template (${work.templates.length} expected) + the DEDUP/SKIP notes; _index.md "New niches surfaced" updated; new categories have _index.md.
7. HONESTY — every badge/stat/scarcity/price/discount/OOS/live-viewer-count card written carries the honest-by-construction note in "## Responsive notes". Any live-viewer-count element explicitly states "bind real concurrency feed or omit — never invented".
8. NICHES FLAGGED — new niches ${JSON.stringify(work.newNiches)} appear as "Structure banked · no DNA pack"; nothing was written under niche-dna-packs/. (ls)
9. DEDUP COLLAPSE — any dedup-family in this batch produced exactly ONE template record (no per-sibling -vN records on disk); collapsed slugs appear in the DEDUP/SKIP block. (ls templates/ + grep)
10. CLAIMS ACCURATE — any milestone wording added to _index.md or the ingest log must be literally TRUE. Do NOT assert "first" anything that already exists (homepages, EComposer templates, non-GemPages builders all already exist). Flag overstated wording as a FAIL with the exact line.
11. ENRICHMENT — every NEW card written this batch (${JSON.stringify(work.canonicalNewCards.map((c) => c.path))}) carries the match-guidance line "**Section family:** … · **Use when:** … · **Matches section names:** …" right after its Category/Concept/Rung header. (grep "Section family:")
12. TAXONOMY COVERAGE — every new category folder created this batch appears in exactly one family's "categories" array in _section-taxonomy.json, and the JSON still parses. Run: node scripts/build-section-index.mjs --check (from the Polyglot repo) — it must report "no drift" (exit 0). If it lists unmapped categories, that's a FAIL.

Use Bash grep/ls/node + Read. Return a checklist with PASS/FAIL + the specific defect for any FAIL.`,
  { label: 'verify', phase: 'Verify' },
)

log('EComposer ingest complete.')
return {
  builder: BUILDER,
  pagesProcessed: liveMaps.length,
  templateRecords: work.templates.length,
  newCards: work.canonicalNewCards.length,
  newConcepts: work.newConcepts.map((c) => c.key),
  newNichesFlagged: work.newNiches,
  dedupNotes: work.dedupNotes,
  verification: verdict,
}
