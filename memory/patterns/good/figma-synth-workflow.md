# Figma Synth Workflow: JSX → .fig File Conversion

**Created:** 2026-04-18, v1.0.
**Owned by:** `figma-synth` agent (hired Cohort 3).
**Loaded by:** figma-synth + vega (when reviewing deliverable design files for clients).
**Plan reference:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md` — locks JSX-first design workflow with Figma file as deliverable artifact.

---

## Why JSX-first (not Figma-first)

Locked decision in HR scale-up plan: **Build polished JSX FIRST (real working code), then auto-generate .fig file as a deliverable artifact.** Code is source of truth; Figma is export.

Why not Figma-first:
- Figma cannot run, click, or be tested. JSX can.
- Figma doesn't enforce token consistency the way `token` agent enforces in code.
- Figma → JSX conversion via Figma MCP loses interaction logic, state, accessibility.
- Most Boldteq deliverables ship as code, not as Figma. Figma is a checkbox for client agencies.

When clients (or agency partners) need a Figma file for their design system / handoff, figma-synth runs the JSX through conversion tooling and delivers a .fig file. Roundtrip-edit is NOT a goal.

---

## Conversion stack (3 options, pick based on project)

### Option A — html-to-figma (open source) — DEFAULT
- Tool: `@bricks-tools/html-to-figma` or `figma-to-code` (Builder.io's tool)
- How: Render the JSX in headless browser (Playwright) → export DOM tree → convert to Figma node JSON → write .fig
- Quality: 70-85% visual fidelity, structural names preserved (no auto-layout magic)
- Use for: Most projects. Default.

### Option B — Anima.app (commercial)
- Cost: $39/user/mo
- Quality: 85-95% fidelity, proper auto-layout
- Use for: Premium client deliverables where Figma file is the primary handoff artifact

### Option C — Figma REST API direct construction
- How: Parse JSX AST → manually construct Figma frame/group/text/instance nodes via Figma REST API (POST /v1/files/{key}/nodes)
- Quality: 100% (we control everything)
- Cost: 10-20× more dev time per template
- Use for: Reusable component library exports (build once, regenerate often)

figma-synth picks the option per-project based on Vega's spec. Default Option A.

---

## The 5-step conversion protocol

### Step 1 — Verify JSX is "render-stable"
Before conversion, the JSX must:
- Render in a headless Playwright browser without errors
- Have all images loaded (no broken `<img>` tags)
- Match Vega's design spec (visual review passed)
- Pass `pnpm tsc --noEmit && pnpm lint && pnpm build`

Drop-out reason: "JSX not yet stable" — figma-synth refuses to convert. Send back to pod-X-frontend.

### Step 2 — Render to DOM snapshot
```bash
# Inside the project directory
node scripts/render-for-figma.mjs --route /pricing --viewport 1440x900 --dark false
# Output: .figma-export/pricing-1440-light.dom.json + screenshot
```

Render at 3 viewports (320, 768, 1440) and both modes (light, dark) = 6 snapshots per page. Each becomes a Figma frame.

### Step 3 — Convert DOM to Figma node JSON
```bash
# Using @bricks-tools/html-to-figma (Option A)
node scripts/dom-to-figma.mjs --input .figma-export/pricing-1440-light.dom.json --output .figma-export/pricing.figma.json
```

Conversion preserves:
- Element hierarchy (frames + groups)
- Text content + font family + size + weight + color
- Background + border + radius + shadow
- Image references (uploads to Figma assets via REST API)
- Auto-layout where CSS uses flexbox or grid

Lost in conversion (acceptable):
- Hover states (we screenshot static state)
- Animations (Figma's smart animate is different)
- Interactivity (Figma prototyping requires manual setup)
- Form behavior (input focus rings etc.)

### Step 4 — Write .fig via Figma REST API
```bash
node scripts/write-figma-file.mjs \
  --node-json .figma-export/pricing.figma.json \
  --target-file boldteq-design-system \
  --frame-name "Pricing — 1440 — Light"
