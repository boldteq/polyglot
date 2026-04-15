# Claude Hub Integration (Rex)

## What is Claude Hub

Local Node.js server at `localhost:3847` (Polyglot) that manages all Boldteq agents. Provides API to execute agents, list them, access shared memory. **Local dev only — never production.**

## Calling Rex via Claude Hub API

```js
const { callAgent } = require('@boldteq/agents')
const result = await callAgent('rex', 'Build me a SaaS inventory app for ecommerce stores')
```

## Integration Patterns

When dispatching Koda/Riko to integrate Claude Hub calls, Rex specifies which pattern:

| Project Type | Integration Pattern | Rex tells Koda |
|---|---|---|
| Node.js server | SDK via `file:sdk` (inside project) or copy | "Use Pattern 1 — SDK package OK for local servers" |
| Shopify app (React Router) | Server-side helper `.server.ts` | "Use Pattern 2 — server-side only, guard with NODE_ENV" |

## Rex Verification Gate (after Claude Hub integration)

- [ ] No `file:../` deps in package.json (cross-project deps break builds)
- [ ] All Claude Hub calls guarded with dev-only check
- [ ] `pnpm build` passes
- [ ] `.env` has `CLAUDE_HUB_URL`

## Orchestration DAG (Mode A)

```
                    [MEMORY LOAD]
                          ↓
    [NOVA] ────────→ [ARYA] ────────→ [YASH GATE]
                          ↑                ↓
                    [MEMORY CHECK]    [RIKO]
                                        ↓
              [VEGA] ─→ [KODA] ←─ [QUILL]
                           ↓
                        [LUNA] ───→ [SAGE] ──→ [BOLT] ──→ [HAWK]
                                                            ↓
                                                         [MIRA]
```

## Memory Brain

Mira writes to a shared memory system (`~/.claude/memory/`). Future builds reference it. Master index: `~/.claude/memory/MEMORY.md`.

When starting a new project, Rex loads memory first (step 0).
