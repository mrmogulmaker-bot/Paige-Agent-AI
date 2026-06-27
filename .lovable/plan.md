
# Paige Becomes the OS — Phase 1 Plan

Additive-only. No changes to auth, billing, BTF cohort, coach assignments, or dashboard. Builds on existing patterns: `_shared/mmaOsBridge.ts` for bridge calls, `clients` as contact source, `user_roles` + `has_role()` for admin gating, Supabase Realtime for live UI, shadcn + Tailwind for screens.

Open clarifications are at the end — none are blocking; reasonable defaults are stated inline.

---

## 1. Database — 5 new tables

All in `public`. Standard four-step structure (CREATE → GRANT → ENABLE RLS → POLICY). Every table gets `created_at`/`updated_at` + trigger. `contact_id` everywhere is `uuid REFERENCES public.clients(id) ON DELETE SET NULL` (Paige's canonical contact table — there is no `paige_contacts`; flag below).

### 1a. `paige_conversations`
Columns: `id uuid pk`, `channel text check in ('email','sms','chat')`, `contact_id uuid → clients(id)`, `direction text check in ('inbound','outbound')`, `subject text`, `body text not null`, `source_message_id text` (vendor id; unique per channel), `status text default 'new' check in ('new','triaged','replied','closed')`, `metadata jsonb default '{}'`, timestamps.

Indexes: `(contact_id, created_at desc)`, `(status) where status='new'`, `unique (channel, source_message_id) where source_message_id is not null` (idempotency for webhook replays).

RLS: admin/coach full read+write via `has_role()`; service_role bypass for edge functions. No anon. No end-user policy in Phase 1.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_conversations`.

### 1b. `paige_messages_audit`
Columns: `id uuid pk`, `channel text check in ('email','sms')`, `pipe_used text check in ('resend','twilio','ghl_fallback')`, `to_address text`, `from_address text`, `subject text`, `body text`, `status text check in ('queued','sent','failed','bounced')`, `vendor_message_id text`, `error text`, `contact_id uuid`, `conversation_id uuid → paige_conversations(id)`, `sent_at timestamptz`, timestamps.

Indexes: `(conversation_id, sent_at desc)`, `(contact_id, sent_at desc)`, `(status) where status='failed'`.

RLS: admin/coach read; service_role write. No client writes (only edge function writes).

### 1c. `paige_config` (singleton)
Columns: `id int pk default 1 check (id = 1)`, `twilio_a2p_status text default 'pending' check in ('pending','approved','rejected')`, `resend_domain_verified bool default false`, `ghl_fallback_enabled bool default true`, `default_from_email text`, `default_from_sms_number text`, `updated_by uuid`, timestamps. Seed row on migration.

RLS: admin read+write; authenticated read (so dispatch helpers can read flags without service role).

### 1d. `paige_workflow_registry`
Columns: `id uuid pk`, `key text unique not null`, `label text not null`, `description text`, `category text check in ('campaign','customer_support','admin','analytics')`, `n8n_workflow_id text`, `n8n_webhook_url text not null`, `parameters_schema jsonb default '{}'` (JSON Schema, used to render form), `requires_approval bool default false`, `is_active bool default true`, timestamps.

Indexes: `(category, is_active)`.
RLS: admin read+write only.

### 1e. `paige_workflow_runs`
Columns: `id uuid pk`, `registry_id uuid → paige_workflow_registry(id)`, `triggered_by_user_id uuid → auth.users(id)`, `payload jsonb`, `status text default 'queued' check in ('queued','running','completed','failed')`, `n8n_execution_id text`, `result jsonb`, `error text`, `triggered_at timestamptz default now()`, `completed_at timestamptz`, timestamps.

Indexes: `(registry_id, triggered_at desc)`, `(triggered_by_user_id, triggered_at desc)`.
RLS: admin read all; coach read own runs; service_role write (for status callbacks from n8n).

### 1f. `paige_pending_approvals`
Columns: `id uuid pk`, `type text check in ('cs_draft','campaign_send','tier_change','other')`, `draft_content jsonb not null`, `contact_id uuid → clients(id)`, `conversation_id uuid → paige_conversations(id)`, `created_by_n8n_workflow_key text`, `status text default 'pending' check in ('pending','approved','edited','skipped','escalated')`, `reviewed_by_user_id uuid → auth.users(id)`, `escalation_note text`, `sent_message_audit_id uuid → paige_messages_audit(id)`, `reviewed_at timestamptz`, `sent_at timestamptz`, timestamps.

Indexes: `(status, created_at desc)`, `(type, status)`.
RLS: admin/coach read+write; service_role write (n8n inserts via bridge).
Realtime: enabled (drives the approval inbox).

GRANTs on every table: `service_role` ALL; `authenticated` SELECT/INSERT/UPDATE/DELETE scoped by RLS. No anon grants.

---

## 2. Edge Functions

All in `supabase/functions/<name>/index.ts`, CORS handled, reuse `_shared/mmaOsBridge.ts` for any bridge call.

### 2a. `handle-inbound-email` (verify_jwt = false)
- Receives Resend inbound webhook (`https://.../functions/v1/handle-inbound-email`).
- Verify Resend signing secret header (`svix-id`, `svix-timestamp`, `svix-signature`) using `RESEND_WEBHOOK_SECRET`.
- Parse `from`, `to`, `subject`, `text`/`html`, `message_id`.
- Lookup `contact_id` by email in `clients`; create stub contact if not found (lifecycle `lead`, source `inbound_email`).
- Insert `paige_conversations` (channel=email, direction=inbound, source_message_id=message_id). On unique violation → already processed, 200 OK.
- `fireAndForgetBridge('customer_support_intake', { conversation_id, contact_email, channel:'email', body, subject })`.
- 200 JSON `{ok:true, conversation_id}`.

### 2b. `handle-inbound-sms` (verify_jwt = false)
- Receives Twilio inbound webhook (form-encoded).
- Verify `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN` per Twilio spec.
- Handle STOP/START/HELP keywords inline (mirror existing `twilio-inbound-webhook` behavior — return TwiML, do NOT create conversation row for keywords).
- Otherwise lookup `contact_id` by `sms_phone_number` in `communication_preferences`, fall back to `clients.phone`. Create stub contact if missing.
- Insert `paige_conversations` (channel=sms, source_message_id=`MessageSid`).
- `fireAndForgetBridge('customer_support_intake', ...)`.
- Return empty TwiML 200.

### 2c. `send-message` (verify_jwt = true)
Body schema (zod):
```
{ channel: 'email'|'sms', to: string, subject?: string, body: string,
  contact_id?: uuid, conversation_id?: uuid, in_reply_to?: string,
  approval_id?: uuid }
```
- Validate caller is admin/coach via `has_role()` (RPC).
- Read `paige_config`.
- email → Resend API (using `RESEND_API_KEY`, `from = default_from_email`). Set `In-Reply-To` if provided.
- sms → if `twilio_a2p_status='approved'` AND `to` not in suppression → Twilio via gateway; else if `ghl_fallback_enabled` → `callMmaOsBridge('ghl_send_sms_fallback', {...})`; else 503.
- Insert `paige_messages_audit` row (pipe_used, vendor_message_id, status).
- If `conversation_id` provided → insert mirror `paige_conversations` row (direction=outbound) and update parent status='replied'.
- If `approval_id` provided → update `paige_pending_approvals` (status, sent_at, sent_message_audit_id).
- Returns `{ audit_id, vendor_message_id, pipe_used }`.

### 2d. `trigger-workflow` (verify_jwt = true)
Body: `{ registry_key: string, payload: object }`.
- Admin/coach check.
- Load `paige_workflow_registry` row; validate `payload` against `parameters_schema` (Ajv).
- Insert `paige_workflow_runs` (status=queued).
- POST `payload` + `{run_id, triggered_by}` to `n8n_webhook_url` (5s timeout, single attempt — n8n is idempotent on run_id).
- On 2xx → update run status='running', capture `n8n_execution_id` if returned.
- On non-2xx → status='failed', error captured. Return 200 with run row either way.
- Returns `{ run_id, status }`.

Optional follow-up endpoint `workflow-run-callback` (verify_jwt = false, HMAC-signed) lets n8n PATCH the run row on completion. Worth including in Phase 1 so the runs page shows real completion state.

`supabase/config.toml` additions: `handle-inbound-email` and `handle-inbound-sms` (and `workflow-run-callback` if shipped) get `verify_jwt = false`. Others default.

Secrets needed (ask user to add in Project Settings → Secrets if missing): `RESEND_API_KEY` ✓, `RESEND_WEBHOOK_SECRET` (new), `TWILIO_API_KEY` ✓, `TWILIO_AUTH_TOKEN` (new — for signature verify), `MMA_OS_BRIDGE_URL` ✓, `MMA_OS_BRIDGE_API_KEY` ✓, `N8N_CALLBACK_SECRET` (new, only if shipping callback).

---

## 3. UI — new admin routes + nav

Add two top-level items to `AdminLayout` top nav: **Workflows** and **Approvals** (Approvals shows a live unread badge from `paige_pending_approvals where status='pending'`).

### Routes (all under `/admin`)
- `/admin/workflows` → `WorkflowsList.tsx`
  - Grouped accordion by category. Each card: label, description, "Run" → opens detail.
  - Top-right: "Recent runs" link.
- `/admin/workflows/:key` → `WorkflowDetail.tsx`
  - Auto-rendered form from `parameters_schema` (use `@rjsf/core` + shadcn theme, or a small custom JSON-Schema → shadcn renderer if we want to avoid the dep).
  - Run button → calls `trigger-workflow` → toasts + appends to run history table below.
- `/admin/workflows/runs/:id` → `WorkflowRunDetail.tsx`
  - Payload (collapsible JSON), status badge, n8n execution link (if URL pattern available), result JSON, error.
- `/admin/approvals` → `ApprovalsInbox.tsx`
  - Realtime list of `status='pending'`, sortable by created_at/type, filter by type.
  - Row click → detail.
- `/admin/approvals/:id` → `ApprovalDetail.tsx`
  - Renders draft (email or SMS preview), shows linked conversation thread (latest 5 messages from `paige_conversations` for the contact), contact summary card.
  - Actions: **Approve & Send** | **Edit & Send** (opens body/subject editors) | **Skip** | **Escalate** (with note textarea).
  - Approve/Edit & Send → call `send-message` with `approval_id`; on success show audit link.

Shared:
- `useRealtimePendingApprovals()` hook (channel-per-mount, cleanup on unmount — per the realtime rule).
- `paige_config` editor lives inside existing `AdminSettingsHub` → new "Platform Pipes" tab (flags + default sender fields). No new top-level page needed.

---

## 4. Build sequence (incremental value)

Each step is independently deployable.

1. **Migration 1** — all 5 tables + RLS + GRANTs + realtime publication + `paige_config` seed row. (DB foundation, no UI risk.)
2. **`send-message` Edge Function** + `paige_config` editor in `AdminSettingsHub`. Manual smoke test via curl. Immediate value: one unified send pipe for any future feature.
3. **`handle-inbound-email` + `handle-inbound-sms`** — wires real inbound traffic into `paige_conversations`. Coordinate webhook URLs with Resend + Twilio consoles.
4. **Approvals UI** (`/admin/approvals` + detail). At this point CS Triage from n8n can write to `paige_pending_approvals` and a human can Approve & Send end-to-end. This is the headline unlock.
5. **Workflows registry + Command Center UI** (`trigger-workflow` + 3 pages). Seed registry from CSV when MMA OS sends it.
6. **`workflow-run-callback`** (optional) for live run status.

Estimate: Steps 1–4 are the critical path for "replace Telegram approve/send." Step 5 replaces `/commands`. Step 6 is polish.

---

## 5. Clarifying questions for Antonio

1. **Contact table name.** Brief says `paige_contacts (fk)`, but the canonical contact table in this project is `public.clients`. Assuming FK targets `clients(id)` and we treat "paige_contacts" as a naming alias going forward. Confirm — or do you want a new `paige_contacts` table created and dual-write? Recommend: stick with `clients`.
2. **Inbound contact creation.** When an inbound email/SMS arrives from an unknown sender, create a stub `clients` row (lifecycle=`lead`, source=`inbound_email`/`inbound_sms`) — OK? Or hold message unlinked until manually associated?
3. **Approval visibility.** Admin-only, or admin + coach? Default is admin + coach (matches existing CRM gating). If approvals are sensitive (e.g., tier changes), we can scope `type='tier_change'` to admin only.
4. **`trigger-workflow` auth.** Admin + coach, or admin only? Defaulting to admin + coach for parity with workflow visibility.
5. **n8n run callback.** Want the optional `workflow-run-callback` shipped in Phase 1 so runs show live completion state? Otherwise the runs page stays at "running" until manually refreshed against n8n.
6. **JSON-Schema form renderer.** OK to add `@rjsf/core` + `@rjsf/validator-ajv8` (~80kb gz) for the workflow parameter forms, or prefer a hand-rolled minimal renderer (supports string/number/bool/enum only)?
7. **Twilio signature verification.** Need `TWILIO_AUTH_TOKEN` secret added (separate from the API key used for sending) so we can verify `X-Twilio-Signature` on inbound webhooks. Confirm you can add it.
8. **Resend inbound secret.** Need `RESEND_WEBHOOK_SECRET` from the Resend dashboard for Svix-style signature verification on inbound emails. Confirm you can add it.
9. **GHL fallback verbs.** Confirmed `ghl_send_sms_fallback` and `ghl_send_email_fallback` are/will be live on the bridge — should `send-message` also route email through `ghl_send_email_fallback` when `resend_domain_verified=false`, or always Resend for email?
10. **Seed CSV for `paige_workflow_registry`** — confirmed coming in a follow-up; we'll ship Step 5 against an empty registry and load the CSV when it arrives.

---

Approve and I'll start with Step 1 (migration).
