# v3 Business Context Resolver

**Owner:** catalyst (primary) + elio + spark + merch consume output
**Source:** v3 Production Design System §3
**Adopted:** 2026-04-30 — Hard enforcement on briefs

---

## Input contract

```ts
interface BusinessContext {
  goal: 'signups' | 'revenue' | 'engagement' | 'retention' | 'awareness' | 'lead_gen' | 'demo_request';
  goal_target?:  { metric: string, value: number, timeframe: string };

  audience: {
    icp:              string;
    role:             string;
    sophistication:   'novice' | 'intermediate' | 'expert';
    jobs_to_be_done:  string[];
    objections:       string[];
    motivations:      string[];
    current_alternatives: string[];
  };

  competitors: {
    direct:           string[];
    indirect:         string[];
    differentiation:  string[];
  };

  constraints: {
    timeline:  string;
    budget:    'low' | 'medium' | 'high';
    channels:  string[];
    legal:     string[];
  };
}
```

---

## Goal → CRO patterns (HARD ENFORCED)

catalyst rejects briefs missing required CRO patterns per goal.

```ts
const cro_priorities = {
  signups:        ['cta_above_fold', 'social_proof_band', 'risk_reversal', 'reduce_form_fields'],
  revenue:        ['three_tier_anchor', 'value_recap_at_cta', 'guarantee', 'urgency_signal'],
  engagement:     ['progress_indicator', 'recent_activity', 'personalization'],
  retention:      ['progress_indicator', 'milestone_celebration', 'next_best_action'],
  awareness:      ['social_proof_band', 'press_mentions', 'numeric_proof'],
  lead_gen:       ['lead_magnet', 'reduce_form_fields', 'risk_reversal'],
  demo_request:   ['social_proof_band', 'numeric_proof', 'team_credentials'],
};
```

Brief without all required patterns → catalyst rejects + flags missing patterns. spark/elio/merch implement required blocks.

---

## Audience.sophistication → tone (STRICT 3-tier)

```ts
const tone_map = {
  novice:        { copy_tone: 'reassuring', density: 'medium', jargon_allowed: false },
  intermediate:  { copy_tone: 'confident',  density: 'medium', jargon_allowed: false },
  expert:        { copy_tone: 'precise',    density: 'high',   jargon_allowed: true  },
};
```

spark + merch enforce per audience. Mismatched copy → reject.

---

## Objection → block placement (DICTIONARY-DRIVEN)

```ts
const objectionToZone = {
  'data security':      'cta_callout',         // hero security badge
  'integration time':   'how_it_works',        // process timeline
  'price':              'comparison_block',    // vs alternatives
  'feature bloat':      'anti_features_block', // "what we deliberately don't do"
  'vendor lock-in':     'export_portability',  // data ownership block
  'wasted time':        'guarantee',           // money-back / time-back
  'compliance':         'cert_badges',         // SOC2/GDPR/HIPAA strip
  'support quality':    'team_credentials',    // founder/expert profiles
};
```

elio reserves slot per matched objection. merch generates rebuttal copy. spark writes hero microcopy if cta_callout zone hit.

---

## Competitor differentiation callout (AUTO-INCLUDE)

When `competitors.direct.length > 0`:

```
{
  headline:  `Why teams choose us over ${competitors.direct[0]}`,
  points:    competitors.differentiation,
  placement: 'after_features',
}
```

Always included if direct competitors named. elio reserves block; merch writes points.

---

## Worked example

**Input:**
```json
{
  "goal": "signups",
  "audience": {
    "icp": "B2B SaaS founders launching first product",
    "sophistication": "intermediate",
    "objections": ["wasted time", "feature bloat"],
    "motivations": ["speed to launch", "ship without engineers"]
  },
  "competitors": {
    "direct": ["Webflow", "Framer"],
    "differentiation": ["AI-native", "code export", "1-week to production"]
  }
}
```

**Resolved:**
- `cro_priorities`: must include cta_above_fold + social_proof_band + risk_reversal + reduce_form_fields
- `cta_pattern: 'no_friction'` → "Ship in a week, no engineers"
- `must_address: ['wasted time', 'feature bloat']` → guarantee block + anti-features block
- `differentiation_callout: 'Why teams choose us over Webflow'` after features
- `copy_tone: 'confident'` → headlines specific, not vague

---

## Enforcement points

1. catalyst gate on brief intake — checks required CRO patterns vs goal
2. catalyst gate on copy — checks tone vs sophistication
3. elio gate on layout — verifies all `must_address` objections have zones
4. catalyst gate on output — verifies competitor callout when applicable

---

## Cross-references

- A/B variant axis selection: `v3-ab-variant-engine.md`
- Pattern library learning: `v3-memory-architecture.md`
- Spark hero CTA copy formulas: `~/.claude/skills/spark/above-fold-cta-protocol.md`
- Merch PDP body order: `~/.claude/skills/merch/pdp-copy-formula.md`
