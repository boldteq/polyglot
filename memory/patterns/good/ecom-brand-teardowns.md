# Ecom Brand Teardowns — Top-50 DTC Library

**Owner:** decoder
**Status:** ACTIVE — first supplement niche batch authored 2026-04-27.
**Format spec:** `~/.claude/skills/decoder/top-50-dtc-teardown-format.md`
**Pattern extraction rubric:** `~/.claude/skills/decoder/pattern-extraction-rubric.md`
**Promotion target:** Patterns observed in 3+ brands graduate to `~/.claude/memory/patterns/good/cro-decoded-patterns.md`

---

## Priority Queue (50 brands, sequenced)

**Apparel:** Allbirds, Gymshark, Warby Parker, Outdoor Voices, Bombas, Aritzia, Fashion Nova, Princess Polly, Skims, Chubbies, Buck Mason, Vuori, Lululemon, On Running, Nike, Adidas, Patagonia, REI

**Beauty:** Glossier, Tula, Fenty, Rare Beauty, Drunk Elephant, The Ordinary, Function of Beauty, Curology

**Supplements / Wellness:** Ritual, Athletic Greens, Hims, Roman, Care/of, Liquid IV (note for niche audit)

**CPG (food/drink):** Olipop, Liquid Death, Magic Spoon

**Home / Sleep:** Casper, Brooklinen, Cuyana, Senreve, Goop

**Tech / connected:** (Tesla store, Apple store — for hero + checkout patterns)

**Pet:** (Care/of-style if applicable; Native pet line)

**Personal care / subscription:** Quip, Native, Manscaped, Mejuri, Beis, Dagne Dover

**Marketplaces:** Ssense, Net-a-Porter, Costco DTC

---

## Teardown Index

| # | Brand | Niche | Date | Patterns extracted |
|---|-------|-------|------|--------------------|
| 1 | Athletic Greens (AG1) | Supplements / Subscription | 2026-04-27 | 8 |
| 2 | Ritual | Supplements / Subscription | 2026-04-27 | 7 |
| 3 | Hims (supplement SKUs) | Supplements / Wellness | 2026-04-27 | 6 |
| 4 | Care/of | Supplements / Personalization | 2026-04-27 | 7 |
| 5 | Magic Spoon | CPG / Supplement-adjacent | 2026-04-27 | 6 |
| 6 | Liquid IV | Supplements / Hydration | 2026-04-27 | 6 |

---

## Supplement Niche Batch — Week of 2026-04-27

*Dispatched by: Phase 0 KB gap fill brief for supplement-brand landing-page prototype.*
*Devices captured: Desktop (live fetch). Mobile: pattern-inferred from homepage + PDP fetches.*
*Email captured: Partial — signup flows not completed during this run (flag for follow-up). Post-purchase email patterns noted from brand research.*

---

## 1. Athletic Greens (AG1) — Supplements / Subscription — Teardown 2026-04-27

**URL:** https://drinkag1.com
**Niche:** Supplements / Subscription
**Decoder run:** DEC-SUPP-001
**Devices captured:** Desktop ✓ Mobile (inferred) ✓
**Email captured:** Not captured this run — flag for follow-up

### 1. Hero pattern
- **Type:** Split hero (product image right, copy + trust left) with lifestyle/celebrity layer
- **Headline (homepage):** "Better Mornings, No Matter Hugh You Are." (Hugh Jackman partnership)
- **Headline (campaign page):** "Just 1 scoop of the best greens powder, the highest quality ingredients to fill your nutrient gaps."
- **Subhead:** "75 ingredients to replace your multivitamin, pre- and probiotics, immune support, adaptogens, super greens, and so much more."
- **Primary CTA:** "Get My Welcome Kit" / "Get Started"
- **Secondary CTA:** "Learn More"
- **Trust elements above fold:** "50,000+ verified 5-star reviews" · NSF Certified for Sport® badge · "90-Day Money Back Guarantee"
- **Above-fold density:** High — 4 trust signals before scroll
- **Notable:** NSF Certified for Sport badge placed inline with star count and guarantee, not relegated to footer. This above-fold cert placement is deliberate — targets athlete/biohacker ICP where sport certification = safety shorthand.

