
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- tenant_features ----
CREATE TABLE IF NOT EXISTS public.tenant_features (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_services_enabled boolean NOT NULL DEFAULT false,
  coaching_enabled boolean NOT NULL DEFAULT false,
  legal_services_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_features TO authenticated;
GRANT ALL ON public.tenant_features TO service_role;
ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read features" ON public.tenant_features
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_member(tenant_id));

CREATE POLICY "tenant owners write features" ON public.tenant_features
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_owner(auth.uid(), tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_owner(auth.uid(), tenant_id));

CREATE OR REPLACE FUNCTION public._touch_tenant_features_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_tenant_features_touch ON public.tenant_features;
CREATE TRIGGER trg_tenant_features_touch
  BEFORE UPDATE ON public.tenant_features
  FOR EACH ROW EXECUTE FUNCTION public._touch_tenant_features_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_tenant_features_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tenant_features(tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_tenant_features_row() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenants_ensure_features ON public.tenants;
CREATE TRIGGER trg_tenants_ensure_features
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.ensure_tenant_features_row();

INSERT INTO public.tenant_features (tenant_id)
SELECT t.id FROM public.tenants t
LEFT JOIN public.tenant_features tf ON tf.tenant_id = t.id
WHERE tf.tenant_id IS NULL;

UPDATE public.tenant_features
SET credit_services_enabled = true, coaching_enabled = true
WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'mma');

