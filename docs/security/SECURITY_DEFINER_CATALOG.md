# SECURITY DEFINER Function Catalog — `public` Schema

Living registry of every `SECURITY DEFINER` function in `public` that retains `EXECUTE` for `anon` or `authenticated`. Format per Doctrine §124 v2.

**Categories:**
- **A** — Intentional user-facing public API
- **B** — Public-flow with internal auth check (called unauthenticated but verifies caller identity/state internally)
- **C** — Trigger/cron/internal only (should never have anon; authenticated allowed only when invoked from RLS policies)

Last reviewed: 2026-07-01 · Reviewer: Lovable Agent (Paige Agent AI)

---

## Anon + Authenticated (Category B — public flow with internal check)

### Function: public.peek_tenant_invite
Grants: anon + authenticated
Category: B — Public-flow with internal auth check
Justification: Unauthenticated invite landing page reads token metadata (tenant name, invited email) before signup. Function only accepts a signed invite token; no PII returned beyond the invited email.
Auth-check location: Body — validates `token` exists in `invitations`, unexpired, unaccepted.
Regression test: manual — POST with invalid token returns null; expired token returns null.
Re-review triggers: adds PII columns · token verification relaxed

### Function: public.record_communications_consent
Grants: anon + authenticated
Category: B — Public-flow with internal auth check
Justification: GLBA/TCPA consent capture from public marketing forms (PublicSignup, AffiliateApply). Row is append-only and stamped with request context.
Auth-check location: Body — writes to `communications_consents` with server-side `now()` and IP; no read/update surface.
Regression test: manual — repeated calls create separate rows; cannot mutate existing consent.
Re-review triggers: mutation path added · schema exposes prior consents

### Function: public.has_email_marketing_consent
Grants: anon + authenticated
Category: B — Public-flow with internal auth check
Justification: Boolean-only helper used by unsubscribe/preference landing pages before login. Returns TRUE/FALSE only; leaks no address or identifier the caller didn't already supply.
Auth-check location: Body — key by supplied `_email` param; no enumeration.
Regression test: manual — random emails return false, do not raise.
Re-review triggers: signature adds enumeration surface

### Function: public.has_sms_consent
Grants: anon + authenticated
Category: B — Public-flow with internal auth check
Justification: Mirror of email consent for SMS opt-in checks on public STOP/HELP handlers.
Auth-check location: Body — keyed by supplied `_phone`.
Regression test: manual — unknown phones return false.
Re-review triggers: signature broadens

---

## Authenticated only — Category A (intentional user-facing RPCs)

### Function: public.has_role
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Canonical role check used by every client hook. Signature `(_user_id, _role)` — caller passes their own uid; no privilege escalation possible.
Last reviewed: 2026-07-01

### Function: public.has_any_role / public.is_admin / public.is_staff / public.is_platform_owner / public.is_tenant_admin / public.is_tenant_owner / public.is_tenant_member / public.has_tenant_role
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Boolean role predicates used by RLS policies and UI gating. Return TRUE/FALSE against caller's own uid or supplied uid; no data leak.

### Function: public.current_user_roles / public.current_user_tenant_id / public.get_user_primary_tenant
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Returns roles/tenant for `auth.uid()` only. Used by AppShell for routing.

### Function: public.check_feature_access / public.tenant_has_feature / public.get_user_business_limit
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Entitlement lookups for the current tenant. Scoped by `has_tenant_role` internally.

### Function: public.client_view_ready / public.client_onboarding_status
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Readiness gate used by both the client's own dashboard and staff impersonation button. Internally checks `can_access_contact` when caller ≠ contact owner.

### Function: public.client_advance_onboarding_stage
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Client self-service stage progression (auth → agreement → intake). Internally enforces `linked_user_id = auth.uid()` and validates target stage transition.
Auth-check location: RAISE EXCEPTION if `linked_user_id <> auth.uid()`.
Regression test: manual — cross-client call refused with named error.

