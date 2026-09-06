-- Business Vault Phase 2 forward security repair.
-- Revalidates current actor/workspace at every RPC and closes dependent-row visibility.

UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp']
WHERE id='business-vault-files';
ALTER TABLE public.business_vault_contracts
  ADD CONSTRAINT business_vault_contract_counterparty_bound CHECK(counterparty_name IS NULL OR length(btrim(counterparty_name)) BETWEEN 1 AND 160),
  ADD CONSTRAINT business_vault_contract_payment_terms_bound CHECK(payment_terms IS NULL OR length(btrim(payment_terms)) BETWEEN 1 AND 500);
ALTER TABLE public.business_vault_obligations
  ADD CONSTRAINT business_vault_obligation_cadence_bound CHECK(cadence IS NULL OR length(btrim(cadence)) BETWEEN 1 AND 80),
  ADD CONSTRAINT business_vault_obligation_timezone_bound CHECK(timezone IS NULL OR length(btrim(timezone)) BETWEEN 1 AND 80),
  ADD CONSTRAINT business_vault_obligation_next_action_bound CHECK(next_action IS NULL OR length(btrim(next_action)) BETWEEN 1 AND 500);
ALTER TABLE public.business_vault_versions
  ADD CONSTRAINT business_vault_version_actual_size_bound CHECK(actual_size IS NULL OR actual_size BETWEEN 0 AND 15728640),
  ADD CONSTRAINT business_vault_version_sha256_shape CHECK(sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.business_vault_records
  ADD CONSTRAINT business_vault_retention_after_creation CHECK(retention_until IS NULL OR retention_until>created_at);
COMMENT ON COLUMN public.business_vault_records.retention_until IS
  'Owner-governed future retention boundary. Phase 2 performs no automatic purge; archive retains the source.';

CREATE OR REPLACE FUNCTION public._business_vault_is_owner(p_tenant uuid,p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=p_tenant AND tm.user_id=p_user
   AND tm.status='active' AND (tm.is_owner=true OR tm.role::text='owner'))
$$;
REVOKE ALL ON FUNCTION public._business_vault_is_owner(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._business_vault_assert_expected_tenant(p_expected_tenant uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant();
BEGIN
 IF p_expected_tenant IS NULL OR p_expected_tenant<>v_tenant THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION public._business_vault_assert_expected_tenant(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._business_vault_assert_actor(p_actor uuid,p_expected_tenant uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_actor IS NULL OR p_expected_tenant IS NULL
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT p.active_tenant_id INTO v_tenant FROM public.profiles p
 JOIN public.tenants t ON t.id=p.active_tenant_id
   AND lower(btrim(t.status::text)) NOT IN('canceled','cancelled','suspended','deleted','archived')
   AND btrim(t.status::text)<>''
 JOIN public.tenant_members tm ON tm.tenant_id=p.active_tenant_id AND tm.user_id=p_actor
   AND tm.status='active' AND (tm.is_owner=true OR tm.role::text IN ('owner','admin'))
 WHERE p.user_id=p_actor AND p.active_tenant_id=p_expected_tenant;
 IF v_tenant IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION public._business_vault_assert_actor(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._business_vault_assert_actor(uuid,uuid) TO service_role;
-- These two helpers are policy predicates. Authenticated callers need EXECUTE for
-- PostgreSQL to evaluate RLS; neither returns record data and denial remains generic.
GRANT EXECUTE ON FUNCTION public._business_vault_current_admin_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public._business_vault_can_read(uuid,text) TO authenticated;

DROP POLICY IF EXISTS business_vault_contracts_read ON public.business_vault_contracts;
CREATE POLICY business_vault_contracts_read ON public.business_vault_contracts FOR SELECT TO authenticated USING(
 tenant_id=public._business_vault_current_admin_tenant() AND EXISTS(
  SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id=business_vault_contracts.tenant_id
   AND r.id=business_vault_contracts.record_id AND public._business_vault_can_read(r.tenant_id,r.visibility)));
DROP POLICY IF EXISTS business_vault_obligations_read ON public.business_vault_obligations;
CREATE POLICY business_vault_obligations_read ON public.business_vault_obligations FOR SELECT TO authenticated USING(
 tenant_id=public._business_vault_current_admin_tenant()
 AND(source_record_id IS NULL OR EXISTS(SELECT 1 FROM public.business_vault_records r
  WHERE r.tenant_id=business_vault_obligations.tenant_id AND r.id=business_vault_obligations.source_record_id
   AND public._business_vault_can_read(r.tenant_id,r.visibility)))
 AND(contract_id IS NULL OR EXISTS(SELECT 1 FROM public.business_vault_contracts c
  JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
  WHERE c.tenant_id=business_vault_obligations.tenant_id AND c.id=business_vault_obligations.contract_id
   AND public._business_vault_can_read(r.tenant_id,r.visibility))));

DROP FUNCTION public.business_vault_reserve_upload(text,text,text,text,text,text,text,bigint,uuid);
CREATE FUNCTION public.business_vault_reserve_upload(
 p_expected_tenant uuid,p_title text,p_section text,p_record_type text,p_handling_mode text,p_visibility text,
 p_original_filename text,p_declared_mime text,p_declared_size bigint,p_replace_record_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant);
 v_record public.business_vault_records; v_version uuid:=gen_random_uuid(); v_path text;
BEGIN
 IF length(btrim(p_title)) NOT BETWEEN 1 AND 180 OR length(btrim(p_record_type)) NOT BETWEEN 1 AND 80
  OR p_section NOT IN('business_core','contracts','obligations','library')
  OR p_handling_mode NOT IN('store_only','classify','approved_context') OR p_visibility NOT IN('owner_only','owner_admin')
  OR(p_visibility='owner_only' AND NOT public._business_vault_is_owner(v_tenant,auth.uid()))
  OR length(btrim(p_original_filename)) NOT BETWEEN 1 AND 240
  OR p_original_filename~*'(password|passwd|api[-_ ]?key|secret|recovery[-_ ]?code|private[-_ ]?key|seed[-_ ]?phrase|wallet|credential|token)'
  OR p_declared_mime NOT IN('application/pdf','image/jpeg','image/png','image/webp')
  OR p_declared_size<=0 OR p_declared_size>15728640
 THEN RAISE EXCEPTION 'VAULT_UPLOAD_REFUSED' USING ERRCODE='22023'; END IF;
 IF p_replace_record_id IS NULL THEN
  INSERT INTO public.business_vault_records(tenant_id,title,section,record_type,handling_mode,visibility,lifecycle_state,
   truth_state,source_kind,source_state,interpretation_state,created_by)
  VALUES(v_tenant,btrim(p_title),p_section,btrim(p_record_type),p_handling_mode,p_visibility,'draft','owner_entered',
   'manual_upload','current',CASE WHEN p_handling_mode='store_only' THEN 'not_requested' ELSE 'unavailable' END,auth.uid())
  RETURNING * INTO v_record;
 ELSE
  SELECT * INTO v_record FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=p_replace_record_id
   AND r.lifecycle_state='active' AND r.source_state='current' AND r.current_version_id IS NOT NULL
   AND public._business_vault_can_read(r.tenant_id,r.visibility) FOR UPDATE;
  IF v_record.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 END IF;
 v_path:=v_tenant::text||'/'||v_record.id::text||'/'||v_version::text||'/'||gen_random_uuid()::text;
 INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,
  declared_size,validation_state,access_scope,supersedes_version_id,created_by)
 VALUES(v_version,v_tenant,v_record.id,v_path,btrim(p_original_filename),p_declared_mime,p_declared_size,'reserved',
  v_record.visibility,v_record.current_version_id,auth.uid());
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,v_record.id,auth.uid(),'upload_reserved','A document upload was reserved.');
 RETURN jsonb_build_object('tenant_id',v_tenant,'record_id',v_record.id,'version_id',v_version,'storage_path',v_path);
END $$;
REVOKE ALL ON FUNCTION public.business_vault_reserve_upload(uuid,text,text,text,text,text,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_reserve_upload(uuid,text,text,text,text,text,text,text,bigint,uuid) TO authenticated;

DROP FUNCTION public.business_vault_finalize_upload(uuid,uuid,text,bigint,text,text,text);
CREATE FUNCTION public.business_vault_finalize_upload(
 p_actor uuid,p_expected_tenant uuid,p_version_id uuid,p_actual_mime text,p_actual_size bigint,
 p_sha256 text,p_validation_state text,p_validation_detail text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_actor(p_actor,p_expected_tenant);
 v_version public.business_vault_versions; v_record public.business_vault_records; v_existing public.business_vault_versions;
BEGIN
 IF p_validation_state NOT IN('validation_unavailable','failed') THEN RAISE EXCEPTION 'VAULT_FINALIZE_REFUSED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_version FROM public.business_vault_versions WHERE tenant_id=v_tenant AND id=p_version_id
  AND created_by=p_actor AND validation_state='reserved' FOR UPDATE;
 IF v_version.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_record FROM public.business_vault_records WHERE tenant_id=v_tenant AND id=v_version.record_id
  AND(visibility='owner_admin' OR public._business_vault_is_owner(v_tenant,p_actor)) FOR UPDATE;
 IF v_record.id IS NULL OR(v_version.supersedes_version_id IS NOT NULL AND
   (v_record.lifecycle_state<>'active' OR v_record.source_state<>'current'
    OR v_record.current_version_id<>v_version.supersedes_version_id))
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF p_validation_state='validation_unavailable' AND(
   p_actual_mime NOT IN('application/pdf','image/jpeg','image/png','image/webp')
   OR p_actual_mime<>v_version.declared_mime OR p_actual_size<>v_version.declared_size
   OR p_actual_size<=0 OR p_actual_size>15728640 OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
   OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='business-vault-files' AND o.name=v_version.storage_path))
 THEN RAISE EXCEPTION 'VAULT_FINALIZE_REFUSED' USING ERRCODE='22023'; END IF;
 IF p_validation_state='validation_unavailable' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||p_sha256,0));
  SELECT * INTO v_existing FROM public.business_vault_versions existing
   WHERE existing.tenant_id=v_tenant AND existing.access_scope=v_version.access_scope
    AND existing.sha256=p_sha256 AND existing.id<>v_version.id
    AND existing.validation_state IN('ready','validation_unavailable')
   ORDER BY existing.created_at,existing.id LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
   UPDATE public.business_vault_versions SET validation_state='cleanup_pending',
    validation_detail='Duplicate source content awaits confirmed storage cleanup.',finalized_at=now() WHERE id=v_version.id;
   IF v_record.current_version_id IS NULL THEN
    UPDATE public.business_vault_records SET lifecycle_state='draft',truth_state='failed',updated_at=now()
    WHERE tenant_id=v_tenant AND id=v_record.id AND current_version_id IS NULL;
   END IF;
   INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
   VALUES(v_tenant,v_record.id,p_actor,'upload_failed','Duplicate source content was not stored.');
   RETURN jsonb_build_object('record_id',v_record.id,'version_id',v_version.id,'state','cleanup_pending','duplicate',true);
  END IF;
 END IF;
 UPDATE public.business_vault_versions SET actual_mime=p_actual_mime,actual_size=p_actual_size,sha256=p_sha256,
  validation_state=p_validation_state,validation_detail=left(COALESCE(p_validation_detail,''),240),finalized_at=now()
 WHERE id=v_version.id;
 IF p_validation_state='failed' THEN
  UPDATE public.business_vault_versions SET validation_state='cleanup_pending',
   validation_detail='Failed upload awaits confirmed storage cleanup.',finalized_at=now() WHERE id=v_version.id;
  IF v_record.current_version_id IS NULL THEN
   UPDATE public.business_vault_records SET lifecycle_state='draft',truth_state='failed',updated_at=now()
   WHERE tenant_id=v_tenant AND id=v_record.id AND current_version_id IS NULL;
  END IF;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
  VALUES(v_tenant,v_record.id,p_actor,'upload_failed','The upload could not be completed.');
  RETURN jsonb_build_object('record_id',v_record.id,'version_id',v_version.id,'state','cleanup_pending');
 END IF;
 IF v_version.supersedes_version_id IS NOT NULL THEN
  UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now(),reviewed_by=p_actor,reviewed_at=now()
  WHERE tenant_id=v_tenant AND record_id=v_record.id AND state IN ('proposed','approved');
  UPDATE public.business_vault_obligations SET source_state='stale',
   state=CASE WHEN state IN('completed','renewed','waived','retired') THEN state ELSE 'awaiting_review' END,updated_at=now()
  WHERE tenant_id=v_tenant AND source_record_id=v_record.id;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
  VALUES(v_tenant,v_record.id,p_actor,'version_replaced','Source replaced; prior proposed and approved facts retired.');
 END IF;
 UPDATE public.business_vault_records SET current_version_id=v_version.id,lifecycle_state='active',truth_state='owner_entered',
  source_state='current',updated_at=now() WHERE tenant_id=v_tenant AND id=v_record.id;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,v_record.id,p_actor,'upload_ready','Source stored; interpretation and malware scanning remain unavailable.');
 RETURN jsonb_build_object('record_id',v_record.id,'version_id',v_version.id,'state','validation_unavailable','duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.business_vault_finalize_upload(uuid,uuid,uuid,text,bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_finalize_upload(uuid,uuid,uuid,text,bigint,text,text,text) TO service_role;

DROP FUNCTION public.business_vault_save_contract(jsonb);
CREATE FUNCTION public.business_vault_save_contract(p_expected_tenant uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant);
 v_id uuid:=NULLIF(p_input->>'id','')::uuid; v_record uuid:=NULLIF(p_input->>'recordId','')::uuid;
 v_state text:=COALESCE(NULLIF(p_input->>'state',''),'draft'); v_owner boolean:=public._business_vault_is_owner(v_tenant,auth.uid());
BEGIN
 IF p_input-ARRAY['id','recordId','contractType','counterpartyName','effectiveDate','endDate','renewalDate','noticeDays','paymentTerms','state']<>'{}'::jsonb
  OR length(btrim(COALESCE(p_input->>'contractType',''))) NOT BETWEEN 1 AND 80
  OR length(COALESCE(p_input->>'counterpartyName',''))>160 OR length(COALESCE(p_input->>'paymentTerms',''))>500
  OR v_state NOT IN('draft','signed','active','renewing','expiring','terminated','superseded','archived')
  OR(v_state IN('terminated','superseded','archived') AND NOT v_owner)
 THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=v_record
  AND r.lifecycle_state='active' AND r.section='contracts' AND public._business_vault_can_read(r.tenant_id,r.visibility))
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.business_vault_contracts(tenant_id,record_id,contract_type,counterparty_name,effective_date,end_date,
   renewal_date,notice_days,payment_terms,state,review_state,created_by)
  VALUES(v_tenant,v_record,btrim(p_input->>'contractType'),NULLIF(btrim(p_input->>'counterpartyName'),''),
   NULLIF(p_input->>'effectiveDate','')::date,NULLIF(p_input->>'endDate','')::date,NULLIF(p_input->>'renewalDate','')::date,
   NULLIF(p_input->>'noticeDays','')::integer,NULLIF(btrim(p_input->>'paymentTerms'),''),v_state,'owner_entered',auth.uid())
  RETURNING id INTO v_id;
 ELSE
  UPDATE public.business_vault_contracts c SET contract_type=btrim(p_input->>'contractType'),
   counterparty_name=NULLIF(btrim(p_input->>'counterpartyName'),''),effective_date=NULLIF(p_input->>'effectiveDate','')::date,
   end_date=NULLIF(p_input->>'endDate','')::date,renewal_date=NULLIF(p_input->>'renewalDate','')::date,
   notice_days=NULLIF(p_input->>'noticeDays','')::integer,payment_terms=NULLIF(btrim(p_input->>'paymentTerms'),''),
   state=v_state,review_state='owner_entered',updated_at=now()
  WHERE c.tenant_id=v_tenant AND c.id=v_id AND c.record_id=v_record;
  IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,v_record,auth.uid(),'contract_updated','Owner-entered contract metadata saved.');
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_save_contract(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_save_contract(uuid,jsonb) TO authenticated;

DROP FUNCTION public.business_vault_save_obligation(jsonb);
CREATE FUNCTION public.business_vault_save_obligation(p_expected_tenant uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant);
 v_id uuid:=NULLIF(p_input->>'id','')::uuid; v_record uuid:=NULLIF(p_input->>'sourceRecordId','')::uuid;
 v_contract uuid:=NULLIF(p_input->>'contractId','')::uuid; v_contract_record uuid;
 v_state text:=COALESCE(NULLIF(p_input->>'state',''),'proposed'); v_owner boolean:=public._business_vault_is_owner(v_tenant,auth.uid());
BEGIN
 IF p_input-ARRAY['id','sourceRecordId','contractId','category','title','dueAt','cadence','timezone','noticeDays','state','nextAction']<>'{}'::jsonb
  OR length(btrim(COALESCE(p_input->>'category',''))) NOT BETWEEN 1 AND 80
  OR length(btrim(COALESCE(p_input->>'title',''))) NOT BETWEEN 1 AND 180
  OR length(COALESCE(p_input->>'cadence',''))>80 OR length(COALESCE(p_input->>'timezone',''))>80
  OR length(COALESCE(p_input->>'nextAction',''))>500
  OR v_state NOT IN('proposed','awaiting_review','confirmed','due_soon','in_progress','waived','retired','unavailable')
  OR(v_state IN('waived','retired') AND NOT v_owner)
 THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF v_record IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=v_record
  AND r.lifecycle_state='active' AND public._business_vault_can_read(r.tenant_id,r.visibility))
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF v_contract IS NOT NULL THEN
  SELECT c.record_id INTO v_contract_record FROM public.business_vault_contracts c
  JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
  WHERE c.tenant_id=v_tenant AND c.id=v_contract AND r.lifecycle_state='active'
   AND public._business_vault_can_read(r.tenant_id,r.visibility);
  IF v_contract_record IS NULL OR(v_record IS NOT NULL AND v_record<>v_contract_record)
  THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF v_record IS NULL THEN v_record:=v_contract_record; END IF;
 END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.business_vault_obligations(tenant_id,source_record_id,contract_id,category,title,due_at,cadence,
   timezone,notice_days,state,source_state,next_action,assistance_level,created_by)
  VALUES(v_tenant,v_record,v_contract,btrim(p_input->>'category'),btrim(p_input->>'title'),
   NULLIF(p_input->>'dueAt','')::timestamptz,NULLIF(btrim(p_input->>'cadence'),''),
   NULLIF(btrim(p_input->>'timezone'),''),NULLIF(p_input->>'noticeDays','')::integer,v_state,
   CASE WHEN v_record IS NULL THEN 'missing' ELSE 'current' END,NULLIF(btrim(p_input->>'nextAction'),''),
   'notice',auth.uid()) RETURNING id INTO v_id;
 ELSE
  UPDATE public.business_vault_obligations o SET source_record_id=v_record,contract_id=v_contract,
   category=btrim(p_input->>'category'),title=btrim(p_input->>'title'),due_at=NULLIF(p_input->>'dueAt','')::timestamptz,
   cadence=NULLIF(btrim(p_input->>'cadence'),''),timezone=NULLIF(btrim(p_input->>'timezone'),''),
   notice_days=NULLIF(p_input->>'noticeDays','')::integer,state=v_state,
   source_state=CASE WHEN v_record IS NULL THEN 'missing' ELSE 'current' END,
   next_action=NULLIF(btrim(p_input->>'nextAction'),''),
   archived_at=CASE WHEN v_state='retired' THEN now() ELSE o.archived_at END,updated_at=now()
  WHERE o.tenant_id=v_tenant AND o.id=v_id
   AND(o.source_record_id IS NULL OR EXISTS(SELECT 1 FROM public.business_vault_records r
    WHERE r.tenant_id=o.tenant_id AND r.id=o.source_record_id AND public._business_vault_can_read(r.tenant_id,r.visibility)))
   AND(o.contract_id IS NULL OR EXISTS(SELECT 1 FROM public.business_vault_contracts c
    JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
    WHERE c.tenant_id=o.tenant_id AND c.id=o.contract_id AND public._business_vault_can_read(r.tenant_id,r.visibility)));
  IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,v_record,auth.uid(),'obligation_updated','Owner-entered obligation metadata saved.');
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_save_obligation(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_save_obligation(uuid,jsonb) TO authenticated;

DROP FUNCTION public.business_vault_archive_record(uuid);
CREATE FUNCTION public.business_vault_archive_record(p_expected_tenant uuid,p_record_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant);
BEGIN
 IF NOT public._business_vault_is_owner(v_tenant,auth.uid()) THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_records r SET lifecycle_state='archived',archived_at=now(),archived_by=auth.uid(),
  source_state='superseded',updated_at=now()
 WHERE r.tenant_id=v_tenant AND r.id=p_record_id AND r.lifecycle_state='active'
  AND public._business_vault_can_read(r.tenant_id,r.visibility);
 IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now(),reviewed_by=auth.uid(),reviewed_at=now()
 WHERE tenant_id=v_tenant AND record_id=p_record_id AND state IN ('proposed','approved');
 UPDATE public.business_vault_obligations SET source_state='superseded',
  state=CASE WHEN state IN('completed','renewed','waived','retired') THEN state ELSE 'unavailable' END,updated_at=now()
 WHERE tenant_id=v_tenant AND source_record_id=p_record_id;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,p_record_id,auth.uid(),'record_archived','Owner archived the record; proposed and approved facts were retired.');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_archive_record(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_archive_record(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._business_vault_valid_fact_value(p_key text,p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v text;
BEGIN
 IF jsonb_typeof(p_value)<>'string' OR length(p_value::text)>260 THEN RETURN false; END IF;
 v:=btrim(p_value#>>'{}');
 IF v='' OR v~'[[:cntrl:]]' OR v~*'(ignore (all|any|the) (previous|prior)|system prompt|developer message|assistant message|tool call|execute (this|the)|api[-_ ]?key|password|recovery code|private key|seed phrase)'
 THEN RETURN false; END IF;
 CASE p_key
  WHEN 'business_legal_name' THEN RETURN length(v)<=120;
  WHEN 'business_registration_state' THEN RETURN length(v)<=80;
  WHEN 'operating_region' THEN RETURN length(v)<=120;
  WHEN 'business_license_status' THEN RETURN v IN('active','inactive','pending','expired','unknown');
  WHEN 'insurance_coverage_status' THEN RETURN v IN('active','pending','expired','unknown','not_held');
  WHEN 'policy_status' THEN RETURN v IN('active','inactive','draft','expired','unknown');
  ELSE RETURN false;
 END CASE;
END $$;
REVOKE ALL ON FUNCTION public._business_vault_valid_fact_value(text,jsonb) FROM PUBLIC,anon,authenticated;

DROP FUNCTION public.business_vault_propose_fact(jsonb);
CREATE FUNCTION public.business_vault_propose_fact(p_expected_tenant uuid,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant); v_id uuid;
 v_record uuid:=NULLIF(p_input->>'recordId','')::uuid; v_version uuid:=NULLIF(p_input->>'versionId','')::uuid;
 v_key text:=p_input->>'factKey'; v_value jsonb:=p_input->'factValue';
 v_fresh timestamptz:=NULLIF(p_input->>'freshUntil','')::timestamptz;
BEGIN
 IF p_input-ARRAY['recordId','versionId','factKey','factValue','freshUntil']<>'{}'::jsonb
  OR NOT public._business_vault_valid_fact_value(v_key,v_value)
  OR(v_fresh IS NOT NULL AND(v_fresh<=now() OR v_fresh>now()+interval '5 years'))
 THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.business_vault_records r JOIN public.business_vault_versions v
  ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id
  WHERE r.tenant_id=v_tenant AND r.id=v_record AND v.id=v_version AND r.handling_mode='approved_context'
   AND r.lifecycle_state='active' AND r.source_state='current' AND v.validation_state='validation_unavailable'
   AND public._business_vault_can_read(r.tenant_id,r.visibility))
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 INSERT INTO public.business_vault_context_facts(tenant_id,record_id,version_id,fact_key,fact_value,provenance,state,fresh_until,created_by)
 VALUES(v_tenant,v_record,v_version,v_key,v_value,'owner_entered','proposed',v_fresh,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_propose_fact(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_propose_fact(uuid,jsonb) TO authenticated;

DROP FUNCTION public.business_vault_review_fact(uuid,text);
CREATE FUNCTION public.business_vault_review_fact(p_expected_tenant uuid,p_fact_id uuid,p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant);
 v_fact public.business_vault_context_facts;
BEGIN
 IF p_decision NOT IN('approved','rejected','revoked') THEN RAISE EXCEPTION 'VAULT_DECISION_INVALID' USING ERRCODE='22023'; END IF;
 IF p_decision IN('approved','revoked') AND NOT public._business_vault_is_owner(v_tenant,auth.uid())
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT f.* INTO v_fact FROM public.business_vault_context_facts f
 JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
 JOIN public.business_vault_versions v ON v.tenant_id=f.tenant_id AND v.id=f.version_id
 WHERE f.tenant_id=v_tenant AND f.id=p_fact_id AND public._business_vault_can_read(r.tenant_id,r.visibility)
  AND((p_decision IN('approved','rejected') AND f.state='proposed' AND r.lifecycle_state='active'
    AND r.source_state='current' AND r.handling_mode='approved_context' AND r.current_version_id=f.version_id
    AND v.validation_state='validation_unavailable' AND(f.fresh_until IS NULL OR f.fresh_until>now()))
   OR(p_decision='revoked' AND f.state='approved'))
 FOR UPDATE OF f;
 IF v_fact.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF p_decision='approved' THEN
  UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now(),reviewed_by=auth.uid(),reviewed_at=now()
  WHERE tenant_id=v_tenant AND fact_key=v_fact.fact_key AND state='approved' AND id<>v_fact.id;
 END IF;
 UPDATE public.business_vault_context_facts SET state=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),
  revoked_at=CASE WHEN p_decision='revoked' THEN now() ELSE revoked_at END WHERE id=v_fact.id;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v_tenant,v_fact.record_id,auth.uid(),CASE p_decision WHEN 'approved' THEN 'fact_approved'
  WHEN 'rejected' THEN 'fact_rejected' ELSE 'fact_revoked' END,'Governed context fact review recorded.');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_review_fact(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_review_fact(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_download_version(p_expected_tenant uuid,p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant); v_result jsonb;
BEGIN
 SELECT jsonb_build_object('storage_path',v.storage_path,'original_filename',v.original_filename,
  'actual_mime',v.actual_mime,'validation_state',v.validation_state,'record_id',r.id)
 INTO v_result FROM public.business_vault_versions v
 JOIN public.business_vault_records r ON r.tenant_id=v.tenant_id AND r.id=v.record_id
 WHERE v.tenant_id=v_tenant AND v.id=p_version_id AND r.current_version_id=v.id
  AND v.validation_state='validation_unavailable' AND r.lifecycle_state IN('active','stale','superseded','archived')
  AND public._business_vault_can_read(r.tenant_id,r.visibility);
 IF v_result IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_download_version(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_download_version(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_claim_stale_uploads(p_before timestamptz,p_limit integer DEFAULT 50)
RETURNS TABLE(version_id uuid,tenant_id uuid,record_id uuid,storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_before>now()-interval '15 minutes' OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH candidates AS(
  SELECT v.id FROM public.business_vault_versions v
  WHERE(v.validation_state IN('reserved','cleanup_pending') AND COALESCE(v.finalized_at,v.created_at)<p_before)
    OR(v.validation_state='validating' AND v.finalized_at<p_before)
  ORDER BY v.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ),claimed AS(
  UPDATE public.business_vault_versions v SET validation_state='validating',finalized_at=now(),
   validation_detail='Cleanup lease claimed for an interrupted upload.'
  FROM candidates c WHERE v.id=c.id RETURNING v.id,v.tenant_id,v.record_id,v.storage_path
 ) SELECT c.id,c.tenant_id,c.record_id,c.storage_path FROM claimed c;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_claim_stale_uploads(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_claim_stale_uploads(timestamptz,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.business_vault_cancel_stale_upload(p_version_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v public.business_vault_versions;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.business_vault_versions WHERE id=p_version_id
  AND validation_state IN('validating','cleanup_pending') FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_versions SET validation_state='cancelled',finalized_at=now(),
  validation_detail='Interrupted upload cleaned up without becoming a current source.' WHERE id=v.id;
 UPDATE public.business_vault_records SET lifecycle_state='retired',source_state='missing',truth_state='failed',updated_at=now()
 WHERE tenant_id=v.tenant_id AND id=v.record_id AND current_version_id IS NULL;
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
 VALUES(v.tenant_id,v.record_id,v.created_by,'upload_failed','Interrupted upload storage was reconciled.');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_cancel_stale_upload(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_cancel_stale_upload(uuid) TO service_role;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.business_vault_records,
 public.business_vault_versions,public.business_vault_contracts,public.business_vault_obligations,
 public.business_vault_record_links,public.business_vault_context_facts,public.business_vault_activity
FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.business_vault_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant();
BEGIN
 RETURN jsonb_build_object(
  'records',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',r.id,'title',r.title,'section',r.section,'recordType',r.record_type,'handlingMode',r.handling_mode,
   'lifecycleState',r.lifecycle_state,'truthState',r.truth_state,'sourceState',r.source_state,
   'originalFilename',v.original_filename,'versionId',v.id,'validationState',v.validation_state,
   'validationDetail',v.validation_detail,'visibility',r.visibility,'interpretationState',r.interpretation_state,
   'createdAt',r.created_at,'updatedAt',r.updated_at,'retentionUntil',r.retention_until
  ) ORDER BY r.updated_at DESC) FROM public.business_vault_records r
   LEFT JOIN public.business_vault_versions v ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id
   WHERE r.tenant_id=v_tenant AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'obligations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',o.id,'title',o.title,'category',o.category,'state',o.state,'dueAt',o.due_at,'cadence',o.cadence,
    'nextAction',o.next_action,'sourceRecordId',o.source_record_id,'contractId',o.contract_id,
    'timezone',o.timezone,'noticeDays',o.notice_days,'sourceState',o.source_state,
   'ownerAssigned',o.responsible_user_id IS NOT NULL
  ) ORDER BY o.due_at NULLS LAST) FROM public.business_vault_obligations o
   LEFT JOIN public.business_vault_records sr ON sr.tenant_id=o.tenant_id AND sr.id=o.source_record_id
   LEFT JOIN public.business_vault_contracts c ON c.tenant_id=o.tenant_id AND c.id=o.contract_id
   LEFT JOIN public.business_vault_records cr ON cr.tenant_id=c.tenant_id AND cr.id=c.record_id
   WHERE o.tenant_id=v_tenant AND o.archived_at IS NULL
    AND(o.source_record_id IS NULL OR public._business_vault_can_read(sr.tenant_id,sr.visibility))
    AND(o.contract_id IS NULL OR public._business_vault_can_read(cr.tenant_id,cr.visibility))),'[]'::jsonb),
  'facts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',f.id,'recordId',f.record_id,'versionId',f.version_id,'factKey',f.fact_key,'factValue',f.fact_value,
   'provenance',f.provenance,'state',CASE WHEN f.state='approved' AND f.fresh_until<=now() THEN 'stale' ELSE f.state END,
   'freshUntil',f.fresh_until,'reviewedAt',f.reviewed_at
  ) ORDER BY f.created_at DESC) FROM public.business_vault_context_facts f
   JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
   WHERE f.tenant_id=v_tenant AND f.state IN('proposed','approved')
    AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'contracts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'recordId',c.record_id,'contractType',c.contract_type,'counterpartyName',c.counterparty_name,
   'effectiveDate',c.effective_date,'endDate',c.end_date,'renewalDate',c.renewal_date,'noticeDays',c.notice_days,
   'paymentTerms',c.payment_terms,'state',c.state,'reviewState',c.review_state,
   'ownerAssigned',c.responsible_user_id IS NOT NULL
  ) ORDER BY c.updated_at DESC) FROM public.business_vault_contracts c
   JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
    WHERE c.tenant_id=v_tenant AND c.state<>'archived'
     AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'contractsNeedingAttention',(SELECT count(*) FROM public.business_vault_contracts c
   JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
   WHERE c.tenant_id=v_tenant AND c.state IN('renewing','expiring')
    AND public._business_vault_can_read(r.tenant_id,r.visibility)),
  'awaitingReview',(SELECT count(*) FROM public.business_vault_records r
   WHERE r.tenant_id=v_tenant AND r.interpretation_state IN('pending','proposed')
    AND public._business_vault_can_read(r.tenant_id,r.visibility)),
  'recentlyReviewed',(SELECT count(*) FROM public.business_vault_context_facts f
   JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
   WHERE f.tenant_id=v_tenant AND f.state='approved' AND f.reviewed_at>=now()-interval '30 days'
    AND public._business_vault_can_read(r.tenant_id,r.visibility))
 );
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_get_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant();
BEGIN
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'fact_key',q.fact_key,'fact_value',q.fact_value,'source_record_id',q.record_id,
  'source_version_id',q.version_id,'provenance',q.provenance,'reviewed_at',q.reviewed_at,
  'fresh_until',q.fresh_until,'permission','approved_context'
 ) ORDER BY q.fact_key) FROM(
  SELECT f.fact_key,f.fact_value,f.record_id,f.version_id,f.provenance,f.reviewed_at,f.fresh_until
  FROM public.business_vault_context_facts f
  JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
  JOIN public.business_vault_versions v ON v.tenant_id=f.tenant_id AND v.id=f.version_id
  WHERE f.tenant_id=v_tenant AND f.state='approved' AND r.lifecycle_state='active' AND r.source_state='current'
   AND r.handling_mode='approved_context' AND f.version_id=r.current_version_id
   AND v.validation_state='validation_unavailable' AND(f.fresh_until IS NULL OR f.fresh_until>now())
   AND public._business_vault_can_read(r.tenant_id,r.visibility)
  ORDER BY f.fact_key LIMIT 20
 )q),'[]'::jsonb);
END $$;

COMMENT ON FUNCTION public.business_vault_get_context() IS
 'Bounded reviewed Vault fact projection. Not wired to Chat, Mind, Rail, Systems Check, or external actions in Phase 2.';
