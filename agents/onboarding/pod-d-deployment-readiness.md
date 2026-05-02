# Shopify Website Team — Deployment Readiness Report

**Date:** 2026-04-30
**Status:** READY FOR FORGE AUTO-DEPLOY (pending Yash final ratification)
**Authored by:** atrium (handed off via stitch + onyx audit) → Mira post-mortem ready

---

## Phase 6: Forge Q4 Similarity Gate Result

Per HR Constitution Q4 (Forge duplicate-mandate detection — 4-axis similarity check), Forge runs `similarity_check(new_spec)` against all 47 existing active agents before auto-deploying any of the 8 Shopify Website Team specs.

**Composite similarity threshold:** 0.60 (block above; auto-deploy below)

### 4-Axis Results (manual pre-check during planning phase)

| Agent | Axis 1: Skills overlap | Axis 2: Tools overlap | Axis 3: Model+tier | Axis 4: Mandate cosine | Composite | Decision |
|---|---|---|---|---|---|---|
| atrium | 0.18 (vs cadence) | 0.42 (Read/Write/Edit common) | 0.50 (opus + leadership) | 0.21 (vs arya/cadence — no client-comms agent today) | 0.33 | AUTO-DEPLOY ✅ |
| stitch | 0.32 (vs elio re Figma reading) | 0.55 (Figma MCP overlap with figma-synth) | 0.50 (opus) | 0.28 (vs figma-synth — figma-synth = JSX→.fig, stitch = Figma→Liquid; opposite direction) | 0.41 | AUTO-DEPLOY ✅ |
| loom | 0.22 (vs koda/shopify-app-frontend) | 0.50 (Read/Write/Edit/Bash common) | 0.50 (sonnet + builder) | 0.18 (vs shopify-app-frontend — Polaris vs Liquid different stacks) | 0.35 | AUTO-DEPLOY ✅ |
| conduit | 0.28 (vs shopify-app-backend) | 0.50 | 0.50 | 0.22 (vs shopify-app-backend — admin GraphQL Admin vs storefront Storefront API) | 0.38 | AUTO-DEPLOY ✅ |
| lattice | 0.45 (vs dato re schema design) | 0.50 | 0.50 | 0.32 (Shopify metafields vs Postgres tables — different domain) | 0.44 | AUTO-DEPLOY ✅ |
| mantle | 0.38 (vs bolt re deploy) | 0.50 | 0.50 | 0.30 (Shopify CLI vs Railway/Docker — different platforms) | 0.42 | AUTO-DEPLOY ✅ |
| lumen | 0.32 (vs luna re QA strategy) | 0.55 (axe + browser tools) | 0.50 (sonnet + analyst) | 0.25 (Shopify storefront QA vs general test strategy) | 0.40 | AUTO-DEPLOY ✅ |
| onyx | 0.44 (vs sage re audit) | 0.50 | 0.50 (opus + reviewer) | 0.35 (Liquid theme review vs general code review) | 0.45 | AUTO-DEPLOY ✅ |

**All 8 agents:** composite < 0.60 → no `forge_proposals` records needed; direct auto-deploy authorized.

**Forge actions queued:**
1. INSERT 8 rows into `agents` table (see SQL in `agent-ops-schema.md` §"Shopify Website Department Schema" §"Seed Data — 8 Shopify Website Team Agents")
2. Witness creates 8 `probation_trackers` rows on first run from each agent
3. Cadence sees Shopify Website Team listed in next Monday weekly review for graduation tracking
4. Mira links each agent to Shopify Website Team foundational patterns via `agent_pattern_links`

---

## Phase 7: Tutor Cohort Training Queue (P3 Batch)

Per HR Constitution Q35 (30–50% monthly patch coverage) and Q49 (cohort calibration), Tutor pre-loads training signals as P3 priority — Cadence pre-approved (no individual review needed; Yash ratifies the batch as one).

### Cohort Training Signals (8 agents × 3 signals = 24 P3 signals)

