# Figma to Liquid Conversion Protocol

**Owner:** stitch (Pod D)
**Cross-pod consumers:** loom, atrium, elio, pixel
**Status:** v1.0 (skeleton; populated as Pod D ships first 3 client projects)

## Purpose

Standardize how approved Figma designs convert to Shopify Online Store 2.0 Liquid theme code. Bridges the design→code gap that elio/pixel + Pod B/Pod C don't cover.

## Hybrid Output Mode (ratified)

stitch produces:
1. **Liquid skeleton** — structurally-correct sections, blocks, theme.css with CSS variables
2. **settings_schema.json** — full schema with all merchant-editable settings
3. **Handoff notes** — for loom: components inventory, deferred decisions, ambiguities

stitch does NOT produce:
- Final production polish (loom's job)
- Dynamic data wiring (conduit's job)
- Metafield/metaobject schema (lattice's job)

## 5-Phase Process

### Phase 1: Read Figma
```
Inputs: { figma_file_key, figma_node_ids[], design_system_tokens_path }
Tools: mcp__claude_ai_Figma__get_metadata, get_design_context, get_screenshot, get_variable_defs, get_code_connect_map
Output: raw Figma data + screenshots
```

### Phase 2: Token Extraction
- Map Figma colors → CSS variables
- Map Figma typography → CSS variables + settings_schema font fields
- Map Figma spacing → CSS variables on a scale
- Map Figma motion → CSS transitions/animations

Bridge: every token = settings_schema entry + CSS variable in `assets/theme.css`. Merchant changes propagate.

### Phase 3: Section Blueprinting
For each top-level Figma frame:
- Create `sections/{name}.liquid`
- Add `{% schema %}` with settings, blocks, presets, max_blocks

### Phase 4: Block Mapping
For each Figma component instance reused inside section:
- Define block type in section schema
- Map component variants → block settings (select / checkbox / etc.)
- Honor 3-level nesting limit

### Phase 5: Handoff Note
- Inventory diff (designed components vs converted components)
- Dynamic-data placeholders for loom to wire
- Ambiguities + deferred decisions
- Token map (Figma var → CSS var → schema setting key)

## Code Connect Investment

Boldteq's first 5 Pod D projects establish Code Connect mappings for 12 most-common components (testimonial-card, product-card, hero-with-cta, image-with-text, cta-banner, faq-item, announcement-bar, footer-column, mega-menu-item, stat-display, trust-badge-row, richtext-block).

After: 60-80% of conversions become 1:1 mapped automatically via `mcp__claude_ai_Figma__get_code_connect_map`.

## Quality Gates

- Every section has `{% schema %}` block
- Every block has `name` + `type` + `settings`
- Mobile breakpoints mapped
- Tokens not hardcoded (always settings or CSS vars)
- Inventory diff = 0 missed components
- 3-level nesting limit honored

## Anti-Patterns (must-avoid)

1. Output complete production Liquid (loom's polish job)
2. Hardcode colors/fonts/spacing
3. Skip mobile breakpoint mapping
4. Output sections without `{% schema %}` block
5. Bypass elio's design-system tokens

## Skill File References

- `~/.claude/skills/stitch/figma-to-liquid-section-mapping.md`
- `~/.claude/skills/stitch/settings-schema-from-figma-tokens.md`
- `~/.claude/skills/stitch/responsive-figma-to-liquid-css.md`
- `~/.claude/skills/stitch/figma-component-to-liquid-block.md`
- `~/.claude/skills/stitch/code-connect-mappings-for-pod-d.md`

<!-- AUTHORING TODO: After Pod D's first 3 client projects, capture: average conversion time per section, common ambiguity classes, Code Connect adoption rate, loom rework rate. Promote learnings into this pattern. -->
