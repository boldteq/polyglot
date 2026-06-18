export const meta = {
  name: 'pagepilot-component-cards',
  description: 'Author clean, semantic, theme-agnostic reusable HTML/CSS/JS component cards for the 15 PagePilot concepts, GROUNDED in the live rendered DOM captured by scripts/pagepilot/capture-dom.mjs (.research/pagepilot/dom/) + screenshots. One card per concept, written to ~/.claude/memory/design/ecom/pagepilot-library/components/<family>/<concept>.md, mirroring the component-library-premium card format (Layout / HTML / CSS / JS / Responsive / Variants). Agents TRANSLATE the rendered Tailwind+inline-token markup into clean semantic markup + mobile-first CSS custom properties — they never paste Tailwind utility soup, data-block-id, or @container utilities. Then a single index writer + an adversarial verifier. STRUCTURE-ONLY: generic placeholder copy, real data-bearing elements (price/stat/review/scarcity) flagged "bind real data, never invent". DTC PDP/advertorial scope.',
  phases: [
    { title: 'Cards', detail: 'one agent per concept: read the matching captured DOM section(s) + screenshot → author a clean semantic theme-agnostic HTML/CSS/JS reusable card' },
    { title: 'Index', detail: 'write components/_index.md (family-grouped table) + link it from the library _index.md' },
    { title: 'Verify', detail: 'adversarial read-only: every concept has a card, HTML is clean (no data-block-id/data-testid/@3xl utility soup), CSS uses custom props, honesty (no real copy banked, data-bearing flagged)' },
  ],
}

const REPO = '/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot'
const DOM = `${REPO}/.research/pagepilot/dom`
const SHOTS = `${REPO}/.research/pagepilot/shots`
const LIB = '/Users/yashbaldha/.claude/memory/design/ecom/pagepilot-library'
const PREMIUM_CARD = '/Users/yashbaldha/.claude/memory/design/ecom/component-library-premium/components/bnpl-financing/bnpl-financing-tabs.md'

const HONESTY = `HONESTY: cards are reusable STRUCTURE. Use GENERIC placeholder copy ("Benefit headline", "Customer quote") — never bank the real product copy from the source pages as if validated. Any price / compare-at / stat-% / review-count / scarcity / "as seen on" logo / guarantee element must be marked "bind real data, never invent" in Responsive notes. Scope = DTC dropshipping PDP/advertorial.`

const CARD_RULES = `CARD AUTHORING RULES (this is the whole point — produce CLEAN reusable code, NOT scraped soup):
- TRANSLATE the rendered structure into clean, semantic, accessible HTML5 (section/figure/ul/button/details, ARIA where needed). Theme-agnostic so it drops into a Liquid theme OR a React/Next app.
- DO NOT copy: Tailwind utility classes, \`@3xl:\`/\`@container\` utilities, \`data-block-id\`, \`data-testid\`, \`pp-*\` classes, or the inline \`style="--x: 10px"\` token dumps. Use a few semantic BEM-ish class names instead.
- CSS: mobile-first, CSS custom properties for the tokens you keep (spacing/color/radius), accessible :focus-visible states, a real responsive breakpoint. No inline styles. No framework dependency.
- JS only if the component needs it (accordion toggle, carousel, sticky observer) — vanilla, progressive-enhancement, as a small self-contained snippet.
- Keep it production-grade but minimal — quality over volume (no dead markup).`

// 15 concepts (from pagepilot-library/_concept-section-map.json) → family folder + DOM match hint.
const CONCEPTS = [
  { key: 'buy-module-hero', family: 'buy-module', zone: 'top', hint: 'pagepilot_product_information / "Product Information" (gallery + title + price + variant_picker + quantity + buy_buttons + accelerated_checkout)' },
  { key: 'rotating-benefit-ticker', family: 'benefits', zone: 'upper-mid', hint: '"Rotating Benefits" / pagepilot_rotating_content ticker' },
  { key: 'benefit-framing-block', family: 'benefits', zone: 'upper-mid', hint: '"Image with Text" / "Image with Benefits" image+copy framing blocks' },
  { key: 'benefit-grid', family: 'benefits', zone: 'mid', hint: '"Benefits" / "Why It Works" / "Product Highlights" icon_with_text_list grids' },
  { key: 'mechanism-ingredient-education', family: 'education', zone: 'mid', hint: '"Why Choose Us?" / "Image with Timeline" / mechanism + ingredient education' },
  { key: 'quantified-social-proof', family: 'social-proof', zone: 'mid', hint: '"Image with Percentage" / "Statistics With Percentages" / pagepilot_percentage_circle stat rings' },
  { key: 'ugc-crowd-proof', family: 'social-proof', zone: 'mid', hint: '"Customers Images Carousel" / "Video Testimonials" UGC carousel' },
  { key: 'borrowed-authority', family: 'social-proof', zone: 'lower-mid', hint: '"As Seen On" / "As Seen On with Quotes" press/logo rotating strip' },
  { key: 'social-proof-wall', family: 'social-proof', zone: 'bottom', hint: '"Reviews Grid" (masonry) / "Reviews Carousel" review_card walls' },
  { key: 'comparison-us-vs-them', family: 'comparison', zone: 'lower-mid', hint: '"Product Differences" / pagepilot_product_differences us-vs-them table' },
  { key: 'objection-handling-faq', family: 'faq', zone: 'lower-mid', hint: '"FAQ" / "Frequently Asked Questions" accordion' },
  { key: 'risk-reversal-guarantee', family: 'guarantee', zone: 'bottom', hint: '"Happiness Guarantee" / "Guarantee with Social Proof" / "Call to Action" risk-reversal block' },
  { key: 'cross-sell-aov', family: 'cross-sell', zone: 'bottom', hint: '"Recommended Products" / pagepilot_product_card cross-sell row' },
  { key: 'persistent-conversion-sticky', family: 'sticky-atc', zone: 'sticky', hint: '"Sticky Add to Cart" pinned bar' },
  { key: 'section-spacer-divider', family: 'layout', zone: 'any', hint: '"Shape Divider" decorative SVG/shape divider (minimal card)' },
]

