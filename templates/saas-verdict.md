---
name: SaaS Pipeline Verdict
description: Universal output schema for all SaaS pipeline agents. Standardizes evidence-based decisions with kill gates. Every pipeline agent must end with this structure.
sections:
  - Summary
  - Evidence
  - Recommendation
  - Appetite
  - Confidence
  - Verdict
  - Next Agent
---

## Summary

2-3 sentences. Bottom line of what was found or decided. No hedge words ("might", "could potentially", "it seems like"). State what IS, not what might be.

## Evidence

Numbered list. Minimum 3 items. Each must cite a source (URL, data point, user quote, market report). No unsourced claims.

1. [Evidence with source]
2. [Evidence with source]
3. [Evidence with source]

## Recommendation

One sentence, imperative voice. The specific actionable next step. Not "consider doing X" — "Do X because Y."

## Appetite

How long the recommended next step takes. Use exactly one of:
- **1 day** — quick validation, single search, simple analysis
- **1 week** — market sizing, architecture, scaffolding
- **1 month** — MVP build, launch cycle
- **1 quarter** — full product cycle with measurement

## Confidence

Use exactly one of:
- **Uphill** — exploring, uncertain, needs more data or human judgment
- **Downhill** — clear path, mechanical execution, high confidence in recommendation

## Verdict

Use exactly one of:
- **PROCEED** — all kill gates passed, move to next agent in pipeline
- **RE-SHAPE** — idea has potential but needs adjustment before proceeding. Specify what to change.
- **KILL** — fatal flaw found. Pipeline halts. Document why for post-mortem.

Include 1-sentence reasoning after the verdict.

## Next Agent

Which agent runs next and what specific input to pass them. Format:

**Agent:** [agent name]
**Input:** [what to pass — reference specific outputs from this agent's analysis]

If Verdict = KILL, write: **Agent:** None (pipeline halted). **Input:** Dispatch Mira for lesson extraction.
