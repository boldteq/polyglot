# v3 Component System Spec

**Owner:** figma-synth (primary) + vega (review)
**Source:** v3 Production Design System §1
**Adopted:** 2026-04-30
**Cycle:** ecom-v3-design-system

---

## Lifecycle shift

```
v2:  page → inline JSX (every page repeats KPICard markup)
v3:  page → import { KPICard } from '@/components/ui/KPICard'
```

Components are versioned project-scoped artifacts. Pages reference, never inline.

---

## ComponentArtifact schema

```ts
interface ComponentArtifact {
  id:           string;          // 'KPICard'
  version:      string;          // semver — '1.2.0'
  category:     'atom' | 'composite' | 'layout' | 'pattern';
  props_schema: JSONSchema;
  variants:     string[];        // ['default', 'compact', 'with_sparkline']
  tokens_used:  string[];        // ['spacing.component', 'color.brand.600']
  components_used: string[];     // ['Button', 'Badge'] — composition deps
  files: {
    component:  string;          // /components/ui/KPICard.tsx
    story:      string;          // /design-system/stories/KPICard.stories.tsx
    test:       string;          // /__tests__/KPICard.test.tsx
    docs:       string;          // /design-system/docs/KPICard.md
  };
  hash:         string;          // content hash for dedup
  status:       'stable' | 'beta' | 'deprecated';
  deprecated_in?: string;
  replaces?:    string;          // migration pointer
  data_contract?: { /* per v3 §7.2 — see v3-data-adapter-pattern.md */ };
}
```

---

## Versioning rules — STRICT SEMVER (Boldteq adopted 2026-04-30)

```ts
function bumpVersion(prev: ComponentArtifact, change: ComponentChange): string {
  if (change.removes_prop || change.changes_prop_type) return semverMajor(prev.version);  // breaking
  if (change.adds_prop || change.adds_variant)         return semverMinor(prev.version);
  if (change.styling_only || change.token_swap)        return semverPatch(prev.version);
  return prev.version;
}
```

**figma-synth blocks publish on missing version bump.** Manifest tracks `deprecated_in` + `replaces` (migration pointer).

When tokens change (e.g., brand color updated), all components depending on that token get a patch bump and the page re-emits using the new version.

---

## Dedup — 80% similarity threshold (Boldteq adopted 2026-04-30)

```ts
class ComponentRegistry {
  components: Map<string, ComponentArtifact>;
  hash_index: Map<string, string>;   // content hash → component id

  resolve(spec: ComponentSpec): ComponentArtifact {
    // Exact match by id + version
    const exact = this.components.get(`${spec.id}@${spec.version}`);
    if (exact) return exact;

    // Hash match — same JSX content under different id
    const contentHash = hashSpec(spec);
    if (this.hash_index.has(contentHash)) {
      return this.components.get(this.hash_index.get(contentHash)!)!;
    }

    // Similarity match — props overlap >80% with existing
    const similar = this.findSimilar(spec, 0.8);
    if (similar) return this.extendOrVariant(similar, spec);

    return this.create(spec);
  }
}
```

**Why 80%:**
- Lower (60%) → forced merge of conceptually-different components
- Higher (95%) → component sprawl (KPICardCompact, KPICardSmall, KPICardMini for same component)
- 80% = v3 calibrated default, prevents sprawl while preserving distinct intent

**Outcome:** `KPICardCompact` auto-merges into `KPICard variant="compact"`.

---

## Manifest contract

`design-system/manifest.json` per project:

```json
{
  "version": "0.4.0",
  "components": {
    "Button":   { "version": "1.3.0", "files": ["src/components/ui/Button.tsx"], "status": "stable" },
    "KPICard":  { "version": "2.0.0", "files": ["src/components/composites/KPICard.tsx"],
                  "deps": ["Button"], "tokens": ["spacing.component", "color.brand.600"] },
    "Sidebar":  { "version": "1.1.2", "files": ["src/components/layouts/Sidebar.tsx"], "status": "stable" }
  },
  "removed": ["KPICardCompact"],
  "migrations": [
    { "from": "KPICardCompact", "to": "KPICard@2.0.0 variant=compact" }
  ]
}
```

---

## Project structure (emitted)

```
src/components/
├── ui/                          # atoms — Button, Badge, Input, Avatar
├── composites/                  # KPICard, DataTable, ProductCard
├── layouts/                     # DashboardLayout, MarketingLayout
└── patterns/                    # PricingTable, TestimonialBand, FAQ
design-system/
├── manifest.json                # registry
├── tokens/
└── docs/
```

---

## Enforcement — figma-synth quality gates

1. Every new component has `ComponentArtifact` JSON before publish
2. Hash index queried first — exact dup blocked
3. Similarity check at 0.8 threshold — proposed merge surfaces in vega review
4. Version bump verified per change type (semver rule)
5. Manifest auto-updated; `removed` array preserves migration history
6. `replaces` field mandatory on deprecated component
7. `data_contract` mandatory for data-driven components (per v3 §7.2)

---

## Cross-references

- v3 §2 token export (token agent feeds `tokens_used` field): `v3-token-export-spec.md`
- v3 §7 data contract (data-driven components): `v3-data-adapter-pattern.md`
- v3 §8 control panel (component browser view): `v3-control-panel-spec.md`