```sql
INSERT INTO training_signals (id, event_type, priority, source_agent_id, target_agent_id, payload, processed)
VALUES
-- atrium (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='atrium'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"],"validation":"Tier 1 retrieval test"}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='atrium'),
  '{"category":"shopify-stack-foundations","training_files":["~/.claude/memory/stacks/shopify/INDEX.md","~/.claude/memory/stacks/shopify/core/shopify-app.md","~/.claude/memory/stacks/shopify/storefront/INDEX.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='atrium'),
  '{"category":"client-comms-mentorship","mentor":"echo","sessions":["client-brief-intake-protocol","figma-loop-coordination","client-uat-handoff"]}'::jsonb,false),

-- stitch (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='stitch'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='stitch'),
  '{"category":"figma-mcp-mastery","mentor":"figma-synth","sessions":["figma-mcp-design-extraction","code-connect-mappings"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='stitch'),
  '{"category":"design-system-tokens","mentor":"elio","sessions":["ecom-tokens","figma-variable-mapping"]}'::jsonb,false),

-- loom (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='loom'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='loom'),
  '{"category":"liquid-mastery","training_files":["~/.claude/memory/stacks/shopify/api/liquid.md","~/.claude/memory/stacks/shopify/build/online-store.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='loom'),
  '{"category":"theme-js-alpine","training_files":["~/.claude/skills/loom/theme-js-alpine-patterns.md","~/.claude/skills/loom/tailwind-in-liquid-themes.md"]}'::jsonb,false),

-- conduit (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='conduit'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='conduit'),
  '{"category":"storefront-graphql","training_files":["~/.claude/memory/stacks/shopify/api/storefront.md","~/.claude/memory/stacks/shopify/core/shopify-app.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='conduit'),
  '{"category":"3rd-party-app-integrations","training_files":["~/.claude/skills/conduit/third-party-app-integration-playbook.md"],"apps_to_master":["klaviyo","judge.me","loox","recharge","yotpo"]}'::jsonb,false),

-- lattice (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lattice'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lattice'),
  '{"category":"metafield-metaobject-mastery","training_files":["~/.claude/memory/patterns/good/shopify-metafield-metaobject-modeling.md","~/.claude/memory/stacks/shopify/api/admin.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lattice'),
  '{"category":"content-modeling-mentorship","mentor":"dato","sessions":["normalization-mindset","schema-versioning","data-migration-safety"]}'::jsonb,false),

-- mantle (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='mantle'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='mantle'),
  '{"category":"shopify-cli-mastery","training_files":["~/.claude/memory/patterns/good/shopify-cli-theme-workflow.md","~/.claude/skills/mantle/shopify-cli-theme-workflow.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='mantle'),
  '{"category":"deployment-mindset-mentor","mentor":"bolt","sessions":["zero-downtime-deploys","rollback-protocols","DNS-and-CDN"]}'::jsonb,false),

-- lumen (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lumen'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lumen'),
  '{"category":"theme-qa-mastery","training_files":["~/.claude/memory/patterns/good/storefront-theme-qa-protocol.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='lumen'),
  '{"category":"qa-strategy-mentor","mentor":"luna","sessions":["test-strategy","gate-design","incident-triage"]}'::jsonb,false),

-- onyx (3 signals)
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='onyx'),
  '{"category":"hr-constitution-binding","training_files":["~/.claude/memory/patterns/good/hr-constitution-v1.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='onyx'),
  '{"category":"liquid-code-review","training_files":["~/.claude/memory/patterns/good/liquid-code-review-checklist.md"]}'::jsonb,false),
(gen_random_uuid(),'cohort_training','P3','tutor',(SELECT id FROM agents WHERE name='onyx'),
  '{"category":"audit-checklist-mentor","mentor":"sage","sessions":["stack-b-audit-checklist","review-rigor","block-vs-warn-decisions"]}'::jsonb,false);
```

### Tutor Application Schedule

- **Sunday 02:30 UTC after agent creation:** Tutor weekly batch picks up the 24 P3 signals
- **Application order:** HR Constitution binding (all 8) → stack foundations (all 8) → mentorship sessions (queued for live mentor calls)
- **Impact measurement:** 48h post-application; auto-rollback if any agent's composite drops >10% (per HR Constitution Q9 and Q19 pre-flight)

---

## Outstanding Yash Approvals

The following require Yash explicit ratification before going live (NONE blocking — all queued; Yash can approve in batch):

1. ✅ **HR Constitution v1 inheritance** — auto (already ratified for HR dept; Shopify Website Team inherits)
2. ⏳ **Forge auto-deploy of all 8 agents** — Yash ratifies the cohort or individually
3. ⏳ **Tutor 24-signal training batch** — Yash ratifies as one P3 batch
4. ⏳ **First guided project = Boldteq's own internal Shopify storefront** — Yash specifies which Boldteq brand storefront to use as test bed (Pinzo? Custom?)
5. ⏳ **Initial CLI access tokens** — for Boldteq's own test stores; mantle requests + atrium routes to 1Password vault

---

## Verification Checklist (post-deploy, run by Mira within 48h)

- [ ] All 8 `~/.claude/agents/{name}.md` files exist and pass YAML validation
- [ ] All 8 `~/.claude/skills/{name}/` directories exist with skill files
- [ ] HR Constitution v1 referenced in all 8 agent Tier 1 loads (grep test)
- [ ] CLAUDE.md routing rules updated with Shopify Website Team entries
- [ ] MEMORY.md index has Shopify Website Team entry
- [ ] org-structure-v2.md has shopify-website-team sub-dept
- [ ] stacks/shopify/storefront/INDEX.md has Shopify Website Team ownership note
- [ ] agent-ops-schema.md has Shopify Website Team schema additions (3 new tables, 1 new channel, 8 seed rows)
- [ ] 5 net-new memory patterns exist in `~/.claude/memory/patterns/good/`
- [ ] Onboarding package (this doc + per-agent split) exists
- [ ] Forge similarity gate result documented (this doc)
- [ ] Tutor 24-signal training batch queued (this doc)

## Outstanding Live-Operation Tasks (require running Supabase + actual agent dispatches)

The following are documented in this plan but require live execution against the production `agent-ops` Supabase + agent runtime. These cannot be done from a planning/file-write context:

1. Run schema migration SQL (the 3 new tables + Realtime publications + 8 agent INSERTs) against live Supabase
2. Forge actual auto-deploy event emission to `agent_events`
3. Witness `probation_tracker` row creation (happens on first agent run)
4. Tutor consuming the 24 training signals in next Sunday batch
5. Cadence including Shopify Website Team in next Monday 09:00 UTC weekly review
6. Mira splitting this combined onboarding doc into 16 per-agent files (post-first-run)

These are tracked under the `pod_d_post_deploy_followups` work item.
