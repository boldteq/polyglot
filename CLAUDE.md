# Polyglot — Internal Agent OS for Boldteq

## What this is
Polyglot is Boldteq's internal tool for managing all AI agents. It is **not** a product — it is the operational backbone of the Boldteq Software Factory. Every Boldteq agent lives here: their `.md` files, their SQLite registry, their HR lifecycle, their org chart, and their run history.

## Stack
- **Frontend:** React + Vite + TypeScript + Tailwind — `client/src/`
- **Backend:** Node.js + Express — `src/`
- **Database:** SQLite via `better-sqlite3` — `data/polyglot.db` (single source of truth for all agent metadata)
- **Agent files:** `~/.claude/agents/*.md` (disk = live name + description + model; SQLite = org metadata)
- **Config files:** `~/.claude/org/` (departments.json, registry.json, squads.json, tiers.json, tag-taxonomy.json)

## Single Source of Truth Rules

### Agent data
- **SQLite `agents` table** = canonical source for: status, title, tier, department, squad, level, tags, avatar, gender, experience
- **Disk `.md` frontmatter** = canonical source for: `name`, `description`, `model`, `tools`
- **Merge rule (used in `buildOrgChart` and `GET /api/hr/registry`):** `name: disk?.name || record.name || id`
- **Never** read registry from `~/.claude/org/registry.json` directly for UI — always go through `org.loadRegistry()` which reads SQLite

### Agent counts
- **Total active agents:** `SELECT COUNT(*) FROM agents WHERE status='active'` → 36
- **Probation:** 10, **Pending:** 7, **Retired:** 1, **Total:** 54
- **Disk files:** 53 (rex is retired with no .md file)
- **OrgChart "members":** 53 (all non-retired agents with disk files — from `buildOrgChart`)
- **HR chips:** computed from `registry.agents.filter(status===x).length` — includes active/probation/pending/pip/retired
- **Agents page count:** disk `.md` files + project-scoped agents — intentionally different from registry count
- **Never hardcode counts.** All counts derive from API data at render time.

### Taxonomy (squads, tiers, tags)
- Source: `~/.claude/org/squads.json`, `tiers.json`, `tag-taxonomy.json` via `src/taxonomy.js`
- Frontend: `useTaxonomy()` hook (`client/src/hooks/useTaxonomy.ts`) — singleton cache + SSE auto-refresh
- **Never** import `SQUADS`, `TAG_TAXONOMY`, or `TIER_ICONS` from `orgConstants.ts` for rendering — those are offline fallbacks only

### Agent names (display format)
- Standard: `{emoji} {RealName} — {ShortRole}` (role = title, clamped to 6 words)
- Use `formatAgentDisplay(agent)` from `client/src/lib/agentDisplay.ts` everywhere
- Never render `agent.name` or `agent.title` raw — always go through `formatAgentDisplay()`
- This applies to: OrgChart cards, AllAgents rows, HR registry rows, Playground dropdown

### Real-time sync
- All agent updates broadcast via SSE at `/api/org-chart/stream`
- Events: `agent:upsert`, `agent:remove`, `taxonomy:update`
- All pages subscribe and auto-refetch on these events — no manual refresh needed

## File structure
```
src/
  org.js           — registry CRUD, buildOrgChart, loadRegistry/saveRegistry
  hr.js            — HR lifecycle (promote/pip/retire/hire/getRegistry)
  taxonomy.js      — squads/tiers/tags CRUD
  db.js            — SQLite wrapper (all reads/writes go here)
  routes/
    orgHr.js       — /api/org-chart, /api/hr/*, /api/org/*, /api/taxonomy/*
    agents.js      — /api/unified/agents (disk-first, enriched with registry)

client/src/
  lib/
    agentDisplay.ts  — formatAgentDisplay() — ONLY place name formatting logic lives
    api.ts           — all API calls
    orgConstants.ts  — FALLBACK ONLY for offline — never use for rendering
  hooks/
    useTaxonomy.ts   — dynamic taxonomy (squads/tiers/tags) with SSE refresh
  pages/
    OrgChart.tsx     — org chart visualization + OrgSetupForm for editing
    AllAgents.tsx    — agent list (unified/agents endpoint)
    Hr.tsx           — HR registry, reviews, training, drift fixer
```

## Rules for any change to agent data

1. **New field on agents:** SQLite column in `db.js` → include in `upsertAgent` in `org.js` → add to `AgentRecord` type in `api.ts` → include in `buildOrgChart` → frontend reads it
2. **New status value:** Add to `AgentStatus` type in `api.ts` → add StatChip + filter option in `Hr.tsx`
3. **New taxonomy item (squad/tier/tag):** Edit JSON file in `~/.claude/org/` → `useTaxonomy()` SSE-refetches automatically — never hardcode in TSX
4. **Change agent display format:** Change only `formatAgentDisplay()` in `agentDisplay.ts` — updates all pages at once
5. **Two pages show same metric:** They must use the same API endpoint — no independent computations of the same value
6. **Name field in registry must be:** `"Emoji Name — ShortRole"` only — never include description text

## Anti-patterns (never repeat)
- Stuffing description into the `name` field in SQLite/registry
- Using `ORG_TAG_TAXONOMY` from orgConstants.ts in filter pill rendering
- Reading `~/.claude/org/registry.json` directly in backend — use `org.loadRegistry()`
- Local `deriveTagline` / `extractRole` functions in page files — use `formatAgentDisplay()`
- Counting agents from different sources on different pages
