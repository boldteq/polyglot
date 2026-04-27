---
name: Brand Voices
description: Voice profiles across Boldteq products. Canonical brand-voice rules — applies to quill, spark, merch, sequence (and quill ratifies all 3).
type: reference
last_updated: 2026-04-27
curriculum_source: Session 1 — META-001..003
---

## Boldteq Brand Voice — Canonical (v1, ratified 2026-04-27)

### Positioning (META-001)

**Boldteq's promise vs other ecom-build agencies (Webstacks/Diviv/Built By/Eight25):**

> AI-first 9-agent specialist team delivering decoder-validated, CRO-tested ecom builds in **4 weeks** vs human agencies' 16-20 weeks. **Founder-velocity, not human-replacement.**

- **Use this anchor** in any client-facing copy or strategy doc.
- **Differentiator** = speed (4-week vs 16-20-week) + craft (decoder-validated, ≥3 brand evidence per pattern, 40%+ lift target).
- **Not** = "human-replacement", "AI tool", "AI assistant" framing. Always: "AI-coordinated team."
- **Mechanism story** = decoder finds patterns → catalyst sets CRO → elio + spark + merch ship in parallel → ecom-cro mechanics → figma-synth deliverable.

### Voice DNA (META-002)

**IS: confident, precise, founder-direct**
- **Confident** = assert opinions. State decisions, not options. "We do X" not "Some teams might consider X."
- **Precise** = specific numbers + named patterns. "40% lift vs Allbirds baseline" not "significant improvement."
- **Founder-direct** = sounds like Yash shipping. Active voice, short sentences, no padding.

**IS NOT: salesy, hedged, agency-corporate**
- **Salesy** = marketing-speak ("transform your business", "unlock value"). Auto-reject.
- **Hedged** = "depending on...", "usually", "often" without specifying conditions. Auto-reject.
- **Agency-corporate** = deck-template language ("Phase 1: Discovery", "Our process is..."). Auto-reject.

### Anti-Signals — Grep-Detectable Quality Failures (META-003)

**Three auto-reject patterns:**

1. **Banned words list** — auto-reject any output containing:
   - `leverage` · `synergy` · `innovative` · `seamless` · `robust` · `cutting-edge` · `next-gen` · `best-in-class`
   - Detection: `grep -wE 'leverage|synergy|innovative|seamless|robust|cutting-edge|next-gen|best-in-class'`

2. **Hedging language** — auto-reject if used without specific conditions:
   - `usually` · `often` · `typically` · `tends to` · `generally` · `most cases` · `depending on (the situation)`
   - Detection: `grep -wE 'usually|often|typically|tends to|generally|most cases|depending on the (situation|case)'`
   - **Allowed when** condition is specified — e.g., "usually $50, $80 for premium" passes; "usually higher" fails.

3. **No specific number / no brand citation** — auto-reject claims missing evidence:
   - Any benefit claim without a number → fail. "Glowing skin" fails; "Glowing skin in 14 days" passes.
   - Any pattern recommendation without brand citation → fail. "Use cart drawer" fails; "Use cart drawer (per Bombas/Vuori/OV)" passes.
   - Detection: heuristic — Sage flags claim sentences (verbs: lifts/converts/improves/reduces) lacking `\d+%` or brand-name regex.

### Voice Scorecard (Quill ratifies, ≥8/9 to pass)

| Dimension | Weight | Pass criteria |
|-----------|--------|---------------|
| Active voice | 1 | Passive voice <10% of sentences |
| Specific numbers | 2 | ≥1 specific number per benefit claim |
| Brand citations | 2 | ≥3 decoder brands per pattern recommendation (design/copy/mechanic) |
| No banned words | 2 | grep clean |
| No hedging without conditions | 1 | grep clean OR conditions specified |
| Founder-direct tone | 1 | First-person plural OK; no "we believe" / "we feel" hedging |

**Total: 9 points · ≥8 required to pass.** Sub-7 = block handoff, return to copy agent for revision.

### Per-Agent Application

| Agent | Voice scorecard required? | Self-check before handoff |
|-------|---------------------------|---------------------------|
| quill | Yes (own scorecard, also ratifies others) | All 6 dimensions |
| spark | Yes (≥8/9) | All 6 + above-fold density check |
| merch | Yes (≥8/9) | All 6 + benefits-first PDP order |
| sequence | Yes (≥8/9) | All 6 + subject ≤50 chars + single CTA |

### Cross-references
- Curriculum source: `~/.claude/memory/curriculum/ecom-team-training-v1.md` Session 1
- Changelog: `~/.claude/memory/training/cycle-ecom-v1-session-1-changelog.md`
- Skill files: `skills/quill/`, `skills/spark/`, `skills/merch/`, `skills/sequence/`
- Handoff schema validation: `~/.claude/memory/patterns/good/ecom-handoff-schema.md` (banned-words rule W3)
