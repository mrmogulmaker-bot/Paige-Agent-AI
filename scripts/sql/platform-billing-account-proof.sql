-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Foundation A — rollback proof for migration 20261044000000 (platform_billing_accounts,
-- billing_active_tenant_id, get_workspace_billing_authority, platform_billing_account_reconcile).
--
-- HOW TO RUN: from the repo root, `node scripts/sql/run-rollback-proof.mjs scripts/sql/platform-billing-account-proof.sql`
-- expands the `\i` line and prints the batch, which is then executed as ONE statement batch (psql
-- with ON_ERROR_STOP, or the Supabase MCP execute_sql). It is wrapped BEGIN..ROLLBACK: it installs
-- the migration, seeds throwaway users/tenants, impersonates each caller role with the REAL
-- request.jwt.claims + SET LOCAL ROLE mechanism, grades every property, and leaves the database
-- untouched.
--
-- WHAT A ROLLBACK PROOF SHOWS AND DOES NOT SHOW (§32): it proves the SQL runs and the properties
-- hold against real production data plus these fixtures. It proves NOTHING about the migration
-- being live — that is the post-merge persisted-apply confirmation (deploy-migrations.yml →
-- schema_migrations advanced → the objects queried directly).
--
-- FIRST-RUN RECONCILE RESULT: the migration reports it with RAISE NOTICE (visible under psql). A
-- runner that returns only result sets (the MCP tool) swaps that one DO block for a capture into
-- the report row (ord 0, res 'info'); nothing else in the batch differs from this file.
--
-- MUTATION-TESTED (transcript in the Gate B packet): scripts/sql/platform-billing-account-mutants.sql
-- installs the same migration and, in five savepoints, breaks it one way at a time — the resolver
-- swapped for current_user_tenant_id(); the billing-owner predicate keyed on role='owner' instead of
-- is_tenant_owner(); ambiguity collapsed into absent; the sub-account trigger dropped; the recipient
-- guard trigger dropped — and asserts that the matching property here (P15, P48, P12, P7, P26) goes
-- RED under each mutant. A property that stays green under its mutant is not a property.
--
-- FIXTURES are deliberately NOT any real owner account (§63): fresh uuids, `pba-proof-*` slugs.
-- The seeded auth.users rows exist only inside this transaction.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

-- ── Controls: the world BEFORE the migration ────────────────────────────────────────────────
INSERT INTO _p SELECT 1, CASE WHEN to_regclass('public.platform_billing_accounts') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C1 control: platform_billing_accounts does not exist yet';
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 AND to_regclass('public.platform_billing_recipients') IS NULL
                                    AND to_regclass('public.platform_billing_notification_log') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C2 control: none of the functions, nor the recipients / notification-log tables, exist yet'
  FROM pg_proc WHERE proname IN ('billing_active_tenant_id','get_workspace_billing_authority','platform_billing_account_reconcile',
                                 'platform_billing_recipient_designate','platform_billing_recipient_revoke',
                                 'get_workspace_billing_recipients','platform_billing_paid_activation_ready');

-- ── Fixtures (as the owning role, so setup never depends on the policy under test) ─────────
CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'aaaaaaaa-0000-4000-8000-00000000a001'::uuid AS u_owner,     -- owner of solo_a; also member of solo_b
  'aaaaaaaa-0000-4000-8000-00000000a002'::uuid AS u_admin,     -- admin of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a003'::uuid AS u_member,    -- member of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a004'::uuid AS u_sub_owner, -- owner of the sub-account
  'aaaaaaaa-0000-4000-8000-00000000a005'::uuid AS u_older,     -- owns solo_old but active_tenant_id is NULL
  'aaaaaaaa-0000-4000-8000-00000000a006'::uuid AS u_actas,     -- active_tenant_id points at solo_a, NO membership
  'aaaaaaaa-0000-4000-8000-00000000a007'::uuid AS u_admin_unv, -- admin of solo_a whose email is NOT verified
  'bbbbbbbb-0000-4000-8000-00000000b001'::uuid AS solo_a,      -- top-level, ONE customer id → mapped by reconcile
  'bbbbbbbb-0000-4000-8000-00000000b002'::uuid AS solo_b,      -- top-level, TWO customer ids → ambiguous
  'bbbbbbbb-0000-4000-8000-00000000b003'::uuid AS solo_c,      -- top-level, no customer id → absent
  'bbbbbbbb-0000-4000-8000-00000000b004'::uuid AS agency_p,    -- agency parent
  'bbbbbbbb-0000-4000-8000-00000000b005'::uuid AS sub_x,       -- sub-account of agency_p
  'bbbbbbbb-0000-4000-8000-00000000b006'::uuid AS solo_old,    -- u_older's tenant
  'cccccccc-0000-4000-8000-00000000c001'::uuid AS plan_id;
