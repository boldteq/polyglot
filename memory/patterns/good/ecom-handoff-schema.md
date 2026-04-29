# Ecom Team Handoff JSON Schema v1

**Date:** 2026-04-27
**Owner:** yash (authority) + cadence (custodian)
**Status:** ENFORCING starting W4 (advisory W2-W3)
**Replaces:** text-based markdown handoffs in `.handoffs/[from]-to-[to]-[ts].md`
**Applies to:** all 9 ecom team agents (decoder, catalyst, elio, token, figma-synth, spark, ecom-cro, merch, sequence)

---

## Why a structured handoff schema

Text-based handoffs in `.handoffs/` are unparseable — Polyglot orchestration can't auto-route based on output quality, and validation gates can't gate on missing fields. Structured JSON enables:
1. **Machine validation** — every handoff passes through `Polyglot/src/lib/handoff-validate.js` before next-agent dispatch
2. **Composite-score routing** — orchestrator reads `composite_score_at_handoff` to decide if next agent needs senior backup
3. **Decoder-evidence enforcement** — every spec must cite ≥3 brand sources, blocked at handoff if missing
4. **Pipeline replay** — full audit trail of what each agent produced

---

## TypeScript interface (canonical)

```typescript
type AgentId =
  | "decoder" | "catalyst" | "elio" | "token" | "figma-synth"
  | "spark" | "ecom-cro" | "merch" | "sequence"
  | "vega" | "quill" | "yash" | "cadence";  // upstream/escalation

type Surface =
  | "pdp" | "cart" | "checkout" | "listing" | "hero"
  | "post-purchase" | "subscription" | "email"
  | "trust" | "motion" | "mobile" | "category"
  | "design-system" | "deliverable";

type HandoffType =
  | "design-spec"      // elio output → spark/merch/figma-synth/pod-frontend
  | "copy-spec"        // spark/merch output → elio/pod-frontend
  | "mechanic-spec"    // ecom-cro output → pod-frontend/pod-backend
  | "teardown"         // decoder output → catalyst/elio/spark/merch
  | "test-result"      // catalyst output → all (winners declared)
  | "patch"            // tutor output → agent .md or skill file
  | "lifecycle-email"  // sequence output → pod-backend/postmark
  | "deliverable"      // figma-synth/token output → vega/client
  | "escalation";      // any agent → cadence/yash on blocker

interface EcomHandoff {
  /** Schema version — bump major on breaking changes */
  schemaVersion: "1.0";

  /** Source agent producing this handoff */
  from: AgentId;

  /** Target agent(s). Array enables fan-out (e.g., catalyst → [elio, spark, merch]) */
  to: AgentId | AgentId[];

  /** Handoff classification */
  type: HandoffType;

  /** Project/brief identifier — links across pipeline runs */
  brief_id: string;

  /** Surface or capability touched */
  surface: Surface;

  /** What was produced */
  deliverables: {
    /** Files written or modified */
    files_written: { path: string; lines: number; status: "created" | "modified" }[];

    /** Non-file artifacts (Figma frames, design specs as JSON, copy variants) */
    artifacts: { type: string; path_or_id: string; description?: string }[];

    /** Decoder brand citations — 3+ required for design/copy specs */
    decoder_evidence: string[];

    /** CRO lift target as decimal (0.40 = 40%) */
    lift_target: number;

    /** Variant count if A/B test deliverable */
    variant_count?: number;
  };

  /** Self-validation gates passed before handoff */
  validation: {
    /** Agent's own self-check checklist passed */
    self_check_passed: boolean;

    /** Quill voice scorecard — required for copy agents (spark/merch/sequence) */
    voice_scorecard?: number; // 1-9, ≥8 required to pass

    /** Decoder baseline cited in lift_target rationale */
    decoder_baseline_cited: boolean;

    /** Mobile spec exists alongside desktop */
    mobile_specced: boolean;

    /** WCAG 2.1 AA contrast + keyboard + focus checks done */
    accessibility_passed: boolean;

    /** For mechanic agents (ecom-cro): no literal copy strings (slot IDs only) */
    scope_split_clean?: boolean;
  };

  /** Open issues that block downstream */
  blockers: {
    description: string;
    owner: AgentId;
    severity: "critical" | "high" | "medium" | "low";
  }[];

  /** Concrete actions for receiving agent */
  next_steps: {
    action: string;
    owner: AgentId;
    due_within_hours?: number;
  }[];

  /** Composite score at time of handoff (from /api/dispatch/readiness) */
  composite_score_at_handoff: number;

  /** Patches applied to this agent prior to producing this handoff */
  training_patches_applied: number;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Polyglot run ID — links to agent_runs row */
  run_id?: string;

  /** Free-text notes for receiving agent (use sparingly) */
  notes?: string;
}
```

