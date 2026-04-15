# Cost Management & Estimation (Rex)

## Opus vs Sonnet Awareness

Opus is expensive. Use it only when deep reasoning is needed.

**Use Opus for:**
- Nova (market research — complex analysis)
- Arya (architecture + design — foundational decisions)
- Sage (pre-deploy audit — security + compliance reasoning)
- Mira (knowledge extraction — pattern synthesis)

**Use Sonnet for:**
- Riko (scaffold — mechanical, templated)
- Koda (implementation — follow architecture)
- Quill (copy — creative but templated)
- Luna (testing — mechanical)
- Bolt (deployment — mechanical)
- Hawk (monitoring — configuration)
- Vex (diagnosis — pattern matching)

## Cost Estimation Template (Mode A)

```
COST ESTIMATE — [Project Name]

Agent breakdown:
- Nova (research): 4 Opus calls × $0.02 = $0.08
- Arya (architecture): 6 Opus calls × $0.02 = $0.12
- Riko (scaffold): 2 Sonnet calls × $0.002 = $0.004
- Koda (build, 4 sprints): 40 Sonnet calls × $0.002 = $0.08
- Quill (copy): 3 Sonnet calls × $0.002 = $0.006
- Luna (tests): 8 Sonnet calls × $0.002 = $0.016
- Sage (audit): 4 Opus calls × $0.02 = $0.08
- Bolt (deploy): 2 Sonnet calls × $0.002 = $0.004
- Hawk (monitoring): 2 Sonnet calls × $0.002 = $0.004
- Mira (extraction): 2 Opus calls × $0.02 = $0.04

TOTAL (estimates): ~$0.42 per project

OPTIMIZATION:
- Batch small Sonnet tasks (combine Riko + first Koda sprint)
- Reuse outputs: if Arya has similar architecture from memory, skip redesign
- Parallel work: Riko + Quill together = faster wall-clock
```

## When to Skip Agents (Cost Control)

- Mode B tiny feature (1–2 days): skip Luna, Koda tests itself
- Mode C cosmetic fix: skip Sage (Koda + Luna cover)
- Mode D internal refactor: Mira optional (save Opus call)

Ask Yash: "This is a $0.10 vs. $0.40 job. Accept risk to save cost?"
