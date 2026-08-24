-- ============================================================================
-- PR #572 · LLM metering bridge — §32 behavioural regression test (self-contained).
--
-- Proves the Step 1+2 bridge added by migration 20261002000000. Synthetic
-- fixtures only; rolls back. Terminal row 'LLM_METERING_BRIDGE_PROVEN' = pass;
-- any RAISE = fail.
--
-- The seven cases the owner named (brief 2026-08-24, boundary 5):
--   1. verified platform scope           → ledger scope='platform', NO tenant usage event
--   2. missing attribution               → ledger scope='unattributed', surfaced for repair
--   3. properly attributed tenant usage  → scope='tenant', exactly ONE usage event, NO price on it
--   4. anon + tenant denial of wholesale pricing (registry AND estimator)
--   5. operator / service_role access
--   6. trace↔ledger transaction failure  → the trace does NOT commit without its cost row
--   7. reasoning non-duplication         → tokens_reasoning raises neither quantity nor cost
--
-- Run: psql "$DB_URL" -1 -f supabase/tests/llm_metering_bridge.sql
-- ============================================================================
BEGIN;

-- ── FIXTURES ────────────────────────────────────────────────────────────────
-- §63: synthetic accounts only. No real business account is ever used as a fixture.
INSERT INTO auth.users(id,aud,role,email) VALUES
 ('d0000000-0000-0000-0000-00000000000a','authenticated','authenticated','lm-operator@x.invalid'),
 ('d0000000-0000-0000-0000-00000000000b','authenticated','authenticated','lm-tenantuser@x.invalid');

INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features) VALUES
 ('d0000000-0000-0000-0000-000000001111','lm-t1','LM Fixture Tenant','active','standalone','LM1',999999101,'{}'::jsonb);

-- ORDER MATTERS, and both facts below were found by RUNNING this proof, not assumed:
--   (a) inserting into auth.users fires a trigger that auto-provisions a profiles row, so setting
--       active_tenant_id is an UPSERT, not an INSERT (a plain INSERT hits profiles_user_id_key);
--   (b) guard_active_tenant_membership() rejects an active_tenant_id the user does not belong to,
--       so membership must be established BEFORE the profile points at the tenant.
INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at) VALUES
 ('d0000000-0000-0000-0000-000000001111','d0000000-0000-0000-0000-00000000000b','admin','active',true,now());

INSERT INTO public.profiles(user_id,active_tenant_id) VALUES
 ('d0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-000000001111')
ON CONFLICT (user_id) DO UPDATE SET active_tenant_id = EXCLUDED.active_tenant_id;

-- OPERATOR FIXTURE = platform_admin, NOT super_admin, and deliberately WITHOUT an ON CONFLICT.
-- Two things learned by running this proof rather than assuming (§13):
--   (a) a partial unique index `one_super_admin ON user_roles(role) WHERE role='super_admin'`
--       enforces the §53 invariant that exactly ONE super_admin exists platform-wide, so a
--       super_admin fixture can never be seeded — it collides with the real operator;
--   (b) an earlier draft wrote ON CONFLICT DO NOTHING here, which SWALLOWED that collision and
--       left the fixture with no operator role at all. Every operator assertion below would then
--       have passed vacuously against a user who was not an operator. No ON CONFLICT: if this
--       fixture cannot be seeded, the proof must fail loudly rather than quietly prove nothing.
-- is_platform_operator() = is_super_admin() OR is_platform_admin(auth.uid()), and is_platform_admin
-- accepts platform_admin, so this fixture exercises the real operator predicate.
-- The §53 grant guard (enforce_protected_role_grant) admits a write whose auth.uid() is NULL —
-- a migration/service context, which is what this transaction is.
INSERT INTO public.user_roles(user_id,role) VALUES
 ('d0000000-0000-0000-0000-00000000000a','platform_admin'::public.app_role);

DO $t$
DECLARE
  _tenant   uuid := 'd0000000-0000-0000-0000-000000001111';
  _operator uuid := 'd0000000-0000-0000-0000-00000000000a';
  _tuser    uuid := 'd0000000-0000-0000-0000-00000000000b';
  _n        int;
  _scope    text;
  _cost     numeric;
  _qty      numeric;
  _price    numeric;
  _blocked  boolean;
  _t1 uuid := 'd0000000-0000-0000-0000-0000000000f1';  -- platform
  _t2 uuid := 'd0000000-0000-0000-0000-0000000000f2';  -- unattributed
  _t3 uuid := 'd0000000-0000-0000-0000-0000000000f3';  -- tenant
  _t4 uuid := 'd0000000-0000-0000-0000-0000000000f4';  -- reasoning
  _t5 uuid := 'd0000000-0000-0000-0000-0000000000f5';  -- no-reasoning twin
