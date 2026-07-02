
-- =====================================================================
-- Ship #3.6 — Bidirectional Customer-Scoped Paige
-- Sprint C.3 — MCC ecosystem exit (§199)
-- Invariants: §180 Cat B audit, §189 consent gate, §190 encryption
--             (payload_json here holds no direct PII beyond references),
--             §194 monitoring/building language only, §200 test tenant first.
-- =====================================================================

-- ---- paige_customer_actions ---------------------------------------
CREATE TABLE IF NOT EXISTS public.paige_customer_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  initiated_by_admin_id uuid NOT NULL,
  action_type text NOT NULL
    CHECK (action_type IN ('task','message','recommendation','nudge')),
  title text NOT NULL,
  body text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','customer_notified','customer_acted','customer_declined','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.paige_customer_actions TO authenticated;
GRANT ALL ON public.paige_customer_actions TO service_role;
ALTER TABLE public.paige_customer_actions ENABLE ROW LEVEL SECURITY;

-- Admin/coach in same tenant scope can read
CREATE POLICY "pca_tenant_staff_read" ON public.paige_customer_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'super_admin'::public.app_role)
      OR public.has_role(auth.uid(),'coach'::public.app_role)
      OR public.is_platform_owner()
    )
  );

-- Customer (subject) can read their own actions
CREATE POLICY "pca_customer_subject_read" ON public.paige_customer_actions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = paige_customer_actions.contact_id
      AND c.linked_user_id = auth.uid()
  ));

-- All writes go through SECURITY DEFINER RPCs; block direct writes
CREATE POLICY "pca_no_direct_write" ON public.paige_customer_actions
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "pca_no_direct_update" ON public.paige_customer_actions
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_pca_contact ON public.paige_customer_actions(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pca_tenant  ON public.paige_customer_actions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pca_status  ON public.paige_customer_actions(status, expires_at);

CREATE OR REPLACE FUNCTION public._touch_pca_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_pca_touch ON public.paige_customer_actions;
CREATE TRIGGER trg_pca_touch BEFORE UPDATE ON public.paige_customer_actions
  FOR EACH ROW EXECUTE FUNCTION public._touch_pca_updated_at();

-- ---- paige_customer_responses -------------------------------------
CREATE TABLE IF NOT EXISTS public.paige_customer_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.paige_customer_actions(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  responded_by_user_id uuid NOT NULL,
  response_type text NOT NULL
    CHECK (response_type IN ('accepted','declined','question','completed')),
  response_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.paige_customer_responses TO authenticated;
GRANT ALL ON public.paige_customer_responses TO service_role;
ALTER TABLE public.paige_customer_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcr_tenant_staff_read" ON public.paige_customer_responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.paige_customer_actions a
    WHERE a.id = paige_customer_responses.action_id
      AND a.tenant_id = public.current_user_tenant_id()
      AND (
        public.has_role(auth.uid(),'admin'::public.app_role)
        OR public.has_role(auth.uid(),'super_admin'::public.app_role)
        OR public.has_role(auth.uid(),'coach'::public.app_role)
        OR public.is_platform_owner()
      )
  ));

CREATE POLICY "pcr_customer_subject_read" ON public.paige_customer_responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = paige_customer_responses.contact_id
      AND c.linked_user_id = auth.uid()
  ));

