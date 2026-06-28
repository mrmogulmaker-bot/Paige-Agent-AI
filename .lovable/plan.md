
# Phase 8 — Paige as Team OS (Doctrine §96)

Transform Paige from Antonio's solo cockpit into the multi-rep command center. Every surface becomes role-aware and assignment-scoped. GHL is demoted to backend send pipe.

## Assumptions (flag if wrong)

- `app_role` enum currently has `admin`, `coach`, `user`. We'll extend it rather than create a parallel `paige_user_roles` table — the existing `user_roles` table + `has_role()` SECURITY DEFINER function is the canonical pattern in this codebase and avoids two competing role systems.
- `paige_coach_assignments` (Wave 3) already has `role` column we can repurpose for the assignment-role enum.
- Antonio's `mrmogulmaker@gmail.com` becomes `super_admin`; existing admins stay `admin`.
- "Conversations" surface = `paige_conversations` table (already exists).
- Existing `audit_logs` table is too generic / used elsewhere — we add the new `paige_audit_log` as spec'd for rep-action telemetry specifically.

---

## Wave 1 — Role & Assignment Foundation (DDL only)

### 1.1 Extend app_role enum

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_rep';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cs_rep';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
-- 'admin' and 'coach' already exist
```

Add helper RPCs:
- `public.has_any_role(_user_id uuid, _roles app_role[]) returns boolean` (SECURITY DEFINER)
- `public.is_staff(_user_id uuid) returns boolean` — true for admin/super_admin/sales_rep/cs_rep/coach/finance
- `public.current_user_roles() returns app_role[]` — for client-side role gating

### 1.2 Extend paige_coach_assignments

```sql
-- expand role enum (currently free-form text)
ALTER TABLE paige_coach_assignments
  ADD COLUMN IF NOT EXISTS assigned_role text
    CHECK (assigned_role IN (
      'lead_owner','cs_primary','coach_btf','coach_dfy',
      'coach_vip','capital_strategist','coach' -- legacy
    ));
-- backfill assigned_role from existing role column, then drop/rename if needed
```

Rename table mentally to "contact assignments" but keep physical name for compatibility.

### 1.3 Assignment fields on existing tables

```sql
ALTER TABLE paige_pending_approvals
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS visible_to_roles text[] DEFAULT ARRAY['admin','super_admin'];

ALTER TABLE paige_admin_notifications
  ADD COLUMN IF NOT EXISTS assigned_role text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS scope text DEFAULT 'admin'
    CHECK (scope IN ('admin','assigned_user','role'));

ALTER TABLE paige_workflow_registry
  ADD COLUMN IF NOT EXISTS allowed_roles text[] DEFAULT ARRAY['admin','super_admin'];

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_owner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cs_primary_user_id uuid REFERENCES auth.users(id);
-- assigned_coach_user_id already exists; these are denormalized for fast filtering
```

Trigger: when `paige_coach_assignments` inserts/updates, sync the denormalized fields on `clients` for the matching role.

### 1.4 Audit log

```sql
CREATE TABLE public.paige_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  actor_role text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.paige_audit_log TO authenticated;
GRANT ALL ON public.paige_audit_log TO service_role;
ALTER TABLE public.paige_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff insert own actions" ON public.paige_audit_log
  FOR INSERT TO authenticated WITH CHECK (actor_user_id = auth.uid());
