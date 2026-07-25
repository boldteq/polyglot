# Boldteq SWT theme repo

This is a **Boldteq Shopify Website Team** client Liquid theme, built with the vendored `toolkit/`.
This file is a **pointer, not a rulebook** — it names the single sources so nothing here drifts.
(Seeded by `/shopify-bootstrap`; safe to extend, never duplicate rule text into it.)

## Before you build
- Provisioned + ready? → `node toolkit/scripts/preflight-repo.mjs` (must exit 0).
- Build/fix loop → `/shopify-build` (understand → build → visual self-test + gates → fix → loop until green).
- All commands run as `node toolkit/scripts/X.mjs` from the repo root — **never `pnpm`** (no root package.json).

## The one hard rule: Shopify is the source of truth, not recall
For ANY Liquid object/filter/tag, section/block schema key (`visible_if`, `enabled_on`, `presets`,
`max_blocks`), metafield, or Admin/Storefront GraphQL question, consult the **Shopify Dev MCP FIRST**:
`learn_shopify_api` → `search_docs_chunks` → `fetch_full_docs` → write → `validate_theme` /
`validate_graphql_codeblocks` until clean → cite. Do not answer from memory. The gates enforce this:
#49 `shopify-validate` (Liquid) + #51 `graphql-validate` run Shopify's OWN validator over your changes.

## Done means green
- `node toolkit/scripts/theme-gates.mjs` — collect blockers from `gate-reports/`, fix in place.
- **Never delete a section/feature to pass a gate.** Fix the cause.
- You are NOT done until `node toolkit/scripts/done-check.mjs` **exits 0** and you've shown its output.
- Escalate only the whitelist in `docs/ESCALATION.md` (honesty / real-asset / legal / brand / store-data).

## Full doctrine
House brain: `~/.claude/memory/patterns/good/shopify-website-team-handbook.md` (§5 = Toolkit + Dev MCP).