-- The impersonated roles must be able to read the fixtures and write the report.
GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

-- Every fixture user is email-verified EXCEPT u_admin_unv (R23 is proved on that one).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'pba-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(),
       CASE WHEN u = u_admin_unv THEN NULL ELSE now() END
FROM _f, unnest(ARRAY[u_owner,u_admin,u_member,u_sub_owner,u_older,u_actas,u_admin_unv]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT solo_a,  'pba-proof-solo-a',  'PBA Proof Solo A',  'PBA', 980001, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_b,  'pba-proof-solo-b',  'PBA Proof Solo B',  'PBB', 980002, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_c,  'pba-proof-solo-c',  'PBA Proof Solo C',  'PBC', 980003, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT agency_p,'pba-proof-agency',  'PBA Proof Agency',  'PBD', 980004, 'agency',     NULL::uuid FROM _f UNION ALL
SELECT solo_old,'pba-proof-solo-old','PBA Proof Solo Old','PBF', 980006, 'standalone', NULL::uuid FROM _f;
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT sub_x, 'pba-proof-sub-x', 'PBA Proof Sub X', 'PBE', 980005, 'sub_account', agency_p FROM _f;

-- Memberships. Ownership is the is_owner column (20260803190000); the owner guard admits the
-- owning role, so seeding here is legitimate — a client role could not do this (P13 proves it).
INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a,   u_owner,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_b,   u_owner,     'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT solo_a,   u_admin,     'active', 'admin'::public.tenant_role,  false FROM _f UNION ALL
SELECT solo_a,   u_member,    'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT sub_x,    u_sub_owner, 'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_old, u_older,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_a,   u_admin_unv, 'active', 'admin'::public.tenant_role,  false FROM _f;

-- handle_new_user() (AFTER INSERT ON auth.users) already created every profiles shell with a NULL
-- active_tenant_id, so the pointer is set by UPDATE. trg_guard_active_tenant refuses a pointer at a
-- workspace where the user holds no seat (or manager/operator standing), so every pointer below is
-- set while the seat exists.
UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_owner AS u, solo_a AS t FROM _f UNION ALL
      SELECT u_admin, solo_a FROM _f UNION ALL
      SELECT u_member, solo_a FROM _f UNION ALL
      SELECT u_sub_owner, sub_x FROM _f UNION ALL
      SELECT u_admin_unv, solo_a FROM _f) v
WHERE p.user_id = v.u;
-- u_older keeps the shell default (NULL active_tenant_id) — P22 asserts that premise.
-- u_actas: pointed at solo_a with NO seat — the only way that shape arises in production is a seat
-- that existed when the pointer was set and was removed afterwards, so it is seeded exactly so.
INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a, u_actas, 'active', 'member'::public.tenant_role, false FROM _f;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_a FROM _f) WHERE user_id = (SELECT u_actas FROM _f);
DELETE FROM public.tenant_members WHERE user_id = (SELECT u_actas FROM _f);

INSERT INTO public.platform_subscription_plans (id, slug, name, monthly_price_cents, included_seats, is_active)
SELECT plan_id, 'pba-proof-plan', 'PBA Proof Plan', 100, 1, false FROM _f;

-- LAYER-1 records: solo_a has exactly one customer; solo_b has two (a re-subscribe); solo_c none.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period, stripe_subscription_id, stripe_customer_id)
SELECT solo_a, plan_id, 'active',   'monthly', 'sub_pbaproof_a1', 'cus_pbaproof_A' FROM _f UNION ALL
SELECT solo_b, plan_id, 'canceled', 'monthly', 'sub_pbaproof_b1', 'cus_pbaproof_B1' FROM _f UNION ALL
SELECT solo_b, plan_id, 'active',   'monthly', 'sub_pbaproof_b2', 'cus_pbaproof_B2' FROM _f;

