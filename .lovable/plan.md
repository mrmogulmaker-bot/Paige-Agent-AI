## Coaches Admin — Upgrade Plan

The current `/admin/coaches` page is read-only: a roster with client counts. We'll turn it into a real **Coach Operations Console** — add/remove coaches, manage assignments, see performance, and let MMA OS Claude do the same via MCP.

---

### 1. Coach Lifecycle (the missing CRUD)

**Add Coach** — top-right "Add Coach" button opens a dialog with two modes:
- **Promote existing user** → searchable user picker → grants `coach` role + creates `profiles.coach_*` defaults.
- **Invite new coach** → email + name → reuses existing `send-admin-invitation` edge function with `role=coach`, lands them on `/accept-invite`.

**Remove Coach** — row action "Remove coach role":
- Blocks if they have active clients → forces the existing `ReassignCoachDialog` first (already built, just wire it).
- Then revokes the `coach` row from `user_roles`. Profile stays intact.

**Edit Coach Profile** — drawer with: display name, specialty tags (personal credit / business credit / BTF / funding), capacity limit (max active clients), accepting-new-clients toggle, bio, timezone. Stored on `profiles` (add 3 columns) — drives round-robin assignment already in `paige_assignment_policy`.

---

### 2. Assignment Management

Click a coach row → **Coach Detail Drawer** with three tabs:

- **Clients** — list of every client assigned to them (from `clients.assigned_coach_user_id` + `coach_clients`). Each row: reassign (existing dialog), unassign, open contact.
- **Bulk Assign** — multi-select unassigned clients from the tenant and assign in one move (round-robin or to this coach).
- **Coverage Rules** — which pipeline stages, offer types, or tracks this coach auto-receives via round-robin.

---

### 3. Performance Snapshot (new card row on detail drawer)

Pulled live from existing tables — no new schema:
- Active clients / capacity (clients)
- Open tasks vs. completed last 30d (tasks)
- Avg response time on `btf_messages` for assigned BTF clients
- Pipeline value of their assigned deals (deals)
- Last login (auth.users via `admin-list-users`)

Gives Antonio a one-glance read on which coaches are carrying weight.

---

### 4. Backend wiring

**Migration** (one):
- Add `profiles.coach_specialties text[]`, `coach_capacity int`, `coach_accepting_clients bool`, `coach_bio text`, `coach_timezone text`.
- New RPC `admin_remove_coach_role(_user_id uuid)` — safe revoke with active-client guard.
- New RPC `admin_bulk_assign_coach(_coach uuid, _client_ids uuid[])` — single transaction, respects tenant scope.
- RLS: only `owner`/`admin` of tenant can call.

**Edge functions** — reuse what exists:
- `send-admin-invitation` (already supports role) — for invites.
- `admin-list-users` — for the user picker.
- No new functions needed.

**MCP tools added to `paige-mcp`** (so MMA OS Claude can drive this too):
- `list_coaches` (read)
- `add_coach_role` / `remove_coach_role` (write, destructive)
- `update_coach_profile` (write)
- `assign_client_to_coach` / `bulk_assign_clients_to_coach` (write)
- `get_coach_performance` (read)

§120 check: no CHECK constraints introduced; specialties is free-form text[]. Migration ships before MCP code.

---

### 5. UI Polish

- Replace the static list with a sortable table (name, specialties, active/capacity bar, accepting toggle, 30d completed tasks, actions).
- Empty/loading/error states.
- Search + filter (by specialty, accepting status).
- "Reassign all" + "Remove role" as row-level menu actions.
- Keep the existing Black/Gold/White aesthetic — Inter body, Playfair for the header.

---

### Build order

1. Migration (profile columns + 2 RPCs).
2. `useCoaches` hook + types.
3. Rebuilt `CoachesAdmin.tsx` table with Add Coach dialog.
4. `CoachDetailDrawer.tsx` (clients tab, bulk assign, coverage, performance).
5. Wire ReassignCoachDialog + remove-role flow.
6. Add the 6 MCP coach tools + redeploy `paige-mcp`.
7. Smoke test: add → assign → reassign → remove.

Approve and I'll ship it end-to-end in one pass.