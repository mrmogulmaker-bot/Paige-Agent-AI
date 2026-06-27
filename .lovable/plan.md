
# Paige Becomes the OS — Phase 2 Plan (Connectors)

Builds on Phase 1 tables (`paige_config`, `paige_messages_audit`, `paige_workflow_registry`, `paige_workflow_runs`, `paige_pending_approvals`, `mma_os_bridge_outbox`). Strict MMA-only scope — no consumer-credit, Plaid, Nav, SmartCredit, or Mogul Credit references anywhere in code, copy, prompts, or knowledge.

---

## 0. Scope guardrail (permanent)

Add to `mem://constraints/mma-only-scope`: Paige Agent AI serves MMA business-side only. Never include credit repair, consumer credit monitoring, Plaid, Nav.com, SmartCredit, personal credit dispute workflows, or FCRA/FDCPA consumer logic. Those live in a future separate product (Mogul AI).

---

## 1. Database — 4 new tables

All in `public`, with `GRANT` blocks, RLS enabled, admin-only via `has_role(auth.uid(), 'admin')`. Secrets are encrypted via a small `_internal_secrets` helper (existing) — table columns hold only references / last4, never raw tokens.

### 1.1 `paige_mcp_connections`
```
id uuid pk, label text, server_url text, transport text default 'http',
auth_token_ref text,           -- pointer into _internal_secrets
auth_token_last4 text,
enabled boolean default true,
tools_cache jsonb,             -- last client.tools() snapshot
last_probed_at timestamptz,
created_at, updated_at
```
Index: `(enabled)`. RLS: admin read/write.

### 1.2 `paige_n8n_connections`
```
id uuid pk, label text, base_url text,
api_key_ref text, api_key_last4 text,
is_default boolean default false,
workflows_cache jsonb, last_sync_at timestamptz,
created_at, updated_at
```
Partial unique index `where is_default` to enforce one default. RLS: admin only.

### 1.3 `paige_subscription_events`
```
id uuid pk,
stripe_event_id text unique,    -- idempotency
stripe_customer_id text,
contact_id uuid references public.clients(id) on delete set null,
event_type text,                -- subscription.created/updated/deleted, invoice.paid, payment_failed
tier_before text, tier_after text,
mrr_delta_cents integer,
currency text default 'usd',
raw jsonb,
processed_at timestamptz,
created_at timestamptz default now()
```
Indexes: `(contact_id, created_at desc)`, `(event_type)`, `(stripe_customer_id)`. RLS: admin read, service_role write.

### 1.4 `paige_telegram_config` (singleton, id=1)
```
id integer primary key default 1 check (id = 1),
bot_token_ref text, bot_token_last4 text,
default_admin_chat_id text,
enabled boolean default true,
updated_at timestamptz
```
RLS: admin only.

### 1.5 Extend `paige_config` (Phase 1)
Add columns: `ghl_pit_ref text`, `ghl_location_id text`, `gmail_default_sender text`, `langsmith_project text default 'paige-agent-mma'`.

---

## 2. Edge functions — 14 new

All use `corsHeaders` from `npm:@supabase/supabase-js@2/cors`, validate input with Zod, require admin/service-role JWT unless noted, and log every outbound send to `paige_messages_audit` where relevant.

### n8n (3)
- `n8n-list-workflows` → GET `/api/v1/workflows`; upserts active rows into `paige_workflow_registry` (matched by `n8n_workflow_id`), returns diff summary.
- `n8n-trigger-workflow` → POST `/api/v1/workflows/{id}/execute`; called by Phase 1's `trigger-workflow` (refactor Phase 1 to delegate here when the registry row points at an n8n connection).
- `n8n-get-executions` → GET `/api/v1/executions?workflowId=…&limit=20`.

### Stripe (1)
- `handle-stripe-webhook` (public, signature-verified) → parses events, writes `paige_subscription_events`, derives tier from price→tier map in `paige_config.stripe_price_tier_map`, updates `public.clients.tier`, enqueues bridge verb `tier_change_notify` to MMA OS via `mma_os_bridge_outbox`. Idempotent on `stripe_event_id`.

