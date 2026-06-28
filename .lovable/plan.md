
# Paige Platform — Days 4-7 Plan (Multi-Role SaaS Lock-in)

## 1. Schema audit — what already exists

Good news: most primitives are already in place.

**`app_role` enum (12 values, live today):**
`admin · super_admin · sales_rep · coach · cs_rep · finance · broker · broker_team_member · affiliate · moderator · viewer · user`

**Functions:**
- `is_platform_owner()` — already hardcodes Antonio. Owner is derived, not a row.
- `has_role(uid, role)` — used in every RLS policy.
- `prevent_owner_admin_removal` trigger on `user_roles` — already protects Antonio.

**Tables:**
- `user_roles` (uid + role, unique) — already has owner-scoped RLS.
- `invitations` (email, role, token_hash, expires_at, accepted_at) — already hashed + 7-day TTL.
- `profiles` — exists, no `suspended` flag yet.
- `clients` — has `linked_user_id`, `tier`, `assigned_coach_user_id`, `source`.

**Edge functions:**
- `send-admin-invitation`, `admin-list-users`, `admin-delete-user`, `admin-force-signout`, `invite-affiliate`, `invite-btf-client` (Day 3).

**Auth UI:** `src/pages/Auth.tsx` already wires Google + Apple via `lovable.auth.signInWithOAuth`.

## 2. Reuse vs build

| Need | Reuse | Net new |
|---|---|---|
| Role storage | `user_roles` + `app_role` enum | Add `client` enum value (single value; cleaner RLS than deriving) |
| Owner concept | `is_platform_owner()` | Nothing — owner stays derived, no enum value, no row. Footgun avoided. |
| Invitations table + token hashing | `invitations` (already perfect shape) | Add optional `metadata jsonb` for role-specific onboarding hints |
| Admin invite send | `send-admin-invitation` edge fn | Add role-aware template selection |
| Self-serve signup auth | `Auth.tsx` Google/Apple pattern | New `/signup` page using same `lovable.auth.signInWithOAuth` helper |
| Suspend / re-enable | none | `profiles.suspended_at` + `suspended_reason` + admin RPC |
| Coach reassignment on removal | `clients.assigned_coach_user_id` | Reassignment RPC + UI modal |
| Accept-invite landing | `/workspace/accept-invite` placeholder + `Auth.tsx` reset flow | One unified `/accept-invite?token=…` page that branches by invited role |
| Owner dashboard widgets | existing admin pages | Stats card grid on `/admin` index |
| Public lead → mma-os | `mma_os_bridge_outbox` + `paige-bridge` patterns | Call `sales_dept.handle_new_lead` after signup completes |

## 3. Build order

Recommendation: **Day 4 first, then Day 6, then Day 5, then Day 7.** One small swap from your order — here's why:

1. **Day 4 (Members panel)** is the foundation. Without it, every other invite flow has no UI to trigger from, and we have no way to see invite state.
2. **Day 6 (Internal invite flow)** plugs straight into Day 4's "Invite Member" button and reuses `send-admin-invitation`. Doing these back-to-back is one tight loop.
3. **Day 5 (Public signup)** is the bigger build (multi-step wizard + bridge handoff + persona routing). It's standalone — doesn't depend on Day 4/6 — so it can ship as soon as the team flow is done without rework.
4. **Day 7 (Polish + owner home)** sits on top of everything else; needs the others to exist before it can summarize them.

Day 3 invite endpoint ships independently (already live).

## 4. Detailed scope per day

### Day 4 — `/admin/members` (owner + admin only)

- New page: filterable table of all platform users (joined from `auth.users` via `admin-list-users` + `user_roles`).
- Filters: role chips (Owner / Admin / Sales / Coach / Broker / Client / All) + search by email/name + status (active / suspended / pending invite).
- Row actions dropdown: **Add Role**, **Remove Role**, **Suspend**, **Re-enable**, **Force Sign Out**, **Remove User**.
- Removing a coach with active clients prompts a modal to reassign them to another coach first (blocks removal until done).
- Owner row is read-only (locked by existing trigger; UI grays the action menu).
- Pending invites table at the bottom (from `invitations` WHERE `accepted_at IS NULL`), with **Resend** and **Revoke** actions.

### Day 5 — `/signup` public self-serve

- Public route, no auth guard. Layout uses Mogul Maker Academy branding (NOT Paige).
- Step 0: SSO row (Google + Apple via existing `lovable.auth` helper) + email/password fallback. Pre-fills next step from SSO profile.
- Step 1: Identity — full legal name, preferred name, phone (email auto-fills).
- Step 2: Business — entity name, structure dropdown (LLC / S-Corp / C-Corp / Sole Prop / "I don't have one yet"), state, formation date, EIN (optional), business address ("I need help getting one" toggle).
- Step 3: Financials — personal credit band radio (Excellent / Good / Fair / Building), W-2 income (optional), funding goal $ + timeline.
- Step 4: Attribution — source dropdown (Workshop Wed / Launch Pad / Skool / Ad / Referral / Direct / Other) + optional referral code.
- On submit:
  - Insert `clients` row with `source` = attribution choice, `tier` = `'self_serve'`, `linked_user_id` = new auth user.
  - Grant `client` role via `user_roles`.
  - Enqueue `sales_dept.handle_new_lead` through `mma_os_bridge_outbox` (with funding_goal + persona hint).
  - Route by funding goal: `<$10K` → straight to `/workspace`; `$10K+` → "Talk to a coach first" page that books a Cal.com slot + queues a sales notification.