---

## JSON Schema (machine-validatable)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://boldteq.io/schemas/ecom-handoff-1.0",
  "title": "EcomHandoff",
  "type": "object",
  "required": [
    "schemaVersion", "from", "to", "type", "brief_id", "surface",
    "deliverables", "validation", "blockers", "next_steps",
    "composite_score_at_handoff", "training_patches_applied", "timestamp"
  ],
  "properties": {
    "schemaVersion": { "const": "1.0" },
    "from": { "$ref": "#/$defs/AgentId" },
    "to": {
      "oneOf": [
        { "$ref": "#/$defs/AgentId" },
        { "type": "array", "items": { "$ref": "#/$defs/AgentId" }, "minItems": 1 }
      ]
    },
    "type": {
      "enum": [
        "design-spec", "copy-spec", "mechanic-spec", "teardown",
        "test-result", "patch", "lifecycle-email", "deliverable", "escalation"
      ]
    },
    "brief_id": { "type": "string", "minLength": 1 },
    "surface": {
      "enum": [
        "pdp", "cart", "checkout", "listing", "hero", "post-purchase",
        "subscription", "email", "trust", "motion", "mobile", "category",
        "design-system", "deliverable"
      ]
    },
    "deliverables": {
      "type": "object",
      "required": ["files_written", "artifacts", "decoder_evidence", "lift_target"],
      "properties": {
        "files_written": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["path", "lines", "status"],
            "properties": {
              "path": { "type": "string" },
              "lines": { "type": "integer", "minimum": 0 },
              "status": { "enum": ["created", "modified"] }
            }
          }
        },
        "artifacts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["type", "path_or_id"],
            "properties": {
              "type": { "type": "string" },
              "path_or_id": { "type": "string" },
              "description": { "type": "string" }
            }
          }
        },
        "decoder_evidence": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 0
        },
        "lift_target": { "type": "number", "minimum": 0, "maximum": 2 },
        "variant_count": { "type": "integer", "minimum": 1 }
      }
    },
    "validation": {
      "type": "object",
      "required": ["self_check_passed", "decoder_baseline_cited", "mobile_specced", "accessibility_passed"],
      "properties": {
        "self_check_passed": { "type": "boolean" },
        "voice_scorecard": { "type": "integer", "minimum": 1, "maximum": 9 },
        "decoder_baseline_cited": { "type": "boolean" },
        "mobile_specced": { "type": "boolean" },
        "accessibility_passed": { "type": "boolean" },
        "scope_split_clean": { "type": "boolean" }
      }
    },
    "blockers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["description", "owner", "severity"],
        "properties": {
          "description": { "type": "string", "minLength": 1 },
          "owner": { "$ref": "#/$defs/AgentId" },
          "severity": { "enum": ["critical", "high", "medium", "low"] }
        }
      }
    },
    "next_steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "owner"],
        "properties": {
          "action": { "type": "string", "minLength": 1 },
          "owner": { "$ref": "#/$defs/AgentId" },
          "due_within_hours": { "type": "number", "minimum": 0 }
        }
      }
    },
    "composite_score_at_handoff": { "type": "number", "minimum": 0, "maximum": 10 },
    "training_patches_applied": { "type": "integer", "minimum": 0 },
    "timestamp": { "type": "string", "format": "date-time" },
    "run_id": { "type": "string" },
    "notes": { "type": "string" }
  },
  "$defs": {
    "AgentId": {
      "enum": [
        "decoder", "catalyst", "elio", "token", "figma-synth",
        "spark", "ecom-cro", "merch", "sequence",
        "vega", "quill", "yash", "cadence"
      ]
    }
  }
}
```

---

## Validation rules (enforced by `Polyglot/src/lib/handoff-validate.js`)

### Hard rules (block handoff if violated)
1. `schemaVersion === "1.0"`
2. All `required` fields present per JSON Schema
3. `from !== to` (no self-handoff except `escalation` type)
4. For `type: "design-spec" | "copy-spec" | "mechanic-spec"`: `deliverables.decoder_evidence.length >= 3`
5. For `type: "copy-spec"` with `from in [spark, merch, sequence]`: `validation.voice_scorecard >= 8`
6. For `type: "mechanic-spec"` with `from === "ecom-cro"`: `validation.scope_split_clean === true`
7. For all design/copy/mechanic specs: `validation.mobile_specced === true`
8. `validation.self_check_passed === true`
9. `composite_score_at_handoff >= 0` (never null — pull from /api/dispatch/readiness)

### Soft warnings (log, don't block)
- `lift_target < 0.4` for catalyst-routed specs (40% mandate)
- `blockers` array contains `severity: critical` items (auto-escalate to cadence)
- `training_patches_applied < 5` (agent may be insufficiently trained)
- `decoder_evidence.length < 3` for non-spec types (recommended best-practice)

### Type-specific rules

| `type` | Required `from` | Required `to` | Extra rules |
|--------|----------------|---------------|-------------|
| `teardown` | `decoder` | `catalyst` or fan-out | `surface: "deliverable"` allowed; min 1 brand |
| `design-spec` | `elio` (or `pixel`) | depends | `mobile_specced && accessibility_passed` |
| `copy-spec` | `spark`, `merch`, or `sequence` | depends | `voice_scorecard >= 8` |
| `mechanic-spec` | `ecom-cro` | `pod-frontend/backend` | `scope_split_clean` |
| `test-result` | `catalyst` | broadcast | requires lift % + statistical gate evidence in `notes` |
| `patch` | `tutor` | one agent | `next_steps[0].action` includes `rollback_content` reference |
| `lifecycle-email` | `sequence` | `pod-backend` or `postmark` | `voice_scorecard >= 8` |
| `escalation` | any | `cadence` or `yash` | severity must include `critical` or `high` |

---

## Storage location

Handoff JSON stored in 3 places:
1. **Polyglot DB**: `agent_runs.metadata` field — primary record
2. **Filesystem**: `.handoffs/[brief_id]/[from]-to-[to]-[run_id].json` — local artifact for replay
3. **Supabase `agent-ops`**: `agent_events` table, `event_type='handoff'` — observability

---

## Example payloads

### Decoder → Catalyst (teardown)
```json
{
  "schemaVersion": "1.0",
  "from": "decoder",
  "to": "catalyst",
  "type": "teardown",
  "brief_id": "boldteq-internal-2026-04-27",
  "surface": "deliverable",
  "deliverables": {
    "files_written": [
      { "path": "memory/patterns/good/ecom-brand-teardowns.md", "lines": 487, "status": "modified" }
    ],
    "artifacts": [
      { "type": "teardown", "path_or_id": "allbirds-2026-04-27", "description": "8-dimension full teardown" },
      { "type": "screenshots", "path_or_id": "memory/patterns/good/teardown-screenshots/allbirds/" }
    ],
    "decoder_evidence": ["allbirds.com/products/mens-tree-runner-go", "allbirds.com/cart", "allbirds.com/checkout"],
    "lift_target": 0
  },
  "validation": {
    "self_check_passed": true,
    "decoder_baseline_cited": false,
    "mobile_specced": true,
    "accessibility_passed": true
  },
  "blockers": [],
  "next_steps": [
    { "action": "Review allbirds-2026-04-27 teardown for niche-audit-apparel synthesis", "owner": "catalyst", "due_within_hours": 48 }
  ],
  "composite_score_at_handoff": 7.2,
  "training_patches_applied": 12,
  "timestamp": "2026-04-27T18:23:00Z",
  "run_id": "polyglot-run-7f3a"
}
```

### Catalyst → [elio, spark, merch] (test-result + dispatch)
```json
{
  "schemaVersion": "1.0",
  "from": "catalyst",
  "to": ["elio", "spark", "merch"],
  "type": "test-result",
  "brief_id": "client-acme-pdp-redesign",
  "surface": "pdp",
  "deliverables": {
    "files_written": [
      { "path": "client-acme/cro-roadmap.md", "lines": 220, "status": "created" }
    ],
    "artifacts": [
      { "type": "ICE-scored-test-roadmap", "path_or_id": "roadmap-2026-04-30", "description": "Top 3 PDP tests prioritized" }
    ],
    "decoder_evidence": ["allbirds.com", "outdoor-voices.com", "vuori.com"],
    "lift_target": 0.4,
    "variant_count": 3
  },
  "validation": {
    "self_check_passed": true,
    "decoder_baseline_cited": true,
    "mobile_specced": true,
    "accessibility_passed": true
  },
  "blockers": [],
  "next_steps": [
    { "action": "Spec PDP hero variants (3) per ICE-001", "owner": "elio", "due_within_hours": 72 },
    { "action": "Author 3 hero CTA variants per ICE-001 baseline", "owner": "spark", "due_within_hours": 48 },
    { "action": "Author PDP body + objection-handling per ICE-002", "owner": "merch", "due_within_hours": 96 }
  ],
  "composite_score_at_handoff": 8.1,
  "training_patches_applied": 18,
  "timestamp": "2026-04-30T10:14:00Z",
  "run_id": "polyglot-run-9b2d"
}
```

### Ecom-CRO → Pod-Frontend (mechanic-spec)
```json
{
  "schemaVersion": "1.0",
  "from": "ecom-cro",
  "to": "pod-b-frontend",
  "type": "mechanic-spec",
  "brief_id": "client-acme-pdp-redesign",
  "surface": "cart",
  "deliverables": {
    "files_written": [
      { "path": "client-acme/specs/cart-mechanics.md", "lines": 340, "status": "created" }
    ],
    "artifacts": [
      { "type": "state-machine-diagram", "path_or_id": "cart-drawer-fsm", "description": "5 states, 12 transitions" },
      { "type": "abandon-trigger-config", "path_or_id": "cart-abandon-rules-v1" }
    ],
    "decoder_evidence": ["bombas.com/cart", "vuori.com/cart", "outdoor-voices.com/cart"],
    "lift_target": 0.4
  },
  "validation": {
    "self_check_passed": true,
    "decoder_baseline_cited": true,
    "mobile_specced": true,
    "accessibility_passed": true,
    "scope_split_clean": true
  },
  "blockers": [
    { "description": "Free-shipping threshold $50 vs $80 unresolved — needs catalyst niche call", "owner": "catalyst", "severity": "medium" }
  ],
  "next_steps": [
    { "action": "Implement cart drawer per state machine", "owner": "pod-b-frontend", "due_within_hours": 120 },
    { "action": "Implement free-shipping threshold logic", "owner": "pod-b-backend", "due_within_hours": 48 }
  ],
  "composite_score_at_handoff": 7.8,
  "training_patches_applied": 14,
  "timestamp": "2026-05-02T16:00:00Z",
  "run_id": "polyglot-run-c1e7"
}
```

---

## Per-agent embedding

Each ecom agent .md file appends 3-5 lines to its Auto-Fix Loop section:

```markdown
### Handoff Schema (MANDATORY)

