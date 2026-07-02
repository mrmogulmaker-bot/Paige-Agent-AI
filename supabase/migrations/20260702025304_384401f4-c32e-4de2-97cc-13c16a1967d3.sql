
ALTER TABLE public.paige_data_source_registry
  ADD COLUMN IF NOT EXISTS context_fk_column text;

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
    SELECT surface, table_name, context_fk_column, context_field_whitelist, context_max_rows, context_priority
    FROM public.paige_data_source_registry
    WHERE paige_context_eligible = true
      AND context_scope = ANY(p_scopes)
      AND array_length(context_field_whitelist,1) > 0
      AND table_name IS NOT NULL
      AND context_fk_column IS NOT NULL
    ORDER BY context_priority ASC
  LOOP
    BEGIN
      q := format(
        'SELECT coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT %s FROM public.%I WHERE %I = $1 LIMIT %s) t',
        (SELECT string_agg(quote_ident(c), ',') FROM unnest(r.context_field_whitelist) c),
        r.table_name,
        r.context_fk_column,
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

INSERT INTO public.paige_data_source_registry(
  surface, field_key, table_name, column_name, ecosystem_owner, sync_mechanism,
  paige_context_eligible, pii_sensitive,
  context_scope, context_priority, context_max_rows, context_fk_column, context_field_whitelist
) VALUES
  ('CSP.ClientProfile','profile','clients','id','tenant','direct',true,false,'contact',10,1,'id',
     ARRAY['first_name','last_name','email','lifecycle_stage','entity_name','funding_goal','monthly_revenue','current_notes','tier','onboarding_stage','primary_offer','tags']),
  ('CSP.ClientNotes','notes','client_notes','body','tenant','direct',true,false,'contact',20,10,'contact_id',
     ARRAY['body','created_at']),
  ('CSP.CreditReports','credit_snapshot','credit_report_uploads','score_snapshot','tenant','direct',true,false,'contact',30,3,'client_id',
     ARRAY['score_snapshot','uploaded_at','bureau_source']),
  ('CSP.ClientMemory','memory','client_memory','summary','tenant','direct',true,false,'contact',40,10,'client_id',
     ARRAY['memory_type','summary','created_at']),
  ('CSP.RecentConversations','conversation','paige_conversations','title','tenant','direct',true,false,'contact',50,5,'contact_id',
     ARRAY['title','summary','updated_at'])
ON CONFLICT DO NOTHING;
