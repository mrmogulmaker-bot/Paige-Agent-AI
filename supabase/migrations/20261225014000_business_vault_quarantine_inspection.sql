-- Business Vault binary quarantine and provider-neutral inspection gate.
-- No provider is enabled here; binary upload stays unavailable until an
-- approved service-owned adapter is configured.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('business-vault-quarantine','business-vault-quarantine',false,15728640,
 ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,
 allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE TABLE public.business_vault_inspection_configuration(
 id text PRIMARY KEY CHECK(id='vault'), adapter_key text NOT NULL CHECK(length(btrim(adapter_key)) BETWEEN 1 AND 80),
 enabled boolean NOT NULL DEFAULT false, pdf_ocr boolean NOT NULL DEFAULT false,
 image_ocr boolean NOT NULL DEFAULT false, secret_inspection boolean NOT NULL DEFAULT false,
 financial_sensitive_inspection boolean NOT NULL DEFAULT false,
 minimum_confidence numeric(4,3) NOT NULL DEFAULT .900 CHECK(minimum_confidence BETWEEN .500 AND 1.000),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid);

CREATE TABLE public.business_vault_quarantine_uploads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 requested_by uuid NOT NULL, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 180),
 section text NOT NULL CHECK(section IN('business_core','contracts','obligations','library')),
 record_type text NOT NULL CHECK(length(btrim(record_type)) BETWEEN 1 AND 80),
 handling_mode text NOT NULL CHECK(handling_mode IN('store_only','classify','approved_context')),
 visibility text NOT NULL CHECK(visibility IN('owner_only','owner_admin')), replace_record_id uuid,
 storage_path text NOT NULL UNIQUE CHECK(storage_path !~ '[\\/][^\\/]+\\.[A-Za-z0-9]{1,8}$'),
 original_filename text NOT NULL CHECK(length(btrim(original_filename)) BETWEEN 1 AND 240),
 declared_mime text NOT NULL CHECK(declared_mime IN('application/pdf','image/jpeg','image/png','image/webp')),
 declared_size bigint NOT NULL CHECK(declared_size BETWEEN 1 AND 15728640), actual_mime text,
 actual_size bigint CHECK(actual_size IS NULL OR actual_size BETWEEN 1 AND 15728640),
 sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
 adapter_key text NOT NULL CHECK(length(btrim(adapter_key)) BETWEEN 1 AND 80),
 inspection_state text NOT NULL DEFAULT 'reserved' CHECK(inspection_state IN(
  'reserved','stored','inspecting','passed','promoting','cleanup_pending','deleting','deleted','promoted')),
 safe_reason_code text CHECK(safe_reason_code IS NULL OR safe_reason_code IN(
  'upload_failed','duplicate','encrypted','malformed','unsupported','unscannable','low_confidence',
  'secret_pattern_detected','financial_sensitive_detected','timed_out','inspection_failed','ocr_failed',
  'workspace_changed','role_changed','rejected','archived','replaced')),
 ocr_completed boolean, inspection_confidence numeric(4,3) CHECK(inspection_confidence IS NULL OR inspection_confidence BETWEEN 0 AND 1),
 secret_pattern_detected boolean, financial_sensitive_detected boolean, encrypted_detected boolean,
 inspection_started_at timestamptz, inspected_at timestamptz, lease_until timestamptz,
 promotion_lease_until timestamptz, normal_copy_sha256 text CHECK(normal_copy_sha256 IS NULL OR normal_copy_sha256 ~ '^[0-9a-f]{64}$'),
 normal_copy_mime text, normal_copy_size bigint CHECK(normal_copy_size IS NULL OR normal_copy_size BETWEEN 1 AND 15728640),
 cleanup_attempts integer NOT NULL DEFAULT 0 CHECK(cleanup_attempts>=0), cleanup_lease_until timestamptz,
 promoted_record_id uuid, promoted_version_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT(now()+interval '24 hours') CHECK(expires_at>created_at),
 FOREIGN KEY(tenant_id,replace_record_id) REFERENCES public.business_vault_records(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,promoted_record_id) REFERENCES public.business_vault_records(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,promoted_version_id) REFERENCES public.business_vault_versions(tenant_id,id) ON DELETE RESTRICT);

CREATE TABLE public.business_vault_inspection_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 quarantine_id uuid NOT NULL REFERENCES public.business_vault_quarantine_uploads(id) ON DELETE RESTRICT,
 event_kind text NOT NULL CHECK(event_kind IN('reserved','stored','inspection_claimed','inspection_passed','inspection_rejected','promotion_claimed','promotion_failed','cleanup_claimed','cleanup_completed','promoted')),
 safe_reason_code text CHECK(safe_reason_code IS NULL OR safe_reason_code IN(
  'upload_failed','duplicate','encrypted','malformed','unsupported','unscannable','low_confidence','secret_pattern_detected',
  'financial_sensitive_detected','timed_out','inspection_failed','ocr_failed','workspace_changed','role_changed','rejected','archived','replaced')),
 actor_kind text NOT NULL CHECK(actor_kind IN('user','inspection_service','cleanup_service')),
 created_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE public.business_vault_versions ADD COLUMN inspection_id uuid,
 ADD COLUMN inspected_at timestamptz, ADD COLUMN inspection_adapter text,
 ADD CONSTRAINT business_vault_version_inspection_fk FOREIGN KEY(inspection_id)
  REFERENCES public.business_vault_quarantine_uploads(id) ON DELETE RESTRICT;