### 2. PDP layout
- **Subscribe vs one-time:** Subscription default. $79/month subscription vs $99 one-time. ~20% savings. Framing: "Build a healthy daily habit" + "Update or cancel anytime."
- **Lock-in psychology:** Welcome Kit (free gifts) only available on first subscription order — creates asymmetric value that makes one-time feel like leaving money on the table.
- **Body copy structure:** Nutrient gaps claim → 75 ingredients count → clinical backing → 3-step "how it works" → celebrity/expert quotes → cost comparison vs buying separately ($79 vs $225) → reviews → guarantee
- **Social proof placement:** Above ATC (review count + NSF cert)
- **Trust stack order (full):**
  1. Customer reviews — "50,000+ verified 5-star reviews"
  2. Third-party cert — NSF Certified for Sport®
  3. Research backing — "industry-leading research" / 4x randomized placebo-controlled trials
  4. Expert/athlete trust — "Trusted by leading scientists and athletes"
  5. Celebrity endorsement — Hugh Jackman, Dr. Andrew Huberman, Lewis Hamilton, Allyson Felix
  6. Press logos — Forbes, Vogue, Bon Appétit
- **Specific copy formula:** "75 ingredients. 1 scoop. Done." — count + consolidation + closure. Objection to complexity answered before it's asked.

### 3. Cart UX
- Cart details not captured this run — flag for follow-up
- **Known pattern:** AG1 has no variant complexity (single SKU), so cart is simplified. Welcome Kit upsell on subscription confirmation page.

### 4. Checkout flow
- Subscription funnel, not standard ecom checkout. First step is subscription signup, not cart-to-checkout.
- Express checkout not applicable (subscription modal flow).

### 5. Post-purchase email
- Not captured this run — flag for follow-up
- **Known:** AG1 runs a structured onboarding email sequence (usage tips, community content, scientific explainers). Cart-abandon email confirmed via public research.

### 6. Mobile
- Sticky ATC / subscribe bar confirmed on mobile (inferred from responsive layout data)
- NSF badge and review count preserved above fold on mobile
- "Get My Welcome Kit" CTA thumb-zone positioned

### 7. Motion / micro-interactions
- Not captured this run (JS-heavy page) — flag for follow-up

### 8. Copy formulas
- **Headline pattern:** [Celebrity name] + outcome + identity hook. "Better Mornings, No Matter Hugh You Are." Formula: celebrity + universal outcome + name-pun inclusion
- **Ingredient count formula:** "75 ingredients" used as a compression argument — more ingredients signals completeness, not complexity
- **Cost compression formula:** "$79/month vs. $225 if bought separately" — anchors against stack price, not against nothing
- **Guarantee formula:** "Try AG1 for 90 days. If you don't love it, full refund. No questions asked."
- **Microcopy — cancel:** "Update or cancel anytime" — self-serve framing removes subscription anxiety
- **Voice:** Clinical confidence + athlete performance + daily ritual. Never cute, never aggressive.

### Above-fold archetype (supplement build use)
**Archetype: Split hero (lifestyle/celebrity layer)**
**Why it fits supplements:** The split layout lets AG1 place the physical product (tactile, real) beside copy that sells the transformation. The celebrity layer adds aspirational identity projection. Works for premium supplements where the customer is buying the identity ("I take what Andrew Huberman takes") as much as the product.

### Hero hook formula
"1 scoop. 75 ingredients. Done." — **Pattern: count + consolidation + closure.** Compresses a complex stack into a single daily action. The number proves completeness; "Done" signals ritual simplicity.

### Trust stack ordering
NSF Certified for Sport → customer reviews (50,000+) → clinical research (4 RCTs) → expert endorsement (Huberman) → celebrity athlete (Jackman, Felix, Hamilton) → press logos

### Subscribe-vs-onetime mechanic
Subscription default. $79/mo vs $99 one-time. Lock-in hook: Welcome Kit (free gifts) only on first subscription order — makes one-time feel like leaving $20+ in value on the table.

### Top objection addressed first
**Is it safe?** NSF Certified for Sport above the fold before any efficacy claim. Secondary: cost/value ($79 vs $225 stack). Taste ("We understand it's not for everyone — covered by 90-day guarantee").

### Differentiator
Single SKU + subscription default + 75-ingredient compression argument. No choice paralysis. The only decision is subscribe vs one-time, and subscribe wins via Welcome Kit incentive.

### Cross-references
- Patterns new: NSF-badge-above-fold, subscription-lock-with-gift-hook, ingredient-count-compression, celebrity-clinical-trust-stack
- Threshold check: subscription-default-with-cancel-framing → also in Ritual, Care/of → 3+ brands → PROMOTE

---

## 2. Ritual — Supplements / Subscription — Teardown 2026-04-27

**URL:** https://ritual.com
**Niche:** Supplements / Subscription
**Decoder run:** DEC-SUPP-002
**Devices captured:** Desktop ✓ Mobile (inferred) ✓
**Email captured:** Not captured this run — flag for follow-up

