-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Foundation A — MUTATION batch for scripts/sql/platform-billing-account-proof.sql.
-- Installs the same migration on the same fixtures through the same `\i` line the proof uses
-- (expanded by scripts/sql/run-rollback-proof.mjs; a hand-kept inline copy drifted once and is
-- gone). Then it breaks the installed migration five ways, one at a time, and
-- asserts the matching proof property goes RED each time: M1 → P15, M2 → P48, M5 → P26,
-- M4 → P7, M3 → P12. M1 and M2 are restored explicitly afterwards (M0 is the restore control);
-- M5, M4 and M3 are NOT restored — they run last, in that order, and nothing after each one
-- depends on the object it broke. No savepoints (a ROLLBACK TO SAVEPOINT would discard the
-- result rows). BEGIN..ROLLBACK: nothing persists.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

INSERT INTO _p SELECT 1, CASE WHEN to_regclass('public.platform_billing_accounts') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C1 control: platform_billing_accounts does not exist yet';
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 AND to_regclass('public.platform_billing_contacts') IS NULL
                                    AND to_regclass('public.platform_billing_notification_log') IS NULL THEN 'ok' ELSE 'FAIL' END,
  'C2 control: none of the functions, nor the billing-contacts / notification-log tables, exist yet'
  FROM pg_proc WHERE proname IN ('billing_active_tenant_id','get_workspace_billing_authority','platform_billing_account_reconcile',
                                 'platform_billing_contact_designate','platform_billing_contact_revoke',
                                 'get_workspace_billing_contacts','platform_billing_paid_activation_ready');

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'aaaaaaaa-0000-4000-8000-00000000a001'::uuid AS u_owner,     -- owner of solo_a; also member of solo_b
  'aaaaaaaa-0000-4000-8000-00000000a002'::uuid AS u_admin,     -- admin of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a003'::uuid AS u_member,    -- member of solo_a
  'aaaaaaaa-0000-4000-8000-00000000a004'::uuid AS u_sub_owner, -- owner of the sub-account
  'aaaaaaaa-0000-4000-8000-00000000a005'::uuid AS u_older,     -- owns solo_old but active_tenant_id is NULL
  'aaaaaaaa-0000-4000-8000-00000000a006'::uuid AS u_actas,     -- active_tenant_id points at solo_a, NO membership
  'aaaaaaaa-0000-4000-8000-00000000a007'::uuid AS u_admin_unv, -- admin of solo_a whose email is NOT verified
  'aaaaaaaa-0000-4000-8000-00000000a008'::uuid AS u_agency,    -- owner of agency_p
  'bbbbbbbb-0000-4000-8000-00000000b001'::uuid AS solo_a,      -- top-level, ONE customer id → mapped by reconcile
  'bbbbbbbb-0000-4000-8000-00000000b002'::uuid AS solo_b,      -- top-level, TWO customer ids → ambiguous
  'bbbbbbbb-0000-4000-8000-00000000b003'::uuid AS solo_c,      -- top-level, no customer id → absent
  'bbbbbbbb-0000-4000-8000-00000000b004'::uuid AS agency_p,    -- agency parent
  'bbbbbbbb-0000-4000-8000-00000000b005'::uuid AS sub_x,       -- sub-account of agency_p
  'bbbbbbbb-0000-4000-8000-00000000b006'::uuid AS solo_old,    -- u_older's tenant
  'cccccccc-0000-4000-8000-00000000c001'::uuid AS plan_id;
GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'pba-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(),
       CASE WHEN u = u_admin_unv THEN NULL ELSE now() END
