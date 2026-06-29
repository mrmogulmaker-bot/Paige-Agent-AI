## Plan: MMA OS Platform Key + `email_templates` Infrastructure

### Part 1 — Platform Key Handoff (Option B)

Mint a new MMA-OS-scoped platform key so it can be revoked independently of the existing `PAIGE_MCP_PLATFORM_KEY`.

1. Generate a fresh 64-char random secret and store it as `MMA_OS_CLAUDE_PLATFORM_KEY` in Paige edge function secrets (via `generate_secret`).
2. Insert a row into `platform_api_keys` registering the new key with:
   - `name`: `mma_os_claude`
   - `scope`: same as existing platform key (full MCP tool access)
   - `key_hash`: SHA-256 of the secret (matching whatever hashing pattern the existing key uses — I'll inspect `paige-mcp/index.ts` auth path to mirror it exactly)
   - `revocable`: true
3. Update `paige-mcp` edge function auth handler (only if needed) so it accepts either platform key by hash-lookup against `platform_api_keys` rather than a single env-var compare.
4. Reply to Claude in the next message with the raw token value (one-time delivery, since Antonio can't fetch it himself).

### Part 2 — `email_templates` Table + MCP Tools

**Migration:**
- Create `public.email_templates` exactly as Claude specified, plus standard GRANTs (service_role full; authenticated SELECT only — writes happen via service-role edge functions / MCP tools).
- RLS:
  - `SELECT` for `authenticated` where `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'super_admin')` — non-admins don't need to browse templates.
  - All writes go through service-role (MCP / admin tools), no client-side INSERT/UPDATE/DELETE policy.
- Trigger: `updated_at` auto-update.
- Optional helpful index: `(category, product_scope) WHERE active = true`.

**Edge function additions** in `supabase/functions/paige-mcp/index.ts` — register 3 new MCP tools:

| Tool | Purpose | destructiveHint |
|---|---|---|
| `list_email_templates` | Read-only catalog browse, filter by `category` / `product_scope` / `active` | false |
| `upsert_email_template` | Insert or update template by `template_key`; sets `updated_by_user_id` from auth context | true |
| `send_btf_template_email` | Lookup → mustache render `{{var}}` against `vars` → enqueue via existing `send-transactional-email` infra → return `{ok, message_id, template_key, sent_at}` | true |

**Renderer:** lightweight inline mustache (no npm dep) — `body_markdown.replace(/\{\{(\w+)\}\}/g, ...)` + same for `subject` and `preheader`. Missing variables: return `{ok: false, error: "missing_var: <name>"}` so Claude's smoke-test catches gaps before customer fire.

**Send path:** route through the existing transactional email queue (`enqueue_email` RPC into `transactional_emails` pgmq) so it inherits suppression checks, retry/DLQ, and rate limits. `from_name` defaults to `"Build to Fund"`; `reply_to` defaults to `coach@mogulmakeracademy.com`.

**Registry update:** add the 3 new tools to whatever tool catalog drives `tools/list` so Claude sees them immediately on next `initialize`.

### Out of Scope (explicitly not doing)
- Rendering `body_html` cache on save (Claude marked optional; markdown→HTML happens at send time via existing email renderer).
- Admin UI for browsing/editing templates (Claude said admin UI not required; he'll push via SQL or `upsert_email_template`).
- Seeding the 14 BTF templates — Claude will push those himself once the table is live.

### Deliverables on this turn (once approved → build mode)
1. `secrets--generate_secret` → `MMA_OS_CLAUDE_PLATFORM_KEY`
2. Migration: `email_templates` table + GRANTs + RLS + trigger + `platform_api_keys` row for the new key
3. Edit `supabase/functions/paige-mcp/index.ts`: register 3 new tools + (if needed) multi-key auth lookup
4. Reply message to Claude with the raw platform key value and confirmation that all 3 tools are live

### One Confirmation Needed
The new `MMA_OS_CLAUDE_PLATFORM_KEY` will be delivered to Claude in the next chat message (single-use handoff, since Antonio doesn't have edge-function-secret access to retrieve it later). Confirming you (Antonio) are OK with the key value appearing once in the chat log — same trust boundary as the API-to-API messages Claude has been sending. If you'd rather I deliver it some other way, say so before I switch to build.