BEGIN
  -- ══ 1. VERIFIED PLATFORM SCOPE ════════════════════════════════════════════
  -- No tenant, and the call site DECLARED scope:'platform' in its trace metadata.
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_out,metadata)
  VALUES
    (_t1,NULL,'anthropic','anthropic','anthropic','claude-sonnet-5','2026-08-24','chat','success',
     10000,500,'{"scope":"platform","caller_function":"lm-fixture"}'::jsonb);

  SELECT scope, tenant_id IS NULL INTO _scope, _blocked
    FROM public.paige_llm_cost_ledger WHERE trace_id=_t1;
  IF _scope IS DISTINCT FROM 'platform' THEN
    RAISE EXCEPTION 'FAIL_1_SCOPE: declared platform call recorded as % (expected platform)',_scope; END IF;
  IF NOT _blocked THEN RAISE EXCEPTION 'FAIL_1_TENANT: platform ledger row carries a tenant_id'; END IF;

  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t1::text;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_1_BILLED: platform call produced % tenant usage event(s)',_n; END IF;

  -- ══ 2. MISSING ATTRIBUTION ════════════════════════════════════════════════
  -- No tenant AND no declaration. Must NOT be silently classified as platform usage, and must NOT
  -- be charged to anyone. Correlation ids are present on purpose: their presence must not be
  -- mistaken for a scope declaration.
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_out,conversation_id,metadata)
  VALUES
    (_t2,NULL,'anthropic','anthropic','anthropic','claude-sonnet-5','2026-08-24','chat','success',
     8000,400,'d0000000-0000-0000-0000-00000000cccc','{"caller_function":"lm-fixture"}'::jsonb);

  SELECT scope INTO _scope FROM public.paige_llm_cost_ledger WHERE trace_id=_t2;
  IF _scope IS DISTINCT FROM 'unattributed' THEN
    RAISE EXCEPTION 'FAIL_2_SCOPE: undeclared tenant-less call recorded as % (expected unattributed)',_scope; END IF;

  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t2::text;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_2_BILLED: unattributed call was charged to a tenant'; END IF;

  SELECT count(*) INTO _n FROM public.v_llm_unattributed_spend;
  IF _n < 1 THEN RAISE EXCEPTION 'FAIL_2_ALERT: unattributed spend is invisible to the alert surface'; END IF;

  -- ══ 3. PROPERLY ATTRIBUTED TENANT USAGE ═══════════════════════════════════
  -- 12000 uncached + 4000 cache-read + 1000 out = 17000 billable tokens.
  -- Sonnet 5 @ 2.00 / 0.20 / 10.00 per MTok
  --   = 12000*2.00/1e6 + 4000*0.20/1e6 + 1000*10.00/1e6
  --   = 0.024 + 0.0008 + 0.010 = 0.0348
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_cache_read,tokens_out,metadata)
  VALUES
    (_t3,_tenant,'anthropic','anthropic','anthropic','claude-sonnet-5','2026-08-24','chat','success',
     12000,4000,1000,'{"caller_function":"lm-fixture"}'::jsonb);

  SELECT scope, billable_tokens_total, wholesale_cost_usd
    INTO _scope, _qty, _cost
    FROM public.paige_llm_cost_ledger WHERE trace_id=_t3;
  IF _scope IS DISTINCT FROM 'tenant' THEN
    RAISE EXCEPTION 'FAIL_3_SCOPE: tenant call recorded as %',_scope; END IF;
  IF _qty <> 17000 THEN RAISE EXCEPTION 'FAIL_3_QTY: billable tokens % (expected 17000)',_qty; END IF;
  IF _cost IS NULL THEN RAISE EXCEPTION 'FAIL_3_UNPRICED: a priced model produced a NULL cost'; END IF;
  IF round(_cost,6) <> 0.034800 THEN
    RAISE EXCEPTION 'FAIL_3_COST: % (expected 0.034800 at the official 2026-08-24 rates)',_cost; END IF;

  -- exactly ONE tenant-visible usage event...
  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t3::text;
  IF _n<>1 THEN RAISE EXCEPTION 'FAIL_3_EVENTS: % usage events (expected exactly 1)',_n; END IF;

  -- ...idempotent: re-firing the same key adds nothing.
  INSERT INTO public.platform_metered_events
    (tenant_id,service_category,event_type,provider,quantity,wholesale_cost_usd,
     layer,subject_type,subject_id,idempotency_key)
  VALUES (_tenant,'ai_inference','llm_call','anthropic',999999,999,
          'L3_tenant_passthrough','tenant',_tenant,'llm_trace:'||_t3::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t3::text AND quantity=999999;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_3_IDEMPOTENT: a replayed key overwrote the metered event'; END IF;

  -- ...and it carries NO PRICE. This is the boundary-3 assertion: usage is tenant-visible, our
  -- buy rate is not, in any form a rate can be recovered from.
  SELECT wholesale_cost_usd INTO _cost FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t3::text;
  IF _cost <> 0 THEN
    RAISE EXCEPTION 'FAIL_3_LEAK: tenant-visible row carries wholesale cost % — buy rate derivable',_cost; END IF;
  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:'||_t3::text
     AND (jsonb_exists(metadata,'wholesale_cost_usd_exact') OR jsonb_exists(metadata,'cost_known')
          OR jsonb_exists(metadata,'pricing_version'));
  IF _n<>0 THEN
    RAISE EXCEPTION 'FAIL_3_LEAK_META: tenant-visible metadata carries a price or pricing_version'; END IF;

  -- the detectors agree with the trigger: nothing outstanding
  SELECT count(*) INTO _n FROM public.v_llm_trace_uncosted;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_3_UNCOSTED: % billable trace(s) reached no cost row',_n; END IF;
  SELECT count(*) INTO _n FROM public.v_llm_trace_unmetered;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_3_UNMETERED: % tenant trace(s) reached no usage event',_n; END IF;

  -- ══ 7. REASONING NON-DUPLICATION ══════════════════════════════════════════
  -- Two identical calls; one also reports 900 reasoning tokens (a SUBSET of its 1200 output).
  -- Quantity and cost must be IDENTICAL — reasoning is diagnostic, never an addend.
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_out,tokens_reasoning)
  VALUES
    (_t4,_tenant,'anthropic','anthropic','anthropic','claude-haiku-4-5','2026-08-24','chat','success',
     5000,1200,900);
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_out,tokens_reasoning)
  VALUES
    (_t5,_tenant,'anthropic','anthropic','anthropic','claude-haiku-4-5','2026-08-24','chat','success',
     5000,1200,NULL);

  SELECT a.billable_tokens_total - b.billable_tokens_total INTO _qty
    FROM public.paige_llm_cost_ledger a, public.paige_llm_cost_ledger b
   WHERE a.trace_id=_t4 AND b.trace_id=_t5;
  IF _qty <> 0 THEN
    RAISE EXCEPTION 'FAIL_7_QTY: reasoning tokens changed billable quantity by % (expected 0)',_qty; END IF;

  SELECT a.wholesale_cost_usd - b.wholesale_cost_usd INTO _cost
    FROM public.paige_llm_cost_ledger a, public.paige_llm_cost_ledger b
   WHERE a.trace_id=_t4 AND b.trace_id=_t5;
  IF _cost <> 0 THEN
    RAISE EXCEPTION 'FAIL_7_COST: reasoning tokens changed cost by % (expected 0)',_cost; END IF;

  -- ...and it is still RETAINED as diagnostic detail, not discarded.
  SELECT tokens_reasoning INTO _n FROM public.paige_llm_cost_ledger WHERE trace_id=_t4;
  IF _n IS DISTINCT FROM 900 THEN
    RAISE EXCEPTION 'FAIL_7_DIAG: reasoning detail lost (got %)',_n; END IF;

  -- Haiku 4.5 @ 1.00 in / 5.00 out: 5000*1.00/1e6 + 1200*5.00/1e6 = 0.005 + 0.006 = 0.011
  SELECT wholesale_cost_usd INTO _cost FROM public.paige_llm_cost_ledger WHERE trace_id=_t4;
  IF round(_cost,6) <> 0.011000 THEN
    RAISE EXCEPTION 'FAIL_7_RATE: % (expected 0.011000 at the official Haiku 4.5 rates)',_cost; END IF;

  -- ══ UNPRICED STAYS UNKNOWN, NEVER A ZERO ══════════════════════════════════
  INSERT INTO public.paige_llm_trace
    (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
     tokens_in_uncached,tokens_out)
  VALUES
    ('d0000000-0000-0000-0000-0000000000f6',_tenant,'groq','meta','groq','llama-3.3-70b-versatile',
     '2026-08-24','chat','success',3000,300);
  SELECT wholesale_cost_usd INTO _cost FROM public.paige_llm_cost_ledger
   WHERE trace_id='d0000000-0000-0000-0000-0000000000f6';
  IF _cost IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL_UNPRICED: an unpriced model produced cost % instead of NULL',_cost; END IF;

  PERFORM set_config('role','postgres',true);
