## Goal

One canonical client experience (the `/app` workspace in your screenshot). Three audiences, one surface:

1. **Clients** → only ever see `/app/*`. No `/admin`, no `/broker`, no escape hatches.
2. **Tenant staff** (admin, coach, sales_rep, cs_rep, owner) → can open any contact in their tenant *as that client* and see the exact same view the client sees, scoped to that client's data.
3. **Platform owner / super_admin** → same impersonation, across every tenant.

## What exists today

- `/app` already renders the client workspace.
- `AdminLayout` has a "Switch to Client View" button — but it just opens `/app` as the admin's *own* account. It does not load a specific client's data.
- `AdminViewBanner` only shows the generic "you're viewing the client experience" pill.
- `RoleGate` blocks clients from `/admin/*` but does not lock them to `/app/*`.
- No impersonation context exists in the app — every hook reads from `auth.uid()`.

## Architecture

Add a single **ImpersonationContext** that wraps `/app`. When a staff member enters via "View as client", we:

1. Store the target `contact_id` + `linked_user_id` in `sessionStorage` (`paige_impersonating_contact`) and React context.
2. Render `/app` exactly as it is today, but every data hook that currently uses `user.id` now reads `effectiveUserId` from the context (falls back to `user.id` when not impersonating).
3. Stamp every Supabase mutation made during impersonation with `acting_as_user_id` in the existing audit-log trail so the client can see what staff did on their behalf.
4. Banner at the top: `Viewing as Tashia Anderson — [Exit]`. Replaces the current generic banner during impersonation.

The staff member stays authenticated as themselves; RLS still applies. We rely on the existing `can_access_contact()` + `coach_can_access_user()` security-definer helpers so staff can only impersonate clients they're already authorized to see.

## Database

Single migration:

- `public.start_client_impersonation(p_contact_id uuid)` SECURITY DEFINER → verifies caller via `can_access_contact`, returns `{ contact_id, linked_user_id, client_name }`. Writes `audit_logs` row (`event = 'impersonation.start'`).
- `public.end_client_impersonation(p_contact_id uuid)` → audit `'impersonation.end'`.
- View `public.v_my_impersonatable_clients` filtered by `can_access_contact` so the picker UI only shows clients the staff member can act on.

## Frontend changes

1. **New** `src/contexts/ImpersonationContext.tsx` — `{ targetUserId, targetContactId, targetName, isImpersonating, start(contactId), stop() }`. Persists in sessionStorage.
2. **New** `src/components/admin/ImpersonateClientButton.tsx` — added to `ContactDetail` header and to each row of `/admin/contacts`. Calls `start_client_impersonation` RPC → navigates to `/app?stay=1`.
3. **Rewrite** `src/components/admin/AdminViewBanner.tsx` — when impersonating shows `Viewing as {name} · Exit`; when staff just chose "preview client view" (no target) keeps today's pill.
4. **Patch** `src/pages/AppShell.tsx` — wrap `/app` tree in `ImpersonationProvider`, pass `effectiveUser = { id: targetUserId ?? user.id, ... }` to `PaigeChat`, `Outlet context`, `AppDashboardHome`, and `useCreditFactors`.
5. **Patch** the handful of client hooks that read `auth.getUser()` directly (`useCreditFactors`, `useClientGoals`, `useFundingMatches`, `useContactSelfProfile`) to accept an explicit `userId` arg sourced from the context.
6. **Lock clients to /app**:
   - `App.tsx` route guard: if the signed-in user only has the `client` role, redirect any `/admin*`, `/broker*`, `/workspace*` hit back to `/app`.
   - Hide the "Admin" pill in `AppNav` when the user has no staff role (today it shows for everyone in the screenshot).
   - `resolveLandingRoute` already routes clients to `/app`; we add a hard redirect in `App.tsx` for safety.
7. **Admin Contacts list** — add a "View as client" action in the row menu next to "Open contact". For contacts without a `linked_user_id`, the button is disabled with tooltip "Client hasn't accepted their invite yet".

## What staff CAN do while impersonating

Read everything the client can read, send chat messages to Paige *as themselves* (we will not spoof the client's identity in chat — Paige sees `acting_as = staff_id`), trigger client-side actions like "Run Credit Analysis". All writes are audit-logged with both `user_id` (client) and `acting_as_user_id` (staff).

## What staff CANNOT do

- Change the client's password.
- Sign the client's legal agreements.
- Access another tenant's clients (RLS).
- Stay impersonating across tab close (sessionStorage clears).

## Out of scope for this pass

- Mobile-specific banner restyle (the existing mobile banner still works).
- A dedicated "impersonation history" admin report (audit_logs already captures it; can surface later).

## Validation

After the migration runs and code lands I'll:
1. Open `/admin/contacts`, click "View as" on Tashia → land on `/app` with her data, banner shows her name.
2. Sign in as a pure-client account → confirm `/admin` redirects to `/app` and the Admin pill is hidden.
3. Confirm `audit_logs` shows `impersonation.start` and `impersonation.end` rows.
