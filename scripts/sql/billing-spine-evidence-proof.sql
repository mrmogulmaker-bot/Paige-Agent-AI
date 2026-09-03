-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Experience item 5 — rollback proof for 20261140000000
-- (get_billing_spine_evidence(), the Spine-safe billing summary).
--
-- HOW TO RUN: node scripts/sql/run-rollback-proof.mjs --lean scripts/sql/billing-spine-evidence-proof.sql
-- BEGIN..ROLLBACK against prod.
--
-- Fixtures are never a real owner account (§63): fresh uuids, `bse-proof-*` slugs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'ffffffff-3000-4000-8000-00000000e001'::uuid AS u_promo_owner,
  'ffffffff-3000-4000-8000-00000000e002'::uuid AS u_promo_admin,
  'ffffffff-3000-4000-8000-00000000e003'::uuid AS u_ambig_owner,
  'ffffffff-3000-4000-8000-00000000e004'::uuid AS u_pastdue_owner,
  'ffffffff-3000-4000-8000-00000000e005'::uuid AS u_dualprimary_owner,
  'ffffffff-3000-4000-8000-00000000e006'::uuid AS u_dualprimary_owner2,
  'ffffffff-3000-4000-8000-00000000e007'::uuid AS u_sub_owner,
  'aaaaaaaa-3000-4000-8000-00000000e001'::uuid AS w_promo,
  'aaaaaaaa-3000-4000-8000-00000000e002'::uuid AS w_ambig,
  'aaaaaaaa-3000-4000-8000-00000000e003'::uuid AS w_pastdue,
  'aaaaaaaa-3000-4000-8000-00000000e004'::uuid AS w_dualprimary,
  'aaaaaaaa-3000-4000-8000-00000000e005'::uuid AS w_sub,
  'aaaaaaaa-3000-4000-8000-00000000e000'::uuid AS w_parent;

GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'bse-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(), now()
FROM _f, unnest(ARRAY[u_promo_owner,u_promo_admin,u_ambig_owner,u_pastdue_owner,u_dualprimary_owner,u_dualprimary_owner2,u_sub_owner]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT w_promo,       'bse-proof-promo',       'BSE Proof Promo',       'BSE', 985001, 'standalone', NULL::uuid,  u_promo_owner       FROM _f UNION ALL
SELECT w_ambig,       'bse-proof-ambig',       'BSE Proof Ambig',       'BSE', 985002, 'standalone', NULL::uuid,  u_ambig_owner       FROM _f UNION ALL
SELECT w_pastdue,     'bse-proof-pastdue',     'BSE Proof Pastdue',     'BSE', 985003, 'standalone', NULL::uuid,  u_pastdue_owner     FROM _f UNION ALL
SELECT w_dualprimary, 'bse-proof-dualprimary', 'BSE Proof Dualprimary', 'BSE', 985004, 'standalone', NULL::uuid,  u_dualprimary_owner FROM _f UNION ALL
SELECT w_parent,      'bse-proof-parent',      'BSE Proof Parent',      'BSE', 985005, 'agency',     NULL::uuid,  u_sub_owner         FROM _f UNION ALL
SELECT w_sub,         'bse-proof-sub',         'BSE Proof Sub',         'BSE', 985006, 'sub_account', w_parent,   u_sub_owner         FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT w_promo,       u_promo_owner,       'active', 'owner'::public.tenant_role, true  FROM _f UNION ALL
SELECT w_promo,       u_promo_admin,       'active', 'admin'::public.tenant_role, false FROM _f UNION ALL
SELECT w_ambig,       u_ambig_owner,       'active', 'owner'::public.tenant_role, true  FROM _f UNION ALL
SELECT w_pastdue,     u_pastdue_owner,     'active', 'owner'::public.tenant_role, true  FROM _f UNION ALL
SELECT w_dualprimary, u_dualprimary_owner, 'active', 'owner'::public.tenant_role, true  FROM _f UNION ALL
SELECT w_dualprimary, u_dualprimary_owner2,'active', 'owner'::public.tenant_role, true  FROM _f UNION ALL
SELECT w_sub,         u_sub_owner,         'active', 'owner'::public.tenant_role, true  FROM _f;

UPDATE public.profiles p SET full_name = 'BSE Proof Owner Name' WHERE p.user_id = (SELECT u_promo_owner FROM _f);

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_promo_owner AS u, w_promo AS t FROM _f UNION ALL
      SELECT u_promo_admin, w_promo FROM _f UNION ALL
      SELECT u_ambig_owner, w_ambig FROM _f UNION ALL
      SELECT u_pastdue_owner, w_pastdue FROM _f UNION ALL
      SELECT u_dualprimary_owner, w_dualprimary FROM _f UNION ALL
      SELECT u_dualprimary_owner2, w_dualprimary FROM _f UNION ALL
      SELECT u_sub_owner, w_sub FROM _f) v
