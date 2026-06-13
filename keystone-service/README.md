# Keystone Service — Shopify store-access provisioner

Standalone OAuth service that captures + serves **per-store Shopify Admin API tokens** for
**custom-distribution apps**, so Porter (the store-operator agent) gets write access to each
client store. Owned by the **Keystone** agent (Shopify Website Team). Deployed as its own
Railway service.

## Why it exists

Shopify has **no API** to create a custom-distribution app or generate its install link — those
are manual Partner-Dashboard steps. But the install runs through **standard OAuth**, so the
token capture IS automatable. Keystone automates everything after the manual app creation:
the install link, the OAuth callback + token exchange, encrypted per-store storage, 90-day
refresh (for expiring tokens), and serving the token to Porter.

## Per-client flow

1. **Human, in the Partner Dashboard (Shopify-mandated, no API):** create a custom-distribution
   app named for the client store → set access scopes to the Porter set (below) → set the
   "Allowed redirection URL" to `<KEYSTONE_BASE_URL>/auth/callback` → generate the install link
   → copy the app's `client_id` + `client_secret`.
2. `keystone register --store acme.myshopify.com --client-id … --client-secret …` (via the
   `theme-toolkit/scripts/keystone-register.mjs` CLI) → returns the install link.
3. Send the link to the client → they install → the callback captures the offline token.
4. `keystone-token.mjs acme` returns the live token; the build run exports
   `SHOPIFY_ADMIN_API_TOKEN_ACME` for Porter.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | public | liveness + db/config check |
| `GET /install?shop=` | public | 302 → the store's OAuth authorize URL (the link you send) |
| `GET /auth/callback` | public (HMAC + state verified) | code→token exchange, encrypted store |
| `POST /register` | API key | register an app's `client_id`/`client_secret` for a store |
| `GET /token?shop=` | API key | current (auto-refreshed) Admin token — Porter reads this |
| `GET /status?shop=` | API key | installed? token valid? granted vs required scopes? |
| `POST /revoke` | API key | offboarding — purge tokens |

## Porter scope set (what each app must grant)

`write_products, read_products, write_content, read_content, write_files, read_files,
write_metaobjects, read_metaobjects, write_online_store_navigation` — **never**
orders/customers/payments. `keystone-status` BLOCKS if the granted scopes don't match.

## Deploy (Railway)

```bash
railway init                       # new service
railway add --plugin postgresql    # DATABASE_URL
railway variables set KEYSTONE_ENC_KEY=$(openssl rand -hex 32)
railway variables set KEYSTONE_API_KEY=$(openssl rand -hex 32)
railway variables set KEYSTONE_BASE_URL=https://<your-service>.up.railway.app
railway up
```
Health: `GET /health` → 200. Schema auto-creates on boot. Token refresh runs every 6h
(expiring tokens only; classic non-expiring tokens are stored once and never refreshed).

## Security

AES-256-GCM field encryption for `client_secret`/`access_token`/`refresh_token`; OAuth callback
verifies Shopify HMAC + CSRF `state`; authed endpoints use a constant-time API-key check; one
app + one token per store; least-privilege scopes. Never logs/echoes secrets.
