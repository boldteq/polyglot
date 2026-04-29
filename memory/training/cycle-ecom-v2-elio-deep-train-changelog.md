# Elio Deep Training v2 — Changelog

**Date:** 2026-04-29
**Cycle:** ecom-v2-elio
**Source intel:** commercecream.com (37 DTC brands across beauty / clothing / food / supplements)
**Format:** Q&A popup rounds — Round 1 foundation + Round N brand teardowns
**Parallel impact:** patches also affect catalyst (CRO Lead), spark (above-fold copy), merch (on-page copy), decoder (intel) where relevant

## Brand catalog (source material)

### Beauty (8)
Prose · Mother Science · snif · D.S. & Durga · Experiment Beauty · DedCool · Rhode · Lip Lab

### Clothing (14)
Overtime · Trojan WSS · LESTRANGE · Evewear · OFFHOURS · DNO · Outdoor Voices · Aisle · Kith · Recess · Khy · Ugmonk · Bombas · Rains

### Food / CPG (15)
Colour Mill · IKU · Oh Snap! Pickles · Mistercap's · Red Clay Hot Sauce · Porter Road · Magic Spoon · Exo Protein · Olly's Snacks · Yellowbird · Cabi · Chomps · Mercado Famous · Flings · Future Noodles

---

## Round 1 — Foundation Q&A (4 questions)

### ELI-DT2-001 — Hero Default = Editorial Lifestyle
**Decision:** Single static editorial/lifestyle image + bold headline + primary CTA across niches.
**Rationale:** Rhode, Outdoor Voices, Bombas, DedCool all use this. Brand-led DTC = lifestyle hero converts better than product-on-white. No carousel (slides 2+ near-zero engagement per ELI-008). No auto-video.
**Override:** Per-niche flips when brief explicitly requires (CPG = product-forward; luxury fashion = motion hero — vega ratifies).
**Cross-impact:** spark must write hero copy that matches editorial tone. decoder must capture hero pattern in every teardown.

### ELI-DT2-002 — PDP Default = Single-Stack Mobile-First
**Decision:** Gallery TOP, info BELOW on ALL devices. Reinforces ELI-001.
**Rationale:** 60-70% mobile traffic. One layout = lower maintenance. Glossier / Aritzia / Cuyana pattern.
**Override:** Sticky-rail variant for long-form PDPs (supplements with ingredient cards, Prose-style personalization). Split-screen ONLY when brief explicitly mandates fashion-premium positioning AND has decoder evidence (≥3 split-layout brand competitors in same niche).
**Cross-impact:** figma-synth canonical PDP component-set ships single-stack default with sticky-rail variant.

### ELI-DT2-003 — Niche-Adaptive DNA Pack
**Decision:** Pre-built design DNA presets per niche. Elio picks pack on brief intake.
**5 DNA packs (to be authored W2):**
1. **Beauty DNA** — type: serif display + sans body / motion: gentle fades / image: editorial close-up / density: airy
2. **Apparel DNA** — type: clean sans / motion: subtle / image: lifestyle full-bleed / density: medium
3. **Supplements DNA** — type: sans + ingredient-card serif / motion: data-card reveals / image: clinical + lifestyle / density: dense (info-rich)
4. **CPG/Food DNA** — type: bold display + casual sans / motion: playful / image: product-forward + lifestyle / density: bold blocks
5. **Luxury DNA** — type: serif display + light sans / motion: slow + cinematic / image: full-bleed + minimalist / density: extreme whitespace
**Rationale:** Speed + consistency. No reinvention per project. Vega ratifies pack choice on brief intake.
**Cross-impact:** token must ship matching token bundles per DNA pack (5 starter token sets).

### ELI-DT2-004 — Spec Output = Code-Ready JSON + Figma
**Decision:** Every Elio deliverable = structured JSON spec + Figma frames + code-connect mappings.
**JSON contract:**
```json
{
  "agent": "elio",
  "surface": "pdp" | "cart" | "checkout" | "listing" | "hero" | ...,
  "stack": "B" | "C",
  "dna_pack": "beauty" | "apparel" | "supplements" | "cpg" | "luxury",
  "zones": [{ "id": "...", "components": [...], "responsive": {...}, "states": [...] }],
  "copy_slots": [{ "id": "...", "owner": "spark" | "merch", "char_limit": N }],
  "mechanic_slots": [{ "id": "...", "owner": "ecom-cro", "spec": "..." }],
  "token_requests": ["..."],
  "components": ["ComponentName", ...],
  "figma_node_ids": ["..."],
  "kb_updates": ["design/ecom/[file].md"]
}
```
**Rationale:** Pod-frontend reads JSON for component contract; figma-synth uses figma_node_ids for code-connect; zero translation loss between design and implementation.
**Cross-impact:** figma-synth handoff schema aligns. pod-b-frontend + pod-c-frontend consume JSON directly.