CREATE POLICY "Admins read all" ON public.paige_audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
CREATE POLICY "Users read own actions" ON public.paige_audit_log
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid());
CREATE INDEX ON paige_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX ON paige_audit_log (actor_user_id, created_at DESC);
```

### 1.5 RLS rewrites (scoped policies)

Rewrite policies on these tables to use role+assignment matrix:
- `paige_pending_approvals` — visible if admin/super_admin OR `assigned_to_user_id = auth.uid()` OR role in `visible_to_roles`
- `paige_admin_notifications` — visible per `scope` column
- `paige_workflow_registry` — selectable if any role in `allowed_roles` matches caller
- `clients` — extend existing policy to allow sales_rep/cs_rep when assigned

Use a new SECURITY DEFINER helper `public.can_access_contact(_user_id uuid, _contact_id uuid)` to centralize the check.

---

## Wave 2 — Edge Functions & Bridge

### 2.1 paige-bridge v15 additions
Add 4 verbs to `supabase/functions/paige-bridge/index.ts`:
- `assign_contact_to_rep` — input `{contact_email, rep_email, assigned_role}` → upsert into `paige_coach_assignments`, sync denormalized columns, emit audit
- `list_assignments_for_rep` — input `{rep_email}` → returns array of `{contact_id, contact_email, assigned_role, assigned_at}`
- `route_notification` — extend existing notify_admin: accept `scope`, `assigned_user_id` (or `assigned_user_email`), `assigned_role`
- `audit_log_write` — input `{actor_email, action, target_type, target_id, payload}` → insert row

All verbs: Zod schema, email-to-uuid resolution helper, audit on success.

### 2.2 Workflow trigger authorization
`supabase/functions/trigger-workflow/index.ts` (or wherever workflows fire): before exec, check `has_any_role(auth.uid(), registry.allowed_roles)`. Reject 403 + audit `workflow_blocked`.

### 2.3 Auto-assignment hook
When `mirror_cs_draft_to_paige` creates an approval, resolve contact → look up `cs_primary` from `paige_coach_assignments` → set `assigned_to_user_id`. Fall back to NULL (unassigned queue).

---

## Wave 3 — User Management UI

`src/pages/admin/UserManagement.tsx` (under AdminSettingsHub → "Team & Roles" tab, extending existing one):
- Table: email, full_name, roles (multi-badge), assigned_contact_count, last_active, status
- "Invite User" dialog → calls existing `admin-invite-user` edge function, extended to accept `roles: app_role[]` (multi-select)
- Row actions: Change roles (multi-select), Deactivate (calls `admin-force-signout` + role removal), Link to coach `clients` row
- "Assignments" sub-drawer per user: list of contacts they own, with role badges and "Reassign" button

Extend `admin-invite-user` edge function to accept array of roles and write all rows to `user_roles`.

---

## Wave 4 — Per-Rep Workspace Pages

New pages, all gated by `has_any_role([admin, super_admin, sales_rep, cs_rep, coach, finance])`:

| Route | Component | Description |
|---|---|---|
| `/admin/my-day` | `MyDay.tsx` | Personalized landing: counts of my approvals, hot leads, today's bookings, unread notifications, last 5 audit events |
| `/admin/my-leads` | `MyLeads.tsx` | Kanban scoped to `lead_owner_user_id = me`. Reuses existing PipelineAdmin kanban with a "scope=mine" filter |
| `/admin/my-conversations` | `MyConversations.tsx` | Inbox of `paige_conversations` where `cs_primary_user_id = me`. Click → existing conversation view |
| `/admin/my-clients` | `MyClients.tsx` | For coaches: assigned clients with health score, last interaction, journey jump-link |
| `/admin/audit-log` | `AuditLog.tsx` | Admin-only. Filterable by actor, action, target_type, date range |

Admin "All" variants are the existing pages (`/admin/contacts`, `/admin/pipeline`, etc.) — no duplication, just add a "Scope: Mine | Assigned to my team | All" segmented control where appropriate.

### 4.1 Role-aware navigation
Update `AdminLayout.tsx` top bar:
- `super_admin` / `admin`: full nav
- `sales_rep`: My Day, My Leads, Contacts (assigned), Pipeline (mine)
- `cs_rep`: My Day, My Conversations, Approvals (assigned), Contacts
- `coach`: My Day, My Clients, Journey, Approvals (assigned)
- `finance`: My Day, Subscriptions, Revenue, Stripe
- `viewer`: My Day (read-only), Analytics dashboards only

Role state from a new `useCurrentUserRoles()` hook (cached, queries `user_roles`).

---

## Wave 5 — Notification & Approval Filtering

### 5.1 AdminBridgeBell update
Query filter: `scope = 'admin' OR (scope = 'assigned_user' AND assigned_user_id = me) OR (scope = 'role' AND assigned_role = ANY(my_roles))`.
Separate "All" tab for admins to peek at the firehose.

### 5.2 ApprovalsInbox update
Default filter: assigned to me OR unassigned + I'm admin/cs_rep. Add "Scope" pill: Mine / Unassigned / All (admin).
Show assigned-user avatar on each row. Reassign action (admin/super_admin only).

### 5.3 Workflow page update
`WorkflowsList.tsx`: filter rows by `allowed_roles && my_roles`. Trigger button disabled with tooltip if not allowed.

---

## Wave 6 — Audit Trail Wiring

Insert audit row from every state-changing client action:
- Approval approve/reject → `approval_approved` / `approval_rejected`
- Workflow trigger → `workflow_triggered`
- Contact reassign → `contact_reassigned`
- Message send (when we wire send) → `message_sent`
- Journey stage manual change → `journey_stage_changed`
- Role grant/revoke → `role_granted` / `role_revoked`

Helper: `src/lib/audit.ts` `writeAudit({ action, target_type, target_id, payload })` — single call site, handles actor resolution. Edge functions use bridge `audit_log_write` verb or direct insert.

Per-contact audit feed on `ClientJourney.tsx`: filter `paige_audit_log WHERE target_type='contact' AND target_id=:contact_id` rendered alongside journey timeline.

---

## Sequencing (recommended ship order)

1. **Wave 1 migration** (DDL + RLS) — single migration, gated on Antonio approval
2. **Wave 2 bridge v15 + auto-assignment** — edge function changes
3. **Wave 3 User Management UI** — Antonio can start inviting reps immediately
4. **Wave 4 workspace pages** + role-aware nav — reps have somewhere to land
5. **Wave 5 filtering** on existing approvals/notifications/workflows
6. **Wave 6 audit wiring** across all action sites

Each wave is independently testable; pause between for Antonio's review.

---

## Open questions before build

1. **Role assignment for `mrmogulmaker@gmail.com`**: auto-grant `super_admin` via the existing `ensure_owner_admin` pattern, or manual?
2. **Multiple roles per user**: confirm a single user can hold both `sales_rep` and `coach` simultaneously (e.g. Tashia). Default plan: yes, multi-role via multiple `user_roles` rows.
3. **`viewer` role scope**: read-only on which dashboards exactly? Plan defaults to AnalyticsDashboard + SubscriptionsRevenue + AiActivity. Confirm.
4. **Auto-assignment fallback**: if a CS draft arrives for an unassigned contact, do we (a) leave unassigned + admin sees in "Unassigned" queue, or (b) round-robin to cs_reps? Plan defaults to (a).
5. **GHL legacy reps**: do existing GHL user identities need to be backfilled into `user_roles` so historical assignments port over, or is everyone re-invited fresh in Paige?

Reply with approval (and answers to the 5 questions) and I'll ship Wave 1 migration first.
