-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Slice C — rollback proof for 20261120000000 (get_workspace_billing_status() excludes
-- Agency/Enterprise top-level tenants from Solo plan/usage facts).
--
-- HOW TO RUN: node scripts/sql/run-rollback-proof.mjs --lean scripts/sql/billing-status-scope-proof.sql
-- BEGIN..ROLLBACK against prod.
--
-- Fixtures are never a real owner account (§63): fresh uuids, `bsc-proof-*` slugs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'ffffffff-2000-4000-8000-00000000c001'::uuid AS u_agency_owner,
  'ffffffff-2000-4000-8000-00000000c002'::uuid AS u_enterprise_owner,
  'ffffffff-2000-4000-8000-00000000c003'::uuid AS u_solo_owner,
  'aaaaaaaa-2000-4000-8000-00000000c001'::uuid AS w_agency,
  'aaaaaaaa-2000-4000-8000-00000000c002'::uuid AS w_enterprise,
  'aaaaaaaa-2000-4000-8000-00000000c003'::uuid AS w_solo;

GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'bsc-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(), now()
FROM _f, unnest(ARRAY[u_agency_owner,u_enterprise_owner,u_solo_owner]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT w_agency,     'bsc-proof-agency',     'BSC Proof Agency',     'BSA', 984001, 'agency',     NULL::uuid, u_agency_owner     FROM _f UNION ALL
SELECT w_enterprise, 'bsc-proof-enterprise', 'BSC Proof Enterprise', 'BSB', 984002, 'enterprise', NULL::uuid, u_enterprise_owner FROM _f UNION ALL
SELECT w_solo,       'bsc-proof-solo',       'BSC Proof Solo',       'BSC', 984003, 'standalone', NULL::uuid, u_solo_owner       FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT w_agency,     u_agency_owner,     'active', 'owner'::public.tenant_role, true FROM _f UNION ALL
SELECT w_enterprise, u_enterprise_owner, 'active', 'owner'::public.tenant_role, true FROM _f UNION ALL
SELECT w_solo,       u_solo_owner,       'active', 'owner'::public.tenant_role, true FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_agency_owner AS u, w_agency AS t FROM _f UNION ALL
      SELECT u_enterprise_owner, w_enterprise FROM _f UNION ALL
      SELECT u_solo_owner, w_solo FROM _f) v
WHERE p.user_id = v.u;

INSERT INTO public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
SELECT w_agency, 'promotional', 'BSC proof fixture' FROM _f UNION ALL
SELECT w_enterprise, 'promotional', 'BSC proof fixture' FROM _f UNION ALL
SELECT w_solo, 'promotional', 'BSC proof fixture' FROM _f
ON CONFLICT (tenant_id) DO UPDATE SET revenue_class = EXCLUDED.revenue_class;

-- w_solo needs a real subscription row too, or access_state reads no_plan rather than
-- promotional — the same shape every real Solo workspace is provisioned with.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period,
       stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end)
SELECT w_solo, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f;

-- Slice B's payment-method columns, idempotently, so Slice C's function (which selects them) has
-- something to select against on an environment where Slice B has not been applied yet either.
ALTER TABLE public.platform_billing_accounts
  ADD COLUMN IF NOT EXISTS payment_method_id             text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_brand           text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_last4           text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_exp_month       integer NULL,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year        integer NULL,
  ADD COLUMN IF NOT EXISTS payment_method_connected_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS payment_method_updated_at      timestamptz NULL;

-- ── the migration under proof ───────────────────────────────────────────────────────────────
\i supabase/migrations/20261120000000_billing_status_excludes_agency_and_enterprise.sql

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- C10 — an Agency tenant reads scope='agency', not 'top_level', and carries no plan/usage facts.
SELECT pg_temp.as_user((SELECT u_agency_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 10, CASE WHEN scope='agency' AND NOT can_view AND NOT can_manage AND access_state='unknown'
                                 AND plan_slug IS NULL AND amount_due_cents IS NULL
                               THEN 'ok' ELSE 'FAIL scope=' || scope || ' access_state=' || access_state END,
  'C10 an Agency top-level tenant reads scope=agency, no plan/usage facts, never top_level'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- C11 — an Enterprise tenant reads scope='enterprise', same shape.
SELECT pg_temp.as_user((SELECT u_enterprise_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 11, CASE WHEN scope='enterprise' AND NOT can_view AND NOT can_manage
                               THEN 'ok' ELSE 'FAIL scope=' || scope END,
  'C11 an Enterprise top-level tenant reads scope=enterprise, never top_level'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- C12 — the ordinary Solo case still works: scope='top_level', owner sees real facts.
SELECT pg_temp.as_user((SELECT u_solo_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 12, CASE WHEN scope='top_level' AND can_view AND can_manage AND access_state='promotional'
                               THEN 'ok' ELSE 'FAIL scope=' || scope || ' access_state=' || access_state END,
  'C12 an ordinary top-level Solo tenant is unaffected: scope=top_level, promotional access reported'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.get_workspace_billing_status(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 80, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P80 anon: EXECUTE on the status read is still refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT count(*) FILTER (WHERE res='ok') AS ok,
       count(*) FILTER (WHERE res<>'ok') AS failed,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) FILTER (WHERE res<>'ok') AS failures
FROM _p;
ROLLBACK;