---

## Round 11 — Reviews + UGC + Search + Email Capture

### ELI-DT2-R11-001 — Reviews = Above-Fold Snippet + Below-Fold Full Module
Above-fold: '4.8★ 12,400 reviews' compact snippet next to product title (clickable, jumps to full module). Below-fold: full module with photos/sort/filter. Decoder bank: 8-15% lift.
**Cross-impact:** ReviewSnippet + ReviewModule canonical components. PDP zone spec updated.

### ELI-DT2-R11-002 — UGC = Below Reviews + Shop-the-Look Tagging
UGC gallery below reviews module. Each image tags products in photo → click-to-PDP. 6-12 images visible. 'Tag us @brand' CTA. Drives discovery + AOV. Reference: OV, Aritzia, Glossier.
**Cross-impact:** UgcGallery canonical with product-tag overlay. ecom-cro tag-mapping protocol.

### ELI-DT2-R11-003 — Search = Full-Screen Overlay + Live + Recent + Popular
Mobile: full-screen overlay. Desktop: dropdown panel. Empty state: recent searches + popular searches + featured products. On type: live results (debounce 300ms). Reference: Nike, Aritzia, Sephora.
**Cross-impact:** SearchOverlay canonical. ecom-cro popular-search query + recent-search localStorage logic.

### ELI-DT2-R11-004 — Email Capture = Footer + Delayed 45s Pop-up + Niche Incentive
Footer always-visible. Pop-up delayed 45s after first visit (not on cart/checkout), dismissible, 30-day cookie. Incentive: 10-15% off first order (apparel/beauty/CPG) OR free guide (supplements/personalization). Decoder bank: 4-8% capture.
**Cross-impact:** sequence consumes captures into welcome series. spark writes pop-up + footer copy. ecom-cro owns trigger logic.

---

## Round 10 — UX Element Deep-Dives

### ELI-DT2-R10-001 — Sticky ATC = IntersectionObserver + Fade In/Out
Sticky bar appears when main ATC scrolls out of viewport (IntersectionObserver threshold 0). Fade-in 200ms. Hides when main ATC re-enters viewport. Clean, non-jarring.
**Cross-impact:** StickyAtc canonical implementation. mobile-ecom-patterns.md authoritative.

### ELI-DT2-R10-002 — Mobile Gallery Swipe = CSS scroll-snap (No JS)
`scroll-snap-type: x mandatory` + `scroll-snap-align: start` per image. iOS momentum native. Zero JS bundle weight. Perfect performance.
**Cross-impact:** GalleryComponent uses CSS scroll-snap as default. Fallback to JS only when explicit reason.

### ELI-DT2-R10-003 — Desktop Image Zoom = Niche-Adaptive
Apparel/fashion: hover-magnify loupe. Beauty/supplements/CPG: click-to-lightbox. Different niches, different inspection patterns.
**Cross-impact:** ProductGallery component variant by DNA pack. motion-interaction-patterns.md updated with niche split.

### ELI-DT2-R10-004 — OOS Variant = Strikethrough + Opacity 0.4 + Hover Label
Diagonal strikethrough (CSS linear-gradient) + opacity 0.4 + hover/tap shows 'Sold out' label. Tap = no-op. Customer sees option exists but unavailable. Reference: Glossier, Rhode.
**Cross-impact:** VariantSelector OOS state spec. listing-category-patterns.md badge rules + PDP variant rules aligned.

---

## Round 9 — CRO Mechanic Deep-Dives (Catalyst + Spark + ecom-cro parallel impact)

### ELI-DT2-R9-001 — Free-Shipping Bar = Top of Cart + 3 States + Positive Frame
Top of cart drawer (always visible). 3 states: 'Add $X for free shipping' / 'Almost! $X away' (amber) / 'Free shipping unlocked!' (green). Positive framing > negative. Decoder bank: AOV +15-30%.
**Cross-impact:** ecom-cro owns threshold formula (1.4× median AOV). merch writes 3-state copy (cart-checkout-microcopy.md). FreeShipBar canonical component.