CREATE POLICY "pcr_no_direct_write" ON public.paige_customer_responses
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_pcr_action  ON public.paige_customer_responses(action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_contact ON public.paige_customer_responses(contact_id, created_at DESC);

-- =====================================================================
-- RPC: admin_propose_paige_actions
--   p_actions = jsonb array of { action_type, title, body, payload }
-- Enforces consent gate + tenant scoping. §180 Cat B audit.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_propose_paige_actions(
  p_contact_id uuid,
  p_actions jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_contact_tenant uuid;
  v_client_user uuid;
  v_consent boolean;
  v_action jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED');
  END IF;
  IF p_contact_id IS NULL OR p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_INPUT');
  END IF;

  v_tenant := public.current_user_tenant_id();
  IF v_tenant IS NULL AND NOT public.is_platform_owner() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_TENANT');
  END IF;

  SELECT c.tenant_id, c.linked_user_id, c.paige_shared_context_consent
    INTO v_contact_tenant, v_client_user, v_consent
  FROM public.clients c WHERE c.id = p_contact_id;

  IF v_contact_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONTACT_NOT_FOUND');
  END IF;
  IF NOT public.is_platform_owner() AND v_contact_tenant <> v_tenant THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT_FORBIDDEN');
  END IF;

  IF NOT (
    public.has_role(v_uid,'admin'::public.app_role)
    OR public.has_role(v_uid,'super_admin'::public.app_role)
    OR public.has_role(v_uid,'coach'::public.app_role)
    OR public.is_platform_owner()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF NOT v_consent THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CONSENT_NOT_GRANTED',
      'message', 'Customer has not consented to Paige-brokered actions.');
  END IF;

  FOR v_action IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    INSERT INTO public.paige_customer_actions(
      tenant_id, contact_id, initiated_by_admin_id,
      action_type, title, body, payload_json, status
    ) VALUES (
      v_contact_tenant, p_contact_id, v_uid,
      COALESCE(v_action->>'action_type','recommendation'),
      COALESCE(v_action->>'title','Recommendation'),
      NULLIF(v_action->>'body',''),
      COALESCE(v_action->'payload','{}'::jsonb),
      'customer_notified'
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);

    IF v_client_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, action_url, metadata)
      VALUES (
        v_client_user, 'system'::public.notification_type,
        'Your coach shared a new step',
        COALESCE(v_action->>'title','New recommendation from your coach'),
        '/workspace/paige/actions',
        jsonb_build_object('source','paige_customer_action','action_id', v_new_id)
      );
    END IF;
  END LOOP;

  INSERT INTO public.paige_audit_log(actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid, 'admin_propose_paige_actions', 'paige_customer_action', p_contact_id,
    jsonb_build_object('count', array_length(v_ids,1), 'tenant_id', v_contact_tenant, 'ids', v_ids)
  );

  RETURN jsonb_build_object('ok', true, 'count', array_length(v_ids,1), 'ids', v_ids);
END; $$;

REVOKE ALL ON FUNCTION public.admin_propose_paige_actions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_propose_paige_actions(uuid, jsonb) TO authenticated, service_role;

-- =====================================================================
-- RPC: customer_respond_to_action
-- =====================================================================
CREATE OR REPLACE FUNCTION public.customer_respond_to_action(
  p_action_id uuid,
  p_response_type text,
  p_response_text text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action public.paige_customer_actions%ROWTYPE;
  v_owner uuid;
  v_new_status text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHENTICATED'); END IF;
  IF p_response_type NOT IN ('accepted','declined','question','completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RESPONSE_TYPE');
  END IF;

  SELECT * INTO v_action FROM public.paige_customer_actions WHERE id = p_action_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ACTION_NOT_FOUND'); END IF;

  SELECT linked_user_id INTO v_owner FROM public.clients WHERE id = v_action.contact_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_action.status = 'expired' OR v_action.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ACTION_EXPIRED');
  END IF;

  INSERT INTO public.paige_customer_responses(
    action_id, contact_id, responded_by_user_id, response_type, response_text
  ) VALUES (
    p_action_id, v_action.contact_id, v_uid, p_response_type, NULLIF(p_response_text,'')
  );

  v_new_status := CASE p_response_type
    WHEN 'declined' THEN 'customer_declined'
    WHEN 'completed' THEN 'customer_acted'
    WHEN 'accepted' THEN 'customer_acted'
    ELSE v_action.status
  END;

  UPDATE public.paige_customer_actions
     SET status = v_new_status, updated_at = now()
   WHERE id = p_action_id;

  -- Notify the admin/coach who proposed it
  INSERT INTO public.notifications(user_id, type, title, message, action_url, metadata)
  VALUES (
    v_action.initiated_by_admin_id, 'system'::public.notification_type,
    'Client responded to your Paige action',
    COALESCE(v_action.title,'Action') || ' — ' || p_response_type,
    '/admin/contacts/' || v_action.contact_id::text,
    jsonb_build_object('source','paige_customer_response','action_id', p_action_id, 'response_type', p_response_type)
  );

  INSERT INTO public.paige_audit_log(actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid, 'customer_respond_to_action', 'paige_customer_action', p_action_id,
    jsonb_build_object('response_type', p_response_type, 'contact_id', v_action.contact_id)
  );

  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END; $$;

REVOKE ALL ON FUNCTION public.customer_respond_to_action(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_action(uuid, text, text) TO authenticated, service_role;

-- =====================================================================
-- RPC: list_pending_customer_actions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_pending_customer_actions(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT a.id, a.action_type, a.title, a.body, a.status, a.expires_at, a.created_at,
      (SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at), '[]'::jsonb)
         FROM public.paige_customer_responses r WHERE r.action_id = a.id) AS responses
    FROM public.paige_customer_actions a
    WHERE a.contact_id = p_contact_id
  ) t;
  RETURN jsonb_build_object('ok', true, 'actions', v_rows);
END; $$;

GRANT EXECUTE ON FUNCTION public.list_pending_customer_actions(uuid) TO authenticated, service_role;

-- ---- Realtime ------------------------------------------------------
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_customer_actions;   EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_customer_responses; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =====================================================================
-- Sprint C.3 — MCC ecosystem exit (§199)
--   1C: drop mcc_service_requests
--   Route/edge-function follow-up handled in code layer.
-- =====================================================================
DROP TABLE IF EXISTS public.mcc_service_requests CASCADE;
