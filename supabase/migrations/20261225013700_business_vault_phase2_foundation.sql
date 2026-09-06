-- Business Vault Phase 2: tenant-bound evidence, contracts, obligations and reviewed facts.
-- Deliberately separate from Supabase's `vault` secrets schema.

CREATE OR REPLACE FUNCTION public._business_vault_current_admin_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  SELECT p.active_tenant_id
    INTO v_tenant
  FROM public.profiles p
  JOIN public.tenants t
    ON t.id = p.active_tenant_id
   AND lower(btrim(t.status::text)) NOT IN ('canceled','cancelled','suspended','deleted','archived')
   AND btrim(t.status::text) <> ''
  JOIN public.tenant_members tm
    ON tm.tenant_id = p.active_tenant_id
   AND tm.user_id = auth.uid()
   AND tm.status = 'active'
   AND (tm.is_owner = true OR tm.role::text IN ('owner', 'admin'))
  WHERE p.user_id = auth.uid();

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public._business_vault_current_admin_tenant() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_access_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'allowed',
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.tenants t ON t.id=p.active_tenant_id
       AND lower(btrim(t.status::text)) NOT IN ('canceled','cancelled','suspended','deleted','archived')
       AND btrim(t.status::text)<>''
      JOIN public.tenant_members tm
        ON tm.tenant_id = p.active_tenant_id
       AND tm.user_id = auth.uid()
       AND tm.status = 'active'
       AND (tm.is_owner = true OR tm.role::text IN ('owner', 'admin'))
      WHERE p.user_id = auth.uid()
    ),
    'can_archive',
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.tenants t ON t.id=p.active_tenant_id
       AND lower(btrim(t.status::text)) NOT IN ('canceled','cancelled','suspended','deleted','archived')
       AND btrim(t.status::text)<>''
      JOIN public.tenant_members tm ON tm.tenant_id=p.active_tenant_id AND tm.user_id=auth.uid()
        AND tm.status='active' AND (tm.is_owner=true OR tm.role::text='owner')
      WHERE p.user_id=auth.uid()
    )
  );
$$;

REVOKE ALL ON FUNCTION public.business_vault_access_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_vault_access_status() TO authenticated;

