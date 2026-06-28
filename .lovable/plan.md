## Vision
Stand up **`mcp.paigeagent.ai`** — a hosted MCP server that turns every Paige capability (CRM, workflows, BTF, admin) into AI-callable tools. Built once, consumed by MMA OS server-to-server, Antonio's Claude Desktop, Phase 2/3 SaaS customers, and Lovable itself.

This is Doctrine §104 made literal: Paige isn't just a CRM — it's the **agent-callable spine** for capital professionals.

## Architecture (high level)

```text
                ┌────────────────────────────────────┐
                │  mcp.paigeagent.ai (custom domain) │
                └─────────────────┬──────────────────┘
                                  │
                ┌─────────────────▼──────────────────┐
                │  Edge Function: paige-mcp           │
                │  Hono + mcp-lite StreamableHttp     │
                └──┬──────────────┬─────────────────┬┘
                   │              │                 │
         ┌─────────▼───┐  ┌───────▼──────┐  ┌──────▼──────┐
         │ OAuth 2.1   │  │ Tool router  │  │ Per-call    │
         │ /authorize  │  │ (per role)   │  │ audit log   │
         │ /token      │  │              │  │             │
         │ /register   │  └──────────────┘  └─────────────┘
         └─────────────┘
                   │
         ┌─────────▼───────────────────────────────┐
         │  Existing Paige Supabase (RLS-scoped)   │
         │  clients, deals, pipelines, tasks,      │
         │  paige_workflow_registry, btf_*, …      │
         └─────────────────────────────────────────┘
```

Every tool call runs **as the authenticated Paige user** — the OAuth subject becomes a service-role JWT impersonating that `user_id`, so existing RLS does the permission work. No new permission system.

## Phased build

### Phase 1 — Internal API-key MVP (Days 1-3) · ship this first
- Custom domain `mcp.paigeagent.ai` → edge function `paige-mcp`.
- `mcp-lite@^0.10.0` + Hono + `StreamableHttpTransport`.
- **Single auth path:** `PAIGE_MCP_PLATFORM_KEY` in `Authorization` header — server-to-server only.
- **Tool catalog v1 (10 tools, CRM-only):**
  - `search_contacts`, `get_contact`, `update_contact_stage`, `add_contact_note`
  - `list_deals`, `move_deal_stage`, `create_deal`
  - `list_tasks`, `create_task`, `complete_task`
- Per-call audit row in `paige_audit_log` with caller-id, tool, input hash, latency.
- MMA OS LangGraph swaps the bridge for direct MCP for these verbs.
- **Outcome:** Antonio's other AI brain can drive the CRM in one shot.

### Phase 2 — Workflows + BTF + Admin tools (Days 4-6)
- Expand catalog to ~35 tools:
  - **Workflows:** `list_workflows`, `run_workflow`, `list_pending_approvals`, `approve`, `reject`
  - **BTF:** `list_btf_clients`, `get_btf_phase_status`, `request_document`, `send_btf_message`, `mark_phase_complete`
  - **Admin (needsApproval=true):** `invite_team_member`, `suspend_user`, `reassign_coach_clients`
- Every mutating tool tagged `needsApproval` so MCP clients (Claude, ChatGPT) prompt before firing.
- Tool descriptions tuned for Paige's persona — written for the calling agent, not the human.

### Phase 3 — OAuth 2.1 + Dynamic Client Registration (Week 2)
Unlocks Claude Desktop, ChatGPT custom GPTs, external SaaS agents.
- New tables: `mcp_oauth_clients`, `mcp_authorization_codes`, `mcp_access_tokens`, `mcp_refresh_tokens` (all RLS-locked, service-role only).
- New edge function `paige-mcp-oauth` with endpoints:
  - `POST /register` — RFC 7591 Dynamic Client Registration
  - `GET /authorize` — sends user to Paige's existing `/auth` flow, then back with code + PKCE
  - `POST /token` — exchanges code/refresh for access token; embeds `paige_user_id` + role claims
  - `GET /.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-client` served from a Vite public route for CIMD discovery.