- Autosave per step into `client_memory` so a dropped session can resume.

### Day 6 — Internal team invite flow

- "Invite Member" button on `/admin/members` opens dialog: email + role multi-select + optional message.
- Calls existing `send-admin-invitation` (extended to accept `role`, `templateName`).
- Three new white-labeled email templates (alongside existing `role-invitation`):
  - `team-invite-admin`, `team-invite-coach`, `team-invite-sales`, `team-invite-broker` — each with role-specific "what you'll be doing" copy. From `antonio@mogulmakeracademy.com`. Subject: "Join the Mogul Maker Academy team — [role]".
- New unified `/accept-invite?token=…` page (replacing the placeholder workspace shell): validates token → if new user, password set + auth → assigns role(s) from the invitation row → routes by role (admin/sales/coach/broker → `/admin`, client → `/workspace`).
- Resend + revoke wired from Day 4 pending-invites table.

### Day 7 — Owner home + polish

- `/admin` index becomes Antonio's command center:
  - Header KPI row: Total Members (by role pill counts), Active BTF Clients, Signups Last 7d, Pending Invites, Unread Approvals.
  - Quick Actions panel: Invite Coach · Invite Client · Add Test Client · View Recent Activity.
  - Recent Activity feed (joined from `paige_audit_log` + `analytics_events` last 24h).
- "Add Test Client" opens a one-screen form that creates a `clients` row tagged `test_data` (filterable + bulk-deletable) — lets Antonio dogfood end-to-end without polluting real data.
- White-label sweep: grep for "Paige" strings rendering on any `/workspace/*` or `/signup` or client-facing email; fix any leaks. Internal `/admin/*` keeps Paige branding.
- Spot-check pass on every `/workspace/*` page — confirm each has real content (Day 1-2 placeholders for Phases and Payments get final copy + iconography).

## 5. Pushback on the spec

- **Don't add `owner` to the enum.** `is_platform_owner()` is already the source of truth and the `prevent_owner_admin_removal` trigger already protects it. Adding `owner` as a grantable role would create a path to accidentally grant it. Owner stays derived from Antonio's auth uid only.
- **Do add `client` to the enum.** Simplifies RLS (`has_role(uid, 'client')`) and lets us scope workspace data cleanly. Trivial migration.
- **`profiles.suspended_at`** instead of deleting auth users for suspend/re-enable — keeps audit trail and lets us reverse it. Force sign-out + RLS check on the flag handles the lockout.
- **Two invite tables is one too many.** `btf_workspace_invites` from Day 3 and the existing `invitations` table overlap. Keep them separate for now (different lifecycles and metadata shapes), but mark a Day 8+ task to unify under one polymorphic invite store once both flows are stable.
- **Cal.com booking for "talk to a coach first"** assumes the Cal connector is wired with a real event type. If it isn't, fall back to a simple "we'll reach out within 24h" screen for v1 and queue the lead for sales.
- **Apple Sign-In on `/signup`** works the same as `/auth` (already proven). No extra setup.

## 6. Technical notes

- New migration: add `'client'` to `app_role`; add `profiles.suspended_at`, `profiles.suspended_reason`; add `invitations.metadata jsonb`; add `clients.tier` value `'self_serve'` (if a CHECK constraint exists).
- New edge functions: `signup-complete-onboarding` (writes clients row + grants role + enqueues bridge call), `reassign-coach-clients` (RPC), `accept-invite` (validates token + grants roles + sets password).
- Extend `send-admin-invitation` with `role` + `templateName` params; add the 4 new team-invite templates to the registry.
- Frontend additions: `src/pages/admin/MembersAdmin.tsx`, `src/pages/Signup.tsx` + step components, `src/pages/AcceptInvite.tsx` (route `/accept-invite`, replacing the workspace placeholder), `src/components/admin/InviteMemberDialog.tsx`, `src/components/admin/ReassignCoachDialog.tsx`, owner dashboard widgets on `src/pages/Admin.tsx`.
- RLS: extend `clients` and `workspace_*` policies to recognize `has_role(uid, 'client')` for self-access. Members panel reads protected by `is_platform_owner() OR has_role(uid, 'admin')`.

## 7. Timeline

Realistic ship windows on top of Day 3:

```text
Week 1  | Day 4 Members panel + Day 6 internal invite flow (paired)
Week 2  | Day 5 public /signup wizard + bridge handoff
Week 3  | Day 7 owner home + white-label sweep + polish + QA
```

**Total: ~3 weeks** from Day 3 → Day 7 done. Tighter than that risks shipping the public signup page without proper attribution wiring (which would lose data we'd rather not lose).

## 8. What I need from you to start build

1. Approval on the order (4 → 6 → 5 → 7).
2. Confirmation on the pushback list (especially: owner stays derived, add `client` enum value).
3. Cal.com event type slug for the "talk to a coach first" booking embed — or greenlight to ship the fallback ("we'll reach out within 24h") for v1.
4. For Day 5 attribution, confirm the dropdown options match how MMA OS expects to receive `source` on the `handle_new_lead` call.

Standing by for greenlight.