FROM _f, unnest(ARRAY[u_owner,u_admin,u_member,u_sub_owner,u_older,u_actas,u_admin_unv,u_agency]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT solo_a,  'pba-proof-solo-a',  'PBA Proof Solo A',  'PBA', 980001, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_b,  'pba-proof-solo-b',  'PBA Proof Solo B',  'PBB', 980002, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT solo_c,  'pba-proof-solo-c',  'PBA Proof Solo C',  'PBC', 980003, 'standalone', NULL::uuid FROM _f UNION ALL
SELECT agency_p,'pba-proof-agency',  'PBA Proof Agency',  'PBD', 980004, 'agency',     NULL::uuid FROM _f UNION ALL
SELECT solo_old,'pba-proof-solo-old','PBA Proof Solo Old','PBF', 980006, 'standalone', NULL::uuid FROM _f;
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id)
SELECT sub_x, 'pba-proof-sub-x', 'PBA Proof Sub X', 'PBE', 980005, 'sub_account', agency_p FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a,   u_owner,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_b,   u_owner,     'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT solo_a,   u_admin,     'active', 'admin'::public.tenant_role,  false FROM _f UNION ALL
SELECT solo_a,   u_member,    'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT sub_x,    u_sub_owner, 'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_old, u_older,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT solo_a,   u_admin_unv, 'active', 'admin'::public.tenant_role,  false FROM _f UNION ALL
SELECT agency_p, u_agency,    'active', 'owner'::public.tenant_role,  true  FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_owner AS u, solo_a AS t FROM _f UNION ALL
      SELECT u_admin, solo_a FROM _f UNION ALL
      SELECT u_member, solo_a FROM _f UNION ALL
      SELECT u_sub_owner, sub_x FROM _f UNION ALL
      SELECT u_admin_unv, solo_a FROM _f UNION ALL
      SELECT u_agency, agency_p FROM _f) v
WHERE p.user_id = v.u;
INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT solo_a, u_actas, 'active', 'member'::public.tenant_role, false FROM _f;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_a FROM _f) WHERE user_id = (SELECT u_actas FROM _f);
DELETE FROM public.tenant_members WHERE user_id = (SELECT u_actas FROM _f);

INSERT INTO public.platform_subscription_plans (id, slug, name, monthly_price_cents, included_seats, is_active)
SELECT plan_id, 'pba-proof-plan', 'PBA Proof Plan', 100, 1, false FROM _f;

INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period, stripe_subscription_id, stripe_customer_id)
SELECT solo_a, plan_id, 'active',   'monthly', 'sub_pbaproof_a1', 'cus_pbaproof_A' FROM _f UNION ALL
SELECT solo_b, plan_id, 'canceled', 'monthly', 'sub_pbaproof_b1', 'cus_pbaproof_B1' FROM _f UNION ALL
SELECT solo_b, plan_id, 'active',   'monthly', 'sub_pbaproof_b2', 'cus_pbaproof_B2' FROM _f;

-- The migration itself, expanded by scripts/sql/run-rollback-proof.mjs — never a hand-kept copy.
\i supabase/migrations/20261045000000_platform_billing_accounts_foundation_a.sql
-- The migration's own first reconcile already ran (RAISE NOTICE under psql; silent under a result-set runner).

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;
-- A live designation to mutate against (the guard admits it: verified Owner, top-level Solo).
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
SELECT public.platform_billing_contact_designate((SELECT u_owner FROM _f), 'primary_contact');
RESET ROLE; SELECT pg_temp.as_nobody();

-- M1 and M2 are un-mutated explicitly (never ROLLBACK TO SAVEPOINT, which would also discard the
-- result rows). M5, M4 and M3 run last and are not restored: nothing after each uses the object it broke.