-- ── Install the migration (runs reconcile once, as auth.uid() IS NULL) ──────────────────────
\i supabase/migrations/20261044000000_platform_billing_accounts_foundation_a.sql

-- ── Reconcile outcome ───────────────────────────────────────────────────────────────────────
INSERT INTO _p SELECT 3, CASE WHEN a.stripe_customer_id = 'cus_pbaproof_A' AND a.stripe_account='legacy' AND a.source='backfill_subscription' THEN 'ok' ELSE 'FAIL' END,
  'P3 reconcile mapped the unambiguous tenant (one customer id) as legacy/backfill'
  FROM public.platform_billing_accounts a, _f WHERE a.tenant_id = solo_a;
INSERT INTO _p SELECT 4, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P4 reconcile did NOT map the ambiguous tenant (two customer ids) — never guesses'
  FROM public.platform_billing_accounts a, _f WHERE a.tenant_id = solo_b;
INSERT INTO _p SELECT 5, CASE WHEN (public.platform_billing_account_reconcile()->>'inserted')::int = 0 THEN 'ok' ELSE 'FAIL' END,
  'P5 reconcile is idempotent: a second run inserts nothing';
INSERT INTO _p SELECT 6, CASE WHEN (public.platform_billing_account_reconcile()->'ambiguous_tenants') @> to_jsonb(ARRAY[(SELECT solo_b FROM _f)]) THEN 'ok' ELSE 'FAIL' END,
  'P6 reconcile RETURNS the ambiguous tenant so it is never silently excluded (R14)';

-- ── Trigger: a sub-account can never own a mapping ─────────────────────────────────────────
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
    SELECT sub_x, 'cus_pbaproof_SUB', 'legacy', 'operator' FROM _f;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 7, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P7 trigger refuses a mapping row for a sub-account (42501)';
END $$;

-- ── Impersonation helper ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
-- set_config(..., true) lives for the whole TRANSACTION, not the SET LOCAL ROLE span, so the claims
-- must be cleared explicitly after every RESET ROLE or auth.uid() would leak into the next step.
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- P8 owner of solo_a → owner authority, mapped
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 8, CASE WHEN a.tenant_id = f.solo_a AND a.scope='top_level_solo' AND a.role='owner' AND a.can_manage_billing AND a.billing_account_state='mapped' THEN 'ok' ELSE 'FAIL' END,
  'P8 owner of a mapped top-level Solo: can_manage_billing=true, mapped'
  FROM public.get_workspace_billing_authority() a, _f f;
INSERT INTO _p SELECT 9, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P9 the table itself is invisible to an authenticated tenant member (RLS: operators only)'
  FROM public.platform_billing_accounts;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P10 admin → refused