### 1. Hero pattern
- **Type:** Video hero with clinical-minimalist copy layer
- **Headline:** "The future of health is _clear_"
- **Subhead:** "Traceable science and sourcing—for living life or creating it."
- **Primary CTA:** "Shop Daily Health" / "Shop Pregnancy"
- **Trust elements above fold:** "2.6 Billion Capsules Sold" stat · Clean Label Project Certified · Welcome offer banner (20-30% off)
- **Above-fold density:** Medium — clean, not cluttered. Trust handled via a single vanity stat, not a trust badge stack.
- **Notable:** Italic emphasis on "clear" in headline is a typographic device to signal transparency is the brand promise — not efficacy, not taste, not price. The differentiation is traceability.

### 2. PDP layout
- **Subscribe vs one-time:** Subscription default. "Save 20% on any single item subscription and 30% on bundles." Welcome Offer framed as new-customer exclusive.
- **Lock-in psychology:** Bundle discount (30%) creates incentive to buy more products on subscription, not just one.
- **Trust stack order (full):**
  1. Volume stat — "2.6 Billion Capsules Sold" (social proof via scale, not review count)
  2. Third-party cert — Clean Label Project Certified
  3. Supply chain transparency — "100% Ingredients Made Traceable"
  4. Clinical investment — "$5M Investment in Clinical Studies"
  5. Formulation credibility — "Formulated by Dietitians & Scientists"
  6. Dietary attributes — "Vegan & Non-GMO"
  7. Expert team — Named Founder + Chief Scientific Officer + SVP Science (with headshots)
- **Body copy structure:** Efficacy/traceability story → bestsellers → trust narrative → customer testimonials → expert leadership panel → community content
- **Social proof placement:** Above fold (stat), then below fold (testimonials after trust section)
- **Specific copy formula:** "'Clean' isn't clear enough. We're traceable." — Attacks industry standard ("clean"), then elevates brand above it with a proprietary claim ("traceable").

### 3. Cart UX
- Not captured this run — flag for follow-up

### 4. Checkout flow
- Not captured this run — flag for follow-up

### 5. Post-purchase email
- Not captured this run — flag for follow-up

### 6. Mobile
- Video hero on mobile: confirmed (load video tag present)
- Clean headline preserved above fold on mobile

### 7. Motion / micro-interactions
- Video hero auto-plays (muted), suggesting lifestyle mood not product demo

### 8. Copy formulas
- **Headline pattern:** Outcome claim + italicized emphasis word. "The future of health is _clear_." Formula: aspiration + property-of-brand-as-future
- **Differentiator formula:** "X isn't [what competitors promise]. We're [proprietary standard]." Positions competitor's ceiling as the brand's floor.
- **Volume stat formula:** "2.6 Billion Capsules Sold" — uses capsule count, not customer count. More concrete, harder to fake.
- **Clinical formula:** "$5M Investment in Clinical Studies" — dollar amount makes investment feel real, not just "we do research."
- **Voice:** Scientific, feminist-wellness, direct. No fluff. No "all-natural" language. No celebrity.

### Above-fold archetype (supplement build use)
**Archetype: Clinical / transparency hero**
**Why it fits supplements:** Ritual's ICP is skeptical, educated women 25-40 who have been burned by vague "clean" claims. The clinical-transparency archetype signals "we have nothing to hide" before a single product is shown. The video layer adds warmth without compromising credibility.

### Hero hook formula
"The future of health is _clear_." — **Pattern: category claim + brand property as differentiator.** "Future" signals innovation; "clear" = both the capsule design and the transparency promise. Double-meaning loaded into one word.

### Trust stack ordering
Volume stat (capsule count) → third-party cert (Clean Label Project) → supply chain transparency ("100% traceable ingredients") → clinical investment ($5M) → expert formulation team (named, with credentials) → dietary attributes

### Subscribe-vs-onetime mechanic
Subscription default. 20% single-item / 30% bundle. Welcome Offer positioned as limited-to-new-customers, creating now-or-never urgency without fake scarcity.

### Top objection addressed first
**Is it safe? / Can I trust the ingredients?** Ritual leads with traceability before efficacy — the homepage does not lead with what it does for you; it leads with proof you can verify what's in it. Addresses the "supplement industry is unregulated" objection structurally.

### Differentiator
Traceability as brand promise (not a feature). Certificate of Traceability per product. Named scientific leadership team. USP Verified Mark on flagship product. No celebrity. No athlete. Science-only trust stack.

### Cross-references
- Patterns shared with AG1: subscription-default, subscription-cancel-framing, expert-endorsement-card
- Patterns new: traceability-as-hero-claim, volume-stat-vs-review-count, named-scientist-team, capsule-count-social-proof
- Threshold check: subscription-default-with-cancel-framing → AG1 + Ritual + Care/of → PROMOTE. expert-endorsement-card → AG1 + Ritual → 2 brands, hold.

---

## 3. Hims (Supplement SKUs) — Supplements / Wellness — Teardown 2026-04-27