CREATE INDEX business_vault_quarantine_work_idx ON public.business_vault_quarantine_uploads(inspection_state,expires_at,created_at);
CREATE UNIQUE INDEX business_vault_quarantine_digest_idx ON public.business_vault_quarantine_uploads(tenant_id,visibility,sha256)
 WHERE sha256 IS NOT NULL AND inspection_state IN('stored','inspecting','passed','promoted');

ALTER TABLE public.business_vault_inspection_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_inspection_configuration FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_quarantine_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_quarantine_uploads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_inspection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_inspection_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_vault_inspection_configuration FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.business_vault_quarantine_uploads FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.business_vault_inspection_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.business_vault_reserve_upload(uuid,text,text,text,text,text,text,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.business_vault_finalize_upload(uuid,uuid,uuid,text,bigint,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.business_vault_inspection_capability()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant(); v_config public.business_vault_inspection_configuration;
BEGIN
 SELECT * INTO v_config FROM public.business_vault_inspection_configuration c WHERE c.id='vault' AND c.enabled
  AND c.pdf_ocr AND c.image_ocr AND c.secret_inspection AND c.financial_sensitive_inspection;
 RETURN jsonb_build_object('available',v_config.id IS NOT NULL,'state',CASE WHEN v_config.id IS NULL THEN 'unavailable' ELSE 'live' END,
  'adapter',v_config.adapter_key,'max_bytes',15728640,'accepted_mime_types',CASE WHEN v_config.id IS NULL THEN '[]'::jsonb
   ELSE '["application/pdf","image/jpeg","image/png","image/webp"]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION public.business_vault_inspection_capability() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_inspection_capability() TO authenticated;

CREATE FUNCTION public.business_vault_reserve_quarantine_upload(
 p_expected_tenant uuid,p_adapter_key text,p_title text,p_section text,p_record_type text,p_handling_mode text,
 p_visibility text,p_original_filename text,p_declared_mime text,p_declared_size bigint,p_replace_record_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant); v_id uuid:=gen_random_uuid(); v_path text;
 v_replace public.business_vault_records; v_visibility text:=p_visibility;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.business_vault_inspection_configuration c WHERE c.id='vault' AND c.enabled
   AND c.adapter_key=p_adapter_key AND c.pdf_ocr AND c.image_ocr AND c.secret_inspection AND c.financial_sensitive_inspection)
  OR length(btrim(p_title)) NOT BETWEEN 1 AND 180 OR length(btrim(p_record_type)) NOT BETWEEN 1 AND 80
  OR p_section NOT IN('business_core','contracts','obligations','library')
  OR p_handling_mode NOT IN('store_only','classify','approved_context') OR p_visibility NOT IN('owner_only','owner_admin')
  OR(p_visibility='owner_only' AND NOT public._business_vault_is_owner(v_tenant,auth.uid()))
  OR length(btrim(p_original_filename)) NOT BETWEEN 1 AND 240
  OR p_original_filename~*'(password|passwd|api[-_ ]?key|secret|recovery[-_ ]?code|private[-_ ]?key|seed[-_ ]?phrase|wallet|credential|token)'
  OR p_declared_mime NOT IN('application/pdf','image/jpeg','image/png','image/webp') OR p_declared_size NOT BETWEEN 1 AND 15728640
 THEN RAISE EXCEPTION 'VAULT_UPLOAD_REFUSED' USING ERRCODE='22023'; END IF;
 IF p_replace_record_id IS NOT NULL THEN
  SELECT * INTO v_replace FROM public.business_vault_records r
   WHERE r.tenant_id=v_tenant AND r.id=p_replace_record_id AND r.lifecycle_state='active' AND r.source_state='current'
    AND r.current_version_id IS NOT NULL AND public._business_vault_can_read(r.tenant_id,r.visibility) FOR UPDATE;
  IF v_replace.id IS NULL OR p_visibility IS DISTINCT FROM v_replace.visibility
  THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  v_visibility:=v_replace.visibility;
 END IF;
 v_path:=v_tenant::text||'/'||v_id::text||'/'||gen_random_uuid()::text;
 INSERT INTO public.business_vault_quarantine_uploads(id,tenant_id,requested_by,title,section,record_type,handling_mode,
  visibility,replace_record_id,storage_path,original_filename,declared_mime,declared_size,adapter_key)
 VALUES(v_id,v_tenant,auth.uid(),btrim(p_title),p_section,btrim(p_record_type),p_handling_mode,v_visibility,p_replace_record_id,
  v_path,btrim(p_original_filename),p_declared_mime,p_declared_size,btrim(p_adapter_key));
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind) VALUES(v_tenant,v_id,'reserved','user');
 RETURN jsonb_build_object('tenant_id',v_tenant,'quarantine_id',v_id,'storage_path',v_path,'expires_at',now()+interval '24 hours');
END $$;
REVOKE ALL ON FUNCTION public.business_vault_reserve_quarantine_upload(uuid,text,text,text,text,text,text,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.business_vault_reserve_quarantine_upload(uuid,text,text,text,text,text,text,text,text,bigint,uuid) TO authenticated;

CREATE FUNCTION public.business_vault_mark_quarantine_stored(
 p_actor uuid,p_expected_tenant uuid,p_quarantine_id uuid,p_actual_mime text,p_actual_size bigint,p_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_actor(p_actor,p_expected_tenant); v_upload public.business_vault_quarantine_uploads;
BEGIN
 SELECT * INTO v_upload FROM public.business_vault_quarantine_uploads q WHERE q.tenant_id=v_tenant
  AND q.id=p_quarantine_id AND q.requested_by=p_actor AND q.inspection_state='reserved' FOR UPDATE;
 IF v_upload.id IS NULL OR p_actual_mime IS NULL OR p_actual_size IS NULL OR p_sha256 IS NULL
  OR p_actual_mime<>v_upload.declared_mime OR p_actual_size<>v_upload.declared_size
  OR p_actual_mime NOT IN('application/pdf','image/jpeg','image/png','image/webp') OR p_sha256 !~ '^[0-9a-f]{64}$'
  OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='business-vault-quarantine' AND o.name=v_upload.storage_path)
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_upload.visibility||':'||p_sha256,0));
 IF EXISTS(SELECT 1 FROM public.business_vault_quarantine_uploads q WHERE q.tenant_id=v_tenant AND q.visibility=v_upload.visibility
   AND q.sha256=p_sha256 AND q.id<>v_upload.id AND q.inspection_state IN('stored','inspecting','passed','promoted'))
  OR EXISTS(SELECT 1 FROM public.business_vault_versions v WHERE v.tenant_id=v_tenant AND v.access_scope=v_upload.visibility
   AND v.sha256=p_sha256 AND v.validation_state='ready') THEN
  UPDATE public.business_vault_quarantine_uploads SET actual_mime=p_actual_mime,actual_size=p_actual_size,sha256=p_sha256,
   inspection_state='cleanup_pending',safe_reason_code='duplicate',expires_at=LEAST(expires_at,now()+interval '1 hour'),updated_at=now()
   WHERE id=v_upload.id;
  RETURN jsonb_build_object('state','cleanup_pending','duplicate',true);
 END IF;
 UPDATE public.business_vault_quarantine_uploads SET actual_mime=p_actual_mime,actual_size=p_actual_size,sha256=p_sha256,
  inspection_state='stored',updated_at=now() WHERE id=v_upload.id;
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind) VALUES(v_tenant,v_upload.id,'stored','user');
 RETURN jsonb_build_object('state','stored','duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.business_vault_mark_quarantine_stored(uuid,uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_mark_quarantine_stored(uuid,uuid,uuid,text,bigint,text) TO service_role;

CREATE FUNCTION public.business_vault_claim_quarantine_inspections(p_limit integer DEFAULT 20)
RETURNS TABLE(quarantine_id uuid,tenant_id uuid,storage_path text,declared_mime text,declared_size bigint,adapter_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_limit NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH candidates AS(
  SELECT q.id FROM public.business_vault_quarantine_uploads q JOIN public.business_vault_inspection_configuration c
   ON c.id='vault' AND c.enabled AND c.adapter_key=q.adapter_key AND c.pdf_ocr AND c.image_ocr
    AND c.secret_inspection AND c.financial_sensitive_inspection
  WHERE q.expires_at>now() AND(q.inspection_state='stored' OR(q.inspection_state='inspecting' AND q.lease_until<now()))
   AND q.actual_mime IS NOT NULL AND q.actual_size IS NOT NULL AND q.sha256 IS NOT NULL
  ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ),claimed AS(
  UPDATE public.business_vault_quarantine_uploads q SET inspection_state='inspecting',inspection_started_at=COALESCE(q.inspection_started_at,now()),
   lease_until=now()+interval '10 minutes',updated_at=now() FROM candidates c WHERE q.id=c.id
  RETURNING q.id,q.tenant_id,q.storage_path,q.declared_mime,q.declared_size,q.adapter_key),logged AS(
   INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind)
    SELECT c.tenant_id,c.id,'inspection_claimed','inspection_service' FROM claimed c RETURNING business_vault_inspection_events.quarantine_id AS logged_id)
 SELECT c.id,c.tenant_id,c.storage_path,c.declared_mime,c.declared_size,c.adapter_key FROM claimed c JOIN logged l ON l.logged_id=c.id;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_claim_quarantine_inspections(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_claim_quarantine_inspections(integer) TO service_role;

CREATE FUNCTION public.business_vault_record_inspection_result(
 p_quarantine_id uuid,p_outcome text,p_ocr_completed boolean,p_confidence numeric,
 p_secret_pattern_detected boolean,p_financial_sensitive_detected boolean,p_encrypted_detected boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_upload public.business_vault_quarantine_uploads; v_min numeric;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_confidence IS NULL OR p_confidence NOT BETWEEN 0 AND 1 OR p_outcome NOT IN(
  'passed','encrypted','malformed','unsupported','unscannable','low_confidence','secret_pattern_detected',
  'financial_sensitive_detected','timed_out','inspection_failed','ocr_failed')
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT q.* INTO v_upload FROM public.business_vault_quarantine_uploads q WHERE q.id=p_quarantine_id
  AND q.inspection_state='inspecting' AND q.lease_until>=now() AND q.expires_at>now() FOR UPDATE;
 SELECT c.minimum_confidence INTO v_min FROM public.business_vault_inspection_configuration c
  WHERE c.id='vault' AND c.enabled AND c.adapter_key=v_upload.adapter_key AND c.pdf_ocr AND c.image_ocr
   AND c.secret_inspection AND c.financial_sensitive_inspection;
 IF v_upload.id IS NULL OR v_min IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF p_outcome='passed' AND(NOT COALESCE(p_ocr_completed,false) OR p_confidence IS NULL OR p_confidence<v_min
   OR COALESCE(p_secret_pattern_detected,true) OR COALESCE(p_financial_sensitive_detected,true)
   OR COALESCE(p_encrypted_detected,true))
 THEN RAISE EXCEPTION 'VAULT_INSPECTION_REFUSED' USING ERRCODE='22023'; END IF;
 UPDATE public.business_vault_quarantine_uploads SET inspection_state=CASE WHEN p_outcome='passed' THEN 'passed' ELSE 'cleanup_pending' END,
  safe_reason_code=CASE WHEN p_outcome='passed' THEN NULL ELSE p_outcome END,ocr_completed=p_ocr_completed,
  inspection_confidence=p_confidence,secret_pattern_detected=p_secret_pattern_detected,
  financial_sensitive_detected=p_financial_sensitive_detected,encrypted_detected=p_encrypted_detected,
  inspected_at=now(),lease_until=NULL,expires_at=CASE WHEN p_outcome='passed' THEN expires_at ELSE LEAST(expires_at,now()+interval '1 hour') END,
  updated_at=now() WHERE id=v_upload.id;
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,safe_reason_code,actor_kind)
 VALUES(v_upload.tenant_id,v_upload.id,CASE WHEN p_outcome='passed' THEN 'inspection_passed' ELSE 'inspection_rejected' END,
  CASE WHEN p_outcome='passed' THEN NULL ELSE p_outcome END,'inspection_service');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_record_inspection_result(uuid,text,boolean,numeric,boolean,boolean,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_record_inspection_result(uuid,text,boolean,numeric,boolean,boolean,boolean) TO service_role;

CREATE FUNCTION public.business_vault_claim_quarantine_promotions(p_limit integer DEFAULT 20)
RETURNS TABLE(quarantine_id uuid,tenant_id uuid,requested_by uuid,storage_path text,actual_mime text,actual_size bigint,sha256 text,adapter_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_limit NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH candidates AS(
  SELECT q.id FROM public.business_vault_quarantine_uploads q JOIN public.business_vault_inspection_configuration c
   ON c.id='vault' AND c.enabled AND c.adapter_key=q.adapter_key AND c.pdf_ocr AND c.image_ocr
    AND c.secret_inspection AND c.financial_sensitive_inspection
  WHERE q.expires_at>now() AND(q.inspection_state='passed' OR(q.inspection_state='promoting' AND q.promotion_lease_until<now()))
   AND q.actual_mime IS NOT NULL AND q.actual_size IS NOT NULL AND q.sha256 IS NOT NULL
  ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ),claimed AS(
  UPDATE public.business_vault_quarantine_uploads q SET inspection_state='promoting',promotion_lease_until=now()+interval '10 minutes',updated_at=now()
   FROM candidates c WHERE q.id=c.id
  RETURNING q.id,q.tenant_id,q.requested_by,q.storage_path,q.actual_mime,q.actual_size,q.sha256,q.adapter_key
 ),logged AS(
  INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind)
   SELECT c.tenant_id,c.id,'promotion_claimed','inspection_service' FROM claimed c RETURNING business_vault_inspection_events.quarantine_id AS logged_id)
 SELECT c.id,c.tenant_id,c.requested_by,c.storage_path,c.actual_mime,c.actual_size,c.sha256,c.adapter_key
  FROM claimed c JOIN logged l ON l.logged_id=c.id;
END $$;
-- Promotion is deliberately non-executable until an approved inspection adapter
-- and byte-copy worker are implemented and independently proven.
REVOKE ALL ON FUNCTION public.business_vault_claim_quarantine_promotions(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_vault_promote_quarantine_upload(
 p_actor uuid,p_expected_tenant uuid,p_quarantine_id uuid,p_normal_sha256 text,p_normal_mime text,p_normal_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_actor(p_actor,p_expected_tenant); v_upload public.business_vault_quarantine_uploads;
 v_record public.business_vault_records; v_version uuid:=gen_random_uuid(); v_existing uuid; v_scope text;
BEGIN
 SELECT * INTO v_upload FROM public.business_vault_quarantine_uploads q WHERE q.tenant_id=v_tenant AND q.id=p_quarantine_id
  AND q.requested_by=p_actor AND q.inspection_state='promoting' AND q.promotion_lease_until>=now() AND q.expires_at>now() FOR UPDATE;
 IF v_upload.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.business_vault_inspection_configuration c WHERE c.id='vault'
   AND c.enabled AND c.adapter_key=v_upload.adapter_key AND c.pdf_ocr AND c.image_ocr
    AND c.secret_inspection AND c.financial_sensitive_inspection)
  OR v_upload.actual_mime IS NULL OR v_upload.actual_size IS NULL OR v_upload.sha256 IS NULL
  OR p_normal_sha256 IS NULL OR p_normal_mime IS NULL OR p_normal_size IS NULL
  OR p_normal_sha256 IS DISTINCT FROM v_upload.sha256 OR p_normal_mime IS DISTINCT FROM v_upload.actual_mime
  OR p_normal_size IS DISTINCT FROM v_upload.actual_size
  OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='business-vault-quarantine' AND o.name=v_upload.storage_path)
  OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='business-vault-files' AND o.name=v_upload.storage_path
    AND COALESCE(NULLIF(o.metadata->>'size','')::bigint,-1)=v_upload.actual_size
    AND COALESCE(o.metadata->>'mimetype','')=v_upload.actual_mime)
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 v_scope:=v_upload.visibility;
 IF v_upload.replace_record_id IS NOT NULL THEN
  SELECT * INTO v_record FROM public.business_vault_records r WHERE r.tenant_id=v_tenant AND r.id=v_upload.replace_record_id
   AND r.lifecycle_state='active' AND r.source_state='current' AND r.current_version_id IS NOT NULL
   AND r.visibility=v_upload.visibility AND(r.visibility='owner_admin' OR public._business_vault_is_owner(v_tenant,p_actor)) FOR UPDATE;
  IF v_record.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  v_scope:=v_record.visibility;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text||':'||v_scope||':'||v_upload.sha256,0));
 SELECT v.id INTO v_existing FROM public.business_vault_versions v WHERE v.tenant_id=v_tenant
  AND v.access_scope=v_scope AND v.sha256=v_upload.sha256 AND v.validation_state='ready' LIMIT 1;
 IF v_existing IS NOT NULL THEN
  UPDATE public.business_vault_quarantine_uploads SET inspection_state='cleanup_pending',safe_reason_code='duplicate',
   expires_at=LEAST(expires_at,now()+interval '1 hour'),updated_at=now() WHERE id=v_upload.id;
  RETURN jsonb_build_object('state','cleanup_pending','duplicate',true);
 END IF;
 IF v_upload.replace_record_id IS NULL THEN
  INSERT INTO public.business_vault_records(tenant_id,title,section,record_type,handling_mode,visibility,lifecycle_state,
   truth_state,source_kind,source_state,interpretation_state,created_by)
  VALUES(v_tenant,v_upload.title,v_upload.section,v_upload.record_type,v_upload.handling_mode,v_upload.visibility,'draft',
   'owner_entered','manual_upload','current',CASE WHEN v_upload.handling_mode='store_only' THEN 'not_requested' ELSE 'unavailable' END,p_actor)
  RETURNING * INTO v_record;
 END IF;
 INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,actual_mime,
  declared_size,actual_size,sha256,validation_state,access_scope,supersedes_version_id,created_by,finalized_at,
  inspection_id,inspected_at,inspection_adapter,validation_detail)
 VALUES(v_version,v_tenant,v_record.id,v_upload.storage_path,v_upload.original_filename,v_upload.declared_mime,v_upload.actual_mime,
  v_upload.declared_size,v_upload.actual_size,v_upload.sha256,'ready',v_record.visibility,v_record.current_version_id,p_actor,now(),
  v_upload.id,v_upload.inspected_at,v_upload.adapter_key,'Mandatory OCR and sensitive-content inspection passed.');
 IF v_record.current_version_id IS NOT NULL THEN
  UPDATE public.business_vault_context_facts SET state='retired',revoked_at=now(),reviewed_by=p_actor,reviewed_at=now()
   WHERE tenant_id=v_tenant AND record_id=v_record.id AND state IN('proposed','approved');
  UPDATE public.business_vault_obligations SET source_state='stale',
   state=CASE WHEN state IN('completed','renewed','waived','retired') THEN state ELSE 'awaiting_review' END,updated_at=now()
   WHERE tenant_id=v_tenant AND source_record_id=v_record.id;
  INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
   VALUES(v_tenant,v_record.id,p_actor,'version_replaced','Source replaced; prior proposed and approved facts retired.');
 END IF;
 UPDATE public.business_vault_records SET current_version_id=v_version,lifecycle_state='active',truth_state='owner_entered',
  source_state='current',updated_at=now() WHERE tenant_id=v_tenant AND id=v_record.id;
 UPDATE public.business_vault_quarantine_uploads SET inspection_state='promoted',promoted_record_id=v_record.id,
  promoted_version_id=v_version,normal_copy_sha256=p_normal_sha256,normal_copy_mime=p_normal_mime,
  normal_copy_size=p_normal_size,promotion_lease_until=NULL,expires_at=LEAST(expires_at,now()+interval '1 hour'),updated_at=now()
  WHERE id=v_upload.id;
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind)
  VALUES(v_tenant,v_upload.id,'promoted','inspection_service');
 INSERT INTO public.business_vault_activity(tenant_id,record_id,actor_user_id,event_kind,summary)
  VALUES(v_tenant,v_record.id,p_actor,'upload_ready','Inspected source stored. Paige context remains separately governed.');
 RETURN jsonb_build_object('record_id',v_record.id,'version_id',v_version,'state','ready','duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.business_vault_promote_quarantine_upload(uuid,uuid,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_vault_fail_quarantine_promotion(p_quarantine_id uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_upload public.business_vault_quarantine_uploads;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_reason NOT IN('duplicate','workspace_changed','role_changed','inspection_failed')
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_upload FROM public.business_vault_quarantine_uploads q WHERE q.id=p_quarantine_id
  AND q.inspection_state='promoting' FOR UPDATE;
 IF v_upload.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_quarantine_uploads SET inspection_state='cleanup_pending',safe_reason_code=p_reason,
  promotion_lease_until=NULL,expires_at=LEAST(expires_at,now()+interval '1 hour'),updated_at=now() WHERE id=v_upload.id;
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,safe_reason_code,actor_kind)
  VALUES(v_upload.tenant_id,v_upload.id,'promotion_failed',p_reason,'inspection_service');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_fail_quarantine_promotion(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.business_vault_claim_quarantine_cleanup(p_limit integer DEFAULT 50)
RETURNS TABLE(quarantine_id uuid,storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH candidates AS(
  SELECT q.id FROM public.business_vault_quarantine_uploads q WHERE q.inspection_state IN('cleanup_pending','promoted')
   OR(q.inspection_state='deleting' AND q.cleanup_lease_until<now())
   OR(q.expires_at<=now() AND q.inspection_state NOT IN('deleted','deleting'))
  ORDER BY q.expires_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ),claimed AS(
  UPDATE public.business_vault_quarantine_uploads q SET inspection_state='deleting',cleanup_attempts=q.cleanup_attempts+1,
   cleanup_lease_until=now()+interval '10 minutes',updated_at=now()
   FROM candidates c WHERE q.id=c.id RETURNING q.id,q.tenant_id,q.storage_path),logged AS(
  INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind)
   SELECT c.tenant_id,c.id,'cleanup_claimed','cleanup_service' FROM claimed c RETURNING business_vault_inspection_events.quarantine_id AS logged_id)
 SELECT c.id,c.storage_path FROM claimed c JOIN logged l ON l.logged_id=c.id;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_claim_quarantine_cleanup(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_claim_quarantine_cleanup(integer) TO service_role;

CREATE FUNCTION public.business_vault_complete_quarantine_cleanup(p_quarantine_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $$
DECLARE v_upload public.business_vault_quarantine_uploads;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_upload FROM public.business_vault_quarantine_uploads q WHERE q.id=p_quarantine_id
  AND q.inspection_state='deleting' FOR UPDATE;
 IF v_upload.id IS NULL OR EXISTS(SELECT 1 FROM storage.objects o
   WHERE o.bucket_id='business-vault-quarantine' AND o.name=v_upload.storage_path)
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_quarantine_uploads SET inspection_state='deleted',cleanup_lease_until=NULL,updated_at=now() WHERE id=v_upload.id;
 INSERT INTO public.business_vault_inspection_events(tenant_id,quarantine_id,event_kind,actor_kind)
  VALUES(v_upload.tenant_id,v_upload.id,'cleanup_completed','cleanup_service');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_complete_quarantine_cleanup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_complete_quarantine_cleanup(uuid) TO service_role;

CREATE FUNCTION public.business_vault_defer_quarantine_cleanup(p_quarantine_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE public.business_vault_quarantine_uploads SET inspection_state='cleanup_pending',cleanup_lease_until=NULL,
  expires_at=LEAST(expires_at,now()+interval '1 hour'),updated_at=now()
  WHERE id=p_quarantine_id AND inspection_state='deleting';
 IF NOT FOUND THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.business_vault_defer_quarantine_cleanup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_defer_quarantine_cleanup(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.business_vault_download_version(p_expected_tenant uuid,p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant); v_result jsonb;
BEGIN
 SELECT jsonb_build_object('storage_path',v.storage_path,'original_filename',v.original_filename,
  'actual_mime',v.actual_mime,'validation_state',v.validation_state,'record_id',r.id)
 INTO v_result FROM public.business_vault_versions v JOIN public.business_vault_records r
  ON r.tenant_id=v.tenant_id AND r.id=v.record_id
 WHERE v.tenant_id=v_tenant AND v.id=p_version_id AND r.current_version_id=v.id
  AND v.validation_state='ready' AND v.inspection_id IS NOT NULL AND r.lifecycle_state='active'
  AND r.source_state='current' AND public._business_vault_can_read(r.tenant_id,r.visibility);
 IF v_result IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;

-- Quarantine any legacy uninspected source from the earlier draft contract.
UPDATE public.business_vault_context_facts f SET state='retired',revoked_at=now(),reviewed_at=now()
 FROM public.business_vault_versions v WHERE f.tenant_id=v.tenant_id AND f.version_id=v.id
  AND v.validation_state='validation_unavailable' AND f.state IN('proposed','approved');
UPDATE public.business_vault_records r SET current_version_id=NULL,lifecycle_state='draft',truth_state='failed',
 source_state='missing',updated_at=now() FROM public.business_vault_versions v
 WHERE v.tenant_id=r.tenant_id AND v.id=r.current_version_id AND v.validation_state='validation_unavailable';
UPDATE public.business_vault_versions SET validation_state='cleanup_pending',
 validation_detail='Uninspected legacy source removed from normal access.',finalized_at=now()
 WHERE validation_state='validation_unavailable';

CREATE OR REPLACE FUNCTION public.business_vault_propose_fact(p_expected_tenant uuid,p_input jsonb)
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
  ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id WHERE r.tenant_id=v_tenant AND r.id=v_record AND v.id=v_version
   AND r.handling_mode='approved_context' AND r.lifecycle_state='active' AND r.source_state='current'
   AND v.validation_state='ready' AND v.inspection_id IS NOT NULL AND public._business_vault_can_read(r.tenant_id,r.visibility))
 THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 INSERT INTO public.business_vault_context_facts(tenant_id,record_id,version_id,fact_key,fact_value,provenance,state,fresh_until,created_by)
 VALUES(v_tenant,v_record,v_version,v_key,v_value,'owner_entered','proposed',v_fresh,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_vault_review_fact(p_expected_tenant uuid,p_fact_id uuid,p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_assert_expected_tenant(p_expected_tenant); v_fact public.business_vault_context_facts;
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
    AND v.validation_state='ready' AND v.inspection_id IS NOT NULL AND(f.fresh_until IS NULL OR f.fresh_until>now()))
   OR(p_decision='revoked' AND f.state='approved')) FOR UPDATE OF f;
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

CREATE OR REPLACE FUNCTION public.business_vault_get_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant();
BEGIN
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('fact_key',q.fact_key,'fact_value',q.fact_value,
  'source_record_id',q.record_id,'source_version_id',q.version_id,'provenance',q.provenance,
  'reviewed_at',q.reviewed_at,'fresh_until',q.fresh_until,'permission','approved_context') ORDER BY q.fact_key)
 FROM(SELECT f.fact_key,f.fact_value,f.record_id,f.version_id,f.provenance,f.reviewed_at,f.fresh_until
  FROM public.business_vault_context_facts f JOIN public.business_vault_records r
   ON r.tenant_id=f.tenant_id AND r.id=f.record_id JOIN public.business_vault_versions v
   ON v.tenant_id=f.tenant_id AND v.id=f.version_id
  WHERE f.tenant_id=v_tenant AND f.state='approved' AND r.lifecycle_state='active' AND r.source_state='current'
   AND r.handling_mode='approved_context' AND f.version_id=r.current_version_id
   AND v.validation_state='ready' AND v.inspection_id IS NOT NULL AND(f.fresh_until IS NULL OR f.fresh_until>now())
   AND public._business_vault_can_read(r.tenant_id,r.visibility) ORDER BY f.fact_key LIMIT 20)q),'[]'::jsonb);
END $$;

COMMENT ON COLUMN public.business_vault_versions.inspection_id IS
 'Passed quarantine inspection source; no extracted document text is stored here.';
COMMENT ON TABLE public.business_vault_inspection_events IS
 'Safe state/code audit only. Raw document text and detected sensitive values are prohibited.';

CREATE OR REPLACE FUNCTION public.business_vault_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tenant uuid:=public._business_vault_current_admin_tenant();
BEGIN
 RETURN jsonb_build_object(
  'uploadCapability',public.business_vault_inspection_capability(),
  'records',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',r.id,'title',r.title,'section',r.section,'recordType',r.record_type,'handlingMode',r.handling_mode,
   'lifecycleState',r.lifecycle_state,'truthState',r.truth_state,'sourceState',r.source_state,
   'originalFilename',v.original_filename,'versionId',v.id,'validationState',v.validation_state,
   'validationDetail',v.validation_detail,'inspectionState',CASE WHEN v.validation_state='ready' AND v.inspection_id IS NOT NULL THEN 'passed' ELSE 'unavailable' END,
   'inspectedAt',v.inspected_at,'inspectionAdapter',v.inspection_adapter,'visibility',r.visibility,
   'interpretationState',r.interpretation_state,'createdAt',r.created_at,'updatedAt',r.updated_at,'retentionUntil',r.retention_until
  ) ORDER BY r.updated_at DESC) FROM public.business_vault_records r
   LEFT JOIN public.business_vault_versions v ON v.tenant_id=r.tenant_id AND v.id=r.current_version_id
   WHERE r.tenant_id=v_tenant AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'obligations',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',o.id,'title',o.title,'category',o.category,'state',o.state,'dueAt',o.due_at,'cadence',o.cadence,
   'nextAction',o.next_action,'sourceRecordId',o.source_record_id,'contractId',o.contract_id,'timezone',o.timezone,
   'noticeDays',o.notice_days,'sourceState',o.source_state,'ownerAssigned',o.responsible_user_id IS NOT NULL
  ) ORDER BY o.due_at NULLS LAST) FROM public.business_vault_obligations o
   LEFT JOIN public.business_vault_records sr ON sr.tenant_id=o.tenant_id AND sr.id=o.source_record_id
   LEFT JOIN public.business_vault_contracts c ON c.tenant_id=o.tenant_id AND c.id=o.contract_id
   LEFT JOIN public.business_vault_records cr ON cr.tenant_id=c.tenant_id AND cr.id=c.record_id
   WHERE o.tenant_id=v_tenant AND o.archived_at IS NULL
    AND(o.source_record_id IS NULL OR public._business_vault_can_read(sr.tenant_id,sr.visibility))
    AND(o.contract_id IS NULL OR public._business_vault_can_read(cr.tenant_id,cr.visibility))),'[]'::jsonb),
  'facts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'recordId',f.record_id,'versionId',f.version_id,
   'factKey',f.fact_key,'factValue',f.fact_value,'provenance',f.provenance,
   'state',CASE WHEN f.state='approved' AND f.fresh_until<=now() THEN 'stale' ELSE f.state END,
   'freshUntil',f.fresh_until,'reviewedAt',f.reviewed_at) ORDER BY f.created_at DESC)
   FROM public.business_vault_context_facts f JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
   WHERE f.tenant_id=v_tenant AND f.state IN('proposed','approved')
    AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'contracts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'recordId',c.record_id,
   'contractType',c.contract_type,'counterpartyName',c.counterparty_name,'effectiveDate',c.effective_date,
   'endDate',c.end_date,'renewalDate',c.renewal_date,'noticeDays',c.notice_days,'paymentTerms',c.payment_terms,
   'state',c.state,'reviewState',c.review_state,'ownerAssigned',c.responsible_user_id IS NOT NULL) ORDER BY c.updated_at DESC)
   FROM public.business_vault_contracts c JOIN public.business_vault_records r ON r.tenant_id=c.tenant_id AND r.id=c.record_id
   WHERE c.tenant_id=v_tenant AND c.state<>'archived' AND public._business_vault_can_read(r.tenant_id,r.visibility)),'[]'::jsonb),
  'contractsNeedingAttention',(SELECT count(*) FROM public.business_vault_contracts c JOIN public.business_vault_records r
   ON r.tenant_id=c.tenant_id AND r.id=c.record_id WHERE c.tenant_id=v_tenant AND c.state IN('renewing','expiring')
    AND public._business_vault_can_read(r.tenant_id,r.visibility)),
  'awaitingReview',(SELECT count(*) FROM public.business_vault_records r WHERE r.tenant_id=v_tenant
   AND r.interpretation_state IN('pending','proposed') AND public._business_vault_can_read(r.tenant_id,r.visibility)),
  'recentlyReviewed',(SELECT count(*) FROM public.business_vault_context_facts f JOIN public.business_vault_records r
   ON r.tenant_id=f.tenant_id AND r.id=f.record_id WHERE f.tenant_id=v_tenant AND f.state='approved'
    AND f.reviewed_at>=now()-interval '30 days' AND public._business_vault_can_read(r.tenant_id,r.visibility)));
END $$;
