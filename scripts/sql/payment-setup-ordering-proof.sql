-- Rollback-only proof for completion ordering. Requires the deployed setup RPC;
-- before migration 20261200000300 the reverse-delivery case fails.
BEGIN;
CREATE TEMP TABLE setup_order_ids AS SELECT gen_random_uuid() AS tenant, gen_random_uuid() AS actor, scenario
 FROM (VALUES ('timestamp-forward'),('timestamp-reverse'),('tie-forward'),('tie-reverse'),('legacy-null')) x(scenario);
GRANT SELECT ON setup_order_ids TO service_role;
INSERT INTO auth.users(id,email) SELECT actor,'setup-order-'||actor::text||'@example.invalid' FROM setup_order_ids;
INSERT INTO public.tenants(id,slug,name,account_type)
 SELECT tenant,'setup-order-'||tenant,'Setup ordering proof','standalone' FROM setup_order_ids;
INSERT INTO public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,payload,created_at)
 SELECT tenant,actor,'owner','platform_billing_connect_requested',jsonb_build_object('setup_attempt',attempt),requested_at
 FROM setup_order_ids CROSS JOIN LATERAL (
  VALUES ('attempt-order-a','2026-09-03 20:00:00.100Z'::timestamptz),
         ('attempt-order-z',CASE WHEN scenario LIKE 'timestamp-%' THEN '2026-09-03 20:00:00.900Z'::timestamptz ELSE '2026-09-03 20:00:00.100Z'::timestamptz END),
         -- Retrying an OLD attempt after the new one must not promote it.
         ('attempt-order-a','2026-09-03 20:00:00.950Z'::timestamptz)
 ) x(attempt,requested_at);
CREATE FUNCTION pg_temp.order_call(t uuid,a uuid,attempt text, confirmed timestamptz DEFAULT '2026-09-03 20:00:01Z') RETURNS text LANGUAGE sql AS $$
 SELECT public.complete_platform_payment_setup(t,a,attempt,'legacy','cus_order_'||t::text,
  'pm_'||attempt,'cs_'||t::text||attempt,'evt_'||t::text||attempt,false,confirmed);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.order_call(uuid,uuid,text,timestamptz) TO service_role;
SET LOCAL ROLE service_role;
DO $$ DECLARE f record; first_attempt text; second_attempt text; BEGIN
 FOR f IN SELECT * FROM setup_order_ids WHERE scenario <> 'legacy-null' ORDER BY scenario LOOP
  first_attempt := CASE WHEN f.scenario LIKE '%forward' THEN 'attempt-order-a' ELSE 'attempt-order-z' END;
  second_attempt := CASE WHEN f.scenario LIKE '%forward' THEN 'attempt-order-z' ELSE 'attempt-order-a' END;
  IF pg_temp.order_call(f.tenant,f.actor,first_attempt) <> 'completed' OR pg_temp.order_call(f.tenant,f.actor,second_attempt) <> 'completed' THEN
   RAISE EXCEPTION 'FAIL setup ordering reconciliation did not complete'; END IF;
  IF (SELECT payment_method_id FROM public.platform_billing_accounts WHERE tenant_id=f.tenant) <> 'pm_attempt-order-z' THEN
   RAISE EXCEPTION 'FAIL same-second setup ordering: %',f.scenario; END IF;
  IF pg_temp.order_call(f.tenant,f.actor,'attempt-order-a') <> 'duplicate' OR pg_temp.order_call(f.tenant,f.actor,'attempt-order-z') <> 'duplicate' THEN
   RAISE EXCEPTION 'FAIL ordering duplicate acknowledgment'; END IF;
  IF (SELECT payment_method_id FROM public.platform_billing_accounts WHERE tenant_id=f.tenant) <> 'pm_attempt-order-z' THEN
   RAISE EXCEPTION 'FAIL duplicate changed ordered method'; END IF;
  IF (SELECT count(*) FROM public.platform_payment_setup_completions WHERE tenant_id=f.tenant) <> 2 THEN
   RAISE EXCEPTION 'FAIL ordering duplicated receipts'; END IF;
 END LOOP;
