-- Business Vault Phase 2 writes: no tenant or role argument is accepted.
CREATE OR REPLACE FUNCTION public._business_vault_current_owner_tenant()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT p.active_tenant_id INTO v_tenant
  FROM public.profiles p
  JOIN public.tenant_members tm ON tm.tenant_id=p.active_tenant_id AND tm.user_id=auth.uid()
    AND tm.status='active' AND (tm.is_owner=true OR tm.role::text='owner')
  WHERE p.user_id=auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION public._business_vault_current_owner_tenant() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_save_contract(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant(); v_id uuid:=NULLIF(p_input->>'id','')::uuid; v_record uuid:=(p_input->>'recordId')::uuid; v_state text:=COALESCE(NULLIF(p_input->>'state',''),'draft');
BEGIN
  IF p_input - ARRAY['id','recordId','contractType','counterpartyName','effectiveDate','endDate','renewalDate','noticeDays','paymentTerms','state'] <> '{}'::jsonb OR v_state NOT IN ('draft','signed','active','renewing','expiring','terminated','superseded','archived') THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=v_record AND r.lifecycle_state='active' AND r.section='contracts') THEN RAISE EXCEPTION 'VAULT_RECORD_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.business_vault_contracts(tenant_id,record_id,contract_type,counterparty_name,effective_date,end_date,renewal_date,notice_days,payment_terms,state,review_state,created_by)
    VALUES(v_tenant,v_record,btrim(p_input->>'contractType'),NULLIF(btrim(p_input->>'counterpartyName'),''),NULLIF(p_input->>'effectiveDate','')::date,NULLIF(p_input->>'endDate','')::date,NULLIF(p_input->>'renewalDate','')::date,NULLIF(p_input->>'noticeDays','')::integer,NULLIF(btrim(p_input->>'paymentTerms'),''),v_state,'owner_entered',auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.business_vault_contracts SET contract_type=btrim(p_input->>'contractType'),counterparty_name=NULLIF(btrim(p_input->>'counterpartyName'),''),effective_date=NULLIF(p_input->>'effectiveDate','')::date,end_date=NULLIF(p_input->>'endDate','')::date,renewal_date=NULLIF(p_input->>'renewalDate','')::date,notice_days=NULLIF(p_input->>'noticeDays','')::integer,payment_terms=NULLIF(btrim(p_input->>'paymentTerms'),''),state=v_state,review_state='owner_entered',updated_at=now() WHERE tenant_id=v_tenant AND id=v_id AND record_id=v_record;
    IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_CONTRACT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary) VALUES(v_tenant,v_record,auth.uid(),'contract_updated','Owner-entered contract metadata saved.');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_save_obligation(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant(); v_id uuid:=NULLIF(p_input->>'id','')::uuid; v_record uuid:=NULLIF(p_input->>'sourceRecordId','')::uuid; v_contract uuid:=NULLIF(p_input->>'contractId','')::uuid; v_state text:=COALESCE(NULLIF(p_input->>'state',''),'proposed');
BEGIN
  IF p_input - ARRAY['id','sourceRecordId','contractId','category','title','dueAt','cadence','timezone','noticeDays','state','nextAction'] <> '{}'::jsonb OR v_state NOT IN ('proposed','awaiting_review','confirmed','due_soon','in_progress','waived','retired','unavailable') THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_record IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=v_record AND r.lifecycle_state='active') THEN RAISE EXCEPTION 'VAULT_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF v_contract IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.business_vault_contracts c WHERE c.tenant_id=v_tenant AND c.id=v_contract) THEN RAISE EXCEPTION 'VAULT_CONTRACT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.business_vault_obligations(tenant_id,source_record_id,contract_id,category,title,due_at,cadence,timezone,notice_days,state,source_state,next_action,assistance_level,created_by)
    VALUES(v_tenant,v_record,v_contract,btrim(p_input->>'category'),btrim(p_input->>'title'),NULLIF(p_input->>'dueAt','')::timestamptz,NULLIF(btrim(p_input->>'cadence'),''),NULLIF(btrim(p_input->>'timezone'),''),NULLIF(p_input->>'noticeDays','')::integer,v_state,CASE WHEN v_record IS NULL THEN 'missing' ELSE 'current' END,NULLIF(btrim(p_input->>'nextAction'),''),'notice',auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.business_vault_obligations SET source_record_id=v_record,contract_id=v_contract,category=btrim(p_input->>'category'),title=btrim(p_input->>'title'),due_at=NULLIF(p_input->>'dueAt','')::timestamptz,cadence=NULLIF(btrim(p_input->>'cadence'),''),timezone=NULLIF(btrim(p_input->>'timezone'),''),notice_days=NULLIF(p_input->>'noticeDays','')::integer,state=v_state,source_state=CASE WHEN v_record IS NULL THEN 'missing' ELSE 'current' END,next_action=NULLIF(btrim(p_input->>'nextAction'),''),updated_at=now() WHERE tenant_id=v_tenant AND id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_OBLIGATION_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary) VALUES(v_tenant,v_record,auth.uid(),'obligation_updated','Owner-entered obligation metadata saved.');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_archive_record(p_record_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_owner_tenant();
BEGIN
  UPDATE public.business_vault_records SET lifecycle_state='archived',archived_at=now(),archived_by=auth.uid(),source_state='superseded',updated_at=now() WHERE tenant_id=v_tenant AND id=p_record_id AND lifecycle_state<>'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_RECORD_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now(),reviewed_by=auth.uid(),reviewed_at=now() WHERE tenant_id=v_tenant AND record_id=p_record_id AND state='approved';
  UPDATE public.business_vault_obligations SET source_state='superseded',state=CASE WHEN state IN ('completed','renewed','waived','retired') THEN state ELSE 'unavailable' END,updated_at=now() WHERE tenant_id=v_tenant AND source_record_id=p_record_id;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary) VALUES(v_tenant,p_record_id,auth.uid(),'record_archived','Owner archived the record; approved facts were retired and dependent sources marked unavailable.');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_propose_fact(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant(); v_id uuid; v_key text:=p_input->>'factKey'; v_value jsonb:=p_input->'factValue';
BEGIN
  IF p_input - ARRAY['recordId','versionId','factKey','factValue','freshUntil'] <> '{}'::jsonb OR v_key NOT IN ('business_legal_name','business_registration_state','business_license_status','insurance_coverage_status','operating_region','policy_status') OR jsonb_typeof(v_value) NOT IN ('string','number','boolean') THEN RAISE EXCEPTION 'VAULT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.business_vault_records r JOIN public.business_vault_versions v ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id WHERE r.tenant_id=v_tenant AND r.id=(p_input->>'recordId')::uuid AND r.handling_mode='approved_context' AND r.lifecycle_state='active' AND r.source_state='current' AND v.id=(p_input->>'versionId')::uuid) THEN RAISE EXCEPTION 'VAULT_CONTEXT_SOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  INSERT INTO public.business_vault_context_facts(tenant_id,record_id,version_id,fact_key,fact_value,provenance,state,fresh_until,created_by) VALUES(v_tenant,(p_input->>'recordId')::uuid,(p_input->>'versionId')::uuid,v_key,v_value,'owner_entered','proposed',NULLIF(p_input->>'freshUntil','')::timestamptz,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_review_fact(p_fact_id uuid,p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant(); v_key text; v_record uuid;
BEGIN
  IF p_decision NOT IN ('approved','rejected','revoked') THEN RAISE EXCEPTION 'VAULT_DECISION_INVALID' USING ERRCODE='22023'; END IF;
  SELECT fact_key,record_id INTO v_key,v_record FROM public.business_vault_context_facts WHERE tenant_id=v_tenant AND id=p_fact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_FACT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF p_decision='approved' THEN UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now() WHERE tenant_id=v_tenant AND fact_key=v_key AND state='approved' AND id<>p_fact_id; END IF;
  UPDATE public.business_vault_context_facts SET state=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),revoked_at=CASE WHEN p_decision='revoked' THEN now() ELSE revoked_at END WHERE tenant_id=v_tenant AND id=p_fact_id AND (state='proposed' OR (p_decision='revoked' AND state='approved'));
  IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_FACT_STATE_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary) VALUES(v_tenant,v_record,auth.uid(),CASE p_decision WHEN 'approved' THEN 'fact_approved' WHEN 'rejected' THEN 'fact_rejected' ELSE 'fact_revoked' END,'Governed context fact review recorded.');
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.business_vault_save_contract(jsonb),public.business_vault_save_obligation(jsonb),public.business_vault_archive_record(uuid),public.business_vault_propose_fact(jsonb),public.business_vault_review_fact(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_save_contract(jsonb),public.business_vault_save_obligation(jsonb),public.business_vault_archive_record(uuid),public.business_vault_propose_fact(jsonb),public.business_vault_review_fact(uuid,text) TO authenticated;
