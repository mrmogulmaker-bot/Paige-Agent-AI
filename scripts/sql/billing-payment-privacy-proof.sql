-- Hosted BEGIN/ROLLBACK proof; only disposable fixture records, no provider calls.
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
-- (the shape every real workspace is in) EXCEPT w_wrongtable, which deliberately puts one there â€”
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
-- would also find elsewhere â€” simulated instead by giving it two DISAGREEING sources: one on
-- platform_subscriptions (used by the layer1 helper) and a row here naming a different customer.
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT w_mapped, 'cus_bpm_mapped_only', 'legacy', 'checkout' FROM _f UNION ALL
SELECT w_pm,     'cus_bpm_pm_customer', 'legacy', 'checkout' FROM _f;

-- w_ambig: platform_subscriptions carries cus_bpm_ambig_A (feeds the layer1 helper), and the
-- mapping table names a DIFFERENT customer, cus_bpm_ambig_B â€” the disagreement the function must
-- report as `ambiguous`, never silently pick one.
UPDATE public.platform_subscriptions SET stripe_customer_id = 'cus_bpm_ambig_A' WHERE tenant_id = (SELECT w_ambig FROM _f);
INSERT INTO public.platform_billing_accounts (tenant_id, stripe_customer_id, stripe_account, source)
SELECT w_ambig, 'cus_bpm_ambig_B', 'legacy', 'checkout' FROM _f;


-- APPLY_BILLING_PRIVACY_MIGRATION
UPDATE public.platform_billing_accounts SET payment_method_id='pm_private_fixture',
 payment_method_brand='private_brand', payment_method_last4='9999', payment_method_exp_month=11,
 payment_method_exp_year=2039 WHERE tenant_id=(SELECT w_pm FROM _f);
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT u_pm_owner FROM _f),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 1, CASE WHEN s.payment_method_connected AND s.access_state='promotional' AND s.amount_due_cents=0 THEN 'ok' ELSE 'FAIL' END,'connected promotional remains zero due' FROM public.get_workspace_billing_status() s;
INSERT INTO _p SELECT 2, CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(to_jsonb(s)) k WHERE k ~ 'brand|last4|exp_month|exp_year|address|customer_id|payment_method_id|^token$|access_token|payload') THEN 'ok' ELSE 'FAIL' END,'no sensitive keys in actual response' FROM public.get_workspace_billing_status() s;
INSERT INTO _p SELECT 3, CASE WHEN NOT to_jsonb(s)::text ~ 'private_brand|9999|2039|pm_private_fixture' THEN 'ok' ELSE 'FAIL' END,'no sensitive values in actual response' FROM public.get_workspace_billing_status() s;
INSERT INTO _p SELECT 4, CASE WHEN NOT EXISTS(SELECT 1 FROM public.get_billing_spine_evidence() e WHERE e.facts::text ~ 'private_brand|9999|2039|pm_private_fixture') THEN 'ok' ELSE 'FAIL' END,'Spine caller survives changed response without details';
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT u_mapped_owner FROM _f),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 5, CASE WHEN s.tenant_id=(SELECT w_mapped FROM _f) AND NOT s.payment_method_connected THEN 'ok' ELSE 'FAIL' END,'switch tenant does not expose other connection' FROM public.get_workspace_billing_status() s;
RESET ROLE;
SELECT json_build_object('total',count(*),'failed',count(*) FILTER(WHERE res<>'ok'),'checks',json_agg(row_to_json(_p))) FROM _p;
ROLLBACK;