END $$;
RESET ROLE;
-- Upgrade compatibility: a connected row from the prior schema has no ordering
-- coordinates. Equal-second later deliveries cannot guess and overwrite it.
INSERT INTO public.platform_billing_accounts(tenant_id,stripe_customer_id,stripe_account,source,created_by,payment_method_id,payment_method_updated_at)
 SELECT tenant,'cus_order_'||tenant::text,'legacy','checkout',actor,'pm_legacy','2026-09-03 20:00:01Z' FROM setup_order_ids WHERE scenario='legacy-null';
SET LOCAL ROLE service_role;
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM setup_order_ids WHERE scenario='legacy-null';
 IF pg_temp.order_call(f.tenant,f.actor,'attempt-order-a') <> 'completed' OR pg_temp.order_call(f.tenant,f.actor,'attempt-order-z') <> 'completed' THEN RAISE EXCEPTION 'FAIL legacy delivery receipt'; END IF;
 IF (SELECT payment_method_id FROM public.platform_billing_accounts WHERE tenant_id=f.tenant) <> 'pm_legacy' THEN RAISE EXCEPTION 'FAIL unknown legacy order overwritten on timestamp tie'; END IF;
 INSERT INTO public.paige_audit_log(tenant_id,actor_user_id,action,payload,created_at) VALUES(f.tenant,f.actor,'platform_billing_connect_requested',jsonb_build_object('setup_attempt','attempt-order-later'),'2026-09-03 20:00:02Z');
 IF pg_temp.order_call(f.tenant,f.actor,'attempt-order-later','2026-09-03 20:00:03Z') <> 'completed' THEN RAISE EXCEPTION 'FAIL later setup for legacy mapping'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_billing_accounts WHERE tenant_id=f.tenant AND payment_method_id='pm_attempt-order-later' AND payment_method_setup_attempt='attempt-order-later' AND payment_method_setup_requested_at='2026-09-03 20:00:02Z') THEN RAISE EXCEPTION 'FAIL later setup did not establish order'; END IF;
END $$;
RESET ROLE;
-- The ordering metadata itself participates in the existing atomic transaction.
CREATE FUNCTION public.setup_order_fail_persistence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.setup_attempt='attempt-order-failing' THEN RAISE EXCEPTION 'synthetic ordering persistence failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER setup_order_failure BEFORE INSERT ON public.platform_payment_setup_completions FOR EACH ROW EXECUTE FUNCTION public.setup_order_fail_persistence();
SET LOCAL ROLE service_role;
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM setup_order_ids WHERE scenario='timestamp-forward';
 INSERT INTO public.paige_audit_log(tenant_id,actor_user_id,action,payload,created_at) VALUES(f.tenant,f.actor,'platform_billing_connect_requested',jsonb_build_object('setup_attempt','attempt-order-failing'),'2026-09-03 20:00:00.990Z');
 IF pg_temp.order_call(f.tenant,f.actor,'attempt-order-failing') <> 'persistence_retryable' THEN RAISE EXCEPTION 'FAIL order persistence not retryable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_billing_accounts WHERE tenant_id=f.tenant AND payment_method_id='pm_attempt-order-z' AND payment_method_setup_attempt='attempt-order-z' AND payment_method_setup_requested_at='2026-09-03 20:00:00.900Z') THEN RAISE EXCEPTION 'FAIL ordering fields survived rolled-back write'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_payment_setup_completions WHERE tenant_id=f.tenant AND setup_attempt='attempt-order-failing') THEN RAISE EXCEPTION 'FAIL failed ordering receipt persisted'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS' AS result,'same-second forward/reverse delivery, exact audit timestamp stable tie-break, retry preserves first request, duplicate immutability, legacy-null safety, ordering rollback' AS proof;
ROLLBACK;