### GHL (3)
- `ghl-get-contacts` (admin only) → paginated read, optional `since` param.
- `ghl-send-email` (service-role; invoked by `send-message` fallback) → posts to Conversations API, writes audit row with `channel='email'`, `provider='ghl'`.
- `ghl-send-sms` (service-role) → same shape, `channel='sms'`.

### Gmail (3) — uses Lovable Google connector via connector gateway
- `gmail-list-messages` (admin) → `users/me/messages?q=…`.
- `gmail-send-message` (admin) → builds RFC2822, base64url encodes, `users/me/messages/send`, writes audit row with `provider='gmail'`.
- `gmail-get-thread` (admin) → `users/me/threads/{id}?format=full`.

### Telegram (1)
- `send-telegram` (service-role) → POST `bot{token}/sendMessage`; default chat = Antonio's `5188669161` when not provided.

### Zapier MCP (1)
- `call-zapier-action` (admin/service-role) → creates short-lived AI-SDK MCP client (`createMCPClient` over HTTP) for the chosen `paige_mcp_connections` row, calls `tools()`, invokes named action with payload, closes client. Caches `tools()` results in `tools_cache` for 10 minutes.

### Tavily (1)
- `web-search` (admin/service-role) → POST `https://api.tavily.com/search` with `{query, search_depth, max_results, include_answer:true}`; returns `{answer, results}`.

### LangSmith (1)
- `langsmith-recent-traces` (admin) → GET `/api/v1/runs?project=paige-agent-mma&limit=50` for the observability UI. (Tracing itself is wired in-process via `langsmith` SDK wrapping Anthropic/OpenAI clients in existing edge functions — see §3.)

---

## 3. LangSmith instrumentation

- Add `langsmith` (Deno-compatible via `npm:langsmith`) to existing AI edge functions (`paige-ai-chat`, any other Anthropic/OpenAI callers).
- Wrap clients with `wrapAnthropic` / `wrapOpenAI`. Env: `LANGSMITH_API_KEY`, `LANGSMITH_TRACING=true`, `LANGSMITH_PROJECT=paige-agent-mma`.
- Zero new tables; LangSmith hosts the traces.

---

## 4. Admin UI — routes & screens

All added under `/admin` (admin-only), lazy-loaded in `src/pages/Admin.tsx`, nav entries grouped under a new top-bar "Integrations" dropdown (cleaner than adding 6 top-level tabs).

| Route | Page | Purpose |
|---|---|---|
| `/admin/integrations` | `IntegrationsHub` | Tile grid: status badge per connector (n8n, Stripe, GHL, Gmail, Zapier, Telegram, Tavily, LangSmith) |
| `/admin/integrations/n8n` | `N8nConnectionsAdmin` | Manage connections, "Sync workflows" button, last sync info |
| `/admin/integrations/zapier` | `ZapierMcpAdmin` | List MCP connections, probe tools, enable/disable |
| `/admin/integrations/ghl` | `GhlAdmin` | PIT + Location ID form, "Pull contacts" action |
| `/admin/integrations/gmail` | `GmailAdmin` | OAuth status, send-as inbox, test send |
| `/admin/integrations/telegram` | `TelegramAdmin` | Bot token + admin chat ID, "Send test" |
| `/admin/integrations/tavily` | `TavilyAdmin` | Status + test query box |
| `/admin/revenue/subscriptions` | `SubscriptionsAdmin` | Live MRR card, recent events table from `paige_subscription_events`, churn alert list |
| `/admin/observability/ai-activity` | `AiActivityAdmin` | Recent LangSmith traces, cost/latency/preview |

Reuse Phase 1's `WorkflowsList` — it auto-fills once `n8n-list-workflows` runs.

---

## 5. Env var manifest

Add via Project Settings → Secrets (Antonio provides values):