Every output handoff MUST conform to `~/.claude/memory/patterns/good/ecom-handoff-schema.md` v1.0. Self-validate before dispatch:
- `from === <my-agent-id>`, all required fields populated
- `decoder_evidence.length >= 3` for design/copy/mechanic types
- `voice_scorecard >= 8` (copy agents only)
- `validation.self_check_passed === true` only after self-checklist completes

Handoffs failing validation are rejected by Polyglot orchestrator + escalated to cadence.
```

---

## Migration path (W2 advisory → W4 enforcing)

| Week | Mode | Behavior on missing fields |
|------|------|----------------------------|
| W2 | Advisory | Log warning, allow handoff to proceed |
| W3 | Advisory | Log warning + email cadence weekly digest |
| W4 | Enforcing | Block handoff, return error to caller, escalate to cadence |
| Post-W4 | Enforcing | Drift to deprecated handoffs blocks deploys |

---

## Cross-references
- Plan: `~/.claude/plans/so-we-have-to-dynamic-shell.md` Phase 2 Deliverable D
- Validator: `Polyglot/src/lib/handoff-validate.js` (NEW W2)
- Storage: `agent_runs.metadata` (Polyglot DB)
- Observability: `agent_events.event_type='handoff'` (Supabase agent-ops)
- Pipeline integration: `Polyglot/src/lib/orchestrations/ecom-team-pipeline.js`
- Per-agent embedding: 9 ecom .md files in `~/.claude/agents/`
