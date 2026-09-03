-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- AI usage allowance — rollback proof for migration 20261105000000
-- (platform_subscription_plans.included_ai_tokens_month / ai_credit_token_ratio,
--  public.get_workspace_ai_usage()).
--
-- RENUMBERED from 20261050000000 before merge, and the reason matters more than the number:
-- reconciling `main` brought in migrations 20261102/03/04, all of which are ALREADY APPLIED on prod
-- (max applied version 20261104000000, queried 2026-09-03). A migration whose version sorts BELOW
-- the applied maximum is the §32.a false-green in its purest form — it merges, CI reports success,
-- and the schema never changes. Renumbering above the applied max is free while nothing has run it.
--
-- HOW TO RUN: `node scripts/sql/run-rollback-proof.mjs scripts/sql/ai-usage-allowance-proof.sql`
-- expands the `\i` and prints one batch, executed as a single statement batch (psql with
-- ON_ERROR_STOP, or the Supabase MCP execute_sql). BEGIN..ROLLBACK: it installs the migration,
-- seeds throwaway users/tenants/usage, impersonates each caller with the REAL request.jwt.claims +
-- SET LOCAL ROLE mechanism, grades every property, and leaves the database untouched.
--
-- WHAT A ROLLBACK PROOF SHOWS AND DOES NOT SHOW (§32): it proves the SQL runs and the properties
-- hold against real production data plus these fixtures. It proves NOTHING about the migration
-- being live — that is the post-merge persisted-apply confirmation.
--
-- FIXTURES are deliberately not any real owner account (§63): fresh uuids, `aiu-proof-*` slugs.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text) ON COMMIT DROP;

-- ── Controls: the world BEFORE the migration ────────────────────────────────────────────────
INSERT INTO _p SELECT 1, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C1 control: the allowance columns do not exist yet'
  FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_subscription_plans'
    AND column_name IN ('included_ai_tokens_month','ai_credit_token_ratio');
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C2 control: get_workspace_ai_usage() does not exist yet'
  FROM pg_proc WHERE proname='get_workspace_ai_usage';
-- The premise the whole slice rests on: the meter this reads from is REAL and already has rows.
INSERT INTO _p SELECT 3, CASE WHEN count(*)>0 THEN 'ok' ELSE 'FAIL — no llm_tokens rows, the source is empty' END,
  'C3 premise: platform_usage_events already carries llm_tokens rows (the existing meter, not a new one)'
  FROM public.platform_usage_events WHERE event_type='llm_tokens';

-- ── Fixtures ────────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _f ON COMMIT DROP AS SELECT
  'dddddddd-0000-4000-8000-00000000d001'::uuid AS u_owner,     -- owner of top_a
  'dddddddd-0000-4000-8000-00000000d002'::uuid AS u_member,    -- member of top_a (not owner)
  'dddddddd-0000-4000-8000-00000000d003'::uuid AS u_sub_owner, -- owner of the sub-account
  'dddddddd-0000-4000-8000-00000000d004'::uuid AS u_paid,      -- owner of top_paid
  'dddddddd-0000-4000-8000-00000000d005'::uuid AS u_unclass,   -- owner of top_unclass (no revenue class)
  'eeeeeeee-0000-4000-8000-00000000e001'::uuid AS top_a,       -- promotional, calendar-month period
  'eeeeeeee-0000-4000-8000-00000000e002'::uuid AS agency_p,    -- parent of sub_x
  'eeeeeeee-0000-4000-8000-00000000e003'::uuid AS sub_x,       -- sub-account → not_applicable
  'eeeeeeee-0000-4000-8000-00000000e004'::uuid AS top_paid,    -- provider-backed sub → subscription period
  'eeeeeeee-0000-4000-8000-00000000e005'::uuid AS top_unclass; -- no classification row
GRANT SELECT ON _f TO authenticated, anon;
GRANT SELECT, INSERT ON _p TO authenticated, anon;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'aiu-proof-' || substr(u::text, 33) || '@example.invalid', '', now(), now(), now()
FROM _f, unnest(ARRAY[u_owner,u_member,u_sub_owner,u_paid,u_unclass]) AS u;

