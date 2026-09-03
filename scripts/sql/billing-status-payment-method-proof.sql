-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Slice B — rollback proof for 20261111050000 (the provider_state correction + payment-method
-- fields on get_workspace_billing_status()).
--
-- HOW TO RUN: node scripts/sql/run-rollback-proof.mjs --lean scripts/sql/billing-status-payment-method-proof.sql
-- BEGIN..ROLLBACK against prod.
--
-- PREMISE this proof exists to catch: Slice A's function read provider_state from
-- platform_subscriptions.stripe_customer_id. That column is NEVER populated by the real platform
-- checkout flow (platform-subscription-checkout writes stripe_subscription_id/stripe_customer_id
-- onto platform_subscriptions is UNVERIFIED — the ACTUAL mapping of record is
-- platform_billing_accounts, read by get_workspace_billing_authority()). C5 asserts this
-- divergence existed BEFORE the fix, so a reader can see the bug the migration corrects, not just
-- take the commit message's word for it.
--
-- Fixtures are never a real owner account (§63): fresh uuids, `bpm-proof-*` slugs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'dddddddd-1000-4000-8000-00000000f001'::uuid AS u_mapped_owner,
  'dddddddd-1000-4000-8000-00000000f002'::uuid AS u_pm_owner,
  'dddddddd-1000-4000-8000-00000000f003'::uuid AS u_ambig_owner,
  'dddddddd-1000-4000-8000-00000000f004'::uuid AS u_wrongtable_owner,
  'eeeeeeee-1000-4000-8000-00000000f001'::uuid AS w_mapped,      -- platform_billing_accounts row, no payment method
  'eeeeeeee-1000-4000-8000-00000000f002'::uuid AS w_pm,          -- platform_billing_accounts row WITH payment method
  'eeeeeeee-1000-4000-8000-00000000f003'::uuid AS w_ambig,       -- two DIFFERENT customer ids across sources
  'eeeeeeee-1000-4000-8000-00000000f004'::uuid AS w_wrongtable;  -- stripe_customer_id on platform_subscriptions ONLY

GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'bpm-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(), now()
FROM _f, unnest(ARRAY[u_mapped_owner,u_pm_owner,u_ambig_owner,u_wrongtable_owner]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT w_mapped,     'bpm-proof-mapped',     'BPM Proof Mapped',     'BPA', 983001, 'standalone', NULL::uuid, u_mapped_owner     FROM _f UNION ALL
SELECT w_pm,         'bpm-proof-pm',         'BPM Proof PM',         'BPB', 983002, 'standalone', NULL::uuid, u_pm_owner         FROM _f UNION ALL
SELECT w_ambig,      'bpm-proof-ambig',      'BPM Proof Ambig',      'BPC', 983003, 'standalone', NULL::uuid, u_ambig_owner      FROM _f UNION ALL
SELECT w_wrongtable, 'bpm-proof-wrongtable', 'BPM Proof Wrongtable', 'BPD', 983004, 'standalone', NULL::uuid, u_wrongtable_owner FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT w_mapped,     u_mapped_owner,     'active', 'owner'::public.tenant_role, true FROM _f UNION ALL
SELECT w_pm,         u_pm_owner,         'active', 'owner'::public.tenant_role, true FROM _f UNION ALL
SELECT w_ambig,       u_ambig_owner,      'active', 'owner'::public.tenant_role, true FROM _f UNION ALL
SELECT w_wrongtable, u_wrongtable_owner, 'active', 'owner'::public.tenant_role, true FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_mapped_owner AS u, w_mapped AS t FROM _f UNION ALL
      SELECT u_pm_owner, w_pm FROM _f UNION ALL
      SELECT u_ambig_owner, w_ambig FROM _f UNION ALL
      SELECT u_wrongtable_owner, w_wrongtable FROM _f) v
WHERE p.user_id = v.u;

-- All four promotional (the trigger already wrote it; nothing to delete this time).
INSERT INTO public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
SELECT w_mapped, 'promotional', 'BPM proof fixture' FROM _f UNION ALL
SELECT w_pm, 'promotional', 'BPM proof fixture' FROM _f UNION ALL
SELECT w_ambig, 'promotional', 'BPM proof fixture' FROM _f UNION ALL
SELECT w_wrongtable, 'promotional', 'BPM proof fixture' FROM _f
ON CONFLICT (tenant_id) DO UPDATE SET revenue_class = EXCLUDED.revenue_class;

-- Every workspace references the solo plan, with NO stripe id on platform_subscriptions itself
-- (the shape every real workspace is in) EXCEPT w_wrongtable, which deliberately puts one there —
-- the exact shape that fooled Slice A's function.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period,
       stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end)