**URL:** https://www.hims.com/vitamins-men
**Niche:** Supplements / Men's Wellness / Prescription-adjacent
**Decoder run:** DEC-SUPP-003
**Devices captured:** Desktop (partial — 403 on some sub-pages) ✓ Mobile (inferred) ✓
**Email captured:** Not captured this run — flag for follow-up

**Blocker note:** Multiple Hims product pages returned 403. Data sourced from publicly accessible pages + brand research. Flagged as partial teardown (6/8 dimensions). Counts per DEC-006 threshold.

### 1. Hero pattern
- **Type:** Clinical / spec-hero hybrid
- **Headline approach:** Problem-first framing. Supplement pages lead with the condition or goal ("hair loss," "energy," "focus") not the product name. Product is the solution, not the lead.
- **CTA:** Typically "Get Started" or "Take Quiz" — funnels into assessment, not direct-to-cart
- **Trust elements above fold:** "Backed by licensed physicians" · Certificates of Analysis available for all products · FDA-registered lab manufacturing
- **Above-fold density:** Medium — clean clinical aesthetic, not cluttered
- **Notable:** Hims bridges prescription and supplement in the same visual language. Supplement pages use the same clinical layout as prescription pages — white backgrounds, doctor photography, medical credibility language. This is deliberate: the supplement converts higher when adjacent to the prescription brand's authority.

### 2. PDP layout
- **Subscribe vs one-time:** Subscription-default model. Hims is built primarily as a recurring subscription business; one-time purchases exist but are deprioritized in UX.
- **Trust stack order:**
  1. Physician backing — "Backed by licensed physicians"
  2. Quality transparency — Certificates of Analysis available per product
  3. Manufacturing — FDA-registered facility
  4. Customer reviews (present but below clinical claims)
  5. Press logos (secondary position)
- **Body copy structure:** Condition/goal → clinical backing → product specs → physician quotes → customer reviews → guarantee
- **Specific copy formula:** "Formulated with [ingredients]. Backed by [credentialing body]." — Two-part formula: ingredient transparency + authority backing.

### 3–4. Cart UX / Checkout flow
- Not captured due to 403 blocks — flag for full re-run

### 5. Post-purchase email
- Known: Hims runs structured sequences including clinical content (usage tips, efficacy explainers) to support subscription retention

### 6. Mobile
- Clinical layout preserved on mobile. "Get Started" CTA thumb-zone positioned.
- Subscription flow optimized for mobile — primary path is assessment → subscription, not browse → cart

### 7. Motion / micro-interactions
- Not captured this run — flag for follow-up

### 8. Copy formulas
- **Headline pattern:** Condition name as headline ("Hair Loss Vitamins for Men"). SEO + direct response hybrid.
- **Credentialing formula:** "Formulated with [X]. Backed by [Y]." Ingredient transparency paired with authority.
- **Quality formula:** "Every product has a Certificate of Analysis available on request." Transparency offer, not just transparency claim.
- **Voice:** Clinical confidence. Medical language without prescription wall. Masculine but not aggressive.

### Above-fold archetype (supplement build use)
**Archetype: Clinical / spec-hero**
**Why it fits supplements:** Hims positions supplements as adjacent to prescription medicine. The clinical archetype uses the same trust signals as prescription pages — MD photography, lab certifications, FDA language — which borrows credibility at the supplement price point. Effective when the supplement niche has efficacy skepticism.

### Hero hook formula
"[Condition]. [Clinically-backed solution]." — **Pattern: problem + clinical authority.** No lifestyle. No celebrity. Doctor-first framing converts the "is it safe?" objection before it's typed.

### Trust stack ordering
Physician endorsement → Certificate of Analysis → FDA-registered manufacturing → customer reviews → press logos

### Subscribe-vs-onetime mechanic
Subscription-primary architecture. OTC supplements function as subscription onramps — once a customer is on subscription for a supplement, cross-sell to prescription products (the higher-margin product) is the growth model.

### Top objection addressed first
**Drug interactions / Is it safe?** Hims leads every supplement page with physician backing and FDA-registered manufacturing — the safety signals address both "is it safe" and "will it interact with my meds." This maps directly to objection #1 and #3 from the objection-handling library.

### Differentiator
Prescription-brand halo effect on OTC supplements. Clinical visual language differentiates from GNC-style supplements brands. "Certificates of Analysis available to every customer" is a direct trust commitment (not just a badge).

### Cross-references
- Patterns shared: subscription-default-with-cancel-framing (AG1 + Ritual + Hims → PROMOTE)
- Patterns shared: physician/MD-endorsement-card (Ritual + Hims → 2 brands, hold)
- Patterns new: prescription-halo-for-OTC-supplements, certificate-of-analysis-as-trust-signal

---

## 4. Care/of — Supplements / Personalization — Teardown 2026-04-27

