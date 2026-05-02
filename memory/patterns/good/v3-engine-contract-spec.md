# v3 Engine Contract — Output, Runtime, Deliverable, Invocation, Operational

**Owner:** arya (architecture) + rex (governance) + riko (scaffold) + hawk (telemetry)
**Source:** v3 Production Design System §9, §10, §11, §12, §13, §14
**Adopted:** 2026-04-30 — Captures what wasn't covered by the 8 layer-specific specs

---

## §9 — EngineOutputV3 contract

Every v3 generation run returns:

```ts
interface EngineOutputV3 extends EngineOutputV2 {
  // Project deliverable
  project: {
    id:           string;
    version:      string;
    files:        ProjectFile[];           // every file emitted, with path + content
    manifest:     ComponentManifest;       // versioned component registry
  };

  // Token export
  tokens: {
    json_w3c:     string;
    tailwind_js:  string;
    css_vars:     string;
    ts_types:     string;
    diff?:        TokenDiff;               // if updating existing project
  };

  // Business context resolution
  business_resolution: {
    cro_priorities:    string[];
    must_address:      ObjectionResponse[];
    differentiation_callout: DifferentiationBlock | null;
    primary_benefit:   string;
  };

  // Memory snapshot
  memory: {
    user_prefs_used:        string[];
    similar_projects_used:  string[];
    patterns_applied:       PatternRef[];
    decisions_logged:       Decision[];
  };

  // A/B variants
  variants: {
    generated:  Variant[];
    suggested_axis: VariantAxis;
    sample_plan: SamplePlan;
  };

  // Performance
  performance: {
    audit:                 PerfAudit;
    optimizations_applied: string[];
    budget_compliance:     boolean;
  };

  // Data integration
  data: {
    contracts:    Record<string, DataContract>;
    adapter_used: 'mock' | 'rest' | 'graphql' | 'supabase' | 'shopify_storefront' | 'firebase';
    migration_config: string | null;
  };

  // From v2 (carried forward)
  taste, style, brand, motion, mobile, flow, ux_flow, cro_rules,
  trust_elements, cta_strategy, psychology_notes, friction_points,
  quality_score, conversion_score, validation, reasoning;
}
```

Every agent that emits artifacts conforms output to this contract.

---

## §10 — Runtime Loop

```ts
async function designAgent_v3_run(input: AgentInputV3): Promise<EngineOutputV3> {
  // 0. MEMORY LOAD
  const mem = await loadMemoryContext(input.user_id, input.project_id);

  // 0.5 BUSINESS CONTEXT
  const bc = input.business_context ?? await resolveBusinessContextFromInput(input);
  const enrichment = resolveBusinessContext(bc);

  // 1-4. v2 PIPELINE (with memory + business enrichment injected)
  const v2Output = await designAgent_v2_run({
    ...input,
    _memory:     mem,
    _business:   enrichment,
    _user_prefs: mem.user_prefs,
  });

  // 5. COMPONENT DEDUP + VERSION
  const registry = await loadOrInitRegistry(input.project_id);
  const componentized = await registry.commit(v2Output.design_spec, mem.project?.manifest);

  // 6. TOKEN EXPORT
  const tokens = exportTokens(v2Output.context.tokens);

  // 7. DATA ADAPTER WIRING
  const dataLayer = wireDataAdapters(componentized, input.data_adapter ?? 'mock');

  // 8. A/B VARIANT GENERATION (optional, by axis)
  const variants = input.generate_variants
    ? await generateVariants(componentized, v2Output.context, input.variant_axis ?? suggestAxis(bc), 2)
    : [];

  // 9. PERFORMANCE PASS
  let project = assembleProject(componentized, tokens, dataLayer, variants);
  project = performancePass(project);
  const perfAudit = auditPerformance(project);
  if (perfAudit.violations.length > 0)
    throw new EngineError('Performance budget violated', perfAudit.violations);

  // 10. MEMORY WRITE
  await mem.project_state.save(input.project_id, project);
  await mem.decisions_log.append(v2Output.reasoning);

  return assembleV3Output(v2Output, project, tokens, variants, perfAudit, mem, enrichment);
}
```

11-stage pipeline. Halts at perf violation per `v3-performance-pass-rules.md`.

---

## §11 — Project deliverable file structure (RIKO scaffolds this)

