# Odoo 18 SSO — Implementation Plan (next turn)

## Scope
Only Odoo 18. OAuth 2.0 Authorization Code + PKCE. Single callback URI. Per-tenant config in MongoDB. JIT provisioning ON. Password login retained as admin fallback.

## Backend
- Add to `tenants.sso_settings.odoo`: base_url, client_id, client_secret (masked), authorize_url, token_url, userinfo_url, use_discovery, role_mapping{}
- Add `client_secret` to `SECRET_FIELDS`
- Endpoints under `/api`:
  - GET  `/auth/odoo/start?tenant=<slug>` — PKCE + state in signed cookie, 302 to Odoo
  - GET  `/auth/odoo/callback?code&state` — verify state, exchange code (httpx async), fetch userinfo, JIT create/update user, set DocIntel JWT cookies, 302 to /dashboard
  - GET  `/tenants/me/sso-settings` (auth) — secret masked
  - PUT  `/tenants/me/sso-settings` (admin) — partial update, mask-preserve
  - POST `/tenants/me/sso-settings/test` (admin) — pings `/.well-known/openid-configuration` or `authorize_url`
- Default role map: base.group_system→admin, account.group_account_manager→finance, stock.group_stock_user→operations, else→operations
- Libraries already installed: httpx (yes), no new pip needed

## Frontend
- Login.jsx: add "Login with Odoo" button below password form when GET /tenants/public-sso-status returns enabled (or just always show, hide if 400)
- Settings.jsx: new section "SSO · Odoo 18" with base_url, client_id, client_secret, role_mapping editor (key=odoo group, value=docintel role), Test connection button, displayed redirect URI for copy
- Mask client_secret with same ***LAST4 pattern

## Tests (iter6)
- happy path: start→callback creates user, assigns role, sets cookie
- state mismatch → 400
- code reuse → 400
- masked secret PUT preserves real value
- non-admin PUT/test → 403
- JIT idempotency (second login updates, doesn't dup)
- role mapping with multiple Odoo groups
- regression: all 98 prior tests

## Defaults confirmed by user
1. Single callback URI `/api/auth/odoo/callback`, tenant in `state` (signed)
2. Default role map above; admin overrides per tenant
3. Password login retained for admin only (auto-disable for non-admin when SSO configured)

## Estimated effort
~3 dev-days. Build order: backend models+endpoints → frontend Settings → frontend Login → test agent → fix → push to GitHub.
