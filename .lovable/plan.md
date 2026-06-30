## Goal

A contact's Client View only exists once they have **(1) accepted invite + set password**, **(2) signed the agreement**, and **(3) completed intake (stage = `completed`)**. Until then, neither the client nor any staff member can open it — staff see an onboarding-status panel instead. Every tile inside the view binds to that client's real records with proper empty states.

## Canonical readiness definition

A single source of truth, used by RPC + UI + impersonation:

```text
client_view_ready =
  clients.linked_user_id IS NOT NULL
  AND clients.agreement_signed_at IS NOT NULL
  AND clients.onboarding_stage = 'completed'
```

The same boolean drives: client self-access to `/app`, the Impersonate button's enabled state, and the contact-profile status panel.

## Changes

### 1. Database (single migration)

- New SQL helper `public.client_view_ready(p_contact_id uuid) RETURNS boolean` — SECURITY DEFINER, returns the three-gate check above.
- New helper `public.client_onboarding_status(p_contact_id uuid)` returning a row with: `invite_accepted_at`, `password_set_at` (from `auth.users.last_sign_in_at`/`encrypted_password` non-null proxy), `agreement_signed_at`, `agreement_template_slug`, `intake_submitted_at` (= `onboarding_completed_at`), `stage`, `ready` boolean. Used by the staff status panel.
- Update `public.start_client_impersonation(p_contact_id)` to additionally `RAISE EXCEPTION 'client has not completed onboarding'` when `client_view_ready` is false. Owner override is **not** added per your decision.
- Grants: EXECUTE to `authenticated` on both helpers.

### 2. Client-side route guard (`/app`)

`src/pages/AppShell.tsx`: when the signed-in user is a client (has `client` role / linked `clients` row), call a small `useClientViewReady()` hook. If not ready → `navigate(resolveLandingRoute(...))` which already routes to the correct `/onboard/<stage>`. The existing `resolveLandingRoute` already does this — we just make sure `/app` never renders for an un-ready client (today it briefly can if they deep-link).

### 3. Impersonate button (`src/components/admin/ImpersonateClientButton.tsx`)

- Replace the `linkedUserId`-only disabled check with a `ready` prop sourced from `client_onboarding_status`.
- Disabled tooltip becomes specific: "Client hasn't completed onboarding (agreement pending)" / "(intake pending)" / "(hasn't accepted invite)".
- On click, server still re-checks via the updated RPC (defense in depth).

### 4. New staff panel: `ClientOnboardingStatusPanel.tsx`

Lives on `ContactDetail` (above or replacing the current Portal panel header). Shows a 3-step checklist with timestamps, derived from `client_onboarding_status`:

```text
[✓] Invite accepted          Jun 28, 2026 9:14am
[✓] Agreement signed         v2.1 · Jun 29, 2026 10:02am
[ ] Intake submitted         Pending — last activity 2h ago
```

Plus quick actions already wired in `ContactPortalPanel`: Resend invite · Send password reset · Force sign out. The `<ImpersonateClientButton />` sits here with the new gated state.

### 5. Client View tiles — real data + empty states

Audit the tiles rendered under `/app` (workspace home, credit, funding, documents, messages, next steps). Each tile:

- Reads from its real table scoped to `effective_user_id` (impersonation-aware hooks already exist).
- If the query returns zero rows, render an `<EmptyTile />` with: icon, one-line explanation, single primary CTA pointing at the action that produces the data (e.g. "Upload your first credit report"). No seeded/sample copy.
- A shared `src/components/client/EmptyTile.tsx` keeps the look consistent.

Tiles in scope for this pass: Goals, Credit Snapshot, Funding Readiness, Documents, Messages, Next Steps, Recent Activity. (If a tile is already data-backed, we just add/normalize the empty state.)

### 6. Realtime

`clients` is already in the realtime publication. The status panel + Impersonate button subscribe to `clients:id=eq.<contactId>` so the checklist + button enable instantly the moment the client finishes intake — no refresh needed.

## Out of scope

- No change to onboarding flow itself (already shipped).
- No owner override / preview mode (per your decision).
- No changes to broker or admin dashboards.

## Files touched

- `supabase/migrations/<new>.sql` — helpers + updated impersonation RPC
- `src/components/admin/ImpersonateClientButton.tsx`
- `src/components/admin/contacts/ContactPortalPanel.tsx` (mount status panel, pass `ready` to button)
- `src/components/admin/contacts/ClientOnboardingStatusPanel.tsx` (new)
- `src/hooks/useClientOnboardingStatus.ts` (new)
- `src/pages/AppShell.tsx` (hard guard for un-ready clients)
- `src/components/client/EmptyTile.tsx` (new)
- Tile components under `src/components/client/**` and `src/pages/app/**` — empty-state wiring only

## Verification

1. Create a fresh test contact, send invite → confirm staff status panel shows `[ ] [ ] [ ]` and Impersonate is disabled with the right tooltip.
2. Accept invite → first box ticks live (realtime).
3. Sign agreement → second box ticks; Impersonate still disabled (intake pending).
4. Complete intake → third box ticks; Impersonate enables; clicking opens `/app` scoped to that client with real data + empty-state CTAs where records don't exist.
5. Try calling `start_client_impersonation` directly via SQL for an un-ready contact → expect "client has not completed onboarding" error.