SELECT pg_temp.as_user((SELECT u_admin FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 10, CASE WHEN a.role='admin' AND NOT a.can_manage_billing AND a.billing_account_state='mapped' THEN 'ok' ELSE 'FAIL' END,
  'P10 admin of the same workspace: can_manage_billing=false (R2), state still truthful'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P11 member → refused
SELECT pg_temp.as_user((SELECT u_member FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 11, CASE WHEN a.role='member' AND NOT a.can_manage_billing THEN 'ok' ELSE 'FAIL' END,
  'P11 member: can_manage_billing=false (R2)'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P12 the same person in two workspaces: the answer follows active_tenant_id, and switching flips it
UPDATE public.profiles SET active_tenant_id = (SELECT solo_b FROM _f) WHERE user_id = (SELECT u_owner FROM _f);
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 12, CASE WHEN a.tenant_id = f.solo_b AND a.role='member' AND NOT a.can_manage_billing AND a.billing_account_state='ambiguous' THEN 'ok' ELSE 'FAIL' END,
  'P12 same user switched to a workspace where they are a member: refused there; ambiguous reported as ambiguous, not absent'
  FROM public.get_workspace_billing_authority() a, _f f;
RESET ROLE; SELECT pg_temp.as_nobody();
UPDATE public.profiles SET active_tenant_id = (SELECT solo_a FROM _f) WHERE user_id = (SELECT u_owner FROM _f);

-- P13 a tenant admin cannot mint ownership by DML. The attempt runs as the admin; the OUTCOME is
-- asserted afterwards as the owning role, so it holds whether RLS filters the row or the owner guard
-- raises — the mechanism is not the property, the unchanged flag is.
SELECT pg_temp.as_user((SELECT u_admin FROM _f));
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.tenant_members SET is_owner = true WHERE user_id = (SELECT u_admin FROM _f);
  EXCEPTION WHEN others THEN NULL; END;
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();
INSERT INTO _p SELECT 13, CASE WHEN NOT EXISTS (SELECT 1 FROM public.tenant_members m, _f f WHERE m.user_id = f.u_admin AND m.is_owner) THEN 'ok' ELSE 'FAIL' END,
  'P13 a tenant admin cannot grant themself ownership by DML (outcome asserted: is_owner still false)';

-- P14 sub-account owner → not_applicable
SELECT pg_temp.as_user((SELECT u_sub_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 14, CASE WHEN a.scope='sub_account' AND NOT a.can_manage_billing AND a.billing_account_state='not_applicable' THEN 'ok' ELSE 'FAIL' END,
  'P14 sub-account owner: scope=sub_account, not_applicable (R8) — never absent, never "no subscription"'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P22 premise for P15: the shell default really is a NULL pointer
INSERT INTO _p SELECT 22, CASE WHEN p.active_tenant_id IS NULL THEN 'ok' ELSE 'FAIL' END,
  'P22 fixture control: u_older owns solo_old and has a NULL active_tenant_id'
  FROM public.profiles p, _f f WHERE p.user_id = f.u_older;

-- P15 active_tenant_id NULL while owning an older tenant → NO oldest-membership fallback
SELECT pg_temp.as_user((SELECT u_older FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 15, CASE WHEN a.tenant_id IS NULL AND a.scope='none' AND NOT a.can_manage_billing THEN 'ok' ELSE 'FAIL' END,
  'P15 null active_tenant_id: tenant_id NULL and can_manage_billing=false — the money path never falls back to the oldest membership'
  FROM public.get_workspace_billing_authority() a;
INSERT INTO _p SELECT 16, CASE WHEN public.current_user_tenant_id() = f.solo_old THEN 'ok' ELSE 'FAIL' END,
  'P16 (contrast) current_user_tenant_id() DOES fall back for the same user — proving P15 is a different resolver'
  FROM _f f;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P17 operator act-as shape: active_tenant_id pointed at a workspace with no seat → refused
SELECT pg_temp.as_user((SELECT u_actas FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 17, CASE WHEN a.tenant_id IS NULL AND a.scope='none' THEN 'ok' ELSE 'FAIL' END,
  'P17 active_tenant_id without an active membership resolves to nothing (act-as is refused in A)'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P18 absent: a top-level Solo with no LAYER-1 record at all
INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner) SELECT solo_c, u_actas, 'active', 'owner', true FROM _f;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_c FROM _f) WHERE user_id = (SELECT u_actas FROM _f);
SELECT pg_temp.as_user((SELECT u_actas FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 18, CASE WHEN a.can_manage_billing AND a.billing_account_state='absent' THEN 'ok' ELSE 'FAIL' END,
  'P18 owner of a Solo with no customer record: absent (a refusal state, never a fallback to another account)'
  FROM public.get_workspace_billing_authority() a;
-- P19 a tenant cannot run the reconcile seam
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.platform_billing_account_reconcile(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 19, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P19 a tenant owner is refused platform_billing_account_reconcile() (42501)';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P20 mapped + a later LAYER-1 record naming a different customer → ambiguous (design v2 P5b)
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period, stripe_subscription_id, stripe_customer_id)
SELECT solo_a, plan_id, 'active', 'monthly', 'sub_pbaproof_a2', 'cus_pbaproof_A2' FROM _f;
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 20, CASE WHEN a.billing_account_state='ambiguous' THEN 'ok' ELSE 'FAIL' END,
  'P20 a mapped workspace whose newer record names a different customer reports ambiguous, not mapped'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P21 anon cannot execute the read
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.get_workspace_billing_authority(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 21, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P21 anon: EXECUTE on get_workspace_billing_authority() is refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Billing recipients (owner ruling 2026-09-02, R18–R26) — P23…P41
-- A helper that runs one designation attempt as the CURRENT role and records the exact RAISE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION pg_temp.try_designate(_ord int, _user uuid, _kind text, _want text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.platform_billing_recipient_designate(_user, _kind);
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT _ord, CASE WHEN msg = _want THEN 'ok' ELSE 'FAIL: ' || msg END, _label;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.try_designate(int, uuid, text, text, text) TO authenticated, anon;

-- P23 before any designation: the owner may view, receives nothing, contact 'none', not activation-ready
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 23, CASE WHEN a.can_view_billing AND NOT a.receives_billing_notices AND a.billing_contact_state='none' AND NOT a.paid_activation_ready THEN 'ok' ELSE 'FAIL' END,
  'P23 owner before any designation: can_view_billing=true, receives=false, contact=none, paid_activation_ready=false (R19/R22)'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P24 an admin cannot designate anyone
SELECT pg_temp.as_user((SELECT u_admin FROM _f));
SET LOCAL ROLE authenticated;
SELECT pg_temp.try_designate(24, (SELECT u_admin FROM _f), 'billing_delegate', 'billing_owner_only',
  'P24 admin designating (even themself) is refused: billing_owner_only (R21)');
RESET ROLE; SELECT pg_temp.as_nobody();

-- P25–P29, P38–P39 as the owner
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
SELECT pg_temp.try_designate(25, (SELECT u_member FROM _f), 'billing_delegate', 'billing_recipient_not_admin',
  'P25 a member cannot be a delegate: billing_recipient_not_admin (R20)');
SELECT pg_temp.try_designate(26, (SELECT u_admin_unv FROM _f), 'billing_delegate', 'billing_recipient_email_unverified',
  'P26 an admin whose email is unverified cannot be designated: billing_recipient_email_unverified (R23)');
SELECT pg_temp.try_designate(38, (SELECT u_admin FROM _f), 'billing_owner', 'billing_recipient_not_owner',
  'P38 an admin cannot be designated billing_owner: billing_recipient_not_owner (R19)');
SELECT pg_temp.try_designate(39, (SELECT u_older FROM _f), 'billing_delegate', 'billing_recipient_not_member',
  'P39 a person with no seat here cannot be designated: billing_recipient_not_member (R20, no external recipients)');
SELECT pg_temp.try_designate(27, (SELECT u_owner FROM _f), 'billing_owner', 'no error',
  'P27 the owner designates themself billing_owner');
SELECT pg_temp.try_designate(28, (SELECT u_admin FROM _f), 'billing_delegate', 'no error',
  'P28 the owner designates a verified, active admin as billing_delegate');
SELECT pg_temp.try_designate(29, (SELECT u_admin FROM _f), 'billing_delegate', 'billing_recipient_already_designated',
  'P29 designating the same person twice is refused: billing_recipient_already_designated');
-- P30 the owner's authority now
INSERT INTO _p SELECT 30, CASE WHEN a.receives_billing_notices AND a.billing_contact_state='designated' AND a.paid_activation_ready AND a.can_manage_billing THEN 'ok' ELSE 'FAIL' END,
  'P30 owner after designation: receives=true, contact=designated, paid_activation_ready=true'
  FROM public.get_workspace_billing_authority() a;
-- P32b the owner reads the two live recipients; P32c the read exposes no email column
INSERT INTO _p SELECT 32, CASE WHEN count(*)=2 AND bool_and(r.email_verified) AND bool_and(r.still_eligible) THEN 'ok' ELSE 'FAIL' END,
  'P32 owner reads exactly the 2 live recipients, both verified and still eligible'
  FROM public.get_workspace_billing_recipients() r;
RESET ROLE; SELECT pg_temp.as_nobody();
INSERT INTO _p SELECT 33, CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proargnames) n
    WHERE p.proname='get_workspace_billing_recipients' AND p.pronamespace='public'::regnamespace AND n = 'email') THEN 'ok' ELSE 'FAIL' END,
  'P33 get_workspace_billing_recipients() returns no email address column';
-- P34 both designations were audited, tenant-scoped, in the same transaction (R25)
INSERT INTO _p SELECT 34, CASE WHEN count(*)=2 AND bool_and(l.tenant_id = f.solo_a) AND bool_and(l.actor_user_id = f.u_owner)
                                    AND bool_and(l.payload::text NOT ILIKE '%@%') THEN 'ok' ELSE 'FAIL' END,
  'P34 two platform_billing_recipient_designated audit rows, tenant-scoped, actor = owner, payload carries no email'
  FROM public.paige_audit_log l, _f f WHERE l.action = 'platform_billing_recipient_designated' AND l.target_type='platform_billing_recipient';

-- P31 the delegate: receives notices, may NOT view, may NOT manage (R22)
SELECT pg_temp.as_user((SELECT u_admin FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 31, CASE WHEN a.receives_billing_notices AND NOT a.can_view_billing AND NOT a.can_manage_billing THEN 'ok' ELSE 'FAIL' END,
  'P31 delegate admin: receives_billing_notices=true, can_view_billing=false, can_manage_billing=false (R22)'
  FROM public.get_workspace_billing_authority() a;
-- P35 the delegate cannot read the recipient list (view is Owner-only), and gets a refusal, not an empty set
DO $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.get_workspace_billing_recipients(); EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 35, CASE WHEN msg = 'billing_owner_only' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'P35 a delegate reading the recipient list is refused billing_owner_only — never an empty set (R8/R22)';
END $$;
-- P36 the delegate cannot revoke (owner only) — the row survives
DO $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.platform_billing_recipient_revoke((SELECT r.id FROM public.platform_billing_recipients r, _f f WHERE r.user_id = f.u_owner AND r.revoked_at IS NULL));
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 36, CASE WHEN msg = 'billing_owner_only' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'P36 a delegate revoking the billing owner is refused billing_owner_only';
END $$;
-- P37 the table itself is invisible to the delegate (RLS: operators only) and direct DML is refused
INSERT INTO _p SELECT 37, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P37 platform_billing_recipients is invisible to an authenticated tenant member (RLS)'
  FROM public.platform_billing_recipients;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P40 a sub-account owner: not applicable (R8) — designation refused, never absent
SELECT pg_temp.as_user((SELECT u_sub_owner FROM _f));
SET LOCAL ROLE authenticated;
SELECT pg_temp.try_designate(40, (SELECT u_sub_owner FROM _f), 'billing_owner', 'billing_not_applicable',
  'P40 a sub-account owner designating is refused billing_not_applicable (R8)');
RESET ROLE; SELECT pg_temp.as_nobody();

-- P41 revocation rules, as the owner: the last billing_owner is protected while subscribed; a delegate revokes cleanly and is audited
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE msg text := 'no error'; _own uuid; _del uuid; _n int;
BEGIN
  -- The table is RLS-invisible to the owner; the ids are read through the recipients RPC, as the owner would.
  SELECT r.id INTO _own FROM public.get_workspace_billing_recipients() r WHERE r.designation = 'billing_owner';
  SELECT r.id INTO _del FROM public.get_workspace_billing_recipients() r WHERE r.designation = 'billing_delegate';
  BEGIN PERFORM public.platform_billing_recipient_revoke(_own); EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 41, CASE WHEN msg = 'billing_owner_required_while_subscribed' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'P41 revoking the only billing_owner of a subscribed workspace is refused billing_owner_required_while_subscribed (R19)';
  msg := 'no error';
  BEGIN PERFORM public.platform_billing_recipient_revoke(_del); EXCEPTION WHEN others THEN msg := SQLERRM; END;
  SELECT count(*) INTO _n FROM public.get_workspace_billing_recipients();
  INSERT INTO _p SELECT 42, CASE WHEN msg = 'no error' AND _n = 1 THEN 'ok' ELSE 'FAIL: ' || msg || ' n=' || _n END,
    'P42 revoking the delegate succeeds and the owner''s list shrinks to 1';
  msg := 'no error';
  BEGIN PERFORM public.platform_billing_recipient_revoke(_del); EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 43, CASE WHEN msg = 'billing_recipient_not_found' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'P43 revoking an already-revoked designation is refused billing_recipient_not_found';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();
INSERT INTO _p SELECT 44, CASE WHEN count(*)=1 AND bool_and(l.tenant_id = f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'P44 the revocation was audited, tenant-scoped (R25)'
  FROM public.paige_audit_log l, _f f WHERE l.action = 'platform_billing_recipient_revoked';

-- P45 the delegate's authority after revocation: receives nothing
SELECT pg_temp.as_user((SELECT u_admin FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 45, CASE WHEN NOT a.receives_billing_notices THEN 'ok' ELSE 'FAIL' END,
  'P45 a revoked delegate no longer receives billing notices'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P46 the paid-activation gate: a tenant is refused; a service context reads true / false truthfully (R19)
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.platform_billing_paid_activation_ready((SELECT solo_a FROM _f)); EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 46, CASE WHEN msg = 'platform_billing_paid_activation_ready_forbidden' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'P46 a tenant owner calling platform_billing_paid_activation_ready(tenant) is refused (service/operator only)';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();
INSERT INTO _p SELECT 47, CASE WHEN public.platform_billing_paid_activation_ready(f.solo_a) AND NOT public.platform_billing_paid_activation_ready(f.solo_c)
                                    AND NOT public.platform_billing_paid_activation_ready(f.sub_x) THEN 'ok' ELSE 'FAIL' END,
  'P47 service context: ready=true for the workspace with a verified billing owner, false for one with none, false for a sub-account'
  FROM _f f;

-- P48 live truth: if the designated billing owner stops being an Owner, the contact state says so and readiness drops
UPDATE public.tenant_members SET is_owner = false WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);
INSERT INTO _p SELECT 48, CASE WHEN NOT public.platform_billing_paid_activation_ready(f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'P48 a billing_owner designation whose ownership was revoked no longer satisfies the paid-activation gate (computed live, never cached)'
  FROM _f f;
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 49, CASE WHEN a.billing_contact_state='designated_needs_attention' AND NOT a.paid_activation_ready AND a.receives_billing_notices THEN 'ok' ELSE 'FAIL' END,
  'P49 the same read reports contact=designated_needs_attention; the person still receives notices (designation) but is no longer a verified Owner'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();
UPDATE public.tenant_members SET is_owner = true WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);

-- P50 the notification ledger: the event catalogue is a CHECK; an unknown event is refused; a tenant cannot write to it
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.platform_billing_notification_log (tenant_id, recipient_user_id, event, status)
    SELECT solo_a, u_owner, 'marketing_blast', 'queued' FROM _f;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  INSERT INTO _p SELECT 50, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P50 an event outside the explicit catalogue is refused by the ledger CHECK (R18/R24)';
END $$;
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.platform_billing_notification_log (tenant_id, recipient_user_id, event, status)
    SELECT solo_a, u_owner, 'payment_failed', 'sent' FROM _f;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 51, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P51 a tenant owner cannot write a delivery row (RLS: service contexts only)';
END $$;
INSERT INTO _p SELECT 52, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P52 the ledger is invisible to a tenant owner (RLS: operators only)'
  FROM public.platform_billing_notification_log;
RESET ROLE; SELECT pg_temp.as_nobody();
INSERT INTO _p SELECT 53, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P53 no delivery row exists after everything above: nothing in Foundation A sends (R23 — delivery not wired)'
  FROM public.platform_billing_notification_log;

-- P54 anon cannot execute any designation seam
SET LOCAL ROLE anon;
DO $$
DECLARE n int := 0;
BEGIN
  BEGIN PERFORM public.platform_billing_recipient_designate('aaaaaaaa-0000-4000-8000-00000000a001'::uuid, 'billing_owner'); EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.platform_billing_recipient_revoke(gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_workspace_billing_recipients(); EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  INSERT INTO _p SELECT 54, CASE WHEN n = 3 THEN 'ok' ELSE 'FAIL n=' || n END, 'P54 anon: EXECUTE on designate / revoke / recipients read is refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- ── Report (one row, so a batch runner that returns a single result set still shows every line)
SELECT count(*) FILTER (WHERE res='ok') AS ok,
       count(*) FILTER (WHERE res<>'ok') AS failed,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) AS lines
FROM _p;

ROLLBACK;
