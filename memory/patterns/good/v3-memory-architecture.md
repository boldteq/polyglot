# v3 4-Tier Memory Architecture

**Owner:** mira (primary) + cadence (HR memory contributor)
**Source:** v3 Production Design System §4
**Adopted:** 2026-04-30 — Supabase-backed

---

## 4 memory tiers

```ts
interface MemoryService {
  user_prefs:      UserPreferences;       // per-user, durable
  project_state:   ProjectMemory;         // per-project, durable
  pattern_library: PatternLibrary;        // cross-project, learned
  outcomes:        OutcomeStore;          // variant winners, analytics
}
```

---

## Tier 1 — User preferences

```ts
interface UserPreferences {
  user_id: string;
  default_taste:        TasteProfile;        // locks at 80%+ across last 10 projects
  default_density:      Density;
  default_style:        string;
  preferred_libraries:  string[];            // ['lucide-react', 'shadcn']
  copy_voice:           CopyVoice;
  decision_overrides:   DecisionOverride[];  // "always use 4-tier pricing"
  dont_apply:           string[];            // ["avoid purple-pink gradients"]
}
```

**Lock rule (Boldteq adopted):** Auto-promote preference to default when user picks same value ≥8/10 recent projects. Surfaces in control panel for manual override.

---

## Tier 2 — Project state

```ts
interface ProjectMemory {
  project_id:       string;
  brand:            ResolvedBrand;
  tokens:           TokenSet;
  manifest:         ComponentManifest;
  generated_screens: ScreenRef[];
  active_variants:  VariantRef[];
  decisions_log:    Decision[];               // every choice + rationale
  outcomes:         { metric: string, value: number, ts: string }[];
}
```

Loaded on every agent run for that project.

---

## Tier 3 — Pattern library (LEARNING TIER)

```ts
interface PatternLibrary {
  patterns: Array<{
    id:               string;
    description:      string;             // "3-tier pricing with middle highlighted"
    win_rate:         number;             // 0-1 across N tests
    surface_types:    SurfaceType[];
    audience_types:   string[];
    sample_size:      number;
    last_validated:   string;
  }>;
}
```

**Graduation rule (Boldteq adopted):** Pattern graduates to canonical when `win_rate >= 0.6 AND sample_size >= 30`. Below: stays candidate. Conservative + reliable.

When agent composes new pricing page, queries pattern lib: "what pricing pattern wins for B2B SaaS audiences?" → applies winner.

---

## Tier 4 — Outcomes (TELEMETRY)

```ts
interface OutcomeStore {
  outcomes: Array<{
    project_id:    string;
    variant_id:    string;
    hypothesis:    string;
    metric:        string;
    control_value: number;
    treatment_value: number;
    significance:  number;
    winner:        'control' | 'treatment' | 'inconclusive';
    sample_size:   number;
    duration_days: number;
  }>;
}
```

**Winner threshold (Boldteq adopted):** Bayesian P(treatment wins) > 0.95 AND MDE >= 0.10.

Outcomes feed pattern library nightly: treatments that win repeatedly graduate to canonical.

---

## Storage backend (Boldteq adopted: Supabase only)

```
{
  structured:  'Supabase Postgres',     // user_prefs, project_state, manifests, outcomes
  vector:      'Supabase pgvector',     // semantic search "find similar past projects"
  blob:        'Supabase Storage',      // emitted artifact files
  cache:       'Supabase realtime + Redis (if needed)',
}
```

Single-platform simplicity. Already standard in Boldteq Stack A.

---

## Tables (Supabase schema)

```sql
-- Tier 1
CREATE TABLE user_prefs (
  user_id text PRIMARY KEY,
  default_taste jsonb,
  default_density text,
  default_style text,
  preferred_libraries text[],
  copy_voice jsonb,
  decision_overrides jsonb[],
  dont_apply text[],
  updated_at timestamptz DEFAULT now()
);

-- Tier 2
CREATE TABLE project_state (
  project_id text PRIMARY KEY,
  user_id text REFERENCES user_prefs,
  brand jsonb,
  tokens jsonb,
  manifest jsonb,
  decisions_log jsonb[],
  embedding vector(1536),  -- pgvector for semantic search
  updated_at timestamptz DEFAULT now()
);

-- Tier 3
CREATE TABLE pattern_library (
  id text PRIMARY KEY,
  description text,
  win_rate numeric,
  surface_types text[],
  audience_types text[],
  sample_size int,
  last_validated timestamptz,
  status text CHECK (status IN ('candidate', 'canonical', 'deprecated'))
);

-- Tier 4
CREATE TABLE outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text REFERENCES project_state,
  variant_id text,
  hypothesis text,
  metric text,
  control_value numeric,
  treatment_value numeric,
  significance numeric,
  winner text CHECK (winner IN ('control', 'treatment', 'inconclusive')),
  sample_size int,
  duration_days int,
  recorded_at timestamptz DEFAULT now()
);
```

All tables RLS-enabled. user_id-scoped policies.

---

## Retrieval at agent runtime

```ts
async function loadMemoryContext(userId: string, projectId?: string): Promise<MemoryContext> {
  const [user, project, patterns] = await Promise.all([
    memory.user_prefs.get(userId),
    projectId ? memory.project_state.get(projectId) : null,
    memory.pattern_library.relevant({ user_id: userId, surface: '*' }),
  ]);

  // Vector search top-k=3 for similar past projects
  const similar = projectId
    ? await memory.vector.search({ ref_project: projectId, top_k: 3 })
    : [];

  return { user, project, patterns, similar };
}
```

---

## Learning loop

```
generate(input) → emit(output) → deploy → measure(outcomes) →
  → update outcomes table
  → recompute pattern win rates
  → graduate winning patterns to library (≥0.6 win_rate, ≥30 sample)
  → ingest into next generation as priors
```

Mira runs nightly graduation pass.

---

## Cross-references

- A/B variant outcomes feed: `v3-ab-variant-engine.md`
- Component manifest in project_state: `v3-component-system-spec.md`
- HR observability (cadence/witness consumption): `~/.claude/memory/patterns/good/agent-ops-schema.md`
