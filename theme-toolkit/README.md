# Boldteq theme-toolkit v1.0.0

Vendored QA-gate suite for client-owned Shopify Liquid theme repos (Shopify Website Team,
Stack D). One copy lives in every client repo at `toolkit/`; CI workflows enforce the gates
on every push, staging PR, and release tag. Master copy: `Polyglot/theme-toolkit/`.

| # | Gate | Kind | Script | Blocks on |
|---|------|------|--------|-----------|
| 1 | lighthouse | URL | `scripts/gate-lighthouse.mjs` | budget breach (`lighthouse-budget.json`, per page × form factor) |
| 2 | theme-check | static | `scripts/gate-theme-check.mjs` | any `error`-severity offense (`.theme-check.yml`) |
| 3 | editability | static | `scripts/gate-editability-greps.sh` | unallowlisted hardcode in the diff vs the `base` tag |
| 5 | axe | URL | `scripts/gate-axe.mjs` | any WCAG 2.1 A/AA violation, mobile + desktop |
| 6 | seo | URL | `scripts/gate-seo.mjs` | on-page SEO checklist failure across the page matrix |

Orchestrator: `scripts/theme-gates.mjs` (`--static-only` / full / `--gate <name>` / `--verify`).
Every gate writes `gate-reports/<gate>.json` (exact schema in `scripts/lib/report.mjs`);
the orchestrator writes `gate-reports/summary.json`.

## Exit codes (every script, no exceptions)

| Code | Meaning |
|------|---------|
| 0 | pass / evidence fresh |
| 1 | block / evidence stale — deploy must halt |
| 2 | env error (missing dep, no URL, password wall, discovery hard-fail). **Never** read as pass — summary marks the gate skipped and overall `pass=false` unless explicitly waived via `SKIP_<GATE>=1` |

## Vendoring into a client repo (mantle)

From the client theme repo root (after the vanilla-base commit is tagged `base`):

```bash
cp -R "$HOME/Desktop/Boldteq App/Operation/Polyglot/theme-toolkit" ./toolkit
rm -rf toolkit/node_modules toolkit/gate-reports        # never vendor installs/artifacts
mkdir -p .github/workflows
mv toolkit/workflows/* .github/workflows/ && rmdir toolkit/workflows
cp toolkit/.theme-check.yml toolkit/.nvmrc .            # repo root copies (CI + CLI read cwd)
mkdir -p gate-reports && touch gate-reports/.gitkeep
npm ci --prefix toolkit                                  # fresh install — toolkit/.gitignore keeps node_modules untracked
node toolkit/scripts/theme-gates.mjs --static-only      # establishes the static-gate baseline (see below)
git add -A && git commit -m "chore(toolkit): vendor v1.0.0"  # toolkit/.gitignore excludes node_modules from this commit
```

The `cp -R` carries `toolkit/.gitignore` (it contains `node_modules/`), so the freshly
installed `toolkit/node_modules` stays untracked — the vendor commit excludes it by design.
Do **not** gitignore `gate-reports/` — committed reports are the evidence `--verify` checks
in CI. The `base` tag is mandatory: gate 3 diff-scopes against it and `theme-publish` hard-fails
without it.

**Static-gate baseline (not "must exit 0"):** a vanilla theme base may legitimately report
pre-existing `theme-check` offenses — Dawn 15.4.1, for example, ships 2 `ValidSchemaTranslations`
errors in `sections/featured-product.liquid` referencing missing `t:` keys. So the bootstrap
`--static-only` run is a **baseline**, not a green-light: record any pre-existing base-theme
offenses as a `CHANGES.md` `## Waivers` baseline entry. The gate thereafter blocks only on **new**
offenses introduced by client code, never on the pre-existing base ones.

## Environment variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `THEME_PREVIEW_URL` | orchestrator + URL gates | preview URL (e.g. from `shopify theme dev`); without it the run is `static-only` |
| `STORE` + `THEME_ID` | orchestrator | alternative to `THEME_PREVIEW_URL` → `https://<store>/?preview_theme_id=<id>` |
| `THEME_STORE_PASSWORD` (alias `STOREFRONT_PASSWORD`) | URL gates | storefront password wall login |
| `SKIP_THEME_CHECK` / `SKIP_EDITABILITY` / `SKIP_LIGHTHOUSE` / `SKIP_AXE` / `SKIP_SEO` = `1` | orchestrator | explicit waiver (recorded in summary; Yash-approved only) |
| `REPORT_DIR` | all gates | report directory (default `gate-reports`) |
| `FIRST_PRODUCT_HANDLE` / `FIRST_COLLECTION_HANDLE` / `BLOG_PATH` / `ARTICLE_PATH` / `PAGE_PATH` | URL gates | page-matrix discovery overrides |
| `CHROME_PATH` | lighthouse | explicit Chrome binary |
| `SHOPIFY_CLI_THEME_TOKEN` + `SHOPIFY_FLAG_STORE` | theme-publish.yml (GitHub secrets) | Theme Access token + store domain for pull/push/publish |