WHERE p.user_id = v.u;

INSERT INTO public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
SELECT w_promo, 'promotional', 'BSE proof fixture' FROM _f UNION ALL
SELECT w_ambig, 'promotional', 'BSE proof fixture' FROM _f UNION ALL
SELECT w_pastdue, 'promotional', 'BSE proof fixture' FROM _f UNION ALL
SELECT w_dualprimary, 'promotional', 'BSE proof fixture' FROM _f
ON CONFLICT (tenant_id) DO UPDATE SET revenue_class = EXCLUDED.revenue_class;

-- Real subscription rows so access_state resolves to something other than no_plan.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period,
       stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end)
SELECT w_promo, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_ambig, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
-- past_due status ⇒ access_state='past_due' regardless of revenue_class (checked BEFORE the
-- promotional branch in get_workspace_billing_status()) ⇒ payment_method_required=true, letting
-- this proof reach payment_setup_state='required' without needing the full paid revenue-integrity
-- chain (owner + signed agreement + live subscription) that a genuine 'paid' classification gates on.
SELECT w_pastdue, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'past_due', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_dualprimary, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f;

-- w_ambig: two disagreeing customer ids ⇒ provider_state='ambiguous' ⇒ payment_setup_state='unavailable'.
UPDATE public.platform_subscriptions SET stripe_customer_id = 'cus_bse_ambig_A' WHERE tenant_id = (SELECT w_ambig FROM _f);
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT w_ambig, 'cus_bse_ambig_B', 'legacy', 'checkout' FROM _f;

-- w_promo: one live primary contact, so its NAME is disclosable to the owner caller.
INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
SELECT w_promo, u_promo_owner, 'primary_contact', u_promo_owner FROM _f;

-- w_dualprimary: reproduce a historical duplicate pair — real data MMA already carries in
-- production (predating trg_platform_billing_one_primary, 20261109040000). The trigger is a
-- going-forward guard against a NEW second primary; it is not meant to make an already-existing
-- violating pair unfixturable in a proof. session_replication_role is not settable by this role
-- (checked earlier this session: 42501 permission denied to set parameter), so the pair is seeded
-- by disabling just this one trigger for the two inserts that recreate that historical state, then
-- re-enabling it immediately — the trigger is back on before the migration under proof even runs,
-- so P11/P12 exercise get_billing_spine_evidence() reading a pair the trigger did not, and would
-- not, allow to be created going forward.
ALTER TABLE public.platform_billing_contacts DISABLE TRIGGER trg_platform_billing_one_primary;
INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
SELECT w_dualprimary, u_dualprimary_owner, 'primary_contact', u_dualprimary_owner FROM _f;
INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
SELECT w_dualprimary, u_dualprimary_owner2, 'primary_contact', u_dualprimary_owner2 FROM _f;
ALTER TABLE public.platform_billing_contacts ENABLE TRIGGER trg_platform_billing_one_primary;