- New page `/account/mcp-clients` — users see which agents are connected, can revoke.
- Tool router upgrades: pulls `paige_user_id` from token, mints scoped Supabase JWT, all RLS now active per-user.
- **Outcome:** Antonio pastes `mcp.paigeagent.ai` into Claude Desktop, signs in once with Google, and Claude has Paige tools forever.

### Phase 4 — Multi-tenant + Lovable connector listing (Week 3)
- Add `organization_id` scoping to every MCP-issued token (already on the roadmap per project knowledge §6).
- Per-org rate limits in `api_rate_limits`.
- Tool catalog filters by org plan tier (Free → CRM read-only; Premium → full; VIP → +admin).
- Submit to Lovable MCP connector catalog so I (and other Lovable users) can connect Paige during app-building.
- Public docs page at `paigeagent.ai/mcp` with the canonical URL, tool list, and "Connect to Claude Desktop" button.

## Tool-design rules (apply to every tool)
- Input schema = small Zod object, no free-form blobs.
- `needsApproval: true` for: any mutation in `members`/`offers`/`integrations`, any send (email/SMS), any payment-touching action.
- Output ≤ 4KB JSON; large lists return `{ items, next_cursor }`.
- Every tool result includes `paige_url` so the agent can deep-link the human if needed.
- No consumer-credit data ever leaves Paige via MCP — same denylist as `mmaOsBridge.ts`.

## Tables to add (Phase 3, single migration)
- `mcp_oauth_clients` — registered apps (Claude Desktop, ChatGPT, MMA OS, …)
- `mcp_authorization_codes` — short-lived auth codes + PKCE challenge
- `mcp_access_tokens` — hashed bearer tokens, scopes, `paige_user_id`, `organization_id`, expiry
- `mcp_refresh_tokens` — rotated on each use
- `mcp_tool_call_log` — every tool call, for billing + abuse detection

All RLS-locked, service-role-only. Users see their own connected apps via a SECURITY DEFINER view.

## Secrets needed
- `PAIGE_MCP_PLATFORM_KEY` (Phase 1, generated)
- `PAIGE_MCP_OAUTH_SIGNING_KEY` (Phase 3, generated — 64 chars)
- `PAIGE_MCP_TOKEN_PEPPER` (Phase 3, generated — for hashing bearer tokens at rest)

## Verification per phase
- Phase 1: `curl` with platform key → tool list shows 10 tools, `search_contacts` returns real rows.
- Phase 2: MCP Inspector (`npx @modelcontextprotocol/inspector`) walks the full catalog, `needsApproval` prompts fire.
- Phase 3: Claude Desktop connects via OAuth, full round-trip works, revoke from `/account/mcp-clients` invalidates token within 60s.
- Phase 4: Lovable connector listing shows Paige; second test org can't see first org's data.

## Out of scope (explicit)
- Webhooks/streaming subscriptions from MCP (clients poll for now).
- Mogul Credit / consumer-credit tool surface — that's the Mogul AI project's spine, never crosses lanes (project knowledge §12).
- Per-tool billing meter (Phase 5+, after pricing for external SaaS is set).

## Estimate
- Phase 1: ~3 days · ships immediate value to MMA OS
- Phase 2: ~3 days · ships value to Antonio in Claude Desktop via Phase 1 key
- Phase 3: ~5 days · unlocks every other caller
- Phase 4: ~5 days · multi-tenant + Lovable listing

Total: ~16 working days for the full vision. Phase 1 alone is shippable in 3.

## Recommendation
**Greenlight Phase 1 now.** It's small, it unblocks MMA OS immediately (replaces several `paige-bridge` round-trips), and it proves the architecture before we invest in OAuth. Phases 2-4 each go through their own plan-mode review so you can re-scope based on what the first users hit.