## CI workflows (vendored to `.github/workflows/`)

- **theme-ci.yml** — push to `dev`/`feat/**` + PR to `dev` → static gates, reports uploaded as artifact.
- **theme-staging.yml** — PR to `staging` → static gates **and** `--verify --require-full`
  against the committed evidence at the PR head.
- **theme-publish.yml** — tag `v*` → publish-gate (`base` tag + `--verify --require-full` +
  `check-changes-list.mjs CHANGES.md`), then snapshot live theme (artifact), push unpublished,
  publish by theme id.

## Lumen — full gate run (URL gates)

1. `shopify theme dev` (or push to an unpublished theme) → note the preview URL.
2. `export THEME_PREVIEW_URL=<url>` and, if the store is password-protected,
   `export STOREFRONT_PASSWORD=<pw>`.
3. `npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium` (first run).
4. From the repo root, with a **clean committed tree**: `node toolkit/scripts/theme-gates.mjs`
   → mode=full runs all 5 executable gates: **1** Lighthouse, **2** theme-check, **3** editability greps, **5** axe, **6** SEO. (Gate **4**, cross-browser, is intentionally NOT in the toolkit — it stays a manual lumen audit. The 1,2,3,5,6 numbering is by design, not a missing script.)
5. Fix blockers, re-run to exit 0, then commit the evidence:
   `git add gate-reports && git commit -m "qa: full gate run vs <sha>"` where `<sha>` is the
   `sha` field in `gate-reports/summary.json`.
   > A gate run rewrites `gate-reports/*.json` into the working tree (dirtying it). Commit them (above) or `git checkout -- gate-reports/` **before** any `git revert`/`rebase`/`checkout` — otherwise the git op aborts on the dirty evidence files.

## Onyx — verify procedure

1. `node toolkit/scripts/theme-gates.mjs --verify --require-full` → must exit 0
   (fresh + mode=full + pass=true).
2. Drift check: `toolkitVersion` in `gate-reports/summary.json` and `toolkit/TOOLKIT_VERSION`
   must equal the master `Polyglot/theme-toolkit/TOOLKIT_VERSION`. Mismatch → re-vendor before
   sign-off.

## Freshness rule (what `--verify` enforces)

`summary.json` is **fresh** iff:

1. `dirty == false` (produced from a clean tree), AND
2. the working tree is clean now (ignoring allowlisted paths), AND
3. `sha == git HEAD`, **or** every file changed between `sha` and HEAD is allowlisted:
   `gate-reports/**`, `CHANGES.md`, `merchant-editability.md`, `docs/**`.

Any other change since the run — one line of Liquid, one asset — makes the evidence stale
(exit 1). Re-run the gates; there is no override. `--require-full` additionally demands
`mode == "full"` and `pass == true`.

## Update propagation (new toolkit version)

1. In master: change scripts/configs, bump `TOOLKIT_VERSION` + `package.json` version.
2. In each client repo: `rm -rf toolkit`, redo the vendoring sequence above (including
   re-copying workflows, `.theme-check.yml`, `.nvmrc`), commit `chore(toolkit): vendor v<x.y.z>`.
3. Lumen re-runs the full gates (old evidence now reads stale/version-drifted to onyx).

## Troubleshooting exit 2

| Symptom | Fix |
|---------|-----|
| `shopify CLI not found` | `npm install -g @shopify/cli@3` |
| `missing deps: playwright…` | `npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium` |
| `could not launch chromium` | `npx --prefix toolkit playwright install chromium` |
| `THEME_PREVIEW_URL not set` | export it (or `STORE` + `THEME_ID`) — URL gates never run blind |
| `redirects to the storefront password page` / `password rejected` | set/correct `THEME_STORE_PASSWORD` (or `STOREFRONT_PASSWORD`) |
| `mandatory page "pdp" unresolvable` | publish a product or set `FIRST_PRODUCT_HANDLE` (same for collection) |
| `not a git repository` / `no base tag` | run from repo root; mantle must tag the vanilla base commit `base` |
| `verify: no summary` | lumen has not run the gates — run + commit `gate-reports/` |
| `unparseable theme-check output` | run from the theme root (must contain `layout/`); check CLI version |

Exit 2 in CI fails the job by design — fix the environment, never `SKIP_*` around it without
a Yash-approved waiver.