END $t$;

-- ══ 4/5. ACCESS CONTROL — anon · tenant user · operator · service_role ═══════
-- Split into its own DO block so a role switch can never leak into the behavioural asserts above.
DO $t$
DECLARE _n int; _blocked boolean; _c numeric; _ts timestamptz;
BEGIN
  -- ── 4a. ANON: no grant on the registry, no grant on the estimator.
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);

  _blocked:=false;
  BEGIN SELECT count(*) INTO _n FROM public.paige_model_pricing;
  EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
  IF NOT _blocked THEN
    RAISE EXCEPTION 'FAIL_4a_REGISTRY: anon could query the wholesale pricing registry'; END IF;

  _blocked:=false;
  BEGIN SELECT public.estimate_llm_cost_usd('anthropic','claude-sonnet-5','2026-08-24',1000,0,0,0,100) INTO _c;
  EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
  IF NOT _blocked THEN
    RAISE EXCEPTION 'FAIL_4a_ESTIMATOR: anon could execute the estimator (got %)',_c; END IF;

  _blocked:=false;
  BEGIN SELECT count(*) INTO _n FROM public.paige_llm_cost_ledger;
  EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
  IF NOT _blocked THEN
    RAISE EXCEPTION 'FAIL_4a_LEDGER: anon could query the cost ledger'; END IF;

  PERFORM set_config('role','postgres',true);

  -- ── 4b. ORDINARY TENANT USER: holds SELECT, but RLS returns nothing, and the estimator is
  --        not executable — so the buy rate is neither retrievable nor derivable.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);

  SELECT count(*) INTO _n FROM public.paige_model_pricing;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_4b_REGISTRY: tenant user read % wholesale price row(s)',_n; END IF;

  SELECT count(*) INTO _n FROM public.paige_llm_cost_ledger;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_4b_LEDGER: tenant user read % cost row(s)',_n; END IF;

  SELECT count(*) INTO _n FROM public.v_llm_spend_rollup;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_4b_ROLLUP: tenant user read % spend rollup row(s)',_n; END IF;

  _blocked:=false;
  BEGIN SELECT public.estimate_llm_cost_usd('anthropic','claude-sonnet-5','2026-08-24',1000,0,0,0,100) INTO _c;
  EXCEPTION WHEN insufficient_privilege THEN _blocked:=true; END;
  IF NOT _blocked THEN
    RAISE EXCEPTION 'FAIL_4b_ESTIMATOR: tenant user could execute the estimator (got %)',_c; END IF;

  -- ...but their OWN usage IS visible, and priceless. Usage yes, buy rate no.
  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE service_category='ai_inference' AND tenant_id='d0000000-0000-0000-0000-000000001111';
  IF _n<1 THEN RAISE EXCEPTION 'FAIL_4b_USAGE: tenant cannot see its own usage at all'; END IF;
  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE service_category='ai_inference'
     AND tenant_id='d0000000-0000-0000-0000-000000001111'
     AND wholesale_cost_usd <> 0;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_4b_LEAK: % tenant-visible row(s) carry a non-zero buy price',_n; END IF;

  -- ── 4c. THE ACTIVATION MARKER IS OPERATOR-ONLY (owner correction 2026-08-24). It shipped in
  --        `public` with RLS off and a blanket SELECT to authenticated. A tenant now sees nothing.
  SELECT count(*) INTO _n FROM public.paige_llm_meter_bridge;
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_4c_BRIDGE: tenant user read % bridge row(s) (expected 0)',_n; END IF;

  -- ...and this is the REGRESSION that enabling RLS could have caused. The two detector views are
  -- security_invoker and call the accessor in their WHERE clause. If the accessor returned NULL for
  -- a non-operator, `created_at >= NULL` would go NULL, both views would return zero rows for every
  -- tenant caller, and that reads as "nothing is broken" — a false all-clear rather than an error.
  -- SECURITY DEFINER on the accessor is what prevents it, and this asserts it rather than trusting it.
  SELECT public.llm_meter_bridge_active_from() INTO _ts;
  IF _ts IS NULL THEN
    RAISE EXCEPTION 'FAIL_4c_BRIDGE_FN: RLS on paige_llm_meter_bridge broke the boundary accessor for '
                    'a non-operator caller — the detectors would silently report all-clear'; END IF;

  -- The detector views must still EXECUTE for this caller. Zero rows is a fine answer; an error is not.
  BEGIN
    SELECT count(*) INTO _n FROM public.v_llm_trace_uncosted;
    SELECT count(*) INTO _n FROM public.v_llm_trace_unmetered;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL_4c_DETECTORS: a detector view raised % for a tenant caller', SQLERRM;
  END;

  PERFORM set_config('role','postgres',true);

  -- ── 5a. OPERATOR: same grant, RLS opens, the price list and the ledger are readable.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims','{"sub":"d0000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);

  SELECT count(*) INTO _n FROM public.paige_model_pricing;
  IF _n<3 THEN RAISE EXCEPTION 'FAIL_5a_REGISTRY: operator saw % price row(s) (expected the 3 seeded)',_n; END IF;

  SELECT count(*) INTO _n FROM public.paige_llm_cost_ledger;
  IF _n<1 THEN RAISE EXCEPTION 'FAIL_5a_LEDGER: operator cannot read the cost ledger'; END IF;

  SELECT count(*) INTO _n FROM public.v_llm_spend_rollup;
  IF _n<1 THEN RAISE EXCEPTION 'FAIL_5a_ROLLUP: operator cannot read the spend rollup'; END IF;

  -- The operator DOES see the activation marker the tenant could not — proving the new policy
  -- discriminates by operator status rather than denying everyone (which would also have passed 4c).
  SELECT count(*) INTO _n FROM public.paige_llm_meter_bridge;
  IF _n<1 THEN RAISE EXCEPTION 'FAIL_5a_BRIDGE: operator cannot read the activation marker'; END IF;

  PERFORM set_config('role','postgres',true);

  -- ── 5b. SERVICE_ROLE: can execute the estimator and write the ledger.
  PERFORM set_config('role','service_role',true);
  SELECT public.estimate_llm_cost_usd('anthropic','claude-haiku-4-5','2026-08-24',1000000,0,0,0,0) INTO _c;
  IF _c IS NULL OR round(_c,6) <> 1.000000 THEN
    RAISE EXCEPTION 'FAIL_5b_ESTIMATOR: service_role got % for 1 MTok of Haiku input (expected 1.000000)',_c; END IF;
  SELECT count(*) INTO _n FROM public.paige_llm_cost_ledger;
  IF _n<1 THEN RAISE EXCEPTION 'FAIL_5b_LEDGER: service_role cannot read the cost ledger'; END IF;

  PERFORM set_config('role','postgres',true);
END $t$;

-- ══ 6. TRACE ↔ LEDGER TRANSACTION FAILURE ═══════════════════════════════════
-- Induce a ledger write failure and prove the TRACE does not survive it. This is the assertion
-- that the bridge is transactionally consistent — not that it is durable, which it is not while
-- the caller fires the write detached ([C2] in the migration).
CREATE OR REPLACE FUNCTION public.__lm_force_ledger_failure() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.model = '__force_ledger_failure__' THEN
    RAISE EXCEPTION 'induced ledger failure for the §32 proof';
  END IF;
  RETURN NEW;
END $f$;

CREATE TRIGGER __lm_force_ledger_failure_trg
  BEFORE INSERT ON public.paige_llm_cost_ledger
  FOR EACH ROW EXECUTE FUNCTION public.__lm_force_ledger_failure();

DO $t$
DECLARE _n int; _raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.paige_llm_trace
      (id,tenant_id,provider,model_provider,billing_provider,model,pricing_version,job_kind,status,
       tokens_in_uncached,tokens_out)
    VALUES
      ('d0000000-0000-0000-0000-0000000000f9','d0000000-0000-0000-0000-000000001111',
       'anthropic','anthropic','anthropic','__force_ledger_failure__','2026-08-24','chat','success',
       1000,100);
  EXCEPTION WHEN OTHERS THEN _raised := true;
  END;

  IF NOT _raised THEN
    RAISE EXCEPTION 'FAIL_6_SILENT: the ledger failed and the trigger swallowed it — that is the '
                    'false atomicity this pass removed'; END IF;

  SELECT count(*) INTO _n FROM public.paige_llm_trace
   WHERE id='d0000000-0000-0000-0000-0000000000f9';
  IF _n<>0 THEN
    RAISE EXCEPTION 'FAIL_6_ORPHAN: the trace committed without a cost row (% row(s) present)',_n; END IF;

  SELECT count(*) INTO _n FROM public.platform_metered_events
   WHERE idempotency_key='llm_trace:d0000000-0000-0000-0000-0000000000f9';
  IF _n<>0 THEN RAISE EXCEPTION 'FAIL_6_PARTIAL: a usage event survived a rolled-back trace'; END IF;
END $t$;

DROP TRIGGER __lm_force_ledger_failure_trg ON public.paige_llm_cost_ledger;
DROP FUNCTION public.__lm_force_ledger_failure();

SELECT 'LLM_METERING_BRIDGE_PROVEN' AS proof;
ROLLBACK;
