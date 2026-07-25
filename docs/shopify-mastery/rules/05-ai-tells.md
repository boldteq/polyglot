# 05 — AI tells: the reject list

Verified 2026-07-25. Companion to `04-design-taste.md`; same evidence tags, same rule that
`[E]` may block, `[P]` may warn, `[H]` may only note.

This file exists because the gate stack verifies **correctness**, not **desirability**.
Everything here is a desirability check with a mechanical detector. If a check has no
detector, it does not belong in this file.

Read §Z first. It lists three plausible-sounding checks we must **not** build.

---

## AT-1 — Structural template duplication `[E]` · **reject**

Two stores for unrelated merchants serialise to near-identical DOM trees.

**Detect.** Token stream per page:
`Array.from(document.querySelectorAll('*')).map(e => e.tagName + '.' + [...e.classList].sort().join('.'))`
TF-IDF vectorise, cosine-compare against every prior generation. Also hash the ordered
section-schema type list and the CSS custom-property block.

**Threshold.** Warn >0.90, reject >0.95. Calibrate against genuinely distinct human-built
themes first.

**Why it is `[E]`.** AIT Austrian Institute of Technology reaches 97% F1 separating fraudulent
from legitimate shops across 6,000+ sites using tokenised HTML/CSS/JS and DOM tree structure
alone — template reuse *is* the machine-detectable fraud correlate. A generator emitting
near-identical DOM across customers manufactures the exact signal fraud classifiers key on.
Corroborated by Janavičiūtė et al. 2024 (n=1,140, 96.9%). Caveat: the 97% is self-reported;
the underlying IEEE paper is paywalled.

**This is the single most important check in the pack.** It is the one that most directly
explains "all gates green, still looks AI-built."

---

## AT-2 — Cosmetic-only differentiation `[E]` · **reject**

The theme differs from its base only by spacing, colour, gradients and a few extra sections.

**Detect.** Three-level diff against the base: (a) section/snippet filenames + schema `type`
values; (b) DOM structure per template; (c) CSS declarations *excluding* custom-property values.
If (a) and (b) are ≥90% identical and only (c)'s values differ, the change is cosmetic.

**Threshold.** Shopify's own stated test — no two outputs may be inter-convertible through
theme settings alone.

**Source.** Theme Store requirements, which name spacing tweaks, colour/typography swaps,
gradients, shape dividers, background blurs, animation tweaks and added sections as
*insufficient*.

---

## AT-3 — Fraud-correlated shop metadata `[E]` · **reject**

Cheap non-visual features that jointly separate fraudulent from legitimate shops at 96.9%.

**Detect.** WHOIS domain age; favicon presence (`link[rel~="icon"]`) and whether it hashes to
a framework default; hostname hyphen/dot/digit counts; TLD length; payment mix — positive
`/\b(paypal|apple pay|google pay|shop pay)\b/i`, negative
`/\b(bitcoin|usdt|crypto|wire transfer|western union)\b/i`; review-platform link presence.

**Threshold.** Domain age ≤400 days is the highest-importance single feature in the published
ranking. We cannot change a client's domain age — but we **can** ensure every other feature
lands on the legitimate side, which matters most precisely when the domain is new.

**Source.** Janavičiūtė et al. 2024, n=1,140 (579 fraudulent / 561 legitimate), 18 features,
96.9% accuracy; **4 features alone give 93.4%**. CC BY — ingestible. Ranked importance: young
domain > money-back payment option > TLD length > review-platform presence > custom favicon >
hyphen count > dot count.

---

## AT-4 — Thin product descriptions `[E]` · **reject**

Descriptions too short to answer a purchase question.

**Detect.** Rendered pixel height of the description container at 390×844. Word count.
Presence of a specs table (`table`, `dl`, `[class*="spec"]`). Duplicate description text
across ≥3 products on the same store.

**Threshold.** Baymard's own measure — flag below **half a mobile viewport** (0.5 × 844px).
Duplicate description text across products is an automatic reject regardless of length.

