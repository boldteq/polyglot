# Shopify CLI Theme Workflow

**Owner:** mantle (Shopify Website Team)
**Cross-pod consumers:** loom, lumen, atrium, bolt
**Status:** v1.0 (foundational; refined after first 5 Shopify Website Team deploys)

## Purpose

Standardize Shopify CLI usage across all Shopify Website Team client themes. Replaces ad-hoc theme push patterns. Enforces safety (snapshots, rollback, no Friday deploys).

## Setup (per machine, once)

```bash
npm install -g @shopify/cli
shopify version  # confirm latest
shopify auth login  # one-time auth
```

## Per-Client Setup

```bash
# Token from 1Password (NEVER committed)
export SHOPIFY_CLI_THEME_TOKEN=$(op read 'op://boldteq/shopify-tokens/{client_handle}')
export SHOPIFY_FLAG_STORE={client_handle}.myshopify.com

# Pull current live to snapshot
shopify theme pull --live --path=./snapshots/$(date -u +%Y%m%dT%H%M%SZ)/
```

## Commands Reference

| Command | When |
|---|---|
| `shopify theme dev` | loom local dev, hot-reload |
| `shopify theme push --unpublished` | mantle staging push |
| `shopify theme push --theme={id}` | mantle update existing theme |
| `shopify theme publish --theme={id}` | mantle live publish (atrium-authorized only) |
| `shopify theme pull --live --path=...` | snapshot current live |
| `shopify theme check` | mandatory pre-push lint |
| `shopify theme list` | inventory client's themes |
| `shopify theme info` | verify CLI access still valid |

## Branch Strategy (per client repo)

```
main                  ← mirrors prod-live
prod-live             ← currently published
prod-unpublished      ← next release queued
staging               ← UAT theme
dev                   ← loom's working branch
```

Promotion: dev → staging (onyx review) → prod-unpublished (atrium auth) → tag v{n} → live (GHA-published).

## Publish Protocol (mandatory steps)

1. Verify atrium authorization signal
2. Pre-publish snapshot of current live
3. Push new theme to unpublished slot
4. Publish via `shopify theme publish --theme={new_id}`
5. Log to `agent_events` + `theme_publishes` tables
6. Trigger lumen post-publish smoke (10-min SLA)
7. Auto-rollback on smoke failure

## Anti-Patterns

1. `theme push --live` without atrium authorization
2. Publish without snapshot
3. Friday after 4pm client-local time deploys
4. Sharing tokens across clients
5. Skipping `theme check` before push
6. GitHub Action without lumen CWV gate

## Skill File References

- `~/.claude/skills/mantle/shopify-cli-theme-workflow.md`
- `~/.claude/skills/mantle/client-store-cli-access-protocol.md`
- `~/.claude/skills/mantle/theme-branch-strategy-github.md`
- `~/.claude/skills/mantle/theme-rollback-protocol.md`
- `~/.claude/skills/mantle/multi-client-theme-repo-organization.md`

<!-- AUTHORING TODO: Capture incident playbooks (broken token rotation, push timeout, publish revert chain) after first 5 deployments. -->
