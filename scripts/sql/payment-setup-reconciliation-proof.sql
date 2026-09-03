-- Run against an isolated/local schema or as a rollback-only batch with migration
-- 20261200000200 expanded before this file. No real tenant/provider is touched.
BEGIN;
CREATE TEMP TABLE setup_proof_ids AS SELECT gen_random_uuid() AS tenant_a, gen_random_uuid() AS tenant_b, gen_random_uuid() AS actor;
GRANT SELECT ON setup_proof_ids TO service_role;
INSERT INTO auth.users(id, email) SELECT actor, 'setup-proof@example.invalid' FROM setup_proof_ids;
INSERT INTO public.tenants(id,slug,name,account_type)
 SELECT tenant_a,'setup-proof-'||tenant_a,'Setup proof A','standalone' FROM setup_proof_ids
 UNION ALL SELECT tenant_b,'setup-proof-'||tenant_b,'Setup proof B','standalone' FROM setup_proof_ids;
INSERT INTO public.paige_audit_log(tenant_id,actor_user_id,actor_role,action,target_type,target_id,payload)
 SELECT t, actor,'owner','platform_billing_connect_requested','platform_billing_account',t,
 jsonb_build_object('setup_attempt',attempt) FROM setup_proof_ids CROSS JOIN LATERAL
 (VALUES(tenant_a,'attempt-proof-a'),(tenant_a,'attempt-proof-old'),(tenant_b,'attempt-proof-b')) v(t,attempt);
CREATE FUNCTION pg_temp.setup_call(which_tenant text,attempt text,session text,event text,customer text,pm text,confirmed timestamptz DEFAULT '2026-09-03 20:00Z') RETURNS text
LANGUAGE sql AS $$ SELECT public.complete_platform_payment_setup(CASE WHEN which_tenant='a' THEN tenant_a ELSE tenant_b END,actor,attempt,'legacy',customer,pm,session,event,false,confirmed) FROM setup_proof_ids $$;
GRANT EXECUTE ON FUNCTION pg_temp.setup_call(text,text,text,text,text,text,timestamptz) TO service_role;
CREATE FUNCTION public.setup_proof_fail_persistence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.setup_attempt='attempt-proof-a' THEN RAISE EXCEPTION 'proof transient database failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER setup_proof_failure BEFORE INSERT ON public.platform_payment_setup_completions FOR EACH ROW EXECUTE FUNCTION public.setup_proof_fail_persistence();
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF pg_temp.setup_call('a','attempt-proof-a','cs_proof_a','evt_proof_a','cus_proof_a','pm_proof_a') <> 'persistence_retryable' THEN RAISE EXCEPTION 'FAIL transient completion persistence'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_billing_accounts WHERE tenant_id=(SELECT tenant_a FROM setup_proof_ids)) THEN RAISE EXCEPTION 'FAIL mapping survived failed transaction'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_payment_setup_completions WHERE tenant_id=(SELECT tenant_a FROM setup_proof_ids)) THEN RAISE EXCEPTION 'FAIL failed event permanently completed'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER setup_proof_failure ON public.platform_payment_setup_completions;
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF pg_temp.setup_call('a','attempt-proof-a','cs_proof_a','evt_proof_a','cus_proof_a','pm_proof_a') <> 'completed' THEN RAISE EXCEPTION 'FAIL delayed retry not completed'; END IF;
 IF NOT (SELECT public.platform_payment_setup_is_complete(tenant_a,actor,'attempt-proof-a','legacy','cs_proof_a',false) FROM setup_proof_ids) THEN RAISE EXCEPTION 'FAIL committed receipt fast path'; END IF;
 IF (SELECT public.platform_payment_setup_is_complete(tenant_b,actor,'attempt-proof-a','legacy','cs_proof_a',false) FROM setup_proof_ids) THEN RAISE EXCEPTION 'FAIL receipt cross tenant disclosure'; END IF;
 IF (SELECT public.platform_payment_setup_is_complete(tenant_a,actor,'attempt-proof-a','legacy','cs_proof_a',true) FROM setup_proof_ids) THEN RAISE EXCEPTION 'FAIL receipt provider mode mismatch'; END IF;
 IF pg_temp.setup_call('a','attempt-proof-a','cs_proof_a','evt_proof_a','cus_proof_a','pm_proof_a') <> 'duplicate' THEN RAISE EXCEPTION 'FAIL duplicate delivery'; END IF;
 IF pg_temp.setup_call('a','attempt-proof-a','cs_proof_a','evt_proof_other','cus_proof_a','pm_proof_a') <> 'duplicate' THEN RAISE EXCEPTION 'FAIL repeated session'; END IF;
 IF pg_temp.setup_call('b','attempt-proof-b','cs_proof_b','evt_proof_b','cus_proof_a','pm_proof_b') <> 'binding_refused' THEN RAISE EXCEPTION 'FAIL cross tenant customer reuse'; END IF;
 IF pg_temp.setup_call('b','attempt-missing','cs_proof_b','evt_proof_b','cus_proof_b','pm_proof_b') <> 'binding_refused' THEN RAISE EXCEPTION 'FAIL missing owner request accepted'; END IF;
 IF pg_temp.setup_call('b','attempt-proof-b','cs_proof_a','evt_proof_a','cus_proof_b','pm_proof_b') <> 'binding_refused' THEN RAISE EXCEPTION 'FAIL stolen session accepted'; END IF;
 IF pg_temp.setup_call('a','attempt-proof-old','cs_proof_old','evt_proof_old','cus_proof_a','pm_proof_old','2026-09-02 20:00Z') <> 'completed' THEN RAISE EXCEPTION 'FAIL older valid delayed event'; END IF;
 IF (SELECT payment_method_id FROM public.platform_billing_accounts WHERE tenant_id=(SELECT tenant_a FROM setup_proof_ids)) <> 'pm_proof_a' THEN RAISE EXCEPTION 'FAIL older event overwrote latest method'; END IF;
 IF (SELECT count(*) FROM public.platform_billing_accounts WHERE tenant_id IN(SELECT tenant_a FROM setup_proof_ids UNION SELECT tenant_b FROM setup_proof_ids)) <> 1 THEN RAISE EXCEPTION 'FAIL duplicate mapping'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_billing_accounts WHERE tenant_id=(SELECT tenant_a FROM setup_proof_ids) AND (payment_method_brand IS NOT NULL OR payment_method_last4 IS NOT NULL OR payment_method_exp_month IS NOT NULL OR payment_method_exp_year IS NOT NULL)) THEN RAISE EXCEPTION 'FAIL card details persisted'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.complete_platform_payment_setup(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz)','EXECUTE') OR has_function_privilege('anon','public.complete_platform_payment_setup(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'FAIL public reconciliation privilege'; END IF;
 IF has_function_privilege('authenticated','public.platform_payment_setup_is_complete(uuid,uuid,text,text,text,boolean)','EXECUTE') OR has_function_privilege('anon','public.platform_payment_setup_is_complete(uuid,uuid,text,text,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'FAIL public receipt fast path privilege'; END IF;
 IF has_table_privilege('authenticated','public.platform_payment_setup_completions','SELECT') OR has_table_privilege('anon','public.platform_payment_setup_completions','SELECT') THEN RAISE EXCEPTION 'FAIL tenant receipt exposure'; END IF;
END $$;
SELECT 'PASS' AS result,'atomic rollback, retry, duplicate, delayed event, cross-tenant refusal, request binding, no card details, service-only privileges' AS proof;
ROLLBACK;