### Function: public.start_client_impersonation / public.end_client_impersonation
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Admin impersonation control. Internally requires `is_staff(auth.uid())` AND `client_view_ready(contact_id)`; writes audit row on every call.
Auth-check location: RAISE EXCEPTION on missing staff role or readiness gate failure.

### Function: public.accept_tenant_invite / public.accept_invitation / public.create_tenant_invite_token
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Invite acceptance flow after signup. Validates token → assigns tenant role. Token creation requires `is_tenant_admin`.

### Function: public.revoke_platform_access
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Admin soft-revoke of staff role. Requires `is_admin(auth.uid())` internally.
Auth-check location: RAISE EXCEPTION unless caller is admin.

### Function: public.admin_bulk_assign_coach / public.admin_remove_coach_role
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Admin coach assignment. Requires `is_admin` or `is_tenant_admin`.

### Function: public.claim_client
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Sales rep claims an unassigned lead. Enforces `has_any_role({sales_rep, admin})` and unassigned status.

### Function: public.update_profile_ssn
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Owner-only SSN write; stores encrypted ciphertext + `ssn_last_4`. Enforces `id = auth.uid()`.
Auth-check location: RAISE unless target row owner.

### Function: public.get_my_ssn_last_4
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Returns caller's own `ssn_last_4`. Keyed on `auth.uid()`; no parameter.

### Function: public.get_profile_with_pii_log
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: PII read with audit log. Requires `can_access_contact` and inserts `paige_audit_log` row.

### Function: public.get_outstanding_consents
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Lists unsigned legal agreements for `auth.uid()`. Keyed on caller.

### Function: public.get_tenant_sender / public.tenant_sender_identity / public.get_workspace_brand
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Returns tenant brand/from-address for compose UI. Requires `has_tenant_role`.

### Function: public.match_paige_memory / public.match_tenant_knowledge
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Vector search RPCs. Internally scope by tenant via `current_user_tenant_id()`.

### Function: public.get_approval_queue_counts / public.unassigned_queue_for_caller
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Dashboard queue counts scoped to caller's role and tenant.

### Function: public.compute_contact_readiness / public.set_journey_stage
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Contact readiness score + journey stage transition. Enforces `can_access_contact`.

### Function: public.delete_credit_report_upload
Grants: authenticated
Category: A — Intentional user-facing public API
Justification: Owner-scoped credit report deletion. Requires `linked_user_id = auth.uid()` or `is_staff`.

---

## Authenticated only — Category C (RLS-helper; internal use)

These are called from RLS policy expressions and therefore must remain executable by the authenticated role (policies run as the calling user). They never return data by themselves; they return booleans/ids consumed by policy `USING` clauses.

- `public.can_access_contact(uuid)`
- `public.coach_can_access_user(uuid)`
- `public.client_has_role_assigned(uuid, app_role)`
- `public.is_assigned_to_client(uuid, uuid)`
- `public.is_btf_assigned_coach(uuid, uuid)`
- `public.is_btf_client_owner(uuid, uuid)`
- `public.is_broker_team_member_of(uuid, uuid)`
- `public.get_broker_team_member(uuid)`
- `public.get_business_hierarchy(uuid)`

Justification: All return booleans/ids scoped to caller. Removing `authenticated` EXECUTE would break every RLS policy that references them. Anon EXECUTE already revoked.
Re-review triggers: any of these gains a data-returning overload · function begins reading unrelated tables

---

## Revoked functions (for audit trail)

Anon + authenticated EXECUTE was previously revoked from the following internal trigger/cron functions and must remain revoked:
`auto_stub_business_from_contact`, `ensure_client_role_self_heal`, `notify_approval_event`, `email_queue_dispatch`, `enforce_doctrine_120`, `enforce_doctrine_120_full`, `enforce_subagent_doctrine_116`, `enforce_subagent_doctrine_124`, and the paired weekly-sweep functions.

---

## Re-review cadence

- Weekly `pg_cron` job `doctrine_124_weekly_sweep` diffs live grants against this catalog and raises `paige_admin_notifications` on drift.
- Any migration that alters a function body or expands its grant list MUST update this file in the same PR.
