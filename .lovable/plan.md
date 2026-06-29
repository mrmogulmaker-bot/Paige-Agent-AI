
# Phase 3 — MCP OAuth 2.1 + Dynamic Client Registration

Goal: let Claude Desktop, ChatGPT, and other MCP hosts connect to `paige-mcp` as a specific Paige user, with scoped permissions that respect existing RLS — without anyone hand-pasting an API key. The existing `PAIGE_MCP_PLATFORM_KEY` path stays live for MMA OS and internal callers.

## What ships

1. **Three new tables** (all RLS-locked, owner-scoped)
   - `paige_mcp_oauth_clients` — DCR registrations (client_id, client_name, redirect_uris[], created_by_user_id)
   - `paige_mcp_oauth_codes` — short-lived authz codes (10 min TTL, PKCE S256 challenge, requested scopes, user_id)
   - `paige_mcp_oauth_tokens` — issued access + refresh tokens (sha-256 hashed at rest, scopes[], expires_at, revoked_at, user_id, client_id)

2. **Edge function routes** added to existing `paige-mcp/index.ts`
   - `POST /oauth/register` — DCR per RFC 7591 (public, rate-limited, no auth required)
   - `GET  /oauth/authorize` — redirects to `/mcp/authorize?...` consent screen
   - `POST /oauth/token` — exchanges code↔access_token (PKCE verify) and refresh_token↔access_token
   - `POST /oauth/revoke` — RFC 7009
   - `.well-known/*` already live from Phase 3 scaffolding — fill in real values

3. **Consent screen** at `/mcp/authorize` (new React route)
   - Shows requesting client name, requested scopes (human-readable), and Allow/Deny
   - Requires existing Paige session; if logged out, kicks to `/auth` and returns
   - On Allow → mints authz code, 302 to `redirect_uri?code=…&state=…`

4. **Per-user MCP requests**
   - Bearer token → look up `paige_mcp_oauth_tokens`, verify hash + expiry, load user_id + scopes
   - Set request-scoped Supabase client using a signed JWT for that user_id so RLS applies naturally
   - Scope gate per tool: `crm.read|write`, `workflows.run`, `btf.read|write`, `admin.read|write`
   - Audit log entries written as `actor_role='mcp:user'` with `actor_user_id` populated

5. **Admin surface** — new tab in `/admin/settings` "MCP Sessions"
   - List active tokens (client name, scopes, last-used, expires)
   - One-click revoke
   - Owner can see all; non-owners see only their own

## Build order (single session)

1. Migration: tables + RLS + GRANTs
2. Edge function: token storage helpers, PKCE verifier, scope→tool gate
3. Edge function: `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`
4. Refactor `assertAuth` in `paige-mcp` to accept either platform key OR user token
5. Per-tool scope guards (table-driven, defined once)
6. React route `/mcp/authorize` (Mogul Maker Academy gold/navy is owner-side; this is Paige-branded since it's the platform itself)
7. Admin "MCP Sessions" tab + revoke action
8. Smoke test: simulate full DCR → authorize → token → tools/call flow against a test user

## Technical notes (for the dev-curious)

- Token format: opaque random 48-byte base64url; only sha-256 hash stored
- PKCE: S256 only (no `plain`); reject if `code_challenge_method !== "S256"`
- Access token TTL: 1 hour; refresh token TTL: 30 days, rotates on use
- DCR has no auth (per spec) but is rate-limited at 10/hour per IP via `paige_bridge_auth_failures` pattern
- All OAuth endpoints set `Cache-Control: no-store`
- Per-user Supabase client is built by signing a short-lived JWT with the project's JWT secret carrying `sub: user_id, role: 'authenticated'` — this is the same trick the BTF signed-invite flow already uses, so the helper is reusable
- `mcp.paigeagent.ai` custom domain is a future ops concern, not blocking this phase

## Out of scope (call out separately when relevant)

- Multi-tenant org scoping (Phase 4)
- Listing in the Lovable / Anthropic MCP catalog (Phase 4)
- Per-tool rate limits beyond the global one (future)
- UI for end users to manage their own MCP sessions outside admin (future)

## Acceptance

- `curl POST /oauth/register` returns a client_id without auth
- Claude Desktop "Add MCP server" flow against `https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/paige-mcp` walks discovery → DCR → consent → tools listed
- A token issued with only `crm.read` can call `search_contacts` but is 403'd from `update_contact_stage`
- Revoking a token in `/admin/settings` immediately 401s the next request from that token
- Audit log shows `actor_user_id` populated on user-token calls and NULL on platform-key calls
- Existing `PAIGE_MCP_PLATFORM_KEY` callers (MMA OS) continue to work unchanged
