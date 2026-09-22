# G1a-1 — Connections backend contract (for the G1b Connections UI)

> **Status: DRAFT — implementation in progress in this PR.** This is the STABLE backend
> contract the Connections UI (G1b, Mind agent) builds against. Rows marked **SHIPPED (G1a-1)**
> are implemented in this PR; **EXISTING** already live on `main`; **UNDECIDED** are NOT defined
> by G1a-1 — do not build against them yet, they will get their own contract.

## Global rules (every RPC)

- **SECURITY DEFINER**; `EXECUTE` granted to `authenticated` only (never `anon`).
- **Tenant is resolved SERVER-SIDE** (`_mcp_resolve_tenant`) — a caller acts only within its own
  tenant. A **sub-account never reaches its parent's** connections. The **platform owner (God)
  does NOT hold write authority as itself** — it writes only via genuine act-as tenant-admin
  membership.
- **Write authority = capability `mcp.connections.manage`** (owner / tenant-admin of the tenant).
  **Hard delete additionally requires `mcp.connections.delete`.**
- **Closed error codes.** `42501` = authority/tenant refusal — a **uniform `MCP_FORBIDDEN`** that
  never reveals whether a connection exists across tenants. `22023` = validation.
- **Secrets are NEVER returned.** No RPC returns a decrypted URL, token, or ciphertext. Reads
  return only the endpoint **host** and `auth_token_last4` (shown only for tokens ≥ 12 chars, else
  `NULL`). Secrets are encrypted at rest in the `*_ct` columns (`platform_encrypt`).
- **SSRF / egress.** Every endpoint / base URL is validated at **write time by the same guard**
  (`_mcp_endpoint_write_safe`) used across the gateway: **HTTPS/TLS only**, no userinfo, every
  private / reserved / loopback / link-local IP (all notations) refused, `localhost` /
  `*.local` / `*.internal` refused, bracketed-IPv4 refused. Runtime egress (redirect refusal,
  bounded time/size, DNS-resolved-private-IP refusal) is enforced at dispatch by the shared SSRF
  guard (a later PR, G2). **UI guidance:** only public HTTPS endpoints are accepted.

## Per action

### connect (create) — **SHIPPED (G1a-1)**
- **MCP facets** (generic remote MCP · Zapier OAuth · n8n OAuth):
  `create_mcp_connection(_provider_key, _label, _server_url, _auth_kind, _auth_token?, _auth_header_name?, _refresh_token?, _oauth_issuer?, _oauth_client_id?, _oauth_client_secret?, _oauth_scopes?, _access_token_expires_at?, _visibility='tenant', _tenant_id?)`
  - authority: `manage` · output: `{connection_id, status:'pending_verification', endpoint_hash, auth_token_last4}` · creates `status='pending_verification', health='unknown', enabled=true`.
  - errors: `MCP_FORBIDDEN`(42501) · `MCP_BAD_LABEL` · `MCP_BAD_PROVIDER` · `MCP_BAD_VISIBILITY` · `MCP_BAD_AUTH_KIND` · `MCP_AUTH_KIND_NOT_EXECUTABLE` (api_key is not allowed here — use the REST create) · `MCP_BAD_ENDPOINT` · `MCP_BAD_CREDENTIAL_BUNDLE` · `MCP_OAUTH_TOKEN_EXPIRED` · `MCP_DUPLICATE_LABEL`.
- **n8n REST (api-key):**
  `create_mcp_rest_connection(_provider_key='n8n', _label, _base_url, _api_key, _visibility='tenant', _tenant_id?)`
  - same output shape · creates `auth_kind='api_key', transport='http', status='pending_verification'`.
  - errors: `MCP_FORBIDDEN` · `MCP_BAD_LABEL` · `MCP_BAD_PROVIDER` · `MCP_BAD_VISIBILITY` · `MCP_BAD_ENDPOINT` · `MCP_BAD_CREDENTIAL_BUNDLE` · `MCP_DUPLICATE_LABEL`.
  - **Call with NAMED parameters.** `_label`/`_base_url`/`_api_key` are declared `DEFAULT NULL` (Postgres forbids a required parameter after the defaulted `_provider_key='n8n'`), so a *positional* call — `create_mcp_rest_connection('my-label', …)` — would bind `_provider_key='my-label'` → `MCP_BAD_PROVIDER`. Always call as `create_mcp_rest_connection(_label => …, _base_url => …, _api_key => …)`.