CREATE TABLE public.business_vault_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  section text NOT NULL CHECK (section IN ('business_core','contracts','obligations','library')),
  record_type text NOT NULL CHECK (length(btrim(record_type)) BETWEEN 1 AND 80),
  handling_mode text NOT NULL CHECK (handling_mode IN ('store_only','classify','approved_context')),
  visibility text NOT NULL DEFAULT 'owner_admin' CHECK (visibility IN ('owner_only','owner_admin')),
  lifecycle_state text NOT NULL DEFAULT 'active' CHECK (lifecycle_state IN ('draft','active','stale','superseded','archived','retired')),
  truth_state text NOT NULL DEFAULT 'owner_entered' CHECK (truth_state IN ('owner_entered','imported','extracted_pending_review','approved_fact','unavailable','failed','stale','denied')),
  source_kind text NOT NULL DEFAULT 'manual_upload' CHECK (source_kind IN ('manual_upload','owner_entry','connected_source')),
  source_state text NOT NULL DEFAULT 'current' CHECK (source_state IN ('current','missing','stale','superseded')),
  interpretation_state text NOT NULL DEFAULT 'unavailable' CHECK (interpretation_state IN ('unavailable','not_requested','pending','proposed','approved','rejected','failed')),
  current_version_id uuid,
  retention_until timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE public.business_vault_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE CHECK (storage_path !~ '[\\/][^\\/]+\\.[A-Za-z0-9]{1,8}$'),
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 240),
  declared_mime text NOT NULL,
  actual_mime text,
  declared_size bigint NOT NULL CHECK (declared_size > 0 AND declared_size <= 15728640),
  actual_size bigint,
  sha256 text,
  validation_state text NOT NULL DEFAULT 'reserved' CHECK (validation_state IN ('reserved','validating','cleanup_pending','validation_unavailable','ready','failed','cancelled')),
  access_scope text NOT NULL DEFAULT 'owner_admin' CHECK (access_scope IN ('owner_only','owner_admin')),
  validation_detail text,
  supersedes_version_id uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, supersedes_version_id) REFERENCES public.business_vault_versions(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.business_vault_records
  ADD CONSTRAINT business_vault_records_current_version_fk
  FOREIGN KEY (tenant_id, current_version_id)
  REFERENCES public.business_vault_versions(tenant_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.business_vault_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL,
  contract_type text NOT NULL CHECK (length(btrim(contract_type)) BETWEEN 1 AND 80),
  counterparty_name text,
  effective_date date,
  end_date date,
  renewal_date date,
  notice_days integer CHECK (notice_days IS NULL OR notice_days BETWEEN 0 AND 3650),
  payment_terms text,
  responsible_user_id uuid,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','signed','active','renewing','expiring','terminated','superseded','archived')),
  review_state text NOT NULL DEFAULT 'owner_entered' CHECK (review_state IN ('owner_entered','awaiting_review','confirmed','rejected','unavailable')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, record_id),
  FOREIGN KEY (tenant_id, record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.business_vault_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_record_id uuid,
  contract_id uuid,
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  due_at timestamptz,
  cadence text,
  timezone text,
  notice_days integer CHECK (notice_days IS NULL OR notice_days BETWEEN 0 AND 3650),
  responsible_user_id uuid,
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','awaiting_review','confirmed','due_soon','in_progress','completed','renewed','waived','overdue','retired','unavailable')),
  source_state text NOT NULL DEFAULT 'missing' CHECK (source_state IN ('current','missing','stale','superseded')),
  next_action text,
  assistance_level text NOT NULL DEFAULT 'notice' CHECK (assistance_level IN ('notice','propose','monitor','prepare','request_approval','execute','record_outcome')),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, source_record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contract_id) REFERENCES public.business_vault_contracts(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.business_vault_record_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL,
  link_kind text NOT NULL CHECK (link_kind IN ('client','relationship')),
  linked_id uuid NOT NULL,
  label text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, record_id, link_kind, linked_id),
  FOREIGN KEY (tenant_id, record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.business_vault_context_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL,
  version_id uuid NOT NULL,
  fact_key text NOT NULL CHECK (fact_key IN ('business_legal_name','business_registration_state','business_license_status','insurance_coverage_status','operating_region','policy_status')),
  fact_value jsonb NOT NULL CHECK (jsonb_typeof(fact_value) IN ('string','number','boolean')),
  provenance text NOT NULL CHECK (provenance IN ('owner_entered','reviewed_extraction')),
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','approved','corrected','rejected','revoked','retired')),
  fresh_until timestamptz,
  supersedes_fact_id uuid,
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, version_id) REFERENCES public.business_vault_versions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, supersedes_fact_id) REFERENCES public.business_vault_context_facts(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.business_vault_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  record_id uuid,
  actor_user_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('record_created','upload_reserved','upload_ready','upload_failed','record_updated','classification_reviewed','fact_approved','fact_rejected','fact_revoked','version_replaced','record_archived','contract_updated','obligation_updated')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, record_id) REFERENCES public.business_vault_records(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX business_vault_records_tenant_updated_idx ON public.business_vault_records(tenant_id, updated_at DESC);
CREATE INDEX business_vault_versions_record_idx ON public.business_vault_versions(tenant_id, record_id, created_at DESC);
CREATE INDEX business_vault_obligations_due_idx ON public.business_vault_obligations(tenant_id, due_at) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX business_vault_versions_tenant_digest_idx ON public.business_vault_versions(tenant_id, access_scope, sha256)
WHERE validation_state IN ('ready','validation_unavailable') AND sha256 IS NOT NULL;
CREATE UNIQUE INDEX business_vault_current_fact_idx ON public.business_vault_context_facts(tenant_id, fact_key) WHERE state = 'approved';

ALTER TABLE public.business_vault_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_obligations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_record_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_context_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_context_facts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_vault_activity FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._business_vault_can_read(p_tenant uuid, p_visibility text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_tenant = public._business_vault_current_admin_tenant()
    AND (
      p_visibility = 'owner_admin'
      OR EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.tenant_id = p_tenant
          AND tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND (tm.is_owner = true OR tm.role::text = 'owner')
      )
    );
$$;
REVOKE ALL ON FUNCTION public._business_vault_can_read(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE POLICY business_vault_records_read ON public.business_vault_records
FOR SELECT TO authenticated USING (public._business_vault_can_read(tenant_id, visibility));
CREATE POLICY business_vault_versions_read ON public.business_vault_versions
FOR SELECT TO authenticated USING (
  tenant_id = public._business_vault_current_admin_tenant()
  AND EXISTS (
    SELECT 1 FROM public.business_vault_records r
    WHERE r.tenant_id = business_vault_versions.tenant_id
      AND r.id = business_vault_versions.record_id
      AND public._business_vault_can_read(r.tenant_id, r.visibility)
  )
);
CREATE POLICY business_vault_contracts_read ON public.business_vault_contracts
FOR SELECT TO authenticated USING (
  tenant_id = public._business_vault_current_admin_tenant()
  AND EXISTS (SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id = business_vault_contracts.tenant_id AND r.id = business_vault_contracts.record_id AND public._business_vault_can_read(r.tenant_id, r.visibility))
);
CREATE POLICY business_vault_obligations_read ON public.business_vault_obligations
FOR SELECT TO authenticated USING (
  tenant_id = public._business_vault_current_admin_tenant()
  AND (source_record_id IS NULL OR EXISTS (SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id = business_vault_obligations.tenant_id AND r.id = business_vault_obligations.source_record_id AND public._business_vault_can_read(r.tenant_id, r.visibility)))
);
CREATE POLICY business_vault_links_read ON public.business_vault_record_links
FOR SELECT TO authenticated USING (
  tenant_id = public._business_vault_current_admin_tenant()
  AND EXISTS (SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id = business_vault_record_links.tenant_id AND r.id = business_vault_record_links.record_id AND public._business_vault_can_read(r.tenant_id, r.visibility))
);
CREATE POLICY business_vault_activity_read ON public.business_vault_activity
FOR SELECT TO authenticated USING (
  tenant_id = public._business_vault_current_admin_tenant()
  AND (record_id IS NULL OR EXISTS (SELECT 1 FROM public.business_vault_records r WHERE r.tenant_id = business_vault_activity.tenant_id AND r.id = business_vault_activity.record_id AND public._business_vault_can_read(r.tenant_id, r.visibility)))
);

REVOKE ALL ON public.business_vault_records, public.business_vault_versions, public.business_vault_contracts,
  public.business_vault_obligations, public.business_vault_record_links, public.business_vault_context_facts,
  public.business_vault_activity FROM PUBLIC, anon;
GRANT SELECT ON public.business_vault_records, public.business_vault_versions, public.business_vault_contracts,
  public.business_vault_obligations, public.business_vault_record_links, public.business_vault_activity TO authenticated;
GRANT ALL ON public.business_vault_records, public.business_vault_versions, public.business_vault_contracts,
  public.business_vault_obligations, public.business_vault_record_links, public.business_vault_context_facts,
  public.business_vault_activity TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-vault-files',
  'business-vault-files',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.business_vault_reserve_upload(
  p_title text,
  p_section text,
  p_record_type text,
  p_handling_mode text,
  p_visibility text,
  p_original_filename text,
  p_declared_mime text,
  p_declared_size bigint,
  p_replace_record_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public._business_vault_current_admin_tenant();
  v_record public.business_vault_records;
  v_version uuid := gen_random_uuid();
  v_object uuid := gen_random_uuid();
  v_path text;
BEGIN
  IF p_original_filename ~* '(password|passwd|api[-_ ]?key|secret|recovery[-_ ]?code|private[-_ ]?key|seed[-_ ]?phrase|wallet|credential|token)'
     OR p_declared_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     OR p_declared_size <= 0 OR p_declared_size > 15728640 THEN
    RAISE EXCEPTION 'VAULT_UPLOAD_REFUSED' USING ERRCODE = '22023';
  END IF;

  IF p_replace_record_id IS NULL THEN
    INSERT INTO public.business_vault_records (
      tenant_id, title, section, record_type, handling_mode, visibility, lifecycle_state,
      truth_state, source_kind, source_state, interpretation_state, created_by
    ) VALUES (
      v_tenant, btrim(p_title), p_section, btrim(p_record_type), p_handling_mode, p_visibility,
      'draft', 'owner_entered', 'manual_upload', 'current',
      CASE WHEN p_handling_mode = 'store_only' THEN 'not_requested' ELSE 'unavailable' END,
      auth.uid()
    ) RETURNING * INTO v_record;
  ELSE
    SELECT * INTO v_record
    FROM public.business_vault_records r
    WHERE r.tenant_id = v_tenant AND r.id = p_replace_record_id
      AND public._business_vault_can_read(r.tenant_id, r.visibility)
    FOR UPDATE;
    IF v_record.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE = '42501'; END IF;
  END IF;

  v_path := v_tenant::text || '/' || v_record.id::text || '/' || v_version::text || '/' || v_object::text;
  INSERT INTO public.business_vault_versions (
    id, tenant_id, record_id, storage_path, original_filename, declared_mime, declared_size,
    validation_state, supersedes_version_id, created_by
  ) VALUES (
    v_version, v_tenant, v_record.id, v_path, p_original_filename, p_declared_mime, p_declared_size,
    'reserved', v_record.current_version_id, auth.uid()
  );
  INSERT INTO public.business_vault_activity (tenant_id, record_id, actor_user_id, event_kind, summary)
  VALUES (v_tenant, v_record.id, auth.uid(), 'upload_reserved', 'A document upload was reserved.');

  RETURN jsonb_build_object('record_id', v_record.id, 'version_id', v_version, 'storage_path', v_path);
END;
$$;
REVOKE ALL ON FUNCTION public.business_vault_reserve_upload(text,text,text,text,text,text,text,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_vault_reserve_upload(text,text,text,text,text,text,text,bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_finalize_upload(
  p_actor uuid,
  p_version_id uuid,
  p_actual_mime text,
  p_actual_size bigint,
  p_sha256 text,
  p_validation_state text,
  p_validation_detail text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_version public.business_vault_versions;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF p_validation_state NOT IN ('ready','validation_unavailable','failed') THEN
    RAISE EXCEPTION 'VAULT_FINALIZE_REFUSED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_version
  FROM public.business_vault_versions
  WHERE id = p_version_id AND created_by = p_actor AND validation_state IN ('reserved','validating')
  FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'VAULT_UNAVAILABLE' USING ERRCODE = '42501'; END IF;

  IF p_sha256 IS NOT NULL
     AND p_validation_state IN ('ready','validation_unavailable')
     AND EXISTS (
       SELECT 1 FROM public.business_vault_versions existing
       WHERE existing.tenant_id = v_version.tenant_id
         AND existing.sha256 = p_sha256
         AND existing.id <> v_version.id
         AND existing.validation_state IN ('ready','validation_unavailable')
     ) THEN
    UPDATE public.business_vault_versions
      SET validation_state = 'cancelled',
          validation_detail = 'Duplicate source content was not stored.',
          finalized_at = now()
    WHERE id = v_version.id;
    UPDATE public.business_vault_records
      SET lifecycle_state = CASE WHEN current_version_id IS NULL THEN 'draft' ELSE lifecycle_state END,
          truth_state = 'failed', updated_at = now()
    WHERE tenant_id = v_version.tenant_id AND id = v_version.record_id;
    INSERT INTO public.business_vault_activity (tenant_id, record_id, actor_user_id, event_kind, summary)
    VALUES (v_version.tenant_id, v_version.record_id, p_actor, 'upload_failed', 'Duplicate source content was not stored.');
    RETURN jsonb_build_object('record_id', v_version.record_id, 'version_id', v_version.id, 'state', 'cancelled', 'duplicate', true);
  END IF;

  UPDATE public.business_vault_versions
  SET actual_mime = p_actual_mime, actual_size = p_actual_size, sha256 = p_sha256,
      validation_state = p_validation_state, validation_detail = left(p_validation_detail, 240),
      finalized_at = now()
  WHERE id = v_version.id;

  IF p_validation_state IN ('ready','validation_unavailable') THEN
    IF v_version.supersedes_version_id IS NOT NULL THEN
      UPDATE public.business_vault_context_facts
        SET state = 'retired', revoked_at = now(), reviewed_by = p_actor, reviewed_at = now()
      WHERE tenant_id = v_version.tenant_id
        AND record_id = v_version.record_id
        AND state = 'approved';
      UPDATE public.business_vault_obligations
        SET source_state = 'stale',
            state = CASE WHEN state IN ('completed','renewed','waived','retired') THEN state ELSE 'awaiting_review' END,
            updated_at = now()
      WHERE tenant_id = v_version.tenant_id
        AND source_record_id = v_version.record_id;
      INSERT INTO public.business_vault_activity (tenant_id, record_id, actor_user_id, event_kind, summary)
      VALUES (v_version.tenant_id, v_version.record_id, p_actor, 'version_replaced', 'Source version replaced; prior approved facts retired and dependent obligations require review.');
    END IF;
    UPDATE public.business_vault_records
      SET current_version_id = v_version.id, lifecycle_state = 'active',
          truth_state = 'owner_entered', updated_at = now()
    WHERE tenant_id = v_version.tenant_id AND id = v_version.record_id;
    INSERT INTO public.business_vault_activity (tenant_id, record_id, actor_user_id, event_kind, summary)
    VALUES (v_version.tenant_id, v_version.record_id, p_actor, 'upload_ready', 'The uploaded source was stored. Content validation remains unavailable.');
  ELSE
    UPDATE public.business_vault_records
      SET lifecycle_state = CASE WHEN current_version_id IS NULL THEN 'draft' ELSE lifecycle_state END,
          truth_state = 'failed', updated_at = now()
    WHERE tenant_id = v_version.tenant_id AND id = v_version.record_id;
    INSERT INTO public.business_vault_activity (tenant_id, record_id, actor_user_id, event_kind, summary)
    VALUES (v_version.tenant_id, v_version.record_id, p_actor, 'upload_failed', 'The upload could not be completed.');
  END IF;
  RETURN jsonb_build_object('record_id', v_version.record_id, 'version_id', v_version.id, 'state', p_validation_state);
END;
$$;
REVOKE ALL ON FUNCTION public.business_vault_finalize_upload(uuid,uuid,text,bigint,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_vault_finalize_upload(uuid,uuid,text,bigint,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.business_vault_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public._business_vault_current_admin_tenant();
BEGIN
  RETURN jsonb_build_object(
    'records', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'section', r.section, 'recordType', r.record_type,
        'handlingMode', r.handling_mode, 'lifecycleState', r.lifecycle_state,
        'truthState', r.truth_state, 'sourceState', r.source_state,
        'originalFilename', v.original_filename, 'versionId', v.id,
        'validationState', v.validation_state, 'validationDetail', v.validation_detail,
        'visibility', r.visibility, 'interpretationState', r.interpretation_state,
        'createdAt', r.created_at, 'updatedAt', r.updated_at
      ) ORDER BY r.updated_at DESC)
      FROM public.business_vault_records r
      LEFT JOIN public.business_vault_versions v ON v.tenant_id = r.tenant_id AND v.id = r.current_version_id
      WHERE r.tenant_id = v_tenant AND public._business_vault_can_read(r.tenant_id, r.visibility)
    ), '[]'::jsonb),
    'obligations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title, 'category', o.category, 'state', o.state,
        'dueAt', o.due_at, 'cadence', o.cadence, 'nextAction', o.next_action,
        'sourceRecordId', o.source_record_id, 'sourceState', o.source_state,
        'ownerAssigned', o.responsible_user_id IS NOT NULL
      ) ORDER BY o.due_at NULLS LAST)
      FROM public.business_vault_obligations o
      WHERE o.tenant_id = v_tenant AND o.archived_at IS NULL
    ), '[]'::jsonb),
    'facts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'recordId', f.record_id, 'versionId', f.version_id,
        'factKey', f.fact_key, 'factValue', f.fact_value, 'provenance', f.provenance,
        'state', f.state, 'freshUntil', f.fresh_until, 'reviewedAt', f.reviewed_at
      ) ORDER BY f.created_at DESC)
      FROM public.business_vault_context_facts f
      JOIN public.business_vault_records r ON r.tenant_id=f.tenant_id AND r.id=f.record_id
      WHERE f.tenant_id=v_tenant
        AND f.state IN ('proposed','approved')
        AND public._business_vault_can_read(r.tenant_id,r.visibility)
    ), '[]'::jsonb),
    'contracts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'recordId', c.record_id, 'contractType', c.contract_type,
        'counterpartyName', c.counterparty_name, 'effectiveDate', c.effective_date,
        'endDate', c.end_date, 'renewalDate', c.renewal_date, 'noticeDays', c.notice_days,
        'paymentTerms', c.payment_terms, 'state', c.state, 'reviewState', c.review_state,
        'ownerAssigned', c.responsible_user_id IS NOT NULL
      ) ORDER BY c.updated_at DESC)
      FROM public.business_vault_contracts c
      WHERE c.tenant_id = v_tenant
    ), '[]'::jsonb),
    'contractsNeedingAttention', (
      SELECT count(*) FROM public.business_vault_contracts c
      WHERE c.tenant_id = v_tenant AND c.state IN ('renewing','expiring')
    ),
    'awaitingReview', (
      SELECT count(*) FROM public.business_vault_records r
      WHERE r.tenant_id = v_tenant AND r.interpretation_state IN ('pending','proposed')
        AND public._business_vault_can_read(r.tenant_id, r.visibility)
    ),
    'recentlyVerified', (
      SELECT count(*) FROM public.business_vault_context_facts f
      JOIN public.business_vault_records r ON r.tenant_id = f.tenant_id AND r.id = f.record_id
      WHERE f.tenant_id = v_tenant AND f.state = 'approved'
        AND f.reviewed_at >= now() - interval '30 days'
        AND public._business_vault_can_read(r.tenant_id, r.visibility)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.business_vault_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_vault_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.business_vault_get_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := public._business_vault_current_admin_tenant();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'fact_key', f.fact_key,
      'fact_value', f.fact_value,
      'source_record_id', f.record_id,
      'source_version_id', f.version_id,
      'provenance', f.provenance,
      'reviewed_at', f.reviewed_at,
      'fresh_until', f.fresh_until
    ))
    FROM public.business_vault_context_facts f
    JOIN public.business_vault_records r ON r.tenant_id = f.tenant_id AND r.id = f.record_id
    JOIN public.business_vault_versions v ON v.tenant_id = f.tenant_id AND v.id = f.version_id
    WHERE f.tenant_id = v_tenant
      AND f.state = 'approved'
      AND r.lifecycle_state = 'active'
      AND r.source_state = 'current'
      AND r.handling_mode = 'approved_context'
      AND f.version_id = r.current_version_id
      AND v.validation_state IN ('ready','validation_unavailable')
      AND (f.fresh_until IS NULL OR f.fresh_until > now())
      AND public._business_vault_can_read(r.tenant_id, r.visibility)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.business_vault_get_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_vault_get_context() TO authenticated;

COMMENT ON FUNCTION public.business_vault_get_context() IS
  'Bounded reviewed Vault fact projection. Not wired to Chat, Mind, Rail, Systems Check, or external actions in Phase 2.';