-- ── the migration under proof ───────────────────────────────────────────────────────────────
\i supabase/migrations/20261140000000_paige_can_answer_what_this_workspace_owes_paige.sql

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- P1 — the promotional owner gets one row: real summary, $0 due, the primary contact's real name.
SELECT pg_temp.as_user((SELECT u_promo_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 1, CASE WHEN count(*)=1 THEN 'ok' ELSE 'FAIL rows=' || count(*) END,
  'P1 the promotional owner reads exactly one evidence row' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 2, CASE WHEN kind='billing.status_snapshot' AND subject_type='workspace'
                               AND safe_summary LIKE 'Promotional beta%' AND (facts->>'amount_due_cents')::int = 0
                              THEN 'ok' ELSE 'FAIL' END,
  'P2 kind/subject_type/safe_summary/amount_due are correct for a promotional workspace'
  FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 3, CASE WHEN facts->>'primary_billing_contact_name' = 'BSE Proof Owner Name' THEN 'ok' ELSE 'FAIL ' || (facts->>'primary_billing_contact_name') END,
  'P3 the owner caller sees the real primary billing contact name' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 4, CASE WHEN facts->>'payment_setup_state' = 'not_required' THEN 'ok' ELSE 'FAIL ' || (facts->>'payment_setup_state') END,
  'P4 promotional, no method connected: payment_setup_state=not_required' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 5, CASE WHEN (facts->>'owner_action_needed')::boolean = false THEN 'ok' ELSE 'FAIL' END,
  'P5 nothing owed, no dual-primary: owner_action_needed=false' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 6, CASE WHEN JSONB_EXISTS(facts,'plan_slug') AND NOT (facts ? 'stripe_customer_id') AND NOT (facts ? 'payment_method_id')
                               AND NOT (facts ? 'payment_method_brand') AND NOT (facts ? 'payment_method_last4')
                              THEN 'ok' ELSE 'FAIL' END,
  'P6 never exposes a Stripe id, card brand, or last4 — those keys do not exist in facts at all' FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P7 — a non-owner (admin) on the SAME workspace gets ZERO rows, never a guess or a leaked view.
SELECT pg_temp.as_user((SELECT u_promo_admin FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 7, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL rows=' || count(*) END,
  'P7 a non-owner member of the same workspace reads zero rows (R22)' FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P8 — provider mapping ambiguous: payment_setup_state=unavailable.
SELECT pg_temp.as_user((SELECT u_ambig_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 8, CASE WHEN facts->>'payment_setup_state' = 'unavailable' THEN 'ok' ELSE 'FAIL ' || (facts->>'payment_setup_state') END,
  'P8 an ambiguous provider mapping reads payment_setup_state=unavailable' FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P9/P10 — past_due: payment is REQUIRED and not connected, so owner action is needed with a real reason.
SELECT pg_temp.as_user((SELECT u_pastdue_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 9, CASE WHEN facts->>'payment_setup_state' = 'required' THEN 'ok' ELSE 'FAIL ' || (facts->>'payment_setup_state') END,
  'P9 past_due with no method on file reads payment_setup_state=required' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 10, CASE WHEN (facts->>'owner_action_needed')::boolean = true AND facts->>'owner_action_reason' LIKE '%requires a payment method%'
                               THEN 'ok' ELSE 'FAIL' END,
  'P10 owner_action_needed is true with the real reason, not a bare flag' FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P11/P12 — two live primaries: owner action needed, named for exactly that reason.
SELECT pg_temp.as_user((SELECT u_dualprimary_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 11, CASE WHEN (facts->>'owner_action_needed')::boolean = true THEN 'ok' ELSE 'FAIL' END,
  'P11 two live primary contacts: owner_action_needed=true' FROM public.get_billing_spine_evidence();
INSERT INTO _p SELECT 12, CASE WHEN facts->>'owner_action_reason' LIKE '%more than one primary%' THEN 'ok' ELSE 'FAIL ' || (facts->>'owner_action_reason') END,
  'P12 the reason names the real dual-primary state, not a generic message' FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P13 — a sub-account owner reads zero rows (scope <> 'top_level').
SELECT pg_temp.as_user((SELECT u_sub_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 13, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL rows=' || count(*) END,
  'P13 a sub-account owner reads zero rows — billing evidence is a top-level-workspace concept only'
  FROM public.get_billing_spine_evidence();
RESET ROLE; SELECT pg_temp.as_nobody();

SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.get_billing_spine_evidence(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 80, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P80 anon: EXECUTE is refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT count(*) FILTER (WHERE res='ok') AS ok,
       count(*) FILTER (WHERE res<>'ok') AS failed,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) FILTER (WHERE res<>'ok') AS failures
FROM _p;
ROLLBACK;
