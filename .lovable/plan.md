## Phase 6: Paige Bridge (Reverse Direction)

A single Edge Function `paige-bridge` that lets MMA OS + n8n push data INTO Paige, mirroring the existing MMA OS bridge. Plus a new admin-notifications surface and a bell badge in the admin header.

---

### 1. Secret

- New runtime secret: `PAIGE_BRIDGE_API_KEY` — Antonio adds in Project Settings → Secrets after plan approval. Same value also goes on MMA OS Supabase + as an n8n credential.

### 2. Migration — single migration, four parts

**a. Status enum widening on `paige_pending_approvals.status`**
- Drop the existing CHECK and re-add to also allow `'stale'` (the spec's `update_pending_approval` example calls out "mark stale").

**b. Type enum widening on `paige_pending_approvals.type`**
- Same pattern; add `'qc_finding'` and `'milestone'` to support upstream verbs (notify_admin can also funnel through, but approvals need richer types).

**c. New table `public.paige_admin_notifications`**

```
id              uuid pk default gen_random_uuid()
severity        text check in ('info','warning','urgent') not null default 'info'
title           text not null
body            text
link_to         text
source_workflow_key text
contact_id      uuid references clients(id) on delete set null
read_at         timestamptz
created_at      timestamptz not null default now()
```

Standard four-step structure: CREATE → GRANT (SELECT/INSERT/UPDATE to authenticated; ALL to service_role; no anon) → ENABLE RLS → POLICIES (admins & coaches SELECT/UPDATE; service_role bypasses for inserts from the Edge Function). Add `idx_paige_admin_notifications_unread` partial index `WHERE read_at IS NULL`. Add to `supabase_realtime` publication so the bell badge updates live.

**d. RPC `get_approval_queue_counts()`** — security-definer function that returns `{ pending int, by_type jsonb }` so the verb can return it cheaply without granting broad read on the table to the bridge path (bridge uses service role anyway, but this keeps the verb's query body tight).

### 3. Edge Function — `supabase/functions/paige-bridge/index.ts`

- `verify_jwt = false` block in `supabase/config.toml`.
- Bearer auth: read `Authorization: Bearer <token>` → constant-time compare against `PAIGE_BRIDGE_API_KEY`. Reject with 401 otherwise.
- Use `SUPABASE_SERVICE_ROLE_KEY` client (bypasses RLS — required since callers are server-to-server with no JWT).
- CORS: respond to OPTIONS with `corsHeaders` from `npm:@supabase/supabase-js@2/cors`.
- Body schema validated via Zod: `{ verb: string, payload: object }`. Each verb has its own Zod schema applied inside the switch.
- Switch on `verb`:

| Verb | Action | Notes |
|---|---|---|
| `health_check` | returns `{status:'ok', version:1, timestamp}` | no payload |
| `create_pending_approval` | insert into `paige_pending_approvals` | resolves `contact_id` from `contact_email` if id not provided (lookup in clients); returns `{id, created_at, status}` |
| `update_pending_approval` | update by id; restrict fields to `status`, `metadata` (note: there is no `metadata` column today — store under `escalation_note` only if status='escalated', otherwise ignore metadata silently and document the limitation) | returns updated row |
| `create_workflow_run` | resolve `registry_id` via `registry_key`; insert run with `triggered_by_user_id=null` (system); status defaults to 'queued' or 'running' | returns `{id}` |
| `update_workflow_run` | update by id; status/result/error/completed_at | returns updated row |
| `log_message_send` | insert into `paige_messages_audit` (map `to`→`to_address`, `from`→`from_address`) | returns `{id}` |
| `upsert_contact_mirror` | upsert into `clients` keyed on lowercased `email`; sets `created_by` to a system sentinel uuid (see open question below); split full names if only one provided | returns `{client_id, action}` |
| `notify_admin` | insert into `paige_admin_notifications` | returns `{id}` |
| `read_config` | select from `paige_config` (single row table); if `key` provided return that field | read-only |
| `get_approval_queue_count` | calls the RPC above | returns `{pending, by_type}` |

- Every verb wrapped in try/catch returning `{ok:false, verb, error}` with 400/500; success returns `{ok:true, verb, data}`.
- Structured `console.log` per call: `verb`, `ok`, `duration_ms`. Never log payload bodies (PII).

### 4. Frontend

**a. New page `src/pages/admin/AdminNotifications.tsx`**
- Route: `/admin/notifications` (add to `src/App.tsx` admin routes block).
- List view: severity badge, title, body, relative timestamp, optional `link_to`, "Mark read" / "Mark all read" actions.
- Tabs: Unread / All. Filter by severity.
- Realtime: subscribe to `paige_admin_notifications` INSERT/UPDATE inside `useEffect`, cleanup on unmount.

**b. Bell badge in `src/components/admin/AdminLayout.tsx` header**
- New `<NotificationsBell />` component near the existing top-right cluster.
- Query unread count on mount; subscribe via Realtime; show numeric badge if >0.
- Click → navigates to `/admin/notifications`.
- Toast (existing sonner) on new unread INSERT when severity is `warning` or `urgent`.

### 5. Doctrine

Append §91 to the in-repo doctrine note (memory). No code change required beyond memory update.

---

### Out of scope (intentional)

- The MMA OS side helper (`callPaigeBridge`) and the `mirror_to_paige_inbox` verb — Claude's deliverable per the spec.
- Updating n8n CS Triage workflow — Claude's deliverable.
- Adding a `metadata` JSONB column to `paige_pending_approvals` — flagged below as an open question; not changing schema unilaterally.

---

### Open questions / flagged concerns

1. **`metadata` field on approvals.** Spec's `create_pending_approval` and `update_pending_approval` accept `metadata`, but the table has no such column. Two options:
   - **A (recommended):** add `metadata jsonb default '{}'` in the same Phase 6 migration. Cleanest, future-proof.
   - **B:** silently drop the field. Lossy and surprising.
   - Going with **A** unless you say otherwise.

2. **`upsert_contact_mirror` and `created_by`.** `clients.created_by` is `NOT NULL` and references `auth.users`. For a system-mirrored contact there is no human creator. Plan: reuse Antonio's owner user id (already used as the platform owner sentinel elsewhere). Confirm OK, or I can create a dedicated `system@paigeagent.ai` auth user as a sentinel.

3. **`create_workflow_run` and `triggered_by_user_id`.** Existing RLS INSERT policy requires `triggered_by_user_id = auth.uid()`. Bridge uses service role so it bypasses RLS — fine. But the SELECT policies will hide system-triggered rows from coaches (admins still see all). I'll leave the SELECT policies as-is so the Workflows UI for admins shows everything; coaches still only see runs they triggered themselves. Confirm acceptable.

4. **`notify_admin` recipient model.** Notifications are global to all admins (no `user_id` column per the spec). Read state is also global — first admin to mark read marks it for everyone. If you want per-admin read state, say so and I'll add a join table; otherwise shipping as spec'd.

5. **Rate limiting.** Bearer-auth-only is fine for trusted server callers, but `paige-bridge` is internet-exposed. Plan: add a coarse per-IP rate limiter via existing `api_rate_limits` table (e.g. 600 req/min) and reject 429 over the limit. Low-risk to include in v1.

---

### Build sequence after approval

1. Run the migration (table + enum widening + RPC + realtime publication).
2. Write the Edge Function with all 10 verbs + Zod schemas.
3. Add `config.toml` block for `verify_jwt = false`.
4. Build `AdminNotifications.tsx` page + route.
5. Build `NotificationsBell` and wire into `AdminLayout.tsx`.
6. Type-check clean, confirm health_check via `curl`, hand off to Antonio for `PAIGE_BRIDGE_API_KEY` secret + MMA OS-side wiring.