### ELI-DT2-R9-002 — Cart Upsell Logic = Hybrid Shopify Recs + Manual Override
Default = Shopify product.recommendations API (RELATED intent). Merchandiser pins 1-3 manual products per category. Best of both: scale + control.
**Cross-impact:** ecom-cro upsell config schema = `{algorithmic: true, manual_pinned: ['gid://...']}`. Pod-frontend reads config.

### ELI-DT2-R9-003 — Hero CTA = Single Primary
One hero CTA only above fold. No secondary CTA. Decoder bank: single CTA outperforms dual by 8-15%. Reference: Rhode, Glossier, OV.
**Cross-impact:** spark hero CTA = single string. catalyst rejects dual-CTA briefs without override docs.

### ELI-DT2-R9-004 — Exit-Intent = Desktop Only, Mouse-Leave Trigger
Trigger: cursor moves toward browser top edge. Mobile = NO exit-intent. First visit only, dismissible, 7-day cookie. Decoder bank: 4-8% bounce save.
**Cross-impact:** ecom-cro exit-intent module is desktop-gated. spark writes overlay copy. Reject mobile exit-intent in catalyst review.

---

## Round 8 — Fragrance (DedCool / snif / D.S. & Durga)

### ELI-DT2-R8-001 — Fragrance Hero = Abstract Sensory Visual + Bottle Macro Inset
Sensory-first because fragrance can't be smelled online. Hero evokes scent (smoke / florals / liquid pour / ingredient close-up) + bottle as small inset. Reference: snif, DedCool, D.S. & Durga, Le Labo.
**Cross-impact:** Fragrance sub-DNA pack hero spec. token Fragrance pack ships moody/sensory color tokens.

### ELI-DT2-R8-002 — Fragrance PDP = Top/Heart/Base Notes Diagram + Family Tag
3-tier note pyramid (top notes → heart → base) with each note as ingredient card. Plus scent family tag ('Woody', 'Citrus Floral', 'Gourmand'). Industry-standard scent communication.
**Cross-impact:** ScentNotePyramid + ScentFamilyTag canonical components. merch writes per-note descriptive copy.

### ELI-DT2-R8-003 — Fragrance Sales Model = Sample Variant + Credit-Forward
PDP variant selector includes: Sample (2ml $5) / Travel (10ml $25) / Full (50ml $90). Sample purchase = $5 credit toward full size. Decoder bank: 30-50% sample-to-full conversion. Reference: snif, DedCool, D.S. & Durga.
**Cross-impact:** ecom-cro owns sample-to-full credit logic. spark writes 'Try before you buy' CTA. SampleVariantSelector canonical.

### ELI-DT2-R8-004 — Fragrance Reviews = Scent Tags + Skin Chemistry Note
Standard review + scent attribute tags ('Long-lasting', 'Subtle', 'Sweet', 'Fresh') + 'Skin type' field (oily/dry/normal). Tags help filter. Reference: Dossier, Oakcha.
**Cross-impact:** ReviewsWithScentTags variant for fragrance PDPs. ecom-cro tag taxonomy.

---

## Round 7 — Supplements (AG1 / Ritual anchor)

### ELI-DT2-R7-001 — Supplements Hero = Product + Science Credibility Strip
Hero = single product macro + outcome headline ('Energy. Focus. Recovery.') + below-fold immediate trust strip (NSF / B Corp / clinical study count + 'X scientists / Y clinical studies'). Trust gate is supplement-specific — required.
**Cross-impact:** Supplements DNA pack hero locked. ScienceCredibilityStrip canonical component.

### ELI-DT2-R7-002 — Supplements PDP = Full Ingredient Cards
Each active ingredient = its own visual card with: name, dosage in mg, source (e.g., 'Vitamin C from organic acerola cherries'), 1-line 'why we use it', supporting study link. Decoder bank: 12-20% trust lift. Reference: AG1, Ritual, Mother Science.
**Cross-impact:** IngredientCard canonical component. merch writes per-ingredient copy template.

### ELI-DT2-R7-003 — Supplements Above-ATC Trust Strip = Cert + Clinical + Reviews
Compact strip: NSF/B Corp/USDA Organic icon row + 'Backed by X clinical studies' + '4.8★ 12,400 reviews'. ABOVE ATC (skeptical-niche placement per ELI-004). Reference: AG1/Ritual.
**Cross-impact:** Supplements PDP places trust strip ABOVE ATC (ELI-004 reinforced). figma-synth canonical TrustStrip variant.