const cardPrompt = (c) => `You are elio (ecom designer) authoring ONE reusable, theme-agnostic component card for the PagePilot structure library.

CONCEPT: \`${c.key}\` · family: ${c.family} · placement zone: ${c.zone}
Source component: ${c.hint}

GROUND IT IN THE REAL RENDERED DOM:
1. Read "${DOM}/_sections-index.json" → find the 1-3 sections whose sectionType + name best match this concept (use the hint).
2. Read those section HTML files ("${DOM}/<slug>/<file>") — this is the LIVE rendered markup (Tailwind v4 + inline CSS-var tokens). Read 1-2 matching screenshots too ("${SHOTS}/<slug>-desktop.png") for visual layout.
3. Read the concept entry in "${LIB}/_concept-section-map.json".
4. Read the FORMAT reference card (match its section structure exactly): "${PREMIUM_CARD}".

WRITE the card to: "${LIB}/components/${c.family}/${c.key}.md"

Exact structure:
# <Human Title>
**Concept:** ${c.key}  ·  **Family:** ${c.family}  ·  **Placement zone:** ${c.zone}
**Conversion job:** <one sentence — what this component does for conversion>
**Source:** PagePilot <page slugs> §<section names> (structure only)

## Layout
<structural description: columns, blocks, interactivity, hierarchy>

## HTML
<CLEAN semantic accessible HTML — generic placeholder copy, ARIA, theme-agnostic>

## CSS
<mobile-first, CSS custom properties, :focus-visible, one responsive breakpoint; no inline styles>

## JS
<vanilla snippet only if needed — accordion/carousel/sticky; else "None.">

## Responsive notes
<mobile behavior + honesty: which elements must bind REAL data, never invent>

## Variants
<structural deltas you saw across the matching pages>

${CARD_RULES}

${HONESTY}

Report the file path you wrote.`

const indexPrompt = `You are decoder. Write the component-card index and link it from the library root.

1) WRITE "${LIB}/components/_index.md":
# PagePilot Component Cards — Reusable Structure
Intro: clean theme-agnostic reusable cards translated from 8 PagePilot DTC PDP/advertorial templates; STRUCTURE only (scope + honesty banner: generic copy, data-bearing elements bind real data, DTC scope NOT SaaS/B2B). One table, grouped by family (buy-module, benefits, education, social-proof, comparison, faq, guarantee, cross-sell, sticky-atc, layout):
| Component | Concept | Family | Placement zone | Conversion job |
List all 15 concept cards: ${CONCEPTS.map((c) => `${c.family}/${c.key}`).join(', ')} (link each to its \`<family>/<key>.md\`).

2) APPEND a "## Component cards" subsection to "${LIB}/_index.md" (Read it first; append at end) linking to \`components/_index.md\` and noting "15 reusable HTML/CSS/JS cards translated from the live DOM (clean, theme-agnostic) — see capture via scripts/pagepilot/capture-dom.mjs".

${HONESTY}
Report what you wrote.`

const verifyPrompt = `You are an adversarial verifier (sage). READ-ONLY. Verify the PagePilot component cards. PASS/FAIL per check + evidence.

1. All 15 concept cards exist under "${LIB}/components/<family>/<key>.md" for: ${CONCEPTS.map((c) => `${c.family}/${c.key}`).join(', ')}.
2. CLEAN-CODE check (spot-check 4 cards incl. buy-module-hero + social-proof-wall): the HTML/CSS blocks must NOT contain \`data-block-id\`, \`data-testid\`, \`pp-group\`/\`pp-\` classes, \`@3xl:\` / \`@container\` utilities, or inline \`style="--...token dumps"\`. They MUST use semantic tags + CSS custom properties. Report any violation verbatim.
3. Each card has all sections: Layout / HTML / CSS / JS / Responsive notes / Variants.
4. HONESTY: cards use GENERIC placeholder copy (no real product copy banked as validated); data-bearing elements (price/stat/review/scarcity/as-seen-on/guarantee) carry a "bind real data" note. Grep for fabricated metrics — none allowed.
5. components/_index.md lists all 15 + library _index.md links it.
6. NON-POLLUTION: confirm nothing was written under component-library-premium (grep that dir for "pagepilot" → 0).

End with OVERALL VERDICT: PASS or FAIL + any fixes.`

// ---------- ORCHESTRATION ----------
phase('Cards')
await parallel(CONCEPTS.map((c) => () => agent(cardPrompt(c), { label: `card:${c.key}`, phase: 'Cards' })))

phase('Index')
await agent(indexPrompt, { label: 'index', phase: 'Index' })

phase('Verify')
const verdict = await agent(verifyPrompt, { label: 'verify', phase: 'Verify' })

return { cards: CONCEPTS.length, families: [...new Set(CONCEPTS.map((c) => c.family))], verdict }