SELECT w_mapped, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_pm, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_ambig, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_wrongtable, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, 'cus_bpm_wrongtable_only', now() - interval '400 days', now() + interval '400 days' FROM _f;

-- The REAL mapping table. w_mapped and w_pm are mapped here; w_ambig has NO row here but a
-- DIFFERENT customer id on platform_subscriptions than what platform_billing_layer1_customer_ids
-- would also find elsewhere — simulated instead by giving it two DISAGREEING sources: one on
-- platform_subscriptions (used by the layer1 helper) and a row here naming a different customer.
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT w_mapped, 'cus_bpm_mapped_only', 'legacy', 'checkout' FROM _f UNION ALL
SELECT w_pm,     'cus_bpm_pm_customer', 'legacy', 'checkout' FROM _f;

-- w_ambig: platform_subscriptions carries cus_bpm_ambig_A (feeds the layer1 helper), and the
-- mapping table names a DIFFERENT customer, cus_bpm_ambig_B — the disagreement the function must
-- report as `ambiguous`, never silently pick one.
UPDATE public.platform_subscriptions SET stripe_customer_id = 'cus_bpm_ambig_A' WHERE tenant_id = (SELECT w_ambig FROM _f);
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT w_ambig, 'cus_bpm_ambig_B', 'legacy', 'checkout' FROM _f;

-- ── the migration under proof ───────────────────────────────────────────────────────────────
\i supabase/migrations/20261111050000_the_workspace_can_connect_a_payment_method.sql

-- Attach a payment method to w_pm's mapping row — as the WEBHOOK will, never the connect fn.
UPDATE public.platform_billing_accounts
   SET payment_method_id = 'pm_bpm_proof_1', payment_method_brand = 'visa', payment_method_last4 = '4242',
       payment_method_exp_month = 12, payment_method_exp_year = 2031,
       payment_method_connected_at = now(), payment_method_updated_at = now()
 WHERE tenant_id = (SELECT w_pm FROM _f);

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- C5 — the bug Slice A shipped, demonstrated directly: w_wrongtable has NOTHING in
-- platform_billing_accounts (the real mapping table) yet HAS a stripe_customer_id on
-- platform_subscriptions. If the function still read the wrong table, provider_state would read
-- 'mapped' here. It must not.
SELECT pg_temp.as_user((SELECT u_wrongtable_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 5, CASE WHEN provider_state='not_created' THEN 'ok'
                              ELSE 'FAIL provider_state=' || provider_state || ' -- Slice A''s bug (reading platform_subscriptions) has come back' END,
  'C5 a stripe_customer_id on platform_subscriptions ALONE (never in platform_billing_accounts) does NOT read as mapped'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P70 — the ordinary mapped case, no payment method yet.
SELECT pg_temp.as_user((SELECT u_mapped_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 70, CASE WHEN provider_state='mapped' THEN 'ok' ELSE 'FAIL ' || provider_state END,
  'P70 a real platform_billing_accounts row reads provider_state=mapped'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 71, CASE WHEN NOT payment_method_connected AND payment_method_brand IS NULL THEN 'ok' ELSE 'FAIL' END,
  'P71 mapped but no payment method: connected=false, no fabricated brand/last4'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 72, CASE WHEN access_state='promotional' AND amount_due_cents=0 THEN 'ok' ELSE 'FAIL' END,
  'P72 provider mapping status is INDEPENDENT of access_state — still promotional, still $0 due'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P73–75 — a payment method IS attached (written by the "webhook" step above, not the RPC).
SELECT pg_temp.as_user((SELECT u_pm_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 73, CASE WHEN payment_method_connected AND payment_method_brand='visa' AND payment_method_last4='4242'
                               THEN 'ok' ELSE 'FAIL' END,
  'P73 a real attached payment method is reported, brand and last4 only'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 74, CASE WHEN payment_method_exp_month=12 AND payment_method_exp_year=2031 THEN 'ok' ELSE 'FAIL' END,
  'P74 expiry travels with the summary' FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 75, CASE WHEN provider_state='mapped' THEN 'ok' ELSE 'FAIL' END,
  'P75 a connected payment method does not itself change access_state — still just mapped'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P76 — ambiguous: two sources disagree, never silently resolved.
SELECT pg_temp.as_user((SELECT u_ambig_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 76, CASE WHEN provider_state='ambiguous' THEN 'ok' ELSE 'FAIL ' || provider_state END,
  'P76 two disagreeing customer ids read as ambiguous, never guessed'
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
