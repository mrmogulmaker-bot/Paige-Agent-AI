-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The Billing Experience source truth — rollback proof for 20261109040000.
--
-- HOW TO RUN: node scripts/sql/run-rollback-proof.mjs --lean scripts/sql/billing-status-proof.sql
-- BEGIN..ROLLBACK against prod. Proves the SQL runs and the properties hold; proves NOTHING about
-- the migration being live (that is the post-merge persisted-apply confirmation, §32.a).
--
-- FIXTURE PREMISES, both learned the hard way on the previous slice and asserted as properties
-- there (P36/P37): inserting a tenant AUTO-CREATES a 'promotional' classification row, so an
-- unclassified fixture must DELETE it; and 'paid' is a gated mint needing an owner, a signed
-- subscriber agreement and a live provider subscription, so ordering matters.
--
-- Fixtures are never a real owner account (§63): fresh uuids, `bst-proof-*` slugs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

INSERT INTO _p SELECT 1, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C1 control: get_workspace_billing_status() does not exist yet'
  FROM pg_proc WHERE proname='get_workspace_billing_status';
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C2 control: the one-primary trigger does not exist yet'
  FROM pg_trigger WHERE tgname='trg_platform_billing_one_primary';
INSERT INTO _p SELECT 3, CASE WHEN count(*)>0 THEN 'ok' ELSE 'FAIL' END,
  'C3 premise: the sole-primary revoke guard is currently hitched to a Stripe customer id'
  FROM pg_proc p WHERE p.proname='platform_billing_contact_revoke'
    AND pg_get_functiondef(p.oid) LIKE '%stripe_customer_id IS NOT NULL%';

CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'dddddddd-0000-4000-8000-00000000f001'::uuid AS u_promo_owner,
  'dddddddd-0000-4000-8000-00000000f002'::uuid AS u_promo_second,
  'dddddddd-0000-4000-8000-00000000f003'::uuid AS u_member,
  'dddddddd-0000-4000-8000-00000000f004'::uuid AS u_noplan,
  'dddddddd-0000-4000-8000-00000000f005'::uuid AS u_internal,
  'dddddddd-0000-4000-8000-00000000f006'::uuid AS u_sub,
  'dddddddd-0000-4000-8000-00000000f007'::uuid AS u_dual,
  'dddddddd-0000-4000-8000-00000000f008'::uuid AS u_dual_b,
  'eeeeeeee-0000-4000-8000-00000000f001'::uuid AS w_promo,
  'eeeeeeee-0000-4000-8000-00000000f002'::uuid AS w_noplan,
  'eeeeeeee-0000-4000-8000-00000000f003'::uuid AS w_internal,
  'eeeeeeee-0000-4000-8000-00000000f004'::uuid AS w_agency,
  'eeeeeeee-0000-4000-8000-00000000f005'::uuid AS w_sub,
  'eeeeeeee-0000-4000-8000-00000000f006'::uuid AS w_dual;
GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'bst-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(), now()
FROM _f, unnest(ARRAY[u_promo_owner,u_promo_second,u_member,u_noplan,u_internal,u_sub,u_dual,u_dual_b]) AS u;

INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT w_promo,   'bst-proof-promo',    'BST Proof Promo Co',   'BSA', 982001, 'standalone', NULL::uuid, u_promo_owner FROM _f UNION ALL
SELECT w_noplan,  'bst-proof-noplan',   'BST Proof No Plan',    'BSB', 982002, 'standalone', NULL::uuid, u_noplan      FROM _f UNION ALL
SELECT w_internal,'bst-proof-internal', 'BST Proof Internal',   'BSC', 982003, 'standalone', NULL::uuid, u_internal    FROM _f UNION ALL
SELECT w_agency,  'bst-proof-agency',   'BST Proof Agency',     'BSD', 982004, 'agency',     NULL::uuid, NULL::uuid    FROM _f UNION ALL
SELECT w_dual,    'bst-proof-dual',     'BST Proof Dual Prim',  'BSF', 982006, 'standalone', NULL::uuid, u_dual        FROM _f;
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT w_sub, 'bst-proof-sub', 'BST Proof Sub', 'BSE', 982005, 'sub_account', w_agency, u_sub FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT w_promo,    u_promo_owner,  'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_promo,    u_promo_second, 'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_promo,    u_member,       'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT w_noplan,   u_noplan,       'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_internal, u_internal,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_sub,      u_sub,          'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_dual,     u_dual,         'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT w_dual,     u_dual_b,       'active', 'owner'::public.tenant_role,  true  FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_promo_owner AS u, w_promo AS t FROM _f UNION ALL
      SELECT u_member, w_promo FROM _f UNION ALL
      SELECT u_noplan, w_noplan FROM _f UNION ALL
      SELECT u_internal, w_internal FROM _f UNION ALL
      SELECT u_sub, w_sub FROM _f UNION ALL
      SELECT u_dual, w_dual FROM _f) v
