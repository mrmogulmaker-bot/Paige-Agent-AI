
ALTER TABLE public.paige_data_source_registry
  ADD COLUMN IF NOT EXISTS context_scope text NOT NULL DEFAULT 'contact'
    CHECK (context_scope IN ('platform','tenant','contact','self')),
  ADD COLUMN IF NOT EXISTS context_priority int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS context_max_rows int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS context_field_whitelist text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS paige_shared_context_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paige_shared_context_consent_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.paige_context_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  contact_id uuid,
  caller_user_id uuid NOT NULL,
  caller_role text NOT NULL DEFAULT 'coach',
  scope text NOT NULL CHECK (scope IN ('contact','self')),
  surfaces_used text[] NOT NULL DEFAULT '{}',
  row_count int NOT NULL DEFAULT 0,
  token_estimate int NOT NULL DEFAULT 0,
  consent_state text NOT NULL DEFAULT 'granted'
    CHECK (consent_state IN ('granted','denied','self')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_context_loads TO authenticated;
GRANT ALL ON public.paige_context_loads TO service_role;
ALTER TABLE public.paige_context_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csp_loads_caller_read"
  ON public.paige_context_loads FOR SELECT TO authenticated
  USING (caller_user_id = auth.uid());

CREATE POLICY "csp_loads_subject_read"
  ON public.paige_context_loads FOR SELECT TO authenticated
  USING (
    contact_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = paige_context_loads.contact_id
        AND c.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "csp_loads_tenant_admin_read"
  ON public.paige_context_loads FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = public.current_user_tenant_id()
    AND (
      public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    )
  );

CREATE INDEX IF NOT EXISTS idx_csp_loads_contact ON public.paige_context_loads(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_loads_caller  ON public.paige_context_loads(caller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_loads_tenant  ON public.paige_context_loads(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.require_tenant_brand(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_domain public.tenant_email_domains%ROWTYPE;
  v_sender_name text;
  v_brand_name text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant_id is null' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant % not found', p_tenant_id USING ERRCODE = 'P0001';
  END IF;
  v_brand_name  := NULLIF(TRIM(COALESCE(v_tenant.brand->>'name', v_tenant.name)), '');
  v_sender_name := NULLIF(TRIM(COALESCE(v_tenant.brand->>'sender_name', v_brand_name)), '');
  IF v_brand_name IS NULL OR v_sender_name IS NULL THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant % missing brand.name/sender_name', p_tenant_id USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_domain
  FROM public.tenant_email_domains
  WHERE tenant_id = p_tenant_id AND status = 'verified'
  ORDER BY is_default DESC, verified_at DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SENDER_IDENTITY_NOT_CONFIGURED: tenant % has no verified email domain', p_tenant_id USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'brand_name', v_brand_name,
    'sender_name', v_sender_name,
    'from_email', v_domain.from_email_local || '@' || v_domain.domain,
    'from_name', COALESCE(v_domain.from_name, v_sender_name),
    'domain', v_domain.domain
  );
END;
$$;

REVOKE ALL ON FUNCTION public.require_tenant_brand(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.require_tenant_brand(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.load_contact_context(
  p_contact_id uuid,
  p_scopes text[] DEFAULT ARRAY['contact']::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_bundle jsonb := '{}'::jsonb;
  v_surfaces text[] := '{}';
  v_row_count int := 0;
  v_load_id uuid;
  v_consent boolean;
  v_tenant uuid;
  r record;
  q text;
  data jsonb;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONTACT_NOT_FOUND');
  END IF;
  v_tenant := v_client.tenant_id;
  v_consent := COALESCE(v_client.paige_shared_context_consent, false);
  IF v_client.linked_user_id = auth.uid() THEN
    v_consent := true;
  END IF;
  IF NOT v_consent THEN
    INSERT INTO public.paige_context_loads(tenant_id, contact_id, caller_user_id, caller_role, scope, surfaces_used, row_count, consent_state)
    VALUES (v_tenant, p_contact_id, auth.uid(), 'coach', 'contact', '{}', 0, 'denied')
    RETURNING id INTO v_load_id;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'CONSENT_NOT_GRANTED',
      'message', 'Customer has not consented to sharing context with coach''s Paige. Ask them to enable in their workspace settings.',
      'load_id', v_load_id
    );
  END IF;
  FOR r IN
    SELECT surface, table_name, column_name, context_field_whitelist, context_max_rows, context_priority
    FROM public.paige_data_source_registry
    WHERE paige_context_eligible = true
      AND context_scope = ANY(p_scopes)
      AND array_length(context_field_whitelist,1) > 0
      AND table_name IS NOT NULL
    ORDER BY context_priority ASC
  LOOP
    BEGIN
      q := format(
        'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT %s FROM public.%I WHERE %I = $1 ORDER BY updated_at DESC NULLS LAST LIMIT %s) t',
        (SELECT string_agg(quote_ident(c), ',') FROM unnest(r.context_field_whitelist) c),
        r.table_name,
        COALESCE(r.column_name, 'contact_id'),
        r.context_max_rows
      );
      EXECUTE q INTO data USING p_contact_id;
      IF data IS NOT NULL AND jsonb_array_length(data) > 0 THEN
        v_bundle := v_bundle || jsonb_build_object(r.surface, data);
        v_surfaces := array_append(v_surfaces, r.surface);
        v_row_count := v_row_count + jsonb_array_length(data);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
  INSERT INTO public.paige_context_loads(tenant_id, contact_id, caller_user_id, caller_role, scope, surfaces_used, row_count, consent_state)
  VALUES (v_tenant, p_contact_id, auth.uid(), 'coach', 'contact', v_surfaces, v_row_count,
          CASE WHEN v_client.linked_user_id = auth.uid() THEN 'self' ELSE 'granted' END)
  RETURNING id INTO v_load_id;
  RETURN jsonb_build_object(
    'ok', true,
    'load_id', v_load_id,
    'contact_id', p_contact_id,
    'surfaces_used', v_surfaces,
    'row_count', v_row_count,
    'bundle', v_bundle
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_contact_context(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_self_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  SELECT id INTO v_contact_id FROM public.clients WHERE linked_user_id = auth.uid() LIMIT 1;
  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_LINKED_CONTACT');
  END IF;
  RETURN public.load_contact_context(v_contact_id, ARRAY['contact','self']::text[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_self_context() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_paige_activity_summary(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_count int;
  v_last timestamptz;
BEGIN
  SELECT id INTO v_contact_id FROM public.clients WHERE linked_user_id = auth.uid() LIMIT 1;
  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_LINKED_CONTACT');
  END IF;
  SELECT count(*), max(created_at) INTO v_count, v_last
  FROM public.paige_context_loads
  WHERE contact_id = v_contact_id
    AND consent_state = 'granted'
    AND created_at > now() - make_interval(days => p_days);
  RETURN jsonb_build_object('ok', true, 'window_days', p_days, 'count', v_count, 'last_at', v_last);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_paige_activity_summary(int) TO authenticated, service_role;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_context_loads;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