### ELI-DT2-R7-004 — Supplements Subscription = Monthly + 20-25% Off + Skip-First
Frequency: Monthly default (matches supply duration). Savings: 20-25% off. 'Skip first order' lowers commitment friction. Reference: AG1, Ritual, Athletic Greens.
**Cross-impact:** ecom-cro supplements subscription default config. spark writes 'Subscribe & save 20-25%' label + 'Skip first order' CTA.

---

## Round 6 — Prose teardown (personalization-led beauty)

### ELI-DT2-R6-001 — Personalization Hero = Quiz-First (Not Shop-First)
Hero CTA = 'Take the quiz' (not 'Shop'). Catalog hidden until post-quiz. Quiz IS the product. Reference: Prose, Curology, Function of Beauty, Care/of.
**Cross-impact:** Personalization sub-DNA (variant of Beauty DNA) hero = quiz-first. spark hero copy must lead with quiz invitation.

### ELI-DT2-R6-002 — Personalization Quiz = 8-12 Steps + Progress + Branching
Long enough for real personalization, short enough to complete. Visual progress bar. Branch logic skips irrelevant questions. Email capture at step 8-10 (after investment-cost). Reference: Prose, Curology.
**Cross-impact:** ecom-cro owns quiz state machine + branching logic. merch writes question copy with progressive engagement principle.

### ELI-DT2-R6-003 — Personalization PDP = Custom Hero + Formula Card
'Hi [Name], here's your formula' headline + ingredient cards explaining each ingredient based on quiz answers + custom-label bottle mockup. Maximum perceived value. Reference: Prose, Function of Beauty.
**Cross-impact:** Personalization PDP variant ships PersonalizedFormulaCard component. figma-synth canonical mapping added.

### ELI-DT2-R6-004 — Personalization Subscription = Subscribe-Default OK (Verified ELI-010)
Personalization brands typically meet ELI-010 conditions (LTV-sub >3x, cancel-save flow, self-serve pause). Subscribe-default acceptable WITH ELI-010 verification documented in handoff. Reference: Prose, Curology, AG1.
**Cross-impact:** ELI-010 carve-out documented. ecom-cro verification gate for personalization brands.

---

## Round 5 — Kith teardown (luxury / streetwear / drop-culture)

### ELI-DT2-R5-001 — Luxury Hero = Editorial Campaign Film Still + Countdown Drop
Cinematic still from campaign film + small overlay text + drop countdown timer + 'Notify me' / 'Shop drop' CTA. Drop culture = scarcity + cinematic. Reference: Kith, Aimé Leon Dore, Fear of God.
**Cross-impact:** Luxury DNA pack hero spec locked. Drop-culture variant ships with countdown component.

### ELI-DT2-R5-002 — Luxury PDP Gallery = Vertical-Scroll, No Thumbnails
Images stack vertically. No thumbnail strip. Cinematic full-bleed. Reference: Kith, Aimé Leon Dore, SSENSE.
**Cross-impact:** Luxury PDP variant ships gallery as vertical scroll component (NOT default thumbnail-strip).

### ELI-DT2-R5-003 — Luxury Cart = Generous Whitespace, Minimal Info
Single line item ≥80px vertical space. Subtotal in display serif. CTA = 'Checkout' clean. Trust badges minimal/hidden. Reference: Kith, Khaite, SSENSE.
**Cross-impact:** Luxury cart drawer variant overrides default density. token Luxury pack ships extreme-whitespace tokens.

### ELI-DT2-R5-004 — Luxury Motion = Slow Fades + Cinematic Ease + Minimal
Duration tokens skewed slow: --duration-base = 500ms, --duration-slow = 800ms. Easing cubic-bezier(0.25, 0.1, 0.25, 1). Variant swatch fade 400ms. Cart drawer slide 600ms. Quiet, never bouncy.
**Cross-impact:** token Luxury pack ships motion token override. motion-interaction-patterns.md gets Luxury DNA exception note.

---

## Round 4 — Magic Spoon teardown (CPG / food / product-forward bold)

### ELI-DT2-R4-001 — CPG Hero = Product on Bold Flat Color
Single hero box/can/bottle on saturated brand-color background + bold display headline + single CTA. CPG = product IS the brand. Reference: Magic Spoon, Liquid Death, Recess.
**Cross-impact:** CPG/Food DNA pack hero spec locked. token CPG pack ships saturated brand-color tokens.