-- M1 resolver swapped for current_user_tenant_id(): P15 must go RED (u_older resolves to solo_old)
CREATE OR REPLACE FUNCTION public.billing_active_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.current_user_tenant_id(); $$;
SELECT pg_temp.as_user((SELECT u_older FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 101, CASE WHEN a.tenant_id = f.solo_old THEN 'ok' ELSE 'FAIL' END,
  'M1 resolver mutant: P15 goes red (tenant_id resolved to the oldest membership) — the assertion catches it'
  FROM public.get_workspace_billing_authority() a, _f f;
RESET ROLE; SELECT pg_temp.as_nobody();
-- restore
CREATE OR REPLACE FUNCTION public.billing_active_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.active_tenant_id FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.active_tenant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = auth.uid() AND m.tenant_id = p.active_tenant_id AND m.status = 'active')
  LIMIT 1;
$$;

-- M2 workspace-owner predicate keyed on role='owner' instead of is_tenant_owner(): P48 must go RED
CREATE OR REPLACE FUNCTION public.platform_billing_verified_primary_contact_count(p_tenant_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.platform_billing_contacts r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.tenant_members m ON m.tenant_id = r.tenant_id AND m.user_id = r.user_id AND m.status = 'active'
  WHERE r.tenant_id = p_tenant_id AND r.designation = 'primary_contact' AND r.revoked_at IS NULL
    AND u.email_confirmed_at IS NOT NULL AND m.role = 'owner';
$$;
UPDATE public.tenant_members SET is_owner = false WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);
INSERT INTO _p SELECT 102, CASE WHEN public.platform_billing_paid_activation_ready(f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'M2 role=owner mutant: P48 goes red (ready stays true after ownership is revoked) — the assertion catches it'
  FROM _f f;
-- restore
UPDATE public.tenant_members SET is_owner = true WHERE user_id = (SELECT u_owner FROM _f) AND tenant_id = (SELECT solo_a FROM _f);
CREATE OR REPLACE FUNCTION public.platform_billing_verified_primary_contact_count(p_tenant_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.platform_billing_contacts r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.tenants t ON t.id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.designation = 'primary_contact' AND r.revoked_at IS NULL
    AND t.parent_tenant_id IS NULL AND t.account_type NOT IN ('agency', 'enterprise', 'sub_account')
    AND u.email_confirmed_at IS NOT NULL AND public.is_tenant_owner(r.user_id, r.tenant_id);
$$;
INSERT INTO _p SELECT 100, CASE WHEN public.platform_billing_paid_activation_ready(f.solo_a) THEN 'ok' ELSE 'FAIL' END,
  'M0 control after restoring M2: the real predicate reports ready=true again'
  FROM _f f;

-- M5 recipient guard dropped: P26 must go RED (an unverified admin gets designated)
DROP TRIGGER trg_platform_billing_contact_guard ON public.platform_billing_contacts;
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE msg text := 'no error';
BEGIN
  BEGIN PERFORM public.platform_billing_contact_designate((SELECT u_admin_unv FROM _f), 'delegate');
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  INSERT INTO _p SELECT 105, CASE WHEN msg = 'no error' THEN 'ok' ELSE 'FAIL: ' || msg END,
    'M5 guard-removed mutant: P26 goes red (unverified admin designated) — the assertion catches it';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- M4 sub-account trigger dropped: P7 must go RED (a sub-account gets a mapping row)
DROP TRIGGER trg_platform_billing_account_top_level ON public.platform_billing_accounts;
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT sub_x, 'cus_pbaproof_SUB', 'legacy', 'operator' FROM _f;
INSERT INTO _p SELECT 104, CASE WHEN count(*)=1 THEN 'ok' ELSE 'FAIL' END,
  'M4 trigger-removed mutant: P7 goes red (the sub-account row was inserted) — the assertion catches it'
  FROM public.platform_billing_accounts a, _f f WHERE a.tenant_id = f.sub_x;

-- M3 ambiguity collapsed into absent: P12 must go RED (solo_b has two ids). Last: nothing after needs the real read.
CREATE OR REPLACE FUNCTION public.get_workspace_billing_authority()
RETURNS TABLE(tenant_id uuid, scope text, role text, can_manage_billing boolean, billing_account_state text,
              can_view_billing boolean, receives_billing_notices boolean, billing_contact_state text, paid_activation_ready boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid; _ids text[]; _mapped text; _state text;
BEGIN
  _t := public.billing_active_tenant_id();
  SELECT array_agg(DISTINCT s.cid) INTO _ids FROM (
    SELECT ps.stripe_customer_id AS cid FROM public.platform_subscriptions ps WHERE ps.tenant_id = _t AND ps.stripe_customer_id IS NOT NULL
    UNION SELECT t.stripe_customer_id FROM public.tenants t WHERE t.id = _t AND t.stripe_customer_id IS NOT NULL) s;
  SELECT a.stripe_customer_id INTO _mapped FROM public.platform_billing_accounts a WHERE a.tenant_id = _t;
  _state := CASE WHEN _mapped IS NOT NULL THEN 'mapped' ELSE 'absent' END;   -- the mutant: never says ambiguous
  RETURN QUERY SELECT _t, 'top_level_solo'::text, 'member'::text, false, _state, false, false, 'none'::text, false;
END $$;
UPDATE public.profiles SET active_tenant_id = (SELECT solo_b FROM _f) WHERE user_id = (SELECT u_owner FROM _f);
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 103, CASE WHEN a.billing_account_state <> 'ambiguous' THEN 'ok' ELSE 'FAIL' END,
  'M3 ambiguity-collapse mutant: P12 goes red (two ids reported as absent) — the assertion catches it'
  FROM public.get_workspace_billing_authority() a;
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT count(*) FILTER (WHERE res='ok' AND ord > 100) AS mutants_caught,
       count(*) FILTER (WHERE res NOT IN ('ok','info') AND ord > 100) AS mutants_missed,
       count(*) FILTER (WHERE res='ok' AND ord = 100) AS restore_control_ok,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) AS lines
FROM _p WHERE ord >= 100;

ROLLBACK;