```
LANGSMITH_API_KEY
LANGSMITH_PROJECT=paige-agent-mma   (set via set_secret, fixed value)
N8N_BASE_URL                         (or stored per-connection in table)
N8N_API_KEY
STRIPE_SECRET_KEY                    (via Lovable Stripe integration)
STRIPE_WEBHOOK_SECRET
GHL_PIT
GHL_LOCATION_ID=Y8F9ygRHQSJ3zJbkQXuW (set_secret, fixed)
TAVILY_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_DEFAULT_ADMIN_CHAT_ID=5188669161 (set_secret, fixed)
ZAPIER_MCP_URL
ZAPIER_MCP_TOKEN
```

Lovable native connectors enabled via the editor: **Stripe** (one-click) and **Google / Gmail** (OAuth). Stripe webhook URL to give Antonio: `https://<project-ref>.functions.supabase.co/handle-stripe-webhook`.

---

## 6. Clarifying questions for Antonio

1. **n8n connections** — single connection (`mrmogulmaker.app.n8n.cloud`) or should we support multiple from day one? Plan defaults to multi-row with one `is_default`.
2. **Stripe → tier mapping** — provide the `price_id → tier` map (e.g. Premium $44 → `premium`, VIP → `vip`) so the webhook can compute `tier_after`. Or should we read it from existing `subscription_plans`?
3. **GHL send path** — should `send-message` (Phase 1) prefer GHL or Resend/Twilio for the MMA cohort right now? Phase 1 plan said Resend/Twilio primary, GHL fallback — confirm that holds with GHL PIT live.
4. **Gmail send account** — confirm `mogulmakeracademy@gmail.com` is the only authorized sender; can other admins send-as it?
5. **Zapier MCP** — is this a hosted Zapier MCP server URL with a static bearer token (so we skip OAuth dance), or full OAuth/dynamic registration?
6. **LangSmith project** — confirm name `paige-agent-mma` (so I create it client-side correctly).
7. **Telegram alert routing** — only Antonio's chat for now, or also Tashia? Plan ships single default chat with optional per-event override.

---

## 7. Build sequence & estimates

| # | Connector | Why first | Est. |
|---|---|---|---|
| 1 | n8n API + sync | Lights up Phase 1 Workflows page | 0.5 day |
| 2 | Stripe webhook + subscriptions UI | Revenue truth, tier auto-flip | 0.75 day |
| 3 | GHL PIT (read + 2 send pipes) | Send-pipe stability for current cohort | 0.75 day |
| 4 | Zapier MCP client | Broad app reach | 0.5 day |
| 5 | LangSmith tracing + UI | Observability, set-and-forget | 0.5 day |
| 6 | Gmail (3 functions + UI) | Deliverability lane | 0.5 day |
| 7 | Telegram alerts | Backup channel for ops | 0.25 day |
| 8 | Tavily search | Reasoning enrichment | 0.25 day |

Total ≈ 4 working days. Each step is independently shippable behind the Integrations hub.

---

## 8. Technical notes / decisions baked in

- **MCP client lib**: `@ai-sdk/mcp` `createMCPClient` (HTTP transport, `redirect: "error"`), per AI-SDK guidance — not Cloudflare Agents.
- **Secrets at rest**: tokens stored via existing `_internal_secrets` row with `*_ref` pointer; tables expose only `*_last4` for UI.
- **Idempotency**: Stripe webhook uses `stripe_event_id` unique constraint; n8n trigger uses Phase 1's `paige_workflow_runs.id` as idempotency key already.
- **Bridge integration**: `tier_change_notify`, `query_supabase`, `get_member_360`, `get_workflow_status` get added to `_shared/mmaOsBridge.ts` `BridgeVerb` union, enqueued through existing `mma_os_bridge_outbox`.
- **GHL → audit**: every send writes `paige_messages_audit` with `provider`, `channel`, `external_id`, so the unified inbox stays correct regardless of pipe.
- **No SDKs in browser**: All provider keys stay in edge functions; the React admin UI only ever calls our own functions.

Antonio: please answer the 7 questions in §6 and approve the sequence. No code touches the repo until then.