-- owner_user_id is set at INSERT, not by a later UPDATE: `trg_guard_tenant_owner_cols` guards that
-- column on UPDATE, and the paid gate below reads it. Setting it here is also the honest shape --
-- a real workspace has an owner from the moment it exists.
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT top_a,      'aiu-proof-top-a',   'AIU Proof Top A',   'AIA', 981001, 'standalone', NULL::uuid, u_owner     FROM _f UNION ALL
SELECT agency_p,   'aiu-proof-agency',  'AIU Proof Agency',  'AIB', 981002, 'agency',     NULL::uuid, NULL::uuid  FROM _f UNION ALL
SELECT top_paid,   'aiu-proof-paid',    'AIU Proof Paid',    'AID', 981004, 'standalone', NULL::uuid, u_paid      FROM _f UNION ALL
SELECT top_unclass,'aiu-proof-unclass', 'AIU Proof Unclass', 'AIE', 981005, 'standalone', NULL::uuid, u_unclass   FROM _f;
INSERT INTO public.tenants (id, slug, name, account_number_prefix, account_number, account_type, parent_tenant_id, owner_user_id)
SELECT sub_x, 'aiu-proof-sub-x', 'AIU Proof Sub X', 'AIC', 981003, 'sub_account', agency_p, u_sub_owner FROM _f;

INSERT INTO public.tenant_members (tenant_id, user_id, status, role, is_owner)
SELECT top_a,       u_owner,     'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT top_a,       u_member,    'active', 'member'::public.tenant_role, false FROM _f UNION ALL
SELECT sub_x,       u_sub_owner, 'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT top_paid,    u_paid,      'active', 'owner'::public.tenant_role,  true  FROM _f UNION ALL
SELECT top_unclass, u_unclass,   'active', 'owner'::public.tenant_role,  true  FROM _f;

UPDATE public.profiles p SET active_tenant_id = v.t
FROM (SELECT u_owner AS u, top_a AS t FROM _f UNION ALL
      SELECT u_member, top_a FROM _f UNION ALL
      SELECT u_sub_owner, sub_x FROM _f UNION ALL
      SELECT u_paid, top_paid FROM _f UNION ALL
      SELECT u_unclass, top_unclass FROM _f) v
WHERE p.user_id = v.u;

-- Subscriptions come BEFORE the classification below, and that order is REQUIRED, not stylistic:
-- `enforce_revenue_integrity_chain` refuses to mint a 'paid' classification unless the workspace
-- ALREADY has an owner, a signed subscriber agreement, and an active provider-backed subscription.
-- The first ordering of this proof wrote the class first and was refused -- correctly.
--
-- top_a references the SOLO plan but has NO provider subscription (the shape every current
-- production workspace is in). top_paid is provider-backed with a live period.
INSERT INTO public.platform_subscriptions (tenant_id, plan_id, status, billing_period,
       stripe_subscription_id, stripe_customer_id, current_period_start, current_period_end)
SELECT top_a, (SELECT id FROM public.platform_subscription_plans WHERE slug='solo'), 'active', 'monthly',
       NULL, NULL, now() - interval '400 days', now() + interval '400 days' FROM _f UNION ALL
SELECT top_paid, (SELECT id FROM public.platform_subscription_plans WHERE slug='agency'), 'active', 'monthly',
       'sub_aiuproof_paid', 'cus_aiuproof_paid', date_trunc('day', now()) - interval '3 days',
       date_trunc('day', now()) + interval '27 days' FROM _f;

-- Gate 1 of the paid chain: a signed SUBSCRIBER agreement (not ambient terms acceptance).
INSERT INTO public.legal_acceptances (user_id, document_slug, document_version, context)
SELECT u_paid, 'saas-agency', 1, '{"source":"AIU proof fixture"}'::jsonb FROM _f;