-- ---- tenant_feature_enabled (Category B) ----
CREATE OR REPLACE FUNCTION public.tenant_feature_enabled(_tenant_id uuid, _feature text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.tenant_features%ROWTYPE;
BEGIN
  IF _tenant_id IS NULL OR _feature IS NULL THEN RETURN false; END IF;
  SELECT * INTO _row FROM public.tenant_features WHERE tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE _feature
    WHEN 'credit_services_enabled' THEN _row.credit_services_enabled
    WHEN 'coaching_enabled'        THEN _row.coaching_enabled
    WHEN 'legal_services_enabled'  THEN _row.legal_services_enabled
    ELSE false END;
END; $$;
REVOKE ALL ON FUNCTION public.tenant_feature_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_feature_enabled(uuid, text) TO authenticated, service_role;

-- ---- encrypted webhook URL ----
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS automation_webhook_url_encrypted bytea;
REVOKE SELECT (automation_webhook_url_encrypted) ON public.tenants FROM authenticated;

CREATE OR REPLACE FUNCTION public._automation_webhook_key()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text;
BEGIN
  SELECT value INTO _key FROM public._internal_secrets WHERE key = 'automation_webhook_key' LIMIT 1;
  IF _key IS NULL THEN RAISE EXCEPTION 'automation_webhook_key not seeded'; END IF;
  RETURN _key;
END; $$;
REVOKE ALL ON FUNCTION public._automation_webhook_key() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_automation_webhook_url(_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _cipher bytea; _plain text;
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT automation_webhook_url_encrypted INTO _cipher FROM public.tenants WHERE id = _tenant_id;
  IF _cipher IS NULL THEN RETURN NULL; END IF;
  _plain := extensions.pgp_sym_decrypt(_cipher, public._automation_webhook_key());
  INSERT INTO public.pii_access_log (accessor_user_id, target_kind, target_id, field, purpose)
    VALUES (auth.uid(), 'tenant.automation_webhook_url', _tenant_id, 'automation_webhook_url', 'admin_read');
  RETURN _plain;
END; $$;
REVOKE ALL ON FUNCTION public.admin_get_automation_webhook_url(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_automation_webhook_url(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_automation_webhook_url(_tenant_id uuid, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT (public.is_platform_owner() OR public.is_tenant_admin(_tenant_id)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _url IS NULL OR length(trim(_url)) = 0 THEN
    UPDATE public.tenants SET automation_webhook_url_encrypted = NULL WHERE id = _tenant_id;
  ELSE
    IF _url NOT ILIKE 'https://%' THEN RAISE EXCEPTION 'webhook URL must be https://'; END IF;
    UPDATE public.tenants
      SET automation_webhook_url_encrypted = extensions.pgp_sym_encrypt(_url, public._automation_webhook_key())
      WHERE id = _tenant_id;
  END IF;
  INSERT INTO public.pii_access_log (accessor_user_id, target_kind, target_id, field, purpose)
    VALUES (auth.uid(), 'tenant.automation_webhook_url', _tenant_id, 'automation_webhook_url', 'admin_write');
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_automation_webhook_url(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_automation_webhook_url(uuid, text) TO authenticated, service_role;

-- ---- stage_automation_rules ----
CREATE TABLE IF NOT EXISTS public.stage_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  to_stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  compose_intent text NOT NULL CHECK (compose_intent IN ('transactional','marketing','nurture','notification')),
  tone text NOT NULL DEFAULT 'professional',
  template_hint text,
  send_mode text NOT NULL DEFAULT 'draft_for_review' CHECK (send_mode IN ('draft_for_review','auto_send')),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pipeline_id, from_stage_id, to_stage_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_automation_rules TO authenticated;
GRANT ALL ON public.stage_automation_rules TO service_role;
ALTER TABLE public.stage_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read rules" ON public.stage_automation_rules
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_member(tenant_id));

CREATE POLICY "tenant admins write rules" ON public.stage_automation_rules
  FOR ALL TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_platform_owner() OR public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public._touch_stage_automation_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_stage_automation_rules_touch ON public.stage_automation_rules;
CREATE TRIGGER trg_stage_automation_rules_touch
  BEFORE UPDATE ON public.stage_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public._touch_stage_automation_rules_updated_at();

CREATE INDEX IF NOT EXISTS idx_stage_rules_tenant_pipeline
  ON public.stage_automation_rules(tenant_id, pipeline_id) WHERE is_active;

-- ---- stage_automation_events ----
CREATE TABLE IF NOT EXISTS public.stage_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.stage_automation_rules(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  from_stage_id uuid,
  to_stage_id uuid,
  status text NOT NULL CHECK (status IN ('pending','dispatched','failed','skipped_inactive','skipped_no_webhook','skipped_no_rule','skipped_no_consent')),
  webhook_response jsonb,
  error text,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stage_automation_events TO authenticated;
GRANT ALL ON public.stage_automation_events TO service_role;
ALTER TABLE public.stage_automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read events" ON public.stage_automation_events
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR public.is_tenant_member(tenant_id));

CREATE INDEX IF NOT EXISTS idx_stage_events_tenant_deal
  ON public.stage_automation_events(tenant_id, deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_events_contact
  ON public.stage_automation_events(contact_id, created_at DESC);

-- ---- on_deal_stage_change (Category C, trigger-only) ----
CREATE OR REPLACE FUNCTION public.on_deal_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _rule public.stage_automation_rules%ROWTYPE;
  _tenant_url text;
  _platform_url text;
  _webhook_url text;
  _service_key text;
  _event_id uuid;
  _project_url constant text := 'https://bfmyebsjyuoecmjskqhs.supabase.co';
BEGIN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;

  SELECT * INTO _rule FROM public.stage_automation_rules
  WHERE tenant_id = NEW.tenant_id
    AND pipeline_id = NEW.pipeline_id
    AND to_stage_id = NEW.stage_id
    AND (from_stage_id = OLD.stage_id OR from_stage_id IS NULL)
  ORDER BY (from_stage_id IS NOT NULL) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.stage_automation_events
      (tenant_id, deal_id, contact_id, from_stage_id, to_stage_id, status)
      VALUES (NEW.tenant_id, NEW.id, NEW.contact_client_id, OLD.stage_id, NEW.stage_id, 'skipped_no_rule');
    RETURN NEW;
  END IF;

  IF NOT _rule.is_active THEN
    INSERT INTO public.stage_automation_events
      (tenant_id, rule_id, deal_id, contact_id, from_stage_id, to_stage_id, status)
      VALUES (NEW.tenant_id, _rule.id, NEW.id, NEW.contact_client_id, OLD.stage_id, NEW.stage_id, 'skipped_inactive');
    RETURN NEW;
  END IF;

  BEGIN
    SELECT extensions.pgp_sym_decrypt(automation_webhook_url_encrypted, public._automation_webhook_key())
      INTO _tenant_url
    FROM public.tenants WHERE id = NEW.tenant_id;
  EXCEPTION WHEN OTHERS THEN _tenant_url := NULL; END;

  SELECT value INTO _platform_url FROM public._internal_secrets
    WHERE key = 'platform_stage_change_webhook_url' LIMIT 1;

  _webhook_url := COALESCE(_tenant_url, _platform_url);

  IF _webhook_url IS NULL THEN
    INSERT INTO public.stage_automation_events
      (tenant_id, rule_id, deal_id, contact_id, from_stage_id, to_stage_id, status)
      VALUES (NEW.tenant_id, _rule.id, NEW.id, NEW.contact_client_id, OLD.stage_id, NEW.stage_id, 'skipped_no_webhook');
    RETURN NEW;
  END IF;

  INSERT INTO public.stage_automation_events
    (tenant_id, rule_id, deal_id, contact_id, from_stage_id, to_stage_id, status)
    VALUES (NEW.tenant_id, _rule.id, NEW.id, NEW.contact_client_id, OLD.stage_id, NEW.stage_id, 'pending')
    RETURNING id INTO _event_id;

  SELECT value INTO _service_key FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1;
  IF _service_key IS NULL THEN
    UPDATE public.stage_automation_events SET status='failed', error='service_role_key missing' WHERE id=_event_id;
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/dispatch-stage-automation',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||_service_key),
    body := jsonb_build_object(
      'event_id', _event_id,
      'webhook_url', _webhook_url,
      'tenant_id', NEW.tenant_id,
      'deal_id', NEW.id,
      'contact_id', NEW.contact_client_id,
      'from_stage_id', OLD.stage_id,
      'to_stage_id', NEW.stage_id,
      'rule', jsonb_build_object(
        'id', _rule.id,
        'compose_intent', _rule.compose_intent,
        'tone', _rule.tone,
        'template_hint', _rule.template_hint,
        'send_mode', _rule.send_mode
      )
    )::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'on_deal_stage_change failed: %', SQLERRM;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.on_deal_stage_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deals_stage_automation ON public.deals;
CREATE TRIGGER trg_deals_stage_automation
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.on_deal_stage_change();