**Also cheap and evidence-backed.** 44% of benchmarked sites do not display or link a return
policy, and 60% of users look for it on the product page. Assert
`a[href*="return"], a[href*="refund"]` exists. 15% abandon over an unsatisfactory return
policy (n=1,026).

---

## AT-5 — Structural credibility gaps `[E]` (magnitudes stale) · **reject**

No address, no phone, no policy pages, broken links, typos.

**Detect.** `a[href^="tel:"]` count; `a[href^="mailto:"]` and whether the domain is a free
provider `/(gmail|hotmail|outlook|yahoo|proton)\.com/i`; street-address regex or
`[itemtype*="PostalAddress"]` in footer; `a[href*="privacy"|"terms"|"refund"|"return"]`;
HEAD every internal link, count non-2xx; spellcheck visible text excluding a brand allowlist.

**Threshold.** Require ≥2 of {street address, `tel:`, `mailto:` on the store's own domain};
zero broken internal links; zero spelling errors outside the brand allowlist.

**Evidence, with the caveat attached.** Fogg et al., CHI 2001 (n=1,410 analysed, from 1,441
responses) scored items on a **−3.0…+3.0** scale: physical address **+1.86**, contact phone
**+1.71**, "looks professionally designed" **+1.55**, contact e-mail **+1.53**; typographical
error **−1.28**, domain name does not match company name **−1.06**, link that doesn't work
**−1.45**. Separately, Fogg et al. 2002 (n=2,684) found "design look" was cited in **46.1%** of
credibility comments — rank 1 of 18. **These studies are from 2001 and 2002. The items survive
because they are structural; the magnitudes are ~25 years old, pre-mobile, and must never be
quoted as current.**

> Correction, 2026-07-25: an earlier draft of this file recorded n=1,481 on a −2.0…+2.0 scale
> with the means +1.67/+1.56/+1.54/+1.47/−1.26/−1.07/−1.42. Every one of those numbers was
> wrong. The figures above are read from the authors' own PDF at credibility.stanford.edu.
> Sources: `fogg-credibility-2001`, `stanford-web-credibility-2002`.

---

## AT-6 — Stock and placeholder imagery `[E]` for the harm, `[H]` for the host list · **reject**

Hero and About imagery from a stock CDN, a placeholder service, or the theme demo.

**Detect.** Test every `img[src]`, `srcset` candidate and CSS `background-image` against a host
blocklist: `burst.shopifycdn.com`, `images.unsplash.com`, `images.pexels.com`,
`*.shutterstock.com`, `*.gettyimages.com`, `placehold.co`, `via.placeholder.com`,
`picsum.photos`, `loremflickr.com`, plus theme-demo asset paths. Flag
`naturalWidth < 600` on product images and `naturalWidth < clientWidth` (upscaling).

**Threshold.** Any stock/placeholder host on a hero, About or trust section → reject.
Product images below 600px natural width → reject.

**Evidence.** NN/g (70+ users, 100 sites) names stock photography **first** among factors that
negatively impacted trust and credibility. Eyetracking on a product page: users spent 82% of
viewing time on text vs 18% on thumbnails, and generic stock people were ignored while
authentic photos were studied. Baymard: 37% of benchmarked sites lack in-scale images, 23%
lack human-model images — so authentic imagery is both a differentiator and an industry gap.
**The specific CDN host list is ours, not sourced.**

**Do not attach a conversion percentage to this.** No primary study measuring custom-versus-
stock photography conversion lift is reachable; every such figure traces to agency marketing.

---

## AT-7 — Manufactured urgency `[E]` as consumer-protection guidance · **reject**

Countdown timers and scarcity counters with no inventory truth behind them.

**Detect.** `[class*="countdown"], [data-countdown]`, or a text node matching
`/\d{1,2}:\d{2}:\d{2}/` that mutates under a `MutationObserver`. Visible-text regex:
`/only \d+ left|hurry|ends (today|soon)|limited time|selling fast|\d+ (people|others) (are )?viewing/i`.

**Threshold.** Any countdown not backed by a real scheduled campaign end → reject.

**Source.** UK Government Stop! Think Fraud (OGL v3.0 — ingestible) and Which? both list
countdown pressure among fake-site signals. Institutional weight, not statistical power.

---

## AT-8 — Decorative, unverifiable trust badges `[P]` · **warn**

Security badges that are images linking nowhere.

**Detect.** `img` whose `src`/`alt`/`class` matches
`/(trust|secure|badge|seal|guarantee|verified|ssl|norton|mcafee)/i`; test whether each is
wrapped in an `<a>` resolving to a third-party verification host. Count total badges.

**Threshold.** Unlinked badge → warn. More than 6 badges → badge-spam warn.

**Honest double-edge.** Baymard found a *homemade* seal outperformed real SSL seals from
established vendors except Norton, and 19% abandoned checkout over card-security distrust.
So decorative badges can raise naive-user trust *while* matching a consumer-body fraud
heuristic. Warn; do not block.

---

## AT-9 — Measured LLM style vocabulary in body copy `[E]` list / `[H]` threshold · **warn**

**Detect.** Case-insensitive whole-word match against the 407 `style`-tagged rows of
`excess_words.csv` (MIT — we may ship the list). **Do not stem** — the source counts
inflections separately. Compute distinct-style-words per 100 words on blocks ≥100 words.

**Threshold.** ≥3 distinct style words per 100 words. **This cutoff is ours.** The source
method is explicitly corpus-level and states it "cannot identify individual abstracts that may
have been processed by an LLM."

**Evidence and its limit.** The word list is measured over 15.3M PubMed abstracts —
*delves* r=28.0, *underscores* r=13.8, *showcasing* r=10.7 — corroborated independently on
peer reviews (*meticulous* 34.7×, *intricate* 11.2×). But **every measurement is on academic
prose.** Marketing copy is natively promotional: *elevate*, *crafted*, *curated*, *seamless*
have far higher legitimate base rates in DTC copy than in PubMed. **Calibrate against our own
human-written Shopify corpus before this ever blocks anything.**

**Refresh quarterly.** Markers decay — *delve* already dropped off sharply during 2025. Log
which rules fire so we can watch the decay.

---

## AT-10 — Cliché headline templates `[P]` · **regenerate**

Hero headlines using multi-token phrase templates with near-zero base rate in good human copy.

**Detect.** Regex tripwires, from a CC0 expert-elicited list:

```
negative_parallelism: (?i)\b(?:it'?s|it is|this is|we'?re)\s+not\s+(?:just|only|merely|simply)\b[^.!?;]{0,60}?[,—–-]{0,3}\s*(?:it'?s|it is|but)\b
not_only_but_also:    (?i)\bnot\s+only\b[^.!?;]{1,80}\bbut\s+(?:also\b)?
todays_world:         (?i)\bin\s+(?:today'?s|a|an|this)\s+(?:[a-z-]+\s+){0,2}(?:world|landscape|market|era)\b
unlock_power:         (?i)\bunlock(?:s|ing)?\s+(?:the\s+)?(?:power|potential|secret(?:s)?|magic)\b
elevate_your:         (?i)\belevat(?:e|es|ing)\s+(?:your|the|every)\b
meticulously_crafted: (?i)\b(?:meticulous|careful|thoughtful|expert|lovingly)(?:ly)?\s+(?:crafted|curated|designed|sourced)\b
more_than_just:       (?i)\bmore\s+than\s+just\b
paving_the_way:       (?i)\bpav(?:e|es|ed|ing)\s+the\s+way\b
```

**Threshold.** Any match in a headline or tagline → regenerate. Precision is high because the
patterns are multi-token; recall does not matter because we control the generator and can retry.

**Provenance is unusually good for a `[P]`.** The list came from five expert annotators who hit
99.7% by majority vote, beating every commercial detector tested, and was adversarially
validated by using the guidebook as an *evasion* prompt. But no measured frequency data exists
for "in today's fast-paced" or "unlock the power of" specifically. Use them; do not call them
measured.

---

## AT-11 — Cross-store copy homogenisation `[E]` · **warn at portfolio level**

Copy converges across the portfolio even when each page passes individually.

**Detect.** Pairwise similarity across every store we generate, on four axes: lexical n-gram
Jaccard, POS-sequence syntactic, embedding cosine semantic, and style. Gate on max pairwise.

**Evidence.** Italy's April 2023 ChatGPT ban as a natural experiment: losing access *decreased*
inter-firm similarity by 15% lexical / 12% syntactic — GenAI access measurably homogenises
marketing copy, and the ban also raised engagement ~3.5%. **Caveats:** working paper, not peer
reviewed; domain is restaurant Instagram, not storefronts.

---

## AT-12 — Default framework accent hue `[P]` (arithmetic is `[E]`) · **warn**

The accent colour is an untouched framework default, so the store inherits Tailwind's brand
rather than the merchant's.

**Detect.** Collect computed `color`, `background-color`, `border-color` and gradient stops
across rendered elements. Convert to HSL. Compute the area-weighted dominant *chromatic* hue,
excluding S<0.10, L<0.08 and L>0.92.

**Threshold — corrected, and the colour space is part of the threshold.** The band is
**236–274° in HSL** with S>0.70 and L in 0.52–0.70. Not 250–290°. Tailwind v4 publishes its
palette in **OKLCH**, not hex, and OKLCH hue is a different number for the same colour — stating
the band without naming the space is the classic way this check goes wrong.

| Token | v4.3 OKLCH (as published) | v4.3 hex | HSL hue | v3 hex | v3 HSL hue |
|---|---|---|---|---|---|
| indigo-500 | `oklch(58.5% 0.233 277.117)` | `#615fff` | 241.0° | `#6366f1` | 238.7° |
| violet-500 | `oklch(60.6% 0.25 292.717)` | `#8e51ff` | 260.9° | `#8b5cf6` | 258.3° |
| purple-500 | `oklch(62.7% 0.265 303.9)` | `#ad46ff` | 273.3° | `#a855f7` | 270.7° |
| blue-500 | `oklch(62.3% 0.214 259.815)` | `#2b7fff` | 216.3° | `#3b82f6` | 217.2° |
| sky-500 | `oklch(68.5% 0.169 237.323)` | `#00a6f4` | 199.3° | `#0ea5e9` | 198.6° |
| cyan-500 | `oklch(71.5% 0.143 215.221)` | `#00b8db` | 189.5° | `#06b6d4` | 188.7° |

The OKLCH values are quoted verbatim from the Tailwind v4.3 docs; hex and HSL are computed from
them. The band holds across the v3→v4 palette change — all three accent hues stayed inside
236–274° HSL — which is why the band, not the hex, is the durable signal.

A 250° floor would miss indigo, the most-used default. A 290° ceiling in HSL catches only
fuchsia, which is not part of the phenomenon. **In OKLCH the equivalent accent band is
274–306°** — never mix the two numbers.

**Exact-hex matching must carry both generations.** A detector holding only the v3 hexes silently
stops firing on any store built with Tailwind v4. Match the OKLCH triples first; fall back to the
twelve hexes above.

**Honesty requirement.** The arithmetic is verified. The claim that *AI over-produces this hue*
is folklore — **no measurement of accent-hue distribution in AI-generated pages exists.** And
half the folk explanation is demonstrably false: shadcn/ui's default base is **Neutral**,
`--primary: oklch(0.205 0 0)`, chroma exactly zero. Never repeat the shadcn half.

---

## AT-13 — Emoji standing in for an icon set `[E]` a11y / `[H]` AI-tell · **reject on a11y**

**Detect.** `/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/u` over rendered
text nodes. For each hit, check for `role="img"` plus non-empty `aria-label`, or
`aria-hidden="true"` plus adjacent visible text. Count emoji appearing as the leading child of
repeated sibling elements — that is the icon-substitution shape specifically.

**Threshold.** Any emoji without `role="img"`+`aria-label` or `aria-hidden` → **reject on
accessibility grounds regardless of aesthetics.** Emoji in a repeated card/list structure →
reject as icon substitution.

**Split evidence.** That unlabelled emoji is an a11y defect is `[E]` — browsers do not
consistently expose emoji in the accessibility tree, so screen-reader users may miss them.
That emoji-as-icon is an *AI* tell is `[H]`; no source measures it.

---

## AT-14 — Flat, interchangeable surfaces `[P]` · **warn**

One identical shadow everywhere, so nothing reads as nearer or further than anything else.

**Detect.** Collect computed `box-shadow`; normalise whitespace and colour notation; count
distinct non-`none` values. Parse y-offset and blur; flag `y-offset === 0` with `blur > 0` on
the dominant shadow.

**Threshold.** Warn when ≥12 elements share exactly one shadow value and no second value
exists; warn when zero-offset shadows appear on ≥80% of shadowed elements.

**Evidence level.** NN/g's expert review says AI screens "appear flat and interchangeable"
despite colour and interactivity — expert observation, n=1 project, no inter-rater statistics.
No quantitative link between shadow-token count and perceived quality exists anywhere.

---

## AT-15 — Hierarchy inversion `[P]` · **warn**

Prominence does not track content priority.

**Detect.** Per section, compute a prominence vector (rendered area, distance from top, max
font-size, background contrast vs page) against a content-weight proxy (word count, CTA
presence, product-data density). Flag top-decile-area elements holding a single text node
under 4 words. Separately count distinct `font-weight` and distinct text `color` values.

**Threshold.** Warn when `distinct font-weights < 2 AND distinct text colours < 3`. **These
numbers are ours** — no published basis.

**Source.** NN/g names it precisely: "unnecessary use of prominent containers displaying a
single piece of numerical information," visual prominence misaligned with content priority.

---

## §Z — Three checks we must NOT build

Each sounds reasonable and each is wrong. Documented here so nobody re-proposes them.

**Z1 — Em-dash density as an authorship signal. Do not build.**
This is not folklore — it was measured across 12 models and ~240k words — and *the measurement
kills the rule.* Human baseline is 3.23 em dashes per 1,000 words; GPT-5.4 is **1.43** and Llama
is **0.00**, both *below* humans. Expert annotators coded dash *presence* as a **human** tell.
The arithmetic is fatal at headline length: a 12-word headline expects 0.127 em dashes at the
worst model rate versus 0.039 for humans. Strip em dashes as a brand-voice preference if you
like; never as an authorship judgement.

**Z2 — Third-party AI-text detectors on marketing copy. Do not build.**
Published minimum input lengths: Turnitin 300 words, OpenAI ~150–200, Originality.ai 100,
GPTZero 50, Pangram 50. **The industry floor is 50 words. A Shopify hero headline is 5–20.**
Calling any detector API there is outside every vendor's own stated operating range. Worse,
there is an ethical constraint: seven detectors on 91 TOEFL essays by non-native English
writers produced a **61.22% false-positive rate** (97.8% flagged by at least one) versus ~5.19%
for native speakers — the mechanism is low perplexity, not AI authorship. If our copy is ever
human-edited by a non-native speaker, a perplexity check preferentially rejects their work.
Independent testing found **all 14 detectors below 80% accuracy**. Use auditable pattern rules
only. Full product descriptions of 150–400 words are technically in range if a second opinion
is ever wanted; headlines never are.

**Z3 — Penalising conventional layout. Do not build.**
Covered in `04-design-taste.md` §A. The strongest aesthetics evidence (prototypicality
ηp²=.812) says users **reward** pages that look like a typical example of their category, and
complexity actively degrades task performance. A rule that flags symmetric centring, a
three-column feature row, or low visual complexity is optimising against the evidence. The
defensible targets are duplication, thinness, missing signals and borrowed assets.