-- Revenue classes from their OWN explicit records.
--
-- PREMISE, verified on prod before this proof was written: `trg_ensure_tenant_revenue_classification`
-- (AFTER INSERT ON public.tenants) already wrote a `'promotional'` row for EVERY tenant inserted
-- above. So these writes are UPDATEs of a row the trigger made, not creations -- the ON CONFLICT is
-- the premise, not sloppiness. P36 below asserts that premise rather than leaving a reader to guess.
INSERT INTO public.tenant_revenue_classification (tenant_id, revenue_class, comp_reason)
SELECT top_a,    'promotional', 'AIU proof fixture' FROM _f UNION ALL
SELECT top_paid, 'paid',        'AIU proof fixture' FROM _f
ON CONFLICT (tenant_id) DO UPDATE
   SET revenue_class = EXCLUDED.revenue_class, comp_reason = EXCLUDED.comp_reason;

-- top_unclass must have NO classification row, and the trigger just gave it one, so the absence has
-- to be created deliberately. This is itself a finding worth stating plainly: on this database a
-- workspace with no classification record cannot arise from provisioning at all. The unclassified
-- arm of get_workspace_ai_usage() is therefore DEFENSIVE -- it covers a deleted row or a tenant that
-- predates the trigger -- not an expected steady state. It is still proven, because R13 says
-- promotional is never inferred from absence, and an arm that is unreachable today but wrong
-- tomorrow is exactly the kind that ships unnoticed.
DELETE FROM public.tenant_revenue_classification
WHERE tenant_id = (SELECT top_unclass FROM _f);


-- Usage. Three rows INSIDE this calendar month and one deliberately OUTSIDE it, so a period that
-- silently counted everything would be caught rather than merely unproven.
INSERT INTO public.platform_usage_events (tenant_id, event_type, quantity, unit, occurred_at)
SELECT top_a, 'llm_tokens', 400000, 'token', date_trunc('month', now()) + interval '1 hour' FROM _f UNION ALL
SELECT top_a, 'llm_tokens', 350000, 'token', date_trunc('month', now()) + interval '2 hours' FROM _f UNION ALL
SELECT top_a, 'llm_tokens', 250000, 'token', date_trunc('month', now()) + interval '3 hours' FROM _f UNION ALL
SELECT top_a, 'llm_tokens', 999999, 'token', date_trunc('month', now()) - interval '2 days' FROM _f UNION ALL
-- A non-LLM event in-period: it must NOT be counted toward the AI allowance.
SELECT top_a, 'tts_char',   777777, 'char',  date_trunc('month', now()) + interval '4 hours' FROM _f UNION ALL
SELECT top_paid, 'llm_tokens', 120000, 'token', date_trunc('day', now()) - interval '1 day' FROM _f UNION ALL
-- Outside top_paid's provider period, inside this calendar month → proves the period SOURCE matters.
SELECT top_paid, 'llm_tokens', 888888, 'token', date_trunc('day', now()) - interval '10 days' FROM _f;

-- ── Install the migration ───────────────────────────────────────────────────────────────────
\i supabase/migrations/20261105000000_the_plan_says_how_much_ai_is_included.sql

-- ── The ruled figures landed on the real plan rows ──────────────────────────────────────────
INSERT INTO _p SELECT 10, CASE WHEN included_ai_tokens_month = 5000000 AND ai_credit_token_ratio = 1000
                               THEN 'ok' ELSE 'FAIL got ' || COALESCE(included_ai_tokens_month::text,'null') END,
  'P10 solo carries the ruled 5,000,000 tokens at 1,000 tokens per credit'
  FROM public.platform_subscription_plans WHERE slug='solo';
INSERT INTO _p SELECT 11, CASE WHEN included_ai_tokens_month = 15000000 AND ai_credit_token_ratio = 1000
                               THEN 'ok' ELSE 'FAIL got ' || COALESCE(included_ai_tokens_month::text,'null') END,
  'P11 agency carries the ruled 15,000,000 tokens at 1,000 tokens per credit'
  FROM public.platform_subscription_plans WHERE slug='agency';