### ELI-DT2-R4-002 — CPG PDP = Above-Fold Nutrition Card + Below-Fold Ingredient Detail
Quick nutrition snapshot (protein/sugar/calories) compact card adjacent to ATC — buyer's #1 question. Full ingredient list + sourcing in expandable section below body. Reference: Magic Spoon, RXBar.
**Cross-impact:** CPG PDP component library = NutritionSnapshotCard above-fold + IngredientDetailAccordion below-fold.

### ELI-DT2-R4-003 — CPG Variety Pack = Visual Flavor Grid + Tap-to-Include + Live Count
Grid of flavor swatches/photos. Tap to add/remove from bundle. Live count + total price update. Reference: Magic Spoon 'Build Your Box', Olly's bundle. Higher AOV than fixed bundles.
**Cross-impact:** ecom-cro owns build-a-box state machine + pricing logic.

### ELI-DT2-R4-004 — CPG Subscription = ELI-010 Holds (One-Time Default)
CPG follows ELI-010 strict: one-time default unless LTV-sub > 3x AND ≥3-step cancel-save AND self-serve pause. Most CPG brands fail all 3 — stick to one-time default. Reference: Magic Spoon, Olly's.
**Cross-impact:** Reinforces ELI-010 across CPG niche. ecom-cro subscription mechanic includes ELI-010 enforcement gate.

---

## Round 3 — Outdoor Voices teardown (apparel / activewear lifestyle-led)

### ELI-DT2-R3-001 — Apparel Hero = Full-Bleed Lifestyle + Minimal Overlay
Edge-to-edge lifestyle image (people doing recreation/activity) + bottom-left or top-left text overlay (max 6 words) + 'Shop' CTA. Activewear/apparel = aspiration through context. Reference: OV, Vuori, lululemon.
**Cross-impact:** Apparel DNA pack hero spec locked.

### ELI-DT2-R3-002 — Apparel Card Image = Lifestyle Primary + Product Secondary (Hover Swap)
Card image 1 = model wearing item in context. Hover desktop / tap mobile = swap to product-on-white. Both worlds: aspirational + clear product. Reference: OV, Cuts, Vuori, Bombas.
**Cross-impact:** Apparel ProductCard variant ships with hover-swap logic; figma-synth canonical mapping updated.

### ELI-DT2-R3-003 — Apparel Size Guide = Inline Link + Bottom-Sheet Modal
Link adjacent to size label on PDP. Tap opens bottom-sheet (mobile) or modal (desktop) with size table + measurement instructions + model height/size disclosure ("Model is 5'9" wearing M"). Reference: OV/Cuyana/Vuori.
**Cross-impact:** ApparelPDP component library includes SizeGuideModal as canonical pattern.

### ELI-DT2-R3-004 — Apparel Cart Upsell = Complementary Category
Bought tee → upsell socks/shorts. Bought leggings → upsell sports bra/top. Different category, same activity. Decoder bank: 12-18% take rate.
**Cross-impact:** ecom-cro cart upsell eligibility query for apparel = "complementary category, same activity tag".

---

## Round 2 — Rhode teardown (beauty / minimalist celeb-led DTC)

### ELI-DT2-R2-001 — Beauty Hero Default = Product Macro on Cream BG
Single hero product macro shot on warm-neutral / cream background + 4-6 word headline + 'Shop' CTA. Disciplined, premium, no clutter. Reference: Rhode, Glossier, DedCool.
**Cross-impact:** Beauty DNA pack hero spec locked.

### ELI-DT2-R2-002 — Beauty PDP Body Order = Benefits → How-to-use → Ingredients → Reviews
Outcome-led benefits FIRST. Then ritual/usage instructions. Then ingredient transparency cards. Then social proof. Matches buyer Q-sequence.
**Cross-impact:** merch PDP body slot template for beauty: 4 sections in this order. Reference: Rhode/Glossier/Drunk Elephant.

### ELI-DT2-R2-003 — Beauty DNA Type System = Light Serif Display + Sans Body
Display: Tiempos / Fraunces / Newsreader light. Body: Inter / Söhne. Used by Rhode, Ilia, Aesop, Glossier. "Quiet luxury" read.
**Cross-impact:** token Beauty pack type tokens locked.

### ELI-DT2-R2-004 — Beauty Cross-sell = Bundle Slot + Complete-Routine Rail
Two zones: (1) 'Pairs well with' bundle slot above ATC with combined-discount math from ecom-cro, (2) 'Complete the routine' product rail mid-scroll. Rhode + Glossier pattern.
**Cross-impact:** ecom-cro owns bundle math. merch writes 'Pairs well with' / 'Complete the routine' headers.


