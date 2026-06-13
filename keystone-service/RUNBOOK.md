# Keystone Activation Runbook

The single reference for "activate Keystone." Part A is **once ever**. Part B is the
**copy-paste checklist for every new client**. Part C is ongoing ops + troubleshooting.

> Division of labor: **Keystone** gets/holds/serves the per-store Admin API token.
> **Porter** uses it to do the work (products, images, pages, menus, metafields).

---

## Part A — One-time service deploy (do this once, ever)

The service then runs 24/7 and serves **every** client store. You never redo this per client.

```bash
cd "Boldteq App/Operation/Polyglot/keystone-service"
npm install                              # express + pg

# 1. Generate the two secrets you'll need (save them — you set them in Railway next)
openssl rand -hex 32                     # → KEYSTONE_ENC_KEY  (encrypts tokens at rest)
openssl rand -hex 32                     # → KEYSTONE_API_KEY   (Bearer key for /token /status /register /revoke)

# 2. Create the Railway service + Postgres
railway login
railway init                             # new project/service (name it "keystone")
railway add --database postgres          # provisions DATABASE_URL automatically

# 3. First deploy (so Railway assigns a domain), then generate the public URL
railway up
railway domain                           # → e.g. keystone-production.up.railway.app  (copy it)

# 4. Set env vars (use the domain from step 3 for KEYSTONE_BASE_URL)
railway variables --set "KEYSTONE_ENC_KEY=<the first hex from step 1>"
railway variables --set "KEYSTONE_API_KEY=<the second hex from step 1>"
railway variables --set "KEYSTONE_BASE_URL=https://keystone-production.up.railway.app"
# (DATABASE_URL was set by `railway add`; PORT is injected by Railway)

# 5. Redeploy so it boots with the env + verify
railway up
curl -s https://keystone-production.up.railway.app/health     # → {"status":"ok","db":true,"config":true}
```

**Then, on the machine that runs builds** (so the CLIs can reach the service), export two vars
(add to your shell profile / 1Password):
```bash
export KEYSTONE_SERVICE_URL=https://keystone-production.up.railway.app
export KEYSTONE_API_KEY=<the same KEYSTONE_API_KEY from step 1>
```

✅ Done. The service is live, the schema auto-created on boot, and the token-refresh sweep runs every 6h.

---

## Part B — Per-client checklist (every new client)

**One-time on the build machine:** `shopify auth login` (browser, once) to the **`insight infoway`** org;
`export KEYSTONE_PARTNER_ORG_ID=<insight-infoway-org-id>` (and `KEYSTONE_APP_DIR` if not the default
`~/Desktop/Shopify Task/Client Shopify App`).

The agent builds the app via CLI; you do **3 Dashboard clicks** Shopify forces (no CLI/API exists for them).

### 1. Build the app (the agent / one command)
```bash
cd "Boldteq App/Operation/Polyglot/theme-toolkit"
node scripts/keystone-provision.mjs --store acme.myshopify.com --org-id "$KEYSTONE_PARTNER_ORG_ID"
# → shopify app init/deploy scaffolds + registers the custom-dist app in the org, into
#   ~/Desktop/Shopify Task/Client Shopify App/acme/ , sets the 9 scopes + the Keystone redirect,
#   reads client_id, and PRINTS the 3-step Dashboard checklist below.
```

### 2. The 3 Dashboard clicks (Dev Dashboard — Shopify forces these, ~1 min)
- **Settings → Client credentials →** copy the **Client secret**.
- **Distribution → Custom distribution →** enter the client's `*.myshopify.com` domain.
- **Generate link →** copy the install link.
*(Scopes + redirect URL are already set by step 1. NEVER add orders/customers/payments scopes.)*

### 3. Register creds + link (one command → done)
```bash
node scripts/keystone-register.mjs \
  --store acme \
  --client-id <client_id from shopify.app.toml> \
  --client-secret <paste the secret> \
  --install-link "<paste the Dashboard link>"
# → echoes the install link to send (secret never logged)
```

### 4. Send the link to the client
Send the Dashboard-generated install link → they click → **Install**. (Custom-dist apps install via
the Dashboard link; it lands on Keystone's `/auth/callback`, so the token capture is automatic.)

### 5. Confirm + done
```bash
node scripts/keystone-status.mjs acme
# → INSTALLED+OK  (means: client installed + the 9 scopes are correct)
#   if "not-installed" → they haven't clicked yet; wait. if "scope-mismatch" → fix scopes in step 1, reinstall.
```
That's it — the token is captured, encrypted, and ready for Porter.

---

## Part C — How the token reaches Porter (automatic, in every build)

You don't handle the token. The `/shopify-store` build (or atrium) runs this at Phase 0:
```bash
export SHOPIFY_ADMIN_API_TOKEN_ACME=$(node scripts/keystone-token.mjs acme)
# keystone-token prints ONLY the token; auto-refreshes if near expiry.
# Porter's resolveToken() reads SHOPIFY_ADMIN_API_TOKEN_ACME → starts writing to the store.
```
Token is fetched fresh each build, so refresh is invisible to you.

---

## Part D — Ongoing ops

| Task | Command |
|---|---|
| Check a store's access status | `node scripts/keystone-status.mjs <store>` |
| Re-print an install link | `node scripts/keystone-link.mjs <store>` |
| Pull the current token | `node scripts/keystone-token.mjs <store>` |
| Service health | `curl -s $KEYSTONE_SERVICE_URL/health` |
| Offboard a client (purge token) | `curl -s -X POST $KEYSTONE_SERVICE_URL/revoke -H "authorization: Bearer $KEYSTONE_API_KEY" -H 'content-type: application/json' -d '{"shop":"acme.myshopify.com"}'` |

Token refresh is automatic (6h sweep + on-demand when `keystone-token` is called near expiry).

---

## Part E — Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `keystone-register` → ENV-ERROR | `KEYSTONE_SERVICE_URL` / `KEYSTONE_API_KEY` not exported on the build machine (Part A end) |
| `keystone-status` → `not-installed` | client hasn't clicked the link yet — wait / resend |
| `keystone-status` → `scope-mismatch` | the app's granted scopes ≠ the 9 — fix scopes in Partner Dashboard, have them reinstall |
| `/auth/callback` → `hmac verification failed` | wrong `client_secret` registered — re-run `keystone-register` with the correct secret |
| `/auth/callback` → `state mismatch` | stale/forged install — re-open the install link fresh |
| `keystone-token` → exit 3 | not installed yet (build should pause + ask) |
| `/health` → `degraded` | a missing env var (`KEYSTONE_ENC_KEY`/`API_KEY`/`BASE_URL`) or DB unreachable |

---

## Part F — When you want true zero-touch (later)

This same service flips to the **unlisted public OAuth app** model — ONE app for all clients, no
per-client Partner-Dashboard step at all (you just generate links). It needs Shopify's one-time
app review. When you're ready, we register one public app, point its redirect at this callback,
and Part B collapses to "run `keystone-register` + send link" with no app creation per client.