```
my-project/
├── package.json                      # generated deps
├── tsconfig.json
├── tailwind.config.js                # ← from token export
├── next.config.js                    # or vite.config.ts
├── postcss.config.js
├── .env.example                      # adapter env vars
│
├── src/
│   ├── app/                          # Next.js routes (or pages/)
│   │   ├── page.tsx
│   │   ├── pricing/page.tsx
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── ui/                       # atoms
│   │   ├── composites/               # KPICard, DataTable
│   │   ├── layouts/                  # DashboardLayout, MarketingLayout
│   │   └── patterns/                 # PricingTable, FAQ
│   ├── tokens/
│   │   ├── tokens.json               # ← W3C
│   │   ├── tokens.css                # ← CSS vars
│   │   ├── colors.json
│   │   ├── spacing.json
│   │   └── types.d.ts                # ← generated TS types
│   ├── hooks/
│   │   ├── useData.ts                # adapter binding
│   │   └── useAnalytics.ts
│   ├── lib/
│   │   └── adapters/
│   │       ├── mock.ts
│   │       ├── rest.ts
│   │       └── supabase.ts
│   └── styles/
│       └── globals.css
│
├── design-system/
│   ├── manifest.json                 # ← component registry
│   ├── stories/                      # ← Storybook
│   ├── tests/                        # ← component tests
│   └── docs/
│       ├── README.md
│       └── components/Button.md
│
├── experiments/
│   ├── variants/
│   │   ├── headline-v1/treatment.tsx
│   │   └── cta-color-v2/treatment.tsx
│   ├── hypotheses.json               # ← active experiments
│   └── outcomes.json                 # ← winners + analytics
│
├── config/
│   ├── data-mapping.json             # mock → real data
│   └── performance-budget.json
│
└── .design-agent/
    ├── memory.json                   # project memory snapshot
    ├── decisions.log                 # reasoning trace
    ├── scores.json                   # latest quality + conversion scores
    └── version.txt                   # 0.4.0
```

riko scaffolds this skeleton on new project init. Agents fill it during run.

---

## §12 — Invocation contract

```ts
const output: EngineOutputV3 = await designAgent_v3.run({
  // Identity
  user_id:    'user_abc',
  project_id: 'proj_xyz',

  // Input
  input: 'build a SaaS landing page',

  // Brand (v2 carried forward)
  brand: {
    primary_color: '#0a6cff',
    font_display:  'Söhne',
    vibe:          'trustworthy',
    industry:      'fintech',
  },

  // Business context (v3)
  business_context: {
    goal: 'signups',
    audience: { icp, sophistication, jobs_to_be_done, objections, motivations },
    competitors: { direct, indirect, differentiation },
    constraints: { timeline, budget, channels, legal },
  },

  // System config (v3)
  data_adapter:        'mock',          // 'mock' | 'supabase' | 'shopify_storefront' | 'rest'
  generate_variants:   true,
  variant_axis:        'headline',
  performance_strict:  true,
  multi_screen:        true,
  quality_threshold:   75,
  max_iterations:      3,
  seed:                12345,           // determinism per §14.2
});
```

Polyglot dispatch SDK validates this contract before agent invocation.

---

## §13 — Extension points

| Extension | Where | Add by |
|-----------|-------|--------|
| New data adapter | `ADAPTERS` registry | implement `DataAdapter` interface |
| New variant axis | `VariantAxis` + `generators` | add type + generator function |
| New token target | `exportTokens` | add format-specific serializer (e.g., iOS Asset Catalog) |
| New memory tier | `MemoryService` | add table + API + retrieval |
| New performance rule | `performancePass` | append optimization function |
| New control panel view | `/projects/:id/...` | add route + view component |
| New business goal | `cro_priorities` map | append goal → CRO pattern list |
| New competitor strategy | `competitors.differentiation` | append differentiation pattern |

forge agent owns extension proposals. arya ratifies architecture impact.

---

## §14 — Operational concerns

### §14.1 Agent versioning
- Agent core: semver
- Pattern library: versioned snapshot per release
- Token defaults: versioned snapshot
- Pipeline behavior: changelog entry per version

Existing projects opt-into new agent versions explicitly via manifest. Mira tracks `agent_version` per generation; pattern lib snapshots per release.

### §14.2 Determinism
For reproducibility, agent accepts `seed` parameter for non-deterministic stages (variant generation, mock data templates). Same input + seed → same output. Required for A/B re-runs and regression testing.

### §14.3 Cost ceiling — HARD LIMITS
```
- Max LLM calls per generation: 8
- Max iterations of self-improvement: 3
- Max variants per axis: 4
- Halt with `cost_ceiling_exceeded` when exceeded
```
arya enforces in dispatch. Polyglot SDK aborts run on threshold breach. Already partly captured in `executable-auto-fix-loop.md`; v3 raises bar.

### §14.4 Telemetry — every run logs
- Input fingerprint (hashed)
- Stage durations
- Score deltas across iterations
- Components reused vs created
- Pattern library hits
- Final scores
- LCP/INP/CLS RUM (post-deploy)

Hawk consumes telemetry → feeds mira's outcomes tier → pattern library win-rate update.

---

## Cross-references

- §1 component manifest: `v3-component-system-spec.md`
- §2 token export pipeline: `v3-token-export-spec.md`
- §3 business context resolver: `v3-business-context-resolver.md`
- §4 memory tiers: `v3-memory-architecture.md`
- §5 A/B engine: `v3-ab-variant-engine.md`
- §6 perf pass: `v3-performance-pass-rules.md`
- §7 data adapter: `v3-data-adapter-pattern.md`
- §8 control panel: `v3-control-panel-spec.md`
- Existing auto-fix loop (cost ceiling carries): `~/.claude/memory/patterns/good/executable-auto-fix-loop.md`
- Polyglot SDK invocation: `~/.claude/memory/patterns/good/polyglot-sdk-spec.md`
