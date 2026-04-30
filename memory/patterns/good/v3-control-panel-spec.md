# v3 Control Panel Spec (operator UI)

**Owner:** vega + rex (governance) — build deferred to separate cycle
**Source:** v3 Production Design System §8
**Adopted:** 2026-04-30 — Spec-only this cycle

---

## Status — SPEC ONLY

This cycle captures the contract. Actual UI build deferred. May extend Polyglot's existing agent-ops UI when scheduled.

---

## 6 primary views

```
/                         → overview (active projects, recent generations)
/projects/:id             → project workspace
/projects/:id/tokens      → live token editor
/projects/:id/components  → component browser
/projects/:id/generate    → generation interface
/projects/:id/variants    → A/B variant management
/projects/:id/memory      → memory inspector
/projects/:id/scores      → score panel + override controls
```

---

## §8.2 Token editor view

Live token edit + impact preview:

```jsx
<SplitView>
  <Pane>
    <ColorScale name="brand" scale={tokens.color.brand}
      onChange={hex => updateToken('color.brand', hex)} />
    <SpacingScale scale={tokens.spacing}
      onChange={s => updateToken('spacing', s)} />
    <RadiusScale scale={tokens.borderRadius} onChange={...} />
    <TypographyScale scale={tokens.fontSize} onChange={...} />
    <ContrastChecker tokens={tokens} />
    <Button onClick={commit}>Save changes (v0.5.0)</Button>
  </Pane>

  <Pane>
    <LivePreview screens={preview.screens} tokens={tokens} />
    <ImpactReport diff={preview.diff} />   {/* "12 components affected" */}
  </Pane>
</SplitView>
```

---

## §8.3 Generation interface

```jsx
<GenerationPanel>
  <Section title="Input">
    <Textarea name="prompt" />
    <SurfaceSelect />
    <UserTypeSelect />
    <StyleSelect />
    <BusinessContextEditor />
  </Section>

  <Section title="Output">
    <PreviewIframe url={generation.preview_url} />
    <ScoreCard quality={generation.quality_score} conversion={generation.conversion_score} />
    <ReasoningTrace steps={generation.reasoning} />
    <ComponentDiff prev={prevManifest} next={generation.manifest} />
  </Section>

  <Section title="Actions">
    <Button onClick={regenerate}>Regenerate</Button>
    <Button variant="ghost" onClick={tweakAndRegen}>Tweak (open token editor)</Button>
    <Button variant="primary" onClick={commit}>Commit</Button>
  </Section>
</GenerationPanel>
```

---

## §8.4 Variant board (3-COLUMN, Boldteq adopted)

```
┌────────────┬────────────┬────────────┐
│  DRAFTS    │  RUNNING   │ CONCLUDED  │
├────────────┼────────────┼────────────┤
│ catalyst   │ progress   │ winner     │
│ proposed   │ + lift     │ promote/   │
│ awaiting   │ live       │ archive    │
│ hypothesis │ metric     │ actions    │
│ review     │            │            │
└────────────┴────────────┴────────────┘
```

```jsx
<VariantBoard>
  <ColumnDraft>
    {drafts.map(v => <VariantCard variant={v} actions={['edit','launch']} />)}
  </ColumnDraft>
  <ColumnRunning>
    {running.map(v => <VariantCard variant={v}
      progress={v.sample_size / v.required_sample}
      live_metric={v.current_lift} />)}
  </ColumnRunning>
  <ColumnConcluded>
    {concluded.map(v => <VariantCard variant={v}
      winner={v.outcome.winner}
      lift={v.outcome.expected_lift}
      actions={['promote','archive']} />)}
  </ColumnConcluded>
</VariantBoard>
```

---

## §8.5 Score panel + override

```jsx
<ScorePanel>
  <ScoreRing label="Quality"    score={qScore.total} grade={qScore.grade}/>
  <ScoreRing label="Conversion" score={cScore.total} grade={cScore.grade}/>

  <Breakdown>
    {Object.entries(qScore).map(([k,v]) => <BarRow label={k} value={v} max={maxFor(k)} />)}
  </Breakdown>

  <ThresholdControls>
    <Slider label="Quality threshold"    value={config.q_threshold} onChange={...} />
    <Slider label="Conversion threshold" value={config.c_threshold} onChange={...} />
    <Toggle label="Block emit on threshold miss" checked={config.block_on_miss} />
  </ThresholdControls>

  <ManualOverrides>
    <Button onClick={forceEmit}>Emit despite low score</Button>
    <Button onClick={requestRegeneration}>Regenerate with feedback</Button>
  </ManualOverrides>
</ScorePanel>
```

**Boldteq override policy (adopted):** Allow override + log to audit trail + flag in manifest.

```ts
async function forceEmit(reason: string): Promise<void> {
  await audit.log({
    action:    'override_emit_below_threshold',
    operator:  currentUser(),
    reason:    reason,
    score:     currentScore(),
    threshold: currentThreshold(),
  });
  await manifest.flag(currentComponent(), 'emitted_below_threshold');
  await emit();
}
```

mira tracks `emitted_below_threshold` for pattern review (high-reject patterns indicate spec/template issues).

---

## §8.6 Memory inspector (ALL 4 TABS, Boldteq adopted)

```jsx
<Tabs>
  <Tab title="User preferences">
    <PrefList prefs={user_prefs} editable />
  </Tab>
  <Tab title="Project state">
    <ManifestTree manifest={project.manifest} />
    <DecisionsLog log={project.decisions_log} />
  </Tab>
  <Tab title="Patterns">
    <PatternTable patterns={patterns}
      sortBy="win_rate" filterBy={{ surface: project.surface_type }} />
  </Tab>
  <Tab title="Outcomes">
    <OutcomeChart outcomes={project.outcomes} />
  </Tab>
</Tabs>
```

---

## Polyglot integration path

Existing Polyglot agent-ops UI (`Polyglot/client/`) is the natural home. New routes:

```
client/src/pages/v3/
├── Tokens.tsx          # /v3/projects/:id/tokens
├── Components.tsx      # /v3/projects/:id/components
├── Generate.tsx        # /v3/projects/:id/generate
├── Variants.tsx        # /v3/projects/:id/variants
├── Memory.tsx          # /v3/projects/:id/memory
└── Scores.tsx          # /v3/projects/:id/scores
```

Reuse existing `agent-ops` Supabase tables + add v3-specific tables per `v3-memory-architecture.md`.

---

## Cross-references

- Score panel scoring framework: existing v2 quality + conversion scores
- Memory tabs back v3 memory tiers: `v3-memory-architecture.md`
- Variant board backs v3 A/B engine: `v3-ab-variant-engine.md`
- Token editor backs v3 token export: `v3-token-export-spec.md`
- Component browser backs v3 component manifest: `v3-component-system-spec.md`
