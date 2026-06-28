## Wave 3 — RLS Hybrid Visibility + SLA Watcher + Round-Robin (inert)

### Answers to your three questions
1. **`claim_client` race control:** use a **partial unique index** `(contact_id, assigned_role) WHERE active AND assigned_role='sales_rep'` combined with `INSERT … ON CONFLICT DO NOTHING` inside the RPC, returning the resulting row. Cleaner than `FOR UPDATE`, matches our existing upsert patterns in `paige-bridge`, and is the same constraint shape used by `cs_primary` assignment trigger. We already have a non-partial unique on `(contact_id, assigned_role)` from Wave 1 — Wave 3 keeps that and the RPC just leans on it.
2. **`pg_net`:** confirmed enabled on Paige (`pg_cron` + `pg_net` both present). No CREATE EXTENSION needed.
3. **`set_assignment_policy` bridge verb:** **yes, ship it.** Trivial to add, matches Doctrine §91 (one bridge, verb-routed), and keeps Antonio out of SQL.

---

### 1. Migration — RLS rewrite (hybrid sales/cs model)

**Helper functions (SECURITY DEFINER, search_path=public):**
- `is_assigned_to_client(_user uuid, _client uuid, _role text default null) returns boolean` — checks `paige_coach_assignments` active row.
- `client_has_role_assigned(_client uuid, _role text) returns boolean` — used for "pool" detection (no sales_rep currently assigned).
- `current_user_tier_pool(_role app_role) returns text[]` — returns the tier array for a role (sales_rep → `{lead,standard}`, cs_rep → `{standard,premium,vip,internal}`).

**Replace `clients` policies** with role-scoped set:
- `admins_full` — `has_any_role(auth.uid(), ARRAY['admin','super_admin'])` → ALL.
- `coaches_assigned_only` — `has_role(auth.uid(),'coach') AND is_assigned_to_client(auth.uid(), id, 'coach')` → ALL (preserves existing coach behavior).
- `sales_rep_full_on_assigned` — `has_role(auth.uid(),'sales_rep') AND is_assigned_to_client(auth.uid(), id, 'sales_rep')` → ALL.
- `sales_rep_pool_read` — sales_rep AND `tier = ANY('{lead,standard}')` AND `NOT client_has_role_assigned(id,'sales_rep')` → SELECT.
- `sales_rep_peer_read` — sales_rep AND `tier = ANY('{lead,standard}')` → SELECT (covers peer same-tier visibility).
- `cs_rep_full_on_assigned` / `cs_rep_pool_read` / `cs_rep_peer_read` — same pattern over `{standard,premium,vip,internal}` and `cs_primary` role.
- `finance_read_all` — `has_role(auth.uid(),'finance')` → SELECT.
- `viewer_read_all` — `has_role(auth.uid(),'viewer')` → SELECT.

Mirror the same hybrid pattern (read scoped to assignment or tier pool, full edit only when assigned) on `paige_coach_assignments` reads so reps see who else is on their accounts.

**`claim_client(_client_id uuid)` RPC** (SECURITY DEFINER):
- Verify caller has `sales_rep` (or `cs_rep` variant — same RPC handles both via role detection).
- Verify client tier is in caller's pool array.
- `INSERT INTO paige_coach_assignments(contact_id, assigned_role, rep_user_id, assigned_user_id, active, metadata) VALUES (..., auth.uid(), auth.uid(), true, jsonb_build_object('source','self_claim')) ON CONFLICT (contact_id, assigned_role) DO NOTHING RETURNING *;`
- If `NOT FOUND` → raise `claim_race_lost` (client was claimed in the gap). Frontend treats as "someone got it first, refresh queue".

### 2. SLA watcher (cron + dedupe + Telegram via bridge)

**New table `paige_sla_alert_log`** — `(client_id, category, severity, sent_at)` with unique partial index `(client_id, category, severity) WHERE sent_at > now() - interval '24 hours'` for dedupe.