### OAuth start / callback — **UNDECIDED (NOT in G1a-1)**
The create RPCs accept an **already-resolved** OAuth token bundle. The authorization dance
(redirect to provider, PKCE, code→token exchange, callback) is an edge-function flow that *feeds*
`create_mcp_connection` — it is **not** defined by G1a-1. **UNDECIDED:** which edge function runs
the dance and how the UI initiates it. Do not build OAuth start/callback against G1a-1.

### re-key (rotate credential) — **SHIPPED (REST) / EXISTING (MCP)**
- **MCP:** `set_mcp_connection_endpoint(...)` (**EXISTING**) — re-point endpoint + rotate the
  credential for an MCP native row; resets to `pending_verification`, revokes approvals, clears tools.
- **n8n REST:** `set_mcp_rest_connection_endpoint(_connection_id, _base_url, _api_key, _tenant_id?)`
  (**SHIPPED G1a-1**) — errors incl. `MCP_NO_CONNECTION` (null id), `MCP_NOT_A_REST_CONNECTION`
  (row is not api_key), `MCP_LEGACY_CONNECTION_READONLY`, `MCP_BAD_ENDPOINT`, `MCP_BAD_CREDENTIAL_BUNDLE`, `MCP_FORBIDDEN`.

### disconnect — **SHIPPED (G1a-1)**
`disconnect_mcp_connection(_connection_id, _hard=false, _tenant_id?)`
- `_hard=false` (**disable**): authority `manage`. Sets `enabled=false`, **scrubs credentials**
  (tokens → NULL), revokes approvals, clears tools, `status='unconfigured'`. Idempotent
  (`{…, already_disabled:true}`). output `{connection_id, disconnected:true, mode:'disable', status:'unconfigured', approvals_revoked, tools_cleared}`.
- `_hard=true` (**delete**): authority `mcp.connections.delete`. Removes the connection row + its
  secrets + its **live** approvals/tools. **HISTORY IS PRESERVED:** receipts survive (unlinked,
  `connection_id → NULL`), the Rail (`paige_workspace_events`) survives (unlinked), and the audit
  log records the deletion. A second delete → uniform `MCP_FORBIDDEN` (no existence oracle).
- errors: `MCP_NO_CONNECTION` (null id) · `MCP_FORBIDDEN` (missing/foreign-tenant, or lacking the required capability — `delete` for hard, `manage` for disable) · `MCP_LEGACY_CONNECTION_READONLY`.
  output `{connection_id, deleted:true, mode:'delete', approvals_revoked, tools_cleared}`.

### list connections — **EXISTING**
`get_mcp_connections_v2(_tenant_id?)` → array of `{connection_id, provider_key, label, transport,
auth_kind, configured, enabled, status, health, last_checked_at, granted_scopes, visibility,
server_url_host (host only), tool_count, approved_count}`. No secrets.

### list tools — **UNDECIDED (verify)**
G1a-1 defines no dedicated per-connection tool-list read; `get_mcp_connections_v2` returns
`tool_count` / `approved_count` aggregates only. **UNDECIDED** — await confirmation of the read RPC.

### approve / revoke a tool — **EXISTING (approve) / UNDECIDED (revoke)**
- approve: `set_mcp_connection_approval(...)` (**EXISTING**).
- revoke: **UNDECIDED** — await its contract. (Note: re-key and disconnect already revoke **all**
  approvals as a side effect.)

## Facet field sets (what the UI collects per connect)

| Facet | provider_key | fields → RPC |
|---|---|---|
| Generic remote MCP | `generic-remote` (or any) | server URL (https) + `auth_kind` ∈ {oauth, bearer, header, url, none}; oauth → token+issuer+client_id (+optional refresh/secret/scopes/expiry); bearer → token; header → token + header name; url/none → no credential → `create_mcp_connection` |
| Zapier (MCP OAuth) | `zapier` | server URL + oauth bundle → `create_mcp_connection` (OAuth dance UNDECIDED) |
| n8n (MCP OAuth) | `n8n` | server URL + oauth bundle → `create_mcp_connection` (OAuth dance UNDECIDED) |
| n8n REST (api-key) | `n8n` | base URL + API key → `create_mcp_rest_connection` |

## States
- `status`: `unconfigured | pending_verification | connected | error`
- `health`: `unknown | checking | healthy | needs_attention`
- Newly created / re-keyed rows are `pending_verification / unknown` until the G2 probe promotes them.