WHERE p.user_id = v.u;

-- Classification. The tenants trigger already wrote 'promotional' for all of them, so these are
-- UPDATEs of a row that exists (P36), and the unclassified case has to be created by DELETE.
INSERT INTO public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
SELECT w_internal, 'internal_test', 'BST proof fixture' FROM _f
ON CONFLICT (tenant_id) DO UPDATE SET revenue_class = EXCLUDED.revenue_class;
DELETE FROM public.tenant_revenue_classification WHERE tenant_id = (SELECT w_noplan FROM _f);

-- Subscriptions: promotional workspaces reference a plan and have NO provider mapping — the shape
-- every real workspace is in. w_noplan gets none at all.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period,
       stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end)
SELECT w_promo, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT w_dual,  (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '10 days', now() + interval '20 days' FROM _f;

-- Some real clients and AI usage so included-vs-used is a measurement, not a zero.
-- `clients` is the contacts table (there is no public.contacts), and it requires created_by,
-- first_name, last_name and its own account_number — none of which carry defaults.
INSERT INTO public.clients (tenant_id, created_by, first_name, last_name, account_number, status)
SELECT w_promo, u_promo_owner, 'BST', 'Proof ' || g, 'BSTPROOF-' || g, 'active'
FROM _f, generate_series(1,4) AS g;

-- The two-primary pair is seeded HERE, before the migration, because that is exactly how it came
-- to exist in production: history was written when nothing forbade it. Disabling the trigger after
-- the fact would have been a trick that proved less — and this environment cannot set
-- session_replication_role anyway, which is a fair constraint to have been stopped by.
INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
SELECT w_dual, u_dual,   'primary_contact', u_dual FROM _f UNION ALL
SELECT w_dual, u_dual_b, 'primary_contact', u_dual FROM _f;

-- ── the migration under proof ───────────────────────────────────────────────────────────────
\i supabase/migrations/20261109040000_paige_bills_the_workspace_and_says_so.sql

-- ── impersonation ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- ── P10s: a promotional workspace reads as promotional, not as a billing failure ────────────
SELECT pg_temp.as_user((SELECT u_promo_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 10, CASE WHEN access_state='promotional' THEN 'ok' ELSE 'FAIL ' || access_state END,
  'P10 a promotional workspace with NO Stripe mapping reads access_state=promotional — never a billing failure'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 11, CASE WHEN amount_due_cents=0 AND NOT payment_method_required THEN 'ok' ELSE 'FAIL' END,
  'P11 nothing is due and no payment method is required while promotional'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 12, CASE WHEN billed_by='PAIGE Platform' THEN 'ok' ELSE 'FAIL ' || COALESCE(billed_by,'null') END,
  'P12 the biller is named as the PAIGE Platform, not as a payment processor'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 13, CASE WHEN workspace_name='BST Proof Promo Co' THEN 'ok' ELSE 'FAIL' END,
  'P13 the workspace names itself, so the owner can see which account they are viewing'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 14, CASE WHEN provider_state='not_created' THEN 'ok' ELSE 'FAIL ' || provider_state END,
  'P14 the missing provider mapping is reported as its own readiness fact, separate from access'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 15, CASE WHEN seats_included=3 AND seats_used=3 AND contacts_included=250 AND contacts_used=4
                               THEN 'ok' ELSE 'FAIL seats=' || seats_used || ' contacts=' || contacts_used END,
  'P15 included-versus-used is measured from real sources (active members, public.clients)'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 16, CASE WHEN sms_included=200 AND sms_used IS NULL THEN 'ok' ELSE 'FAIL' END,
  'P16 SMS included is stated; SMS used is NULL because no sent-SMS source exists — never a fabricated 0'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 17, CASE WHEN ai_tokens_included=5000000 AND ai_credit_token_ratio=1000 THEN 'ok' ELSE 'FAIL' END,
  'P17 the AI allowance and its credit ratio travel with the status read'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 18, CASE WHEN paid_addons_count=0 THEN 'ok' ELSE 'FAIL ' || paid_addons_count END,
  'P18 a free Marketplace install is NOT counted as a paid add-on'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 19, CASE WHEN notice_delivery_state='no_sender' THEN 'ok' ELSE 'FAIL' END,
  'P19 notice delivery reports no sender rather than implying an inbox'
  FROM public.get_workspace_billing_status();
INSERT INTO _p SELECT 20, CASE WHEN trial_ends_at IS NULL THEN 'ok' ELSE 'FAIL' END,
  'P20 a promotional workspace is NOT mislabelled a trial by its seeded period end'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- ── P30s: the states that must stay distinct ────────────────────────────────────────────────
SELECT pg_temp.as_user((SELECT u_noplan FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 30, CASE WHEN access_state='no_plan' AND billed_by IS NULL THEN 'ok' ELSE 'FAIL ' || access_state END,
  'P30 a workspace with no subscription AND no classification reads no_plan — not promotional (R13)'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user((SELECT u_internal FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 31, CASE WHEN access_state='internal' THEN 'ok' ELSE 'FAIL ' || access_state END,
  'P31 an internal_test workspace reads internal — it is never dressed up as promotional beta'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user((SELECT u_sub FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 32, CASE WHEN scope='sub_account' AND plan_slug IS NULL AND amount_due_cents IS NULL
                               THEN 'ok' ELSE 'FAIL ' || scope END,
  'P32 a sub-account claims no plan and no charge — it is billed through its parent, not here'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user((SELECT u_member FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 33, CASE WHEN NOT can_view AND access_state='unknown' AND plan_slug IS NULL
                               THEN 'ok' ELSE 'FAIL' END,
  'P33 a non-owner member is refused the plan and the figures (R22), and is told nothing about the account'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

-- ── P40s: the two-primary defect ────────────────────────────────────────────────────────────
-- The pre-existing duplicate pair is created directly, as history did, to prove the trigger
-- TOLERATES it rather than making the workspace unreadable.
SELECT pg_temp.as_user((SELECT u_dual FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 40, CASE WHEN primary_contact_count=2 AND primary_selection_needed
                               THEN 'ok' ELSE 'FAIL count=' || primary_contact_count END,
  'P40 a workspace left with two live primaries reports selection_needed — the platform does not choose one'
  FROM public.get_workspace_billing_status();
RESET ROLE; SELECT pg_temp.as_nobody();

DO $$
DECLARE _blocked boolean := false; _t uuid; _u uuid;
BEGIN
  SELECT w_promo, u_promo_owner INTO _t, _u FROM _f;
  INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
  VALUES (_t, _u, 'primary_contact', _u);
  BEGIN
    INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
    SELECT _t, u_promo_second, 'primary_contact', _u FROM _f;
  EXCEPTION WHEN unique_violation THEN _blocked := true;
  END;
  INSERT INTO _p SELECT 41, CASE WHEN _blocked THEN 'ok' ELSE 'FAIL a second primary was accepted' END,
    'P41 a SECOND live primary is refused on the raw table, not merely in the designate RPC';
END $$;

DO $$
DECLARE _ok boolean := false; _t uuid;
BEGIN
  SELECT w_promo INTO _t FROM _f;
  BEGIN
    INSERT INTO public.platform_billing_contacts (tenant_id, user_id, designation, designated_by)
    SELECT _t, u_member, 'delegate', u_promo_owner FROM _f;
    _ok := true;
  EXCEPTION WHEN others THEN _ok := false;
  END;
  INSERT INTO _p SELECT 42, CASE WHEN _ok THEN 'ok' ELSE 'FAIL a delegate was blocked' END,
    'P42 the guard constrains primaries only — a delegate is still addable alongside one';
END $$;

-- ── P50s: the sole-primary rule no longer depends on Stripe ─────────────────────────────────
-- The contact ids are captured HERE, before any role switch. RLS on platform_billing_contacts
-- hides these rows from the `authenticated` role, so a lookup inside the impersonated block returned
-- NULL and the revoke raised billing_contact_not_found — a fixture failure that would have read as
-- a guard failure. The ACT still runs as the impersonated owner; only the id lookup is elevated.
CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  (SELECT b.id FROM public.platform_billing_contacts b, _f f
    WHERE b.tenant_id=f.w_promo AND b.designation='primary_contact' AND b.revoked_at IS NULL LIMIT 1) AS promo_primary,
  (SELECT b.id FROM public.platform_billing_contacts b, _f f
    WHERE b.tenant_id=f.w_dual AND b.designation='primary_contact' AND b.revoked_at IS NULL LIMIT 1) AS dual_primary;
GRANT SELECT ON _ids TO authenticated;

INSERT INTO _p SELECT 49, CASE WHEN promo_primary IS NOT NULL AND dual_primary IS NOT NULL
                               THEN 'ok' ELSE 'FAIL the fixture ids are null, so the revoke tests below would be vacuous' END,
  'P49 both revoke targets resolved — without this the next two properties pass for the wrong reason'
  FROM _ids;

INSERT INTO _p SELECT 50, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL still gated on Stripe' END,
  'P50 the revoke guard no longer requires a stripe_customer_id to protect the sole primary'
  FROM pg_proc p WHERE p.proname='platform_billing_contact_revoke'
    AND pg_get_functiondef(p.oid) LIKE '%stripe_customer_id IS NOT NULL%';

SELECT pg_temp.as_user((SELECT u_promo_owner FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE _blocked boolean := false; _cid uuid;
BEGIN
  SELECT promo_primary INTO _cid FROM _ids;
  BEGIN PERFORM public.platform_billing_contact_revoke(_cid);
  EXCEPTION WHEN insufficient_privilege THEN _blocked := true;
  END;
  INSERT INTO _p SELECT 51, CASE WHEN _blocked THEN 'ok' ELSE 'FAIL the sole primary was removable' END,
    'P51 the SOLE primary cannot be removed on a promotional workspace with no Stripe customer (this was inert before)';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

SELECT pg_temp.as_user((SELECT u_dual FROM _f));
SET LOCAL ROLE authenticated;
DO $$
DECLARE _revoked boolean := false; _cid uuid;
BEGIN
  SELECT dual_primary INTO _cid FROM _ids;
  BEGIN PERFORM public.platform_billing_contact_revoke(_cid); _revoked := true;
  EXCEPTION WHEN others THEN _revoked := false;
  END;
  INSERT INTO _p SELECT 52, CASE WHEN _revoked THEN 'ok' ELSE 'FAIL the owner cannot resolve the duplicate' END,
    'P52 one of TWO primaries IS revocable — otherwise the owner could never resolve the selection-needed state';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- ── P60s: the seam ──────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.get_workspace_billing_status(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 60, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END,
    'P60 anon: EXECUTE on the status read is refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

INSERT INTO _p SELECT 61, CASE WHEN pg_get_function_identity_arguments(oid)='' THEN 'ok' ELSE 'FAIL' END,
  'P61 get_workspace_billing_status() takes no argument — the workspace is server-derived, never supplied'
  FROM pg_proc WHERE proname='get_workspace_billing_status';

SELECT count(*) FILTER (WHERE res='ok') AS ok,
       count(*) FILTER (WHERE res<>'ok') AS failed,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) AS lines
FROM _p;
ROLLBACK;