INSERT INTO _p SELECT 12, CASE WHEN included_ai_tokens_month IS NULL AND ai_credit_token_ratio IS NULL
                               THEN 'ok' ELSE 'FAIL' END,
  'P12 enterprise is left NULL (custom quote) — never a zero that would read as "nothing included"'
  FROM public.platform_subscription_plans WHERE slug='enterprise';
INSERT INTO _p SELECT 13, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL ' || count(*) END,
  'P13 no plan carries an allowance without its ratio, or a ratio without its allowance'
  FROM public.platform_subscription_plans
  WHERE (included_ai_tokens_month IS NULL) <> (ai_credit_token_ratio IS NULL);
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN UPDATE public.platform_subscription_plans SET ai_credit_token_ratio = 0 WHERE slug='solo';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  INSERT INTO _p SELECT 14, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END,
    'P14 a zero token-per-credit ratio is refused by the CHECK (it would divide by zero on a surface)';
END $$;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN UPDATE public.platform_subscription_plans SET included_ai_tokens_month = -1 WHERE slug='solo';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  INSERT INTO _p SELECT 15, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END,
    'P15 a negative allowance is refused by the CHECK';
END $$;

-- ── Impersonation helpers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.as_user(_u uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _u::text, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- P20–P26 the promotional workspace on a calendar-month period
SELECT pg_temp.as_user((SELECT u_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 20, CASE WHEN usage_state='ok' AND scope='top_level' AND can_view THEN 'ok' ELSE 'FAIL ' || usage_state END,
  'P20 owner of a top-level workspace gets a usage read' FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 21, CASE WHEN tokens_used = 1000000 THEN 'ok' ELSE 'FAIL got ' || tokens_used END,
  'P21 usage counts ONLY this period''s llm_tokens: 400k+350k+250k = 1,000,000 (the 999,999 last month and the 777,777 tts_char are excluded)'
  FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 22, CASE WHEN period_source='calendar_month' AND period_start = date_trunc('month', now())
                               THEN 'ok' ELSE 'FAIL ' || period_source END,
  'P22 with no provider-backed subscription the period is the CALENDAR MONTH and says so — a seeded 2027 period_end is never presented as a period'
  FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 23, CASE WHEN revenue_class='promotional' THEN 'ok' ELSE 'FAIL ' || COALESCE(revenue_class,'null') END,
  'P23 the revenue class comes from its own explicit record' FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 24, CASE WHEN included_ai_tokens_month=5000000 AND ai_credit_token_ratio=1000 AND reference_plan_slug='solo'
                               THEN 'ok' ELSE 'FAIL' END,
  'P24 the referenced plan''s allowance and ratio travel with the read, so a surface never invents the conversion'
  FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 25, CASE WHEN events_counted=3 THEN 'ok' ELSE 'FAIL ' || events_counted END,
  'P25 the event count matches the counted rows, so a total can be shown with its own evidence' FROM public.get_workspace_ai_usage();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P30 a member who is not the owner is REFUSED, and the refusal is its own state (R22)
SELECT pg_temp.as_user((SELECT u_member FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 30, CASE WHEN usage_state='owner_only' AND NOT can_view AND tokens_used IS NULL
                               THEN 'ok' ELSE 'FAIL ' || usage_state || ' tokens=' || COALESCE(tokens_used::text,'null') END,
  'P30 a non-owner member gets owner_only with a NULL total — never zero usage, which would be a claim about the account'
  FROM public.get_workspace_ai_usage();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P31 a sub-account is not applicable, not zero
SELECT pg_temp.as_user((SELECT u_sub_owner FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 31, CASE WHEN usage_state='not_applicable' AND scope='sub_account' AND tokens_used IS NULL
                               THEN 'ok' ELSE 'FAIL ' || usage_state END,
  'P31 a sub-account owner gets not_applicable with a NULL total — the roll-up decision is unmade and is not guessed'
  FROM public.get_workspace_ai_usage();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P32–P33 a provider-backed subscription uses its OWN period
SELECT pg_temp.as_user((SELECT u_paid FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 32, CASE WHEN period_source='subscription' THEN 'ok' ELSE 'FAIL ' || period_source END,
  'P32 a provider-backed subscription supplies a real billing period' FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 33, CASE WHEN tokens_used = 120000 THEN 'ok' ELSE 'FAIL got ' || tokens_used END,
  'P33 usage is counted inside THAT period: the 888,888 tokens 10 days ago fall outside it and are excluded'
  FROM public.get_workspace_ai_usage();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P34 an unclassified workspace reports NULL, never "promotional" (R13)
SELECT pg_temp.as_user((SELECT u_unclass FROM _f));
SET LOCAL ROLE authenticated;
INSERT INTO _p SELECT 34, CASE WHEN usage_state='ok' AND revenue_class IS NULL THEN 'ok' ELSE 'FAIL ' || COALESCE(revenue_class,'null') END,
  'P34 a workspace with no classification record reports NULL — promotional is never inferred from absence'
  FROM public.get_workspace_ai_usage();
INSERT INTO _p SELECT 35, CASE WHEN tokens_used = 0 AND events_counted = 0 THEN 'ok' ELSE 'FAIL' END,
  'P35 a workspace with no usage reads zero from a SUCCESSFUL read — distinguishable from the NULL of a refusal'
  FROM public.get_workspace_ai_usage();
RESET ROLE; SELECT pg_temp.as_nobody();

-- P36 the premise the two fixtures above rest on, asserted rather than asserted-in-a-comment:
-- provisioning ITSELF classifies a workspace promotional, so "no classification row" is not a state
-- provisioning can produce. If this ever stops being true, the ON CONFLICT and the DELETE above stop
-- being load-bearing and a reader deserves to be told by a failing property, not by a stale comment.
INSERT INTO _p SELECT 36, CASE WHEN count(*)=1 THEN 'ok' ELSE 'FAIL — the tenants trigger no longer auto-classifies' END,
  'P36 premise: inserting a tenant auto-creates a promotional classification row (trg_ensure_tenant_revenue_classification)'
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND c.relname='tenants' AND p.proname='ensure_tenant_revenue_classification';

-- P37 the OTHER premise the fixtures rest on: 'paid' is a gated mint, not a label anyone can write.
-- Stated as a property because this proof's first ordering was refused by exactly this trigger, and
-- a reader who does not know that will "tidy" the fixture ordering back into a failure.
INSERT INTO _p SELECT 37, CASE WHEN count(*)=1 THEN 'ok' ELSE 'FAIL — the paid-classification gate is gone' END,
  'P37 premise: classifying a workspace paid is gated by enforce_revenue_integrity_chain (owner + signed subscriber agreement + live subscription)'
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND c.relname='tenant_revenue_classification'
    AND p.proname='enforce_revenue_integrity_chain';

-- P40 anon cannot execute it at all
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM public.get_workspace_ai_usage(); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  INSERT INTO _p SELECT 40, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END, 'P40 anon: EXECUTE on the usage read is refused';
END $$;
RESET ROLE; SELECT pg_temp.as_nobody();

-- P41 the read takes NO parameter, so a caller can never ask about another workspace
INSERT INTO _p SELECT 41, CASE WHEN pg_get_function_identity_arguments(oid) = '' THEN 'ok' ELSE 'FAIL' END,
  'P41 get_workspace_ai_usage() takes no argument — the workspace is server-derived, never supplied'
  FROM pg_proc WHERE proname='get_workspace_ai_usage';

-- P42 the slice added no second meter and did not touch LAYER 3
INSERT INTO _p SELECT 42, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL ' || count(*) END,
  'P42 platform_metered_events is still untouched by this slice (LAYER 3 pass-through is a different layer)'
  FROM public.platform_metered_events;

-- ── Report ──────────────────────────────────────────────────────────────────────────────────
SELECT count(*) FILTER (WHERE res='ok') AS ok,
       count(*) FILTER (WHERE res<>'ok') AS failed,
       jsonb_agg(jsonb_build_object('ord', ord, 'res', res, 'label', label) ORDER BY ord) AS lines
FROM _p;

ROLLBACK;