**Edge function `sla-watcher`** (verify_jwt=false, bearer-protected via shared CRON secret):
- Query `paige_unassigned_queue` view (Wave 2).
- Bucket by tier thresholds: vip > 6h critical, premium > 24h warning, standard > 72h low; skip leads.
- For each row, skip if a `paige_admin_notifications` row exists with same `(contact_id, source_workflow_key='unassigned_sla', severity)` in last 24h **or** `paige_sla_alert_log` shows recent send.
- For survivors: POST to `https://slcqeiqcrhepicqxqjng.supabase.co/functions/v1/mma-os-bridge` with `verb='push_admin_notification'` body shape you provided, bearer `MMA_OS_BRIDGE_API_KEY`.
- Also insert local `paige_admin_notifications` row (scope='admin', severity, link_to=`/admin/contacts/{id}`) so the AdminBridgeBell drawer reflects it.
- Insert `paige_sla_alert_log` row.

**pg_cron job** every 30 min calling the function via `net.http_post` with bearer `SLA_WATCHER_CRON_SECRET` (generate). Job SQL ships via `supabase--insert` (per scheduling guidance — contains URL/keys).

### 3. Round-robin (inert by default)

**Table `paige_assignment_policy`:**
```
tier text PRIMARY KEY,
strategy text NOT NULL DEFAULT 'manual' CHECK (strategy IN ('manual','round_robin','load_balanced')),
eligible_user_ids uuid[] NOT NULL DEFAULT '{}',
target_role text NOT NULL DEFAULT 'sales_rep' CHECK (target_role IN ('sales_rep','cs_primary')),
updated_at timestamptz DEFAULT now()
```
Grants: `service_role` ALL; `authenticated` SELECT only when `is_staff()`. Seed one row per tier with `strategy='manual'`.

**Trigger `trg_clients_round_robin`** AFTER INSERT on `clients` (fires after existing `auto_assign_on_mirror`):
- Skip if a matching assignment already exists for `policy.target_role`.
- Load policy; bail if `strategy='manual'` or `eligible_user_ids` empty.
- For `round_robin`: pick user from `eligible_user_ids` with fewest active assignments for that role (single SELECT … ORDER BY count ASC LIMIT 1).
- `load_balanced` deferred — branch stub raises notice and falls back to round_robin.
- Insert assignment with `metadata->>'source'='round_robin'`.

### 4. Bridge v16 — new verbs in `paige-bridge`

- `set_assignment_policy { tier, strategy, eligible_user_ids[], target_role? }` → upsert into `paige_assignment_policy`.
- `get_assignment_policy { tier? }` → returns rows.
- `claim_client_for_user { client_email, user_email, assigned_role }` → admin/MMA OS escape hatch that wraps the RPC bypassing self-only check.

### 5. Tiny RPC for UI later (not building UI this wave)

`unassigned_queue_for_role(_role text)` returns rows from `paige_unassigned_queue` filtered to caller's tier pool. Frontend will consume in next wave.

---

### Technical notes / risks

- Policy explosion on `clients` is intentional and matches Doctrine §96. Using helper functions keeps each USING expression short and avoids the recursion trap (no policy references `clients`).
- `is_assigned_to_client` reads `paige_coach_assignments` only — safe under RLS because it's SECURITY DEFINER.
- The `peer_read` policy intentionally lets a sales rep see another rep's `{lead,standard}` clients (per your hybrid spec). If that turns out to be too leaky we can drop just that policy without touching the rest.
- SLA watcher writes BOTH to MMA OS bridge (Telegram fan-out) AND local `paige_admin_notifications` so the in-app bell stays consistent — single source of truth for "did we already alert" is the local table + `paige_sla_alert_log`.
- All new tables get `GRANT` blocks per platform rule; `paige_sla_alert_log` is service_role only (no `authenticated` grant).

### What ships this wave
1 migration (RLS rewrite + claim RPC + policy table + round-robin trigger + sla_alert_log).
1 edge function (`sla-watcher`).
1 bridge update (`paige-bridge` v16 with 3 new verbs).
1 pg_cron schedule insert (via `supabase--insert` since it carries URL+secret).
1 secret to generate: `SLA_WATCHER_CRON_SECRET`. Need confirmed: `MMA_OS_BRIDGE_API_KEY` already in secrets (will check before deploy).

No UI changes this wave per your scope note — sales rep dashboard / CS queue / portal land in Wave 4.