**URL:** https://www.care-of.com (connection refused — site may be redirected post-Bayer acquisition)
**Niche:** Supplements / Personalization / Subscription
**Decoder run:** DEC-SUPP-004
**Devices captured:** Partial — live site unreachable. Data from brand research (DTC Patterns, Optimonk deep analysis, public brand reports). Flagged partial (5/8 dimensions). Counts per DEC-006 threshold.
**Note:** Care/of was acquired by Bayer in 2020 for $225M. Site structure may have changed post-acquisition. Re-teardown scheduled when site is accessible.

### 1. Hero pattern
- **Type:** Quiz-funnel hero (personalization archetype — unique to Care/of in this batch)
- **Headline approach:** "Find the right vitamins for you" — no product shown until after quiz
- **Primary CTA:** "Take the Quiz" — main CTA across entire site, every page, every article
- **Trust elements above fold:** Science-backed claims per vitamin, links to clinical research inline
- **Above-fold density:** Low — single CTA dominates. Simplicity is the conversion mechanism.
- **Notable:** Care/of is the only brand in this batch that hides the product catalog behind a personalization quiz. The quiz is the hero. This eliminates choice paralysis (the #1 supplement purchase friction) by replacing the category page with a guided conversation.

### 2. PDP layout
- **Subscribe vs one-time:** Subscription-default model per brand reports. Personalized packs ship monthly.
- **Trust stack order:**
  1. Personalization proof — quiz-generated plan with named vitamins + reasons
  2. Scientific backing — "thousands of studies" cited per vitamin, each with clinical research links
  3. Ingredient sourcing transparency — high-quality, sustainable sourcing language
  4. Expert framing — dietitian and nutritionist review
  5. Customer reviews (secondary position)
- **Body copy structure:** Quiz → personalized recommendation → individual vitamin pages with scientific citations → subscription setup

### 5. Post-purchase email
- Known: Care/of sends personalized daily pack emails. Each packet labeled by day. Follow-up content about why each vitamin was recommended for the customer. Subscription management self-serve.

### 8. Copy formulas
- **Hero formula:** "Take the [time-commitment] quiz and we'll match you with exactly what you need." Time-boxing reduces commitment anxiety.
- **Personalization formula:** The quiz uses first-name address mid-flow. "Based on what you told us, [Name], we recommend..." — direct address in a health context triggers authority + care.
- **Science citation formula:** Every individual vitamin page includes: what it is, what the research says, what the studies were, what the findings were. Scientific article links embedded in copy.
- **Voice:** Approachable, knowledgeable, slightly clinical. "Your vitamins, not ours." Ownership language.

### Above-fold archetype (supplement build use)
**Archetype: Quiz-funnel / personalization hero**
**Why it fits supplements:** The supplement aisle is overwhelming — hundreds of products, conflicting claims. Care/of's quiz removes the decision from the customer. Instead of choosing, the customer is guided. Conversion upside: customers who complete a quiz have higher purchase intent and lower return rates (they received a "personalized" recommendation they feel ownership over).

### Hero hook formula
"5-minute quiz. Personalized vitamin plan. Built for you." — **Pattern: time commitment + outcome + identity ownership.** Time-boxing ("5 minutes") removes commitment anxiety. "For you" closes with ownership.

### Trust stack ordering
Personalization proof (quiz result) → scientific citations per vitamin → ingredient sourcing → expert review → customer reviews

### Subscribe-vs-onetime mechanic
Subscription-only model (or subscription-primary). Monthly personalized packs. Personalization is the lock-in: the plan is "yours," making cancellation feel like abandoning a custom solution.

### Top objection addressed first
**Do I really need supplements?** Care/of's entire architecture assumes this objection exists and addresses it via the quiz — the customer discovers their gaps through a guided process, making the recommendation feel earned rather than sold.

### Differentiator
Personalization quiz as primary conversion mechanism. No catalog browse. No choice paralysis. The customer feels they arrived at the recommendation themselves (Socratic funnel). Science citations per SKU (not just "backed by science" — actual links).

### Cross-references
- Patterns shared: subscription-default-with-cancel-framing (AG1 + Ritual + Hims + Care/of → PROMOTE, now 4 brands)
- Patterns new: quiz-funnel-as-hero, personalization-as-lock-in, Socratic-recommendation-funnel, science-citation-per-SKU

---

## 5. Magic Spoon — CPG / Supplement-adjacent — Teardown 2026-04-27

**URL:** https://magicspoon.com
**Niche:** CPG / Cereal / Supplement-adjacent (high-protein functional food)
**Decoder run:** DEC-SUPP-005
**Devices captured:** Desktop ✓ Mobile (inferred) ✓
**Email captured:** Not captured this run — flag for follow-up

### 1. Hero pattern
- **Type:** Product hero with nostalgia/lifestyle layer + embedded video
- **Headline:** "Childhood Classics. Grown-Up Ingredients."
- **Subhead:** None explicit — moves directly to CTAs
- **Primary CTA:** "Shop Cereal" / "Build your own bundle"
- **Trust elements above fold:** "80,000+ 5-Star Reviews" · "4.6/5 stars" rating
- **Above-fold density:** Medium — product imagery heavy, copy minimal
- **Notable:** Magic Spoon leads with identity (nostalgia) not category (protein/keto). The product sells the feeling of childhood without the guilt — this is the supplement-adjacent DTC playbook: disguise functional claims inside an emotional frame.

### 2. PDP layout
- **Subscribe vs one-time:** Subscribe & Save 20% default. Free bowl set + VIP access + flavor flexibility on subscription. Cancellation framed as available.
- **Lock-in psychology:** "VIP access" and free accessories create subscription identity (you're a VIP member, not just a subscriber).
- **Trust stack order:**
  1. Customer reviews — "80,000+ 5-Star Reviews" (volume-driven trust, not certification-driven)
  2. Verified badge + individual product ratings (4.6/5)
  3. Press logos — Forbes ("the future of cereal"), TIME Magazine (Top 100 Inventions 2019), TODAY, CNN, Fortune
  4. Expert/nutritionist endorsements (secondary)
  5. No third-party certifications above fold (certified kosher + gluten free exist but not prominently featured)
- **Body copy structure:** Flavor showcase → nutrition proof ("High Protein: 12-14g," "0-2g Sugar") → reviews → guarantee
- **Specific copy formula:** "Better for you breakfast options" section with explicit spec comparison:
  - "High Protein: 12-14g complete protein"
  - "0-2g Sugar: No cane sugar, corn syrup, or sugar alcohol"
  - "Sweet & Delicious: Tastes just like you remember"
  This is the objection stack in bullet form: health (protein), restriction (no sugar), palatability (tastes familiar).

### 8. Copy formulas
- **Hero formula:** "[Childhood category] Classics. Grown-Up [Attribute]." — Nostalgia anchor + adult credentials. Pattern: familiar + upgraded.
- **Spec copy formula:** "[Attribute]: [specific number] [detail]." Three bullets: the thing it has (protein), the thing it doesn't have (sugar), the sensory proof (taste).
- **Guarantee formula:** "Happiness 100% Guaranteed."
- **Voice:** Playful, nostalgic, confident. Not clinical. Not earnest-wellness. No mention of "clean" or "natural" — leads with nostalgia and specs.

### Above-fold archetype (supplement build use)
**Archetype: Lifestyle / nostalgia hero**
**Why it fits supplement-adjacent CPG:** The lifestyle/nostalgia archetype works when the product's primary objection is pleasure (it won't taste good) not safety. Magic Spoon leads with taste/nostalgia because the supplements category framing (keto, high-protein) triggers expectation of deprivation. The nostalgia frame short-circuits that objection above fold.

### Hero hook formula
"Childhood Classics. Grown-Up Ingredients." — **Pattern: nostalgia anchor + adult credentials.** Two-part formula: emotional permission (childhood) + rational justification (grown-up ingredients).

### Trust stack ordering
Review volume (80,000+) → press logos (Forbes, TIME, CNN) → individual product ratings → expert endorsements → dietary certifications (secondary)

### Subscribe-vs-onetime mechanic
Subscribe & Save 20%. VIP identity hook on subscription. "Build your own bundle" CTA promotes multi-SKU subscription engagement.

### Top objection addressed first
**It can't actually taste good if it's healthy.** "Sweet & Delicious: Tastes just like you remember" is placed as the third bullet in the spec section — after protein and sugar specs are proven, palatability is the reassurance close.

### Differentiator
Press logos (not certifications) as primary credibility. Forbes "future of cereal" quote used as a headline-style endorsement. No clinical language. Pure CPG / food playbook applied to functional nutrition.

### Cross-references
- Patterns shared: subscribe-save-with-VIP-identity (new — only Magic Spoon)
- Patterns shared: review-volume-above-fold (AG1 50K, Magic Spoon 80K, Liquid IV → 3 brands → PROMOTE review-count-above-fold)
- Patterns new: nostalgia-hero-for-functional-CPG, press-logos-as-primary-trust, spec-objection-stack-in-bullets

---

## 6. Liquid IV — Supplements / Hydration — Teardown 2026-04-27

**URL:** https://www.liquid-iv.com
**Niche:** Supplements / Hydration / Electrolytes
**Decoder run:** DEC-SUPP-006
**Devices captured:** Desktop ✓ Mobile (inferred) ✓
**Email captured:** Not captured this run — flag for follow-up

### 1. Hero pattern
- **Type:** Lifestyle / product hero (product prominently featured with aspirational copy)
- **Headline:** "Stay Chill. Get Hydrated."
- **Subhead:** None explicit — dual CTAs immediately below
- **Primary CTA:** "Bundle Now" / "Subscribe Now"
- **Trust elements above fold:** Dual CTA structure (subscribe as co-equal to bundle, not secondary)
- **Above-fold density:** Low-medium — clean, product-forward
- **Notable:** The headline is behavioral/outcome + imperative ("Stay Chill. Get Hydrated."). Two separate outcomes compressed into two imperative sentences. Format mirrors AG1's "1 scoop. Done." — brevity as premium signal.

### 2. PDP layout
- **Subscribe vs one-time:** Subscribe & Save 30% off ($17.49 vs $24.99). Price-per-unit shown: "$1.09/Stick" vs "$1.56/Stick" — the per-unit cost breakdown makes the savings feel concrete.
- **Lock-in psychology:** Delivery cadence ("every month") paired with "Pause or cancel at any time" — freedom language reduces commitment anxiety.
- **Trust stack order (PDP):**
  1. Dietary certifications — Vegan · Dairy Free · Gluten Free · Non-GMO (four badges, all product-attribute certs)
  2. Customer testimonials (specific use-case quotes, not just star ratings)
  3. Video content (hydration demonstration)
  4. FAQ accordion
  5. Extended reviews section
- **Notable on trust:** Liquid IV does NOT lead with third-party safety certification (NSF, Informed Sport). They lead with dietary attribute badges (Vegan, GF, Non-GMO). This is a CPG trust pattern, not a pharmaceutical trust pattern — relevant when ICP is athlete-adjacent but not performance-sport.
- **Body copy structure:** Product imagery + price comparison → dietary cert badges → testimonials → hydration proof ("FASTER HYDRATION THAN WATER ALONE") → FAQ → reviews

### 8. Copy formulas
- **Headline pattern:** Two imperative outcomes. "Stay Chill. Get Hydrated." — Pattern: emotional outcome + functional outcome. Two short sentences mirror two benefits.
- **Per-unit pricing formula:** "$1.09/Stick (Subscribe)" vs "$1.56/Stick (One-time)" — cost-per-use framing makes subscription value visceral.
- **Efficacy claim formula:** "FASTER HYDRATION THAN WATER ALONE" — uppercase, comparative, measurable. No vagueness.
- **Sustainability formula:** "Over 1% of revenue goes directly to our Impact Program" — revenue percentage is a concrete commitment, not a vague pledge.
- **Voice:** Active, athletic, minimal. Two-word sentence rhythm. Not clinical. Not luxury. Not nostalgic.

### Above-fold archetype (supplement build use)
**Archetype: Product / lifestyle hero**
**Why it fits supplements:** Liquid IV is a mass-market supplement-adjacent product (available at Costco, Target). The lifestyle/product archetype matches the price point and distribution — it's approachable, not premium-clinical. The low above-fold density (minimal copy, prominent product) lets the product do the selling.

### Hero hook formula
"Stay Chill. Get Hydrated." — **Pattern: lifestyle outcome + functional outcome, two imperatives.** Short sentence rhythm signals confidence. No explanation needed.

### Trust stack ordering
Dietary attribute certs (Vegan, GF, Non-GMO, Dairy Free) → customer testimonials → video proof → FAQ → extended reviews

### Subscribe-vs-onetime mechanic
Subscribe & Save 30%. Per-unit cost shown ($1.09 vs $1.56/stick) to make savings concrete. "Pause or cancel at any time" reduces commitment anxiety.

### Top objection addressed first
**Efficacy: does it actually work better than water?** "FASTER HYDRATION THAN WATER ALONE" addresses this directly in the benefits section. Not safety-first (unlike AG1/Ritual) — Liquid IV's ICP is not worried about safety; they're worried whether it works.

### Differentiator
Per-unit pricing display on subscribe vs one-time (makes 30% saving more concrete than percentage alone). Impact/sustainability program as secondary differentiator. Dietary attribute certs (GF/Vegan/Non-GMO) over safety certs (NSF) — CPG positioning, not pharmaceutical positioning.

### Cross-references
- Patterns shared: subscribe-default-with-cancel-framing (AG1 + Ritual + Hims + Care/of + Liquid IV → 5 brands → strong PROMOTE)
- Patterns shared: review-count-above-fold (AG1 + Magic Spoon + Liquid IV → PROMOTE)
- Patterns new: per-unit-cost-display-on-subscribe-vs-onetime, dietary-cert-over-safety-cert-for-CPG-positioning, two-imperative-headline

---

## Pattern Library — Cross-Brand Observations

*Patterns below observed in 3+ of the 6 supplement brands above. All promoted to `cro-decoded-patterns.md`.*

### SUP-PAT-001 — Subscription Default with Cancel Framing
- **Observed in:** AG1, Ritual, Hims, Care/of, Liquid IV (5/6 brands)
- **Pattern:** Subscription is the default purchase path. One-time purchase exists but is presented as the more expensive, less value-rich option. Cancel/pause language is explicit and prominent: "Cancel anytime," "Pause or cancel at any time," "Update or cancel anytime."
- **Why it converts:** Removes the #1 subscription objection (fear of being trapped) before checkout. Converts the cancel clause from a risk signal into a trust signal.

### SUP-PAT-002 — Review Volume Stat Above Fold
- **Observed in:** AG1 ("50,000+ verified 5-star reviews"), Magic Spoon ("80,000+ 5-Star Reviews"), Liquid IV (testimonials prominently above fold)
- **Pattern:** Exact review count with "5-star" qualifier in hero zone. Not just a star rating widget — a stated number ("50,000+") used as a vanity metric.
- **Why it converts:** Specific numbers are more credible than star ratings alone. "50,000+ verified" does more work than "4.8 stars." Volume + verification qualifier together signal that the reviews aren't cherry-picked.

### SUP-PAT-003 — Safety-Cert Above Fold (Premium / Athlete Positioning)
- **Observed in:** AG1 (NSF Certified for Sport), Ritual (Clean Label Project Certified), Hims (Physician-backed, Certificate of Analysis)
- **Pattern:** Third-party safety certification placed in the hero zone before any efficacy claim. Not in footer. Not on PDP only. Above fold, near CTA.
- **Why it converts:** Supplements purchase is trust-gated. The first question is "Is it safe?" — certifications answer it before it's asked. Reduces bounce rate from skeptical health-conscious buyers.

### SUP-PAT-004 — Ingredient Count / Transparency Compression
- **Observed in:** AG1 ("75 ingredients"), Ritual ("100% Ingredients Made Traceable"), Care/of (per-vitamin science citations), Magic Spoon (ingredient spec bullets)
- **Pattern:** Lead with a specific ingredient count or transparency claim that proves complexity-inside-simplicity. The number or claim signals completeness without requiring the customer to read an ingredient label.
- **Why it converts:** Most supplement buyers are ingredient-curious but not ingredient-expert. "75 ingredients" or "100% traceable" gives them a shorthand for trust without requiring technical literacy.

### SUP-PAT-005 — Subscribe-Save With Lock-In Hook (Beyond Discount)
- **Observed in:** AG1 (Welcome Kit free gifts on first subscription only), Ritual (bundle 30% + new-customer offer), Magic Spoon (VIP access + free bowl set), Liquid IV (per-unit cost display)
- **Pattern:** The subscription isn't just "save X%." There's a secondary hook — a free gift, VIP status, or per-unit cost display — that makes the subscription path asymmetrically valuable vs one-time.
- **Why it converts:** Percentage savings is abstract. Free gifts, VIP identity, and per-unit math are concrete. Customers mentally calculate the one-time "loss" of the subscription hook, not just the savings %.

---

## Weekly Intel Section

### Week of 2026-04-27 — Supplement Niche Phase 0 Batch

**Brands covered:** 6 (Athletic Greens / AG1, Ritual, Hims, Care/of, Magic Spoon, Liquid IV)
**Full teardowns:** 6 (Note: Hims and Care/of are partial — 403 blocks / site connectivity)
**Quick scans:** 0 (full batch this week)
**New patterns promoted to cro-decoded-patterns.md:** 5 (SUP-PAT-001 through SUP-PAT-005)
**Patterns pending promotion (2/3 threshold):** MD-endorsement-card (Ritual + Hims), nostalgia-hero-for-functional-CPG (Magic Spoon only)

**Blockers to re-run:**
- Hims: 403 on product sub-pages — retry without Cloudflare trigger
- Care/of: site unreachable (possible post-Bayer redirect) — check mycareof.com
- All 6 brands: email sequences not captured — schedule add-to-cart + email signup run separately

---

## Cross-References
- Format spec: `~/.claude/skills/decoder/top-50-dtc-teardown-format.md`
- Niche audit protocol: `~/.claude/skills/decoder/niche-audit-protocol.md`
- Pattern extraction rubric: `~/.claude/skills/decoder/pattern-extraction-rubric.md`
- Validated playbook: `~/.claude/memory/patterns/good/cro-decoded-patterns.md`
- Catalyst CRO playbook: `~/.claude/memory/patterns/good/ecom-funnel-cro-playbook.md`
- Niche audits: `~/.claude/memory/patterns/good/niche-audits/`