```

Requires `FIGMA_PERSONAL_ACCESS_TOKEN` env var (figma-synth has its own scoped token). Writes nodes into a per-project Figma file at `boldteq-clients/<project>/<page>`.

### Step 5 — Visual diff verification
After write:
1. Pull screenshot of the resulting Figma frame via Figma REST API (`GET /v1/images/{key}`)
2. Compare against original JSX screenshot using `pixelmatch` or `odiff`
3. If pixel diff > 10%, log degradation and notify Vega
4. If pixel diff < 5%, deliverable approved

Conversion quality target: ≤ 5% pixel diff. Above that, fall back to Anima (Option B) or REST API direct (Option C).

---

## When NOT to convert to Figma

Don't waste compute on:
- Internal-only admin dashboards (no client deliverable)
- Pages still iterating (convert AFTER Vega final approves the JSX)
- A/B test variants (only convert the winner)
- Email templates (Figma is wrong tool for emails — use HTML-only)
- Animations / interactive prototypes (Figma can't represent interactivity well)

Default: convert ONLY when client deliverable contract requires .fig handoff.

---

## File organization in Figma

Each Boldteq client gets a Figma project at `figma.com/files/team/boldteq-clients/<client-name>`:

```
boldteq-clients/<client-name>/
  📁 <project-name>
    📄 Design System (tokens, components — written by token agent)
    📄 Pages (one frame per page per viewport per mode)
    📄 Email Templates (read-only — emails are HTML-only)
    📄 Brand Kit (logos, colors, type — uploaded once)
```

Auto-organized by figma-synth on every conversion run. Naming convention: `<page> — <viewport> — <mode>` for pages; `<component>` for components.

---

## Cost / performance budget

Per-page conversion (single viewport, single mode):
- Compute: ~30s (Playwright render + DOM parse + REST API write)
- Cost: ~$0.005 (mostly Playwright headless cost on Railway worker)
- Storage: ~50KB per Figma frame

Per-project full conversion (10 pages × 6 viewport-mode combos = 60 frames):
- Compute: ~30 min
- Cost: ~$0.30
- Storage: ~3MB Figma file (well under Figma's free-tier 100MB)

Run conversions on a Railway cron worker, not blocking the main app pipeline.

---

## Anti-patterns (NEVER do these)

1. **Never convert JSX that hasn't passed Vega's visual review.** Figma deliverable becomes the "source of truth" in client's eye — exporting a buggy design is worse than not exporting.
2. **Never two-way sync.** JSX is source of truth. Figma is export. If client wants a Figma change, they ask figma-synth to re-export from updated JSX.
3. **Never run conversion in the main app process.** Use Railway worker — Playwright headless eats memory.
4. **Never share figma-synth's PAT (Personal Access Token).** Each agent has its own scoped token. Rotate quarterly.
5. **Never include user PII in exported frames** (names, emails, real data). Use placeholder data.
6. **Never use `console.log` in conversion scripts.** They run on workers — use Sentry / structured logger.
7. **Never write to a Figma file shared with the client without notifying them first.** Slack ping or email confirmation per conversion run.
8. **Never skip the visual diff (Step 5).** Conversion quality varies by page complexity. Always verify.
9. **Never convert email templates to Figma.** Emails are HTML-first. Figma representation is misleading.
10. **Never convert during active design iteration.** Wait until JSX is stable. Otherwise re-export creates Figma file noise.

---

## Verification (figma-synth's completion gate)

Conversion is done when:
- [ ] All requested pages × viewports × modes converted
- [ ] Visual diff < 5% on every frame
- [ ] Figma file structure matches naming convention
- [ ] Vega has reviewed the final Figma file (link sent)
- [ ] Client (if external) has been notified with view-only Figma link
- [ ] Run logged to `agent_runs` with composite_score > 80
- [ ] No PAT or secret leaked in logs

---

## Curriculum v1 — Session 5 Patches (2026-04-27)

**Source:** FIG-005 · changelog: `~/.claude/memory/training/cycle-ecom-v1-session-5-changelog.md`

### Client Deliverable Scope — IP Protection (FIG-005)
**What client receives in Figma deliverable:**
- ✅ Final design frames at scale (mobile / tablet / desktop)
- ✅ Component instances using Code-Connect-mapped components
- ✅ Design tokens as Figma variables synced from project tokens.css
- ✅ Code Connect bidirectional links (designer-to-dev handoff)

**What client does NOT receive:**
- ❌ Boldteq design library backend (decoder patterns, niche-specific design DNA)
- ❌ Patterns / playbooks (memory/design/ecom/* knowledge)
- ❌ Skills files (skills/elio/*, skills/figma-synth/*)
- ❌ Unrelated work from other client projects

**Why:** Boldteq library = competitive moat. Client gets clean handoff for their build; Boldteq retains methodology IP.

**Implementation:**
1. Create dedicated client Figma file (separate from Boldteq library)
2. Copy ONLY deliverable frames + their component dependencies
3. Sync tokens via `mcp__claude_ai_Figma__create_design_system_rules`
4. Register Code Connect mappings on client file
5. Verify: `mcp__claude_ai_Figma__get_libraries` returns only deliverable scope
